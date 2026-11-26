import { WALL_MODEL_HALF_LENGTH, WALL_MODEL_HALF_WIDTH } from './wallPlacement';

export interface WallPlacementIndexPoint { x: number; z: number; rotationY?: number; }
interface SpatialEntry<T> { item: T; queryStamp: number; }

/** Match-local grid index for static obstacle centres along a wall route. */
export class WallPlacementSpatialIndex<T extends { x: number; z: number }> {
  private static readonly CELL_SIZE = 8;
  private readonly buckets = new Map<string, SpatialEntry<T>[]>();
  private readonly entries: SpatialEntry<T>[] = [];
  private maxRadius = 0;
  private queryStamp = 0;

  public rebuild(items: readonly T[], radiusOf: (item: T) => number): void {
    this.buckets.clear();
    this.entries.length = 0;
    this.maxRadius = 0;
    for (const item of items) {
      if (!Number.isFinite(item.x) || !Number.isFinite(item.z)) continue;
      const rawRadius = radiusOf(item);
      const radius = Number.isFinite(rawRadius) ? Math.max(0, rawRadius) : 0;
      const entry: SpatialEntry<T> = { item, queryStamp: 0 };
      this.entries.push(entry);
      const key = this.key(
        Math.floor(item.x / WallPlacementSpatialIndex.CELL_SIZE),
        Math.floor(item.z / WallPlacementSpatialIndex.CELL_SIZE),
      );
      const bucket = this.buckets.get(key);
      if (bucket) bucket.push(entry);
      else this.buckets.set(key, [entry]);
      this.maxRadius = Math.max(this.maxRadius, radius);
    }
  }

  public clear(): void {
    this.buckets.clear();
    this.entries.length = 0;
    this.maxRadius = 0;
    this.queryStamp = 0;
  }

  public collect(placements: readonly WallPlacementIndexPoint[], target: T[]): T[] {
    target.length = 0;
    if (placements.length === 0 || this.entries.length === 0) return target;
    this.queryStamp = (this.queryStamp + 1) >>> 0;
    if (this.queryStamp === 0) {
      for (const entry of this.entries) entry.queryStamp = 0;
      this.queryStamp = 1;
    }
    const stamp = this.queryStamp;
    const cellSize = WallPlacementSpatialIndex.CELL_SIZE;
    for (const placement of placements) {
      const yaw = placement.rotationY ?? 0;
      const cos = Math.cos(yaw);
      const sin = Math.sin(yaw);
      const extentX = Math.abs(cos) * WALL_MODEL_HALF_LENGTH + Math.abs(sin) * WALL_MODEL_HALF_WIDTH + this.maxRadius;
      const extentZ = Math.abs(sin) * WALL_MODEL_HALF_LENGTH + Math.abs(cos) * WALL_MODEL_HALF_WIDTH + this.maxRadius;
      const minCellX = Math.floor((placement.x - extentX) / cellSize);
      const maxCellX = Math.floor((placement.x + extentX) / cellSize);
      const minCellZ = Math.floor((placement.z - extentZ) / cellSize);
      const maxCellZ = Math.floor((placement.z + extentZ) / cellSize);
      for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
        for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ++) {
          const bucket = this.buckets.get(this.key(cellX, cellZ));
          if (!bucket) continue;
          for (const entry of bucket) {
            if (entry.queryStamp === stamp) continue;
            entry.queryStamp = stamp;
            target.push(entry.item);
          }
        }
      }
    }
    return target;
  }

  public get size(): number { return this.entries.length; }
  public get cellCount(): number { return this.buckets.size; }

  private key(cellX: number, cellZ: number): string { return `${cellX},${cellZ}`; }
}
