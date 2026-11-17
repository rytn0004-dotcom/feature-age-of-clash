import {
  Resources,
  ResourceType,
  UnitStats,
  GameMod,
  AiCondition,
  AiRule,
  AiAction,
  ResourceNode,
  EntityCommon,
  FactionId,
  MatchParticipant,
  UnitEntity,
  UnitDefinition,
  BuildingEntity,
  AgeLevel,
  ShrineType,
} from '../types/game';

/**
 * Per-second income from a captured strategic shrine.
 * The three shrine identities deliberately trade food, timber, gold and stone.
 */
export function getShrineIncome(type: ShrineType, blessingActive: boolean): Resources {
  if (type === 'harvest') {
    return { food: blessingActive ? 3 : 2, wood: 2, gold: 0, stone: 0 };
  }
  if (type === 'forge') {
    return { food: 0, wood: 0, gold: blessingActive ? 3 : 2, stone: blessingActive ? 3 : 2 };
  }
  return { food: 0, wood: blessingActive ? 2 : 1, gold: blessingActive ? 4 : 3, stone: 0 };
}

export function getShrineBlessingHoldTime(type: ShrineType): number {
  return type === 'forge' ? 16 : type === 'war' ? 18 : 24;
}

/**
 * Checks if current resources can cover cost.
 */
export function canAfford(current: Resources, cost: Resources): boolean {
  return (
    current.food >= (cost.food || 0) &&
    current.wood >= (cost.wood || 0) &&
    current.gold >= (cost.gold || 0) &&
    current.stone >= (cost.stone || 0)
  );
}

/**
 * Deducts cost from resources without negative values.
 */
export function deductCost(current: Resources, cost: Resources): Resources {
  return {
    food: Math.max(0, current.food - (cost.food || 0)),
    wood: Math.max(0, current.wood - (cost.wood || 0)),
    gold: Math.max(0, current.gold - (cost.gold || 0)),
    stone: Math.max(0, current.stone - (cost.stone || 0)),
  };
}

/**
 * Adds two resource bags.
 */
export function addResources(a: Resources, b: Partial<Resources>): Resources {
  return {
    food: a.food + (b.food || 0),
    wood: a.wood + (b.wood || 0),
    gold: a.gold + (b.gold || 0),
    stone: a.stone + (b.stone || 0),
  };
}

/**
 * RTS damage calculation: minimum 1 damage, mitigation by defense.
 */
export function calculateDamage(
  attackerAttack: number,
  defenderDefense: number,
  damageMultiplier = 1
): number {
  const effectiveAtk = attackerAttack * damageMultiplier;
  const raw = Math.max(1, effectiveAtk - defenderDefense);
  return Math.round(raw);
}

/**
 * Unit-vs-unit damage factoring in bonus ranged pierce defense (so battered siege rams resist arrow fire).
 */

/**
 * Rock-paper-scissors between army roles.
 * Soft multipliers keep fights readable without binary "immune" matchups.
 * Spearman (and similar anti-cav ids) get a hard tip against cavalry.
 */
export function getCategoryCounterMultiplier(
  attackerCategory: string,
  defenderCategory: string,
  attackerId?: string
): number {
  if (attackerId === 'spearman' && defenderCategory === 'cavalry') return 1.8;
  if (attackerId === 'spearman' && defenderCategory === 'melee') return 0.9;
  if (attackerId === 'scout' && (defenderCategory === 'worker' || defenderCategory === 'ranged')) return 1.25;
  if (attackerId === 'war_galley' && defenderCategory === 'worker') return 1.35;

  if (attackerCategory === 'siege' && defenderCategory !== 'siege') return 0.4;
  if (defenderCategory === 'siege' && attackerCategory === 'melee') return 1.35;
  if (defenderCategory === 'siege' && attackerCategory === 'ranged') return 0.75;

  if (attackerCategory === 'cavalry' && defenderCategory === 'melee') return 1.28;
  if (attackerCategory === 'cavalry' && defenderCategory === 'ranged') return 1.12;
  if (attackerCategory === 'cavalry' && defenderCategory === 'worker') return 1.2;

  if (attackerCategory === 'melee' && defenderCategory === 'ranged') return 1.18;
  if (attackerCategory === 'melee' && defenderCategory === 'cavalry') return 0.72;

  if (attackerCategory === 'ranged' && defenderCategory === 'cavalry') return 0.88;
  if (attackerCategory === 'ranged' && defenderCategory === 'melee') return 0.92;
  if (attackerCategory === 'ranged' && defenderCategory === 'worker') return 1.1;

  return 1;
}

export function getUnitVsUnitDamage(
  attackerAttack: number,
  defender: Pick<UnitEntity, 'unitDef' | 'buffSpeedUntil' | 'buffDefenseBonus'>,
  isRangedProjectile = false,
  currentSimTime = 0,
  attacker?: Pick<UnitEntity, 'unitDef' | 'unitDefId'>
): number {
  const buffDef =
    defender.buffSpeedUntil && defender.buffSpeedUntil > currentSimTime
      ? defender.buffDefenseBonus || 0
      : 0;
  const pierceArmor = isRangedProjectile ? defender.unitDef.stats.rangedDefense || 0 : 0;
  const totalDef = (defender.unitDef.stats.defense || 0) + buffDef + pierceArmor;
  const counter = attacker
    ? getCategoryCounterMultiplier(
        attacker.unitDef.category,
        defender.unitDef.category,
        attacker.unitDefId || attacker.unitDef.id
      )
    : 1;
  return calculateDamage(attackerAttack * counter, totalDef);
}

/**
 * Returns effective building armor considering base armor, Age era reinforcement, and defensive techs.
 */
export function getEffectiveBuildingArmor(
  building: Pick<BuildingEntity, 'buildingDef' | 'buildingType'>,
  defenderAge = 1,
  defenderTechIds: string[] = []
): number {
  const baseArmor = building.buildingDef.buildingArmor ?? 5;
  const ageBonus = Math.max(0, defenderAge - 1) * 2;
  let techBonus = 0;
  if (defenderTechIds.includes('shared_masonry')) techBonus += 4;
  if (defenderTechIds.includes('shared_murder_holes')) techBonus += 3;
  if (defenderTechIds.includes('shared_imperial_fortification')) techBonus += 6;
  return baseArmor + ageBonus + techBonus;
}


/**
 * Medieval assault methods — NO residual burn DoT.
 * Damage identity comes from role + sustained sapping channel + structure material.
 * Greek-fire siphons use a dedicated short-range cone profile (handled in engine splash).
 */
export function getBuildingAssaultProfile(
  attacker: Pick<UnitEntity, 'unitDef' | 'unitDefId'>
): {
  method: import('../types/game').BuildingAssaultMethod;
  damageMultiplier: number;
  floatLabel: string;
  /** Prefer adjacent assault (torch / sap); engine may slow attack-move from range */
  wantsContact: boolean;
} {
  const cat = attacker.unitDef.category;
  const stats = attacker.unitDef.stats;
  const id = attacker.unitDefId;

  if (id === 'greek_fire_siphon') {
    return {
      method: 'greek_fire',
      damageMultiplier: 1.05,
      floatLabel: '',
      wantsContact: false,
    };
  }

  if (stats.ignoresBuildingArmor || cat === 'siege') {
    if (id === 'fantasy_goblin_sapper' || id.includes('sapper')) {
      return {
        method: 'blast',
        damageMultiplier: 1.05,
        floatLabel: '',
        wantsContact: true,
      };
    }
    return {
      method: 'ram',
      damageMultiplier: 1,
      floatLabel: '',
      wantsContact: true,
    };
  }

  if (cat === 'ranged' || cat === 'special') {
    return {
      method: 'arrow_chip',
      damageMultiplier: 1,
      floatLabel: '',
      wantsContact: false,
    };
  }

  if (cat === 'cavalry') {
    return {
      method: 'cavalry_harass',
      damageMultiplier: 0.5,
      floatLabel: '',
      wantsContact: true,
    };
  }

  if (cat === 'worker') {
    return {
      method: 'sap',
      damageMultiplier: 0.75,
      floatLabel: '',
      wantsContact: true,
    };
  }

  // Infantry: classic torch assault — burst identity, not DoT
  return {
    method: 'torch',
    damageMultiplier: 0.9,
    floatLabel: '',
    wantsContact: true,
  };
}

export function isWoodenBuilding(buildingType: string): boolean {
  return (
    buildingType === 'farm' ||
    buildingType === 'lumber_camp' ||
    buildingType === 'mining_camp' ||
    buildingType === 'dock'
  );
}

/**
 * Sustained assault bonus: infantry/workers "sap" or torch the same structure.
 * After ~8s continuous attack on one building, up to +55% anti-building damage.
 */
export function getSiegeChannelMultiplier(channelTime: number | undefined, method: string): number {
  if (!channelTime || channelTime <= 0) return 1;
  if (method !== 'torch' && method !== 'sap' && method !== 'blast') return 1;
  // Cap so mass infantry cannot fully replace siege engines
  const t = Math.min(12, channelTime);
  return 1 + (t / 12) * 0.55;
}

/**
 * Building damage — material, assault method, channeling, tech/landmarks.
 * No residual fire DoT; greek-fire direct hits are front-loaded.
 */
export function calculateBuildingDamage(
  attacker: Pick<UnitEntity, 'unitDef' | 'unitDefId' | 'siegeChannelTime'>,
  building: Pick<BuildingEntity, 'buildingDef' | 'buildingType'>,
  defenderAge = 1,
  defenderTechIds: string[] = [],
  attackerTechIds: string[] = [],
  attackerLandmarks: string[] = [],
  ownerHasSiegeSupply = false
): number {
  const stats = attacker.unitDef.stats;
  const profile = getBuildingAssaultProfile(attacker);
  const cat = attacker.unitDef.category;

  let baseBuildingAtk =
    stats.buildingAttack ??
    (cat === 'siege'
      ? stats.attack * 2.2
      : cat === 'ranged' || cat === 'special'
      ? Math.max(2, Math.round(stats.attack * 0.32))
      : cat === 'cavalry'
      ? Math.max(2, Math.round(stats.attack * 0.38))
      : Math.max(3, Math.round(stats.attack * 0.52)));

  if (profile.method === 'arrow_chip') {
    baseBuildingAtk *= isWoodenBuilding(building.buildingType) ? 1.2 : 0.5;
  }
  if (profile.method === 'torch' || profile.method === 'sap') {
    if (isWoodenBuilding(building.buildingType)) baseBuildingAtk *= 1.4;
  }
  if (profile.method === 'greek_fire') {
    // Naphtha excels vs timber/docks; solid but not a castle eraser
    baseBuildingAtk *= isWoodenBuilding(building.buildingType) ? 1.55 : 1.05;
  }

  let mult = profile.damageMultiplier;
  mult *= getSiegeChannelMultiplier(attacker.siegeChannelTime, profile.method);

  if (attackerLandmarks.includes('landmark_arsenal')) mult *= 2.0;
  if (cat !== 'siege' && attackerTechIds.includes('shared_siege_engineers')) mult *= 1.25;
  // Contested shrine long-hold: army-wide siege supplies (oil, ladders, pavises)
  if (ownerHasSiegeSupply && cat !== 'siege') mult *= 1.12;

  const effectiveAtk = baseBuildingAtk * mult;

  if (
    stats.ignoresBuildingArmor ||
    cat === 'siege' ||
    profile.method === 'ram' ||
    profile.method === 'blast' ||
    profile.method === 'greek_fire'
  ) {
    const floor = profile.method === 'greek_fire' ? 6 : profile.method === 'blast' ? 4 : 5;
    return Math.max(floor, Math.round(effectiveAtk));
  }

  const bArmor = getEffectiveBuildingArmor(building, defenderAge, defenderTechIds);
  const net = effectiveAtk - bArmor;
  return Math.max(1, Math.round(net));
}

export function getBuildingMaxGarrison(
  building: Pick<BuildingEntity, 'buildingDef'>
): number {
  return building.buildingDef.maxGarrison || 0;
}

export function computeGarrisonDefenseProfile(
  building: Pick<BuildingEntity, 'buildingDef' | 'buildingType' | 'garrisonedUnitIds'>,
  allUnits: Array<Pick<UnitEntity, 'id' | 'hp' | 'unitDef'>>,
  defenderTechIds: string[] = []
): {
  volleyCount: number;
  damagePerBolt: number;
  range: number;
  cooldown: number;
} {
  const garrisonIds = building.garrisonedUnitIds || [];
  const mannedCount = garrisonIds.filter((uid) => {
    const u = allUnits.find((unit) => unit.id === uid);
    return !!u && u.hp > 0;
  }).length;

  const isCastle =
    building.buildingType === 'castle' || building.buildingType === 'landmark_citadel';
  const baseAttack = building.buildingDef.attack || 0;
  const baseRange = building.buildingDef.range || 0;
  const canFireFromGarrison = !!building.buildingDef.canGarrisonAttack && mannedCount > 0;

  if ((baseAttack <= 0 && !canFireFromGarrison) || baseRange <= 0) {
    return { volleyCount: 0, damagePerBolt: 0, range: 0, cooldown: 1.5 };
  }

  // Buildings without intrinsic gunners (like Town Center / Special Building base) fire only when manned,
  // or fortified towers/castles fire extra bolts per garrisoned defender!
  const requiresGarrisonToFire = building.buildingType === 'town_center' ||
    building.buildingType === 'armory_forge' ||
    building.buildingType === 'spirit_shrine' ||
    building.buildingType === 'mana_well';

  if (requiresGarrisonToFire && mannedCount === 0) {
    return { volleyCount: 0, damagePerBolt: 0, range: baseRange, cooldown: 1.4 };
  }

  const baseBolts = isCastle ? 3 : requiresGarrisonToFire ? 0 : 1;
  const extraBolts = Math.min(6, Math.ceil(mannedCount / 2) + (mannedCount > 0 ? 1 : 0));
  const volleyCount = Math.max(1, baseBolts + extraBolts);

  const arrowSlitsRangeBonus = defenderTechIds.includes('shared_arrow_slits') ? 2 : 0;
  const arrowSlitsRateMult = defenderTechIds.includes('shared_arrow_slits') ? 1.25 : 1;
  const murderHolesBonus =
    mannedCount > 0 && defenderTechIds.includes('shared_murder_holes') ? 6 : 0;

  const baseCooldown = isCastle ? 1.0 : 1.35;
  return {
    volleyCount,
    damagePerBolt: Math.max(8, baseAttack + murderHolesBonus + (mannedCount > 0 ? 2 : 0)),
    range: baseRange + arrowSlitsRangeBonus,
    cooldown: +(baseCooldown / arrowSlitsRateMult).toFixed(2),
  };
}

export interface BuildingCombatStats {
  attackDamage: number;
  volleyCount: number;
  attackDisplay: string;
  attackMethod: string;
  attackType: string;
  range: number;
  cooldown: number;
  buildingArmor: number;
}

/**
 * Computes human-readable combat, attack method/type, range, and structural defense stats for building inspection HUD.
 */
export function getBuildingCombatStats(
  building: Pick<BuildingEntity, 'buildingDef' | 'buildingType' | 'garrisonedUnitIds'>,
  allUnits: Array<Pick<UnitEntity, 'id' | 'hp' | 'unitDef'>>,
  defenderAge = 1,
  defenderTechIds: string[] = []
): BuildingCombatStats {
  const bArmor = getEffectiveBuildingArmor(building, defenderAge, defenderTechIds);
  const defProfile = computeGarrisonDefenseProfile(building, allUnits, defenderTechIds);
  const baseAttack = building.buildingDef.attack || 0;
  const baseRange = building.buildingDef.range || 0;
  const effectiveRange = defProfile.range > 0 ? defProfile.range : baseRange;
  const canFireFromGarrison = !!building.buildingDef.canGarrisonAttack;
  const isCastle = building.buildingType === 'castle' || building.buildingType === 'landmark_citadel';
  const isArcaneOrShrine = building.buildingType === 'mana_well' || building.buildingType === 'spirit_shrine';
  const requiresGarrison =
    building.buildingType === 'town_center' ||
    building.buildingType === 'armory_forge' ||
    building.buildingType === 'spirit_shrine' ||
    building.buildingType === 'mana_well';

  if (baseAttack <= 0 && !canFireFromGarrison) {
    return {
      attackDamage: 0,
      volleyCount: 0,
      attackDisplay: '0 (無攻擊武裝)',
      attackMethod: building.buildingDef.isWall ? '堅壁阻隔防線' : '無武裝輔助建築',
      attackType: '無',
      range: 0,
      cooldown: 0,
      buildingArmor: bArmor,
    };
  }

  const attackType = isArcaneOrShrine
    ? '魔法靈壓彈幕'
    : isCastle || building.buildingType === 'landmark_arsenal'
    ? '重型城防弩砲'
    : '物理穿刺遠程';

  const attackMethod = requiresGarrison
    ? isArcaneOrShrine
      ? '駐軍感應齊射'
      : '駐軍齊射箭雨'
    : isCastle
    ? '自動火網＋駐軍'
    : '自動哨塔＋駐軍';

  if (defProfile.volleyCount === 0) {
    const potentialDmg = Math.max(8, baseAttack + 2);
    return {
      attackDamage: 0,
      volleyCount: 0,
      attackDisplay: `待命 (駐軍後 ${potentialDmg}×2+ 發)`,
      attackMethod,
      attackType,
      range: effectiveRange,
      cooldown: defProfile.cooldown,
      buildingArmor: bArmor,
    };
  }

  return {
    attackDamage: defProfile.damagePerBolt,
    volleyCount: defProfile.volleyCount,
    attackDisplay: `${defProfile.damagePerBolt} × ${defProfile.volleyCount} 發`,
    attackMethod,
    attackType,
    range: effectiveRange,
    cooldown: defProfile.cooldown,
    buildingArmor: bArmor,
  };
}

/**
 * Applies custom mod balance multipliers to unit stats.
 */
export function applyBalanceMultipliers(
  base: UnitStats,
  multipliers: GameMod['balanceMultipliers']
): UnitStats {
  return {
    ...base,
    maxHp: Math.round(base.maxHp * (multipliers.unitHp || 1)),
    attack: Math.round(base.attack * (multipliers.unitDamage || 1)),
    speed: +(base.speed * (multipliers.moveSpeed || 1)).toFixed(2),
    gatherSpeed: +(base.gatherSpeed * (multipliers.gatherRate || 1)).toFixed(2),
  };
}

export interface AiEvaluationSnapshot {
  food: number;
  wood: number;
  gold: number;
  stone: number;
  armyCount: number;
  workerCount: number;
  underAttack: number; // 1 or 0
  enemyProximity: number; // distance to closest enemy
  gameTime: number; // elapsed seconds
  age?: number;
  buildingCount?: number;
  enemyArmyCount?: number;
}

/**
 * Evaluates a single AI condition.
 */
export function evaluateCondition(
  condition: AiCondition,
  snapshot: AiEvaluationSnapshot
): boolean {
  const rawVal = snapshot[condition.field];
  const currentVal = typeof rawVal === 'number' ? rawVal : 0;
  const targetVal = condition.value;

  switch (condition.operator) {
    case '>':
      return currentVal > targetVal;
    case '<':
      return currentVal < targetVal;
    case '>=':
      return currentVal >= targetVal;
    case '<=':
      return currentVal <= targetVal;
    case '==':
      return currentVal === targetVal;
    case '!=':
      return currentVal !== targetVal;
    default:
      return false;
  }
}

/**
 * Evaluates tactical AI rules and returns the highest priority triggered action.
 */
export function evaluateAiScript(
  rules: AiRule[],
  snapshot: AiEvaluationSnapshot
): AiAction | null {
  const matchingRules = rules
    .filter((r) => r.enabled)
    .filter((r) => r.conditions.every((cond) => evaluateCondition(cond, snapshot)))
    .sort((a, b) => b.action.priority - a.action.priority);

  if (matchingRules.length === 0) return null;
  return matchingRules[0].action;
}

export interface AiPlanResult {
  primaryAction: AiAction | null;
  combatAction: AiAction | null;
  trainActions: AiAction[];
  buildAction: AiAction | null;
  gatherAction: AiAction | null;
}

/**
 * Multi-category tactical AI script evaluator: allows AI to execute combat, worker/army production,
 * base expansion/age advancement, and economy focus simultaneously without rules starving each other.
 */
export function evaluateAiPlan(
  rules: AiRule[],
  snapshot: AiEvaluationSnapshot
): AiPlanResult {
  const matched = rules
    .filter((r) => r.enabled)
    .filter((r) => r.conditions.every((cond) => evaluateCondition(cond, snapshot)))
    .map((r) => r.action)
    .sort((a, b) => b.priority - a.priority);

  let combatAction: AiAction | null = null;
  let buildAction: AiAction | null = null;
  let gatherAction: AiAction | null = null;
  const trainActions: AiAction[] = [];
  const seenTrainTargets = new Set<string>();

  for (const act of matched) {
    switch (act.type) {
      case 'defend_base':
      case 'retreat_to_base':
      case 'cluster_attack':
      case 'attack_player':
      case 'patrol_mid':
        if (!combatAction) combatAction = act;
        break;
      case 'train_unit': {
        const key = act.targetId || 'villager';
        if (!seenTrainTargets.has(key)) {
          seenTrainTargets.add(key);
          trainActions.push(act);
        }
        break;
      }
      case 'build':
      case 'advance_age':
        if (!buildAction) buildAction = act;
        break;
      case 'gather_priority':
        if (!gatherAction) gatherAction = act;
        break;
    }
  }

  return {
    primaryAction: matched[0] || null,
    combatAction,
    trainActions,
    buildAction,
    gatherAction,
  };
}

/**
 * Computes desired worker allocation across food/wood/gold/stone based on current Age,
 * resource deficits, and active gather_priority script mode.
 */
export function computeAiWorkerAllocation(
  resources: Resources,
  workerCount: number,
  gatherFocus = 'balanced_eco',
  age: AgeLevel | number = 1
): Record<ResourceType, number> {
  const result: Record<ResourceType, number> = { food: 0, wood: 0, gold: 0, stone: 0 };
  if (workerCount <= 0) return result;

  // Base weights by economic strategy
  let weights: Record<ResourceType, number>;
  if (gatherFocus === 'food') {
    weights = { food: 0.6, wood: 0.25, gold: 0.1, stone: 0.05 };
  } else if (gatherFocus === 'wood') {
    weights = { food: 0.3, wood: 0.5, gold: 0.12, stone: 0.08 };
  } else if (gatherFocus === 'gold') {
    weights = { food: 0.3, wood: 0.2, gold: 0.42, stone: 0.08 };
  } else if (gatherFocus === 'stone') {
    weights = { food: 0.28, wood: 0.25, gold: 0.17, stone: 0.3 };
  } else if (gatherFocus === 'military_eco' || age >= 2) {
    weights = { food: 0.38, wood: 0.24, gold: 0.28, stone: 0.1 };
  } else {
    // Early game worker & camp ramp
    weights = { food: 0.52, wood: 0.3, gold: 0.13, stone: 0.05 };
  }

  // Dynamic deficit correction: boost starved essentials without starving everything else
  if (resources.food < 110) weights.food += 0.26;
  if (resources.wood < 110) weights.wood += 0.22;
  if (resources.gold < 70 && workerCount >= 4) weights.gold += 0.18;
  if (age >= 2 && resources.stone < 60 && workerCount >= 7) weights.stone += 0.1;

  const totalW = weights.food + weights.wood + weights.gold + weights.stone;
  const types: ResourceType[] = ['food', 'wood', 'gold', 'stone'];
  const remainders: Array<{ type: ResourceType; rem: number }> = [];
  let assigned = 0;

  for (const t of types) {
    const exact = (weights[t] / totalW) * workerCount;
    const floored = Math.floor(exact);
    result[t] = floored;
    assigned += floored;
    remainders.push({ type: t, rem: exact - floored });
  }

  remainders.sort((a, b) => b.rem - a.rem);
  for (let i = 0; i < workerCount - assigned; i++) {
    result[remainders[i % remainders.length].type]++;
  }

  // Guarantee at least 1 food worker whenever AI has >= 2 workers and food isn't overflowing
  if (workerCount >= 2 && result.food === 0 && resources.food < 1600) {
    const donor = (['stone', 'gold', 'wood'] as ResourceType[]).find((t) => result[t] > 0);
    if (donor) {
      result[donor]--;
      result.food++;
    }
  }

  return result;
}

/**
 * 2D Euclidean distance.
 */
export function getDistance(x1: number, z1: number, x2: number, z2: number): number {
  const dx = x2 - x1;
  const dz = z2 - z1;
  return Math.sqrt(dx * dx + dz * dz);
}

export const FOOD_GATHER_MULTIPLIERS: Record<string, number> = {
  deep_fish: 1.55,
  shore_fish: 1.32,
  hunt: 1.15,
  berry: 1.0,
  farm: 1.0,
  food: 1.0,
};

export const FOOD_SOURCE_PRIORITY: Record<string, number> = {
  deep_fish: 5,
  shore_fish: 4,
  hunt: 3,
  berry: 2,
  farm: 2,
  food: 1,
};

export function getFoodGatherMultiplier(subtype?: ResourceNode['subtype'] | string): number {
  return FOOD_GATHER_MULTIPLIERS[subtype || 'farm'] ?? 1.0;
}

export function getFoodSourcePriority(subtype?: ResourceNode['subtype'] | string): number {
  return FOOD_SOURCE_PRIORITY[subtype || 'farm'] ?? 1;
}

/**
 * Finds closest resource node of a given type with remaining resources.
 */
export function findClosestResourceNode(
  x: number,
  z: number,
  nodes: ResourceNode[],
  type?: ResourceType,
  maxDistance = Infinity
): ResourceNode | null {
  let closest: ResourceNode | null = null;
  let minDistance = maxDistance;

  for (const node of nodes) {
    if (node.amount <= 0) continue;
    if (type && node.resourceType !== type) continue;
    const dist = getDistance(x, z, node.x, node.z);
    if (dist < minDistance) {
      minDistance = dist;
      closest = node;
    }
  }
  return closest;
}

/**
 * Enforces land vs naval gathering rules:
 * - Land villagers CANNOT harvest offshore `deep_fish`.
 * - Naval Fishing Boats can harvest both `deep_fish` and `shore_fish`, and cannot harvest land nodes.
 */
export function canUnitGatherNode(
  unitDef: Pick<UnitDefinition, 'id' | 'category' | 'isNaval'>,
  node: Pick<ResourceNode, 'resourceType' | 'subtype'>
): boolean {
  const isBoat = !!unitDef.isNaval || unitDef.id === 'fishing_boat';
  if (isBoat) {
    return node.resourceType === 'food' && (node.subtype === 'deep_fish' || node.subtype === 'shore_fish');
  }
  if (node.subtype === 'deep_fish') {
    return false;
  }
  return true;
}

/**
 * Selects optimal available food node balancing meat/fish gather speed priority (deep_fish > shore_fish > hunt > berry = farm)
 * against travel distance within maxDistance. Land harvesters automatically exclude `deep_fish`.
 */
export function findBestFoodResourceNode(
  x: number,
  z: number,
  nodes: ResourceNode[],
  maxDistance = 36,
  allowDeepFish = false,
  fishOnly = false
): ResourceNode | null {
  let best: ResourceNode | null = null;
  let bestScore = -Infinity;

  for (const node of nodes) {
    if (node.amount <= 0 || node.resourceType !== 'food') continue;
    if (!allowDeepFish && node.subtype === 'deep_fish') continue;
    if (fishOnly && node.subtype !== 'deep_fish' && node.subtype !== 'shore_fish') continue;
    const dist = getDistance(x, z, node.x, node.z);
    if (dist >= maxDistance) continue;
    const prio = getFoodSourcePriority(node.subtype);
    const score = prio * 16 - dist;
    if (score > bestScore) {
      bestScore = score;
      best = node;
    }
  }
  return best;
}

export const DEFAULT_PARTICIPANT_PALETTE: Array<{
  colorHex: number;
  colorCss: string;
  accentHex: number;
}> = [
  { colorHex: 0x2563eb, colorCss: '#3b82f6', accentHex: 0x60a5fa }, // Royal Blue
  { colorHex: 0xdc2626, colorCss: '#ef4444', accentHex: 0xf87171 }, // Crimson Red
  { colorHex: 0x059669, colorCss: '#10b981', accentHex: 0x34d399 }, // Emerald Green
  { colorHex: 0xd97706, colorCss: '#f59e0b', accentHex: 0xfbbf24 }, // Amber Gold
  { colorHex: 0x7c3aed, colorCss: '#8b5cf6', accentHex: 0xa78bfa }, // Royal Violet
  { colorHex: 0x0891b2, colorCss: '#06b6d4', accentHex: 0x22d3ee }, // Teal Cyan
];

export function createDefaultParticipants(): MatchParticipant[] {
  return [
    {
      id: 'player',
      name: '玩家勢力',
      controller: 'player',
      team: 1,
      civilization: 'medieval',
      ...DEFAULT_PARTICIPANT_PALETTE[0],
    },
    {
      id: 'enemy',
      name: '電腦 AI 2',
      controller: 'ai',
      team: 2,
      civilization: 'anime',
      aiPersonality: 'standard',
      ...DEFAULT_PARTICIPANT_PALETTE[1],
    },
  ];
}

/**
 * Generates distinct, evenly-spaced starting positions around an enlarged tactical ring on the map.
 */
export function generateSpawnPositions(
  count: number,
  radius = 58
): Array<{ x: number; z: number }> {
  if (count <= 0) return [];
  if (count === 2) {
    // Classic diagonal opposition (-46, -40) vs (46, 40) with wide room for outside-TC mines
    return [
      { x: -46, z: -40 },
      { x: 46, z: 40 },
    ];
  }
  const positions: Array<{ x: number; z: number }> = [];
  const startAngle = (-3 * Math.PI) / 4; // Bottom-left / north-west classic camera anchor for slot 0
  for (let i = 0; i < count; i++) {
    const angle = startAngle + (i / count) * Math.PI * 2;
    positions.push({
      x: Math.round(Math.cos(angle) * radius),
      z: Math.round(Math.sin(angle) * radius),
    });
  }
  return positions;
}

/**
 * Returns true if two entities are hostile (different teams and neither is neutral).
 */
export function areHostile(
  a: { faction: FactionId; team?: number },
  b: { faction: FactionId; team?: number }
): boolean {
  if (a.faction === 'neutral' || b.faction === 'neutral') return false;
  if (a.team !== undefined && b.team !== undefined) {
    return a.team !== b.team;
  }
  return a.faction !== b.faction;
}

/**
 * Returns true when a match has zero human players (All-AI spectator battle).
 */
export function isAllAiMatch(participants: MatchParticipant[]): boolean {
  return participants.length > 0 && !participants.some((p) => p.controller === 'player');
}

export interface MatchWinnerSummary {
  team: number;
  factionIds: string[];
  names: string[];
}

export interface MatchOutcome {
  isOver: boolean;
  result?: 'victory' | 'defeat';
  winner?: MatchWinnerSummary | null;
}

/**
 * Pure victory/defeat & all-AI spectator match outcome resolver.
 */
export function resolveMatchOutcome(
  participants: MatchParticipant[],
  units: Array<Pick<UnitEntity, 'faction' | 'team' | 'hp' | 'unitDef'>>,
  buildings: Array<Pick<BuildingEntity, 'faction' | 'team' | 'hp' | 'buildingType'>>
): MatchOutcome {
  const allAi = isAllAiMatch(participants);
  const aliveByFaction = new Map<string, boolean>();

  for (const b of buildings) {
    if (b.hp > 0 && b.buildingType === 'town_center') {
      aliveByFaction.set(b.faction, true);
    }
  }
  for (const u of units) {
    if (u.hp > 0 && (u.unitDef.category !== 'worker' || allAi)) {
      if (u.unitDef.category !== 'worker') {
        aliveByFaction.set(u.faction, true);
      }
    }
  }

  if (allAi) {
    // A faction also survives while it has workers AND any building, or a TC, or military units
    for (const p of participants) {
      if (aliveByFaction.get(p.id)) continue;
      const hasAnyBldg = buildings.some((b) => b.faction === p.id && b.hp > 0);
      const hasAnyUnit = units.some((u) => u.faction === p.id && u.hp > 0);
      if (hasAnyBldg && hasAnyUnit) aliveByFaction.set(p.id, true);
    }

    const aliveTeams = new Set<number>();
    for (const p of participants) {
      if (aliveByFaction.get(p.id)) aliveTeams.add(p.team);
    }

    if (aliveTeams.size <= 1) {
      const winTeam = aliveTeams.size === 1 ? Array.from(aliveTeams)[0] : participants[0]?.team ?? 1;
      const teamParticipants = participants.filter((p) => p.team === winTeam);
      return {
        isOver: true,
        result: 'victory',
        winner: {
          team: winTeam,
          factionIds: teamParticipants.map((p) => p.id),
          names: teamParticipants.map((p) => p.name),
        },
      };
    }
    return { isOver: false };
  }

  const human = participants.find((p) => p.controller === 'player') || participants[0];
  const humanHasTc = buildings.some(
    (b) => b.faction === human.id && b.hp > 0 && b.buildingType === 'town_center'
  );
  const humanHasUnits = units.some((u) => u.faction === human.id && u.hp > 0);

  if (!humanHasTc && !humanHasUnits) {
    const enemyTeam = participants.find((p) => p.team !== human.team)?.team ?? 2;
    const winners = participants.filter((p) => p.team === enemyTeam);
    return {
      isOver: true,
      result: 'defeat',
      winner: {
        team: enemyTeam,
        factionIds: winners.map((p) => p.id),
        names: winners.map((p) => p.name),
      },
    };
  }

  const anyHostileAlive =
    buildings.some(
      (b) =>
        b.hp > 0 &&
        b.buildingType === 'town_center' &&
        areHostile({ faction: human.id, team: human.team }, b)
    ) ||
    units.some(
      (u) =>
        u.hp > 0 &&
        u.unitDef.category !== 'worker' &&
        areHostile({ faction: human.id, team: human.team }, u)
    );

  if (!anyHostileAlive) {
    const winners = participants.filter((p) => p.team === human.team);
    return {
      isOver: true,
      result: 'victory',
      winner: {
        team: human.team,
        factionIds: winners.map((p) => p.id),
        names: winners.map((p) => p.name),
      },
    };
  }

  return { isOver: false };
}

/**
 * Finds closest hostile entity.
 */
export function findClosestEnemy<T extends EntityCommon>(
  x: number,
  z: number,
  myFaction: FactionId,
  entities: T[],
  maxRange = Infinity,
  myTeam?: number
): T | null {
  let closest: T | null = null;
  let minDistance = maxRange;

  const selfRef = { faction: myFaction, team: myTeam };
  for (const ent of entities) {
    if (!areHostile(selfRef, ent)) continue;
    if (ent.hp <= 0) continue;
    if ((ent as unknown as Partial<UnitEntity>).garrisonedInBuildingId) continue;
    const dist = getDistance(x, z, ent.x, ent.z);
    if (dist < minDistance) {
      minDistance = dist;
      closest = ent;
    }
  }
  return closest;
}

// ------------------ TACTICAL 1v1 COUNTER & CLUSTER TARGETING ------------------

export interface CombatTargetContext {
  defendAnchor?: { x: number; z: number; radius?: number } | null;
  clusterFocusTargetId?: string | null;
  maxSearchRange?: number;
}

const DEFENSIVE_BUILDING_TYPES = new Set([
  'tower',
  'castle',
  'town_center',
  'landmark_citadel',
  'landmark_arsenal',
  'landmark_barracks',
]);

const MILITARY_BUILDING_TYPES = new Set([
  'barracks',
  'archery_range',
  'armory_forge',
  'spirit_shrine',
  'mana_well',
]);

/**
 * Scores how suitable a hostile unit or building is as a 1v1 matchup or focus-fire target
 * for `attacker`. Higher score = better tactical choice.
 */
export function scoreUnitMatchupTarget(
  attacker: UnitEntity,
  target: UnitEntity | BuildingEntity,
  alliedUnits: UnitEntity[] = [],
  context: CombatTargetContext = {}
): number {
  const dist = getDistance(attacker.x, attacker.z, target.x, target.z);
  const attackerCat = attacker.unitDef.category;
  const isFastFlanker = attackerCat === 'cavalry' || attacker.unitDef.stats.speed >= 4.8;
  const isSiege = attackerCat === 'siege' || attacker.unitDefId === 'fantasy_treant';
  const hpRatio = Math.max(0, Math.min(1, target.hp / Math.max(1, target.maxHp)));

  let score = 0;

  // 1. Finisher incentive: finish low-HP targets faster to reduce incoming enemy DPS
  score += (1 - hpRatio) * 30;

  // 2. Squad focus-fire / cluster incentive
  if (context.clusterFocusTargetId && context.clusterFocusTargetId === target.id) {
    score += attackerCat === 'ranged' || attackerCat === 'siege' ? 42 : 24;
  }

  let alliesOnSameTarget = 0;
  for (const ally of alliedUnits) {
    if (
      ally.id !== attacker.id &&
      ally.hp > 0 &&
      ally.faction === attacker.faction &&
      ally.targetEntityId === target.id &&
      getDistance(attacker.x, attacker.z, ally.x, ally.z) <= 16
    ) {
      alliesOnSameTarget++;
    }
  }
  if (attackerCat === 'ranged') {
    score += Math.min(4, alliesOnSameTarget) * 10; // ranged units stack focus-fire cleanly without blocking!
  } else if (attackerCat === 'melee' || attackerCat === 'cavalry') {
    // First 2 melee allies focusing is great; >= 4 causes pathing congestion around 1 small unit
    if (alliesOnSameTarget > 0 && alliesOnSameTarget <= 2) score += 8;
    else if (target.type === 'unit' && alliesOnSameTarget >= 4) score -= 22;
  }

  // 3. Base defense priority: enemies threatening allied structures/workers get top priority
  if (context.defendAnchor) {
    const anchorRadius = context.defendAnchor.radius ?? 22;
    const distToAnchor = getDistance(target.x, target.z, context.defendAnchor.x, context.defendAnchor.z);
    if (distToAnchor <= anchorRadius) {
      score += 58 - distToAnchor * 0.8;
    }
  }

  // 4. Role vs Target Counter Matrix (1v1 optimal matchup)
  if (target.type === 'unit') {
    const tUnit = target as UnitEntity;
    const tCat = tUnit.unitDef.category;

    if (isSiege) {
      // Siege prefers hitting clustered slow frontline or defensive fortifications over chasing fast flankers
      score += tCat === 'siege' ? 12 : tCat === 'cavalry' ? -15 : 6;
    } else if (isFastFlanker) {
      // Cavalry & agile ninjas counter backline archers, mages, siege engines & exposed workers
      if (tCat === 'ranged' || tCat === 'siege') score += 55;
      else if (tCat === 'worker') score += 32;
      else if (tCat === 'melee') score += 16;
      else score += 12;
    } else if (attackerCat === 'ranged') {
      // Ranged counters approaching melee & fragile high-DPS enemies while staying safe
      if (tCat === 'melee' || tCat === 'cavalry') score += 46;
      else if (tCat === 'ranged') score += 38;
      else if (tCat === 'siege') score += 28;
      else score += 12;

      // Immediate danger bonus if enemy is closing inside attacker's comfort range
      if (dist <= attacker.unitDef.stats.range + 2) score += 16;
    } else {
      // Frontline Melee intercepts enemy melee, cavalry, ranged threats; deprioritizes chasing buildings
      if (tCat === 'cavalry' || tCat === 'melee') score += 48;
      else if (tCat === 'ranged' || tCat === 'siege') score += 44;
      else if (tCat === 'worker') score += 18;
    }
  } else {
    const tBldg = target as BuildingEntity;
    const isDefensiveBldg = DEFENSIVE_BUILDING_TYPES.has(tBldg.buildingType);
    const isMilitaryBldg = MILITARY_BUILDING_TYPES.has(tBldg.buildingType);

    if (isSiege) {
      // Siege specializes in flattening towers, castles & TCs
      if (isDefensiveBldg) score += 95;
      else if (isMilitaryBldg) score += 62;
      else score += 38;
    } else {
      // Combat troops prefer killing hostile troops & towers before swinging at farms/houses
      if (isDefensiveBldg) score += 12;
      else if (isMilitaryBldg) score += 4;
      else score -= 35; // Avoid wasting DPS on a Farm while enemy army is nearby!
    }
  }

  // 5. Distance decay (ranged/siege care slightly less about extra steps within weapon range)
  const effectiveRange = Math.max(0, dist - (target.type === 'building' ? 2.5 : 0.5));
  const inRangeDiscount = effectiveRange <= attacker.unitDef.stats.range ? 0.5 : 1.0;
  const distWeight = isSiege ? 1.5 : isFastFlanker ? 1.8 : 2.3;
  score -= effectiveRange * distWeight * inRangeDiscount;

  return score;
}

/**
 * Selects the single highest-value combat target for an individual unit using 1v1 counter scoring.
 */
export function selectOptimalCombatTarget(
  attacker: UnitEntity,
  hostileUnits: UnitEntity[],
  hostileBuildings: BuildingEntity[] = [],
  alliedUnits: UnitEntity[] = [],
  context: CombatTargetContext = {}
): UnitEntity | BuildingEntity | null {
  const maxRange = context.maxSearchRange ?? Infinity;
  const selfRef = { faction: attacker.faction, team: attacker.team };

  let bestTarget: UnitEntity | BuildingEntity | null = null;
  let bestScore = -Infinity;

  for (const u of hostileUnits) {
    if (u.hp <= 0 || u.garrisonedInBuildingId || !areHostile(selfRef, u)) continue;
    const d = getDistance(attacker.x, attacker.z, u.x, u.z);
    if (d > maxRange) continue;
    const s = scoreUnitMatchupTarget(attacker, u, alliedUnits, context);
    if (s > bestScore) {
      bestScore = s;
      bestTarget = u;
    }
  }

  for (const b of hostileBuildings) {
    if (b.hp <= 0 || !areHostile(selfRef, b)) continue;
    const d = getDistance(attacker.x, attacker.z, b.x, b.z);
    if (d > maxRange) continue;
    const s = scoreUnitMatchupTarget(attacker, b, alliedUnits, context);
    if (s > bestScore) {
      bestScore = s;
      bestTarget = b;
    }
  }

  return bestTarget;
}

/**
 * Picks a coordinated cluster focus-fire target for an entire squad based on squad centroid,
 * enemy concentration, threat priority, and siege fortifications.
 */
export function selectClusterFocusTarget(
  squadUnits: UnitEntity[],
  hostileUnits: UnitEntity[],
  hostileBuildings: BuildingEntity[] = [],
  options: { maxEnemyRangeFromCentroid?: number; defendAnchor?: { x: number; z: number; radius?: number } | null } = {}
): UnitEntity | BuildingEntity | null {
  if (squadUnits.length === 0) return null;
  const cx = squadUnits.reduce((s, u) => s + u.x, 0) / squadUnits.length;
  const cz = squadUnits.reduce((s, u) => s + u.z, 0) / squadUnits.length;
  const maxRange = options.maxEnemyRangeFromCentroid ?? 26;
  const rep = squadUnits[0];
  const selfRef = { faction: rep.faction, team: rep.team };

  let bestTarget: UnitEntity | BuildingEntity | null = null;
  let bestScore = -Infinity;

  for (const u of hostileUnits) {
    if (u.hp <= 0 || u.garrisonedInBuildingId || !areHostile(selfRef, u)) continue;
    const d = getDistance(cx, cz, u.x, u.z);
    if (d > maxRange) continue;

    let clusterValue = 45;
    if (u.unitDef.category === 'ranged' || u.unitDef.category === 'siege') clusterValue += 28;
    else if (u.unitDef.category !== 'worker') clusterValue += 18;
    // Focus wounded priority enemies & enemies near allied defenses
    clusterValue += (1 - Math.max(0, u.hp / Math.max(1, u.maxHp))) * 35;
    if (options.defendAnchor && getDistance(u.x, u.z, options.defendAnchor.x, options.defendAnchor.z) <= (options.defendAnchor.radius ?? 22)) {
      clusterValue += 40;
    }
    clusterValue -= d * 1.4;

    if (clusterValue > bestScore) {
      bestScore = clusterValue;
      bestTarget = u;
    }
  }

  if (bestTarget) return bestTarget;

  for (const b of hostileBuildings) {
    if (b.hp <= 0 || !areHostile(selfRef, b)) continue;
    const d = getDistance(cx, cz, b.x, b.z);
    let bScore = DEFENSIVE_BUILDING_TYPES.has(b.buildingType) ? 60 : MILITARY_BUILDING_TYPES.has(b.buildingType) ? 35 : 10;
    bScore += (1 - Math.max(0, b.hp / Math.max(1, b.maxHp))) * 25;
    bScore -= d * 0.9;
    if (bScore > bestScore) {
      bestScore = bScore;
      bestTarget = b;
    }
  }

  return bestTarget;
}

// ------------------ AUDIO, LOCOMOTION & BUILDING VISUAL STATE HELPERS ------------------

/**
 * Computes smooth spatial audio attenuation [0..1] based on distance from the camera listener.
 * Returns 0 outside maxHearingRange so distant off-screen skirmishes never saturate audio voices.
 */
export function computeSpatialAudioGain(
  distToListener: number,
  maxHearingRange = 42
): number {
  if (!Number.isFinite(distToListener) || distToListener < 0) return 1;
  if (maxHearingRange <= 0 || distToListener >= maxHearingRange) return 0;
  const normalized = Math.max(0, Math.min(1, distToListener / maxHearingRange));
  // Gentle quadratic-cosine rolloff: full clarity near focus, smooth fade toward screen edges
  const falloff = Math.pow(1 - normalized, 1.55);
  return +Math.max(0, Math.min(1, falloff)).toFixed(4);
}

export interface BuildingVisualState {
  stage: 1 | 2 | 3 | 4; // 1=foundation/scaffold, 2=walls framing, 3=roof/details, 4=completed
  tier1Reveal: number; // 0..1 grounded base plinth
  tier2Reveal: number; // 0..1 main structural walls
  tier3Reveal: number; // 0..1 roofs, turrets, finials
  showScaffold: boolean;
  scaffoldHeightScale: number;
  hpRatio: number;
  damageSeverity: number; // 0 (healthy) -> 1 (critically wrecked)
  isSmoking: boolean;
  isBurning: boolean;
  sagTiltRad: number;
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/**
 * Pure state mapper for staged building construction (avoiding whole-mesh Y stretching/floating)
 * and progressive structural damage (scorching, smoke, fire, slight structural tilt).
 */
export function computeBuildingVisualState(
  isConstructed: boolean,
  buildProgress: number,
  hp: number,
  maxHp: number
): BuildingVisualState {
  const p = isConstructed ? 1 : clamp01(buildProgress);
  const hpRatio = clamp01(hp / Math.max(1, maxHp));

  const stage: 1 | 2 | 3 | 4 = isConstructed || p >= 1
    ? 4
    : p < 0.34
    ? 1
    : p < 0.72
    ? 2
    : 3;

  // Staged vertical emergence per architectural tier (grounded from base upward)
  const tier1Reveal = isConstructed ? 1 : clamp01(0.32 + (p / 0.3) * 0.68);
  const tier2Reveal = isConstructed ? 1 : clamp01((p - 0.2) / 0.5);
  const tier3Reveal = isConstructed ? 1 : clamp01((p - 0.62) / 0.36);

  const showScaffold = !isConstructed && p < 0.99;
  const scaffoldHeightScale = p < 0.88
    ? 0.48 + 0.52 * clamp01(p / 0.78)
    : Math.max(0.2, 1 - ((p - 0.88) / 0.12) * 0.8);

  const damageSeverity = isConstructed && hpRatio < 0.78
    ? clamp01((0.78 - hpRatio) / 0.78)
    : 0;

  return {
    stage,
    tier1Reveal,
    tier2Reveal,
    tier3Reveal,
    showScaffold,
    scaffoldHeightScale,
    hpRatio,
    damageSeverity,
    isSmoking: isConstructed && hpRatio > 0 && hpRatio < 0.72,
    isBurning: isConstructed && hpRatio > 0 && hpRatio < 0.38,
    sagTiltRad: isConstructed && hpRatio > 0 && hpRatio < 0.45
      ? ((0.45 - hpRatio) / 0.45) * 0.048
      : 0,
  };
}

/**
 * Computes exact stride phase increment (in radians) locked to horizontal ground displacement,
 * so feet plant naturally onto terrain at every movement speed without ice-skating.
 */
export function computeStridePhaseDelta(
  distMoved: number,
  unitScale = 1,
  isMounted = false
): number {
  if (!Number.isFinite(distMoved) || distMoved <= 0) return 0;
  const safeScale = Math.max(0.5, unitScale || 1);
  // Full gait cycle (2*PI) covers ~0.92m on foot or ~1.55m for a galloping mount
  const fullCycleDist = (isMounted ? 1.55 : 0.92) * safeScale;
  const delta = (distMoved / fullCycleDist) * (Math.PI * 2);
  return Math.min(1.15, delta);
}



/** Star-oath comet: one relic per match, a choice between home buff and instant shrine claim. */
export type StarRelicPhase = 'waiting' | 'ground' | 'carried' | 'spent';

export const STAR_RELIC_FALL_AT = 72;
export const STAR_RELIC_CHANNEL_SEC = 5.5;
export const STAR_RELIC_PICKUP_RANGE = 2.15;
export const STAR_RELIC_OATH_SEC = 75;
export const STAR_RELIC_CARRY_SPEED = 0.78;
export const STAR_RELIC_OATH_GATHER = 1.2;

export function starRelicShouldFall(simTime: number, phase: StarRelicPhase): boolean {
  return phase === 'waiting' && simTime >= STAR_RELIC_FALL_AT;
}

/** Channel builds while a worker stands on the comet; decays if they step away. */
export function advanceStarRelicChannel(channel: number, inRange: boolean, dt: number): number {
  if (dt <= 0) return channel;
  if (!inRange) return Math.max(0, channel - dt * 1.6);
  return channel + dt;
}

export function starRelicChannelComplete(channel: number): boolean {
  return channel >= STAR_RELIC_CHANNEL_SEC;
}

/** Prefer a landing that is not inside any player's spawn courtyard. */
export function pickStarRelicSite(
  rand: () => number,
  avoid: Array<{ x: number; z: number }>
): { x: number; z: number } {
  for (let i = 0; i < 28; i++) {
    const x = (rand() - 0.5) * 110;
    const z = (rand() - 0.5) * 110;
    const clear = avoid.every((a) => Math.hypot(a.x - x, a.z - z) > 20);
    if (clear) return { x, z };
  }
  return { x: 0, z: 8 };
}

export type StarRelicDelivery = 'oath' | 'shrine' | 'none';

export function resolveStarRelicDelivery(opts: {
  carrierX: number;
  carrierZ: number;
  townCenterX: number;
  townCenterZ: number;
  shrine?: { x: number; z: number; radius: number; ownerFaction: string; carrierFaction: string } | null;
}): StarRelicDelivery {
  if (
    opts.shrine &&
    opts.shrine.ownerFaction !== opts.shrine.carrierFaction &&
    Math.hypot(opts.carrierX - opts.shrine.x, opts.carrierZ - opts.shrine.z) <= opts.shrine.radius + 0.4
  ) {
    return 'shrine';
  }
  if (Math.hypot(opts.carrierX - opts.townCenterX, opts.carrierZ - opts.townCenterZ) <= 4.2) {
    return 'oath';
  }
  return 'none';
}
