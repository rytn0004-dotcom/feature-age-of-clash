/**
 * Build the set of units that must bypass distance-based visual LOD.
 * Called once per unit-LOD batch so the unit loop performs O(1) membership checks.
 */
export function createUnitLodHighDetailSet(
  selectedUnitIds: readonly string[],
  inspectedUnitId: string | null,
): ReadonlySet<string> {
  const highDetailUnitIds = new Set(selectedUnitIds);
  if (inspectedUnitId !== null) highDetailUnitIds.add(inspectedUnitId);
  return highDetailUnitIds;
}

/**
 * Full-rate joint animation is most valuable near the camera. Far units keep
 * their simulation and mesh positions every step, while their visual joints
 * update at a bounded lower cadence. Selected units and active construction
 * can opt out of distance throttling.
 */
export function getUnitAnimationUpdateIntervalSeconds(
  distanceSquared: number,
  forceHighDetail = false,
): number {
  if (forceHighDetail || !Number.isFinite(distanceSquared) || distanceSquared < 0) {
    return 0.05;
  }
  if (distanceSquared <= 28 * 28) return 0.05;
  if (distanceSquared <= 58 * 58) return 0.1;
  return 0.2;
}
