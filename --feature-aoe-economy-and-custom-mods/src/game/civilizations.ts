import {
  AgeLevel,
  BuildingType,
  CivilizationId,
  TechDefinition,
  UnitCategory,
  UnitStats,
} from '../types/game';

export interface CivilizationConfig {
  id: CivilizationId;
  name: string;
  shortName: string;
  icon: string;
  accentColor: string;
  subtitle: string;
  progressionTitle: string;
  progressionSummary: string;
  workerUnitId: string;
  starterMeleeUnitId: string;
  starterRangedUnitId: string;
  uniqueBuildingType: BuildingType;
  buildableBuildings: BuildingType[];
  buildingNames: Partial<Record<BuildingType, string>>;
  trainableByBuilding: Partial<Record<BuildingType, string[]>>;
  passiveBonuses: {
    gatherRateMultiplier?: number;
    moveSpeedMultiplier?: number;
    hpMultiplier?: number;
    defenseBonus?: number;
  };
}

export const CIVILIZATION_LIST: CivilizationConfig[] = [
  {
    id: 'medieval',
    name: '聖殿鐵衛帝國',
    shortName: '聖殿帝國',
    icon: '🏛️',
    accentColor: '#f59e0b',
    subtitle: '重裝板甲與皇家鍛造工坊，堅不可摧的鋼鐵防線',
    progressionTitle: '皇家軍械鍛造與騎士陣列',
    progressionSummary: '建造【皇家鍛造工坊】強化武器護甲並加速兵營訓練，部隊護甲天生 +1、騎步兵推進穩健。',
    workerUnitId: 'villager',
    starterMeleeUnitId: 'swordsman',
    starterRangedUnitId: 'longbowman',
    uniqueBuildingType: 'armory_forge',
    buildableBuildings: [
      'barracks',
      'archery_range',
      'armory_forge',
      'farm',
      'lumber_camp',
      'mining_camp',
      'tower',
      'castle',
    ],
    buildingNames: {
      town_center: '帝國城堡中心',
      barracks: '鐵衛兵營',
      archery_range: '紫杉長弓營',
      tower: '石砌警戒箭塔',
      castle: '聖殿重裝要塞',
    },
    trainableByBuilding: {
      town_center: ['villager'],
      barracks: ['swordsman', 'knight', 'battering_ram', 'catapult'],
      archery_range: ['longbowman'],
      castle: ['knight', 'battering_ram', 'catapult', 'bombard_cannon'],
      landmark_barracks: ['swordsman', 'knight', 'battering_ram'],
      landmark_citadel: ['knight', 'battering_ram', 'catapult'],
      landmark_arsenal: ['battering_ram', 'catapult', 'bombard_cannon'],
    },
    passiveBonuses: {
      defenseBonus: 1,
      hpMultiplier: 1.05,
    },
  },
  {
    id: 'anime',
    name: '蒼嵐忍道聯盟',
    shortName: '忍界聯邦',
    icon: '⚡',
    accentColor: '#38bdf8',
    subtitle: '靈脈神社與獨家戰意覺醒系統，高機動與極限突破',
    progressionTitle: '靈脈修煉 · 氣彈超戰士專屬歷練',
    progressionSummary: '建造【靈脈神社】凝聚查克拉並自動產金/木；旗下「氣彈超戰士」為全場唯一可透過戰鬥歷練晉升 (Lv.1~5) 突破極限的覺醒單位！',
    workerUnitId: 'anime_spirit_harvester',
    starterMeleeUnitId: 'anime_katana_shinigami',
    starterRangedUnitId: 'anime_ninja_assassin',
    uniqueBuildingType: 'spirit_shrine',
    buildableBuildings: [
      'barracks',
      'archery_range',
      'spirit_shrine',
      'farm',
      'lumber_camp',
      'mining_camp',
      'tower',
      'castle',
    ],
    buildingNames: {
      town_center: '宗家天守本陣',
      barracks: '忍術劍豪道場',
      archery_range: '氣功忍具修煉殿',
      tower: '靈脈結界哨塔',
      castle: '蒼嵐大本營御殿',
    },
    trainableByBuilding: {
      town_center: ['anime_spirit_harvester'],
      barracks: ['anime_katana_shinigami', 'anime_saiyan_brawler', 'battering_ram'],
      archery_range: ['anime_ninja_assassin', 'anime_saiyan_brawler'],
      castle: ['anime_saiyan_brawler', 'battering_ram', 'catapult', 'bombard_cannon'],
      landmark_barracks: ['anime_katana_shinigami', 'anime_saiyan_brawler', 'battering_ram'],
      landmark_citadel: ['anime_saiyan_brawler', 'anime_ninja_assassin', 'catapult'],
      landmark_arsenal: ['anime_saiyan_brawler', 'catapult', 'bombard_cannon'],
    },
    passiveBonuses: {
      moveSpeedMultiplier: 1.1,
      gatherRateMultiplier: 1.1,
    },
  },
  {
    id: 'fantasy',
    name: '秘銀森靈聖域',
    shortName: '奧術古樹',
    icon: '🔮',
    accentColor: '#34d399',
    subtitle: '精靈魔力之泉與遠古樹靈，生命再生光環與毀滅奧術',
    progressionTitle: '魔力泉源與古樹共生',
    progressionSummary: '建造【精靈魔力之泉】為周邊傷兵持續回血並產出糧食與黃金，全軍生命天生 +12%。',
    workerUnitId: 'fantasy_goblin_sapper',
    starterMeleeUnitId: 'fantasy_paladin',
    starterRangedUnitId: 'fantasy_mage',
    uniqueBuildingType: 'mana_well',
    buildableBuildings: [
      'barracks',
      'archery_range',
      'mana_well',
      'farm',
      'lumber_camp',
      'mining_camp',
      'tower',
      'castle',
    ],
    buildingNames: {
      town_center: '永恆生命聖樹',
      barracks: '古樹聖騎士林苑',
      archery_range: '奧術賢者秘塔',
      tower: '秘銀晶石守望塔',
      castle: '森靈遠古聖堡',
    },
    trainableByBuilding: {
      town_center: ['fantasy_goblin_sapper'],
      barracks: ['fantasy_paladin', 'fantasy_treant', 'battering_ram'],
      archery_range: ['fantasy_mage', 'fantasy_goblin_sapper'],
      castle: ['fantasy_paladin', 'battering_ram', 'catapult', 'bombard_cannon'],
      landmark_barracks: ['fantasy_paladin', 'fantasy_treant', 'battering_ram'],
      landmark_citadel: ['fantasy_treant', 'fantasy_mage', 'catapult'],
      landmark_arsenal: ['fantasy_mage', 'catapult', 'bombard_cannon'],
    },
    passiveBonuses: {
      hpMultiplier: 1.12,
    },
  },
];

export const CIVILIZATIONS: Record<CivilizationId, CivilizationConfig> = {
  medieval: CIVILIZATION_LIST[0],
  anime: CIVILIZATION_LIST[1],
  fantasy: CIVILIZATION_LIST[2],
};

export const CIVILIZATION_TECHS: TechDefinition[] = [
  // Medieval Techs
  {
    id: 'med_war_tax',
    civId: 'medieval',
    buildingType: 'town_center',
    name: '皇室採礦特許狀',
    icon: '⛏️',
    description: '改良採礦器具與手推車，大幅提高帝國後勤產能。',
    effectLabel: '採集速度 +25%',
    cost: { food: 75, wood: 0, gold: 50, stone: 0 },
    researchTime: 10,
    targetCategories: ['worker'],
    effect: { gatherMultiplier: 1.25 },
  },
  {
    id: 'med_forged_blades',
    civId: 'medieval',
    buildingType: 'armory_forge',
    name: '精鋼鍛刃術',
    icon: '⚔️',
    description: '高爐千錘百鍊打造精鋼武器，強化近戰與騎兵破甲威力。',
    effectLabel: '全軍攻擊 +4',
    cost: { food: 100, wood: 0, gold: 80, stone: 0 },
    researchTime: 12,
    effect: { attackBonus: 4 },
  },
  {
    id: 'med_plate_tempering',
    civId: 'medieval',
    buildingType: 'armory_forge',
    name: '皇家板甲淬火',
    icon: '🛡️',
    description: '雙層淬火鋼板甲保護士兵要害。',
    effectLabel: '護甲 +3 · 生命 +15%',
    cost: { food: 120, wood: 0, gold: 100, stone: 40 },
    researchTime: 14,
    effect: { defenseBonus: 3, hpMultiplier: 1.15 },
  },
  {
    id: 'med_heavy_draw',
    civId: 'medieval',
    buildingType: 'archery_range',
    name: '紫杉長弓重弦',
    icon: '🏹',
    description: '強化弓臂張力與羽箭穿透力，延長有效射程。',
    effectLabel: '遠程射程 +2 · 攻擊 +3',
    cost: { food: 60, wood: 80, gold: 60, stone: 0 },
    researchTime: 11,
    targetCategories: ['ranged'],
    effect: { rangeBonus: 2, attackBonus: 3 },
  },

  // Anime Techs
  {
    id: 'ani_shikigami_harvest',
    civId: 'anime',
    buildingType: 'town_center',
    name: '式神分身採集卷軸',
    icon: '📜',
    description: '以靈符召喚協助分身，顯著提高式神採集效率。',
    effectLabel: '採集速度 +30%',
    cost: { food: 70, wood: 40, gold: 40, stone: 0 },
    researchTime: 9,
    targetCategories: ['worker'],
    effect: { gatherMultiplier: 1.3 },
  },
  {
    id: 'ani_chakra_flow',
    civId: 'anime',
    buildingType: 'spirit_shrine',
    name: '查克拉經絡流轉',
    icon: '🌀',
    description: '精準控制靈壓與氣脈運行，加快所有奧義冷卻並提升殺傷。',
    effectLabel: '全軍攻擊 +4 · 技能冷卻 -25%',
    cost: { food: 90, wood: 40, gold: 90, stone: 0 },
    researchTime: 11,
    effect: { attackBonus: 4, cooldownMultiplier: 0.75 },
  },
  {
    id: 'ani_shunpo',
    civId: 'anime',
    buildingType: 'spirit_shrine',
    name: '雷光瞬身疾風步',
    icon: '⚡',
    description: '將查克拉注入足底，全體忍軍爆發神速移動！',
    effectLabel: '移動速度 +18%',
    cost: { food: 80, wood: 60, gold: 70, stone: 0 },
    researchTime: 11,
    effect: { speedMultiplier: 1.18 },
  },
  {
    id: 'ani_ki_awakening',
    civId: 'anime',
    buildingType: 'barracks',
    name: '超賽靈壓覺醒',
    icon: '🔥',
    description: '突破戰士潛能極限，大幅增強黑刀劍豪與超戰士體魄與威力。',
    effectLabel: '生命 +22% · 攻擊 +5',
    cost: { food: 130, wood: 0, gold: 110, stone: 0 },
    researchTime: 14,
    targetCategories: ['melee', 'ranged'],
    effect: { hpMultiplier: 1.22, attackBonus: 5 },
  },

  // Fantasy Techs
  {
    id: 'fan_goblin_alchemy',
    civId: 'fantasy',
    buildingType: 'town_center',
    name: '地精煉金爆破術',
    icon: '🧪',
    description: '秘銀藥劑提升開採火力與工兵戰鬥潛力。',
    effectLabel: '採集速度 +25% · 攻擊 +4',
    cost: { food: 65, wood: 30, gold: 45, stone: 0 },
    researchTime: 9,
    targetCategories: ['worker'],
    effect: { gatherMultiplier: 1.25, attackBonus: 4 },
  },
  {
    id: 'fan_arcane_resonance',
    civId: 'fantasy',
    buildingType: 'mana_well',
    name: '奧術魔力共鳴',
    icon: '🔮',
    description: '將魔泉能量匯聚至法杖與聖典，提高法術輸出與技能循環。',
    effectLabel: '攻擊 +5 · 技能冷卻 -25%',
    cost: { food: 80, wood: 50, gold: 100, stone: 0 },
    researchTime: 12,
    effect: { attackBonus: 5, cooldownMultiplier: 0.75 },
  },
  {
    id: 'fan_elder_bark',
    civId: 'fantasy',
    buildingType: 'mana_well',
    name: '遠古樹皮硬化',
    icon: '🌳',
    description: '古樹聖靈祝福覆蓋全軍，顯著強化防禦與耐久度。',
    effectLabel: '護甲 +3 · 生命 +20%',
    cost: { food: 110, wood: 90, gold: 80, stone: 0 },
    researchTime: 13,
    effect: { defenseBonus: 3, hpMultiplier: 1.2 },
  },
  {
    id: 'fan_sacred_bloom',
    civId: 'fantasy',
    buildingType: 'barracks',
    name: '生命甘露祝福',
    icon: '✨',
    description: '聖潔月光滋養聖騎士與古樹守衛的戰甲與步伐。',
    effectLabel: '生命 +15% · 移動速度 +12%',
    cost: { food: 100, wood: 60, gold: 70, stone: 0 },
    researchTime: 11,
    effect: { hpMultiplier: 1.15, speedMultiplier: 1.12 },
  },

  // Shared Era II–IV Siege & Fortification Engineering Techs
  {
    id: 'shared_masonry',
    civId: 'shared',
    buildingType: 'town_center',
    name: '磚石築城工事',
    icon: '🧱',
    description: '【時代 II 城防】強化所有建築磚石基底與防火塗層，使早期步兵更難徒手拆毀基地。',
    effectLabel: '建築城甲 +4 · 結構耐久 +20%',
    cost: { food: 80, wood: 110, gold: 0, stone: 60 },
    researchTime: 12,
    requiredAge: 2,
    effect: { buildingArmorBonus: 4, buildingHpMultiplier: 1.2 },
  },
  {
    id: 'shared_arrow_slits',
    civId: 'shared',
    buildingType: 'tower',
    name: '雙層箭垛射口',
    icon: '🏹',
    description: '【時代 II 防線】改造箭塔與防禦建築射口，加快駐防齊射頻率並延伸防禦火網。',
    effectLabel: '防禦建築射程 +2 · 射速 +25%',
    cost: { food: 0, wood: 100, gold: 65, stone: 40 },
    researchTime: 11,
    requiredAge: 2,
    effect: { towerRangeBonus: 2, towerAttackRateMultiplier: 1.25 },
  },
  {
    id: 'shared_murder_holes',
    civId: 'shared',
    buildingType: 'tower',
    name: '滾油與落石孔',
    icon: '🔥',
    description: '【時代 III 城防】於塔樓與要塞頂部增設近距熱油反制孔，強化駐防單位射擊殺傷與城甲。',
    effectLabel: '駐防齊射傷害 +6 · 城甲 +3',
    cost: { food: 90, wood: 120, gold: 80, stone: 90 },
    researchTime: 13,
    requiredAge: 3,
    effect: { garrisonAttackBonus: 6, buildingArmorBonus: 3 },
  },
  {
    id: 'shared_siege_engineers',
    civId: 'shared',
    buildingType: 'barracks',
    name: '攻城工兵學',
    icon: '⚙️',
    description: '【時代 III 攻城】改良絞盤配重與黑火藥配方，讓投石機與衝車發揮毀滅性破城威力。',
    effectLabel: '對建築傷害 +45% · 攻城射程 +2',
    cost: { food: 110, wood: 140, gold: 120, stone: 0 },
    researchTime: 13,
    requiredAge: 3,
    targetCategories: ['siege'],
    effect: { siegeDamageMultiplier: 1.45, rangeBonus: 2 },
  },
  {
    id: 'shared_imperial_fortification',
    civId: 'shared',
    buildingType: 'castle',
    name: '帝王星堡築城術',
    icon: '🏰',
    description: '【時代 IV 終極工事】構築菱形星堡棱角牆體抵禦重砲轟擊，並為己方攻城器披覆防箭裝甲。',
    effectLabel: '建築城甲 +6 · 耐久 +30% · 攻城防箭 +4',
    cost: { food: 180, wood: 200, gold: 160, stone: 180 },
    researchTime: 16,
    requiredAge: 4,
    targetCategories: ['siege'],
    effect: { buildingArmorBonus: 6, buildingHpMultiplier: 1.3, rangedDefenseBonus: 4 },
  },
];

export function getCivilizationConfig(civId?: CivilizationId): CivilizationConfig {
  if (civId && CIVILIZATIONS[civId]) {
    return CIVILIZATIONS[civId];
  }
  return CIVILIZATIONS.medieval;
}

export function getBuildableTypesForCiv(civId?: CivilizationId): BuildingType[] {
  return [...getCivilizationConfig(civId).buildableBuildings];
}

export function getTrainableUnitsForBuilding(
  bType: BuildingType,
  civId?: CivilizationId,
  fallbackUnits: string[] = []
): string[] {
  const cfg = getCivilizationConfig(civId);
  const override = cfg.trainableByBuilding[bType];
  if (override) return [...override];
  return [...fallbackUnits];
}

export function getAvailableTechsForBuilding(
  bType: BuildingType,
  civId?: CivilizationId,
  researchedIds: string[] = [],
  currentAge: AgeLevel = 1,
  extraTechs: TechDefinition[] = []
): TechDefinition[] {
  const resolvedCiv = getCivilizationConfig(civId).id;
  return [...CIVILIZATION_TECHS, ...extraTechs].filter(
    (tech) =>
      tech.buildingType === bType &&
      (tech.civId === resolvedCiv || tech.civId === 'shared') &&
      (!tech.requiredAge || currentAge >= tech.requiredAge) &&
      !researchedIds.includes(tech.id)
  );
}

export function getAllTechsForBuilding(
  bType: BuildingType,
  civId?: CivilizationId,
  extraTechs: TechDefinition[] = []
): TechDefinition[] {
  const resolvedCiv = getCivilizationConfig(civId).id;
  return [...CIVILIZATION_TECHS, ...extraTechs].filter(
    (tech) => tech.buildingType === bType && (tech.civId === resolvedCiv || tech.civId === 'shared')
  );
}

export function findTechDef(techId: string, extraTechs: TechDefinition[] = []): TechDefinition | undefined {
  return CIVILIZATION_TECHS.find((t) => t.id === techId) || extraTechs.find((t) => t.id === techId);
}

/**
 * Applies researched civilization techs and passive civilization perks cleanly to a UnitStats snapshot.
 */
export function applyCivilizationAndTechStats(
  baseStats: UnitStats,
  category: UnitCategory,
  civId: CivilizationId | undefined,
  researchedTechIds: string[],
  extraTechs: TechDefinition[] = []
): UnitStats {
  const cfg = getCivilizationConfig(civId);
  let maxHp = baseStats.maxHp * (cfg.passiveBonuses.hpMultiplier || 1);
  let attack = baseStats.attack;
  let defense = baseStats.defense + (cfg.passiveBonuses.defenseBonus || 0);
  let rangedDefense = baseStats.rangedDefense || 0;
  let speed = baseStats.speed * (cfg.passiveBonuses.moveSpeedMultiplier || 1);
  let gatherSpeed = baseStats.gatherSpeed * (cfg.passiveBonuses.gatherRateMultiplier || 1);
  let range = baseStats.range;
  let buildingAttack = baseStats.buildingAttack;

  for (const techId of researchedTechIds) {
    const tech = findTechDef(techId, extraTechs);
    if (!tech) continue;
    if (tech.targetCategories && !tech.targetCategories.includes(category)) continue;

    if (tech.effect.hpMultiplier) maxHp *= tech.effect.hpMultiplier;
    if (tech.effect.attackBonus) attack += tech.effect.attackBonus;
    if (tech.effect.defenseBonus) defense += tech.effect.defenseBonus;
    if (tech.effect.rangedDefenseBonus) rangedDefense += tech.effect.rangedDefenseBonus;
    if (tech.effect.speedMultiplier) speed *= tech.effect.speedMultiplier;
    if (tech.effect.gatherMultiplier) gatherSpeed *= tech.effect.gatherMultiplier;
    if (tech.effect.rangeBonus) range += tech.effect.rangeBonus;
    if (tech.effect.siegeDamageMultiplier && buildingAttack !== undefined) {
      buildingAttack = Math.round(buildingAttack * tech.effect.siegeDamageMultiplier);
    }
  }

  return {
    ...baseStats,
    maxHp: Math.round(maxHp),
    attack: Math.round(attack),
    buildingAttack,
    defense: Math.round(defense),
    rangedDefense: baseStats.rangedDefense !== undefined || rangedDefense > 0 ? rangedDefense : undefined,
    speed: +speed.toFixed(2),
    gatherSpeed: +gatherSpeed.toFixed(2),
    range: +range.toFixed(2),
  };
}

export const XP_ELIGIBLE_CIV: CivilizationId = 'anime';
export const XP_ELIGIBLE_UNIT_ID = 'anime_saiyan_brawler';

/**
 * Only ONE unique unit of ONE civilization (anime's 氣彈超戰士) uses the XP/leveling progression system.
 */
export function canUnitGainXp(unitDefId?: string, civId?: CivilizationId): boolean {
  if (!unitDefId) return false;
  if (civId && civId !== XP_ELIGIBLE_CIV) return false;
  return unitDefId === XP_ELIGIBLE_UNIT_ID;
}

export const UNIT_XP_THRESHOLDS = [0, 60, 150, 280, 450]; // Levels 1..5

export function getXpThresholdForLevel(level: number): number {
  if (level <= 1) return 0;
  const idx = Math.min(level - 1, UNIT_XP_THRESHOLDS.length - 1);
  return UNIT_XP_THRESHOLDS[idx];
}

export function getLevelTitle(level: number): string {
  switch (level) {
    case 1:
      return '常態戰士';
    case 2:
      return '界王拳';
    case 3:
      return '超級賽亞人';
    case 4:
      return '超藍神威';
    default:
      return '自在極意';
  }
}

export function computeUnitXpGain(
  currentXp: number,
  currentLevel: number,
  gainedXp: number
): { xp: number; level: number; levelsGained: number } {
  const maxLevel = 5;
  const nextXp = currentXp + Math.max(0, gainedXp);
  let nextLevel = Math.max(1, currentLevel);
  while (nextLevel < maxLevel && nextXp >= getXpThresholdForLevel(nextLevel + 1)) {
    nextLevel++;
  }
  return {
    xp: nextXp,
    level: nextLevel,
    levelsGained: Math.max(0, nextLevel - currentLevel),
  };
}

/**
 * Exponential frame-rate independent scalar damping toward a target value.
 */
export function dampScalar(current: number, target: number, lambda: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-lambda * Math.max(0, dt)));
}

/**
 * Shortest-arc exponential angle damping in radians (wraps across -PI/PI seamlessly).
 */
export function dampAngle(current: number, target: number, lambda: number, dt: number): number {
  let diff = (target - current + Math.PI) % (Math.PI * 2);
  if (diff < 0) diff += Math.PI * 2;
  diff -= Math.PI;
  return current + diff * (1 - Math.exp(-lambda * Math.max(0, dt)));
}
