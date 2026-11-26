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
  moraleShockResistance?: number;
  leaderCasualty?: boolean;
}

export interface MoraleCombatModifiers {
  readonly state: MoraleState;
  readonly movementSpeedMultiplier: number;
  readonly attackRateMultiplier: number;
}

const MORALE_STEADY: MoraleCombatModifiers = Object.freeze({
  state: 'steady',
  movementSpeedMultiplier: 1,
  attackRateMultiplier: 1,
});
const MORALE_SHAKEN: MoraleCombatModifiers = Object.freeze({
  state: 'shaken',
  movementSpeedMultiplier: 0.94,
  attackRateMultiplier: 0.9,
});
const MORALE_BROKEN: MoraleCombatModifiers = Object.freeze({
  state: 'broken',
  movementSpeedMultiplier: 0.82,
  attackRateMultiplier: 0.75,
});
const MORALE_CRITICAL: MoraleCombatModifiers = Object.freeze({
  state: 'broken',
  movementSpeedMultiplier: 0.76,
  attackRateMultiplier: 0.55,
});

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

export interface MoraleRoutThreatCandidate {
  id: string;
  x: number;
  z: number;
  hp: number;
  garrisonedInBuildingId?: string | null;
}

/** Selects the nearest eligible threat without allocating or sorting a candidate copy. */
export function selectNearestMoraleRoutThreat<T extends MoraleRoutThreatCandidate>(
  candidates: readonly T[],
  sourceId: string,
  originX: number,
  originZ: number,
  maxDistance: number,
  isHostile: (candidate: T) => boolean,
): T | null {
  if (
    !Number.isFinite(originX) ||
    !Number.isFinite(originZ) ||
    !Number.isFinite(maxDistance) ||
    maxDistance <= 0
  ) return null;

  const maxDistanceSquared = maxDistance * maxDistance;
  let nearest: T | null = null;
  let nearestDistanceSquared = maxDistanceSquared;

  for (const candidate of candidates) {
    if (
      candidate.id === sourceId ||
      !Number.isFinite(candidate.hp) ||
      candidate.hp <= 0 ||
      candidate.garrisonedInBuildingId ||
      !Number.isFinite(candidate.x) ||
      !Number.isFinite(candidate.z) ||
      !isHostile(candidate)
    ) continue;

    const dx = candidate.x - originX;
    const dz = candidate.z - originZ;
    const distanceSquared = dx * dx + dz * dz;
    if (distanceSquared >= maxDistanceSquared) continue;

    if (
      distanceSquared < nearestDistanceSquared ||
      (nearest && distanceSquared === nearestDistanceSquared && candidate.id < nearest.id)
    ) {
      nearest = candidate;
      nearestDistanceSquared = distanceSquared;
    }
  }

  return nearest;
}

/** Converts damage, attack angle and nearby losses into a bounded morale shock. */
export function applyMoraleImpact(input: MoraleImpactInput): number {
  const current = clampMorale(input.morale);
  const damage = Number.isFinite(input.damage) ? Math.max(0, input.damage) : 0;
  const maxHp = Number.isFinite(input.maxHp) && input.maxHp > 0 ? input.maxHp : 1;
  const resistance = Number.isFinite(input.moraleShockResistance)
    ? Math.max(0, Math.min(0.5, input.moraleShockResistance as number))
    : 0;
  if (input.nearbyAllyCasualty) {
    const casualtyShock = 7.5 + (input.wasKilled ? 2.5 : 0) + (input.leaderCasualty ? 5 : 0);
    return clampMorale(current - casualtyShock * (1 - resistance));
  }

  if (damage <= 0) return current;
  let loss = Math.max(1.5, (damage / maxHp) * 32);

  if (input.attackerCategory === 'ranged') loss += 2.8;
  else if (input.attackerCategory === 'siege') loss += 9;
  else if (input.attackerCategory === 'special') loss += 3.5;

  if (input.direction === 'flank') loss += 5;
  else if (input.direction === 'rear') loss += 9;
  if (input.wasKilled) loss += 8;

  return clampMorale(current - loss * (1 - resistance));
}

/** Low morale gradually damages combat tempo without changing unit base statistics. */
export function getMoraleCombatModifiers(morale: number): MoraleCombatModifiers {
  const score = clampMorale(morale);
  if (score >= 70) return MORALE_STEADY;
  if (score >= 35) return MORALE_SHAKEN;
  if (score >= 12) return MORALE_BROKEN;
  return MORALE_CRITICAL;
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

const MORALE_ROUT_ANGLE_OFFSETS = [
  0,
  Math.PI / 6,
  -Math.PI / 6,
  Math.PI / 3,
  -Math.PI / 3,
  Math.PI / 2,
  -Math.PI / 2,
  Math.PI,
] as const;

/**
 * Finds a clear escape point away from an immediate threat. Side angles are
 * tested when the direct retreat lane is blocked, and world bounds are clamped.
 */
export function getMoraleRoutGoal(input: MoraleRoutGoalInput): { x: number; z: number } | null {
  if (
    !Number.isFinite(input.x) ||
    !Number.isFinite(input.z) ||
    !Number.isFinite(input.threatX) ||
    !Number.isFinite(input.threatZ)
  ) return null;

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
  let best: { x: number; z: number; score: number } | null = null;
  for (const offset of MORALE_ROUT_ANGLE_OFFSETS) {
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
