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
 * Refund construction cost according to damage, not completion progress.
 * An undamaged foundation receives a full refund even at 10% construction.
 * Only HP missing relative to the current build progress reduces the refund.
 */
export function calculateConstructionCancellationRefund(
  cost: Resources,
  currentHp: number,
  maxHp: number,
  buildProgress: number,
): Resources {
  const validHealth =
    Number.isFinite(currentHp) &&
    Number.isFinite(maxHp) &&
    maxHp > 0 &&
    Number.isFinite(buildProgress);
  const progress = validHealth ? Math.max(0, Math.min(1, buildProgress)) : 0;
  const expectedHp = validHealth ? maxHp * progress : 0;
  const actualHp = validHealth ? Math.max(0, Math.min(maxHp, currentHp)) : 0;
  const damage = Math.max(0, expectedHp - actualHp);

  // Ignore sub-HP rounding noise so pristine foundations always refund fully.
  const undamagedTolerance = 0.5;
  const refundRatio =
    !validHealth || expectedHp <= 0
      ? 0
      : damage <= undamagedTolerance
        ? 1
        : Math.max(0, Math.min(1, actualHp / expectedHp));

  const refund = (value: number): number =>
    Number.isFinite(value) && value > 0 ? Math.floor(value * refundRatio) : 0;

  return {
    food: refund(cost.food || 0),
    wood: refund(cost.wood || 0),
    gold: refund(cost.gold || 0),
    stone: refund(cost.stone || 0),
  };
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
