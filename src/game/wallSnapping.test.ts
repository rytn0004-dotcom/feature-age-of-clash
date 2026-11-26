import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findNearestRepairableWall,
  findNearestWallEndpoint,
  isWallChainPointTooClose,
  planWallChainExtension,
  WallEndpointIndex,
  WallRepairIndex,
  WALL_ENDPOINT_SNAP_RADIUS,
} from './wallSnapping';
import type { WallSnapBuilding } from './wallSnapping';
import { WALL_MODEL_HALF_WIDTH } from './wallPlacement';
import { layoutWallChain } from './rules';
import { isWallChainPreviewObstructed } from './collision';
import type { BuildingEntity } from '../types/game';

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

test('wall snapping targets both side-face midpoints and builds a clean 90-degree branch', () => {
  const wall = makeWall('wall-midpoint', 0);
  const positive = findNearestWallEndpoint(
    { x: 0.08, z: WALL_MODEL_HALF_WIDTH + 0.12 },
    [wall],
  );

  assert.ok(positive);
  assert.equal(positive.wall.id, wall.id);
  assert.equal(positive.side, 'side-positive');
  assert.ok(Math.abs(positive.point.x) < 1e-9);
  assert.ok(Math.abs(positive.point.z - WALL_MODEL_HALF_WIDTH) < 1e-9);
  assert.ok(positive.distance < WALL_ENDPOINT_SNAP_RADIUS);

  const negative = findNearestWallEndpoint(
    { x: -0.08, z: -WALL_MODEL_HALF_WIDTH - 0.12 },
    [wall],
  );
  assert.ok(negative);
  assert.equal(negative.side, 'side-negative');
  assert.ok(Math.abs(negative.point.x) < 1e-9);
  assert.ok(Math.abs(negative.point.z + WALL_MODEL_HALF_WIDTH) < 1e-9);

  // A side branch is a new chain, not a renumbering of the parent wall chain.
  assert.equal(planWallChainExtension([wall], positive, 1, 'start', 'branch-chain'), null);

  // The first module is laid perpendicular to the existing horizontal wall.
  // Its rear edge reaches past the side anchor, so the two wall meshes meet.
  const bendEnd = { x: positive.point.x, z: positive.point.z + 5.4 };
  const placements = layoutWallChain([positive.point, bendEnd]);
  assert.equal(placements.length, 2);
  assert.ok(Math.abs(placements[0].rotationY + Math.PI / 2) < 1e-9);
  assert.ok(Math.abs(placements[0].x - positive.point.x) < 1e-9);
  assert.ok(Math.abs((placements[0].z - 1.5) - (positive.point.z - 0.15)) < 1e-9);
  assert.ok(
    placements[0].z - 1.5 <= positive.point.z,
    'the first perpendicular module must touch/overlap the existing wall side rather than leave a gap',
  );

  const collisionWall = {
    id: wall.id,
    x: wall.x,
    z: wall.z,
    rotationY: wall.rotationY,
    hp: wall.hp,
    buildingDef: { isWall: true, size: 1.6 },
  } as unknown as BuildingEntity;
  assert.equal(
    isWallChainPreviewObstructed(
      placements,
      1.6,
      [collisionWall],
      [],
      [],
      [],
      [],
      [positive.point, bendEnd],
      [],
    ),
    true,
    'the exact checker sees the physical junction overlap when the side anchor is not connected',
  );
  assert.equal(
    isWallChainPreviewObstructed(
      placements,
      1.6,
      [collisionWall],
      [],
      [],
      [],
      [],
      [positive.point, bendEnd],
      [wall.id],
    ),
    false,
    'the exact checker permits the 90-degree branch when its snapped parent wall is explicitly connected',
  );

  const index = new WallEndpointIndex<WallSnapBuilding>();
  index.rebuild([wall]);
  assert.equal(index.endpointCount, 2, 'the chain still exposes only its two outer endpoints');
  assert.equal(index.sideAnchorCount, 2, 'one wall segment exposes both long-side midpoints');
  assert.equal(index.findNearest({ x: 0, z: WALL_MODEL_HALF_WIDTH })?.side, 'side-positive');
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


test('repair snapping can scan the full building roster while excluding other factions and non-walls', () => {
  const enemyDamaged = makeWall('enemy-damaged', 0.1, {
    faction: 'enemy',
    hp: 80,
  });
  const ownNonWall = makeWall('own-non-wall', 0.2, {
    faction: 'player',
    buildingDef: { isWall: false },
    hp: 60,
  });
  const ownHealthy = makeWall('own-healthy', 0.3, {
    faction: 'player',
    hp: 500,
  });
  const ownDamaged = makeWall('own-damaged', 1, {
    faction: 'player',
    hp: 120,
  });
  const buildingRoster = [enemyDamaged, ownNonWall, ownHealthy, ownDamaged];

  assert.equal(
    findNearestRepairableWall({ x: 0, z: 0 }, buildingRoster, undefined, 'player')?.id,
    'own-damaged',
  );
  assert.equal(
    findNearestRepairableWall({ x: 0, z: 0 }, buildingRoster, undefined, 'enemy')?.id,
    'enemy-damaged',
  );
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
    z: 50,
  });
  walls.push(boundaryWall);

  const index = new WallEndpointIndex<WallSnapBuilding>();
  index.rebuild(walls);

  const close = index.findNearest({ x: 321.31, z: 50 });
  assert.equal(close?.wall.id, 'boundary-wall');
  assert.equal(close?.side, 'end');
  assert.ok((close?.distance ?? Infinity) < 0.05);

  // The query sits in the neighboring spatial cell to the right of the
  // endpoint, but remains within its snap radius and away from distractors.
  const acrossBoundary = index.findNearest({ x: 322.95, z: 50 });
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


test('wall extension: Shift-queued unfinished segments remain one extendable chain', () => {
  const first = makeWall('queued-first', 0, {
    faction: 'player',
    isConstructed: false,
    wallChainId: 'queued-chain',
    wallChainIndex: 0,
    wallChainSize: 1,
  });
  const snap = {
    point: { x: 1, z: 0 },
    wall: first,
    distance: 0,
    side: 'end' as const,
  };

  const plan = planWallChainExtension([first], snap, 2, 'start', 'fallback');
  assert.ok(plan);
  assert.equal(plan.chainId, 'queued-chain');
  assert.equal(plan.totalSize, 3);
  assert.deepEqual(plan.newIndices, [1, 2]);
  assert.deepEqual(plan.existingAssignments.map((entry) => entry.index), [0]);
});


test('repair spatial index queries nearby buckets and observes live damage state without rebuilding', () => {
  const healthy = makeWall('healthy', 0.15, { faction: 'player' });
  const damaged = makeWall('damaged', 0.7, { faction: 'player', hp: 120 });
  const enemyDamaged = makeWall('enemy-damaged', 0.05, { faction: 'enemy', hp: 60 });
  const distant = makeWall('distant', 100, { faction: 'player', hp: 80 });
  const unfinished = makeWall('unfinished', 0.1, {
    faction: 'player',
    isConstructed: false,
    hp: 40,
  });
  const nonWall = makeWall('non-wall', 0.1, {
    faction: 'player',
    buildingDef: { isWall: false },
    hp: 40,
  });

  const index = new WallRepairIndex<WallSnapBuilding>();
  index.rebuild([healthy, damaged, enemyDamaged, distant, unfinished, nonWall]);

  assert.equal(index.indexedWallCount, 4, 'only live constructed walls enter the spatial buckets');
  assert.equal(index.findNearest({ x: 0, z: 0 }, undefined, 'player')?.id, 'damaged');
  assert.equal(index.findNearest({ x: 0, z: 0 }, undefined, 'enemy')?.id, 'enemy-damaged');

  damaged.hp = damaged.maxHp;
  assert.equal(
    index.findNearest({ x: 0, z: 0 }, undefined, 'player'),
    null,
    'a repaired wall is filtered using its current HP without rebuilding',
  );

  healthy.wallBreached = true;
  assert.equal(
    index.findNearest({ x: 0, z: 0 }, undefined, 'player')?.id,
    'healthy',
    'a newly breached wall becomes eligible through its live state',
  );
  assert.equal(index.rebuildCount, 1, 'pointer queries reuse the same index');
});

test('repair spatial index preserves roster order for equal-distance targets and rejects invalid queries', () => {
  const first = makeWall('first', -1, { faction: 'player', hp: 100 });
  const second = makeWall('second', 1, { faction: 'player', hp: 100 });
  const index = new WallRepairIndex<WallSnapBuilding>();
  index.rebuild([first, second]);

  assert.equal(index.findNearest({ x: 0, z: 0 }, undefined, 'player')?.id, 'second');
  assert.equal(index.findNearest({ x: Number.NaN, z: 0 }, undefined, 'player'), null);
  assert.equal(index.findNearest({ x: 0, z: 0 }, Number.NaN, 'player'), null);
  assert.equal(index.findNearest({ x: 0, z: 0 }, -1, 'player'), null);
});


test('wall side-midpoint snapping follows all four parent-wall orientations', () => {
  const cases = [
    { yaw: 0, positive: { x: 0, z: WALL_MODEL_HALF_WIDTH }, negative: { x: 0, z: -WALL_MODEL_HALF_WIDTH } },
    { yaw: Math.PI / 2, positive: { x: WALL_MODEL_HALF_WIDTH, z: 0 }, negative: { x: -WALL_MODEL_HALF_WIDTH, z: 0 } },
    { yaw: Math.PI, positive: { x: 0, z: -WALL_MODEL_HALF_WIDTH }, negative: { x: 0, z: WALL_MODEL_HALF_WIDTH } },
    { yaw: -Math.PI / 2, positive: { x: -WALL_MODEL_HALF_WIDTH, z: 0 }, negative: { x: WALL_MODEL_HALF_WIDTH, z: 0 } },
  ];

  for (const [index, orientation] of cases.entries()) {
    const wall = makeWall(`rotated-${index}`, 12, {
      z: -7,
      rotationY: orientation.yaw,
      wallChainId: `rotated-chain-${index}`,
    });
    for (const [side, expected] of [
      ['side-positive', orientation.positive],
      ['side-negative', orientation.negative],
    ] as const) {
      const snap = findNearestWallEndpoint({
        x: wall.x + expected.x + 0.08,
        z: wall.z + expected.z - 0.08,
      }, [wall]);
      assert.ok(snap, `orientation ${orientation.yaw} should expose ${side}`);
      assert.equal(snap.side, side);
      assert.equal(snap.wall.id, wall.id);
      assert.ok(Math.abs(snap.point.x - (wall.x + expected.x)) < 1e-9);
      assert.ok(Math.abs(snap.point.z - (wall.z + expected.z)) < 1e-9);
    }
  }
});

test('every segment in a continuous wall run exposes side branches without exposing internal end seams', () => {
  const walls = Array.from({ length: 5 }, (_, index) => makeWall(`run-${index}`, index * 2.7, {
    wallChainId: 'long-run',
    wallChainIndex: index,
    wallChainSize: 5,
  }));
  const index = new WallEndpointIndex<WallSnapBuilding>();
  index.rebuild(walls);

  assert.equal(index.endpointCount, 2);
  assert.equal(index.sideAnchorCount, 10);
  for (let segment = 0; segment < walls.length; segment++) {
    const snap = index.findNearest({
      x: walls[segment].x + 0.02,
      z: WALL_MODEL_HALF_WIDTH + 0.02,
    });
    assert.ok(snap, `segment ${segment} should be a valid branch point`);
    assert.equal(snap.side, 'side-positive');
    assert.equal(snap.wall.id, walls[segment].id);
  }

  assert.equal(
    index.findNearest({ x: 1.35, z: 0 }),
    null,
    'the same continuous run must not attract snaps at internal end seams',
  );
});
