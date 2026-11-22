import type { Resources } from '../types/game';

export interface AgeResourceProgress {
  foodRatio: number;
  goldRatio: number;
  overallRatio: number;
  foodMissing: number;
  goldMissing: number;
  ready: boolean;
}

/** Measures the two stockpiles required for the next landmark age-up. */
export function getAgeResourceProgress(
  current: Pick<Resources, 'food' | 'gold'>,
  required: Pick<Resources, 'food' | 'gold'>
): AgeResourceProgress {
  const safeStock = (value: number): number =>
    Number.isFinite(value) ? Math.max(0, value) : 0;
  const safeRequirement = (value: number): number =>
    Number.isFinite(value) ? Math.max(0, value) : 0;
  const ratio = (stock: number, goal: number): number =>
    goal <= 0 ? 1 : Math.max(0, Math.min(1, safeStock(stock) / goal));

  const foodGoal = safeRequirement(required.food);
  const goldGoal = safeRequirement(required.gold);
  const foodStock = safeStock(current.food);
  const goldStock = safeStock(current.gold);
  const foodRatio = ratio(foodStock, foodGoal);
  const goldRatio = ratio(goldStock, goldGoal);

  return {
    foodRatio,
    goldRatio,
    overallRatio: Math.min(foodRatio, goldRatio),
    foodMissing: Math.max(0, foodGoal - foodStock),
    goldMissing: Math.max(0, goldGoal - goldStock),
    ready: foodMissingIsZero(foodGoal, foodStock) && foodMissingIsZero(goldGoal, goldStock),
  };
}

function foodMissingIsZero(required: number, current: number): boolean {
  return required <= current;
}
