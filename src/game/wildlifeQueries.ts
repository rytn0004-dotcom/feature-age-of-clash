import type { CombatSpatialUnit } from './combatSpatialIndex';

export interface WildlifeInteractionUnit extends CombatSpatialUnit {
  unitDef: {
    category: string;
    isNaval?: boolean;
    stats: { range?: number };
  };
  state: string;
  attackMoveGoal?: unknown;
  targetResourceNodeId?: string;
}

export interface WildlifeThreatVector {
  x: number;
  z: number;
  d: number;
}

/** Caller-owned scratch keeps local animal queries allocation-free across simulation ticks. */
export interface WildlifeHuntPartyCandidate {
  x: number;
  z: number;
  unitDef: { category: string };
}

export interface WildlifeHuntPartySelectionScratch<
  Unit extends WildlifeHuntPartyCandidate = WildlifeHuntPartyCandidate,
> {
  units: Unit[];
  distances: number[];
  /** Top frontline candidates are staged here before the nearest remaining hunters are appended. */
  frontlineUnits: Unit[];
  frontlineDistances: number[];
}

/**
 * Selects a nearby hunting party while reserving frontline coverage when available.
 * The output is ordered frontliners first, then the nearest remaining hunters.
 * All arrays are caller-owned and reused; equal-distance candidates retain roster order.
 */
export function selectNearestWildlifeHuntParty<Unit extends WildlifeHuntPartyCandidate>(
  candidates: readonly Unit[],
  targetX: number,
  targetZ: number,
  maxCount: number,
  output: WildlifeHuntPartySelectionScratch<Unit>,
  preferredFrontlineCount = 0,
): Unit[] {
  output.units.length = 0;
  output.distances.length = 0;
  output.frontlineUnits.length = 0;
  output.frontlineDistances.length = 0;

  if (
    !Number.isFinite(targetX) ||
    !Number.isFinite(targetZ) ||
    !Number.isFinite(maxCount) ||
    !Number.isFinite(preferredFrontlineCount)
  ) {
    return output.units;
  }

  const limit = Math.min(candidates.length, Math.max(0, Math.floor(maxCount)));
  const frontlineLimit = Math.min(limit, Math.max(0, Math.floor(preferredFrontlineCount)));
  if (limit === 0) return output.units;

  // First retain the nearest melee/cavalry screen. These units protect ranged hunters
  // from being the only available target when dangerous wildlife counterattacks.
  if (frontlineLimit > 0) {
    for (const candidate of candidates) {
      if (
        candidate.unitDef.category !== 'melee' &&
        candidate.unitDef.category !== 'cavalry'
      ) continue;
      if (!Number.isFinite(candidate.x) || !Number.isFinite(candidate.z)) continue;

      const distance = Math.hypot(candidate.x - targetX, candidate.z - targetZ);
      let insertAt = output.frontlineDistances.length;
      while (insertAt > 0 && distance < output.frontlineDistances[insertAt - 1]) {
        insertAt--;
      }
      if (insertAt >= frontlineLimit) continue;

      const nextLength = Math.min(frontlineLimit, output.frontlineUnits.length + 1);
      for (let index = nextLength - 1; index > insertAt; index--) {
        output.frontlineUnits[index] = output.frontlineUnits[index - 1];
        output.frontlineDistances[index] = output.frontlineDistances[index - 1];
      }
      output.frontlineUnits[insertAt] = candidate;
      output.frontlineDistances[insertAt] = distance;
      output.frontlineUnits.length = nextLength;
      output.frontlineDistances.length = nextLength;
    }
  }

  const frontlineCount = output.frontlineUnits.length;
  for (let index = 0; index < frontlineCount; index++) {
    output.units.push(output.frontlineUnits[index]);
    output.distances.push(output.frontlineDistances[index]);
  }

  // Fill remaining slots with the nearest non-reserved candidates. Frontline units
  // outside the protected pair may still fill spare slots when fewer other roles exist.
  for (const candidate of candidates) {
    let alreadyReserved = false;
    for (let index = 0; index < frontlineCount; index++) {
      if (output.frontlineUnits[index] === candidate) {
        alreadyReserved = true;
        break;
      }
    }
    if (alreadyReserved || !Number.isFinite(candidate.x) || !Number.isFinite(candidate.z)) continue;

    const distance = Math.hypot(candidate.x - targetX, candidate.z - targetZ);
    let insertAt = output.units.length;
    while (insertAt > frontlineCount && distance < output.distances[insertAt - 1]) {
      insertAt--;
    }
    if (insertAt >= limit) continue;

    const nextLength = Math.min(limit, output.units.length + 1);
    for (let index = nextLength - 1; index > insertAt; index--) {
      output.units[index] = output.units[index - 1];
      output.distances[index] = output.distances[index - 1];
    }
    output.units[insertAt] = candidate;
    output.distances[insertAt] = distance;
    output.units.length = nextLength;
    output.distances.length = nextLength;
  }

  return output.units;
}

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

  const detectRadiusSquared = detectRadius * detectRadius;
  let nearestDistanceSquared = detectRadiusSquared;
  let nearestThreatId: string | null = null;
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

    // Most candidates only need a squared-distance comparison. Calculate the
    // square root only when a new nearest threat is selected and its true
    // distance is written to the reusable flee vector.
    const dx = unit.x - animalX;
    const dz = unit.z - animalZ;
    const distanceSquared = dx * dx + dz * dz;
    if (
      distanceSquared < nearestDistanceSquared ||
      (distanceSquared === nearestDistanceSquared && nearestThreatId !== null && unit.id < nearestThreatId)
    ) {
      nearestDistanceSquared = distanceSquared;
      nearestThreatId = unit.id;
      const distance = Math.sqrt(distanceSquared);
      const nearest = reusableNearest ?? { x: unit.x, z: unit.z, d: distance };
      nearest.x = unit.x;
      nearest.z = unit.z;
      nearest.d = distance;
      output.nearestThreat = nearest;
    }

    if (isActiveWildlifeHunter(unit)) {
      const range = unit.unitDef.stats.range || 1.5;
      const attackDistance = unit.unitDef.category === 'ranged'
        ? Math.max(4.8, range + 0.5)
        : Math.max(2.4, range + 0.5);
      if (distanceSquared <= attackDistance * attackDistance) output.attackers.push(unit);
    }
  }

  return output;
}


/** Armed ground roles may hunt only while attacking/attack-moving or assigned to a resource node. */
function isActiveWildlifeHunter(unit: WildlifeInteractionUnit): boolean {
  const isArmedGroundRole =
    unit.unitDef.category === 'melee' ||
    unit.unitDef.category === 'ranged' ||
    unit.unitDef.category === 'cavalry' ||
    unit.unitDef.category === 'special';

  // Direct gather orders already run their own attack cadence in stepUnitGathering.
  // This ambient pass is reserved for autonomous attack and attack-move behavior.
  return (
    unit.hp > 0 &&
    !unit.garrisonedInBuildingId &&
    !unit.unitDef.isNaval &&
    isArmedGroundRole &&
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
    if (Number.isFinite(range)) {
      const reach = unit.unitDef.category === 'ranged'
        ? Math.max(4.8, range + 0.5)
        : Math.max(2.4, range + 0.5);
      radius = Math.max(radius, reach);
    }
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


export interface WildlifeHunterAttackUnit extends WildlifeInteractionUnit, WildlifeHunterCooldown {
  unitDef: {
    category: string;
    isNaval?: boolean;
    stats: { range?: number; attack?: number; attackRate?: number };
  };
}

export interface WildlifeAnimalHealth {
  animalAlive?: boolean;
  animalHp?: number;
}

/**
 * Applies one simulation slice of wildlife attacks and stops as soon as the
 * animal dies. Later hunters must not spend their shared cooldown or emit
 * duplicate hit/death effects against an already-dead animal.
 */
export function applyWildlifeHunterAttacks<Unit extends WildlifeHunterAttackUnit>(
  animal: WildlifeAnimalHealth,
  attackers: readonly Unit[],
  simTime: number,
  onHit: (attacker: Unit, damage: number) => void,
  onKill: () => void,
): number {
  const initialHp = animal.animalHp;
  if (
    animal.animalAlive === false ||
    !Number.isFinite(initialHp) ||
    (initialHp ?? 0) <= 0 ||
    !Number.isFinite(simTime)
  ) {
    return 0;
  }

  let remainingHp = initialHp as number;
  let appliedAttacks = 0;
  for (const attacker of attackers) {
    if (remainingHp <= 0) break;
    if (!isActiveWildlifeHunter(attacker)) continue;
    if (!tryConsumeWildlifeHunterAttack(attacker, simTime, attacker.unitDef.stats.attackRate || 1)) continue;

    const rawDamage = attacker.unitDef.stats.attack;
    const damage = Math.max(1, Number.isFinite(rawDamage) ? rawDamage as number : 1);
    remainingHp = Math.max(0, remainingHp - damage);
    animal.animalHp = remainingHp;
    appliedAttacks++;
    onHit(attacker, damage);

    if (remainingHp <= 0) {
      animal.animalAlive = false;
      onKill();
      break;
    }
  }

  return appliedAttacks;
}
