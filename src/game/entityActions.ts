import type { Resources } from '../types/game';

export const DELETE_HOLD_DURATION_MS = 3_000;
export const CONSTRUCTION_CANCELLATION_UNDO_WINDOW_MS = 5_000;

/** Remaining real-time undo window, clamped to a safe non-negative range. */
export function getConstructionCancellationUndoRemainingMs(
  expiresAt: number,
  now: number,
): number {
  if (!Number.isFinite(expiresAt) || !Number.isFinite(now)) return 0;
  return Math.max(0, expiresAt - now);
}

/**
 * Refund from real combat damage, not an inferred HP/progress mismatch.
 * Live buildings pass their damage ledger; the fallback supports legacy entities.
 */
export function calculateConstructionCancellationRefund(
  cost: Resources,
  currentHp: number,
  maxHp: number,
  buildProgress: number,
  constructionDamageTaken?: number,
): Resources {
  const validHealth =
    Number.isFinite(currentHp) &&
    Number.isFinite(maxHp) &&
    maxHp > 0 &&
    Number.isFinite(buildProgress);
  const progress = validHealth ? Math.max(0, Math.min(1, buildProgress)) : 0;
  const expectedHp = validHealth ? maxHp * progress : 0;
  const actualHp = validHealth ? Math.max(0, Math.min(maxHp, currentHp)) : 0;
  const hasDamageLedger =
    Number.isFinite(constructionDamageTaken) && (constructionDamageTaken as number) >= 0;
  const damage = hasDamageLedger
    ? Math.max(0, constructionDamageTaken as number)
    : Math.max(0, expectedHp - actualHp);
  const tolerance = hasDamageLedger ? 0 : 0.5;
  const damageRatio = expectedHp > 0
    ? Math.max(0, Math.min(1, (damage <= tolerance ? 0 : damage) / expectedHp))
    : 0;
  const refundRatio = validHealth && expectedHp > 0 ? 1 - damageRatio : 0;

  const refund = (value: number): number =>
    Number.isFinite(value) && value > 0 ? Math.floor(value * refundRatio) : 0;

  return {
    food: refund(cost.food || 0),
    wood: refund(cost.wood || 0),
    gold: refund(cost.gold || 0),
    stone: refund(cost.stone || 0),
  };
}

/** Subtract damage once and record only HP actually removed from an unfinished building. */
export function applyBuildingDamage(
  building: {
    hp: number;
    maxHp: number;
    isConstructed: boolean;
    constructionDamageTaken?: number;
  },
  incomingDamage: number,
): number {
  const safeMaxHp = Number.isFinite(building.maxHp) ? Math.max(0, building.maxHp) : 0;
  const currentHp = Number.isFinite(building.hp)
    ? Math.max(0, Math.min(safeMaxHp, building.hp))
    : 0;
  const damage = Number.isFinite(incomingDamage) ? Math.max(0, incomingDamage) : 0;
  const appliedDamage = Math.min(currentHp, damage);
  building.hp = currentHp - appliedDamage;
  if (!building.isConstructed && appliedDamage > 0) {
    const previousDamage = Number.isFinite(building.constructionDamageTaken)
      ? Math.max(0, building.constructionDamageTaken as number)
      : 0;
    building.constructionDamageTaken = previousDamage + appliedDamage;
  }
  return appliedDamage;
}

/** Repairs current HP and removes only that healed amount from unfinished-building damage debt. */
export function applyBuildingRepair(
  building: {
    hp: number;
    maxHp: number;
    isConstructed: boolean;
    constructionDamageTaken?: number;
  },
  requestedHealing: number,
): number {
  const safeMaxHp = Number.isFinite(building.maxHp) ? Math.max(0, building.maxHp) : 0;
  const currentHp = Number.isFinite(building.hp)
    ? Math.max(0, Math.min(safeMaxHp, building.hp))
    : 0;
  const healing = Number.isFinite(requestedHealing) ? Math.max(0, requestedHealing) : 0;
  const appliedHealing = Math.min(Math.max(0, safeMaxHp - currentHp), healing);
  building.hp = currentHp + appliedHealing;

  if (!building.isConstructed && appliedHealing > 0) {
    const previousDamage = Number.isFinite(building.constructionDamageTaken)
      ? Math.max(0, building.constructionDamageTaken as number)
      : 0;
    building.constructionDamageTaken = Math.max(0, previousDamage - appliedHealing);
  }
  return appliedHealing;
}

/** Progress for an intentional hold action, clamped to the visible 0..1 range. */
export function getDeleteHoldProgress(startedAt: number, now: number): number {
  if (!Number.isFinite(startedAt) || !Number.isFinite(now)) return 0;
  return Math.max(0, Math.min(1, (now - startedAt) / DELETE_HOLD_DURATION_MS));
}
 
/**
 * Construction work contributes health as progress advances, but never erases
 * damage already dealt to the foundation.
 */
export function applyConstructionWorkToHealth(
  currentHp: number,
  maxHp: number,
  progressDelta: number,
): number {
  if (!Number.isFinite(maxHp) || maxHp <= 0) return 0;
  const safeCurrentHp = Number.isFinite(currentHp) ? Math.max(0, Math.min(maxHp, currentHp)) : 0;
  const safeProgressDelta = Number.isFinite(progressDelta) ? Math.max(0, progressDelta) : 0;
  return Math.min(maxHp, safeCurrentHp + maxHp * safeProgressDelta);
}
