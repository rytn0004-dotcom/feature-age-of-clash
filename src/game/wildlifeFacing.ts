/**
 * Shared heading contract for wildlife visuals.
 *
 * The procedural deer rig faces local +X. With Three.js Y rotation, +X maps
 * to (cos(yaw), -sin(yaw)) in the XZ plane, so the yaw is atan2(-dz, dx).
 */
export const DEER_ASSET_FORWARD_ALIGNMENT_YAW = Math.PI / 2;
export const WILDLIFE_MIN_FACING_DISPLACEMENT = 0.002;

export interface WildlifeForwardDirection {
  x: number;
  z: number;
}

/** Converts real, collision-resolved ground displacement into the rig's Y yaw. */
export function getWildlifeFacingYaw(dx: number, dz: number): number | null {
  if (
    !Number.isFinite(dx) ||
    !Number.isFinite(dz) ||
    Math.hypot(dx, dz) <= WILDLIFE_MIN_FACING_DISPLACEMENT
  ) {
    return null;
  }

  return Math.atan2(-dz, dx);
}

/** Returns the world XZ direction of a local +X-facing deer after Y rotation. */
export function getWildlifeForwardDirection(yaw: number): WildlifeForwardDirection | null {
  if (!Number.isFinite(yaw)) return null;
  return {
    x: Math.cos(yaw),
    z: -Math.sin(yaw),
  };
}
