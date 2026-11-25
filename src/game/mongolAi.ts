export type MongolOvooMode = 'yam_relay' | 'sacred_extraction';

export interface MongolNearbyUnit {
  hp: number;
  x: number;
  z: number;
  garrisonedInBuildingId?: string;
}

/** Returns true only for a living, ungarrisoned hostile unit inside the Ovoo's threat radius. */
export function hasNearbyHostileUnit<T extends MongolNearbyUnit>(
  center: { x: number; z: number },
  units: readonly T[],
  isHostile: (unit: T) => boolean,
  radius = 18,
): boolean {
  if (
    !Number.isFinite(center.x) ||
    !Number.isFinite(center.z) ||
    !Number.isFinite(radius) ||
    radius < 0
  ) {
    return false;
  }

  const radiusSquared = radius * radius;
  return units.some((unit) => {
    if (
      unit.hp <= 0 ||
      unit.garrisonedInBuildingId ||
      !Number.isFinite(unit.x) ||
      !Number.isFinite(unit.z) ||
      !isHostile(unit)
    ) {
      return false;
    }
    const dx = unit.x - center.x;
    const dz = unit.z - center.z;
    return dx * dx + dz * dz <= radiusSquared;
  });
}

export interface MongolOvooPolicyInput {
  currentMode: MongolOvooMode;
  hasNearbyHostiles: boolean;
  hasNearbyMine: boolean;
  hasActiveProduction: boolean;
  hasWoundedArmy: boolean;
  hasNearbyFriendlyArmy: boolean;
  hornCooldown: number;
}

export interface MongolOvooPolicy {
  desiredMode: MongolOvooMode;
  shouldChangeMode: boolean;
  shouldTriggerWarHorn: boolean;
}

/**
 * Threats, nearby production, and wounded troops take priority over passive extraction.
 * The war horn is reserved for a real nearby threat with friendly troops in its aura.
 */
export function evaluateMongolOvooPolicy(input: MongolOvooPolicyInput): MongolOvooPolicy {
  let desiredMode = input.currentMode;
  const wantsYamRelay =
    input.hasNearbyHostiles || input.hasActiveProduction || input.hasWoundedArmy;

  if (wantsYamRelay) {
    desiredMode = 'yam_relay';
  } else if (input.hasNearbyMine) {
    desiredMode = 'sacred_extraction';
  }

  const cooldownReady = Number.isFinite(input.hornCooldown) && input.hornCooldown <= 0;
  return {
    desiredMode,
    shouldChangeMode: desiredMode !== input.currentMode,
    shouldTriggerWarHorn:
      input.hasNearbyHostiles && input.hasNearbyFriendlyArmy && cooldownReady,
  };
}


/**
 * Mongol ranged formations use a small shaman support core rather than training only Mangudai.
 * One shaman per six ranged troops, capped at two, keeps area control useful without flooding the queue.
 */
export function shouldTrainMongolShaman(rangedUnitCount: number, currentShamanCount: number): boolean {
  const ranged = Math.max(0, Math.floor(Number.isFinite(rangedUnitCount) ? rangedUnitCount : 0));
  const shamans = Math.max(0, Math.floor(Number.isFinite(currentShamanCount) ? currentShamanCount : 0));
  const desiredShamans = Math.min(2, Math.floor(ranged / 6));
  return shamans < desiredShamans;
}
