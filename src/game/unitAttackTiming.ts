import type { UnitCategory } from '../types/game';

export interface UnitAttackTiming {
  /** Time spent telegraphing an attack before it can deal damage or launch a shot. */
  windupSeconds: number;
  /** Brief recovery after an attack; ordinary units cannot immediately chase or strike again. */
  recoverySeconds: number;
}

const ATTACK_TIMINGS: Readonly<Record<UnitCategory, UnitAttackTiming>> = Object.freeze({
  worker: Object.freeze({ windupSeconds: 0.2, recoverySeconds: 0.18 }),
  melee: Object.freeze({ windupSeconds: 0.22, recoverySeconds: 0.22 }),
  ranged: Object.freeze({ windupSeconds: 0.18, recoverySeconds: 0.18 }),
  cavalry: Object.freeze({ windupSeconds: 0.27, recoverySeconds: 0.26 }),
  siege: Object.freeze({ windupSeconds: 0.42, recoverySeconds: 0.38 }),
  special: Object.freeze({ windupSeconds: 0.22, recoverySeconds: 0.22 }),
});

export function getUnitAttackTiming(category: UnitCategory): UnitAttackTiming {
  return ATTACK_TIMINGS[category] ?? ATTACK_TIMINGS.melee;
}

export interface AttackWindupProgress {
  remainingSeconds: number;
  ready: boolean;
  cancelled: boolean;
}

/** Advance one windup step only while the same target remains valid and in range. */
export function advanceUnitAttackWindup(
  remainingSeconds: number,
  deltaSeconds: number,
  canContinue: boolean,
): AttackWindupProgress {
  if (!canContinue || !Number.isFinite(remainingSeconds) || remainingSeconds < 0) {
    return { remainingSeconds: 0, ready: false, cancelled: true };
  }

  const safeDelta = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
  const remaining = Math.max(0, remainingSeconds - safeDelta);
  return {
    remainingSeconds: remaining,
    ready: remaining <= 1e-9,
    cancelled: false,
  };
}
