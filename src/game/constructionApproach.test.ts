import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CONSTRUCTION_APPROACH_DIRECTION_COUNT,
  assignWorkersToConstructionTargets,
  accumulateActiveConstructionWorkerCount,
  getConstructionApproachPoint,
  isActiveConstructionWorkerWithinReach,
  shouldDeferBlockedWallConstructionTarget,
  deferBlockedWallConstructionCommand,
  selectConstructionApproachCandidateIndex,
  selectConstructionHandoffWorker,
} from './constructionApproach';

test('construction approach candidates stay on one stable work ring', () => {
  const center = { x: 12, z: -7 };
  const radius = 2.4;
  const preferredAngle = Math.PI / 6;
  const points = Array.from({ length: CONSTRUCTION_APPROACH_DIRECTION_COUNT }, (_, index) =>
    getConstructionApproachPoint(center, radius, preferredAngle, index)
  );

  assert.equal(points.length, 8);
  points.forEach((point) => {
    assert.ok(Math.abs(Math.hypot(point.x - center.x, point.z - center.z) - radius) < 1e-9);
  });
  assert.notDeepEqual(points[0], points[1]);
  assert.ok(Math.hypot(points[0].x - center.x, points[0].z - center.z) < 2.401);
});

test('construction approach candidate indices wrap safely', () => {
  const center = { x: 0, z: 0 };
  const wrapped = getConstructionApproachPoint(center, 3, 0.25, 8);
  const first = getConstructionApproachPoint(center, 3, 0.25, 0);
  assert.deepEqual(wrapped, first);
});
test('construction targets are globally matched to the closest distinct workers', () => {
  const workers = [{ x: 0, z: 0 }, { x: 100, z: 0 }];
  const targets = [{ x: 49, z: 0 }, { x: 0, z: 0 }];

  assert.deepEqual(assignWorkersToConstructionTargets(workers, targets), [1, 0]);
});
test('construction worker assignment minimizes total travel instead of greedily taking the nearest pair', () => {
  const workers = [{ x: 0, z: 0 }, { x: 3, z: 0 }];
  const targets = [{ x: 2, z: 0 }, { x: 5, z: 0 }];

  // Greedy matching takes worker 1 for target 0 (cost 1), leaving a long trip
  // for worker 0 (cost 25). The global optimum is 4 + 4.
  assert.deepEqual(assignWorkersToConstructionTargets(workers, targets), [0, 1]);
});

test('construction matching handles more workers than targets without assigning a worker twice', () => {
  const workers = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 2, z: 0 }];
  const targets = [{ x: 1, z: 0 }, { x: 9, z: 0 }];

  assert.deepEqual(assignWorkersToConstructionTargets(workers, targets), [0, 1]);
});

test('construction matching leaves invalid coordinates unassigned and preserves original indices', () => {
  const workers = [
    { x: Number.NaN, z: 0 },
    { x: 4, z: 0 },
    { x: 100, z: Number.POSITIVE_INFINITY },
  ];
  const targets = [
    { x: 5, z: 0 },
    { x: Number.NaN, z: 3 },
  ];

  assert.deepEqual(assignWorkersToConstructionTargets(workers, targets), [1, -1]);
});

test('construction matching leaves excess targets unassigned without duplicating workers', () => {
  const workers = [{ x: 0, z: 0 }];
  const targets = [{ x: 0, z: 0 }, { x: 10, z: 0 }];

  assert.deepEqual(assignWorkersToConstructionTargets(workers, targets), [0, -1]);
});


test('active construction worker counting matches target, faction, health, state and reach', () => {
  const target = { id: 'wall-2', faction: 'blue', x: 10, z: 10 };
  const base = {
    x: 10,
    z: 10,
    hp: 100,
    faction: 'blue',
    state: 'building',
    targetBuildingId: 'wall-2',
  };

  assert.equal(isActiveConstructionWorkerWithinReach(base, target, 2.5), true);
  assert.equal(
    isActiveConstructionWorkerWithinReach({ ...base, x: 12.5 }, target, 2.5),
    true,
    'the work-ring boundary is inclusive',
  );
  assert.equal(isActiveConstructionWorkerWithinReach({ ...base, x: 12.51 }, target, 2.5), false);
  assert.equal(isActiveConstructionWorkerWithinReach({ ...base, hp: 0 }, target, 2.5), false);
  assert.equal(isActiveConstructionWorkerWithinReach({ ...base, faction: 'red' }, target, 2.5), false);
  assert.equal(isActiveConstructionWorkerWithinReach({ ...base, state: 'moving' }, target, 2.5), false);
  assert.equal(isActiveConstructionWorkerWithinReach({ ...base, targetBuildingId: 'wall-3' }, target, 2.5), false);
  assert.equal(isActiveConstructionWorkerWithinReach({ ...base, garrisonedInBuildingId: 'keep-1' }, target, 2.5), false);
  assert.equal(isActiveConstructionWorkerWithinReach(base, target, Number.NaN), false);
});


test('active construction worker counts accumulate once per target without allocating worker lists', () => {
  const target = { id: 'wall-2', faction: 'blue', x: 0, z: 0 };
  const makeWorker = (id: string, x: number) => ({
    id,
    x,
    z: 0,
    hp: 100,
    faction: 'blue',
    state: 'building',
    targetBuildingId: 'wall-2',
  });
  const counts = new Map<string, number>();

  accumulateActiveConstructionWorkerCount(counts, makeWorker('a', 0), target, 2.5);
  accumulateActiveConstructionWorkerCount(counts, makeWorker('b', 1), target, 2.5);
  accumulateActiveConstructionWorkerCount(counts, makeWorker('outside', 3), target, 2.5);
  accumulateActiveConstructionWorkerCount(
    counts,
    { ...makeWorker('wrong-target', 0), targetBuildingId: 'wall-3' },
    target,
    2.5,
  );

  assert.deepEqual([...counts.entries()], [['wall-2', 2]]);
});


test('blocked wall segments can be deferred behind the next unfinished segment in the same chain', () => {
  const current = {
    id: 'wall-2',
    wallChainId: 'chain-a',
    faction: 'blue',
    hp: 1,
    isWall: true,
    isConstructed: false,
  };
  const next = {
    ...current,
    id: 'wall-3',
  };

  assert.equal(
    shouldDeferBlockedWallConstructionTarget(
      current,
      { type: 'build', buildingId: 'wall-3' },
      next,
    ),
    true,
  );
});

test('blocked wall deferral never reorders unrelated or repair commands', () => {
  const current = {
    id: 'wall-2',
    wallChainId: 'chain-a',
    faction: 'blue',
    hp: 1,
    isWall: true,
    isConstructed: false,
  };
  const sameChainNext = { ...current, id: 'wall-3' };

  assert.equal(
    shouldDeferBlockedWallConstructionTarget(
      current,
      { type: 'repair', buildingId: 'wall-3' },
      sameChainNext,
    ),
    false,
  );
  assert.equal(
    shouldDeferBlockedWallConstructionTarget(
      current,
      { type: 'build', buildingId: 'wall-3' },
      { ...sameChainNext, wallChainId: 'chain-b' },
    ),
    false,
  );
  assert.equal(
    shouldDeferBlockedWallConstructionTarget(
      current,
      { type: 'build', buildingId: 'wall-3' },
      { ...sameChainNext, isConstructed: true },
    ),
    false,
  );
  assert.equal(
    shouldDeferBlockedWallConstructionTarget(
      current,
      { type: 'build', buildingId: 'wall-3' },
      { ...sameChainNext, faction: 'red' },
    ),
    false,
  );
});


test('blocked wall command moves behind its own chain but stays before unrelated queued orders', () => {
  const queue = [
    { type: 'build', buildingId: 'wall-3' },
    { type: 'build', buildingId: 'wall-4' },
    { type: 'move' },
  ];
  const chainById: Record<string, string> = {
    'wall-3': 'chain-a',
    'wall-4': 'chain-a',
  };

  assert.equal(
    deferBlockedWallConstructionCommand(queue, 'wall-2', 'chain-a', (id) => chainById[id]),
    true,
  );
  assert.deepEqual(queue, [
    { type: 'build', buildingId: 'wall-3' },
    { type: 'build', buildingId: 'wall-4' },
    { type: 'build', buildingId: 'wall-2' },
    { type: 'move' },
  ]);
});

test('blocked wall command is not rotated across an unrelated command or another chain', () => {
  const queue = [
    { type: 'move' },
    { type: 'build', buildingId: 'wall-other' },
  ];
  const original = queue.map((command) => ({ ...command }));

  assert.equal(
    deferBlockedWallConstructionCommand(queue, 'wall-2', 'chain-a', () => 'chain-a'),
    false,
  );
  assert.deepEqual(queue, original);
  assert.equal(
    deferBlockedWallConstructionCommand(
      [{ type: 'build', buildingId: 'wall-other' }],
      'wall-2',
      'chain-a',
      () => 'chain-b',
    ),
    false,
  );
});


test('construction work-ring selection avoids an occupied slot when another slot is similarly reachable', () => {
  const center = { x: 0, z: 0 };
  const worker = { x: 2.4, z: 0 };
  const radius = 2.4;
  const preferredAngle = 0;
  const occupied = [getConstructionApproachPoint(center, radius, preferredAngle, 0)];

  const selected = selectConstructionApproachCandidateIndex(
    worker,
    center,
    radius,
    preferredAngle,
    occupied,
  );

  assert.notEqual(selected, 0);
  const selectedPoint = getConstructionApproachPoint(center, radius, preferredAngle, selected);
  assert.ok(Math.hypot(selectedPoint.x - occupied[0].x, selectedPoint.z - occupied[0].z) >= 1.35);
});

test('blocked construction hands off only to the nearest unassigned idle worker', () => {
  const candidates = [
    { id: 'assigned', x: 1, z: 0, hp: 100, faction: 'blue', category: 'worker', state: 'building', targetBuildingId: 'other-site' },
    { id: 'busy', x: 2, z: 0, hp: 100, faction: 'blue', category: 'worker', state: 'idle', queuedCommandCount: 1 },
    { id: 'far-idle', x: 9, z: 0, hp: 100, faction: 'blue', category: 'worker', state: 'idle' },
    { id: 'near-idle', x: 3, z: 0, hp: 100, faction: 'blue', category: 'worker', state: 'idle' },
    { id: 'wrong-faction', x: 1, z: 0, hp: 100, faction: 'red', category: 'worker', state: 'idle' },
    { id: 'soldier', x: 0.5, z: 0, hp: 100, faction: 'blue', category: 'melee', state: 'idle' },
    { id: 'carrying', x: 1, z: 0, hp: 100, faction: 'blue', category: 'worker', state: 'idle', hasCarriedResource: true },
  ];
  assert.equal(
    selectConstructionHandoffWorker(candidates, { x: 0, z: 0, faction: 'blue' }),
    3,
  );
  assert.equal(
    selectConstructionHandoffWorker(
      candidates,
      { x: 0, z: 0, faction: 'blue' },
      new Set(['near-idle']),
    ),
    2,
  );
});

test('blocked construction handoff safely declines when all idle workers are excluded or invalid', () => {
  const candidates = [
    { id: 'dead', x: 1, z: 0, hp: 0, faction: 'blue', category: 'worker', state: 'idle' },
    { id: 'garrisoned', x: 2, z: 0, hp: 100, faction: 'blue', category: 'worker', state: 'idle', garrisonedInBuildingId: 'tc' },
    { id: 'reserved', x: 3, z: 0, hp: 100, faction: 'blue', category: 'worker', state: 'idle', fieldAssemblyProjectId: 'ram' },
    { id: 'retrying', x: 4, z: 0, hp: 100, faction: 'blue', category: 'worker', state: 'idle' },
  ];
  assert.equal(
    selectConstructionHandoffWorker(
      candidates,
      { x: 0, z: 0, faction: 'blue' },
      new Set(['retrying']),
    ),
    -1,
  );
});

test('construction work-ring selection keeps the nearest slot when no worker occupies the ring', () => {
  const selected = selectConstructionApproachCandidateIndex(
    { x: 2.3, z: 0.1 },
    { x: 0, z: 0 },
    2.4,
    0,
    [],
  );

  assert.equal(selected, 0);
});

test('construction work-ring selection is deterministic and tolerates invalid slot counts', () => {
  const input = [
    { x: 1, z: 0 },
    { x: 0, z: 0 },
    2,
    0,
    [{ x: 2.4, z: 0 }],
    0,
  ] as const;
  const first = selectConstructionApproachCandidateIndex(
    input[0],
    input[1],
    input[2],
    input[3],
    input[4],
    input[5],
  );
  const second = selectConstructionApproachCandidateIndex(
    input[0],
    input[1],
    input[2],
    input[3],
    input[4],
    input[5],
  );

  assert.equal(first, second);
  assert.ok(first >= 0 && first < CONSTRUCTION_APPROACH_DIRECTION_COUNT);
});
