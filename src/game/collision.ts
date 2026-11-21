import {
  BuildingEntity,
  BuildingType,
  ResourceNode,
  ResourceType,
  TerrainBlockedDisc,
  TerrainBlockedRect,
  TerrainPassableBridge,
  UnitCategory,
  UnitEntity,
} from '../types/game';

export enum CollisionLayer {
  Unit = 1 << 0,
  Building = 1 << 1,
  ResourceNode = 1 << 2,
}

export interface CircleCollider {
  x: number;
  z: number;
  radius: number;
}

export const BUILDING_AUTO_CHANNEL_SETBACK = 0.85; // Each solid building reserves 0.85m walkable margin inside its placement footprint (~1.7m corridor when placed flush)

/**
 * Returns collision radius for a given unit definition.
 */
export function getUnitColliderRadius(category: UnitCategory, scale = 1): number {
  switch (category) {
    case 'worker':
      return 0.32 * scale;
    case 'cavalry':
      return 0.58 * scale;
    case 'siege':
      return 0.72 * scale;
    case 'melee':
    case 'ranged':
    case 'special':
    default:
      return 0.4 * scale;
  }
}

/**
 * Returns solid physical collision radius for a building.
 * Farms are walkable terrain (radius 0). Solid non-wall structures inset their solid core by
 * BUILDING_AUTO_CHANNEL_SETBACK so flush-placed buildings automatically leave a passable corridor.
 */
export function getBuildingCollisionRadius(
  b: Pick<BuildingEntity, 'buildingType' | 'buildingDef' | 'gateOpen' | 'wallBreached'>
): number {
  if (b.buildingType === 'farm' || b.wallBreached || (b.buildingType === 'gate' && b.gateOpen)) return 0;
  if (b.buildingDef.isWall) return b.buildingDef.size;
  switch (b.buildingType) {
    case 'town_center':
      return 4.18;
    case 'castle':
    case 'landmark_citadel':
    case 'landmark_observatory':
    case 'landmark_arsenal':
      return 4.52;
    case 'landmark_aachen':
    case 'landmark_barracks':
    case 'landmark_guildhall':
      return 4.12;
    case 'armory_forge':
    case 'spirit_shrine':
    case 'mana_well':
      return 3.05;
    case 'barracks':
    case 'archery_range':
      return 2.68; // 2.68 + 0.40 unit radius = 3.08m (>2.83m corner), while 2.68 + 0.36 nav padding < 3.10m keeps flush alley open
    case 'stable':
      return 3.05;
    case 'siege_workshop':
      return 3.35;
    case 'lumber_camp':
    case 'mining_camp':
      return 2.05;
    case 'dock':
      return 2.15;
    case 'house':
      return 1.65;
    case 'tower':
      return 1.65;
    case 'wall':
      return 1.48;
    default:
      return Math.max(1.2, b.buildingDef.size - 0.55);
  }
}

/**
 * Returns collision radius for a resource node matching its outer 3D geometry.
 */
export function getResourceColliderRadius(
  resourceType: ResourceType | string,
  subtype?: ResourceNode['subtype']
): number {
  if (resourceType === 'wood') return 0.72;
  if (resourceType === 'gold') return 1.88;
  if (resourceType === 'stone') return 1.78;
  if (resourceType === 'food') {
    if (subtype === 'deep_fish') return 1.1;
    if (subtype === 'shore_fish') return 0.95;
    if (subtype === 'berry') return 1.02;
    if (subtype === 'hunt') return 0.58;
    return 0.35; // Farm crops
  }
  return 1.05;
}

const COLLISION_CELL_SIZE = 8;

interface CollisionEntry<T> { item: T; index: number; radius: number; key: string }
interface CollisionIndex<T> {
  buckets: Map<string, CollisionEntry<T>[]>;
  entries: Map<number, CollisionEntry<T>>;
  maxRadius: number;
}

function collisionKey(x: number, z: number): string {
  return `${Math.floor(x / COLLISION_CELL_SIZE)}:${Math.floor(z / COLLISION_CELL_SIZE)}`;
}

function createCollisionIndex<T extends { x: number; z: number }>(
  items: readonly T[],
  radiusOf: (item: T) => number,
  include: (item: T) => boolean = () => true
): CollisionIndex<T> {
  const result: CollisionIndex<T> = { buckets: new Map(), entries: new Map(), maxRadius: 0 };
  items.forEach((item, index) => {
    if (!include(item) || !Number.isFinite(item.x) || !Number.isFinite(item.z)) return;
    const radius = radiusOf(item);
    if (!Number.isFinite(radius) || radius <= 0) return;
    const key = collisionKey(item.x, item.z);
    const entry = { item, index, radius, key };
    const bucket = result.buckets.get(key);
    if (bucket) bucket.push(entry);
    else result.buckets.set(key, [entry]);
    result.entries.set(index, entry);
    result.maxRadius = Math.max(result.maxRadius, radius);
  });
  return result;
}

function moveCollisionEntry<T extends { x: number; z: number }>(
  index: CollisionIndex<T>,
  entry: CollisionEntry<T>
): void {
  const nextKey = collisionKey(entry.item.x, entry.item.z);
  if (nextKey === entry.key) return;
  const oldBucket = index.buckets.get(entry.key);
  if (oldBucket) {
    const at = oldBucket.indexOf(entry);
    if (at >= 0) oldBucket.splice(at, 1);
    if (oldBucket.length === 0) index.buckets.delete(entry.key);
  }
  entry.key = nextKey;
  const nextBucket = index.buckets.get(nextKey);
  if (nextBucket) nextBucket.push(entry);
  else index.buckets.set(nextKey, [entry]);
}

function nearbyCollisionEntries<T extends { x: number; z: number }>(
  index: CollisionIndex<T>,
  x: number,
  z: number,
  reach: number
): CollisionEntry<T>[] {
  const minX = Math.floor((x - reach) / COLLISION_CELL_SIZE);
  const maxX = Math.floor((x + reach) / COLLISION_CELL_SIZE);
  const minZ = Math.floor((z - reach) / COLLISION_CELL_SIZE);
  const maxZ = Math.floor((z + reach) / COLLISION_CELL_SIZE);
  const found: CollisionEntry<T>[] = [];
  for (let cx = minX; cx <= maxX; cx++) {
    for (let cz = minZ; cz <= maxZ; cz++) {
      const bucket = index.buckets.get(`${cx}:${cz}`);
      if (bucket) found.push(...bucket);
    }
  }
  found.sort((a, b) => a.index - b.index);
  return found;
}

/** Resolves soft unit collisions using a spatial broad phase and exact circle tests. */
export function resolveUnitUnitCollisions(units: UnitEntity[], pushStrength = 0.52): void {
  const index = createCollisionIndex(
    units,
    (unit) => getUnitColliderRadius(unit.unitDef.category, unit.unitDef.visual.scale),
    (unit) => unit.hp > 0 && !unit.garrisonedInBuildingId
  );

  for (let i = 0; i < units.length; i++) {
    const first = index.entries.get(i);
    const u1 = units[i];
    if (!first) continue;
    const processed = new Set<number>();
    while (true) {
      const next = nearbyCollisionEntries(index, u1.x, u1.z, first.radius + index.maxRadius)
        .find((entry) => entry.index > i && !processed.has(entry.index));
      if (!next) break;
      processed.add(next.index);
      const u2 = next.item;
      if (u2.hp <= 0 || u2.garrisonedInBuildingId) continue;
      const dx = u2.x - u1.x;
      const dz = u2.z - u1.z;
      const dist = Math.hypot(dx, dz);
      const minDist = first.radius + next.radius;
      if (dist >= minDist) continue;
      let nx = dx;
      let nz = dz;
      if (dist > 0.0001) {
        nx /= dist;
        nz /= dist;
      } else {
        nx = (i % 2 === 0 ? 1 : -1) * 0.7071;
        nz = 0.7071;
      }
      const push = (minDist - dist) * 0.5 * pushStrength;
      u1.x -= nx * push;
      u1.z -= nz * push;
      u2.x += nx * push;
      u2.z += nz * push;
      moveCollisionEntry(index, first);
      moveCollisionEntry(index, next);
    }
  }
}

/** Resolves unit/building collisions; only nearby solid buildings reach the exact test. */
export function resolveUnitBuildingCollisions(units: UnitEntity[], buildings: BuildingEntity[]): void {
  const index = createCollisionIndex(buildings, getBuildingCollisionRadius, (building) => building.hp > 0);
  if (index.entries.size === 0) return;
  for (const unit of units) {
    if (unit.hp <= 0 || unit.garrisonedInBuildingId) continue;
    const unitRadius = getUnitColliderRadius(unit.unitDef.category, unit.unitDef.visual.scale);
    const processed = new Set<number>();
    while (true) {
      const next = nearbyCollisionEntries(index, unit.x, unit.z, unitRadius + index.maxRadius)
        .find((entry) => !processed.has(entry.index));
      if (!next) break;
      processed.add(next.index);
      const building = next.item;
      if (building.hp <= 0) continue;
      const minDist = next.radius + unitRadius;
      const dx = unit.x - building.x;
      const dz = unit.z - building.z;
      const dist = Math.hypot(dx, dz);
      if (dist >= minDist) continue;
      const nx = dist > 0.0001 ? dx / dist : 1;
      const nz = dist > 0.0001 ? dz / dist : 0;
      unit.x = building.x + nx * (minDist + 0.02);
      unit.z = building.z + nz * (minDist + 0.02);
    }
  }
}

/** Resolves unit/resource collisions while preserving farm walkability and gather reach. */
export function resolveUnitResourceCollisions(units: UnitEntity[], nodes: ResourceNode[]): void {
  const index = createCollisionIndex(
    nodes,
    (node) => getResourceColliderRadius(node.resourceType, node.subtype),
    (node) => node.amount > 0 && !(node.resourceType === 'food' && (!node.subtype || node.subtype === 'farm'))
  );
  if (index.entries.size === 0) return;
  for (const unit of units) {
    if (unit.hp <= 0 || unit.garrisonedInBuildingId) continue;
    const unitRadius = getUnitColliderRadius(unit.unitDef.category, unit.unitDef.visual.scale);
    const processed = new Set<number>();
    while (true) {
      const next = nearbyCollisionEntries(index, unit.x, unit.z, unitRadius + index.maxRadius)
        .find((entry) => !processed.has(entry.index));
      if (!next) break;
      processed.add(next.index);
      const node = next.item;
      if (node.amount <= 0) continue;
      const targetHarvester = unit.state === 'gathering' && unit.targetResourceNodeId === node.id;
      const minDist = next.radius + (targetHarvester ? unitRadius * 0.45 : unitRadius);
      const dx = unit.x - node.x;
      const dz = unit.z - node.z;
      const dist = Math.hypot(dx, dz);
      if (dist >= minDist) continue;
      const nx = dist > 0.0001 ? dx / dist : 0;
      const nz = dist > 0.0001 ? dz / dist : 1;
      unit.x = node.x + nx * (minDist + 0.02);
      unit.z = node.z + nz * (minDist + 0.02);
    }
  }
}

/**
 * Checks whether a world coordinate is inside a bridge/ford corridor.
 */
export function isPointOnBridge(x: number, z: number, bridges: TerrainPassableBridge[]): boolean {
  for (const br of bridges) {
    const dx = x - br.x;
    const dz = z - br.z;
    const cos = Math.cos(-br.angle);
    const sin = Math.sin(-br.angle);
    const lx = dx * cos - dz * sin;
    const lz = dx * sin + dz * cos;
    if (Math.abs(lx) <= br.halfWidth && Math.abs(lz) <= br.halfLength) {
      return true;
    }
  }
  return false;
}

/**
 * Checks whether a coordinate is inside deep water or impassable cliff terrain.
 */
export function isPointInTerrainObstacle(
  x: number,
  z: number,
  rects: TerrainBlockedRect[] = [],
  discs: TerrainBlockedDisc[] = [],
  bridges: TerrainPassableBridge[] = []
): boolean {
  if (isPointOnBridge(x, z, bridges)) return false;

  for (const d of discs) {
    if (Math.hypot(x - d.x, z - d.z) <= d.radius) {
      return true;
    }
  }

  for (const r of rects) {
    // Distance from point (x, z) to line segment (x1, z1)-(x2, z2) vs strip half-width
    const vx = r.x2 - r.x1;
    const vz = r.z2 - r.z1;
    const lenSq = vx * vx + vz * vz;
    if (lenSq < 0.0001) continue;
    const t = Math.max(0, Math.min(1, ((x - r.x1) * vx + (z - r.z1) * vz) / lenSq));
    const px = r.x1 + vx * t;
    const pz = r.z1 + vz * t;
    const halfWidth = r.halfWidth ?? (r.kind === 'water' ? 9.8 : 2.6);
    if (Math.hypot(x - px, z - pz) <= halfWidth) {
      return true;
    }
  }

  return false;
}

/**
 * Signed distance to water boundary:
 * Negative values mean point is inside water (`-signedDist` = distance from shore),
 * Positive values mean point is on dry land away from water.
 */
export function getWaterSignedDistance(
  x: number,
  z: number,
  waterRects: TerrainBlockedRect[] = [],
  waterDiscs: TerrainBlockedDisc[] = []
): number {
  let minSigned = Infinity;

  for (const d of waterDiscs) {
    if (d.kind !== 'water') continue;
    const sd = Math.hypot(x - d.x, z - d.z) - d.radius;
    if (sd < minSigned) minSigned = sd;
  }

  for (const r of waterRects) {
    if (r.kind !== 'water') continue;
    const vx = r.x2 - r.x1;
    const vz = r.z2 - r.z1;
    const lenSq = vx * vx + vz * vz;
    if (lenSq < 0.0001) continue;
    const t = Math.max(0, Math.min(1, ((x - r.x1) * vx + (z - r.z1) * vz) / lenSq));
    const px = r.x1 + vx * t;
    const pz = r.z1 + vz * t;
    const halfWidth = r.halfWidth ?? 9.8;
    const sd = Math.hypot(x - px, z - pz) - halfWidth;
    if (sd < minSigned) minSigned = sd;
  }

  return minSigned;
}

/**
 * Returns true if (x, z) lies strictly offshore in deep water (at least minShoreDist meters inside water edge).
 */
export function isOffshoreDeepWater(
  x: number,
  z: number,
  waterRects: TerrainBlockedRect[] = [],
  waterDiscs: TerrainBlockedDisc[] = [],
  bridges: TerrainPassableBridge[] = [],
  minShoreDist = 5.0
): boolean {
  if (isPointOnBridge(x, z, bridges)) return false;
  const sd = getWaterSignedDistance(x, z, waterRects, waterDiscs);
  return sd <= -minShoreDist;
}

/**
 * Validates shoreline placement for Docks (must sit right next to a river bank or lakeshore).
 */
export function canPlaceDockLocation(
  x: number,
  z: number,
  footprintSize: number,
  buildings: BuildingEntity[],
  nodes: ResourceNode[],
  terrainRects: TerrainBlockedRect[] = [],
  terrainDiscs: TerrainBlockedDisc[] = [],
  bridges: TerrainPassableBridge[] = []
): boolean {
  if (Math.abs(x) > 88 || Math.abs(z) > 88) return false;
  if (isPointOnBridge(x, z, bridges)) return false;

  const cliffDiscs = terrainDiscs.filter((d) => d.kind === 'cliff');
  const cliffRects = terrainRects.filter((r) => r.kind === 'cliff');
  if (isPointInTerrainObstacle(x, z, cliffRects, cliffDiscs, [])) return false;

  const waterRects = terrainRects.filter((r) => r.kind === 'water');
  const waterDiscs = terrainDiscs.filter((d) => d.kind === 'water');
  if (waterRects.length === 0 && waterDiscs.length === 0) return false;

  const sd = getWaterSignedDistance(x, z, waterRects, waterDiscs);
  // Dock center must straddle the shoreline (-2.6m inside edge .. +3.2m on the bank)
  if (sd < -2.6 || sd > 3.2) return false;

  for (const br of bridges) {
    if (Math.hypot(x - br.x, z - br.z) < Math.max(br.halfWidth, br.halfLength) + footprintSize + 1.5) {
      return false;
    }
  }

  for (const b of buildings) {
    if (b.hp <= 0) continue;
    if (Math.hypot(x - b.x, z - b.z) < footprintSize + b.buildingDef.size) {
      return false;
    }
  }

  for (const n of nodes) {
    if (n.amount <= 0) continue;
    const nRadius = getResourceColliderRadius(n.resourceType, n.subtype);
    if (Math.hypot(x - n.x, z - n.z) < footprintSize + nRadius + 0.4) {
      return false;
    }
  }

  return true;
}

/**
 * Validates building placement: prevents visual/footprint overlap while letting players place buildings
 * flush next to each other (each building's solid wall setback automatically leaves a ~1.7u walkable channel).
 */
export function isPlacementLocationValid(
  x: number,
  z: number,
  footprintSize: number,
  buildings: BuildingEntity[],
  nodes: ResourceNode[],
  _isWall = false,
  terrainRects: TerrainBlockedRect[] = [],
  terrainDiscs: TerrainBlockedDisc[] = [],
  bridges: TerrainPassableBridge[] = [],
  buildingType?: BuildingType
): boolean {
  if (buildingType === 'dock') {
    return canPlaceDockLocation(x, z, footprintSize, buildings, nodes, terrainRects, terrainDiscs, bridges);
  }

  if (Math.abs(x) > 90 || Math.abs(z) > 90) return false;

  if (
    isPointInTerrainObstacle(x, z, terrainRects, terrainDiscs, bridges) ||
    isPointInTerrainObstacle(x + footprintSize * 0.55, z, terrainRects, terrainDiscs, bridges) ||
    isPointInTerrainObstacle(x - footprintSize * 0.55, z, terrainRects, terrainDiscs, bridges) ||
    isPointInTerrainObstacle(x, z + footprintSize * 0.55, terrainRects, terrainDiscs, bridges) ||
    isPointInTerrainObstacle(x, z - footprintSize * 0.55, terrainRects, terrainDiscs, bridges)
  ) {
    return false;
  }

  // Prevent footprint overlap; wall segments can chain closely to seal gaps, while other adjacent footprints preserve walkable channels
  for (const b of buildings) {
    if (b.hp <= 0) continue;
    const minDist =
      _isWall && b.buildingDef.isWall
        ? Math.max(2.15, (footprintSize + b.buildingDef.size) * 0.72)
        : footprintSize + b.buildingDef.size;
    if (Math.hypot(x - b.x, z - b.z) < minDist) {
      return false;
    }
  }

  // Check collision with resource nodes (except farm crops? Even farm crops shouldn't have buildings stacked on them)
  for (const n of nodes) {
    if (n.amount <= 0) continue;
    const nRadius = getResourceColliderRadius(n.resourceType, n.subtype);
    const minDist = footprintSize + nRadius + 0.5;
    if (Math.hypot(x - n.x, z - n.z) < minDist) {
      return false;
    }
  }

  return true;
}
