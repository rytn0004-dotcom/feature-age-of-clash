/**
 * Dense, allocation-free round-robin work queue for frequently updated scene items.
 * Swap-removal keeps membership changes O(1) and each process() call has a hard
 * upper bound, preventing large static-world lists from creating periodic frame spikes.
 */
export class RoundRobinBatch<T> {
  private readonly items: T[] = [];
  private readonly indexByKey = new Map<string, number>();
  private cursor = 0;

  constructor(private readonly getKey: (item: T) => string) {}

  get size(): number {
    return this.items.length;
  }

  add(item: T): void {
    const key = this.getKey(item);
    const existingIndex = this.indexByKey.get(key);
    if (existingIndex !== undefined) {
      this.items[existingIndex] = item;
      return;
    }

    this.indexByKey.set(key, this.items.length);
    this.items.push(item);
  }

  remove(key: string): boolean {
    const removeIndex = this.indexByKey.get(key);
    if (removeIndex === undefined) return false;

    const lastIndex = this.items.length - 1;
    const lastItem = this.items[lastIndex];
    this.items.pop();
    this.indexByKey.delete(key);

    if (removeIndex !== lastIndex) {
      this.items[removeIndex] = lastItem;
      this.indexByKey.set(this.getKey(lastItem), removeIndex);
    }

    if (this.items.length === 0) {
      this.cursor = 0;
    } else {
      if (removeIndex < this.cursor) this.cursor -= 1;
      if (this.cursor >= this.items.length) this.cursor = 0;
    }
    return true;
  }

  /**
   * Visits at most floor(limit) items, then resumes at the next item on the next
   * call. The visitor must not add/remove items during iteration.
   */
  process(limit: number, visit: (item: T) => void): number {
    if (!Number.isFinite(limit) || limit <= 0 || this.items.length === 0) return 0;

    const count = Math.min(this.items.length, Math.floor(limit));
    for (let index = 0; index < count; index += 1) {
      const item = this.items[this.cursor];
      this.cursor = (this.cursor + 1) % this.items.length;
      visit(item);
    }
    return count;
  }

  clear(): void {
    this.items.length = 0;
    this.indexByKey.clear();
    this.cursor = 0;
  }
}
