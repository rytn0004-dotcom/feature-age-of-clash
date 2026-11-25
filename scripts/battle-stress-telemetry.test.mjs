import test from "node:test";
import assert from "node:assert/strict";
import { aggregateBattleStressSamples } from "./battle-stress-telemetry.mjs";

function makeSample(overrides = {}) {
  return {
    elapsedSeconds: 0.5,
    fps: 2,
    frameAverageMs: 10,
    frameP95Ms: 12,
    maxHitchMs: 15,
    simulationUpdateAverageMs: 8,
    simulationUpdateMaxMs: 9,
    unitUpdateAverageMs: 2,
    fieldSiegeAverageMs: 0.1,
    unitCollisionAverageMs: 1,
    buildingCollisionAverageMs: 0.5,
    resourceCollisionAverageMs: 0.25,
    unitVisualSyncAverageMs: 1.25,
    simulationOtherAverageMs: 3,
    renderCallAverageMs: 3,
    renderCallMaxMs: 4,
    aiDecisionLastMs: 1,
    aiDecisionAverageMs: 2,
    aiDecisionMaxMs: 3,
    aiDecisionTimingSamples: 4,
    aiDecisionCount: 5,
    pathSearchSamples: 10,
    aiPathSearchSamples: 9,
    emptyPathSearches: 1,
    pathSearchAverageMs: 0.2,
    pathSearchMaxMs: 0.6,
    drawCalls: 100,
    triangles: 1000,
    rendererMode: "Software GL",
    ...overrides,
  };
}

test("battle stress report aggregates all F3 windows with bounded weighted statistics", () => {
  const report = aggregateBattleStressSamples([
    makeSample(),
    makeSample({
      elapsedSeconds: 1.5,
      fps: 1,
      frameAverageMs: 30,
      frameP95Ms: 40,
      maxHitchMs: 45,
      simulationUpdateAverageMs: 24,
      simulationUpdateMaxMs: 30,
      unitUpdateAverageMs: 8,
      fieldSiegeAverageMs: 0.4,
      unitCollisionAverageMs: 4,
      buildingCollisionAverageMs: 2,
      resourceCollisionAverageMs: 1,
      unitVisualSyncAverageMs: 5,
      simulationOtherAverageMs: 3.6,
      renderCallAverageMs: 9,
      renderCallMaxMs: 12,
      aiDecisionLastMs: 5,
      aiDecisionAverageMs: 6,
      aiDecisionMaxMs: 7,
      aiDecisionTimingSamples: 8,
      aiDecisionCount: 9,
      pathSearchSamples: 30,
      aiPathSearchSamples: 29,
      emptyPathSearches: 2,
      pathSearchAverageMs: 0.4,
      pathSearchMaxMs: 1.2,
      drawCalls: 200,
      triangles: 2000,
    }),
  ]);

  assert.equal(report.samples, 2);
  assert.ok(Math.abs(report.fps - (4 / 3)) < 1e-9);
  assert.equal(report.frameAverageMs, 20);
  assert.ok(Math.abs(report.p95Ms - 38.6) < 1e-9);
  assert.equal(report.hitchMs, 45);
  assert.equal(report.simulationAverageMs, 16);
  assert.equal(report.simulationMaxMs, 30);
  assert.equal(report.unitUpdateAverageMs, 5);
  assert.equal(report.fieldSiegeAverageMs, 0.25);
  assert.equal(report.unitCollisionAverageMs, 2.5);
  assert.equal(report.buildingCollisionAverageMs, 1.25);
  assert.equal(report.resourceCollisionAverageMs, 0.625);
  assert.equal(report.unitVisualSyncAverageMs, 3.125);
  assert.equal(report.simulationOtherAverageMs, 3.3);
  assert.equal(report.renderAverageMs, 6);
  assert.equal(report.renderMaxMs, 12);
  assert.equal(report.aiDecisionLastMs, 5);
  assert.equal(report.aiDecisionAverageMs, 6);
  assert.equal(report.aiDecisionMaxMs, 7);
  assert.equal(report.aiDecisionSamples, 8);
  assert.equal(report.aiHeartbeat, 9);
  assert.equal(report.aStarSearches, 30);
  assert.equal(report.aStarAiSearches, 29);
  assert.equal(report.aStarEmptyPaths, 2);
  assert.equal(report.aStarAverageMs, 0.4);
  assert.equal(report.aStarMaxMs, 1.2);
  assert.equal(report.drawCalls, 167);
  assert.equal(report.drawCallsMax, 200);
  assert.equal(report.triangles, 1667);
  assert.equal(report.trianglesMax, 2000);
  assert.equal(report.renderer, "Software GL");
});

test("battle stress report rejects an empty capture and handles missing timing weights", () => {
  assert.throws(() => aggregateBattleStressSamples([]), RangeError);
  const report = aggregateBattleStressSamples([
    makeSample({
      elapsedSeconds: 0,
      fps: 0,
      frameAverageMs: 16,
    }),
    makeSample({
      elapsedSeconds: 0,
      fps: 0,
      frameAverageMs: 24,
    }),
  ]);
  assert.equal(report.fps, 0);
  assert.equal(report.frameAverageMs, 20);
});
