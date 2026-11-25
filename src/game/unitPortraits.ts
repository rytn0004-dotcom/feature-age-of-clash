import { UnitDefinition } from '../types/game';

export type UnitPortraitKey =
  | 'scout_rider'
  | 'villager'
  | 'fishing_boat'
  | 'transport_boat'
  | 'war_galley'
  | 'swordsman'
  | 'longbowman'
  | 'knight'
  | 'battering_ram'
  | 'catapult'
  | 'bombard_cannon'
  | 'greek_fire_siphon'
  | 'anime_ninja_assassin'
  | 'anime_saiyan_brawler'
  | 'anime_katana_shinigami'
  | 'anime_spirit_harvester'
  | 'fantasy_footman'
  | 'fantasy_paladin'
  | 'fantasy_mage'
  | 'fantasy_treant'
  | 'fantasy_goblin_sapper'
  | 'mongol_herder'
  | 'mongol_foot_guard'
  | 'mongol_lancer'
  | 'mongol_mangudai'
  | 'mongol_keshik'
  | 'mongol_shaman'
  | 'fallback_horse_archer'
  | 'fallback_keshik'
  | 'fallback_shaman'
  | 'fallback_villager'
  | 'fallback_swordsman'
  | 'fallback_archer'
  | 'fallback_knight'
  | 'fallback_ninja'
  | 'fallback_saiyan'
  | 'fallback_mage'
  | 'fallback_guardian'
  | 'fallback_oracle'
  | 'fallback_artificer'
  | 'fallback_golem'
  | 'fallback_ram'
  | 'fallback_cannon'
  | 'fallback_boat';

export interface UnitPortraitSpec {
  key: UnitPortraitKey;
  label: string;
  accentHex: string;
  bgFrom: string;
  bgTo: string;
}

const BUILTIN_PORTRAIT_SPECS: Record<string, UnitPortraitSpec> = {
  scout_rider: {
    key: 'scout_rider',
    label: '偵查斥候騎兵',
    accentHex: '#38bdf8',
    bgFrom: '#0c4a6e',
    bgTo: '#0f172a',
  },
  villager: {
    key: 'villager',
    label: '王國村民',
    accentHex: '#d97706',
    bgFrom: '#451a03',
    bgTo: '#1c1917',
  },
  fishing_boat: {
    key: 'fishing_boat',
    label: '遠洋漁船',
    accentHex: '#38bdf8',
    bgFrom: '#0c4a6e',
    bgTo: '#1e293b',
  },
  transport_boat: {
    key: 'transport_boat',
    label: '登陸運輸船',
    accentHex: '#b45309',
    bgFrom: '#1e3a8a',
    bgTo: '#0f172a',
  },
  war_galley: {
    key: 'war_galley',
    label: '重裝戰艦',
    accentHex: '#f59e0b',
    bgFrom: '#7f1d1d',
    bgTo: '#0f172a',
  },
  swordsman: {
    key: 'swordsman',
    label: '重裝劍士',
    accentHex: '#94a3b8',
    bgFrom: '#1e293b',
    bgTo: '#090d16',
  },
  longbowman: {
    key: 'longbowman',
    label: '長弓獵手',
    accentHex: '#10b981',
    bgFrom: '#064e3b',
    bgTo: '#0f172a',
  },
  knight: {
    key: 'knight',
    label: '重裝騎士',
    accentHex: '#eab308',
    bgFrom: '#451a03',
    bgTo: '#0f172a',
  },
  battering_ram: {
    key: 'battering_ram',
    label: '攻城衝車',
    accentHex: '#b45309',
    bgFrom: '#422006',
    bgTo: '#18181b',
  },
  catapult: {
    key: 'catapult',
    label: '重型投石車',
    accentHex: '#d97706',
    bgFrom: '#3f2e21',
    bgTo: '#18181b',
  },
  bombard_cannon: {
    key: 'bombard_cannon',
    label: '帝國加農砲',
    accentHex: '#f97316',
    bgFrom: '#431407',
    bgTo: '#0f172a',
  },
  greek_fire_siphon: {
    key: 'greek_fire_siphon',
    label: '希臘火噴射車',
    accentHex: '#fb923c',
    bgFrom: '#7c2d12',
    bgTo: '#1c1917',
  },
  anime_ninja_assassin: {
    key: 'anime_ninja_assassin',
    label: '影之暗殺者',
    accentHex: '#818cf8',
    bgFrom: '#1e1b4b',
    bgTo: '#090d16',
  },
  anime_saiyan_brawler: {
    key: 'anime_saiyan_brawler',
    label: '星辰鬥士',
    accentHex: '#facc15',
    bgFrom: '#713f12',
    bgTo: '#0f172a',
  },
  anime_katana_shinigami: {
    key: 'anime_katana_shinigami',
    label: '鬼面太刀侍',
    accentHex: '#f43f5e',
    bgFrom: '#4c0519',
    bgTo: '#090d16',
  },
  anime_spirit_harvester: {
    key: 'anime_spirit_harvester',
    label: '狐面采靈巫',
    accentHex: '#2dd4bf',
    bgFrom: '#134e4a',
    bgTo: '#0f172a',
  },
  fantasy_footman: {
    key: 'fantasy_footman',
    label: '秘銀森林步兵',
    accentHex: '#6ee7b7',
    bgFrom: '#064e3b',
    bgTo: '#0f172a',
  },
  fantasy_paladin: {
    key: 'fantasy_paladin',
    label: '聖光聖騎士',
    accentHex: '#fde047',
    bgFrom: '#78350f',
    bgTo: '#0f172a',
  },
  fantasy_mage: {
    key: 'fantasy_mage',
    label: '秘法大法師',
    accentHex: '#c084fc',
    bgFrom: '#3b0764',
    bgTo: '#0f172a',
  },
  fantasy_treant: {
    key: 'fantasy_treant',
    label: '遠古樹人守衛',
    accentHex: '#4ade80',
    bgFrom: '#14532d',
    bgTo: '#09150d',
  },
  fantasy_goblin_sapper: {
    key: 'fantasy_goblin_sapper',
    label: '地精工兵',
    accentHex: '#a3e635',
    bgFrom: '#365314',
    bgTo: '#18181b',
  },
  mongol_herder: { key: 'mongol_herder', label: '草原牧民', accentHex: '#d97706', bgFrom: '#78350f', bgTo: '#1c1917' },
  mongol_foot_guard: { key: 'mongol_foot_guard', label: '蒙古刀盾步兵', accentHex: '#d97706', bgFrom: '#78350f', bgTo: '#1c1917' },
  mongol_lancer: { key: 'mongol_lancer', label: '草原長槍騎兵', accentHex: '#0f766e', bgFrom: '#134e4a', bgTo: '#0f172a' },
  mongol_mangudai: { key: 'mongol_mangudai', label: '蒙古突騎', accentHex: '#f59e0b', bgFrom: '#78350f', bgTo: '#1c1917' },
  mongol_keshik: { key: 'mongol_keshik', label: '怯薛皇衛', accentHex: '#fbbf24', bgFrom: '#78350f', bgTo: '#0f172a' },
  mongol_shaman: { key: 'mongol_shaman', label: '長生天薩滿', accentHex: '#38bdf8', bgFrom: '#0c4a6e', bgTo: '#0f172a' },
};

const MODEL_FALLBACK_SPECS: Record<
  NonNullable<UnitDefinition['visual']['modelType']>,
  UnitPortraitSpec
> = {
  villager: {
    key: 'fallback_villager',
    label: '工兵 / 採集者',
    accentHex: '#d97706',
    bgFrom: '#451a03',
    bgTo: '#1c1917',
  },
  swordsman: {
    key: 'fallback_swordsman',
    label: '近戰劍兵',
    accentHex: '#94a3b8',
    bgFrom: '#1e293b',
    bgTo: '#0f172a',
  },
  archer: {
    key: 'fallback_archer',
    label: '遠程弓手',
    accentHex: '#10b981',
    bgFrom: '#064e3b',
    bgTo: '#0f172a',
  },
  knight: {
    key: 'fallback_knight',
    label: '重裝騎兵',
    accentHex: '#eab308',
    bgFrom: '#451a03',
    bgTo: '#0f172a',
  },
  ninja: {
    key: 'fallback_ninja',
    label: '影之忍者',
    accentHex: '#818cf8',
    bgFrom: '#1e1b4b',
    bgTo: '#0f172a',
  },
  saiyan: {
    key: 'fallback_saiyan',
    label: '氣功戰士',
    accentHex: '#facc15',
    bgFrom: '#713f12',
    bgTo: '#0f172a',
  },
  mage: {
    key: 'fallback_mage',
    label: '秘法師',
    accentHex: '#c084fc',
    bgFrom: '#3b0764',
    bgTo: '#0f172a',
  },
  guardian: {
    key: 'fallback_guardian',
    label: '壁壘守護者',
    accentHex: '#cbd5e1',
    bgFrom: '#334155',
    bgTo: '#0b1220',
  },
  oracle: {
    key: 'fallback_oracle',
    label: '星界預言者',
    accentHex: '#67e8f9',
    bgFrom: '#312e81',
    bgTo: '#081225',
  },
  artificer: {
    key: 'fallback_artificer',
    label: '奧術工匠',
    accentHex: '#d6a84b',
    bgFrom: '#134e4a',
    bgTo: '#111827',
  },
  golem: {
    key: 'fallback_golem',
    label: '巨像 / 攻城機',
    accentHex: '#4ade80',
    bgFrom: '#14532d',
    bgTo: '#0f172a',
  },
  ram: {
    key: 'fallback_ram',
    label: '攻城衝車',
    accentHex: '#b45309',
    bgFrom: '#422006',
    bgTo: '#18181b',
  },
  cannon: {
    key: 'fallback_cannon',
    label: '重砲火器',
    accentHex: '#f97316',
    bgFrom: '#431407',
    bgTo: '#0f172a',
  },
  horse_archer: { key: 'fallback_horse_archer', label: '草原騎射兵', accentHex: '#f59e0b', bgFrom: '#78350f', bgTo: '#0f172a' },
  mongol_lancer: { key: 'fallback_mongol_lancer', label: '草原長槍騎兵', accentHex: '#0f766e', bgFrom: '#134e4a', bgTo: '#0f172a' },
  keshik: { key: 'fallback_keshik', label: '重裝怯薛騎兵', accentHex: '#fbbf24', bgFrom: '#78350f', bgTo: '#0f172a' },
  shaman: { key: 'fallback_shaman', label: '薩滿祭司', accentHex: '#38bdf8', bgFrom: '#0c4a6e', bgTo: '#0f172a' },
  boat: {
    key: 'fallback_boat',
    label: '海上船艦',
    accentHex: '#38bdf8',
    bgFrom: '#0c4a6e',
    bgTo: '#0f172a',
  },
};

export function getUnitPortraitSpec(
  unitId?: string,
  modelType?: UnitDefinition['visual']['modelType']
): UnitPortraitSpec {
  if (unitId && BUILTIN_PORTRAIT_SPECS[unitId]) {
    return BUILTIN_PORTRAIT_SPECS[unitId];
  }
  if (modelType && MODEL_FALLBACK_SPECS[modelType]) {
    return MODEL_FALLBACK_SPECS[modelType];
  }
  return MODEL_FALLBACK_SPECS.swordsman;
}
