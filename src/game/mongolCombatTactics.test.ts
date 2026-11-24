import test from 'node:test';
import assert from 'node:assert/strict';
import { getMongolKitingRetreatGoal } from './mongolCombatTactics';

test('Mangudai does not retreat when a melee threat is outside the close-range trigger', () => {
  assert.equal(getMongolKitingRetreatGoal({
    x: 0, z: 0, threatX: -4.8, threatZ: 0,
    triggerDistance: 4.7, desiredDistance: 5.9,
  }), null);
});

test('Mangudai retreat waypoint increases separation toward its preferred firing distance', () => {
  const goal = getMongolKitingRetreatGoal({
    x: 0, z: 0, threatX: -3, threatZ: 0,
    triggerDistance: 4.7, desiredDistance: 5.9,
  });
  assert.ok(goal);
  assert.ok(Math.hypot(goal.x + 3, goal.z) > 3);
  assert.ok(Math.abs(Math.hypot(goal.x + 3, goal.z) - 5.9) < 0.001);
});

test('Mangudai kiting tries a sidestep when the direct retreat destination is blocked', () => {
  const checked: Array<{ x: number; z: number }> = [];
  const goal = getMongolKitingRetreatGoal({
    x: 0, z: 0, threatX: -3, threatZ: 0,
    triggerDistance: 4.7, desiredDistance: 5.9,
    isPositionClear: (x, z) => {
      checked.push({ x, z });
      return checked.length > 1;
    },
  });
  assert.ok(goal);
  assert.equal(checked.length, 2);
  assert.notEqual(goal.z, 0);
});

test('Mangudai kiting stays inside the playable world bounds', () => {
  const goal = getMongolKitingRetreatGoal({
    x: 83.5, z: 0, threatX: 80, threatZ: 0,
    triggerDistance: 4.7, desiredDistance: 5.9, worldLimit: 84,
  });
  assert.ok(goal);
  assert.ok(Math.abs(goal.x) <= 84);
  assert.ok(Math.abs(goal.z) <= 84);
});

test('Mangudai kiting rejects coincident positions and invalid input', () => {
  assert.equal(getMongolKitingRetreatGoal({
    x: 1, z: 1, threatX: 1, threatZ: 1,
  }), null);
  assert.equal(getMongolKitingRetreatGoal({
    x: Number.NaN, z: 1, threatX: 0, threatZ: 0,
  }), null);
});

test('Mangudai kiting returns no waypoint when every retreat lane is blocked', () => {
  assert.equal(getMongolKitingRetreatGoal({
    x: 0, z: 0, threatX: -3, threatZ: 0,
    isPositionClear: () => false,
  }), null);
});
