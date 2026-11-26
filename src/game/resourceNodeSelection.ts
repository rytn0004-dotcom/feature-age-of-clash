export interface ResourceNodePreselectionCandidate<T extends { id: string }> {
  node: T | null;
  approachDistance: number;
  assigned: number;
  preScore: number;
}

/** Allocate a fixed-size scratch pool once for deterministic top-K node preselection. */
export function createResourceNodeCandidateScratch<T extends { id: string }>(
  capacity: number,
): ResourceNodePreselectionCandidate<T>[] {
  const safeCapacity = Number.isFinite(capacity) ? Math.max(0, Math.floor(capacity)) : 0;
  return Array.from({ length: safeCapacity }, () => ({
    node: null,
    approachDistance: 0,
    assigned: 0,
    preScore: 0,
  }));
}

/**
 * Insert a node into a small sorted prefix without filter/map/sort allocations.
 * Existing scratch records are shifted in place and equal scores keep stable ID order.
 */
export function insertResourceNodeCandidate<T extends { id: string }>(
  slots: ResourceNodePreselectionCandidate<T>[],
  currentCount: number,
  node: T,
  approachDistance: number,
  assigned: number,
  preScore: number,
): number {
  const capacity = slots.length;
  const count = Math.max(0, Math.min(capacity, Math.floor(currentCount)));
  if (capacity === 0 || !Number.isFinite(approachDistance) || !Number.isFinite(assigned) || Number.isNaN(preScore)) {
    return count;
  }

  let insertAt = 0;
  while (insertAt < count) {
    const current = slots[insertAt];
    const currentId = current.node?.id ?? '';
    if (
      current.preScore > preScore ||
      (current.preScore === preScore && currentId.localeCompare(node.id) > 0)
    ) break;
    insertAt++;
  }
  if (insertAt >= capacity) return count;

  const nextCount = Math.min(capacity, count + 1);
  for (let index = nextCount - 1; index > insertAt; index--) {
    const destination = slots[index];
    const source = slots[index - 1];
    destination.node = source.node;
    destination.approachDistance = source.approachDistance;
    destination.assigned = source.assigned;
    destination.preScore = source.preScore;
  }

  const slot = slots[insertAt];
  slot.node = node;
  slot.approachDistance = approachDistance;
  slot.assigned = assigned;
  slot.preScore = preScore;
  return nextCount;
}
