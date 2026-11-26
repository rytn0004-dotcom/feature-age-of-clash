import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { aggregateBattleStressSamples } from "./battle-stress-telemetry.mjs";

const host = "127.0.0.1";
const port = Number(process.env.BATTLE_STRESS_PORT || 3000);
const debugPort = Number(process.env.CHROME_DEBUG_PORT || 9222);
const baseUrl = "http://" + host + ":" + port;
const counts = (process.env.BATTLE_STRESS_SCENARIOS || "100,200,400").split(",").map(Number);
const seed = Number(process.env.BATTLE_STRESS_SEED || 20261122);
const map = process.env.BATTLE_STRESS_MAP || "highland_basin";
const reportPath = process.env.BATTLE_STRESS_REPORT || "artifacts/battle-stress-browser-report.json";
const minCaptureSamples = Number(process.env.BATTLE_STRESS_MIN_SAMPLES || 8);
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

      // Seed a bounded set of temporary buffs so the stress scenario exercises the
      // live buff-ring batch instead of passing with an empty (zero-instance) batch.
      const seededBuffUnits = await evaluate(`
        (() => {
          const e = window.__rtsEngine;
          if (!e || !Array.isArray(e.units)) return 0;
          const count = Math.min(12, e.units.length);
          for (const unit of e.units.slice(0, count)) {
            unit.buffSpeedUntil = e.simTime + 120;
          }
          return count;
        })()
      `);
      assert.ok(seededBuffUnits >= 8, "Could not seed enough temporary buff-ring instances.");

      // The HUD is now a lazy-loaded React chunk. Engine setup can finish before
      // React has mounted that chunk, so wait for the actual controls before
      // measuring responsive layout at any viewport width.
      const hudReady = await waitFor(
        async () => evaluate(`(() => {
          const bar = document.querySelector('[data-top-resource-bar="true"]');
          const header = bar?.closest('header');
          return Boolean(
            bar &&
            header?.querySelector('[data-top-status-bar="true"]') &&
            header?.querySelector('[data-top-utility-bar="true"]')
          );
        })()`),
        30000,
        count + "-unit lazy HUD mount",
      );
      assert.equal(hudReady, true, "Lazy HUD did not mount after engine setup.");

      const inspectResourceBar = async (width, height) => {
        await send("Emulation.setDeviceMetricsOverride", {
          width, height, deviceScaleFactor: 1, mobile: width < 768,
        }, sessionId);
        await sleep(100);
        const layout = await evaluate(`
          (() => {
            const bar = document.querySelector('[data-top-resource-bar="true"]');
            const header = bar?.closest('header');
            const status = header?.querySelector('[data-top-status-bar="true"]');
            const utility = header?.querySelector('[data-top-utility-bar="true"]');
            if (!bar || !header || !status || !utility) return null;
            const bounds = bar.getBoundingClientRect();
            const statusBounds = status.getBoundingClientRect();
            const utilityBounds = utility.getBoundingClientRect();
            const pills = [...bar.querySelectorAll('[data-resource-pill], [data-population-badge]')];
            const pillMetrics = pills.map((pill) => {
              const rect = pill.getBoundingClientRect();
              const amount = [...pill.querySelectorAll('[data-resource-value], [data-resource-compact-value], [data-population-value]')]
                .find((node) => node.getBoundingClientRect().width > 0);
              return {
                kind: pill.dataset.resourcePill || 'population',
                width: pill.clientWidth,
                scrollWidth: pill.scrollWidth,
                top: rect.top,
                amountVisible: !!amount,
                amountText: amount?.textContent?.trim() || '',
                amountInside: !amount || (() => {
                  const amountRect = amount.getBoundingClientRect();
                  return amountRect.left >= rect.left - 1 && amountRect.right <= rect.right + 1;
                })(),
              };
            });
            const pillTops = pillMetrics.map((pill) => pill.top);
            const singleRow = pillTops.length === 5 && Math.max(...pillTops) - Math.min(...pillTops) <= 2;
            const overlaps = statusBounds.left < utilityBounds.right &&
              statusBounds.right > utilityBounds.left &&
              statusBounds.top < utilityBounds.bottom &&
              statusBounds.bottom > utilityBounds.top;
            return {
              count: pills.length,
              singleRow,
              width: bar.clientWidth,
              scrollWidth: bar.scrollWidth,
              visibleCount: pills.filter((pill) => {
                const rect = pill.getBoundingClientRect();
                return rect.width > 0 && rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1;
              }).length,
              pillMetrics,
              headerWidth: header.clientWidth,
              headerScrollWidth: header.scrollWidth,
              utilityWidth: utility.clientWidth,
              utilityScrollWidth: utility.scrollWidth,
              utilityLeft: utilityBounds.left,
              utilityRight: utilityBounds.right,
              statusUtilityOverlap: overlaps,
              viewportWidth: window.innerWidth,
            };
          })()
        `);
        assert.ok(layout, "Resource/status/utility HUD is incomplete at " + width + "px.");
        assert.equal(layout.count, 5, "Expected four resources and population at " + width + "px.");
        assert.equal(layout.singleRow, true, "Four resources and population must stay on one row at " + width + "px.");
        assert.ok(layout.width > 0, "Resource bar has no width at " + width + "px.");
        assert.ok(layout.scrollWidth <= layout.width + 1, "Resource bar requires horizontal scrolling at " + width + "px.");
        assert.equal(layout.visibleCount, 5, "One or more resource badges are clipped at " + width + "px.");
        assert.ok(layout.pillMetrics.every((pill) => pill.width > 0 && pill.scrollWidth <= pill.width + 1), "A resource or population tile has clipped/overflowing content at " + width + "px.");
        assert.ok(layout.pillMetrics.every((pill) => pill.amountVisible && pill.amountInside), "A resource amount is missing or clipped at " + width + "px.");
        assert.ok(layout.headerScrollWidth <= layout.headerWidth + 1, "Top HUD header overflows at " + width + "px.");
        assert.ok(layout.utilityScrollWidth <= layout.utilityWidth + 1, "Top-right controls overflow at " + width + "px.");
        assert.ok(layout.utilityLeft >= -1 && layout.utilityRight <= width + 1, "Top-right controls are off-screen at " + width + "px.");
        assert.equal(layout.statusUtilityOverlap, false, "Status and utility controls overlap at " + width + "px.");
        return layout;
      };
      const resourceLayouts = {};
      for (const [label, width, height] of [
        ["small-phone", 320, 720],
        ["phone", 390, 844],
        ["small-tablet", 640, 900],
        ["tablet", 768, 1024],
        ["laptop", 1024, 768],
        ["desktop", 1280, 800],
      ]) {
        resourceLayouts[label] = await inspectResourceBar(width, height);
      }
      // The compact resource strip expands on hover; clicking pins it open.
      await send("Emulation.setDeviceMetricsOverride", { width: 320, height: 720, deviceScaleFactor: 1, mobile: true }, sessionId);
      const initiallyCollapsed = await evaluate(`!document.querySelector('[data-economy-panel="true"]')`);
      assert.equal(initiallyCollapsed, true, "Economy details should be collapsed before hovering.");
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 160, y: 24 }, sessionId);
      const economyToggle = await waitFor(
        async () => evaluate(`!!document.querySelector('[data-economy-toggle="true"]')`),
        5000,
        count + "-unit economy hover target",
      );
      assert.equal(economyToggle, true, "Economy overview toggle is missing.");
      const hoveredPanel = await waitFor(
        async () => evaluate(`!!document.querySelector('[data-economy-panel="true"]')`),
        5000,
        count + "-unit hover-expanded economy panel",
      );
      assert.equal(hoveredPanel, true, "Moving over the top HUD did not expand the economy panel.");

      await evaluate(`(() => document.querySelector('[data-economy-toggle="true"]')?.click())()`);
      const pinOn = await waitFor(
        async () => {
          const state = await evaluate(`document.querySelector('[data-economy-toggle="true"]')?.getAttribute('aria-pressed')`);
          return state === "true" ? { state } : null;
        },
        3000,
        "economy pin state commit",
      );
      assert.equal(pinOn.state, "true", "First click should pin the economy panel.");
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 319, y: 400 }, sessionId);
      await sleep(100);
      assert.equal(
        await evaluate(`!!document.querySelector('[data-economy-panel="true"]')`),
        true,
        "Pinned economy panel closed when the pointer left the HUD.",
      );

      await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 160, y: 24 }, sessionId);
      await evaluate(`(() => document.querySelector('[data-economy-toggle="true"]')?.click())()`);
      const pinOff = await waitFor(
        async () => {
          const state = await evaluate(`document.querySelector('[data-economy-toggle="true"]')?.getAttribute('aria-pressed')`);
          return state === "false" ? { state } : null;
        },
        3000,
        "economy unpin state commit",
      );
      assert.equal(pinOff.state, "false", "Second click should release the economy panel pin.");
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 319, y: 400 }, sessionId);
      await waitFor(
        async () => !(await evaluate(`!!document.querySelector('[data-economy-panel="true"]')`)),
        3000,
        "economy hover collapse after unpin",
      );

      // Re-open by hover and validate the panel geometry and all economy sections.
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 160, y: 24 }, sessionId);
      const economyPanel = await waitFor(
        async () => evaluate(`(() => {
          const panel = document.querySelector('[data-economy-panel="true"]');
          if (!panel) return null;
          const rect = panel.getBoundingClientRect();
          const resources = [...panel.querySelectorAll('[data-economy-resource]')];
          return {
            width: rect.width, right: rect.right, top: rect.top, bottom: rect.bottom,
            clientWidth: panel.clientWidth, scrollWidth: panel.scrollWidth,
            resourceCount: resources.length,
            visibleResources: resources.filter((node) => node.getBoundingClientRect().width > 0).length,
            hasWorkers: panel.textContent.includes('村民工作配置'),
            hasAgeReadiness: panel.textContent.includes('升時代準備度'),
            hasDeliveredRate: panel.textContent.includes('扣除往返運輸後估算入庫'),
            closeButton: !!panel.querySelector('[data-economy-close="true"]'),
          };
        })()`),
        5000,
        count + "-unit economy panel render",
      );
      assert.ok(economyPanel.width > 0 && economyPanel.right <= 321, "Economy panel exceeds the 320px viewport.");
      assert.ok(economyPanel.bottom <= 721 && economyPanel.top >= 0, "Economy panel is clipped vertically.");
      assert.ok(economyPanel.scrollWidth <= economyPanel.clientWidth + 1, "Economy panel requires horizontal scrolling.");
      assert.equal(economyPanel.resourceCount, 4, "Economy panel must include four resources.");
      assert.equal(economyPanel.visibleResources, 4, "An economy resource card is not visible.");
      assert.equal(economyPanel.hasWorkers, true, "Worker allocation section is missing.");
      assert.equal(economyPanel.hasAgeReadiness, true, "Age readiness section is missing.");
      assert.equal(economyPanel.hasDeliveredRate, true, "Travel-adjusted delivered rate is missing.");
      assert.equal(economyPanel.closeButton, true, "Economy close button is missing.");
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 319, y: 400 }, sessionId);
      await waitFor(
        async () => !(await evaluate(`!!document.querySelector('[data-economy-panel="true"]')`)),
        3000,
        "economy panel mouse-leave collapse",
      );
      await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false }, sessionId);

      const capture = await waitFor(
        async () => evaluate(`
          (() => {
            const e = window.__rtsEngine;
            const overlay = [...document.querySelectorAll('[role="status"]')].find(
              (node) => node.textContent?.includes('PERFORMANCE MONITOR'),
            );
            if (!e || !overlay || overlay.style.display === 'none') return null;
            const samples = Array.isArray(e.performanceSamples) ? e.performanceSamples : [];
            if (samples.length < ${minCaptureSamples}) return null;
            const units = Array.isArray(e.units) ? e.units : [];
            const unitMeshes = e.unitMeshes instanceof Map ? [...e.unitMeshes.values()] : [];
            const liveNonGarrisonedUnits = units.filter(
              (unit) => unit.hp > 0 && !unit.garrisonedInBuildingId,
            ).length;
            const visibleIndividualShadows = unitMeshes.filter(
              (mesh) => mesh.userData?.unitContactShadowMesh?.visible === true,
            ).length;
            const visibleIndividualFactionRings = unitMeshes.filter(
              (mesh) => mesh.userData?.unitFactionRingMesh?.visible === true,
            ).length;
            const dyingMeshes = (Array.isArray(e.dyingEffects) ? e.dyingEffects : [])
              .map((effect) => effect?.mesh)
              .filter(Boolean);
            const decorationMeshes = [...unitMeshes, ...dyingMeshes];
            const roleMarkerMeshes = decorationMeshes
              .map((mesh) => mesh.userData?.unitRoleMarkerMesh)
              .filter(Boolean);
            const expectedVisibleRoleMarkers = roleMarkerMeshes.filter(
              (marker) => marker.userData?.lodVisible !== false,
            ).length;
            const visibleIndividualRoleMarkers = roleMarkerMeshes.filter(
              (marker) => marker.visible === true,
            ).length;
            const buffRingMeshes = decorationMeshes
              .map((mesh) => mesh.userData?.unitBuffRingMesh)
              .filter(Boolean);
            const expectedBuffRings = buffRingMeshes.filter(
              (ring) => ring.userData?.batchVisible === true,
            ).length;
            const visibleIndividualBuffRings = buffRingMeshes.filter(
              (ring) => ring.visible === true,
            ).length;
            const staticMeshBatching = unitMeshes.reduce((total, mesh) => {
              const stats = mesh.userData?.staticMeshBatchStats;
              if (!stats) return total;
              total.unitsProcessed += 1;
              total.eligibleMeshes += stats.eligibleMeshes || 0;
              total.mergedSourceMeshes += stats.mergedSourceMeshes || 0;
              total.mergedBatches += stats.mergedBatches || 0;
              total.drawCallsSaved += stats.estimatedDrawCallsSaved || 0;
              return total;
            }, {
              unitsProcessed: 0,
              eligibleMeshes: 0,
              mergedSourceMeshes: 0,
              mergedBatches: 0,
              drawCallsSaved: 0,
            });
            return {
              state: e.gameState,
              simulatedSeconds: e.stats.gameDuration,
              unitDecorations: {
                liveNonGarrisonedUnits,
                unitMeshes: unitMeshes.length,
                shadowInstances: e.unitContactShadowBatch?.count ?? 0,
                factionRingInstances: e.unitFactionRingBatch?.count ?? 0,
                visibleIndividualShadows,
                visibleIndividualFactionRings,
                roleCrestInstances: e.unitRoleCrestBatch?.count ?? 0,
                roleSiegeInstances: e.unitRoleSiegeBatch?.count ?? 0,
                expectedVisibleRoleMarkers,
                visibleIndividualRoleMarkers,
                buffRingInstances: e.unitBuffRingBatch?.count ?? 0,
                expectedBuffRings,
                visibleIndividualBuffRings,
              },
              staticMeshBatching,
              samples,
            };
          })()
        `),
        30000,
        count + "-unit F3 telemetry",
      );
      // Aggregate the complete bounded F3 capture, not just the final 500 ms overlay window.
      const telemetry = aggregateBattleStressSamples(capture.samples);
      telemetry.state = capture.state;
      telemetry.simulatedSeconds = capture.simulatedSeconds;

      assert.equal(telemetry.state, "playing", "Simulation left the playing state.");
      assert.ok(telemetry.simulatedSeconds > 0, "Simulation clock did not advance.");
      const decorations = capture.unitDecorations;
      const staticMeshes = capture.staticMeshBatching;
      assert.ok(staticMeshes?.unitsProcessed === decorations.unitMeshes, "Static mesh batching diagnostics are missing from one or more unit models.");
      assert.ok(staticMeshes.mergedBatches > 0, "Static character mesh batching did not create any merged batches.");
      assert.ok(staticMeshes.drawCallsSaved > 0, "Static character mesh batching did not reduce any mesh draw batches.");
      assert.equal(
        staticMeshes.drawCallsSaved,
        staticMeshes.mergedSourceMeshes - staticMeshes.mergedBatches,
        "Static mesh batching savings must match removed source meshes minus resulting batches.",
      );
      assert.ok(decorations.shadowInstances > 0, "Unit contact-shadow batch did not receive instances.");
      assert.equal(decorations.shadowInstances, decorations.factionRingInstances, "Contact shadows and faction rings must share the same instance ordering.");
      assert.equal(
        decorations.roleCrestInstances + decorations.roleSiegeInstances,
        decorations.expectedVisibleRoleMarkers,
        "Role marker instance batches do not match visible per-unit LOD state.",
      );
      assert.equal(decorations.visibleIndividualRoleMarkers, 0, "A role marker is still rendered as an individual mesh.");
      assert.ok(decorations.expectedBuffRings >= Math.min(8, seededBuffUnits), "The scenario did not activate the seeded buff rings.");
      assert.equal(
        decorations.buffRingInstances,
        decorations.expectedBuffRings,
        "Buff-ring instance batch does not match active per-unit buffs.",
      );
      assert.ok(decorations.expectedVisibleRoleMarkers > 0, "The mixed army did not produce any battlefield role markers.");
      assert.equal(decorations.visibleIndividualBuffRings, 0, "A buff ring is still rendered as an individual mesh.");
      assert.equal(decorations.visibleIndividualShadows, 0, "A unit contact shadow is still rendered individually.");
      assert.equal(decorations.visibleIndividualFactionRings, 0, "A unit faction ring is still rendered individually.");
      assert.ok(
        decorations.shadowInstances >= decorations.liveNonGarrisonedUnits,
        "Instanced decorations are missing one or more visible live units.",
      );
      for (const key of ["fps", "frameAverageMs", "p95Ms", "hitchMs", "simulationAverageMs", "renderAverageMs", "drawCalls", "triangles", "aiDecisionAverageMs"]) {
        assert.ok(Number.isFinite(telemetry[key]) && telemetry[key] > 0, "Invalid F3 metric: " + key);
      }
      telemetry.drawCalls = Math.floor(telemetry.drawCalls);
      telemetry.triangles = Math.floor(telemetry.triangles);
      assert.ok(telemetry.aiHeartbeat > 0, "AI decision heartbeat did not advance during the browser battle.");
      assert.ok(telemetry.aStarSearches > 0, "No A* path searches were captured in the stress scenario.");
      assert.ok(telemetry.aStarAiSearches > 0, "No AI-owned A* path searches were captured in the stress scenario.");
      assert.equal(exceptions.length, 0, "Uncaught browser exceptions: " + exceptions.join("; "));

      const wallPlacement = await evaluate(`
        (() => {
          const e = window.__rtsEngine;
          if (!e || typeof e.validateWallPlacementSection !== "function") return null;
          const segmentCount = 120;
          const radius = 51.5;
          const placements = Array.from({ length: segmentCount }, (_, index) => {
            const angle = (index / segmentCount) * Math.PI * 2;
            return {
              x: Math.cos(angle) * radius,
              z: Math.sin(angle) * radius,
              rotationY: angle + Math.PI / 2,
            };
          });
          const points = placements.map(({ x, z }) => ({ x, z }));
          points.push({ x: points[0].x, z: points[0].z });
          const timings = [];
          let lastValid = false;
          for (let attempt = 0; attempt < 15; attempt++) {
            const started = performance.now();
            lastValid = e.validateWallPlacementSection(points, placements, []);
            const elapsed = performance.now() - started;
            if (attempt >= 3) timings.push(elapsed);
          }
          timings.sort((a, b) => a - b);
          const percentile = (ratio) => timings[Math.min(timings.length - 1, Math.ceil(timings.length * ratio) - 1)] ?? 0;
          return {
            segmentCount,
            measuredAttempts: timings.length,
            p50Ms: percentile(0.5),
            p95Ms: percentile(0.95),
            maxMs: timings[timings.length - 1] ?? 0,
            buildingCandidates: e.wallPlacementBuildingCandidates?.length ?? -1,
            resourceCandidates: e.wallPlacementResourceCandidates?.length ?? -1,
            totalBuildings: e.buildings?.length ?? 0,
            totalResources: e.resourceNodes?.length ?? 0,
            lastValidationValid: lastValid,
          };
        })()
      `);
      assert.ok(wallPlacement && wallPlacement.segmentCount === 120, "120-piece wall validation benchmark did not run.");
      assert.equal(wallPlacement.measuredAttempts, 12, "Wall validation benchmark sample count mismatch.");
      for (const key of ["p50Ms", "p95Ms", "maxMs"]) {
        assert.ok(Number.isFinite(wallPlacement[key]) && wallPlacement[key] >= 0, "Invalid wall validation timing: " + key);
      }
      assert.ok(
        wallPlacement.buildingCandidates >= 0 &&
        wallPlacement.buildingCandidates <= wallPlacement.totalBuildings,
        "Wall building broad-phase candidate count is invalid.",
      );
      assert.ok(
        wallPlacement.resourceCandidates >= 0 &&
        wallPlacement.resourceCandidates <= wallPlacement.totalResources,
        "Wall resource broad-phase candidate count is invalid.",
      );

      report.scenarios.push({ count, initial, seededBuffUnits, resourceLayouts, economyPanel, telemetry, wallPlacement, exceptionCount: exceptions.length });
      console.log("[browser-stress] " + count + " units: " +
        telemetry.fps.toFixed(1) + " FPS, avg " + telemetry.frameAverageMs.toFixed(2) + " ms, P95 " + telemetry.p95Ms.toFixed(2) +
        " ms, sim " + telemetry.simulationAverageMs.toFixed(2) + " ms (units " + telemetry.unitUpdateAverageMs.toFixed(2) +
        ", collisions U/B/R " + telemetry.unitCollisionAverageMs.toFixed(2) + "/" +
        telemetry.buildingCollisionAverageMs.toFixed(2) + "/" + telemetry.resourceCollisionAverageMs.toFixed(2) +
        ", visual " + telemetry.unitVisualSyncAverageMs.toFixed(2) + "), AI " + telemetry.aiDecisionAverageMs.toFixed(2) +
        " ms, render " + telemetry.renderAverageMs.toFixed(2) + " ms, hitch " + telemetry.hitchMs.toFixed(2) + " ms, " +
        telemetry.drawCalls + " draws, wall validation P95 " + wallPlacement.p95Ms.toFixed(3) +
        " ms (" + wallPlacement.buildingCandidates + "/" + wallPlacement.totalBuildings + " building candidates, " +
        wallPlacement.resourceCandidates + "/" + wallPlacement.totalResources + " resource candidates), " +
        decorations.shadowInstances + " shadow/ring instances, "
        staticMeshes.drawCallsSaved + " static mesh draws saved, " +
        (decorations.roleCrestInstances + decorations.roleSiegeInstances) + " role markers, " +
        decorations.buffRingInstances + " buff rings, " + telemetry.renderer);
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
