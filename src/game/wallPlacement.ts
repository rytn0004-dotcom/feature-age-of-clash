import type { Resources } from '../types/game';

/** Keep at most eight full wall models in-scene; longer previews use one instanced batch. */
export const WALL_PREVIEW_DETAILED_SEGMENT_LIMIT = 8;
/** Wall ghost geometry and collision preview are intentionally capped at 10 Hz. */
export const WALL_PREVIEW_REFRESH_INTERVAL_MS = 100;
/** Maximum distance used to gently nudge a clicked wall start outside nearby blockers. */
export const WALL_START_SEARCH_MAX_OFFSET = 4;

export function shouldUseInstancedWallPreview(segmentCount: number): boolean {
  return Number.isFinite(segmentCount) &&
    Math.max(0, Math.floor(segmentCount)) > WALL_PREVIEW_DETAILED_SEGMENT_LIMIT;
}

export interface WallStartPoint {
  x: number;
  z: number;
}

export interface WallStartPointResolution {
  point: WallStartPoint;
  offset: number;
}

/**
 * Keep a clicked start point when it is already buildable. Otherwise search
 * progressively farther rings and choose the first deterministic valid point,
 * gently nudging the wall start outside nearby terrain/building/resource blockers.
 */
export function findNearestValidWallStartPoint(
  origin: WallStartPoint,
  isValid: (point: WallStartPoint) => boolean,
  maxOffset = WALL_START_SEARCH_MAX_OFFSET,
  step = 0.4,
  directionCount = 16,
): WallStartPointResolution | null {
  if (!Number.isFinite(origin.x) || !Number.isFinite(origin.z)) return null;

  // The callback is synchronous, so one mutable candidate is enough for every
  // ring sample. Return a detached copy only when a valid point is found.
  const candidate = { x: origin.x, z: origin.z };
  if (isValid(candidate)) return { point: { x: candidate.x, z: candidate.z }, offset: 0 };

  const safeMaxOffset = Number.isFinite(maxOffset) ? Math.max(0, maxOffset) : 0;
  const safeStep = Number.isFinite(step) && step > 0 ? step : 0.4;
  const safeDirectionCount = Number.isInteger(directionCount) && directionCount >= 4
    ? directionCount
    : 16;

  for (let radius = safeStep; radius <= safeMaxOffset + 1e-9; radius += safeStep) {
    for (let direction = 0; direction < safeDirectionCount; direction++) {
      const angle = (direction * Math.PI * 2) / safeDirectionCount;
      candidate.x = origin.x + Math.cos(angle) * radius;
      candidate.z = origin.z + Math.sin(angle) * radius;
      if (isValid(candidate)) {
        return { point: { x: candidate.x, z: candidate.z }, offset: radius };
      }
    }
  }

  return null;
}

/** Number of leading modular wall pieces that the current resource balance can fund. */
export function getAffordableWallSegmentCount(
  resources: Resources,
  costPerSegment: Resources,
  proposedSegmentCount: number,
): number {
  const proposed = Math.max(0, Math.floor(Number.isFinite(proposedSegmentCount) ? proposedSegmentCount : 0));
  if (proposed === 0) return 0;

  let affordable = proposed;
  const keys: Array<keyof Resources> = ['food', 'wood', 'gold', 'stone'];
  for (const key of keys) {
    const cost = costPerSegment[key] || 0;
    if (!Number.isFinite(cost) || cost < 0) return 0;
    if (cost === 0) continue;
    const balance = resources[key];
    const safeBalance = Number.isFinite(balance) ? Math.max(0, balance) : 0;
    affordable = Math.min(affordable, Math.floor((safeBalance + 1e-9) / cost));
  }

  return Math.max(0, Math.min(proposed, affordable));
}


export type WallSegmentPreviewStatus = 'buildable' | 'unaffordable' | 'blocked';

/** Resolve the visual/commit state of one modular wall segment in the current preview. */
export function getWallSegmentPreviewStatus(
  segmentIndex: number,
  segmentCount: number,
  affordableSegmentCount: number,
  blocked = false,
): WallSegmentPreviewStatus | null {
  const safeCount = Math.max(0, Math.floor(Number.isFinite(segmentCount) ? segmentCount : 0));
  if (!Number.isInteger(segmentIndex) || segmentIndex < 0 || segmentIndex >= safeCount) return null;
  if (blocked) return 'blocked';

  const safeAffordable = Math.max(
    0,
    Math.min(safeCount, Math.floor(Number.isFinite(affordableSegmentCount) ? affordableSegmentCount : 0)),
  );
  return segmentIndex < safeAffordable ? 'buildable' : 'unaffordable';
}


/**
 * Clips a multi-section wall route to the leading affordable modular pieces.
 * The cut is placed at a segment boundary, not at its centre, so the next
 * queued segment can continue without a gap.
 */
export function clipWallChainPointsToSegmentCount(
  points: readonly WallStartPoint[],
  segmentLimit: number,
  segmentSpacing: number,
): WallStartPoint[] {
  const safeLimit = Math.max(0, Math.floor(Number.isFinite(segmentLimit) ? segmentLimit : 0));
  if (points.length === 0) return [];
  const result: WallStartPoint[] = [{ x: points[0].x, z: points[0].z }];
  if (points.length < 2 || safeLimit === 0 || !Number.isFinite(segmentSpacing) || segmentSpacing <= 0) {
    return result;
  }

  let remaining = safeLimit;
  for (let index = 0; index < points.length - 1; index++) {
    const start = points[index];
    const end = points[index + 1];
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const length = Math.hypot(dx, dz);
    if (!Number.isFinite(length) || length < 0.75) continue;

    const sectionCount = Math.max(1, Math.ceil(length / segmentSpacing));
    if (remaining >= sectionCount) {
      result.push({ x: end.x, z: end.z });
      remaining -= sectionCount;
      if (remaining === 0) break;
      continue;
    }

    if (remaining > 0) {
      const fraction = remaining / sectionCount;
      result.push({
        x: start.x + dx * fraction,
        z: start.z + dz * fraction,
      });
    }
    break;
  }

  return result;
}
