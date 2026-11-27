export interface CombatSpatialUnit {
  id: string;
  x: number;
  z: number;
  hp: number;
  garrisonedInBuildingId?: string;
}

export interface CombatForceCandidate extends CombatSpatialUnit {
  faction: string;
  unitDef: { category: string };
}

export interface LocalCombatForceCounts {
  nearbyEnemyCount: number;
  nearbyAllyCount: number;
}

/** Counts nearby forces from already range-filtered candidates using AI roster semantics. */
export function countNearbyCombatForces<Unit extends CombatForceCandidate>(
  candidates: readonly Unit[],
  friendlyFactionId: string,
  isHostile: (unit: Unit) => boolean,
): LocalCombatForceCounts {
  let nearbyEnemyCount = 0;
  let nearbyAllyCount = 0;

  for (const unit of candidates) {
    if (unit.hp <= 0 || unit.garrisonedInBuildingId || unit.unitDef.category === 'worker') continue;
    if (unit.faction === friendlyFactionId) nearbyAllyCount++;
    else if (isHostile(unit)) nearbyEnemyCount++;
  }

  return { nearbyEnemyCount, nearbyAllyCount };
}

export interface CombatSpatialBuilding {
  id: string;
  x: number;
  z: number;
  hp: number;
}

export interface CombatSpatialIndex<
  Unit extends CombatSpatialUnit = CombatSpatialUnit,
  Building extends CombatSpatialBuilding = CombatSpatialBuilding,
> {
  cellSize: number;
  units: Unit[];
  buildings: Building[];
  unitBuckets: Map<CombatSpatialBucketKey, Unit[]>;
  buildingBuckets: Map<CombatSpatialBucketKey, Building[]>;
  /** Empty bucket arrays recycled between rebuilds to reduce per-step garbage. */
  reusableUnitBuckets: Unit[][];
  reusableBuildingBuckets: Building[][];
}

export interface CombatSpatialCandidates<
  Unit extends CombatSpatialUnit = CombatSpatialUnit,
  Building extends CombatSpatialBuilding = CombatSpatialBuilding,
> {
  units: Unit[];
  buildings: Building[];
}

type CombatSpatialBucketKey = number | string;

const PACKED_SPATIAL_KEY_RADIX = 2 ** 26;
const PACKED_SPATIAL_X_LIMIT = 2 ** 26;
const PACKED_SPATIAL_Z_LIMIT = 2 ** 25;

/**
 * Packs the common, bounded map-cell coordinates into one exact integer key.
 * Very large coordinates fall back to the original textual representation so
 * the fast path cannot introduce numeric-key collisions outside its safe range.
 */
function spatialCellKey(cellX: number, cellZ: number): CombatSpatialBucketKey {
  if (
    Number.isSafeInteger(cellX) &&
    Number.isSafeInteger(cellZ) &&
    cellX > -PACKED_SPATIAL_X_LIMIT &&
    cellX < PACKED_SPATIAL_X_LIMIT &&
    cellZ >= -PACKED_SPATIAL_Z_LIMIT &&
    cellZ < PACKED_SPATIAL_Z_LIMIT
  ) {
    return cellX * PACKED_SPATIAL_KEY_RADIX + cellZ;
  }

  return cellX + ':' + cellZ;
}

const spatialKey = (x: number, z: number, cellSize: number): CombatSpatialBucketKey =>
  spatialCellKey(Math.floor(x / cellSize), Math.floor(z / cellSize));

function recycleBuckets<T>(
  buckets: Map<CombatSpatialBucketKey, T[]>,
  reusableBuckets: T[][],
): void {
  for (const bucket of buckets.values()) {
    bucket.length = 0;
    reusableBuckets.push(bucket);
  }
  buckets.clear();
}

function addToBucket<T extends CombatSpatialUnit | CombatSpatialBuilding>(
  buckets: Map<CombatSpatialBucketKey, T[]>,
  reusableBuckets: T[][],
  entity: T,
  cellSize: number,
): void {
  const key = spatialKey(entity.x, entity.z, cellSize);
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = reusableBuckets.pop() ?? [];
    buckets.set(key, bucket);
  }
  bucket.push(entity);
}

/**
 * Builds a per-simulation-step broad phase for combat acquisition.
 * Positions are sampled once; callers rebuild after collision resolution before
 * the slower AI planning pass. Exact distance and hostility checks remain in rules.ts.
 */
export function createCombatSpatialIndex<
  Unit extends CombatSpatialUnit,
  Building extends CombatSpatialBuilding,
>(
  units: readonly Unit[],
  buildings: readonly Building[],
  requestedCellSize = 16,
): CombatSpatialIndex<Unit, Building> {
  const cellSize = Number.isFinite(requestedCellSize)
    ? Math.max(4, requestedCellSize)
    : 16;
  const index: CombatSpatialIndex<Unit, Building> = {
    cellSize,
    units: [],
    buildings: [],
    unitBuckets: new Map<CombatSpatialBucketKey, Unit[]>(),
    buildingBuckets: new Map<CombatSpatialBucketKey, Building[]>(),
    reusableUnitBuckets: [],
    reusableBuildingBuckets: [],
  };
  return rebuildCombatSpatialIndexInPlace(index, units, buildings);
}

/**
 * Refresh an existing combat index without replacing its Maps, active-entity
 * arrays, or per-cell bucket arrays. The index is still a snapshot: callers
 * rebuild it after movement/collision before a later planning pass.
 */
export function rebuildCombatSpatialIndexInPlace<
  Unit extends CombatSpatialUnit,
  Building extends CombatSpatialBuilding,
>(
  index: CombatSpatialIndex<Unit, Building>,
  units: readonly Unit[],
  buildings: readonly Building[],
): CombatSpatialIndex<Unit, Building> {
  index.units.length = 0;
  index.buildings.length = 0;
  recycleBuckets(index.unitBuckets, index.reusableUnitBuckets);
  recycleBuckets(index.buildingBuckets, index.reusableBuildingBuckets);

  for (const unit of units) {
    if (
      unit.hp <= 0 ||
      unit.garrisonedInBuildingId ||
      !Number.isFinite(unit.x) ||
      !Number.isFinite(unit.z)
    ) continue;

    index.units.push(unit);
    addToBucket(index.unitBuckets, index.reusableUnitBuckets, unit, index.cellSize);
  }

  for (const building of buildings) {
    if (
      building.hp <= 0 ||
      !Number.isFinite(building.x) ||
      !Number.isFinite(building.z)
    ) continue;

    index.buildings.push(building);
    addToBucket(index.buildingBuckets, index.reusableBuildingBuckets, building, index.cellSize);
  }

  return index;
}

/** Returns the living entities inside an exact circular query around a combat unit. */
export function queryCombatSpatialIndex<
  Unit extends CombatSpatialUnit,
  Building extends CombatSpatialBuilding,
>(
  index: CombatSpatialIndex<Unit, Building>,
  x: number,
  z: number,
  radius: number,
  output: CombatSpatialCandidates<Unit, Building> = { units: [], buildings: [] },
): CombatSpatialCandidates<Unit, Building> {
  output.units.length = 0;
  output.buildings.length = 0;

  if (
    !Number.isFinite(x) ||
    !Number.isFinite(z) ||
    (!Number.isFinite(radius) && radius !== Infinity) ||
    radius < 0
  ) {
    return output;
  }

  if (radius === Infinity) {
    for (const unit of index.units) {
      if (unit.hp > 0 && !unit.garrisonedInBuildingId) output.units.push(unit);
    }
    for (const building of index.buildings) {
      if (building.hp > 0) output.buildings.push(building);
    }
    return output;
  }

  const radiusSquared = radius * radius;
  const minCellX = Math.floor((x - radius) / index.cellSize);
  const maxCellX = Math.floor((x + radius) / index.cellSize);
  const minCellZ = Math.floor((z - radius) / index.cellSize);
  const maxCellZ = Math.floor((z + radius) / index.cellSize);
  for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
    for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ++) {
      const key = spatialCellKey(cellX, cellZ);
      const unitBucket = index.unitBuckets.get(key);
      if (unitBucket) {
        for (const unit of unitBucket) {
          if (unit.hp <= 0 || unit.garrisonedInBuildingId) continue;
          const dx = unit.x - x;
          const dz = unit.z - z;
          if (dx * dx + dz * dz <= radiusSquared) output.units.push(unit);
        }
      }

      const buildingBucket = index.buildingBuckets.get(key);
      if (buildingBucket) {
        for (const building of buildingBucket) {
          if (building.hp <= 0) continue;
          const dx = building.x - x;
          const dz = building.z - z;
          if (dx * dx + dz * dz <= radiusSquared) output.buildings.push(building);
        }
      }
    }
  }

  return output;
}


/** Returns nearby living buildings only, without visiting unit buckets. */
export function queryCombatSpatialBuildings<
  Unit extends CombatSpatialUnit,
  Building extends CombatSpatialBuilding,
>(
  index: CombatSpatialIndex<Unit, Building>,
  x: number,
  z: number,
  radius: number,
  output: Building[] = [],
): Building[] {
  output.length = 0;

  if (
    !Number.isFinite(x) ||
    !Number.isFinite(z) ||
    (!Number.isFinite(radius) && radius !== Infinity) ||
    radius < 0
  ) {
    return output;
  }

  if (radius === Infinity) {
    for (const building of index.buildings) {
      if (building.hp > 0) output.push(building);
    }
    return output;
  }

  const radiusSquared = radius * radius;
  const minCellX = Math.floor((x - radius) / index.cellSize);
  const maxCellX = Math.floor((x + radius) / index.cellSize);
  const minCellZ = Math.floor((z - radius) / index.cellSize);
  const maxCellZ = Math.floor((z + radius) / index.cellSize);

  for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
    for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ++) {
      const bucket = index.buildingBuckets.get(spatialCellKey(cellX, cellZ));
      if (!bucket) continue;
      for (const building of bucket) {
        if (building.hp <= 0) continue;
        const dx = building.x - x;
        const dz = building.z - z;
        if (dx * dx + dz * dz <= radiusSquared) output.push(building);
      }
    }
  }

  return output;
}

/** Returns nearby living units only, without scanning building buckets. */
export function queryCombatSpatialUnits<
  Unit extends CombatSpatialUnit,
  Building extends CombatSpatialBuilding,
>(
  index: CombatSpatialIndex<Unit, Building>,
  x: number,
  z: number,
  radius: number,
  output: Unit[] = [],
): Unit[] {
  output.length = 0;

  if (
    !Number.isFinite(x) ||
    !Number.isFinite(z) ||
    (!Number.isFinite(radius) && radius !== Infinity) ||
    radius < 0
  ) {
    return output;
  }

  if (radius === Infinity) {
    for (const unit of index.units) {
      if (unit.hp > 0 && !unit.garrisonedInBuildingId) output.push(unit);
    }
    return output;
  }

  const radiusSquared = radius * radius;
  const minCellX = Math.floor((x - radius) / index.cellSize);
  const maxCellX = Math.floor((x + radius) / index.cellSize);
  const minCellZ = Math.floor((z - radius) / index.cellSize);
  const maxCellZ = Math.floor((z + radius) / index.cellSize);

  for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
    for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ++) {
      const bucket = index.unitBuckets.get(spatialCellKey(cellX, cellZ));
      if (!bucket) continue;
      for (const unit of bucket) {
        if (unit.hp <= 0 || unit.garrisonedInBuildingId) continue;
        const dx = unit.x - x;
        const dz = unit.z - z;
        if (dx * dx + dz * dz <= radiusSquared) output.push(unit);
      }
    }
  }

  return output;
}
