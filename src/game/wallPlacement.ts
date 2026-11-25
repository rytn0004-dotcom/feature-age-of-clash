import type { Resources } from '../types/game';

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
  maxOffset = 4,
  step = 0.4,
  directionCount = 16,
): WallStartPointResolution | null {
  if (!Number.isFinite(origin.x) || !Number.isFinite(origin.z)) return null;
  if (isValid(origin)) return { point: { x: origin.x, z: origin.z }, offset: 0 };

  const safeMaxOffset = Number.isFinite(maxOffset) ? Math.max(0, maxOffset) : 0;
  const safeStep = Number.isFinite(step) && step > 0 ? step : 0.4;
  const safeDirectionCount = Number.isInteger(directionCount) && directionCount >= 4
    ? directionCount
    : 16;

  for (let radius = safeStep; radius <= safeMaxOffset + 1e-9; radius += safeStep) {
    for (let direction = 0; direction < safeDirectionCount; direction++) {
      const angle = (direction * Math.PI * 2) / safeDirectionCount;
      const point = {
        x: origin.x + Math.cos(angle) * radius,
        z: origin.z + Math.sin(angle) * radius,
      };
      if (isValid(point)) return { point, offset: radius };
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
