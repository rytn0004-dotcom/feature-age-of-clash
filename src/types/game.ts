export type ResourceType = 'food' | 'wood' | 'gold' | 'stone';

export interface Resources {
  food: number;
  wood: number;
  gold: number;
  stone: number;
}

export type FactionId = string;

export type CivilizationId = 'medieval' | 'anime' | 'fantasy' | 'mongol';

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
  /** AI only: standard attacks; defensive practices eco+walls, rarely attacks */
  aiPersonality?: 'easy' | 'standard' | 'hard' | 'defensive';
}

export interface TerrainBlockedRect {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  kind: 'water' | 'cliff';
  halfWidth?: number;
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
  bonusVsCategory?: Partial<Record<UnitCategory, number>>;
  hpRegenPerSec?: number;
}

export interface LeadershipAuraDefinition {
  /** Friendly units within this radius receive morale support. */
  radius: number;
  /** Extra morale recovered per simulated second while in range. */
  moraleRecoveryPerSecond: number;
  /** Fraction of morale shock absorbed, clamped to 0-0.5 at runtime. */
  moraleShockResistance: number;
  /** Fraction of incoming suppression absorbed, clamped to 0-0.5 at runtime. */
  suppressionResistance: number;
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
    modelType:
      | 'villager'
      | 'swordsman'
      | 'archer'
      | 'knight'
      | 'ninja'
      | 'saiyan'
      | 'mage'
      | 'guardian'
      | 'oracle'
      | 'artificer'
      | 'golem'
      | 'ram'
      | 'cannon'
      | 'boat'
      | 'horse_archer'
      | 'keshik'
      | 'shaman';
    scale?: number;
    projectileType?: 'arrow' | 'fireball' | 'ki_blast' | 'slash';
    weaponColor?: string;
  };
  isNaval?: boolean;
  leadershipAura?: LeadershipAuraDefinition;
  specialAbility?: {
    name: string;
    type: 'whirlwind' | 'ki_burst' | 'heal' | 'haste' | 'kiting_volley' | 'trample_charge' | 'sky_storm';
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
  | 'house'
  | 'barracks'
  | 'archery_range'
  | 'stable'
  | 'siege_workshop'
  | 'dock'
  | 'farm'
  | 'granary'
  | 'lumber_camp'
  | 'mining_camp'
  | 'wall'
  | 'gate'
  | 'tower'
  | 'castle'
  | 'armory_forge'
  | 'spirit_shrine'
  | 'mana_well'
  | 'ovoo_relay'
  | LandmarkType;

export interface TechDefinition {
  id: string;
  civId: CivilizationId | 'shared';
  buildingType: BuildingType;
  name: string;
  icon: string;
  roleTag?: string;
  description: string;
  effectLabel: string;
  cost: Resources;
  researchTime: number;
  requiredAge?: AgeLevel;
  prerequisiteTechId?: string;
  exclusiveGroup?: string;
  exclusiveLabel?: string;
  targetCategories?: UnitCategory[];
  effect: {
    attackBonus?: number;
    defenseBonus?: number;
    rangedDefenseBonus?: number;
    hpMultiplier?: number;
    speedMultiplier?: number;
    attackRateMultiplier?: number;
    gatherMultiplier?: number;
    gatherByType?: Partial<Record<ResourceType, number>>;
    carryCapacityBonus?: number;
    trainTimeMultiplier?: number;
    hpRegenPerSec?: number;
    bonusVsCategory?: Partial<Record<UnitCategory, number>>;
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
    | 'meleeCount'
    | 'rangedCount'
    | 'cavalryCount'
    | 'siegeCount'
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
  /** AI escort assignment links a frontline unit to the siege engine it screens. */
  siegeEscortTargetId?: string;
  state: 'idle' | 'moving' | 'attacking' | 'gathering' | 'returning_resource' | 'building' | 'assembling' | 'garrisoning';
  fieldAssemblyProjectId?: string;
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
  /** Temporary attack-speed aura from a Mongol Ovoo war horn. */
  buffAttackRateUntil?: number;
  /** Temporary armour reduction applied by Mangudai piercing volleys. */
  armorShredUntil?: number;
  armorShredAmount?: number;
  /** Temporary movement and attack slow from cavalry impact or Shaman storm. */
  slowUntil?: number;
  slowFactor?: number;
  attackMoveGoal?: { x: number; z: number } | null;
  /** Target-locked short retreat waypoint used by Mongol Mangudai hit-and-run combat. */
  kitingRetreatGoal?: { x: number; z: number; targetId: string };
  /** Current battlefield morale; lazily initialized to 100 for legacy saves. */
  morale?: number;
  /** Simulation time of the latest direct morale shock. */
  moraleLastHitAt?: number;
  /** Cooldown that prevents repeated rout loops after a unit rallies. */
  moraleRoutCooldownUntil?: number;
  /** Temporary forced retreat order for AI troops whose morale has collapsed. */
  moraleRoutGoal?: { x: number; z: number; until: number };
  /** Current suppressive-fire pressure, decays after incoming fire stops. */
  suppression?: number;
  suppressionLastHitAt?: number;
  /** Nearby allied commander currently supporting this unit's morale. */
  leadershipAuraSourceId?: string;
  /** Shared order identity used to keep manually selected and AI squads moving cohesively. */
  formationGroupId?: string;
  /** Shared order vector; all living members of a squad use the same origin and destination. */
  formationOrderOrigin?: { x: number; z: number };
  formationOrderGoal?: { x: number; z: number };
  /** Cached target and role-based point used to avoid retarget jitter during combat. */
  formationTacticalTargetId?: string;
  formationTacticalAnchor?: { x: number; z: number };
  formationTacticalGoal?: { x: number; z: number };
  formationTacticalRole?: 'frontline' | 'backline' | 'flank' | 'siege';
  /** True when this unit is part of a mixed infantry shield-wall screen. */
  formationTacticalShieldWall?: boolean;
  /** Repeating route used by guards assigned to patrol a friendly wall chain. */
  wallPatrolRoute?: Array<{ x: number; z: number }>;
  wallPatrolIndex?: number;
  hitFlashTimer?: number;
  recoilTimer?: number;
  lastDamagedTime?: number;
  currentActionText?: string;
  waypoints?: Array<{ x: number; z: number }>;
  pathGoal?: { x: number; z: number };
  pathCooldown?: number;
  lastProgressCheckPos?: { x: number; z: number };
  stuckAccumulator?: number;
  /** Continuous time below the movement-progress threshold while a path goal remains active. */
  stuckDuration?: number;
  /** Cooldown between forced A* refreshes after a sustained movement stall. */
  pathRecoveryCooldown?: number;
  /** Lifetime count of forced path refreshes triggered by movement-stall detection. */
  pathRecoveryCount?: number;
  /** Continuous assault on the same building (sapping / sustained torching) */
  siegeTargetId?: string;
  siegeChannelTime?: number;
  /** Naval transport cargo (unit ids loaded onto a transport boat) */
  transportCargoIds?: string[];
  /** Shift-queue: pending orders after current action finishes */
  commandQueue?: Array<
    | { type: 'move'; x: number; z: number }
    | { type: 'gather'; nodeId: string }
    | { type: 'attack'; targetId: string }
    | { type: 'build'; buildingId: string }
  >;
}

export interface BuildingEntity extends EntityCommon {
  type: 'building';
  buildingType: BuildingType;
  buildingDef: BuildingDefinition;
  civilization?: CivilizationId;
  /** Wall chain metadata keeps all segments from one drawing operation grouped. */
  wallChainId?: string;
  wallChainIndex?: number;
  wallChainSize?: number;
  /** World-space yaw for directional wall modules. */
  rotationY?: number;
  /** Gate state: open gates have no movement collision until closed again. */
  gateOpen?: boolean;
  /** Siege-breached wall segments remain repairable but allow units through. */
  wallBreached?: boolean;
  wallRepairPaid?: boolean;
  /** Linked nearby watchtower grants this segment additional armor. */
  wallTowerLinked?: boolean;
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
  lastAttackerFaction?: FactionId;
  ovooMode?: 'yam_relay' | 'sacred_extraction';
  ovooHornCooldown?: number;
}

export interface ResourceNode {
  id: string;
  resourceType: ResourceType;
  subtype?: 'farm' | 'berry' | 'hunt' | 'boar' | 'shore_fish' | 'deep_fish' | 'wood' | 'gold' | 'stone';
  /** Quality tier of the resource deposit: 'rich' mid-map veins yield +35% faster gathering and larger reserves */
  nodeTier?: 'standard' | 'rich';
  x: number;
  z: number;
  amount: number;
  maxAmount: number;
  /** Living hunt animals (山羌): HP while alive; carcass when animalHp <= 0 */
  animalHp?: number;
  animalMaxHp?: number;
  animalAlive?: boolean;
  /** Flee / wander velocity (world units per second) */
  animalVx?: number;
  animalVz?: number;
  /** Simulation time until which active panic fleeing persists after losing sight of danger */
  animalFleeUntil?: number;
  /** Cooldown after sustained panic or clean escape before another jittery sprint */
  animalFleeCooldown?: number;
  /** Remains disarmed until nearby threats leave the re-arm radius; prevents endless flee refreshes. */
  animalPanicSuppressed?: boolean;
  /** Aggressor identity and leash time for dangerous wildlife such as wild boars. */
  animalAggroTargetId?: string;
  animalAggroUntil?: number;
  /** Original habitat center; the boar returns here after disengaging from a hunt. */
  animalHomeX?: number;
  animalHomeZ?: number;
  /** Hysteresis latch: once a boar starts returning, it completes the return before chasing again. */
  animalReturningHome?: boolean;
  /** Simulation timestamp when the boar may attack again. */
  animalAttackCooldown?: number;
  /** Calm wander state machine timer & current target heading */
  animalWanderTimer?: number;
  animalWanderAngle?: number;
  animalWanderMoving?: boolean;
  /** Displacement-locked locomotion state for smooth quadrupedal animation */
  animalYaw?: number;
  animalMoveBlend?: number;
  animalGaitPhase?: number;
}

/** Temporary area effect created by the Mongol Steppe Shaman. */
export interface GroundZoneEffect {
  id: string;
  kind: 'sky_storm';
  faction: FactionId;
  team?: number;
  casterId?: string;
  x: number;
  z: number;
  radius: number;
  remaining: number;
  duration: number;
  tickAccum: number;
  damagePerTick: number;
  slowFactor: number;
}

/** Strategic shrine identity; each blessing supports a different army/economy plan. */
export type ShrineType = 'war' | 'harvest' | 'forge';

/** Neutral map objective: stand in the circle to capture; owner gains passive income + aura. */
export interface ContestedPoint {
  id: string;
  x: number;
  z: number;
  radius: number;
  ownerFaction: FactionId | 'neutral';
  captureProgress: number;
  capturingFaction?: FactionId;
  label: string;
  shrineType: ShrineType;
  /** Seconds continuously held by current owner — unlocks shrine blessing */
  holdTime: number;
  /** Owner has secured long enough for army-wide anti-building supply */
  siegeSupplyActive: boolean;
  /** True whenever opposing teams/factions are simultaneously contesting inside the circle */
  isContested?: boolean;
  /** Active factions currently present inside the capture ring */
  contestingFactions?: FactionId[];
}

/** Medieval-inspired structure assault methods (no residual burn DoT). */
export type BuildingAssaultMethod =
  | 'torch'
  | 'sap'
  | 'arrow_chip'
  | 'cavalry_harass'
  | 'ram'
  | 'blast'
  | 'greek_fire';

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
