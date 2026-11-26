import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CONSTRUCTION_APPROACH_DIRECTION_COUNT,
  CONSTRUCTION_HANDOFF_FAILURE_COOLDOWN_SECONDS,
  getActiveConstructionHandoffFailureIds,
  recordConstructionHandoffFailure,
  assignWorkersToConstructionTargets,
  accumulateActiveConstructionWorkerCount,
  getConstructionApproachPoint,
  writeConstructionApproachPoint,
  isActiveConstructionWorkerWithinReach,
  shouldDeferBlockedWallConstructionTarget,
  deferBlockedWallConstructionCommand,
  selectConstructionApproachCandidateIndex,
  selectConstructionHandoffWorker,
  ConstructionApproachSpatialIndex,
} from './constructionApproach';

test('construction handoff failures cool down, expire, and allow a fresh route attempt', () => {
  const retryAtByWorkerId = new Map<string, number>([
    ['previously-blocked', 30],
    ['cooldown-finished', 9],
    ['invalid-deadline', Number.NaN],
  ]);

  assert.equal(CONSTRUCTION_HANDOFF_FAILURE_COOLDOWN_SECONDS, 30);
  assert.deepEqual([...getActiveConstructionHandoffFailureIds(retryAtByWorkerId, 10)], [
    'previously-blocked',
  ]);
  assert.equal(retryAtByWorkerId.has('cooldown-finished'), false);
  assert.equal(retryAtByWorkerId.has('invalid-deadline'), false);
  assert.deepEqual([...getActiveConstructionHandoffFailureIds(retryAtByWorkerId, 30)], []);

  retryAtByWorkerId.set('safe-on-invalid-clock', 60);
  assert.deepEqual([...getActiveConstructionHandoffFailureIds(retryAtByWorkerId, Number.NaN)], [
    'safe-on-invalid-clock',
  ]);
});

test('active handoff failure IDs reuse and clear a caller-owned set', () => {
  const retryAtByWorkerId = new Map<string, number>([
    ['still-blocked', 40],
    ['expired', 9],
    ['invalid-deadline', Number.NaN],
  ]);
  const scratch = new Set<string>(['stale-entry']);

  const active = getActiveConstructionHandoffFailureIds(retryAtByWorkerId, 10, scratch);

  assert.equal(active, scratch, 'the caller-owned Set is reused');
  assert.deepEqual([...active], ['still-blocked']);
  assert.equal(retryAtByWorkerId.has('expired'), false);
  assert.equal(retryAtByWorkerId.has('invalid-deadline'), false);

  retryAtByWorkerId.set('invalid-clock', 60);
  const invalidClock = getActiveConstructionHandoffFailureIds(
    retryAtByWorkerId,
    Number.NaN,
    scratch,
  );
  assert.equal(invalidClock, scratch);
  assert.deepEqual([...invalidClock], ['still-blocked', 'invalid-clock']);
});

test('repeated blocked-route polls do not extend a worker cooldown indefinitely', () => {
  const retryAtByWorkerId = new Map<string, number>();
  recordConstructionHandoffFailure(retryAtByWorkerId, 'worker-a', 5);
  assert.equal(retryAtByWorkerId.get('worker-a'), 35);

  recordConstructionHandoffFailure(retryAtByWorkerId, 'worker-a', 20);
  assert.equal(retryAtByWorkerId.get('worker-a'), 35, 'an active cooldown keeps its original deadline');
  assert.deepEqual([...getActiveConstructionHandoffFailureIds(retryAtByWorkerId, 34.99)], ['worker-a']);

  recordConstructionHandoffFailure(retryAtByWorkerId, 'worker-a', 35);
  assert.equal(retryAtByWorkerId.get('worker-a'), 65, 'a fresh failure after expiry starts a new cooldown');
});

test('construction approach point writer reuses caller-owned storage', () => {
  const output = { x: 99, z: 99 };
  const first = writeConstructionApproachPoint(
    { x: 4, z: -3 },
    2,
    Math.PI / 4,
    0,
    8,
    output,
  );
  assert.equal(first, output);
  assert.ok(Math.abs(output.x - (4 + Math.SQRT2)) < 1e-9);
  assert.ok(Math.abs(output.z - (-3 + Math.SQRT2)) < 1e-9);

  const second = writeConstructionApproachPoint(
    { x: 4, z: -3 },
    2,
    Math.PI / 4,
    1,
    8,
    output,
  );
  assert.equal(second, output);
  assert.notEqual(output.x, 4 + Math.SQRT2);
});

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
test('construction assignment minimizes actual Euclidean travel, not squared distance', () => {
  const workers = [{ x: 0, z: 0 }, { x: 0, z: 1 }];
  const targets = [{ x: 0, z: 1 }, { x: 1, z: 2 }];

  // Crossing assignment totals sqrt(5) + 0, while direct assignment totals
  // 1 + sqrt(2). Squared-distance matching incorrectly prefers the direct pair.
  assert.deepEqual(assignWorkersToConstructionTargets(workers, targets), [1, 0]);
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

test('blocked construction handoff never steals idle workers with an existing intent', () => {
  const candidates = [
    { id: 'move-target', x: 0.5, z: 0, hp: 100, faction: 'blue', category: 'worker', state: 'idle', targetX: 0.5 },
    { id: 'attack-move', x: 0.6, z: 0, hp: 100, faction: 'blue', category: 'worker', state: 'idle', attackMoveGoal: { x: 20, z: 0 } },
    { id: 'formation', x: 0.7, z: 0, hp: 100, faction: 'blue', category: 'worker', state: 'idle', formationGroupId: 'workers-east' },
    { id: 'path-pending', x: 0.8, z: 0, hp: 100, faction: 'blue', category: 'worker', state: 'idle', waypoints: [{ x: 5, z: 0 }] },
    { id: 'queued-gather', x: 0.9, z: 0, hp: 100, faction: 'blue', category: 'worker', state: 'idle', commandQueue: [{ type: 'move' }] },
    { id: 'safe-idle', x: 3, z: 0, hp: 100, faction: 'blue', category: 'worker', state: 'idle' },
  ];

  assert.equal(
    selectConstructionHandoffWorker(candidates, { x: 0, z: 0, faction: 'blue' }),
    5,
    'workers with an existing movement, formation, path, or queued intent must remain untouched',
  );
});

test('blocked construction handoff chooses the nearest eligible worker inside the proven search radius', () => {
  const candidates = [
    { id: 'outside-nearby-ring', x: 12, z: 0, hp: 100, faction: 'blue', category: 'worker', state: 'idle' },
    { id: 'inside-ring', x: 7, z: 0, hp: 100, faction: 'blue', category: 'worker', state: 'idle' },
    { id: 'closer-but-over-radius', x: 20, z: 0, hp: 100, faction: 'blue', category: 'worker', state: 'idle' },
  ];

  assert.equal(
    selectConstructionHandoffWorker(candidates, { x: 0, z: 0, faction: 'blue' }, new Set(), 8),
    1,
  );
  assert.equal(
    selectConstructionHandoffWorker(candidates, { x: 0, z: 0, faction: 'blue' }, new Set(), 6),
    -1,
  );
  assert.equal(
    selectConstructionHandoffWorker(candidates, { x: 0, z: 0, faction: 'blue' }, new Set(), Number.NaN),
    -1,
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


test('construction approach spatial index only returns nearby planned work slots', () => {
  const index = new ConstructionApproachSpatialIndex<{ id: string; x: number; z: number }>();
  const items = [
    { id: 'near-west', x: -0.5, z: 0 },
    { id: 'near-east', x: 8.1, z: 0 },
    { id: 'far-east', x: 42, z: 0 },
    { id: 'near-north', x: 0, z: 7.9 },
    { id: 'invalid', x: Number.NaN, z: 1 },
  ];
  index.beginRebuild();
  for (const item of items) index.insert(item);

  const output: typeof items = [{ id: 'stale', x: 0, z: 0 }];
  const first = index.collect(0, 0, 9, output);
  assert.equal(first, output, 'caller-owned output is reused');
  assert.deepEqual(
    new Set(first.map((item) => item.id)),
    new Set(['near-west', 'near-east', 'near-north']),
  );
  assert.equal(index.size, 4, 'invalid coordinates are not indexed');

  const second = index.collect(40, 0, 4, output);
  assert.equal(second, output);
  assert.deepEqual(second.map((item) => item.id), ['far-east']);
});

test('construction approach spatial index rebuild drops stale buckets and supports packed-key boundaries', () => {
  const index = new ConstructionApproachSpatialIndex<{ id: string; x: number; z: number }>();
  const previous = { id: 'previous', x: 0, z: 0 };
  const replacement = { id: 'replacement', x: 262144, z: -262144 };
  index.beginRebuild();
  index.insert(previous);
  index.beginRebuild();
  index.insert(replacement);
  assert.equal(index.size, 1);

  const output: typeof previous[] = [];
  assert.deepEqual(index.collect(0, 0, 1, output), []);
  assert.deepEqual(index.collect(262144, -262144, 1, output).map((item) => item.id), ['replacement']);
});


test('construction approach query radius covers every reservation that can affect a ring candidate without scanning distant cells', () => {
  const index = new ConstructionApproachSpatialIndex<{ id: string; x: number; z: number }>();
  const candidateRadius = 5.25;
  const preferredSpacing = 1.35;
  const angle = Math.PI / 4;
  const candidate = { x: Math.cos(angle) * candidateRadius, z: Math.sin(angle) * candidateRadius };
  const insideBoundary = {
    id: 'inside-boundary',
    x: candidate.x + Math.cos(angle) * (preferredSpacing - 0.01),
    z: candidate.z + Math.sin(angle) * (preferredSpacing - 0.01),
  };
  const outsideInfluence = {
    id: 'outside-influence',
    x: candidate.x + Math.cos(angle) * (preferredSpacing + 0.01),
    z: candidate.z + Math.sin(angle) * (preferredSpacing + 0.01),
  };
  const farAway = { id: 'far-away', x: 40, z: 40 };
  index.beginRebuild();
  index.insert(insideBoundary);
  index.insert(outsideInfluence);
  index.insert(farAway);

  const output: typeof insideBoundary[] = [];
  const possibleInfluenceRadius = candidateRadius + preferredSpacing;
  const nearbyIds = index.collect(0, 0, possibleInfluenceRadius, output).map((item) => item.id);

  assert.ok(nearbyIds.includes('inside-boundary'), 'triangle-inequality broad phase must not miss a reservation that can affect a candidate');
  assert.ok(!nearbyIds.includes('far-away'), 'local reservation lookup must not scan distant spatial buckets');
  assert.ok(
    Math.hypot(insideBoundary.x - candidate.x, insideBoundary.z - candidate.z) < preferredSpacing,
    'the inside reservation can affect the candidate score',
  );
  assert.ok(
    Math.hypot(outsideInfluence.x - candidate.x, outsideInfluence.z - candidate.z) > preferredSpacing,
    'the just-outside reservation must not affect the exact candidate score',
  );
  assert.ok(
    Math.hypot(insideBoundary.x, insideBoundary.z) < possibleInfluenceRadius,
    'the triangle-inequality boundary includes every potentially influential reservation',
  );

  const scoreWithoutOutsideInfluence = selectConstructionApproachCandidateIndex(
    candidate,
    { x: 0, z: 0 },
    candidateRadius,
    angle,
    [insideBoundary],
  );
  const scoreWithOutsideInfluence = selectConstructionApproachCandidateIndex(
    candidate,
    { x: 0, z: 0 },
    candidateRadius,
    angle,
    [insideBoundary, outsideInfluence],
  );
  assert.equal(
    scoreWithOutsideInfluence,
    scoreWithoutOutsideInfluence,
    'the exact spacing narrow phase ignores a conservative broad-phase false positive',
  );
});


test('construction approach spatial index moves and removes an existing reservation without duplicates', () => {
  const index = new ConstructionApproachSpatialIndex<{ id: string; x: number; z: number }>();
  const worker = { id: 'worker-a', x: 1, z: 1 };
  const neighbor = { id: 'worker-b', x: 2, z: 2 };
  index.beginRebuild();
  index.insert(worker);
  index.insert(neighbor);
  assert.equal(index.size, 2);

  index.upsert(worker, 24, 24);
  assert.equal(index.size, 2, 'moving an item does not increase the reservation count');
  const output: typeof worker[] = [];
  assert.deepEqual(index.collect(1, 1, 2, output).map((item) => item.id), ['worker-b']);
  assert.deepEqual(index.collect(24, 24, 1, output).map((item) => item.id), ['worker-a']);

  assert.equal(index.remove(worker), true);
  assert.equal(index.remove(worker), false, 'removing twice is harmless');
  assert.equal(index.size, 1);
  assert.deepEqual(index.collect(24, 24, 1, output), []);
});
