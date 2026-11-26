export interface UnitBadgeLookupCache<T> {
  unitBadge?: T | null;
}

/**
 * Unit badges are stable children of their unit mesh. Resolve the recursive
 * Object3D lookup once and reuse the reference; if a mesh has no badge yet,
 * keep retrying so late-attached badges preserve the previous behavior.
 */
export function getCachedUnitBadge<T>(
  cache: UnitBadgeLookupCache<T>,
  lookup: () => T | null,
): T | null {
  if (cache.unitBadge) return cache.unitBadge;
  const badge = lookup();
  if (badge) cache.unitBadge = badge;
  return badge;
}

const UNIT_ROLE_BADGE_ICONS: Readonly<Record<string, string>> = Object.freeze({
  villager: '⛏️',
  boat: '⛵',
  swordsman: '⚔️',
  archer: '🏹',
  knight: '🐎',
  ninja: '🥷',
  saiyan: '⚡',
  mage: '🔮',
  ram: '🐏',
  cannon: '💣',
});

/** Static role icon mapping shared by all units rather than rebuilt per badge refresh. */
export function getUnitRoleBadgeIcon(modelType: string, isSiege: boolean): string {
  if (modelType === 'golem') return isSiege ? '🪨' : '🪵';
  return UNIT_ROLE_BADGE_ICONS[modelType] || '⚔️';
}
