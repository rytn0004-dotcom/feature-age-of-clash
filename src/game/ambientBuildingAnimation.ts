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


export interface BuildingAgeEvolutionStep {
  elapsed: number;
  progress: number;
  scale: number;
  complete: boolean;
}

/** Pure easing step for civilization-specific building era ornaments. */
export function advanceBuildingAgeEvolutionTransition(
  elapsedSeconds: number,
  deltaSeconds: number,
  durationSeconds = 0.9,
): BuildingAgeEvolutionStep {
  const duration = Number.isFinite(durationSeconds) ? Math.max(0.12, durationSeconds) : 0.9;
  const elapsed = Number.isFinite(elapsedSeconds) ? Math.max(0, elapsedSeconds) : 0;
  const delta = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
  const nextElapsed = Math.min(duration, elapsed + delta);
  const progress = Math.max(0, Math.min(1, nextElapsed / duration));
  // Cubic ease-out settles into the building rather than popping at a constant rate.
  const eased = 1 - Math.pow(1 - progress, 3);
  return {
    elapsed: nextElapsed,
    progress,
    scale: 0.82 + 0.18 * eased,
    complete: progress >= 1,
  };
}
