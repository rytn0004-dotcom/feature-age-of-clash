import type { UnitCategory } from '../types/game';

export type SuppressionState = 'clear' | 'pressured' | 'suppressed' | 'pinned';

export interface SuppressionCombatModifiers {
  state: SuppressionState;
  movementSpeedMultiplier: number;
  attackRateMultiplier: number;
}

export function applySuppressionImpact(
  currentSuppression: number,
  impact: number,
  resistance = 0,
): number {
  const current = Number.isFinite(currentSuppression)
    ? Math.max(0, Math.min(100, currentSuppression))
    : 0;
  const safeImpact = Number.isFinite(impact) ? Math.max(0, impact) : 0;
  const safeResistance = Number.isFinite(resistance)
    ? Math.max(0, Math.min(0.5, resistance))
    : 0;
  return Math.max(0, Math.min(100, current + safeImpact * (1 - safeResistance)));
}

export function decaySuppression(currentSuppression: number, elapsedSeconds: number): number {
  const current = Number.isFinite(currentSuppression)
    ? Math.max(0, Math.min(100, currentSuppression))
    : 0;
  const elapsed = Number.isFinite(elapsedSeconds) ? Math.max(0, elapsedSeconds) : 0;
  return Math.max(0, current - elapsed * 8.5);
}

/** Ranged volleys and siege impacts build pressure; ordinary melee swings do not. */
export function getSuppressionImpact(
  projectileType: 'arrow' | 'fireball' | 'ki_blast' | 'slash',
  attackerCategory?: UnitCategory,
): number {
  if (
    attackerCategory !== 'ranged' &&
    attackerCategory !== 'siege' &&
    attackerCategory !== 'special' &&
    !(attackerCategory === 'cavalry' && projectileType === 'arrow')
  ) {
    return 0;
  }

  const baseImpact =
    projectileType === 'arrow'
      ? 9
      : projectileType === 'fireball'
        ? 18
        : projectileType === 'ki_blast'
          ? 14
          : 4;
  const siegeImpact = attackerCategory === 'siege' ? 8 : 0;
  const specialImpact = attackerCategory === 'special' ? 2 : 0;
  return baseImpact + siegeImpact + specialImpact;
}

export function getSuppressionCombatModifiers(suppression: number): SuppressionCombatModifiers {
  const score = Number.isFinite(suppression)
    ? Math.max(0, Math.min(100, suppression))
    : 0;
  if (score >= 75) {
    return { state: 'pinned', movementSpeedMultiplier: 0.84, attackRateMultiplier: 0.66 };
  }
  if (score >= 45) {
    return { state: 'suppressed', movementSpeedMultiplier: 0.92, attackRateMultiplier: 0.82 };
  }
  if (score >= 20) {
    return { state: 'pressured', movementSpeedMultiplier: 0.97, attackRateMultiplier: 0.94 };
  }
  return { state: 'clear', movementSpeedMultiplier: 1, attackRateMultiplier: 1 };
}
