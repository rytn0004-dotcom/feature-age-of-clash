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
