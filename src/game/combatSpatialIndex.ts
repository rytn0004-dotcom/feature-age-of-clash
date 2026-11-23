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
  unitBuckets: Map<string, Unit[]>;
  buildingBuckets: Map<string, Building[]>;
}

export interface CombatSpatialCandidates<
  Unit extends CombatSpatialUnit = CombatSpatialUnit,
  Building extends CombatSpatialBuilding = CombatSpatialBuilding,
> {
  units: Unit[];
  buildings: Building[];
}

const spatialKey = (x: number, z: number, cellSize: number): string =>
  Math.floor(x / cellSize) + ':' + Math.floor(z / cellSize);

function addToBucket<T extends CombatSpatialUnit | CombatSpatialBuilding>(
  buckets: Map<string, T[]>,
  entity: T,
  cellSize: number,
): void {
  const key = spatialKey(entity.x, entity.z, cellSize);
  const bucket = buckets.get(key);
  if (bucket) bucket.push(entity);
  else buckets.set(key, [entity]);
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
  const activeUnits = units.filter(
    (unit) =>
      unit.hp > 0 &&
      !unit.garrisonedInBuildingId &&
      Number.isFinite(unit.x) &&
      Number.isFinite(unit.z),
  );
  const activeBuildings = buildings.filter(
    (building) =>
      building.hp > 0 &&
      Number.isFinite(building.x) &&
      Number.isFinite(building.z),
  );
  const unitBuckets = new Map<string, Unit[]>();
  const buildingBuckets = new Map<string, Building[]>();

  for (const unit of activeUnits) addToBucket(unitBuckets, unit, cellSize);
  for (const building of activeBuildings) addToBucket(buildingBuckets, building, cellSize);

  return {
    cellSize,
    units: activeUnits,
    buildings: activeBuildings,
    unitBuckets,
    buildingBuckets,
  };
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
): CombatSpatialCandidates<Unit, Building> {
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(z) ||
    (!Number.isFinite(radius) && radius !== Infinity) ||
    radius < 0
  ) {
    return { units: [], buildings: [] };
  }

  if (radius === Infinity) {
    return {
      units: index.units.filter((unit) => unit.hp > 0 && !unit.garrisonedInBuildingId),
      buildings: index.buildings.filter((building) => building.hp > 0),
    };
  }

  const radiusSquared = radius * radius;
  const minCellX = Math.floor((x - radius) / index.cellSize);
  const maxCellX = Math.floor((x + radius) / index.cellSize);
  const minCellZ = Math.floor((z - radius) / index.cellSize);
  const maxCellZ = Math.floor((z + radius) / index.cellSize);
  const nearbyUnits: Unit[] = [];
  const nearbyBuildings: Building[] = [];

  for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
    for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ++) {
      const key = cellX + ':' + cellZ;
      const unitBucket = index.unitBuckets.get(key);
      if (unitBucket) {
        for (const unit of unitBucket) {
          if (unit.hp <= 0 || unit.garrisonedInBuildingId) continue;
          const dx = unit.x - x;
          const dz = unit.z - z;
          if (dx * dx + dz * dz <= radiusSquared) nearbyUnits.push(unit);
        }
      }

      const buildingBucket = index.buildingBuckets.get(key);
      if (buildingBucket) {
        for (const building of buildingBucket) {
          if (building.hp <= 0) continue;
          const dx = building.x - x;
          const dz = building.z - z;
          if (dx * dx + dz * dz <= radiusSquared) nearbyBuildings.push(building);
        }
      }
    }
  }

  return { units: nearbyUnits, buildings: nearbyBuildings };
}
