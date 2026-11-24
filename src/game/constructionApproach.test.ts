import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CONSTRUCTION_APPROACH_DIRECTION_COUNT,
  assignWorkersToConstructionTargets,
  getConstructionApproachPoint,
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
