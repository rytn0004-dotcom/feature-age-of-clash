import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CONSTRUCTION_APPROACH_DIRECTION_COUNT,
  assignWorkersToConstructionTargets,
  accumulateActiveConstructionWorkerCount,
  getConstructionApproachPoint,
  isActiveConstructionWorkerWithinReach,
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
