import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";

const host = "127.0.0.1";
const port = Number(process.env.BATTLE_STRESS_PORT || 3000);
const debugPort = Number(process.env.CHROME_DEBUG_PORT || 9222);
const baseUrl = "http://" + host + ":" + port;
const counts = (process.env.BATTLE_STRESS_SCENARIOS || "100,200,400").split(",").map(Number);
const seed = Number(process.env.BATTLE_STRESS_SEED || 20261122);
const map = process.env.BATTLE_STRESS_MAP || "highland_basin";
const reportPath = process.env.BATTLE_STRESS_REPORT || "artifacts/battle-stress-browser-report.json";
const minCaptureSamples = Number(process.env.BATTLE_STRESS_MIN_SAMPLES || 4);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const report = {
  startedAt: new Date().toISOString(),
  seed,
  map,
  note: "Headless Chromium measurements; no hardware-independent FPS threshold is applied.",
  scenarios: [],
};

async function waitFor(operation, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const result = await operation();
      if (result) return result;
    } catch {
      // Navigation and engine initialization can temporarily make the page unavailable.
    }
    await sleep(250);
  }
  throw new Error("Timed out waiting for " + label);
}

async function main() {
  assert.ok(counts.length > 0 && counts.every((count) => [100, 200, 400].includes(count)), "Use 100, 200, or 400 stress units.");
  assert.ok(Number.isSafeInteger(seed) && seed >= 0, "Stress seed must be a non-negative safe integer.");
  assert.ok(Number.isSafeInteger(minCaptureSamples) && minCaptureSamples > 0, "BATTLE_STRESS_MIN_SAMPLES must be a positive integer.");
  assert.ok(["highland_basin", "river_valley", "twin_lakes"].includes(map), "Unsupported stress map.");

  const chromePath = process.env.CHROME_BIN || ["google-chrome", "chrome", "chromium"].map((name) => {
    const found = spawnSync("which", [name], { encoding: "utf8" });
    return found.status === 0 ? found.stdout.trim() : "";
  }).find(Boolean);
  assert.ok(chromePath, "Chrome/Chromium not found; set CHROME_BIN.");

  const server = spawn(process.env.BUN_BIN || "bun", ["run", "dev", "--", "--strictPort"], { stdio: "ignore" });
  let browser;
  let socket;
  let sessionId;
  let nextId = 0;
  const pending = new Map();
  const exceptions = [];

  const cleanup = () => {
    try { socket?.close(); } catch {}
    try { browser?.kill("SIGTERM"); } catch {}
    try { server.kill("SIGTERM"); } catch {}
  };

  try {
    await waitFor(async () => (await fetch(baseUrl)).ok, 60000, "Vite dev server");
    browser = spawn(chromePath, [
      "--headless=new", "--no-sandbox", "--disable-dev-shm-usage",
      "--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding", "--remote-allow-origins=*",
      "--remote-debugging-port=" + debugPort, "--window-size=1280,800",
      "--enable-webgl", "--ignore-gpu-blocklist", "--use-gl=angle", "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader", "--user-data-dir=/tmp/age-of-clash-chrome-" + process.pid, "about:blank",
    ], { stdio: "ignore" });

    const version = await waitFor(async () => {
      const response = await fetch("http://" + host + ":" + debugPort + "/json/version");
      return response.ok ? response.json() : null;
    }, 30000, "Chrome DevTools endpoint");
    report.browser = version.Browser || "unknown";

    socket = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", () => reject(new Error("CDP WebSocket connection failed.")), { once: true });
    });

    socket.addEventListener("message", ({ data }) => {
      const message = JSON.parse(String(data));
      if (typeof message.id === "number") {
        const task = pending.get(message.id);
        if (!task) return;
        pending.delete(message.id);
        clearTimeout(task.timer);
        if (message.error) task.reject(new Error(message.error.message || "CDP command failed"));
        else task.resolve(message.result || {});
      } else if (message.sessionId === sessionId && message.method === "Runtime.exceptionThrown") {
        exceptions.push(message.params?.exceptionDetails?.exception?.description || "Uncaught browser exception");
      }
    });

    const send = (method, params = {}, sid) => new Promise((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(method + " timed out."));
      }, 30000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params, ...(sid ? { sessionId: sid } : {}) }));
    });

    const target = await send("Target.createTarget", { url: "about:blank" });
    sessionId = (await send("Target.attachToTarget", { targetId: target.targetId, flatten: true })).sessionId;
    await send("Page.enable", {}, sessionId);
    await send("Runtime.enable", {}, sessionId);
    await send("Emulation.setDeviceMetricsOverride", {
      width: 1280, height: 800, deviceScaleFactor: 1, mobile: false,
    }, sessionId);

    const evaluate = async (expression) => {
      const result = await send("Runtime.evaluate", {
        expression, returnByValue: true, awaitPromise: true,
      }, sessionId);
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Browser evaluation failed.");
      return result.result?.value;
    };

    for (const count of counts) {
      exceptions.length = 0;
      await send("Page.navigate", {
        url: baseUrl + "/?battleStress=" + count + "&seed=" + seed + "&map=" + map,
      }, sessionId);

      const initial = await waitFor(async () => {
        const value = await evaluate("(() => { const e = window.__rtsEngine; if (!e || !e.battleStressInfo || e.gameState !== 'playing') return null; return { state: document.body.dataset.state, units: e.units.length, stress: e.battleStressInfo.unitCount, ai: e.participants.filter(p => p.controller === 'ai').length, factions: e.participants.length, seed: e.battleStressInfo.seed, map: e.battleStressInfo.mapPreset }; })()");
        return value && value.stress === count ? value : null;
      }, 120000, count + "-unit deterministic setup");

      assert.equal(initial.state, "playing");
      assert.equal(initial.units, count, "Live engine unit count mismatch.");
      assert.equal(initial.ai, 4, "Expected four AI participants.");
      assert.equal(initial.factions, 4, "Expected four factions.");
      assert.equal(initial.seed, seed);
      assert.equal(initial.map, map);

      await sleep(1500);
      await evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F3', code: 'F3', bubbles: true, cancelable: true })); true");
      const telemetry = await waitFor(async () => evaluate("(() => { const e = window.__rtsEngine; const p = [...document.querySelectorAll('[role=\"status\"]')].find(n => n.textContent?.includes('PERFORMANCE MONITOR')); if (!e || !p || p.style.display === 'none') return null; const t = p.textContent || ''; const samples = Number(t.match(/Capture Samples\\s+(\\d+)/)?.[1] || 0); if (samples < " + minCaptureSamples + ") return null; const value = re => Number((t.match(re)?.[1] || '').replaceAll(',', '') || NaN); return { samples, state: e.gameState, simulatedSeconds: e.stats.gameDuration, fps: value(/Frame FPS\\s+([\\d.]+)/), p95Ms: value(/Frame ms p95\\s+([\\d.]+)/), hitchMs: value(/Max hitch ms\\s+([\\d.]+)/), drawCalls: value(/Draw Calls\\s+([\\d,]+)/), triangles: value(/Triangles\\s+([\\d,]+)/), renderer: t.match(/Renderer\\s+([^\\n]+)/)?.[1]?.trim() || 'unknown' }; })()"), 30000, count + "-unit F3 telemetry");

      assert.equal(telemetry.state, "playing", "Simulation left the playing state.");
      assert.ok(telemetry.simulatedSeconds > 0, "Simulation clock did not advance.");
      for (const key of ["fps", "p95Ms", "hitchMs", "drawCalls", "triangles"]) {
        assert.ok(Number.isFinite(telemetry[key]) && telemetry[key] > 0, "Invalid F3 metric: " + key);
      }
      telemetry.drawCalls = Math.floor(telemetry.drawCalls);
      telemetry.triangles = Math.floor(telemetry.triangles);
      assert.equal(exceptions.length, 0, "Uncaught browser exceptions: " + exceptions.join("; "));

      report.scenarios.push({ count, initial, telemetry, exceptionCount: exceptions.length });
      console.log("[browser-stress] " + count + " units: " +
        telemetry.fps.toFixed(1) + " FPS, P95 " + telemetry.p95Ms.toFixed(2) +
        " ms, hitch " + telemetry.hitchMs.toFixed(2) + " ms, " +
        telemetry.drawCalls + " draws, " + telemetry.renderer);
    }
    report.result = "passed";
  } catch (error) {
    report.result = "failed";
    report.error = String(error);
    throw error;
  } finally {
    report.completedAt = new Date().toISOString();
    await mkdir("artifacts", { recursive: true });
    await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
    cleanup();
  }
}

main().catch((error) => {
  console.error("[browser-stress] FAILED", error);
  process.exitCode = 1;
});
