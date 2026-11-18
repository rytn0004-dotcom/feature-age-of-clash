import {
  BuildingEntity,
  ResourceNode,
  TerrainBlockedDisc,
  TerrainBlockedRect,
  TerrainPassableBridge,
} from '../types/game';
import {
  getBuildingCollisionRadius,
  getResourceColliderRadius,
  isPointInTerrainObstacle,
} from './collision';

export interface Point2D {
  x: number;
  z: number;
}

export interface TerrainNavObstacles {
  rects?: TerrainBlockedRect[];
  discs?: TerrainBlockedDisc[];
  bridges?: TerrainPassableBridge[];
}

export const MAP_HALF_EXTENT = 104;
export const NAV_CELL_SIZE = 1.0;
export const NAV_GRID_DIM = Math.ceil((MAP_HALF_EXTENT * 2) / NAV_CELL_SIZE); // 208x208

export interface NavGrid {
  cellSize: number;
  dim: number;
  halfExtent: number;
  blocked: Uint8Array;
}

export function worldToGrid(
  wx: number,
  wz: number,
  halfExtent = MAP_HALF_EXTENT,
  cellSize = NAV_CELL_SIZE,
  dim = NAV_GRID_DIM
): { gx: number; gz: number } {
  const gx = Math.max(0, Math.min(dim - 1, Math.floor((wx + halfExtent) / cellSize)));
  const gz = Math.max(0, Math.min(dim - 1, Math.floor((wz + halfExtent) / cellSize)));
  return { gx, gz };
}

export function gridToWorld(
  gx: number,
  gz: number,
  halfExtent = MAP_HALF_EXTENT,
  cellSize = NAV_CELL_SIZE
): Point2D {
  return {
    x: -halfExtent + (gx + 0.5) * cellSize,
    z: -halfExtent + (gz + 0.5) * cellSize,
  };
}

/**
 * Builds a high-resolution (1m) walkability grid over the battlefield.
 * Uses solid building collision cores + unit clearance so flush-placed buildings
 * automatically retain walkable 1-unit corridors, and carves bridges/fords through rivers.
 */
export function buildNavGrid(
  buildings: BuildingEntity[],
  nodes: ResourceNode[],
  terrain?: TerrainNavObstacles,
  unitPadding = 0.36
): NavGrid {
  const dim = NAV_GRID_DIM;
  const blocked = new Uint8Array(dim * dim);

  const markDisc = (cx: number, cz: number, radius: number) => {
    if (radius <= 0) return;
    const minGx = Math.max(0, Math.floor((cx - radius + MAP_HALF_EXTENT) / NAV_CELL_SIZE));
    const maxGx = Math.min(dim - 1, Math.floor((cx + radius + MAP_HALF_EXTENT) / NAV_CELL_SIZE));
    const minGz = Math.max(0, Math.floor((cz - radius + MAP_HALF_EXTENT) / NAV_CELL_SIZE));
    const maxGz = Math.min(dim - 1, Math.floor((cz + radius + MAP_HALF_EXTENT) / NAV_CELL_SIZE));

    const rSq = radius * radius;
    for (let gz = minGz; gz <= maxGz; gz++) {
      const wz = -MAP_HALF_EXTENT + (gz + 0.5) * NAV_CELL_SIZE;
      for (let gx = minGx; gx <= maxGx; gx++) {
        const wx = -MAP_HALF_EXTENT + (gx + 0.5) * NAV_CELL_SIZE;
        const dx = wx - cx;
        const dz = wz - cz;
        if (dx * dx + dz * dz <= rSq) {
          blocked[gz * dim + gx] = 1;
        }
      }
    }
  };

  // 1. Natural terrain obstacles (deep water, cliff ridges) minus bridges/fords
  const rects = terrain?.rects || [];
  const discs = terrain?.discs || [];
  const bridges = terrain?.bridges || [];
  if (rects.length > 0 || discs.length > 0) {
    for (let gz = 0; gz < dim; gz++) {
      const wz = -MAP_HALF_EXTENT + (gz + 0.5) * NAV_CELL_SIZE;
      for (let gx = 0; gx < dim; gx++) {
        const wx = -MAP_HALF_EXTENT + (gx + 0.5) * NAV_CELL_SIZE;
        if (isPointInTerrainObstacle(wx, wz, rects, discs, bridges)) {
          blocked[gz * dim + gx] = 1;
        }
      }
    }
  }

  // 2. Buildings (use inner solid core + unitPadding so adjacent buildings keep walkable alleys)
  for (const b of buildings) {
    if (b.hp <= 0) continue;
    const coreRadius = getBuildingCollisionRadius(b);
    if (coreRadius <= 0) continue; // Walkable farms
    markDisc(b.x, b.z, coreRadius + unitPadding);
  }

  // 3. Resource nodes (skip walkable farms & hunt animals)
  for (const n of nodes) {
    if (n.amount <= 0) continue;
    if (n.resourceType === 'food' && (!n.subtype || n.subtype === 'farm' || n.subtype === 'hunt')) continue;
    const r = getResourceColliderRadius(n.resourceType, n.subtype);
    markDisc(n.x, n.z, r + unitPadding * 0.65);
  }

  return {
    cellSize: NAV_CELL_SIZE,
    dim,
    halfExtent: MAP_HALF_EXTENT,
    blocked,
  };
}

/**
 * Builds a navigable waterway grid specifically for Fishing Boats:
 * Open water cells (water rects / discs) are walkable (0); dry land, cliff obstacles,
 * fish nodes, and inland docks/structures are blocked (1) except narrow shoreline dock buffer.
 */
export function buildWaterNavGrid(
  buildings: BuildingEntity[],
  nodes: ResourceNode[],
  terrain?: TerrainNavObstacles
): NavGrid {
  const dim = NAV_GRID_DIM;
  const blocked = new Uint8Array(dim * dim);
  blocked.fill(1);

  const rects = (terrain?.rects || []).filter((r) => r.kind === 'water');
  const discs = (terrain?.discs || []).filter((d) => d.kind === 'water');
  if (rects.length > 0 || discs.length > 0) {
    for (let gz = 0; gz < dim; gz++) {
      const wz = -MAP_HALF_EXTENT + (gz + 0.5) * NAV_CELL_SIZE;
      for (let gx = 0; gx < dim; gx++) {
        const wx = -MAP_HALF_EXTENT + (gx + 0.5) * NAV_CELL_SIZE;
        if (isPointInTerrainObstacle(wx, wz, rects, discs, [])) {
          blocked[gz * dim + gx] = 0;
        }
      }
    }
  }

  // Allow slight shoreline pier apron around built docks so boats can pull right up to unload
  for (const b of buildings) {
    if (b.hp <= 0 || b.buildingType !== 'dock') continue;
    const dockReach = 2.6;
    const minGx = Math.max(0, Math.floor((b.x - dockReach + MAP_HALF_EXTENT) / NAV_CELL_SIZE));
    const maxGx = Math.min(dim - 1, Math.floor((b.x + dockReach + MAP_HALF_EXTENT) / NAV_CELL_SIZE));
    const minGz = Math.max(0, Math.floor((b.z - dockReach + MAP_HALF_EXTENT) / NAV_CELL_SIZE));
    const maxGz = Math.min(dim - 1, Math.floor((b.z + dockReach + MAP_HALF_EXTENT) / NAV_CELL_SIZE));
    for (let gz = minGz; gz <= maxGz; gz++) {
      const wz = -MAP_HALF_EXTENT + (gz + 0.5) * NAV_CELL_SIZE;
      for (let gx = minGx; gx <= maxGx; gx++) {
        const wx = -MAP_HALF_EXTENT + (gx + 0.5) * NAV_CELL_SIZE;
        const d = Math.hypot(wx - b.x, wz - b.z);
        if (d > 1.2 && d <= dockReach && isPointInTerrainObstacle(wx, wz, rects, discs, [])) {
          blocked[gz * dim + gx] = 0;
        }
      }
    }
  }

  return {
    cellSize: NAV_CELL_SIZE,
    dim,
    halfExtent: MAP_HALF_EXTENT,
    blocked,
  };
}

function findNearestWalkableCell(
  grid: NavGrid,
  targetGx: number,
  targetGz: number,
  maxRadius = 14,
  biasFromGx?: number,
  biasFromGz?: number
): { gx: number; gz: number } {
  const idx0 = targetGz * grid.dim + targetGx;
  if (grid.blocked[idx0] === 0) return { gx: targetGx, gz: targetGz };

  let best: { gx: number; gz: number } | null = null;
  let bestScore = Infinity;

  for (let r = 1; r <= maxRadius; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
        const nx = targetGx + dx;
        const nz = targetGz + dz;
        if (nx < 0 || nx >= grid.dim || nz < 0 || nz >= grid.dim) continue;
        if (grid.blocked[nz * grid.dim + nx] === 0) {
          const distFromTarget = Math.hypot(dx, dz);
          const distFromStart =
            biasFromGx !== undefined && biasFromGz !== undefined
              ? Math.hypot(nx - biasFromGx, nz - biasFromGz) * 0.25
              : 0;
          const score = distFromTarget + distFromStart;
          if (score < bestScore) {
            bestScore = score;
            best = { gx: nx, gz: nz };
          }
        }
      }
    }
    if (best) return best;
  }

  return { gx: targetGx, gz: targetGz };
}

/**
 * Checks whether a thick corridor (center + perpendicular wing offsets) between two world points
 * is obstacle-free on the grid so string-pull smoothing never clips corners.
 */
export function hasLineOfSight(
  grid: NavGrid,
  p1: Point2D,
  p2: Point2D,
  halfWidth = 0.34
): boolean {
  const dx = p2.x - p1.x;
  const dz = p2.z - p1.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.001) return true;

  const nx = -dz / dist;
  const nz = dx / dist;
  const steps = Math.max(2, Math.ceil(dist / (grid.cellSize * 0.45)));

  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const wx = p1.x + dx * t;
    const wz = p1.z + dz * t;

    const c = worldToGrid(wx, wz, grid.halfExtent, grid.cellSize, grid.dim);
    if (grid.blocked[c.gz * grid.dim + c.gx] === 1) return false;

    if (halfWidth > 0) {
      const l = worldToGrid(wx + nx * halfWidth, wz + nz * halfWidth, grid.halfExtent, grid.cellSize, grid.dim);
      if (grid.blocked[l.gz * grid.dim + l.gx] === 1) return false;

      const r = worldToGrid(wx - nx * halfWidth, wz - nz * halfWidth, grid.halfExtent, grid.cellSize, grid.dim);
      if (grid.blocked[r.gz * grid.dim + r.gx] === 1) return false;
    }
  }
  return true;
}

/**
 * Min-heap for fast A* open set extraction.
 */
class MinHeap {
  private nodes: number[] = [];
  private scores: Float32Array;

  constructor(scores: Float32Array) {
    this.scores = scores;
  }

  get size() {
    return this.nodes.length;
  }

  push(idx: number) {
    this.nodes.push(idx);
    this.bubbleUp(this.nodes.length - 1);
  }

  pop(): number {
    const top = this.nodes[0];
    const last = this.nodes.pop()!;
    if (this.nodes.length > 0) {
      this.nodes[0] = last;
      this.sinkDown(0);
    }
    return top;
  }

  private bubbleUp(n: number) {
    const item = this.nodes[n];
    const score = this.scores[item];
    while (n > 0) {
      const parentN = (n - 1) >> 1;
      const parent = this.nodes[parentN];
      if (score >= this.scores[parent]) break;
      this.nodes[parentN] = item;
      this.nodes[n] = parent;
      n = parentN;
    }
  }

  private sinkDown(n: number) {
    const length = this.nodes.length;
    const item = this.nodes[n];
    const score = this.scores[item];
    while (true) {
      const leftN = (n << 1) + 1;
      const rightN = leftN + 1;
      let swapN = -1;
      let swapScore = score;

      if (leftN < length) {
        const ls = this.scores[this.nodes[leftN]];
        if (ls < swapScore) {
          swapScore = ls;
          swapN = leftN;
        }
      }
      if (rightN < length) {
        const rs = this.scores[this.nodes[rightN]];
        if (rs < swapScore) {
          swapN = rightN;
        }
      }
      if (swapN === -1) break;
      this.nodes[n] = this.nodes[swapN];
      this.nodes[swapN] = item;
      n = swapN;
    }
  }
}

const DIRS: Array<[number, number, number]> = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

/**
 * Computes shortest obstacle-free smoothed path from (startX, startZ) to (goalX, goalZ).
 */
export function findPath(
  startX: number,
  startZ: number,
  goalX: number,
  goalZ: number,
  grid: NavGrid
): Point2D[] {
  const startRaw = worldToGrid(startX, startZ, grid.halfExtent, grid.cellSize, grid.dim);
  const goalRaw = worldToGrid(goalX, goalZ, grid.halfExtent, grid.cellSize, grid.dim);

  const start = findNearestWalkableCell(grid, startRaw.gx, startRaw.gz, 10, goalRaw.gx, goalRaw.gz);
  const goal = findNearestWalkableCell(grid, goalRaw.gx, goalRaw.gz, 14, start.gx, start.gz);

  const startPoint: Point2D =
    start.gx === startRaw.gx && start.gz === startRaw.gz
      ? { x: startX, z: startZ }
      : gridToWorld(start.gx, start.gz, grid.halfExtent, grid.cellSize);

  const goalPoint: Point2D =
    goal.gx === goalRaw.gx && goal.gz === goalRaw.gz
      ? { x: goalX, z: goalZ }
      : gridToWorld(goal.gx, goal.gz, grid.halfExtent, grid.cellSize);

  // Fast-path straight line only when thick LOS is unobstructed
  if (
    grid.blocked[start.gz * grid.dim + start.gx] === 0 &&
    grid.blocked[goal.gz * grid.dim + goal.gx] === 0 &&
    hasLineOfSight(grid, startPoint, goalPoint)
  ) {
    return [goalPoint];
  }

  if (start.gx === goal.gx && start.gz === goal.gz) {
    return [goalPoint];
  }

  const dim = grid.dim;
  const total = dim * dim;
  const gScore = new Float32Array(total);
  gScore.fill(Infinity);
  const fScore = new Float32Array(total);
  fScore.fill(Infinity);
  const cameFrom = new Int32Array(total);
  cameFrom.fill(-1);
  const closed = new Uint8Array(total);

  const startIdx = start.gz * dim + start.gx;
  const goalIdx = goal.gz * dim + goal.gx;

  const heuristic = (gx: number, gz: number) => {
    const dx = Math.abs(gx - goal.gx);
    const dz = Math.abs(gz - goal.gz);
    return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz);
  };

  gScore[startIdx] = 0;
  fScore[startIdx] = heuristic(start.gx, start.gz);

  const open = new MinHeap(fScore);
  open.push(startIdx);

  let found = false;
  let iterations = 0;
  const maxIterations = total;

  while (open.size > 0 && iterations < maxIterations) {
    iterations++;
    const current = open.pop();
    if (current === goalIdx) {
      found = true;
      break;
    }
    if (closed[current]) continue;
    closed[current] = 1;

    const cx = current % dim;
    const cz = (current - cx) / dim;
    const currentG = gScore[current];

    for (let i = 0; i < DIRS.length; i++) {
      const [dx, dz, stepCost] = DIRS[i];
      const nx = cx + dx;
      const nz = cz + dz;
      if (nx < 0 || nx >= dim || nz < 0 || nz >= dim) continue;

      const nIdx = nz * dim + nx;
      if (closed[nIdx] || grid.blocked[nIdx] === 1) continue;

      // Prevent diagonal corner cutting through blocked orthogonal neighbors
      if (dx !== 0 && dz !== 0) {
        if (grid.blocked[cz * dim + nx] === 1 || grid.blocked[nz * grid.dim + cx] === 1) {
          continue;
        }
      }

      const tentativeG = currentG + stepCost;
      if (tentativeG < gScore[nIdx]) {
        cameFrom[nIdx] = current;
        gScore[nIdx] = tentativeG;
        fScore[nIdx] = tentativeG + heuristic(nx, nz);
        open.push(nIdx);
      }
    }
  }

  if (!found) {
    return [goalPoint];
  }

  // Reconstruct raw cell path
  const rawPoints: Point2D[] = [];
  let curr = goalIdx;
  while (curr !== -1 && curr !== startIdx) {
    const gx = curr % dim;
    const gz = (curr - gx) / dim;
    rawPoints.push(
      curr === goalIdx ? goalPoint : gridToWorld(gx, gz, grid.halfExtent, grid.cellSize)
    );
    curr = cameFrom[curr];
  }
  rawPoints.reverse();

  if (rawPoints.length <= 1) return rawPoints;

  // String-pull smoothing with thick LOS capsule
  const smoothed: Point2D[] = [];
  let anchor = startPoint;
  let i = 0;
  while (i < rawPoints.length) {
    let furthest = i;
    for (let j = rawPoints.length - 1; j > i; j--) {
      if (hasLineOfSight(grid, anchor, rawPoints[j])) {
        furthest = j;
        break;
      }
    }
    smoothed.push(rawPoints[furthest]);
    anchor = rawPoints[furthest];
    i = furthest + 1;
  }

  return smoothed;
}
