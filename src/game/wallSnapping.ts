import { WALL_SEGMENT_SPACING } from './rules';

export interface WallSnapBuilding {
  id: string;
  x: number;
  z: number;
  rotationY?: number;
  wallChainId?: string;
  wallChainIndex?: number;
  wallChainSize?: number;
  hp: number;
  maxHp: number;
  isConstructed: boolean;
  wallBreached?: boolean;
  gateOpen?: boolean;
  buildingDef: { isWall?: boolean };
}

export interface WallEndpointSnap<T extends WallSnapBuilding = WallSnapBuilding> {
  point: { x: number; z: number };
  wall: T;
  distance: number;
  side: 'start' | 'end';
}

/** Rebuild the cached endpoint topology at most every 100ms while a player is drawing a wall. */
export const WALL_ENDPOINT_INDEX_REFRESH_MS = 100;
/** Distance at which a new wall endpoint magnetically joins an existing chain. */
export const WALL_ENDPOINT_SNAP_RADIUS = 1.65;
/** Workers can issue a repair order by right-clicking near a damaged wall segment. */
export const WALL_REPAIR_SNAP_RADIUS = 2.35;
/** Minimum distance between successive wall-chain waypoints after endpoint snapping. */
export const MIN_WALL_CHAIN_POINT_SPACING = 0.75;

export function isWallChainPointTooClose(
  previous: { x: number; z: number },
  next: { x: number; z: number },
  minimumDistance = MIN_WALL_CHAIN_POINT_SPACING,
): boolean {
  return Math.hypot(next.x - previous.x, next.z - previous.z) < minimumDistance;
}

interface WallAnchor<T extends WallSnapBuilding> {
  point: { x: number; z: number };
  wall: T;
  side: 'start' | 'end';
}

function getWallAxis(wall: WallSnapBuilding) {
  const yaw = wall.rotationY ?? 0;
  return { x: Math.cos(yaw), z: -Math.sin(yaw) };
}

function getWallEndpoint(wall: WallSnapBuilding, side: 'start' | 'end') {
  const axis = getWallAxis(wall);
  const sign = side === 'start' ? -1 : 1;
  const halfLength = WALL_SEGMENT_SPACING / 2;
  return {
    x: wall.x + axis.x * halfLength * sign,
    z: wall.z + axis.z * halfLength * sign,
  };
}

/**
 * Only expose the two outer endpoints of each contiguous wall-chain run.
 * This prevents the cursor from snapping to interior seams where a new piece
 * would overlap an existing segment instead of extending the fortification.
 */
function collectWallAnchors<T extends WallSnapBuilding>(walls: readonly T[]): WallAnchor<T>[] {
  const groups = new Map<string, T[]>();
  for (const wall of walls) {
    if (!wall.buildingDef.isWall || wall.hp <= 0 || !wall.isConstructed) continue;
    const key = wall.wallChainId ? `chain:${wall.wallChainId}` : `segment:${wall.id}`;
    const group = groups.get(key) ?? [];
    group.push(wall);
    groups.set(key, group);
  }

  const anchors: WallAnchor<T>[] = [];
  for (const group of groups.values()) {
    const ordered = [...group].sort((a, b) => (a.wallChainIndex ?? 0) - (b.wallChainIndex ?? 0));
    let run: T[] = [];
    const flushRun = () => {
      if (run.length === 0) return;
      const first = run[0];
      const last = run[run.length - 1];
      anchors.push({ point: getWallEndpoint(first, 'start'), wall: first, side: 'start' });
      anchors.push({ point: getWallEndpoint(last, 'end'), wall: last, side: 'end' });
      run = [];
    };

    for (const wall of ordered) {
      const previous = run[run.length - 1];
      const previousIndex = previous?.wallChainIndex;
      const currentIndex = wall.wallChainIndex;
      if (
        previous &&
        previousIndex !== undefined &&
        currentIndex !== undefined &&
        currentIndex > previousIndex + 1
      ) {
        flushRun();
      }
      run.push(wall);
    }
    flushRun();
  }
  return anchors;
}

/**
 * Reusable endpoint snapshot for pointer-move snapping. Rebuild only when the
 * wall roster/chain topology changes; nearest-point queries then scan a compact
 * anchor list without filtering, grouping, sorting, or allocating arrays.
 */
export class WallEndpointIndex<T extends WallSnapBuilding = WallSnapBuilding> {
  private anchors: WallAnchor<T>[] = [];
  private rebuilds = 0;

  public rebuild(walls: readonly T[]): void {
    this.anchors = collectWallAnchors(walls);
    this.rebuilds += 1;
  }

  public clear(): void {
    this.anchors = [];
  }

  public findNearest(
    point: { x: number; z: number },
    snapRadius = WALL_ENDPOINT_SNAP_RADIUS,
  ): WallEndpointSnap<T> | null {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.z) || !Number.isFinite(snapRadius) || snapRadius < 0) {
      return null;
    }

    let nearest: WallEndpointSnap<T> | null = null;
    for (const anchor of this.anchors) {
      // Health/construction can change between scheduled topology rebuilds.
      if (anchor.wall.hp <= 0 || !anchor.wall.isConstructed) continue;
      const distance = Math.hypot(point.x - anchor.point.x, point.z - anchor.point.z);
      if (distance <= snapRadius && (!nearest || distance < nearest.distance)) {
        nearest = { point: anchor.point, wall: anchor.wall, distance, side: anchor.side };
      }
    }
    return nearest;
  }

  /** Exposed for deterministic regression tests and lightweight diagnostics. */
  public get rebuildCount(): number {
    return this.rebuilds;
  }

  public get endpointCount(): number {
    return this.anchors.length;
  }
}

/** One-shot convenience helper for callers that do not need a persistent index. */
export function findNearestWallEndpoint<T extends WallSnapBuilding>(
  point: { x: number; z: number },
  walls: readonly T[],
  snapRadius = WALL_ENDPOINT_SNAP_RADIUS
): WallEndpointSnap<T> | null {
  const index = new WallEndpointIndex<T>();
  index.rebuild(walls);
  return index.findNearest(point, snapRadius);
}

export function findNearestRepairableWall<T extends WallSnapBuilding>(
  point: { x: number; z: number },
  walls: readonly T[],
  snapRadius = WALL_REPAIR_SNAP_RADIUS
): T | null {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.z) || !Number.isFinite(snapRadius) || snapRadius < 0) {
    return null;
  }

  let nearest: T | null = null;
  let nearestDistance = snapRadius;
  for (const wall of walls) {
    if (
      !wall.buildingDef.isWall ||
      !wall.isConstructed ||
      wall.hp <= 0 ||
      (!wall.wallBreached && wall.hp >= wall.maxHp)
    ) {
      continue;
    }
    const distance = Math.hypot(point.x - wall.x, point.z - wall.z);
    if (distance <= nearestDistance) {
      nearest = wall;
      nearestDistance = distance;
    }
  }
  return nearest;
}


export interface WallChainExtensionPlan<T extends WallSnapBuilding = WallSnapBuilding> {
  chainId: string;
  totalSize: number;
  existingAssignments: Array<{ wall: T; index: number }>;
  newIndices: number[];
}

/**
 * Builds a stable index plan when a newly drawn wall joins exactly one complete
 * existing chain endpoint. The order of existing pieces is reversed when the
 * selected endpoint is the chain's start, so patrol order remains continuous.
 *
 * Incomplete chains (for example, chains with destroyed gaps) are deliberately
 * not renumbered: callers should keep those as separate runs rather than
 * accidentally turning a broken defensive line into one logical route.
 */
export function planWallChainExtension<T extends WallSnapBuilding>(
  walls: readonly T[],
  snap: WallEndpointSnap<T>,
  newSegmentCount: number,
  attachAt: 'start' | 'end',
  fallbackChainId: string
): WallChainExtensionPlan<T> | null {
  if (!Number.isInteger(newSegmentCount) || newSegmentCount <= 0 || !fallbackChainId) return null;

  const chainId = snap.wall.wallChainId;
  const members = walls.filter((wall) =>
    wall.buildingDef.isWall &&
    wall.hp > 0 &&
    wall.isConstructed &&
    (chainId ? wall.wallChainId === chainId : wall.id === snap.wall.id)
  );
  if (!members.includes(snap.wall)) return null;

  const expectedSize = snap.wall.wallChainSize ?? members.length;
  if (members.length !== expectedSize) return null;

  const ordered = [...members].sort((a, b) => (a.wallChainIndex ?? 0) - (b.wallChainIndex ?? 0));
  if (ordered.some((wall, index) => {
    const current = wall.wallChainIndex ?? 0;
    const previous = ordered[index - 1]?.wallChainIndex;
    return index > 0 && (previous === undefined || current !== previous + 1);
  })) {
    return null;
  }

  const reverseExisting =
    (attachAt === 'start' && snap.side === 'start') ||
    (attachAt === 'end' && snap.side === 'end');
  const oriented = reverseExisting ? ordered.reverse() : ordered;
  const totalSize = members.length + newSegmentCount;
  const existingOffset = attachAt === 'start' ? 0 : newSegmentCount;
  const newOffset = attachAt === 'start' ? members.length : 0;

  return {
    chainId: chainId || fallbackChainId,
    totalSize,
    existingAssignments: oriented.map((wall, index) => ({ wall, index: existingOffset + index })),
    newIndices: Array.from({ length: newSegmentCount }, (_, index) => newOffset + index),
  };
}
