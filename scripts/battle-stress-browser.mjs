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
  constructionStress: [],
  constructionStressNote: "Live RtsEngine construction runs in an isolated open corridor with resources/terrain disabled; pathfinding still uses the live navigation grid and wall/building collision data. Headless Chromium uses SwiftShader, not player GPU hardware.",
  wildlifeCarcassStress: [],
  wildlifeCarcassStressNote: "Live RtsEngine checks cover per-animal harvest caps, deterministic overflow queues, worker handoff, AI food-source fallback, and concurrent carcass rosters. Timings are headless Chromium measurements.",
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

      let wallInteraction = null;
      if (count === counts[0]) {
        const setup = await evaluate(`
          (() => {
            const e = window.__rtsEngine;
            const root = document.querySelector('[data-game-canvas-root="true"]');
            if (!e || !root || typeof e.startPlacement !== "function") return null;
            const rect = root.getBoundingClientRect();
            const factionId = e.humanPlayerId;
            const resources = e.playerResources;
            const saved = {
              age: e.ageByFaction?.[factionId],
              playerAge: e.playerAge,
              food: resources?.food,
              wood: resources?.wood,
              gold: resources?.gold,
              stone: resources?.stone,
            };
            if (e.ageByFaction) e.ageByFaction[factionId] = Math.max(4, saved.age || 1);
            e.playerAge = Math.max(4, e.playerAge || 1);
            if (resources) {
              resources.food = Math.max(5000, resources.food || 0);
              resources.wood = Math.max(5000, resources.wood || 0);
              resources.gold = Math.max(5000, resources.gold || 0);
              resources.stone = Math.max(5000, resources.stone || 0);
            }
            e.startPlacement('wall');
            return {
              started: e.placementBuildingType === 'wall',
              bounds: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
              saved,
              factionId,
            };
          })()
        `);
        assert.ok(setup && setup.started, "Could not enter wall placement for pointer interaction regression.");
        const candidatePoints = [
          [0.50, 0.58], [0.38, 0.52], [0.62, 0.52],
          [0.50, 0.72], [0.30, 0.68], [0.70, 0.68],
          [0.42, 0.38], [0.58, 0.38], [0.50, 0.48],
        ];
        let startPoint = null;
        for (const [fx, fy] of candidatePoints) {
          const x = Math.round(setup.bounds.left + setup.bounds.width * fx);
          const y = Math.round(setup.bounds.top + setup.bounds.height * fy);
          await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 }, sessionId);
          await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1 }, sessionId);
          const state = await evaluate(`(() => {
            const e = window.__rtsEngine;
            const info = e?.getWallPlacementPreviewInfo?.();
            return info ? { pointCount: info.pointCount, cursor: e.wallPlacementCursor } : null;
          })()`);
          if (state?.pointCount > 0) {
            startPoint = { x, y };
            break;
          }
        }
        assert.ok(startPoint, "No safe wall start point could be selected through pointer input.");

        const patched = await evaluate(`
          (() => {
            const e = window.__rtsEngine;
            e.__wallPreviewTestTimes = [];
            e.__wallPreviewValidationCount = 0;
            e.__wallPreviewOriginal = e.updateWallPlacementPreview.bind(e);
            e.__wallValidationOriginal = e.validateWallPlacementSection.bind(e);
            e.updateWallPlacementPreview = function(x, z) {
              this.__wallPreviewTestTimes.push({ time: performance.now(), x, z });
              return this.__wallPreviewOriginal(x, z);
            };
            e.validateWallPlacementSection = function(...args) {
              this.__wallPreviewValidationCount += 1;
              return this.__wallValidationOriginal(...args);
            };
            return true;
          })()
        `);
        assert.equal(patched, true);

        const moveCount = 36;
        const moveStart = Date.now();
        let lastX = startPoint.x;
        let lastY = startPoint.y;
        for (let index = 0; index < moveCount; index++) {
          lastX = Math.round(setup.bounds.left + Math.min(setup.bounds.width - 40, (startPoint.x - setup.bounds.left) + 35 + index * 3));
          lastY = Math.round(setup.bounds.top + Math.min(setup.bounds.height - 80, (startPoint.y - setup.bounds.top) + Math.sin(index / 5) * 26));
          await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: lastX, y: lastY }, sessionId);
        }
        const dispatchMs = Date.now() - moveStart;
        await sleep(160);
        const burst = await evaluate(`(() => {
          const e = window.__rtsEngine;
          const calls = e?.__wallPreviewTestTimes || [];
          const expected = e?.screenToWorld(${lastX}, ${lastY});
          const last = calls[calls.length - 1];
          const minimumIntervalMs = calls.length > 1
            ? Math.min(...calls.slice(1).map((call, index) => call.time - calls[index].time))
            : null;
          return {
            calls: calls.length,
            minimumIntervalMs,
            validationCalls: e?.__wallPreviewValidationCount ?? -1,
            latestPointerMatched: !!last && !!expected && Math.hypot(last.x - expected.x, last.z - expected.z) < 0.03,
            pointerMoves: ${moveCount},
          };
        })()`);
        assert.ok(burst.calls > 0, "Real pointer movement did not update the wall preview.");
        assert.ok(burst.calls < moveCount, "Wall preview did not coalesce the pointer-move burst.");
        assert.equal(burst.validationCalls, 0, "Pointer movement must not run full wall collision validation.");
        if (burst.minimumIntervalMs !== null) {
          assert.ok(burst.minimumIntervalMs >= 75, "Wall preview exceeded its 10 Hz cadence guard.");
        }
        assert.equal(burst.latestPointerMatched, true, "Wall preview did not consume the latest pointer position.");

        // Dispatch a pointermove and cancel/restart in the same browser task.
        // The zero-delay timer cannot run until this task yields, so this proves
        // the cancellation guard against a callback that is definitely pending.
        const race = await evaluate(`
          (() => {
            const e = window.__rtsEngine;
            const root = document.querySelector('[data-game-canvas-root="true"]');
            if (!e || !root) return null;
            const originalSetTimeout = window.setTimeout;
            let scheduledDelay = null;
            window.setTimeout = function(callback, delay, ...args) {
              if (scheduledDelay === null && Number.isFinite(delay) && delay >= 0 && delay <= 100) {
                scheduledDelay = delay;
              }
              return originalSetTimeout.call(window, callback, delay, ...args);
            };
            root.dispatchEvent(new PointerEvent('pointermove', {
              bubbles: true,
              pointerId: 1,
              pointerType: 'mouse',
              isPrimary: true,
              clientX: ${Math.min(setup.bounds.left + setup.bounds.width - 40, lastX + 11)},
              clientY: ${lastY + 7},
              buttons: 0,
            }));
            window.setTimeout = originalSetTimeout;
            const callsBeforeRestart = e.__wallPreviewTestTimes?.length ?? -1;
            e.cancelPlacement();
            e.startPlacement('wall');
            return {
              scheduledDelay,
              callsBeforeRestart,
              cursorIsEmpty: e.wallPlacementCursor === null,
            };
          })()
        `);
        assert.ok(race && race.scheduledDelay !== null, "Pointermove did not schedule the delayed wall preview.");
        assert.equal(race.cursorIsEmpty, true, "Restarted wall session should begin without a cursor.");
        await sleep(150);
        const afterRestart = await evaluate(`
          (() => {
            const e = window.__rtsEngine;
            return {
              calls: e.__wallPreviewTestTimes?.length ?? -1,
              validationCalls: e.__wallPreviewValidationCount ?? -1,
              cursorIsEmpty: e.wallPlacementCursor === null,
            };
          })()
        `);
        assert.equal(afterRestart.calls, race.callsBeforeRestart, "A delayed preview from the old wall session leaked into the new session.");
        assert.equal(afterRestart.validationCalls, 0, "A stale hover callback must not run collision validation.");
        assert.equal(afterRestart.cursorIsEmpty, true, "The new wall session inherited an old cursor.");

        // Start again and complete a real click-driven segment. Hover remains
        // validation-free; one explicit confirmation invokes the exact checker once.
        await send("Input.dispatchMouseEvent", { type: "mousePressed", x: startPoint.x, y: startPoint.y, button: "left", buttons: 1, clickCount: 1 }, sessionId);
        await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: startPoint.x, y: startPoint.y, button: "left", buttons: 0, clickCount: 1 }, sessionId);
        await send("Input.dispatchMouseEvent", { type: "mousePressed", x: lastX, y: lastY, button: "left", buttons: 1, clickCount: 1 }, sessionId);
        await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: lastX, y: lastY, button: "left", buttons: 0, clickCount: 1 }, sessionId);
        const confirmation = await evaluate(`(() => {
          const e = window.__rtsEngine;
          return {
            validationCalls: e.__wallPreviewValidationCount ?? -1,
            placementStillActive: e.placementBuildingType === 'wall',
          };
        })()`);
        assert.equal(confirmation.validationCalls, 1, "One final left-click must run the full wall collision validator exactly once.");
        wallInteraction = {
          pointerMoves: moveCount,
          dispatchMs,
          coalescedPreviewCalls: burst.calls,
          minimumPreviewIntervalMs: burst.minimumIntervalMs,
          hoverValidationCalls: burst.validationCalls,
          confirmValidationCalls: confirmation.validationCalls,
          latestPointerMatched: burst.latestPointerMatched,
          staleSessionIgnored: true,
        };

        await evaluate(`
          (() => {
            const e = window.__rtsEngine;
            const saved = ${JSON.stringify(setup.saved)};
            const factionId = ${JSON.stringify(setup.factionId)};
            e.cancelPlacement();
            if (e.ageByFaction) {
              if (saved.age === undefined) delete e.ageByFaction[factionId];
              else e.ageByFaction[factionId] = saved.age;
            }
            e.playerAge = saved.playerAge;
            if (e.playerResources) {
              e.playerResources.food = saved.food;
              e.playerResources.wood = saved.wood;
              e.playerResources.gold = saved.gold;
              e.playerResources.stone = saved.stone;
            }
            if (e.__wallPreviewOriginal) e.updateWallPlacementPreview = e.__wallPreviewOriginal;
            if (e.__wallValidationOriginal) e.validateWallPlacementSection = e.__wallValidationOriginal;
            delete e.__wallPreviewOriginal;
            delete e.__wallValidationOriginal;
            delete e.__wallPreviewValidationCount;
            delete e.__wallPreviewTestTimes;
            return true;
          })()
        `);
      }


      if (count === counts[counts.length - 1]) {
        const constructionSetup = await evaluate([
          "(() => {",
          "  const e = window.__rtsEngine;",
          "  const factionId = 'stress_medieval';",
          "  const participant = e?.participants?.find((entry) => entry.id === factionId);",
          "  const workerDef = e?.findUnitDef?.('villager', factionId);",
          "  if (!e || !participant || !workerDef || workerDef.category !== 'worker') return { error: 'Missing medieval villager definition or stress faction.' };",
          "  const centerCandidates = [0, 22, -22, 44, -44, 66, -66];",
          "  const centerZ = centerCandidates.find((z) => !e.buildings.some((building) => building.hp > 0 && Math.abs(building.x) < 46 && building.z >= z - 24 && building.z <= z + 24)) ?? 0;",
          "  for (const entry of e.participants) entry.controller = 'human';",
          "  e.humanPlayerId = factionId;",
          "  e.humanTeam = participant.team;",
          "  e.observedFactionId = factionId;",
          "  const keepAliveByFaction = new Map();",
          "  for (const entry of e.participants) {",
          "    const unit = e.units.find((candidate) => candidate.faction === entry.id && candidate.hp > 0);",
          "    if (unit) keepAliveByFaction.set(entry.id, unit);",
          "  }",
          "  for (const unit of e.units) {",
          "    const keep = keepAliveByFaction.get(unit.faction);",
          "    if (keep === unit) {",
          "      unit.hp = Math.max(1, unit.maxHp || 1);",
          "      unit.unitDef = { ...unit.unitDef, category: 'worker', isNaval: false };",
          "      unit.state = 'idle';",
          "      unit.targetBuildingId = undefined;",
          "      unit.targetResourceNodeId = undefined;",
          "      unit.targetEntityId = undefined;",
          "      unit.targetGarrisonBuildingId = undefined;",
          "      unit.attackMoveGoal = null;",
          "      unit.commandQueue = undefined;",
          "      const mesh = e.unitMeshes.get(unit.id);",
          "      if (mesh) mesh.visible = true;",
          "    } else {",
          "      unit.hp = 0;",
          "      unit.state = 'idle';",
          "      const mesh = e.unitMeshes.get(unit.id);",
          "      if (mesh) mesh.visible = false;",
          "    }",
          "  }",
          "  e.getTerrainNavObstacles = () => ({ rects: [], discs: [], bridges: [] });",
          "  for (const node of e.resourceNodes) node.amount = 0;",
          "  const wallCount = 32;",
          "  const spacing = 2.7;",
          "  const startX = -((wallCount - 1) * spacing) / 2;",
          "  const chainId = 'construction-stress-long-wall';",
          "  const wallIds = [];",
          "  for (let index = 0; index < wallCount; index++) {",
          "    const wall = e.addBuilding('wall', factionId, startX + index * spacing, centerZ, false, 0, false);",
          "    wall.wallChainId = chainId;",
          "    wall.wallChainIndex = index;",
          "    wall.wallChainSize = wallCount;",
          "    wallIds.push(wall.id);",
          "  }",
          "  const workerIds = [];",
          "  for (let index = 0; index < 200; index++) {",
          "    const column = index % wallCount;",
          "    const row = Math.floor(index / wallCount);",
          "    const worker = e.addUnit(workerDef, factionId, 240 + index * 2, 240, 'construction-stress-worker-' + index);",
          "    worker.hp = 1;",
          "    const mesh = e.unitMeshes.get(worker.id);",
          "    if (mesh) mesh.visible = false;",
          "    workerIds.push(worker.id);",
          "  }",
          "  const metrics = { indexRebuilds: 0, indexQueries: 0, reservationCandidateTotal: 0, maxCandidatesPerQuery: 0, retrySchedules: 0, approachIndexChanges: 0, pathRecoveryEvents: 0 };",
          "  e.__constructionStressMetrics = metrics;",
          "  const originalOccupiedQuery = e.getOccupiedConstructionApproachPoints.bind(e);",
          "  e.getOccupiedConstructionApproachPoints = function(...args) {",
          "    const points = originalOccupiedQuery(...args);",
          "    const current = this.__constructionStressMetrics;",
          "    if (current) {",
          "      current.indexQueries += 1;",
          "      current.reservationCandidateTotal += points.length;",
          "      current.maxCandidatesPerQuery = Math.max(current.maxCandidatesPerQuery, points.length);",
          "    }",
          "    return points;",
          "  };",
          "  const originalIndexRebuild = e.rebuildActiveConstructionWorkerCounts.bind(e);",
          "  e.rebuildActiveConstructionWorkerCounts = function(...args) {",
          "    if (this.__constructionStressMetrics) this.__constructionStressMetrics.indexRebuilds += 1;",
          "    return originalIndexRebuild(...args);",
          "  };",
          "  const originalStepBuilding = e.stepUnitBuilding.bind(e);",
          "  e.stepUnitBuilding = function(unit, dt) {",
          "    const previousIndex = unit.buildApproachIndex;",
          "    const previousRetryAt = unit.buildApproachRetryAt;",
          "    const previousRecoveryCount = unit.pathRecoveryCount || 0;",
          "    const result = originalStepBuilding(unit, dt);",
          "    const current = this.__constructionStressMetrics;",
          "    if (current) {",
          "      if (previousIndex !== undefined && unit.buildApproachIndex !== undefined && previousIndex !== unit.buildApproachIndex) current.approachIndexChanges += 1;",
          "      if (Number.isFinite(unit.buildApproachRetryAt) && unit.buildApproachRetryAt !== previousRetryAt) current.retrySchedules += 1;",
          "      current.pathRecoveryEvents += Math.max(0, (unit.pathRecoveryCount || 0) - previousRecoveryCount);",
          "    }",
          "    return result;",
          "  };",
          "  e.gameSpeed = 2;",
          "  e.performanceOverlayVisible = true;",
          "  e.navGridDirty = true;",
          "  e.waterNavGridDirty = true;",
          "  e.rebuildCombatEntityLookups?.();",
          "  e.rebuildCombatSpatialIndex?.();",
          "  return { factionId, centerZ, wallCount, wallIds, workerIds, gameSpeed: e.gameSpeed, terrainObstaclesDisabled: true };",
          "})()",
        ].join("\n"));
        assert.ok(constructionSetup && !constructionSetup.error, constructionSetup?.error || "Construction stress scenario setup failed.");
        assert.equal(constructionSetup.wallIds.length, 32, "Expected a 32-segment construction chain.");
        assert.equal(constructionSetup.workerIds.length, 200, "Expected 200 reusable stress workers.");

        for (const workerCount of [50, 100, 200]) {
          const prepared = await evaluate([
            "(() => {",
            "  const e = window.__rtsEngine;",
            "  const factionId = " + JSON.stringify(constructionSetup.factionId) + ";",
            "  const workerIds = " + JSON.stringify(constructionSetup.workerIds) + ";",
            "  const wallIds = " + JSON.stringify(constructionSetup.wallIds) + ";",
            "  const workerCount = " + workerCount + ";",
            "  const wallCount = wallIds.length;",
            "  const startX = -((wallCount - 1) * 2.7) / 2;",
            "  const centerZ = " + constructionSetup.centerZ + ";",
            "  const spacing = 2.7;",
            "  const walls = wallIds.map((id) => e.buildings.find((building) => building.id === id));",
            "  for (const wall of walls) {",
            "    wall.isConstructed = false;",
            "    wall.buildProgress = 0.1;",
            "    wall.hp = Math.max(1, Math.round(wall.maxHp * 0.1));",
            "    wall.wallBreached = false;",
            "  }",
            "  const workers = workerIds.map((id) => e.units.find((unit) => unit.id === id));",
            "  for (let index = 0; index < workers.length; index++) {",
            "    const unit = workers[index];",
            "    const column = index % wallCount;",
            "    const row = Math.floor(index / wallCount);",
            "    const active = index < workerCount;",
            "    unit.x = active ? startX + column * spacing : 240 + index * 2;",
            "    unit.z = active ? centerZ + (row % 2 === 0 ? 1 : -1) * (14 + Math.floor(row / 2) * 2.2) : 240;",
            "    unit.hp = active ? unit.maxHp : 1;",
            "    unit.faction = factionId;",
            "    unit.state = active ? 'building' : 'idle';",
            "    unit.targetBuildingId = active ? wallIds[column] : undefined;",
            "    unit.targetResourceNodeId = undefined;",
            "    unit.targetEntityId = undefined;",
            "    unit.targetGarrisonBuildingId = undefined;",
            "    unit.targetX = undefined;",
            "    unit.targetZ = undefined;",
            "    unit.attackMoveGoal = null;",
            "    unit.commandQueue = undefined;",
            "    unit.buildApproachBuildingId = undefined;",
            "    unit.buildApproachIndex = undefined;",
            "    unit.buildApproachAngle = undefined;",
            "    unit.buildApproachRetryAt = undefined;",
            "    unit.buildApproachRecoveryCount = undefined;",
            "    unit.waypoints = undefined;",
            "    unit.pathGoal = undefined;",
            "    unit.pathCooldown = 0;",
            "    unit.pathRecoveryCount = 0;",
            "    unit.pathRecoveryCooldown = 0;",
            "    unit.stuckDuration = 0;",
            "    unit.stuckAccumulator = 0;",
            "    unit.velocity = { x: 0, z: 0 };",
            "    unit.currentActionText = active ? '🔨 準備前往城牆施工' : '壓測待命';",
            "    const mesh = e.unitMeshes.get(unit.id);",
            "    if (mesh) { mesh.visible = active; mesh.position.set(unit.x, 0, unit.z); }",
            "  }",
            "  e.__constructionStressMetrics = { indexRebuilds: 0, indexQueries: 0, reservationCandidateTotal: 0, maxCandidatesPerQuery: 0, retrySchedules: 0, approachIndexChanges: 0, pathRecoveryEvents: 0 };",
            "  e.pathSearchTiming = { sampleCount: 0, aiSampleCount: 0, emptyPathCount: 0, aiEmptyPathCount: 0, totalMs: 0, maxMs: 0 };",
            "  e.navGridDirty = true;",
            "  e.rebuildCombatEntityLookups?.();",
            "  e.rebuildCombatSpatialIndex?.();",
            "  e.rebuildActiveConstructionWorkerCounts?.();",
            "  return { workerCount, startSimTime: e.simTime, wallCount: walls.length, activeWorkers: workers.filter((unit) => unit.hp > 0 && unit.state === 'building' && !!unit.targetBuildingId).length };",
            "})()",
          ].join("\n"));
          assert.equal(prepared.activeWorkers, workerCount, "Construction worker roster setup mismatch.");

          const snapshotExpression = [
            "(() => {",
            "  const e = window.__rtsEngine;",
            "  const workerIds = " + JSON.stringify(constructionSetup.workerIds.slice(0, workerCount)) + ";",
            "  const wallIds = " + JSON.stringify(constructionSetup.wallIds) + ";",
            "  const workers = workerIds.map((id) => e.units.find((unit) => unit.id === id)).filter(Boolean);",
            "  const walls = wallIds.map((id) => e.buildings.find((building) => building.id === id)).filter(Boolean);",
            "  const metrics = e.__constructionStressMetrics || {};",
            "  const worksiteWorkers = workers.filter((unit) => unit.state === 'building' && /建造.*\\(\\d+%\\)/.test(unit.currentActionText || '')).length;",
            "  const retryingWorkers = workers.filter((unit) => Number.isFinite(unit.buildApproachRetryAt) && unit.buildApproachRetryAt > e.simTime).length;",
            "  return {",
            "    simTime: e.simTime,",
            "    gameState: e.gameState,",
            "    completedWalls: walls.filter((wall) => wall.isConstructed || wall.buildProgress >= 0.999999).length,",
            "    wallCount: walls.length,",
            "    idleWorkers: workers.filter((unit) => unit.state === 'idle').length,",
            "    worksiteWorkers,",
            "    retryingWorkers,",
            "    pathSearches: e.pathSearchTiming?.sampleCount || 0,",
            "    failedPathSearches: e.pathSearchTiming?.emptyPathCount || 0,",
            "    pathSearchTotalMs: e.pathSearchTiming?.totalMs || 0,",
            "    indexRebuilds: metrics.indexRebuilds || 0,",
            "    indexQueries: metrics.indexQueries || 0,",
            "    reservationCandidateTotal: metrics.reservationCandidateTotal || 0,",
            "    averageCandidatesPerQuery: (metrics.reservationCandidateTotal || 0) / Math.max(1, metrics.indexQueries || 0),",
            "    maxCandidatesPerQuery: metrics.maxCandidatesPerQuery || 0,",
            "    retrySchedules: metrics.retrySchedules || 0,",
            "    approachIndexChanges: metrics.approachIndexChanges || 0,",
            "    pathRecoveryEvents: metrics.pathRecoveryEvents || 0",
            "  };",
            "})()",
          ].join("\n");
          let current = await evaluate(snapshotExpression);
          let previous = current;
          let idleWorkerSeconds = 0;
          let nonWorksiteWorkerSeconds = 0;
          let retryWorkerSeconds = 0;
          const startedAt = Date.now();
          const timeoutMs = 60000;
          while (
            current.completedWalls < current.wallCount &&
            current.gameState === "playing" &&
            Date.now() - startedAt < timeoutMs
          ) {
            await sleep(250);
            current = await evaluate(snapshotExpression);
            const deltaSimSeconds = Math.max(0, current.simTime - previous.simTime);
            idleWorkerSeconds += deltaSimSeconds * current.idleWorkers;
            nonWorksiteWorkerSeconds += deltaSimSeconds * Math.max(0, workerCount - current.worksiteWorkers);
            retryWorkerSeconds += deltaSimSeconds * current.retryingWorkers;
            previous = current;
          }

          const elapsedWallMs = Date.now() - startedAt;
          const elapsedGameSeconds = Math.max(0, current.simTime - prepared.startSimTime);
          const stage = {
            workerCount,
            wallSegments: current.wallCount,
            completedWallSegments: current.completedWalls,
            completed: current.completedWalls === current.wallCount,
            elapsedGameSeconds,
            elapsedWallMs,
            pathSearchCalls: current.pathSearches,
            pathSearchAverageMs: current.pathSearches > 0 ? current.pathSearchTotalMs / current.pathSearches : 0,
            failedPathSearches: current.failedPathSearches,
            constructionIndexRebuilds: current.indexRebuilds,
            reservationIndexQueries: current.indexQueries,
            reservationCandidates: current.reservationCandidateTotal,
            averageReservationCandidatesPerQuery: current.averageCandidatesPerQuery,
            maxReservationCandidatesPerQuery: current.maxCandidatesPerQuery,
            retrySchedules: current.retrySchedules,
            approachIndexChanges: current.approachIndexChanges,
            pathRecoveryEvents: current.pathRecoveryEvents,
            idleWorkerSeconds,
            idleWorkerPercent: elapsedGameSeconds > 0 ? idleWorkerSeconds / (elapsedGameSeconds * workerCount) : 0,
            nonWorksiteWorkerSeconds,
            retryWorkerSeconds,
            finalIdleWorkers: current.idleWorkers,
            finalRetryingWorkers: current.retryingWorkers,
            renderer: "headless Chromium / SwiftShader",
          };
          report.constructionStress.push(stage);
          assert.equal(stage.completed, true, workerCount + " villagers did not complete the full 32-segment wall within " + timeoutMs + "ms.");
          assert.ok(stage.pathSearchCalls > 0, "Construction scenario recorded no live A* path searches.");
          assert.ok(stage.reservationIndexQueries > 0, "Construction scenario recorded no planned-slot index queries.");
          assert.ok(stage.constructionIndexRebuilds > 0, "Construction scenario did not rebuild the construction reservation index.");
          assert.ok(Number.isFinite(stage.idleWorkerPercent) && stage.idleWorkerPercent >= 0 && stage.idleWorkerPercent <= 1, "Invalid worker idle-time ratio.");
          assert.ok(Number.isFinite(stage.elapsedGameSeconds) && stage.elapsedGameSeconds > 0, "Invalid wall completion game time.");
          console.log("[construction-stress] " + workerCount + " villagers: " +
            stage.elapsedGameSeconds.toFixed(2) + " game seconds, " +
            stage.pathSearchCalls + " A* searches (" + stage.failedPathSearches + " empty), " +
            stage.reservationIndexQueries + " reservation queries, avg " +
            stage.averageReservationCandidatesPerQuery.toFixed(2) + " candidates, " +
            stage.retrySchedules + " retry schedules, " +
            stage.idleWorkerPercent.toFixed(1) + "% idle worker time.");
        }

        // Exercise wildlife carcass allocation in the live engine, not only in
        // isolated helper tests. The synthetic resource nodes are real ResourceNode
        // records consumed by RtsEngine's own lookup and gathering methods.
        const wildlifeNodeIds = {
          hunt: "browser-stress-wildlife-hunt",
          boar: "browser-stress-wildlife-boar",
          aurochs: "browser-stress-wildlife-aurochs",
        };
        const wildlifeNodes = await evaluate([
          "(() => {",
          "  const e = window.__rtsEngine;",
          "  const centerX = 84;",
          "  const centerZ = " + (constructionSetup.centerZ + 72) + ";",
          "  const rows = [",
          "    { id: " + JSON.stringify(wildlifeNodeIds.hunt) + ", subtype: 'hunt', x: centerX, z: centerZ, maxHp: 32 },",
          "    { id: " + JSON.stringify(wildlifeNodeIds.boar) + ", subtype: 'boar', x: centerX + 34, z: centerZ, maxHp: 200 },",
          "    { id: " + JSON.stringify(wildlifeNodeIds.aurochs) + ", subtype: 'aurochs', x: centerX + 68, z: centerZ, maxHp: 360 },",
          "  ];",
          "  for (const row of rows) {",
          "    const existing = e.resourceNodes.find((node) => node.id === row.id);",
          "    if (existing) Object.assign(existing, { resourceType: 'food', subtype: row.subtype, x: row.x, z: row.z, amount: 1200, maxAmount: 1200, animalAlive: false, animalHp: 0, animalMaxHp: row.maxHp });",
          "    else e.resourceNodes.push({ id: row.id, resourceType: 'food', subtype: row.subtype, x: row.x, z: row.z, amount: 1200, maxAmount: 1200, animalAlive: false, animalHp: 0, animalMaxHp: row.maxHp });",
          "  }",
          "  e.rebuildResourceNodeLookup();",
          "  return { nodes: rows.map((row) => row.id), realEngine: typeof e.rebuildWildlifeCarcassHarvestAssignments === 'function' && typeof e.stepUnitGathering === 'function' };",
          "})()",
        ].join("\n"));
        assert.ok(wildlifeNodes.realEngine, "Live wildlife carcass engine methods are unavailable.");

        const wildlifeLifeStage = await evaluate([
          "(() => {",
          "  const e = window.__rtsEngine;",
          "  const nodeId = " + JSON.stringify(wildlifeNodeIds.hunt) + ";",
          "  const node = e.resourceNodes.find((entry) => entry.id === nodeId);",
          "  const workers = " + JSON.stringify(constructionSetup.workerIds.slice(0, 12)) + ".map((id) => e.units.find((unit) => unit.id === id)).filter(Boolean);",
          "  node.subtype = 'hunt'; node.amount = 1200; node.maxAmount = 1200; node.animalAlive = true; node.animalHp = 32;",
          "  for (const unit of workers) { unit.hp = Math.max(1, unit.maxHp || 100); unit.state = 'gathering'; unit.targetResourceNodeId = nodeId; unit.unitDef = { ...unit.unitDef, category: 'worker', isNaval: false }; unit.carryingResource = undefined; unit.wildlifeCarcassHarvestNodeId = nodeId; unit.wildlifeCarcassHarvestActive = true; unit.wildlifeCarcassHarvestSlotIndex = 1; }",
          "  e.rebuildResourceNodeLookup(); e.rebuildWildlifeCarcassHarvestAssignments();",
          "  const liveAssigned = workers.filter((unit) => unit.wildlifeCarcassHarvestActive === true || unit.wildlifeCarcassHarvestSlotIndex !== undefined).length;",
          "  node.animalAlive = false; node.animalHp = 0;",
          "  e.rebuildWildlifeCarcassHarvestAssignments();",
          "  const corpseAssigned = workers.filter((unit) => unit.wildlifeCarcassHarvestActive === true).length;",
          "  return { liveAssigned, corpseAssigned };",
          "})()",
        ].join("\n"));
        assert.equal(wildlifeLifeStage.liveAssigned, 0, "Living animals must not consume carcass harvesting slots.");
        assert.equal(wildlifeLifeStage.corpseAssigned, 3, "Workers were not assigned when the animal transitioned into a carcass.");
        report.wildlifeCarcassStress.push({ kind: "live-to-carcass-transition", ...wildlifeLifeStage });

        const wildlifeAiSelection = await evaluate([
          "(() => {",
          "  const e = window.__rtsEngine;",
          "  const nodeId = " + JSON.stringify(wildlifeNodeIds.hunt) + ";",
          "  const node = e.resourceNodes.find((entry) => entry.id === nodeId);",
          "  const worker = e.units.find((unit) => unit.id === " + JSON.stringify(constructionSetup.workerIds[0]) + ");",
          "  const originalNodes = e.resourceNodes;",
          "  try {",
          "    e.resourceNodes = [node];",
          "    node.amount = 1200; node.animalAlive = false; node.animalHp = 0;",
          "    const fullCarcass = e.findBestDeliveredResourceNode(worker, 'food', Infinity, { assignedCounts: new Map([[nodeId, 3]]) });",
          "    const openCarcass = e.findBestDeliveredResourceNode(worker, 'food', Infinity, { assignedCounts: new Map([[nodeId, 2]]) });",
          "    node.animalAlive = true; node.animalHp = 32;",
          "    const liveHunt = e.findBestDeliveredResourceNode(worker, 'food', Infinity, { assignedCounts: new Map([[nodeId, 3]]) });",
          "    return { fullCarcassId: fullCarcass?.id ?? null, openCarcassId: openCarcass?.id ?? null, liveHuntId: liveHunt?.id ?? null };",
          "  } finally { e.resourceNodes = originalNodes; node.animalAlive = false; node.animalHp = 0; }",
          "})()",
        ].join("\n"));
        assert.equal(wildlifeAiSelection.fullCarcassId, null, "AI selection assigned another worker to a full carcass.");
        assert.equal(wildlifeAiSelection.openCarcassId, wildlifeNodeIds.hunt, "AI selection ignored an available carcass slot.");
        assert.equal(wildlifeAiSelection.liveHuntId, wildlifeNodeIds.hunt, "Carcass capacity incorrectly blocked live hunting.");
        report.wildlifeCarcassStress.push({ kind: "capacity-aware-ai-resource-selection", ...wildlifeAiSelection });

        const wildlifeAiFoodFallback = await evaluate([
          "(() => {",
          "  const e = window.__rtsEngine;",
          "  const source = e.resourceNodes.find((entry) => entry.id === " + JSON.stringify(wildlifeNodeIds.hunt) + ");",
          "  const workers = " + JSON.stringify(constructionSetup.workerIds.slice(0, 18)) + ".map((id) => e.units.find((unit) => unit.id === id)).filter(Boolean);",
          "  const originalNodes = e.resourceNodes;",
          "  const corpse = { ...source, id: 'stress-ai-full-carcass', subtype: 'hunt', x: workers[0].x + 4, z: workers[0].z + 2, amount: 1200, maxAmount: 1200, animalAlive: false, animalHp: 0 };",
          "  const berry = { ...source, id: 'stress-ai-berry', subtype: 'berry', x: workers[0].x + 7, z: workers[0].z + 4, amount: 1200, maxAmount: 1200, animalAlive: undefined, animalHp: undefined };",
          "  const farm = { ...source, id: 'stress-ai-farm', subtype: 'farm', x: workers[0].x + 9, z: workers[0].z + 6, amount: 1200, maxAmount: 1200, animalAlive: undefined, animalHp: undefined };",
          "  try {",
          "    e.resourceNodes = [corpse, berry, farm];",
          "    const assignedCounts = new Map([[corpse.id, 3]]);",
          "    const choices = [];",
          "    for (const worker of workers) {",
          "      const target = e.findBestDeliveredResourceNode(worker, 'food', Infinity, { assignedCounts });",
          "      choices.push(target ? { id: target.id, subtype: target.subtype } : null);",
          "      if (target) assignedCounts.set(target.id, (assignedCounts.get(target.id) || 0) + 1);",
          "    }",
          "    return { requestedWorkers: workers.length, assignedWorkers: choices.filter(Boolean).length, corpseAssignments: choices.filter((choice) => choice?.id === corpse.id).length, berryAssignments: choices.filter((choice) => choice?.id === berry.id).length, farmAssignments: choices.filter((choice) => choice?.id === farm.id).length, selectedSubtypes: [...new Set(choices.filter(Boolean).map((choice) => choice.subtype))] };",
          "  } finally { e.resourceNodes = originalNodes; e.rebuildResourceNodeLookup(); }",
          "})()",
        ].join("\\n"));
        assert.equal(wildlifeAiFoodFallback.assignedWorkers, wildlifeAiFoodFallback.requestedWorkers, "AI failed to find an alternative food source for every eligible worker.");
        assert.equal(wildlifeAiFoodFallback.corpseAssignments, 0, "AI overflow assignments returned to an already-full carcass.");
        assert.equal(wildlifeAiFoodFallback.berryAssignments + wildlifeAiFoodFallback.farmAssignments, wildlifeAiFoodFallback.requestedWorkers, "AI did not keep the overflow roster on usable food sources.");
        report.wildlifeCarcassStress.push({ kind: "multi-worker-ai-food-fallback", ...wildlifeAiFoodFallback });

        const wildlifeCapacityCases = [];
        for (const subtype of ["hunt", "boar", "aurochs"]) {
          const nodeId = wildlifeNodeIds[subtype];
          const capacity = subtype === "hunt" ? 3 : subtype === "boar" ? 4 : 6;
          for (const workerCount of [1, 3, 4, 6, 12, 20]) {
            const stage = await evaluate([
              "(() => {",
              "  const e = window.__rtsEngine;",
              "  const workerIds = " + JSON.stringify(constructionSetup.workerIds) + ";",
              "  const nodeId = " + JSON.stringify(nodeId) + ";",
              "  const subtype = " + JSON.stringify(subtype) + ";",
              "  const workerCount = " + workerCount + ";",
              "  const workers = workerIds.map((id) => e.units.find((unit) => unit.id === id)).filter(Boolean);",
              "  const node = e.resourceNodes.find((entry) => entry.id === nodeId);",
              "  node.subtype = subtype; node.amount = 1200; node.maxAmount = 1200; node.animalAlive = false; node.animalHp = 0;",
              "  for (let index = 0; index < workers.length; index++) {",
              "    const unit = workers[index];",
              "    unit.hp = Math.max(1, unit.maxHp || 100);",
              "    unit.state = index < workerCount ? 'gathering' : 'idle';",
              "    unit.targetResourceNodeId = index < workerCount ? nodeId : undefined;",
              "    unit.targetBuildingId = undefined; unit.targetEntityId = undefined; unit.targetGarrisonBuildingId = undefined;",
              "    unit.commandQueue = undefined; unit.queuedGatherStopAfterDeposit = false; unit.carryingResource = undefined;",
              "    unit.unitDef = { ...unit.unitDef, category: 'worker', isNaval: false, stats: { ...unit.unitDef.stats, carryCapacity: 40 } };",
              "    unit.wildlifeCarcassHarvestNodeId = undefined; unit.wildlifeCarcassHarvestActive = undefined;",
              "    unit.wildlifeHuntApproachAngle = undefined; unit.wildlifeHuntApproachTargetNodeId = undefined; unit.wildlifeHuntApproachGoal = undefined;",
              "    unit.waypoints = undefined; unit.pathGoal = undefined; unit.pathCooldown = 0; unit.velocity = { x: 0, z: 0 };",
              "    unit.x = node.x + (index % 5) * 0.42; unit.z = node.z + Math.floor(index / 5) * 0.42;",
              "    const mesh = e.unitMeshes.get(unit.id); if (mesh) { mesh.visible = true; mesh.position.set(unit.x, 0, unit.z); }",
              "  }",
              "  e.rebuildResourceNodeLookup();",
              "  e.rebuildWildlifeCarcassHarvestAssignments();",
              "  const active = workers.filter((unit) => unit.wildlifeCarcassHarvestNodeId === nodeId && unit.wildlifeCarcassHarvestActive === true);",
              "  const waiting = workers.filter((unit) => unit.wildlifeCarcassHarvestNodeId === nodeId && unit.wildlifeCarcassHarvestActive === false);",
              "  const waitingSlotIndices = waiting.map((unit) => unit.wildlifeCarcassWaitSlotIndex);",
              "  const waitingQueueValid = waiting.every((unit) => unit.wildlifeCarcassWaitNodeId === nodeId && Number.isSafeInteger(unit.wildlifeCarcassWaitSlotIndex)) && new Set(waitingSlotIndices).size === waiting.length && waitingSlotIndices.every((slot) => slot >= 0 && slot < waiting.length);",
              "  return { subtype, workerCount, capacity: " + capacity + ", activeCount: active.length, waitingCount: waiting.length, activeIds: active.map((unit) => unit.id), waitingQueueValid, waitingSlotIndices };",
              "})()",
            ].join("\n"));
            const expectedActive = Math.min(workerCount, capacity);
            assert.equal(stage.activeCount, expectedActive, subtype + " carcass admitted the wrong number of simultaneous villagers at roster size " + workerCount + ".");
            assert.equal(new Set(stage.activeIds).size, stage.activeCount, "One villager was assigned to more than one work slot.");
            assert.equal(stage.waitingQueueValid, true, subtype + " carcass did not assign unique, contiguous waiting positions at roster size " + workerCount + ".");
            wildlifeCapacityCases.push(stage);
            console.log("[wildlife-carcass] " + subtype + " / " + workerCount + " villagers: " +
              stage.activeCount + " active, " + stage.waitingCount + " waiting.");
          }
        }
        report.wildlifeCarcassStress.push({ kind: "capacity-matrix", cases: wildlifeCapacityCases });

        const wildlifeLifecycle = await evaluate([
          "(() => {",
          "  const e = window.__rtsEngine;",
          "  const nodeId = " + JSON.stringify(wildlifeNodeIds.hunt) + ";",
          "  const workerIds = " + JSON.stringify(constructionSetup.workerIds.slice(0, 24)) + ";",
          "  const node = e.resourceNodes.find((entry) => entry.id === nodeId);",
          "  node.subtype = 'hunt'; node.amount = 1200; node.maxAmount = 1200; node.animalAlive = false; node.animalHp = 0;",
          "  const workers = workerIds.map((id) => e.units.find((unit) => unit.id === id)).filter(Boolean);",
          "  for (const unit of workers) {",
          "    unit.hp = Math.max(1, unit.maxHp || 100); unit.state = 'gathering'; unit.targetResourceNodeId = nodeId;",
          "    unit.unitDef = { ...unit.unitDef, category: 'worker', isNaval: false, stats: { ...unit.unitDef.stats, carryCapacity: 40 } };",
          "    unit.carryingResource = undefined; unit.wildlifeCarcassHarvestNodeId = undefined; unit.wildlifeCarcassHarvestActive = undefined;",
          "  }",
          "  e.rebuildResourceNodeLookup(); e.rebuildWildlifeCarcassHarvestAssignments();",
          "  let active = workers.filter((unit) => unit.wildlifeCarcassHarvestActive === true);",
          "  const initialActiveCount = active.length;",
          "  const full = active[0]; full.carryingResource = { type: 'food', amount: 40 };",
          "  e.stepUnitGathering(full, 0.05);",
          "  const fullCargoImmediateRelease = full.wildlifeCarcassHarvestNodeId === undefined && full.wildlifeCarcassHarvestActive === undefined && full.wildlifeCarcassHarvestSlotIndex === undefined;",
          "  e.rebuildWildlifeCarcassHarvestAssignments();",
          "  active = workers.filter((unit) => unit.wildlifeCarcassHarvestActive === true);",
          "  const fullCargoReleased = !active.includes(full) && active.length === initialActiveCount;",
          "  const dead = active[0]; dead.hp = 0;",
          "  e.rebuildWildlifeCarcassHarvestAssignments();",
          "  active = workers.filter((unit) => unit.wildlifeCarcassHarvestActive === true);",
          "  const deadWorkerReleased = dead.wildlifeCarcassHarvestNodeId === undefined && active.length === initialActiveCount;",
          "  const retasked = active[0]; retasked.state = 'moving';",
          "  e.rebuildWildlifeCarcassHarvestAssignments();",
          "  active = workers.filter((unit) => unit.wildlifeCarcassHarvestActive === true);",
          "  const retaskedWorkerReleased = retasked.wildlifeCarcassHarvestNodeId === undefined && active.length === initialActiveCount;",
          "  return { initialActiveCount, fullCargoImmediateRelease, fullCargoReleased, deadWorkerReleased, retaskedWorkerReleased, finalActiveCount: active.length };",
          "})()",
        ].join("\n"));
        assert.equal(wildlifeLifecycle.initialActiveCount, 3, "Lifecycle scenario did not begin with three active deer carcass workers.");
        assert.equal(wildlifeLifecycle.fullCargoImmediateRelease, true, "A full-cargo villager did not release its work-slot fields on the gather tick.");
        assert.equal(wildlifeLifecycle.fullCargoReleased, true, "A full-cargo villager retained a carcass work slot.");
        assert.equal(wildlifeLifecycle.deadWorkerReleased, true, "A dead villager retained a carcass work slot.");
        assert.equal(wildlifeLifecycle.retaskedWorkerReleased, true, "A re-tasked villager retained a carcass work slot.");
        report.wildlifeCarcassStress.push({ kind: "slot-lifecycle", ...wildlifeLifecycle });

        const wildlifeConcurrency = await evaluate([
          "(() => {",
          "  const e = window.__rtsEngine;",
          "  const workerIds = " + JSON.stringify(constructionSetup.workerIds) + ";",
          "  const nodeIds = " + JSON.stringify([wildlifeNodeIds.hunt, wildlifeNodeIds.boar, wildlifeNodeIds.aurochs]) + ";",
          "  const nodes = nodeIds.map((id) => e.resourceNodes.find((node) => node.id === id));",
          "  const subtypes = ['hunt', 'boar', 'aurochs'];",
          "  const workers = workerIds.map((id) => e.units.find((unit) => unit.id === id)).filter(Boolean);",
          "  for (let index = 0; index < workers.length; index++) {",
          "    const unit = workers[index]; const group = index % nodes.length; const node = nodes[group];",
          "    unit.hp = Math.max(1, unit.maxHp || 100); unit.state = 'gathering'; unit.targetResourceNodeId = node.id;",
          "    unit.unitDef = { ...unit.unitDef, category: 'worker', isNaval: false, stats: { ...unit.unitDef.stats, carryCapacity: 40 } };",
          "    unit.carryingResource = undefined; unit.wildlifeCarcassHarvestNodeId = undefined; unit.wildlifeCarcassHarvestActive = undefined;",
          "    unit.wildlifeHuntApproachAngle = undefined; unit.wildlifeHuntApproachTargetNodeId = undefined; unit.wildlifeHuntApproachGoal = undefined;",
          "    unit.x = node.x + (index % 7) * 0.35; unit.z = node.z + Math.floor(index / 7) * 0.35;",
          "  }",
          "  for (let group = 0; group < nodes.length; group++) { nodes[group].subtype = subtypes[group]; nodes[group].amount = 1200; nodes[group].maxAmount = 1200; nodes[group].animalAlive = false; nodes[group].animalHp = 0; }",
          "  e.rebuildResourceNodeLookup(); e.rebuildWildlifeCarcassHarvestAssignments();",
          "  const counts = nodes.map((node) => workers.filter((unit) => unit.wildlifeCarcassHarvestNodeId === node.id && unit.wildlifeCarcassHarvestActive === true).length);",
          "  const active = workers.filter((unit) => unit.wildlifeCarcassHarvestActive === true);",
          "  const deerWorkers = workers.filter((unit) => unit.wildlifeCarcassHarvestNodeId === nodeIds[0] && unit.wildlifeCarcassHarvestActive === true);",
          "  const deerNode = nodes[0];",
          "  const harvestResults = [];",
          "  for (const unit of deerWorkers) {",
          "    unit.x = deerNode.x; unit.z = deerNode.z; unit.carryingResource = undefined;",
          "    e.stepUnitGathering(unit, 0.05);",
          "    const goal = unit.wildlifeHuntApproachGoal;",
          "    if (!goal) { harvestResults.push({ id: unit.id, amount: 0, reason: 'missing approach goal' }); continue; }",
          "    const dx = goal.x - deerNode.x; const dz = goal.z - deerNode.z; const distance = Math.hypot(dx, dz);",
          "    const inset = Math.max(0, distance - 0.03);",
          "    unit.x = deerNode.x + dx * inset / Math.max(0.001, distance);",
          "    unit.z = deerNode.z + dz * inset / Math.max(0.001, distance);",
          "    unit.waypoints = undefined; unit.pathGoal = undefined; unit.pathCooldown = 0;",
          "    const previous = unit.carryingResource?.amount || 0;",
          "    e.stepUnitGathering(unit, 0.5);",
          "    harvestResults.push({ id: unit.id, amount: (unit.carryingResource?.amount || 0) - previous });",
          "  }",
          "  return { workerCount: workers.length, activeCounts: counts, totalActive: active.length, uniqueActiveWorkers: new Set(active.map((unit) => unit.id)).size, harvestResults, deerMeatRemaining: deerNode.amount };",
          "})()",
        ].join("\n"));
        assert.deepEqual(wildlifeConcurrency.activeCounts, [3, 4, 6], "Concurrent carcasses did not enforce their independent work caps.");
        assert.equal(wildlifeConcurrency.totalActive, 13, "Concurrent carcasses admitted an unexpected total worker count.");
        assert.equal(wildlifeConcurrency.uniqueActiveWorkers, 13, "A villager occupied slots at multiple carcasses.");
        assert.equal(wildlifeConcurrency.harvestResults.length, 3, "The live gathering test did not exercise all active deer carcass workers.");
        assert.ok(wildlifeConcurrency.harvestResults.every((entry) => Number.isFinite(entry.amount) && entry.amount > 0), "Live stepUnitGathering failed to transfer meat to every admitted villager.");
        assert.ok(wildlifeConcurrency.deerMeatRemaining < 1200, "Live stepUnitGathering did not consume meat from the carcass.");
        report.wildlifeCarcassStress.push({ kind: "concurrent-carcasses-and-live-harvest", ...wildlifeConcurrency });

        const slotStability = await evaluate([
          "(() => {",
          "  const e = window.__rtsEngine;",
          "  const workers = " + JSON.stringify(constructionSetup.workerIds) + ".map((id) => e.units.find((unit) => unit.id === id)).filter(Boolean);",
          "  const before = new Map(workers.filter((unit) => unit.wildlifeCarcassHarvestActive === true).map((unit) => [unit.id, unit.wildlifeCarcassHarvestSlotIndex]));",
          "  for (const unit of workers) { if (!before.has(unit.id)) continue; unit.x += (unit.id.length % 2 ? 0.22 : -0.22); unit.z += (unit.id.length % 3 ? -0.18 : 0.18); }",
          "  e.rebuildWildlifeCarcassHarvestAssignments();",
          "  const after = workers.filter((unit) => unit.wildlifeCarcassHarvestActive === true);",
          "  const retained = after.filter((unit) => before.has(unit.id) && before.get(unit.id) === unit.wildlifeCarcassHarvestSlotIndex).length;",
          "  return { beforeCount: before.size, afterCount: after.length, retainedCount: retained, uniqueSlots: new Set(after.map((unit) => unit.targetResourceNodeId + ':' + unit.wildlifeCarcassHarvestSlotIndex)).size };",
          "})()",
        ].join("\n"));
        assert.ok(slotStability.beforeCount > 0, "Sector stability scenario had no incumbent workers.");
        assert.equal(slotStability.afterCount, slotStability.beforeCount, "Incumbent workers were unexpectedly displaced by minor movement.");
        assert.equal(slotStability.retainedCount, slotStability.beforeCount, "A carcass worker changed angular sector after minor movement.");
        assert.equal(slotStability.uniqueSlots, slotStability.afterCount, "Two workers shared the same carcass sector.");
        report.wildlifeCarcassStress.push({ kind: "stable-approach-sector-refresh", ...slotStability });

        // Profile the actual engine assignment routine with the full 200-worker
        // roster contending across three carcasses. This measures allocation cost
        // independently from frame-rate and renderer variance.
        const wildlifeTiming = await evaluate([
          "(() => {",
          "  const e = window.__rtsEngine;",
          "  const original = e.rebuildWildlifeCarcassHarvestAssignments.bind(e);",
          "  const measurements = [];",
          "  for (let index = 0; index < 40; index++) {",
          "    const start = performance.now(); original(); measurements.push(performance.now() - start);",
          "  }",
          "  measurements.sort((a, b) => a - b);",
          "  const total = measurements.reduce((sum, value) => sum + value, 0);",
          "  return { iterations: measurements.length, averageMs: total / measurements.length, p95Ms: measurements[Math.min(measurements.length - 1, Math.floor(measurements.length * 0.95))], maxMs: measurements[measurements.length - 1] };",
          "})()",
        ].join("\n"));
        assert.equal(wildlifeTiming.iterations, 40, "Wildlife assignment timing did not capture every iteration.");
        assert.ok(Number.isFinite(wildlifeTiming.averageMs) && wildlifeTiming.averageMs >= 0, "Wildlife assignment timing is invalid.");
        report.wildlifeCarcassStress.push({ kind: "200-villager-assignment-profile", ...wildlifeTiming });
        console.log("[wildlife-carcass] live capacity matrix, full/dead/retasked release, three-carcass concurrency, and gathering passed; 200-worker assignment average " +
          wildlifeTiming.averageMs.toFixed(3) + "ms, P95 " + wildlifeTiming.p95Ms.toFixed(3) + "ms.");

      }

      report.scenarios.push({ count, initial, seededBuffUnits, resourceLayouts, economyPanel, telemetry, wallPlacement, wallInteraction, exceptionCount: exceptions.length });
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
        decorations.shadowInstances + " shadow/ring instances, " +
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
