import type { BuildingType } from '../types/game';

export type MongolBuildingModelProfile =
  | 'steppe_archery_yard'
  | 'steppe_horse_corral'
  | 'mobile_siege_camp'
  | 'raised_grain_store'
  | 'nomad_lumber_outpost'
  | 'nomad_ore_outpost'
  | 'steppe_ferry_landing'
  | 'frontier_watchtower'
  | 'khanate_palisade_fortress';

const MONGOL_BUILDING_MODEL_PROFILES: Partial<Record<BuildingType, MongolBuildingModelProfile>> = {
  archery_range: 'steppe_archery_yard',
  stable: 'steppe_horse_corral',
  siege_workshop: 'mobile_siege_camp',
  granary: 'raised_grain_store',
  lumber_camp: 'nomad_lumber_outpost',
  mining_camp: 'nomad_ore_outpost',
  dock: 'steppe_ferry_landing',
  tower: 'frontier_watchtower',
  castle: 'khanate_palisade_fortress',
};

/** Returns the dedicated Mongol structural model family, or null when the standard civ model is intended. */
export function getMongolBuildingModelProfile(type: BuildingType): MongolBuildingModelProfile | null {
  return MONGOL_BUILDING_MODEL_PROFILES[type] ?? null;
}
