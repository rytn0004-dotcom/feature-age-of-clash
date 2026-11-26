import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findNearestRepairableWall,
  findNearestWallEndpoint,
  isWallChainPointTooClose,
  planWallChainExtension,
  WallEndpointIndex,
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
  assert.ok(Math.abs(snap.point.x - 4.05) < 1e-9);
  assert.equal(snap.point.z, 0);
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


test('extending a wall from its end preserves chain identity and appends indices', () => {
  const walls = [
    makeWall('wall-0', 0, { wallChainIndex: 0, wallChainSize: 2 }),
    makeWall('wall-1', 2.7, { wallChainIndex: 1, wallChainSize: 2 }),
  ];
  const snap = findNearestWallEndpoint({ x: 4.05, z: 0 }, walls);
  assert.ok(snap);

  const plan = planWallChainExtension(walls, snap, 2, 'start', 'fallback');
  assert.ok(plan);
  assert.equal(plan.chainId, 'chain-a');
  assert.equal(plan.totalSize, 4);
  assert.deepEqual(plan.existingAssignments.map(({ wall, index }) => [wall.id, index]), [
    ['wall-0', 0],
    ['wall-1', 1],
  ]);
  assert.deepEqual(plan.newIndices, [2, 3]);
});

test('starting from the old chain start reverses existing indices before extending', () => {
  const walls = [
    makeWall('wall-0', 0, { wallChainIndex: 0, wallChainSize: 2 }),
    makeWall('wall-1', 2.7, { wallChainIndex: 1, wallChainSize: 2 }),
  ];
  const snap = findNearestWallEndpoint({ x: -1.35, z: 0 }, walls);
  assert.ok(snap);

  const plan = planWallChainExtension(walls, snap, 2, 'start', 'fallback');
  assert.ok(plan);
  assert.deepEqual(plan.existingAssignments.map(({ wall, index }) => [wall.id, index]), [
    ['wall-1', 0],
    ['wall-0', 1],
  ]);
  assert.deepEqual(plan.newIndices, [2, 3]);
});

test('ending at an old chain start prepends new segment indices', () => {
  const walls = [
    makeWall('wall-0', 0, { wallChainIndex: 0, wallChainSize: 2 }),
    makeWall('wall-1', 2.7, { wallChainIndex: 1, wallChainSize: 2 }),
  ];
  const snap = findNearestWallEndpoint({ x: -1.35, z: 0 }, walls);
  assert.ok(snap);

  const plan = planWallChainExtension(walls, snap, 2, 'end', 'fallback');
  assert.ok(plan);
  assert.deepEqual(plan.newIndices, [0, 1]);
  assert.deepEqual(plan.existingAssignments.map(({ wall, index }) => [wall.id, index]), [
    ['wall-0', 2],
    ['wall-1', 3],
  ]);
});

test('ending at an old chain end reverses the old chain after the new pieces', () => {
  const walls = [
    makeWall('wall-0', 0, { wallChainIndex: 0, wallChainSize: 2 }),
    makeWall('wall-1', 2.7, { wallChainIndex: 1, wallChainSize: 2 }),
  ];
  const snap = findNearestWallEndpoint({ x: 4.05, z: 0 }, walls);
  assert.ok(snap);

  const plan = planWallChainExtension(walls, snap, 1, 'end', 'fallback');
  assert.ok(plan);
  assert.deepEqual(plan.newIndices, [0]);
  assert.deepEqual(plan.existingAssignments.map(({ wall, index }) => [wall.id, index]), [
    ['wall-1', 1],
    ['wall-0', 2],
  ]);
});

test('chain extension refuses to renumber chains with destroyed gaps', () => {
  const walls = [
    makeWall('wall-0', 0, { wallChainIndex: 0, wallChainSize: 3 }),
    makeWall('wall-2', 5.4, { wallChainIndex: 2, wallChainSize: 3 }),
  ];
  const snap = findNearestWallEndpoint({ x: 6.75, z: 0 }, walls);
  assert.ok(snap);
  assert.equal(planWallChainExtension(walls, snap, 1, 'start', 'fallback'), null);
});


test('wall waypoint spacing is checked after endpoint snapping, not against the raw cursor', () => {
  const previous = { x: 0, z: 0 };
  const rawCursor = { x: 1.6, z: 0 };
  const snappedEndpoint = { x: 0.1, z: 0 };

  assert.equal(isWallChainPointTooClose(previous, rawCursor), false);
  assert.equal(isWallChainPointTooClose(previous, snappedEndpoint), true);
  assert.equal(
    isWallChainPointTooClose(previous, { x: 0.75, z: 0 }),
    false,
    'the minimum spacing is inclusive',
  );
});


test('wall endpoint index reuses its built anchors across repeated cursor queries', () => {
  const walls = [
    makeWall('wall-0', 0, { wallChainIndex: 0 }),
    makeWall('wall-1', 2.7, { wallChainIndex: 1 }),
    makeWall('wall-2', 5.4, { wallChainIndex: 2 }),
  ];
  const index = new WallEndpointIndex<WallSnapBuilding>();
  index.rebuild(walls);

  const first = index.findNearest({ x: 6.7, z: 0 });
  const second = index.findNearest({ x: 6.8, z: 0 });

  assert.equal(first?.wall.id, 'wall-2');
  assert.equal(second?.wall.id, 'wall-2');
  assert.equal(index.rebuildCount, 1, 'cursor queries must not rebuild grouping/sorting data');
  assert.equal(index.endpointCount, 2, 'a continuous chain exposes only its two outer endpoints');
});

test('wall endpoint index rebuild exposes both sides of a newly destroyed chain gap', () => {
  const walls = [
    makeWall('wall-0', 0, { wallChainIndex: 0, wallChainSize: 3 }),
    makeWall('wall-1', 2.7, { wallChainIndex: 1, wallChainSize: 3 }),
    makeWall('wall-2', 5.4, { wallChainIndex: 2, wallChainSize: 3 }),
  ];
  const index = new WallEndpointIndex<WallSnapBuilding>();
  index.rebuild(walls);
  assert.equal(index.endpointCount, 2);

  walls[1].hp = 0;
  index.rebuild([walls[0], walls[2]]);

  const leftGap = index.findNearest({ x: 1.4, z: 0 });
  const rightGap = index.findNearest({ x: 4.1, z: 0 });
  assert.equal(leftGap?.wall.id, 'wall-0');
  assert.equal(leftGap?.side, 'end');
  assert.equal(rightGap?.wall.id, 'wall-2');
  assert.equal(rightGap?.side, 'start');
  assert.equal(index.endpointCount, 4);
});

test('wall endpoint index ignores an endpoint wall that becomes dead between rebuilds', () => {
  const wall = makeWall('wall-0', 0);
  const index = new WallEndpointIndex<WallSnapBuilding>();
  index.rebuild([wall]);

  wall.hp = 0;
  assert.equal(index.findNearest({ x: 1.35, z: 0 }), null);
  assert.equal(index.rebuildCount, 1, 'health checks do not force a full index rebuild');
});


test('wall endpoint spatial index finds candidates across cell boundaries without scanning the full map', () => {
  const walls: WallSnapBuilding[] = [];
  for (let index = 0; index < 160; index++) {
    walls.push(makeWall(`distant-${index}`, index * 9, {
      wallChainId: `distant-chain-${index}`,
      wallChainIndex: 0,
      z: (index % 3) * 11,
    }));
  }
  const boundaryWall = makeWall('boundary-wall', 320, {
    wallChainId: 'boundary-chain',
    wallChainIndex: 0,
    z: 1.5,
  });
  walls.push(boundaryWall);

  const index = new WallEndpointIndex<WallSnapBuilding>();
  index.rebuild(walls);

  const close = index.findNearest({ x: 321.31, z: 1.5 });
  assert.equal(close?.wall.id, 'boundary-wall');
  assert.equal(close?.side, 'end');
  assert.ok((close?.distance ?? Infinity) < 0.05);

  // The query sits in the neighboring spatial cell to the right of the
  // endpoint, but remains within its snap radius.
  const acrossBoundary = index.findNearest({ x: 322.95, z: 1.5 });
  assert.equal(acrossBoundary?.wall.id, 'boundary-wall');
  assert.equal(acrossBoundary?.side, 'end');
  assert.ok(Math.abs((acrossBoundary?.distance ?? 0) - 1.6) < 1e-9);
  assert.equal(index.rebuildCount, 1);
  assert.equal(index.endpointCount, (160 + 1) * 2);
});

test('wall endpoint spatial index preserves original insertion order for equal-distance snaps', () => {
  const first = makeWall('first-equal', 0, {
    wallChainId: 'first-equal-chain',
    wallChainIndex: 0,
  });
  const second = makeWall('second-equal', 2.7, {
    wallChainId: 'second-equal-chain',
    wallChainIndex: 0,
  });
  const index = new WallEndpointIndex<WallSnapBuilding>();
  index.rebuild([first, second]);

  const snap = index.findNearest({ x: 1.35, z: 0 });
  assert.equal(snap?.wall.id, 'first-equal');
});
