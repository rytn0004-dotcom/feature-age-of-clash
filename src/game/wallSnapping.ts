import { WALL_SEGMENT_SPACING } from './rules';

export interface WallSnapBuilding {
  id: string;
  x: number;
  z: number;
  rotationY?: number;
  wallChainId?: string;
  wallChainIndex?: number;
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

/** Distance at which a new wall endpoint magnetically joins an existing chain. */
export const WALL_ENDPOINT_SNAP_RADIUS = 1.65;
/** Workers can issue a repair order by right-clicking near a damaged wall segment. */
export const WALL_REPAIR_SNAP_RADIUS = 2.35;

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

export function findNearestWallEndpoint<T extends WallSnapBuilding>(
  point: { x: number; z: number },
  walls: readonly T[],
  snapRadius = WALL_ENDPOINT_SNAP_RADIUS
): WallEndpointSnap<T> | null {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.z) || !Number.isFinite(snapRadius) || snapRadius < 0) {
    return null;
  }

  let nearest: WallEndpointSnap<T> | null = null;
  for (const anchor of collectWallAnchors(walls)) {
    const distance = Math.hypot(point.x - anchor.point.x, point.z - anchor.point.z);
    if (distance <= snapRadius && (!nearest || distance < nearest.distance)) {
      nearest = { point: anchor.point, wall: anchor.wall, distance, side: anchor.side };
    }
  }
  return nearest;
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
