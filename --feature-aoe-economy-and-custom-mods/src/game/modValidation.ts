import { BuildingType, GameMod, UnitCategory } from '../types/game';

type RecordValue = Record<string, unknown>;
const RESOURCES = ['food', 'wood', 'gold', 'stone'] as const;
const BUILDINGS: BuildingType[] = [
  'town_center', 'barracks', 'archery_range', 'farm', 'lumber_camp', 'mining_camp',
  'tower', 'castle', 'armory_forge', 'spirit_shrine', 'mana_well',
  'landmark_aachen', 'landmark_barracks', 'landmark_guildhall',
  'landmark_citadel', 'landmark_observatory', 'landmark_arsenal',
];
const CATEGORIES: UnitCategory[] = ['melee', 'ranged', 'cavalry', 'siege', 'worker', 'special'];
const MODELS = ['villager', 'swordsman', 'archer', 'knight', 'ninja', 'saiyan', 'mage', 'golem', 'ram', 'cannon'];
const PROJECTILES = ['arrow', 'fireball', 'ki_blast', 'slash'];
const ABILITIES = ['whirlwind', 'ki_burst', 'heal', 'haste'];
const CIVS = ['medieval', 'anime', 'fantasy', 'shared'];
const AI_FIELDS = [
  'food', 'wood', 'gold', 'stone', 'armyCount', 'workerCount', 'underAttack',
  'enemyProximity', 'gameTime', 'age', 'buildingCount', 'enemyArmyCount',
];
const AI_OPERATORS = ['>', '<', '>=', '<=', '==', '!='];
const AI_ACTIONS = [
  'train_unit', 'build', 'gather_priority', 'attack_player', 'cluster_attack',
  'defend_base', 'retreat_to_base', 'patrol_mid', 'advance_age',
];
const TECH_EFFECTS: Record<string, [number, number]> = {
  attackBonus: [-500, 1000], defenseBonus: [-500, 1000], rangedDefenseBonus: [-500, 1000],
  hpMultiplier: [0.1, 5], speedMultiplier: [0.1, 5], gatherMultiplier: [0.1, 5],
  cooldownMultiplier: [0.1, 5], rangeBonus: [-50, 50], buildingArmorBonus: [-500, 1000],
  buildingHpMultiplier: [0.1, 5], siegeDamageMultiplier: [0.1, 5],
  garrisonAttackBonus: [-500, 1000], towerAttackRateMultiplier: [0.1, 5], towerRangeBonus: [-50, 50],
};

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function oneOf(value: unknown, list: readonly string[]): boolean {
  return typeof value === 'string' && list.includes(value);
}
function idOk(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(value);
}
function textOk(value: unknown, min: number, max: number): boolean {
  return typeof value === 'string' && value.trim().length >= min && value.length <= max;
}
function numberOk(value: unknown, min: number, max: number): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}
function optionalNumber(obj: RecordValue, key: string, min: number, max: number, path: string, errors: string[]) {
  if (obj[key] !== undefined && !numberOk(obj[key], min, max)) {
    errors.push(path + '：' + key + ' 必須介於 ' + min + ' 至 ' + max + '。');
  }
}
function optionalText(obj: RecordValue, key: string, max: number, path: string, errors: string[]) {
  if (obj[key] !== undefined && !textOk(obj[key], 0, max)) errors.push(path + '：' + key + ' 格式錯誤或過長。');
}
function resources(value: unknown, path: string, errors: string[], partial = false) {
  if (!isRecord(value)) {
    errors.push(path + '：資源成本必須是物件。');
    return;
  }
  for (const key of RESOURCES) {
    if (partial && value[key] === undefined) continue;
    if (!numberOk(value[key], 0, 1000000)) errors.push(path + '：' + key + ' 必須介於 0 至 1,000,000。');
  }
}

function validateUnit(value: unknown, path: string, errors: string[]) {
  if (!isRecord(value)) {
    errors.push(path + '：單位定義必須是物件。');
    return;
  }
  if (!idOk(value.id)) errors.push(path + '：單位 ID 格式錯誤。');
  if (!textOk(value.name, 1, 100)) errors.push(path + '：單位名稱不可空白，且最多 100 字。');
  if (!textOk(value.factionPack, 1, 80)) errors.push(path + '：factionPack 格式錯誤。');
  if (!oneOf(value.category, CATEGORIES)) errors.push(path + '：未知的兵種分類。');
  if (!textOk(value.description, 0, 2000)) errors.push(path + '：單位描述最多 2,000 字。');
  if (value.isHero !== undefined && typeof value.isHero !== 'boolean') errors.push(path + '：isHero 必須是布林值。');
  if (value.requiredAge !== undefined && !numberOk(value.requiredAge, 1, 4)) errors.push(path + '：需求時代必須是 1 至 4。');
  if (value.availableInBuildings !== undefined &&
    (!Array.isArray(value.availableInBuildings) || !value.availableInBuildings.every((item) => oneOf(item, BUILDINGS)))) {
    errors.push(path + '：availableInBuildings 含有未知建築類型。');
  }

  if (!isRecord(value.stats)) {
    errors.push(path + '：stats 必須是物件。');
  } else {
    const stats = value.stats;
    const limits: Record<string, [number, number]> = {
      maxHp: [1, 50000], attack: [0, 5000], buildingAttack: [0, 5000],
      defense: [0, 500], rangedDefense: [0, 500], range: [0, 100], speed: [0, 30],
      attackRate: [0.05, 20], trainTime: [0.1, 3600], gatherSpeed: [0, 1000], carryCapacity: [0, 10000],
    };
    for (const [key, range] of Object.entries(limits)) {
      if (key === 'buildingAttack' || key === 'rangedDefense') optionalNumber(stats, key, range[0], range[1], path + '.stats', errors);
      else if (!numberOk(stats[key], range[0], range[1])) errors.push(path + '.stats：' + key + ' 超出允許範圍。');
    }
    if (stats.ignoresBuildingArmor !== undefined && typeof stats.ignoresBuildingArmor !== 'boolean') {
      errors.push(path + '.stats：ignoresBuildingArmor 必須是布林值。');
    }
    resources(stats.cost, path + '.stats.cost', errors);
  }

  if (!isRecord(value.visual)) {
    errors.push(path + '：visual 必須是物件。');
  } else {
    if (!textOk(value.visual.color, 1, 32)) errors.push(path + '.visual：color 格式錯誤。');
    if (!oneOf(value.visual.modelType, MODELS)) errors.push(path + '.visual：未知的模型類型。');
    optionalNumber(value.visual, 'scale', 0.25, 5, path + '.visual', errors);
    optionalText(value.visual, 'weaponColor', 32, path + '.visual', errors);
    if (value.visual.projectileType !== undefined && !oneOf(value.visual.projectileType, PROJECTILES)) {
      errors.push(path + '.visual：未知的 projectileType。');
    }
  }

  if (value.specialAbility !== undefined) {
    if (!isRecord(value.specialAbility)) {
      errors.push(path + '：specialAbility 必須是物件。');
    } else {
      const ability = value.specialAbility;
      if (!textOk(ability.name, 1, 100)) errors.push(path + '.specialAbility：技能名稱不可空白。');
      if (!oneOf(ability.type, ABILITIES)) errors.push(path + '.specialAbility：未知技能類型。');
      if (!numberOk(ability.cooldown, 1, 600)) errors.push(path + '.specialAbility：冷卻時間必須介於 1 至 600 秒。');
      if (!numberOk(ability.potency, 0, 500)) errors.push(path + '.specialAbility：威力必須介於 0 至 500。');
      if (!textOk(ability.description, 0, 1000)) errors.push(path + '.specialAbility：技能敘述最多 1,000 字。');
    }
  }
}

function validateBuildings(value: unknown, path: string, errors: string[]) {
  if (value === undefined) return;
  if (!isRecord(value)) {
    errors.push(path + '：buildingOverrides 必須是物件。');
    return;
  }
  for (const [building, raw] of Object.entries(value)) {
    const itemPath = path + '.buildingOverrides.' + building;
    if (!oneOf(building, BUILDINGS)) {
      errors.push(itemPath + '：未知的建築類型。');
      continue;
    }
    if (!isRecord(raw)) {
      errors.push(itemPath + '：建築覆寫必須是物件。');
      continue;
    }
    if (raw.id !== undefined && raw.id !== building) errors.push(itemPath + '：id 必須與建築類型一致。');
    optionalText(raw, 'name', 100, itemPath, errors);
    optionalText(raw, 'description', 2000, itemPath, errors);
    const ranges: Record<string, [number, number]> = {
      maxHp: [1, 100000], buildTime: [0.1, 3600], size: [0.5, 50],
      populationProvided: [0, 500], attack: [0, 5000], range: [0, 100],
      buildingArmor: [0, 500], maxGarrison: [0, 500], landmarkAgeAdvance: [1, 4],
    };
    for (const [key, range] of Object.entries(ranges)) optionalNumber(raw, key, range[0], range[1], itemPath, errors);
    if (raw.cost !== undefined) resources(raw.cost, itemPath + '.cost', errors, true);
    if (raw.trainableUnits !== undefined && (!Array.isArray(raw.trainableUnits) || !raw.trainableUnits.every(idOk))) {
      errors.push(itemPath + '：trainableUnits 必須是有效單位 ID 陣列。');
    }
    for (const key of ['isWall', 'canGarrisonAttack']) {
      if (raw[key] !== undefined && typeof raw[key] !== 'boolean') errors.push(itemPath + '：' + key + ' 必須是布林值。');
    }
    if (raw.civExclusive !== undefined && !oneOf(raw.civExclusive, ['medieval', 'anime', 'fantasy'])) {
      errors.push(itemPath + '：civExclusive 不合法。');
    }
    optionalText(raw, 'landmarkPerkDescription', 1000, itemPath, errors);
    if (raw.producesResource !== undefined && (
      !isRecord(raw.producesResource) ||
      !oneOf(raw.producesResource.type, RESOURCES) ||
      !numberOk(raw.producesResource.amountPerSec, 0, 1000)
    )) errors.push(itemPath + '：producesResource 格式錯誤。');
  }
}

function validateTech(value: unknown, path: string, errors: string[]) {
  if (!isRecord(value)) {
    errors.push(path + '：科技定義必須是物件。');
    return;
  }
  if (!idOk(value.id)) errors.push(path + '：科技 ID 格式錯誤。');
  if (!oneOf(value.civId, CIVS)) errors.push(path + '：科技 civId 不合法。');
  if (!oneOf(value.buildingType, BUILDINGS)) errors.push(path + '：科技研發建築不合法。');
  if (!textOk(value.name, 1, 100)) errors.push(path + '：科技名稱不可空白。');
  if (!textOk(value.icon, 1, 16)) errors.push(path + '：科技圖示格式錯誤。');
  if (!textOk(value.description, 0, 2000)) errors.push(path + '：科技描述最多 2,000 字。');
  if (!textOk(value.effectLabel, 1, 200)) errors.push(path + '：effectLabel 不可空白。');
  resources(value.cost, path + '.cost', errors);
  if (!numberOk(value.researchTime, 0.1, 3600)) errors.push(path + '：researchTime 必須介於 0.1 至 3,600 秒。');
  if (value.requiredAge !== undefined && !numberOk(value.requiredAge, 1, 4)) errors.push(path + '：requiredAge 必須是 1 至 4。');
  if (value.targetCategories !== undefined &&
    (!Array.isArray(value.targetCategories) || !value.targetCategories.every((item) => oneOf(item, CATEGORIES)))) {
    errors.push(path + '：targetCategories 含有未知兵種分類。');
  }
  if (!isRecord(value.effect)) {
    errors.push(path + '：effect 必須是物件。');
  } else {
    for (const [key, raw] of Object.entries(value.effect)) {
      const range = TECH_EFFECTS[key];
      if (!range) errors.push(path + '.effect：不支援的效果欄位 ' + key + '。');
      else if (!numberOk(raw, range[0], range[1])) errors.push(path + '.effect：' + key + ' 超出安全範圍。');
    }
  }
}

function validateAiRule(value: unknown, path: string, errors: string[]) {
  if (!isRecord(value)) {
    errors.push(path + '：AI 規則必須是物件。');
    return;
  }
  if (!idOk(value.id)) errors.push(path + '：AI 規則 ID 格式錯誤。');
  if (!textOk(value.name, 1, 120)) errors.push(path + '：AI 規則名稱不可空白。');
  if (typeof value.enabled !== 'boolean') errors.push(path + '：enabled 必須是布林值。');
  if (!Array.isArray(value.conditions) || value.conditions.length > 32) {
    errors.push(path + '：conditions 必須是最多 32 項的陣列。');
  } else {
    value.conditions.forEach((condition, index) => {
      if (!isRecord(condition) || !oneOf(condition.field, AI_FIELDS) ||
        !oneOf(condition.operator, AI_OPERATORS) || !numberOk(condition.value, -1000000, 10000000)) {
        errors.push(path + '.conditions[' + index + ']：條件欄位、運算子或數值不合法。');
      }
    });
  }
  if (!isRecord(value.action) || !oneOf(value.action.type, AI_ACTIONS) ||
    !numberOk(value.action.priority, 0, 1000) ||
    (value.action.targetId !== undefined && !textOk(value.action.targetId, 0, 80))) {
    errors.push(path + '：action 格式錯誤或 priority 超出 0 至 1,000。');
  }
}

export function validateGameMods(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 50) {
    return ['模組清單必須是 1 至 50 個模組的陣列。'];
  }
  const errors: string[] = [];
  const modIds = new Set<string>();
  const unitIds = new Set<string>();
  const techIds = new Set<string>();

  value.forEach((raw, index) => {
    const path = '模組 #' + (index + 1);
    if (!isRecord(raw)) {
      errors.push(path + '：模組必須是物件。');
      return;
    }
    if (!idOk(raw.id)) errors.push(path + '：模組 ID 格式錯誤。');
    else if (modIds.has(raw.id)) errors.push(path + '：模組 ID 重複。');
    else modIds.add(raw.id);
    if (!textOk(raw.name, 1, 100)) errors.push(path + '：模組名稱不可空白，且最多 100 字。');
    optionalText(raw, 'author', 100, path, errors);
    optionalText(raw, 'description', 2000, path, errors);
    optionalText(raw, 'version', 40, path, errors);
    if (raw.enabled !== undefined && typeof raw.enabled !== 'boolean') errors.push(path + '：enabled 必須是布林值。');
    if (raw.civilizationId !== undefined && !oneOf(raw.civilizationId, CIVS)) errors.push(path + '：civilizationId 不合法。');

    if (!Array.isArray(raw.unitDefinitions) || raw.unitDefinitions.length > 300) {
      errors.push(path + '：unitDefinitions 必須是最多 300 項的陣列。');
    } else {
      raw.unitDefinitions.forEach((unit, unitIndex) => {
        validateUnit(unit, path + '.unitDefinitions[' + unitIndex + ']', errors);
        if (isRecord(unit) && idOk(unit.id)) {
          if (unitIds.has(unit.id)) errors.push(path + '：跨模組的單位 ID 重複：' + unit.id + '。');
          unitIds.add(unit.id);
        }
      });
    }

    const multipliers = raw.balanceMultipliers;
    const multiplierRanges: Record<string, [number, number]> = {
      gatherRate: [0.1, 5], unitHp: [0.1, 5], unitDamage: [0.1, 5], buildSpeed: [0.1, 5], moveSpeed: [0.1, 5],
    };
    if (!isRecord(multipliers)) errors.push(path + '：balanceMultipliers 必須是物件。');
    else {
      for (const [key, range] of Object.entries(multiplierRanges)) {
        if (!numberOk(multipliers[key], range[0], range[1])) errors.push(path + '.balanceMultipliers：' + key + ' 必須介於 ' + range[0] + ' 至 ' + range[1] + '。');
      }
    }

    validateBuildings(raw.buildingOverrides, path, errors);
    if (raw.techDefinitions !== undefined && (!Array.isArray(raw.techDefinitions) || raw.techDefinitions.length > 200)) {
      errors.push(path + '：techDefinitions 必須是最多 200 項的陣列。');
    } else if (Array.isArray(raw.techDefinitions)) {
      raw.techDefinitions.forEach((tech, techIndex) => {
        validateTech(tech, path + '.techDefinitions[' + techIndex + ']', errors);
        if (isRecord(tech) && idOk(tech.id)) {
          if (techIds.has(tech.id)) errors.push(path + '：跨模組的科技 ID 重複：' + tech.id + '。');
          techIds.add(tech.id);
        }
      });
    }

    if (!Array.isArray(raw.aiRules) || raw.aiRules.length > 300) {
      errors.push(path + '：aiRules 必須是最多 300 項的陣列。');
    } else {
      raw.aiRules.forEach((rule, ruleIndex) => validateAiRule(rule, path + '.aiRules[' + ruleIndex + ']', errors));
    }
  });
  return errors.slice(0, 50);
}

export function validateAndNormalizeGameMods(value: unknown): { mods: GameMod[] | null; errors: string[] } {
  const errors = validateGameMods(value);
  if (errors.length > 0 || !Array.isArray(value)) return { mods: null, errors };
  const mods = value.map((raw) => {
    const mod = raw as GameMod;
    const legacyScope = mod.id.startsWith('mod_') ? mod.id.slice(4) : '';
    const inferredScope = legacyScope === 'medieval' || legacyScope === 'anime' || legacyScope === 'fantasy'
      ? legacyScope : 'shared';
    return {
      ...mod,
      author: mod.author || 'Unknown',
      description: mod.description || '',
      version: mod.version || '1.0.0',
      enabled: mod.enabled !== false,
      civilizationId: mod.civilizationId || inferredScope,
      buildingOverrides: mod.buildingOverrides || {},
      techDefinitions: mod.techDefinitions || [],
      unitDefinitions: mod.unitDefinitions || [],
      aiRules: mod.aiRules || [],
    };
  });
  return { mods, errors: [] };
}
