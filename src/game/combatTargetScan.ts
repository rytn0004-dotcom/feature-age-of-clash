export const COMBAT_TARGET_SCAN_INTERVAL_SECONDS = 0.16;
const MIN_TARGET_SCAN_INTERVAL_SECONDS = 0.12;
const INITIAL_SCAN_PHASE_BUCKETS = 8;

export interface CombatTargetScanState {
  id: string;
  combatTargetScanCooldown?: number;
}

function getUnitScanBucket(unitId: string): number {
  let hash = 2166136261;
  for (let index = 0; index < unitId.length; index++) {
    hash = Math.imul(hash ^ unitId.charCodeAt(index), 16777619);
  }
  return (hash >>> 0) % INITIAL_SCAN_PHASE_BUCKETS;
}

function getInitialScanPhase(unitId: string): number {
  return (getUnitScanBucket(unitId) / INITIAL_SCAN_PHASE_BUCKETS) *
    COMBAT_TARGET_SCAN_INTERVAL_SECONDS;
}

function getUnitScanInterval(unitId: string): number {
  const bucket = getUnitScanBucket(unitId);
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
  const currentCooldown = Number.isFinite(storedCooldown)
    ? Math.max(0, storedCooldown as number)
    : getInitialScanPhase(unit.id);
  const remaining = Math.max(0, currentCooldown - safeDt);

  if (remaining > 0) {
    unit.combatTargetScanCooldown = remaining;
    return false;
  }

  unit.combatTargetScanCooldown = getUnitScanInterval(unit.id);
  return true;
}
