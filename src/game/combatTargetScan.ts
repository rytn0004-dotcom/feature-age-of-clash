export const COMBAT_TARGET_SCAN_INTERVAL_SECONDS = 0.16;
const MIN_TARGET_SCAN_INTERVAL_SECONDS = 0.12;
const INITIAL_SCAN_PHASE_BUCKETS = 8;

export interface CombatTargetScanState {
  id: string;
  combatTargetScanCooldown?: number;
  /** Stable per-unit interval cached after the first deterministic ID hash. */
  combatTargetScanIntervalSeconds?: number;
}

function getUnitScanBucket(unitId: string): number {
  let hash = 2166136261;
  for (let index = 0; index < unitId.length; index++) {
    hash = Math.imul(hash ^ unitId.charCodeAt(index), 16777619);
  }
  return (hash >>> 0) % INITIAL_SCAN_PHASE_BUCKETS;
}

function getInitialScanPhaseFromBucket(bucket: number): number {
  return (bucket / INITIAL_SCAN_PHASE_BUCKETS) * COMBAT_TARGET_SCAN_INTERVAL_SECONDS;
}

function getUnitScanIntervalFromBucket(bucket: number): number {
  return MIN_TARGET_SCAN_INTERVAL_SECONDS +
    (bucket / (INITIAL_SCAN_PHASE_BUCKETS - 1)) *
    (COMBAT_TARGET_SCAN_INTERVAL_SECONDS - MIN_TARGET_SCAN_INTERVAL_SECONDS);
}

/**
 * Returns true when a unit should refresh nearby enemy acquisition.
 * Stable ID phases and per-unit intervals spread large groups across the cadence;
 * the maximum added detection delay is 160 ms and does not alter attack timing.
 */
export function consumeCombatTargetScanCooldown(
  unit: CombatTargetScanState,
  dt: number,
): boolean {
  const safeDt = Number.isFinite(dt) ? Math.max(0, dt) : 0;
  const storedCooldown = unit.combatTargetScanCooldown;
  const hasStoredCooldown = Number.isFinite(storedCooldown);
  const storedInterval = unit.combatTargetScanIntervalSeconds;
  const hasCachedInterval =
    Number.isFinite(storedInterval) &&
    storedInterval! >= MIN_TARGET_SCAN_INTERVAL_SECONDS &&
    storedInterval! <= COMBAT_TARGET_SCAN_INTERVAL_SECONDS;

  let interval = hasCachedInterval ? storedInterval as number : 0;
  let initialPhase = 0;
  if (!hasCachedInterval || !hasStoredCooldown) {
    // Hash a stable unit ID only when its schedule is first created or restored.
    // Recurring target scans reuse the cached interval instead of re-hashing it.
    const bucket = getUnitScanBucket(unit.id);
    if (!hasCachedInterval) interval = getUnitScanIntervalFromBucket(bucket);
    if (!hasStoredCooldown) initialPhase = getInitialScanPhaseFromBucket(bucket);
  }
  unit.combatTargetScanIntervalSeconds = interval;

  const currentCooldown = hasStoredCooldown
    ? Math.max(0, storedCooldown as number)
    : initialPhase;
  const remaining = Math.max(0, currentCooldown - safeDt);

  if (remaining > 0) {
    unit.combatTargetScanCooldown = remaining;
    return false;
  }

  unit.combatTargetScanCooldown = interval;
  return true;
}
