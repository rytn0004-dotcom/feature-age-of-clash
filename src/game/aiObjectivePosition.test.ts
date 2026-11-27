import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getStableAiObjectiveOffset,
  isSameAiObjectiveOrder,
} from './aiObjectivePosition';

test('AI objective offsets stay deterministic per unit and objective', () => {
  const first = getStableAiObjectiveOffset('unit-17', 'shrine-west', 2.5);

  assert.deepEqual(getStableAiObjectiveOffset('unit-17', 'shrine-west', 2.5), first);
  assert.notDeepEqual(getStableAiObjectiveOffset('unit-18', 'shrine-west', 2.5), first);
  assert.notDeepEqual(getStableAiObjectiveOffset('unit-17', 'shrine-east', 2.5), first);
  assert.ok(Math.abs(first.x) <= 2.5);
  assert.ok(Math.abs(first.z) <= 2.5);
});

test('AI objective offsets safely handle zero and invalid ranges', () => {
  assert.deepEqual(getStableAiObjectiveOffset('unit-1', 'shrine', 0), { x: 0, z: 0 });
  assert.deepEqual(getStableAiObjectiveOffset('unit-1', 'shrine', Number.NaN), { x: 0, z: 0 });
  assert.deepEqual(getStableAiObjectiveOffset('unit-1', 'shrine', Number.POSITIVE_INFINITY), { x: 0, z: 0 });
});

test('AI objective orders remain idempotent for the same action and destination', () => {
  assert.equal(
    isSameAiObjectiveOrder('奪取據點', { x: 12, z: -8 }, '奪取據點', { x: 12.005, z: -8.004 }),
    true,
  );
  assert.equal(
    isSameAiObjectiveOrder('奪取據點', { x: 12, z: -8 }, '襲擊經濟', { x: 12, z: -8 }),
    false,
  );
  assert.equal(
    isSameAiObjectiveOrder('奪取據點', { x: 12, z: -8 }, '奪取據點', { x: 12.02, z: -8 }),
    false,
  );
  assert.equal(isSameAiObjectiveOrder('奪取據點', null, '奪取據點', { x: 12, z: -8 }), false);
  assert.equal(
    isSameAiObjectiveOrder('奪取據點', { x: Number.NaN, z: -8 }, '奪取據點', { x: 12, z: -8 }),
    false,
  );
});
