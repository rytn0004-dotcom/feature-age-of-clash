export interface MongolKitingRetreatInput {
  x: number;
  z: number;
  threatX: number;
  threatZ: number;
  triggerDistance?: number;
  desiredDistance?: number;
  worldLimit?: number;
  isPositionClear?: (x: number, z: number) => boolean;
}

export interface MongolKitingRetreatGoal {
  x: number;
  z: number;
}

/**
 * Produces a short, bounded retreat waypoint when a Mangudai is threatened at close range.
 * Candidate angles are tried from directly away to progressively wider sidesteps so the
 * caller can reject destinations hidden inside buildings, water, or cliffs.
 */
export function getMongolKitingRetreatGoal(
  input: MongolKitingRetreatInput,
): MongolKitingRetreatGoal | null {
  const {
    x,
    z,
    threatX,
    threatZ,
    triggerDistance = 4.7,
    desiredDistance = 5.9,
    worldLimit = 84,
    isPositionClear = () => true,
  } = input;

  if (
    ![x, z, threatX, threatZ, triggerDistance, desiredDistance, worldLimit].every(Number.isFinite) ||
    triggerDistance <= 0 ||
    desiredDistance <= triggerDistance ||
    worldLimit <= 0
  ) {
    return null;
  }

  const dx = x - threatX;
  const dz = z - threatZ;
  const currentDistance = Math.hypot(dx, dz);
  if (currentDistance <= 0.001 || currentDistance >= triggerDistance) return null;

  const moveDistance = Math.max(1.1, Math.min(4.8, desiredDistance - currentDistance));
  const baseAngle = Math.atan2(dz, dx);
  const offsets = [0, -0.35, 0.35, -0.7, 0.7, -1.05, 1.05, -1.4, 1.4, Math.PI];

  for (const offset of offsets) {
    const angle = baseAngle + offset;
    const candidateX = x + Math.cos(angle) * moveDistance;
    const candidateZ = z + Math.sin(angle) * moveDistance;
    if (
      Math.abs(candidateX) > worldLimit ||
      Math.abs(candidateZ) > worldLimit ||
      !isPositionClear(candidateX, candidateZ)
    ) {
      continue;
    }
    return { x: candidateX, z: candidateZ };
  }

  return null;
}
