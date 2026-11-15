export type ResourceType = 'food' | 'wood' | 'gold' | 'stone';

export interface Resources {
  food: number;
  wood: number;
  gold: number;
  stone: number;
}

export type FactionId = string;

export type CivilizationId = 'medieval' | 'anime' | 'fantasy';

export type MapPresetId = 'river_valley' | 'highland_basin' | 'twin_lakes';
export type ResourceRichness = 'standard' | 'abundant';

export interface MatchParticipant {
  id: string;
  name: string;
  controller: 'player' | 'ai';
  team: number;
  civilization?: CivilizationId;
  colorHex: number;
  colorCss: string;
  accentHex: number;
}

export interface TerrainBlockedRect {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  kind: 'water' | 'cliff';
}

export interface TerrainBlockedDisc {
  x: number;
  z: number;
  radius: number;
  kind: 'water' | 'cliff';
}

export interface TerrainPassableBridge {
  x: number;
  z: number;
  halfWidth: number;
  halfLength: number;
  angle: number;
}

export type UnitCategory = 'melee' | 'ranged' | 'cavalry' | 'siege' | 'worker' | 'special';

export interface UnitStats {
  maxHp: number;
  attack: number;
  buildingAttack?: number; // Dedicated anti-building damage (torch / siege)
  ignoresBuildingArmor?: boolean; // True for dedicated siege engines / treants
  defense: number;
  rangedDefense?: number; // Extra pierce armor vs arrows & tower volleys
  range: number;
  speed: number;
  attackRate: number; // attacks per second
  cost: Resources;
  trainTime: number; // seconds
  gatherSpeed: number; // for workers (resources per sec)
  carryCapacity: number;
}

export interface UnitDefinition {
  id: string;
  name: string;
  factionPack: string; // 'medieval' | 'anime' | 'fantasy' | 'custom'
  category: UnitCategory;
  description: string;
  stats: UnitStats;
  visual: {
    color: string;
    modelType: 'villager' | 'swordsman' | 'archer' | 'knight' | 'ninja' | 'saiyan' | 'mage' | 'golem' | 'ram' | 'cannon';
    scale?: number;
    projectileType?: 'arrow' | 'fireball' | 'ki_blast' | 'slash';
    weaponColor?: string;
  };
  specialAbility?: {
    name: string;
    type: 'whirlwind' | 'ki_burst' | 'heal' | 'haste';
    cooldown: number;
    potency: number;
    description: string;
  };
  requiredAge?: AgeLevel;
}

export type AgeLevel = 1 | 2 | 3 | 4;

export type LandmarkType =
  | 'landmark_aachen'
  | 'landmark_barracks'
  | 'landmark_guildhall'
  | 'landmark_citadel'
  | 'landmark_observatory'
  | 'landmark_arsenal';

export type BuildingType =
  | 'town_center'
  | 'barracks'
  | 'archery_range'
  | 'farm'
  | 'lumber_camp'
  | 'mining_camp'
  | 'tower'
  | 'castle'
  | 'armory_forge'
  | 'spirit_shrine'
  | 'mana_well'
  | LandmarkType;

export interface TechDefinition {
  id: string;
  civId: CivilizationId | 'shared';
  buildingType: BuildingType;
  name: string;
  icon: string;
  description: string;
  effectLabel: string;
  cost: Resources;
  researchTime: number;
  requiredAge?: AgeLevel;
  targetCategories?: UnitCategory[];
  effect: {
    attackBonus?: number;
    defenseBonus?: number;
    rangedDefenseBonus?: number;
    hpMultiplier?: number;
    speedMultiplier?: number;
    gatherMultiplier?: number;
    cooldownMultiplier?: number;
    rangeBonus?: number;
    buildingArmorBonus?: number;
    buildingHpMultiplier?: number;
    siegeDamageMultiplier?: number;
    garrisonAttackBonus?: number;
    towerAttackRateMultiplier?: number;
    towerRangeBonus?: number;
  };
}

export interface BuildingDefinition {
  id: BuildingType;
  name: string;
  description: string;
  maxHp: number;
  cost: Resources;
  buildTime: number;
  trainableUnits: string[]; // unit definition IDs
  producesResource?: { type: ResourceType; amountPerSec: number };
  attack?: number;
  range?: number;
  buildingArmor?: number;
  maxGarrison?: number;
  canGarrisonAttack?: boolean;
  populationProvided?: number;
  size: number; // footprint collision radius
  isWall?: boolean;
  requiredAge?: AgeLevel;
  landmarkAgeAdvance?: AgeLevel;
  landmarkPerkDescription?: string;
  civExclusive?: CivilizationId;
}

export interface AiCondition {
  field:
    | 'food'
    | 'wood'
    | 'gold'
    | 'stone'
    | 'armyCount'
    | 'workerCount'
    | 'underAttack'
    | 'enemyProximity'
    | 'gameTime'
    | 'age'
    | 'buildingCount'
    | 'enemyArmyCount';
  operator: '>' | '<' | '>=' | '<=' | '==' | '!=';
  value: number;
}

export interface AiAction {
  type:
    | 'train_unit'
    | 'build'
    | 'gather_priority'
    | 'attack_player'
    | 'cluster_attack'
    | 'defend_base'
    | 'retreat_to_base'
    | 'patrol_mid'
    | 'advance_age';
  targetId?: string; // unitId, buildingType, resource focus, or age target
  priority: number;
}

export interface AiRule {
  id: string;
  name: string;
  enabled: boolean;
  conditions: AiCondition[];
  action: AiAction;
}

export interface GameMod {
  id: string;
  name: string;
  author: string;
  description: string;
  version: string;
  enabled: boolean;
  unitDefinitions: UnitDefinition[];
  balanceMultipliers: {
    gatherRate: number;
    unitHp: number;
    unitDamage: number;
    buildSpeed: number;
    moveSpeed: number;
  };
  aiRules: AiRule[];
}

export interface EntityCommon {
  id: string;
  faction: FactionId;
  team?: number;
  x: number;
  z: number;
  hp: number;
  maxHp: number;
}

export interface UnitEntity extends EntityCommon {
  type: 'unit';
  unitDefId: string;
  unitDef: UnitDefinition;
  targetX?: number;
  targetZ?: number;
  targetEntityId?: string;
  state: 'idle' | 'moving' | 'attacking' | 'gathering' | 'returning_resource' | 'building' | 'garrisoning';
  carryingResource?: { type: ResourceType; amount: number };
  targetResourceNodeId?: string;
  targetBuildingId?: string;
  targetGarrisonBuildingId?: string;
  garrisonedInBuildingId?: string;
  attackCooldown: number;
  abilityCooldown: number;
  velocity: { x: number; z: number };
  kills: number;
  xp?: number;
  level?: number;
  buffSpeedUntil?: number;
  buffDefenseBonus?: number;
  attackMoveGoal?: { x: number; z: number } | null;
  hitFlashTimer?: number;
  recoilTimer?: number;
  lastDamagedTime?: number;
  currentActionText?: string;
  waypoints?: Array<{ x: number; z: number }>;
  pathGoal?: { x: number; z: number };
  pathCooldown?: number;
  lastProgressCheckPos?: { x: number; z: number };
  stuckAccumulator?: number;
}

export interface BuildingEntity extends EntityCommon {
  type: 'building';
  buildingType: BuildingType;
  buildingDef: BuildingDefinition;
  civilization?: CivilizationId;
  isConstructed: boolean;
  buildProgress: number; // 0 to 1
  queue: string[]; // queue of unitDefIds
  queueProgress: number; // 0 to 1
  activeTechId?: string | null;
  researchProgress?: number; // 0 to 1
  rallyPoint?: {
    x: number;
    z: number;
    targetResourceNodeId?: string;
    targetBuildingId?: string;
    resourceType?: ResourceType;
    resourceSubtype?: ResourceNode['subtype'];
    label?: string;
  };
  attackCooldown: number;
  hitFlashTimer?: number;
  garrisonedUnitIds?: string[];
}

export interface ResourceNode {
  id: string;
  resourceType: ResourceType;
  subtype?: 'farm' | 'berry' | 'hunt' | 'wood' | 'gold' | 'stone';
  x: number;
  z: number;
  amount: number;
  maxAmount: number;
}

export interface Projectile {
  id: string;
  type: 'arrow' | 'fireball' | 'ki_blast' | 'slash';
  startX: number;
  startY: number;
  startZ: number;
  currentX: number;
  currentY: number;
  currentZ: number;
  targetEntityId: string;
  damage: number;
  speed: number;
  progress: number; // 0 to 1
  color: string;
}

export interface FloatingText {
  id: string;
  x: number;
  y: number;
  z: number;
  text: string;
  color: string;
  opacity: number;
  lifespan: number;
}

export interface GameStats {
  resourcesGathered: Resources;
  unitsTrained: number;
  unitsLost: number;
  enemiesKilled: number;
  buildingsConstructed: number;
  gameDuration: number;
}
