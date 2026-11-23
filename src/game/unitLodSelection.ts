/**
 * Build the set of units that must bypass distance-based visual LOD.
 * Called once per unit-LOD batch so the unit loop performs O(1) membership checks.
 */
export function createUnitLodHighDetailSet(
  selectedUnitIds: readonly string[],
  inspectedUnitId: string | null,
): ReadonlySet<string> {
  const highDetailUnitIds = new Set(selectedUnitIds);
  if (inspectedUnitId !== null) highDetailUnitIds.add(inspectedUnitId);
  return highDetailUnitIds;
}
