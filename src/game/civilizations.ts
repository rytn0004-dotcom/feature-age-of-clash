import {
  AgeLevel,
  BuildingType,
  CivilizationId,
  ResourceType,
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
      'house',
      'barracks',
      'archery_range',
      'stable',
      'siege_workshop',
      'armory_forge',
      'dock',
      'farm',
      'granary',
      'lumber_camp',
      'mining_camp',
      'wall',
      'tower',
      'castle',
    ],
    buildingNames: {
      town_center: '帝國城堡中心',
      house: '帝國民居',
      barracks: '鐵衛兵營',
      archery_range: '紫杉長弓營',
      stable: '皇家軍馬廄',
      siege_workshop: '皇家攻城工坊',
      dock: '帝國海軍碼頭',
      wall: '石砌木欄防禦牆',
      tower: '石砌警戒箭塔',
      castle: '聖殿重裝要塞',
    },
    trainableByBuilding: {
      town_center: ['villager'],
      dock: ['fishing_boat', 'transport_boat', 'war_galley'],
      barracks: ['swordsman'],
      archery_range: ['longbowman'],
      stable: ['knight', 'scout_rider'],
      siege_workshop: ['catapult', 'bombard_cannon', 'greek_fire_siphon'],
      landmark_barracks: ['swordsman'],
      landmark_citadel: [],
      landmark_arsenal: [],
    },
    passiveBonuses: {
      defenseBonus: 0,
      hpMultiplier: 1.04,
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
      'house',
      'barracks',
      'archery_range',
      'stable',
      'siege_workshop',
      'spirit_shrine',
      'dock',
      'farm',
      'granary',
      'lumber_camp',
      'mining_camp',
      'wall',
      'tower',
      'castle',
    ],
    buildingNames: {
      town_center: '宗家天守本陣',
      house: '和風町屋',
      barracks: '忍術劍豪道場',
      archery_range: '氣功忍具修煉殿',
      stable: '蒼嵐忍馬驛',
      siege_workshop: '忍具攻城工房',
      dock: '蒼嵐漁港棧橋',
      wall: '竹木矢來防禦垣',
      tower: '靈脈結界哨塔',
      castle: '蒼嵐大本營御殿',
    },
    trainableByBuilding: {
      town_center: ['anime_spirit_harvester'],
      dock: ['fishing_boat', 'transport_boat', 'war_galley'],
      barracks: ['anime_katana_shinigami'],
      archery_range: ['anime_ninja_assassin', 'anime_saiyan_brawler'],
      stable: ['scout_rider'],
      siege_workshop: ['catapult', 'bombard_cannon'],
      landmark_barracks: ['anime_katana_shinigami'],
      landmark_citadel: [],
      landmark_arsenal: [],
    },
    passiveBonuses: {
      moveSpeedMultiplier: 1.05,
      gatherRateMultiplier: 1.06,
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
    progressionSummary: '建造【精靈魔力之泉】為周邊傷兵持續回血並產出糧食與黃金，全軍生命天生 +8%。',
    workerUnitId: 'fantasy_goblin_sapper',
    starterMeleeUnitId: 'fantasy_footman',
    starterRangedUnitId: 'fantasy_mage',
    uniqueBuildingType: 'mana_well',
    buildableBuildings: [
      'house',
      'barracks',
      'archery_range',
      'stable',
      'siege_workshop',
      'mana_well',
      'dock',
      'farm',
      'granary',
      'lumber_camp',
      'mining_camp',
      'wall',
      'tower',
      'castle',
    ],
    buildingNames: {
      town_center: '永恆生命聖樹',
      house: '精靈樹屋',
      barracks: '古樹聖衛林苑',
      archery_range: '奧術賢者秘塔',
      stable: '森靈馴獸馬廄',
      siege_workshop: '遠古根鬚攻城工坊',
      dock: '森靈港口棧道',
      wall: '秘銀棘石防禦牆',
      tower: '秘銀晶石守望塔',
      castle: '森靈遠古聖堡',
    },
    trainableByBuilding: {
      town_center: ['fantasy_goblin_sapper'],
      dock: ['fishing_boat', 'transport_boat', 'war_galley'],
      barracks: ['fantasy_footman'],
      archery_range: ['fantasy_mage'],
      stable: ['fantasy_paladin'],
      siege_workshop: ['fantasy_treant', 'catapult', 'bombard_cannon'],
      landmark_barracks: ['fantasy_footman'],
      landmark_citadel: [],
      landmark_arsenal: [],
    },
    passiveBonuses: {
      hpMultiplier: 1.08,
    },
  },
];

export const CIVILIZATIONS: Record<CivilizationId, CivilizationConfig> = {
  medieval: CIVILIZATION_LIST[0],
  anime: CIVILIZATION_LIST[1],
  fantasy: CIVILIZATION_LIST[2],
};

export const CIVILIZATION_TECHS: TechDefinition[] = [
  // ================= MEDIEVAL TECHS =================
  {
    id: 'med_war_tax',
    civId: 'medieval',
    buildingType: 'town_center',
    name: '皇室採礦特許狀',
    icon: '⛏️',
    roleTag: '經濟',
    description: '改良採礦器具與皇室稅制激勵，全面提高帝國資源採集效率。',
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
    roleTag: '進攻',
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
    roleTag: '防禦',
    description: '雙層淬火鋼板甲保護士兵要害，顯著拉高正面碰撞承傷力。',
    effectLabel: '護甲 +3 · 生命 +15%',
    cost: { food: 120, wood: 0, gold: 100, stone: 40 },
    researchTime: 14,
    effect: { defenseBonus: 3, hpMultiplier: 1.15 },
  },
  {
    id: 'med_doctrine_bastion',
    civId: 'medieval',
    buildingType: 'armory_forge',
    name: '鋼鐵堡壘流派',
    icon: '🏰',
    roleTag: '互斥·城防',
    exclusiveGroup: 'doctrine_med_forge',
    exclusiveLabel: '工坊鍛造流派 (二選一)',
    description: '【互斥流派】將全國鋼鐵優先鑄造城盾與重型壁壘，轉為鐵桶陣地持久戰。',
    effectLabel: '城甲 +4 · 建築耐久 +18% · 近甲 +2',
    cost: { food: 110, wood: 0, gold: 80, stone: 70 },
    researchTime: 12,
    requiredAge: 2,
    effect: { buildingArmorBonus: 4, buildingHpMultiplier: 1.18, defenseBonus: 2 },
  },
  {
    id: 'med_doctrine_crusade',
    civId: 'medieval',
    buildingType: 'armory_forge',
    name: '聖殿遠征流派',
    icon: '🐎',
    roleTag: '互斥·突擊',
    exclusiveGroup: 'doctrine_med_forge',
    exclusiveLabel: '工坊鍛造流派 (二選一)',
    description: '【互斥流派】放棄厚重守城工料，改為輕量化突擊武器，全面提升近戰與騎兵進攻節奏！',
    effectLabel: '近騎攻速 +18% · 攻擊 +3 · 移速 +8%',
    cost: { food: 110, wood: 0, gold: 110, stone: 0 },
    researchTime: 12,
    requiredAge: 2,
    targetCategories: ['melee', 'cavalry'],
    effect: { attackBonus: 3, attackRateMultiplier: 1.18, speedMultiplier: 1.08 },
  },
  {
    id: 'med_heavy_draw',
    civId: 'medieval',
    buildingType: 'archery_range',
    name: '紫杉長弓重弦',
    icon: '🏹',
    roleTag: '射程',
    description: '強化弓臂張力與羽箭穿透力，延長有效射程。',
    effectLabel: '遠程射程 +2 · 攻擊 +3',
    cost: { food: 60, wood: 80, gold: 60, stone: 0 },
    researchTime: 11,
    targetCategories: ['ranged'],
    effect: { rangeBonus: 2, attackBonus: 3 },
  },
  {
    id: 'med_naphtha_pots',
    civId: 'medieval',
    buildingType: 'archery_range',
    name: '猛火油彈配方',
    icon: '🛢️',
    roleTag: '攻城',
    description: '【時代 III】為攻城器與遠程部隊配給瀝青猛火油罐，大幅加強對工事與木構建築破壞力。',
    effectLabel: '攻城與遠程對建築 +30% · 攻擊 +2',
    cost: { food: 0, wood: 100, gold: 90, stone: 40 },
    researchTime: 11,
    requiredAge: 3,
    targetCategories: ['siege', 'ranged'],
    effect: { siegeDamageMultiplier: 1.3, attackBonus: 2 },
  },
  {
    id: 'med_crusader_charge',
    civId: 'medieval',
    buildingType: 'castle',
    name: '聖殿重騎衝鋒鎧',
    icon: '⚜️',
    roleTag: '騎兵',
    description: '【時代 III】為皇家騎士配備全套戰馬馬鎧與精鐵騎槍，大幅強化正面破陣能力。',
    effectLabel: '騎兵攻擊 +4 · 生命 +15%',
    cost: { food: 130, wood: 0, gold: 110, stone: 0 },
    researchTime: 12,
    requiredAge: 3,
    targetCategories: ['cavalry'],
    effect: { attackBonus: 4, hpMultiplier: 1.15 },
  },

  // ================= ANIME TECHS =================
  {
    id: 'ani_shikigami_harvest',
    civId: 'anime',
    buildingType: 'town_center',
    name: '式神分身採集卷軸',
    icon: '📜',
    roleTag: '經濟',
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
    roleTag: '奧義',
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
    roleTag: '機動',
    description: '將查克拉注入足底，全體忍軍爆發神速移動與拉打走位！',
    effectLabel: '移動速度 +18%',
    cost: { food: 80, wood: 60, gold: 70, stone: 0 },
    researchTime: 11,
    effect: { speedMultiplier: 1.18 },
  },
  {
    id: 'ani_doctrine_assassination',
    civId: 'anime',
    buildingType: 'spirit_shrine',
    name: '暗部奇襲流派',
    icon: '🗡️',
    roleTag: '互斥·突襲',
    exclusiveGroup: 'doctrine_ani_path',
    exclusiveLabel: '忍道修煉流派 (二選一)',
    description: '【互斥流派】精研暗殺術與切後排戰法，對敵方遠程射手與農民造成致命額外傷害！',
    effectLabel: '攻擊 +4 · 對遠程 +4 / 對工人 +5 · 冷卻 -20%',
    cost: { food: 90, wood: 50, gold: 100, stone: 0 },
    researchTime: 11,
    requiredAge: 2,
    targetCategories: ['melee', 'ranged'],
    effect: { attackBonus: 4, bonusVsCategory: { ranged: 4, worker: 5 }, cooldownMultiplier: 0.8 },
  },
  {
    id: 'ani_doctrine_barrier',
    civId: 'anime',
    buildingType: 'spirit_shrine',
    name: '木葉結界守護流',
    icon: '⛩️',
    roleTag: '互斥·結界',
    exclusiveGroup: 'doctrine_ani_path',
    exclusiveLabel: '忍道修煉流派 (二選一)',
    description: '【互斥流派】張開靈脈結界覆蓋領地與防塔，獲得持續生命回復並大幅鞏固駐軍防線。',
    effectLabel: '防塔射程 +2 · 駐軍傷 +4 · 全軍回血 +1.6/秒',
    cost: { food: 90, wood: 90, gold: 60, stone: 0 },
    researchTime: 11,
    requiredAge: 2,
    effect: { towerRangeBonus: 2, garrisonAttackBonus: 4, hpRegenPerSec: 1.6, buildingArmorBonus: 2 },
  },
  {
    id: 'ani_ki_awakening',
    civId: 'anime',
    buildingType: 'barracks',
    name: '超賽靈壓覺醒',
    icon: '🔥',
    roleTag: '強化',
    description: '突破戰士潛能極限，大幅增強黑刀劍豪與超戰士體魄與威力。',
    effectLabel: '生命 +22% · 攻擊 +5',
    cost: { food: 130, wood: 0, gold: 110, stone: 0 },
    researchTime: 14,
    targetCategories: ['melee', 'ranged'],
    effect: { hpMultiplier: 1.22, attackBonus: 5 },
  },
  {
    id: 'ani_shadow_kunai',
    civId: 'anime',
    buildingType: 'archery_range',
    name: '影分身連彈手裏劍',
    icon: '✴️',
    roleTag: '攻速',
    description: '【時代 II】忍者與氣彈戰士以多重分身同步投擲，大幅提升遠程火力頻率與射程。',
    effectLabel: '遠程攻速 +22% · 射程 +1',
    cost: { food: 85, wood: 65, gold: 60, stone: 0 },
    researchTime: 10,
    requiredAge: 2,
    targetCategories: ['ranged'],
    effect: { attackRateMultiplier: 1.22, rangeBonus: 1 },
  },
  {
    id: 'ani_susanoo_armor',
    civId: 'anime',
    buildingType: 'castle',
    name: '須佐靈氣外骨骼',
    icon: '💠',
    roleTag: '防護',
    description: '【時代 III】以高密度查克拉凝聚具象化護鎧，彌補忍軍身板單薄的弱點。',
    effectLabel: '近甲 +2 · 遠程抗箭 +2 · 生命 +12%',
    cost: { food: 120, wood: 0, gold: 120, stone: 0 },
    researchTime: 12,
    requiredAge: 3,
    targetCategories: ['melee', 'ranged'],
    effect: { defenseBonus: 2, rangedDefenseBonus: 2, hpMultiplier: 1.12 },
  },

  // ================= FANTASY TECHS =================
  {
    id: 'fan_goblin_alchemy',
    civId: 'fantasy',
    buildingType: 'town_center',
    name: '地精煉金爆破術',
    icon: '🧪',
    roleTag: '經濟',
    description: '秘銀藥劑提升開採火力與工兵戰鬥潛力。',
    effectLabel: '採集速度 +25% · 工人攻擊 +4',
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
    roleTag: '奧義',
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
    roleTag: '防禦',
    description: '古樹聖靈祝福覆蓋全軍，顯著強化防禦與耐久度。',
    effectLabel: '護甲 +3 · 生命 +20%',
    cost: { food: 110, wood: 90, gold: 80, stone: 0 },
    researchTime: 13,
    effect: { defenseBonus: 3, hpMultiplier: 1.2 },
  },
  {
    id: 'fan_doctrine_overgrowth',
    civId: 'fantasy',
    buildingType: 'mana_well',
    name: '萬木共生再生流',
    icon: '🌿',
    roleTag: '互斥·再生',
    exclusiveGroup: 'doctrine_fan_nature',
    exclusiveLabel: '森靈聖典流派 (二選一)',
    description: '【互斥流派】喚醒森靈大地脈動，賦予全軍強大野戰生命再生與建築韌性！',
    effectLabel: '全軍回血 +2.2/秒 · 生命 +14% · 建築耐久 +15%',
    cost: { food: 100, wood: 100, gold: 60, stone: 0 },
    researchTime: 11,
    requiredAge: 2,
    effect: { hpRegenPerSec: 2.2, hpMultiplier: 1.14, buildingHpMultiplier: 1.15 },
  },
  {
    id: 'fan_doctrine_cataclysm',
    civId: 'fantasy',
    buildingType: 'mana_well',
    name: '烈焰災變奧術流',
    icon: '☄️',
    roleTag: '互斥·爆發',
    exclusiveGroup: 'doctrine_fan_nature',
    exclusiveLabel: '森靈聖典流派 (二選一)',
    description: '【互斥流派】超載魔法泉源，大幅縮短隕石與聖光冷卻並強化軍團施法攻速！',
    effectLabel: '攻速 +16% · 攻擊 +4 · 奧義冷卻 -20%',
    cost: { food: 85, wood: 50, gold: 125, stone: 0 },
    researchTime: 11,
    requiredAge: 2,
    targetCategories: ['melee', 'ranged'],
    effect: { attackBonus: 4, attackRateMultiplier: 1.16, cooldownMultiplier: 0.8 },
  },
  {
    id: 'fan_sacred_bloom',
    civId: 'fantasy',
    buildingType: 'barracks',
    name: '生命甘露祝福',
    icon: '✨',
    roleTag: '強化',
    description: '聖潔月光滋養聖騎士與古樹守衛的戰甲與步伐。',
    effectLabel: '生命 +15% · 移動速度 +12%',
    cost: { food: 100, wood: 60, gold: 70, stone: 0 },
    researchTime: 11,
    effect: { hpMultiplier: 1.15, speedMultiplier: 1.12 },
  },
  {
    id: 'fan_meteor_amplification',
    civId: 'fantasy',
    buildingType: 'archery_range',
    name: '秘銀魔導聚能鏡',
    icon: '🪄',
    roleTag: '破甲',
    description: '【時代 II】增幅法師火球射程並附加奧術灼燒破甲，有效壓制敵方重甲步兵陣線。',
    effectLabel: '攻擊 +3 · 射程 +1.5 · 對步兵 +3',
    cost: { food: 75, wood: 50, gold: 95, stone: 0 },
    researchTime: 10,
    requiredAge: 2,
    targetCategories: ['ranged'],
    effect: { attackBonus: 3, rangeBonus: 1.5, bonusVsCategory: { melee: 3 } },
  },
  {
    id: 'fan_ancient_roots',
    civId: 'fantasy',
    buildingType: 'castle',
    name: '千年根須破壁陣',
    icon: '🪵',
    roleTag: '破城',
    description: '【時代 III】喚醒遠古樹精與攻城器的破城潛能，撕裂石砌城堡與箭塔防線。',
    effectLabel: '近戰／攻城拆屋 +35% · 生命 +16%',
    cost: { food: 110, wood: 130, gold: 70, stone: 0 },
    researchTime: 12,
    requiredAge: 3,
    targetCategories: ['melee', 'siege'],
    effect: { siegeDamageMultiplier: 1.35, hpMultiplier: 1.16 },
  },

  // ================= SHARED ECONOMY & LOGISTICS TECHS =================
  {
    id: 'shared_wheelbarrow',
    civId: 'shared',
    buildingType: 'town_center',
    name: '負重手推車',
    icon: '🛒',
    roleTag: '經濟',
    description: '配備鐵軸手推車大幅提升單趟負重與往返腳程，減少卸貨時間浪費。',
    effectLabel: '工人負重 +6 · 移速 +12%',
    cost: { food: 50, wood: 30, gold: 0, stone: 0 },
    researchTime: 10,
    targetCategories: ['worker'],
    effect: { carryCapacityBonus: 6, speedMultiplier: 1.12 },
  },
  {
    id: 'shared_double_bit_axe',
    civId: 'shared',
    buildingType: 'lumber_camp',
    name: '雙刃伐木斧',
    icon: '🪓',
    roleTag: '伐木',
    description: '鍛造雙刃長柄鋼斧，顯著加快森林採伐速度以支撐弓兵、農田與碼頭產線。',
    effectLabel: '木材採集效率 +25%',
    cost: { food: 45, wood: 0, gold: 25, stone: 0 },
    researchTime: 9,
    targetCategories: ['worker'],
    effect: { gatherByType: { wood: 1.25 } },
  },
  {
    id: 'shared_sawmill_gear',
    civId: 'shared',
    buildingType: 'lumber_camp',
    name: '精工鋸木車床',
    icon: '🪚',
    roleTag: '進階伐木',
    prerequisiteTechId: 'shared_double_bit_axe',
    description: '【時代 II · 需雙刃斧】水力與齒輪鋸木機構大幅提升木材產能，並補強木質城防建材。',
    effectLabel: '木材效率再 +25% · 城甲 +1',
    cost: { food: 85, wood: 0, gold: 50, stone: 0 },
    researchTime: 11,
    requiredAge: 2,
    targetCategories: ['worker'],
    effect: { gatherByType: { wood: 1.25 }, buildingArmorBonus: 1 },
  },
  {
    id: 'shared_prospecting_picks',
    civId: 'shared',
    buildingType: 'mining_camp',
    name: '深脈鍛鐵礦鎬',
    icon: '⚒️',
    roleTag: '採礦',
    description: '精鐵尖鎬與採礦燈具加速黃金與花崗石開採，加快時代晉升與城堡防線成型。',
    effectLabel: '黃金與石料開採 +25%',
    cost: { food: 55, wood: 25, gold: 0, stone: 0 },
    researchTime: 9,
    targetCategories: ['worker'],
    effect: { gatherByType: { gold: 1.25, stone: 1.25 } },
  },
  {
    id: 'shared_blast_furnace_mining',
    civId: 'shared',
    buildingType: 'mining_camp',
    name: '深井爆破開採術',
    icon: '🧨',
    roleTag: '進階採礦',
    prerequisiteTechId: 'shared_prospecting_picks',
    description: '【時代 III · 需礦鎬】以火藥定向爆破開採深層礦脈，支撐後期高階兵種與火砲製造。',
    effectLabel: '黃金 +25% · 石料開採 +30%',
    cost: { food: 110, wood: 90, gold: 0, stone: 0 },
    researchTime: 12,
    requiredAge: 3,
    targetCategories: ['worker'],
    effect: { gatherByType: { gold: 1.25, stone: 1.3 } },
  },
  {
    id: 'shared_crop_rotation',
    civId: 'shared',
    buildingType: 'granary',
    name: '三圃輪耕儲糧',
    icon: '🌾',
    roleTag: '糧食',
    description: '科學輪作與乾燥儲倉大幅提高農田、漿果與狩獵的糧食產出。',
    effectLabel: '糧食採集效率 +25%',
    cost: { food: 0, wood: 40, gold: 40, stone: 0 },
    researchTime: 9,
    targetCategories: ['worker'],
    effect: { gatherByType: { food: 1.25 } },
  },
  {
    id: 'shared_preserved_rations',
    civId: 'shared',
    buildingType: 'granary',
    name: '軍糧醃漬補給',
    icon: '🍖',
    roleTag: '續戰',
    prerequisiteTechId: 'shared_crop_rotation',
    description: '【時代 II · 需輪耕】充沛的鹽漬肉乾與野戰乾糧讓前線部隊在拉鋸戰中持續回血！',
    effectLabel: '全軍野戰回血 +1.4/秒 · 生命 +6%',
    cost: { food: 80, wood: 0, gold: 70, stone: 0 },
    researchTime: 11,
    requiredAge: 2,
    targetCategories: ['melee', 'ranged', 'cavalry'],
    effect: { hpRegenPerSec: 1.4, hpMultiplier: 1.06 },
  },
  {
    id: 'shared_harpoon_nets',
    civId: 'shared',
    buildingType: 'dock',
    name: '遠洋拖網魚叉',
    icon: '🔱',
    roleTag: '海產',
    description: '強化遠洋漁船拖網與船艙容積，將深海魚群轉化為全場最強食物引擎！',
    effectLabel: '捕魚／採糧 +25% · 船員負重 +5',
    cost: { food: 0, wood: 45, gold: 45, stone: 0 },
    researchTime: 9,
    targetCategories: ['worker'],
    effect: { gatherByType: { food: 1.25 }, carryCapacityBonus: 5 },
  },
  {
    id: 'shared_reinforced_keel',
    civId: 'shared',
    buildingType: 'dock',
    name: '包銅龍骨艦隊',
    icon: '⚓',
    roleTag: '海戰',
    description: '【時代 II】船體與遠程陣地包覆銅板抵禦箭雨，並提升遠程與水軍機動速度。',
    effectLabel: '遠程抗箭 +2 · 移速 +8%',
    cost: { food: 0, wood: 90, gold: 70, stone: 0 },
    researchTime: 11,
    requiredAge: 2,
    targetCategories: ['ranged', 'special'],
    effect: { rangedDefenseBonus: 2, speedMultiplier: 1.08 },
  },

  // ================= SHARED TACTICAL COUNTERPLAY TECHS =================
  {
    id: 'shared_shield_pavise',
    civId: 'shared',
    buildingType: 'barracks',
    name: '大盾方陣防箭術',
    icon: '🛡️',
    roleTag: '反遠程',
    description: '【時代 II 反制】近戰步兵配備厚實大盾，專門克制敵方大量長弓手、忍者與法師的齊射！',
    effectLabel: '近戰抗遠程箭傷 +3',
    cost: { food: 75, wood: 60, gold: 25, stone: 0 },
    researchTime: 10,
    requiredAge: 2,
    targetCategories: ['melee'],
    effect: { rangedDefenseBonus: 3 },
  },
  {
    id: 'shared_pike_formation',
    civId: 'shared',
    buildingType: 'barracks',
    name: '長槍拒馬陣列',
    icon: '🔱',
    roleTag: '反騎兵',
    description: '【時代 II 反制】訓練步兵切換長槍與拒馬陣型，大幅重創突入陣線的敵方騎士！',
    effectLabel: '近戰對騎兵傷害 +6 · 近甲 +1',
    cost: { food: 80, wood: 65, gold: 0, stone: 0 },
    researchTime: 10,
    requiredAge: 2,
    targetCategories: ['melee'],
    effect: { bonusVsCategory: { cavalry: 6 }, defenseBonus: 1 },
  },
  {
    id: 'shared_doctrine_blitz',
    civId: 'shared',
    buildingType: 'barracks',
    name: '徵兵洪流教條',
    icon: '🥁',
    roleTag: '互斥·爆兵',
    exclusiveGroup: 'doctrine_army_style',
    exclusiveLabel: '軍團作戰路線 (二選一)',
    description: '【時代 II 互斥路線】簡化徵募與行軍編制，極速暴兵搶佔據點並壓垮對手節奏！',
    effectLabel: '全兵種訓練時間 -25% · 移速 +8%',
    cost: { food: 90, wood: 0, gold: 70, stone: 0 },
    researchTime: 10,
    requiredAge: 2,
    targetCategories: ['melee', 'ranged', 'cavalry'],
    effect: { trainTimeMultiplier: 0.75, speedMultiplier: 1.08 },
  },
  {
    id: 'shared_doctrine_elite',
    civId: 'shared',
    buildingType: 'barracks',
    name: '精銳禁衛教條',
    icon: '👑',
    roleTag: '互斥·精銳',
    exclusiveGroup: 'doctrine_army_style',
    exclusiveLabel: '軍團作戰路線 (二選一)',
    description: '【時代 II 互斥路線】嚴格操練精銳常備軍，以高額體魄與雙重護甲贏下正面決戰！',
    effectLabel: '全兵種生命 +14% · 近遠護甲 +2/+1',
    cost: { food: 100, wood: 0, gold: 90, stone: 30 },
    researchTime: 12,
    requiredAge: 2,
    targetCategories: ['melee', 'ranged', 'cavalry'],
    effect: { hpMultiplier: 1.14, defenseBonus: 2, rangedDefenseBonus: 1 },
  },
  {
    id: 'shared_bodkin_arrows',
    civId: 'shared',
    buildingType: 'archery_range',
    name: '破甲錐形箭簇',
    icon: '🎯',
    roleTag: '破重甲',
    description: '【時代 II 反制】重鑄錐形穿甲箭頭，針對重甲步兵方陣進行精準穿透打擊！',
    effectLabel: '遠程攻擊 +2 · 對步兵額外 +3',
    cost: { food: 85, wood: 0, gold: 75, stone: 0 },
    researchTime: 11,
    requiredAge: 2,
    targetCategories: ['ranged'],
    effect: { attackBonus: 2, bonusVsCategory: { melee: 3 } },
  },
  {
    id: 'shared_fire_arrows',
    civId: 'shared',
    buildingType: 'archery_range',
    name: '火箭焚城齊射',
    icon: '🔥',
    roleTag: '焚城',
    description: '【時代 III】箭矢綁附松脂引信，提升遠程攻速並可快速焚毀敵方箭塔與資源營地！',
    effectLabel: '遠程攻速 +16% · 對建築火攻 +40%',
    cost: { food: 0, wood: 90, gold: 95, stone: 0 },
    researchTime: 12,
    requiredAge: 3,
    targetCategories: ['ranged'],
    effect: { attackRateMultiplier: 1.16, siegeDamageMultiplier: 1.4 },
  },
  {
    id: 'shared_flanking_spurs',
    civId: 'shared',
    buildingType: 'castle',
    name: '側翼包抄馬刺',
    icon: '🏇',
    roleTag: '切後排',
    description: '【時代 III 反制】騎兵加速繞後切入，對敵方弓兵、忍者與法師後排造成毀滅性追獵傷害！',
    effectLabel: '騎兵移速 +14% · 對遠程 +5',
    cost: { food: 120, wood: 0, gold: 90, stone: 0 },
    researchTime: 12,
    requiredAge: 3,
    targetCategories: ['cavalry'],
    effect: { speedMultiplier: 1.14, bonusVsCategory: { ranged: 5 } },
  },

  // ================= SHARED ERA II–IV SIEGE & FORTIFICATION TECHS =================
  {
    id: 'shared_masonry',
    civId: 'shared',
    buildingType: 'town_center',
    name: '磚石築城工事',
    icon: '🧱',
    roleTag: '城防',
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
    roleTag: '塔防',
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
    roleTag: '塔防',
    description: '【時代 III 城防】於塔樓與要塞頂部增設近距熱油反制孔，強化駐防單位射擊殺傷與城甲。',
    effectLabel: '駐防齊射傷害 +6 · 城甲 +3',
    cost: { food: 90, wood: 120, gold: 80, stone: 90 },
    researchTime: 13,
    requiredAge: 3,
    effect: { garrisonAttackBonus: 6, buildingArmorBonus: 3 },
  },
  {
    id: 'shared_field_engineering',
    civId: 'shared',
    buildingType: 'barracks',
    name: '野戰工程隊',
    icon: '🪵',
    roleTag: '野戰攻城',
    description: '【時代 II】教導步兵在前線搬運木料、削製撞槌與架設防箭頂棚。研發後，至少 4 名步兵可在戰場花費木材與黃金組裝一輛基礎衝車，不必先建造攻城器工坊。',
    effectLabel: '解鎖野外組裝基礎衝車',
    cost: { food: 80, wood: 120, gold: 60, stone: 0 },
    researchTime: 16,
    requiredAge: 2,
    effect: {},
  },
  {
    id: 'shared_siege_engineers',
    civId: 'shared',
    buildingType: 'siege_workshop',
    name: '攻城工兵學',
    icon: '⚙️',
    roleTag: '攻城',
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
    roleTag: '終極城防',
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

export function findTechDef(techId: string): TechDefinition | undefined {
  return CIVILIZATION_TECHS.find((t) => t.id === techId);
}

/**
 * Returns the conflicting already-researched tech if `tech` belongs to an `exclusiveGroup`
 * whose alternative branch has already been researched.
 */
export function isTechLockedByExclusion(
  tech: TechDefinition,
  researchedIds: string[]
): TechDefinition | null {
  if (!tech.exclusiveGroup) return null;
  for (const rId of researchedIds) {
    if (rId === tech.id) continue;
    const other = findTechDef(rId);
    if (other && other.exclusiveGroup === tech.exclusiveGroup) {
      return other;
    }
  }
  return null;
}

/**
 * Returns the missing prerequisite tech definition if `tech.prerequisiteTechId` is not yet researched.
 */
export function isTechMissingPrerequisite(
  tech: TechDefinition,
  researchedIds: string[]
): TechDefinition | null {
  if (!tech.prerequisiteTechId) return null;
  if (researchedIds.includes(tech.prerequisiteTechId)) return null;
  return findTechDef(tech.prerequisiteTechId) || null;
}

export function canResearchTech(
  tech: TechDefinition,
  researchedIds: string[] = [],
  currentAge: AgeLevel = 1
): { ok: boolean; reason?: string } {
  if (researchedIds.includes(tech.id)) {
    return { ok: false, reason: '已研發完成' };
  }
  if (tech.requiredAge && currentAge < tech.requiredAge) {
    return { ok: false, reason: `需先晉升至時代 ${tech.requiredAge}` };
  }
  const conflict = isTechLockedByExclusion(tech, researchedIds);
  if (conflict) {
    return { ok: false, reason: `已選「${conflict.name}」(互斥路線)` };
  }
  const missingPrereq = isTechMissingPrerequisite(tech, researchedIds);
  if (missingPrereq) {
    return { ok: false, reason: `需先研發「${missingPrereq.name}」` };
  }
  return { ok: true };
}

export function getAvailableTechsForBuilding(
  bType: BuildingType,
  civId?: CivilizationId,
  researchedIds: string[] = [],
  currentAge: AgeLevel = 1
): TechDefinition[] {
  const resolvedCiv = getCivilizationConfig(civId).id;
  return CIVILIZATION_TECHS.filter(
    (tech) =>
      tech.buildingType === bType &&
      (tech.civId === resolvedCiv || tech.civId === 'shared') &&
      canResearchTech(tech, researchedIds, currentAge).ok
  );
}

export function getAllTechsForBuilding(
  bType: BuildingType,
  civId?: CivilizationId
): TechDefinition[] {
  const resolvedCiv = getCivilizationConfig(civId).id;
  return CIVILIZATION_TECHS.filter(
    (tech) => tech.buildingType === bType && (tech.civId === resolvedCiv || tech.civId === 'shared')
  );
}

export function getAllTechsForCiv(civId?: CivilizationId): TechDefinition[] {
  const resolvedCiv = getCivilizationConfig(civId).id;
  return CIVILIZATION_TECHS.filter(
    (tech) => tech.civId === resolvedCiv || tech.civId === 'shared'
  );
}

export function getTrainingTimeMultiplier(researchedIds: string[]): number {
  let mult = 1;
  for (const tId of researchedIds) {
    const t = findTechDef(tId);
    if (t?.effect.trainTimeMultiplier) {
      mult *= t.effect.trainTimeMultiplier;
    }
  }
  return +Math.max(0.45, mult).toFixed(3);
}

export function getResourceGatherTechMultiplier(
  researchedIds: string[],
  resourceType: ResourceType
): number {
  let mult = 1;
  for (const tId of researchedIds) {
    const t = findTechDef(tId);
    const byType = t?.effect.gatherByType?.[resourceType];
    if (byType) {
      mult *= byType;
    }
  }
  return +mult.toFixed(3);
}

export const AGE_COMBAT_PROGRESSION: Record<
  AgeLevel,
  { hpMult: number; atkMult: number; rateMult: number; defenseAdd: number; speedAdd: number }
> = {
  1: { hpMult: 1.0, atkMult: 1.0, rateMult: 1.0, defenseAdd: 0, speedAdd: 0 },
  2: { hpMult: 1.15, atkMult: 1.16, rateMult: 1.08, defenseAdd: 0, speedAdd: 0.12 },
  3: { hpMult: 1.35, atkMult: 1.36, rateMult: 1.16, defenseAdd: 1, speedAdd: 0.24 },
  4: { hpMult: 1.6, atkMult: 1.62, rateMult: 1.25, defenseAdd: 2, speedAdd: 0.36 },
};

/**
 * Applies researched civilization techs, Age progression, unique building aura, and passive perks to UnitStats.
 */
export function applyCivilizationAndTechStats(
  baseStats: UnitStats,
  category: UnitCategory,
  civId: CivilizationId | undefined,
  researchedTechIds: string[],
  age: AgeLevel = 1,
  hasUniqueBuildingAura = false
): UnitStats {
  const cfg = getCivilizationConfig(civId);
  let maxHp = baseStats.maxHp * (cfg.passiveBonuses.hpMultiplier || 1);
  let attack = baseStats.attack;
  let defense = baseStats.defense + (cfg.passiveBonuses.defenseBonus || 0);
  let rangedDefense = baseStats.rangedDefense || 0;
  let speed = baseStats.speed * (cfg.passiveBonuses.moveSpeedMultiplier || 1);
  let attackRate = baseStats.attackRate;
  let gatherSpeed = baseStats.gatherSpeed * (cfg.passiveBonuses.gatherRateMultiplier || 1);
  let carryCapacity = baseStats.carryCapacity;
  let range = baseStats.range;
  let buildingAttack = baseStats.buildingAttack;
  let hpRegenPerSec = baseStats.hpRegenPerSec || 0;
  const bonusVsCategory: Partial<Record<UnitCategory, number>> = baseStats.bonusVsCategory
    ? { ...baseStats.bonusVsCategory }
    : {};

  // Progressive Age combat threat scaling for non-worker military units
  if (category !== 'worker') {
    const ageScale = AGE_COMBAT_PROGRESSION[age] || AGE_COMBAT_PROGRESSION[1];
    maxHp *= ageScale.hpMult;
    attack *= ageScale.atkMult;
    attackRate *= ageScale.rateMult;
    defense += ageScale.defenseAdd;
    speed += ageScale.speedAdd;
    if (buildingAttack !== undefined && buildingAttack > 0) {
      buildingAttack = Math.round(buildingAttack * (1 + (age - 1) * 0.18));
    }

    // Special faction building aura boost (Armory Forge / Spirit Shrine / Mana Well)
    if (hasUniqueBuildingAura) {
      if (cfg.id === 'medieval') {
        defense += 1;
        attack *= 1.1;
      } else if (cfg.id === 'anime') {
        attackRate *= 1.12;
        speed *= 1.06;
      } else if (cfg.id === 'fantasy') {
        maxHp *= 1.12;
        defense += 1;
      }
    }
  }

  for (const techId of researchedTechIds) {
    const tech = findTechDef(techId);
    if (!tech) continue;
    if (tech.targetCategories && !tech.targetCategories.includes(category)) continue;

    if (tech.effect.hpMultiplier) maxHp *= tech.effect.hpMultiplier;
    if (tech.effect.attackBonus) attack += tech.effect.attackBonus;
    if (tech.effect.defenseBonus) defense += tech.effect.defenseBonus;
    if (tech.effect.rangedDefenseBonus) rangedDefense += tech.effect.rangedDefenseBonus;
    if (tech.effect.speedMultiplier) speed *= tech.effect.speedMultiplier;
    if (tech.effect.attackRateMultiplier) attackRate *= tech.effect.attackRateMultiplier;
    if (tech.effect.gatherMultiplier) gatherSpeed *= tech.effect.gatherMultiplier;
    if (tech.effect.carryCapacityBonus && carryCapacity > 0) {
      carryCapacity += tech.effect.carryCapacityBonus;
    }
    if (tech.effect.rangeBonus) range += tech.effect.rangeBonus;
    if (tech.effect.hpRegenPerSec) hpRegenPerSec += tech.effect.hpRegenPerSec;
    if (tech.effect.bonusVsCategory) {
      for (const [catKey, val] of Object.entries(tech.effect.bonusVsCategory)) {
        const c = catKey as UnitCategory;
        if (typeof val === 'number' && val !== 0) {
          bonusVsCategory[c] = (bonusVsCategory[c] || 0) + val;
        }
      }
    }
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
    attackRate: +attackRate.toFixed(2),
    gatherSpeed: +gatherSpeed.toFixed(4),
    carryCapacity,
    range: +range.toFixed(2),
    hpRegenPerSec: hpRegenPerSec > 0 ? +hpRegenPerSec.toFixed(2) : undefined,
    bonusVsCategory: Object.keys(bonusVsCategory).length > 0 ? bonusVsCategory : undefined,
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
