export interface AmbientBuildingAnimationMetadata {
  animFlags?: readonly unknown[];
  animCrystals?: readonly unknown[];
}

/** Static buildings do not need to be visited by the per-tick ambient animation pass. */
export function hasAmbientBuildingAnimation(
  metadata: AmbientBuildingAnimationMetadata | null | undefined,
): boolean {
  return (metadata?.animFlags?.length ?? 0) > 0 || (metadata?.animCrystals?.length ?? 0) > 0;
}
