/**
 * Returns the minimum interval between procedural mesh animation updates.
 * Simulation, movement, combat and world positions are never throttled by this
 * visual-only LOD; it only reduces distant skeletal/procedural pose work.
 */
export function getUnitVisualAnimationInterval(
  cameraDistanceSquared: number,
  isMovingOrFighting: boolean,
  forceHighDetail: boolean,
): number {
  if (forceHighDetail || !Number.isFinite(cameraDistanceSquared) || cameraDistanceSquared <= 36 * 36) {
    return 0;
  }

  if (cameraDistanceSquared > 75 * 75) {
    return isMovingOrFighting ? 0.12 : 0.2;
  }

  return isMovingOrFighting ? 0.08 : 0.14;
}
