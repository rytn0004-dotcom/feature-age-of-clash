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
  ContestedPoint,
  TechDefinition,
  UnitCategory,
} from '../types/game';
import { findTechDef, getResourceGatherTechMultiplier } from './civilizations';

export const FIELD_RAM_TECH_ID = 'shared_field_engineering';
export const FIELD_RAM_REQUIRED_INFANTRY = 4;
export const FIELD_RAM_COST: Resources = { food: 0, wood: 140, gold: 60, stone: 0 };

export const WALL_REPAIR_COST: Resources = { food: 0, wood: 12, gold: 0, stone: 5 };

/**
 * AI combat units withdraw to friendly garrisons when critically damaged.
 * Ranged troops are protected earlier; siege engines and workers use their
 * own specialist survival/economy routines and are deliberately excluded.
 */
export function shouldAiUnitSeekShelter(
  hp: number,
  maxHp: number,
  category: UnitCategory,
  personality: 'easy' | 'standard' | 'hard' | 'defensive' = 'standard'
): boolean {
  if (
    category === 'worker' ||
    category === 'siege' ||
    !Number.isFinite(hp) ||
    !Number.isFinite(maxHp) ||
    maxHp <= 0
  ) {
    return false;
  }

  const roleThreshold: Partial<Record<UnitCategory, number>> = {
    melee: 0.28,
    ranged: 0.38,
    cavalry: 0.32,
    special: 0.34,
  };
  const personalityScale = personality === 'defensive'
    ? 1.3
    : personality === 'hard'
      ? 0.88
      : personality === 'easy'
        ? 0.82
        : 1;

  return Math.max(0, hp) / maxHp <= (roleThreshold[category] || 0.3) * personalityScale;
}

/** Workers resume their economy immediately; military units stay sheltered until recovered. */
export function shouldAiUnitLeaveShelter(
  hp: number,
  maxHp: number,
  category: UnitCategory,
  recoveryRatio = 0.72
): boolean {
  if (category === 'worker') return true;
  if (!Number.isFinite(hp) || !Number.isFinite(maxHp) || maxHp <= 0) return false;
  const threshold = Number.isFinite(recoveryRatio)
    ? Math.max(0, Math.min(1, recoveryRatio))
    : 0.72;
  return Math.max(0, hp) / maxHp >= threshold;
}
export const WALL_BREACH_HP_RATIO = 0.32;
export const WALL_TOWER_LINK_RANGE = 5.8;

/** A siege hit opens a repairable breach once a wall segment falls below its structural threshold. */
export function shouldBreachWallAfterSiegeHit(
  building: Pick<BuildingEntity, 'buildingDef' | 'hp' | 'maxHp' | 'wallBreached'>
): boolean {
  return (
    !!building.buildingDef.isWall &&
    !building.wallBreached &&
    building.hp > 0 &&
    building.hp <= building.maxHp * WALL_BREACH_HP_RATIO
  );
}

/** A completed friendly watchtower reinforces nearby wall sections and gates. */
export function isWallLinkedToTower(
  wall: Pick<BuildingEntity, 'buildingType' | 'buildingDef' | 'faction' | 'x' | 'z' | 'hp' | 'isConstructed' | 'wallBreached' | 'gateOpen'>,
  buildings: readonly Pick<BuildingEntity, 'buildingType' | 'faction' | 'x' | 'z' | 'hp' | 'isConstructed'>[]
): boolean {
  if (!wall.buildingDef.isWall || wall.hp <= 0 || !wall.isConstructed || wall.wallBreached || (wall.buildingType === 'gate' && wall.gateOpen)) return false;
  return buildings.some(
    (building) =>
      building.buildingType === 'tower' &&
      building.faction === wall.faction &&
      building.hp > 0 &&
      building.isConstructed &&
      getDistance(wall.x, wall.z, building.x, building.z) <= WALL_TOWER_LINK_RANGE
  );
}

export const WALL_SEGMENT_SPACING = 2.7;

export interface WallChainPoint {
  x: number;
  z: number;
}

export interface WallSegmentPlacement extends WallChainPoint {
  rotationY: number;
  sectionIndex: number;
}

/**
 * Converts clicked wall corners into oriented modular wall pieces.
 * Each section is evenly subdivided so the 2.85-unit wall mesh slightly overlaps its neighbours.
 */
export function layoutWallChain(
  points: readonly WallChainPoint[],
  maxSpacing = WALL_SEGMENT_SPACING
): WallSegmentPlacement[] {
  if (points.length < 2 || !Number.isFinite(maxSpacing) || maxSpacing <= 0) return [];

  const placements: WallSegmentPlacement[] = [];
  for (let sectionIndex = 0; sectionIndex < points.length - 1; sectionIndex++) {
    const start = points[sectionIndex];
    const end = points[sectionIndex + 1];
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const length = Math.hypot(dx, dz);
    if (!Number.isFinite(length) || length < 0.75) continue;

    const count = Math.max(1, Math.ceil(length / maxSpacing));
    const rotationY = -Math.atan2(dz, dx);
    for (let index = 0; index < count; index++) {
      const t = (index + 0.5) / count;
      placements.push({
        x: start.x + dx * t,
        z: start.z + dz * t,
        rotationY,
        sectionIndex,
      });
    }
  }
  return placements;
}

/** Wall costs scale by the number of modular segments, not by the number of clicks. */
export function calculateWallChainCost(segmentCount: number, costPerSegment: Resources): Resources {
  const count = Math.max(0, Math.floor(Number.isFinite(segmentCount) ? segmentCount : 0));
  return {
    food: (costPerSegment.food || 0) * count,
    wood: (costPerSegment.wood || 0) * count,
    gold: (costPerSegment.gold || 0) * count,
    stone: (costPerSegment.stone || 0) * count,
  };
}

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

/** Shared age gate used by player, AI, construction and unit production paths. */
export function isAgeUnlocked(requiredAge: AgeLevel | undefined, currentAge: AgeLevel | number): boolean {
  return requiredAge === undefined || currentAge >= requiredAge;
}

/** Centralized field-ram requirements shared by gameplay and the HUD. */
export function canAssembleFieldRam(
  currentAge: AgeLevel | number,
  researchedTechIds: readonly string[],
  eligibleInfantryCount: number,
  resources: Resources
): { ok: boolean; reason?: string } {
  if (!isAgeUnlocked(2, currentAge)) {
    return { ok: false, reason: '🔒 野戰工程隊需要時代 II' };
  }
  if (!researchedTechIds.includes(FIELD_RAM_TECH_ID)) {
    return { ok: false, reason: '🔒 請先在兵營研發「野戰工程隊」' };
  }
  if (eligibleInfantryCount < FIELD_RAM_REQUIRED_INFANTRY) {
    return { ok: false, reason: '🪵 野外組裝衝車至少需要 4 名可調度的近戰步兵' };
  }
  if (!canAfford(resources, FIELD_RAM_COST)) {
    return { ok: false, reason: '⚠️ 野戰衝車需要 140 木材與 60 黃金' };
  }
  return { ok: true };
}

export interface AiFieldEngineeringReadiness {
  age: number;
  researched: boolean;
  researchInProgress: boolean;
  meleeUnitCount: number;
  hasAvailableBarracks: boolean;
  prerequisitesMet: boolean;
  resources: Resources;
  reserveFood: number;
  reserveGold: number;
  techCost: Resources;
}

/** Maps the generic AI "knight" request to an actual cavalry unit in every civilization. */
export function resolveAiKnightUnitId(civilizationId: string): string {
  if (civilizationId === 'anime') return 'scout_rider';
  if (civilizationId === 'fantasy') return 'fantasy_paladin';
  return 'knight';
}

/** Prioritizes the Age II field-engineering unlock over optional research once the AI can afford it safely. */
export function shouldPrioritizeAiFieldEngineering(input: AiFieldEngineeringReadiness): boolean {
  if (
    input.age < 2 ||
    input.researched ||
    input.researchInProgress ||
    input.meleeUnitCount < FIELD_RAM_REQUIRED_INFANTRY ||
    !input.hasAvailableBarracks ||
    !input.prerequisitesMet
  ) {
    return false;
  }

  const spendable: Resources = {
    ...input.resources,
    food: Math.max(0, input.resources.food - input.reserveFood),
    gold: Math.max(0, input.resources.gold - input.reserveGold),
  };
  return canAfford(spendable, input.techCost);
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
 * Unit-vs-unit damage factoring in category counter bonuses (e.g. anti-cavalry pikes, anti-ranged flanking)
 * and bonus ranged pierce defense (so battered siege rams & shieldwalls resist arrow fire).
 */
export function getUnitVsUnitDamage(
  attackerAttack: number,
  defender: Pick<UnitEntity, 'unitDef' | 'buffSpeedUntil' | 'buffDefenseBonus'>,
  isRangedProjectile = false,
  currentSimTime = 0,
  attackerBonusVsCategory?: Partial<Record<UnitCategory, number>>
): number {
  const buffDef =
    defender.buffSpeedUntil && defender.buffSpeedUntil > currentSimTime
      ? defender.buffDefenseBonus || 0
      : 0;
  const pierceArmor = isRangedProjectile ? defender.unitDef.stats.rangedDefense || 0 : 0;
  const counterBonus = attackerBonusVsCategory?.[defender.unitDef.category] || 0;
  const totalDef = (defender.unitDef.stats.defense || 0) + buffDef + pierceArmor;
  return calculateDamage(attackerAttack + counterBonus, totalDef);
}

/**
 * Returns effective building armor considering base armor, Age era reinforcement, and defensive techs.
 */
export function getEffectiveBuildingArmor(
  building: Pick<BuildingEntity, 'buildingDef' | 'buildingType' | 'wallTowerLinked'>,
  defenderAge = 1,
  defenderTechIds: string[] = []
): number {
  const baseArmor = building.buildingDef.buildingArmor ?? 5;
  const ageBonus = Math.max(0, defenderAge - 1) * 2;
  let techBonus = 0;
  for (const tId of defenderTechIds) {
    const tech = findTechDef(tId);
    if (tech?.effect.buildingArmorBonus) {
      techBonus += tech.effect.buildingArmorBonus;
    }
  }
  const towerLinkBonus = building.wallTowerLinked ? 4 : 0;
  return baseArmor + ageBonus + techBonus + towerLinkBonus;
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

  let arrowSlitsRangeBonus = 0;
  let arrowSlitsRateMult = 1;
  let murderHolesBonus = 0;
  for (const tId of defenderTechIds) {
    const tech = findTechDef(tId);
    if (!tech) continue;
    if (tech.effect.towerRangeBonus) arrowSlitsRangeBonus += tech.effect.towerRangeBonus;
    if (tech.effect.towerAttackRateMultiplier) arrowSlitsRateMult *= tech.effect.towerAttackRateMultiplier;
    if (mannedCount > 0 && tech.effect.garrisonAttackBonus) {
      murderHolesBonus += tech.effect.garrisonAttackBonus;
    }
  }

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
  meleeCount?: number;
  rangedCount?: number;
  cavalryCount?: number;
  siegeCount?: number;
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

  // Reserve a gradual share of labor for the next age instead of waiting for
  // food/gold to fall below tiny emergency thresholds. The boost fades to zero
  // as each age-up resource target is reached, preventing post-upgrade hoarding.
  const nextAgeCost =
    age < 2
      ? { food: 400, gold: 200 }
      : age < 3
      ? { food: 1200, gold: 600 }
      : age < 4
      ? { food: 2400, gold: 1200 }
      : null;
  if (nextAgeCost) {
    const foodReserveGap = Math.max(0, Math.min(1, (nextAgeCost.food - Math.max(0, resources.food)) / nextAgeCost.food));
    const goldReserveGap = Math.max(0, Math.min(1, (nextAgeCost.gold - Math.max(0, resources.gold)) / nextAgeCost.gold));
    weights.food += foodReserveGap * 0.28;
    weights.gold += goldReserveGap * 0.26;
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

/** Moves at most one worker from a clear surplus to a clear resource deficit. */
export function selectAiWorkerReassignment(
  activeCounts: Readonly<Record<ResourceType, number>>,
  desiredAlloc: Readonly<Record<ResourceType, number>>
): { from: ResourceType; to: ResourceType } | null {
  const types: ResourceType[] = ['food', 'wood', 'gold', 'stone'];
  let donor: ResourceType | null = null;
  let donorSurplus = 1;
  let recipient: ResourceType | null = null;
  let recipientDeficit = 1;

  for (const type of types) {
    const surplus = activeCounts[type] - desiredAlloc[type];
    if (surplus > donorSurplus) {
      donor = type;
      donorSurplus = surplus;
    }

    const deficit = desiredAlloc[type] - activeCounts[type];
    if (deficit > recipientDeficit) {
      recipient = type;
      recipientDeficit = deficit;
    }
  }

  if (!donor || !recipient) return null;
  return { from: donor, to: recipient };
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
  boar: 1.42,
  berry: 1.0,
  farm: 1.0,
  food: 1.0,
};

export const FOOD_SOURCE_PRIORITY: Record<string, number> = {
  deep_fish: 5,
  shore_fish: 4,
  hunt: 3,
  boar: 1,
  berry: 2,
  farm: 2,
  food: 1,
};

export const RICH_NODE_GATHER_MULTIPLIER = 1.35;
export const FARM_RESEED_WOOD_COST = 60;

export function getNodeTierGatherMultiplier(nodeTier?: ResourceNode['nodeTier']): number {
  return nodeTier === 'rich' ? RICH_NODE_GATHER_MULTIPLIER : 1.0;
}

export function getFoodGatherMultiplier(subtype?: ResourceNode['subtype'] | string): number {
  return FOOD_GATHER_MULTIPLIERS[subtype || 'farm'] ?? 1.0;
}

export function getFoodSourcePriority(subtype?: ResourceNode['subtype'] | string): number {
  return FOOD_SOURCE_PRIORITY[subtype || 'farm'] ?? 1;
}

export function getEffectiveGatherMultiplier(
  node: Pick<ResourceNode, 'resourceType' | 'subtype' | 'nodeTier'>,
  researchedTechs: string[],
  hasStarOath = false
): number {
  const subtypeMult = node.resourceType === 'food' ? getFoodGatherMultiplier(node.subtype) : 1.0;
  const tierMult = getNodeTierGatherMultiplier(node.nodeTier);
  const techMult = getResourceGatherTechMultiplier(researchedTechs, node.resourceType);
  const oathMult = hasStarOath ? STAR_RELIC_OATH_GATHER : 1.0;
  return +(subtypeMult * tierMult * techMult * oathMult).toFixed(3);
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
 * Selects a resource node while accounting for current workers already assigned to each node.
 * The congestion penalty spreads new workers across nearby deposits without ignoring travel distance
 * or the higher yield of rich / preferred food sources.
 */
export function findBalancedResourceNode(
  x: number,
  z: number,
  nodes: ResourceNode[],
  type: ResourceType | undefined,
  assignedCounts: ReadonlyMap<string, number> = new Map(),
  maxDistance = Infinity
): ResourceNode | null {
  let best: ResourceNode | null = null;
  let bestScore = Infinity;

  for (const node of nodes) {
    if (node.amount <= 0 || (type && node.resourceType !== type)) continue;
    const distance = getDistance(x, z, node.x, node.z);
    if (distance > maxDistance) continue;

    const assigned = Math.max(0, assignedCounts.get(node.id) || 0);
    const congestionPenalty = assigned * 5.5;
    const foodYieldBonus = node.resourceType === 'food' ? getFoodSourcePriority(node.subtype) * 4.5 : 0;
    const richNodeBonus = node.nodeTier === 'rich' ? 4 : 0;
    const score = distance + congestionPenalty - foodYieldBonus - richNodeBonus;

    if (score < bestScore) {
      bestScore = score;
      best = node;
    }
  }

  return best;
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
 * Selects optimal available food node balancing food yield against travel distance.
 * Dangerous boars are excluded from autonomous worker reassignment by default; players
 * can still assign a hunting party directly without dispatching isolated villagers.
 */
export function findBestFoodResourceNode(
  x: number,
  z: number,
  nodes: ResourceNode[],
  maxDistance = 36,
  allowDeepFish = false,
  fishOnly = false,
  allowDangerousHunt = false
): ResourceNode | null {
  let best: ResourceNode | null = null;
  let bestScore = -Infinity;

  for (const node of nodes) {
    if (node.amount <= 0 || node.resourceType !== 'food') continue;
    if (node.subtype === 'boar' && !allowDangerousHunt) continue;
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

/**
 * Unit nameplates only expand to show a health bar after real damage.
 * A small tolerance avoids flicker from floating-point healing at full HP.
 */
export function shouldShowUnitHealthBar(hp: number, maxHp: number): boolean {
  if (!Number.isFinite(hp) || !Number.isFinite(maxHp) || maxHp <= 0) return false;
  return hp > 0 && hp < maxHp - 0.5;
}

export type BattlefieldVisualTier =
  | 'worker'
  | 'frontline'
  | 'ranged'
  | 'cavalry'
  | 'siege'
  | 'special'
  | 'champion'
  | 'naval';

export interface BattlefieldVisualProfile {
  tier: BattlefieldVisualTier;
  badgeThresholdPx: number;
  badgeScale: number;
  roleMarker: 'crest' | 'siege' | null;
  roleMarkerThresholdPx: number;
}

/**
 * Stable visual hierarchy for zoomed-out RTS readability.
 * Workers use compact labels; signature units, champions and siege engines
 * retain a clearer battlefield identity without changing combat statistics.
 */
export function getBattlefieldVisualProfile(
  category: UnitCategory,
  modelType: UnitDefinition['visual']['modelType'],
  isNaval = false,
  level = 1,
  hasSpecialAbility = false
): BattlefieldVisualProfile {
  let tier: BattlefieldVisualTier;
  if (isNaval || modelType === 'boat') {
    tier = 'naval';
  } else if (category === 'worker') {
    tier = 'worker';
  } else if (category === 'siege') {
    tier = 'siege';
  } else if (level >= 3) {
    tier = 'champion';
  } else if (
    category === 'special' ||
    hasSpecialAbility ||
    modelType === 'guardian' ||
    modelType === 'oracle' ||
    modelType === 'artificer'
  ) {
    tier = 'special';
  } else if (category === 'cavalry') {
    tier = 'cavalry';
  } else if (category === 'ranged') {
    tier = 'ranged';
  } else {
    tier = 'frontline';
  }

  const profiles: Record<BattlefieldVisualTier, Omit<BattlefieldVisualProfile, 'tier'>> = {
    worker: { badgeThresholdPx: 39, badgeScale: 0.88, roleMarker: null, roleMarkerThresholdPx: 0 },
    frontline: { badgeThresholdPx: 34, badgeScale: 0.96, roleMarker: null, roleMarkerThresholdPx: 0 },
    ranged: { badgeThresholdPx: 32, badgeScale: 1, roleMarker: null, roleMarkerThresholdPx: 0 },
    cavalry: { badgeThresholdPx: 29, badgeScale: 1.03, roleMarker: null, roleMarkerThresholdPx: 0 },
    siege: { badgeThresholdPx: 25, badgeScale: 1.1, roleMarker: 'siege', roleMarkerThresholdPx: 23 },
    special: { badgeThresholdPx: 22, badgeScale: 1.16, roleMarker: 'crest', roleMarkerThresholdPx: 19 },
    champion: { badgeThresholdPx: 18, badgeScale: 1.24, roleMarker: 'crest', roleMarkerThresholdPx: 16 },
    naval: { badgeThresholdPx: 25, badgeScale: 1.08, roleMarker: null, roleMarkerThresholdPx: 0 },
  };
  return { tier, ...profiles[tier] };
}

export type ParticleBudgetKind = 'hit' | 'spark' | 'wood' | 'gold' | 'stone' | 'leaf' | 'dust' | 'smoke' | 'ember';

/** Preserve combat feedback while trimming decorative bursts during low quality or large battles. */
export function computeParticleBurstCount(
  requestedCount: number,
  qualityLevel: 0 | 1 | 2,
  aliveUnitCount: number,
  kind: ParticleBudgetKind
): number {
  const count = Math.max(0, Math.floor(Number.isFinite(requestedCount) ? requestedCount : 0));
  if (count === 0) return 0;

  const safeUnitCount = Math.max(0, Number.isFinite(aliveUnitCount) ? aliveUnitCount : 0);
  const critical = kind === 'hit' || kind === 'spark' || kind === 'ember';
  const qualityScale = critical
    ? ([0.68, 0.86, 1] as const)[qualityLevel]
    : ([0.42, 0.72, 1] as const)[qualityLevel];
  const densityStart = critical ? 100 : 72;
  const densityRange = critical ? 520 : 300;
  const densityFloor = critical ? 0.55 : 0.3;
  const densityScale = Math.max(densityFloor, 1 - Math.max(0, safeUnitCount - densityStart) / densityRange);
  const materialScale = kind === 'leaf' || kind === 'dust' || kind === 'smoke' ? 0.9 : 1;
  return Math.max(1, Math.min(count, Math.floor(count * qualityScale * densityScale * materialScale)));
}

export interface FrameTimeSummary {
  averageMs: number;
  p95Ms: number;
  maxMs: number;
}

/** Deterministic frame-time summary used by the in-game pressure-test overlay. */
export function summarizeFrameTimes(samples: readonly number[]): FrameTimeSummary {
  const valid = samples.filter((sample) => Number.isFinite(sample) && sample > 0).sort((a, b) => a - b);
  if (valid.length === 0) return { averageMs: 0, p95Ms: 0, maxMs: 0 };
  const total = valid.reduce((sum, sample) => sum + sample, 0);
  const p95Index = Math.max(0, Math.ceil(valid.length * 0.95) - 1);
  return {
    averageMs: total / valid.length,
    p95Ms: valid[p95Index],
    maxMs: valid[valid.length - 1],
  };
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

export interface TeamVisualColor {
  colorHex: number;
  colorCss: string;
}

/** Stable team colours used for unit rings and map outlines, separate from each faction's own livery. */
export const TEAM_VISUAL_PALETTE: readonly TeamVisualColor[] = [
  { colorHex: 0x0ea5e9, colorCss: '#0ea5e9' }, // Team 1 — Azure
  { colorHex: 0xf43f5e, colorCss: '#f43f5e' }, // Team 2 — Rose
  { colorHex: 0x84cc16, colorCss: '#84cc16' }, // Team 3 — Lime
  { colorHex: 0xf59e0b, colorCss: '#f59e0b' }, // Team 4 — Amber
];

export function getTeamVisualColor(team: number): TeamVisualColor {
  const safeTeam = Math.max(1, Number.isFinite(team) ? Math.floor(team) : 1);
  return TEAM_VISUAL_PALETTE[(safeTeam - 1) % TEAM_VISUAL_PALETTE.length];
}

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
function scoreUnitMatchupTargetInternal(
  attacker: UnitEntity,
  target: UnitEntity | BuildingEntity,
  alliedUnits: UnitEntity[] = [],
  context: CombatTargetContext = {},
  nearbyAlliesOnly = false
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
      (nearbyAlliesOnly || getDistance(attacker.x, attacker.z, ally.x, ally.z) <= 16)
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

export function scoreUnitMatchupTarget(
  attacker: UnitEntity,
  target: UnitEntity | BuildingEntity,
  alliedUnits: UnitEntity[] = [],
  context: CombatTargetContext = {}
): number {
  return scoreUnitMatchupTargetInternal(attacker, target, alliedUnits, context, false);
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

  const nearbyAllies = alliedUnits.filter(
    (ally) =>
      ally.id !== attacker.id &&
      ally.hp > 0 &&
      ally.faction === attacker.faction &&
      getDistance(attacker.x, attacker.z, ally.x, ally.z) <= 16
  );
  let bestTarget: UnitEntity | BuildingEntity | null = null;
  let bestScore = -Infinity;

  for (const u of hostileUnits) {
    if (u.hp <= 0 || u.garrisonedInBuildingId || !areHostile(selfRef, u)) continue;
    const d = getDistance(attacker.x, attacker.z, u.x, u.z);
    if (d > maxRange) continue;
    const s = scoreUnitMatchupTargetInternal(attacker, u, nearbyAllies, context, true);
    if (s > bestScore || (s === bestScore && (!bestTarget || u.id.localeCompare(bestTarget.id) < 0))) {
      bestScore = s;
      bestTarget = u;
    }
  }

  for (const b of hostileBuildings) {
    if (b.hp <= 0 || !areHostile(selfRef, b)) continue;
    const d = getDistance(attacker.x, attacker.z, b.x, b.z);
    if (d > maxRange) continue;
    const s = scoreUnitMatchupTargetInternal(attacker, b, nearbyAllies, context, true);
    if (s > bestScore || (s === bestScore && (!bestTarget || b.id.localeCompare(bestTarget.id) < 0))) {
      bestScore = s;
      bestTarget = b;
    }
  }

  return bestTarget;
}


/**
 * Applies target-selection hysteresis so an AI unit does not abandon a valid target
 * for a marginally better option on every strategic tick.
 */
export function shouldSwitchCombatTarget(
  attacker: UnitEntity,
  currentTarget: UnitEntity | BuildingEntity | null | undefined,
  candidateTarget: UnitEntity | BuildingEntity | null | undefined,
  alliedUnits: UnitEntity[] = [],
  context: CombatTargetContext = {},
  minimumScoreGain = 18
): boolean {
  if (
    !candidateTarget ||
    candidateTarget.hp <= 0 ||
    (candidateTarget.type === 'unit' && !!(candidateTarget as UnitEntity).garrisonedInBuildingId) ||
    !areHostile({ faction: attacker.faction, team: attacker.team }, candidateTarget)
  ) {
    return false;
  }

  if (
    !currentTarget ||
    currentTarget.hp <= 0 ||
    (currentTarget.type === 'unit' && !!(currentTarget as UnitEntity).garrisonedInBuildingId) ||
    !areHostile({ faction: attacker.faction, team: attacker.team }, currentTarget)
  ) {
    return true;
  }

  if (currentTarget.id === candidateTarget.id) return false;

  const scoreGain =
    scoreUnitMatchupTarget(attacker, candidateTarget, alliedUnits, context) -
    scoreUnitMatchupTarget(attacker, currentTarget, alliedUnits, context);
  const requiredGain = Number.isFinite(minimumScoreGain) ? Math.max(0, minimumScoreGain) : 18;
  return scoreGain >= requiredGain;
}


export type CombatFormationRole = 'frontline' | 'backline' | 'flank' | 'siege' | 'support';

export interface CombatFormationSlot {
  unitId: string;
  x: number;
  z: number;
  role: CombatFormationRole;
  lateralIndex: number;
}

/**
 * Assigns deterministic role-based approach slots around a shared objective.
 * Melee screens the front, ranged and siege stay behind, cavalry spreads to both flanks,
 * and support units occupy the protected middle line. Workers are intentionally excluded.
 */
export function layoutCombatFormation(
  units: readonly Pick<UnitEntity, 'id' | 'x' | 'z' | 'unitDef'>[],
  objective: { x: number; z: number },
  maxWorldExtent = 84
): CombatFormationSlot[] {
  if (
    !Number.isFinite(objective.x) ||
    !Number.isFinite(objective.z) ||
    !Number.isFinite(maxWorldExtent) ||
    maxWorldExtent <= 0
  ) {
    return [];
  }

  const seenUnitIds = new Set<string>();
  const members = units.filter((unit) => {
    if (
      !unit.id ||
      !Number.isFinite(unit.x) ||
      !Number.isFinite(unit.z) ||
      unit.unitDef.category === 'worker' ||
      seenUnitIds.has(unit.id)
    ) {
      return false;
    }
    seenUnitIds.add(unit.id);
    return true;
  });

  if (members.length === 0) return [];

  const centerX = members.reduce((sum, unit) => sum + unit.x, 0) / members.length;
  const centerZ = members.reduce((sum, unit) => sum + unit.z, 0) / members.length;
  let dirX = objective.x - centerX;
  let dirZ = objective.z - centerZ;
  const dirLength = Math.hypot(dirX, dirZ);
  if (dirLength < 0.001) {
    dirX = 1;
    dirZ = 0;
  } else {
    dirX /= dirLength;
    dirZ /= dirLength;
  }
  const sideX = -dirZ;
  const sideZ = dirX;
  const limit = Math.max(1, maxWorldExtent);

  const clamp = (value: number) => Math.max(-limit, Math.min(limit, value));
  const slot = (
    unitId: string,
    role: CombatFormationRole,
    depth: number,
    lateral: number,
    lateralIndex: number
  ): CombatFormationSlot => ({
    unitId,
    role,
    lateralIndex,
    x: clamp(objective.x - dirX * depth + sideX * lateral),
    z: clamp(objective.z - dirZ * depth + sideZ * lateral),
  });
  const sorted = (category: UnitCategory) =>
    members
      .filter((unit) => unit.unitDef.category === category)
      .sort((a, b) => a.id.localeCompare(b.id));
  const centered = (index: number, count: number, spacing: number) =>
    (index - (count - 1) / 2) * spacing;

  const result: CombatFormationSlot[] = [];

  const frontline = sorted('melee');
  frontline.forEach((unit, index) =>
    result.push(slot(unit.id, 'frontline', 5.2, centered(index, frontline.length, 2.1), index))
  );

  const backline = sorted('ranged');
  backline.forEach((unit, index) =>
    result.push(slot(unit.id, 'backline', 11.2, centered(index, backline.length, 2.4), index))
  );

  const cavalry = sorted('cavalry');
  cavalry.forEach((unit, index) => {
    const rank = Math.floor(index / 2);
    const flank = index % 2 === 0 ? -1 : 1;
    result.push(slot(unit.id, 'flank', 8.2 + rank * 1.4, flank * (5.2 + rank * 2.1), index));
  });

  const support = sorted('special');
  support.forEach((unit, index) =>
    result.push(slot(unit.id, 'support', 9.0, centered(index, support.length, 2.7), index))
  );

  const siege = sorted('siege');
  siege.forEach((unit, index) =>
    result.push(slot(unit.id, 'siege', 18.5, centered(index, siege.length, 3.6), index))
  );

  return result.sort((a, b) => a.unitId.localeCompare(b.unitId));
}

export interface RaidTargetAssignment {
  raiderId: string;
  targetId: string;
}

/**
 * Distributes raiders across exposed targets, caps focus-fire per target, and preserves
 * still-valid existing assignments before allocating unassigned units by proximity.
 */
export function assignRaidTargets<
  R extends { id: string; x: number; z: number; targetEntityId?: string },
  T extends { id: string; x: number; z: number }
>(
  raiders: readonly R[],
  targets: readonly T[],
  maxAttackersPerTarget = 2
): RaidTargetAssignment[] {
  if (raiders.length === 0 || targets.length === 0 || !Number.isFinite(maxAttackersPerTarget)) return [];

  const capacity = Math.max(1, Math.floor(maxAttackersPerTarget));
  const orderedRaiders = [...raiders].sort((a, b) => a.id.localeCompare(b.id));
  const orderedTargets = [...targets]
    .filter((target) => target.id && Number.isFinite(target.x) && Number.isFinite(target.z))
    .sort((a, b) => a.id.localeCompare(b.id));
  const targetById = new Map(orderedTargets.map((target) => [target.id, target]));
  const counts = new Map<string, number>();
  const assigned = new Map<string, string>();

  // Keep valid existing assignments first to avoid oscillation between nearby workers.
  for (const raider of orderedRaiders) {
    const current = raider.targetEntityId ? targetById.get(raider.targetEntityId) : undefined;
    if (!current || (counts.get(current.id) || 0) >= capacity) continue;
    assigned.set(raider.id, current.id);
    counts.set(current.id, (counts.get(current.id) || 0) + 1);
  }

  // Fill remaining raiders with the nearest target that still has capacity.
  for (const raider of orderedRaiders) {
    if (assigned.has(raider.id)) continue;
    let nearest: T | null = null;
    let nearestDistance = Infinity;
    for (const target of orderedTargets) {
      if ((counts.get(target.id) || 0) >= capacity) continue;
      const distance = getDistance(raider.x, raider.z, target.x, target.z);
      if (
        distance < nearestDistance - 0.0001 ||
        (Math.abs(distance - nearestDistance) <= 0.0001 && (!nearest || target.id < nearest.id))
      ) {
        nearest = target;
        nearestDistance = distance;
      }
    }
    if (!nearest) continue;
    assigned.set(raider.id, nearest.id);
    counts.set(nearest.id, (counts.get(nearest.id) || 0) + 1);
  }

  return orderedRaiders
    .filter((raider) => assigned.has(raider.id))
    .map((raider) => ({ raiderId: raider.id, targetId: assigned.get(raider.id)! }));
}

/**
 * Picks a coordinated cluster focus-fire target for an entire squad based on squad centroid,
 * enemy concentration, threat priority, and siege fortifications.
 */
/**
 * Selects available frontline escorts near a siege group without overriding units with active orders.
 * Melee and cavalry are preferred as screens, while proximity keeps the escort from being left behind.
 */
export function selectSiegeEscortUnits<
  T extends { id: string; x: number; z: number; state: string; unitDef: { category: UnitCategory } }
>(
  siegeUnits: readonly { x: number; z: number }[],
  candidates: readonly T[],
  maxEscortCount: number
): T[] {
  if (siegeUnits.length === 0 || maxEscortCount <= 0) return [];

  const centerX = siegeUnits.reduce((sum, unit) => sum + unit.x, 0) / siegeUnits.length;
  const centerZ = siegeUnits.reduce((sum, unit) => sum + unit.z, 0) / siegeUnits.length;
  const rolePenalty: Partial<Record<UnitCategory, number>> = {
    melee: 0,
    cavalry: 2.2,
    ranged: 7.5,
  };

  return candidates
    .filter(
      (unit) =>
        unit.state === 'idle' &&
        unit.unitDef.category !== 'siege' &&
        unit.unitDef.category !== 'worker'
    )
    .map((unit) => ({
      unit,
      score:
        getDistance(centerX, centerZ, unit.x, unit.z) * 0.75 +
        (rolePenalty[unit.unitDef.category] ?? 9),
    }))
    .sort((a, b) => a.score - b.score)
    .slice(0, Math.floor(maxEscortCount))
    .map((entry) => entry.unit);
}

export function selectClusterFocusTarget(
  squadUnits: UnitEntity[],
  hostileUnits: UnitEntity[],
  hostileBuildings: BuildingEntity[] = [],
  options: { maxEnemyRangeFromCentroid?: number; defendAnchor?: { x: number; z: number; radius?: number } | null } = {}
): UnitEntity | BuildingEntity | null {
  if (squadUnits.length === 0) return null;

  const cx = squadUnits.reduce((sum, unit) => sum + unit.x, 0) / squadUnits.length;
  const cz = squadUnits.reduce((sum, unit) => sum + unit.z, 0) / squadUnits.length;
  const requestedRange = options.maxEnemyRangeFromCentroid;
  const maxRange =
    requestedRange === Infinity
      ? Infinity
      : typeof requestedRange === 'number' && Number.isFinite(requestedRange)
        ? Math.max(0, requestedRange)
        : 26;
  const representative = squadUnits.find((unit) => unit.hp > 0) || squadUnits[0];
  const selfRef = { faction: representative.faction, team: representative.team };
  const hasSiegeUnit = squadUnits.some(
    (unit) => unit.hp > 0 && (unit.unitDef.category === 'siege' || unit.unitDefId === 'fantasy_treant')
  );

  let bestTarget: UnitEntity | BuildingEntity | null = null;
  let bestScore = -Infinity;

  // Compare units and structures in one scoring pass. Returning as soon as a unit is
  // found would make defensive buildings invisible whenever even a low-value worker
  // happened to be inside the acquisition radius.
  const consider = (target: UnitEntity | BuildingEntity, score: number) => {
    const tied = Math.abs(score - bestScore) <= 0.0001;
    if (
      score > bestScore + 0.0001 ||
      (tied && (!bestTarget || target.id.localeCompare(bestTarget.id) < 0))
    ) {
      bestScore = score;
      bestTarget = target;
    }
  };

  for (const unit of hostileUnits) {
    if (unit.hp <= 0 || unit.garrisonedInBuildingId || !areHostile(selfRef, unit)) continue;
    const distance = getDistance(cx, cz, unit.x, unit.z);
    if (distance > maxRange) continue;

    let unitScore = 45;
    if (unit.unitDef.category === 'ranged' || unit.unitDef.category === 'siege') unitScore += 28;
    else if (unit.unitDef.category !== 'worker') unitScore += 18;

    // Finish wounded high-value threats and protect the area around a defended anchor.
    const hpRatio = Math.max(0, Math.min(1, unit.hp / Math.max(1, unit.maxHp)));
    unitScore += (1 - hpRatio) * 35;
    if (
      options.defendAnchor &&
      getDistance(unit.x, unit.z, options.defendAnchor.x, options.defendAnchor.z) <=
        (options.defendAnchor.radius ?? 22)
    ) {
      unitScore += 40;
    }
    unitScore -= distance * 1.4;
    consider(unit, unitScore);
  }

  for (const building of hostileBuildings) {
    if (building.hp <= 0 || !areHostile(selfRef, building)) continue;
    const distance = getDistance(cx, cz, building.x, building.z);
    // Cluster focus is a local tactical choice. Distant defenses must not pull the
    // whole army across the map; the strategic stronghold remains the fallback.
    if (distance > maxRange) continue;

    const isDefensive = DEFENSIVE_BUILDING_TYPES.has(building.buildingType);
    const isMilitary = MILITARY_BUILDING_TYPES.has(building.buildingType);
    let buildingScore = isDefensive
      ? hasSiegeUnit
        ? 88
        : 66
      : isMilitary
        ? 42
        : 12;
    const hpRatio = Math.max(0, Math.min(1, building.hp / Math.max(1, building.maxHp)));
    buildingScore += (1 - hpRatio) * 25;
    buildingScore -= distance * (hasSiegeUnit ? 1.25 : 1.45);
    consider(building, buildingScore);
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

export interface GameSpeedOption {
  value: number;
  label: string;
  tag: string;
}

export const GAME_SPEED_OPTIONS: ReadonlyArray<GameSpeedOption> = [
  { value: 1.0, label: '1x', tag: '標準' },
  { value: 1.5, label: '1.5x', tag: '略快' },
  { value: 2.0, label: '2x', tag: '快速' },
  { value: 10.0, label: '10x', tag: '極速' },
  { value: 20.0, label: '20x', tag: '超高速' },
];

export function getNextGameSpeed(currentSpeed: number): number {
  const idx = GAME_SPEED_OPTIONS.findIndex((o) => Math.abs(o.value - currentSpeed) < 0.01);
  if (idx < 0) return GAME_SPEED_OPTIONS[0].value;
  return GAME_SPEED_OPTIONS[(idx + 1) % GAME_SPEED_OPTIONS.length].value;
}

/**
 * Splits high-multiplier frame deltas (up to 20x) into collision-safe simulation sub-steps
 * so high speeds accelerate game time accurately without unit tunneling or browser stalls.
 */
export function computeSimulationSubsteps(
  rawDt: number,
  gameSpeed: number,
  isSoftwareGl = false
): { stepDt: number; steps: number } {
  const safeRaw = Math.min(Math.max(0.001, Number.isFinite(rawDt) ? rawDt : 0.016), isSoftwareGl ? 0.2 : 0.05);
  const safeSpeed = Math.max(0.25, Math.min(20, Number.isFinite(gameSpeed) ? gameSpeed : 1));
  const maxFrameSimDt = isSoftwareGl ? 1.8 : 1.5;
  const totalDt = Math.min(safeRaw * safeSpeed, maxFrameSimDt);
  const steps = Math.max(1, Math.ceil(totalDt / 0.05));
  return {
    stepDt: totalDt / steps,
    steps,
  };
}

export interface BuildingVisualState {
  stage: 1 | 2 | 3 | 4; // 1=foundation/scaffold, 2=walls framing, 3=roof/details, 4=completed
  tier1Reveal: number; // 0..1 grounded base plinth
  tier2Reveal: number; // 0..1 main structural walls
  tier3Reveal: number; // 0..1 roofs, turrets, finials
  showScaffold: boolean;
  scaffoldHeightScale: number;
  foundationReveal: number; // 0..1 construction earth pad & corner stakes settle
  planksOpacity: number; // 0..1 scaffolding catwalk plank fade during erection/dismantle
  hpRatio: number;
  damageSeverity: number; // 0 (healthy) -> 1 (critically wrecked)
  isSmoking: boolean;
  isBurning: boolean;
  sagTiltRad: number;
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const smooth01 = (v: number): number => {
  const t = clamp01(v);
  return t * t * (3 - 2 * t);
};

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

  // Smooth, continuous vertical emergence per architectural tier (grounded from base upward)
  const tier1Reveal = isConstructed ? 1 : clamp01(0.06 + smooth01(p / 0.3) * 0.94);
  const tier2Reveal = isConstructed ? 1 : smooth01((p - 0.2) / 0.5);
  const tier3Reveal = isConstructed ? 1 : smooth01((p - 0.62) / 0.36);

  const showScaffold = !isConstructed && p < 0.995;
  const scaffoldHeightScale = p < 0.1
    ? 0.08 + smooth01(p / 0.1) * 0.44
    : p < 0.86
    ? 0.52 + smooth01((p - 0.1) / 0.72) * 0.48
    : Math.max(0.05, 1 - smooth01((p - 0.86) / 0.14) * 0.95);

  const foundationReveal = isConstructed
    ? 0
    : p < 0.12
    ? 0.25 + smooth01(p / 0.12) * 0.75
    : p > 0.88
    ? Math.max(0.1, 1 - smooth01((p - 0.88) / 0.12) * 0.9)
    : 1;

  const planksOpacity = isConstructed
    ? 0
    : p < 0.14
    ? smooth01(p / 0.14)
    : p > 0.86
    ? 1 - smooth01((p - 0.86) / 0.14)
    : 1;

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
    foundationReveal,
    planksOpacity,
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

// ------------------ CONTESTED SHRINE PRESENCE & SUMMARY ------------------

export interface ShrinePresenceEvaluation {
  leader: FactionId | null;
  leaderWeight: number;
  isTie: boolean;
  isContested: boolean;
  activeFactions: FactionId[];
}

/**
 * Evaluates unit presence inside a contested shrine by team & faction weight.
 * `isContested` is true whenever 2+ mutually opposing teams occupy the ring simultaneously,
 * while `isTie` is true only when top rival teams have equal capture weight (halting progress).
 */
export function evaluateContestedPresence(
  entries: Array<{ faction: FactionId; team: number; weight: number }>
): ShrinePresenceEvaluation {
  const active = entries.filter((e) => e.weight > 0);
  if (active.length === 0) {
    return {
      leader: null,
      leaderWeight: 0,
      isTie: false,
      isContested: false,
      activeFactions: [],
    };
  }

  const byFaction = new Map<FactionId, { faction: FactionId; team: number; weight: number }>();
  const byTeam = new Map<number, number>();
  for (const e of active) {
    const prev = byFaction.get(e.faction);
    if (prev) {
      prev.weight += e.weight;
    } else {
      byFaction.set(e.faction, { ...e });
    }
    byTeam.set(e.team, (byTeam.get(e.team) || 0) + e.weight);
  }

  const sortedFactions = [...byFaction.values()].sort((a, b) => b.weight - a.weight);
  const sortedTeams = [...byTeam.entries()].sort((a, b) => b[1] - a[1]);

  const isContested = sortedTeams.length >= 2;
  const isTie = sortedTeams.length >= 2 && sortedTeams[0][1] === sortedTeams[1][1];

  return {
    leader: isTie ? null : sortedFactions[0]?.faction ?? null,
    leaderWeight: sortedFactions[0]?.weight ?? 0,
    isTie,
    isContested,
    activeFactions: sortedFactions.map((f) => f.faction),
  };
}

export interface ContestedShrineSummary {
  shrineIcon: string;
  shrineRole: string;
  shrineBlessingName: string;
  shrinePerkDesc: string;
  isNeutral: boolean;
  ownerName: string;
  ownerColorHex: number;
  ownerColorCss: string;
  capturingName: string | null;
  capturingColorHex: number | null;
  capturingColorCss: string | null;
  progressPct: number;
  blessingThreshold: number;
  blessingPct: number;
  income: Resources;
  statusKind: 'contested_tie' | 'contested_push' | 'capturing' | 'blessed' | 'owned' | 'neutral';
  statusLabel: string;
  badgeValueText: string;
  badgeActionText: string;
  badgeRatio: number;
}

export function getContestedShrineSummary(
  point: ContestedPoint,
  participants: Array<{ id: FactionId; name: string; colorHex: number; colorCss: string }>
): ContestedShrineSummary {
  const shrineIcon = point.shrineType === 'war' ? '⚔️' : point.shrineType === 'harvest' ? '🌾' : '⚒️';
  const shrineRole =
    point.shrineType === 'war' ? '戰意祭壇' : point.shrineType === 'harvest' ? '豐饒祭壇' : '鍛造祭壇';
  const shrineBlessingName =
    point.shrineType === 'war' ? '戰意祝福' : point.shrineType === 'harvest' ? '豐饒祝福' : '鍛造祝福';
  const shrinePerkDesc =
    point.shrineType === 'war'
      ? '主產黃金與少量木材；持續佔領啟用軍備加速與戰陣防禦靈氣。'
      : point.shrineType === 'harvest'
      ? '持續產出糧食與木材；附近友軍村民與部隊獲得行軍加速。'
      : '穩定提供黃金與石料；駐軍與附近部隊防禦力強化、加速鍛造祝福。';

  const ownerP = point.ownerFaction !== 'neutral'
    ? participants.find((p) => p.id === point.ownerFaction) ?? null
    : null;
  const capP = point.capturingFaction
    ? participants.find((p) => p.id === point.capturingFaction) ?? null
    : null;

  const isNeutral = point.ownerFaction === 'neutral';
  const ownerName = ownerP ? ownerP.name : '中立據點';
  const ownerColorHex = ownerP ? ownerP.colorHex : 0xa8a29e;
  const ownerColorCss = ownerP ? ownerP.colorCss : '#94a3b8';

  const progressPct = Math.max(0, Math.min(100, Math.round((point.captureProgress || 0) * 100)));
  const blessingThreshold = getShrineBlessingHoldTime(point.shrineType);
  const blessingPct = point.siegeSupplyActive
    ? 100
    : Math.max(0, Math.min(100, Math.round(((point.holdTime || 0) / Math.max(1, blessingThreshold)) * 100)));
  const income = getShrineIncome(point.shrineType, point.siegeSupplyActive);

  let statusKind: ContestedShrineSummary['statusKind'] = 'neutral';
  let statusLabel = '中立 · 待佔領';
  let badgeValueText = '中立';
  let badgeActionText = `${shrineRole} · 可佔領`;
  let badgeRatio = progressPct / 100;

  if (point.isContested && isNeutral) {
    statusKind = 'contested_tie';
    statusLabel = progressPct > 0 ? `雙方爭奪中 (${progressPct}%)` : '雙方爭奪對峙中';
    badgeValueText = progressPct > 0 ? `爭奪 ${progressPct}%` : '爭奪中';
    badgeActionText = '⚔️ 雙方交鋒爭奪中！';
  } else if (point.isContested && !isNeutral) {
    const isStall = !point.capturingFaction || point.capturingFaction === point.ownerFaction;
    statusKind = isStall ? 'contested_tie' : 'contested_push';
    statusLabel = capP && capP.id !== point.ownerFaction
      ? `⚔️ ${capP.name} 搶奪中 (${progressPct}%)`
      : '⚔️ 據點激戰防守中';
    badgeValueText = `${ownerName} ${progressPct}%`;
    badgeActionText = capP && capP.id !== point.ownerFaction
      ? `⚔️ ${capP.name} 爭奪中`
      : '⚔️ 雙方激戰爭奪中';
  } else if (isNeutral && capP && progressPct > 2) {
    statusKind = 'capturing';
    statusLabel = `${capP.name} 佔領中 (${progressPct}%)`;
    badgeValueText = `${progressPct}%`;
    badgeActionText = `🚩 ${capP.name} 佔領中`;
  } else if (!isNeutral && capP && capP.id !== point.ownerFaction && progressPct < 99) {
    statusKind = 'capturing';
    statusLabel = `${capP.name} 奪取中 (${progressPct}%)`;
    badgeValueText = `${progressPct}%`;
    badgeActionText = `🚩 ${capP.name} 奪取中`;
  } else if (!isNeutral && point.siegeSupplyActive) {
    statusKind = 'blessed';
    statusLabel = `${ownerName} · ${shrineBlessingName}已啟動`;
    badgeValueText = `${ownerName}`;
    badgeActionText = `✨ ${shrineBlessingName}生效中`;
    badgeRatio = 1;
  } else if (!isNeutral) {
    statusKind = 'owned';
    statusLabel = `${ownerName} 佔領中 (祝福 ${blessingPct}%)`;
    badgeValueText = `${ownerName}`;
    badgeActionText = blessingPct > 5 ? `🛡️ 佔領 · 祝福 ${blessingPct}%` : `🚩 ${ownerName} 已佔領`;
    badgeRatio = 1;
  }

  return {
    shrineIcon,
    shrineRole,
    shrineBlessingName,
    shrinePerkDesc,
    isNeutral,
    ownerName,
    ownerColorHex,
    ownerColorCss,
    capturingName: capP ? capP.name : null,
    capturingColorHex: capP ? capP.colorHex : null,
    capturingColorCss: capP ? capP.colorCss : null,
    progressPct,
    blessingThreshold,
    blessingPct,
    income,
    statusKind,
    statusLabel,
    badgeValueText,
    badgeActionText,
    badgeRatio,
  };
}

// ------------------ WILD DEER (山羌) FLEEING & LOCOMOTION ------------------

export function triggerWildAnimalPanic(
  node: ResourceNode,
  threatX: number,
  threatZ: number,
  simTime: number,
  duration = 2.6
): void {
  if (!node.animalAlive || node.animalPanicSuppressed) return;
  // One panic per encounter. Repeated harvest hits from a pursuing worker must not
  // keep extending the run timer or reset its cooldown every attack interval.
  node.animalPanicSuppressed = true;
  node.animalFleeUntil = Math.max(node.animalFleeUntil || 0, simTime + duration);
  node.animalFleeCooldown = Math.max(node.animalFleeCooldown || 0, simTime + duration + 1.5);
  const dx = node.x - threatX;
  const dz = node.z - threatZ;
  const len = Math.hypot(dx, dz);
  if (len > 0.001) {
    node.animalWanderAngle = Math.atan2(dz, dx);
  }
}

/**
 * Samples candidate angles fanning around `preferredAngle` to pick an obstacle-free
 * escape vector so deer smoothly steer along riverbanks/cliffs/buildings instead of bouncing in place.
 */
export function pickWildAnimalEscapeAngle(
  x: number,
  z: number,
  preferredAngle: number,
  isBlocked: (cx: number, cz: number) => boolean
): number | null {
  const offsets = [0, 0.55, -0.55, 1.1, -1.1, 1.65, -1.65, 2.25, -2.25, Math.PI];
  for (const off of offsets) {
    const ang = preferredAngle + off;
    const tx1 = x + Math.cos(ang) * 1.4;
    const tz1 = z + Math.sin(ang) * 1.4;
    const tx2 = x + Math.cos(ang) * 2.9;
    const tz2 = z + Math.sin(ang) * 2.9;
    if (!isBlocked(tx1, tz1) && !isBlocked(tx2, tz2)) {
      return ang;
    }
  }
  for (const off of offsets) {
    const ang = preferredAngle + off;
    const tx1 = x + Math.cos(ang) * 1.15;
    const tz1 = z + Math.sin(ang) * 1.15;
    if (!isBlocked(tx1, tz1)) {
      return ang;
    }
  }
  return null;
}

export interface WildAnimalStepOutput {
  distMoved: number;
  actualSpeed: number;
  isFleeing: boolean;
  isGrazing: boolean;
  yaw: number;
  moveBlend: number;
  gaitPhase: number;
  hopY: number;
}

/**
 * Updates wild animal (山羌) steering, flee cooldown, terrain obstacle avoidance,
 * and computes displacement-locked animation parameters so blocked or cooling-down
 * deer never jump in place.
 */
export function stepWildAnimalState(
  node: ResourceNode,
  nearestThreat: { x: number; z: number; d: number } | null,
  simTime: number,
  dt: number,
  isBlocked: (cx: number, cz: number) => boolean,
  rand: () => number = Math.random
): WildAnimalStepOutput {
  const DETECT_RANGE = 12.5;
  const MAX_FLEE_SPEED = 5.4;
  const MIN_FLEE_SPEED = 3.1;
  const WANDER_SPEED = 1.05;
  const prevX = node.x;
  const prevZ = node.z;
  const clampedDt = Math.max(0.0001, Math.min(0.1, dt));

  const REARM_RANGE = 16.5;
  // Re-arm only after the encounter has disengaged. A worker following the moving
  // deer keeps panic disarmed instead of causing repeated sprints.
  if (node.animalPanicSuppressed && (!nearestThreat || nearestThreat.d >= REARM_RANGE)) {
    node.animalPanicSuppressed = false;
    node.animalFleeCooldown = Math.max(node.animalFleeCooldown || 0, simTime + 1.1);
  }
  if (
    nearestThreat && nearestThreat.d < DETECT_RANGE &&
    !node.animalPanicSuppressed &&
    (node.animalFleeCooldown || 0) <= simTime
  ) {
    triggerWildAnimalPanic(node, nearestThreat.x, nearestThreat.z, simTime, 1.9);
  }

  const wasFleeing = (node.animalFleeUntil || 0) > simTime;
  let isFleeing = wasFleeing;

  if (isFleeing) {
    const preferredAngle = nearestThreat
      ? Math.atan2(node.z - nearestThreat.z, node.x - nearestThreat.x)
      : node.animalWanderAngle ?? Math.atan2(node.animalVz || 0, node.animalVx || 1);

    const escapeAngle = pickWildAnimalEscapeAngle(node.x, node.z, preferredAngle, isBlocked);
    if (escapeAngle === null) {
      node.animalVx = 0;
      node.animalVz = 0;
    } else {
      node.animalWanderAngle = escapeAngle;
      const urgency = nearestThreat
        ? Math.max(0, Math.min(1, 1 - nearestThreat.d / DETECT_RANGE))
        : 0.25;
      const targetSpd = MIN_FLEE_SPEED + (MAX_FLEE_SPEED - MIN_FLEE_SPEED) * urgency;
      const tvx = Math.cos(escapeAngle) * targetSpd;
      const tvz = Math.sin(escapeAngle) * targetSpd;
      const accel = 1 - Math.exp(-9 * clampedDt);
      node.animalVx = (node.animalVx || 0) + (tvx - (node.animalVx || 0)) * accel;
      node.animalVz = (node.animalVz || 0) + (tvz - (node.animalVz || 0)) * accel;
    }
  } else {
    // Clean transition out of fleeing into calm grazing cooldown
    if ((node.animalFleeUntil || 0) > 0 && (node.animalFleeUntil || 0) <= simTime) {
      node.animalFleeUntil = 0;
      node.animalFleeCooldown = Math.max(node.animalFleeCooldown || 0, simTime + 1.4);
      node.animalWanderMoving = false;
      node.animalWanderTimer = 2.2 + rand() * 2.2;
    }

    node.animalWanderTimer = (node.animalWanderTimer ?? (1.5 + rand() * 2.5)) - clampedDt;
    if ((node.animalWanderTimer || 0) <= 0) {
      const shouldWalk = rand() < 0.36;
      node.animalWanderMoving = shouldWalk;
      if (shouldWalk) {
        const baseAng = (node.animalWanderAngle ?? rand() * Math.PI * 2) + (rand() - 0.5) * 1.8;
        const clearAng = pickWildAnimalEscapeAngle(node.x, node.z, baseAng, isBlocked);
        if (clearAng !== null) {
          node.animalWanderAngle = clearAng;
          node.animalWanderTimer = 1.6 + rand() * 1.4;
        } else {
          node.animalWanderMoving = false;
          node.animalWanderTimer = 2.4 + rand() * 2.0;
        }
      } else {
        node.animalWanderTimer = 2.6 + rand() * 2.8;
      }
    }

    if (node.animalWanderMoving) {
      const ang = node.animalWanderAngle ?? 0;
      if (isBlocked(node.x + Math.cos(ang) * 1.35, node.z + Math.sin(ang) * 1.35)) {
        const redirect = pickWildAnimalEscapeAngle(node.x, node.z, ang + 1.4, isBlocked);
        if (redirect !== null) {
          node.animalWanderAngle = redirect;
        } else {
          node.animalWanderMoving = false;
        }
      }
    }

    if (node.animalWanderMoving) {
      const ang = node.animalWanderAngle ?? 0;
      const tvx = Math.cos(ang) * WANDER_SPEED;
      const tvz = Math.sin(ang) * WANDER_SPEED;
      const blend = 1 - Math.exp(-5 * clampedDt);
      node.animalVx = (node.animalVx || 0) + (tvx - (node.animalVx || 0)) * blend;
      node.animalVz = (node.animalVz || 0) + (tvz - (node.animalVz || 0)) * blend;
    } else {
      const brake = Math.exp(-8 * clampedDt);
      node.animalVx = (node.animalVx || 0) * brake;
      node.animalVz = (node.animalVz || 0) * brake;
      if (Math.hypot(node.animalVx, node.animalVz) < 0.05) {
        node.animalVx = 0;
        node.animalVz = 0;
      }
    }
  }

  let nx = Math.max(-91, Math.min(91, node.x + (node.animalVx || 0) * clampedDt));
  let nz = Math.max(-91, Math.min(91, node.z + (node.animalVz || 0) * clampedDt));

  if (isBlocked(nx, nz)) {
    nx = prevX;
    nz = prevZ;
    node.animalVx = 0;
    node.animalVz = 0;
    isFleeing = false;
  }

  node.x = nx;
  node.z = nz;

  const dxMoved = nx - prevX;
  const dzMoved = nz - prevZ;
  const distMoved = Math.hypot(dxMoved, dzMoved);
  const actualSpeed = distMoved / clampedDt;

  // Update facing yaw strictly from actual ground translation (facing +X in local deer mesh => atan2(-dz, dx))
  let yaw = node.animalYaw ?? 0;
  if (distMoved > 0.002 && actualSpeed > 0.15) {
    const targetYaw = Math.atan2(-dzMoved, dxMoved);
    let diff = targetYaw - yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    yaw += diff * (1 - Math.exp(-10 * clampedDt));
  }
  node.animalYaw = yaw;

  const targetBlend = actualSpeed < 0.18 ? 0 : Math.min(1, actualSpeed / 4.8);
  let moveBlend = (node.animalMoveBlend ?? 0) + (targetBlend - (node.animalMoveBlend ?? 0)) * (1 - Math.exp(-12 * clampedDt));
  if (actualSpeed < 0.18 && moveBlend < 0.03) moveBlend = 0;
  node.animalMoveBlend = moveBlend;

  let gaitPhase = node.animalGaitPhase ?? 0;
  if (distMoved > 0.0005) {
    gaitPhase = (gaitPhase + distMoved * 2.8) % (Math.PI * 200);
  }
  node.animalGaitPhase = gaitPhase;

  // Bounding lift ONLY occurs during genuine fast running translation — zero hop while grazing, wandering, blocked, or cooling down
  const hopY =
    actualSpeed >= 2.2 && moveBlend > 0.35
      ? Math.max(0, Math.sin(gaitPhase)) * 0.11 * Math.min(1, (actualSpeed - 2.2) / 3.0)
      : 0;

  return {
    distMoved,
    actualSpeed,
    isFleeing,
    isGrazing: actualSpeed < 0.22 && !isFleeing,
    yaw,
    moveBlend,
    gaitPhase,
    hopY,
  };
}


/** Records the unit that provoked a wild boar. Boars do not attack passers-by. */
export function triggerWildBoarAggression(node: ResourceNode, attackerId: string, simTime: number): void {
  if (!node.animalAlive || !attackerId) return;
  node.animalAggroTargetId = attackerId;
  node.animalAggroUntil = Math.max(node.animalAggroUntil || 0, simTime + 8);
}

export interface WildBoarStepOutput {
  distMoved: number;
  actualSpeed: number;
  yaw: number;
  isCharging: boolean;
}

/** Pursuit steering for provoked boars; stops at melee distance and respects terrain blockers. */
export function stepWildBoarState(
  node: ResourceNode,
  target: { x: number; z: number } | null,
  dt: number,
  isBlocked: (cx: number, cz: number) => boolean
): WildBoarStepOutput {
  const prevX = node.x;
  const prevZ = node.z;
  const clampedDt = Math.max(0.0001, Math.min(0.1, dt));
  const dx = target ? target.x - node.x : 0;
  const dz = target ? target.z - node.z : 0;
  const distance = Math.hypot(dx, dz);
  const attackRange = 2.25;
  let targetVx = 0;
  let targetVz = 0;
  let isCharging = false;

  if (target && distance > attackRange) {
    const chaseAngle = pickWildAnimalEscapeAngle(node.x, node.z, Math.atan2(dz, dx), isBlocked);
    if (chaseAngle !== null) {
      targetVx = Math.cos(chaseAngle) * 4.15;
      targetVz = Math.sin(chaseAngle) * 4.15;
      isCharging = true;
    }
  }

  const blend = 1 - Math.exp(-(isCharging ? 11 : 9) * clampedDt);
  node.animalVx = (node.animalVx || 0) + (targetVx - (node.animalVx || 0)) * blend;
  node.animalVz = (node.animalVz || 0) + (targetVz - (node.animalVz || 0)) * blend;

  let nx = Math.max(-91, Math.min(91, node.x + node.animalVx * clampedDt));
  let nz = Math.max(-91, Math.min(91, node.z + node.animalVz * clampedDt));
  if (isBlocked(nx, nz)) {
    nx = prevX;
    nz = prevZ;
    node.animalVx = 0;
    node.animalVz = 0;
    isCharging = false;
  }
  node.x = nx;
  node.z = nz;

  const movedX = nx - prevX;
  const movedZ = nz - prevZ;
  const distMoved = Math.hypot(movedX, movedZ);
  const actualSpeed = distMoved / clampedDt;
  let yaw = node.animalYaw ?? 0;
  if (distMoved > 0.002 && actualSpeed > 0.15) yaw = Math.atan2(-movedZ, movedX);
  else if (target && distance > 0.01) yaw = Math.atan2(-dz, dx);
  node.animalYaw = yaw;
  return { distMoved, actualSpeed, yaw, isCharging };
}

export interface AiTechCandidateInput {
  buildingId: string;
  tech: TechDefinition;
}

export interface AiTechDecisionContext {
  resources: Resources;
  reserveFood: number;
  reserveGold: number;
  age: number;
  workerCount: number;
  aiPersonality?: MatchParticipant['aiPersonality'];
  enemyComposition: {
    melee: number;
    ranged: number;
    cavalry: number;
    siege: number;
    fortificationCount: number;
  };
}

/**
 * Context-aware AI tech scoring so AI actively counter-researches enemy compositions,
 * invests in early economic camps, and chooses mutually-exclusive doctrines matching its personality & matchup.
 */
export function evaluateAiTechChoice(
  candidates: AiTechCandidateInput[],
  ctx: AiTechDecisionContext
): AiTechCandidateInput | null {
  let best: AiTechCandidateInput | null = null;
  let bestScore = -Infinity;

  const { enemyComposition, aiPersonality } = ctx;
  const isDefensiveAi = aiPersonality === 'defensive' || aiPersonality === 'easy';
  const isAggressiveAi = aiPersonality === 'hard';

  for (const cand of candidates) {
    const { tech } = cand;
    const afterFood = ctx.resources.food - (tech.cost.food || 0);
    const afterGold = ctx.resources.gold - (tech.cost.gold || 0);
    if (!canAfford(ctx.resources, tech.cost)) continue;
    if (afterFood < ctx.reserveFood || afterGold < ctx.reserveGold) continue;

    let score = 20;

    // 1. Economic & logistics priority (strongest early, scales down when saturated)
    const isEcoTech =
      !!tech.effect.gatherMultiplier ||
      !!tech.effect.gatherByType ||
      !!tech.effect.carryCapacityBonus;
    if (isEcoTech) {
      score += ctx.age <= 2 ? 32 : 16;
      if (ctx.workerCount >= 5) score += 8;
    }

    // 2. Reactive counterplay vs enemy army composition
    if (enemyComposition.ranged >= 3) {
      const threatBonus = Math.min(18, enemyComposition.ranged * 3);
      if (tech.effect.rangedDefenseBonus) score += 36 + threatBonus;
      if (tech.effect.bonusVsCategory?.ranged) score += 34 + threatBonus;
    }
    if (enemyComposition.cavalry >= 2) {
      const threatBonus = Math.min(18, enemyComposition.cavalry * 4);
      if (tech.effect.bonusVsCategory?.cavalry) score += 40 + threatBonus;
    }
    if (enemyComposition.melee >= 3) {
      const threatBonus = Math.min(16, enemyComposition.melee * 3);
      if (tech.effect.bonusVsCategory?.melee) score += 32 + threatBonus;
      if (tech.effect.attackBonus) score += 12;
      if (tech.effect.defenseBonus) score += 10;
    }

    // 3. Fortification & siege arms race
    if (enemyComposition.fortificationCount >= 2) {
      if (tech.effect.siegeDamageMultiplier) score += 34;
    }
    if (tech.effect.buildingArmorBonus || tech.effect.buildingHpMultiplier || tech.effect.towerRangeBonus) {
      score += isDefensiveAi ? 30 : 10;
    }

    // 4. Mutually exclusive doctrine personality & tactical alignment
    if (tech.exclusiveGroup) {
      const isTurtleDoctrine =
        tech.id === 'shared_doctrine_elite' ||
        tech.id === 'med_doctrine_bastion' ||
        tech.id === 'ani_doctrine_barrier' ||
        tech.id === 'fan_doctrine_overgrowth';
      const isTempoDoctrine =
        tech.id === 'shared_doctrine_blitz' ||
        tech.id === 'med_doctrine_crusade' ||
        tech.id === 'ani_doctrine_assassination' ||
        tech.id === 'fan_doctrine_cataclysm';

      if (isTurtleDoctrine) {
        score += isDefensiveAi ? 30 : enemyComposition.ranged >= 4 ? 14 : 6;
      } else if (isTempoDoctrine) {
        score += isAggressiveAi ? 30 : !isDefensiveAi ? 18 : 2;
      }
    }

    // 5. General combat power & sustain
    if (tech.effect.hpRegenPerSec) score += 18;
    if (tech.effect.attackRateMultiplier) score += 16;
    if (tech.effect.hpMultiplier) score += 14;
    if (tech.effect.trainTimeMultiplier) score += isAggressiveAi ? 20 : 10;

    // Slight cost-efficiency tie-breaker
    const totalCost = (tech.cost.food || 0) + (tech.cost.wood || 0) + (tech.cost.gold || 0) + (tech.cost.stone || 0);
    score -= totalCost * 0.015;

    if (score > bestScore) {
      bestScore = score;
      best = cand;
    }
  }

  return best;
}

export const INITIAL_POPULATION_CAP = 8;
export const HOUSE_POPULATION_BONUS = 5;

export interface FactionPopulationStats {
  used: number;
  queued: number;
  totalReserved: number;
  max: number;
}

/**
 * Pure population calculator shared across simulation engine, AI planner, and HUD.
 * Population capacity comes exclusively from constructed housing/citadel structures (Town Center = 8, House = +5, Castle = +10, Citadel = +20).
 */
export function getFactionPopulationStats(
  faction: FactionId,
  buildings: Array<{
    faction: FactionId;
    hp: number;
    isConstructed: boolean;
    buildingDef: { populationProvided?: number };
    queue?: string[];
  }>,
  units: Array<{ faction: FactionId; hp: number }>
): FactionPopulationStats {
  let used = 0;
  for (const u of units) {
    if (u.faction === faction && u.hp > 0) used++;
  }

  let queued = 0;
  let max = 0;
  for (const b of buildings) {
    if (b.faction !== faction || b.hp <= 0) continue;
    if (b.queue && b.queue.length > 0) {
      queued += b.queue.length;
    }
    if (b.isConstructed && b.buildingDef.populationProvided) {
      max += b.buildingDef.populationProvided;
    }
  }

  return {
    used,
    queued,
    totalReserved: used + queued,
    max,
  };
}

export interface ResourceIncomeRate {
  food: number;
  wood: number;
  gold: number;
  stone: number;
}

export interface FactionResourceTelemetry {
  workersByResource: {
    food: number;
    wood: number;
    gold: number;
    stone: number;
    building: number;
    idle: number;
  };
  totalWorkers: number;
  incomePerMin: ResourceIncomeRate;
}

/**
 * Computes real-time worker allocation counts and estimated per-minute income
 * (active gatherers + held strategic shrines) for the HUD and AI.
 */
export function computeFactionResourceTelemetry(
  faction: FactionId,
  units: Array<
    Pick<
      UnitEntity,
      'faction' | 'hp' | 'state' | 'unitDef' | 'targetResourceNodeId' | 'carryingResource'
    >
  >,
  resourceNodes: Array<Pick<ResourceNode, 'id' | 'resourceType' | 'subtype' | 'nodeTier' | 'amount'>>,
  contestedPoints: Array<Pick<ContestedPoint, 'ownerFaction' | 'shrineType' | 'siegeSupplyActive'>>,
  researchedTechs: string[],
  hasStarOath = false
): FactionResourceTelemetry {
  const nodeById = new Map<
    string,
    Pick<ResourceNode, 'id' | 'resourceType' | 'subtype' | 'nodeTier' | 'amount'>
  >();
  for (const n of resourceNodes) {
    nodeById.set(n.id, n);
  }

  const workersByResource = {
    food: 0,
    wood: 0,
    gold: 0,
    stone: 0,
    building: 0,
    idle: 0,
  };
  const incomeRaw: ResourceIncomeRate = { food: 0, wood: 0, gold: 0, stone: 0 };
  let totalWorkers = 0;

  for (const u of units) {
    if (u.faction !== faction || u.hp <= 0 || u.unitDef.category !== 'worker') continue;
    totalWorkers++;

    if (u.state === 'building') {
      workersByResource.building++;
      continue;
    }

    if (u.state === 'gathering' || u.state === 'returning_resource') {
      const targetNode = u.targetResourceNodeId ? nodeById.get(u.targetResourceNodeId) : undefined;
      const resType: ResourceType | undefined =
        targetNode?.resourceType ?? u.carryingResource?.type;
      if (resType) {
        workersByResource[resType]++;
        const baseGatherPerSec = u.unitDef.stats.gatherSpeed || 0.5833;
        const mult = targetNode
          ? getEffectiveGatherMultiplier(targetNode, researchedTechs, hasStarOath)
          : getEffectiveGatherMultiplier(
              { resourceType: resType, subtype: resType === 'food' ? 'farm' : resType },
              researchedTechs,
              hasStarOath
            );
        incomeRaw[resType] += baseGatherPerSec * 60 * mult;
        continue;
      }
    }

    workersByResource.idle++;
  }

  // Add per-minute passive income from captured strategic shrines (shrine income ticks every 1s)
  for (const cp of contestedPoints) {
    if (cp.ownerFaction !== faction) continue;
    const perSec = getShrineIncome(cp.shrineType, cp.siegeSupplyActive);
    incomeRaw.food += perSec.food * 60;
    incomeRaw.wood += perSec.wood * 60;
    incomeRaw.gold += perSec.gold * 60;
    incomeRaw.stone += perSec.stone * 60;
  }

  return {
    workersByResource,
    totalWorkers,
    incomePerMin: {
      food: Math.round(incomeRaw.food),
      wood: Math.round(incomeRaw.wood),
      gold: Math.round(incomeRaw.gold),
      stone: Math.round(incomeRaw.stone),
    },
  };
}


