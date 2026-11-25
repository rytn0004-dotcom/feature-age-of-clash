import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getAffordableWallSegmentCount,
  getWallSegmentPreviewStatus,
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
