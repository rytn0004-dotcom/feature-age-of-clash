import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createUnitLodHighDetailSet,
  getUnitAnimationUpdateIntervalSeconds,
  getUnitAnimationPhaseOffsetSeconds,
} from './unitLodSelection';

test('unit LOD selection: combines selected and inspected units', () => {
  const highDetailIds = createUnitLodHighDetailSet(
    ['unit-1', 'unit-2', 'unit-1'],
    'unit-3',
  );

  assert.equal(highDetailIds.size, 3);
  assert.equal(highDetailIds.has('unit-1'), true);
  assert.equal(highDetailIds.has('unit-2'), true);
  assert.equal(highDetailIds.has('unit-3'), true);
});

test('unit LOD selection: returns an empty set when nothing is selected or inspected', () => {
  const highDetailIds = createUnitLodHighDetailSet([], null);

  assert.equal(highDetailIds.size, 0);
  assert.equal(highDetailIds.has('unit-1'), false);
});

test('unit LOD selection: uses exact unit IDs without partial matches', () => {
  const highDetailIds = createUnitLodHighDetailSet(['unit-1'], 'unit-12');

  assert.equal(highDetailIds.has('unit-1'), true);
  assert.equal(highDetailIds.has('unit-12'), true);
  assert.equal(highDetailIds.has('unit-2'), false);
});

test('unit animation cadence preserves close and selected detail while reducing distant updates', () => {
  assert.equal(getUnitAnimationUpdateIntervalSeconds(0), 0.05);
  assert.equal(getUnitAnimationUpdateIntervalSeconds(28 * 28), 0.05);
  assert.equal(getUnitAnimationUpdateIntervalSeconds(40 * 40), 0.1);
  assert.equal(getUnitAnimationUpdateIntervalSeconds(58 * 58), 0.1);
  assert.equal(getUnitAnimationUpdateIntervalSeconds(80 * 80), 0.2);
  assert.equal(getUnitAnimationUpdateIntervalSeconds(80 * 80, true), 0.05);
  assert.equal(getUnitAnimationUpdateIntervalSeconds(Number.NaN), 0.05);
  assert.equal(getUnitAnimationUpdateIntervalSeconds(-1), 0.05);
});


test('unit animation phase: stable IDs receive deterministic, distributed idle offsets', () => {
  const first = getUnitAnimationPhaseOffsetSeconds('unit-ab');
  const repeated = getUnitAnimationPhaseOffsetSeconds('unit-ab');
  const reordered = getUnitAnimationPhaseOffsetSeconds('unit-ba');

  assert.equal(first, repeated);
  assert.ok(Number.isFinite(first) && first >= 0 && first < Math.PI * 2);
  assert.ok(Number.isFinite(reordered) && reordered >= 0 && reordered < Math.PI * 2);
  assert.notEqual(first, reordered, 'IDs with the same character sum should not share a crowd phase');
});
