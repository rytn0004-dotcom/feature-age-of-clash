import assert from 'node:assert/strict';
import test from 'node:test';
import { CONSTRUCTION_APPROACH_DIRECTION_COUNT, getConstructionApproachPoint } from './constructionApproach';

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
