import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getWildlifeHuntFallbackAngle,
  getWildlifeIdleMotion,
  writeWildlifeIdleMotion,
} from './wildlifeFacing';

test('wildlife idle motion is deterministic for a stable time and individual phase', () => {
  const first = getWildlifeIdleMotion(24.5, 3.25);
  const second = getWildlifeIdleMotion(24.5, 3.25);
  assert.deepEqual(first, second);
  assert.ok(Object.values(first).filter((value): value is number => typeof value === 'number').every(Number.isFinite));
});

test('wildlife individuals have phase-offset breathing, head and tail idle movement', () => {
  const first = getWildlifeIdleMotion(18, 0.7);
  const second = getWildlifeIdleMotion(18, 2.9);
  assert.notDeepEqual(first, second);
  assert.ok(
    first.breathing !== second.breathing ||
    first.headLook !== second.headLook ||
    first.tailSway !== second.tailSway,
  );
});

test('wildlife idle writer reuses caller-owned storage and clears previous values', () => {
  const scratch = {
    breathing: 0,
    weightShift: 0,
    headNod: 0,
    headLook: 0,
    tailSway: 0,
    grazing: false,
    grazingAmount: 0,
  };
  const first = writeWildlifeIdleMotion(scratch, 12, 0.8);
  assert.equal(first, scratch);
  assert.deepEqual(first, getWildlifeIdleMotion(12, 0.8));
  const second = writeWildlifeIdleMotion(scratch, 90, 4.2);
  assert.equal(second, scratch);
  assert.deepEqual(second, getWildlifeIdleMotion(90, 4.2));
});

test('wildlife hunt fallback angles are stable and bounded for different unit ids', () => {
  const first = getWildlifeHuntFallbackAngle('unit-archer-1');
  assert.equal(first, getWildlifeHuntFallbackAngle('unit-archer-1'));
  assert.ok(first >= 0 && first < Math.PI * 2);
  assert.notEqual(first, getWildlifeHuntFallbackAngle('unit-archer-2'));
  assert.equal(getWildlifeHuntFallbackAngle(''), 0);
});

test('wildlife idle motion stays finite and bounded for invalid or extreme clocks', () => {
  const invalid = getWildlifeIdleMotion(Number.NaN, Number.POSITIVE_INFINITY);
  const extreme = getWildlifeIdleMotion(1e12, -1e9);
  for (const motion of [invalid, extreme]) {
    for (const [key, value] of Object.entries(motion)) {
      if (typeof value === 'number') assert.ok(Number.isFinite(value), key);
    }
    assert.ok(motion.grazingAmount >= 0 && motion.grazingAmount <= 1);
  }
});
