import test from 'node:test';
import assert from 'node:assert/strict';
import { getUnitVisualAnimationInterval } from './unitVisualAnimationLod';

test('unit visual LOD: nearby, selected, and inspected units retain full-rate animation', () => {
  assert.equal(getUnitVisualAnimationInterval(20 * 20, true, false), 0);
  assert.equal(getUnitVisualAnimationInterval(90 * 90, true, true), 0);
  assert.equal(getUnitVisualAnimationInterval(Number.NaN, false, false), 0);
});

test('unit visual LOD: distant moving and fighting units update more often than idle units', () => {
  assert.equal(getUnitVisualAnimationInterval(60 * 60, true, false), 0.08);
  assert.equal(getUnitVisualAnimationInterval(60 * 60, false, false), 0.14);
  assert.equal(getUnitVisualAnimationInterval(90 * 90, true, false), 0.12);
  assert.equal(getUnitVisualAnimationInterval(90 * 90, false, false), 0.2);
});

test('unit visual LOD: visual intervals are stable at distance-band boundaries', () => {
  assert.equal(getUnitVisualAnimationInterval(36 * 36, false, false), 0);
  assert.equal(getUnitVisualAnimationInterval(36.01 * 36.01, false, false), 0.14);
  assert.equal(getUnitVisualAnimationInterval(75 * 75, true, false), 0.08);
  assert.equal(getUnitVisualAnimationInterval(75.01 * 75.01, true, false), 0.12);
});
