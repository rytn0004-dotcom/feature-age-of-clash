const normalizeResourceAmount = (amount: number): number =>
  Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : 0;

/** Exact stock count for wide layouts and accessible labels. */
export const formatResourceCount = (amount: number): string =>
  normalizeResourceAmount(amount).toLocaleString('zh-TW');

/** Compact stock count for narrow HUD cells while retaining the exact value in the tooltip. */
export const formatCompactResourceCount = (amount: number): string => {
  const value = normalizeResourceAmount(amount);
  const compact = (divisor: number, suffix: string) => {
    const tenths = Math.floor((value / divisor) * 10) / 10;
    return `${tenths.toLocaleString('zh-TW', { maximumFractionDigits: 1 })}${suffix}`;
  };

  if (value >= 100_000_000) return compact(100_000_000, '億');
  if (value >= 10_000) return compact(10_000, '萬');
  return value.toLocaleString('zh-TW');
};
