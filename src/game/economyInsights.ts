import type { Resources, ResourceType } from '../types/game';

export type EconomyNetRates = Record<ResourceType, number>;

export interface EconomyResourceSnapshot {
  /** Simulated match time in seconds, not wall-clock time. */
  gameTime: number;
  resources: Pick<Resources, ResourceType>;
}

export type ResourceHealthStatus = 'critical' | 'warning' | 'draining' | 'growing' | 'stable';

const RESOURCE_TYPES: ResourceType[] = ['food', 'wood', 'gold', 'stone'];

/**
 * Estimates net stock change per simulated minute between two inventory samples.
 * This intentionally includes all gains and costs (gathering, passive income,
 * training, construction, research and age advancement) rather than presenting
 * a misleading "income" number.
 */
export function calculateEconomyNetRates(
  older: EconomyResourceSnapshot | null | undefined,
  newer: EconomyResourceSnapshot | null | undefined,
  minimumWindowSeconds = 8,
): EconomyNetRates | null {
  if (!older || !newer) return null;
  const elapsed = newer.gameTime - older.gameTime;
  if (!Number.isFinite(elapsed) || elapsed < Math.max(1, minimumWindowSeconds)) return null;

  const result = {} as EconomyNetRates;
  for (const resource of RESOURCE_TYPES) {
    const before = older.resources[resource];
    const after = newer.resources[resource];
    if (!Number.isFinite(before) || !Number.isFinite(after)) return null;
    result[resource] = ((after - before) / elapsed) * 60;
  }
  return result;
}

/** Classifies stock risk using estimated time to depletion when net flow is negative. */
export function getResourceHealthStatus(
  stock: number,
  netPerMinute: number | null | undefined,
): { status: ResourceHealthStatus; runwayMinutes: number | null } {
  const safeStock = Number.isFinite(stock) ? Math.max(0, stock) : 0;
  const rate = Number.isFinite(netPerMinute) ? (netPerMinute as number) : 0;

  if (safeStock <= 0 && rate <= 0) {
    return { status: 'critical', runwayMinutes: 0 };
  }
  if (rate < -0.05) {
    const runwayMinutes = safeStock / Math.abs(rate);
    if (runwayMinutes <= 1) return { status: 'critical', runwayMinutes };
    if (runwayMinutes <= 3) return { status: 'warning', runwayMinutes };
    return { status: 'draining', runwayMinutes };
  }
  if (rate > 0.05) return { status: 'growing', runwayMinutes: null };
  return { status: 'stable', runwayMinutes: null };
}

export function calculateAgeResourceShortfall(
  stock: Pick<Resources, 'food' | 'gold'>,
  cost: Pick<Resources, 'food' | 'gold'>,
): { food: number; gold: number; ready: boolean } {
  // Keep the HUD/AI readiness signal finite even if a save, mod, or transient
  // simulation state contains invalid resource values. Invalid stock is treated
  // as empty; invalid or negative requirements are treated as zero, matching
  // getAgeResourceProgress and preventing NaN from leaking into UI comparisons.
  const safeStock = (value: number): number =>
    Number.isFinite(value) ? Math.max(0, value) : 0;
  const safeCost = (value: number): number =>
    Number.isFinite(value) ? Math.max(0, value) : 0;
  const food = Math.max(0, Math.ceil(safeCost(cost.food) - safeStock(stock.food)));
  const gold = Math.max(0, Math.ceil(safeCost(cost.gold) - safeStock(stock.gold)));
  return { food, gold, ready: food === 0 && gold === 0 };
}

/**
 * Converts a worker's theoretical gather speed into estimated delivered output.
 * Travel distance is the one-way walkable route between the harvesting stance
 * and the nearest valid drop-off stance. The worker must travel both directions
 * for each full carry load.
 */
export function estimateDeliveredResourcePerMinute(
  gatherPerSecond: number,
  carryCapacity: number,
  moveSpeed: number,
  oneWayTravelDistance: number,
): number {
  if (
    !Number.isFinite(gatherPerSecond) || gatherPerSecond <= 0 ||
    !Number.isFinite(carryCapacity) || carryCapacity <= 0 ||
    !Number.isFinite(moveSpeed) || moveSpeed <= 0 ||
    !Number.isFinite(oneWayTravelDistance) || oneWayTravelDistance < 0
  ) return 0;

  const gatheringSeconds = carryCapacity / gatherPerSecond;
  const roundTripTravelSeconds = (2 * oneWayTravelDistance) / moveSpeed;
  const cycleSeconds = gatheringSeconds + roundTripTravelSeconds;
  if (!Number.isFinite(cycleSeconds) || cycleSeconds <= 0) return 0;
  return (carryCapacity / cycleSeconds) * 60;
}

export interface ResourceDropOffBuildingCandidate {
  id: string;
  faction: string;
  isConstructed: boolean;
  hp: number;
  buildingType: string;
  x: number;
  z: number;
}

/**
 * Pick the nearest valid drop-off in one pass, avoiding a filtered building
 * array and a second distance loop for every worker/resource-node candidate.
 * Equal distances preserve original building insertion order.
 */
export function selectNearestResourceDropOffBuilding<T extends ResourceDropOffBuildingCandidate>(
  buildings: readonly T[],
  faction: string,
  resourceType: ResourceType,
  isNaval: boolean,
  originX: number,
  originZ: number,
): T | null {
  if (!Number.isFinite(originX) || !Number.isFinite(originZ)) return null;

  let nearest: T | null = null;
  let nearestDistanceSquared = Number.POSITIVE_INFINITY;
  for (const building of buildings) {
    if (
      building.faction !== faction ||
      !building.isConstructed ||
      !Number.isFinite(building.hp) ||
      building.hp <= 0 ||
      !Number.isFinite(building.x) ||
      !Number.isFinite(building.z)
    ) continue;

    const type = building.buildingType;
    const eligible = isNaval
      ? type === 'dock'
      : type === 'town_center' ||
        (resourceType === 'food' && (type === 'dock' || type === 'granary' || type === 'farm')) ||
        (resourceType === 'wood' && type === 'lumber_camp') ||
        ((resourceType === 'gold' || resourceType === 'stone') && type === 'mining_camp');
    if (!eligible) continue;

    const dx = originX - building.x;
    const dz = originZ - building.z;
    const distanceSquared = dx * dx + dz * dz;
    if (distanceSquared < nearestDistanceSquared) {
      nearest = building;
      nearestDistanceSquared = distanceSquared;
      // An exact-position depot is the best possible result. Returning now
      // also preserves first-insertion tie behavior for duplicate locations.
      if (distanceSquared === 0) return building;
    }
  }

  return nearest;
}
