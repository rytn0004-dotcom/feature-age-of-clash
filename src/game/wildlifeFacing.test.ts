import test from 'node:test';
import assert from 'node:assert/strict';
import { getWildlifeIdleMotion } from './wildlifeFacing';

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
