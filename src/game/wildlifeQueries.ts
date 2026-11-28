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
  /** Top frontline candidates are reserved before ranged support. */
  frontlineUnits: Unit[];
  frontlineDistances: number[];
  /** Ranged hunters are reserved after the frontline screen and before nearby fillers. */
  rangedUnits: Unit[];
  rangedDistances: number[];
}

/** Maximum number of villagers that can work one wildlife carcass at the same time. */
export const WILDLIFE_CARCASS_HARVEST_CAPACITY = {
  hunt: 3,
  boar: 4,
  aurochs: 6,
} as const;

export function getWildlifeCarcassHarvestCapacity(subtype?: string): number {
  if (subtype === 'hunt') return WILDLIFE_CARCASS_HARVEST_CAPACITY.hunt;
  if (subtype === 'boar') return WILDLIFE_CARCASS_HARVEST_CAPACITY.boar;
  if (subtype === 'aurochs') return WILDLIFE_CARCASS_HARVEST_CAPACITY.aurochs;
  return 0;
}

/** Re-evaluate carcass work slots at a stable cadence rather than on every render/update slice. */
export const WILDLIFE_CARCASS_ASSIGNMENT_REFRESH_SECONDS = 0.12;

/** Keep a current worker in its slot unless a newcomer is meaningfully closer. */
export const WILDLIFE_CARCASS_SLOT_RETENTION_DISTANCE = 2;

export interface WildlifeCarcassHarvesterCandidate {
  id: string;
  x: number;
  z: number;
  hp: number;
  state: string;
  targetResourceNodeId?: string;
  garrisonedInBuildingId?: string;
  wildlifeCarcassHarvestNodeId?: string;
  wildlifeCarcassHarvestActive?: boolean;
  wildlifeCarcassHarvestSlotIndex?: number;
  carryingResource?: { amount: number };
  unitDef: {
    category: string;
    isNaval?: boolean;
    stats?: { carryCapacity?: number };
  };
}

export interface WildlifeCarcassHarvestSelectionScratch<
  Unit extends WildlifeCarcassHarvesterCandidate = WildlifeCarcassHarvesterCandidate,
> {
  /** Nearest eligible villagers, ordered by weighted distance then stable unit ID. */
  units: Unit[];
  distances: number[];
}

/**
 * Preserve an incumbent's exact ring-sector index while assigning unused sectors
 * to newcomers. Existing slots are reserved in a first pass so a newly selected
 * close worker cannot steal a later incumbent's sector.
 *
 * The caller owns a boolean buffer sized to the maximum supported carcass capacity.
 */
export function assignWildlifeCarcassHarvestSlotIndices<
  Unit extends WildlifeCarcassHarvesterCandidate,
>(
  selected: readonly Unit[],
  nodeId: string,
  maxCount: number,
  usedSlots: boolean[],
): void {
  const limit = Number.isFinite(maxCount)
    ? Math.min(usedSlots.length, Math.max(0, Math.floor(maxCount)))
    : 0;
  for (let index = 0; index < usedSlots.length; index++) usedSlots[index] = false;
  if (!nodeId || limit === 0) {
    for (const unit of selected) unit.wildlifeCarcassHarvestSlotIndex = undefined;
    return;
  }

  // Reserve all still-valid incumbent sectors before allocating newcomer sectors.
  for (const unit of selected) {
    const slotIndex = unit.wildlifeCarcassHarvestSlotIndex;
    const isIncumbent =
      unit.wildlifeCarcassHarvestNodeId === nodeId &&
      unit.wildlifeCarcassHarvestActive === true &&
      Number.isInteger(slotIndex) &&
      (slotIndex as number) >= 0 &&
      (slotIndex as number) < limit &&
      !usedSlots[slotIndex as number];
    if (isIncumbent) usedSlots[slotIndex as number] = true;
    else unit.wildlifeCarcassHarvestSlotIndex = undefined;
  }

  // Allocate each newcomer the first free sector for deterministic recovery.
  for (const unit of selected) {
    if (Number.isInteger(unit.wildlifeCarcassHarvestSlotIndex)) continue;
    let freeSlot = 0;
    while (freeSlot < limit && usedSlots[freeSlot]) freeSlot++;
    if (freeSlot >= limit) {
      unit.wildlifeCarcassHarvestSlotIndex = undefined;
      continue;
    }
    usedSlots[freeSlot] = true;
    unit.wildlifeCarcassHarvestSlotIndex = freeSlot;
  }
}

/**
 * Selects only the nearest eligible villagers up to the carcass's physical work
 * capacity. Existing workers keep their slot unless a newcomer is more than
 * WILDLIFE_CARCASS_SLOT_RETENTION_DISTANCE closer, avoiding repeated role swaps
 * while units are pathing around one another. The bounded insertion buffer is
 * O(candidateCount * capacity), with no full-candidate sort or copy.
 */
export function selectNearestWildlifeCarcassHarvesters<
  Unit extends WildlifeCarcassHarvesterCandidate,
>(
  candidates: readonly Unit[],
  nodeId: string,
  nodeX: number,
  nodeZ: number,
  maxCount: number,
  output: WildlifeCarcassHarvestSelectionScratch<Unit>,
): Unit[] {
  output.units.length = 0;
  output.distances.length = 0;
  if (
    !nodeId ||
    !Number.isFinite(nodeX) ||
    !Number.isFinite(nodeZ) ||
    !Number.isFinite(maxCount) ||
    maxCount <= 0
  ) return output.units;

  const limit = Math.min(candidates.length, Math.max(0, Math.floor(maxCount)));
  if (limit === 0) return output.units;

  for (const candidate of candidates) {
    if (
      !candidate.id ||
      !Number.isFinite(candidate.hp) ||
      candidate.hp <= 0 ||
      candidate.unitDef.category !== 'worker' ||
      candidate.unitDef.isNaval ||
      candidate.state !== 'gathering' ||
      candidate.targetResourceNodeId !== nodeId ||
      candidate.garrisonedInBuildingId ||
      !Number.isFinite(candidate.x) ||
      !Number.isFinite(candidate.z)
    ) continue;

    if (candidate.carryingResource) {
      const cargo = candidate.carryingResource.amount;
      const capacity = candidate.unitDef.stats?.carryCapacity;
      if (!Number.isFinite(cargo) || cargo < 0) continue;
      if (Number.isFinite(capacity) && (capacity as number) > 0 && cargo >= (capacity as number)) continue;
    }

    const distance = Math.hypot(candidate.x - nodeX, candidate.z - nodeZ);
    if (!Number.isFinite(distance)) continue;

    const candidateIsIncumbent =
      candidate.wildlifeCarcassHarvestNodeId === nodeId &&
      candidate.wildlifeCarcassHarvestActive === true;
    const candidatePriority = distance - (
      candidateIsIncumbent ? WILDLIFE_CARCASS_SLOT_RETENTION_DISTANCE : 0
    );
    let insertAt = output.distances.length;
    while (insertAt > 0) {
      const previousDistance = output.distances[insertAt - 1];
      const previous = output.units[insertAt - 1];
      const previousIsIncumbent =
        previous.wildlifeCarcassHarvestNodeId === nodeId &&
        previous.wildlifeCarcassHarvestActive === true;
      const previousPriority = previousDistance - (
        previousIsIncumbent ? WILDLIFE_CARCASS_SLOT_RETENTION_DISTANCE : 0
      );
      const isHigherPriority = candidatePriority < previousPriority - 1e-9;
      const isStableTie = Math.abs(candidatePriority - previousPriority) <= 1e-9 &&
        candidate.id.localeCompare(previous.id) < 0;
      if (!isHigherPriority && !isStableTie) break;
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

export interface WildlifeCarcassWaitingPoint {
  x: number;
  z: number;
}

/** Stable outer staging point used by overflow villagers while carcass slots are full. */
export function writeWildlifeCarcassWaitingPoint(
  output: WildlifeCarcassWaitingPoint,
  nodeX: number,
  nodeZ: number,
  nodeRadius: number,
  waitAngle: number,
): WildlifeCarcassWaitingPoint {
  const safeX = Number.isFinite(nodeX) ? nodeX : 0;
  const safeZ = Number.isFinite(nodeZ) ? nodeZ : 0;
  const safeRadius = Number.isFinite(nodeRadius) ? Math.max(0, nodeRadius) : 0;
  const safeAngle = Number.isFinite(waitAngle) ? waitAngle : 0;
  const turn = Math.PI * 2;
  const normalizedAngle = ((safeAngle % turn) + turn) % turn;
  const lane = Math.min(3, Math.floor((normalizedAngle / turn) * 4));
  const radius = safeRadius + 5.25 + lane * 1.8;
  output.x = safeX + Math.cos(safeAngle) * radius;
  output.z = safeZ + Math.sin(safeAngle) * radius;
  return output;
}

/**
 * Selects a nearby hunting party with optional frontline and ranged-role reservations.
 * The output is ordered frontliners, ranged support, then the nearest remaining hunters.
 * All arrays are caller-owned and reused; equal-distance candidates retain roster order.
 */
export function selectNearestWildlifeHuntParty<Unit extends WildlifeHuntPartyCandidate>(
  candidates: readonly Unit[],
  targetX: number,
  targetZ: number,
  maxCount: number,
  output: WildlifeHuntPartySelectionScratch<Unit>,
  preferredFrontlineCount = 0,
  preferredRangedCount = 0,
): Unit[] {
  output.units.length = 0;
  output.distances.length = 0;
  output.frontlineUnits.length = 0;
  output.frontlineDistances.length = 0;
  output.rangedUnits.length = 0;
  output.rangedDistances.length = 0;

  if (
    !Number.isFinite(targetX) ||
    !Number.isFinite(targetZ) ||
    !Number.isFinite(maxCount) ||
    !Number.isFinite(preferredFrontlineCount) ||
    !Number.isFinite(preferredRangedCount)
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
      if (!Number.isFinite(distance)) continue;
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

  // Reserve ranged fire support before filling spare slots by proximity. This prevents
  // nearby melee units from crowding every ranged unit out of the hunting party.
  const rangedLimit = Math.min(
    Math.max(0, limit - frontlineCount),
    Math.max(0, Math.floor(preferredRangedCount)),
  );
  if (rangedLimit > 0) {
    for (const candidate of candidates) {
      if (candidate.unitDef.category !== 'ranged') continue;
      if (!Number.isFinite(candidate.x) || !Number.isFinite(candidate.z)) continue;
      const distance = Math.hypot(candidate.x - targetX, candidate.z - targetZ);
      if (!Number.isFinite(distance)) continue;

      let insertAt = output.rangedDistances.length;
      while (insertAt > 0 && distance < output.rangedDistances[insertAt - 1]) {
        insertAt--;
      }
      if (insertAt >= rangedLimit) continue;

      const nextLength = Math.min(rangedLimit, output.rangedUnits.length + 1);
      for (let index = nextLength - 1; index > insertAt; index--) {
        output.rangedUnits[index] = output.rangedUnits[index - 1];
        output.rangedDistances[index] = output.rangedDistances[index - 1];
      }
      output.rangedUnits[insertAt] = candidate;
      output.rangedDistances[insertAt] = distance;
      output.rangedUnits.length = nextLength;
      output.rangedDistances.length = nextLength;
    }
  }

  const reservedCount = frontlineCount + output.rangedUnits.length;
  for (let index = 0; index < output.rangedUnits.length; index++) {
    output.units.push(output.rangedUnits[index]);
    output.distances.push(output.rangedDistances[index]);
  }

  // Fill remaining slots with the nearest non-reserved candidates. If a role is
  // unavailable, the spare slot is filled by another eligible hunter.
  for (const candidate of candidates) {
    let alreadyReserved = false;
    for (let index = 0; index < frontlineCount; index++) {
      if (output.frontlineUnits[index] === candidate) {
        alreadyReserved = true;
        break;
      }
    }
    if (!alreadyReserved) {
      for (let index = 0; index < output.rangedUnits.length; index++) {
        if (output.rangedUnits[index] === candidate) {
          alreadyReserved = true;
          break;
        }
      }
    }
    if (alreadyReserved || !Number.isFinite(candidate.x) || !Number.isFinite(candidate.z)) continue;

    const distance = Math.hypot(candidate.x - targetX, candidate.z - targetZ);
    if (!Number.isFinite(distance)) continue;
    let insertAt = output.units.length;
    while (insertAt > reservedCount && distance < output.distances[insertAt - 1]) {
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
      !Number.isFinite(unit.hp) ||
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
