import test from 'node:test';
import assert from 'node:assert/strict';
import type { BuildingEntity, ResourceNode, UnitEntity, UnitCategory } from '../types/game';
import {
  resolveUnitBuildingCollisions,
  resolveUnitResourceCollisions,
  resolveUnitUnitCollisions,
  getUnitColliderRadius,
  getUnitCollisionFirstDisplacementShare,
  createCollisionResolutionScratch,
} from './collision';

function makeUnit(
  id: string,
  x: number,
  z: number,
  options: {
    category?: UnitCategory;
    hp?: number;
    garrisonedInBuildingId?: string;
    state?: string;
    targetResourceNodeId?: string;
    targetBuildingId?: string;
    velocity?: { x: number; z: number };
  } = {},
): UnitEntity {
  return {
    id,
    x,
    z,
    hp: options.hp ?? 100,
    maxHp: 100,
    garrisonedInBuildingId: options.garrisonedInBuildingId,
    state: options.state ?? 'idle',
    targetResourceNodeId: options.targetResourceNodeId,
    targetBuildingId: options.targetBuildingId,
    velocity: options.velocity ?? { x: 0, z: 0 },
    unitDef: {
      category: options.category ?? 'melee',
      visual: { scale: 1 },
    },
  } as unknown as UnitEntity;
}

function makeBuilding(
  id: string,
  x: number,
  z: number,
  buildingType: string = 'tower',
  size = 2.2,
  extra: { gateOpen?: boolean; wallBreached?: boolean } = {},
): BuildingEntity {
  return {
    id,
    x,
    z,
    hp: 500,
    buildingType,
    buildingDef: { size, isWall: buildingType === 'wall' },
    gateOpen: extra.gateOpen ?? false,
    wallBreached: extra.wallBreached ?? false,
  } as unknown as BuildingEntity;
}

function makeResource(
  id: string,
  x: number,
  z: number,
  resourceType: string = 'wood',
  subtype?: ResourceNode['subtype'],
): ResourceNode {
  return {
    id,
    x,
    z,
    amount: 100,
    resourceType,
    subtype,
  } as ResourceNode;
}

test('collision broad phase: overlapping units are pushed apart and distant units stay untouched', () => {
  const first = makeUnit('first', 0, 0);
  const second = makeUnit('second', 0.2, 0);
  const distant = makeUnit('distant', 40, 40);
  const distantStart = { x: distant.x, z: distant.z };

  resolveUnitUnitCollisions([first, second, distant]);

  assert.ok(first.x < 0);
  assert.ok(second.x > 0);
  assert.ok(first.x !== 0 || first.z !== 0);
  assert.deepEqual({ x: distant.x, z: distant.z }, distantStart);
});

test('collision broad phase: centered overlaps stay deterministic and skip dead or garrisoned units', () => {
  const firstA = makeUnit('a', 0, 0);
  const secondA = makeUnit('b', 0, 0);
  const garrisoned = makeUnit('garrisoned', 0, 0, { garrisonedInBuildingId: 'town-center' });
  const dead = makeUnit('dead', 0, 0, { hp: 0 });
  const firstB = makeUnit('a', 0, 0);
  const secondB = makeUnit('b', 0, 0);

  resolveUnitUnitCollisions([firstA, secondA, garrisoned, dead]);
  resolveUnitUnitCollisions([firstB, secondB]);

  assert.deepEqual(
    { first: [firstA.x, firstA.z], second: [secondA.x, secondA.z] },
    { first: [firstB.x, firstB.z], second: [secondB.x, secondB.z] },
  );
  assert.deepEqual([garrisoned.x, garrisoned.z], [0, 0]);
  assert.deepEqual([dead.x, dead.z], [0, 0]);
});

test('collision broad phase: units are pushed outside solid buildings but gates and breached walls remain passable', () => {
  const trapped = makeUnit('trapped', 0, 0);
  const townCenter = makeBuilding('tc', 0, 0, 'town_center', 5);
  resolveUnitBuildingCollisions([trapped], [townCenter]);
  const requiredDistance = 4.18 + getUnitColliderRadius('melee') + 0.02;
  assert.ok(Math.hypot(trapped.x, trapped.z) >= requiredDistance - 1e-6);

  const gatePasser = makeUnit('gate-passer', 0, 0);
  const breachedPasser = makeUnit('breach-passer', 20, 0);
  resolveUnitBuildingCollisions(
    [gatePasser, breachedPasser],
    [
      makeBuilding('open-gate', 0, 0, 'gate', 2, { gateOpen: true }),
      makeBuilding('breached-wall', 20, 0, 'wall', 1.48, { wallBreached: true }),
    ],
  );
  assert.deepEqual([gatePasser.x, gatePasser.z], [0, 0]);
  assert.deepEqual([breachedPasser.x, breachedPasser.z], [20, 0]);
});

test('collision broad phase: gathering workers keep their resource interaction radius', () => {
  const worker = makeUnit('worker', 0.4, 0, {
    category: 'worker',
    state: 'gathering',
    targetResourceNodeId: 'wood-node',
  });
  resolveUnitResourceCollisions([worker], [makeResource('wood-node', 0, 0)]);
  const expected = 0.72 + getUnitColliderRadius('worker') * 0.45 + 0.02;
  assert.ok(Math.abs(Math.hypot(worker.x, worker.z) - expected) < 1e-6);
});

test('collision broad phase: non-harvesters are kept clear of resource nodes and farm crops stay walkable', () => {
  const soldier = makeUnit('soldier', 0.4, 0, { category: 'melee' });
  const farmWorker = makeUnit('farm-worker', 20, 0, { category: 'worker' });
  resolveUnitResourceCollisions(
    [soldier, farmWorker],
    [
      makeResource('wood-node', 0, 0),
      makeResource('farm-crop', 0, 0, 'food', 'farm'),
    ],
  );
  const expected = 0.72 + getUnitColliderRadius('melee') + 0.02;
  assert.ok(Math.abs(Math.hypot(soldier.x, soldier.z) - expected) < 1e-6);
  assert.deepEqual([farmWorker.x, farmWorker.z], [20, 0]);
});


test('wall preview broad-phase detects terrain, building and resource blockers', async () => {
  const { isWallChainPreviewObstructed } = await import('./collision');
  const placements = [{ x: 0, z: 0 }, { x: 2.7, z: 0 }];

  assert.equal(isWallChainPreviewObstructed(placements, 1.48, [], []), false);
  assert.equal(
    isWallChainPreviewObstructed(
      [{ x: 0, z: 0 }, { x: 2.7, z: 0 }],
      1.48,
      [],
      [],
      [],
      [{ x: 1.35, z: 0, radius: 0.2, kind: 'cliff' } as any],
      [],
      [{ x: 0, z: 0 }, { x: 2.7, z: 0 }],
    ),
    true,
    'terrain blockers between projected wall centres should turn the preview red',
  );
  assert.equal(
    isWallChainPreviewObstructed(
      placements,
      1.48,
      [],
      [],
      [],
      [{ x: 2.7, z: 0, radius: 0.2, kind: 'cliff' } as any],
    ),
    true,
  );
  assert.equal(
    isWallChainPreviewObstructed(
      placements,
      1.48,
      [makeBuilding('blocking-house', 2.7, 0, 'house', 1.65)],
      [],
    ),
    true,
  );
  assert.equal(
    isWallChainPreviewObstructed(
      placements,
      1.48,
      [],
      [{
        id: 'blocking-mine',
        x: 2.7,
        z: 0,
        amount: 100,
        resourceType: 'gold',
      } as unknown as ResourceNode],
    ),
    true,
  );
});

test('wall preview broad-phase ignores destroyed buildings and depleted resource nodes', async () => {
  const { isWallChainPreviewObstructed } = await import('./collision');
  const placement = [{ x: 0, z: 0 }];
  const destroyed = { ...makeBuilding('destroyed', 0, 0), hp: 0 };
  const depleted = {
    id: 'depleted',
    x: 0,
    z: 0,
    amount: 0,
    resourceType: 'gold',
  } as unknown as ResourceNode;

  assert.equal(isWallChainPreviewObstructed(placement, 1.48, [destroyed], [depleted]), false);
});


test('collision priority: stationary builders give way only slightly to moving traffic', () => {
  const builder = makeUnit('builder', 0, 0, {
    category: 'worker',
    state: 'building',
    targetBuildingId: 'wall-segment',
    velocity: { x: 0, z: 0 },
  });
  const passer = makeUnit('passer', 0.2, 0, {
    state: 'moving',
    velocity: { x: -1, z: 0 },
  });

  resolveUnitUnitCollisions([builder, passer]);

  assert.ok(Math.abs(builder.x) < Math.abs(passer.x));
  assert.ok(builder.x > -0.04, 'the builder should absorb only a small part of the correction');
  assert.ok(passer.x > 0.1, 'the moving unit should be moved out of the work position');
});

test('collision priority is independent of unit array order', () => {
  const passer = makeUnit('passer', -0.2, 0, {
    state: 'moving',
    velocity: { x: 1, z: 0 },
  });
  const builder = makeUnit('builder', 0, 0, {
    category: 'worker',
    state: 'building',
    targetBuildingId: 'wall-segment',
    velocity: { x: 0, z: 0 },
  });

  resolveUnitUnitCollisions([passer, builder]);

  assert.ok(Math.abs(builder.x) < Math.abs(passer.x));
  assert.ok(builder.x < 0.04, 'the builder should not be displaced by most of the correction');
  assert.ok(passer.x < -0.1, 'the moving unit should yield regardless of iteration order');
});

test('collision priority: two stationary builders and ordinary units still share correction evenly', () => {
  const firstBuilder = makeUnit('builder-a', 0, 0, {
    category: 'worker',
    state: 'building',
    targetBuildingId: 'wall-a',
    velocity: { x: 0, z: 0 },
  });
  const secondBuilder = makeUnit('builder-b', 0.2, 0, {
    category: 'worker',
    state: 'building',
    targetBuildingId: 'wall-b',
    velocity: { x: 0, z: 0 },
  });
  assert.equal(getUnitCollisionFirstDisplacementShare(firstBuilder, secondBuilder), 0.5);

  const movingA = makeUnit('moving-a', 0, 0, { state: 'moving', velocity: { x: 1, z: 0 } });
  const movingB = makeUnit('moving-b', 0.2, 0, { state: 'moving', velocity: { x: -1, z: 0 } });
  assert.equal(getUnitCollisionFirstDisplacementShare(movingA, movingB), 0.5);
  assert.equal(getUnitCollisionFirstDisplacementShare(firstBuilder, movingB), 0.12);
  assert.equal(getUnitCollisionFirstDisplacementShare(movingA, secondBuilder), 0.88);
});


test('collision scratch: reuses collision maps, entries, buckets and candidate buffers across steps', () => {
  const scratch = createCollisionResolutionScratch();
  const firstUnits = [
    makeUnit('first-a', 0, 0),
    makeUnit('first-b', 0.2, 0),
  ];
  const buildings = [makeBuilding('tower-a', 40, 40)];
  const resources = [makeResource('wood-a', -40, -40)];

  resolveUnitUnitCollisions(firstUnits, 0.52, scratch);
  resolveUnitBuildingCollisions(firstUnits, buildings, scratch);
  resolveUnitResourceCollisions(firstUnits, resources, scratch);

  const unitMap = scratch.unitIndex.buckets;
  const unitEntries = scratch.unitIndex.entries;
  const previousUnitEntries = new Set(scratch.unitIndex.entries.filter(Boolean));
  const previousUnitBuckets = new Set(scratch.unitIndex.buckets.values());
  const unitCandidates = scratch.unitCandidates;
  const buildingMap = scratch.buildingIndex.buckets;
  const buildingEntries = scratch.buildingIndex.entries;
  const buildingBucket = [...scratch.buildingIndex.buckets.values()][0];
  const resourceMap = scratch.resourceIndex.buckets;
  const resourceEntries = scratch.resourceIndex.entries;
  const resourceBucket = [...scratch.resourceIndex.buckets.values()][0];
  const buildingCandidates = scratch.buildingCandidates;
  const resourceCandidates = scratch.resourceCandidates;

  const nextUnits = [makeUnit('next-unit', 64, 64)];
  resolveUnitUnitCollisions(nextUnits, 0.52, scratch);
  resolveUnitBuildingCollisions(nextUnits, [makeBuilding('next-tower', 64, 64)], scratch);
  resolveUnitResourceCollisions(nextUnits, [makeResource('next-wood', 64, 64)], scratch);

  assert.equal(scratch.unitIndex.buckets, unitMap);
  assert.equal(scratch.unitIndex.entries, unitEntries);
  assert.ok(previousUnitEntries.has(scratch.unitIndex.entries[0]!), 'an existing entity entry object should be recycled');
  assert.ok(previousUnitBuckets.has(scratch.unitIndex.buckets.get('8:8')!), 'an existing unit bucket array should be recycled');
  assert.equal(scratch.unitCandidates, unitCandidates);
  assert.deepEqual(scratch.unitIndex.entries.map(entry => entry?.item.id), ['next-unit']);

  assert.equal(scratch.buildingIndex.buckets, buildingMap);
  assert.equal(scratch.buildingIndex.entries, buildingEntries);
  assert.equal([...scratch.buildingIndex.buckets.values()][0], buildingBucket);
  assert.equal(scratch.buildingCandidates, buildingCandidates);
  assert.deepEqual(scratch.buildingIndex.entries.map(entry => entry?.item.id), ['next-tower']);

  assert.equal(scratch.resourceIndex.buckets, resourceMap);
  assert.equal(scratch.resourceIndex.entries, resourceEntries);
  assert.equal([...scratch.resourceIndex.buckets.values()][0], resourceBucket);
  assert.equal(scratch.resourceCandidates, resourceCandidates);
  assert.deepEqual(scratch.resourceIndex.entries.map(entry => entry?.item.id), ['next-wood']);
});

test('collision scratch: clears stale entries and buckets when all entities become inactive', () => {
  const scratch = createCollisionResolutionScratch();
  resolveUnitUnitCollisions([makeUnit('active', 0, 0)], 0.52, scratch);
  resolveUnitUnitCollisions([makeUnit('inactive', 0, 0, { hp: 0 })], 0.52, scratch);
  assert.equal(scratch.unitIndex.entryCount, 0);
  assert.equal(scratch.unitIndex.buckets.size, 0);
  assert.equal(scratch.unitIndex.entries.length, 1);
  assert.equal(scratch.unitIndex.entries[0], undefined);
});
