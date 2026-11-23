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
