export interface EntityWithStableId {
  id: string;
}

/**
 * Rebuild an existing lookup table in place.
 *
 * Keeping the Map instance avoids allocating a new hash table on every simulation
 * step while preserving Array.find's first-match behavior for duplicate IDs.
 */
export function rebuildEntityIdIndex<T extends EntityWithStableId>(
  index: Map<string, T>,
  entities: readonly T[],
): Map<string, T> {
  index.clear();
  for (const entity of entities) {
    if (!index.has(entity.id)) index.set(entity.id, entity);
  }
  return index;
}

/** Create a new lookup table when a persistent one is not available. */
export function createEntityIdIndex<T extends EntityWithStableId>(
  entities: readonly T[],
): Map<string, T> {
  return rebuildEntityIdIndex(new Map<string, T>(), entities);
}


export interface EntityWithFaction {
  faction: string;
}

/** Groups entities by faction in one pass while preserving their source-array order. */
export function groupEntitiesByFaction<T extends EntityWithFaction>(
  entities: readonly T[],
): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const entity of entities) {
    const group = groups.get(entity.faction);
    if (group) group.push(entity);
    else groups.set(entity.faction, [entity]);
  }
  return groups;
}
