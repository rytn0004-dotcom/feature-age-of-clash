import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clipWallChainPointsToSegmentCount,
  findNearestValidWallStartPoint,
  getAffordableWallSegmentCount,
  getWallSegmentPreviewStatus,
  shouldUseInstancedWallPreview,
  WALL_PREVIEW_DETAILED_SEGMENT_LIMIT,
} from './wallPlacement';
import { layoutWallChain, layoutWallChainSection } from './rules';
import type { Resources } from '../types/game';

const costs: Resources = { food: 0, wood: 25, gold: 0, stone: 10 };

test('wall placement: affordable segment count is bounded by every required resource', () => {
  const balance: Resources = { food: 0, wood: 90, gold: 0, stone: 25 };
  assert.equal(getAffordableWallSegmentCount(balance, costs, 8), 2);
  assert.equal(getAffordableWallSegmentCount({ ...balance, stone: 40 }, costs, 8), 3);
  assert.equal(getAffordableWallSegmentCount({ ...balance, wood: 0 }, costs, 8), 0);
});

test('wall preview: affordable prefix is green and unaffordable suffix is amber', () => {
  assert.equal(getWallSegmentPreviewStatus(0, 5, 2), 'buildable');
  assert.equal(getWallSegmentPreviewStatus(1, 5, 2), 'buildable');
  assert.equal(getWallSegmentPreviewStatus(2, 5, 2), 'unaffordable');
  assert.equal(getWallSegmentPreviewStatus(4, 5, 2), 'unaffordable');
});

test('wall preview: obstruction overrides affordability for the whole active route', () => {
  assert.equal(getWallSegmentPreviewStatus(0, 4, 4, true), 'blocked');
  assert.equal(getWallSegmentPreviewStatus(3, 4, 1, true), 'blocked');
});

test('wall preview: invalid segment indices do not produce a render status', () => {
  assert.equal(getWallSegmentPreviewStatus(-1, 3, 2), null);
  assert.equal(getWallSegmentPreviewStatus(3, 3, 2), null);
  assert.equal(getWallSegmentPreviewStatus(0.5, 3, 2), null);
});

test('wall preview: non-finite affordability safely becomes zero', () => {
  assert.equal(getWallSegmentPreviewStatus(0, 2, Number.NaN), 'unaffordable');
  assert.equal(getWallSegmentPreviewStatus(0, 2, Number.POSITIVE_INFINITY), 'unaffordable');
});

test('wall layout: incrementally laid out fixed sections match the full chain layout', () => {
  const points = [
    { x: -12, z: 4 },
    { x: -2, z: 4 },
    { x: -2, z: 13 },
    { x: 9, z: 13 },
    { x: 14, z: 7 },
  ];
  const incremental = points.slice(1).flatMap((point, index) =>
    layoutWallChainSection(points[index], point, index),
  );

  assert.deepEqual(incremental, layoutWallChain(points));
  assert.ok(incremental.some((placement) => placement.sectionIndex === 0));
  assert.ok(incremental.some((placement) => placement.sectionIndex === 3));
});

test('wall layout: active endpoint section can be recalculated without changing cached sections', () => {
  const fixedPoints = [
    { x: 0, z: 0 },
    { x: 8, z: 0 },
    { x: 8, z: 7 },
  ];
  const fixedSections = fixedPoints.slice(1).flatMap((point, index) =>
    layoutWallChainSection(fixedPoints[index], point, index),
  );
  const fixedSnapshot = structuredClone(fixedSections);

  const firstCursor = { x: 14, z: 7 };
  const secondCursor = { x: 18, z: 11 };
  const firstActive = layoutWallChainSection(fixedPoints[fixedPoints.length - 1], firstCursor, 2);
  const secondActive = layoutWallChainSection(fixedPoints[fixedPoints.length - 1], secondCursor, 2);

  assert.deepEqual(fixedSections, fixedSnapshot);
  assert.deepEqual([...fixedSections, ...firstActive], layoutWallChain([...fixedPoints, firstCursor]));
  assert.deepEqual([...fixedSections, ...secondActive], layoutWallChain([...fixedPoints, secondCursor]));
});

test('wall layout: section helper rejects invalid endpoints and retains the short-section cutoff', () => {
  assert.deepEqual(
    layoutWallChainSection({ x: Number.NaN, z: 0 }, { x: 5, z: 0 }),
    [],
  );
  assert.deepEqual(
    layoutWallChainSection({ x: 0, z: 0 }, { x: 0.7, z: 0 }),
    [],
  );
});

test('wall preview switches to instanced low-detail rendering only after the detail limit', () => {
  assert.equal(shouldUseInstancedWallPreview(WALL_PREVIEW_DETAILED_SEGMENT_LIMIT - 1), false);
  assert.equal(shouldUseInstancedWallPreview(WALL_PREVIEW_DETAILED_SEGMENT_LIMIT), false);
  assert.equal(shouldUseInstancedWallPreview(WALL_PREVIEW_DETAILED_SEGMENT_LIMIT + 1), true);
  assert.equal(shouldUseInstancedWallPreview(120), true);
  assert.equal(shouldUseInstancedWallPreview(Number.NaN), false);
  assert.equal(shouldUseInstancedWallPreview(Number.POSITIVE_INFINITY), false);
});

test('wall layout: active section can reuse the placement array and its records', () => {
  const reusable: ReturnType<typeof layoutWallChainSection> = [];
  const start = { x: 0, z: 0 };
  const first = layoutWallChainSection(start, { x: 12, z: 0 }, 0, undefined, reusable);
  const firstRecord = first[0];

  const second = layoutWallChainSection(start, { x: 18, z: 6 }, 2, undefined, reusable);
  assert.equal(second, reusable, 'the caller-owned array is retained');
  assert.equal(first, second, 'repeated layout returns the same array');
  assert.equal(second.length, 8);
  assert.equal(second[0], firstRecord, 'placement records are mutated in place');
  assert.equal(second[0].x, 18 / 16);
  assert.equal(second[0].z, 6 / 16);
  assert.equal(second[0].sectionIndex, 2);

  const invalid = layoutWallChainSection(start, { x: 0.5, z: 0 }, 3, undefined, reusable);
  assert.equal(invalid, reusable);
  assert.equal(invalid.length, 0, 'invalid input clears stale placements');
});


test('wall start search reuses one candidate object and returns a detached result', () => {
  let candidateReference: { x: number; z: number } | null = null;
  const result = findNearestValidWallStartPoint({ x: 0, z: 0 }, (candidate) => {
    if (!candidateReference) candidateReference = candidate;
    else assert.equal(candidate, candidateReference, 'candidate object must be reused between validations');
    return candidate.x >= 0.39;
  });

  assert.ok(result);
  assert.equal(result.offset, 0.4);
  assert.ok(Math.abs(result.point.x - 0.4) < 1e-9);
  assert.equal(result.point.z, 0);
  assert.notEqual(result.point, candidateReference, 'the returned point must not mutate with later searches');
});

test('wall route clipping stops at the last affordable segment boundary without leaving a gap', () => {
  const clipped = clipWallChainPointsToSegmentCount(
    [{ x: 0, z: 0 }, { x: 10, z: 0 }],
    3,
    1.5,
  );
  assert.equal(clipped.length, 2);
  assert.ok(Math.abs(clipped[1].x - 4.5) < 1e-9);
  assert.equal(clipped[1].z, 0);

  const multiSection = clipWallChainPointsToSegmentCount(
    [{ x: 0, z: 0 }, { x: 6, z: 0 }, { x: 6, z: 6 }],
    6,
    1.5,
  );
  assert.deepEqual(multiSection, [{ x: 0, z: 0 }, { x: 6, z: 0 }, { x: 6, z: 3 }]);
});
