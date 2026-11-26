import test from 'node:test';
import assert from 'node:assert/strict';
import { WallPlacementSpatialIndex } from './wallPlacementIndex';

interface Item { id: string; x: number; z: number; }

test('wall placement index visits nearby cells but excludes distant entities', () => {
  const index = new WallPlacementSpatialIndex<Item>();
  const nearA = { id: 'near-a', x: 0, z: 0 };
  const nearB = { id: 'near-b', x: 4, z: 0 };
  const far = { id: 'far', x: 60, z: 60 };
  index.rebuild([nearA, nearB, far], () => 1.8);
  const target: Item[] = [];
  assert.equal(index.collect([{ x: 0, z: 0, rotationY: 0 }], target), target);
  assert.deepEqual(new Set(target.map(item => item.id)), new Set(['near-a', 'near-b']));
  assert.equal(index.size, 3);
});

test('wall placement index uses rotated wall bounds in broad phase', () => {
  const index = new WallPlacementSpatialIndex<Item>();
  const nearby = { id: 'nearby', x: 1.2, z: 0 };
  const outside = { id: 'outside', x: 8, z: 0 };
  index.rebuild([nearby, outside], () => 0.7);
  const found = index.collect([{ x: 0, z: 0, rotationY: -Math.PI / 2 }], []);
  assert.ok(found.some(item => item.id === 'nearby'));
  assert.ok(!found.some(item => item.id === 'outside'));
});

test('wall placement index deduplicates entities shared by multiple segments', () => {
  const index = new WallPlacementSpatialIndex<Item>();
  const shared = { id: 'shared', x: 2.5, z: 0 };
  index.rebuild([shared], () => 1);
  const target: Item[] = [];
  index.collect([{ x: 0, z: 0 }, { x: 2.7, z: 0 }, { x: 5.4, z: 0 }], target);
  assert.equal(target.length, 1);
  assert.equal(target[0], shared);
});

test('wall placement index clears stale entries after roster rebuild', () => {
  const index = new WallPlacementSpatialIndex<Item>();
  index.rebuild([{ id: 'old', x: 0, z: 0 }], () => 2);
  const target: Item[] = [];
  index.collect([{ x: 0, z: 0 }], target);
  index.rebuild([{ id: 'new', x: 40, z: 40 }], () => 2);
  index.collect([{ x: 0, z: 0 }], target);
  assert.deepEqual(target, []);
  index.clear();
  assert.equal(index.size, 0);
});


test('wall placement index keeps packed keys collision-free across signed cell boundaries', () => {
  const index = new WallPlacementSpatialIndex<Item>();
  const items = [
    { id: 'negative-limit', x: -262144, z: -262144 },
    { id: 'positive-overflow', x: 262144, z: 262144 },
    { id: 'mixed-overflow', x: 0, z: 262144 },
    { id: 'ordinary-negative', x: -8, z: -8 },
  ];
  index.rebuild(items, () => 0);
  const target: Item[] = [];

  index.collect([{ x: -262144, z: -262144 }], target);
  assert.deepEqual(target.map(item => item.id), ['negative-limit']);

  index.collect([{ x: 262144, z: 262144 }], target);
  assert.deepEqual(target.map(item => item.id), ['positive-overflow']);

  index.collect([{ x: 0, z: 262144 }], target);
  assert.deepEqual(target.map(item => item.id), ['mixed-overflow']);

  index.collect([{ x: -8, z: -8 }], target);
  assert.deepEqual(target.map(item => item.id), ['ordinary-negative']);
});
