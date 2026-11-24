export interface ConstructionApproachPoint {
  x: number;
  z: number;
}

export const CONSTRUCTION_APPROACH_DIRECTION_COUNT = 8;

/**
 * Returns a stable point on a construction work ring.
 * The caller can advance candidateIndex after a blocked route without letting the
 * destination orbit around the worker as its position changes.
 */
export function getConstructionApproachPoint(
  center: ConstructionApproachPoint,
  radius: number,
  preferredAngle: number,
  candidateIndex: number,
  candidateCount = CONSTRUCTION_APPROACH_DIRECTION_COUNT
): ConstructionApproachPoint {
  const safeCount = Number.isInteger(candidateCount) && candidateCount > 0
    ? candidateCount
    : CONSTRUCTION_APPROACH_DIRECTION_COUNT;
  const safeIndex = ((Math.floor(candidateIndex) % safeCount) + safeCount) % safeCount;
  const safeRadius = Number.isFinite(radius) ? Math.max(0, radius) : 0;
  const safeAngle = Number.isFinite(preferredAngle) ? preferredAngle : 0;
  const angle = safeAngle + (safeIndex * Math.PI * 2) / safeCount;
  return {
    x: center.x + Math.cos(angle) * safeRadius,
    z: center.z + Math.sin(angle) * safeRadius,
  };
}
