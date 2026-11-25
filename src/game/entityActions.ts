import type { Resources } from '../types/game';

export const DELETE_HOLD_DURATION_MS = 3_000;

/**
 * Cancellation refund follows the foundation's live HP ratio. Construction HP
 * rises with build progress, so the ratio includes work already invested and
 * automatically subtracts damage sustained before cancellation.
 */
export function calculateConstructionCancellationRefund(
  cost: Resources,
  currentHp: number,
  maxHp: number,
): Resources {
  const ratio = Number.isFinite(currentHp) && Number.isFinite(maxHp) && maxHp > 0
    ? Math.max(0, Math.min(1, currentHp / maxHp))
    : 0;

  const refund = (value: number): number =>
    Number.isFinite(value) && value > 0 ? Math.floor(value * ratio) : 0;

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
