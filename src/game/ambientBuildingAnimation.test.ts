import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceBuildingAgeEvolutionTransition, hasAmbientBuildingAnimation } from './ambientBuildingAnimation';

test('ambient building animation: excludes missing and empty animation metadata', () => {
  assert.equal(hasAmbientBuildingAnimation(undefined), false);
  assert.equal(hasAmbientBuildingAnimation({}), false);
  assert.equal(hasAmbientBuildingAnimation({ animFlags: [] }), false);
  assert.equal(hasAmbientBuildingAnimation({ animCrystals: [] }), false);
});

test('ambient building animation: includes buildings with animated flags', () => {
  assert.equal(hasAmbientBuildingAnimation({ animFlags: [{}] }), true);
});

test('ambient building animation: includes buildings with animated crystals', () => {
  assert.equal(hasAmbientBuildingAnimation({ animCrystals: [{ obj: {}, baseY: 1 }] }), true);
});

test('ambient building animation: includes buildings with both animated part types', () => {
  assert.equal(hasAmbientBuildingAnimation({ animFlags: [{}], animCrystals: [{}] }), true);
});


test('building era transition: begins below full scale and eases toward the new architecture', () => {
  const start = advanceBuildingAgeEvolutionTransition(0, 0);
  const middle = advanceBuildingAgeEvolutionTransition(0.45, 0);
  const late = advanceBuildingAgeEvolutionTransition(0.72, 0);
  assert.equal(start.scale, 0.82);
  assert.equal(start.complete, false);
  assert.ok(middle.scale > start.scale && middle.scale < 1);
  assert.ok(late.scale > middle.scale && late.scale < 1);
});

test('building era transition: completes exactly at duration and clamps long frames', () => {
  const complete = advanceBuildingAgeEvolutionTransition(0.7, 0.5, 0.9);
  assert.equal(complete.elapsed, 0.9);
  assert.equal(complete.progress, 1);
  assert.equal(complete.scale, 1);
  assert.equal(complete.complete, true);
});

test('building era transition: invalid time values cannot reverse or poison the transition', () => {
  const start = advanceBuildingAgeEvolutionTransition(Number.NaN, Number.NaN);
  const resumed = advanceBuildingAgeEvolutionTransition(start.elapsed, 0.25, Number.NaN);
  assert.equal(start.elapsed, 0);
  assert.equal(start.scale, 0.82);
  assert.ok(resumed.elapsed > 0);
  assert.equal(resumed.complete, false);
});
