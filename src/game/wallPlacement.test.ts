import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getAffordableWallSegmentCount,
  getWallSegmentPreviewStatus,
} from './wallPlacement';
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
