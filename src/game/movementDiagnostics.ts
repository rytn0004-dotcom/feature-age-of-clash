export const MOVEMENT_STALL_SAMPLE_INTERVAL_SECONDS = 0.45;
export const MOVEMENT_STALL_PROGRESS_DISTANCE = 0.25;
export const MOVEMENT_STALL_RECOVERY_SECONDS = 1.8;
export const MOVEMENT_STALL_RECOVERY_COOLDOWN_SECONDS = 2.4;
export const MAX_TRACKED_MOVEMENT_STALL_SECONDS = 60;

/** Accumulates only sustained low-displacement intervals while a unit has a pathing goal. */
export function advanceMovementStallDuration(
  previousDuration: number | undefined,
  movedDistance: number,
  elapsedSeconds: number,
): number {
  if (!Number.isFinite(movedDistance) || !Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) {
    return 0;
  }
  if (movedDistance >= MOVEMENT_STALL_PROGRESS_DISTANCE) return 0;

  const previous = Number.isFinite(previousDuration)
    ? Math.max(0, previousDuration as number)
    : 0;
  return Math.min(MAX_TRACKED_MOVEMENT_STALL_SECONDS, previous + elapsedSeconds);
}

/** True only after sustained lack of progress and when neither path cooldown is active. */
export function shouldRecoverStalledPath(
  stuckDuration: number | undefined,
  pathCooldown: number | undefined,
  recoveryCooldown: number | undefined,
): boolean {
  return (
    Number.isFinite(stuckDuration) &&
    (stuckDuration as number) >= MOVEMENT_STALL_RECOVERY_SECONDS &&
    (!Number.isFinite(pathCooldown) || (pathCooldown as number) <= 0) &&
    (!Number.isFinite(recoveryCooldown) || (recoveryCooldown as number) <= 0)
  );
}
