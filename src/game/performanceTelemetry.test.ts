import test from 'node:test';
import assert from 'node:assert/strict';
import { formatPerformanceTelemetryCsv } from './performanceTelemetry';
import type { PerformanceSample } from './performanceTelemetry';

function makeSample(overrides: Partial<PerformanceSample> = {}): PerformanceSample {
  return {
    elapsedSeconds: 0.5,
    wallTime: '2026-11-22T02:00:00.000Z',
    fps: 59.8,
    frameAverageMs: 16.2,
    frameP95Ms: 21.4,
    maxHitchMs: 42.1,
    drawCalls: 120,
    triangles: 45000,
    geometries: 88,
    textures: 34,
    aliveUnits: 100,
    aiAliveUnits: 86,
    aiIdleUnits: 5,
    aiMovingUnits: 20,
    aiAttackingUnits: 30,
    aiGatheringUnits: 18,
    aiReturningUnits: 9,
    aiBuildingUnits: 3,
    aiAssemblingUnits: 1,
    aiGarrisoningUnits: 0,
    aiQueuedUnits: 7,
    aiResearchingBuildings: 2,
    aiDecisionCount: 12,
    aiDecisionAccumulatorSeconds: 0.4,
    projectileCount: 12,
    activeParticles: 28,
    particleCapacity: 256,
    pixelRatio: 1.5,
    rendererMode: 'Hardware GL',
    qualityLevel: 2,
    stressUnitCount: 100,
    stressSeed: 20261122,
    mapPreset: 'highland_basin',
    gameDurationSeconds: 14.5,
    gameSpeed: 1,
    gameState: 'playing',
    participantCount: 4,
    aiParticipantCount: 4,
    viewportWidth: 1920,
    viewportHeight: 1080,
    ...overrides,
  };
}

test('performance telemetry: exports stable columns and numeric samples', () => {
  const csv = formatPerformanceTelemetryCsv([makeSample()]);
  const [header, row] = csv.replace(/^\uFEFF/, '').split('\r\n');
  assert.match(header, /^elapsedSeconds,wallTime,fps,frameAverageMs,frameP95Ms,maxHitchMs,/);
  assert.match(header, /aiAliveUnits,aiIdleUnits,aiMovingUnits,aiAttackingUnits/);
  assert.match(header, /aiDecisionCount,aiDecisionAccumulatorSeconds/);
  assert.ok(row.includes('59.8'));
  assert.ok(row.includes('45000'));
  assert.ok(row.includes('highland_basin'));
});

test('performance telemetry: empty captures still produce a usable header', () => {
  const csv = formatPerformanceTelemetryCsv([]);
  assert.ok(csv.startsWith('\uFEFFelapsedSeconds,wallTime,fps'));
  assert.equal(csv.split('\r\n').length, 1);
});

test('performance telemetry: text fields escape quotes, commas, and line breaks', () => {
  const csv = formatPerformanceTelemetryCsv([
    makeSample({ rendererMode: 'Hardware, "WebGL2"\nGPU' }),
  ]);
  assert.ok(csv.includes('"Hardware, ""WebGL2""\nGPU"'));
});

test('performance telemetry: spreadsheet formulas are neutralized and non-finite numbers are blank', () => {
  const csv = formatPerformanceTelemetryCsv([
    makeSample({ mapPreset: '=HYPERLINK("https://example.invalid")', fps: Number.NaN }),
  ]);
  assert.ok(csv.includes("\"'=HYPERLINK(\"\"https://example.invalid\"\")\""));
  const [, row] = csv.replace(/^\uFEFF/, '').split('\r\n');
  assert.equal(row.split(',')[2], '');
});
