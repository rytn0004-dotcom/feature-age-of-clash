import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findNearestRepairableWall,
  findNearestWallEndpoint,
  WALL_ENDPOINT_SNAP_RADIUS,
} from './wallSnapping';
import type { WallSnapBuilding } from './wallSnapping';

function makeWall(
  id: string,
  x: number,
  options: Partial<WallSnapBuilding> = {},
): WallSnapBuilding {
  return {
    id,
    x,
    z: 0,
    rotationY: 0,
    wallChainId: 'chain-a',
    wallChainIndex: 0,
    hp: 500,
    maxHp: 500,
    isConstructed: true,
    wallBreached: false,
    gateOpen: false,
    buildingDef: { isWall: true },
    ...options,
  };
}

test('wall snapping attaches to the nearest exposed endpoint with exact coordinates', () => {
  const wall = makeWall('wall-0', 0);
  const snap = findNearestWallEndpoint({ x: 1.2, z: 0.4 }, [wall]);

  assert.ok(snap);
  assert.equal(snap.wall.id, 'wall-0');
  assert.equal(snap.side, 'end');
  assert.deepEqual(snap.point, { x: 1.35, z: 0 });
  assert.ok(snap.distance < WALL_ENDPOINT_SNAP_RADIUS);
});

test('wall snapping does not target internal seams of a continuous chain', () => {
  const walls = [
    makeWall('wall-0', 0, { wallChainIndex: 0 }),
    makeWall('wall-1', 2.7, { wallChainIndex: 1 }),
    makeWall('wall-2', 5.4, { wallChainIndex: 2 }),
  ];

  assert.equal(findNearestWallEndpoint({ x: 1.35, z: 0 }, walls), null);
});

test('a destroyed gap exposes the adjacent chain-run endpoints for reconnection', () => {
  const walls = [
    makeWall('wall-0', 0, { wallChainIndex: 0 }),
    makeWall('wall-2', 5.4, { wallChainIndex: 2 }),
  ];
  const snap = findNearestWallEndpoint({ x: 4.1, z: 0 }, walls);

  assert.ok(snap);
  assert.equal(snap.wall.id, 'wall-2');
  assert.equal(snap.side, 'start');
  assert.deepEqual(snap.point, { x: 4.05, z: 0 });
});

test('repair snapping finds a nearby breached wall and ignores healthy or unfinished pieces', () => {
  const healthy = makeWall('healthy', 0, { wallChainIndex: 0 });
  const breached = makeWall('breached', 6, {
    wallChainId: 'chain-b',
    wallChainIndex: 0,
    hp: 120,
    wallBreached: true,
  });
  const unfinished = makeWall('unfinished', 8, {
    wallChainId: 'chain-c',
    isConstructed: false,
    hp: 100,
  });

  assert.equal(findNearestRepairableWall({ x: 6.8, z: 0 }, [healthy, breached, unfinished])?.id, 'breached');
  assert.equal(findNearestRepairableWall({ x: 12, z: 0 }, [breached]), null);
});
