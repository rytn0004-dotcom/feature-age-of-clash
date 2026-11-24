import test from 'node:test';
import assert from 'node:assert/strict';
import type { BuildingEntity, ResourceNode, UnitEntity, UnitCategory } from '../types/game';
import {
  resolveUnitBuildingCollisions,
  resolveUnitResourceCollisions,
  resolveUnitUnitCollisions,
  getUnitColliderRadius,
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
