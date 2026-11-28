import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FORMATION_REGROUP_ABANDON_STALL_SECONDS,
  FORMATION_REGROUP_STALL_SECONDS,
  findNarrowPassageOnRoute,
  getFormationCohesionSpeedScale,
  getFormationMoveProgress,
  getFormationNarrowPassageTrafficScale,
  getFormationTacticalSlot,
  hasFormationShieldWallComposition,
  groupStalledFormationUnits,
  measureFormationRegroup,
  shouldRefreshFormationTacticalSlot,
  shouldAiCavalryDisengage,
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

test('formation regroup: stalled units are grouped once with stable priority and bounded thresholds', () => {
  const grouped = groupStalledFormationUnits([
    { id: 'tie-b', formationGroupId: 'alpha', hp: 100, stuckDuration: 2.8 },
    { id: 'fresh', formationGroupId: 'alpha', hp: 100, stuckDuration: 1.79 },
    { id: 'tie-a', formationGroupId: 'alpha', hp: 100, stuckDuration: 2.8 },
    { id: 'threshold', formationGroupId: 'alpha', hp: 100, stuckDuration: FORMATION_REGROUP_STALL_SECONDS },
    { id: 'abandoned', formationGroupId: 'alpha', hp: 100, stuckDuration: FORMATION_REGROUP_ABANDON_STALL_SECONDS },
    { id: 'dead', formationGroupId: 'alpha', hp: 0, stuckDuration: 3.2 },
    { id: 'other-group', formationGroupId: 'beta', hp: 100, stuckDuration: 2.1 },
    { id: 'no-group', hp: 100, stuckDuration: 3.2 },
  ]);

  assert.deepEqual([...grouped.keys()].sort(), ['alpha', 'beta']);
  assert.deepEqual(grouped.get('alpha')?.map((unit) => unit.id), ['tie-a', 'tie-b', 'threshold']);
  assert.deepEqual(grouped.get('beta')?.map((unit) => unit.id), ['other-group']);
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

test('formation terrain flow: traffic checks ignore invalid and abandoned occupants without changing capacity', () => {
  const passage = {
    x: 5,
    z: 0,
    directionX: 1,
    directionZ: 0,
    width: 1.8,
    halfLength: 1.8,
  };
  const next = { id: 'next', x: 2.3, z: 0 };
  const abandoned = {
    id: 'abandoned',
    x: 5,
    z: 0,
    stuckDuration: FORMATION_REGROUP_ABANDON_STALL_SECONDS,
  };
  const invalid = { id: 'invalid', x: Number.NaN, z: 0 };

  assert.equal(
    getFormationNarrowPassageTrafficScale('next', [abandoned, invalid, next], passage),
    1,
  );
  assert.equal(
    getFormationNarrowPassageTrafficScale(
      'next',
      [abandoned, invalid, { id: 'active', x: 5, z: 0 }, next],
      passage,
    ),
    0,
  );
});

test('formation terrain flow: missing or inactive members are never delayed by passage traffic', () => {
  const passage = {
    x: 5,
    z: 0,
    directionX: 1,
    directionZ: 0,
    width: 1.8,
    halfLength: 1.8,
  };
  const occupant = { id: 'front', x: 5, z: 0 };

  assert.equal(getFormationNarrowPassageTrafficScale('missing', [occupant], passage), 1);
  assert.equal(
    getFormationNarrowPassageTrafficScale(
      'invalid-current',
      [{ id: 'invalid-current', x: Number.NaN, z: 0 }, occupant],
      passage,
    ),
    1,
  );
  assert.equal(
    getFormationNarrowPassageTrafficScale(
      'abandoned-current',
      [
        { id: 'abandoned-current', x: 2.3, z: 0, stuckDuration: FORMATION_REGROUP_ABANDON_STALL_SECONDS },
        occupant,
      ],
      passage,
    ),
    1,
  );
});

test('formation terrain flow: same-position queue priority is independent of member iteration order', () => {
  const passage = {
    x: 5,
    z: 0,
    directionX: 1,
    directionZ: 0,
    width: 1.8,
    halfLength: 1.8,
  };
  const alpha = { id: 'unit-a', x: 5, z: 0 };
  const beta = { id: 'unit-b', x: 5, z: 0 };

  assert.equal(getFormationNarrowPassageTrafficScale('unit-b', [alpha, beta], passage), 0);
  assert.equal(getFormationNarrowPassageTrafficScale('unit-a', [alpha, beta], passage), 1);
  assert.equal(getFormationNarrowPassageTrafficScale('unit-b', [beta, alpha], passage), 0);
  assert.equal(getFormationNarrowPassageTrafficScale('unit-a', [beta, alpha], passage), 1);
});

test('formation terrain flow: malformed passage projections never count as corridor occupants', () => {
  const passage = {
    x: 5,
    z: 0,
    directionX: Number.NaN,
    directionZ: 0,
    width: 1.8,
    halfLength: 1.8,
  };
  const members = [
    { id: 'current', x: 5, z: 0 },
    { id: 'nearby', x: 5, z: 0 },
  ];

  assert.equal(getFormationNarrowPassageTrafficScale('current', members, passage), 1);
});


test('combat tactics: infantry slots form a stable frontline without exceeding melee range', () => {
  const members = [
    { id: 'inf-03', category: 'melee' as const },
    { id: 'inf-01', category: 'melee' as const },
    { id: 'inf-02', category: 'melee' as const },
    { id: 'archer-01', category: 'ranged' as const },
  ];
  const slot = getFormationTacticalSlot({
    unitId: 'inf-01',
    members,
    category: 'melee',
    groupOrigin: { x: 0, z: 0 },
    memberPosition: { x: 0, z: 0 },
    target: { x: 20, z: 0, radius: 0.45 },
    attackRange: 1.8,
    unitRadius: 0.4,
  });

  assert.ok(slot);
  assert.equal(slot.role, 'frontline');
  assert.ok(slot.distanceFromTarget <= 0.45 + 1.8 - 0.22 + 0.001);
  assert.ok(slot.lateralOffset < 0, 'stable ID sorting places the first infantry slot on the left side');
});

test('combat tactics: ranged units stay behind the target approach line while inside weapon range', () => {
  const members = [
    { id: 'archer-01', category: 'ranged' as const },
    { id: 'archer-02', category: 'ranged' as const },
    { id: 'inf-01', category: 'melee' as const },
  ];
  const slot = getFormationTacticalSlot({
    unitId: 'archer-02',
    members,
    category: 'ranged',
    groupOrigin: { x: 0, z: 0 },
    memberPosition: { x: 0, z: 0 },
    target: { x: 30, z: 0, radius: 0.5 },
    attackRange: 8,
    unitRadius: 0.4,
  });

  assert.ok(slot);
  assert.equal(slot.role, 'backline');
  assert.ok(slot.x < 30);
  assert.ok(slot.distanceFromTarget <= 8 + 0.5 - 0.22 + 0.001);
  assert.ok(slot.distanceFromTarget >= 5);
});

test('combat tactics: cavalry alternates across both flanks without stacking on the same point', () => {
  const members = Array.from({ length: 4 }, (_, index) => ({
    id: 'cav-' + (index + 1),
    category: 'cavalry' as const,
  }));
  const slots = members.map((member) =>
    getFormationTacticalSlot({
      unitId: member.id,
      members,
      category: 'cavalry',
      groupOrigin: { x: 0, z: 0 },
      memberPosition: { x: 0, z: 0 },
      target: { x: 20, z: 0, radius: 0.45 },
      attackRange: 2.4,
      unitRadius: 0.58,
    }),
  );

  assert.ok(slots.every(Boolean));
  assert.equal(slots[0]!.role, 'flank');
  assert.ok(slots[0]!.lateralOffset < 0);
  assert.ok(slots[1]!.lateralOffset > 0);
  assert.ok(slots[2]!.lateralOffset < 0);
  assert.ok(Math.abs(slots[2]!.lateralOffset) > Math.abs(slots[0]!.lateralOffset));
  assert.ok(new Set(slots.map((slot) => slot!.x.toFixed(2) + ':' + slot!.z.toFixed(2))).size > 2);
  assert.ok(slots.every((slot) => slot!.distanceFromTarget <= 2.4 + 0.45 - 0.22 + 0.001));
});

test('combat tactics: target motion refreshes slots only after the hysteresis threshold', () => {
  assert.equal(
    shouldRefreshFormationTacticalSlot('target-a', { x: 10, z: 10 }, 'target-a', { x: 12, z: 10 }),
    false,
  );
  assert.equal(
    shouldRefreshFormationTacticalSlot('target-a', { x: 10, z: 10 }, 'target-a', { x: 14, z: 10 }),
    true,
  );
  assert.equal(
    shouldRefreshFormationTacticalSlot('target-a', { x: 10, z: 10 }, 'target-b', { x: 10, z: 10 }),
    true,
  );
});

test('combat tactics: workers and non-member units never receive tactical combat slots', () => {
  const members = [{ id: 'worker-01', category: 'worker' as const }];
  assert.equal(
    getFormationTacticalSlot({
      unitId: 'worker-01',
      members,
      category: 'worker',
      groupOrigin: { x: 0, z: 0 },
      memberPosition: { x: 0, z: 0 },
      target: { x: 20, z: 0, radius: 0.5 },
      attackRange: 1,
      unitRadius: 0.32,
    }),
    null,
  );
});


test('combat tactics: mixed infantry and ranged squads compact the frontline into a shield wall', () => {
  const mixedMembers = [
    { id: 'inf-01', category: 'melee' as const },
    { id: 'inf-02', category: 'melee' as const },
    { id: 'archer-01', category: 'ranged' as const },
  ];
  const first = getFormationTacticalSlot({
    unitId: 'inf-01',
    members: mixedMembers,
    category: 'melee',
    groupOrigin: { x: 0, z: 0 },
    memberPosition: { x: 0, z: 0 },
    target: { x: 20, z: 0, radius: 0.45 },
    attackRange: 1.8,
    unitRadius: 0.4,
  });
  const second = getFormationTacticalSlot({
    unitId: 'inf-02',
    members: mixedMembers,
    category: 'melee',
    groupOrigin: { x: 0, z: 0 },
    memberPosition: { x: 0, z: 0 },
    target: { x: 20, z: 0, radius: 0.45 },
    attackRange: 1.8,
    unitRadius: 0.4,
  });
  assert.ok(first && second);
  assert.equal(first.shieldWall, true);
  assert.equal(second.shieldWall, true);
  assert.ok(Math.abs(first.lateralOffset - second.lateralOffset) <= 1.051);

  const unsupported = getFormationTacticalSlot({
    unitId: 'inf-01',
    members: mixedMembers.slice(0, 2),
    category: 'melee',
    groupOrigin: { x: 0, z: 0 },
    memberPosition: { x: 0, z: 0 },
    target: { x: 20, z: 0, radius: 0.45 },
    attackRange: 1.8,
    unitRadius: 0.4,
  });
  assert.equal(unsupported?.shieldWall, false, 'the compact shield wall is only formed to screen ranged allies');
});

test('AI cavalry: disengages only when wounded and locally outnumbered', () => {
  const base = {
    hp: 45,
    maxHp: 100,
    nearbyEnemyCount: 3,
    nearbyAllyCount: 1,
  };
  assert.equal(shouldAiCavalryDisengage(base), true);
  assert.equal(shouldAiCavalryDisengage({ ...base, nearbyEnemyCount: 1 }), false);
  assert.equal(shouldAiCavalryDisengage({ ...base, nearbyEnemyCount: 2, nearbyAllyCount: 2 }), false);
  assert.equal(shouldAiCavalryDisengage({ ...base, hp: 90 }), false);
  assert.equal(shouldAiCavalryDisengage({ ...base, personality: 'defensive' }), true);
  assert.equal(shouldAiCavalryDisengage({ ...base, personality: 'hard' }), false);
  assert.equal(shouldAiCavalryDisengage({ ...base, maxHp: 0 }), false);
});

test('combat tactics: shield-wall composition requires two melee screen units and ranged support', () => {
  assert.equal(hasFormationShieldWallComposition([]), false);
  assert.equal(hasFormationShieldWallComposition([
    { id: 'inf-01', category: 'melee' },
    { id: 'archer-01', category: 'ranged' },
  ]), false);
  assert.equal(hasFormationShieldWallComposition([
    { id: 'inf-01', category: 'melee' },
    { id: 'inf-02', category: 'melee' },
  ]), false);
  assert.equal(hasFormationShieldWallComposition([
    { id: 'inf-01', category: 'melee' },
    { id: 'inf-02', category: 'melee' },
    { id: 'archer-01', category: 'ranged' },
  ]), true);
  assert.equal(hasFormationShieldWallComposition([
    { id: 'cav-01', category: 'cavalry' },
    { id: 'inf-01', category: 'melee' },
    { id: 'archer-01', category: 'ranged' },
    { id: 'inf-02', category: 'melee' },
  ]), true);
});
