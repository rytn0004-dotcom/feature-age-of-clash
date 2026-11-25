import type { CombatSpatialUnit } from './combatSpatialIndex';

export interface WildlifeInteractionUnit extends CombatSpatialUnit {
  unitDef: {
    category: string;
    isNaval?: boolean;
    stats: { range?: number };
  };
  state: string;
  attackMoveGoal?: unknown;
}

export interface WildlifeThreatVector {
  x: number;
  z: number;
  d: number;
}

/** Caller-owned scratch keeps local animal queries allocation-free across simulation ticks. */
export interface WildlifeUnitInteractionScratch<
  Unit extends WildlifeInteractionUnit = WildlifeInteractionUnit,
> {
  nearestThreat: WildlifeThreatVector | null;
  attackers: Unit[];
}

/**
 * Selects only local deer interactions from an already broad-phase-filtered unit list.
 * Idle ground units still frighten deer; only active non-worker attackers damage them.
 */
export function collectWildlifeUnitInteractions<Unit extends WildlifeInteractionUnit>(
  candidates: readonly Unit[],
  animalX: number,
  animalZ: number,
  detectRadius: number,
  output: WildlifeUnitInteractionScratch<Unit>,
): WildlifeUnitInteractionScratch<Unit> {
  const reusableNearest = output.nearestThreat;
  output.nearestThreat = null;
  output.attackers.length = 0;

  if (
    !Number.isFinite(animalX) ||
    !Number.isFinite(animalZ) ||
    !Number.isFinite(detectRadius) ||
    detectRadius < 0
  ) {
    return output;
  }

  let nearestDistance = detectRadius;
  for (const unit of candidates) {
    if (
      unit.hp <= 0 ||
      unit.garrisonedInBuildingId ||
      unit.unitDef.isNaval ||
      !Number.isFinite(unit.x) ||
      !Number.isFinite(unit.z)
    ) {
      continue;
    }

    const distance = Math.hypot(unit.x - animalX, unit.z - animalZ);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      const nearest = reusableNearest ?? { x: unit.x, z: unit.z, d: distance };
      nearest.x = unit.x;
      nearest.z = unit.z;
      nearest.d = distance;
      output.nearestThreat = nearest;
    }

    if (isActiveWildlifeHunter(unit)) {
      const range = unit.unitDef.stats.range || 1.5;
      const attackDistance = Math.max(2.4, range + 0.5);
      if (distance <= attackDistance) output.attackers.push(unit);
    }
  }

  return output;
}


/** True only for living ground combat units currently executing an attack order. */
function isActiveWildlifeHunter(unit: WildlifeInteractionUnit): boolean {
  return (
    unit.hp > 0 &&
    !unit.garrisonedInBuildingId &&
    !unit.unitDef.isNaval &&
    unit.unitDef.category !== 'worker' &&
    (unit.state === 'attacking' || !!unit.attackMoveGoal)
  );
}

/**
 * Returns the broad-phase radius needed for deer perception and active hunter reach.
 * Idle units and workers cannot inflate the radius or force a whole-map query.
 */
export function getWildlifeInteractionQueryRadius(
  units: readonly WildlifeInteractionUnit[],
  detectRadius: number,
): number {
  if (!Number.isFinite(detectRadius) || detectRadius < 0) return 0;
  let radius = detectRadius;
  for (const unit of units) {
    if (!isActiveWildlifeHunter(unit)) continue;
    const range = unit.unitDef.stats.range || 1.5;
    if (range === Number.POSITIVE_INFINITY) return Number.POSITIVE_INFINITY;
    if (Number.isFinite(range)) radius = Math.max(radius, Math.max(2.4, range + 0.5));
  }
  return radius;
}

export interface WildlifeHunterCooldown {
  /** Simulation timestamp when this unit may damage another deer. */
  wildlifeHuntReadyAt?: number;
}

/**
 * Consumes a hunter's shared deer-attack cooldown exactly once per simulation time.
 * Keeping an absolute deadline avoids decrementing the same unit once per nearby deer.
 */
export function tryConsumeWildlifeHunterAttack(
  unit: WildlifeHunterCooldown,
  simTime: number,
  attackRate: number,
): boolean {
  if (!Number.isFinite(simTime)) return false;
  const readyAt = Number.isFinite(unit.wildlifeHuntReadyAt) ? unit.wildlifeHuntReadyAt! : 0;
  if (readyAt > simTime) return false;
  const safeRate = Number.isFinite(attackRate) ? Math.max(0.35, attackRate) : 1;
  unit.wildlifeHuntReadyAt = simTime + Math.max(0.5, 1 / safeRate);
  return true;
}


export interface WildlifeGatheringUnit extends CombatSpatialUnit {
  state: string;
  targetResourceNodeId?: string;
  unitDef: {
    isNaval?: boolean;
  };
}

/**
 * Rebuilds a reusable node -> active gatherers index in one unit pass.
 * Bucket arrays are recycled between frames so the map adds no per-frame array churn.
 */
export function rebuildWildlifeGathererIndex<Unit extends WildlifeGatheringUnit>(
  units: readonly Unit[],
  output: Map<string, Unit[]>,
  reusableBuckets: Unit[][],
): Map<string, Unit[]> {
  for (const bucket of output.values()) {
    bucket.length = 0;
    reusableBuckets.push(bucket);
  }
  output.clear();

  for (const unit of units) {
    const nodeId = unit.targetResourceNodeId;
    if (
      !nodeId ||
      unit.hp <= 0 ||
      unit.garrisonedInBuildingId ||
      unit.unitDef.isNaval ||
      unit.state !== 'gathering' ||
      !Number.isFinite(unit.x) ||
      !Number.isFinite(unit.z)
    ) continue;

    let bucket = output.get(nodeId);
    if (!bucket) {
      bucket = reusableBuckets.pop() ?? [];
      output.set(nodeId, bucket);
    }
    bucket.push(unit);
  }
  return output;
}
