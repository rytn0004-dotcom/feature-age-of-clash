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

    if (
      unit.unitDef.category !== 'worker' &&
      (unit.state === 'attacking' || !!unit.attackMoveGoal)
    ) {
      const range = unit.unitDef.stats.range || 1.5;
      const attackDistance = Math.max(2.4, range + 0.5);
      if (distance <= attackDistance) output.attackers.push(unit);
    }
  }

  return output;
}
