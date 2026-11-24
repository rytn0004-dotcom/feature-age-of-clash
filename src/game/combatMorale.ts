import type { UnitCategory } from '../types/game';

export type MoraleAttackDirection = 'front' | 'flank' | 'rear' | null;
export type MoraleState = 'steady' | 'shaken' | 'broken';

export interface MoraleImpactInput {
  morale: number;
  damage: number;
  maxHp: number;
  attackerCategory?: UnitCategory;
  direction?: MoraleAttackDirection;
  nearbyAllyCasualty?: boolean;
  wasKilled?: boolean;
}

export interface MoraleCombatModifiers {
  state: MoraleState;
  movementSpeedMultiplier: number;
  attackRateMultiplier: number;
}

export interface MoraleRoutEligibility {
  morale: number;
  isHumanControlled: boolean;
  isWorker: boolean;
  alreadyRouted: boolean;
  cooldownReady: boolean;
}

export interface MoraleRoutGoalInput {
  x: number;
  z: number;
  threatX: number;
  threatZ: number;
  worldLimit?: number;
  retreatDistance?: number;
  isPositionClear?: (x: number, z: number) => boolean;
}

const clampMorale = (value: number): number =>
  Math.max(0, Math.min(100, Number.isFinite(value) ? value : 100));

/** Converts damage, attack angle and nearby losses into a bounded morale shock. */
export function applyMoraleImpact(input: MoraleImpactInput): number {
  const current = clampMorale(input.morale);
  const damage = Number.isFinite(input.damage) ? Math.max(0, input.damage) : 0;
  const maxHp = Number.isFinite(input.maxHp) && input.maxHp > 0 ? input.maxHp : 1;
  if (input.nearbyAllyCasualty) {
    return clampMorale(current - 7.5 - (input.wasKilled ? 2.5 : 0));
  }

  if (damage <= 0) return current;
  let loss = Math.max(1.5, (damage / maxHp) * 32);

  if (input.attackerCategory === 'ranged') loss += 2.8;
  else if (input.attackerCategory === 'siege') loss += 9;
  else if (input.attackerCategory === 'special') loss += 3.5;

  if (input.direction === 'flank') loss += 5;
  else if (input.direction === 'rear') loss += 9;
  if (input.wasKilled) loss += 8;

  return clampMorale(current - loss);
}

/** Low morale gradually damages combat tempo without changing unit base statistics. */
export function getMoraleCombatModifiers(morale: number): MoraleCombatModifiers {
  const score = clampMorale(morale);
  if (score >= 70) {
    return { state: 'steady', movementSpeedMultiplier: 1, attackRateMultiplier: 1 };
  }
  if (score >= 35) {
    return { state: 'shaken', movementSpeedMultiplier: 0.94, attackRateMultiplier: 0.9 };
  }
  if (score >= 12) {
    return { state: 'broken', movementSpeedMultiplier: 0.82, attackRateMultiplier: 0.75 };
  }
  return { state: 'broken', movementSpeedMultiplier: 0.76, attackRateMultiplier: 0.55 };
}

/** Human-issued orders retain control; only AI combat troops can be forced to rout. */
export function shouldUnitRout(input: MoraleRoutEligibility): boolean {
  return (
    Number.isFinite(input.morale) &&
    input.morale <= 12 &&
    !input.isHumanControlled &&
    !input.isWorker &&
    !input.alreadyRouted &&
    input.cooldownReady
  );
}

/**
 * Finds a clear escape point away from an immediate threat. Side angles are
 * tested when the direct retreat lane is blocked, and world bounds are clamped.
 */
export function getMoraleRoutGoal(input: MoraleRoutGoalInput): { x: number; z: number } | null {
  const numbers = [input.x, input.z, input.threatX, input.threatZ];
  if (!numbers.every(Number.isFinite)) return null;

  const dx = input.x - input.threatX;
  const dz = input.z - input.threatZ;
  const length = Math.hypot(dx, dz);
  if (length < 0.001) return null;

  const limit = Number.isFinite(input.worldLimit)
    ? Math.max(1, input.worldLimit as number)
    : 84;
  const retreatDistance = Number.isFinite(input.retreatDistance)
    ? Math.max(3, Math.min(18, input.retreatDistance as number))
    : 10.5;
  const baseAngle = Math.atan2(dz / length, dx / length);
  const offsets = [0, Math.PI / 6, -Math.PI / 6, Math.PI / 3, -Math.PI / 3, Math.PI / 2, -Math.PI / 2, Math.PI];

  let best: { x: number; z: number; score: number } | null = null;
  for (const offset of offsets) {
    const angle = baseAngle + offset;
    const x = Math.max(-limit, Math.min(limit, input.x + Math.cos(angle) * retreatDistance));
    const z = Math.max(-limit, Math.min(limit, input.z + Math.sin(angle) * retreatDistance));
    if (Math.hypot(x - input.x, z - input.z) < 2) continue;
    if (input.isPositionClear && !input.isPositionClear(x, z)) continue;

    const separation = Math.hypot(x - input.threatX, z - input.threatZ);
    const score = separation - Math.abs(offset) * 0.8;
    if (!best || score > best.score) best = { x, z, score };
  }
  return best ? { x: best.x, z: best.z } : null;
}
