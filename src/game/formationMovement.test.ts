import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FORMATION_REGROUP_ABANDON_STALL_SECONDS,
  FORMATION_REGROUP_STALL_SECONDS,
  getFormationCohesionSpeedScale,
  getFormationMoveProgress,
  measureFormationRegroup,
} from './formationMovement';

const origin = { x: 0, z: 0 };
const goal = { x: 100, z: 0 };

const member = (id: string, x: number, stuckDuration = 0) => ({
  id,
  x,
  z: 0,
  stuckDuration,
  formationOrderOrigin: origin,
  formationOrderGoal: goal,
});

test('formation movement: progress is projected onto the shared order vector and clamped', () => {
  assert.equal(getFormationMoveProgress(25, 7, origin, goal), 0.25);
  assert.equal(getFormationMoveProgress(-5, 0, origin, goal), 0);
  assert.equal(getFormationMoveProgress(120, 0, origin, goal), 1);
  assert.equal(getFormationMoveProgress(5, 0, origin, origin), 1);
  assert.equal(getFormationMoveProgress(Number.NaN, 0, origin, goal), 0);
});

test('formation regroup: one blocked member slows the advance of the rest of the squad', () => {
  const state = measureFormationRegroup([
    member('front', 62),
    member('screen', 45),
    member('straggler', 12, FORMATION_REGROUP_STALL_SECONDS),
  ]);

  assert.ok(state);
  assert.equal(state.activeMemberCount, 3);
  assert.equal(state.stalledMemberCount, 1);
  assert.equal(state.slowestProgress, 0.12);
  assert.ok(
    getFormationCohesionSpeedScale(0.62, state.slowestProgress, true) < 0.4,
    'units far ahead should slow down while the blocked member is recovering',
  );
  assert.equal(
    getFormationCohesionSpeedScale(0.12, state.slowestProgress, true),
    1,
    'the straggler itself must not be slowed further',
  );
});

test('formation regroup: a permanently blocked unit cannot hold the army indefinitely', () => {
  const state = measureFormationRegroup([
    member('front', 62),
    member('screen', 45),
    member('unreachable', 2, FORMATION_REGROUP_ABANDON_STALL_SECONDS),
  ]);

  assert.equal(state, null);
});

test('formation regroup: a single unit or a healthy group does not enter regroup mode', () => {
  assert.equal(measureFormationRegroup([member('solo', 10, 3)]), null);
  assert.equal(measureFormationRegroup([member('a', 10), member('b', 12)]), null);
  assert.equal(getFormationCohesionSpeedScale(0.8, 0.1, false), 1);
});

test('formation regroup: speed scale is bounded and never accelerates a member', () => {
  assert.equal(getFormationCohesionSpeedScale(0.5, 0.5, true), 1);
  assert.ok(getFormationCohesionSpeedScale(1, 0, true) >= 0.25);
  assert.ok(getFormationCohesionSpeedScale(1, 0, true) <= 1);
});
