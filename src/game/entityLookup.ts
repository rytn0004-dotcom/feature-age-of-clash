export interface EntityWithStableId {
  id: string;
}

/**
 * Build a per-update lookup table for entity IDs.
 *
 * Keep the first occurrence for each ID so lookups retain Array.find semantics
 * even if malformed input temporarily contains duplicate IDs.
 */
export function createEntityIdIndex<T extends EntityWithStableId>(
  entities: readonly T[],
): Map<string, T> {
  const index = new Map<string, T>();
  for (const entity of entities) {
    if (!index.has(entity.id)) index.set(entity.id, entity);
  }
  return index;
}
