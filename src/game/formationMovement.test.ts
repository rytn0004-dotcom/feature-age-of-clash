import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FORMATION_REGROUP_ABANDON_STALL_SECONDS,
  FORMATION_REGROUP_STALL_SECONDS,
  findNarrowPassageOnRoute,
  getFormationCohesionSpeedScale,
  getFormationMoveProgress,
  getFormationNarrowPassageTrafficScale,
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
  assert.equal(state.slowestProgress, 0);
  assert.ok(
    getFormationCohesionSpeedScale(0.62, state.slowestProgress, true) < 0.4,
    'units far ahead should slow down while the blocked member is recovering',
  );
  assert.equal(
    getFormationCohesionSpeedScale(0, state.slowestProgress, true),
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


test('formation terrain flow: detects a sustained narrow section on an A* route', () => {
  const route = [{ x: 0, z: 0 }, { x: 20, z: 0 }];
  const passage = findNarrowPassageOnRoute(route, (x) => (x >= 6 && x <= 14 ? 2 : 12));

  assert.ok(passage);
  assert.ok(passage.x >= 6 && passage.x <= 14);
  assert.equal(passage.width, 2);
  assert.ok(passage.halfLength >= 1.6);
  assert.ok(Math.abs(passage.directionX - 1) < 0.001);
  assert.ok(Math.abs(passage.directionZ) < 0.001);
});

test('formation terrain flow: open routes and endpoint-only constrictions are ignored', () => {
  assert.equal(
    findNarrowPassageOnRoute(
      [{ x: 0, z: 0 }, { x: 20, z: 0 }],
      () => 12,
    ),
    null,
  );
  assert.equal(
    findNarrowPassageOnRoute(
      [{ x: 0, z: 0 }, { x: 20, z: 0 }],
      (x) => (x < 2 || x > 18 ? 1.5 : 12),
    ),
    null,
  );
});

test('formation terrain flow: a clear unit passes while the next unit queues at the entrance', () => {
  const passage = {
    x: 5,
    z: 0,
    directionX: 1,
    directionZ: 0,
    width: 1.8,
    halfLength: 1.8,
  };
  const members = [
    { id: 'front', x: 5.5, z: 0 },
    { id: 'next', x: 2.3, z: 0 },
  ];

  assert.equal(getFormationNarrowPassageTrafficScale('front', members, passage), 1);
  assert.equal(getFormationNarrowPassageTrafficScale('next', members, passage), 0);
});

test('formation terrain flow: exited and permanently unreachable units do not reserve passage capacity', () => {
  const passage = {
    x: 5,
    z: 0,
    directionX: 1,
    directionZ: 0,
    width: 1.8,
    halfLength: 1.8,
  };
  assert.equal(
    getFormationNarrowPassageTrafficScale(
      'next',
      [{ id: 'front', x: 8.5, z: 0 }, { id: 'next', x: 2.3, z: 0 }],
      passage,
    ),
    1,
  );
  assert.equal(
    getFormationNarrowPassageTrafficScale(
      'next',
      [
        { id: 'trapped', x: 5, z: 0, stuckDuration: FORMATION_REGROUP_ABANDON_STALL_SECONDS },
        { id: 'next', x: 2.3, z: 0 },
      ],
      passage,
    ),
    1,
  );
});
