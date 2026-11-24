import assert from 'node:assert/strict';
import test from 'node:test';
import { findPath, type NavGrid } from './pathfinding';

function createGrid(dim: number, blocked: Uint8Array): NavGrid {
  return { cellSize: 1, dim, halfExtent: dim / 2, blocked };
}

test('findPath reports disconnected regions instead of returning a straight-line fallback', () => {
  const dim = 9;
  const blocked = new Uint8Array(dim * dim);
  for (let gz = 0; gz < dim; gz++) blocked[gz * dim + 4] = 1;
  const grid = createGrid(dim, blocked);

  const route = findPath(-2, 0, 2, 0, grid);
  assert.deepEqual(route, []);
});

test('findPath still routes around a wall with an open end', () => {
  const dim = 9;
  const blocked = new Uint8Array(dim * dim);
  for (let gz = 1; gz < dim - 1; gz++) blocked[gz * dim + 4] = 1;
  const grid = createGrid(dim, blocked);

  const route = findPath(-2, 0, 2, 0, grid);
  assert.ok(route.length > 0);
  assert.ok(route.some((point) => point.z < -3 || point.z > 3) || route.length > 1);
});
