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
export function getBuildingCollisionRadius(b: Pick<BuildingEntity, 'buildingType' | 'buildingDef'>): number {
  if (b.buildingType === 'farm') return 0;
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
    case 'lumber_camp':
    case 'mining_camp':
      return 2.05;
    case 'dock':
      return 2.15;
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

/**
 * Resolves soft unit-to-unit collisions to prevent overlapping blobs.
 */
export function resolveUnitUnitCollisions(units: UnitEntity[], pushStrength = 0.52): void {
  const len = units.length;
  for (let i = 0; i < len; i++) {
    const u1 = units[i];
    if (u1.hp <= 0 || u1.garrisonedInBuildingId) continue;
    const r1 = getUnitColliderRadius(u1.unitDef.category, u1.unitDef.visual.scale);

    for (let j = i + 1; j < len; j++) {
      const u2 = units[j];
      if (u2.hp <= 0 || u2.garrisonedInBuildingId) continue;
      const r2 = getUnitColliderRadius(u2.unitDef.category, u2.unitDef.visual.scale);

      const dx = u2.x - u1.x;
      const dz = u2.z - u1.z;
      const dist = Math.hypot(dx, dz);
      const minDist = r1 + r2;

      if (dist < minDist) {
        const overlap = minDist - dist;
        let nx = dx;
        let nz = dz;
        if (dist > 0.0001) {
          nx /= dist;
          nz /= dist;
        } else {
          nx = (i % 2 === 0 ? 1 : -1) * 0.7071;
          nz = 0.7071;
        }

        const push = overlap * 0.5 * pushStrength;
        u1.x -= nx * push;
        u1.z -= nz * push;
        u2.x += nx * push;
        u2.z += nz * push;
      }
    }
  }
}

/**
 * Resolves hard unit-to-building collisions so units never walk inside solid walls/structures,
 * while freely crossing farm fields and gliding cleanly along walls.
 */
export function resolveUnitBuildingCollisions(units: UnitEntity[], buildings: BuildingEntity[]): void {
  for (const u of units) {
    if (u.hp <= 0 || u.garrisonedInBuildingId) continue;
    const uRadius = getUnitColliderRadius(u.unitDef.category, u.unitDef.visual.scale);

    for (const b of buildings) {
      if (b.hp <= 0) continue;
      const bRadius = getBuildingCollisionRadius(b);
      if (bRadius <= 0) continue; // Walkable farm field

      const minDist = bRadius + uRadius;
      const dx = u.x - b.x;
      const dz = u.z - b.z;
      const dist = Math.hypot(dx, dz);

      if (dist < minDist) {
        let nx = dx;
        let nz = dz;
        if (dist > 0.0001) {
          nx /= dist;
          nz /= dist;
        } else {
          nx = 1;
          nz = 0;
        }

        u.x = b.x + nx * (minDist + 0.02);
        u.z = b.z + nz * (minDist + 0.02);
      }
    }
  }
}

/**
 * Resolves hard unit-to-resource-node collisions so units cannot step inside boulders/tree trunks.
 * Farm food crops are walkable; active harvesters stop cleanly at the outer edge within gather reach.
 */
export function resolveUnitResourceCollisions(units: UnitEntity[], nodes: ResourceNode[]): void {
  for (const u of units) {
    if (u.hp <= 0 || u.garrisonedInBuildingId) continue;
    const uRadius = getUnitColliderRadius(u.unitDef.category, u.unitDef.visual.scale);

    for (const n of nodes) {
      if (n.amount <= 0) continue;
      // Farm crops (subtype 'farm' or legacy food without berry/hunt) are walkable
      if (n.resourceType === 'food' && (!n.subtype || n.subtype === 'farm')) continue;

      const nRadius = getResourceColliderRadius(n.resourceType, n.subtype);
      const isTargetHarvester = u.state === 'gathering' && u.targetResourceNodeId === n.id;
      const minDist = isTargetHarvester ? nRadius + uRadius * 0.45 : nRadius + uRadius;

      const dx = u.x - n.x;
      const dz = u.z - n.z;
      const dist = Math.hypot(dx, dz);

      if (dist < minDist) {
        let nx = dx;
        let nz = dz;
        if (dist > 0.0001) {
          nx /= dist;
          nz /= dist;
        } else {
          nx = 0;
          nz = 1;
        }

        u.x = n.x + nx * (minDist + 0.02);
        u.z = n.z + nz * (minDist + 0.02);
      }
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
