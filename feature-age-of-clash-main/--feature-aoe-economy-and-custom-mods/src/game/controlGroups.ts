export type ControlGroupsMap = Record<number, string[]>;

export function createEmptyControlGroups(): ControlGroupsMap {
  return {
    1: [],
    2: [],
    3: [],
    4: [],
    5: [],
    6: [],
    7: [],
    8: [],
    9: [],
  };
}

/**
 * Assigns or appends unit IDs into a numbered squad control group (1-9).
 */
export function updateControlGroup(
  groups: ControlGroupsMap,
  groupNum: number,
  unitIds: string[],
  append = false
): ControlGroupsMap {
  if (groupNum < 1 || groupNum > 9) return groups;
  const cleanIds = Array.from(new Set(unitIds));
  const existing = groups[groupNum] || [];

  const nextList = append
    ? Array.from(new Set([...existing, ...cleanIds]))
    : cleanIds;

  return {
    ...groups,
    [groupNum]: nextList,
  };
}

/**
 * Removes dead or missing unit IDs from all control groups.
 */
export function pruneControlGroups(
  groups: ControlGroupsMap,
  aliveUnitIds: Set<string>
): ControlGroupsMap {
  const next: ControlGroupsMap = { ...groups };
  for (let i = 1; i <= 9; i++) {
    next[i] = (groups[i] || []).filter((id) => aliveUnitIds.has(id));
  }
  return next;
}
