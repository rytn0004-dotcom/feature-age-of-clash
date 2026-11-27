export interface AiObjectivePoint {
  x: number;
  z: number;
}

export interface AiObjectiveOffset {
  x: number;
  z: number;
}

function hashObjectiveKey(value: string, seed: number): number {
  let hash = seed >>> 0;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Produces a stable square-distributed offset for one unit/objective pair.
 * The range matches the previous random per-axis staging offsets, but does not
 * change when AI decision ticks or source-array order change.
 */
export function getStableAiObjectiveOffset(
  unitId: string,
  objectiveId: string,
  maxAxisOffset: number,
): AiObjectiveOffset {
  const safeOffset = Number.isFinite(maxAxisOffset) ? Math.max(0, maxAxisOffset) : 0;
  if (safeOffset === 0) return { x: 0, z: 0 };

  const key = `${unitId.length}:${unitId}|${objectiveId.length}:${objectiveId}`;
  const xHash = hashObjectiveKey(key, 0x811c9dc5);
  const zHash = hashObjectiveKey(key, 0x9e3779b9);

  return {
    x: (xHash / 0x100000000 * 2 - 1) * safeOffset,
    z: (zHash / 0x100000000 * 2 - 1) * safeOffset,
  };
}

/** Returns true when the same AI action already targets the same objective. */
export function isSameAiObjectiveOrder(
  currentActionText: string | undefined,
  currentGoal: AiObjectivePoint | null | undefined,
  nextActionText: string,
  nextGoal: AiObjectivePoint,
  tolerance = 0.01,
): boolean {
  if (currentActionText !== nextActionText || !currentGoal) return false;
  if (
    !Number.isFinite(currentGoal.x) ||
    !Number.isFinite(currentGoal.z) ||
    !Number.isFinite(nextGoal.x) ||
    !Number.isFinite(nextGoal.z)
  ) {
    return false;
  }

  const safeTolerance = Number.isFinite(tolerance) ? Math.max(0, tolerance) : 0.01;
  return (
    Math.abs(currentGoal.x - nextGoal.x) <= safeTolerance &&
    Math.abs(currentGoal.z - nextGoal.z) <= safeTolerance
  );
}
