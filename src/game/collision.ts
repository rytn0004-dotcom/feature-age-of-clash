import { WALL_MODEL_HALF_LENGTH, WALL_MODEL_HALF_WIDTH, WALL_TERRAIN_SAMPLE_STEP } from './wallPlacement';
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
    case 'ovoo_relay':
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
 * Extends a match-local, conservative broad-phase radius when a building is
 * added. The maximum is intentionally monotonic: removals, open gates and
 * breached walls may keep queries slightly wider, but can never hide a blocker.
 */
export function extendMaximumBuildingCollisionRadius(
  currentMaximum: number,
  building: Pick<BuildingEntity, 'buildingType' | 'buildingDef' | 'gateOpen' | 'wallBreached'>,
): number {
  const safeCurrent = Number.isFinite(currentMaximum) ? Math.max(0, currentMaximum) : 0;
  const candidate = getBuildingCollisionRadius(building);
  return Number.isFinite(candidate) ? Math.max(safeCurrent, candidate) : safeCurrent;
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
    if (subtype === 'boar') return 0.92;
    if (subtype === 'aurochs') return 1.5;
    return 0.35; // Farm crops
  }
  return 1.05;
}

const COLLISION_CELL_SIZE = 8;

export type CollisionBucketKey = number | string;

export interface CollisionEntry<T> { item: T; index: number; radius: number; key: CollisionBucketKey }

function compareCollisionEntriesByIndex<T>(
  first: CollisionEntry<T>,
  second: CollisionEntry<T>,
): number {
  return first.index - second.index;
}

export interface CollisionIndex<T> {
  buckets: Map<CollisionBucketKey, CollisionEntry<T>[]>;
  entries: Array<CollisionEntry<T> | undefined>;
  entryCount: number;
  maxRadius: number;
  reusableBuckets: CollisionEntry<T>[][];
  reusableEntries: CollisionEntry<T>[];
}

export interface CollisionResolutionScratch {
  unitIndex: CollisionIndex<UnitEntity>;
  buildingIndex: CollisionIndex<BuildingEntity>;
  resourceIndex: CollisionIndex<ResourceNode>;
  unitCandidates: CollisionEntry<UnitEntity>[];
  buildingCandidates: CollisionEntry<BuildingEntity>[];
  resourceCandidates: CollisionEntry<ResourceNode>[];
}

/**
 * Collision resolution is synchronous, so a shared generation-mark buffer can
 * replace one short-lived Set per unit without changing pair visitation order.
 */
let collisionVisitMarks = new Uint32Array(0);
let collisionVisitToken = 0;

function nextCollisionVisitToken(requiredLength: number): number {
  if (collisionVisitMarks.length < requiredLength) {
    collisionVisitMarks = new Uint32Array(requiredLength);
  }
  collisionVisitToken = (collisionVisitToken + 1) >>> 0;
  if (collisionVisitToken === 0) {
    collisionVisitMarks.fill(0);
    collisionVisitToken = 1;
  }
  return collisionVisitToken;
}

const PACKED_COLLISION_KEY_RADIX = 2 ** 26;
const PACKED_COLLISION_X_LIMIT = 2 ** 26;
const PACKED_COLLISION_Z_LIMIT = 2 ** 25;

/** Packs ordinary battlefield cells into exact numeric keys with a safe string fallback. */
function collisionCellKey(cellX: number, cellZ: number): CollisionBucketKey {
  if (
    Number.isSafeInteger(cellX) &&
    Number.isSafeInteger(cellZ) &&
    cellX > -PACKED_COLLISION_X_LIMIT &&
    cellX < PACKED_COLLISION_X_LIMIT &&
    cellZ >= -PACKED_COLLISION_Z_LIMIT &&
    cellZ < PACKED_COLLISION_Z_LIMIT
  ) {
    return cellX * PACKED_COLLISION_KEY_RADIX + cellZ;
  }

  return cellX + ':' + cellZ;
}

function collisionKey(x: number, z: number): CollisionBucketKey {
  return collisionCellKey(
    Math.floor(x / COLLISION_CELL_SIZE),
    Math.floor(z / COLLISION_CELL_SIZE),
  );
}



function createEmptyCollisionIndex<T>(): CollisionIndex<T> {
  return {
    buckets: new Map<CollisionBucketKey, CollisionEntry<T>[]>(),
    entries: [],
    entryCount: 0,
    maxRadius: 0,
    reusableBuckets: [],
    reusableEntries: [],
  };
}

/** Refresh an index in place, reusing both its active arrays and per-cell records. */
function rebuildCollisionIndexInPlace<T extends { x: number; z: number }>(
  index: CollisionIndex<T>,
  items: readonly T[],
  radiusOf: (item: T) => number,
  include: (item: T) => boolean = () => true,
): CollisionIndex<T> {
  for (const bucket of index.buckets.values()) {
    bucket.length = 0;
    index.reusableBuckets.push(bucket);
  }
  index.buckets.clear();

  for (const entry of index.entries) {
    if (entry) index.reusableEntries.push(entry);
  }
  index.entries.length = items.length;
  index.entries.fill(undefined);
  index.entryCount = 0;
  index.maxRadius = 0;

  for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
    const item = items[itemIndex];
    if (!include(item) || !Number.isFinite(item.x) || !Number.isFinite(item.z)) continue;
    const radius = radiusOf(item);
    if (!Number.isFinite(radius) || radius <= 0) continue;

    const key = collisionKey(item.x, item.z);
    const entry = index.reusableEntries.pop() ?? {
      item,
      index: itemIndex,
      radius,
      key,
    };
    entry.item = item;
    entry.index = itemIndex;
    entry.radius = radius;
    entry.key = key;

    let bucket = index.buckets.get(key);
    if (!bucket) {
      bucket = index.reusableBuckets.pop() ?? [];
      bucket.length = 0;
      index.buckets.set(key, bucket);
    }
    bucket.push(entry);
    index.entries[itemIndex] = entry;
    index.entryCount++;
    index.maxRadius = Math.max(index.maxRadius, radius);
  }

  return index;
}

function createCollisionIndex<T extends { x: number; z: number }>(
  items: readonly T[],
  radiusOf: (item: T) => number,
  include: (item: T) => boolean = () => true,
): CollisionIndex<T> {
  return rebuildCollisionIndexInPlace(createEmptyCollisionIndex<T>(), items, radiusOf, include);
}

/** Allocate one scratch bundle per engine; each collision pass keeps its own reusable index. */
export function createCollisionResolutionScratch(): CollisionResolutionScratch {
  return {
    unitIndex: createEmptyCollisionIndex<UnitEntity>(),
    buildingIndex: createEmptyCollisionIndex<BuildingEntity>(),
    resourceIndex: createEmptyCollisionIndex<ResourceNode>(),
    unitCandidates: [],
    buildingCandidates: [],
    resourceCandidates: [],
  };
}


function moveCollisionEntry<T extends { x: number; z: number }>(
  index: CollisionIndex<T>,
  entry: CollisionEntry<T>
): boolean {
  const nextKey = collisionKey(entry.item.x, entry.item.z);
  if (nextKey === entry.key) return false;
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
  return true;
}

function nearbyCollisionEntries<T extends { x: number; z: number }>(
  index: CollisionIndex<T>,
  x: number,
  z: number,
  reach: number,
  output: CollisionEntry<T>[] = [],
): CollisionEntry<T>[] {
  const minX = Math.floor((x - reach) / COLLISION_CELL_SIZE);
  const maxX = Math.floor((x + reach) / COLLISION_CELL_SIZE);
  const minZ = Math.floor((z - reach) / COLLISION_CELL_SIZE);
  const maxZ = Math.floor((z + reach) / COLLISION_CELL_SIZE);
  const found = output;
  found.length = 0;
  for (let cx = minX; cx <= maxX; cx++) {
    for (let cz = minZ; cz <= maxZ; cz++) {
      const bucket = index.buckets.get(collisionCellKey(cx, cz));
      if (!bucket) continue;
      for (const entry of bucket) found.push(entry);
    }
  }
  found.sort(compareCollisionEntriesByIndex);
  return found;
}

export interface UnitCollisionMotionState {
  state?: string;
  targetBuildingId?: string;
  velocity?: { x: number; z: number };
}

/**
 * Stationary builders should hold their work position when traffic passes.
 * The incoming/moving unit absorbs most of the overlap correction; two
 * stationary builders or two moving units still share it evenly.
 */
function isStationaryConstructionBuilder(unit: UnitCollisionMotionState): boolean {
  const velocity = unit.velocity;
  return unit.state === 'building' &&
    !!unit.targetBuildingId &&
    !!velocity &&
    Number.isFinite(velocity.x) &&
    Number.isFinite(velocity.z) &&
    velocity.x * velocity.x + velocity.z * velocity.z < 0.0064;
}

/** Returns only the first unit's share; the second share is its complement. */
export function getUnitCollisionFirstDisplacementShare(
  first: UnitCollisionMotionState,
  second: UnitCollisionMotionState,
): number {
  const firstIsAnchor = isStationaryConstructionBuilder(first);
  const secondIsAnchor = isStationaryConstructionBuilder(second);
  if (firstIsAnchor && !secondIsAnchor) return 0.12;
  if (!firstIsAnchor && secondIsAnchor) return 0.88;
  return 0.5;
}

/** Resolves soft unit collisions using a spatial broad phase and exact circle tests. */
export function resolveUnitUnitCollisions(
  units: UnitEntity[],
  pushStrength = 0.52,
  scratch?: CollisionResolutionScratch,
): void {
  const index = scratch
    ? rebuildCollisionIndexInPlace(
        scratch.unitIndex,
        units,
        (unit) => getUnitColliderRadius(unit.unitDef.category, unit.unitDef.visual.scale),
        (unit) => unit.hp > 0 && !unit.garrisonedInBuildingId,
      )
    : createCollisionIndex(
        units,
        (unit) => getUnitColliderRadius(unit.unitDef.category, unit.unitDef.visual.scale),
        (unit) => unit.hp > 0 && !unit.garrisonedInBuildingId,
      );
  const candidates = scratch?.unitCandidates ?? [];

  for (let i = 0; i < units.length; i++) {
    const first = index.entries[i];
    const u1 = units[i];
    if (!first) continue;
    const visitToken = nextCollisionVisitToken(index.entries.length);
    const reach = first.radius + index.maxRadius;
    let cachedMinCellX = Number.NaN;
    let cachedMaxCellX = Number.NaN;
    let cachedMinCellZ = Number.NaN;
    let cachedMaxCellZ = Number.NaN;
    let candidateCursor = 0;

    while (true) {
      const minCellX = Math.floor((u1.x - reach) / COLLISION_CELL_SIZE);
      const maxCellX = Math.floor((u1.x + reach) / COLLISION_CELL_SIZE);
      const minCellZ = Math.floor((u1.z - reach) / COLLISION_CELL_SIZE);
      const maxCellZ = Math.floor((u1.z + reach) / COLLISION_CELL_SIZE);
      if (
        minCellX !== cachedMinCellX ||
        maxCellX !== cachedMaxCellX ||
        minCellZ !== cachedMinCellZ ||
        maxCellZ !== cachedMaxCellZ
      ) {
        nearbyCollisionEntries(index, u1.x, u1.z, reach, candidates);
        candidateCursor = 0;
        cachedMinCellX = minCellX;
        cachedMaxCellX = maxCellX;
        cachedMinCellZ = minCellZ;
        cachedMaxCellZ = maxCellZ;
      }

      let next: CollisionEntry<UnitEntity> | undefined;
      while (candidateCursor < candidates.length) {
        const candidate = candidates[candidateCursor++];
        if (candidate.index > i && collisionVisitMarks[candidate.index] !== visitToken) {
          next = candidate;
          break;
        }
      }
      if (!next) break;

      collisionVisitMarks[next.index] = visitToken;
      const u2 = next.item;
      if (u2.hp <= 0 || u2.garrisonedInBuildingId) continue;
      const dx = u2.x - u1.x;
      const dz = u2.z - u1.z;
      const minDist = first.radius + next.radius;
      const distanceSquared = dx * dx + dz * dz;
      if (distanceSquared >= minDist * minDist) continue;
      const dist = Math.sqrt(distanceSquared);
      let nx = dx;
      let nz = dz;
      if (dist > 0.0001) {
        nx /= dist;
        nz /= dist;
      } else {
        nx = (i % 2 === 0 ? 1 : -1) * 0.7071;
        nz = 0.7071;
      }
      const push = (minDist - dist) * pushStrength;
      const firstDisplacementShare = getUnitCollisionFirstDisplacementShare(u1, u2);
      const secondDisplacementShare = 1 - firstDisplacementShare;
      u1.x -= nx * push * firstDisplacementShare;
      u1.z -= nz * push * firstDisplacementShare;
      u2.x += nx * push * secondDisplacementShare;
      u2.z += nz * push * secondDisplacementShare;
      const firstChangedCell = moveCollisionEntry(index, first);
      const secondChangedCell = moveCollisionEntry(index, next);
      if (firstChangedCell || secondChangedCell) {
        cachedMinCellX = Number.NaN;
        cachedMaxCellX = Number.NaN;
        cachedMinCellZ = Number.NaN;
        cachedMaxCellZ = Number.NaN;
      }
    }
  }
}

/** Resolves unit/building collisions; only nearby solid buildings reach the exact test. */
export function resolveUnitBuildingCollisions(
  units: UnitEntity[],
  buildings: BuildingEntity[],
  scratch?: CollisionResolutionScratch,
): void {
  const index = scratch
    ? rebuildCollisionIndexInPlace(scratch.buildingIndex, buildings, getBuildingCollisionRadius, (building) => building.hp > 0)
    : createCollisionIndex(buildings, getBuildingCollisionRadius, (building) => building.hp > 0);
  if (index.entryCount === 0) return;
  const candidates = scratch?.buildingCandidates ?? [];
  for (const unit of units) {
    if (unit.hp <= 0 || unit.garrisonedInBuildingId) continue;
    const visitToken = nextCollisionVisitToken(index.entries.length);
    const unitRadius = getUnitColliderRadius(unit.unitDef.category, unit.unitDef.visual.scale);
    const reach = unitRadius + index.maxRadius;
    let cachedMinCellX = Number.NaN;
    let cachedMaxCellX = Number.NaN;
    let cachedMinCellZ = Number.NaN;
    let cachedMaxCellZ = Number.NaN;
    let candidateCursor = 0;
    while (true) {
      const minCellX = Math.floor((unit.x - reach) / COLLISION_CELL_SIZE);
      const maxCellX = Math.floor((unit.x + reach) / COLLISION_CELL_SIZE);
      const minCellZ = Math.floor((unit.z - reach) / COLLISION_CELL_SIZE);
      const maxCellZ = Math.floor((unit.z + reach) / COLLISION_CELL_SIZE);
      if (
        minCellX !== cachedMinCellX ||
        maxCellX !== cachedMaxCellX ||
        minCellZ !== cachedMinCellZ ||
        maxCellZ !== cachedMaxCellZ
      ) {
        nearbyCollisionEntries(index, unit.x, unit.z, reach, candidates);
        candidateCursor = 0;
        cachedMinCellX = minCellX;
        cachedMaxCellX = maxCellX;
        cachedMinCellZ = minCellZ;
        cachedMaxCellZ = maxCellZ;
      }

      let next: CollisionEntry<BuildingEntity> | undefined;
      while (candidateCursor < candidates.length) {
        const candidate = candidates[candidateCursor++];
        if (collisionVisitMarks[candidate.index] !== visitToken) {
          next = candidate;
          break;
        }
      }
      if (!next) break;
      collisionVisitMarks[next.index] = visitToken;
      const building = next.item;
      if (building.hp <= 0) continue;
      const minDist = next.radius + unitRadius;
      const dx = unit.x - building.x;
      const dz = unit.z - building.z;
      const distanceSquared = dx * dx + dz * dz;
      if (distanceSquared >= minDist * minDist) continue;
      const dist = Math.sqrt(distanceSquared);
      const nx = dist > 0.0001 ? dx / dist : 1;
      const nz = dist > 0.0001 ? dz / dist : 0;
      unit.x = building.x + nx * (minDist + 0.02);
      unit.z = building.z + nz * (minDist + 0.02);
    }
  }
}

/** Resolves unit/resource collisions while preserving farm walkability and gather reach. */
export function resolveUnitResourceCollisions(
  units: UnitEntity[],
  nodes: ResourceNode[],
  scratch?: CollisionResolutionScratch,
): void {
  const index = scratch
    ? rebuildCollisionIndexInPlace(
        scratch.resourceIndex,
        nodes,
        (node) => getResourceColliderRadius(node.resourceType, node.subtype),
        (node) => node.amount > 0 && !(node.resourceType === 'food' && (!node.subtype || node.subtype === 'farm')),
      )
    : createCollisionIndex(
        nodes,
        (node) => getResourceColliderRadius(node.resourceType, node.subtype),
        (node) => node.amount > 0 && !(node.resourceType === 'food' && (!node.subtype || node.subtype === 'farm')),
      );
  if (index.entryCount === 0) return;
  const candidates = scratch?.resourceCandidates ?? [];
  for (const unit of units) {
    if (unit.hp <= 0 || unit.garrisonedInBuildingId) continue;
    const visitToken = nextCollisionVisitToken(index.entries.length);
    const unitRadius = getUnitColliderRadius(unit.unitDef.category, unit.unitDef.visual.scale);
    const reach = unitRadius + index.maxRadius;
    let cachedMinCellX = Number.NaN;
    let cachedMaxCellX = Number.NaN;
    let cachedMinCellZ = Number.NaN;
    let cachedMaxCellZ = Number.NaN;
    let candidateCursor = 0;
    while (true) {
      const minCellX = Math.floor((unit.x - reach) / COLLISION_CELL_SIZE);
      const maxCellX = Math.floor((unit.x + reach) / COLLISION_CELL_SIZE);
      const minCellZ = Math.floor((unit.z - reach) / COLLISION_CELL_SIZE);
      const maxCellZ = Math.floor((unit.z + reach) / COLLISION_CELL_SIZE);
      if (
        minCellX !== cachedMinCellX ||
        maxCellX !== cachedMaxCellX ||
        minCellZ !== cachedMinCellZ ||
        maxCellZ !== cachedMaxCellZ
      ) {
        nearbyCollisionEntries(index, unit.x, unit.z, reach, candidates);
        candidateCursor = 0;
        cachedMinCellX = minCellX;
        cachedMaxCellX = maxCellX;
        cachedMinCellZ = minCellZ;
        cachedMaxCellZ = maxCellZ;
      }

      let next: CollisionEntry<ResourceNode> | undefined;
      while (candidateCursor < candidates.length) {
        const candidate = candidates[candidateCursor++];
        if (collisionVisitMarks[candidate.index] !== visitToken) {
          next = candidate;
          break;
        }
      }
      if (!next) break;
      collisionVisitMarks[next.index] = visitToken;
      const node = next.item;
      if (node.amount <= 0) continue;
      const targetHarvester = unit.state === 'gathering' && unit.targetResourceNodeId === node.id;
      const minDist = next.radius + (targetHarvester ? unitRadius * 0.45 : unitRadius);
      const dx = unit.x - node.x;
      const dz = unit.z - node.z;
      const distanceSquared = dx * dx + dz * dz;
      if (distanceSquared >= minDist * minDist) continue;
      const dist = Math.sqrt(distanceSquared);
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

export interface TerrainObstacleQueryBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface TerrainObstacleQueryCandidates {
  rects: TerrainBlockedRect[];
  discs: TerrainBlockedDisc[];
  bridges: TerrainPassableBridge[];
}

/**
 * Conservative broad phase for repeated point-in-terrain queries.
 * Every obstacle whose collision envelope can touch the expanded AABB is kept;
 * exact point/segment/bridge checks remain unchanged in isPointInTerrainObstacle.
 */
export function filterTerrainObstaclesToBounds(
  bounds: TerrainObstacleQueryBounds,
  rects: readonly TerrainBlockedRect[] = [],
  discs: readonly TerrainBlockedDisc[] = [],
  bridges: readonly TerrainPassableBridge[] = [],
  padding = 0,
  reusableCandidates?: TerrainObstacleQueryCandidates,
): TerrainObstacleQueryCandidates {
  if (
    !Number.isFinite(bounds.minX) ||
    !Number.isFinite(bounds.maxX) ||
    !Number.isFinite(bounds.minZ) ||
    !Number.isFinite(bounds.maxZ) ||
    bounds.minX > bounds.maxX ||
    bounds.minZ > bounds.maxZ
  ) {
    if (reusableCandidates) {
      reusableCandidates.rects.length = 0;
      reusableCandidates.discs.length = 0;
      reusableCandidates.bridges.length = 0;
      return reusableCandidates;
    }
    return { rects: [], discs: [], bridges: [] };
  }

  const candidates = reusableCandidates ?? { rects: [], discs: [], bridges: [] };
  candidates.rects.length = 0;
  candidates.discs.length = 0;
  candidates.bridges.length = 0;

  const pad = Number.isFinite(padding) ? Math.max(0, padding) : 0;
  const minX = bounds.minX - pad;
  const maxX = bounds.maxX + pad;
  const minZ = bounds.minZ - pad;
  const maxZ = bounds.maxZ + pad;
  const rectCandidates = candidates.rects;
  const discCandidates = candidates.discs;
  const bridgeCandidates = candidates.bridges;

  for (const rect of rects) {
    const halfWidth = Math.max(
      0,
      Number.isFinite(rect.halfWidth)
        ? rect.halfWidth!
        : rect.kind === 'water' ? 9.8 : 2.6,
    );
    if (
      Math.max(rect.x1, rect.x2) + halfWidth < minX ||
      Math.min(rect.x1, rect.x2) - halfWidth > maxX ||
      Math.max(rect.z1, rect.z2) + halfWidth < minZ ||
      Math.min(rect.z1, rect.z2) - halfWidth > maxZ
    ) continue;
    rectCandidates.push(rect);
  }

  for (const disc of discs) {
    if (!Number.isFinite(disc.x) || !Number.isFinite(disc.z) || !Number.isFinite(disc.radius) || disc.radius < 0) continue;
    const dx = disc.x < minX ? minX - disc.x : disc.x > maxX ? disc.x - maxX : 0;
    const dz = disc.z < minZ ? minZ - disc.z : disc.z > maxZ ? disc.z - maxZ : 0;
    if (dx * dx + dz * dz <= disc.radius * disc.radius) discCandidates.push(disc);
  }

  for (const bridge of bridges) {
    if (
      !Number.isFinite(bridge.x) ||
      !Number.isFinite(bridge.z) ||
      !Number.isFinite(bridge.halfWidth) ||
      !Number.isFinite(bridge.halfLength) ||
      bridge.halfWidth < 0 ||
      bridge.halfLength < 0
    ) continue;
    // The oriented bridge rectangle is fully enclosed by this radius.
    const radius = Math.hypot(bridge.halfWidth, bridge.halfLength);
    const dx = bridge.x < minX ? minX - bridge.x : bridge.x > maxX ? bridge.x - maxX : 0;
    const dz = bridge.z < minZ ? minZ - bridge.z : bridge.z > maxZ ? bridge.z - maxZ : 0;
    if (dx * dx + dz * dz <= radius * radius) bridgeCandidates.push(bridge);
  }

  return candidates;
}

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


/**
 * Low-cost visual broad-phase for wall-chain previews. It checks the projected
 * modular segment centres in one pass and is intentionally not the authoritative
 * placement validator; the exact validator runs once when a click commits a batch.
 */
interface OrientedWallFootprint {
  x: number;
  z: number;
  rotationY: number;
}

function doesCircleOverlapWallFootprintWithAxes(
  footprintX: number,
  footprintZ: number,
  cos: number,
  sin: number,
  x: number,
  z: number,
  radius: number,
): boolean {
  if (!Number.isFinite(radius) || radius < 0) return false;
  const dx = x - footprintX;
  const dz = z - footprintZ;
  const localX = dx * cos - dz * sin;
  const localZ = dx * sin + dz * cos;
  const closestX = Math.max(-WALL_MODEL_HALF_LENGTH, Math.min(WALL_MODEL_HALF_LENGTH, localX));
  const closestZ = Math.max(-WALL_MODEL_HALF_WIDTH, Math.min(WALL_MODEL_HALF_WIDTH, localZ));
  const gapX = localX - closestX;
  const gapZ = localZ - closestZ;
  return gapX * gapX + gapZ * gapZ <= radius * radius;
}

/** True when a circle touches the actual rotated rectangular wall footprint. */
export function doesCircleOverlapWallFootprint(
  footprint: OrientedWallFootprint,
  x: number,
  z: number,
  radius: number,
): boolean {
  return doesCircleOverlapWallFootprintWithAxes(
    footprint.x,
    footprint.z,
    Math.cos(footprint.rotationY),
    Math.sin(footprint.rotationY),
    x,
    z,
    radius,
  );
}

function doWallFootprintsOverlapWithAxes(
  firstX: number,
  firstZ: number,
  firstCos: number,
  firstSin: number,
  secondX: number,
  secondZ: number,
  secondCos: number,
  secondSin: number,
  clearance = 0.025,
): boolean {
  const deltaX = secondX - firstX;
  const deltaZ = secondZ - firstZ;

  for (let axisIndex = 0; axisIndex < 4; axisIndex++) {
    let axisX: number;
    let axisZ: number;
    if (axisIndex === 0) {
      axisX = firstCos;
      axisZ = -firstSin;
    } else if (axisIndex === 1) {
      axisX = firstSin;
      axisZ = firstCos;
    } else if (axisIndex === 2) {
      axisX = secondCos;
      axisZ = -secondSin;
    } else {
      axisX = secondSin;
      axisZ = secondCos;
    }

    const firstAxisX = axisX * firstCos - axisZ * firstSin;
    const firstAxisZ = axisX * firstSin + axisZ * firstCos;
    const secondAxisX = axisX * secondCos - axisZ * secondSin;
    const secondAxisZ = axisX * secondSin + axisZ * secondCos;
    const firstRadius =
      WALL_MODEL_HALF_LENGTH * Math.abs(firstAxisX) +
      WALL_MODEL_HALF_WIDTH * Math.abs(firstAxisZ);
    const secondRadius =
      WALL_MODEL_HALF_LENGTH * Math.abs(secondAxisX) +
      WALL_MODEL_HALF_WIDTH * Math.abs(secondAxisZ);
    if (Math.abs(deltaX * axisX + deltaZ * axisZ) > firstRadius + secondRadius + clearance) return false;
  }
  return true;
}

/** SAT overlap for two rotated wall rectangles without allocating axis arrays. */
export function doWallFootprintsOverlap(
  first: OrientedWallFootprint,
  second: OrientedWallFootprint,
  clearance = 0.025,
): boolean {
  return doWallFootprintsOverlapWithAxes(
    first.x,
    first.z,
    Math.cos(first.rotationY),
    Math.sin(first.rotationY),
    second.x,
    second.z,
    Math.cos(second.rotationY),
    Math.sin(second.rotationY),
    clearance,
  );
}

function isWallFootprintBlockedByTerrain(
  placement: OrientedWallFootprint,
  rects: TerrainBlockedRect[],
  discs: TerrainBlockedDisc[],
  bridges: TerrainPassableBridge[],
): boolean {
  for (const disc of discs) {
    if (isPointOnBridge(disc.x, disc.z, bridges)) continue;
    if (doesCircleOverlapWallFootprint(placement, disc.x, disc.z, disc.radius)) return true;
  }

  // Sample the complete rotated footprint on a coarse regular grid. Centreline
  // sampling handles long strips; this grid catches water/cliffs across wall depth.
  const longSteps = Math.max(1, Math.ceil((WALL_MODEL_HALF_LENGTH * 2) / WALL_TERRAIN_SAMPLE_STEP));
  const widthSteps = Math.max(2, Math.ceil((WALL_MODEL_HALF_WIDTH * 2) / WALL_TERRAIN_SAMPLE_STEP));
  const cos = Math.cos(placement.rotationY);
  const sin = Math.sin(placement.rotationY);
  for (let xIndex = 0; xIndex <= longSteps; xIndex++) {
    const localX = -WALL_MODEL_HALF_LENGTH + (xIndex / longSteps) * WALL_MODEL_HALF_LENGTH * 2;
    for (let zIndex = 0; zIndex <= widthSteps; zIndex++) {
      const localZ = -WALL_MODEL_HALF_WIDTH + (zIndex / widthSteps) * WALL_MODEL_HALF_WIDTH * 2;
      const worldX = placement.x + localX * cos + localZ * sin;
      const worldZ = placement.z - localX * sin + localZ * cos;
      if (isPointInTerrainObstacle(worldX, worldZ, rects, [], bridges)) return true;
    }
  }
  return false;
}

/** Route validator shared by throttled preview and authoritative click commit. */
export function isWallChainPreviewObstructed(
  placements: readonly { x: number; z: number; rotationY?: number }[],
  _footprintSize: number,
  buildings: readonly BuildingEntity[],
  nodes: readonly ResourceNode[],
  terrainRects: TerrainBlockedRect[] = [],
  terrainDiscs: TerrainBlockedDisc[] = [],
  bridges: TerrainPassableBridge[] = [],
  pathPoints: readonly { x: number; z: number }[] = [],
  connectedEndpointWallIds: readonly string[] = [],
  reusableTerrainCandidates?: TerrainObstacleQueryCandidates,
): boolean {
  if (placements.length === 0) return false;

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const placement of placements) {
    const cos = Math.cos(placement.rotationY ?? 0);
    const sin = Math.sin(placement.rotationY ?? 0);
    const extentX = Math.abs(cos) * WALL_MODEL_HALF_LENGTH + Math.abs(sin) * WALL_MODEL_HALF_WIDTH;
    const extentZ = Math.abs(sin) * WALL_MODEL_HALF_LENGTH + Math.abs(cos) * WALL_MODEL_HALF_WIDTH;
    minX = Math.min(minX, placement.x - extentX);
    maxX = Math.max(maxX, placement.x + extentX);
    minZ = Math.min(minZ, placement.z - extentZ);
    maxZ = Math.max(maxZ, placement.z + extentZ);
  }
  for (const point of pathPoints) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minZ = Math.min(minZ, point.z);
    maxZ = Math.max(maxZ, point.z);
  }

  const terrainCandidates = filterTerrainObstaclesToBounds(
    { minX, maxX, minZ, maxZ },
    terrainRects,
    terrainDiscs,
    bridges,
    0.02,
    reusableTerrainCandidates,
  );
  terrainRects = terrainCandidates.rects;
  terrainDiscs = terrainCandidates.discs;
  bridges = terrainCandidates.bridges;

  for (let index = 0; index < pathPoints.length - 1; index++) {
    const start = pathPoints[index];
    const end = pathPoints[index + 1];
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const sampleCount = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.25));
    for (let sample = 0; sample <= sampleCount; sample++) {
      const t = sample / sampleCount;
      if (isPointInTerrainObstacle(start.x + dx * t, start.z + dz * t, terrainRects, terrainDiscs, bridges)) return true;
    }
  }

  const wallFootprint: OrientedWallFootprint = { x: 0, z: 0, rotationY: 0 };
  for (const placement of placements) {
    if (Math.abs(placement.x) > 90 || Math.abs(placement.z) > 90) return true;
    const rotationY = placement.rotationY ?? 0;
    const wallCos = Math.cos(rotationY);
    const wallSin = Math.sin(rotationY);
    wallFootprint.x = placement.x;
    wallFootprint.z = placement.z;
    wallFootprint.rotationY = rotationY;
    if (
      isPointInTerrainObstacle(placement.x, placement.z, terrainRects, terrainDiscs, bridges) ||
      isWallFootprintBlockedByTerrain(wallFootprint, terrainRects, terrainDiscs, bridges)
    ) return true;

    // Keep one wall's orientation hot while checking all nearby blockers. This
    // avoids rebuilding temporary footprint objects and recalculating the same
    // wall sin/cos for every building/resource candidate.
    for (const building of buildings) {
      if (building.hp <= 0 || connectedEndpointWallIds.includes(building.id)) continue;
      if (building.buildingDef.isWall) {
        const buildingRotation = building.rotationY ?? 0;
        if (doWallFootprintsOverlapWithAxes(
          wallFootprint.x,
          wallFootprint.z,
          wallCos,
          wallSin,
          building.x,
          building.z,
          Math.cos(buildingRotation),
          Math.sin(buildingRotation),
        )) return true;
      } else if (doesCircleOverlapWallFootprintWithAxes(
        wallFootprint.x,
        wallFootprint.z,
        wallCos,
        wallSin,
        building.x,
        building.z,
        Math.max(0, building.buildingDef.size),
      )) return true;
    }

    for (const node of nodes) {
      if (node.amount <= 0) continue;
      const nodeRadius = getResourceColliderRadius(node.resourceType, node.subtype) + 0.5;
      if (doesCircleOverlapWallFootprintWithAxes(
        wallFootprint.x,
        wallFootprint.z,
        wallCos,
        wallSin,
        node.x,
        node.z,
        nodeRadius,
      )) return true;
    }
  }

  return false;
}
