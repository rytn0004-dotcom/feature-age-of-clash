import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { groupEntitiesByFaction, rebuildEntityIdIndex } from './entityLookup';
import { activateNextUnitCommand, enqueueCommandsForUnits, enqueueUnitCommand, takeNextUnitCommand } from './commandQueue';
import { createUnitLodHighDetailSet } from './unitLodSelection';
import { hasAmbientBuildingAnimation } from './ambientBuildingAnimation';
import { removeBuildingScaffoldFromRoot } from './buildingScaffoldLifecycle';
import { isFishAnimationSubtype } from './fishAnimationRegistry';
import { getWildlifeBadgePresentation } from './wildlifeBadge';
import { initializeWildlifeSimulationState } from './wildlifeInitialization';
import {
  countNearbyCombatForces,
  createCombatSpatialIndex,
  queryCombatSpatialIndex,
  rebuildCombatSpatialIndexInPlace,
  type CombatSpatialCandidates,
  type CombatSpatialIndex,
} from './combatSpatialIndex';
import {
  AgeLevel,
  BuildingEntity,
  BuildingType,
  CivilizationId,
  FactionId,
  FloatingText,
  GroundZoneEffect,
  GameMod,
  GameStats,
  LandmarkType,
  MapPresetId,
  MatchParticipant,
  Projectile,
  ResourceNode,
  ResourceRichness,
  ResourceType,
  Resources,
  TechDefinition,
  UnitDefinition,
  UnitEntity,
  ContestedPoint,
} from '../types/game';
import {
  DEFAULT_BUILDINGS,
  INITIAL_MODS,
  SHARED_UNITS,
  DEFAULT_AI_RULES,
  DEFENSIVE_AI_RULES,
  EASY_AI_RULES,
  HARD_AI_RULES,
} from './mods';
import {
  applyCivilizationAndTechStats,
  canResearchTech,
  canUnitGainXp,
  computeUnitXpGain,
  dampAngle,
  dampScalar,
  findTechDef,
  getAllTechsForBuilding,
  getAvailableTechsForBuilding,
  getBuildableTypesForCiv,
  getCivilizationConfig,
  getCivilizationBuildSpeedMultiplier,
  getCappedProductionSpeedMultiplier,
  getEffectiveProductionDuration,
  getEffectiveUnitTrainingDuration,
  PRODUCTION_TIME_SCALE,
  getLandmarkTrainingSpeedMultiplier,
  isBuildingBuildableForCiv,
  getLevelTitle,
  getResourceGatherTechMultiplier,
  getTrainableUnitsForBuilding,
  getTrainingTimeMultiplier,
} from './civilizations';
import { evaluateMongolOvooPolicy, hasNearbyHostileUnit } from './mongolAi';
import { getMongolKitingRetreatGoal } from './mongolCombatTactics';
import { getDirectionalAttackModifier } from './combatTactics';
import { applyMoraleImpact, getMoraleCombatModifiers, getMoraleRoutGoal, shouldUnitRout } from './combatMorale';
import { applySuppressionImpact, decaySuppression, getSuppressionCombatModifiers, getSuppressionImpact } from './combatSuppression';
import {
  AGE_ADVANCE_HOTKEY,
  FIELD_ENGINEERING_HOTKEY,
  eventCodeToHotkeyLabel,
  findBuildingTypeByHotkey,
  findTechIdByHotkey,
  findTrainingUnitByHotkey,
  UNGARRISON_HOTKEY,
} from './hotkeys';
import {
  addResources,
  applyBalanceMultipliers,
  areHostile,
  calculateBuildingDamage,
  calculateDamage,
  getBuildingAssaultProfile,
  getSiegeChannelMultiplier,
  canAfford,
  canAssembleFieldRam,
  shouldPrioritizeAiFieldEngineering,
  shouldAiUnitSeekShelter,
  shouldAiUnitLeaveShelter,
  countPendingGarrisonReservations,
  getAvailableGarrisonSlots,
  selectNearestGarrisonShelter,
  resolveAiKnightUnitId,
  selectSiegeEscortAssignments,
  FIELD_RAM_COST,
  FIELD_RAM_ASSEMBLY_DURATION,
  FIELD_RAM_TECH_ID,
  canUnitGatherNode,
  computeAiWorkerAllocation,
  shouldAiQueueWorker,
  selectAiWorkerResourceType,
  selectBestForwardGoldNode,
  selectAiWorkerReassignment,
  shouldRelocateFromResourceNode,
  estimateAiResourceCampPaybackSeconds,
  shouldAiSaveForNextAge,
  shouldAiDeferOptionalMilitaryProduction,
  calculateWallChainCost,
  WallChainPoint,
  layoutWallChain,
  computeBuildingVisualState,
  computeFactionResourceTelemetry,
  estimateConstructionTimeRemaining,
  getConstructionWorkerMultiplier,
  computeGarrisonDefenseProfile,
  computeSimulationSubsteps,
  computeSpatialAudioGain,
  computeStridePhaseDelta,
  createDefaultParticipants,
  deductCost,
  evaluateAiPlan,
  evaluateAiTechChoice,
  FactionResourceTelemetry,
  FARM_RESEED_WOOD_COST,
  findBestFoodResourceNode,
  findClosestEnemy,
  findClosestResourceNode,
  generateSpawnPositions,
  getBuildingMaxGarrison,
  getDistance,
  getEffectiveBuildingArmor,
  getEffectiveGatherMultiplier,
  getFactionPopulationStats,
  getFoodGatherMultiplier,
  getFoodSourcePriority,
  getNodeTierGatherMultiplier,
  advanceStarRelicChannel,
  pickStarRelicSite,
  resolveStarRelicDelivery,
  starRelicChannelComplete,
  starRelicShouldFall,
  STAR_RELIC_CHANNEL_SEC,
  STAR_RELIC_CARRY_SPEED,
  STAR_RELIC_OATH_GATHER,
  STAR_RELIC_OATH_SEC,
  STAR_RELIC_PICKUP_RANGE,
  getUnitVsUnitDamage,
  getShrineIncome,
  getShrineBlessingHoldTime,
  getTeamVisualColor,
  shouldShowUnitHealthBar,
  computeParticleBurstCount,
  summarizeFrameTimes,
  evaluateContestedPresence,
  getContestedShrineSummary,
  stepWildAnimalState,
  triggerWildAnimalPanic,
  stepWildBoarState,
  triggerWildBoarAggression,
  selectWildBoarAggroTarget,
  getWildBoarRangedHuntPlan,
  isAllAiMatch,
  MatchWinnerSummary,
  resolveMatchOutcome,
  assignRaidTargets,
  layoutCombatFormation,
  selectClusterFocusTarget,
  selectOptimalCombatTarget,
  shouldSwitchCombatTarget,
  type CombatTargetContext,
  isWallLinkedToTower,
  shouldBreachWallAfterSiegeHit,
  WALL_REPAIR_COST,
} from './rules';
import { estimateDeliveredResourcePerMinute } from './economyInsights';
import {
  getBuildingCollisionRadius,
  getResourceColliderRadius,
  getUnitColliderRadius,
  isPlacementLocationValid,
  isPointInTerrainObstacle,
  resolveUnitBuildingCollisions,
  resolveUnitResourceCollisions,
  resolveUnitUnitCollisions,
} from './collision';
import { buildNavGrid, buildWaterNavGrid, findPath, NavGrid, TerrainNavObstacles, worldToGrid } from './pathfinding';
import { generateMapLayout, MapLayoutResult } from './mapGenerator';
import { BattleStressRole, BattleStressUnitCount, createBattleStressPlan } from './battleStress';
import { updateAmbientTreeWind } from './ambientTreeWind';
import { RoundRobinBatch } from './roundRobinBatch';
import { advanceAiDecisionScheduler, type AiDecisionSchedulerState } from './aiDecisionScheduler';
import {
  formatPerformanceTelemetryCsv,
  getAverageAiDecisionMs,
  recordAiDecisionTiming,
  EMPTY_AI_DECISION_TIMING,
  getAveragePathSearchMs,
  recordPathSearchTiming,
  EMPTY_PATH_SEARCH_TIMING,
  type AiDecisionTiming,
  type PathSearchTiming,
  type PerformanceSample,
} from './performanceTelemetry';
import {
  advanceMovementStallDuration,
  MOVEMENT_STALL_SAMPLE_INTERVAL_SECONDS,
  MOVEMENT_STALL_RECOVERY_COOLDOWN_SECONDS,
  MOVEMENT_STALL_RECOVERY_SECONDS,
  shouldRecoverStalledPath,
} from './movementDiagnostics';
import {
  findNarrowPassageOnRoute,
  getFormationCohesionSpeedScale,
  getFormationMoveProgress,
  getFormationNarrowPassageTrafficScale,
  getFormationTacticalSlot,
  groupStalledFormationUnits,
  measureFormationRegroup,
  shouldRefreshFormationTacticalSlot,
  shouldAiCavalryDisengage,
  type FormationMovementMember,
  type FormationTacticalMember,
  type FormationTacticalRole,
  type FormationNarrowPassage,
  type FormationRegroupState,
} from './formationMovement';
type FormationRegroupRuntimeState = FormationRegroupState & {
  members: FormationMovementMember[];
  narrowPassage?: FormationNarrowPassage;
};

import {
  ControlGroupsMap,
  createEmptyControlGroups,
  pruneControlGroups,
  updateControlGroup,
} from './controlGroups';
import { sound } from './audio';
import {
  applyBuildingConstructionVisuals,
  applyBuildingDamageVisuals,
  updateBuildingAgeVisuals,
  applyWallBreachVisuals,
  updateGateDoorAnimation,
  applyTerrainBiomeMaterial,
  createBerryBushMesh,
  createBuildingMesh,
  createContestedShrineMesh,
  createCommandRingMesh,
  createDeepFishMesh,
  createDeerMesh,
  createWildBoarMesh,
  createEnvironmentFeaturesGroup,
  createGoldMineMesh,
  createRallyFlagMesh,
  createBuildingRubbleBatch,
  addBuildingRubbleDecal,
  setBuildingRubbleDecalScale,
  BuildingRubbleBatch,
  createResourceDepletionBatch,
  addResourceDepletionRemnant,
  ResourceDepletionBatch,
  createSettlementEnvironment,
  disposeSettlementEnvironment,
  createSelectionRing,
  createShoreFishMesh,
  createStoneQuarryMesh,
  createTreeMesh,
  createUnitMesh,
  createUnitContactShadowBatch,
  createUnitFactionRingBatch,
  createUnitRoleMarkerBatch,
  createUnitBuffRingBatch,
  updateUnitVisualLod,
  updateBuildingVisualLod,
  updateDistanceShadowLod,
  disposeBuildingVisualResources,
  registerFactionVisual,
  DeerAnimParts,
  WildBoarAnimParts,
  UnitAnimParts,
  updateBadgeSprite,
  updateFarmCropVisual,
  updateResourceNodeDepletionVisual,
} from './proceduralGraphics';
import {
  attachKayKitTreeLod,
  updateTreeVisualLod,
  attachDeerAssetLod,
  updateDeerVisualLod,
  updateDeerAssetAnimation,
  attachFishAssetLod,
  updateFishVisualLod,
  updateFishAssetAnimations,
} from './modelAssets';
import { getCraggyRockMaps, getFoliagePBRMaps, getTreeBarkMaps, getWaterRippleNormalMap } from './proceduralTextures';
import {
  findNearestRepairableWall,
  findNearestWallEndpoint,
  isWallChainPointTooClose,
  planWallChainExtension,
  type WallEndpointSnap,
} from './wallSnapping';
import {
  assignWorkersToConstructionTargets,
  getConstructionApproachPoint,
} from './constructionApproach';

type ParticleKind = 'hit' | 'spark' | 'wood' | 'gold' | 'stone' | 'leaf' | 'meat' | 'dust' | 'smoke' | 'ember';

type ParticleRenderLayer = 'solid' | 'smoke';

interface PooledParticle {
  instanceId: number;
  renderLayer: ParticleRenderLayer;
  kind: ParticleKind;
  x: number;
  y: number;
  z: number;
  rotationX: number;
  rotationY: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  baseScale: number;
  scale: number;
  active: boolean;
}

interface FieldSiegeProject {
  id: string;
  faction: FactionId;
  x: number;
  z: number;
  progress: number;
  duration: number;
  builderUnitIds: string[];
  mesh: THREE.Group;
  progressRing: THREE.Mesh;
}

interface AiEconomyFlowState {
  sampledAt: number;
  resources: Resources;
  netRates: Partial<Record<ResourceType, number>>;
}

const AI_ECONOMY_FLOW_SAMPLE_INTERVAL_SECONDS = 12;
const AI_WORKER_REBALANCE_INTERVAL_SECONDS = 6;
const MAX_WALL_CHAIN_SEGMENTS = 120;
const BUILD_APPROACH_CANDIDATE_COUNT = 8;
const BUILD_APPROACH_RETRY_DELAY_SECONDS = 1.6;
const MAX_PERFORMANCE_SAMPLES = 3600;

export class RtsEngine {
  public container: HTMLElement;
  public renderer!: THREE.WebGLRenderer;
  public scene!: THREE.Scene;
  public camera!: THREE.PerspectiveCamera;
  public isSoftwareGl = false;

  private frameId = 0;
  private isDestroyed = false;
  private performanceOverlay: HTMLDivElement | null = null;
  private performanceOverlayVisible = false;
  private performanceFrameCount = 0;
  private performanceWindowStart = 0;
  private performanceLastFrameTime = 0;
  private performanceFrameTimes: number[] = [];
  private performanceSimulationTotalMs = 0;
  private performanceSimulationMaxMs = 0;
  private performanceRenderCallTotalMs = 0;
  private performanceRenderCallMaxMs = 0;
  private pathSearchTiming: PathSearchTiming = { ...EMPTY_PATH_SEARCH_TIMING };
  private performanceCaptureStartedAt = 0;
  private performanceSamples: PerformanceSample[] = [];
  private qualityWindowStart = 0;
  private qualityFrameCount = 0;
  private qualityLevel: 0 | 1 | 2 = 2;
  private lowFpsSamples = 0;
  private highFpsSamples = 0;
  private qualityCooldownUntil = 0;

  // RTS Multi-Participant & Team State
  public participants: MatchParticipant[] = createDefaultParticipants();
  public isSpectatorMode = false;
  public battleStressInfo: { unitCount: number; seed: number; mapPreset: MapPresetId } | null = null;
  public humanPlayerId: string = 'player';
  public humanTeam: number = 1;
  public observedFactionId: FactionId = 'player';
  public resourcesByFaction: Record<string, Resources> = {};
  private aiEconomyFlowByFaction = new Map<string, AiEconomyFlowState>();
  private aiWorkerRebalanceReadyAt = new Map<string, number>();
  private aiNodeRelocationReadyAt = new Map<string, number>();
  private aiCampPlacementReadyAt = new Map<string, number>();
  public playerResources: Resources = { food: 250, wood: 200, gold: 120, stone: 60 };
  public enemyResources: Resources = { food: 250, wood: 200, gold: 120, stone: 60 };
  public activeMods: GameMod[] = JSON.parse(JSON.stringify(INITIAL_MODS));

  public units: UnitEntity[] = [];
  public buildings: BuildingEntity[] = [];
  private combatSpatialIndex: CombatSpatialIndex<UnitEntity, BuildingEntity> | null = null;
  /** Cached commander candidates; roster changes rebuild this small list only once. */
  private battlefieldLeadershipRosterSource: UnitEntity[] | null = null;
  private battlefieldLeadershipRosterLength = -1;
  private battlefieldLeadershipCandidates: UnitEntity[] = [];
  private battlefieldLeadershipUnitByFaction = new Map<string, UnitEntity>();
  private battlefieldLeadershipScoreByFaction = new Map<string, number>();
  private battlefieldLeadershipUnits: UnitEntity[] = [];
  private formationRegroupRefreshAccumulator = 0.15;
  private combatUnitLookupById = new Map<string, UnitEntity>();
  private combatUnitLookupSource: UnitEntity[] | null = null;
  private combatUnitLookupLength = -1;
  private combatBuildingLookupById = new Map<string, BuildingEntity>();
  private combatBuildingLookupSource: BuildingEntity[] | null = null;
  private combatBuildingLookupLength = -1;
  /** Synchronous caller-owned query outputs; target selection consumes them immediately. */
  private combatTargetQueryScratch: CombatSpatialCandidates<UnitEntity, BuildingEntity> = {
    units: [],
    buildings: [],
  };
  private cavalryRetreatQueryScratch: CombatSpatialCandidates<UnitEntity, BuildingEntity> = {
    units: [],
    buildings: [],
  };
  public resourceNodes: ResourceNode[] = [];
  public contestedPoints: ContestedPoint[] = [];
  private starRelicPhase: 'waiting' | 'ground' | 'carried' | 'spent' = 'waiting';
  private starRelicX = 0;
  private starRelicZ = 0;
  private starRelicChannel = 0;
  private starRelicCarrierId: string | null = null;
  private starRelicMesh: THREE.Group | null = null;
  /** Faction id -> simTime when the star-oath buff expires */
  private starOathUntil: Record<string, number> = {};
  public projectiles: Projectile[] = [];
  public groundZones: Array<GroundZoneEffect & { mesh: THREE.Group }> = [];
  public floatingTexts: FloatingText[] = [];
  private contestedMeshes = new Map<string, THREE.Group>();
  private contestedIncomeAcc = new Map<string, number>();
  /** One-time stash claimed per shrine id on first capture this match */
  private contestedFirstLootClaimed = new Set<string>();

  // Map Preset & Terrain Obstacles
  public mapPreset: MapPresetId = 'river_valley';
  public resourceRichness: ResourceRichness = 'standard';
  public mapLayout: MapLayoutResult | null = null;
  private environmentGroup: THREE.Group | null = null;
  private settlementEnvironmentGroup: THREE.Group | null = null;
  private terrainMesh: THREE.Mesh | null = null;

  // Pathfinding Navigation Grid Cache (land + naval waterway)
  private navGrid: NavGrid | null = null;
  private navGridDirty = true;
  private waterNavGrid: NavGrid | null = null;
  private waterNavGridDirty = true;
  /** Cached route lengths are tied to a specific immutable navigation-grid instance. */
  private economyDeliveryRouteCache = new WeakMap<NavGrid, Map<string, number>>();

  // Reusable Raycaster & HUD Sync Throttle
  private raycaster = new THREE.Raycaster();
  private pointerNdc = new THREE.Vector2();
  private lastHudResSyncTime = 0;

  // Control Groups (1-9) & Quick Cycling Indices
  public controlGroups: ControlGroupsMap = createEmptyControlGroups();
  private lastGroupKeyTime: Record<number, number> = {};
  private movementGroupSequence = 0;
  private formationRegroupByGroup = new Map<string, FormationRegroupRuntimeState>();
  private formationTacticalMembersByGroup = new Map<string, FormationTacticalMember[]>();
  private formationPassageCacheByGroup = new Map<
    string,
    { grid: NavGrid; scannedAt: number; passage: FormationNarrowPassage | null }
  >();
  private idleCycleIdx = 0;
  private militaryBldgCycleIdx = 0;

  // Minimap Direct Order Ping
  public lastMinimapPing: { x: number; z: number; type: 'move' | 'attack'; time: number } | null = null;

  // Meshes cache
  private unitMeshes = new Map<string, THREE.Group>();
  private unitContactShadowBatch: THREE.InstancedMesh | null = null;
  private unitFactionRingBatch: THREE.InstancedMesh | null = null;
  private unitRoleCrestBatch: THREE.InstancedMesh | null = null;
  private unitRoleSiegeBatch: THREE.InstancedMesh | null = null;
  private unitBuffRingBatch: THREE.InstancedMesh | null = null;
  private unitDecorationDummy = new THREE.Object3D();
  private unitDecorationColor = new THREE.Color();
  private unitDecorationInstanceCursor = 0;
  private unitRoleCrestInstanceCursor = 0;
  private unitRoleSiegeInstanceCursor = 0;
  private unitBuffRingInstanceCursor = 0;
  private buildingMeshes = new Map<string, THREE.Group>();
  /** Building meshes with animated flags/crystals only; static buildings are omitted from the per-tick animation pass. */
  private animatedBuildingMeshes = new Set<THREE.Group>();
  private nodeMeshes = new Map<string, THREE.Group>();
  /** Static membership index for tree-only ambient animation; excludes animals and resource nodes. */
  private windAnimatedNodeMeshes = new Set<THREE.Group>();
  /** Only fish resource roots are visited by the per-frame external swim-animation pass. */
  private fishAnimatedNodeMeshes = new Set<THREE.Group>();
  /** Bounded round-robin queue for resource-node distance LOD and shadow updates. */
  private resourceVisualLodQueue = new RoundRobinBatch<THREE.Group>((mesh) => String(mesh.userData.id ?? ''));
  private depletedResourceBatch: ResourceDepletionBatch | null = null;
  private projectileMeshes = new Map<string, { mesh: THREE.Mesh; type: Projectile['type'] }>();
  private projectilePool: Record<Projectile['type'], THREE.Mesh[]> = {
    arrow: [],
    fireball: [],
    ki_blast: [],
    slash: [],
  };
  private projectileAssets: Record<Projectile['type'], { geo: THREE.BufferGeometry; mat: THREE.Material }> | null = null;
  private selectionRings = new Map<string, THREE.Mesh>();
  private commandIndicators: Array<{ mesh: THREE.Mesh; age: number; maxAge: number }> = [];
  private fieldSiegeProjects: FieldSiegeProject[] = [];
  private rallyFlagMesh: THREE.Group | null = null;
  private rallyLineMesh: THREE.Line | null = null;

  // Civilization Progression & Research State
  public researchedTechsByFaction: Record<string, string[]> = {};
  public autoReseedFarmsByFaction: Record<string, boolean> = {};
  public pendingCommandMode: 'normal' | 'attack_move' = 'normal';

  // Pooled 3D Particle VFX, KO Topples, Shockwaves & World Animation Clock
  private simTime = 0;
  private lastHudSelectionSyncTime = 0;
  private lastTimerSec = -1;
  private particlePool: PooledParticle[] = [];
  private particleCursor = 0;
  private particleSolidBatch: THREE.InstancedMesh | null = null;
  private particleSmokeBatch: THREE.InstancedMesh | null = null;
  private particleColors: Record<ParticleKind, THREE.Color> | null = null;
  private particleDummy = new THREE.Object3D();
  private dyingEffects: Array<{ mesh: THREE.Group; age: number; duration: number; startY: number }> = [];
  private collapsingBuildings: Array<{
    mesh: THREE.Group;
    age: number;
    duration: number;
    footprint: number;
    startX: number;
    startZ: number;
    dustTimer: number;
  }> = [];
  private rubbleDecalBatch: BuildingRubbleBatch | null = null;
  private rubbleDecals: Array<{ slot: number; age: number; maxAge: number }> = [];
  private shockwaveRings: Array<{ mesh: THREE.Mesh; age: number; maxAge: number; maxScale: number }> = [];

  // Tactical Event Alert State (Enemy spotted / Under attack / Resource depleted)
  public lastAttackAlert: { x: number; z: number; time: number; active: boolean } | null = null;
  public lastTacticalBroadcast: {
    kind: 'enemy_spotted' | 'under_attack' | 'resource_depleted' | 'relic';
    message: string;
    x: number;
    z: number;
    time: number;
  } | null = null;
  private lastAttackSoundTime = 0;
  private lastAttackBroadcastTime = 0;
  private lastEnemySpottedBroadcastTime = 0;
  private enemySpottedCheckAccumulator = 0;

  // Age Advancement (世紀帝國4 時代升級系統)
  public ageByFaction: Record<string, AgeLevel> = {};
  public landmarksByFaction: Record<string, LandmarkType[]> = {};
  public playerAge: AgeLevel = 1;
  public enemyAge: AgeLevel = 1;
  public playerLandmarks: LandmarkType[] = [];
  public enemyLandmarks: LandmarkType[] = [];

  // Selection & Inspection (Player can command only human units; others are inspect-only)
  public selectedUnitIds: string[] = [];
  public selectedBuildingId: string | null = null;
  public selectedNodeId: string | null = null;
  public selectedContestedPointId: string | null = null;
  public inspectedEntity: { type: 'unit' | 'building'; id: string; faction: FactionId } | null = null;
  public showOverheadBadges = true;
  private contestedUiRefreshAcc = 0;

  // Placement mode
  public placementBuildingType: BuildingType | null = null;
  private placementGhostMesh: THREE.Group | null = null;
  public wallPlacementPoints: WallChainPoint[] = [];
  private wallPlacementCursor: WallChainPoint | null = null;
  private wallPlacementPreviewGroup: THREE.Group | null = null;
  private wallPlacementPreviewGhosts: THREE.Group[] = [];
  private wallPlacementPreviewMarkers: THREE.Mesh[] = [];
  private wallPlacementPreviewLine: THREE.Line | null = null;
  private wallPlacementPreviewIsValid = false;
  private wallPlacementGhostTemplate: THREE.Group | null = null;
  private wallPlacementSnapTargetId: string | null = null;
  private wallPlacementPointSnaps: Array<WallEndpointSnap<BuildingEntity> | null> = [];
  private wallRepairPreviewMesh: THREE.Group | null = null;
  private wallRepairPreviewTargetId: string | null = null;
  private wallRepairPreviewRing: THREE.Mesh | null = null;

  // Camera navigation (zoom + keyboard + screen edge panning)
  public cameraTarget = new THREE.Vector3(0, 0, 0);
  public cameraZoom = 1.0;
  private cameraTargetZoom = 1.0;
  private cameraDesiredTarget: THREE.Vector3 | null = null;
  private cameraPanVelX = 0;
  private cameraPanVelZ = 0;
  private unitLodAccumulator = 0;
  private buildingLodAccumulator = 0;
  private resourceLodAccumulator = 0;
  private edgeScrollDirX = 0;
  private edgeScrollDirZ = 0;
  private keysHeld = new Set<string>();
  private cleanupWindowListeners: Array<() => void> = [];

  // Game stats
  public stats: GameStats = {
    resourcesGathered: { food: 0, wood: 0, gold: 0, stone: 0 },
    unitsTrained: 0,
    unitsLost: 0,
    enemiesKilled: 0,
    buildingsConstructed: 0,
    gameDuration: 0,
  };

  // State
  public gameState: 'title' | 'playing' | 'paused' | 'gameover' = 'title';
  public gameOverResult: 'victory' | 'defeat' | null = null;
  public gameOverWinner: MatchWinnerSummary | null = null;
  public gameSpeed = 1.0;

  // AI Timer
  private aiUnitGroupsSource: UnitEntity[] | null = null;
  private aiUnitGroupsLength = -1;
  private aiUnitGroupsByFaction = new Map<string, UnitEntity[]>();
  private aiBuildingGroupsSource: BuildingEntity[] | null = null;
  private aiBuildingGroupsLength = -1;
  private aiBuildingGroupsByFaction = new Map<string, BuildingEntity[]>();
  private aiDecisionFactionIds: FactionId[] = [];
  private aiDecisionSchedulerState: AiDecisionSchedulerState = { accumulatorSeconds: 0, cursor: 0 };
  private aiDecisionCount = 0;
  private aiDecisionTiming: AiDecisionTiming = { ...EMPTY_AI_DECISION_TIMING };
  private aiPathRecoveryTotal = 0;

  // Callbacks for UI updates
  public onStateChange?: () => void;
  public onResourcesChange?: (res: Resources) => void;
  public onSelectionChange?: () => void;
  public onRequestOpenAgeModal?: () => void;

  constructor(container: HTMLElement) {
    this.container = container;
    this.initThree();
    this.setupWorld();
    this.bindEvents();
    this.startLoop();
  }

  private initThree() {
    this.isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.container.appendChild(this.renderer.domElement);
    this.createPerformanceOverlay();

    this.scene = new THREE.Scene();
    this.unitContactShadowBatch = createUnitContactShadowBatch();
    this.unitFactionRingBatch = createUnitFactionRingBatch();
    this.unitRoleCrestBatch = createUnitRoleMarkerBatch('crest');
    this.unitRoleSiegeBatch = createUnitRoleMarkerBatch('siege');
    this.unitBuffRingBatch = createUnitBuffRingBatch();
    this.scene.add(
      this.unitContactShadowBatch,
      this.unitFactionRingBatch,
      this.unitRoleCrestBatch,
      this.unitRoleSiegeBatch,
      this.unitBuffRingBatch,
    );
    this.scene.background = new THREE.Color(0xc4e0f2);
    this.scene.fog = new THREE.FogExp2(0xc4e0f2, 0.0044);

    // Procedural Sky Dome with Horizon-to-Zenith Atmospheric Gradient
    const skyGeo = new THREE.SphereGeometry(260, 28, 16);
    const skyPos = skyGeo.attributes.position;
    const skyColors = new Float32Array(skyPos.count * 3);
    const horizonCol = new THREE.Color(0xd2e9f7);
    const midSkyCol = new THREE.Color(0x7ac0ea);
    const zenithCol = new THREE.Color(0x3677bd);
    const tmpSkyCol = new THREE.Color();
    for (let i = 0; i < skyPos.count; i++) {
      const py = skyPos.getY(i);
      const t = Math.max(0, Math.min(1, py / 210));
      if (t < 0.35) {
        tmpSkyCol.lerpColors(horizonCol, midSkyCol, t / 0.35);
      } else {
        tmpSkyCol.lerpColors(midSkyCol, zenithCol, (t - 0.35) / 0.65);
      }
      skyColors[i * 3] = tmpSkyCol.r;
      skyColors[i * 3 + 1] = tmpSkyCol.g;
      skyColors[i * 3 + 2] = tmpSkyCol.b;
    }
    skyGeo.setAttribute('color', new THREE.BufferAttribute(skyColors, 3));
    const skyDome = new THREE.Mesh(
      skyGeo,
      new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false })
    );
    skyDome.name = 'skyDome';
    this.scene.add(skyDome);

    // Studio Environment map
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    // Isometric tilt RTS camera
    const aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(42, aspect, 1, 380);
    this.updateCameraPosition();

    // Lighting: Warm golden key sun + cool sky/earth hemisphere + atmospheric rim backlight
    const sunLight = new THREE.DirectionalLight(0xfff1d2, 2.05);
    sunLight.position.set(44, 62, 32);
    sunLight.castShadow = !this.isSoftwareGl;
    const shadowRes = this.isSoftwareGl ? 1024 : 2048;
    sunLight.shadow.mapSize.width = shadowRes;
    sunLight.shadow.mapSize.height = shadowRes;
    sunLight.shadow.camera.near = 10;
    sunLight.shadow.camera.far = 160;
    const d = 48;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.bias = -0.0004;
    sunLight.shadow.normalBias = 0.025;
    this.scene.add(sunLight);

    const hemiLight = new THREE.HemisphereLight(0xaad8ff, 0x3b4e24, 0.96);
    this.scene.add(hemiLight);

    const rimLight = new THREE.DirectionalLight(0x93c5fd, 0.64);
    rimLight.position.set(-38, 40, -34);
    rimLight.castShadow = false;
    this.scene.add(rimLight);

    // Terrain Plane with level playable arena [-90..90] and sculpted rolling outer hills
    const terrainGeo = new THREE.PlaneGeometry(240, 240, 56, 56);
    terrainGeo.rotateX(-Math.PI / 2);
    const posAttr = terrainGeo.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      const vx = posAttr.getX(i);
      const vz = posAttr.getZ(i);
      const edgeDist = Math.max(Math.abs(vx), Math.abs(vz)) - 90;
      if (edgeDist > 0) {
        const ridge =
          Math.sin(vx * 0.14) * Math.cos(vz * 0.14) * 1.4 +
          Math.sin((vx + vz) * 0.08) * 1.1;
        const elev = Math.min(8.5, edgeDist * 0.24 + Math.max(0, ridge) * (edgeDist / 16));
        posAttr.setY(i, elev);
      }
    }
    terrainGeo.computeVertexNormals();
    this.applyTerrainVertexColors(terrainGeo, this.mapPreset);

    const terrainMat = new THREE.MeshStandardMaterial({
      roughness: 0.9,
      metalness: 0.03,
      vertexColors: true,
    });
    applyTerrainBiomeMaterial(terrainMat, this.mapPreset);
    const terrain = new THREE.Mesh(terrainGeo, terrainMat);
    terrain.receiveShadow = !this.isSoftwareGl;
    terrain.name = 'terrain';
    this.terrainMesh = terrain;
    this.scene.add(terrain);

    // Pre-allocate lightweight pooled 3D particle & projectile meshes
    this.initParticlePool();
    this.initProjectilePool();

    // Natural perimeter mountains & jagged cliffs
    this.createMountainPerimeter();
  }

  private applyTerrainVertexColors(geo: THREE.BufferGeometry, preset: MapPresetId) {
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const baseR = preset === 'highland_basin' ? 0.94 : preset === 'twin_lakes' ? 0.88 : 0.92;
    const baseG = preset === 'highland_basin' ? 0.92 : preset === 'twin_lakes' ? 0.96 : 0.96;
    const baseB = preset === 'highland_basin' ? 0.84 : preset === 'twin_lakes' ? 0.9 : 0.88;

    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vz = pos.getZ(i);
      // Multi-scale world-space biome variation (eliminates any visible texture tiling!)
      const macro = Math.sin(vx * 0.065) * Math.cos(vz * 0.065);
      const meso = Math.sin((vx + vz) * 0.14) * Math.cos((vx - vz) * 0.11);
      const edgeDist = Math.max(0, Math.max(Math.abs(vx), Math.abs(vz)) - 88);
      const ridgeShade = Math.max(0.74, 1 - edgeDist * 0.016);

      const r = Math.min(1.08, Math.max(0.68, (baseR + macro * 0.07 - meso * 0.03) * ridgeShade));
      const g = Math.min(1.1, Math.max(0.7, (baseG + macro * 0.05 + meso * 0.05) * ridgeShade));
      const b = Math.min(1.02, Math.max(0.64, (baseB - macro * 0.04 + meso * 0.02) * ridgeShade));
      colors[i * 3] = r;
      colors[i * 3 + 1] = g;
      colors[i * 3 + 2] = b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }

  private initProjectilePool() {
    const arrowGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.85, 5);
    arrowGeo.rotateZ(Math.PI / 2);
    const slashGeo = new THREE.OctahedronGeometry(0.28, 0);
    slashGeo.scale(1.3, 0.25, 1.3);

    this.projectileAssets = {
      arrow: {
        geo: arrowGeo,
        mat: new THREE.MeshBasicMaterial({ color: 0xf8fafc }),
      },
      fireball: {
        geo: new THREE.SphereGeometry(0.34, 8, 8),
        mat: new THREE.MeshBasicMaterial({ color: 0xf97316 }),
      },
      ki_blast: {
        geo: new THREE.SphereGeometry(0.38, 8, 8),
        mat: new THREE.MeshBasicMaterial({ color: 0x38bdf8 }),
      },
      slash: {
        geo: slashGeo,
        mat: new THREE.MeshBasicMaterial({ color: 0xa5f3fc }),
      },
    };
  }

  private acquireProjectileMesh(type: Projectile['type']): THREE.Mesh {
    const pool = this.projectilePool[type] || this.projectilePool.arrow;
    let mesh = pool.pop();
    if (!mesh) {
      const assets = (this.projectileAssets && this.projectileAssets[type]) || this.projectileAssets!.arrow;
      mesh = new THREE.Mesh(assets.geo, assets.mat);
      this.scene.add(mesh);
    }
    mesh.visible = true;
    return mesh;
  }

  private releaseProjectileMesh(id: string) {
    const entry = this.projectileMeshes.get(id);
    if (!entry) return;
    entry.mesh.visible = false;
    (this.projectilePool[entry.type] || this.projectilePool.arrow).push(entry.mesh);
    this.projectileMeshes.delete(id);
  }

  private initParticlePool() {
    const count = 112;
    const geometry = new THREE.BoxGeometry(0.18, 0.18, 0.18);
    this.particleColors = {
      hit: new THREE.Color(0xef4444),
      spark: new THREE.Color(0xfef08a),
      wood: new THREE.Color(0x92400e),
      gold: new THREE.Color(0xfbbf24),
      stone: new THREE.Color(0x94a3b8),
      leaf: new THREE.Color(0x22c55e),
      meat: new THREE.Color(0x9f1239),
      dust: new THREE.Color(0xe2e8f0),
      smoke: new THREE.Color(0x475569),
      ember: new THREE.Color(0xf97316),
    };

    const solidMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      vertexColors: true,
      toneMapped: false,
    });
    const smokeMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      vertexColors: true,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      toneMapped: false,
    });
    this.particleSolidBatch = new THREE.InstancedMesh(geometry, solidMaterial, count);
    this.particleSolidBatch.name = 'instancedCombatParticles';
    this.particleSolidBatch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.particleSolidBatch.frustumCulled = false;
    this.particleSolidBatch.visible = false;
    this.particleSmokeBatch = new THREE.InstancedMesh(geometry, smokeMaterial, count);
    this.particleSmokeBatch.name = 'instancedSmokeParticles';
    this.particleSmokeBatch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.particleSmokeBatch.frustumCulled = false;
    this.particleSmokeBatch.visible = false;

    const hiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
    this.particlePool = [];
    for (let i = 0; i < count; i++) {
      this.particleSolidBatch.setMatrixAt(i, hiddenMatrix);
      this.particleSmokeBatch.setMatrixAt(i, hiddenMatrix);
      this.particleSolidBatch.setColorAt(i, this.particleColors.spark);
      this.particleSmokeBatch.setColorAt(i, this.particleColors.smoke);
      this.particlePool.push({
        instanceId: i,
        renderLayer: 'solid',
        kind: 'spark',
        x: 0,
        y: 0,
        z: 0,
        rotationX: 0,
        rotationY: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 0.4,
        baseScale: 1,
        scale: 0,
        active: false,
      });
    }
    this.markParticleBatchesDirty(true, true, true);
    this.scene.add(this.particleSolidBatch, this.particleSmokeBatch);
  }

  private writeParticleInstance(particle: PooledParticle, visible: boolean): void {
    const batch = particle.renderLayer === 'smoke' ? this.particleSmokeBatch : this.particleSolidBatch;
    if (!batch) return;
    this.particleDummy.position.set(particle.x, particle.y, particle.z);
    this.particleDummy.rotation.set(particle.rotationX, particle.rotationY, 0);
    this.particleDummy.scale.setScalar(visible ? particle.scale : 0);
    this.particleDummy.updateMatrix();
    batch.setMatrixAt(particle.instanceId, this.particleDummy.matrix);
  }

  private markParticleBatchesDirty(solid: boolean, smoke: boolean, colors = false): void {
    if (solid && this.particleSolidBatch) {
      this.particleSolidBatch.instanceMatrix.needsUpdate = true;
      if (colors && this.particleSolidBatch.instanceColor) this.particleSolidBatch.instanceColor.needsUpdate = true;
    }
    if (smoke && this.particleSmokeBatch) {
      this.particleSmokeBatch.instanceMatrix.needsUpdate = true;
      if (colors && this.particleSmokeBatch.instanceColor) this.particleSmokeBatch.instanceColor.needsUpdate = true;
    }
  }

  private getSpatialAudioScale(x: number, z: number): number {
    const dist = Math.hypot(x - this.cameraTarget.x, z - this.cameraTarget.z);
    return computeSpatialAudioGain(dist, 42);
  }

  public spawnParticleBurst(x: number, y: number, z: number, kind: ParticleKind, count = 6) {
    if (!this.particleColors || this.particlePool.length === 0) return;
    const isBuoyant = kind === 'smoke' || kind === 'ember';
    const targetLayer: ParticleRenderLayer = kind === 'smoke' ? 'smoke' : 'solid';
    const budgetedCount = computeParticleBurstCount(count, this.qualityLevel, this.units.length, kind);
    let solidChanged = false;
    let smokeChanged = false;
    let colorsChanged = false;

    for (let i = 0; i < budgetedCount; i++) {
      const p = this.particlePool[this.particleCursor];
      this.particleCursor = (this.particleCursor + 1) % this.particlePool.length;
      this.writeParticleInstance(p, false);
      if (p.renderLayer === 'smoke') smokeChanged = true;
      else solidChanged = true;
      p.renderLayer = targetLayer;

      const angle = (i / budgetedCount) * Math.PI * 2 + Math.random() * 0.65;
      const speed = isBuoyant
        ? 0.35 + Math.random() * 0.85
        : kind === 'meat'
          ? 0.45 + Math.random() * 0.95
          : 1.6 + Math.random() * 2.6;
      const baseScale = kind === 'smoke'
        ? 2.1 + Math.random() * 1.4
        : kind === 'ember'
          ? 0.75 + Math.random() * 0.5
          : kind === 'meat'
            ? 0.34 + Math.random() * 0.28
            : 0.8 + Math.random() * 0.6;
      p.kind = kind;
      p.x = x + (isBuoyant ? (Math.random() - 0.5) * 1.2 : 0);
      p.y = y;
      p.z = z + (isBuoyant ? (Math.random() - 0.5) * 1.2 : 0);
      p.rotationX = 0;
      p.rotationY = 0;
      p.scale = baseScale;
      p.baseScale = baseScale;
      p.vx = Math.cos(angle) * speed;
      p.vy = kind === 'smoke'
        ? 1.8 + Math.random() * 1.2
        : kind === 'ember'
          ? 2.6 + Math.random() * 1.8
          : kind === 'meat'
            ? 0.35 + Math.random() * 0.75
            : 2.4 + Math.random() * 2.5;
      p.vz = Math.sin(angle) * speed;
      p.life = 0;
      p.maxLife = kind === 'smoke'
        ? 0.85 + Math.random() * 0.45
        : kind === 'ember'
          ? 0.55 + Math.random() * 0.35
          : kind === 'meat'
            ? 0.2 + Math.random() * 0.18
            : 0.32 + Math.random() * 0.24;
      p.active = true;

      const batch = targetLayer === 'smoke' ? this.particleSmokeBatch : this.particleSolidBatch;
      if (batch) batch.visible = true;
      batch?.setColorAt(p.instanceId, this.particleColors[kind]);
      this.writeParticleInstance(p, true);
      if (targetLayer === 'smoke') smokeChanged = true;
      else solidChanged = true;
      colorsChanged = true;
    }
    this.markParticleBatchesDirty(solidChanged, smokeChanged, colorsChanged);
  }

  private updateParticles(dt: number) {
    let solidChanged = false;
    let smokeChanged = false;
    let solidActive = false;
    let smokeActive = false;
    for (let i = 0; i < this.particlePool.length; i++) {
      const p = this.particlePool[i];
      if (!p.active) continue;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        this.writeParticleInstance(p, false);
        if (p.renderLayer === 'smoke') smokeChanged = true;
        else solidChanged = true;
        continue;
      }
      const prog = p.life / p.maxLife;
      if (p.kind === 'smoke') {
        p.vy += 1.2 * dt;
        p.vx *= Math.max(0, 1 - 1.5 * dt);
        p.vz *= Math.max(0, 1 - 1.5 * dt);
        p.scale = p.baseScale * (0.85 + prog * 1.15) * (1 - prog * 0.65);
      } else if (p.kind === 'ember') {
        p.vy += 0.8 * dt;
        p.scale = Math.max(0.08, p.baseScale * (1 - prog));
      } else {
        p.vy -= 9.5 * dt;
        p.scale = Math.max(0.05, p.baseScale * (1 - prog));
      }
      p.x += p.vx * dt;
      p.y = Math.max(0.05, p.y + p.vy * dt);
      p.z += p.vz * dt;
      p.rotationX += (p.kind === 'smoke' ? 1.6 : p.kind === 'meat' ? 10 : 6) * dt;
      p.rotationY += (p.kind === 'smoke' ? 1.4 : p.kind === 'meat' ? 8 : 5) * dt;
      this.writeParticleInstance(p, true);
      if (p.renderLayer === 'smoke') {
        smokeChanged = true;
        smokeActive = true;
      } else {
        solidChanged = true;
        solidActive = true;
      }
    }
    if (this.particleSolidBatch) this.particleSolidBatch.visible = solidActive;
    if (this.particleSmokeBatch) this.particleSmokeBatch.visible = smokeActive;
    this.markParticleBatchesDirty(solidChanged, smokeChanged);
  }

  private createMountainPerimeter() {
    const rockMaps = getCraggyRockMaps();
    const foliageMaps = getFoliagePBRMaps();
    const barkMaps = getTreeBarkMaps();

    const rockMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      map: rockMaps.map,
      normalMap: rockMaps.normalMap,
      normalScale: new THREE.Vector2(1.4, 1.4),
      roughness: 0.93,
      metalness: 0.05,
    });
    const darkRockMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      map: rockMaps.map,
      normalMap: rockMaps.normalMap,
      normalScale: new THREE.Vector2(1.3, 1.3),
      roughness: 0.96,
    });
    const snowCapMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      map: rockMaps.map,
      normalMap: rockMaps.normalMap,
      roughness: 0.74,
    });
    const ridgeGeo = new THREE.ConeGeometry(1, 1, 7);
    const cragGeo = new THREE.DodecahedronGeometry(1, 1);
    const count = 64;
    const radius = 115;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const dist = radius + Math.sin(i * 1.9) * 3.8;
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      const w = 6.8 + (i % 4) * 1.8;
      const h = 11.5 + ((i * 7) % 9) * 1.45;

      const peak = new THREE.Mesh(i % 3 === 0 ? cragGeo : ridgeGeo, i % 2 === 0 ? rockMat : darkRockMat);
      peak.scale.set(w, h, w * 0.88);
      peak.rotation.set(0, angle + i * 0.5, 0);
      peak.position.set(x, h * 0.44, z);
      this.scene.add(peak);

      // Snow / pale limestone summit cap on tallest peaks
      if (i % 3 !== 0 && h > 15) {
        const cap = new THREE.Mesh(ridgeGeo, snowCapMat);
        cap.scale.set(w * 0.38, h * 0.32, w * 0.34);
        cap.rotation.y = angle + i * 0.5;
        cap.position.set(x, h * 0.78, z);
        this.scene.add(cap);
      }

      // Foothill spur
      const spur = new THREE.Mesh(cragGeo, darkRockMat);
      spur.scale.set(w * 0.75, h * 0.42, w * 0.75);
      spur.rotation.y = angle + 1.1;
      spur.position.set(x - Math.cos(angle) * 4.4, h * 0.16, z - Math.sin(angle) * 4.4);
      this.scene.add(spur);
    }

    // Distant Foothill Alpine Forest Ring (grounded 2-tier layered conifers framing the valley)
    const pineCount = 136;
    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.28, 2.4, 6);
    const crownLowerGeo = new THREE.ConeGeometry(1.75, 3.0, 9);
    const crownUpperGeo = new THREE.ConeGeometry(1.25, 2.6, 9);
    const pineTrunkMat = new THREE.MeshStandardMaterial({
      color: 0x5c3a21,
      map: barkMaps.map,
      roughness: 0.94,
    });
    const pineCrownMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: foliageMaps.map,
      normalMap: foliageMaps.normalMap,
      roughness: 0.88,
    });
    const instTrunks = new THREE.InstancedMesh(trunkGeo, pineTrunkMat, pineCount);
    const instCrownsLower = new THREE.InstancedMesh(crownLowerGeo, pineCrownMat, pineCount);
    const instCrownsUpper = new THREE.InstancedMesh(crownUpperGeo, pineCrownMat, pineCount);
    const dummy = new THREE.Object3D();
    const tint = new THREE.Color();
    for (let i = 0; i < pineCount; i++) {
      const a = (i / pineCount) * Math.PI * 2 + Math.sin(i * 3.1) * 0.03;
      const r = 95 + (i % 5) * 3.2 + Math.cos(i * 2.3) * 1.6;
      const px = Math.cos(a) * r;
      const pz = Math.sin(a) * r;
      const sc = 0.88 + ((i * 11) % 7) * 0.1;

      dummy.position.set(px, 1.15 * sc, pz);
      dummy.scale.set(sc, sc, sc);
      dummy.rotation.set(0, i * 0.7, 0);
      dummy.updateMatrix();
      instTrunks.setMatrixAt(i, dummy.matrix);

      dummy.position.set(px, 2.55 * sc, pz);
      dummy.scale.set(sc * 1.04, sc, sc * 1.04);
      dummy.updateMatrix();
      instCrownsLower.setMatrixAt(i, dummy.matrix);

      dummy.position.set(px, 3.85 * sc, pz);
      dummy.scale.set(sc * 0.98, sc, sc * 0.98);
      dummy.rotation.set(0, i * 0.7 + 0.45, 0);
      dummy.updateMatrix();
      instCrownsUpper.setMatrixAt(i, dummy.matrix);

      tint.setHex(i % 3 === 0 ? 0x165329 : i % 3 === 1 ? 0x1f6b36 : 0x285e33);
      instCrownsLower.setColorAt(i, tint);
      instCrownsUpper.setColorAt(i, tint);
    }
    instTrunks.instanceMatrix.needsUpdate = true;
    instCrownsLower.instanceMatrix.needsUpdate = true;
    instCrownsUpper.instanceMatrix.needsUpdate = true;
    if (instCrownsLower.instanceColor) instCrownsLower.instanceColor.needsUpdate = true;
    if (instCrownsUpper.instanceColor) instCrownsUpper.instanceColor.needsUpdate = true;
    instTrunks.computeBoundingSphere();
    instCrownsLower.computeBoundingSphere();
    instCrownsUpper.computeBoundingSphere();
    this.scene.add(instTrunks, instCrownsLower, instCrownsUpper);
  }

  public getParticipant(factionId: FactionId): MatchParticipant | undefined {
    return this.participants.find((p) => p.id === factionId);
  }

  public getCivilizationForFaction(factionId: FactionId): CivilizationId {
    return getCivilizationConfig(this.getParticipant(factionId)?.civilization).id;
  }

  public getResearchedTechs(factionId: FactionId): string[] {
    return this.researchedTechsByFaction[factionId] || [];
  }

  public getObservedFactionId(): FactionId {
    return this.isSpectatorMode ? this.observedFactionId : this.humanPlayerId;
  }

  public setObservedFaction(factionId: FactionId, focusCamera = true) {
    if (!this.participants.some((p) => p.id === factionId)) return;
    this.observedFactionId = factionId;
    if (focusCamera) {
      const tc = this.buildings.find((b) => b.faction === factionId && b.buildingType === 'town_center');
      const anyEnt =
        tc ||
        this.buildings.find((b) => b.faction === factionId && b.hp > 0) ||
        this.units.find((u) => u.faction === factionId && u.hp > 0);
      if (anyEnt) {
        this.setCameraFocus(anyEnt.x, anyEnt.z);
      }
    }
    this.syncHumanResourcesAlias();
    this.onSelectionChange?.();
  }

  public isHumanControlled(factionId: FactionId): boolean {
    if (this.isSpectatorMode) return false;
    return factionId === this.humanPlayerId;
  }

  public isHostile(a: { faction: FactionId; team?: number }, b: { faction: FactionId; team?: number }): boolean {
    const teamA = a.team ?? this.getParticipant(a.faction)?.team;
    const teamB = b.team ?? this.getParticipant(b.faction)?.team;
    return areHostile({ faction: a.faction, team: teamA }, { faction: b.faction, team: teamB });
  }

  public isHostileToPlayer(entity: { faction: FactionId; team?: number }): boolean {
    const refFaction = this.getObservedFactionId();
    const refTeam = this.getParticipant(refFaction)?.team ?? this.humanTeam;
    return this.isHostile({ faction: refFaction, team: refTeam }, entity);
  }

  public getResourcesForFaction(faction: FactionId): Resources {
    if (!this.resourcesByFaction[faction]) {
      this.resourcesByFaction[faction] = { food: 250, wood: 200, gold: 120, stone: 60 };
    }
    return this.resourcesByFaction[faction];
  }

  private syncHumanResourcesAlias() {
    this.playerResources = this.getResourcesForFaction(this.getObservedFactionId());
    const firstAi = this.participants.find((p) => p.controller === 'ai');
    if (firstAi) {
      this.enemyResources = this.getResourcesForFaction(firstAi.id);
    }
  }

  public getTerrainNavObstacles(): TerrainNavObstacles | undefined {
    if (!this.mapLayout) return undefined;
    return {
      rects: this.mapLayout.waterRects,
      discs: [...this.mapLayout.waterDiscs, ...this.mapLayout.cliffDiscs],
      bridges: this.mapLayout.bridges,
    };
  }

  public getNavGrid(): NavGrid {
    if (!this.navGrid || this.navGridDirty) {
      this.navGrid = buildNavGrid(this.buildings, this.resourceNodes, this.getTerrainNavObstacles());
      this.navGridDirty = false;
    }
    return this.navGrid;
  }

  public getWaterNavGrid(): NavGrid {
    if (!this.waterNavGrid || this.waterNavGridDirty) {
      this.waterNavGrid = buildWaterNavGrid(this.buildings, this.resourceNodes, this.getTerrainNavObstacles());
      this.waterNavGridDirty = false;
    }
    return this.waterNavGrid;
  }

  public setupWorld(
    customParticipants?: MatchParticipant[],
    mapPreset?: MapPresetId,
    resourceRichness?: ResourceRichness,
    seed?: number
  ) {
    this.battleStressInfo = null;
    this.aiEconomyFlowByFaction.clear();
    this.aiWorkerRebalanceReadyAt.clear();
    this.aiNodeRelocationReadyAt.clear();
    this.aiCampPlacementReadyAt.clear();
    this.cancelPlacement();
    if (mapPreset) this.mapPreset = mapPreset;
    if (resourceRichness) this.resourceRichness = resourceRichness;

    if (customParticipants && customParticipants.length >= 2) {
      this.participants = customParticipants.map((p) => ({ ...p }));
    } else if (!this.participants || this.participants.length < 2) {
      this.participants = createDefaultParticipants();
    }

    this.isSpectatorMode = isAllAiMatch(this.participants);
    const human = this.participants.find((p) => p.controller === 'player') || this.participants[0];
    this.humanPlayerId = human.id;
    this.humanTeam = human.team;
    this.observedFactionId = human.id;
    this.gameOverWinner = null;

    // Clear old objects
    this.fieldSiegeProjects.forEach((project) => this.disposeFieldSiegeProject(project));
    this.fieldSiegeProjects = [];
    this.unitMeshes.forEach((m) => this.scene.remove(m));
    this.buildingMeshes.forEach((m) => {
      disposeBuildingVisualResources(m);
      this.scene.remove(m);
    });
    this.nodeMeshes.forEach((m) => this.scene.remove(m));
    if (this.depletedResourceBatch) {
      this.scene.remove(this.depletedResourceBatch.group);
      this.depletedResourceBatch = null;
    }
    this.selectionRings.forEach((r) => this.scene.remove(r));
    this.selectionRings.clear();
    this.commandIndicators.forEach((c) => this.scene.remove(c.mesh));
    this.commandIndicators = [];
    this.particlePool.forEach((p) => {
      p.active = false;
      this.writeParticleInstance(p, false);
    });
    this.markParticleBatchesDirty(true, true);
    if (this.particleSolidBatch) this.particleSolidBatch.visible = false;
    if (this.particleSmokeBatch) this.particleSmokeBatch.visible = false;
    this.dyingEffects.forEach((d) => this.scene.remove(d.mesh));
    this.dyingEffects = [];
    this.collapsingBuildings.forEach((cb) => {
      disposeBuildingVisualResources(cb.mesh);
      this.scene.remove(cb.mesh);
    });
    this.collapsingBuildings = [];
    if (this.rubbleDecalBatch) {
      this.scene.remove(this.rubbleDecalBatch.group);
      this.rubbleDecalBatch = null;
    }
    this.rubbleDecals = [];
    this.shockwaveRings.forEach((s) => {
      this.scene.remove(s.mesh);
      (s.mesh.material as THREE.Material).dispose();
    });
    this.shockwaveRings = [];
    this.groundZones.forEach((zone) => {
      this.scene.remove(zone.mesh);
      zone.mesh.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry?.dispose();
        if (Array.isArray(mesh.material)) mesh.material.forEach((material) => material.dispose());
        else mesh.material?.dispose();
      });
    });
    this.groundZones = [];
    if (this.environmentGroup) {
      this.scene.remove(this.environmentGroup);
      this.environmentGroup = null;
    }
    if (this.rallyFlagMesh) {
      this.scene.remove(this.rallyFlagMesh);
      this.rallyFlagMesh = null;
    }
    if (this.rallyLineMesh) {
      this.scene.remove(this.rallyLineMesh);
      this.rallyLineMesh = null;
    }
    this.unitMeshes.clear();
    this.buildingMeshes.clear();
    this.animatedBuildingMeshes.clear();
    this.nodeMeshes.clear();
    this.windAnimatedNodeMeshes.clear();
    this.fishAnimatedNodeMeshes.clear();
    this.resourceVisualLodQueue.clear();
    this.unitLodAccumulator = 0;
    this.buildingLodAccumulator = 0;
    this.resourceLodAccumulator = 0;
    this.projectileMeshes.forEach((entry) => {
      entry.mesh.visible = false;
      (this.projectilePool[entry.type] || this.projectilePool.arrow).push(entry.mesh);
    });
    this.projectileMeshes.clear();
    this.units = [];
    this.buildings = [];
    // Release previous-match faction roster groups even when the next match has
    // no AI and therefore will not ask the scheduler to rebuild them.
    this.aiUnitGroupsSource = null;
    this.aiUnitGroupsLength = -1;
    this.aiUnitGroupsByFaction.clear();
    this.battlefieldLeadershipRosterSource = null;
    this.battlefieldLeadershipRosterLength = -1;
    this.battlefieldLeadershipCandidates.length = 0;
    this.battlefieldLeadershipUnitByFaction.clear();
    this.battlefieldLeadershipScoreByFaction.clear();
    this.battlefieldLeadershipUnits.length = 0;
    this.formationRegroupRefreshAccumulator = 0.15;
    this.aiBuildingGroupsSource = null;
    this.aiBuildingGroupsLength = -1;
    this.aiBuildingGroupsByFaction.clear();
    this.combatSpatialIndex = null;
    this.combatUnitLookupById.clear();
    this.combatUnitLookupSource = null;
    this.combatUnitLookupLength = -1;
    this.combatBuildingLookupById.clear();
    this.combatBuildingLookupSource = null;
    this.combatBuildingLookupLength = -1;
    this.combatTargetQueryScratch.units.length = 0;
    this.combatTargetQueryScratch.buildings.length = 0;
    this.cavalryRetreatQueryScratch.units.length = 0;
    this.cavalryRetreatQueryScratch.buildings.length = 0;
    this.resourceNodes = [];
    this.contestedPoints = [];
    this.starRelicPhase = 'waiting';
    this.starRelicChannel = 0;
    this.starRelicCarrierId = null;
    this.starOathUntil = {};
    if (this.starRelicMesh) {
      this.scene.remove(this.starRelicMesh);
      this.starRelicMesh = null;
    }
    this.contestedMeshes.forEach((mesh) => this.scene.remove(mesh));
    this.contestedMeshes.clear();
    this.contestedIncomeAcc.clear();
    this.contestedFirstLootClaimed.clear();
    this.projectiles = [];
    this.floatingTexts = [];
    this.selectedUnitIds = [];
    this.selectedBuildingId = null;
    this.selectedNodeId = null;
    this.selectedContestedPointId = null;
    this.inspectedEntity = null;
    this.lastAttackAlert = null;
    this.lastTacticalBroadcast = null;
    this.lastAttackBroadcastTime = 0;
    this.lastEnemySpottedBroadcastTime = 0;
    this.enemySpottedCheckAccumulator = 0;
    this.lastMinimapPing = null;
    this.pendingCommandMode = 'normal';
    this.cameraDesiredTarget = null;
    this.cameraPanVelX = 0;
    this.cameraPanVelZ = 0;
    this.controlGroups = createEmptyControlGroups();
    this.navGridDirty = true;
    this.waterNavGridDirty = true;
    this.cameraZoom = 1.0;
    this.cameraTargetZoom = 1.0;
    this.edgeScrollDirX = 0;
    this.edgeScrollDirZ = 0;

    // Update terrain biome PBR material & world-space vertex colors
    if (this.terrainMesh) {
      const mat = this.terrainMesh.material as THREE.MeshStandardMaterial;
      applyTerrainBiomeMaterial(mat, this.mapPreset);
      this.applyTerrainVertexColors(this.terrainMesh.geometry, this.mapPreset);
    }

    // Reset stats & per-faction resources/ages/techs
    this.resourcesByFaction = {};
    this.ageByFaction = {};
    this.landmarksByFaction = {};
    this.researchedTechsByFaction = {};
    this.aiDecisionFactionIds = this.participants
      .filter((participant) => participant.controller === 'ai')
      .map((participant) => participant.id);
    this.aiDecisionSchedulerState.accumulatorSeconds = this.aiDecisionFactionIds.length > 0
      ? 1.2 / this.aiDecisionFactionIds.length
      : 0;
    this.aiDecisionSchedulerState.cursor = 0;
    this.aiDecisionCount = 0;
    this.aiDecisionTiming = { ...EMPTY_AI_DECISION_TIMING };
    this.aiPathRecoveryTotal = 0;
    this.playerAge = 1;
    this.enemyAge = 1;
    this.playerLandmarks = [];
    this.enemyLandmarks = [];

    this.participants.forEach((p) => {
      const civId = getCivilizationConfig(p.civilization).id;
      p.civilization = civId;
      // AI difficulty economy bias (player always standard start)
      let startRes = { food: 250, wood: 200, gold: 120, stone: 60 };
      if (p.controller === 'ai') {
        if (p.aiPersonality === 'easy') {
          startRes = { food: 200, wood: 160, gold: 80, stone: 40 };
        } else if (p.aiPersonality === 'hard') {
          startRes = { food: 320, wood: 260, gold: 160, stone: 90 };
        }
      }
      this.resourcesByFaction[p.id] = startRes;
      this.ageByFaction[p.id] = 1;
      this.landmarksByFaction[p.id] = [];
      this.researchedTechsByFaction[p.id] = [];

      const hostile = this.isSpectatorMode ? false : p.team !== this.humanTeam;
      registerFactionVisual(p.id, {
        primary: p.colorHex,
        banner: p.accentHex,
        ring: getTeamVisualColor(p.team).colorHex,
        isHostile: hostile,
        labelPrefix: this.isSpectatorMode
          ? `${p.name}·`
          : p.id === this.humanPlayerId
          ? ''
          : hostile
          ? `${p.name}·`
          : `友軍·`,
        civilization: civId,
      });
      this.autoReseedFarmsByFaction[p.id] = true;
    });
    this.syncHumanResourcesAlias();

    this.stats = {
      resourcesGathered: { food: 0, wood: 0, gold: 0, stone: 0 },
      unitsTrained: 0,
      unitsLost: 0,
      enemiesKilled: 0,
      buildingsConstructed: 0,
      gameDuration: 0,
    };

    const spawns = generateSpawnPositions(this.participants.length, 58);
    const matchSeed = Number.isFinite(seed)
      ? (Math.floor(Math.abs(seed as number)) >>> 0) || 1
      : Math.floor(Math.random() * 900000) + 1000;
    const layout = generateMapLayout(
      this.mapPreset,
      this.resourceRichness,
      this.participants.map((p, idx) => ({ id: p.id, x: spawns[idx].x, z: spawns[idx].z })),
      matchSeed
    );
    this.mapLayout = layout;
    this.rubbleDecalBatch = createBuildingRubbleBatch(64);
    this.scene.add(this.rubbleDecalBatch.group);
    this.depletedResourceBatch = createResourceDepletionBatch(layout.resourceNodes.length + 32);
    this.scene.add(this.depletedResourceBatch.group);

    this.environmentGroup = createEnvironmentFeaturesGroup(layout);
    this.scene.add(this.environmentGroup);
    this.applySceneDetailQuality(this.qualityLevel);

    const fallbackWorker = this.findUnitDef('villager')!;
    const fallbackWarrior = this.findUnitDef('swordsman') || fallbackWorker;
    const terrainObs = this.getTerrainNavObstacles();

    const findValidStarterSpot = (tx: number, tz: number, size: number): { x: number; z: number } => {
      if (
        isPlacementLocationValid(
          tx,
          tz,
          size,
          this.buildings,
          this.resourceNodes,
          false,
          terrainObs?.rects,
          terrainObs?.discs,
          terrainObs?.bridges
        )
      ) {
        return { x: tx, z: tz };
      }
      for (let r = 2.5; r <= 14; r += 2.5) {
        for (let a = 0; a < 12; a++) {
          const ang = (a / 12) * Math.PI * 2;
          const cx = Math.max(-86, Math.min(86, tx + Math.cos(ang) * r));
          const cz = Math.max(-86, Math.min(86, tz + Math.sin(ang) * r));
          if (
            isPlacementLocationValid(
              cx,
              cz,
              size,
              this.buildings,
              this.resourceNodes,
              false,
              terrainObs?.rects,
              terrainObs?.discs,
              terrainObs?.bridges
            )
          ) {
            return { x: cx, z: cz };
          }
        }
      }
      return { x: tx, z: tz };
    };

    let humanCameraTarget = { x: -46, z: -40 };

    // Phase A: Place every participant's Town Center first so no resource can ever overlap any TC footprint
    this.participants.forEach((p, idx) => {
      const sp = spawns[idx];
      const len = Math.hypot(sp.x, sp.z) || 1;
      const inX = -sp.x / len;
      const inZ = -sp.z / len;

      const tc = this.addBuilding('town_center', p.id, sp.x, sp.z, true);
      tc.rallyPoint = { x: sp.x + inX * 6, z: sp.z + inZ * 6 };

      if (p.id === this.humanPlayerId) {
        humanCameraTarget = { x: sp.x, z: sp.z };
      }
    });

    // Phase B: Spawn all natural resource nodes outside Town Centers before starter buildings find free footprints
    const groveBadgeFlags = new Set<string>();
    layout.resourceNodes.forEach((rn) => {
      // Extra runtime safety guard: never drop a resource node inside any Town Center courtyard
      const nearTc = this.buildings.some((b) => getDistance(rn.x, rn.z, b.x, b.z) < 10.5);
      if (nearTc) return;

      let showBadge = true;
      if (rn.subtype === 'wood' || rn.subtype === 'berry' || rn.subtype === 'hunt') {
        const prefix = rn.id.replace(/_\d+$/, '');
        if (groveBadgeFlags.has(prefix)) {
          showBadge = false;
        } else {
          groveBadgeFlags.add(prefix);
        }
      }
      this.addResourceNode(rn.id, rn.resourceType, rn.x, rn.z, rn.amount, showBadge, rn.subtype, rn.nodeTier);
    });


    // Neutral contested shrines
    (layout.contestedPoints || []).forEach((cp, shrineIndex) => {
      const shrineType = (['war', 'harvest', 'forge'] as const)[shrineIndex % 3];
      const point: ContestedPoint = {
        id: cp.id,
        x: cp.x,
        z: cp.z,
        radius: cp.radius,
        ownerFaction: 'neutral',
        captureProgress: 0,
        label: cp.label,
        shrineType,
        holdTime: 0,
        siegeSupplyActive: false,
        isContested: false,
        contestingFactions: [],
      };
      this.contestedPoints.push(point);
      const mesh = createContestedShrineMesh(cp.label, shrineType);
      mesh.position.set(cp.x, 0, cp.z);
      mesh.userData = { ...mesh.userData, type: 'contested', id: cp.id };
      this.scene.add(mesh);
      this.contestedMeshes.set(cp.id, mesh);
    });

    // Phase C: Place starter Farm & Initial Units (3 workers + 1 shared Scout) around each TC cleanly avoiding all natural resource nodes
    this.participants.forEach((p, idx) => {
      const sp = spawns[idx];
      const len = Math.hypot(sp.x, sp.z) || 1;
      const inX = -sp.x / len;
      const inZ = -sp.z / len;
      const tanX = -inZ;
      const tanZ = inX;

      const civCfg = getCivilizationConfig(p.civilization);
      const workerDef = this.findUnitDef(civCfg.workerUnitId, p.id) || fallbackWorker;
      const scoutDef = this.findUnitDef('scout_rider', p.id) || SHARED_UNITS[0] || fallbackWarrior;

      const farmSpot = findValidStarterSpot(sp.x - tanX * 8.5, sp.z - tanZ * 8.5, DEFAULT_BUILDINGS.farm.size);
      const farmBldg = this.addBuilding('farm', p.id, farmSpot.x, farmSpot.z, true);
      this.addResourceNode(`food_${farmBldg.id}`, 'food', farmSpot.x, farmSpot.z, 2500, true, 'farm');

      // Initial Civilization Units (3 unique workers + 1 shared Scout Rider -> 4/8 pop)
      this.addUnit(workerDef, p.id, sp.x + inX * 5.8 - tanX * 2, sp.z + inZ * 5.8 - tanZ * 2);
      this.addUnit(workerDef, p.id, sp.x + inX * 5.8, sp.z + inZ * 5.8);
      this.addUnit(workerDef, p.id, sp.x + inX * 5.8 + tanX * 2, sp.z + inZ * 5.8 + tanZ * 2);
      this.addUnit(scoutDef, p.id, sp.x + inX * 7.6 + tanX * 4.5, sp.z + inZ * 7.6 + tanZ * 4.5);
    });

    this.navGridDirty = true;

    // Center camera on Human Player Town Center
    this.cameraTarget.set(humanCameraTarget.x, 0, humanCameraTarget.z);
    this.updateCameraPosition();
  }

  /**
   * Starts a deterministic, all-AI four-faction battle used only by the Vite
   * development stress-test URL. Normal matches never call this method.
   */
  public setupBattleStressTest(
    unitCount: BattleStressUnitCount,
    seed: number,
    mapPreset: MapPresetId = 'highland_basin'
  ): void {
    const plan = createBattleStressPlan(unitCount, seed);
    this.setupWorld(plan.participants, mapPreset, 'abundant', plan.seed);

    const rosterByFaction = new Map<string, UnitDefinition[]>();
    for (const participant of plan.participants) {
      this.ageByFaction[participant.id] = 3;
      this.resourcesByFaction[participant.id] = {
        food: 5000,
        wood: 5000,
        gold: 5000,
        stone: 2500,
      };
      this.refreshFactionUnitStats(participant.id);
      rosterByFaction.set(
        participant.id,
        this.getAvailableUnitDefs(participant.id).filter(
          (definition) =>
            definition.category !== 'worker' &&
            !definition.isNaval &&
            (definition.requiredAge ?? 1) <= 3
        )
      );
    }
    this.syncHumanResourcesAlias();

    const fallbackRoles: Record<BattleStressRole, BattleStressRole[]> = {
      melee: ['melee', 'special', 'ranged', 'cavalry', 'siege'],
      ranged: ['ranged', 'special', 'melee', 'siege', 'cavalry'],
      cavalry: ['cavalry', 'melee', 'special', 'ranged', 'siege'],
      siege: ['siege', 'ranged', 'melee', 'special', 'cavalry'],
      special: ['special', 'ranged', 'melee', 'cavalry', 'siege'],
    };
    const roleUsage = new Map<string, number>();

    for (const spawn of plan.units) {
      const roster = rosterByFaction.get(spawn.factionId) || [];
      const preferred = fallbackRoles[spawn.role]
        .map((role) => roster.filter((definition) => definition.category === role))
        .find((definitions) => definitions.length > 0);
      if (!preferred?.length) {
        throw new Error(`No combat units are available for stress faction ${spawn.factionId}.`);
      }

      const usageKey = `${spawn.factionId}:${spawn.role}`;
      const roleIndex = roleUsage.get(usageKey) || 0;
      roleUsage.set(usageKey, roleIndex + 1);
      const definition = preferred[roleIndex % preferred.length];
      const unit = this.addUnit(definition, spawn.factionId, spawn.x, spawn.z, spawn.id);
      unit.targetX = spawn.targetX;
      unit.targetZ = spawn.targetZ;
      unit.targetEntityId = undefined;
      unit.attackMoveGoal = { x: spawn.targetX, z: spawn.targetZ };
      unit.waypoints = undefined;
      unit.pathGoal = undefined;
      unit.pathCooldown = 0;
      unit.state = 'moving';
      unit.currentActionText = '⚔️ 壓測推進';
    }

    this.navGridDirty = true;
    this.waterNavGridDirty = true;
    this.gameSpeed = 1;
    this.gameState = 'playing';
    this.battleStressInfo = {
      unitCount: plan.unitCount,
      seed: plan.seed,
      mapPreset: this.mapPreset,
    };
    // Capture the initial pathfinding burst from the first stress-test frame.
    this.togglePerformanceOverlay();
    this.onResourcesChange?.(this.playerResources);
    this.onStateChange?.();
    this.onSelectionChange?.();
  }

  public hasUniqueBuildingAura(faction: FactionId): boolean {
    const uniqueType = getCivilizationConfig(this.getCivilizationForFaction(faction)).uniqueBuildingType;
    return this.buildings.some(
      (b) => b.faction === faction && b.hp > 0 && b.isConstructed && b.buildingType === uniqueType
    );
  }

  private applyLandmarkPerksToStats(
    stats: UnitDefinition['stats'],
    category: UnitDefinition['category'],
    faction: FactionId
  ): UnitDefinition['stats'] {
    const landmarks = this.landmarksByFaction[faction] || [];
    if (landmarks.length === 0) return stats;
    const out = { ...stats };
    if (landmarks.includes('landmark_aachen') && category === 'worker') {
      out.gatherSpeed = +(out.gatherSpeed * 1.25).toFixed(4);
      out.speed = +(out.speed * 1.15).toFixed(2);
    }
    if (landmarks.includes('landmark_barracks') && category !== 'worker') {
      out.attack += 3;
    }
    if (landmarks.includes('landmark_observatory')) {
      out.defense += 4;
      out.maxHp = Math.round(out.maxHp * 1.2);
    }
    return out;
  }

  public findUnitDef(id: string, faction?: FactionId): UnitDefinition | undefined {
    const resolveDef = (found: UnitDefinition, mult?: GameMod['balanceMultipliers']): UnitDefinition => {
      const modStats = mult ? applyBalanceMultipliers(found.stats, mult) : { ...found.stats };
      if (faction) {
        const civ = this.getCivilizationForFaction(faction);
        const techs = this.getResearchedTechs(faction);
        const age = this.ageByFaction[faction] || 1;
        const hasAura = this.hasUniqueBuildingAura(faction);
        const progressed = applyCivilizationAndTechStats(modStats, found.category, civ, techs, age, hasAura);
        return {
          ...found,
          stats: this.applyLandmarkPerksToStats(progressed, found.category, faction),
        };
      }
      return {
        ...found,
        stats: modStats,
      };
    };

    for (const mod of this.activeMods) {
      if (!mod.enabled) continue;
      const found = mod.unitDefinitions.find((u) => u.id === id);
      if (found) return resolveDef(found, mod.balanceMultipliers);
    }

    const shared = SHARED_UNITS.find((u) => u.id === id);
    if (shared) return resolveDef(shared);

    return undefined;
  }

  public getPopulationStats(faction: FactionId) {
    return getFactionPopulationStats(faction, this.buildings, this.units);
  }

  /**
   * Shared live estimate for the selected-building HUD. Uses the same range,
   * forge aura and production modifiers as the simulation update.
   */
  public getBuildingTimingEstimate(buildingId: string): {
    constructionWorkers: number;
    constructionWorkerMultiplier: number;
    constructionRemainingSeconds: number | null;
    researchRemainingSeconds: number | null;
    trainingRemainingSeconds: number | null;
    queueRemainingSeconds: number | null;
  } {
    const building = this.buildings.find((entry) => entry.id === buildingId);
    const empty = {
      constructionWorkers: 0,
      constructionWorkerMultiplier: 0,
      constructionRemainingSeconds: null,
      researchRemainingSeconds: null,
      trainingRemainingSeconds: null,
      queueRemainingSeconds: null,
    };
    if (!building || building.hp <= 0) return empty;

    const repairingWall =
      !!building.wallBreached && !!building.buildingDef.isWall && building.isConstructed;
    const constructionSpeedMultiplier = getCappedProductionSpeedMultiplier(
      getCivilizationBuildSpeedMultiplier(this.getCivilizationForFaction(building.faction), this.activeMods)
    );
    const buildingRadius = Math.max(
      getBuildingCollisionRadius(building),
      repairingWall ? building.buildingDef.size : 0
    );
    const buildReach = Math.max(2.2, buildingRadius + 1.55);
    const constructionWorkers =
      !building.isConstructed || repairingWall
        ? this.units.filter(
            (worker) =>
              worker.hp > 0 &&
              worker.faction === building.faction &&
              worker.state === 'building' &&
              worker.targetBuildingId === building.id &&
              !worker.garrisonedInBuildingId &&
              getDistance(worker.x, worker.z, building.x, building.z) <= buildReach
          ).length
        : 0;
    const constructionWorkerMultiplier = getConstructionWorkerMultiplier(constructionWorkers);

    let constructionRemainingSeconds: number | null = null;
    if (repairingWall && constructionWorkerMultiplier > 0) {
      const repairRate =
        (building.maxHp / (building.buildingDef.buildTime * 0.65)) *
        (constructionSpeedMultiplier / PRODUCTION_TIME_SCALE) *
        constructionWorkerMultiplier;
      constructionRemainingSeconds =
        repairRate > 0 ? Math.max(0, building.maxHp - building.hp) / repairRate : null;
    } else if (!building.isConstructed) {
      constructionRemainingSeconds = estimateConstructionTimeRemaining(
        building.buildingDef.buildTime,
        building.buildProgress,
        constructionWorkers,
        constructionSpeedMultiplier
      );
    }

    const hasNearbyForge =
      building.buildingType !== 'armory_forge' &&
      this.buildings.some(
        (forge) =>
          forge.faction === building.faction &&
          forge.isConstructed &&
          forge.buildingType === 'armory_forge' &&
          getDistance(building.x, building.z, forge.x, forge.z) <= 16
      );
    const productionSpeedMultiplier = getCappedProductionSpeedMultiplier(hasNearbyForge ? 1.25 : 1);
    let researchRemainingSeconds: number | null = null;
    if (building.activeTechId) {
      const tech = findTechDef(building.activeTechId);
      if (tech) {
        researchRemainingSeconds =
          (Math.max(0, 1 - (building.researchProgress || 0)) * tech.researchTime) /
          productionSpeedMultiplier;
      }
    }

    let trainingRemainingSeconds: number | null = null;
    let queueRemainingSeconds: number | null = null;
    if (building.queue.length > 0) {
      const researched = this.getResearchedTechs(building.faction);
      const landmarks = this.landmarksByFaction[building.faction] || [];
      let totalSeconds = 0;
      building.queue.forEach((unitId, index) => {
        const unitDef = this.findUnitDef(unitId, building.faction);
        if (!unitDef) return;
        const techMultiplier = getTrainingTimeMultiplier(researched, unitDef.category);
        const landmarkMultiplier = getLandmarkTrainingSpeedMultiplier(landmarks, unitDef.category);
        const duration = getEffectiveUnitTrainingDuration(
          unitDef.stats.trainTime,
          techMultiplier,
          productionSpeedMultiplier,
          landmarkMultiplier
        );
        const remaining = index === 0
          ? duration * (1 - Math.max(0, Math.min(1, building.queueProgress)))
          : duration;
        totalSeconds += remaining;
        if (index === 0) trainingRemainingSeconds = remaining;
      });
      queueRemainingSeconds = totalSeconds;
    }

    return {
      constructionWorkers,
      constructionWorkerMultiplier,
      constructionRemainingSeconds,
      researchRemainingSeconds,
      trainingRemainingSeconds,
      queueRemainingSeconds,
    };
  }

  /** One-builder construction estimate used by build-menu hover tooltips. */
  public getBuildingConstructionDuration(buildingType: BuildingType, faction: FactionId): number {
    const definition = DEFAULT_BUILDINGS[buildingType];
    const civilizationSpeed = getCivilizationBuildSpeedMultiplier(
      this.getCivilizationForFaction(faction),
      this.activeMods
    );
    return getEffectiveProductionDuration(
      definition.buildTime * 0.9,
      getCappedProductionSpeedMultiplier(civilizationSpeed)
    );
  }

  /** Exact unit queue duration using the same live bonuses as the production simulation. */
  public getUnitTrainingDuration(buildingId: string, unitDefId: string): number | null {
    const building = this.buildings.find((entry) => entry.id === buildingId && entry.hp > 0);
    if (!building) return null;
    const unit = this.findUnitDef(unitDefId, building.faction);
    if (!unit) return null;
    const hasNearbyForge =
      building.buildingType !== 'armory_forge' &&
      this.buildings.some(
        (forge) =>
          forge.faction === building.faction &&
          forge.isConstructed &&
          forge.buildingType === 'armory_forge' &&
          getDistance(building.x, building.z, forge.x, forge.z) <= 16
      );
    const technologyTimeMultiplier = getTrainingTimeMultiplier(
      this.getResearchedTechs(building.faction),
      unit.category
    );
    const landmarkSpeed = getLandmarkTrainingSpeedMultiplier(
      this.landmarksByFaction[building.faction] || [],
      unit.category
    );
    return getEffectiveUnitTrainingDuration(
      unit.stats.trainTime,
      technologyTimeMultiplier,
      hasNearbyForge ? 1.25 : 1,
      landmarkSpeed
    );
  }

  /** Current research duration; the Royal Foundry aura is subject to the shared speed ceiling. */
  public getTechResearchDuration(buildingId: string, techId: string): number | null {
    const building = this.buildings.find((entry) => entry.id === buildingId && entry.hp > 0);
    const tech = findTechDef(techId);
    if (!building || !tech) return null;
    const hasNearbyForge =
      building.buildingType !== 'armory_forge' &&
      this.buildings.some(
        (forge) =>
          forge.faction === building.faction &&
          forge.isConstructed &&
          forge.buildingType === 'armory_forge' &&
          getDistance(building.x, building.z, forge.x, forge.z) <= 16
      );
    return tech.researchTime / getCappedProductionSpeedMultiplier(hasNearbyForge ? 1.25 : 1);
  }

  public getAvailableUnitDefs(faction: FactionId): UnitDefinition[] {
    const list: UnitDefinition[] = [...SHARED_UNITS.map((u) => this.findUnitDef(u.id, faction)!).filter(Boolean)];
    const civ = this.getCivilizationForFaction(faction);
    const techs = this.getResearchedTechs(faction);
    const age = this.ageByFaction[faction] || 1;
    const hasAura = this.hasUniqueBuildingAura(faction);
    for (const mod of this.activeMods) {
      if (!mod.enabled) continue;
      for (const u of mod.unitDefinitions) {
        const modStats = applyBalanceMultipliers(u.stats, mod.balanceMultipliers);
        const progressed = applyCivilizationAndTechStats(modStats, u.category, civ, techs, age, hasAura);
        list.push({
          ...u,
          stats: this.applyLandmarkPerksToStats(progressed, u.category, faction),
        });
      }
    }
    return list;
  }

  public refreshFactionUnitStats(faction: FactionId) {
    const civ = this.getCivilizationForFaction(faction);
    this.units.forEach((u) => {
      if (u.faction !== faction || u.hp <= 0) return;
      const fresh = this.findUnitDef(u.unitDefId, faction);
      if (!fresh) return;
      const s = { ...fresh.stats };
      const lvl = canUnitGainXp(u.unitDefId, civ) ? u.level || 1 : 1;
      for (let i = 1; i < lvl; i++) {
        s.maxHp = Math.round(s.maxHp * 1.14);
        s.attack = Math.round(s.attack * 1.12 + 2);
        s.defense += 1;
      }
      const oldMax = Math.max(1, u.maxHp);
      u.maxHp = s.maxHp;
      u.hp = Math.min(u.maxHp, Math.max(1, Math.round(u.hp * (s.maxHp / oldMax))));
      u.unitDef.stats = s;
    });
  }

  private prepareUnitMeshForDecorationBatch(mesh: THREE.Group): void {
    const shadow = mesh.getObjectByName('contactShadow') as THREE.Mesh | undefined;
    const factionRing = mesh.getObjectByName('unitFactionRing') as THREE.Mesh | undefined;
    const roleMarker = mesh.userData.battlefieldRoleMarker as THREE.Mesh | undefined;
    const buffRing = mesh.getObjectByName('unitBuffRing') as THREE.Mesh | undefined;
    mesh.userData.unitContactShadowMesh = shadow;
    mesh.userData.unitFactionRingMesh = factionRing;
    mesh.userData.unitRoleMarkerMesh = roleMarker;
    mesh.userData.unitBuffRingMesh = buffRing;
    if (shadow) shadow.visible = false;
    if (factionRing) factionRing.visible = false;
    if (roleMarker && this.unitRoleCrestBatch && this.unitRoleSiegeBatch) {
      roleMarker.userData.instancedBatch = true;
      roleMarker.userData.lodVisible = roleMarker.visible;
      roleMarker.visible = false;
    }
    if (buffRing && this.unitBuffRingBatch) {
      buffRing.userData.instancedBatch = true;
      buffRing.userData.batchVisible = false;
      buffRing.visible = false;
    }
  }

  private writeUnitRoleMarkerInstance(mesh: THREE.Group): void {
    const roleMarker = mesh.userData.unitRoleMarkerMesh as THREE.Mesh | undefined;
    if (!roleMarker) return;

    const shouldShow = roleMarker.userData.lodVisible !== false;
    const kind = mesh.userData.battlefieldRoleMarkerKind as 'crest' | 'siege' | undefined;
    const batch = kind === 'crest'
      ? this.unitRoleCrestBatch
      : kind === 'siege'
        ? this.unitRoleSiegeBatch
        : null;
    if (!roleMarker.userData.instancedBatch || !batch) {
      roleMarker.visible = shouldShow;
      return;
    }
    if (!shouldShow) {
      roleMarker.visible = false;
      return;
    }

    const cursor = kind === 'crest'
      ? this.unitRoleCrestInstanceCursor
      : this.unitRoleSiegeInstanceCursor;
    if (cursor >= batch.instanceMatrix.count) {
      // Preserve the original child mesh when a custom battle exceeds the batch capacity.
      roleMarker.visible = true;
      return;
    }

    mesh.updateMatrixWorld(true);
    batch.setMatrixAt(cursor, roleMarker.matrixWorld);
    roleMarker.visible = false;
    if (kind === 'crest') this.unitRoleCrestInstanceCursor++;
    else this.unitRoleSiegeInstanceCursor++;
  }

  private writeUnitBuffRingInstance(mesh: THREE.Group): void {
    const buffRing = mesh.userData.unitBuffRingMesh as THREE.Mesh | undefined;
    if (!buffRing) return;

    const shouldShow = buffRing.userData.batchVisible === true;
    if (!buffRing.userData.instancedBatch || !this.unitBuffRingBatch) {
      buffRing.visible = shouldShow;
      return;
    }
    if (!shouldShow) {
      buffRing.visible = false;
      return;
    }
    if (this.unitBuffRingInstanceCursor >= this.unitBuffRingBatch.instanceMatrix.count) {
      buffRing.visible = true;
      return;
    }

    mesh.updateMatrixWorld(true);
    this.unitBuffRingBatch.setMatrixAt(this.unitBuffRingInstanceCursor, buffRing.matrixWorld);
    this.unitBuffRingInstanceCursor++;
    buffRing.visible = false;
  }

  private writeUnitRoleAndBuffInstances(mesh: THREE.Group): void {
    this.writeUnitRoleMarkerInstance(mesh);
    this.writeUnitBuffRingInstance(mesh);
  }

  private rebuildUnitRoleMarkerInstances(): void {
    this.unitRoleCrestInstanceCursor = 0;
    this.unitRoleSiegeInstanceCursor = 0;
    for (const mesh of this.unitMeshes.values()) {
      if (mesh.visible) this.writeUnitRoleMarkerInstance(mesh);
    }
    for (const effect of this.dyingEffects) {
      this.writeUnitRoleMarkerInstance(effect.mesh);
    }
    this.finalizeUnitRoleMarkerInstances();
  }

  private finalizeUnitRoleMarkerInstances(): void {
    if (this.unitRoleCrestBatch) {
      this.unitRoleCrestBatch.count = this.unitRoleCrestInstanceCursor;
      if (this.unitRoleCrestInstanceCursor > 0) this.unitRoleCrestBatch.instanceMatrix.needsUpdate = true;
    }
    if (this.unitRoleSiegeBatch) {
      this.unitRoleSiegeBatch.count = this.unitRoleSiegeInstanceCursor;
      if (this.unitRoleSiegeInstanceCursor > 0) this.unitRoleSiegeBatch.instanceMatrix.needsUpdate = true;
    }
  }

  private writeUnitDecorationInstances(mesh: THREE.Group): void {
    const shadow = mesh.userData.unitContactShadowMesh as THREE.Mesh | undefined;
    const factionRing = mesh.userData.unitFactionRingMesh as THREE.Mesh | undefined;
    const shadowBatch = this.unitContactShadowBatch;
    const ringBatch = this.unitFactionRingBatch;
    if (!shadow || !factionRing || !shadowBatch || !ringBatch) {
      if (shadow) shadow.visible = true;
      if (factionRing) factionRing.visible = true;
      return;
    }

    const instanceIndex = this.unitDecorationInstanceCursor;
    if (instanceIndex >= shadowBatch.instanceMatrix.count || instanceIndex >= ringBatch.instanceMatrix.count) {
      // Keep decoration visible if a custom scenario exceeds the preallocated instancing capacity.
      shadow.visible = true;
      factionRing.visible = true;
      return;
    }

    shadow.visible = false;
    factionRing.visible = false;
    const rootScale = mesh.scale.x;
    this.unitDecorationDummy.position.set(
      mesh.position.x,
      mesh.position.y + shadow.position.y * mesh.scale.y,
      mesh.position.z,
    );
    this.unitDecorationDummy.rotation.set(0, 0, 0);
    const shadowScale = Math.abs(shadow.scale.x * rootScale);
    this.unitDecorationDummy.scale.set(shadowScale, shadowScale, shadowScale);
    this.unitDecorationDummy.updateMatrix();
    shadowBatch.setMatrixAt(instanceIndex, this.unitDecorationDummy.matrix);

    this.unitDecorationDummy.position.y = mesh.position.y + factionRing.position.y * mesh.scale.y;
    const ringScale = Math.abs(factionRing.scale.x * rootScale);
    this.unitDecorationDummy.scale.set(ringScale, ringScale, ringScale);
    this.unitDecorationDummy.updateMatrix();
    ringBatch.setMatrixAt(instanceIndex, this.unitDecorationDummy.matrix);

    const ringMaterial = factionRing.material as THREE.MeshBasicMaterial;
    this.unitDecorationColor.copy(ringMaterial.color);
    ringBatch.setColorAt(instanceIndex, this.unitDecorationColor);
    this.unitDecorationInstanceCursor++;
  }

  private finalizeUnitDecorationInstances(): void {
    const count = this.unitDecorationInstanceCursor;
    if (this.unitContactShadowBatch) {
      this.unitContactShadowBatch.count = count;
      if (count > 0) this.unitContactShadowBatch.instanceMatrix.needsUpdate = true;
    }
    if (this.unitFactionRingBatch) {
      this.unitFactionRingBatch.count = count;
      if (count > 0) {
        this.unitFactionRingBatch.instanceMatrix.needsUpdate = true;
        if (this.unitFactionRingBatch.instanceColor) this.unitFactionRingBatch.instanceColor.needsUpdate = true;
      }
    }
    this.finalizeUnitRoleMarkerInstances();
    if (this.unitBuffRingBatch) {
      this.unitBuffRingBatch.count = this.unitBuffRingInstanceCursor;
      if (this.unitBuffRingInstanceCursor > 0) this.unitBuffRingBatch.instanceMatrix.needsUpdate = true;
    }
  }

  public addUnit(def: UnitDefinition, faction: FactionId, x: number, z: number, stableId?: string): UnitEntity {
    const id = stableId || `unit_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const team = this.getParticipant(faction)?.team ?? (faction === 'player' ? 1 : 2);
    const age = this.ageByFaction[faction] || 1;
    const hasAura = this.hasUniqueBuildingAura(faction);
    const effectiveDef = this.findUnitDef(def.id, faction) || {
      ...def,
      stats: this.applyLandmarkPerksToStats(
        applyCivilizationAndTechStats(
          def.stats,
          def.category,
          this.getCivilizationForFaction(faction),
          this.getResearchedTechs(faction),
          age,
          hasAura
        ),
        def.category,
        faction
      ),
    };

    const unitCiv = this.getCivilizationForFaction(faction);
    const xpEligible = canUnitGainXp(effectiveDef.id, unitCiv);
    const unit: UnitEntity = {
      id,
      type: 'unit',
      faction,
      team,
      unitDefId: effectiveDef.id,
      unitDef: JSON.parse(JSON.stringify(effectiveDef)),
      x,
      z,
      hp: effectiveDef.stats.maxHp,
      maxHp: effectiveDef.stats.maxHp,
      state: 'idle',
      attackCooldown: 0,
      abilityCooldown: 0,
      velocity: { x: 0, z: 0 },
      morale: 100,
      suppression: 0,
      kills: 0,
      xp: xpEligible ? 0 : undefined,
      level: xpEligible ? 1 : undefined,
      attackMoveGoal: null,
    };
    this.units.push(unit);

    const mesh = createUnitMesh(unit.unitDef, faction, {
      age: this.ageByFaction[faction] || 1,
      researchedTechIds: this.getResearchedTechs(faction),
      unitId: unit.unitDefId,
      level: unit.level || 1,
      visualSeed: unit.id,
    });
    this.prepareUnitMeshForDecorationBatch(mesh);
    mesh.position.set(x, 0, z);
    Object.assign(mesh.userData, { type: 'unit', id, faction, team });
    this.scene.add(mesh);
    this.unitMeshes.set(id, mesh);

    if (this.isHumanControlled(faction)) {
      this.stats.unitsTrained++;
    }

    return unit;
  }

  private refreshSettlementEnvironment(): void {
    if (this.settlementEnvironmentGroup) {
      this.scene.remove(this.settlementEnvironmentGroup);
      disposeSettlementEnvironment(this.settlementEnvironmentGroup);
    }

    this.settlementEnvironmentGroup = createSettlementEnvironment(
      this.buildings.map((building) => ({
        id: building.id,
        faction: building.faction,
        buildingType: building.buildingType,
        x: building.x,
        z: building.z,
        hp: building.hp,
      })),
      this.mapLayout
    );
    this.scene.add(this.settlementEnvironmentGroup);
  }

  private refreshWallTowerConnections(): void {
    const towers = this.buildings.filter(
      (building) => building.buildingType === 'tower' && building.hp > 0 && building.isConstructed
    );
    for (const building of this.buildings) {
      if (!building.buildingDef.isWall) continue;
      building.wallTowerLinked = isWallLinkedToTower(building, towers);
    }
  }

  public toggleGate(buildingId: string): boolean {
    const gate = this.buildings.find((building) => building.id === buildingId);
    if (!gate || gate.buildingType !== 'gate' || gate.hp <= 0 || !gate.isConstructed || gate.wallBreached || !this.isHumanControlled(gate.faction)) return false;
    gate.gateOpen = !gate.gateOpen;
    this.refreshWallTowerConnections();
    this.navGridDirty = true;
    this.waterNavGridDirty = true;
    sound.playOrder();
    this.addFloatingText(gate.x, 3.0, gate.z, gate.gateOpen ? '🚪 城門開啟 · 友軍可通行' : '🛡️ 城門關閉 · 防線封鎖', gate.gateOpen ? '#86efac' : '#fbbf24');
    this.onSelectionChange?.();
    return true;
  }

  /** Assign selected infantry/cavalry/ranged guards to patrol their nearest friendly wall chain. */
  public issueWallPatrolOrder(): number {
    const selected = this.selectedUnitIds
      .map((id) => this.units.find((unit) => unit.id === id))
      .filter((unit): unit is UnitEntity => !!unit && unit.hp > 0 && !unit.garrisonedInBuildingId && !unit.unitDef.isNaval && unit.unitDef.category !== 'worker' && unit.unitDef.category !== 'siege' && this.isHumanControlled(unit.faction));
    const availableWalls = this.buildings.filter((building) => building.faction === this.humanPlayerId && building.buildingDef.isWall && building.hp > 0 && building.isConstructed && !building.wallBreached && !(building.buildingType === 'gate' && building.gateOpen));
    if (selected.length === 0 || availableWalls.length === 0) {
      sound.playInvalid();
      return 0;
    }

    const townCenter = this.buildings.find((building) => building.faction === this.humanPlayerId && building.buildingType === 'town_center' && building.hp > 0);
    let assigned = 0;
    for (const unit of selected) {
      const nearestWall = [...availableWalls].sort((a, b) => getDistance(unit.x, unit.z, a.x, a.z) - getDistance(unit.x, unit.z, b.x, b.z))[0];
      const chainId = nearestWall.wallChainId;
      const chain = availableWalls.filter((wall) => chainId ? wall.wallChainId === chainId : wall.id === nearestWall.id).sort((a, b) => (a.wallChainIndex ?? 0) - (b.wallChainIndex ?? 0));
      const route: Array<{ x: number; z: number }> = [];
      for (const wall of chain) {
        const yaw = wall.rotationY || 0;
        const dirX = Math.cos(yaw);
        const dirZ = -Math.sin(yaw);
        const normalX = -dirZ;
        const normalZ = dirX;
        const plus = { x: wall.x + normalX * 2.25, z: wall.z + normalZ * 2.25 };
        const minus = { x: wall.x - normalX * 2.25, z: wall.z - normalZ * 2.25 };
        const usePlus = !townCenter || getDistance(plus.x, plus.z, townCenter.x, townCenter.z) <= getDistance(minus.x, minus.z, townCenter.x, townCenter.z);
        const side = usePlus ? 1 : -1;
        route.push({ x: wall.x + normalX * 2.25 * side, z: wall.z + normalZ * 2.25 * side });
      }
      if (chain.length === 1) {
        const wall = chain[0];
        const yaw = wall.rotationY || 0;
        const dirX = Math.cos(yaw);
        const dirZ = -Math.sin(yaw);
        const centerPoint = route[0];
        route.unshift({ x: centerPoint.x - dirX * 1.15, z: centerPoint.z - dirZ * 1.15 });
        route.push({ x: centerPoint.x + dirX * 1.15, z: centerPoint.z + dirZ * 1.15 });
      } else if (chain.length > 1) {
        const firstYaw = chain[0].rotationY || 0;
        const lastYaw = chain[chain.length - 1].rotationY || 0;
        route.unshift({ x: route[0].x - Math.cos(firstYaw) * 1.15, z: route[0].z + Math.sin(firstYaw) * 1.15 });
        const last = route[route.length - 1];
        route.push({ x: last.x + Math.cos(lastYaw) * 1.15, z: last.z - Math.sin(lastYaw) * 1.15 });
      }
      if (route.length < 2) continue;
      let nearestIndex = 0;
      let nearestDistance = Infinity;
      route.forEach((point, index) => {
        const distance = getDistance(unit.x, unit.z, point.x, point.z);
        if (distance < nearestDistance) { nearestDistance = distance; nearestIndex = index; }
      });
      unit.wallPatrolRoute = route;
      unit.wallPatrolIndex = nearestIndex;
      unit.commandQueue = undefined;
      unit.queuedGatherStopAfterDeposit = false;
      unit.targetEntityId = undefined;
      unit.targetResourceNodeId = undefined;
      unit.targetBuildingId = undefined;
      unit.attackMoveGoal = null;
      unit.waypoints = undefined;
      unit.pathGoal = undefined;
      unit.pathCooldown = 0;
      unit.targetX = route[nearestIndex].x;
      unit.targetZ = route[nearestIndex].z;
      unit.state = 'moving';
      unit.currentActionText = '🛡️ 沿城牆巡邏';
      assigned++;
    }
    if (assigned > 0) { sound.playOrder(); this.onSelectionChange?.(); }
    return assigned;
  }

  public addBuilding(
    type: BuildingType,
    faction: FactionId,
    x: number,
    z: number,
    instant = false,
    rotationY = 0,
    refreshEnvironment = true
  ): BuildingEntity {
    const baseDef = DEFAULT_BUILDINGS[type];
    const civ = this.getCivilizationForFaction(faction);
    const civCfg = getCivilizationConfig(civ);
    const customName = civCfg.buildingNames[type]
      ? `${civCfg.buildingNames[type]} (${baseDef.name.split('(')[1] || `${type})`}`
      : baseDef.name;
    const bDef = {
      ...baseDef,
      name: customName,
      trainableUnits: getTrainableUnitsForBuilding(type, civ, baseDef.trainableUnits),
    };
    const researchedTechs = this.getResearchedTechs(faction);
    let hpMult = 1;
    researchedTechs.forEach((tId) => {
      const t = findTechDef(tId);
      if (t?.effect.buildingHpMultiplier) hpMult *= t.effect.buildingHpMultiplier;
    });
    const finalMaxHp = Math.round(bDef.maxHp * hpMult);
    const id = `bldg_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const team = this.getParticipant(faction)?.team ?? (faction === 'player' ? 1 : 2);
    const building: BuildingEntity = {
      id,
      type: 'building',
      faction,
      team,
      civilization: civ,
      buildingType: type,
      buildingDef: bDef,
      x,
      z,
      rotationY,
      gateOpen: false,
      wallBreached: false,
      wallRepairPaid: false,
      hp: instant ? finalMaxHp : Math.round(finalMaxHp * 0.1),
      maxHp: finalMaxHp,
      isConstructed: instant,
      buildProgress: instant ? 1 : 0.1,
      queue: [],
      queueProgress: 0,
      activeTechId: null,
      researchProgress: 0,
      attackCooldown: 0,
      garrisonedUnitIds: [],
      ovooMode: type === 'ovoo_relay' ? 'yam_relay' : undefined,
      ovooHornCooldown: type === 'ovoo_relay' ? 0 : undefined,
    };
    this.buildings.push(building);
    this.navGridDirty = true;
    this.waterNavGridDirty = true;

    const mesh = createBuildingMesh(type, faction, civ, this.ageByFaction[faction] || 1);
    mesh.position.set(x, 0, z);
    mesh.rotation.y = rotationY;
    mesh.userData = { ...mesh.userData, type: 'building', id, faction, team };
    applyBuildingConstructionVisuals(
      mesh,
      computeBuildingVisualState(instant, building.buildProgress, building.hp, building.maxHp)
    );
    this.scene.add(mesh);
    this.buildingMeshes.set(id, mesh);
    if (hasAmbientBuildingAnimation(mesh.userData)) this.animatedBuildingMeshes.add(mesh);
    if (refreshEnvironment) {
      this.refreshSettlementEnvironment();
      this.refreshWallTowerConnections();
    }

    if (this.isHumanControlled(faction) && instant) {
      this.stats.buildingsConstructed++;
    }

    return building;
  }

  public addResourceNode(
    id: string,
    type: ResourceType,
    x: number,
    z: number,
    amount: number,
    hasBadge = true,
    subtype?: ResourceNode['subtype'],
    nodeTier: ResourceNode['nodeTier'] = 'standard'
  ): ResourceNode {
    const resolvedSubtype: ResourceNode['subtype'] =
      subtype || (type === 'food' ? 'farm' : type);
    const node: ResourceNode = {
      id,
      resourceType: type,
      subtype: resolvedSubtype,
      nodeTier,
      x,
      z,
      amount,
      maxAmount: amount,
    };
    if (resolvedSubtype === 'boar' || resolvedSubtype === 'hunt') {
      node.animalMaxHp = resolvedSubtype === 'boar' ? 200 : 32;
      node.animalHp = node.animalMaxHp;
      node.animalAlive = true;
    }
    this.resourceNodes.push(node);
    this.navGridDirty = true;

    let mesh: THREE.Group;
    if (type === 'wood') {
      mesh = createTreeMesh(hasBadge, nodeTier, amount, id);
    } else if (type === 'gold') {
      mesh = createGoldMineMesh(amount, nodeTier);
    } else if (type === 'stone') {
      mesh = createStoneQuarryMesh(amount, nodeTier);
    } else if (resolvedSubtype === 'berry') {
      mesh = createBerryBushMesh(amount, hasBadge);
    } else if (resolvedSubtype === 'hunt') {
      mesh = createDeerMesh(amount, hasBadge);
    } else if (resolvedSubtype === 'boar') {
      mesh = createWildBoarMesh(amount, hasBadge);
    } else if (resolvedSubtype === 'shore_fish') {
      mesh = createShoreFishMesh(amount, hasBadge);
    } else if (resolvedSubtype === 'deep_fish') {
      mesh = createDeepFishMesh(amount, hasBadge);
    } else {
      // Farm food nodes sit inside Farms, which provide the visual crop building mesh
      mesh = new THREE.Group();
      const hitDisc = new THREE.Mesh(
        new THREE.CircleGeometry(2.1, 12),
        new THREE.MeshBasicMaterial({ visible: false })
      );
      hitDisc.rotation.x = -Math.PI / 2;
      hitDisc.position.y = 0.25;
      mesh.add(hitDisc);
    }
    mesh.position.set(x, 0, z);
    mesh.userData = { ...mesh.userData, type: 'resource', id, resourceType: type, subtype: resolvedSubtype };
    this.scene.add(mesh);
    this.nodeMeshes.set(id, mesh);
    this.resourceVisualLodQueue.add(mesh);
    if (isFishAnimationSubtype(resolvedSubtype)) this.fishAnimatedNodeMeshes.add(mesh);
    if (mesh.userData.treeWind) this.windAnimatedNodeMeshes.add(mesh);
    if (resolvedSubtype === 'hunt') attachDeerAssetLod(mesh);
    if (isFishAnimationSubtype(resolvedSubtype)) attachFishAssetLod(mesh);
    if (resolvedSubtype === 'boar' || resolvedSubtype === 'hunt') this.updateWildlifeOverheadBadge(node, mesh);
    if (type === 'wood' && nodeTier === 'standard') {
      const variantSeed = Array.from(id).reduce((sum, char) => sum + char.charCodeAt(0), 0);
      attachKayKitTreeLod(mesh, variantSeed % 2 === 0 ? 'A' : 'B');
    }

    return node;
  }

  public isAutoReseedFarmsEnabled(faction?: FactionId): boolean {
    const f = faction || this.humanPlayerId;
    return this.autoReseedFarmsByFaction[f] !== false;
  }

  public toggleAutoReseedFarms(faction?: FactionId): boolean {
    const f = faction || this.humanPlayerId;
    const next = !this.isAutoReseedFarmsEnabled(f);
    this.autoReseedFarmsByFaction[f] = next;
    sound.playSelect();
    this.onStateChange?.();
    return next;
  }

  private estimateResourceDeliveryTravelDistance(
    faction: FactionId,
    worker: { unitDef: UnitEntity['unitDef']; x: number; z: number },
    node: Pick<ResourceNode, 'id' | 'resourceType' | 'subtype' | 'x' | 'z'>
  ): number | null {
    const isNaval = !!worker.unitDef.isNaval || worker.unitDef.id === 'fishing_boat';
    const resourceType = node.resourceType;
    const dropOffs = this.buildings.filter((building) => {
      if (building.faction !== faction || !building.isConstructed || building.hp <= 0) return false;
      if (isNaval) return building.buildingType === 'dock';
      if (building.buildingType === 'town_center') return true;
      if (resourceType === 'food') {
        return ['dock', 'granary', 'farm'].includes(building.buildingType);
      }
      if (resourceType === 'wood') return building.buildingType === 'lumber_camp';
      return (resourceType === 'gold' || resourceType === 'stone') && building.buildingType === 'mining_camp';
    });
    if (dropOffs.length === 0) return null;

    // stepUnitReturning chooses the closest valid drop-off from the worker's
    // current gathering position. The node stance is a stable estimate of it.
    let nearest = dropOffs[0];
    let nearestDistance = getDistance(node.x, node.z, nearest.x, nearest.z);
    for (let index = 1; index < dropOffs.length; index++) {
      const candidate = dropOffs[index];
      const distance = getDistance(node.x, node.z, candidate.x, candidate.z);
      if (distance < nearestDistance) {
        nearest = candidate;
        nearestDistance = distance;
      }
    }

    const grid = isNaval ? this.getWaterNavGrid() : this.getNavGrid();
    let cache = this.economyDeliveryRouteCache.get(grid);
    if (!cache) {
      cache = new Map<string, number>();
      this.economyDeliveryRouteCache.set(grid, cache);
    }
    const cacheKey = `${node.id}:${nearest.id}:${isNaval ? 'water' : 'land'}`;
    const cached = cache.get(cacheKey);
    if (cached !== undefined) return cached;

    const nodeRadius = getResourceColliderRadius(node.resourceType, node.subtype);
    const gatherRange =
      node.subtype === 'deep_fish'
        ? Math.max(5.5, nodeRadius + 4.4)
        : node.subtype === 'shore_fish'
          ? Math.max(3.6, nodeRadius + 2.65)
          : nodeRadius + 1.35;
    const depositRange = Math.max(
      2.6,
      getBuildingCollisionRadius(nearest) + (nearest.buildingType === 'dock' ? 3.6 : 1.85)
    );
    const dx = nearest.x - node.x;
    const dz = nearest.z - node.z;
    const centerDistance = Math.hypot(dx, dz);
    if (centerDistance <= gatherRange + depositRange || centerDistance <= 0.001) {
      cache.set(cacheKey, 0);
      return 0;
    }

    // Path from the actual harvesting interaction ring to the actual drop-off
    // interaction ring, rather than center-to-center distance. A* therefore
    // includes terrain, buildings, walls, bridges and naval/land route rules.
    const dirX = dx / centerDistance;
    const dirZ = dz / centerDistance;
    const startX = node.x + dirX * gatherRange;
    const startZ = node.z + dirZ * gatherRange;
    const goalX = nearest.x - dirX * depositRange;
    const goalZ = nearest.z - dirZ * depositRange;
    const points = findPath(startX, startZ, goalX, goalZ, grid);
    let routeDistance = 0;
    let previous = { x: startX, z: startZ };
    for (const point of points) {
      routeDistance += getDistance(previous.x, previous.z, point.x, point.z);
      previous = point;
    }
    const result = Number.isFinite(routeDistance) ? Math.max(0, routeDistance) : centerDistance - gatherRange - depositRange;
    cache.set(cacheKey, result);
    return result;
  }

  public getFactionResourceTelemetry(faction?: FactionId): FactionResourceTelemetry {
    const f = faction || this.humanPlayerId;
    const hasOath = (this.starOathUntil[f] || 0) > this.simTime;
    return computeFactionResourceTelemetry(
      f,
      this.units,
      this.resourceNodes,
      this.contestedPoints,
      this.getResearchedTechs(f),
      hasOath,
      (worker, node) => this.estimateResourceDeliveryTravelDistance(f, worker, node)
    );
  }

  public assignAllIdleWorkersToNode(nodeId: string): number {
    const node = this.resourceNodes.find((n) => n.id === nodeId && n.amount > 0);
    if (!node) return 0;
    const idleWorkers = this.units.filter(
      (u) =>
        this.isHumanControlled(u.faction) &&
        u.hp > 0 &&
        u.unitDef.category === 'worker' &&
        u.state === 'idle' &&
        !u.garrisonedInBuildingId &&
        canUnitGatherNode(u.unitDef, node)
    );
    if (idleWorkers.length === 0) {
      sound.playInvalid();
      return 0;
    }
    this.selectedUnitIds = idleWorkers.map((u) => u.id);
    this.issueGatherOrder(nodeId);
    this.onSelectionChange?.();
    return idleWorkers.length;
  }

  public selectNextResourceOfType(type: ResourceType, fromNodeId?: string): ResourceNode | null {
    const pool = this.resourceNodes.filter((n) => n.resourceType === type && n.amount > 0);
    if (pool.length === 0) return null;
    const curIdx = fromNodeId ? pool.findIndex((n) => n.id === fromNodeId) : -1;
    const next = pool[(curIdx + 1) % pool.length];
    this.selectedNodeId = next.id;
    this.selectedBuildingId = null;
    this.selectedUnitIds = [];
    this.selectedContestedPointId = null;
    this.cameraTarget.set(next.x, 0, next.z);
    this.cameraDesiredTarget = null;
    this.updateCameraPosition();
    sound.playSelect();
    this.onSelectionChange?.();
    return next;
  }

  public getOrCreateFarmFoodNode(building: BuildingEntity): ResourceNode | null {
    if (building.buildingType !== 'farm' || !building.isConstructed) return null;
    let node = this.resourceNodes.find(
      (n) =>
        n.resourceType === 'food' &&
        n.amount > 0 &&
        (n.id === `food_${building.id}` || Math.hypot(n.x - building.x, n.z - building.z) < 2.5)
    );
    if (!node) {
      node = this.addResourceNode(`food_${building.id}`, 'food', building.x, building.z, 2500, true, 'farm');
    }
    return node;
  }

  private refreshFarmCropDepletionVisual(node: ResourceNode): void {
    if (node.subtype !== 'farm') return;

    const bucket = Math.ceil((node.amount / Math.max(1, node.maxAmount)) * 20);
    if ((node as any)._lastFarmCropBucket === bucket) return;
    (node as any)._lastFarmCropBucket = bucket;

    const farmId = node.id.startsWith('food_') ? node.id.slice(5) : '';
    const exactFarm = farmId ? this.buildings.find((building) => building.id === farmId) : undefined;
    const farm =
      exactFarm?.buildingType === 'farm'
        ? exactFarm
        : this.buildings
            .filter((building) => building.buildingType === 'farm' && building.hp > 0)
            .sort((a, b) => getDistance(a.x, a.z, node.x, node.z) - getDistance(b.x, b.z, node.x, node.z))[0];
    if (!farm) return;

    const farmMesh = this.buildingMeshes.get(farm.id);
    if (farmMesh) updateFarmCropVisual(farmMesh, node.amount, node.maxAmount);
  }

  public spawnCommandIndicator(x: number, z: number, kind: 'move' | 'attack' | 'gather' | 'build' | 'rally') {
    const colorMap = {
      move: 0x4ade80,
      attack: 0xef4444,
      gather: 0xfbbf24,
      build: 0x38bdf8,
      rally: 0xf59e0b,
    };
    const mesh = createCommandRingMesh(colorMap[kind]);
    mesh.position.set(x, 0.06, z);
    this.scene.add(mesh);
    this.commandIndicators.push({ mesh, age: 0, maxAge: 0.65 });
  }

  // ------------------ PLAYER COMMANDS & CONTROL GROUPS ------------------

  public assignControlGroup(groupNum: number, append = false) {
    if (groupNum < 1 || groupNum > 9) return;
    const validIds = this.selectedUnitIds.filter((uid) => {
      const u = this.units.find((unit) => unit.id === uid);
      return !!u && u.hp > 0 && this.isHumanControlled(u.faction);
    });
    if (validIds.length === 0) return;

    this.controlGroups = updateControlGroup(this.controlGroups, groupNum, validIds, append);
    sound.playSelect();
    const first = this.units.find((u) => u.id === validIds[0]);
    if (first) {
      this.addFloatingText(
        first.x,
        2.8,
        first.z,
        append ? `➕ 已編入第 ${groupNum} 隊列 (${this.controlGroups[groupNum].length})` : `🔢 編組第 ${groupNum} 隊列 (${this.controlGroups[groupNum].length})`,
        '#fbbf24'
      );
    }
    this.onSelectionChange?.();
  }

  public addUnitIdsToControlGroup(groupNum: number, unitIds: string[]) {
    if (groupNum < 1 || groupNum > 9 || unitIds.length === 0) return;
    this.controlGroups = updateControlGroup(this.controlGroups, groupNum, unitIds, true);
    sound.playSelect();
    this.onSelectionChange?.();
  }

  public setCameraFocus(x: number, z: number) {
    this.cameraDesiredTarget = new THREE.Vector3(
      Math.max(-84, Math.min(84, x)),
      0,
      Math.max(-84, Math.min(84, z))
    );
  }

  public spawnShockwaveRing(x: number, z: number, colorHex: number, maxScale = 4.5) {
    const geo = new THREE.RingGeometry(0.4, 0.72, 28);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, 0.14, z);
    this.scene.add(mesh);
    this.shockwaveRings.push({ mesh, age: 0, maxAge: 0.55, maxScale });
  }

  public awardUnitXp(unit: UnitEntity, gainedXp: number) {
    if (!unit || unit.hp <= 0 || gainedXp <= 0) return;
    if (!canUnitGainXp(unit.unitDefId, this.getCivilizationForFaction(unit.faction))) return;

    const prevLvl = unit.level || 1;
    const res = computeUnitXpGain(unit.xp || 0, prevLvl, gainedXp);
    unit.xp = res.xp;
    unit.level = res.level;

    if (res.levelsGained > 0) {
      for (let i = 0; i < res.levelsGained; i++) {
        unit.maxHp = Math.round(unit.maxHp * 1.14);
        unit.hp = Math.min(unit.maxHp, unit.hp + Math.round(unit.maxHp * 0.3));
        unit.unitDef.stats.attack = Math.round(unit.unitDef.stats.attack * 1.12 + 2);
        unit.unitDef.stats.defense += 1;
        if (unit.unitDef.specialAbility) {
          unit.unitDef.specialAbility.potency = Math.round(unit.unitDef.specialAbility.potency * 1.18);
        }
      }
      this.spawnParticleBurst(unit.x, 1.4, unit.z, 'gold', 12);
      this.spawnShockwaveRing(unit.x, unit.z, 0xfbbf24, 3.4);
      this.addFloatingText(unit.x, 2.7, unit.z, `⭐ 覺醒 Lv.${res.level} ${getLevelTitle(res.level)}！`, '#facc15');
      if (this.isHumanControlled(unit.faction)) {
        sound.playAgeUp();
        this.onSelectionChange?.();
      }
    }
  }

  public startResearch(buildingId: string, techId: string): boolean {
    const bldg = this.buildings.find((b) => b.id === buildingId);
    if (!bldg || !bldg.isConstructed || bldg.activeTechId) return false;

    const tech = findTechDef(techId);
    if (!tech) return false;
    if (tech.buildingType !== bldg.buildingType) return false;
    if (this.buildings.some((other) => other.faction === bldg.faction && other.activeTechId === techId)) return false;

    const researched = this.getResearchedTechs(bldg.faction);
    const age = (this.ageByFaction[bldg.faction] || 1) as AgeLevel;
    const researchCheck = canResearchTech(tech, researched, age);
    if (!researchCheck.ok) {
      if (this.isHumanControlled(bldg.faction) && researchCheck.reason) {
        sound.playInvalid();
        this.addFloatingText(bldg.x, 3.0, bldg.z, `🔒 ${researchCheck.reason}`, '#f59e0b');
      }
      return false;
    }

    const res = this.getResourcesForFaction(bldg.faction);
    if (!canAfford(res, tech.cost)) return false;

    this.resourcesByFaction[bldg.faction] = deductCost(res, tech.cost);
    this.syncHumanResourcesAlias();
    if (this.isHumanControlled(bldg.faction)) {
      this.onResourcesChange?.(this.playerResources);
      sound.playConstruct();
    }

    bldg.activeTechId = techId;
    bldg.researchProgress = 0;
    this.onSelectionChange?.();
    return true;
  }

  private applyCompletedTech(faction: FactionId, tech: TechDefinition) {
    if (!this.researchedTechsByFaction[faction]) {
      this.researchedTechsByFaction[faction] = [];
    }
    if (!this.researchedTechsByFaction[faction].includes(tech.id)) {
      this.researchedTechsByFaction[faction].push(tech.id);
    }

    const cooldownMult = tech.effect.cooldownMultiplier || 1;
    if (cooldownMult !== 1) {
      this.units.forEach((u) => {
        if (u.faction !== faction || u.hp <= 0) return;
        if (tech.targetCategories && !tech.targetCategories.includes(u.unitDef.category)) return;
        if (u.unitDef.specialAbility) {
          u.unitDef.specialAbility.cooldown = Math.max(3, Math.round(u.unitDef.specialAbility.cooldown * cooldownMult));
        }
      });
    }

    this.refreshFactionUnitStats(faction);

    if (tech.effect.buildingHpMultiplier) {
      const bHpMult = tech.effect.buildingHpMultiplier;
      this.buildings.forEach((b) => {
        if (b.faction !== faction || b.hp <= 0) return;
        const oldMax = b.maxHp;
        b.maxHp = Math.round(b.maxHp * bHpMult);
        b.hp = Math.min(b.maxHp, b.hp + Math.max(0, b.maxHp - oldMax));
      });
    }

    this.refreshFactionUnitMeshes(faction);
    if (this.isHumanControlled(faction)) {
      sound.playAgeUp();
      this.addFloatingText(
        this.cameraTarget.x,
        4.0,
        this.cameraTarget.z,
        `🔬 科技完成：${tech.name} (${tech.effectLabel})`,
        '#38bdf8'
      );
    }
    const researchedBldg = this.buildings.find((b) => b.faction === faction && b.buildingType === tech.buildingType);
    if (researchedBldg) {
      this.spawnParticleBurst(researchedBldg.x, 2.2, researchedBldg.z, 'spark', 10);
      this.spawnShockwaveRing(researchedBldg.x, researchedBldg.z, 0x38bdf8, researchedBldg.buildingDef.size + 1.2);
    }
    this.onStateChange?.();
  }

  private isLandPointClear(x: number, z: number, radius = 0.7): boolean {
    if (Math.abs(x) > 94 || Math.abs(z) > 94) return false;
    if (this.mapLayout) {
      if (
        isPointInTerrainObstacle(
          x,
          z,
          this.mapLayout.waterRects,
          this.mapLayout.waterDiscs,
          this.mapLayout.bridges
        )
      ) return false;
      for (const cliff of this.mapLayout.cliffDiscs) {
        if (Math.hypot(x - cliff.x, z - cliff.z) <= cliff.radius + radius) return false;
      }
    }
    for (const building of this.buildings) {
      if (building.hp <= 0) continue;
      const buildingRadius = getBuildingCollisionRadius(building);
      if (buildingRadius > 0 &&
        Math.hypot(x - building.x, z - building.z) <= buildingRadius + radius) return false;
    }
    return true;
  }

  public toggleOvooMode(buildingId: string): boolean {
    const building = this.buildings.find((entry) =>
      entry.id === buildingId && entry.hp > 0 && entry.buildingType === 'ovoo_relay'
    );
    if (!building) return false;
    const nextMode = building.ovooMode === 'sacred_extraction' ? 'yam_relay' : 'sacred_extraction';
    building.ovooMode = nextMode;
    this.spawnShockwaveRing(building.x, building.z, nextMode === 'yam_relay' ? 0xf59e0b : 0x38bdf8, 6.5);
    this.spawnParticleBurst(building.x, 2, building.z, 'spark', 12);
    this.addFloatingText(
      building.x, 3.8, building.z,
      nextMode === 'yam_relay' ? '🐎 驛馬軍令：加速訓練與治療騎兵' : '🗿 敖包聚靈：無損採礦與靈箭防衛',
      nextMode === 'yam_relay' ? '#fbbf24' : '#38bdf8'
    );
    const mesh = this.buildingMeshes.get(building.id);
    if (mesh) {
      const modeColor = nextMode === 'yam_relay' ? 0xf59e0b : 0x38bdf8;
      const animCrystals = mesh.userData.animCrystals as Array<{ obj: THREE.Object3D }> | undefined;
      animCrystals?.forEach((entry) => {
        const material = (entry.obj as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined;
        material?.color?.setHex(modeColor);
      });
      const aura = mesh.userData.activeAuraRing as THREE.Mesh | undefined;
      if (aura && !Array.isArray(aura.material)) (aura.material as THREE.MeshBasicMaterial).color.setHex(modeColor);
    }
    this.onSelectionChange?.();
    return true;
  }

  public triggerOvooWarHorn(buildingId: string): boolean {
    const building = this.buildings.find((entry) =>
      entry.id === buildingId && entry.hp > 0 && entry.isConstructed && entry.buildingType === 'ovoo_relay'
    );
    if (!building || (building.ovooHornCooldown || 0) > 0) return false;
    building.ovooHornCooldown = 45;
    this.spawnShockwaveRing(building.x, building.z, 0xf59e0b, 16);
    this.spawnParticleBurst(building.x, 2.4, building.z, 'ember', 24);
    this.spawnParticleBurst(building.x, 2.8, building.z, 'spark', 16);
    let buffed = 0;
    for (const ally of this.units) {
      if (ally.hp <= 0 || ally.garrisonedInBuildingId || this.isHostile(building, ally)) continue;
      if (getDistance(building.x, building.z, ally.x, ally.z) > 16) continue;
      ally.buffSpeedUntil = Math.max(ally.buffSpeedUntil || 0, this.simTime + 8);
      ally.buffAttackRateUntil = Math.max(ally.buffAttackRateUntil || 0, this.simTime + 8);
      buffed++;
    }
    this.addFloatingText(building.x, 4.4, building.z, `🔥 長生天狼煙（${buffed} 軍受鼓舞）`, '#fde047');
    this.onSelectionChange?.();
    return true;
  }

  private creditMongolRaidTribute(
    attacker: UnitEntity | undefined,
    victimType: 'unit' | 'building',
    isKillOrRaze: boolean,
  ): void {
    if (!attacker || this.getCivilizationForFaction(attacker.faction) !== 'mongol') return;
    const multiplier = this.getResearchedTechs(attacker.faction).includes('mon_sulde_banner') ? 1.5 : 1;
    let gold = 0;
    let food = 0;
    if (victimType === 'unit') {
      if (!isKillOrRaze) return;
      gold = Math.round(12 * multiplier);
      food = Math.round(8 * multiplier);
    } else if (isKillOrRaze) {
      gold = Math.round(35 * multiplier);
      food = Math.round(25 * multiplier);
    } else {
      const lastTime = (attacker as any)._lastRaidTributeTime || -99;
      if (this.simTime - lastTime < 3) return;
      (attacker as any)._lastRaidTributeTime = this.simTime;
      gold = Math.round(4 * multiplier);
      food = Math.round(3 * multiplier);
    }
    const resources = this.getResourcesForFaction(attacker.faction);
    resources.gold += gold;
    resources.food += food;
    this.syncHumanResourcesAlias();
    if (this.isHumanControlled(attacker.faction)) {
      this.onResourcesChange?.(this.playerResources);
      if (isKillOrRaze || gold >= 6) this.addFloatingText(attacker.x, 2.7, attacker.z, `+${gold}🪙 +${food}🌾 劫掠`, '#fde047');
    }
  }

  private spawnGroundZone(
    faction: FactionId,
    team: number | undefined,
    x: number,
    z: number,
    radius: number,
    duration: number,
    damagePerTick: number,
    casterId?: string,
  ): void {
    const mesh = new THREE.Group();
    mesh.position.set(x, 0.08, z);
    const outer = new THREE.Mesh(
      new THREE.RingGeometry(radius - 0.35, radius, 40),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide, transparent: true, opacity: 0.72, depthWrite: false })
    );
    outer.rotation.x = -Math.PI / 2;
    const inner = new THREE.Mesh(
      new THREE.CircleGeometry(radius * 0.96, 36),
      new THREE.MeshBasicMaterial({ color: 0x0284c7, transparent: true, opacity: 0.16, depthWrite: false })
    );
    inner.rotation.x = -Math.PI / 2;
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.85, 5.2, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x7dd3fc, side: THREE.DoubleSide, transparent: true, opacity: 0.28, depthWrite: false })
    );
    pillar.position.y = 2.6;
    mesh.add(outer, inner, pillar);
    this.scene.add(mesh);
    this.groundZones.push({
      id: `gz_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      kind: 'sky_storm', faction, team, casterId, x, z, radius,
      remaining: duration, duration, tickAccum: 0.85, damagePerTick,
      slowFactor: 0.65, mesh,
    });
  }

  private updateGroundZones(dt: number): void {
    for (let i = this.groundZones.length - 1; i >= 0; i--) {
      const zone = this.groundZones[i];
      zone.remaining -= dt;
      zone.tickAccum += dt;
      zone.mesh.rotation.y += dt * 1.65;
      const pulse = 0.96 + Math.sin(this.simTime * 8 + i) * 0.05;
      zone.mesh.scale.set(pulse, 1, pulse);
      if (zone.tickAccum >= 1) {
        zone.tickAccum -= 1;
        this.spawnParticleBurst(
          zone.x + (Math.random() - 0.5) * zone.radius * 0.9, 2.2,
          zone.z + (Math.random() - 0.5) * zone.radius * 0.9, 'spark', 8
        );
        for (const enemy of this.units) {
          if (enemy.hp <= 0 || enemy.garrisonedInBuildingId ||
            !areHostile({ faction: zone.faction, team: zone.team }, enemy) ||
            getDistance(zone.x, zone.z, enemy.x, enemy.z) > zone.radius) continue;
          const damage = Math.max(6, Math.round(zone.damagePerTick - enemy.unitDef.stats.defense * 0.2));
          enemy.hp -= damage;
          enemy.lastDamagedTime = performance.now();
          enemy.hitFlashTimer = 0.1;
          enemy.slowUntil = this.simTime + 1.35;
          enemy.slowFactor = zone.slowFactor;
          this.addFloatingText(enemy.x, 2.2, enemy.z, `⚡-${damage}`, '#38bdf8');
          if (enemy.hp <= 0 && zone.casterId) {
            const caster = this.units.find((unit) => unit.id === zone.casterId);
            if (caster) {
              caster.kills++;
              this.awardUnitXp(caster, 35);
              this.creditMongolRaidTribute(caster, 'unit', true);
            }
          }
        }
      }
      if (zone.remaining <= 0) {
        this.scene.remove(zone.mesh);
        zone.mesh.traverse((object) => {
          const mesh = object as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.geometry.dispose();
          if (Array.isArray(mesh.material)) mesh.material.forEach((material) => material.dispose());
          else mesh.material.dispose();
        });
        this.groundZones.splice(i, 1);
      }
    }
  }

  public activateUnitAbility(unit: UnitEntity): boolean {
    if (!unit || unit.hp <= 0 || !unit.unitDef.specialAbility || unit.abilityCooldown > 0) return false;
    const ab = unit.unitDef.specialAbility;
    const researched = this.getResearchedTechs(unit.faction);
    let cdMult = 1;
    researched.forEach((tId) => {
      const t = findTechDef(tId);
      if (t?.effect.cooldownMultiplier) cdMult *= t.effect.cooldownMultiplier;
    });
    unit.abilityCooldown = Math.max(3, ab.cooldown * cdMult);

    const gScale = this.getSpatialAudioScale(unit.x, unit.z);
    if (ab.type === 'heal') {
      sound.playConstruct(gScale);
      this.spawnShockwaveRing(unit.x, unit.z, 0x34d399, 6.5);
      this.spawnParticleBurst(unit.x, 1.3, unit.z, 'leaf', 14);
      let healedCount = 0;
      this.units.forEach((ally) => {
        if (ally.hp > 0 && !this.isHostile(unit, ally) && getDistance(unit.x, unit.z, ally.x, ally.z) <= 8.5) {
          ally.hp = Math.min(ally.maxHp, ally.hp + ab.potency);
          healedCount++;
        }
      });
      // 古樹：癒合時藤蔓纏足——附近敵軍短暫大幅降速
      if (unit.unitDef.factionPack === 'fantasy' || unit.unitDefId.includes('paladin') || unit.unitDefId.includes('treant')) {
        this.spawnParticleBurst(unit.x, 0.6, unit.z, 'leaf', 10);
        this.units.forEach((enemy) => {
          if (enemy.hp <= 0 || !this.isHostile(unit, enemy)) return;
          if (getDistance(unit.x, unit.z, enemy.x, enemy.z) > 9) return;
          (enemy as any)._rootSlowUntil = this.simTime + 4.5;
        });
        this.addFloatingText(unit.x, 2.8, unit.z, `癒合·纏足`, '#86efac');
      } else {
        this.addFloatingText(unit.x, 2.8, unit.z, `治療 ${healedCount}`, '#34d399');
      }
    } else if (ab.type === 'haste') {
      if (gScale > 0.15) sound.playOrder();
      this.spawnShockwaveRing(unit.x, unit.z, 0xfbbf24, 5.5);
      this.spawnParticleBurst(unit.x, 1.0, unit.z, 'spark', 12);
      this.units.forEach((ally) => {
        if (ally.hp > 0 && !this.isHostile(unit, ally) && getDistance(unit.x, unit.z, ally.x, ally.z) <= 7.5) {
          ally.buffSpeedUntil = this.simTime + 6.0;
          ally.buffDefenseBonus = Math.max(ally.buffDefenseBonus || 0, 2);
        }
      });
      // 忍界煙幕：清除附近敵方對己方的鎖定
      if (unit.unitDef.factionPack === 'anime' || unit.unitDefId.includes('ninja')) {
        this.spawnParticleBurst(unit.x, 1.4, unit.z, 'smoke', 16);
        this.units.forEach((enemy) => {
          if (enemy.hp <= 0 || !this.isHostile(unit, enemy)) return;
          if (getDistance(unit.x, unit.z, enemy.x, enemy.z) > 10) return;
          if (enemy.targetEntityId) {
            const locked = this.units.find((a) => a.id === enemy.targetEntityId);
            if (locked && locked.faction === unit.faction) {
              enemy.targetEntityId = undefined;
              if (enemy.state === 'attacking') enemy.state = 'idle';
            }
          }
        });
        this.addFloatingText(unit.x, 2.8, unit.z, '煙幕', '#94a3b8');
      } else {
        this.addFloatingText(unit.x, 2.8, unit.z, `⚡ ${ab.name}`, '#fbbf24');
      }
    } else if (ab.type === 'kiting_volley') {
      sound.playArrowShot(gScale);
      this.spawnShockwaveRing(unit.x, unit.z, 0xfbbf24, 3.8);
      this.spawnParticleBurst(unit.x, 1.3, unit.z, 'spark', 10);
      (unit as any)._attackSwing = 0.36;
      const targets = this.units
        .filter((enemy) => enemy.hp > 0 && !enemy.garrisonedInBuildingId &&
          this.isHostile(unit, enemy) &&
          getDistance(unit.x, unit.z, enemy.x, enemy.z) <= unit.unitDef.stats.range + 4)
        .sort((a, b) => getDistance(unit.x, unit.z, a.x, a.z) - getDistance(unit.x, unit.z, b.x, b.z))
        .slice(0, 3);
      for (const enemy of targets) {
        enemy.armorShredUntil = this.simTime + 6;
        enemy.armorShredAmount = 3;
        this.spawnProjectile(
          unit.x, 1.45, unit.z, enemy.id, 'arrow',
          Math.round(unit.unitDef.stats.attack * 0.85 + ab.potency), '#fbbf24', unit.id
        );
      }
      this.addFloatingText(unit.x, 2.9, unit.z, targets.length ? `🏹 連環破甲箭（${targets.length}）` : '🏹 蓄勢待發', '#fbbf24');
    } else if (ab.type === 'trample_charge') {
      sound.playOrder();
      let nearest: UnitEntity | null = null;
      let nearestDistance = 12;
      for (const enemy of this.units) {
        if (enemy.hp <= 0 || enemy.garrisonedInBuildingId || !this.isHostile(unit, enemy)) continue;
        const distance = getDistance(unit.x, unit.z, enemy.x, enemy.z);
        if (distance < nearestDistance) { nearest = enemy; nearestDistance = distance; }
      }
      const yaw = (unit as any)._desiredYaw || 0;
      let dirX = Math.sin(yaw), dirZ = Math.cos(yaw);
      if (nearest && nearestDistance > 0.25) {
        dirX = (nearest.x - unit.x) / nearestDistance;
        dirZ = (nearest.z - unit.z) / nearestDistance;
      }
      const destX = unit.x + dirX * 3.8;
      const destZ = unit.z + dirZ * 3.8;
      if (this.isLandPointClear(destX, destZ, 0.7)) {
        unit.x = destX;
        unit.z = destZ;
      }
      (unit as any)._attackSwing = 0.42;
      this.spawnShockwaveRing(unit.x, unit.z, 0xf59e0b, 5);
      this.spawnParticleBurst(unit.x, 0.8, unit.z, 'dust', 16);
      this.spawnParticleBurst(unit.x, 1.1, unit.z, 'spark', 10);
      let hitCount = 0;
      for (const enemy of this.units) {
        if (enemy.hp <= 0 || enemy.garrisonedInBuildingId || !this.isHostile(unit, enemy) ||
          getDistance(unit.x, unit.z, enemy.x, enemy.z) > 4.6) continue;
        const damage = getUnitVsUnitDamage(
          ab.potency + Math.round(unit.unitDef.stats.attack * 0.8), enemy, false,
          this.simTime, unit.unitDef.stats.bonusVsCategory
        );
        enemy.hp -= damage;
        enemy.lastDamagedTime = performance.now();
        enemy.hitFlashTimer = 0.12;
        enemy.recoilTimer = 0.18;
        enemy.slowUntil = this.simTime + 3;
        enemy.slowFactor = 0.65;
        const dist = Math.max(0.1, getDistance(unit.x, unit.z, enemy.x, enemy.z));
        const pushX = enemy.x + ((enemy.x - unit.x) / dist) * 1.1;
        const pushZ = enemy.z + ((enemy.z - unit.z) / dist) * 1.1;
        if (this.isLandPointClear(pushX, pushZ, 0.6)) { enemy.x = pushX; enemy.z = pushZ; }
        this.addFloatingText(enemy.x, 2.3, enemy.z, `-${damage} 踐踏`, '#f59e0b');
        hitCount++;
        if (enemy.hp <= 0) {
          unit.kills++;
          this.awardUnitXp(unit, 35);
          this.creditMongolRaidTribute(unit, 'unit', true);
        }
      }
      if (hitCount > 0) {
        const heal = Math.min(36, hitCount * 8);
        unit.hp = Math.min(unit.maxHp, unit.hp + heal);
        this.addFloatingText(unit.x, 3, unit.z, `🐎 怯薛衝鋒 +${heal}HP`, '#fbbf24');
      } else {
        this.addFloatingText(unit.x, 2.9, unit.z, '🐎 戰馬突擊', '#fbbf24');
      }
    } else if (ab.type === 'sky_storm') {
      sound.playMagicShot(gScale);
      let x = unit.x, z = unit.z;
      let nearest: UnitEntity | null = null;
      let distance = unit.unitDef.stats.range + 4;
      for (const enemy of this.units) {
        if (enemy.hp <= 0 || enemy.garrisonedInBuildingId || !this.isHostile(unit, enemy)) continue;
        const d = getDistance(unit.x, unit.z, enemy.x, enemy.z);
        if (d < distance) { nearest = enemy; distance = d; }
      }
      if (nearest) { x = nearest.x; z = nearest.z; }
      else if (unit.targetX !== undefined && unit.targetZ !== undefined &&
        getDistance(unit.x, unit.z, unit.targetX, unit.targetZ) <= unit.unitDef.stats.range + 4) {
        x = unit.targetX; z = unit.targetZ;
      }
      this.spawnGroundZone(unit.faction, unit.team, x, z, 5.5, 5, ab.potency, unit.id);
      this.spawnParticleBurst(x, 1.5, z, 'spark', 18);
      this.addFloatingText(x, 3.2, z, '🌩️ 長生天雷暴', '#38bdf8');
    } else {
      // 'whirlwind' or 'ki_burst' AOE burst
      sound.playMagicShot(gScale);
      const ringColor = ab.type === 'ki_burst' ? 0x38bdf8 : 0xef4444;
      this.spawnShockwaveRing(unit.x, unit.z, ringColor, 6.0);
      this.spawnParticleBurst(unit.x, 1.2, unit.z, 'spark', 18);
      (unit as any)._attackSwing = 0.45;

      let hitCount = 0;
      this.units.forEach((enemy) => {
        if (enemy.hp <= 0 || !this.isHostile(unit, enemy)) return;
        if (getDistance(unit.x, unit.z, enemy.x, enemy.z) <= 6.0) {
          const dmg = calculateDamage(ab.potency + Math.round(unit.unitDef.stats.attack * 0.6), enemy.unitDef.stats.defense);
          enemy.hp -= dmg;
          enemy.lastDamagedTime = performance.now();
          enemy.hitFlashTimer = 0.1;
          enemy.recoilTimer = 0.16;
          this.addFloatingText(enemy.x, 2.4, enemy.z, `-${dmg} 奧義`, '#f43f5e');
          hitCount++;
          if (enemy.hp <= 0) {
            unit.kills++;
            this.awardUnitXp(unit, 35);
          }
        }
      });
      this.buildings.forEach((b) => {
        if (b.hp <= 0 || !this.isHostile(unit, b)) return;
        if (getDistance(unit.x, unit.z, b.x, b.z) <= 6.0 + getBuildingCollisionRadius(b)) {
          const dmg = Math.max(10, Math.round(ab.potency * 0.8));
          b.hp -= dmg;
          b.hitFlashTimer = 0.08;
        }
      });
      this.addFloatingText(unit.x, 3.0, unit.z, `💥 ${ab.name} (${hitCount} 目標)`, ab.type === 'ki_burst' ? '#38bdf8' : '#fb923c');
    }

    this.awardUnitXp(unit, 12);
    return true;
  }

  public activateSelectedUnitsAbility(): number {
    let triggered = 0;
    this.selectedUnitIds.forEach((uid) => {
      const u = this.units.find((unit) => unit.id === uid);
      if (u && this.isHumanControlled(u.faction) && this.activateUnitAbility(u)) {
        triggered++;
      }
    });
    if (triggered > 0) this.onSelectionChange?.();
    return triggered;
  }

  public stopSelectedUnits() {
    const units = this.selectedUnitIds
      .map((uid) => this.units.find((u) => u.id === uid))
      .filter((u): u is UnitEntity => !!u && u.hp > 0 && this.isHumanControlled(u.faction));
    if (units.length === 0) return;

    this.pendingCommandMode = 'normal';
    units.forEach((u) => {
      u.targetEntityId = undefined;
      u.targetResourceNodeId = undefined;
      u.targetBuildingId = undefined;
      u.attackMoveGoal = null;
      this.clearFormationMovement(u);
      u.wallPatrolRoute = undefined;
      u.wallPatrolIndex = undefined;
      u.waypoints = undefined;
      u.pathGoal = undefined;
      u.velocity = { x: 0, z: 0 };
      u.state = 'idle';
      u.currentActionText = '🛑 停止待命';
    });
    sound.playSelect();
    this.onSelectionChange?.();
  }


  public boardTransport(boat: UnitEntity, passengers: UnitEntity[]) {
    if (boat.unitDefId !== 'transport_boat' || boat.hp <= 0) return;
    if (!boat.transportCargoIds) boat.transportCargoIds = [];
    const cap = boat.unitDef.stats.carryCapacity || 5;
    let loaded = 0;
    for (const u of passengers) {
      if (boat.transportCargoIds.length >= cap) break;
      if (u.id === boat.id || u.unitDef.isNaval) continue;
      if (u.unitDef.category === 'siege') continue;
      if (getDistance(u.x, u.z, boat.x, boat.z) > 18) {
        // Walk toward boat first
        u.targetX = boat.x;
        u.targetZ = boat.z;
        u.targetEntityId = boat.id;
        u.state = 'moving';
        u.currentActionText = '登船中';
        continue;
      }
      if (boat.transportCargoIds.includes(u.id)) continue;
      boat.transportCargoIds.push(u.id);
      u.garrisonedInBuildingId = `transport:${boat.id}`;
      u.state = 'idle';
      u.velocity = { x: 0, z: 0 };
      const mesh = this.unitMeshes.get(u.id);
      if (mesh) mesh.visible = false;
      loaded++;
    }
    if (loaded > 0) {
      sound.playOrder();
      this.addFloatingText(boat.x, 2.6, boat.z, `登船 ${boat.transportCargoIds.length}/${cap}`, '#38bdf8');
      this.onSelectionChange?.();
    }
  }

  public unloadSelectedTransports() {
    const boats = this.selectedUnitIds
      .map((id) => this.units.find((u) => u.id === id))
      .filter((u): u is UnitEntity => !!u && u.unitDefId === 'transport_boat' && (u.transportCargoIds?.length || 0) > 0);
    boats.forEach((b) => this.unloadTransport(b));
  }

  public unloadTransport(boat: UnitEntity) {
    if (!boat.transportCargoIds || boat.transportCargoIds.length === 0) return;
    const ids = [...boat.transportCargoIds];
    boat.transportCargoIds = [];
    (boat as any)._unloadOnArrive = false;
    ids.forEach((uid, idx) => {
      const u = this.units.find((x) => x.id === uid);
      if (!u) return;
      u.garrisonedInBuildingId = undefined;
      const ang = (idx / Math.max(1, ids.length)) * Math.PI * 2;
      let ux = boat.x + Math.cos(ang) * 2.8;
      let uz = boat.z + Math.sin(ang) * 2.8;
      // Nudge inland if spawn is in water
      const layout = this.mapLayout;
      if (layout) {
        for (let step = 0; step < 6; step++) {
          const wet = isPointInTerrainObstacle(ux, uz, layout.waterRects, layout.waterDiscs, layout.bridges);
          if (!wet) break;
          const len = Math.hypot(ux, uz) || 1;
          ux -= (ux / len) * 1.2;
          uz -= (uz / len) * 1.2;
        }
      }
      u.x = ux;
      u.z = uz;
      u.state = 'idle';
      u.currentActionText = '登陸';
      u.targetEntityId = undefined;
      u.waypoints = undefined;
      const mesh = this.unitMeshes.get(u.id);
      if (mesh) {
        mesh.visible = true;
        mesh.position.set(u.x, 0, u.z);
      }
    });
    this.addFloatingText(boat.x, 2.6, boat.z, `卸載 ${ids.length}`, '#4ade80');
    this.onSelectionChange?.();
  }

  public issueAttackMoveOrder(x: number, z: number, queue = false) {
    const playerUnits = this.selectedUnitIds
      .map((uid) => this.units.find((u) => u.id === uid))
      .filter((u): u is UnitEntity => !!u && u.hp > 0 && this.isHumanControlled(u.faction));
    if (playerUnits.length === 0) return;

    this.pendingCommandMode = 'normal';
    sound.playAttackOrder();
    this.spawnCommandIndicator(x, z, 'attack');
    this.addFloatingText(x, 2.5, z, queue ? '⚔️ 已加入攻擊推進佇列' : '⚔️ 攻擊推進指令', '#f87171');

    const count = playerUnits.length;
    const spacing = 1.6;
    const cols = Math.ceil(Math.sqrt(count));
    playerUnits.forEach((unit, idx) => {
      const row = Math.floor(idx / cols);
      const col = idx % cols;
      const ox = (col - (cols - 1) / 2) * spacing;
      const oz = (row - Math.floor((count - 1) / cols) / 2) * spacing;
      const gx = Math.max(-95, Math.min(95, x + ox));
      const gz = Math.max(-95, Math.min(95, z + oz));

      if (queue) {
        enqueueUnitCommand(unit, { type: 'attackMove', x: gx, z: gz });
        unit.currentActionText = (unit.currentActionText || '') + ' ⋯佇列';
        return;
      }

      unit.commandQueue = undefined;
      unit.queuedGatherStopAfterDeposit = false;
      unit.targetX = gx;
      unit.targetZ = gz;
      unit.attackMoveGoal = { x: gx, z: gz };
      unit.wallPatrolRoute = undefined;
      unit.wallPatrolIndex = undefined;
      unit.targetEntityId = undefined;
      unit.targetResourceNodeId = undefined;
      unit.targetBuildingId = undefined;
      unit.waypoints = undefined;
      unit.pathGoal = undefined;
      unit.pathCooldown = 0;
      unit.state = 'moving';
      unit.currentActionText = '⚔️ 警戒推進中';
    });
    this.onSelectionChange?.();
  }
  public selectControlGroup(groupNum: number, centerCamera = false) {
    if (groupNum < 1 || groupNum > 9) return;
    const ids = (this.controlGroups[groupNum] || []).filter((uid) =>
      this.units.some((u) => u.id === uid && u.hp > 0 && this.isHumanControlled(u.faction))
    );
    this.controlGroups[groupNum] = ids;
    if (ids.length === 0) return;

    this.selectedUnitIds = [...ids];
    this.selectedBuildingId = null;
    this.selectedNodeId = null;
    this.selectedContestedPointId = null;
    this.inspectedEntity = null;
    sound.playSelect();

    if (centerCamera) {
      const members = ids
        .map((id) => this.units.find((u) => u.id === id))
        .filter((u): u is UnitEntity => !!u);
      if (members.length > 0) {
        const avgX = members.reduce((s, m) => s + m.x, 0) / members.length;
        const avgZ = members.reduce((s, m) => s + m.z, 0) / members.length;
        this.setCameraFocus(avgX, avgZ);
      }
    }

    this.onSelectionChange?.();
  }

  public selectAllMilitary(): number {
    const military = this.units.filter(
      (u) => u.hp > 0 && this.isHumanControlled(u.faction) && u.unitDef.category !== 'worker'
    );
    if (military.length === 0) return 0;
    this.selectedUnitIds = military.map((u) => u.id);
    this.selectedBuildingId = null;
    this.selectedNodeId = null;
    this.selectedContestedPointId = null;
    this.inspectedEntity = null;
    sound.playSelect();
    this.onSelectionChange?.();
    return military.length;
  }

  public selectUnitsOfSameType(unitDefId: string): number {
    const matches = this.units.filter(
      (u) => u.hp > 0 && this.isHumanControlled(u.faction) && u.unitDefId === unitDefId
    );
    if (matches.length === 0) return 0;
    this.selectedUnitIds = matches.map((u) => u.id);
    this.selectedBuildingId = null;
    this.selectedNodeId = null;
    this.selectedContestedPointId = null;
    this.inspectedEntity = null;
    sound.playSelect();
    this.onSelectionChange?.();
    return matches.length;
  }

  public cycleIdleWorker(): boolean {
    const idleWorkers = this.units.filter(
      (u) => u.hp > 0 && this.isHumanControlled(u.faction) && u.unitDef.category === 'worker' && u.state === 'idle'
    );
    if (idleWorkers.length === 0) return false;
    const worker = idleWorkers[this.idleCycleIdx % idleWorkers.length];
    this.idleCycleIdx = (this.idleCycleIdx + 1) % idleWorkers.length;
    this.selectedUnitIds = [worker.id];
    this.selectedBuildingId = null;
    this.selectedNodeId = null;
    this.selectedContestedPointId = null;
    this.inspectedEntity = null;
    this.setCameraFocus(worker.x, worker.z);
    sound.playSelect();
    this.onSelectionChange?.();
    return true;
  }

  public cycleBuildingByKind(kind: 'town_center' | 'military'): boolean {
    const humanCiv = getCivilizationConfig(this.getCivilizationForFaction(this.humanPlayerId));
    const candidates = this.buildings.filter((b) => {
      if (b.hp <= 0 || !b.isConstructed || !this.isHumanControlled(b.faction)) return false;
      if (kind === 'town_center') return b.buildingType === 'town_center';
      return (
        b.buildingType === 'barracks' ||
        b.buildingType === 'archery_range' ||
        b.buildingType === humanCiv.uniqueBuildingType ||
        b.buildingType === 'castle'
      );
    });
    if (candidates.length === 0) return false;

    let target: BuildingEntity;
    if (kind === 'town_center') {
      target = candidates[0];
    } else {
      target = candidates[this.militaryBldgCycleIdx % candidates.length];
      this.militaryBldgCycleIdx = (this.militaryBldgCycleIdx + 1) % candidates.length;
    }

    this.selectedBuildingId = target.id;
    this.selectedUnitIds = [];
    this.selectedNodeId = null;
    this.selectedContestedPointId = null;
    this.inspectedEntity = null;
    this.setCameraFocus(target.x, target.z);
    sound.playSelect();
    this.onSelectionChange?.();
    return true;
  }

  public selectContestedPoint(pointId: string, centerCamera = false): boolean {
    const point = this.contestedPoints.find((p) => p.id === pointId);
    if (!point) return false;
    this.selectedContestedPointId = point.id;
    this.selectedUnitIds = [];
    this.selectedBuildingId = null;
    this.selectedNodeId = null;
    this.inspectedEntity = null;
    if (centerCamera) {
      this.setCameraFocus(point.x, point.z);
    }
    sound.playSelect();
    this.onSelectionChange?.();
    return true;
  }

  public issueMinimapOrder(worldX: number, worldZ: number) {
    const humanUnits = this.selectedUnitIds
      .map((uid) => this.units.find((u) => u.id === uid))
      .filter((u): u is UnitEntity => !!u && u.hp > 0 && this.isHumanControlled(u.faction));

    if (humanUnits.length === 0) return;

    // Check if right-clicked near any hostile unit or building on the minimap
    let closestHostile: { id: string; x: number; z: number } | null = null;
    let bestDist = 5.5;

    for (const u of this.units) {
      if (u.hp <= 0 || !this.isHostileToPlayer(u)) continue;
      const d = getDistance(worldX, worldZ, u.x, u.z);
      if (d < bestDist) {
        bestDist = d;
        closestHostile = u;
      }
    }
    if (!closestHostile) {
      for (const b of this.buildings) {
        if (b.hp <= 0 || !this.isHostileToPlayer(b)) continue;
        const d = getDistance(worldX, worldZ, b.x, b.z);
        if (d < bestDist + b.buildingDef.size * 0.5) {
          bestDist = d;
          closestHostile = b;
        }
      }
    }

    if (closestHostile) {
      this.issueAttackOrder(closestHostile.id);
      this.lastMinimapPing = {
        x: closestHostile.x,
        z: closestHostile.z,
        type: 'attack',
        time: performance.now(),
      };
      this.addFloatingText(closestHostile.x, 3.0, closestHostile.z, '⚔️ 小地圖突擊指令', '#ef4444');
    } else {
      const clampedX = Math.max(-86, Math.min(86, worldX));
      const clampedZ = Math.max(-86, Math.min(86, worldZ));
      this.issueMoveOrder(clampedX, clampedZ);
      this.lastMinimapPing = {
        x: clampedX,
        z: clampedZ,
        type: 'move',
        time: performance.now(),
      };
      this.addFloatingText(clampedX, 2.5, clampedZ, '📍 小地圖行軍', '#4ade80');
    }
    this.onSelectionChange?.();
  }

  public issueMoveOrder(x: number, z: number, queue = false) {
    const playerUnits = this.selectedUnitIds
      .map((uid) => this.units.find((u) => u.id === uid))
      .filter((u): u is UnitEntity => !!u && this.isHumanControlled(u.faction))
      .sort((a, b) => a.id.localeCompare(b.id));
    if (playerUnits.length === 0) return;
    this.pendingCommandMode = 'normal';
    sound.playOrder();
    this.spawnCommandIndicator(x, z, 'move');

    const goal = {
      x: Math.max(-95, Math.min(95, x)),
      z: Math.max(-95, Math.min(95, z)),
    };

    // Transport with cargo: move then unload near destination.
    const transports = playerUnits.filter((u) => u.unitDefId === 'transport_boat');
    if (transports.length > 0 && transports.every((t) => (t.transportCargoIds?.length || 0) > 0)) {
      if (queue) {
        enqueueCommandsForUnits(transports, () => ({ type: 'move', x: goal.x, z: goal.z, unload: true }));
        transports.forEach((boat) => {
          boat.currentActionText = (boat.currentActionText || '') + ' ⋯佇列卸載';
        });
        this.onSelectionChange?.();
        return;
      }
      const nearSelf = transports.every((boat) => getDistance(boat.x, boat.z, x, z) < 5);
      if (nearSelf) {
        transports.forEach((boat) => {
          boat.commandQueue = undefined;
          boat.queuedGatherStopAfterDeposit = false;
          this.unloadTransport(boat);
        });
        return;
      }
      transports.forEach((boat) => {
        this.clearFormationMovement(boat);
        boat.commandQueue = undefined;
        boat.queuedGatherStopAfterDeposit = false;
        boat.targetX = goal.x;
        boat.targetZ = goal.z;
        boat.attackMoveGoal = null;
        boat.targetEntityId = undefined;
        boat.waypoints = undefined;
        boat.state = 'moving';
        boat.currentActionText = '卸載航向';
        (boat as any)._unloadOnArrive = true;
      });
      return;
    }

    // Combat groups use the same role lanes as AI: melee screens the front, cavalry
    // spreads to the flanks, ranged/special units stay protected, and siege remains rearward.
    const combatUnits = playerUnits.filter(
      (unit) =>
        unit.unitDef.category !== 'worker' &&
        !unit.unitDef.isNaval &&
        unit.unitDefId !== 'transport_boat',
    );
    const groupOrigin = combatUnits.length > 0
      ? {
          x: combatUnits.reduce((sum, unit) => sum + unit.x, 0) / combatUnits.length,
          z: combatUnits.reduce((sum, unit) => sum + unit.z, 0) / combatUnits.length,
        }
      : goal;
    const dx = goal.x - groupOrigin.x;
    const dz = goal.z - groupOrigin.z;
    const length = Math.hypot(dx, dz);
    const dirX = length > 0.001 ? dx / length : 1;
    const dirZ = length > 0.001 ? dz / length : 0;
    const sideX = -dirZ;
    const sideZ = dirX;
    // Centre the whole role formation on the clicked destination. The required
    // forward offset depends on the selected composition: a pure melee group is
    // shallower than a siege-heavy column.
    let cavalryFormationIndex = 0;
    const averageFormationDepth = combatUnits.length > 0
      ? combatUnits.reduce((total, unit) => {
          let depth = 9;
          if (unit.unitDef.category === 'melee') depth = 5.2;
          else if (unit.unitDef.category === 'ranged') depth = 11.2;
          else if (unit.unitDef.category === 'siege') depth = 18.5;
          else if (unit.unitDef.category === 'cavalry') {
            depth = 8.2 + Math.floor(cavalryFormationIndex / 2) * 1.4;
            cavalryFormationIndex += 1;
          }
          return total + depth;
        }, 0) / combatUnits.length
      : 0;
    const formationSpacingScale = Math.min(1.55, 1 + Math.max(0, combatUnits.length - 8) * 0.006);
    const formationAnchor = {
      x: goal.x + dirX * averageFormationDepth * formationSpacingScale,
      z: goal.z + dirZ * averageFormationDepth * formationSpacingScale,
    };
    const formationSlots = new Map(
      (combatUnits.length > 1
        ? layoutCombatFormation(combatUnits, formationAnchor)
        : []).map((slot) => [slot.unitId, slot] as const),
    );
    const groupId = combatUnits.length > 1
      ? `player:${combatUnits[0].faction}:${++this.movementGroupSequence}`
      : undefined;
    const soloCombatIds = new Set(combatUnits.length === 1 ? combatUnits.map((unit) => unit.id) : []);
    const reserveUnits = playerUnits.filter(
      (unit) => !formationSlots.has(unit.id) && !soloCombatIds.has(unit.id),
    );
    const reserveCols = Math.max(1, Math.ceil(Math.sqrt(reserveUnits.length)));

    playerUnits.forEach((unit) => {
      const slot = formationSlots.get(unit.id);
      const reserveIndex = reserveUnits.findIndex((entry) => entry.id === unit.id);
      const reserveRow = Math.floor(Math.max(0, reserveIndex) / reserveCols);
      const reserveCol = Math.max(0, reserveIndex) % reserveCols;
      const reserveSpacing = 1.7;
      const reserveLateral = (reserveCol - (reserveCols - 1) / 2) * reserveSpacing;
      const reserveDepth = 11 + reserveRow * reserveSpacing;
      const reserveTarget = combatUnits.length === 0
        ? {
            x: goal.x + reserveLateral,
            z: goal.z + (reserveRow - (Math.ceil(reserveUnits.length / reserveCols) - 1) / 2) * reserveSpacing,
          }
        : {
            x: goal.x - dirX * reserveDepth + sideX * reserveLateral,
            z: goal.z - dirZ * reserveDepth + sideZ * reserveLateral,
          };
      const target = slot
        ? { x: slot.x, z: slot.z }
        : soloCombatIds.has(unit.id)
          ? goal
          : {
              x: Math.max(-95, Math.min(95, reserveTarget.x)),
              z: Math.max(-95, Math.min(95, reserveTarget.z)),
            };

      if (queue) {
        enqueueUnitCommand(unit, { type: 'move', x: target.x, z: target.z });
        unit.currentActionText = (unit.currentActionText || '') + ' ⋯佇列';
        return;
      }

      unit.commandQueue = undefined;
      unit.queuedGatherStopAfterDeposit = false;
      unit.moraleRoutGoal = undefined;
      unit.wallPatrolRoute = undefined;
      unit.wallPatrolIndex = undefined;
      unit.targetX = target.x;
      unit.targetZ = target.z;
      unit.attackMoveGoal = null;
      unit.targetEntityId = undefined;
      unit.targetResourceNodeId = undefined;
      unit.targetBuildingId = undefined;
      unit.waypoints = undefined;
      unit.pathGoal = undefined;
      unit.pathCooldown = 0;
      if (groupId && slot) this.assignFormationMovement(unit, groupId, groupOrigin, goal);
      else this.clearFormationMovement(unit);
      unit.state = 'moving';
      unit.currentActionText = slot
        ? `👣 陣形行軍 · ${slot.role === 'frontline' ? '前排' : slot.role === 'backline' ? '遠程' : slot.role === 'flank' ? '側翼' : slot.role === 'siege' ? '攻城' : '支援'}`
        : '👣 行軍移動中';
    });
  }

  public issueAttackOrder(targetId: string, queue = false) {
    const playerUnits = this.selectedUnitIds
      .map((uid) => this.units.find((u) => u.id === uid))
      .filter((u): u is UnitEntity => !!u && u.hp > 0 && this.isHumanControlled(u.faction));
    if (playerUnits.length === 0) return;
    this.pendingCommandMode = 'normal';

    const targetUnit = this.units.find((u) => u.id === targetId);
    // Board friendly transport boat
    if (
      targetUnit &&
      targetUnit.unitDefId === 'transport_boat' &&
      targetUnit.faction === playerUnits[0].faction
    ) {
      const boarders = playerUnits.filter((u) => !u.unitDef.isNaval && u.unitDef.category !== 'siege');
      if (queue) {
        enqueueCommandsForUnits(boarders, () => ({ type: 'board', targetId: targetUnit!.id }));
        boarders.forEach((unit) => {
          unit.currentActionText = (unit.currentActionText || '') + ' ⋯佇列登船';
        });
        this.onSelectionChange?.();
      } else {
        boarders.forEach((unit) => {
          unit.commandQueue = undefined;
          unit.queuedGatherStopAfterDeposit = false;
        });
        this.boardTransport(targetUnit, boarders);
      }
      return;
    }

    sound.playAttackOrder();
    const target = targetUnit || this.buildings.find((b) => b.id === targetId);
    if (queue) {
      if (!target || target.hp <= 0 || !this.isHostile(playerUnits[0], target)) {
        sound.playInvalid();
        return;
      }
      const queuedCount = enqueueCommandsForUnits(playerUnits, () => ({ type: 'attack', targetId }));
      if (queuedCount > 0) {
        playerUnits.forEach((unit) => {
          unit.currentActionText = (unit.currentActionText || '') + ' ⋯佇列攻擊';
        });
        this.spawnCommandIndicator(target.x, target.z, 'attack');
        this.onSelectionChange?.();
      }
      return;
    }
    if (target) {
      this.spawnCommandIndicator(target.x, target.z, 'attack');
    }

    const targetAnchor = target ? { x: target.x, z: target.z } : null;
    const combatGroups = new Map<string, UnitEntity[]>();
    for (const unit of playerUnits) {
      if (unit.unitDef.category === 'worker' || unit.unitDef.isNaval || unit.unitDefId === 'transport_boat') continue;
      const group = combatGroups.get(unit.faction) || [];
      group.push(unit);
      combatGroups.set(unit.faction, group);
    }

    playerUnits.forEach((unit) => {
      this.clearFormationMovement(unit);
      unit.commandQueue = undefined;
      unit.queuedGatherStopAfterDeposit = false;
      unit.moraleRoutGoal = undefined;
      unit.attackMoveGoal = null;
      unit.wallPatrolRoute = undefined;
      unit.wallPatrolIndex = undefined;
      unit.targetEntityId = targetId;
      unit.targetResourceNodeId = undefined;
      unit.targetBuildingId = undefined;
      unit.waypoints = undefined;
      unit.pathGoal = undefined;
      unit.pathCooldown = 0;
      unit.state = 'attacking';
      unit.currentActionText = '⚔️ 奔赴交戰';
    });

    if (targetAnchor) {
      for (const [faction, members] of combatGroups) {
        members.sort((a, b) => a.id.localeCompare(b.id));
        if (members.length < 2) continue;
        const origin = {
          x: members.reduce((sum, unit) => sum + unit.x, 0) / members.length,
          z: members.reduce((sum, unit) => sum + unit.z, 0) / members.length,
        };
        const groupId = `player-attack:${faction}:${++this.movementGroupSequence}`;
        members.forEach((unit) => this.assignFormationMovement(unit, groupId, origin, targetAnchor));
      }
    }
  }

  private getResourceDisplayMeta(node: ResourceNode): { icon: string; action: string; name: string } {
    switch (node.subtype || node.resourceType) {
      case 'farm':
        return { icon: '🌾', action: '耕作', name: '農田糧食' };
      case 'berry':
        return { icon: '🫐', action: '採集漿果', name: '漿果' };
      case 'hunt':
        return { icon: '🦌', action: '狩獵山羌', name: '山羌肉' };
      case 'boar':
        return { icon: '🐗', action: '圍獵野豬', name: '野豬肉' };
      case 'shore_fish':
      case 'deep_fish':
        return { icon: '🐟', action: '捕魚', name: '魚群' };
      case 'wood':
        return { icon: '🪵', action: '伐木', name: '木材' };
      case 'gold':
        return { icon: '🪙', action: '採金', name: '黃金' };
      case 'stone':
        return { icon: '🪨', action: '採石', name: '石料' };
      case 'food':
        return { icon: '🍎', action: '採集糧食', name: '糧食' };
      default:
        return { icon: '📦', action: '採集資源', name: '資源' };
    }
  }

  public issueGatherOrder(nodeId: string, queue = false) {
    const workers = this.selectedUnitIds
      .map((id) => this.units.find((u) => u.id === id))
      .filter((u): u is UnitEntity => !!u && this.isHumanControlled(u.faction) && u.unitDef.category === 'worker');

    if (workers.length === 0) return;

    const node = this.resourceNodes.find((n) => n.id === nodeId);
    if (!node) return;

    const eligibleWorkers = workers.filter((w) => canUnitGatherNode(w.unitDef, node));
    if (eligibleWorkers.length === 0) {
      sound.playInvalid();
      if (node.subtype === 'deep_fish') {
        this.addFloatingText(node.x, 2.5, node.z, '⛵ 深海魚群距離海岸太遠，村民無法採集！請建造【碼頭】並訓練【漁船】捕撈！', '#f59e0b');
      } else {
        this.addFloatingText(node.x, 2.5, node.z, '⚠️ 漁船無法前往陸地資源點！', '#f59e0b');
      }
      return;
    }

    sound.playOrder();
    this.spawnCommandIndicator(node.x, node.z, 'gather');
    const meta = this.getResourceDisplayMeta(node);

    eligibleWorkers.forEach((worker) => {
      if (queue) {
        if (!worker.commandQueue) worker.commandQueue = [];
        worker.commandQueue.push({ type: 'gather', nodeId });
        worker.currentActionText = (worker.currentActionText || '') + ' ⋯佇列';
        return;
      }
      worker.commandQueue = undefined;
      worker.queuedGatherStopAfterDeposit = false;
      worker.targetResourceNodeId = nodeId;
      worker.targetEntityId = undefined;
      worker.targetBuildingId = undefined;
      worker.waypoints = undefined;
      worker.pathGoal = undefined;
      worker.pathCooldown = 0;
      worker.state = 'gathering';
      worker.currentActionText = `${meta.icon} 前往${meta.action}`;
    });
  }

  /** Consume next Shift-queued order when a unit finishes its current task. */
  private tryDequeueCommand(unit: UnitEntity): boolean {
    while (unit.commandQueue?.length) {
      const next = unit.commandQueue[0];
      let isValid = true;

      if (next.type === 'move' || next.type === 'attackMove') {
        isValid = Number.isFinite(next.x) && Number.isFinite(next.z);
      } else if (next.type === 'gather') {
        const node = this.resourceNodes.find((entry) => entry.id === next.nodeId);
        isValid = !!node && node.amount > 0 && canUnitGatherNode(unit.unitDef, node);
      } else if (next.type === 'attack') {
        const targetUnit = this.units.find((entry) => entry.id === next.targetId);
        const targetBuilding = this.buildings.find((entry) => entry.id === next.targetId);
        const target = targetUnit || targetBuilding;
        isValid = !!target && target.hp > 0 && this.isHostile(unit, target);
      } else if (next.type === 'board') {
        const boat = this.units.find((entry) => entry.id === next.targetId);
        isValid = !!boat &&
          boat.hp > 0 &&
          boat.unitDefId === 'transport_boat' &&
          boat.faction === unit.faction &&
          !unit.unitDef.isNaval &&
          unit.unitDef.category !== 'siege';
      } else if (next.type === 'build' || next.type === 'repair') {
        const building = this.buildings.find((entry) => entry.id === next.buildingId);
        isValid = !!building &&
          building.hp > 0 &&
          building.faction === unit.faction &&
          (
            next.type === 'build'
              ? !building.isConstructed
              : building.isConstructed && (
                  (!!building.wallBreached && !!building.buildingDef.isWall) ||
                  building.hp < building.maxHp
                )
          );
      } else if (next.type === 'garrison') {
        const building = this.buildings.find((entry) => entry.id === next.buildingId);
        isValid = !!building &&
          building.hp > 0 &&
          building.isConstructed &&
          building.faction === unit.faction &&
          getBuildingMaxGarrison(building) > 0 &&
          unit.unitDef.category !== 'siege' &&
          !unit.garrisonedInBuildingId;
      }

      if (!isValid) {
        // Drop stale commands without activating their side effects, then inspect the next entry.
        takeNextUnitCommand(unit);
        continue;
      }

      this.clearFormationMovement(unit);
      unit.wallPatrolRoute = undefined;
      unit.wallPatrolIndex = undefined;
      unit.moraleRoutGoal = undefined;
      const activated = activateNextUnitCommand(unit);
      if (!activated) return false;
      (unit as any)._unloadOnArrive = activated.type === 'move' && !!activated.unload;
      return true;
    }
    unit.commandQueue = undefined;
    return false;
  }

  public issueBuildOrder(buildingId: string, queue = false) {
    const bldg = this.buildings.find((b) => b.id === buildingId);
    const isWallRepair = !!bldg?.wallBreached && !!bldg.buildingDef.isWall && bldg.isConstructed;
    const isDamagedStructure = !!bldg && bldg.isConstructed && bldg.hp < bldg.maxHp;
    if (!bldg || (bldg.isConstructed && !isWallRepair && !isDamagedStructure) || bldg.hp <= 0) return;
    const workers = this.selectedUnitIds
      .map((id) => this.units.find((u) => u.id === id))
      .filter((u): u is UnitEntity => !!u && u.hp > 0 && !u.garrisonedInBuildingId && this.isHumanControlled(u.faction) && u.unitDef.category === 'worker');

    if (workers.length === 0) return;

    if (isWallRepair && !bldg.wallRepairPaid) {
      const resources = this.getResourcesForFaction(bldg.faction);
      if (!canAfford(resources, WALL_REPAIR_COST)) {
        this.addFloatingText(bldg.x, 2.7, bldg.z, `⚠️ 修復城牆需要木材 ${WALL_REPAIR_COST.wood}、石料 ${WALL_REPAIR_COST.stone}`, '#ef4444');
        sound.playInvalid();
        return;
      }
      this.resourcesByFaction[bldg.faction] = deductCost(resources, WALL_REPAIR_COST);
      this.syncHumanResourcesAlias();
      if (this.isHumanControlled(bldg.faction)) this.onResourcesChange?.(this.playerResources);
      bldg.wallRepairPaid = true;
    }
    sound.playOrder();
    this.spawnCommandIndicator(bldg.x, bldg.z, 'build');

    const bName = bldg.buildingDef.name.split(' ')[0];
    if (queue) {
      const queuedCount = enqueueCommandsForUnits(workers, () => ({
        type: isWallRepair || isDamagedStructure ? 'repair' : 'build',
        buildingId,
      }));
      if (queuedCount > 0) {
        workers.forEach((worker) => {
          if (worker.commandQueue?.length) worker.currentActionText = (worker.currentActionText || '') + ' ⋯佇列';
        });
        this.onSelectionChange?.();
      }
      return;
    }

    workers.forEach((worker) => {
      worker.wallPatrolRoute = undefined;
      worker.wallPatrolIndex = undefined;
      worker.targetBuildingId = buildingId;
      worker.targetResourceNodeId = undefined;
      worker.targetEntityId = undefined;
      worker.commandQueue = undefined;
      worker.queuedGatherStopAfterDeposit = false;
      worker.waypoints = undefined;
      worker.pathGoal = undefined;
      worker.pathCooldown = 0;
      worker.state = 'building';
      worker.currentActionText = isWallRepair
        ? '🧱 前往修復城牆'
        : isDamagedStructure
          ? `🔧 前往修復${bName}`
          : `🔨 前往建造${bName}`;
    });
    this.onSelectionChange?.();
  }

  public setBuildingRallyPoint(
    buildingId: string,
    x: number,
    z: number,
    target?: {
      targetResourceNodeId?: string;
      targetBuildingId?: string;
      resourceType?: ResourceType;
      resourceSubtype?: ResourceNode['subtype'];
      label?: string;
    }
  ) {
    const bldg = this.buildings.find((b) => b.id === buildingId);
    if (!bldg) return;

    const targetNode = target?.targetResourceNodeId
      ? this.resourceNodes.find((n) => n.id === target.targetResourceNodeId && n.amount > 0)
      : undefined;
    const targetBldg =
      !targetNode && target?.targetBuildingId
        ? this.buildings.find((b) => b.id === target.targetBuildingId && !b.isConstructed && b.hp > 0)
        : undefined;

    if (targetNode) {
      if (targetNode.subtype === 'deep_fish' && bldg.buildingType !== 'dock') {
        sound.playInvalid();
        this.addFloatingText(targetNode.x, 2.5, targetNode.z, '⛵ 村民無法集結採集深海魚！請使用碼頭訓練漁船', '#f59e0b');
        return;
      }
      if (bldg.buildingType === 'dock' && targetNode.subtype !== 'deep_fish' && targetNode.subtype !== 'shore_fish') {
        sound.playInvalid();
        this.addFloatingText(targetNode.x, 2.5, targetNode.z, '⛵ 碼頭僅能對水域魚群設定採集集結點', '#f59e0b');
        return;
      }
      const meta = this.getResourceDisplayMeta(targetNode);
      bldg.rallyPoint = {
        x: targetNode.x,
        z: targetNode.z,
        targetResourceNodeId: targetNode.id,
        resourceType: targetNode.resourceType,
        resourceSubtype: targetNode.subtype,
        label: `${meta.icon} 集結${meta.action}`,
      };
      sound.playRallyPoint();
      this.spawnCommandIndicator(targetNode.x, targetNode.z, 'gather');
      this.addFloatingText(targetNode.x, 2.5, targetNode.z, `${meta.icon} 集結${meta.action}點已設定`, '#4ade80');
    } else if (targetBldg) {
      const bName = targetBldg.buildingDef.name.split(' ')[0];
      bldg.rallyPoint = {
        x: targetBldg.x,
        z: targetBldg.z,
        targetBuildingId: targetBldg.id,
        label: `🔨 集結協建${bName}`,
      };
      sound.playRallyPoint();
      this.spawnCommandIndicator(targetBldg.x, targetBldg.z, 'build');
      this.addFloatingText(targetBldg.x, 2.5, targetBldg.z, `🔨 集結協建${bName}已設定`, '#38bdf8');
    } else {
      bldg.rallyPoint = { x, z };
      sound.playRallyPoint();
      this.spawnCommandIndicator(x, z, 'rally');
      this.addFloatingText(x, 2.5, z, '📍 集結點已設定', '#f59e0b');
    }

    this.updateRallyVisuals(bldg);
    this.onSelectionChange?.();
  }

  public updateRallyVisuals(bldg?: BuildingEntity | null) {
    const targetBldg = bldg || (this.selectedBuildingId ? this.buildings.find((b) => b.id === this.selectedBuildingId) : null);
    if (targetBldg && targetBldg.rallyPoint) {
      const rp = targetBldg.rallyPoint;
      const lineColor = rp.targetResourceNodeId
        ? rp.resourceType === 'gold' || rp.resourceType === 'stone'
          ? 0xfacc15
          : 0x22c55e
        : rp.targetBuildingId
        ? 0x38bdf8
        : 0xfbbf24;

      if (!this.rallyFlagMesh) {
        this.rallyFlagMesh = createRallyFlagMesh('player');
        this.scene.add(this.rallyFlagMesh);
      }
      this.rallyFlagMesh.position.set(rp.x, 0, rp.z);
      this.rallyFlagMesh.visible = true;

      // Dashed connection line from building center to rally point
      if (!this.rallyLineMesh) {
        const lineGeo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(targetBldg.x, 0.25, targetBldg.z),
          new THREE.Vector3(rp.x, 0.25, rp.z),
        ]);
        const lineMat = new THREE.LineDashedMaterial({
          color: lineColor,
          dashSize: 0.8,
          gapSize: 0.4,
          scale: 1,
        });
        this.rallyLineMesh = new THREE.Line(lineGeo, lineMat);
        this.rallyLineMesh.computeLineDistances();
        this.scene.add(this.rallyLineMesh);
      } else {
        const positions = new Float32Array([
          targetBldg.x, 0.25, targetBldg.z,
          rp.x, 0.25, rp.z,
        ]);
        this.rallyLineMesh.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        (this.rallyLineMesh.material as THREE.LineDashedMaterial).color.setHex(lineColor);
        this.rallyLineMesh.computeLineDistances();
        this.rallyLineMesh.visible = true;
      }
    } else {
      if (this.rallyFlagMesh) this.rallyFlagMesh.visible = false;
      if (this.rallyLineMesh) this.rallyLineMesh.visible = false;
    }
  }

  public triggerUnderAttackAlert(x: number, z: number) {
    if (this.isSpectatorMode) return;
    const now = performance.now();
    if (now - this.lastAttackSoundTime > 11000) {
      this.lastAttackSoundTime = now;
      sound.playUnderAttackAlert();
    }
    this.lastAttackAlert = {
      x,
      z,
      time: now,
      active: true,
    };
    if (now - this.lastAttackBroadcastTime > 7500) {
      this.lastAttackBroadcastTime = now;
      this.lastTacticalBroadcast = {
        kind: 'under_attack',
        message: '⚠️ 警報：基地或部隊正在遭受敵軍攻擊！',
        x,
        z,
        time: now,
      };
    }
    this.onStateChange?.();
  }

  private evaluateEnemySpottedAlert(dt: number) {
    if (this.isSpectatorMode) return;
    this.enemySpottedCheckAccumulator += dt;
    if (this.enemySpottedCheckAccumulator < 0.85) return;
    this.enemySpottedCheckAccumulator = 0;

    const now = performance.now();
    if (now - this.lastEnemySpottedBroadcastTime < 18000) return;
    if (now - this.lastAttackBroadcastTime < 5000) return;

    const friendlyUnits = this.units.filter(
      (u) => u.hp > 0 && !u.garrisonedInBuildingId && this.isHumanControlled(u.faction)
    );
    const friendlyBuildings = this.buildings.filter(
      (b) => b.hp > 0 && this.isHumanControlled(b.faction)
    );
    if (friendlyUnits.length === 0 && friendlyBuildings.length === 0) return;

    for (const enemy of this.units) {
      if (enemy.hp <= 0 || enemy.garrisonedInBuildingId || !this.isHostileToPlayer(enemy)) continue;
      const nearUnit = friendlyUnits.some((fu) => getDistance(fu.x, fu.z, enemy.x, enemy.z) <= 17);
      const nearBldg =
        !nearUnit && friendlyBuildings.some((fb) => getDistance(fb.x, fb.z, enemy.x, enemy.z) <= 20);

      if (nearUnit || nearBldg) {
        this.lastEnemySpottedBroadcastTime = now;
        sound.playEnemySpotted();
        this.lastTacticalBroadcast = {
          kind: 'enemy_spotted',
          message: `👁️ 警戒：偵測範圍內發現敵軍（${enemy.unitDef.name.split(' ')[0]}）逼近！`,
          x: enemy.x,
          z: enemy.z,
          time: now,
        };
        this.onStateChange?.();
        return;
      }
    }
  }

  public findSafeExteriorSpot(
    cx: number,
    cz: number,
    baseRadius: number,
    unitRadius: number,
    indexOffset = 0,
    ignoreBuildingId?: string,
    preferredAngle?: number,
    isNaval = false
  ): { x: number; z: number } {
    const obs = this.getTerrainNavObstacles();
    const minDistBase = Math.max(2.0, baseRadius + unitRadius + 0.75);
    const hasPreferred = preferredAngle !== undefined && Number.isFinite(preferredAngle);
    const anchorAngle = hasPreferred
      ? preferredAngle! + (indexOffset === 0 ? 0 : (indexOffset % 2 === 0 ? 1 : -1) * Math.ceil(indexOffset / 2) * 0.42)
      : Math.PI * 0.5;
    const sweepOffsets = [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6];
    const waterRects = (obs?.rects || []).filter((r) => r.kind === 'water');
    const waterDiscs = (obs?.discs || []).filter((d) => d.kind === 'water');

    for (let ring = 0; ring < 5; ring++) {
      const r = minDistBase + ring * 1.15;
      for (let step = 0; step < 12; step++) {
        const ang = hasPreferred
          ? anchorAngle + (sweepOffsets[step] / 12) * Math.PI * 2
          : anchorAngle + ((step + indexOffset) / 12) * Math.PI * 2;
        const candX = Math.max(-88, Math.min(88, cx + Math.cos(ang) * r));
        const candZ = Math.max(-88, Math.min(88, cz + Math.sin(ang) * r));

        if (isNaval) {
          if (!isPointInTerrainObstacle(candX, candZ, waterRects, waterDiscs, [])) continue;
        } else {
          if (isPointInTerrainObstacle(candX, candZ, obs?.rects, obs?.discs, obs?.bridges)) continue;
        }

        const hitsBuilding = this.buildings.some((b) => {
          if (b.hp <= 0 || b.id === ignoreBuildingId) return false;
          const bRad = getBuildingCollisionRadius(b);
          if (bRad <= 0) return false;
          return Math.hypot(candX - b.x, candZ - b.z) < bRad + unitRadius + 0.2;
        });
        if (hitsBuilding) continue;

        const hitsNode = this.resourceNodes.some((n) => {
          if (n.amount <= 0 || (n.resourceType === 'food' && (!n.subtype || n.subtype === 'farm'))) return false;
          const nRad = getResourceColliderRadius(n.resourceType, n.subtype);
          return Math.hypot(candX - n.x, candZ - n.z) < nRad + unitRadius + 0.15;
        });
        if (hitsNode) continue;

        return { x: candX, z: candZ };
      }
    }

    return {
      x: Math.max(-88, Math.min(88, cx + Math.cos(anchorAngle) * minDistBase)),
      z: Math.max(-88, Math.min(88, cz + Math.sin(anchorAngle) * minDistBase)),
    };
  }

  public canGarrisonInBuilding(unit: UnitEntity, bldg: BuildingEntity): boolean {
    if (!unit || unit.hp <= 0 || unit.garrisonedInBuildingId) return false;
    if (unit.unitDef.category === 'siege') return false;
    if (!bldg || bldg.hp <= 0 || !bldg.isConstructed || bldg.faction !== unit.faction) return false;
    const maxCap = getBuildingMaxGarrison(bldg);
    if (maxCap <= 0) return false;
    const incoming = countPendingGarrisonReservations(
      bldg.id,
      bldg.faction,
      this.units,
      new Set([unit.id])
    );
    return getAvailableGarrisonSlots(maxCap, bldg.garrisonedUnitIds?.length || 0, incoming) > 0;
  }

  public issueGarrisonOrder(buildingId: string, queue = false): boolean {
    const bldg = this.buildings.find((b) => b.id === buildingId);
    if (!bldg || !bldg.isConstructed || bldg.hp <= 0) return false;
    const maxCap = getBuildingMaxGarrison(bldg);
    if (maxCap <= 0) return false;

    const selected = this.selectedUnitIds
      .map((uid) => this.units.find((u) => u.id === uid))
      .filter((u): u is UnitEntity => !!u && u.hp > 0 && !u.garrisonedInBuildingId && u.faction === bldg.faction);
    if (selected.length === 0) return false;

    const eligible = selected.filter((u) => u.unitDef.category !== 'siege');
    if (eligible.length === 0) {
      this.addFloatingText(bldg.x, 2.8, bldg.z, '⚠️ 攻城器械無法進駐建築！', '#f59e0b');
      sound.playInvalid();
      return false;
    }

    const currentCount = bldg.garrisonedUnitIds?.length || 0;
    const selectedEligibleIds = new Set(eligible.map((unit) => unit.id));
    const incoming = countPendingGarrisonReservations(
      bldg.id,
      bldg.faction,
      this.units,
      selectedEligibleIds
    );
    const availableSlots = getAvailableGarrisonSlots(maxCap, currentCount, incoming);
    if (availableSlots <= 0) {
      this.addFloatingText(bldg.x, 3.0, bldg.z, `🛡️ 駐防已滿 (${currentCount}/${maxCap})`, '#f59e0b');
      sound.playInvalid();
      return false;
    }

    const chosen = [...eligible]
      .sort(
        (a, b) =>
          getDistance(a.x, a.z, bldg.x, bldg.z) -
            getDistance(b.x, b.z, bldg.x, bldg.z) ||
          (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
      )
      .slice(0, availableSlots);

    const bName = bldg.buildingDef.name.split(' ')[0];
    if (queue) {
      const queuedCount = enqueueCommandsForUnits(chosen, () => ({ type: 'garrison', buildingId: bldg.id }));
      if (queuedCount > 0) {
        chosen.forEach((unit) => {
          unit.currentActionText = (unit.currentActionText || '') + ' ⋯佇列進駐';
        });
        sound.playOrder();
        this.spawnCommandIndicator(bldg.x, bldg.z, 'build');
        this.onSelectionChange?.();
      }
      return queuedCount > 0;
    }

    chosen.forEach((u) => {
      u.commandQueue = undefined;
      u.queuedGatherStopAfterDeposit = false;
      u.targetGarrisonBuildingId = bldg.id;
      u.targetEntityId = undefined;
      u.targetResourceNodeId = undefined;
      u.targetBuildingId = undefined;
      u.attackMoveGoal = null;
      u.waypoints = undefined;
      u.pathGoal = undefined;
      u.pathCooldown = 0;
      u.state = 'garrisoning';
      u.currentActionText = `🛡️ 前往進駐${bName}`;
    });

    sound.playOrder();
    this.spawnCommandIndicator(bldg.x, bldg.z, 'build');
    this.onSelectionChange?.();
    return true;
  }

  private releaseGarrisonedUnitEntity(bldg: BuildingEntity, unit: UnitEntity, idx: number) {
    unit.garrisonedInBuildingId = undefined;
    unit.targetGarrisonBuildingId = undefined;

    const rp = bldg.rallyPoint;
    const preferredAngle = rp ? Math.atan2(rp.z - bldg.z, rp.x - bldg.x) : undefined;
    const uRadius = getUnitColliderRadius(unit.unitDef.category, unit.unitDef.visual.scale);
    const spot = this.findSafeExteriorSpot(
      bldg.x,
      bldg.z,
      getBuildingCollisionRadius(bldg),
      uRadius,
      idx,
      bldg.id,
      preferredAngle
    );
    unit.x = spot.x;
    unit.z = spot.z;
    unit.velocity = { x: 0, z: 0 };
    unit.waypoints = undefined;
    unit.pathGoal = undefined;
    unit.pathCooldown = 0;
    unit.state = 'idle';
    unit.currentActionText = '🚪 撤出建築待命';

    const mesh = this.unitMeshes.get(unit.id);
    if (mesh) {
      mesh.position.set(unit.x, 0, unit.z);
      mesh.visible = true;
    }

    if (rp) {
      if (unit.unitDef.category === 'worker' && rp.targetResourceNodeId) {
        const exactNode = this.resourceNodes.find(
          (n) => n.id === rp.targetResourceNodeId && n.amount > 0
        );
        const gatherNode =
          exactNode || findClosestResourceNode(rp.x, rp.z, this.resourceNodes, rp.resourceType, 14);
        if (gatherNode) {
          unit.targetResourceNodeId = gatherNode.id;
          unit.state = 'gathering';
          const meta = this.getResourceDisplayMeta(gatherNode);
          unit.currentActionText = `${meta.icon} 前往${meta.action}`;
          return;
        }
      } else if (unit.unitDef.category === 'worker' && rp.targetBuildingId) {
        const targetBuild = this.buildings.find(
          (b) => b.id === rp.targetBuildingId && !b.isConstructed && b.hp > 0
        );
        if (targetBuild) {
          unit.targetBuildingId = targetBuild.id;
          unit.state = 'building';
          unit.currentActionText = `🔨 前往建造${targetBuild.buildingDef.name.split(' ')[0]}`;
          return;
        }
      }
      unit.targetX = rp.x;
      unit.targetZ = rp.z;
      unit.targetEntityId = undefined;
      unit.state = 'moving';
      unit.currentActionText = '👣 撤出前往集結點';
    }
  }

  public ungarrisonUnit(buildingId: string, unitId: string): boolean {
    const bldg = this.buildings.find((b) => b.id === buildingId);
    if (!bldg || !bldg.garrisonedUnitIds || !bldg.garrisonedUnitIds.includes(unitId)) return false;

    bldg.garrisonedUnitIds = bldg.garrisonedUnitIds.filter((id) => id !== unitId);
    const unit = this.units.find((u) => u.id === unitId && u.hp > 0);
    if (!unit) {
      this.onSelectionChange?.();
      return false;
    }

    this.releaseGarrisonedUnitEntity(bldg, unit, 0);
    if (this.isHumanControlled(bldg.faction)) {
      sound.playGarrison();
      this.addFloatingText(unit.x, 2.5, unit.z, `🚪 ${unit.unitDef.name.split(' ')[0]} 撤出`, '#38bdf8');
    }
    this.onSelectionChange?.();
    return true;
  }

  /**
   * AI workers return to work as soon as danger clears, while wounded military
   * garrison members remain sheltered until they recover to the requested ratio.
   */
  private ungarrisonRecoveredAiUnits(buildingId: string, recoveryRatio = 0.72): number {
    const bldg = this.buildings.find((b) => b.id === buildingId);
    if (!bldg || !bldg.garrisonedUnitIds?.length) return 0;

    const ids = [...bldg.garrisonedUnitIds];
    const remaining: string[] = [];
    let released = 0;
    ids.forEach((unitId, index) => {
      const unit = this.units.find((candidate) => candidate.id === unitId && candidate.hp > 0);
      if (!unit) return;

      if (!shouldAiUnitLeaveShelter(unit.hp, unit.maxHp, unit.unitDef.category, recoveryRatio)) {
        remaining.push(unitId);
        return;
      }

      this.releaseGarrisonedUnitEntity(bldg, unit, index);
      released++;
    });

    bldg.garrisonedUnitIds = remaining;
    return released;
  }

  public ungarrisonAll(buildingId: string): number {
    const bldg = this.buildings.find((b) => b.id === buildingId);
    if (!bldg || !bldg.garrisonedUnitIds || bldg.garrisonedUnitIds.length === 0) return 0;

    const ids = [...bldg.garrisonedUnitIds];
    bldg.garrisonedUnitIds = [];
    let released = 0;

    ids.forEach((uid, idx) => {
      const unit = this.units.find((u) => u.id === uid && u.hp > 0);
      if (!unit) return;
      this.releaseGarrisonedUnitEntity(bldg, unit, idx);
      released++;
    });

    if (released > 0) {
      if (this.isHumanControlled(bldg.faction)) {
        sound.playGarrison();
        this.addFloatingText(bldg.x, 3.0, bldg.z, `🚪 撤出駐軍 (${released} 名)`, '#38bdf8');
      }
      this.onSelectionChange?.();
    }
    return released;
  }

  public ringTownBell(tcId: string): 'garrisoned' | 'ungarrisoned' | 'none' {
    const tc = this.buildings.find((b) => b.id === tcId && b.isConstructed && b.hp > 0);
    if (!tc) return 'none';
    const faction = tc.faction;

    // If friendly buildings already shelter workers, clicking Town Bell releases them back to work
    const sheltersWithWorkers = this.buildings.filter(
      (b) =>
        b.faction === faction &&
        b.hp > 0 &&
        b.isConstructed &&
        (b.garrisonedUnitIds || []).some((uid) => {
          const u = this.units.find((unit) => unit.id === uid);
          return !!u && u.hp > 0 && u.unitDef.category === 'worker';
        })
    );

    if (sheltersWithWorkers.length > 0) {
      let totalReleased = 0;
      sheltersWithWorkers.forEach((b) => {
        totalReleased += this.ungarrisonAll(b.id);
      });
      // Put idle released workers back on closest nearby resource so economy resumes smoothly
      this.units
        .filter((u) => u.faction === faction && u.hp > 0 && !u.garrisonedInBuildingId && u.unitDef.category === 'worker' && u.state === 'idle')
        .forEach((w) => {
          const n = findClosestResourceNode(w.x, w.z, this.resourceNodes, undefined, 26);
          if (n) {
            const meta = this.getResourceDisplayMeta(n);
            w.targetResourceNodeId = n.id;
            w.state = 'gathering';
            w.currentActionText = `${meta.icon} 復工${meta.action}`;
          }
        });
      if (totalReleased > 0 && this.isHumanControlled(faction)) {
        this.addFloatingText(tc.x, 3.4, tc.z, `🔔 解除避難：${totalReleased} 名村民復工`, '#4ade80');
      }
      return totalReleased > 0 ? 'ungarrisoned' : 'none';
    }

    // Order nearby workers into nearest open friendly shelter (TC, Special Building, Castle, Tower)
    const shelters = this.buildings
      .filter((b) => b.faction === faction && b.isConstructed && b.hp > 0 && getBuildingMaxGarrison(b) > 0)
      .map((b) => ({
        bldg: b,
        freeSlots: Math.max(0, getBuildingMaxGarrison(b) - (b.garrisonedUnitIds?.length || 0)),
      }))
      .filter((s) => s.freeSlots > 0);

    if (shelters.length === 0) return 'none';

    const nearbyWorkers = this.units.filter(
      (u) =>
        u.faction === faction &&
        u.hp > 0 &&
        !u.garrisonedInBuildingId &&
        u.unitDef.category === 'worker' &&
        getDistance(tc.x, tc.z, u.x, u.z) <= 28
    );
    if (nearbyWorkers.length === 0) return 'none';

    let ordered = 0;
    for (const w of nearbyWorkers) {
      const open = shelters
        .filter((s) => s.freeSlots > 0)
        .sort((a, b) => getDistance(w.x, w.z, a.bldg.x, a.bldg.z) - getDistance(w.x, w.z, b.bldg.x, b.bldg.z))[0];
      if (!open) break;
      open.freeSlots--;
      w.targetGarrisonBuildingId = open.bldg.id;
      w.targetEntityId = undefined;
      w.targetResourceNodeId = undefined;
      w.targetBuildingId = undefined;
      w.waypoints = undefined;
      w.pathGoal = undefined;
      w.state = 'garrisoning';
      w.currentActionText = `🔔 緊急避難前往${open.bldg.buildingDef.name.split(' ')[0]}`;
      ordered++;
    }

    if (ordered > 0 && this.isHumanControlled(faction)) {
      sound.playGarrison();
      this.addFloatingText(tc.x, 3.4, tc.z, `🔔 鳴鐘避難：${ordered} 名村民進入掩體`, '#fbbf24');
      this.onSelectionChange?.();
    }
    return ordered > 0 ? 'garrisoned' : 'none';
  }

  public trainUnit(buildingId: string, unitDefId: string): boolean {
    const bldg = this.buildings.find((b) => b.id === buildingId);
    if (!bldg || !bldg.isConstructed) return false;
    const def = this.findUnitDef(unitDefId, bldg.faction);
    if (!def) return false;

    const currentAge = this.ageByFaction[bldg.faction] || 1;
    if (!bldg.buildingDef.trainableUnits.includes(unitDefId) || unitDefId === 'battering_ram') {
      if (this.isHumanControlled(bldg.faction)) {
        sound.playInvalid();
        this.addFloatingText(bldg.x, 3.0, bldg.z, '🔒 此兵種必須由對應時代的軍事建築或野戰工程解鎖', '#f59e0b');
      }
      return false;
    }
    const minimumRoleAge = def.category === 'ranged' || def.category === 'cavalry' ? 2 : def.category === 'siege' ? 3 : 1;
    const requiredUnitAge = Math.max(def.requiredAge || 1, minimumRoleAge);
    if (currentAge < requiredUnitAge) {
      if (this.isHumanControlled(bldg.faction)) {
        sound.playInvalid();
        this.addFloatingText(bldg.x, 3.0, bldg.z, `🔒 需先晉升至時代 ${requiredUnitAge} 才能訓練此兵種`, '#ef4444');
      }
      return false;
    }

    const pop = this.getPopulationStats(bldg.faction);
    if (pop.totalReserved >= pop.max) {
      if (this.isHumanControlled(bldg.faction)) {
        sound.playInvalid();
        this.addFloatingText(
          bldg.x,
          3.1,
          bldg.z,
          `🏠 人口已達上限 (${pop.used}/${pop.max})！請建造「房屋」提升人口`,
          '#f87171'
        );
      }
      return false;
    }

    const res = this.getResourcesForFaction(bldg.faction);
    if (!canAfford(res, def.stats.cost)) return false;

    // Deduct cost
    this.resourcesByFaction[bldg.faction] = deductCost(res, def.stats.cost);
    this.syncHumanResourcesAlias();
    if (this.isHumanControlled(bldg.faction)) {
      this.onResourcesChange?.(this.playerResources);
    }

    bldg.queue.push(unitDefId);
    sound.playConstruct();
    this.onSelectionChange?.();
    return true;
  }

  public cancelTrainingAt(buildingId: string, queueIndex: number): boolean {
    const bldg = this.buildings.find((b) => b.id === buildingId);
    if (!bldg || bldg.hp <= 0 || queueIndex < 0 || queueIndex >= bldg.queue.length) return false;

    const unitDefId = bldg.queue[queueIndex];
    const def = this.findUnitDef(unitDefId, bldg.faction);
    bldg.queue.splice(queueIndex, 1);
    if (queueIndex === 0) {
      bldg.queueProgress = 0;
    }

    if (def) {
      const res = this.getResourcesForFaction(bldg.faction);
      this.resourcesByFaction[bldg.faction] = {
        food: res.food + (def.stats.cost.food || 0),
        wood: res.wood + (def.stats.cost.wood || 0),
        gold: res.gold + (def.stats.cost.gold || 0),
        stone: res.stone + (def.stats.cost.stone || 0),
      };
      this.syncHumanResourcesAlias();
      if (this.isHumanControlled(bldg.faction)) {
        this.onResourcesChange?.(this.playerResources);
      }
    }

    if (this.isHumanControlled(bldg.faction)) {
      sound.playOrder();
      this.addFloatingText(bldg.x, 2.8, bldg.z, '↩️ 已取消訓練並全額退還資源', '#cbd5e1');
    }
    this.onSelectionChange?.();
    return true;
  }

  public startPlacement(type: BuildingType) {
    const bDef = DEFAULT_BUILDINGS[type];
    const currentAge = this.ageByFaction[this.humanPlayerId] || 1;
    const civ = getCivilizationConfig(this.getCivilizationForFaction(this.humanPlayerId));
    if (!isBuildingBuildableForCiv(type, civ.id, currentAge)) {
      sound.playInvalid();
      const requiredAge = bDef.requiredAge ?? 1;
      const message = currentAge < requiredAge
        ? `🔒 需先晉升至時代 ${requiredAge} 才能建造`
        : '🔒 此建築不屬於目前文明的可建造清單';
      this.addFloatingText(this.cameraTarget.x, 2.5, this.cameraTarget.z, message, '#ef4444');
      return;
    }
    if (!canAfford(this.playerResources, bDef.cost)) {
      sound.playInvalid();
      this.addFloatingText(this.cameraTarget.x, 2.5, this.cameraTarget.z, '⚠️ 資源不足，無法開始建造', '#ef4444');
      return;
    }

    this.cancelPlacement();
    this.placementBuildingType = type;
    if (type === 'wall') {
      this.wallPlacementPoints = [];
      this.wallPlacementCursor = null;
      this.wallPlacementSnapTargetId = null;
      this.wallPlacementPointSnaps = [];
      this.wallPlacementGhostTemplate = this.createTranslucentBuildingPreview('wall', this.humanPlayerId, 0.42, 0x38bdf8);
      this.rebuildWallPlacementPreview();
      this.onSelectionChange?.();
      return;
    }

    this.placementGhostMesh = createBuildingMesh(type, this.humanPlayerId, this.getCivilizationForFaction(this.humanPlayerId), this.playerAge);
    const clonedGhostMats = new Map<THREE.Material, THREE.Material>();
    this.placementGhostMesh.traverse((child) => {
      if (child.name === 'bldgBadge' || child.name === 'scaffoldGroup') {
        child.visible = false;
        return;
      }
      const meshObj = child as THREE.Mesh;
      if (meshObj.isMesh && meshObj.material && !Array.isArray(meshObj.material)) {
        let m = clonedGhostMats.get(meshObj.material);
        if (!m) {
          m = meshObj.material.clone();
          m.transparent = true;
          m.opacity = 0.56;
          m.depthWrite = false;
          clonedGhostMats.set(meshObj.material, m);
        }
        meshObj.material = m;
      }
    });
    this.scene.add(this.placementGhostMesh);
    this.onSelectionChange?.();
  }

  private createTranslucentBuildingPreview(
    type: BuildingType,
    faction: FactionId,
    opacity: number,
    tintColor: number
  ): THREE.Group {
    const preview = createBuildingMesh(type, faction, this.getCivilizationForFaction(faction), this.ageByFaction[faction] || 1);
    const materialClones = new Map<THREE.Material, THREE.Material>();
    const tint = new THREE.Color(tintColor);
    preview.traverse((child) => {
      if (child.name === 'bldgBadge' || child.name === 'scaffoldGroup') {
        child.visible = false;
        return;
      }
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      const cloneMaterial = (source: THREE.Material): THREE.Material => {
        let cloned = materialClones.get(source);
        if (!cloned) {
          cloned = source.clone();
          cloned.transparent = true;
          cloned.opacity = opacity;
          cloned.depthWrite = false;
          cloned.polygonOffset = true;
          cloned.polygonOffsetFactor = -1;
          const colored = cloned as THREE.Material & { color?: THREE.Color };
          if (colored.color) colored.color.lerp(tint, 0.16);
          materialClones.set(source, cloned);
        }
        return cloned;
      };
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map((material) => cloneMaterial(material))
        : cloneMaterial(mesh.material);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.renderOrder = 5;
    });
    return preview;
  }

  private disposeWallPreviewObject(root: THREE.Object3D): void {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh && !(object as THREE.Line).isLine) return;
      if (mesh.geometry) geometries.add(mesh.geometry);
      if (Array.isArray(mesh.material)) mesh.material.forEach((material) => materials.add(material));
      else if (mesh.material) materials.add(mesh.material);
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
  }

  private findWallPlacementSnap(point: WallChainPoint): WallEndpointSnap<BuildingEntity> | null {
    const walls = this.buildings.filter(
      (building) =>
        building.faction === this.humanPlayerId &&
        building.buildingDef.isWall &&
        building.hp > 0 &&
        building.isConstructed
    );
    return findNearestWallEndpoint(point, walls);
  }

  public getNearestRepairableWallAt(x: number, z: number): BuildingEntity | null {
    const walls = this.buildings.filter(
      (building) =>
        building.faction === this.humanPlayerId &&
        building.buildingDef.isWall
    );
    return findNearestRepairableWall({ x, z }, walls) as BuildingEntity | null;
  }

  public updateWallRepairPreview(x: number, z: number, enabled = true): BuildingEntity | null {
    const target = enabled ? this.getNearestRepairableWallAt(x, z) : null;
    if (!target) {
      this.clearWallRepairPreview();
      return null;
    }

    if (this.wallRepairPreviewTargetId !== target.id || !this.wallRepairPreviewMesh) {
      this.clearWallRepairPreview();
      this.wallRepairPreviewMesh = this.createTranslucentBuildingPreview(
        target.buildingType,
        target.faction,
        0.48,
        0x4ade80
      );
      this.wallRepairPreviewTargetId = target.id;
      this.scene.add(this.wallRepairPreviewMesh);
      this.wallRepairPreviewRing = new THREE.Mesh(
        new THREE.RingGeometry(1.5, 1.72, 36),
        new THREE.MeshBasicMaterial({
          color: 0x4ade80,
          transparent: true,
          opacity: 0.88,
          side: THREE.DoubleSide,
          depthWrite: false,
        })
      );
      this.wallRepairPreviewRing.rotation.x = -Math.PI / 2;
      this.scene.add(this.wallRepairPreviewRing);
    }

    this.wallRepairPreviewMesh.position.set(target.x, 0.02, target.z);
    this.wallRepairPreviewMesh.rotation.y = target.rotationY ?? 0;
    if (this.wallRepairPreviewRing) {
      this.wallRepairPreviewRing.position.set(target.x, 0.18, target.z);
    }
    return target;
  }

  public clearWallRepairPreview(): void {
    if (this.wallRepairPreviewMesh) {
      this.scene.remove(this.wallRepairPreviewMesh);
      this.disposeWallPreviewObject(this.wallRepairPreviewMesh);
      this.wallRepairPreviewMesh = null;
    }
    if (this.wallRepairPreviewRing) {
      this.scene.remove(this.wallRepairPreviewRing);
      this.wallRepairPreviewRing.geometry.dispose();
      const material = this.wallRepairPreviewRing.material;
      if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
      else material.dispose();
      this.wallRepairPreviewRing = null;
    }
    this.wallRepairPreviewTargetId = null;
  }

  public updateWallPlacementPreview(x: number, z: number) {
    if (this.placementBuildingType !== 'wall') return;
    const snap = this.findWallPlacementSnap({ x, z });
    this.wallPlacementSnapTargetId = snap?.wall.id ?? null;
    this.wallPlacementCursor = snap?.point ?? { x, z };
    this.rebuildWallPlacementPreview();
  }

  /** First left click starts a wall, Shift+left click adds a corner, plain left click finishes it. */
  public handleWallPlacementClick(x: number, z: number, addWaypoint = false): 'started' | 'waypoint' | 'committed' | 'invalid' {
    if (this.placementBuildingType !== 'wall') return 'invalid';

    const inputPoint = { x, z };
    const snap = this.findWallPlacementSnap(inputPoint);
    const point = snap?.point ?? inputPoint;
    this.wallPlacementSnapTargetId = snap?.wall.id ?? null;
    if (this.wallPlacementPoints.length === 0) {
      this.wallPlacementPoints = [point];
      this.wallPlacementPointSnaps = [snap];
      this.wallPlacementCursor = point;
      this.rebuildWallPlacementPreview();
      this.spawnCommandIndicator(x, z, 'build');
      this.addFloatingText(x, 2.4, z, '📍 城牆起點已設定，移動滑鼠拉出牆線', '#67e8f9');
      sound.playOrder();
      this.onSelectionChange?.();
      return 'started';
    }

    const previous = this.wallPlacementPoints[this.wallPlacementPoints.length - 1];
    if (isWallChainPointTooClose(previous, point)) {
      this.addFloatingText(x, 2.4, z, '⚠️ 牆段太短，請拉開至少 0.75 單位', '#ef4444');
      sound.playInvalid();
      return 'invalid';
    }

    if (addWaypoint) {
      this.wallPlacementPoints = [...this.wallPlacementPoints, point];
      this.wallPlacementPointSnaps = [...this.wallPlacementPointSnaps, snap];
      this.wallPlacementCursor = point;
      this.rebuildWallPlacementPreview();
      this.spawnCommandIndicator(x, z, 'build');
      this.addFloatingText(x, 2.4, z, '↪️ 城牆轉折點已固定，繼續拉出下一段', '#67e8f9');
      sound.playOrder();
      this.onSelectionChange?.();
      return 'waypoint';
    }

    const completedPoints = [...this.wallPlacementPoints, point];
    const completedSnaps = [...this.wallPlacementPointSnaps, snap];
    const committed = this.commitWallChain(completedPoints, completedSnaps);
    if (!committed) {
      this.wallPlacementCursor = point;
      this.rebuildWallPlacementPreview();
      return 'invalid';
    }

    this.cancelPlacement();
    this.onSelectionChange?.();
    return 'committed';
  }

  public getWallPlacementPreviewInfo() {
    const points = [...this.wallPlacementPoints];
    if (this.wallPlacementCursor && points.length > 0) {
      const last = points[points.length - 1];
      if (getDistance(last.x, last.z, this.wallPlacementCursor.x, this.wallPlacementCursor.z) >= 0.1) {
        points.push(this.wallPlacementCursor);
      }
    }

    const bDef = DEFAULT_BUILDINGS.wall;
    const placements = layoutWallChain(points);
    const cost = calculateWallChainCost(placements.length, bDef.cost);
    const obs = this.getTerrainNavObstacles();
    const invalidPathPoint = this.findInvalidWallPathPoint(points, obs);
    const invalidCount = placements.reduce((count, segment) => {
      const valid = isPlacementLocationValid(
        segment.x,
        segment.z,
        bDef.size,
        this.buildings,
        this.resourceNodes,
        true,
        obs?.rects,
        obs?.discs,
        obs?.bridges,
        'wall'
      );
      return count + (valid ? 0 : 1);
    }, 0) + (invalidPathPoint ? 1 : 0);

    const resourceState = this.getResourcesForFaction(this.humanPlayerId);
    const canAffordCost = canAfford(resourceState, cost);
    const isValid =
      placements.length > 0 &&
      placements.length <= MAX_WALL_CHAIN_SEGMENTS &&
      invalidCount === 0 &&
      canAffordCost;
    this.wallPlacementPreviewIsValid = isValid;
    if (this.wallPlacementPreviewLine) {
      (this.wallPlacementPreviewLine.material as THREE.LineBasicMaterial).color.setHex(
        isValid ? 0x22c55e : 0xef4444
      );
    }
    this.wallPlacementPreviewMarkers.forEach((marker) => {
      if (marker.userData.wallPreviewCursor && !marker.userData.wallPreviewSnappedCursor) {
        (marker.material as THREE.MeshBasicMaterial).color.setHex(isValid ? 0x22c55e : 0xef4444);
      }
    });

    return {
      pointCount: this.wallPlacementPoints.length,
      segmentCount: placements.length,
      distance: points.slice(1).reduce((sum, point, index) => sum + getDistance(points[index].x, points[index].z, point.x, point.z), 0),
      cost,
      canAfford: canAffordCost,
      invalidCount,
      isValid,
      snapped: !!this.wallPlacementSnapTargetId,
      snapTargetId: this.wallPlacementSnapTargetId,
    };
  }

  private findInvalidWallPathPoint(
    points: readonly WallChainPoint[],
    obstacles = this.getTerrainNavObstacles()
  ): WallChainPoint | null {
    for (let index = 0; index < points.length - 1; index++) {
      const start = points[index];
      const end = points[index + 1];
      const dx = end.x - start.x;
      const dz = end.z - start.z;
      const length = Math.hypot(dx, dz);
      const samples = Math.max(1, Math.ceil(length / 0.65));
      for (let sample = 0; sample <= samples; sample++) {
        const t = sample / samples;
        const point = { x: start.x + dx * t, z: start.z + dz * t };
        if (isPointInTerrainObstacle(point.x, point.z, obstacles?.rects, obstacles?.discs, obstacles?.bridges)) {
          return point;
        }
      }
    }
    return null;
  }

  private commitWallChain(
    points: readonly WallChainPoint[],
    pointSnaps: readonly (WallEndpointSnap<BuildingEntity> | null)[] = []
  ): boolean {
    const placements = layoutWallChain(points);
    if (placements.length === 0) {
      this.addFloatingText(this.cameraTarget.x, 2.5, this.cameraTarget.z, '⚠️ 請先設定起點，再設定足夠長度的終點', '#ef4444');
      sound.playInvalid();
      return false;
    }
    if (placements.length > MAX_WALL_CHAIN_SEGMENTS) {
      this.addFloatingText(this.cameraTarget.x, 2.5, this.cameraTarget.z, `⚠️ 單次最多規劃 ${MAX_WALL_CHAIN_SEGMENTS} 個牆段，請分批建造`, '#ef4444');
      sound.playInvalid();
      return false;
    }

    const bDef = DEFAULT_BUILDINGS.wall;
    const currentAge = this.ageByFaction[this.humanPlayerId] || 1;
    if (bDef.requiredAge && currentAge < bDef.requiredAge) return false;

    const obs = this.getTerrainNavObstacles();
    const invalidPathPoint = this.findInvalidWallPathPoint(points, obs);
    if (invalidPathPoint) {
      this.addFloatingText(invalidPathPoint.x, 2.5, invalidPathPoint.z, '⚠️ 城牆路線穿過水域或山崖，請調整轉折點', '#ef4444');
      sound.playInvalid();
      return false;
    }

    const firstInvalid = placements.find((segment) =>
      !isPlacementLocationValid(
        segment.x,
        segment.z,
        bDef.size,
        this.buildings,
        this.resourceNodes,
        true,
        obs?.rects,
        obs?.discs,
        obs?.bridges,
        'wall'
      )
    );
    if (firstInvalid) {
      this.addFloatingText(firstInvalid.x, 2.5, firstInvalid.z, '⚠️ 城牆路線穿過水域、山崖、礦點或既有建築，請調整轉折點', '#ef4444');
      sound.playInvalid();
      return false;
    }

    const cost = calculateWallChainCost(placements.length, bDef.cost);
    const humanRes = this.getResourcesForFaction(this.humanPlayerId);
    if (!canAfford(humanRes, cost)) {
      this.addFloatingText(this.cameraTarget.x, 2.8, this.cameraTarget.z, `⚠️ 城牆需要木材 ${cost.wood}、石料 ${cost.stone}，目前資源不足`, '#ef4444');
      sound.playInvalid();
      return false;
    }

    this.resourcesByFaction[this.humanPlayerId] = deductCost(humanRes, cost);
    this.syncHumanResourcesAlias();
    this.onResourcesChange?.(this.playerResources);

    const generatedChainId = `wall_chain_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const startSnap = pointSnaps.length === points.length ? pointSnaps[0] : null;
    const endSnap = pointSnaps.length === points.length ? pointSnaps[pointSnaps.length - 1] : null;
    const hasIntermediateSnap = pointSnaps.slice(1, -1).some(Boolean);
    const canExtendAtSingleEndpoint =
      !hasIntermediateSnap &&
      (!!startSnap !== !!endSnap) &&
      (startSnap || endSnap);
    const extensionSnap = canExtendAtSingleEndpoint ? (startSnap || endSnap) : null;
    const extensionPlan = extensionSnap
      ? planWallChainExtension(
          this.buildings.filter(
            (building) =>
              building.faction === this.humanPlayerId &&
              building.buildingDef.isWall &&
              building.hp > 0 &&
              building.isConstructed
          ),
          extensionSnap,
          placements.length,
          startSnap ? 'start' : 'end',
          generatedChainId
        )
      : null;
    const chainId = extensionPlan?.chainId ?? generatedChainId;

    if (extensionPlan) {
      for (const assignment of extensionPlan.existingAssignments) {
        assignment.wall.wallChainId = extensionPlan.chainId;
        assignment.wall.wallChainIndex = assignment.index;
        assignment.wall.wallChainSize = extensionPlan.totalSize;
      }
    }

    const segments = placements.map((placement, index) => {
      const building = this.addBuilding('wall', this.humanPlayerId, placement.x, placement.z, false, placement.rotationY, false);
      building.wallChainId = chainId;
      building.wallChainIndex = extensionPlan?.newIndices[index] ?? index;
      building.wallChainSize = extensionPlan?.totalSize ?? placements.length;
      return building;
    });
    this.refreshSettlementEnvironment();
    this.refreshWallTowerConnections();

    const workers = this.selectedUnitIds
      .map((id) => this.units.find((unit) => unit.id === id))
      .filter((unit): unit is UnitEntity =>
        !!unit &&
        unit.hp > 0 &&
        unit.unitDef.category === 'worker' &&
        !unit.garrisonedInBuildingId &&
        this.isHumanControlled(unit.faction)
      );

    const builderCount = Math.min(workers.length, segments.length);
    if (builderCount > 0) {
      const workChunks = Array.from({ length: builderCount }, (_, index) => {
        const startIndex = Math.floor((index * segments.length) / builderCount);
        const endIndex = Math.floor(((index + 1) * segments.length) / builderCount);
        const assignedSegments = segments.slice(startIndex, endIndex);
        return { startIndex, assignedSegments, first: assignedSegments[0] };
      });
      const workerAssignments = assignWorkersToConstructionTargets(
        workers,
        workChunks.map((chunk) => chunk.first),
      );
      for (let index = 0; index < workChunks.length; index++) {
        const { startIndex, assignedSegments, first } = workChunks[index];
        const worker = workers[workerAssignments[index]];
        if (!worker) continue;
        worker.buildApproachBuildingId = undefined;
        worker.buildApproachIndex = undefined;
        worker.buildApproachRetryAt = undefined;
        worker.buildApproachRecoveryCount = undefined;
        worker.targetBuildingId = first.id;
        worker.targetResourceNodeId = undefined;
        worker.targetEntityId = undefined;
        worker.targetGarrisonBuildingId = undefined;
        worker.waypoints = undefined;
        worker.pathGoal = undefined;
        worker.pathCooldown = 0;
        worker.commandQueue = assignedSegments.slice(1).map((segment) => ({ type: 'build' as const, buildingId: segment.id }));
        worker.state = 'building';
        worker.currentActionText = `🔨 前往建造城牆（${startIndex + 1}/${segments.length}）`;
      }
    }

    sound.playConstruct();
    this.spawnCommandIndicator(points[0].x, points[0].z, 'build');
    this.spawnCommandIndicator(points[points.length - 1].x, points[points.length - 1].z, 'build');
    this.addFloatingText(
      points[points.length - 1].x,
      3.0,
      points[points.length - 1].z,
      `🧱 已規劃 ${segments.length} 段城牆 · 木材 ${cost.wood} · 石料 ${cost.stone}`,
      '#86efac'
    );
    return true;
  }

  private rebuildWallPlacementPreview() {
    if (this.placementBuildingType !== 'wall') {
      if (this.wallPlacementPreviewGroup) this.wallPlacementPreviewGroup.visible = false;
      return;
    }

    if (!this.wallPlacementPreviewGroup) {
      this.wallPlacementPreviewGroup = new THREE.Group();
      this.scene.add(this.wallPlacementPreviewGroup);
    }
    const group = this.wallPlacementPreviewGroup;
    group.visible = true;

    const previewPoints = [...this.wallPlacementPoints];
    if (this.wallPlacementCursor && previewPoints.length > 0) {
      const last = previewPoints[previewPoints.length - 1];
      if (getDistance(last.x, last.z, this.wallPlacementCursor.x, this.wallPlacementCursor.z) >= 0.1) {
        previewPoints.push(this.wallPlacementCursor);
      }
    }

    const placements = previewPoints.length >= 2 ? layoutWallChain(previewPoints) : [];
    const previewLimit = Math.min(placements.length, MAX_WALL_CHAIN_SEGMENTS);

    // Keep one reusable 3D ghost per maximum segment count reached. Pointer movement
    // only updates transforms/visibility; it no longer destroys and reclones every wall.
    while (this.wallPlacementPreviewGhosts.length < previewLimit && this.wallPlacementGhostTemplate) {
      const ghost = this.wallPlacementGhostTemplate.clone(true);
      ghost.userData.wallPreviewSharedAssets = true;
      this.wallPlacementPreviewGhosts.push(ghost);
      group.add(ghost);
    }
    for (let index = 0; index < this.wallPlacementPreviewGhosts.length; index++) {
      const ghost = this.wallPlacementPreviewGhosts[index];
      const placement = placements[index];
      ghost.visible = !!placement && index < previewLimit;
      if (!placement || index >= previewLimit) continue;
      ghost.position.set(placement.x, 0, placement.z);
      ghost.rotation.y = placement.rotationY;
    }

    if (!this.wallPlacementPreviewLine) {
      const geometry = new THREE.BufferGeometry();
      const initialPositions = new THREE.BufferAttribute(new Float32Array(12 * 3), 3);
      initialPositions.setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute('position', initialPositions);
      const material = new THREE.LineBasicMaterial({
        color: this.wallPlacementPreviewIsValid ? 0x22c55e : 0xef4444,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
      });
      this.wallPlacementPreviewLine = new THREE.Line(geometry, material);
      this.wallPlacementPreviewLine.name = 'wallPlacementLine';
      this.wallPlacementPreviewLine.frustumCulled = false;
      group.add(this.wallPlacementPreviewLine);
    }
    const line = this.wallPlacementPreviewLine;
    line.visible = previewPoints.length >= 2;
    if (line.visible) {
      const geometry = line.geometry as THREE.BufferGeometry;
      let position = geometry.getAttribute('position') as THREE.BufferAttribute;
      if (position.count < previewPoints.length) {
        const capacity = Math.max(previewPoints.length, position.count * 2);
        position = new THREE.BufferAttribute(new Float32Array(capacity * 3), 3);
        position.setUsage(THREE.DynamicDrawUsage);
        geometry.setAttribute('position', position);
      }
      const values = position.array as Float32Array;
      previewPoints.forEach((point, index) => {
        const offset = index * 3;
        values[offset] = point.x;
        values[offset + 1] = 0.13;
        values[offset + 2] = point.z;
      });
      position.needsUpdate = true;
      geometry.setDrawRange(0, previewPoints.length);
      (line.material as THREE.LineBasicMaterial).color.setHex(
        this.wallPlacementPreviewIsValid ? 0x22c55e : 0xef4444
      );
    }

    // Marker meshes are pooled as waypoints are added and reused while the cursor moves.
    while (this.wallPlacementPreviewMarkers.length < previewPoints.length) {
      const markerIndex = this.wallPlacementPreviewMarkers.length;
      const geometry = new THREE.CircleGeometry(0.42, 20);
      const material = new THREE.MeshBasicMaterial({
        color: markerIndex === 0 ? 0xfbbf24 : 0x38bdf8,
        transparent: true,
        opacity: 0.92,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const marker = new THREE.Mesh(geometry, material);
      marker.rotation.x = -Math.PI / 2;
      this.wallPlacementPreviewMarkers.push(marker);
      group.add(marker);
    }
    for (let index = 0; index < this.wallPlacementPreviewMarkers.length; index++) {
      const marker = this.wallPlacementPreviewMarkers[index];
      const point = previewPoints[index];
      const isCursor =
        index === previewPoints.length - 1 &&
        this.wallPlacementCursor !== null &&
        previewPoints.length > this.wallPlacementPoints.length;
      const isSnappedCursor = isCursor && !!this.wallPlacementSnapTargetId;
      marker.visible = !!point;
      marker.userData.wallPreviewCursor = isCursor;
      marker.userData.wallPreviewSnappedCursor = isSnappedCursor;
      if (!point) continue;
      marker.scale.setScalar(isCursor ? 0.32 / 0.42 : 1);
      marker.position.set(point.x, 0.15, point.z);
      (marker.material as THREE.MeshBasicMaterial).color.setHex(
        isSnappedCursor
          ? 0x22d3ee
          : isCursor
            ? this.wallPlacementPreviewIsValid ? 0x22c55e : 0xef4444
            : index === 0 ? 0xfbbf24 : 0x38bdf8
      );
    }
  }

  public confirmPlacement(x: number, z: number, queueWorkers = false): boolean {
    if (!this.placementBuildingType) return false;
    if (this.placementBuildingType === 'wall') {
      return this.handleWallPlacementClick(x, z, false) === 'committed';
    }
    const bDef = DEFAULT_BUILDINGS[this.placementBuildingType];
    const currentAge = this.ageByFaction[this.humanPlayerId] || 1;
    const humanCiv = getCivilizationConfig(this.getCivilizationForFaction(this.humanPlayerId));
    if (!isBuildingBuildableForCiv(this.placementBuildingType, humanCiv.id, currentAge)) {
      const requiredAge = bDef.requiredAge ?? 1;
      const message = currentAge < requiredAge
        ? `🔒 需先晉升至時代 ${requiredAge} 才能完成建造`
        : '🔒 此建築尚未解鎖或不屬於目前文明';
      this.addFloatingText(this.cameraTarget.x, 2.5, this.cameraTarget.z, message, '#ef4444');
      sound.playInvalid();
      this.cancelPlacement();
      return false;
    }
    const humanRes = this.getResourcesForFaction(this.humanPlayerId);
    if (!canAfford(humanRes, bDef.cost)) {
      this.cancelPlacement();
      return false;
    }

    // Validate collision footprint against terrain obstacles, existing buildings & resource nodes
    const obs = this.getTerrainNavObstacles();
    const isValid = isPlacementLocationValid(
      x,
      z,
      bDef.size,
      this.buildings,
      this.resourceNodes,
      !!bDef.isWall,
      obs?.rects,
      obs?.discs,
      obs?.bridges,
      this.placementBuildingType
    );
    if (!isValid) {
      const msg =
        this.placementBuildingType === 'dock'
          ? '⚠️ 碼頭必須緊鄰河流或湖泊岸邊建造（且不可蓋在橋樑或礦點上）！'
          : '⚠️ 無法建造：不可建於水域、山崖或重疊建築！';
      this.addFloatingText(x, 2.5, z, msg, '#ef4444');
      sound.playInvalid();
      return false;
    }

    this.resourcesByFaction[this.humanPlayerId] = deductCost(humanRes, bDef.cost);
    this.syncHumanResourcesAlias();
    this.onResourcesChange?.(this.playerResources);

    const bldg = this.addBuilding(this.placementBuildingType, this.humanPlayerId, x, z, false);
    sound.playConstruct();
    this.spawnCommandIndicator(x, z, 'build');

    // Assign or Shift-queue the newly placed foundation for each selected worker.
    const workers = this.selectedUnitIds
      .map((id) => this.units.find((u) => u.id === id))
      .filter((u): u is UnitEntity => !!u && u.hp > 0 && !u.garrisonedInBuildingId && u.unitDef.category === 'worker' && this.isHumanControlled(u.faction));

    if (queueWorkers) {
      enqueueCommandsForUnits(workers, () => ({ type: 'build', buildingId: bldg.id }));
      workers.forEach((worker) => {
        if (worker.commandQueue?.length) worker.currentActionText = (worker.currentActionText || '') + ' ⋯佇列';
      });
    } else {
      workers.forEach((w) => {
        w.commandQueue = undefined;
        w.queuedGatherStopAfterDeposit = false;
        w.targetBuildingId = bldg.id;
        w.targetResourceNodeId = undefined;
        w.targetEntityId = undefined;
        w.waypoints = undefined;
        w.pathGoal = undefined;
        w.pathCooldown = 0;
        w.state = 'building';
        w.currentActionText = `🔨 前往建造${bDef.name.split(' ')[0]}`;
      });
    }

    this.cancelPlacement();
    return true;
  }

  public cancelPlacement() {
    this.placementBuildingType = null;
    this.wallPlacementPoints = [];
    this.wallPlacementCursor = null;
    this.wallPlacementSnapTargetId = null;
    this.wallPlacementPointSnaps = [];
    this.wallPlacementPreviewIsValid = false;
    if (this.wallPlacementPreviewGroup) {
      this.scene.remove(this.wallPlacementPreviewGroup);
      for (const child of [...this.wallPlacementPreviewGroup.children]) {
        if (!child.userData.wallPreviewSharedAssets) this.disposeWallPreviewObject(child);
      }
      this.wallPlacementPreviewGroup = null;
    }
    this.wallPlacementPreviewGhosts = [];
    this.wallPlacementPreviewMarkers = [];
    this.wallPlacementPreviewLine = null;
    if (this.wallPlacementGhostTemplate) {
      this.disposeWallPreviewObject(this.wallPlacementGhostTemplate);
      this.wallPlacementGhostTemplate = null;
    }
    this.clearWallRepairPreview();
    if (this.placementGhostMesh) {
      this.scene.remove(this.placementGhostMesh);
      this.placementGhostMesh = null;
    }
    if (!this.isDestroyed) this.onSelectionChange?.();
  }

  // ------------------ PERFORMANCE DIAGNOSTICS ------------------

  private updateAdaptiveQuality(now: number): void {
    if (this.isSoftwareGl) return;
    if (this.qualityWindowStart === 0) {
      this.qualityWindowStart = now;
      return;
    }
    this.qualityFrameCount += 1;
    const elapsed = now - this.qualityWindowStart;
    if (elapsed < 2200) return;

    const fps = (this.qualityFrameCount * 1000) / Math.max(1, elapsed);
    this.qualityFrameCount = 0;
    this.qualityWindowStart = now;
    if (now < this.qualityCooldownUntil) return;

    if (fps < 38) {
      this.lowFpsSamples += 1;
      this.highFpsSamples = 0;
    } else if (fps > 56) {
      this.highFpsSamples += 1;
      this.lowFpsSamples = 0;
    } else {
      this.lowFpsSamples = 0;
      this.highFpsSamples = 0;
    }

    let nextLevel = this.qualityLevel;
    if (this.lowFpsSamples >= 2 && this.qualityLevel > 0) {
      nextLevel = (this.qualityLevel - 1) as 0 | 1;
    } else if (this.highFpsSamples >= 4 && this.qualityLevel < 2) {
      nextLevel = (this.qualityLevel + 1) as 1 | 2;
    }
    if (nextLevel === this.qualityLevel) return;

    this.qualityLevel = nextLevel;
    this.lowFpsSamples = 0;
    this.highFpsSamples = 0;
    this.qualityCooldownUntil = now + 6000;
    this.applySceneDetailQuality(nextLevel);

    const pixelRatio = nextLevel === 0 ? 1 : nextLevel === 1 ? 1.35 : Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.shadowMap.enabled = nextLevel > 0;
    const shadowSize = nextLevel === 0 ? 512 : nextLevel === 1 ? 1024 : 2048;
    this.scene.traverse((object) => {
      if (!(object instanceof THREE.DirectionalLight)) return;
      object.castShadow = nextLevel > 0;
      if (object.shadow.mapSize.width !== shadowSize || object.shadow.mapSize.height !== shadowSize) {
        object.shadow.mapSize.set(shadowSize, shadowSize);
        object.shadow.map?.dispose();
        object.shadow.map = null;
        object.shadow.camera.updateProjectionMatrix();
      }
    });
  }

  private applySceneDetailQuality(level: 0 | 1 | 2): void {
    this.scene.traverse((object) => {
      const minimumLevel = object.userData?.qualityMinLevel;
      if (typeof minimumLevel !== 'number') return;
      const shouldShow = level >= minimumLevel;
      if (object.visible !== shouldShow) object.visible = shouldShow;
    });
  }

  private createPerformanceOverlay(): void {
    const panel = document.createElement('div');
    panel.setAttribute('role', 'status');
    panel.setAttribute('aria-live', 'off');
    panel.style.cssText = [
      'position:absolute',
      'top:12px',
      'left:12px',
      'z-index:40',
      'display:none',
      'pointer-events:none',
      'padding:10px 12px',
      'border:1px solid rgba(148,163,184,.28)',
      'border-radius:9px',
      'background:rgba(2,6,23,.86)',
      'color:#e2e8f0',
      'font:11px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace',
      'white-space:pre',
      'box-shadow:0 8px 24px rgba(0,0,0,.24)'
    ].join(';');
    panel.textContent = '效能監視器\n按 F3 顯示或隱藏';
    this.container.appendChild(panel);
    this.performanceOverlay = panel;
  }

  private togglePerformanceOverlay(): void {
    if (!this.performanceOverlay) return;
    this.performanceOverlayVisible = !this.performanceOverlayVisible;
    this.performanceOverlay.style.display = this.performanceOverlayVisible ? 'block' : 'none';
    if (this.performanceOverlayVisible) {
      this.performanceFrameCount = 0;
      this.performanceWindowStart = performance.now();
      this.performanceLastFrameTime = this.performanceWindowStart;
      this.performanceFrameTimes = [];
      this.performanceSimulationTotalMs = 0;
      this.performanceSimulationMaxMs = 0;
      this.performanceRenderCallTotalMs = 0;
      this.performanceRenderCallMaxMs = 0;
      this.pathSearchTiming = { ...EMPTY_PATH_SEARCH_TIMING };
      this.performanceCaptureStartedAt = this.performanceWindowStart;
      this.performanceSamples = [];
      this.performanceOverlay.textContent = '效能監視器\n正在收集影格資料…';
    }
  }

  private updatePerformanceOverlay(now: number, simulationUpdateMs: number, renderCallMs: number): void {
    if (!this.performanceOverlayVisible || !this.performanceOverlay) return;

    if (this.performanceLastFrameTime > 0) {
      const frameTime = now - this.performanceLastFrameTime;
      if (Number.isFinite(frameTime) && frameTime > 0) this.performanceFrameTimes.push(frameTime);
    }
    this.performanceLastFrameTime = now;
    this.performanceFrameCount += 1;
    if (Number.isFinite(simulationUpdateMs) && simulationUpdateMs > 0) {
      this.performanceSimulationTotalMs += simulationUpdateMs;
      this.performanceSimulationMaxMs = Math.max(this.performanceSimulationMaxMs, simulationUpdateMs);
    }
    if (Number.isFinite(renderCallMs) && renderCallMs > 0) {
      this.performanceRenderCallTotalMs += renderCallMs;
      this.performanceRenderCallMaxMs = Math.max(this.performanceRenderCallMaxMs, renderCallMs);
    }
    const elapsedMs = now - this.performanceWindowStart;
    if (elapsedMs < 500) return;

    const fps = (this.performanceFrameCount * 1000) / Math.max(1, elapsedMs);
    const frameTimes = summarizeFrameTimes(this.performanceFrameTimes);
    const simulationUpdateAverageMs = this.performanceSimulationTotalMs / Math.max(1, this.performanceFrameCount);
    const renderCallAverageMs = this.performanceRenderCallTotalMs / Math.max(1, this.performanceFrameCount);
    const activeParticles = this.particlePool.reduce((total, particle) => total + (particle.active ? 1 : 0), 0);
    const aliveUnits = this.units.reduce((total, unit) => total + (unit.hp > 0 ? 1 : 0), 0);
    const renderInfo = this.renderer.info;
    const render = renderInfo.render;
    const memory = renderInfo.memory;
    const rendererMode = this.isSoftwareGl ? 'Software GL' : 'Hardware GL';
    const aiFactionIds = new Set(this.participants.filter((participant) => participant.controller === 'ai').map((participant) => participant.id));
    const aiUnits = this.units.filter((unit) => unit.hp > 0 && aiFactionIds.has(unit.faction));
    const aiStateCounts: Record<UnitEntity['state'], number> = {
      idle: 0,
      moving: 0,
      attacking: 0,
      gathering: 0,
      returning_resource: 0,
      building: 0,
      assembling: 0,
      garrisoning: 0,
    };
    aiUnits.forEach((unit) => { aiStateCounts[unit.state] += 1; });
    const aiBuildings = this.buildings.filter((building) => building.hp > 0 && building.isConstructed && aiFactionIds.has(building.faction));
    const aiQueuedUnits = aiBuildings.reduce((total, building) => total + building.queue.length, 0);
    const aiResearchingBuildings = aiBuildings.filter((building) => !!building.activeTechId).length;
    const aiPathingUnits = aiUnits.filter((unit) => unit.state === 'moving' || unit.state === 'attacking');
    const aiStalledUnits = aiPathingUnits.filter((unit) => (unit.stuckDuration || 0) >= MOVEMENT_STALL_RECOVERY_SECONDS).length;
    // Lifetime AI recovery count survives unit state changes and unit deaths until the next match.
    const aiPathRecoveryCount = this.aiPathRecoveryTotal;
    const aiMaxStuckSeconds = aiPathingUnits.reduce((maximum, unit) => Math.max(maximum, unit.stuckDuration || 0), 0);
    const aiDecisionAverageMs = getAverageAiDecisionMs(this.aiDecisionTiming);
    const pathSearchAverageMs = getAveragePathSearchMs(this.pathSearchTiming);
    const qualityLabel = this.qualityLevel === 0 ? '低' : this.qualityLevel === 1 ? '中' : '高';
    const sample: PerformanceSample = {
      elapsedSeconds: Math.max(0, (now - this.performanceCaptureStartedAt) / 1000),
      wallTime: new Date().toISOString(),
      fps,
      frameAverageMs: frameTimes.averageMs,
      frameP95Ms: frameTimes.p95Ms,
      maxHitchMs: frameTimes.maxMs,
      simulationUpdateAverageMs,
      simulationUpdateMaxMs: this.performanceSimulationMaxMs,
      renderCallAverageMs,
      renderCallMaxMs: this.performanceRenderCallMaxMs,
      pathSearchSamples: this.pathSearchTiming.sampleCount,
      aiPathSearchSamples: this.pathSearchTiming.aiSampleCount,
      emptyPathSearches: this.pathSearchTiming.emptyPathCount,
      aiEmptyPathSearches: this.pathSearchTiming.aiEmptyPathCount,
      pathSearchAverageMs,
      pathSearchMaxMs: this.pathSearchTiming.maxMs,
      drawCalls: render.calls,
      triangles: render.triangles,
      geometries: memory.geometries,
      textures: memory.textures,
      aliveUnits,
      aiAliveUnits: aiUnits.length,
      aiStalledUnits,
      aiPathRecoveryCount,
      aiMaxStuckSeconds,
      aiIdleUnits: aiStateCounts.idle,
      aiMovingUnits: aiStateCounts.moving,
      aiAttackingUnits: aiStateCounts.attacking,
      aiGatheringUnits: aiStateCounts.gathering,
      aiReturningUnits: aiStateCounts.returning_resource,
      aiBuildingUnits: aiStateCounts.building,
      aiAssemblingUnits: aiStateCounts.assembling,
      aiGarrisoningUnits: aiStateCounts.garrisoning,
      aiQueuedUnits,
      aiResearchingBuildings,
      aiDecisionCount: this.aiDecisionCount,
      aiDecisionAccumulatorSeconds: this.aiDecisionSchedulerState.accumulatorSeconds,
      aiDecisionTimingSamples: this.aiDecisionTiming.sampleCount,
      aiDecisionLastMs: this.aiDecisionTiming.lastMs,
      aiDecisionAverageMs,
      aiDecisionMaxMs: this.aiDecisionTiming.maxMs,
      projectileCount: this.projectiles.length,
      activeParticles,
      particleCapacity: this.particlePool.length,
      pixelRatio: this.renderer.getPixelRatio(),
      rendererMode,
      qualityLevel: this.qualityLevel,
      stressUnitCount: this.battleStressInfo?.unitCount ?? null,
      stressSeed: this.battleStressInfo?.seed ?? null,
      mapPreset: this.battleStressInfo?.mapPreset ?? 'none',
      gameDurationSeconds: this.stats.gameDuration,
      gameSpeed: this.gameSpeed,
      gameState: this.gameState,
      participantCount: this.participants.length,
      aiParticipantCount: this.participants.filter((participant) => participant.controller === 'ai').length,
      viewportWidth: this.container.clientWidth,
      viewportHeight: this.container.clientHeight,
    };
    if (this.performanceSamples.length >= MAX_PERFORMANCE_SAMPLES) this.performanceSamples.shift();
    this.performanceSamples.push(sample);

    this.performanceOverlay.textContent = [
      'PERFORMANCE MONITOR  ·  F3 隱藏 · F4 匯出 CSV',
      `Capture Samples  ${this.performanceSamples.length} / ${MAX_PERFORMANCE_SAMPLES}`,
      `Stress Scenario ${this.battleStressInfo ? `${this.battleStressInfo.unitCount} units · ${this.battleStressInfo.mapPreset} · seed ${this.battleStressInfo.seed}` : 'OFF'}`,
      `Frame FPS        ${fps.toFixed(1)}`,
      `Frame ms avg     ${frameTimes.averageMs.toFixed(2)}`,
      `Frame ms p95     ${frameTimes.p95Ms.toFixed(2)}`,
      `Max hitch ms     ${frameTimes.maxMs.toFixed(2)}`,
      `Simulation ms    ${simulationUpdateAverageMs.toFixed(2)} avg / ${this.performanceSimulationMaxMs.toFixed(2)} max`,
      `Render call ms   ${renderCallAverageMs.toFixed(2)} avg / ${this.performanceRenderCallMaxMs.toFixed(2)} max`,
      `A* Searches      ${this.pathSearchTiming.sampleCount} total / ${this.pathSearchTiming.aiSampleCount} AI / ${this.pathSearchTiming.emptyPathCount} empty`,
      `A* Search ms     ${pathSearchAverageMs.toFixed(3)} avg / ${this.pathSearchTiming.maxMs.toFixed(3)} max`,
      `Draw Calls       ${render.calls.toLocaleString()}`,
      `Triangles        ${render.triangles.toLocaleString()}`,
      `Geometries       ${memory.geometries.toLocaleString()}`,
      `Textures         ${memory.textures.toLocaleString()}`,
      `Units / Shots    ${aliveUnits} / ${this.projectiles.length}`,
      `AI Idle/Move/Atk  ${aiStateCounts.idle}/${aiStateCounts.moving}/${aiStateCounts.attacking}`,
      `AI Stalled/Recover ${aiStalledUnits}/${aiPathRecoveryCount}`,
      `AI Max Stuck      ${aiMaxStuckSeconds.toFixed(1)}s`,
      `AI Gather/Return  ${aiStateCounts.gathering}/${aiStateCounts.returning_resource}`,
      `AI Build/Asm/Gar  ${aiStateCounts.building}/${aiStateCounts.assembling}/${aiStateCounts.garrisoning}`,
      `AI Queue/Research ${aiQueuedUnits}/${aiResearchingBuildings}`,
      `AI Heartbeat      ${this.aiDecisionCount} · ${this.aiDecisionSchedulerState.accumulatorSeconds.toFixed(2)} / ${(1.2 / Math.max(1, this.aiDecisionFactionIds.length)).toFixed(2)}s`,
      `AI Think ms       ${this.aiDecisionTiming.lastMs.toFixed(2)} last / ${aiDecisionAverageMs.toFixed(2)} avg / ${this.aiDecisionTiming.maxMs.toFixed(2)} max`,
      `Particles        ${activeParticles} / ${this.particlePool.length}`,
      `Pixel Ratio      ${this.renderer.getPixelRatio().toFixed(2)}`,
      `Renderer         ${rendererMode}`,
      `Quality          ${qualityLabel} (自動)`
    ].join('\n');

    this.performanceFrameCount = 0;
    this.performanceWindowStart = now;
    this.performanceFrameTimes = [];
    this.performanceSimulationTotalMs = 0;
    this.performanceSimulationMaxMs = 0;
    this.performanceRenderCallTotalMs = 0;
    this.performanceRenderCallMaxMs = 0;
  }

  private exportPerformanceTelemetry(): void {
    if (this.performanceSamples.length === 0) {
      if (this.performanceOverlay) {
        this.performanceOverlay.textContent = '尚無效能樣本；先按 F3 開始收集，再按 F4 匯出。';
      }
      return;
    }

    const csv = formatPerformanceTelemetryCsv(this.performanceSamples);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const firstSample = this.performanceSamples[0];
    const scenario = firstSample.stressUnitCount
      ? `stress-${firstSample.stressUnitCount}-seed-${firstSample.stressSeed ?? 'unknown'}`
      : 'match';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `age-of-clash-${scenario}-performance-${timestamp}.csv`;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ------------------ MAIN SIMULATION LOOP ------------------

  private startLoop() {
    let lastTime = performance.now();

    const tick = () => {
      if (this.isDestroyed) return;

      const now = performance.now();
      const rawDt = Math.max(0.001, (now - lastTime) / 1000);
      lastTime = now;
      let simulationUpdateMs = 0;
      if (this.gameState === 'playing') {
        const { stepDt, steps } = computeSimulationSubsteps(rawDt, this.gameSpeed, this.isSoftwareGl);
        const measureSimulation = this.performanceOverlayVisible;
        const simulationStartedAt = measureSimulation ? performance.now() : 0;
        for (let s = 0; s < steps; s++) {
          this.updateSimulation(stepDt);
          this.stats.gameDuration += stepDt;
        }
        if (measureSimulation) simulationUpdateMs = performance.now() - simulationStartedAt;
      } else if (this.gameState === 'title') {
        // Atmospheric live camera pan over the battlefield
        const t = now * 0.0003;
        this.cameraTarget.x = Math.sin(t) * 15;
        this.cameraTarget.z = Math.cos(t) * 15;
        this.updateCameraPosition();
      }

      this.updateUnitVisualLods(rawDt);
      this.fishAnimatedNodeMeshes.forEach((mesh) => {
        if (mesh.userData.fishAssetLod) updateFishAssetAnimations(mesh, rawDt);
      });
      let renderCallMs = 0;
      if (this.performanceOverlayVisible) {
        const renderStartedAt = performance.now();
        this.renderer.render(this.scene, this.camera);
        renderCallMs = performance.now() - renderStartedAt;
      } else {
        this.renderer.render(this.scene, this.camera);
      }
      this.updateAdaptiveQuality(now);
      this.updatePerformanceOverlay(now, simulationUpdateMs, renderCallMs);

      if (this.isSoftwareGl) {
        this.afterDraw(tick);
      } else {
        this.frameId = requestAnimationFrame(tick);
      }
    };

    this.renderer.render(this.scene, this.camera);
    if (this.isSoftwareGl) {
      this.afterDraw(tick);
    } else {
      this.frameId = requestAnimationFrame(tick);
    }
  }

  private afterDraw(cb: () => void) {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 60);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private updateSimulation(dt: number) {
    this.simTime += dt;

    // 0. World environmental animations (water ripples, fluttering banners, gentle tree/deer sway)
    const waterNorm = getWaterRippleNormalMap();
    // Preserve the previous combined scroll rate while updating the shared normal map only once.
    waterNorm.offset.x = (this.simTime * 0.074) % 1;
    waterNorm.offset.y = (this.simTime * 0.044) % 1;

    let flagIdx = 0;
    this.animatedBuildingMeshes.forEach((bMesh) => {
      const animFlags = bMesh.userData.animFlags as THREE.Object3D[] | undefined;
      if (animFlags) {
        for (let i = 0; i < animFlags.length; i++) {
          animFlags[i].rotation.y = Math.sin(this.simTime * 5.0 + flagIdx * 1.1) * 0.3;
          flagIdx++;
        }
      }
      const animCrystals = bMesh.userData.animCrystals as Array<{ obj: THREE.Object3D; baseY: number }> | undefined;
      if (animCrystals) {
        for (let i = 0; i < animCrystals.length; i++) {
          const entry = animCrystals[i];
          if (!entry || !entry.obj) continue;
          entry.obj.rotation.y = this.simTime * 1.8 + flagIdx * 0.7;
          entry.obj.position.y = entry.baseY + Math.sin(this.simTime * 2.8 + flagIdx) * 0.14;
          flagIdx++;
        }
      }
    });
    if (this.rallyFlagMesh) {
      const rFlag = this.rallyFlagMesh.getObjectByName('animatedFlag');
      if (rFlag) rFlag.rotation.y = Math.sin(this.simTime * 5.8) * 0.35;
    }

    updateAmbientTreeWind(this.windAnimatedNodeMeshes, this.simTime);

    // 1. Camera Input pan & smooth camera focus damping
    this.handleCameraMovement(dt);
    if (this.cameraDesiredTarget) {
      this.cameraTarget.x = dampScalar(this.cameraTarget.x, this.cameraDesiredTarget.x, 12, dt);
      this.cameraTarget.z = dampScalar(this.cameraTarget.z, this.cameraDesiredTarget.z, 12, dt);
      this.updateCameraPosition();
      if (
        Math.hypot(this.cameraTarget.x - this.cameraDesiredTarget.x, this.cameraTarget.z - this.cameraDesiredTarget.z) <
        0.15
      ) {
        this.cameraDesiredTarget = null;
      }
    }

    // 1.5 Scout / Enemy Sight Detection Alert
    this.evaluateEnemySpottedAlert(dt);

    // 2. Units simulation
    this.updateUnits(dt);
    this.updateFieldSiegeProjects(dt);

    // 2.5 Layer-based Collision Resolution (Prevents clipping & overlapping)
    resolveUnitUnitCollisions(this.units);
    resolveUnitBuildingCollisions(this.units, this.buildings);
    resolveUnitResourceCollisions(this.units, this.resourceNodes);

    // Unit decoration batches replace the per-unit contact-shadow and faction-ring draw calls.
    this.unitDecorationInstanceCursor = 0;
    this.unitRoleCrestInstanceCursor = 0;
    this.unitRoleSiegeInstanceCursor = 0;
    this.unitBuffRingInstanceCursor = 0;
    // Sync mesh positions & drive distance-locked procedural limb kinematics AFTER collision resolution
    for (const unit of this.units) {
      if (unit.hp <= 0) continue;
      const mesh = this.unitMeshes.get(unit.id);
      if (mesh) {
        if (unit.garrisonedInBuildingId) {
          mesh.visible = false;
          continue;
        }
        mesh.visible = true;
        mesh.position.set(unit.x, 0, unit.z);
        this.animateUnitMesh(unit, mesh, dt);
        this.writeUnitDecorationInstances(mesh);
        this.writeUnitRoleAndBuffInstances(mesh);
      }
    }

    // 3. Buildings simulation & Civ Building Auras
    this.updateBuildings(dt);
    this.updateWildAnimals(dt);
    this.updateContestedPoints(dt);
    this.updateStarRelic(dt);

    // 4. Projectiles and Mongol Shaman ground zones
    this.updateProjectiles(dt);
    this.updateGroundZones(dt);

    // 5. Floating texts, particle bursts, KO topples, Collapsing Buildings, Rubble decals, Shockwaves & Command rings
    this.updateFloatingTexts(dt);
    this.updateParticles(dt);

    for (let i = this.dyingEffects.length - 1; i >= 0; i--) {
      const de = this.dyingEffects[i];
      de.age += dt;
      const p = Math.min(1, de.age / de.duration);
      // Smooth backward KO fall + sink fade
      de.mesh.rotation.x = -p * (Math.PI / 2);
      de.mesh.position.y = de.startY - p * 0.18;
      const fadeScale = Math.max(0.05, 1 - Math.max(0, (p - 0.55) / 0.45) * 0.9);
      const baseScale = de.mesh.userData.baseScale || 1;
      de.mesh.scale.setScalar(baseScale * fadeScale);
      if (p >= 1) {
        this.scene.remove(de.mesh);
        this.dyingEffects.splice(i, 1);
      } else {
        this.writeUnitDecorationInstances(de.mesh);
        this.writeUnitRoleAndBuffInstances(de.mesh);
      }
    }
    this.finalizeUnitDecorationInstances();

    for (let i = this.collapsingBuildings.length - 1; i >= 0; i--) {
      const cb = this.collapsingBuildings[i];
      cb.age += dt;
      cb.dustTimer += dt;
      const p = Math.min(1, cb.age / cb.duration);
      // Horizontal quake tremor + progressive structural pancaking into earth
      const shakeAmp = (1 - p) * 0.18;
      cb.mesh.position.x = cb.startX + Math.sin(cb.age * 46) * shakeAmp;
      cb.mesh.position.z = cb.startZ + Math.cos(cb.age * 38) * shakeAmp * 0.8;
      cb.mesh.position.y = -(p * p) * Math.max(4.5, cb.footprint * 1.45);
      cb.mesh.scale.y = Math.max(0.18, 1 - p * 0.72);
      cb.mesh.rotation.z = Math.sin(p * Math.PI * 0.65) * 0.24;
      cb.mesh.rotation.x = p * 0.16;

      if (cb.dustTimer >= 0.22 && p < 0.88) {
        cb.dustTimer = 0;
        this.spawnParticleBurst(cb.startX, 0.8, cb.startZ, 'smoke', 4);
        this.spawnParticleBurst(cb.startX, 0.5, cb.startZ, 'dust', 4);
      }

      if (p >= 1) {
        disposeBuildingVisualResources(cb.mesh);
        this.scene.remove(cb.mesh);
        this.collapsingBuildings.splice(i, 1);
      }
    }

    for (let i = this.rubbleDecals.length - 1; i >= 0; i--) {
      const rd = this.rubbleDecals[i];
      rd.age += dt;
      const remain = 1 - rd.age / rd.maxAge;
      if (remain <= 0) {
        if (this.rubbleDecalBatch) setBuildingRubbleDecalScale(this.rubbleDecalBatch, rd.slot, 0);
        this.rubbleDecals.splice(i, 1);
      } else if (remain < 0.35 && this.rubbleDecalBatch) {
        const scale = Math.max(0.05, remain / 0.35);
        setBuildingRubbleDecalScale(this.rubbleDecalBatch, rd.slot, scale);
      }
    }

    for (let i = this.shockwaveRings.length - 1; i >= 0; i--) {
      const sr = this.shockwaveRings[i];
      sr.age += dt;
      const p = sr.age / sr.maxAge;
      if (p >= 1) {
        this.scene.remove(sr.mesh);
        // Each shockwave owns its RingGeometry and cloned material; release both after the effect.
        sr.mesh.geometry.dispose();
        (sr.mesh.material as THREE.Material).dispose();
        this.shockwaveRings.splice(i, 1);
      } else {
        const sc = 0.5 + p * sr.maxScale;
        sr.mesh.scale.set(sc, sc, sc);
        (sr.mesh.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - p);
      }
    }

    for (let i = this.commandIndicators.length - 1; i >= 0; i--) {
      const ci = this.commandIndicators[i];
      ci.age += dt;
      const p = ci.age / ci.maxAge;
      if (p >= 1) {
        this.scene.remove(ci.mesh);
        (ci.mesh.material as THREE.Material).dispose();
        this.commandIndicators.splice(i, 1);
      } else {
        const scale = 0.8 + p * 1.1;
        ci.mesh.scale.set(scale, scale, scale);
        (ci.mesh.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - p);
      }
    }

    // 6. AI Logic Evaluator
    // Spread faction planning across the interval: each AI still receives one
    // strategic decision every ~1.2s, but several factions no longer spike the
    // same simulation frame with their full planning passes.
    const aiFactionId = advanceAiDecisionScheduler(
      this.aiDecisionSchedulerState,
      this.aiDecisionFactionIds,
      dt,
    );
    if (aiFactionId) {
      this.aiDecisionCount += 1;
      const aiDecisionStartedAt = performance.now();
      this.rebuildCombatSpatialIndex();
      try {
        this.evaluateAiLogic(aiFactionId);
      } finally {
        this.aiDecisionTiming = recordAiDecisionTiming(
          this.aiDecisionTiming,
          Math.max(0, performance.now() - aiDecisionStartedAt),
        );
      }
    }

    // 7. Check Victory / Defeat
    this.checkWinLossConditions();

    // 8. Update Selection rings & throttled live HUD bars (research, training, skill cooldowns, clock)
    this.updateSelectionVisuals();
    const curSec = Math.floor(this.stats.gameDuration);
    if (curSec !== this.lastTimerSec) {
      this.lastTimerSec = curSec;
      this.onResourcesChange?.(this.playerResources);
    }
    const nowMs = performance.now();
    if (nowMs - this.lastHudSelectionSyncTime >= 200) {
      const selBldg = this.selectedBuildingId ? this.buildings.find((b) => b.id === this.selectedBuildingId) : null;
      const bldgBusy = !!(selBldg && (selBldg.queue.length > 0 || selBldg.activeTechId));
      const unitBusy = this.selectedUnitIds.some((uid) => {
        const u = this.units.find((unit) => unit.id === uid);
        return !!u && (u.abilityCooldown > 0 || (u.buffSpeedUntil && u.buffSpeedUntil > this.simTime));
      });
      if (bldgBusy || unitBusy) {
        this.lastHudSelectionSyncTime = nowMs;
        this.onSelectionChange?.();
      }
    }
  }

  public adjustCameraZoom(deltaY: number) {
    if (Math.abs(deltaY) < 0.01) return;
    const mag = Math.min(0.22, Math.max(0.08, (Math.abs(deltaY) / 100) * 0.09));
    const step = deltaY > 0 ? mag : -mag;
    this.cameraTargetZoom = Math.max(0.55, Math.min(1.75, +(this.cameraTargetZoom + step).toFixed(3)));
  }

  public setEdgeScrollFromClient(clientX: number, clientY: number) {
    const edgeMargin = 26;
    const w = window.innerWidth;
    const h = window.innerHeight;
    let sx = 0;
    let sy = 0;
    if (clientX <= edgeMargin) sx = -1;
    else if (clientX >= w - edgeMargin) sx = 1;
    if (clientY <= edgeMargin) sy = -1;
    else if (clientY >= h - edgeMargin) sy = 1;

    if (sx === 0 && sy === 0) {
      this.edgeScrollDirX = 0;
      this.edgeScrollDirZ = 0;
      return;
    }

    // Map screen X/Y edge direction onto isometric world X/Z axes
    const wx = sx + sy;
    const wz = sy - sx;
    const len = Math.hypot(wx, wz) || 1;
    this.edgeScrollDirX = wx / len;
    this.edgeScrollDirZ = wz / len;
  }

  public clearEdgeScroll() {
    this.edgeScrollDirX = 0;
    this.edgeScrollDirZ = 0;
  }

  private handleCameraMovement(dt: number) {
    const panSpeed = 32;
    let kx = 0;
    let kz = 0;

    if (this.keysHeld.has('KeyW') || this.keysHeld.has('ArrowUp')) {
      kx -= 1;
      kz -= 1;
    }
    if (this.keysHeld.has('KeyS') || this.keysHeld.has('ArrowDown')) {
      kx += 1;
      kz += 1;
    }
    if (this.keysHeld.has('KeyA') || this.keysHeld.has('ArrowLeft')) {
      kx -= 1;
      kz += 1;
    }
    if (this.keysHeld.has('KeyD') || this.keysHeld.has('ArrowRight')) {
      kx += 1;
      kz -= 1;
    }

    const kLen = Math.hypot(kx, kz);
    if (kLen > 0) {
      kx /= kLen;
      kz /= kLen;
    }

    let rawX = kx + this.edgeScrollDirX;
    let rawZ = kz + this.edgeScrollDirZ;
    const rawLen = Math.hypot(rawX, rawZ);
    if (rawLen > 1) {
      rawX /= rawLen;
      rawZ /= rawLen;
    }
    const inputX = rawX * panSpeed;
    const inputZ = rawZ * panSpeed;

    if (inputX !== 0 || inputZ !== 0) {
      this.cameraDesiredTarget = null;
    }

    const prevZoom = this.cameraZoom;
    this.cameraZoom = dampScalar(this.cameraZoom, this.cameraTargetZoom, 12, dt);
    const zoomMoved = Math.abs(this.cameraZoom - prevZoom) > 0.0002;

    this.cameraPanVelX = dampScalar(this.cameraPanVelX, inputX, 14, dt);
    this.cameraPanVelZ = dampScalar(this.cameraPanVelZ, inputZ, 14, dt);

    const isPanning = Math.abs(this.cameraPanVelX) > 0.05 || Math.abs(this.cameraPanVelZ) > 0.05;
    if (isPanning) {
      this.cameraTarget.x = Math.max(-92, Math.min(92, this.cameraTarget.x + this.cameraPanVelX * dt));
      this.cameraTarget.z = Math.max(-92, Math.min(92, this.cameraTarget.z + this.cameraPanVelZ * dt));
    } else {
      this.cameraPanVelX = 0;
      this.cameraPanVelZ = 0;
    }

    if (isPanning || zoomMoved) {
      this.updateCameraPosition();
    }
  }

  private updateCameraPosition() {
    const z = this.cameraZoom;
    this.camera.position.set(
      this.cameraTarget.x + 22 * z,
      this.cameraTarget.y + 30 * z,
      this.cameraTarget.z + 26 * z
    );
    this.camera.lookAt(this.cameraTarget.x, 0, this.cameraTarget.z);
  }

  /** Refresh unit and static-world visual LODs on independent, bounded cadences. */
  private updateUnitVisualLods(dt: number): void {
    const elapsed = Math.min(dt, 0.25);
    this.unitLodAccumulator += elapsed;
    this.buildingLodAccumulator += elapsed;
    this.resourceLodAccumulator += elapsed;

    const updateUnits = this.unitLodAccumulator >= 0.22;
    const updateBuildings = this.buildingLodAccumulator >= 0.44;
    const updateResources = this.resourceLodAccumulator >= 0.1;
    if (!updateUnits && !updateBuildings && !updateResources) return;

    if (updateUnits) this.unitLodAccumulator = 0;
    if (updateBuildings) this.buildingLodAccumulator = 0;
    if (updateResources) this.resourceLodAccumulator = 0;

    const viewportHeight = Math.max(
      1,
      this.renderer.domElement.height || this.renderer.domElement.clientHeight || 720
    );
    this.camera.updateMatrixWorld(true);

    if (updateUnits) {
      const highDetailUnitIds = createUnitLodHighDetailSet(
        this.selectedUnitIds,
        this.inspectedEntity?.type === 'unit' ? this.inspectedEntity.id : null,
      );
      for (const unit of this.units) {
        if (unit.hp <= 0) continue;
        const mesh = this.unitMeshes.get(unit.id);
        if (!mesh || !mesh.visible) continue;

        const forceHighDetail = highDetailUnitIds.has(unit.id);
        updateUnitVisualLod(mesh, this.camera, viewportHeight, forceHighDetail, unit.level || 1);
        updateDistanceShadowLod(mesh, this.camera, viewportHeight, forceHighDetail);
      }
      // Rebuild role markers immediately after their distance-LOD state changes, including while paused.
      this.rebuildUnitRoleMarkerInstances();
    }

    // Buildings are fewer and mostly stationary; halve their full-list refresh rate.
    if (updateBuildings) {
      for (const building of this.buildings) {
        if (!building.isConstructed || building.hp <= 0) continue;
        const mesh = this.buildingMeshes.get(building.id);
        if (!mesh || !mesh.visible) continue;
        const forceHighDetail =
          this.selectedBuildingId === building.id ||
          (this.inspectedEntity?.type === 'building' && this.inspectedEntity.id === building.id);
        updateBuildingVisualLod(mesh, this.camera, viewportHeight, forceHighDetail);
        updateDistanceShadowLod(mesh, this.camera, viewportHeight, forceHighDetail);
      }
    }

    // Resource nodes can number in the hundreds. Process a fixed budget every 100ms
    // so tree/deer/fish LOD and distance shadows do not create periodic full-map spikes.
    if (updateResources) {
      this.resourceVisualLodQueue.process(64, (mesh) => {
        if (!mesh.visible || !mesh.parent) return;
        const isSelected = this.selectedNodeId === mesh.userData.id;
        updateDistanceShadowLod(mesh, this.camera, viewportHeight, isSelected);
        if (mesh.userData.treeAssetLod) updateTreeVisualLod(mesh, this.camera, viewportHeight);
        if (mesh.userData.deerAssetLod) {
          updateDeerVisualLod(mesh, this.camera, viewportHeight, isSelected);
        }
        if (mesh.userData.fishAssetLod) {
          updateFishVisualLod(mesh, this.camera, viewportHeight, isSelected);
        }
      });
    }

    // Selected static objects bypass the normal cadence/batch wait for immediate detail.
    if (updateUnits && this.selectedBuildingId) {
      const mesh = this.buildingMeshes.get(this.selectedBuildingId);
      if (mesh?.visible) {
        updateBuildingVisualLod(mesh, this.camera, viewportHeight, true);
        updateDistanceShadowLod(mesh, this.camera, viewportHeight, true);
      }
    }
    if (updateUnits && this.selectedNodeId) {
      const mesh = this.nodeMeshes.get(this.selectedNodeId);
      if (mesh) {
        updateDistanceShadowLod(mesh, this.camera, viewportHeight, true);
        if (mesh.userData.deerAssetLod) updateDeerVisualLod(mesh, this.camera, viewportHeight, true);
        if (mesh.userData.fishAssetLod) updateFishVisualLod(mesh, this.camera, viewportHeight, true);
      }
    }
  }

  private measureNavCorridorWidth(
    navGrid: NavGrid,
    x: number,
    z: number,
    directionX: number,
    directionZ: number,
  ): number {
    if (![x, z, directionX, directionZ].every(Number.isFinite)) return 0;
    const sideX = -directionZ;
    const sideZ = directionX;
    const isWalkable = (offset: number): boolean => {
      const cell = worldToGrid(
        x + sideX * offset,
        z + sideZ * offset,
        navGrid.halfExtent,
        navGrid.cellSize,
        navGrid.dim,
      );
      return navGrid.blocked[cell.gz * navGrid.dim + cell.gx] === 0;
    };
    if (!isWalkable(0)) return 0;

    let leftWidth = 0;
    let rightWidth = 0;
    for (let offset = navGrid.cellSize; offset <= 4.5; offset += navGrid.cellSize) {
      if (isWalkable(offset)) leftWidth = offset;
      else break;
    }
    for (let offset = navGrid.cellSize; offset <= 4.5; offset += navGrid.cellSize) {
      if (isWalkable(-offset)) rightWidth = offset;
      else break;
    }
    return leftWidth + rightWidth + navGrid.cellSize;
  }

  private refreshFormationRegroupState(): void {
    this.formationRegroupByGroup.clear();
    this.formationTacticalMembersByGroup.clear();
    const membersByGroup = new Map<string, FormationMovementMember[]>();
    const stalledUnitsByGroup = groupStalledFormationUnits(this.units);

    for (const unit of this.units) {
      const groupId = unit.formationGroupId;
      const origin = unit.formationOrderOrigin;
      const goal = unit.formationOrderGoal;
      if (
        unit.hp <= 0 ||
        unit.garrisonedInBuildingId ||
        !groupId ||
        !origin ||
        !goal ||
        (unit.state !== 'moving' && unit.state !== 'attacking')
      ) {
        continue;
      }

      const members = membersByGroup.get(groupId) || [];
      members.push({
        id: unit.id,
        x: unit.x,
        z: unit.z,
        stuckDuration: unit.stuckDuration,
        formationOrderOrigin: origin,
        formationOrderGoal: goal,
      });
      membersByGroup.set(groupId, members);
      const tacticalMembers = this.formationTacticalMembersByGroup.get(groupId) || [];
      tacticalMembers.push({ id: unit.id, category: unit.unitDef.category });
      this.formationTacticalMembersByGroup.set(groupId, tacticalMembers);
    }

    for (const tacticalMembers of this.formationTacticalMembersByGroup.values()) {
      tacticalMembers.sort((a, b) => a.id.localeCompare(b.id));
    }

    for (const [groupId, members] of membersByGroup) {
      const measuredState = measureFormationRegroup(members);
      const stalledUnits = stalledUnitsByGroup.get(groupId) || [];
      let cached = this.formationPassageCacheByGroup.get(groupId);

      if (stalledUnits.length > 0 || cached) {
        const navGrid = this.getNavGrid();
        const shouldScan =
          !cached ||
          cached.grid !== navGrid ||
          (!cached.passage && this.simTime - cached.scannedAt >= 1.2);
        if (shouldScan && stalledUnits.length > 0) {
          const stalledUnit = stalledUnits[0];
          const goalX =
            stalledUnit.targetX ??
            (stalledUnit.formationOrderGoal && stalledUnit.formationOrderGoal.x);
          const goalZ =
            stalledUnit.targetZ ??
            (stalledUnit.formationOrderGoal && stalledUnit.formationOrderGoal.z);
          if (goalX !== undefined && goalZ !== undefined) {
            const pathIsCurrent =
              !!stalledUnit.waypoints?.length &&
              !!stalledUnit.pathGoal &&
              getDistance(stalledUnit.pathGoal.x, stalledUnit.pathGoal.z, goalX, goalZ) <= 1.8;
            const route = pathIsCurrent
              ? stalledUnit.waypoints!
              : findPath(stalledUnit.x, stalledUnit.z, goalX, goalZ, navGrid);
            const passage = findNarrowPassageOnRoute(
              [{ x: stalledUnit.x, z: stalledUnit.z }, ...route],
              (x, z, directionX, directionZ) =>
                this.measureNavCorridorWidth(navGrid, x, z, directionX, directionZ),
            );
            cached = { grid: navGrid, scannedAt: this.simTime, passage };
            this.formationPassageCacheByGroup.set(groupId, cached);
          } else {
            cached = { grid: navGrid, scannedAt: this.simTime, passage: null };
            this.formationPassageCacheByGroup.set(groupId, cached);
          }
        } else if (cached && cached.grid !== navGrid) {
          cached = { grid: navGrid, scannedAt: this.simTime, passage: null };
          this.formationPassageCacheByGroup.set(groupId, cached);
        }
      }

      const passage = cached?.passage || undefined;
      const activeMembers = members.filter(
        (member) =>
          !Number.isFinite(member.stuckDuration) ||
          (member.stuckDuration as number) < 4.5,
      );
      const hasMembersNearPassage = !!passage && activeMembers.some((member) => {
        const dx = member.x - passage.x;
        const dz = member.z - passage.z;
        const along = dx * passage.directionX + dz * passage.directionZ;
        const lateral = dx * -passage.directionZ + dz * passage.directionX;
        return (
          Math.abs(along) <= passage.halfLength + 8.5 &&
          Math.abs(lateral) <= passage.width * 0.5 + 8.5
        );
      });

      if (measuredState || hasMembersNearPassage) {
        const progressValues = activeMembers.map((member) =>
          getFormationMoveProgress(
            member.x,
            member.z,
            member.formationOrderOrigin,
            member.formationOrderGoal,
          ),
        );
        this.formationRegroupByGroup.set(groupId, {
          slowestProgress:
            measuredState?.slowestProgress ??
            (progressValues.length > 0 ? Math.min(...progressValues) : 0),
          activeMemberCount: measuredState?.activeMemberCount ?? activeMembers.length,
          stalledMemberCount: measuredState?.stalledMemberCount ?? 0,
          members,
          narrowPassage: passage,
        });
      } else {
        this.formationPassageCacheByGroup.delete(groupId);
      }
    }

    for (const groupId of this.formationPassageCacheByGroup.keys()) {
      if (!membersByGroup.has(groupId)) this.formationPassageCacheByGroup.delete(groupId);
    }
  }

  private assignFormationMovement(
    unit: UnitEntity,
    groupId: string,
    origin: { x: number; z: number },
    goal: { x: number; z: number },
  ): void {
    unit.formationGroupId = groupId;
    unit.formationOrderOrigin = { ...origin };
    unit.formationOrderGoal = { ...goal };
    unit.stuckDuration = 0;
    unit.stuckAccumulator = 0;
    unit.pathRecoveryCooldown = 0;
  }

  private clearFormationMovement(unit: UnitEntity): void {
    unit.kitingRetreatGoal = undefined;
    unit.formationGroupId = undefined;
    unit.formationOrderOrigin = undefined;
    unit.formationOrderGoal = undefined;
    this.clearFormationTacticalState(unit);
  }

  private clearFormationTacticalState(unit: UnitEntity): void {
    unit.formationTacticalTargetId = undefined;
    unit.formationTacticalAnchor = undefined;
    unit.formationTacticalGoal = undefined;
    unit.formationTacticalRole = undefined;
    unit.formationTacticalShieldWall = undefined;
  }

  private rebuildCombatSpatialIndex(): void {
    if (this.combatSpatialIndex) {
      rebuildCombatSpatialIndexInPlace(this.combatSpatialIndex, this.units, this.buildings);
      return;
    }
    this.combatSpatialIndex = createCombatSpatialIndex(this.units, this.buildings);
  }

  private rebuildCombatEntityLookups(): void {
    // Entity IDs are stable while an entity is alive. Rebuild only when roster
    // membership changes; unit/building position updates do not invalidate maps.
    if (
      this.combatUnitLookupSource !== this.units ||
      this.combatUnitLookupLength !== this.units.length
    ) {
      rebuildEntityIdIndex(this.combatUnitLookupById, this.units);
      this.combatUnitLookupSource = this.units;
      this.combatUnitLookupLength = this.units.length;
    }
    if (
      this.combatBuildingLookupSource !== this.buildings ||
      this.combatBuildingLookupLength !== this.buildings.length
    ) {
      rebuildEntityIdIndex(this.combatBuildingLookupById, this.buildings);
      this.combatBuildingLookupSource = this.buildings;
      this.combatBuildingLookupLength = this.buildings.length;
    }
  }

  /**
   * Uses one nearby-candidate query for both hostile target scoring and local ally
   * focus bonuses. The existing scoring function still applies exact range,
   * hostility, counter-unit and target-priority checks.
   */
  private selectNearbyCombatTarget(
    attacker: UnitEntity,
    maxSearchRange: number,
    includeBuildings = true,
    context: CombatTargetContext = {},
  ): UnitEntity | BuildingEntity | null {
    if (!this.combatSpatialIndex) this.rebuildCombatSpatialIndex();
    const safeRange = Number.isFinite(maxSearchRange)
      ? Math.max(0, maxSearchRange)
      : Infinity;
    const queryRadius = Math.max(16, safeRange);
    const candidates = queryCombatSpatialIndex(
      this.combatSpatialIndex!,
      attacker.x,
      attacker.z,
      queryRadius,
      this.combatTargetQueryScratch,
    );
    return selectOptimalCombatTarget(
      attacker,
      candidates.units,
      includeBuildings ? candidates.buildings : [],
      candidates.units,
      { ...context, maxSearchRange: safeRange },
    );
  }

  private resolveFormationTacticalSlot(
    unit: UnitEntity,
    target: UnitEntity | BuildingEntity,
    targetRadius: number,
  ): { x: number; z: number; role: FormationTacticalRole; shieldWall: boolean } | null {
    const groupId = unit.formationGroupId;
    const groupOrigin = unit.formationOrderOrigin;
    const members = groupId ? this.formationTacticalMembersByGroup.get(groupId) : undefined;
    if (!groupId || !groupOrigin || !members || members.length < 2) {
      this.clearFormationTacticalState(unit);
      return null;
    }

    const targetAnchor = { x: target.x, z: target.z };
    const shieldWallComposition =
      members.filter((member) => member.category === 'melee').length >= 2 &&
      members.some((member) => member.category === 'ranged');
    if (
      shieldWallComposition !== !!unit.formationTacticalShieldWall ||
      shouldRefreshFormationTacticalSlot(
        unit.formationTacticalTargetId,
        unit.formationTacticalAnchor,
        target.id,
        targetAnchor,
      )
    ) {
      const tacticalSlot = getFormationTacticalSlot({
        unitId: unit.id,
        members,
        category: unit.unitDef.category,
        groupOrigin,
        memberPosition: { x: unit.x, z: unit.z },
        target: { ...targetAnchor, radius: targetRadius },
        attackRange: unit.unitDef.stats.range,
        unitRadius: getUnitColliderRadius(unit.unitDef.category, unit.unitDef.visual.scale),
      });
      if (!tacticalSlot) {
        this.clearFormationTacticalState(unit);
        return null;
      }

      unit.formationTacticalTargetId = target.id;
      unit.formationTacticalAnchor = targetAnchor;
      unit.formationTacticalGoal = { x: tacticalSlot.x, z: tacticalSlot.z };
      unit.formationTacticalRole = tacticalSlot.role;
      unit.formationTacticalShieldWall = tacticalSlot.shieldWall;
      unit.waypoints = undefined;
      unit.pathGoal = undefined;
      unit.pathCooldown = 0;
    }

    if (!unit.formationTacticalGoal || !unit.formationTacticalRole) return null;
    return {
      ...unit.formationTacticalGoal,
      role: unit.formationTacticalRole,
      shieldWall: !!unit.formationTacticalShieldWall,
    };
  }

  private updateUnits(dt: number) {
    this.rebuildCombatEntityLookups();
    this.rebuildCombatSpatialIndex();
    if (
      this.battlefieldLeadershipRosterSource !== this.units ||
      this.battlefieldLeadershipRosterLength !== this.units.length
    ) {
      this.battlefieldLeadershipCandidates.length = 0;
      for (const unit of this.units) {
        if (unit.unitDef.leadershipAura) this.battlefieldLeadershipCandidates.push(unit);
      }
      this.battlefieldLeadershipRosterSource = this.units;
      this.battlefieldLeadershipRosterLength = this.units.length;
    }

    const leadershipUnitsByFaction = this.battlefieldLeadershipUnitByFaction;
    const leadershipScoresByFaction = this.battlefieldLeadershipScoreByFaction;
    leadershipUnitsByFaction.clear();
    leadershipScoresByFaction.clear();
    for (const unit of this.battlefieldLeadershipCandidates) {
      const aura = unit.unitDef.leadershipAura;
      if (!aura || unit.hp <= 0 || unit.garrisonedInBuildingId) continue;
      const score =
        aura.moraleRecoveryPerSecond +
        aura.moraleShockResistance * 4 +
        aura.suppressionResistance * 3;
      const current = leadershipUnitsByFaction.get(unit.faction);
      const currentScore = leadershipScoresByFaction.get(unit.faction) ?? -Infinity;
      if (
        !current ||
        score > currentScore ||
        (score === currentScore && unit.id.localeCompare(current.id) < 0)
      ) {
        leadershipUnitsByFaction.set(unit.faction, unit);
        leadershipScoresByFaction.set(unit.faction, score);
      }
    }
    this.battlefieldLeadershipUnits.length = 0;
    for (const leader of leadershipUnitsByFaction.values()) {
      this.battlefieldLeadershipUnits.push(leader);
    }

    // Cohesion and narrow-passage recovery do not need a full-entity scan every
    // simulation substep. Refresh at ~6.7 Hz while tactical slots reuse the last
    // coherent group snapshot between refreshes.
    this.formationRegroupRefreshAccumulator += dt;
    if (this.formationRegroupRefreshAccumulator >= 0.15) {
      this.formationRegroupRefreshAccumulator = Math.min(
        Math.max(0, this.formationRegroupRefreshAccumulator - 0.15),
        0.075,
      );
      this.refreshFormationRegroupState();
    }
    // Preserve the stable roster array on ordinary frames. Only allocate a
    // compacted array when the first dead unit is actually encountered.
    const currentUnits = this.units;
    let remainingUnits: UnitEntity[] | null = null;

    for (let unitIndex = 0; unitIndex < currentUnits.length; unitIndex++) {
      const unit = currentUnits[unitIndex];
      if (unit.hp <= 0) {
        if (!remainingUnits) remainingUnits = currentUnits.slice(0, unitIndex);
        if (unit.unitDefId === 'transport_boat' && unit.transportCargoIds?.length) {
          this.unloadTransport(unit);
        }
        // Unit died -> move mesh to smooth KO topple transition instead of sudden vanish!
        const mesh = this.unitMeshes.get(unit.id);
        if (mesh) {
          this.unitMeshes.delete(unit.id);
          const badge = mesh.getObjectByName('unitBadge');
          if (badge) badge.visible = false;
          mesh.userData.baseScale = unit.unitDef.visual.scale || 1;
          this.dyingEffects.push({ mesh, age: 0, duration: 0.38, startY: mesh.position.y });
          this.spawnParticleBurst(unit.x, 0.8, unit.z, 'dust', 5);
          sound.playUnitKo(this.getSpatialAudioScale(unit.x, unit.z));
        }
        if (this.isHumanControlled(unit.faction)) {
          this.stats.unitsLost++;
        } else if (this.isSpectatorMode) {
          this.stats.enemiesKilled++;
        } else if (this.isHostileToPlayer(unit)) {
          this.stats.enemiesKilled++;
        }
        continue;
      }

      remainingUnits?.push(unit);

      if (!unit.garrisonedInBuildingId && unit.state === 'idle' && unit.commandQueue && unit.commandQueue.length > 0) {
        this.tryDequeueCommand(unit);
      }

      if (unit.unitDefId === 'transport_boat' && unit.transportCargoIds?.length) {
        const cap = unit.unitDef.stats.carryCapacity || 5;
        if (!unit.currentActionText?.includes('航向') && !unit.currentActionText?.includes('卸載')) {
          unit.currentActionText = `載員 ${unit.transportCargoIds.length}/${cap}`;
        }
      }

      // Cooldowns, timers & passive regeneration
      this.refreshUnitMorale(unit, dt);
      this.refreshUnitSuppression(unit, dt);
      const moraleModifiers = getMoraleCombatModifiers(unit.morale ?? 100);
      const suppressionModifiers = getSuppressionCombatModifiers(unit.suppression ?? 0);
      const attackRateBuff = unit.buffAttackRateUntil && unit.buffAttackRateUntil > this.simTime ? 1.3 : 1;
      const attackRateSlow = unit.slowUntil && unit.slowUntil > this.simTime
        ? Math.max(0.35, Math.min(1, unit.slowFactor ?? 0.65))
        : 1;
      if (unit.attackCooldown > 0) {
        unit.attackCooldown -= dt * attackRateBuff * attackRateSlow * moraleModifiers.attackRateMultiplier * suppressionModifiers.attackRateMultiplier;
      }
      if (unit.abilityCooldown > 0) unit.abilityCooldown -= dt;
      if (unit.pathCooldown && unit.pathCooldown > 0) unit.pathCooldown -= dt;
      if (unit.hitFlashTimer && unit.hitFlashTimer > 0) unit.hitFlashTimer = Math.max(0, unit.hitFlashTimer - dt);
      if (unit.recoilTimer && unit.recoilTimer > 0) unit.recoilTimer = Math.max(0, unit.recoilTimer - dt);
      if (unit.slowUntil && unit.slowUntil <= this.simTime) {
        unit.slowUntil = undefined;
        unit.slowFactor = undefined;
      }
      if (unit.armorShredUntil && unit.armorShredUntil <= this.simTime) {
        unit.armorShredUntil = undefined;
        unit.armorShredAmount = undefined;
      }
      if (unit.buffAttackRateUntil && unit.buffAttackRateUntil <= this.simTime) unit.buffAttackRateUntil = undefined;
      if (unit.unitDef.stats.hpRegenPerSec && unit.hp < unit.maxHp) {
        unit.hp = Math.min(unit.maxHp, unit.hp + unit.unitDef.stats.hpRegenPerSec * dt);
      }

      // Garrisoned units are sheltered from enemy melee/ranged fire & regenerate HP slowly
      if (unit.garrisonedInBuildingId) {
        if (unit.garrisonedInBuildingId.startsWith('transport:')) {
          const boatId = unit.garrisonedInBuildingId.slice('transport:'.length);
          const boatCandidate = this.combatUnitLookupById.get(boatId);
          const boat = boatCandidate && boatCandidate.hp > 0 ? boatCandidate : undefined;
          if (!boat) {
            unit.garrisonedInBuildingId = undefined;
            unit.state = 'idle';
            const mesh = this.unitMeshes.get(unit.id);
            if (mesh) mesh.visible = true;
          } else {
            unit.x = boat.x;
            unit.z = boat.z;
            unit.velocity = { x: 0, z: 0 };
            const mesh = this.unitMeshes.get(unit.id);
            if (mesh) mesh.visible = false;
            continue;
          }
        }
        const hostId = unit.garrisonedInBuildingId;
        const hostCandidate = hostId ? this.combatBuildingLookupById.get(hostId) : undefined;
        const hostBldg = hostCandidate && hostCandidate.hp > 0 && hostCandidate.isConstructed
          ? hostCandidate
          : undefined;
        if (!hostBldg) {
          unit.garrisonedInBuildingId = undefined;
          unit.state = 'idle';
        } else {
          unit.x = hostBldg.x;
          unit.z = hostBldg.z;
          unit.velocity = { x: 0, z: 0 };
          const healRate =
            hostBldg.buildingType === 'mana_well'
              ? 6.0
              : hostBldg.buildingType === 'town_center' || hostBldg.buildingType === 'castle'
              ? 3.0
              : 2.0;
          unit.hp = Math.min(unit.maxHp, unit.hp + healRate * dt);
          const mesh = this.unitMeshes.get(unit.id);
          if (mesh) mesh.visible = false;
          continue;
        }
      }

      // A routed AI soldier runs to a nearby clear position, then rallies at shaken morale.
      if (unit.moraleRoutGoal) {
        const goal = unit.moraleRoutGoal;
        const reached = getDistance(unit.x, unit.z, goal.x, goal.z) <= 1.15;
        if (reached || this.simTime >= goal.until) {
          unit.moraleRoutGoal = undefined;
          unit.morale = Math.max(unit.morale ?? 0, 38);
          unit.moraleLastHitAt = this.simTime;
          unit.targetX = undefined;
          unit.targetZ = undefined;
          unit.targetEntityId = undefined;
          unit.waypoints = undefined;
          unit.pathGoal = undefined;
          unit.state = 'idle';
          unit.currentActionText = '🛡️ 潰兵重整 · 恢復陣線';
        } else {
          unit.targetEntityId = undefined;
          unit.attackMoveGoal = null;
          unit.targetX = goal.x;
          unit.targetZ = goal.z;
          unit.state = 'moving';
          unit.currentActionText = '🏃 士氣崩潰 · 潰退重整';
        }
      }

      // Behavior by state
      switch (unit.state) {
        case 'moving':
          if (unit.wallPatrolRoute && unit.unitDef.category !== 'worker') {
            const patrolThreat = this.selectNearbyCombatTarget(unit, 10);
            if (patrolThreat) {
              unit.targetEntityId = patrolThreat.id;
              unit.waypoints = undefined;
              unit.state = 'attacking';
              this.stepUnitAttacking(unit, dt);
              break;
            }
          }
          if (unit.attackMoveGoal && unit.unitDef.category !== 'worker') {
            const enemy = this.selectNearbyCombatTarget(
              unit,
              Math.max(13, Math.min(24, unit.unitDef.stats.range + 2)),
            );
            if (enemy) {
              unit.targetEntityId = enemy.id;
              unit.waypoints = undefined;
              unit.state = 'attacking';
              this.stepUnitAttacking(unit, dt);
              break;
            }
          }
          this.stepUnitMoving(unit, dt);
          break;
        case 'attacking':
          this.stepUnitAttacking(unit, dt);
          break;
        case 'gathering':
          this.stepUnitGathering(unit, dt);
          break;
        case 'returning_resource':
          this.stepUnitReturning(unit, dt);
          break;
        case 'building':
          this.stepUnitBuilding(unit, dt);
          break;
        case 'assembling':
          this.stepUnitFieldAssembly(unit, dt);
          break;
        case 'garrisoning':
          this.stepUnitGarrisoning(unit, dt);
          break;
        case 'idle':
          if (unit.wallPatrolRoute?.length && unit.unitDef.category !== 'worker') {
            const patrolIndex = Math.max(0, Math.min(unit.wallPatrolRoute.length - 1, unit.wallPatrolIndex || 0));
            unit.targetX = unit.wallPatrolRoute[patrolIndex].x;
            unit.targetZ = unit.wallPatrolRoute[patrolIndex].z;
            unit.state = 'moving';
            unit.currentActionText = '🛡️ 恢復城牆巡邏';
            break;
          }
          // Auto acquire nearby hostile enemies with 1v1 counter-matchup scoring (or resume attackMoveGoal if set!)
          if (unit.unitDef.category !== 'worker') {
            const enemy = this.selectNearbyCombatTarget(
              unit,
              Math.max(14, Math.min(24, unit.unitDef.stats.range + 2)),
            );
            if (enemy) {
              unit.targetEntityId = enemy.id;
              unit.waypoints = undefined;
              unit.state = 'attacking';
            } else if (unit.attackMoveGoal) {
              if (getDistance(unit.x, unit.z, unit.attackMoveGoal.x, unit.attackMoveGoal.z) > 2.0) {
                unit.targetX = unit.attackMoveGoal.x;
                unit.targetZ = unit.attackMoveGoal.z;
                unit.state = 'moving';
              } else {
                unit.attackMoveGoal = null;
              }
            }
          }
          break;
      }

      // Overhead Badge Visibility, Exclusive Saiyan Level badge, Action Status, and HP sync
      const mesh = this.unitMeshes.get(unit.id);
      if (mesh) {
        const badge = (mesh.userData.unitBadge as THREE.Sprite) || (mesh.getObjectByName('unitBadge') as THREE.Sprite);
        if (badge) {
          mesh.userData.overheadBadgesEnabled = this.showOverheadBadges;
          const now = performance.now();
          const isUnderAttack = !!(unit.lastDamagedTime && now - unit.lastDamagedTime < 2500);
          const xpEligible = canUnitGainXp(unit.unitDefId, this.getCivilizationForFaction(unit.faction));
          const lvl = xpEligible ? unit.level || 1 : 1;
          const hpRatio = Math.max(0, Math.min(1, unit.hp / Math.max(1, unit.maxHp)));
          const hpBucket = Math.ceil(hpRatio * 40);
          const isDamaged = shouldShowUnitHealthBar(unit.hp, unit.maxHp);
          const lastHpBucket = (unit as any)._lastHpBucket;
          const lastDamageState = (unit as any)._lastDamageState;
          const lastAction = (unit as any)._lastAction;
          const lastAttack = (unit as any)._lastAttack;
          const lastLvl = (unit as any)._lastLvl;

          if (
            lastHpBucket !== hpBucket ||
            lastDamageState !== isDamaged ||
            lastAction !== unit.currentActionText ||
            lastAttack !== isUnderAttack ||
            lastLvl !== lvl
          ) {
            (unit as any)._lastHpBucket = hpBucket;
            (unit as any)._lastDamageState = isDamaged;
            (unit as any)._lastAction = unit.currentActionText;
            (unit as any)._lastAttack = isUnderAttack;
            (unit as any)._lastLvl = lvl;

            const roleIcons: Record<string, string> = {
              villager: '⛏️',
              boat: '⛵',
              swordsman: '⚔️',
              archer: '🏹',
              knight: '🐎',
              ninja: '🥷',
              saiyan: '⚡',
              mage: '🔮',
              golem: unit.unitDef.category === 'siege' ? '🪨' : '🪵',
              ram: '🐏',
              cannon: '💣',
            };
            const icon =
              unit.unitDefId === 'transport_boat'
                ? '🚢'
                : unit.unitDefId === 'war_galley'
                ? '⛵'
                : unit.unitDefId === 'greek_fire_siphon'
                ? '🔥'
                : unit.unitDefId === 'scout_rider'
                ? '🔭'
                : unit.unitDefId === 'anime_katana_shinigami'
                ? '🗡️'
                : unit.unitDefId === 'fantasy_paladin'
                ? '🛡️'
                : roleIcons[unit.unitDef.visual.modelType] || '⚔️';
            const hostile = this.isHostileToPlayer(unit);
            const pName = this.getParticipant(unit.faction)?.name || '';
            const prefix = this.isHumanControlled(unit.faction)
              ? ''
              : this.isSpectatorMode || hostile
              ? `${pName}·`
              : '友軍·';
            const lvlSuffix = xpEligible && lvl >= 2 ? ` ★Lv.${lvl}` : '';
            const displayName = `${prefix}${unit.unitDef.name.split(' ')[0]}${lvlSuffix}`;
            const actionText = isUnderAttack
              ? '⚠️ 遭受攻擊!'
              : unit.currentActionText || (unit.state === 'idle' ? '💤 待命中' : '');
            updateBadgeSprite(
              badge,
              displayName,
              icon,
              isDamaged ? `${Math.ceil(Math.max(0, unit.hp))}/${unit.maxHp}` : '',
              hpRatio,
              hostile,
              false,
              actionText,
              isUnderAttack,
              isDamaged
            );
          }
        }
      }
    }

    if (remainingUnits) {
      this.units = remainingUnits;
      const aliveSet = new Set(remainingUnits.map((u) => u.id));
      this.selectedUnitIds = this.selectedUnitIds.filter((id) => aliveSet.has(id));
      this.controlGroups = pruneControlGroups(this.controlGroups, aliveSet);
    }
  }

  /**
   * Moves a unit toward (goalX, goalZ) along obstacle-free A* waypoints with automatic re-routing if blocked.
   */
  private moveUnitAlongPath(unit: UnitEntity, goalX: number, goalZ: number, dt: number) {
    const isNaval = !!unit.unitDef.isNaval || unit.unitDefId === 'fishing_boat';
    const navGrid = isNaval ? this.getWaterNavGrid() : this.getNavGrid();
    const goalShifted =
      !unit.pathGoal || getDistance(unit.pathGoal.x, unit.pathGoal.z, goalX, goalZ) > 1.8;

    // A materially new destination starts a fresh progress window; do not carry a stall
    // timer from an abandoned order into the next movement command.
    if (goalShifted) {
      unit.stuckDuration = 0;
      unit.stuckAccumulator = 0;
      unit.lastProgressCheckPos = { x: unit.x, z: unit.z };
    }

    unit.pathRecoveryCooldown = Math.max(0, (unit.pathRecoveryCooldown || 0) - dt);
    unit.stuckAccumulator = (unit.stuckAccumulator || 0) + dt;
    if (unit.stuckAccumulator >= MOVEMENT_STALL_SAMPLE_INTERVAL_SECONDS) {
      const elapsed = unit.stuckAccumulator;
      if (unit.lastProgressCheckPos) {
        const moved = getDistance(unit.x, unit.z, unit.lastProgressCheckPos.x, unit.lastProgressCheckPos.z);
        unit.stuckDuration = advanceMovementStallDuration(unit.stuckDuration, moved, elapsed);
      } else {
        unit.stuckDuration = 0;
      }
      unit.lastProgressCheckPos = { x: unit.x, z: unit.z };
      unit.stuckAccumulator = 0;
    }

    if (shouldRecoverStalledPath(unit.stuckDuration, unit.pathCooldown, unit.pathRecoveryCooldown)) {
      // Force one fresh A* route after prolonged lack of displacement. A cooldown
      // prevents repeated path searches when a physical crowd remains impassable.
      unit.waypoints = undefined;
      unit.pathGoal = undefined;
      unit.pathCooldown = 0;
      unit.pathRecoveryCooldown = MOVEMENT_STALL_RECOVERY_COOLDOWN_SECONDS;
      unit.pathRecoveryCount = (unit.pathRecoveryCount || 0) + 1;
      if (this.participants.some((participant) => participant.id === unit.faction && participant.controller === 'ai')) {
        this.aiPathRecoveryTotal += 1;
      }
    }

    const pathSearchReady = !unit.pathCooldown || unit.pathCooldown <= 0;
    const needsPathSearch =
      !unit.waypoints ||
      (unit.waypoints.length === 0 && pathSearchReady) ||
      (goalShifted && pathSearchReady);
    if (needsPathSearch && pathSearchReady) {
      const measurePathSearch = this.performanceOverlayVisible;
      const isAiPathSearch = measurePathSearch && this.participants.some(
        (participant) => participant.id === unit.faction && participant.controller === 'ai'
      );
      const pathSearchStartedAt = measurePathSearch ? performance.now() : 0;
      const nextWaypoints = findPath(unit.x, unit.z, goalX, goalZ, navGrid);
      if (measurePathSearch) {
        this.pathSearchTiming = recordPathSearchTiming(
          this.pathSearchTiming,
          Math.max(0, performance.now() - pathSearchStartedAt),
          isAiPathSearch,
          nextWaypoints.length > 0,
        );
      }
      unit.waypoints = nextWaypoints;
      unit.pathGoal = { x: goalX, z: goalZ };
      // Failed routes wait longer before being retried; this avoids an A* loop
      // when terrain fully separates a unit from its destination.
      unit.pathCooldown = nextWaypoints.length > 0 ? 0.4 : 0.85;
    }

    if (!unit.waypoints || unit.waypoints.length === 0) {
      unit.velocity = { x: 0, z: 0 };
      return;
    }

    // Advance through waypoints cleanly
    while (unit.waypoints.length > 1) {
      const wp = unit.waypoints[0];
      if (getDistance(unit.x, unit.z, wp.x, wp.z) < 0.75) {
        unit.waypoints.shift();
      } else {
        break;
      }
    }

    const activeTarget = unit.waypoints[0];
    const distToWp = getDistance(unit.x, unit.z, activeTarget.x, activeTarget.z);
    if (distToWp <= 0.001) return;

    const hasteMult = unit.buffSpeedUntil && unit.buffSpeedUntil > this.simTime ? 1.35 : 1;
    const rootSlow = (unit as any)._rootSlowUntil && (unit as any)._rootSlowUntil > this.simTime ? 0.55 : 1;
    const relicSlow = this.starRelicCarrierId === unit.id ? STAR_RELIC_CARRY_SPEED : 1;
    const mongolSlow = unit.slowUntil && unit.slowUntil > this.simTime
      ? Math.max(0.35, Math.min(1, unit.slowFactor ?? 0.65))
      : 1;
    const moraleSpeed = unit.moraleRoutGoal
      ? 1
      : getMoraleCombatModifiers(unit.morale ?? 100).movementSpeedMultiplier;
    const suppressionSpeed = unit.moraleRoutGoal
      ? 1
      : getSuppressionCombatModifiers(unit.suppression ?? 0).movementSpeedMultiplier;
    const routSpeed = unit.moraleRoutGoal ? 1.12 : 1;
    let speed = unit.unitDef.stats.speed * hasteMult * rootSlow * relicSlow * mongolSlow * moraleSpeed * suppressionSpeed * routSpeed;
    const regroupState = unit.formationGroupId
      ? this.formationRegroupByGroup.get(unit.formationGroupId)
      : undefined;
    if (
      regroupState &&
      regroupState.stalledMemberCount > 0 &&
      unit.formationOrderOrigin &&
      unit.formationOrderGoal
    ) {
      const progress = getFormationMoveProgress(
        unit.x,
        unit.z,
        unit.formationOrderOrigin,
        unit.formationOrderGoal,
      );
      speed *= getFormationCohesionSpeedScale(progress, regroupState.slowestProgress, true);
    }
    const trafficScale =
      regroupState?.narrowPassage
        ? getFormationNarrowPassageTrafficScale(
            unit.id,
            regroupState.members,
            regroupState.narrowPassage,
          )
        : 1;
    if (trafficScale < 0.999) {
      // Waiting for a squadmate is deliberate traffic control, not a pathfinding stall.
      unit.stuckDuration = 0;
      unit.stuckAccumulator = 0;
      unit.lastProgressCheckPos = { x: unit.x, z: unit.z };
    }
    speed *= trafficScale;
    const dx = (activeTarget.x - unit.x) / distToWp;
    const dz = (activeTarget.z - unit.z) / distToWp;
    const stepLen = Math.min(distToWp, speed * dt);

    unit.velocity = { x: dx, z: dz };
    unit.x += dx * stepLen;
    unit.z += dz * stepLen;
  }

  private stepUnitMoving(unit: UnitEntity, dt: number) {
    // Finish boarding if we were ordered onto a friendly transport
    if (unit.targetEntityId && !unit.unitDef.isNaval) {
      const boat = this.units.find(
        (b) =>
          b.id === unit.targetEntityId &&
          b.unitDefId === 'transport_boat' &&
          b.faction === unit.faction &&
          b.hp > 0
      );
      if (boat) {
        if (getDistance(unit.x, unit.z, boat.x, boat.z) <= 7.5) {
          this.boardTransport(boat, [unit]);
          return;
        }
        this.moveUnitAlongPath(unit, boat.x, boat.z, dt);
        unit.currentActionText = '登船中';
        return;
      }
    }

    if (unit.wallPatrolRoute?.length && (unit.targetX === undefined || unit.targetZ === undefined)) {
      const index = Math.max(0, Math.min(unit.wallPatrolRoute.length - 1, unit.wallPatrolIndex || 0));
      unit.targetX = unit.wallPatrolRoute[index].x;
      unit.targetZ = unit.wallPatrolRoute[index].z;
    }
    if (unit.targetX === undefined || unit.targetZ === undefined) {
      this.clearFormationMovement(unit);
      unit.state = 'idle';
      unit.attackMoveGoal = null;
      unit.currentActionText = '💤 待命中 (閒置)';
      return;
    }

    const dist = getDistance(unit.x, unit.z, unit.targetX, unit.targetZ);
    if (dist < 0.45 && unit.wallPatrolRoute && unit.wallPatrolRoute.length >= 2) {
      unit.wallPatrolIndex = ((unit.wallPatrolIndex || 0) + 1) % unit.wallPatrolRoute.length;
      const next = unit.wallPatrolRoute[unit.wallPatrolIndex];
      unit.targetX = next.x;
      unit.targetZ = next.z;
      unit.state = 'moving';
      unit.velocity = { x: 0, z: 0 };
      unit.waypoints = undefined;
      unit.pathGoal = undefined;
      unit.pathCooldown = 0;
      unit.currentActionText = '🛡️ 沿城牆巡邏';
      return;
    }
    if (dist < 0.45) {
      unit.stuckDuration = 0;
      unit.stuckAccumulator = 0;
      unit.pathRecoveryCooldown = 0;
      this.clearFormationMovement(unit);
      unit.state = 'idle';
      unit.attackMoveGoal = null;
      unit.velocity = { x: 0, z: 0 };
      unit.waypoints = undefined;
      if ((unit as any)._unloadOnArrive && unit.unitDefId === 'transport_boat') {
        this.unloadTransport(unit);
      } else if (this.tryDequeueCommand(unit)) {
        return;
      } else {
        unit.currentActionText = '💤 待命中 (閒置)';
      }
      return;
    }

    this.moveUnitAlongPath(unit, unit.targetX, unit.targetZ, dt);
    // Mangudai can fire while galloping, preserving the civilization's defining hit-and-run role.
    if (unit.unitDefId === 'mongol_mangudai' && unit.attackCooldown <= 0) {
      let nearestTarget: UnitEntity | null = null;
      let bestDistance = unit.unitDef.stats.range + 1.1;
      for (const enemy of this.units) {
        if (enemy.hp <= 0 || enemy.garrisonedInBuildingId || !this.isHostile(unit, enemy)) continue;
        const distance = getDistance(unit.x, unit.z, enemy.x, enemy.z);
        if (distance <= bestDistance) {
          nearestTarget = enemy;
          bestDistance = distance;
        }
      }
      if (nearestTarget) {
        unit.attackCooldown = 1 / Math.max(0.35, unit.unitDef.stats.attackRate);
        (unit as any)._attackSwing = 0.36;
        this.spawnProjectile(
          unit.x, 1.45, unit.z, nearestTarget.id, 'arrow',
          unit.unitDef.stats.attack, unit.unitDef.visual.color, unit.id
        );
      }
    }
    if (!unit.currentActionText || unit.currentActionText.includes('待命')) {
      unit.currentActionText = unit.attackMoveGoal ? '⚔️ 警戒推進中' : '👣 行軍移動中';
    }
  }

  /** Calculates whether a unit is striking an enemy's exposed side or rear. */
  private getUnitDirectionalAttack(
    attacker: UnitEntity,
    defender: UnitEntity,
    attackerX = attacker.x,
    attackerZ = attacker.z,
  ) {
    const velocityLength = Math.hypot(defender.velocity.x, defender.velocity.z);
    let facingX = 0;
    let facingZ = 0;

    // A moving unit faces its travel vector; a stationary unit uses its combat-facing yaw.
    if (velocityLength > 0.18) {
      facingX = defender.velocity.x / velocityLength;
      facingZ = defender.velocity.z / velocityLength;
    } else {
      const yaw = (defender as any)._desiredYaw;
      if (!Number.isFinite(yaw)) {
        return { zone: 'front' as const, multiplier: 1 };
      }
      facingX = Math.sin(yaw);
      facingZ = Math.cos(yaw);
    }

    return getDirectionalAttackModifier({
      attackerX,
      attackerZ,
      defenderX: defender.x,
      defenderZ: defender.z,
      defenderFacingX: facingX,
      defenderFacingZ: facingZ,
      attackerCategory: attacker.unitDef.category,
      defenderCategory: defender.unitDef.category,
    });
  }

  private startUnitMoraleRout(unit: UnitEntity, attacker?: UnitEntity): void {
    if (unit.moraleRoutGoal || unit.unitDef.category === 'worker' || unit.unitDef.isNaval || this.isHumanControlled(unit.faction)) return;

    let threat = attacker && attacker.hp > 0 && this.isHostile(unit, attacker) ? attacker : undefined;
    if (!threat) {
      let nearestDistance = 24;
      for (const candidate of this.units) {
        if (
          candidate.hp <= 0 ||
          candidate.garrisonedInBuildingId ||
          candidate.id === unit.id ||
          !this.isHostile(unit, candidate)
        ) continue;
        const distance = getDistance(unit.x, unit.z, candidate.x, candidate.z);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          threat = candidate;
        }
      }
    }
    if (!threat) return;

    const goal = getMoraleRoutGoal({
      x: unit.x,
      z: unit.z,
      threatX: threat.x,
      threatZ: threat.z,
      worldLimit: 84,
      retreatDistance: 10.5,
      isPositionClear: (x, z) => this.isLandPointClear(x, z, 0.72),
    });
    if (!goal) return;

    unit.moraleRoutGoal = { ...goal, until: this.simTime + 5.5 };
    unit.moraleRoutCooldownUntil = this.simTime + 22;
    unit.targetEntityId = undefined;
    unit.targetResourceNodeId = undefined;
    unit.targetBuildingId = undefined;
    unit.targetGarrisonBuildingId = undefined;
    unit.attackMoveGoal = null;
    unit.commandQueue = undefined;
    unit.wallPatrolRoute = undefined;
    unit.wallPatrolIndex = undefined;
    unit.kitingRetreatGoal = undefined;
    unit.waypoints = undefined;
    unit.pathGoal = undefined;
    unit.pathCooldown = 0;
    unit.velocity = { x: 0, z: 0 };
    this.clearFormationMovement(unit);
    unit.targetX = goal.x;
    unit.targetZ = goal.z;
    unit.state = 'moving';
    unit.currentActionText = '🏃 士氣崩潰 · 潰退重整';
  }

  /**
   * Return the strongest nearby allied commander directly. Keeping this as a
   * unit reference avoids allocating a wrapper object for every unit on every
   * simulation step.
   */
  private getNearbyLeadershipAura(unit: UnitEntity): UnitEntity | null {
    let best: UnitEntity | null = null;
    let bestScore = -Infinity;
    for (const leader of this.battlefieldLeadershipUnits) {
      const aura = leader.unitDef.leadershipAura;
      if (!aura || leader.hp <= 0 || leader.garrisonedInBuildingId || this.isHostile(unit, leader)) continue;
      if (getDistance(unit.x, unit.z, leader.x, leader.z) > aura.radius) continue;
      const score =
        aura.moraleRecoveryPerSecond +
        aura.moraleShockResistance * 4 +
        aura.suppressionResistance * 3;
      if (!best || score > bestScore) {
        best = leader;
        bestScore = score;
      }
    }
    return best;
  }

  private applyUnitSuppression(
    target: UnitEntity,
    projectileType: Projectile['type'],
    attacker?: UnitEntity,
  ): void {
    if (target.hp <= 0 || target.unitDef.category === 'worker') return;
    const impact = getSuppressionImpact(projectileType, attacker?.unitDef.category);
    if (impact <= 0) return;

    const previousState = getSuppressionCombatModifiers(target.suppression ?? 0).state;
    const leadership = this.getNearbyLeadershipAura(target);
    target.suppression = applySuppressionImpact(
      target.suppression ?? 0,
      impact,
      leadership?.unitDef.leadershipAura?.suppressionResistance ?? 0,
    );
    target.suppressionLastHitAt = this.simTime;
    const nextState = getSuppressionCombatModifiers(target.suppression).state;
    if (nextState !== previousState && nextState !== 'clear') {
      const label = nextState === 'pinned' ? '⛨ 被火力釘制' : '⚑ 遭受壓制';
      const color = nextState === 'pinned' ? '#fb7185' : '#fbbf24';
      this.addFloatingText(target.x, 2.7, target.z, label, color);
    }
  }

  private refreshUnitSuppression(unit: UnitEntity, dt: number): void {
    if (!Number.isFinite(unit.suppression)) unit.suppression = 0;
    if (this.simTime - (unit.suppressionLastHitAt ?? -Infinity) <= 1.2) return;
    unit.suppression = decaySuppression(unit.suppression ?? 0, dt);
    if ((unit.suppression ?? 0) < 0.5) unit.suppression = 0;
  }

  private applyNearbyCasualtyMoraleShock(casualty: UnitEntity): void {
    if (casualty.unitDef.category === 'worker') return;
    const isCommanderCasualty = !!casualty.unitDef.leadershipAura;
    const shockRadius = isCommanderCasualty
      ? Math.max(13, casualty.unitDef.leadershipAura?.radius ?? 0)
      : 9;
    for (const ally of this.units) {
      if (
        ally.id === casualty.id ||
        ally.hp <= 0 ||
        this.isHostile(casualty, ally) ||
        ally.garrisonedInBuildingId ||
        ally.unitDef.category === 'worker' ||
        getDistance(casualty.x, casualty.z, ally.x, ally.z) > shockRadius
      ) continue;

      const leadership = this.getNearbyLeadershipAura(ally);
      ally.morale = applyMoraleImpact({
        morale: ally.morale ?? 100,
        damage: 0,
        maxHp: ally.maxHp,
        nearbyAllyCasualty: true,
        leaderCasualty: isCommanderCasualty,
        moraleShockResistance: leadership?.unitDef.leadershipAura?.moraleShockResistance ?? 0,
      });
      ally.moraleLastHitAt = this.simTime;
      if (shouldUnitRout({
        morale: ally.morale,
        isHumanControlled: this.isHumanControlled(ally.faction),
        isWorker: false,
        alreadyRouted: !!ally.moraleRoutGoal,
        cooldownReady: (ally.moraleRoutCooldownUntil ?? 0) <= this.simTime,
      })) {
        this.startUnitMoraleRout(ally);
      }
    }
  }

  private applyUnitMoraleImpact(
    target: UnitEntity,
    damage: number,
    attacker?: UnitEntity,
    direction: 'flank' | 'rear' | null = null,
  ): void {
    if (target.unitDef.category === 'worker') return;
    const leadership = this.getNearbyLeadershipAura(target);
    target.morale = applyMoraleImpact({
      morale: target.morale ?? 100,
      damage,
      maxHp: target.maxHp,
      attackerCategory: attacker?.unitDef.category,
      direction,
      wasKilled: target.hp <= 0,
      moraleShockResistance: leadership?.unitDef.leadershipAura?.moraleShockResistance ?? 0,
    });
    target.moraleLastHitAt = this.simTime;

    if (target.hp <= 0) {
      this.applyNearbyCasualtyMoraleShock(target);
      return;
    }

    if (shouldUnitRout({
      morale: target.morale,
      isHumanControlled: this.isHumanControlled(target.faction),
      isWorker: false,
      alreadyRouted: !!target.moraleRoutGoal,
      cooldownReady: (target.moraleRoutCooldownUntil ?? 0) <= this.simTime,
    })) {
      this.startUnitMoraleRout(target, attacker);
    }
  }

  private refreshUnitMorale(unit: UnitEntity, dt: number): void {
    if (!Number.isFinite(unit.morale)) unit.morale = 100;
    const leadership = this.getNearbyLeadershipAura(unit);
    unit.leadershipAuraSourceId = leadership?.id;
    if (unit.moraleRoutGoal) return;
    const secondsSinceShock = this.simTime - (unit.moraleLastHitAt ?? 0);
    if (secondsSinceShock < 4.5) return;

    const isEngaged = unit.state === 'attacking' && !!unit.targetEntityId;
    const baseRecoveryRate = isEngaged ? 0.7 : unit.state === 'idle' ? 4.2 : 2.8;
    const recoveryRate = baseRecoveryRate + (leadership?.unitDef.leadershipAura?.moraleRecoveryPerSecond ?? 0);
    unit.morale = Math.min(100, (unit.morale ?? 100) + recoveryRate * dt);
  }

  private stepUnitAttacking(unit: UnitEntity, dt: number) {
    if (!unit.targetEntityId) {
      this.clearFormationTacticalState(unit);
      if (!this.tryDequeueCommand(unit)) {
        unit.state = 'idle';
        unit.currentActionText = '💤 待命中 (閒置)';
      }
      return;
    }

    let targetUnit = this.combatUnitLookupById.get(unit.targetEntityId);
    let targetBuilding = this.combatBuildingLookupById.get(unit.targetEntityId);
    if (
      targetUnit &&
      targetUnit.unitDefId === 'transport_boat' &&
      targetUnit.faction === unit.faction &&
      !unit.unitDef.isNaval
    ) {
      if (getDistance(unit.x, unit.z, targetUnit.x, targetUnit.z) <= 7.0) {
        this.boardTransport(targetUnit, [unit]);
        unit.targetEntityId = undefined;
        return;
      }
      this.moveUnitAlongPath(unit, targetUnit.x, targetUnit.z, dt);
      unit.currentActionText = '登船中';
      return;
    }
    let target: UnitEntity | BuildingEntity | undefined = targetUnit || targetBuilding;

    // Smart dynamic re-targeting for AI or attack-moving units (switches off buildings onto approaching soldiers or better 1v1 counters)
    if (
      target &&
      target.hp > 0 &&
      unit.unitDef.category !== 'worker' &&
      (!this.isHumanControlled(unit.faction) || !!unit.attackMoveGoal)
    ) {
      const rt = ((unit as any)._retargetTimer || 0) + dt;
      if (rt >= 0.85) {
        (unit as any)._retargetTimer = 0;
        const shouldSwitchOffBuilding =
          target.type === 'building' &&
          unit.unitDef.category !== 'siege' &&
          unit.unitDefId !== 'fantasy_treant';
        const nearbyThreat = this.selectNearbyCombatTarget(
          unit,
          Math.max(11, unit.unitDef.stats.range + 6),
          !shouldSwitchOffBuilding,
        );
        if (nearbyThreat && nearbyThreat.id !== target.id && (shouldSwitchOffBuilding || nearbyThreat.hp < nearbyThreat.maxHp * 0.45)) {
          unit.targetEntityId = nearbyThreat.id;
          unit.kitingRetreatGoal = undefined;
          unit.waypoints = undefined;
          target = nearbyThreat;
        }
      } else {
        (unit as any)._retargetTimer = rt;
      }
    }

    if (!target || target.hp <= 0 || (target.type === 'unit' && (target as UnitEntity).garrisonedInBuildingId)) {
      unit.kitingRetreatGoal = undefined;
      this.clearFormationTacticalState(unit);
      unit.targetEntityId = undefined;
      unit.waypoints = undefined;
      if (this.tryDequeueCommand(unit)) return;
      const followUp = this.selectNearbyCombatTarget(
        unit,
        Math.max(unit.attackMoveGoal ? 15 : 12, Math.min(24, unit.unitDef.stats.range + 2)),
      );
      if (followUp && (!this.isHumanControlled(unit.faction) || !!unit.attackMoveGoal)) {
        unit.targetEntityId = followUp.id;
        unit.state = 'attacking';
      } else if (unit.wallPatrolRoute?.length) {
        const patrolIndex = Math.max(0, Math.min(unit.wallPatrolRoute.length - 1, unit.wallPatrolIndex || 0));
        unit.targetX = unit.wallPatrolRoute[patrolIndex].x;
        unit.targetZ = unit.wallPatrolRoute[patrolIndex].z;
        unit.state = 'moving';
        unit.currentActionText = '🛡️ 恢復城牆巡邏';
      } else if (unit.attackMoveGoal) {
        unit.targetX = unit.attackMoveGoal.x;
        unit.targetZ = unit.attackMoveGoal.z;
        unit.state = 'moving';
        unit.currentActionText = '⚔️ 警戒推進中';
      } else {
        unit.state = 'idle';
        unit.currentActionText = '💤 待命中 (閒置)';
      }
      return;
    }

    const targetName =
      target.type === 'unit'
        ? (target as UnitEntity).unitDef.name.split(' ')[0]
        : (target as BuildingEntity).buildingDef.name.split(' ')[0];
    unit.currentActionText = `⚔️ 交戰中: ${this.isHostileToPlayer(target) ? '敵軍·' : ''}${targetName}`;

    const dist = getDistance(unit.x, unit.z, target.x, target.z);
    const range = unit.unitDef.stats.range;

    const targetRadius =
      target.type === 'unit'
        ? getUnitColliderRadius(
            (target as UnitEntity).unitDef.category,
            (target as UnitEntity).unitDef.visual.scale
          )
        : getBuildingCollisionRadius(target as BuildingEntity);
    const effectiveDist = Math.max(0, dist - targetRadius);
    const tacticalSlot = this.resolveFormationTacticalSlot(unit, target, targetRadius);

    // Mangudai use short, target-locked retreat paths against melee/cavalry threats.
    // Coordinated formations retain their assigned tactical slots instead of kiting independently.
    let kitingRetreating = false;
    const kitingThreat =
      unit.unitDefId === 'mongol_mangudai' &&
      !unit.formationGroupId &&
      target.type === 'unit' &&
      ['melee', 'cavalry'].includes((target as UnitEntity).unitDef.category);
    if (kitingThreat) {
      const activeGoal = unit.kitingRetreatGoal;
      if (activeGoal && activeGoal.targetId === target.id) {
        if (getDistance(unit.x, unit.z, activeGoal.x, activeGoal.z) > 0.75) {
          this.moveUnitAlongPath(unit, activeGoal.x, activeGoal.z, dt);
          kitingRetreating = true;
        } else {
          unit.kitingRetreatGoal = undefined;
        }
      } else {
        unit.kitingRetreatGoal = undefined;
      }

      if (!kitingRetreating && dist < 4.7) {
        const retreatGoal = getMongolKitingRetreatGoal({
          x: unit.x,
          z: unit.z,
          threatX: target.x,
          threatZ: target.z,
          triggerDistance: 4.7,
          desiredDistance: Math.min(range - 0.35, 5.9),
          worldLimit: 84,
          isPositionClear: (x, z) => this.isLandPointClear(x, z, 0.65),
        });
        if (retreatGoal) {
          unit.kitingRetreatGoal = { ...retreatGoal, targetId: target.id };
          this.moveUnitAlongPath(unit, retreatGoal.x, retreatGoal.z, dt);
          kitingRetreating = true;
        }
      }
    } else {
      unit.kitingRetreatGoal = undefined;
    }
    if (kitingRetreating) unit.currentActionText = '🏹 游擊後撤 · 保持射程';

    if (
      tacticalSlot &&
      !kitingRetreating &&
      getDistance(unit.x, unit.z, tacticalSlot.x, tacticalSlot.z) > 0.9
    ) {
      this.moveUnitAlongPath(unit, tacticalSlot.x, tacticalSlot.z, dt);
      const roleLabel =
        tacticalSlot.role === 'frontline'
          ? tacticalSlot.shieldWall ? '步兵盾牆' : '步兵防線'
          : tacticalSlot.role === 'backline'
            ? '遠程射位'
            : tacticalSlot.role === 'flank'
              ? '騎兵側翼'
              : '攻城後列';
      unit.currentActionText = `⚔️ 戰術部署 · ${roleLabel}`;
      return;
    }

    if (effectiveDist > range) {
      if (!kitingRetreating) {
        this.moveUnitAlongPath(unit, tacticalSlot?.x ?? target.x, tacticalSlot?.z ?? target.z, dt);
      }
    } else {
      // A unit already in weapon range is engaging, not movement-stalled.
      unit.stuckDuration = 0;
      unit.stuckAccumulator = 0;
      unit.pathRecoveryCooldown = 0;
      // Smoothly face target while fighting
      unit.velocity = { x: 0, z: 0 };
      (unit as any)._desiredYaw = Math.atan2(target.x - unit.x, target.z - unit.z);

      if (unit.attackCooldown <= 0) {
        unit.attackCooldown = 1 / unit.unitDef.stats.attackRate;
        (unit as any)._attackSwing = 0.36;

        if (unit.unitDef.stats.range > 2.5) {
          const pType = unit.unitDef.visual.projectileType || 'arrow';
          this.spawnProjectile(
            unit.x,
            1.2,
            unit.z,
            target.id,
            pType,
            unit.unitDef.stats.attack,
            unit.unitDef.visual.color,
            unit.id
          );
          if (this.isHumanControlled(unit.faction)) {
            const spatialGain = this.getSpatialAudioScale(unit.x, unit.z);
            if (unit.unitDef.category === 'special') sound.playMagicShot(spatialGain);
            else if (unit.unitDef.category === 'ranged') sound.playArrowShot(spatialGain);
          }
        } else {
          let dmg: number;
          let directionalZone: 'flank' | 'rear' | null = null;
          if (target.type === 'building') {
            const targetBldg = target as BuildingEntity;
            // Sustained sapping / torching on the same structure
            if (unit.siegeTargetId === targetBldg.id) {
              unit.siegeChannelTime = (unit.siegeChannelTime || 0) + 1 / Math.max(0.35, unit.unitDef.stats.attackRate);
            } else {
              unit.siegeTargetId = targetBldg.id;
              unit.siegeChannelTime = 0;
            }
            const supply = this.factionHasSiegeSupply(unit.faction);
            dmg = calculateBuildingDamage(
              unit,
              targetBldg,
              this.ageByFaction[targetBldg.faction] || 1,
              this.getResearchedTechs(targetBldg.faction),
              this.getResearchedTechs(unit.faction),
              this.landmarksByFaction[unit.faction] || [],
              supply
            );
            const assault = getBuildingAssaultProfile(unit);
            targetBldg.lastAttackerFaction = unit.faction;
            if (assault.method === 'greek_fire') {
              dmg += this.applyGreekFireCone(unit, targetBldg);
            }
            const heavy =
              assault.method === 'ram' ||
              assault.method === 'blast' ||
              assault.method === 'greek_fire' ||
              unit.unitDef.category === 'siege';
            this.spawnParticleBurst(
              target.x,
              heavy ? 1.25 : 1.0,
              target.z,
              assault.method === 'greek_fire' || assault.method === 'torch' || assault.method === 'blast'
                ? 'ember'
                : heavy
                ? 'stone'
                : 'ember',
              heavy ? 7 : 4
            );
            this.spawnParticleBurst(target.x, 1.1, target.z, heavy ? 'dust' : 'smoke', 3);
            if (assault.method === 'greek_fire') {
              this.spawnParticleBurst(target.x, 1.6, target.z, 'spark', 8);
            }
            if ((assault.method === 'torch' || assault.method === 'sap') && (unit.siegeChannelTime || 0) >= 3) {
              const pct = Math.min(100, Math.round(((unit.siegeChannelTime || 0) / 12) * 100));
              unit.currentActionText = `掘進 ${pct}%`;
            }
          } else {
            dmg = getUnitVsUnitDamage(
              unit.unitDef.stats.attack,
              target as UnitEntity,
              false,
              this.simTime,
              unit.unitDef.stats.bonusVsCategory
            );
            const directional = this.getUnitDirectionalAttack(unit, target as UnitEntity);
            dmg = Math.max(1, Math.round(dmg * directional.multiplier));
            directionalZone = directional.zone === 'front' ? null : directional.zone;
            this.spawnParticleBurst(target.x, 0.9, target.z, 'hit', 5);
            this.spawnParticleBurst(target.x, 1.0, target.z, 'spark', 3);
          }

          target.hp -= dmg;
          if (target.type === 'unit') {
            this.applyUnitMoraleImpact(target as UnitEntity, dmg, unit, directionalZone);
          }
          this.creditMongolRaidTribute(unit, target.type === 'building' ? 'building' : 'unit', target.hp <= 0);
          if (
            target.type === 'unit' &&
            (this.isHumanControlled(unit.faction) || this.isHumanControlled(target.faction))
          ) {
            sound.playSwordHit(this.getSpatialAudioScale(target.x, target.z));
          }
          if (target.type === 'building') this.applyWallBreachIfNeeded(target as BuildingEntity, unit.unitDef.category === 'siege');
          (target as any).lastDamagedTime = performance.now();
          (target as any).hitFlashTimer = 0.085;
          if (target.type === 'unit') {
            (target as UnitEntity).recoilTimer = 0.14;
          }
          if (this.isHumanControlled(target.faction)) {
            this.triggerUnderAttackAlert(target.x, target.z);
          }
          const directionalLabel = directionalZone === 'rear' ? '背襲 ' : directionalZone === 'flank' ? '側襲 ' : '';
          const damageColor = directionalZone === 'rear'
            ? '#fbbf24'
            : directionalZone === 'flank'
              ? '#c084fc'
              : target.type === 'building' && unit.unitDef.category === 'siege'
                ? '#fb923c'
                : '#ef4444';
          this.addFloatingText(target.x, 2.2, target.z, `${directionalLabel}-${dmg}`, damageColor);
          this.awardUnitXp(unit, 8);

          if (target.hp <= 0) {
            unit.kills++;
            this.awardUnitXp(unit, 35);
          }
        }
      }
    }
  }

  private applyWallBreachIfNeeded(building: BuildingEntity, siegeHit: boolean): void {
    if (!siegeHit || !shouldBreachWallAfterSiegeHit(building)) return;
    building.wallBreached = true;
    if (building.buildingType === 'gate') building.gateOpen = true;
    this.navGridDirty = true;
    this.waterNavGridDirty = true;
    const mesh = this.buildingMeshes.get(building.id);
    if (mesh) {
      if (building.buildingType === 'gate') updateGateDoorAnimation(mesh, true, 1.0);
      else applyWallBreachVisuals(mesh, true);
    }
    this.refreshWallTowerConnections();
    this.addFloatingText(building.x, 3.1, building.z, '💥 城牆遭攻城器擊破 · 防線出現缺口！', '#fb923c');
    if (this.selectedBuildingId === building.id) this.onSelectionChange?.();
  }

  /**
   * Selects a resource node by estimated deposited resources per minute.
   * The scoring uses the same A* delivery-route estimate as the economy HUD,
   * plus gather rate, carry capacity, node stock and current node congestion.
   */
  private findBestDeliveredResourceNode(
    worker: UnitEntity,
    resourceType?: ResourceType,
    maxDistance = Infinity,
    options: {
      allowDeepFish?: boolean;
      fishOnly?: boolean;
      allowDangerousHunt?: boolean;
      assignedCounts?: ReadonlyMap<string, number>;
      excludedNodeIds?: ReadonlySet<string>;
    } = {}
  ): ResourceNode | null {
    const candidates = this.resourceNodes
      .filter((node) => {
        if (node.amount <= 0 || (resourceType && node.resourceType !== resourceType)) return false;
        if (!canUnitGatherNode(worker.unitDef, node)) return false;
        if (node.subtype === 'boar' && !options.allowDangerousHunt) return false;
        if (!options.allowDeepFish && node.subtype === 'deep_fish') return false;
        if (options.fishOnly && node.subtype !== 'deep_fish' && node.subtype !== 'shore_fish') return false;
        if (options.excludedNodeIds?.has(node.id)) return false;
        return getDistance(worker.x, worker.z, node.x, node.z) <= maxDistance;
      })
      .map((node) => {
        const approachDistance = getDistance(worker.x, worker.z, node.x, node.z);
        const assigned = Math.max(0, options.assignedCounts?.get(node.id) || 0);
        const sourceBonus = node.resourceType === 'food' ? getFoodSourcePriority(node.subtype) * 4.5 : 0;
        const richBonus = node.nodeTier === 'rich' ? 4 : 0;
        return {
          node,
          approachDistance,
          assigned,
          preScore: approachDistance + assigned * 5.5 - sourceBonus - richBonus,
        };
      })
      .sort((a, b) => a.preScore - b.preScore || a.node.id.localeCompare(b.node.id))
      .slice(0, 12);

    if (candidates.length === 0) return null;

    const researchedTechs = this.getResearchedTechs(worker.faction);
    const hasStarOath = (this.starOathUntil[worker.faction] || 0) > this.simTime;
    const gatherSpeed = Math.max(0.01, worker.unitDef.stats.gatherSpeed || 0.5833);
    const carryCapacity = Math.max(1, worker.unitDef.stats.carryCapacity || 1);
    const moveSpeed = Math.max(0.1, worker.unitDef.stats.speed || 1);
    let best: ResourceNode | null = null;
    let bestScore = -Infinity;

    for (const candidate of candidates) {
      const node = candidate.node;
      const routeDistance = this.estimateResourceDeliveryTravelDistance(worker.faction, worker, node);
      const oneWayDistance = routeDistance !== null && Number.isFinite(routeDistance)
        ? routeDistance
        : candidate.approachDistance;
      const effectiveGatherRate = gatherSpeed * getEffectiveGatherMultiplier(node, researchedTechs, hasStarOath);
      const deliveredPerMinute = estimateDeliveredResourcePerMinute(
        effectiveGatherRate,
        carryCapacity,
        moveSpeed,
        oneWayDistance
      );
      const stockFactor = 0.55 + 0.45 * Math.min(1, node.amount / (carryCapacity * 2));
      const congestionFactor = 1 + candidate.assigned * 0.18;
      const approachFactor = 1 + candidate.approachDistance / moveSpeed / 45;
      const score = deliveredPerMinute * stockFactor / (congestionFactor * approachFactor);

      if (
        score > bestScore ||
        (Math.abs(score - bestScore) < 1e-9 && (!best || node.id.localeCompare(best.id) < 0))
      ) {
        best = node;
        bestScore = score;
      }
    }

    return best;
  }

  private stepUnitGathering(unit: UnitEntity, dt: number) {
    if (!unit.targetResourceNodeId) {
      if (!this.tryDequeueCommand(unit)) {
        unit.state = 'idle';
        unit.currentActionText = '💤 待命中 (閒置)';
      }
      return;
    }

    const isBoat = !!unit.unitDef.isNaval || unit.unitDefId === 'fishing_boat';
    const node = this.resourceNodes.find((n) => n.id === unit.targetResourceNodeId);
    if (!node || node.amount <= 0 || !canUnitGatherNode(unit.unitDef, node)) {
      const hasQueuedFollowUp = !!unit.commandQueue?.length || !!unit.queuedGatherStopAfterDeposit;
      if (hasQueuedFollowUp) {
        unit.targetResourceNodeId = undefined;
        unit.waypoints = undefined;
        if (unit.carryingResource && unit.carryingResource.amount >= 1) {
          unit.state = 'returning_resource';
          unit.currentActionText = '🏃 送回剩餘資源後執行佇列';
        } else {
          unit.queuedGatherStopAfterDeposit = false;
          if (!this.tryDequeueCommand(unit)) {
            unit.state = 'idle';
            unit.currentActionText = '💤 附近資源已採盡';
          }
        }
        return;
      }

      const carriedType = unit.carryingResource?.type;
      const fallbackType = node?.resourceType ?? carriedType;
      const nextNode = isBoat
        ? this.findBestDeliveredResourceNode(unit, 'food', 95, { allowDeepFish: true, fishOnly: true })
        : this.findBestDeliveredResourceNode(unit, fallbackType, 36);
      if (nextNode) {
        unit.targetResourceNodeId = nextNode.id;
        unit.waypoints = undefined;
        const nextMeta = this.getResourceDisplayMeta(nextNode);
        unit.currentActionText = `${nextMeta.icon} 轉往${nextMeta.action}`;
      } else if (unit.carryingResource && unit.carryingResource.amount >= 1) {
        unit.targetResourceNodeId = undefined;
        unit.waypoints = undefined;
        unit.state = 'returning_resource';
        unit.currentActionText = '🏃 送回剩餘資源';
      } else {
        unit.targetResourceNodeId = undefined;
        if (!this.tryDequeueCommand(unit)) {
          unit.state = 'idle';
          unit.currentActionText = '💤 附近資源已採盡';
        }
      }
      return;
    }

    const curAmt = Math.round(unit.carryingResource?.amount || 0);
    const cap = unit.unitDef.stats.carryCapacity;
    const labelMap: Record<string, string> = {
      wood: '木材',
      gold: '黃金',
      stone: '石料',
      deep_fish: '深海魚',
      shore_fish: '沿岸魚',
      hunt: '山羌肉',
      boar: '野豬肉',
      berry: '漿果',
      farm: '農田',
      food: '糧食',
    };
    const rLabel = labelMap[node.subtype || node.resourceType] || '資源';
    const huntingLive = (node.subtype === 'hunt' || node.subtype === 'boar') && node.animalAlive !== false && (node.animalHp === undefined || node.animalHp > 0);
    unit.currentActionText = huntingLive
      ? node.subtype === 'boar'
        ? `🐗 圍獵野豬 (${Math.ceil(node.animalHp ?? 200)} HP)`
        : `🦌 狩獵山羌 (${Math.ceil(node.animalHp ?? 32)} HP)`
      : `⛏️ 採集${rLabel} (${curAmt}/${cap})`;

    const dist = getDistance(unit.x, unit.z, node.x, node.z);
    const nodeRadius = getResourceColliderRadius(node.resourceType, node.subtype);
    const isLiveBoar = node.subtype === 'boar' && node.animalAlive !== false && (node.animalHp === undefined || node.animalHp > 0);
    const fallbackAngle = unit.id.split('').reduce(
      (sum, char, index) => sum + char.charCodeAt(0) * (index + 1),
      0,
    ) * 0.017453292519943295;
    const rangedBoarPlan = isLiveBoar && unit.unitDef.category === 'ranged'
      ? getWildBoarRangedHuntPlan(
          unit.x,
          unit.z,
          node.x,
          node.z,
          unit.unitDef.stats.range,
          fallbackAngle,
        )
      : null;

    if (rangedBoarPlan && rangedBoarPlan.mode !== 'hold') {
      this.moveUnitAlongPath(unit, rangedBoarPlan.goalX, rangedBoarPlan.goalZ, dt);
      unit.currentActionText = rangedBoarPlan.mode === 'retreat'
        ? '🏹 拉開距離 · 遠程掩護'
        : '🏹 接近射擊位置';
      return;
    }

    if (rangedBoarPlan) {
      unit.currentActionText = '🏹 遠程掩護野豬 (' + Math.ceil(node.animalHp ?? 200) + ' HP)';
    }

    const gatherRange = rangedBoarPlan?.maxRange ?? (
      node.subtype === 'deep_fish'
        ? Math.max(5.5, nodeRadius + 4.4)
        : node.subtype === 'shore_fish'
        ? Math.max(3.6, nodeRadius + 2.65)
        : nodeRadius + 1.35
    );

    if (dist > gatherRange) {
      this.moveUnitAlongPath(unit, node.x, node.z, dt);
    } else {
      unit.velocity = { x: 0, z: 0 };
      (unit as any)._desiredYaw = Math.atan2(node.x - unit.x, node.z - unit.z);
      if (!unit.carryingResource) {
        unit.carryingResource = { type: node.resourceType, amount: 0 };
      }

      const baseGatherRate = unit.unitDef.stats.gatherSpeed || 2;
      const subtypeMult = node.resourceType === 'food' ? getFoodGatherMultiplier(node.subtype) : 1;
      const tierMult = getNodeTierGatherMultiplier(node.nodeTier);
      const oathGather =
        (this.starOathUntil[unit.faction] || 0) > this.simTime ? STAR_RELIC_OATH_GATHER : 1;
      const resTechMult = getResourceGatherTechMultiplier(
        this.getResearchedTechs(unit.faction),
        node.resourceType
      );
      const gatherRate = baseGatherRate * subtypeMult * tierMult * oathGather * resTechMult;
      const prevAmount = node.amount;

      // Living wildlife must be killed before its meat reserve can be gathered.
      if (
        (node.subtype === 'hunt' || node.subtype === 'boar') &&
        node.animalAlive !== false &&
        (node.animalHp === undefined || node.animalHp > 0)
      ) {
        const isBoar = node.subtype === 'boar';
        const maxHp = isBoar ? 200 : 32;
        if (node.animalHp === undefined) {
          node.animalMaxHp = maxHp;
          node.animalHp = maxHp;
          node.animalAlive = true;
        }
        const isVillager = unit.unitDef.category === 'worker';
        let hitCd = (unit as any)._huntHitCd || 0;
        hitCd -= dt;
        if (hitCd <= 0) {
          const dmg = isVillager ? (isBoar ? 18 : 16) : Math.max(1, unit.unitDef.stats.attack);
          node.animalHp = Math.max(0, (node.animalHp || 0) - dmg);
          hitCd = isVillager ? 0.9 : Math.max(0.55, 1 / Math.max(0.4, unit.unitDef.stats.attackRate || 1));
          this.addFloatingText(node.x, 1.6, node.z, `-${dmg}`, '#fca5a5');
          if (isBoar) triggerWildBoarAggression(node, unit.id, this.simTime);
          else triggerWildAnimalPanic(node, unit.x, unit.z, this.simTime, 2.6);
        }
        (unit as any)._huntHitCd = hitCd;
        if (node.animalHp <= 0) {
          node.animalAlive = false;
          node.animalVx = 0;
          node.animalVz = 0;
          node.animalFleeUntil = 0;
          node.animalMoveBlend = 0;
          node.animalAggroTargetId = undefined;
          node.animalAggroUntil = 0;
          node.animalAttackCooldown = 0;
          this.addFloatingText(node.x, 1.8, node.z, isBoar ? '野豬倒地' : '山羌倒地', '#fca5a5');
          const nm = this.nodeMeshes.get(node.id);
          if (nm) {
            nm.position.y = 0;
            nm.rotation.x = 0.55;
          }
        }
      } else {
        const deltaGather = Math.min(node.amount, gatherRate * dt);
        unit.carryingResource.amount += deltaGather;
        node.amount -= deltaGather;
      }

      const fxTimer = ((unit as any)._gatherFxTimer || 0) + dt;
      if (fxTimer >= 0.52) {
        (unit as any)._gatherFxTimer = 0;
        (unit as any)._gatherNodeType = node.subtype || node.resourceType;
        const pKind: ParticleKind =
          node.subtype === 'boar' || node.subtype === 'hunt'
            ? node.animalAlive === false
              ? 'meat'
              : 'hit'
            : node.resourceType === 'wood'
              ? 'wood'
              : node.resourceType === 'gold'
                ? 'gold'
                : node.resourceType === 'stone'
                  ? 'stone'
                  : node.subtype === 'shore_fish' || node.subtype === 'deep_fish'
                    ? 'spark'
                    : 'leaf';
        this.spawnParticleBurst(node.x, node.subtype === 'shore_fish' || node.subtype === 'deep_fish' ? 0.35 : 0.85, node.z, pKind, 4);
      } else {
        (unit as any)._gatherFxTimer = fxTimer;
        (unit as any)._gatherNodeType = node.subtype || node.resourceType;
      }

      // Throttled remaining resource badge + progressive mesh depletion visual update (every ~5%)
      if (node.amount > 0) {
        const nodeMesh = this.nodeMeshes.get(node.id);
        if (nodeMesh) {
          const bucket = Math.ceil((node.amount / Math.max(1, node.maxAmount)) * 20);
          if ((node as any)._lastBucket !== bucket) {
            (node as any)._lastBucket = bucket;
            updateResourceNodeDepletionVisual(nodeMesh, node.amount, node.maxAmount, node.subtype);
            const badge = nodeMesh.getObjectByName('badgeSprite') as THREE.Sprite;
            if (badge) {
              badge.visible = this.showOverheadBadges;
              const curNodeAmt = Math.round(node.amount);
              const isRich = node.nodeTier === 'rich';
              const icon =
                node.subtype === 'deep_fish'
                  ? '🐠'
                  : node.subtype === 'shore_fish'
                  ? '🐟'
                  : node.subtype === 'berry'
                  ? '🫐'
                  : node.subtype === 'hunt'
                  ? '🦌'
                  : node.subtype === 'boar'
                  ? '🐗'
                  : node.resourceType === 'wood'
                  ? isRich
                    ? '🌲'
                    : '🪵'
                  : node.resourceType === 'gold'
                  ? '🪙'
                  : node.resourceType === 'stone'
                  ? '🪨'
                  : '🌾';
              const title =
                node.subtype === 'deep_fish'
                  ? '深海魚群'
                  : node.subtype === 'shore_fish'
                  ? '沿岸魚群'
                  : node.subtype === 'berry'
                  ? '野生漿果'
                  : node.subtype === 'hunt'
                  ? node.animalAlive === false
                    ? '山羌屍體'
                    : '野生山羌'
                  : node.subtype === 'boar'
                  ? node.animalAlive === false
                    ? '野豬屍體'
                    : '野生野豬'
                  : node.resourceType === 'wood'
                  ? isRich
                    ? '遠古神木'
                    : '木材'
                  : node.resourceType === 'gold'
                  ? isRich
                    ? '富金礦脈'
                    : '金礦'
                  : node.resourceType === 'stone'
                  ? isRich
                    ? '精良石脈'
                    : '石礦'
                  : '農田';
              const isLiveHunt = (node.subtype === 'hunt' || node.subtype === 'boar') && node.animalAlive !== false && (node.animalHp ?? 1) > 0;
              const animalMaxHp = node.animalMaxHp || (node.subtype === 'boar' ? 200 : 32);
              const badgeAmt = isLiveHunt
                ? `${Math.ceil(node.animalHp || 0)}/${animalMaxHp} HP`
                : `${curNodeAmt}/${node.maxAmount}`;
              const badgeRatio = isLiveHunt
                ? (node.animalHp || 0) / animalMaxHp
                : node.amount / node.maxAmount;
              updateBadgeSprite(
                badge,
                title,
                icon,
                badgeAmt,
                badgeRatio,
                false,
                true,
                isLiveHunt
                  ? '受驚會逃 · 先獵殺再採肉'
                  : isRich
                  ? `✨富脈×1.35 · 剩 ${Math.round((node.amount / node.maxAmount) * 100)}%`
                  : `剩餘 ${Math.round((node.amount / node.maxAmount) * 100)}%`
              );
            }
          }
        }
      }

      if (prevAmount > 0 && node.amount <= 0) {
        // Auto-reseed farm seamlessly if enabled and faction has enough wood
        let reseeded = false;
        if (node.subtype === 'farm' && this.isAutoReseedFarmsEnabled(unit.faction)) {
          const owningFarm = this.buildings.find(
            (b) =>
              b.buildingType === 'farm' &&
              b.hp > 0 &&
              b.isConstructed &&
              b.faction === unit.faction &&
              Math.hypot(b.x - node.x, b.z - node.z) < 2.5
          );
          const resBag = this.getResourcesForFaction(unit.faction);
          if (owningFarm && resBag.wood >= FARM_RESEED_WOOD_COST) {
            resBag.wood -= FARM_RESEED_WOOD_COST;
            this.syncHumanResourcesAlias();
            node.maxAmount = 2500;
            node.amount = 2500;
            (node as any)._lastBucket = -1;
            reseeded = true;
            this.spawnParticleBurst(node.x, 0.8, node.z, 'leaf', 6);
            if (this.isHumanControlled(unit.faction)) {
              this.onResourcesChange?.(this.playerResources);
              this.addFloatingText(node.x, 2.2, node.z, `🌾 自動補種農田 (-${FARM_RESEED_WOOD_COST} 木)`, '#4ade80');
            }
          }
        }

        if (!reseeded) {
          this.navGridDirty = true;
          const mesh = this.nodeMeshes.get(node.id);
          if (mesh) {
            this.scene.remove(mesh);
            this.nodeMeshes.delete(node.id);
            this.windAnimatedNodeMeshes.delete(mesh);
            this.fishAnimatedNodeMeshes.delete(mesh);
            this.resourceVisualLodQueue.remove(node.id);
          }
          if (
            this.depletedResourceBatch &&
            (node.subtype === 'wood' || node.subtype === 'gold' || node.subtype === 'stone')
          ) {
            addResourceDepletionRemnant(
              this.depletedResourceBatch,
              node.x,
              node.z,
              node.subtype,
              node.nodeTier
            );
          }
          if (this.isHumanControlled(unit.faction) && !this.isSpectatorMode) {
            const meta = this.getResourceDisplayMeta(node);
            sound.playResourceDepleted(node.resourceType);
            this.lastTacticalBroadcast = {
              kind: 'resource_depleted',
              message: `${meta.icon} 播報：${meta.name}資源已採盡，村民將自動轉往附近礦點！`,
              x: node.x,
              z: node.z,
              time: performance.now(),
            };
            this.addFloatingText(node.x, 2.4, node.z, `${meta.icon} 資源已採盡！`, '#f59e0b');
            this.onStateChange?.();
          }
        }
      }

      // Refresh the linked farm only when its resource reserve crosses a 5% bucket.
      // This runs after auto-reseed logic so a paid reseed restores the crop in the same tick.
      this.refreshFarmCropDepletionVisual(node);

      if (unit.carryingResource.amount >= unit.unitDef.stats.carryCapacity) {
        unit.waypoints = undefined;
        if (unit.commandQueue?.length || unit.queuedGatherStopAfterDeposit) {
          unit.targetResourceNodeId = undefined;
          unit.queuedGatherStopAfterDeposit = true;
        }
        unit.state = 'returning_resource';
        unit.currentActionText = unit.queuedGatherStopAfterDeposit
          ? '🏃 運送物資後執行佇列'
          : '🏃 運送物資回基地';
      }
    }
  }

  private stepUnitReturning(unit: UnitEntity, dt: number) {
    if (!unit.carryingResource || unit.carryingResource.amount <= 0) {
      if (!this.tryDequeueCommand(unit)) {
        unit.state = 'idle';
        unit.currentActionText = '💤 待命中 (閒置)';
      }
      return;
    }

    const resNames: Record<ResourceType, string> = { wood: '木材', gold: '黃金', stone: '石料', food: '糧食' };
    unit.currentActionText = `🏃 運送${resNames[unit.carryingResource.type] || '物資'}回基地`;

    const isNaval = !!unit.unitDef.isNaval || unit.unitDefId === 'fishing_boat';
    const dropOffs = this.buildings.filter(
      (b) =>
        b.faction === unit.faction &&
        b.isConstructed &&
        (isNaval
          ? b.buildingType === 'dock'
          : b.buildingType === 'town_center' ||
            (unit.carryingResource?.type === 'food' &&
              (b.buildingType === 'dock' || b.buildingType === 'granary' || b.buildingType === 'farm')) ||
            (unit.carryingResource?.type === 'wood' && b.buildingType === 'lumber_camp') ||
            ((unit.carryingResource?.type === 'gold' || unit.carryingResource?.type === 'stone') &&
              b.buildingType === 'mining_camp'))
    );

    if (dropOffs.length === 0) {
      unit.state = 'idle';
      unit.currentActionText = isNaval ? '⚓ 需碼頭卸魚' : '💤 無存放建築待命';
      return;
    }

    let nearest = dropOffs[0];
    let minDist = getDistance(unit.x, unit.z, nearest.x, nearest.z);
    for (const b of dropOffs) {
      const d = getDistance(unit.x, unit.z, b.x, b.z);
      if (d < minDist) {
        minDist = d;
        nearest = b;
      }
    }

    const depositRange = Math.max(
      2.6,
      getBuildingCollisionRadius(nearest) + (nearest.buildingType === 'dock' ? 3.6 : 1.85)
    );
    if (minDist > depositRange) {
      this.moveUnitAlongPath(unit, nearest.x, nearest.z, dt);
    } else {
      const resType = unit.carryingResource.type;
      const amount = Math.round(unit.carryingResource.amount);
      unit.carryingResource = undefined;
      unit.waypoints = undefined;

      const resBag = this.getResourcesForFaction(unit.faction);
      resBag[resType] += amount;
      this.syncHumanResourcesAlias();

      if (this.isHumanControlled(unit.faction)) {
        this.stats.resourcesGathered[resType] += amount;
        this.onResourcesChange?.(this.playerResources);
        this.addFloatingText(unit.x, 2.0, unit.z, `+${amount} ${resType.toUpperCase()}`, '#4ade80');
      }

      const hasQueuedFollowUp = !!unit.commandQueue?.length || !!unit.queuedGatherStopAfterDeposit;
      if (hasQueuedFollowUp) {
        unit.targetResourceNodeId = undefined;
        unit.queuedGatherStopAfterDeposit = false;
        if (!this.tryDequeueCommand(unit)) {
          unit.state = 'idle';
          unit.currentActionText = '💤 待命中 (閒置)';
        }
      } else if (unit.targetResourceNodeId) {
        unit.state = 'gathering';
      } else {
        unit.state = 'idle';
        unit.currentActionText = '💤 待命中 (閒置)';
      }
    }
  }


  private stepUnitFieldAssembly(unit: UnitEntity, dt: number) {
    const project = this.fieldSiegeProjects.find(
      (entry) => entry.id === unit.fieldAssemblyProjectId && entry.faction === unit.faction
    );
    if (!project) {
      unit.fieldAssemblyProjectId = undefined;
      unit.state = 'idle';
      unit.currentActionText = '💤 待命中 (組裝中止)';
      return;
    }

    const builderIndex = project.builderUnitIds.indexOf(unit.id);
    const angle = (Math.max(0, builderIndex) / Math.max(1, project.builderUnitIds.length)) * Math.PI * 2;
    const slotX = project.x + Math.cos(angle) * 2.65;
    const slotZ = project.z + Math.sin(angle) * 2.65;
    const distance = getDistance(unit.x, unit.z, slotX, slotZ);
    if (distance > 0.72) {
      this.moveUnitAlongPath(unit, slotX, slotZ, dt);
      unit.currentActionText = '🪵 集結組裝位置 (' + Math.round(project.progress * 100) + '%)';
    } else {
      unit.velocity = { x: 0, z: 0 };
      (unit as any)._desiredYaw = Math.atan2(project.x - unit.x, project.z - unit.z);
      unit.currentActionText = '🪵 組裝野戰衝車 (' + Math.round(project.progress * 100) + '%)';
    }
  }

  private createFieldRamAssemblyVisual(x: number, z: number): { mesh: THREE.Group; progressRing: THREE.Mesh } {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    const timber = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.9 });
    const darkTimber = new THREE.MeshStandardMaterial({ color: 0x422006, roughness: 0.94 });
    const iron = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.38, metalness: 0.78 });

    const chassis = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.28, 1.75), darkTimber);
    chassis.position.y = 0.68;
    chassis.castShadow = true;
    group.add(chassis);
    [-0.72, 0.72].forEach((zOffset) => {
      const sideBeam = new THREE.Mesh(new THREE.BoxGeometry(4.55, 0.24, 0.24), timber);
      sideBeam.position.set(0, 0.86, zOffset);
      sideBeam.castShadow = true;
      group.add(sideBeam);
    });
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(2.85, 0.18, 1.8), timber);
    canopy.position.set(-0.25, 1.72, 0);
    canopy.castShadow = true;
    group.add(canopy);
    [-1.45, 1.2].forEach((xOffset) => {
      const cross = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.0, 1.78), darkTimber);
      cross.position.set(xOffset, 1.22, 0);
      group.add(cross);
    });
    const ram = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 3.65, 10), timber);
    ram.rotation.z = Math.PI / 2;
    ram.position.set(0.35, 1.17, 0);
    ram.castShadow = true;
    group.add(ram);
    const ramHead = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.78, 8), iron);
    ramHead.rotation.z = -Math.PI / 2;
    ramHead.position.set(2.3, 1.17, 0);
    group.add(ramHead);
    [-1.55, 1.55].forEach((xOffset) => {
      [-0.9, 0.9].forEach((zOffset) => {
        const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.09, 7, 14), darkTimber);
        wheel.rotation.y = Math.PI / 2;
        wheel.position.set(xOffset, 0.42, zOffset);
        group.add(wheel);
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.25, 8), iron);
        hub.rotation.z = Math.PI / 2;
        hub.position.copy(wheel.position);
        group.add(hub);
      });
    });

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.45, 2.7, 40),
      new THREE.MeshBasicMaterial({
        color: 0xfbbf24,
        transparent: true,
        opacity: 0.38,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.09;
    group.add(ring);
    this.scene.add(group);
    return { mesh: group, progressRing: ring };
  }

  private disposeFieldSiegeProject(project: FieldSiegeProject) {
    this.scene.remove(project.mesh);
    project.mesh.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry?.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach((material) => material?.dispose());
    });
  }

  private cancelFieldSiegeProject(project: FieldSiegeProject, refundRatio = 0.5) {
    const projectBuilders = project.builderUnitIds
      .map((id) => this.units.find((unit) => unit.id === id))
      .filter((unit): unit is UnitEntity => !!unit && unit.hp > 0);
    const activeBuilders = projectBuilders.filter(
      (unit) => unit.state === 'assembling' && unit.fieldAssemblyProjectId === project.id
    );
    projectBuilders.forEach((unit) => {
      if (unit.fieldAssemblyProjectId === project.id) unit.fieldAssemblyProjectId = undefined;
    });
    activeBuilders.forEach((unit) => {
      unit.state = 'idle';
      unit.waypoints = undefined;
      unit.pathGoal = undefined;
      unit.velocity = { x: 0, z: 0 };
      unit.currentActionText = '💤 野戰組裝中止';
    });
    if (projectBuilders.length > 0 && refundRatio > 0) {
      const resources = this.getResourcesForFaction(project.faction);
      this.resourcesByFaction[project.faction] = addResources(resources, {
        wood: Math.floor(FIELD_RAM_COST.wood * refundRatio),
        gold: Math.floor(FIELD_RAM_COST.gold * refundRatio),
      });
      this.syncHumanResourcesAlias();
      if (this.isHumanControlled(project.faction)) this.onResourcesChange?.(this.playerResources);
    }
    this.disposeFieldSiegeProject(project);
    this.fieldSiegeProjects = this.fieldSiegeProjects.filter((entry) => entry.id !== project.id);
    if (this.isHumanControlled(project.faction)) {
      this.addFloatingText(project.x, 2.4, project.z, '⚠️ 步兵不足，野戰衝車組裝中止', '#f59e0b');
      this.onSelectionChange?.();
    }
  }

  private updateFieldSiegeProjects(dt: number) {
    for (let i = this.fieldSiegeProjects.length - 1; i >= 0; i--) {
      const project = this.fieldSiegeProjects[i];
      const builders = project.builderUnitIds
        .map((id) => this.units.find((unit) => unit.id === id))
        .filter(
          (unit): unit is UnitEntity =>
            !!unit &&
            unit.hp > 0 &&
            unit.state === 'assembling' &&
            unit.fieldAssemblyProjectId === project.id
        );
      if (builders.length < 3) {
        this.cancelFieldSiegeProject(project, builders.length > 0 ? 0.5 : 0);
        continue;
      }

      const readyBuilders = builders.filter((unit) => getDistance(unit.x, unit.z, project.x, project.z) <= 4.1);
      if (readyBuilders.length >= 3) {
        project.progress = Math.min(1, project.progress + (dt * readyBuilders.length) / (4 * project.duration));
      }
      const pct = Math.round(project.progress * 100);
      project.progressRing.scale.setScalar(0.9 + project.progress * 0.3);
      (project.progressRing.material as THREE.MeshBasicMaterial).opacity = 0.28 + project.progress * 0.58;
      builders.forEach((unit) => {
        unit.currentActionText = readyBuilders.includes(unit)
          ? '🪵 組裝野戰衝車 (' + pct + '%)'
          : '🪵 集結組裝位置 (' + pct + '%)';
      });

      if (project.progress < 1) continue;
      const ramDef = this.findUnitDef('battering_ram', project.faction);
      if (!ramDef) {
        this.cancelFieldSiegeProject(project, 1);
        continue;
      }

      const completedBuilders = builders.slice();
      project.builderUnitIds.forEach((id) => {
        const unit = this.units.find((entry) => entry.id === id);
        if (unit && unit.fieldAssemblyProjectId === project.id) unit.fieldAssemblyProjectId = undefined;
      });
      completedBuilders.forEach((unit) => {
        unit.fieldAssemblyProjectId = undefined;
        unit.state = 'idle';
        unit.waypoints = undefined;
        unit.pathGoal = undefined;
        unit.velocity = { x: 0, z: 0 };
        unit.currentActionText = '🛡️ 衝車護衛';
      });
      this.disposeFieldSiegeProject(project);
      this.fieldSiegeProjects.splice(i, 1);
      const ram = this.addUnit(ramDef, project.faction, project.x, project.z);
      if (this.isHumanControlled(project.faction)) {
        this.selectedUnitIds = Array.from(new Set([...this.selectedUnitIds, ...completedBuilders.map((unit) => unit.id), ram.id]));
        sound.playConstruct(this.getSpatialAudioScale(project.x, project.z));
        this.addFloatingText(project.x, 3.0, project.z, '🛡️ 野戰衝車組裝完成！', '#fbbf24');
        this.onResourcesChange?.(this.playerResources);
        this.onSelectionChange?.();
      }
      const aliveIds = new Set(this.units.filter((unit) => unit.hp > 0).map((unit) => unit.id));
      this.controlGroups = pruneControlGroups(this.controlGroups, aliveIds);
    }
  }

  private beginFieldRamAssembly(faction: FactionId, selected: UnitEntity[], showFeedback: boolean): boolean {
    const fail = (message: string) => {
      if (showFeedback) {
        sound.playInvalid();
        this.addFloatingText(this.cameraTarget.x, 2.5, this.cameraTarget.z, message, '#f59e0b');
      }
      return false;
    };
    const age = this.ageByFaction[faction] || 1;
    const builders = selected
      .filter(
        (unit) =>
          unit.hp > 0 &&
          unit.faction === faction &&
          unit.unitDef.category === 'melee' &&
          !unit.garrisonedInBuildingId &&
          (unit.state === 'idle' || unit.state === 'moving')
      )
      .slice(0, 4);
    const resources = this.getResourcesForFaction(faction);
    const assemblyCheck = canAssembleFieldRam(age, this.getResearchedTechs(faction), builders.length, resources);
    if (!assemblyCheck.ok) return fail(assemblyCheck.reason || '⚠️ 目前無法組裝野戰衝車');
    if (this.fieldSiegeProjects.some((project) => project.faction === faction)) {
      return fail('🪵 這支軍團已有一輛衝車正在組裝');
    }
    if (!this.findUnitDef('battering_ram', faction)) return fail('⚠️ 此文明目前沒有可用的基礎衝車設計');
    const x = Math.max(-78, Math.min(78, builders.reduce((sum, unit) => sum + unit.x, 0) / builders.length));
    const z = Math.max(-78, Math.min(78, builders.reduce((sum, unit) => sum + unit.z, 0) / builders.length));
    const visual = this.createFieldRamAssemblyVisual(x, z);
    const project: FieldSiegeProject = {
      id: 'field_ram_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      faction,
      x,
      z,
      progress: 0,
      duration: FIELD_RAM_ASSEMBLY_DURATION,
      builderUnitIds: builders.map((unit) => unit.id),
      mesh: visual.mesh,
      progressRing: visual.progressRing,
    };
    this.resourcesByFaction[faction] = deductCost(resources, FIELD_RAM_COST);
    this.syncHumanResourcesAlias();
    this.fieldSiegeProjects.push(project);
    builders.forEach((unit) => {
      unit.commandQueue = undefined;
      unit.queuedGatherStopAfterDeposit = false;
      unit.state = 'assembling';
      unit.fieldAssemblyProjectId = project.id;
      unit.targetBuildingId = undefined;
      unit.targetResourceNodeId = undefined;
      unit.targetEntityId = undefined;
      unit.attackMoveGoal = null;
      unit.waypoints = undefined;
      unit.pathGoal = undefined;
      unit.currentActionText = '🪵 前往組裝野戰衝車';
    });
    if (showFeedback) {
      sound.playConstruct();
      this.spawnCommandIndicator(x, z, 'build');
      this.addFloatingText(x, 2.6, z, '🪵 步兵開始組裝野戰衝車', '#fbbf24');
      this.onResourcesChange?.(this.playerResources);
      this.onSelectionChange?.();
    }
    return true;
  }

  public hasActiveFieldRamAssembly(faction: FactionId = this.humanPlayerId): boolean {
    return this.fieldSiegeProjects.some((project) => project.faction === faction);
  }

  public startFieldRamAssembly(): boolean {
    const selected = this.selectedUnitIds
      .map((id) => this.units.find((unit) => unit.id === id))
      .filter((unit): unit is UnitEntity => !!unit && this.isHumanControlled(unit.faction));
    return this.beginFieldRamAssembly(this.humanPlayerId, selected, true);
  }

  private stepUnitBuilding(unit: UnitEntity, dt: number) {
    if (!unit.targetBuildingId) {
      if (!this.tryDequeueCommand(unit)) {
        unit.state = 'idle';
        unit.currentActionText = '💤 待命中 (閒置)';
      }
      return;
    }

    const bldg = this.buildings.find((b) => b.id === unit.targetBuildingId);
    const repairingWall = !!bldg?.wallBreached && !!bldg.buildingDef.isWall && bldg.isConstructed;
    const repairingStructure = !!bldg && bldg.isConstructed && !repairingWall && bldg.hp < bldg.maxHp;
    if (!bldg || bldg.hp <= 0 || (bldg.isConstructed && !repairingWall && !repairingStructure)) {
      unit.buildApproachBuildingId = undefined;
      unit.buildApproachIndex = undefined;
      unit.buildApproachRetryAt = undefined;
      unit.buildApproachRecoveryCount = undefined;
      unit.buildApproachAngle = undefined;
      unit.targetBuildingId = undefined;
      unit.waypoints = undefined;
      if (!this.tryDequeueCommand(unit)) { unit.state = 'idle'; unit.currentActionText = '💤 待命中 (閒置)'; }
      return;
    }

    const pct = Math.round((bldg.hp / Math.max(1, bldg.maxHp)) * 100);
    unit.currentActionText = repairingWall
      ? `🧱 修復城牆 (${pct}%)`
      : repairingStructure
        ? `🔧 修復${bldg.buildingDef.name.split(' ')[0]} (${pct}%)`
        : `🔨 建造${bldg.buildingDef.name.split(' ')[0]} (${Math.round(bldg.buildProgress * 100)}%)`;

    // Keep a stable approach slot for the active foundation. Recomputing the angle
    // from the worker's moving position every tick caused the destination to orbit
    // around the wall and made blocked multi-segment routes look like idle villagers.
    const bldgRad = Math.max(getBuildingCollisionRadius(bldg), repairingWall ? bldg.buildingDef.size : 0);
    const workRingRad = bldgRad + 0.95;
    const distToCenter = getDistance(unit.x, unit.z, bldg.x, bldg.z);
    const buildReach = Math.max(2.2, bldgRad + 1.55);

    if (distToCenter > buildReach) {
      if (unit.buildApproachBuildingId !== bldg.id) {
        unit.buildApproachBuildingId = bldg.id;
        unit.buildApproachIndex = 0;
        unit.buildApproachAngle = Math.atan2(unit.z - bldg.z, unit.x - bldg.x);
        unit.buildApproachRetryAt = undefined;
        unit.buildApproachRecoveryCount = unit.pathRecoveryCount || 0;
        unit.waypoints = undefined;
        unit.pathGoal = undefined;
        unit.pathCooldown = 0;
      }

      const advanceApproach = () => {
        const nextIndex = ((unit.buildApproachIndex || 0) + 1) % BUILD_APPROACH_CANDIDATE_COUNT;
        unit.buildApproachIndex = nextIndex;
        unit.waypoints = undefined;
        unit.pathGoal = undefined;
        unit.pathCooldown = 0;
        if (nextIndex === 0) {
          unit.buildApproachRetryAt = this.simTime + BUILD_APPROACH_RETRY_DELAY_SECONDS;
        }
      };

      // A route that stayed empty through its retry cooldown was unreachable.
      // Move to another side rather than retrying the same blocked point forever.
      const pathFailed =
        !!unit.pathGoal &&
        !!unit.waypoints &&
        unit.waypoints.length === 0 &&
        (!unit.pathCooldown || unit.pathCooldown <= 0);
      const recoveryCount = unit.pathRecoveryCount || 0;
      if (recoveryCount > (unit.buildApproachRecoveryCount || 0)) {
        unit.buildApproachRecoveryCount = recoveryCount;
        advanceApproach();
      } else if (pathFailed) {
        advanceApproach();
      }

      if (unit.buildApproachRetryAt && this.simTime < unit.buildApproachRetryAt) {
        unit.velocity = { x: 0, z: 0 };
        unit.currentActionText = '🧭 尋找可施工位置';
        return;
      }
      unit.buildApproachRetryAt = undefined;

      const approach = getConstructionApproachPoint(
        { x: bldg.x, z: bldg.z },
        Math.min(workRingRad, buildReach - 0.25),
        unit.buildApproachAngle ?? 0,
        unit.buildApproachIndex ?? 0,
      );
      this.moveUnitAlongPath(unit, approach.x, approach.z, dt);
      if (!unit.waypoints?.length) {
        unit.currentActionText = '🧭 尋找可施工位置';
      } else {
        unit.currentActionText = '🔨 前往施工位置';
      }
      return;
    }

    // Reached a valid construction ring; do not carry a stale candidate into
    // the next wall segment or repair target.
    unit.buildApproachBuildingId = undefined;
    unit.buildApproachIndex = undefined;
    unit.buildApproachRetryAt = undefined;
    unit.buildApproachRecoveryCount = undefined;
    unit.buildApproachAngle = undefined;
    {
      unit.velocity = { x: 0, z: 0 };
      (unit as any)._desiredYaw = Math.atan2(bldg.x - unit.x, bldg.z - unit.z);
      const constructionSpeedMultiplier = getCappedProductionSpeedMultiplier(
        getCivilizationBuildSpeedMultiplier(this.getCivilizationForFaction(bldg.faction), this.activeMods)
      );
      const activeBuilderCount = this.units.filter(
        (worker) =>
          worker.hp > 0 &&
          worker.faction === bldg.faction &&
          worker.state === 'building' &&
          worker.targetBuildingId === bldg.id &&
          !worker.garrisonedInBuildingId &&
          getDistance(worker.x, worker.z, bldg.x, bldg.z) <= buildReach
      ).length;
      const builderCount = Math.max(1, activeBuilderCount);
      const perBuilderWorkShare =
        getConstructionWorkerMultiplier(builderCount) / builderCount;
      if (repairingWall || repairingStructure) {
        const repairSpeed =
          (bldg.maxHp / (bldg.buildingDef.buildTime * 0.65)) *
          (constructionSpeedMultiplier / PRODUCTION_TIME_SCALE) *
          perBuilderWorkShare;
        bldg.hp = Math.min(bldg.maxHp, bldg.hp + repairSpeed * dt);
      } else {
        const buildSpeed =
          (constructionSpeedMultiplier * perBuilderWorkShare) /
          (bldg.buildingDef.buildTime * PRODUCTION_TIME_SCALE);
        bldg.buildProgress += buildSpeed * dt;
        bldg.hp = Math.round(bldg.maxHp * Math.min(1, bldg.buildProgress));
      }

      // Advance unified carpenter hammer cycle and trigger impact FX cleanly at downstroke contact
      const prevPhase = (unit as any)._hammerPhase || 0;
      const nextPhase = prevPhase + dt * 9.8;
      (unit as any)._hammerPhase = nextPhase;
      const prevCycle = Math.floor((prevPhase + Math.PI * 0.95) / (Math.PI * 2));
      const nextCycle = Math.floor((nextPhase + Math.PI * 0.95) / (Math.PI * 2));
      if (nextCycle > prevCycle) {
        const wallContactX = bldg.x + (unit.x - bldg.x) * Math.min(0.85, bldgRad / Math.max(0.5, distToCenter));
        const wallContactZ = bldg.z + (unit.z - bldg.z) * Math.min(0.85, bldgRad / Math.max(0.5, distToCenter));
        const workHeight = 0.55 + bldg.buildProgress * 1.45;
        this.spawnParticleBurst(wallContactX, workHeight, wallContactZ, 'dust', 3);
        this.spawnParticleBurst(wallContactX, workHeight + 0.12, wallContactZ, 'gold', 1);
        (bldg as any)._constructImpulse = 1.0;
        sound.playHammerBuild(this.getSpatialAudioScale(bldg.x, bldg.z));
      }

      if (repairingWall && bldg.hp >= bldg.maxHp) {
        bldg.hp = bldg.maxHp;
        bldg.wallBreached = false;
        bldg.wallRepairPaid = false;
        bldg.gateOpen = false;
        bldg.buildProgress = 1;
        this.navGridDirty = true;
        this.waterNavGridDirty = true;
        const repairMesh = this.buildingMeshes.get(bldg.id);
        if (repairMesh) {
          if (bldg.buildingType === 'gate') updateGateDoorAnimation(repairMesh, false, 1.0);
          else applyWallBreachVisuals(repairMesh, false);
        }
        this.refreshWallTowerConnections();
        this.spawnParticleBurst(bldg.x, 1.2, bldg.z, 'stone', 8);
        this.spawnParticleBurst(bldg.x, 1.4, bldg.z, 'gold', 6);
        this.addFloatingText(bldg.x, 2.7, bldg.z, '🧱 城牆缺口已修復 · 防線恢復', '#86efac');
        unit.targetBuildingId = undefined;
        unit.buildApproachBuildingId = undefined;
        unit.buildApproachIndex = undefined;
        unit.buildApproachRetryAt = undefined;
        unit.buildApproachRecoveryCount = undefined;
        unit.buildApproachAngle = undefined;
        if (!this.tryDequeueCommand(unit)) { unit.state = 'idle'; unit.currentActionText = '💤 修復完成'; }
        return;
      }

      if (repairingStructure && bldg.hp >= bldg.maxHp) {
        bldg.hp = bldg.maxHp;
        bldg.hitFlashTimer = 0;
        unit.targetBuildingId = undefined;
        unit.buildApproachBuildingId = undefined;
        unit.buildApproachIndex = undefined;
        unit.buildApproachRetryAt = undefined;
        unit.buildApproachRecoveryCount = undefined;
        unit.buildApproachAngle = undefined;
        this.addFloatingText(bldg.x, 2.6, bldg.z, `🔧 ${bldg.buildingDef.name.split(' ')[0]}修復完成`, '#86efac');
        if (!this.tryDequeueCommand(unit)) {
          unit.state = 'idle';
          unit.currentActionText = '💤 修復完成';
        }
        return;
      }

      if (!repairingWall && !repairingStructure && bldg.buildProgress >= 1) {
        bldg.isConstructed = true;
        bldg.buildProgress = 1;
        bldg.hp = bldg.maxHp;
        (bldg as any)._constructImpulse = 1.35;
        const mesh = this.buildingMeshes.get(bldg.id);
        if (mesh) {
          removeBuildingScaffoldFromRoot(mesh);
          applyBuildingConstructionVisuals(
            mesh,
            computeBuildingVisualState(true, 1, bldg.hp, bldg.maxHp),
            this.simTime,
            1.35
          );
        }
        sound.playConstruct(this.getSpatialAudioScale(bldg.x, bldg.z));
        this.spawnParticleBurst(bldg.x, 1.4, bldg.z, 'gold', 10);
        this.spawnParticleBurst(bldg.x, 1.1, bldg.z, 'dust', 10);
        this.spawnShockwaveRing(bldg.x, bldg.z, 0xfbbf24, bldg.buildingDef.size + 1.4);
        this.navGridDirty = true;
        this.waterNavGridDirty = true;
        this.refreshWallTowerConnections();
        if (this.isHumanControlled(bldg.faction)) this.stats.buildingsConstructed++;
        if (this.selectedBuildingId === bldg.id) this.onSelectionChange?.();
        unit.targetBuildingId = undefined;
        unit.buildApproachBuildingId = undefined;
        unit.buildApproachIndex = undefined;
        unit.buildApproachRetryAt = undefined;
        unit.buildApproachRecoveryCount = undefined;
        unit.buildApproachAngle = undefined;

        const factionCiv = getCivilizationConfig(this.getCivilizationForFaction(bldg.faction));
        if (bldg.buildingType === factionCiv.uniqueBuildingType) {
          this.refreshFactionUnitStats(bldg.faction);
        }

        if (bldg.buildingDef.landmarkAgeAdvance) {
          this.advanceAge(bldg.faction, bldg.buildingType as LandmarkType);
        }

        // Finish the next queued construction before returning to automatic gathering.
        if (this.tryDequeueCommand(unit)) return;

        if (bldg.buildingType === 'farm') {
          const farmNode = this.getOrCreateFarmFoodNode(bldg)!;
          unit.targetResourceNodeId = farmNode.id;
          unit.state = 'gathering';
          unit.currentActionText = '🌾 採集農田作物';
          this.addFloatingText(unit.x, 2.2, unit.z, '🌾 開始耕作採集', '#facc15');
        } else if (bldg.buildingType === 'lumber_camp') {
          const woodNode = findClosestResourceNode(bldg.x, bldg.z, this.resourceNodes, 'wood');
          if (woodNode) {
            unit.targetResourceNodeId = woodNode.id;
            unit.state = 'gathering';
            unit.currentActionText = '🪵 前往採集木材';
            this.addFloatingText(unit.x, 2.2, unit.z, '🪵 自動前往伐木', '#4ade80');
          } else {
            unit.state = 'idle';
            unit.currentActionText = '💤 待命中 (閒置)';
          }
        } else if (bldg.buildingType === 'mining_camp') {
          const mineNode =
            findClosestResourceNode(bldg.x, bldg.z, this.resourceNodes, 'gold') ||
            findClosestResourceNode(bldg.x, bldg.z, this.resourceNodes, 'stone');
          if (mineNode) {
            unit.targetResourceNodeId = mineNode.id;
            unit.state = 'gathering';
            const mName = mineNode.resourceType === 'gold' ? '黃金' : '石料';
            unit.currentActionText = `⛏️ 前往開採${mName}`;
            this.addFloatingText(unit.x, 2.2, unit.z, `⛏️ 自動前往採礦`, '#fbbf24');
          } else {
            unit.state = 'idle';
            unit.currentActionText = '💤 待命中 (閒置)';
          }
        } else if (bldg.buildingType === 'dock') {
          const landNodes = this.resourceNodes.filter((n) => n.subtype !== 'deep_fish');
          const nearbyLand = findClosestResourceNode(bldg.x, bldg.z, landNodes);
          if (nearbyLand && getDistance(bldg.x, bldg.z, nearbyLand.x, nearbyLand.z) < 22) {
            unit.targetResourceNodeId = nearbyLand.id;
            unit.state = 'gathering';
            unit.currentActionText = '⛏️ 自動採集資源';
          } else {
            unit.state = 'idle';
            unit.currentActionText = '⚓ 碼頭竣工待命';
          }
        } else {
          const landNodes = this.resourceNodes.filter((n) => n.subtype !== 'deep_fish');
          const nearbyRes = findClosestResourceNode(bldg.x, bldg.z, landNodes);
          if (nearbyRes && getDistance(bldg.x, bldg.z, nearbyRes.x, nearbyRes.z) < 18) {
            unit.targetResourceNodeId = nearbyRes.id;
            unit.state = 'gathering';
            unit.currentActionText = '⛏️ 自動採集資源';
          } else {
            unit.state = 'idle';
            unit.currentActionText = '💤 待命中 (閒置)';
          }
        }
      }
    }
  }

  private stepUnitGarrisoning(unit: UnitEntity, dt: number) {
    if (!unit.targetGarrisonBuildingId) {
      if (!this.tryDequeueCommand(unit)) {
        unit.state = 'idle';
        unit.currentActionText = '💤 待命中 (閒置)';
      }
      return;
    }

    const bldg = this.buildings.find((b) => b.id === unit.targetGarrisonBuildingId);
    if (!bldg || bldg.hp <= 0 || !bldg.isConstructed || bldg.faction !== unit.faction) {
      unit.targetGarrisonBuildingId = undefined;
      unit.waypoints = undefined;
      unit.pathGoal = undefined;
      unit.pathCooldown = 0;
      if (!this.tryDequeueCommand(unit)) {
        unit.state = 'idle';
        unit.currentActionText = '💤 待命中 (閒置)';
      }
      return;
    }

    const maxCap = getBuildingMaxGarrison(bldg);
    const curCount = bldg.garrisonedUnitIds?.length || 0;
    const pendingOther = countPendingGarrisonReservations(
      bldg.id,
      bldg.faction,
      this.units,
      new Set([unit.id])
    );
    if (getAvailableGarrisonSlots(maxCap, curCount, pendingOther) <= 0) {
      unit.targetGarrisonBuildingId = undefined;
      unit.waypoints = undefined;
      unit.pathGoal = undefined;
      unit.pathCooldown = 0;
      if (!this.tryDequeueCommand(unit)) {
        unit.state = 'idle';
        unit.currentActionText = '🛡️ 駐防已滿待命';
      }
      return;
    }

    const bName = bldg.buildingDef.name.split(' ')[0];
    unit.currentActionText = `🛡️ 前往進駐${bName}`;

    const dist = getDistance(unit.x, unit.z, bldg.x, bldg.z);
    const uRadius = getUnitColliderRadius(unit.unitDef.category, unit.unitDef.visual.scale);
    const enterDist = Math.max(2.6, getBuildingCollisionRadius(bldg) + uRadius + 1.35);

    if (dist > enterDist) {
      this.moveUnitAlongPath(unit, bldg.x, bldg.z, dt);
      return;
    }

    // Complete Garrison entry!
    if (!bldg.garrisonedUnitIds) bldg.garrisonedUnitIds = [];
    if (!bldg.garrisonedUnitIds.includes(unit.id)) {
      bldg.garrisonedUnitIds.push(unit.id);
    }
    unit.garrisonedInBuildingId = bldg.id;
    unit.targetGarrisonBuildingId = undefined;
    unit.waypoints = undefined;
    unit.pathGoal = undefined;
    unit.velocity = { x: 0, z: 0 };
    unit.x = bldg.x;
    unit.z = bldg.z;
    unit.state = 'idle';
    unit.currentActionText = `🛡️ 駐守於${bName}`;

    const mesh = this.unitMeshes.get(unit.id);
    if (mesh) mesh.visible = false;

    if (this.selectedUnitIds.includes(unit.id)) {
      this.selectedUnitIds = this.selectedUnitIds.filter((id) => id !== unit.id);
      if (this.selectedUnitIds.length === 0 && !this.selectedBuildingId && this.isHumanControlled(bldg.faction)) {
        this.selectedBuildingId = bldg.id;
      }
    }

    if (this.isHumanControlled(unit.faction)) {
      sound.playGarrison();
      this.addFloatingText(bldg.x, 3.1, bldg.z, `🛡️ 進駐成功 (${bldg.garrisonedUnitIds.length}/${maxCap})`, '#38bdf8');
    }
    this.onSelectionChange?.();
  }



  private factionHasSiegeSupply(faction: FactionId): boolean {
    return this.contestedPoints.some(
      (p) => p.ownerFaction === faction && p.siegeSupplyActive
    );
  }

  /**
   * Greek-fire siphon: cone splash in front of the attacker toward the primary building.
   * Instant burst only — no residual burn DoT on structures or units.
   */
  private applyGreekFireCone(attacker: UnitEntity, primary: BuildingEntity): number {
    const dx = primary.x - attacker.x;
    const dz = primary.z - attacker.z;
    const len = Math.hypot(dx, dz) || 1;
    const fx = dx / len;
    const fz = dz / len;
    const range = 6.5;
    const cosHalf = Math.cos((42 * Math.PI) / 180); // ~84° cone
    let bonus = 0;

    for (const b of this.buildings) {
      if (b.hp <= 0 || b.id === primary.id) continue;
      if (!this.isHostile(attacker, b)) continue;
      const bx = b.x - attacker.x;
      const bz = b.z - attacker.z;
      const bd = Math.hypot(bx, bz);
      if (bd > range || bd < 0.2) continue;
      const dot = (bx / bd) * fx + (bz / bd) * fz;
      if (dot < cosHalf) continue;
      const splash = Math.max(3, Math.round(12 * dot * (1 - bd / range)));
      b.hp -= splash;
      b.hitFlashTimer = 0.1;
      b.lastAttackerFaction = attacker.faction;
      bonus += Math.round(splash * 0.15);
      this.spawnParticleBurst(b.x, 1.4, b.z, 'ember', 5);
    }

    for (const u of this.units) {
      if (u.hp <= 0 || u.garrisonedInBuildingId) continue;
      if (!this.isHostile(attacker, u)) continue;
      const ux = u.x - attacker.x;
      const uz = u.z - attacker.z;
      const ud = Math.hypot(ux, uz);
      if (ud > range * 0.9 || ud < 0.2) continue;
      const dot = (ux / ud) * fx + (uz / ud) * fz;
      if (dot < cosHalf) continue;
      const splash = Math.max(2, Math.round(9 * dot * (1 - ud / range)));
      u.hp -= splash;
      u.hitFlashTimer = 0.1;
      u.recoilTimer = 0.12;
      this.spawnParticleBurst(u.x, 1.1, u.z, 'ember', 4);
      this.addFloatingText(u.x, 2.1, u.z, `-${splash}`, '#fb923c');
    }

    // Dramatic forward spray VFX
    for (let i = 1; i <= 4; i++) {
      const px = attacker.x + fx * (i * 1.3);
      const pz = attacker.z + fz * (i * 1.3);
      this.spawnParticleBurst(px, 1.0 + i * 0.15, pz, 'ember', 3);
      this.spawnParticleBurst(px, 1.2 + i * 0.1, pz, 'spark', 2);
    }
    return bonus;
  }


  /**
   * Living 山羌: obstacle-aware panic flee + calm graze cooldown + articulated quadrupedal gait.
   * Locomotion bounce & limb swing are driven strictly by post-clamp horizontal displacement so
   * blocked or cooling-down deer never hop in place.
   */
  /**
   * Wildlife state machines:
   * - 山羌 flee once per encounter and re-arm only after the threat disengages.
   * - 野豬 remain calm until hit, then charge and retaliate against their attacker.
   */
  private updateWildlifeOverheadBadge(node: ResourceNode, mesh: THREE.Group): void {
    const presentation = getWildlifeBadgePresentation(node);
    if (!presentation || (node as any)._wildlifeBadgeSignature === presentation.signature) return;

    (node as any)._wildlifeBadgeSignature = presentation.signature;
    const badge = (mesh.userData.badgeSprite as THREE.Sprite | undefined) ||
      (mesh.getObjectByName('badgeSprite') as THREE.Sprite | undefined);
    if (badge) {
      badge.visible = this.showOverheadBadges;
      updateBadgeSprite(
        badge,
        presentation.title,
        presentation.icon,
        presentation.valueText,
        presentation.ratio,
        false,
        false,
        presentation.actionText,
      );
    }

    // Keep the selected wildlife inspector's HP bar in sync without forcing a React update every frame.
    if (this.selectedNodeId === node.id) this.onSelectionChange?.();
  }

  private updateWildAnimals(dt: number) {
    const DETECT = 18;
    let deerIdx = 0;
    const isAnimalBlocked = (cx: number, cz: number): boolean => {
      if (Math.abs(cx) > 91 || Math.abs(cz) > 91) return true;
      if (this.mapLayout) {
        if (isPointInTerrainObstacle(cx, cz, this.mapLayout.waterRects, this.mapLayout.waterDiscs, this.mapLayout.bridges)) return true;
        for (const c of this.mapLayout.cliffDiscs) {
          if (Math.hypot(cx - c.x, cz - c.z) <= c.radius + 0.75) return true;
        }
      }
      for (const b of this.buildings) {
        if (b.hp <= 0) continue;
        const br = getBuildingCollisionRadius(b);
        if (br > 0 && Math.hypot(cx - b.x, cz - b.z) <= br + 0.7) return true;
      }
      return false;
    };

    const killAnimal = (node: ResourceNode, mesh: THREE.Group | undefined, label: string) => {
      node.animalAlive = false;
      node.animalHp = 0;
      node.animalVx = 0;
      node.animalVz = 0;
      node.animalFleeUntil = 0;
      node.animalMoveBlend = 0;
      node.animalAggroTargetId = undefined;
      node.animalAggroUntil = 0;
      node.animalAttackCooldown = 0;
      if (mesh) {
        mesh.position.y = 0;
        mesh.rotation.x = 0.55;
      }
      this.addFloatingText(node.x, 1.8, node.z, label, '#fca5a5');
    };

    for (const node of this.resourceNodes) {
      const isBoar = node.subtype === 'boar';
      if ((!isBoar && node.subtype !== 'hunt') || node.amount <= 0) continue;
      const mesh = this.nodeMeshes.get(node.id);
      const maxHp = isBoar ? 200 : 32;
      if (isBoar) {
        // Preserve the initial map position as the habitat anchor even after the boar moves.
        node.animalHomeX ??= node.x;
        node.animalHomeZ ??= node.z;
      }
      // Health may already be initialized at spawn; movement state still needs its own initialization.
      const wildlifeIndex = node.animalYaw === undefined ? this.resourceNodes.indexOf(node) : 0;
      initializeWildlifeSimulationState(node, wildlifeIndex, maxHp);
      if (mesh) this.updateWildlifeOverheadBadge(node, mesh);

      if (!node.animalAlive) {
        if (mesh) {
          if (isBoar) {
            mesh.position.set(node.x, 0, node.z);
            mesh.rotation.x = 0.55;
            const parts = mesh.userData.wildBoarAnimParts as WildBoarAnimParts | undefined;
            if (parts) {
              parts.bodyPivot.position.y = 0.58;
              parts.headPivot.rotation.z = -0.32;
            }
          } else {
            updateDeerAssetAnimation(mesh, 'death', dt);
            mesh.position.set(node.x, 0, node.z);
            mesh.rotation.x = 0.55;
            const parts = mesh.userData.deerAnimParts as DeerAnimParts | undefined;
            if (parts) {
              parts.bodyPivot.position.y = 0.7;
              parts.bodyPivot.rotation.z = 0;
              parts.flLeg.rotation.z = -0.3;
              parts.frLeg.rotation.z = -0.15;
              parts.blLeg.rotation.z = 0.25;
              parts.brLeg.rotation.z = 0.15;
            }
          }
        }
        continue;
      }

      if (isBoar) {
        // All deliberate hunters (workers and military) deal damage through
        // stepUnitGathering after receiving this node's explicit gather order.
        // Do not let unrelated attack-move units wound wildlife just by passing nearby.

        const target = (node.animalAggroUntil || 0) > this.simTime
          ? selectWildBoarAggroTarget(node.animalAggroTargetId, node.x, node.z, this.units, node.id)
          : null;
        if (!target) {
          node.animalAggroTargetId = undefined;
          node.animalAggroUntil = 0;
        } else {
          node.animalAggroTargetId = target.id;
        }
        const step = stepWildBoarState(
          node,
          target ? { x: target.x, z: target.z } : null,
          dt,
          isAnimalBlocked,
          { x: node.animalHomeX ?? node.x, z: node.animalHomeZ ?? node.z },
        );

        if (mesh) {
          mesh.position.set(node.x, 0, node.z);
          mesh.rotation.y = step.yaw;
          mesh.rotation.x = 0;
          const parts = mesh.userData.wildBoarAnimParts as WildBoarAnimParts | undefined;
          if (parts) {
            const moving = step.actualSpeed > 0.28;
            const phase = this.simTime * (moving ? 12.5 : 1.7);
            const stride = moving ? Math.sin(phase) * 0.58 : 0;
            parts.flLeg.rotation.z = stride;
            parts.brLeg.rotation.z = stride * 0.92;
            parts.frLeg.rotation.z = -stride;
            parts.blLeg.rotation.z = -stride * 0.92;
            const bob = moving ? Math.abs(Math.sin(phase * 2)) * 0.025 : Math.sin(phase) * 0.012;
            parts.bodyPivot.position.y += (0.72 + bob - parts.bodyPivot.position.y) * Math.min(1, dt * 9);
            const headTilt = step.isCharging ? -0.13 : step.isReturning ? 0.075 : Math.sin(this.simTime * 1.4) * 0.025;
            parts.headPivot.rotation.z += (headTilt - parts.headPivot.rotation.z) * Math.min(1, dt * 7);
            parts.tailPivot.rotation.y = Math.sin(this.simTime * 4.4) * 0.26;
          }
        }

        if (target && getDistance(node.x, node.z, target.x, target.z) <= 2.4 &&
          (node.animalAttackCooldown || 0) <= this.simTime) {
          const rawDamage = target.unitDef.category === 'worker' ? 22 : 15;
          const damage = calculateDamage(rawDamage, target.unitDef.stats.defense);
          target.hp = Math.max(0, target.hp - damage);
          target.lastDamagedTime = performance.now();
          target.hitFlashTimer = 0.13;
          target.recoilTimer = 0.2;
          node.animalAttackCooldown = this.simTime + 1.25;
          this.spawnParticleBurst(target.x, 1.05, target.z, 'hit', 5);
          this.addFloatingText(target.x, 2.0, target.z, `-${damage} 野豬衝撞`, '#fb923c');
        }
        continue;
      }

      deerIdx++;
      let nearest: { x: number; z: number; d: number } | null = null;
      for (const unit of this.units) {
        if (unit.hp <= 0 || unit.garrisonedInBuildingId || unit.unitDef.isNaval) continue;
        const d = getDistance(node.x, node.z, unit.x, unit.z);
        if (d < DETECT && (!nearest || d < nearest.d)) nearest = { x: unit.x, z: unit.z, d };
      }
      const step = stepWildAnimalState(node, nearest, this.simTime, dt, isAnimalBlocked);

      if (mesh) {
        const animationState = step.moveBlend > 0.02
          ? (step.actualSpeed >= 2.2 ? 'gallop' : 'walk')
          : (step.isGrazing ? 'graze' : 'idle');
        updateDeerAssetAnimation(mesh, animationState, dt);
        mesh.position.set(node.x, step.hopY, node.z);
        mesh.rotation.y = step.yaw;
        mesh.rotation.x = 0;
        const parts = mesh.userData.deerAnimParts as DeerAnimParts | undefined;
        if (parts) {
          const blend = step.moveBlend;
          const isFast = step.actualSpeed >= 2.2;
          const phase = step.gaitPhase;
          if (blend > 0.02) {
            if (isFast) {
              const frontSwing = Math.sin(phase) * 0.78 * blend;
              const rearSwing = Math.sin(phase + 0.85) * 0.74 * blend;
              parts.flLeg.rotation.z = frontSwing;
              parts.frLeg.rotation.z = frontSwing * 0.88 + 0.08 * blend;
              parts.blLeg.rotation.z = rearSwing;
              parts.brLeg.rotation.z = rearSwing * 0.88 - 0.08 * blend;
              parts.bodyPivot.rotation.z = Math.cos(phase) * 0.11 * blend;
              parts.tailPivot.rotation.z = (0.48 + Math.sin(phase * 2) * 0.14) * blend;
              parts.headPivot.rotation.z = 0.08 + Math.sin(phase) * 0.08 * blend;
            } else {
              const swing = Math.sin(phase) * 0.45 * blend;
              parts.flLeg.rotation.z = swing;
              parts.brLeg.rotation.z = swing;
              parts.frLeg.rotation.z = -swing;
              parts.blLeg.rotation.z = -swing;
              parts.bodyPivot.rotation.z = Math.sin(phase * 2) * 0.025 * blend;
              parts.tailPivot.rotation.z = 0.1 * blend;
              parts.headPivot.rotation.z = 0.02;
            }
          } else {
            const settle = 1 - Math.exp(-10 * dt);
            parts.flLeg.rotation.z += (0 - parts.flLeg.rotation.z) * settle;
            parts.frLeg.rotation.z += (0 - parts.frLeg.rotation.z) * settle;
            parts.blLeg.rotation.z += (0 - parts.blLeg.rotation.z) * settle;
            parts.brLeg.rotation.z += (0 - parts.brLeg.rotation.z) * settle;
            parts.bodyPivot.rotation.z += (0 - parts.bodyPivot.rotation.z) * settle;
            parts.tailPivot.rotation.z += (0 - parts.tailPivot.rotation.z) * settle;
            if (step.isGrazing) {
              const graze = Math.max(0, Math.sin(this.simTime * 1.15 + deerIdx * 1.7));
              const targetHead = -graze * 0.44;
              parts.headPivot.rotation.z += (targetHead - parts.headPivot.rotation.z) * Math.min(1, dt * 5);
            } else {
              parts.headPivot.rotation.z += (0.06 - parts.headPivot.rotation.z) * settle;
            }
          }
        }
      }

      for (const attacker of this.units) {
        if (attacker.hp <= 0 || attacker.unitDef.category === 'worker' || attacker.unitDef.isNaval ||
          (attacker.state !== 'attacking' && !attacker.attackMoveGoal)) continue;
        const d = getDistance(node.x, node.z, attacker.x, attacker.z);
        if (d > Math.max(2.4, (attacker.unitDef.stats.range || 1.5) + 0.5)) continue;
        let hitCd = (attacker as any)._huntHitCd || 0;
        hitCd -= dt;
        if (hitCd <= 0) {
          const dmg = Math.max(1, attacker.unitDef.stats.attack);
          node.animalHp = Math.max(0, (node.animalHp || 0) - dmg);
          hitCd = Math.max(0.5, 1 / Math.max(0.35, attacker.unitDef.stats.attackRate || 1));
          triggerWildAnimalPanic(node, attacker.x, attacker.z, this.simTime, 2.5);
          if (node.animalHp <= 0) killAnimal(node, mesh, '山羌倒地');
        }
        (attacker as any)._huntHitCd = hitCd;
      }
    }
  }


  /**
   * One comet per match. A worker channels it, then chooses:
   * home town center = timed oath (faster gather + army haste),
   * or an unowned shrine = instant capture and blessing.
   */
  private updateStarRelic(dt: number) {
    if (this.starRelicPhase === 'spent' || this.gameState !== 'playing') return;

    if (starRelicShouldFall(this.simTime, this.starRelicPhase)) {
      const avoid = this.buildings
        .filter((b) => b.buildingType === 'town_center')
        .map((b) => ({ x: b.x, z: b.z }));
      const site = pickStarRelicSite(Math.random, avoid);
      this.starRelicX = site.x;
      this.starRelicZ = site.z;
      this.starRelicPhase = 'ground';
      this.starRelicChannel = 0;
      this.ensureStarRelicMesh();
      this.addFloatingText(site.x, 3.4, site.z, '星誓彗星降臨', '#e0e7ff');
      this.lastTacticalBroadcast = {
        kind: 'relic',
        message: '星誓彗星墜落。村民引導後：送回主堡得星誓，或送入未佔領祭壇立刻奪下祝福。',
        x: site.x,
        z: site.z,
        time: performance.now(),
      };
    }

    if (this.starRelicPhase === 'ground') {
      let best: { id: string; d: number } | null = null;
      for (const u of this.units) {
        if (u.hp <= 0 || u.garrisonedInBuildingId) continue;
        if (u.unitDef.category !== 'worker' || u.unitDef.isNaval) continue;
        const d = getDistance(u.x, u.z, this.starRelicX, this.starRelicZ);
        if (d <= STAR_RELIC_PICKUP_RANGE && (!best || d < best.d)) {
          best = { id: u.id, d };
        }
      }

      this.starRelicChannel = advanceStarRelicChannel(this.starRelicChannel, !!best, dt);
      if (best && starRelicChannelComplete(this.starRelicChannel)) {
        this.starRelicPhase = 'carried';
        this.starRelicCarrierId = best.id;
        this.starRelicChannel = 0;
        const carrier = this.units.find((u) => u.id === best.id);
        if (carrier) {
          carrier.currentActionText = '捧著星誓';
          this.addFloatingText(carrier.x, 2.2, carrier.z, '取得星誓', '#c4b5fd');
        }
      }

      // Send one available AI worker to investigate the relic.
      if (this.simTime % 4 < dt) {
        for (const p of this.participants) {
          if (p.controller !== 'ai' || p.aiPersonality === 'defensive') continue;
          const worker = this.units.find(
            (u) =>
              u.faction === p.id &&
              u.hp > 0 &&
              u.unitDef.category === 'worker' &&
              !u.unitDef.isNaval &&
              !u.garrisonedInBuildingId &&
              (u.state === 'idle' || u.currentActionText === '前往星誓')
          );
          if (!worker) continue;
          if (getDistance(worker.x, worker.z, this.starRelicX, this.starRelicZ) <= STAR_RELIC_PICKUP_RANGE) {
            continue;
          }
          worker.targetX = this.starRelicX;
          worker.targetZ = this.starRelicZ;
          worker.state = 'moving';
          worker.waypoints = undefined;
          worker.currentActionText = '前往星誓';
          break;
        }
      }
    }

    if (this.starRelicPhase === 'carried' && this.starRelicCarrierId) {
      const carrier = this.units.find((u) => u.id === this.starRelicCarrierId);
      if (!carrier || carrier.hp <= 0 || carrier.garrisonedInBuildingId) {
        if (carrier) {
          this.starRelicX = carrier.x;
          this.starRelicZ = carrier.z;
        }
        this.starRelicPhase = 'ground';
        this.starRelicCarrierId = null;
        this.starRelicChannel = 0;
        this.addFloatingText(this.starRelicX, 2.2, this.starRelicZ, '星誓墜落', '#a5b4fc');
      } else {
        this.starRelicX = carrier.x;
        this.starRelicZ = carrier.z;

        const tc = this.buildings.find(
          (b) => b.faction === carrier.faction && b.buildingType === 'town_center' && b.hp > 0
        );
        const shrine = this.contestedPoints
          .map((cp) => ({ cp, d: getDistance(carrier.x, carrier.z, cp.x, cp.z) }))
          .filter((s) => s.d <= s.cp.radius + 0.4)
          .sort((a, b) => a.d - b.d)[0];

        const delivery = resolveStarRelicDelivery({
          carrierX: carrier.x,
          carrierZ: carrier.z,
          townCenterX: tc?.x ?? 999,
          townCenterZ: tc?.z ?? 999,
          shrine: shrine
            ? {
                x: shrine.cp.x,
                z: shrine.cp.z,
                radius: shrine.cp.radius,
                ownerFaction: shrine.cp.ownerFaction,
                carrierFaction: carrier.faction,
              }
            : null,
        });

        if (delivery === 'shrine' && shrine) {
          shrine.cp.ownerFaction = carrier.faction;
          shrine.cp.capturingFaction = carrier.faction;
          shrine.cp.captureProgress = 1;
          shrine.cp.holdTime = 99;
          shrine.cp.siegeSupplyActive = true;
          this.starRelicPhase = 'spent';
          this.starRelicCarrierId = null;
          carrier.currentActionText = '';
          this.addFloatingText(shrine.cp.x, 3.2, shrine.cp.z, '星誓獻祭 · 祭壇立刻祝福', '#fbbf24');
          this.spawnShockwaveRing(shrine.cp.x, shrine.cp.z, 0xfbbf24, shrine.cp.radius);
        } else if (delivery === 'oath') {
          this.starOathUntil[carrier.faction] = this.simTime + STAR_RELIC_OATH_SEC;
          for (const u of this.units) {
            if (u.faction === carrier.faction && u.hp > 0 && u.unitDef.category !== 'worker') {
              u.buffSpeedUntil = Math.max(u.buffSpeedUntil || 0, this.simTime + STAR_RELIC_OATH_SEC);
            }
          }
          this.starRelicPhase = 'spent';
          this.starRelicCarrierId = null;
          carrier.currentActionText = '';
          this.addFloatingText(carrier.x, 2.6, carrier.z, '星誓成立 · 採集與行軍加速', '#c4b5fd');
          this.spawnShockwaveRing(carrier.x, carrier.z, 0xc4b5fd, 6);
        } else {
          // AI carriers must receive a destination while the relic is still carried.
          const participant = this.participants.find((p) => p.id === carrier.faction);
          if (
            participant?.controller === 'ai' &&
            tc &&
            (carrier.state === 'idle' ||
              carrier.currentActionText === '捧著星誓' ||
              carrier.currentActionText === '獻祭星誓')
          ) {
            const shrineGoal = this.contestedPoints
              .filter((cp) => cp.ownerFaction !== carrier.faction)
              .map((cp) => ({ cp, d: getDistance(carrier.x, carrier.z, cp.x, cp.z) }))
              .sort((a, b) => a.d - b.d)[0];
            const tcDist = getDistance(carrier.x, carrier.z, tc.x, tc.z);
            const goShrine =
              participant.aiPersonality === 'hard' &&
              !!shrineGoal &&
              shrineGoal.d < tcDist * 0.85;
            const goal = goShrine && shrineGoal ? shrineGoal.cp : tc;
            carrier.targetX = goal.x;
            carrier.targetZ = goal.z;
            carrier.state = 'moving';
            carrier.waypoints = undefined;
            carrier.currentActionText = goShrine ? '獻祭星誓' : '捧著星誓';
          }
        }
      }
    }

    if (this.starRelicMesh) {
      const visible = this.starRelicPhase === 'ground' || this.starRelicPhase === 'carried';
      this.starRelicMesh.visible = visible;
      if (visible) {
        const bob =
          this.starRelicPhase === 'carried'
            ? 2.1
            : 1.35 + Math.sin(this.simTime * 3) * 0.18;
        this.starRelicMesh.position.set(this.starRelicX, bob, this.starRelicZ);
        this.starRelicMesh.rotation.y = this.simTime * 1.4;
        const core = this.starRelicMesh.getObjectByName('relicCore') as THREE.Mesh | undefined;
        const mat = core?.material as THREE.MeshStandardMaterial | undefined;
        if (mat) {
          const ratio =
            this.starRelicPhase === 'ground'
              ? Math.min(1, this.starRelicChannel / STAR_RELIC_CHANNEL_SEC)
              : 1;
          mat.emissiveIntensity = 0.45 + ratio * 1.1;
        }
      }
    }
  }

  private ensureStarRelicMesh() {
    if (this.starRelicMesh) return;
    const group = new THREE.Group();
    const core = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.55, 0),
      new THREE.MeshStandardMaterial({
        color: 0xe0e7ff,
        emissive: 0x7c3aed,
        emissiveIntensity: 0.8,
        roughness: 0.25,
        metalness: 0.4,
      })
    );
    core.name = 'relicCore';
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.85, 0.05, 8, 20),
      new THREE.MeshBasicMaterial({ color: 0xc4b5fd, transparent: true, opacity: 0.85 })
    );
    ring.rotation.x = Math.PI / 2;
    group.add(core, ring);
    this.scene.add(group);
    this.starRelicMesh = group;
  }

  private updateContestedPoints(dt: number) {
    let shouldNotifySelection = false;
    this.contestedUiRefreshAcc += dt;

    for (const point of this.contestedPoints) {
      const counts = new Map<string, number>();
      const presenceEntries: Array<{ faction: FactionId; team: number; weight: number }> = [];
      for (const u of this.units) {
        if (u.hp <= 0 || u.garrisonedInBuildingId) continue;
        // Only military presence captures — workers cannot claim shrines alone
        if (u.unitDef.category === 'worker') continue;
        if (u.unitDef.isNaval) continue;
        const d = getDistance(u.x, u.z, point.x, point.z);
        if (d > point.radius) continue;
        // Siege engines count double (securing a shrine with artillery feels decisive)
        const weight = u.unitDef.category === 'siege' ? 2 : 1;
        counts.set(u.faction, (counts.get(u.faction) || 0) + weight);
        const team = u.team ?? this.getParticipant(u.faction)?.team ?? 1;
        presenceEntries.push({ faction: u.faction, team, weight });
      }

      const presence = evaluateContestedPresence(presenceEntries);
      const prevOwner = point.ownerFaction;
      const prevContested = !!point.isContested;
      point.isContested = presence.isContested;
      point.contestingFactions = presence.activeFactions;

      const leader = presence.leader;
      const contestedTie = presence.isTie;

      if (!leader || contestedTie) {
        if (!leader && !contestedTie) {
          if (point.ownerFaction === 'neutral') {
            point.captureProgress = Math.max(0, point.captureProgress - dt * 0.1);
            if (point.captureProgress <= 0.02) point.capturingFaction = undefined;
          } else {
            point.capturingFaction = point.ownerFaction;
            point.captureProgress = Math.min(1, point.captureProgress + dt * 0.08);
            // Unattended owned points slowly decay holdTime (blessing charge can drop)
            point.holdTime = Math.max(0, point.holdTime - dt * 0.35);
          }
        }
      } else {
        const weight = counts.get(leader) || 1;
        const rate = 0.24 + Math.min(0.32, (weight - 1) * 0.04);
        if (point.ownerFaction === leader) {
          point.captureProgress = 1;
          point.capturingFaction = leader;
          point.holdTime += dt;
        } else if (point.ownerFaction === 'neutral') {
          if (point.capturingFaction === leader || !point.capturingFaction) {
            point.capturingFaction = leader;
            point.captureProgress = Math.min(1, point.captureProgress + rate * dt);
          } else {
            point.captureProgress = Math.max(0, point.captureProgress - rate * 1.25 * dt);
            if (point.captureProgress <= 0.05) {
              point.capturingFaction = leader;
              point.captureProgress = 0;
            }
          }
        } else {
          // Enemy draining an owned shrine down to neutral before claiming it
          point.captureProgress = Math.max(0, point.captureProgress - rate * 1.25 * dt);
          if (point.captureProgress <= 0.05) {
            point.ownerFaction = 'neutral';
            point.capturingFaction = leader;
            point.captureProgress = 0;
            point.holdTime = 0;
            point.siegeSupplyActive = false;
            this.addFloatingText(point.x, 2.5, point.z, '據點已中立化', '#f87171');
          }
        }

        if (point.captureProgress >= 1 && point.ownerFaction !== leader) {
          const prev = point.ownerFaction;
          point.ownerFaction = leader;
          point.captureProgress = 1;
          point.holdTime = 0;
          point.siegeSupplyActive = false;
          this.addFloatingText(point.x, 3.2, point.z, `佔領 ${point.label}`, '#fbbf24');
          this.spawnShockwaveRing(point.x, point.z, 0xfbbf24, point.radius * 0.9);
          this.lastMinimapPing = {
            x: point.x,
            z: point.z,
            type: 'attack',
            time: performance.now(),
          };
          this.contestedIncomeAcc.set(point.id, 0);

          // First capture of this shrine this match: one-time supply cache (tempo spike)
          if (!this.contestedFirstLootClaimed.has(point.id)) {
            this.contestedFirstLootClaimed.add(point.id);
            const bag = this.resourcesByFaction[leader];
            if (bag) {
              const loot =
                point.shrineType === 'harvest'
                  ? { food: 60, wood: 35, gold: 0, stone: 0 }
                  : point.shrineType === 'forge'
                  ? { food: 0, wood: 0, gold: 35, stone: 30 }
                  : { food: 0, wood: 25, gold: 60, stone: 0 };
              bag.food += loot.food;
              bag.wood += loot.wood;
              bag.gold += loot.gold;
              bag.stone += loot.stone;
              if (leader === this.humanPlayerId) this.onResourcesChange?.(bag);
              const lootText = [
                loot.food ? `+${loot.food}糧` : '',
                loot.wood ? `+${loot.wood}木` : '',
                loot.gold ? `+${loot.gold}金` : '',
                loot.stone ? `+${loot.stone}石` : '',
              ].filter(Boolean).join(' ');
              this.addFloatingText(point.x, 2.7, point.z, lootText, '#e2e8f0');
            }
          }

          if (prev !== 'neutral' && prev !== leader) {
            this.addFloatingText(point.x, 2.5, point.z, '敵方失去據點', '#f87171');
          }
        }
      }

      // Long hold → Siege Supply (oil, ladders, mantlets): +18% non-siege building damage
      if (point.ownerFaction !== 'neutral' && point.ownerFaction === leader) {
        if (!point.siegeSupplyActive && point.holdTime >= getShrineBlessingHoldTime(point.shrineType)) {
          point.siegeSupplyActive = true;
          const blessingName = point.shrineType === 'war' ? '戰意祝福' : point.shrineType === 'harvest' ? '豐饒祝福' : '鍛造祝福';
          this.addFloatingText(point.x, 3.4, point.z, `${point.label} · ${blessingName}`, '#fdba74');
          this.spawnShockwaveRing(point.x, point.z, 0xfb923c, point.radius * 1.05);
        }
      } else if (point.holdTime < 12) {
        point.siegeSupplyActive = false;
      }

      // Sync persistent 3D shrine visuals (owner color + contested pulse + overhead badge)
      const summary = getContestedShrineSummary(point, this.participants);
      const mesh = this.contestedMeshes.get(point.id);
      if (mesh) {
        const banner = mesh.getObjectByName('shrineBanner') as THREE.Mesh | undefined;
        if (banner?.material && (banner.material as THREE.MeshStandardMaterial).color) {
          (banner.material as THREE.MeshStandardMaterial).color.setHex(summary.ownerColorHex);
          banner.rotation.y = -0.35 + Math.sin(this.simTime * 4.2) * 0.16;
        }

        const crystal = mesh.getObjectByName('shrineCrystal') as THREE.Mesh | undefined;
        if (crystal) {
          crystal.rotation.y = this.simTime * (point.isContested ? 2.8 : 1.1);
          crystal.position.y = 2.82 + Math.sin(this.simTime * 2.4) * 0.08;
          const cMat = crystal.material as THREE.MeshStandardMaterial | undefined;
          if (cMat) {
            cMat.color.setHex(summary.isNeutral ? 0xfbbf24 : summary.ownerColorHex);
            cMat.emissive.setHex(
              point.isContested ? 0xdc2626 : summary.isNeutral ? 0xb45309 : summary.ownerColorHex
            );
            cMat.emissiveIntensity = point.isContested
              ? 0.55 + Math.sin(this.simTime * 8) * 0.25
              : point.siegeSupplyActive
              ? 0.72
              : 0.38;
          }
        }

        const ownerRing = mesh.getObjectByName('ownerRing') as THREE.Mesh | undefined;
        const ownerRingMat = ownerRing?.material as THREE.MeshBasicMaterial | undefined;
        if (ownerRingMat) {
          ownerRingMat.color.setHex(summary.ownerColorHex);
          ownerRingMat.opacity = summary.isNeutral ? 0.34 : point.siegeSupplyActive ? 0.85 : 0.68;
        }

        const ring = mesh.getObjectByName('captureRing') as THREE.Mesh | undefined;
        const ringMat = ring?.material as THREE.MeshBasicMaterial | undefined;
        if (ringMat) {
          if (point.isContested) {
            const flash = 0.5 + 0.5 * Math.sin(this.simTime * 7.5);
            ringMat.color.setHex(flash > 0.5 ? 0xf59e0b : 0xef4444);
            ringMat.opacity = 0.5 + flash * 0.28;
          } else if (summary.statusKind === 'capturing' && summary.capturingColorHex !== null) {
            ringMat.color.setHex(summary.capturingColorHex);
            ringMat.opacity = 0.38 + point.captureProgress * 0.42;
          } else if (!summary.isNeutral) {
            // Persistent faction color stays visible even when 0 units are standing inside!
            ringMat.color.setHex(summary.ownerColorHex);
            ringMat.opacity = point.siegeSupplyActive ? 0.62 : 0.46;
          } else {
            ringMat.color.setHex(0xe2e8f0);
            ringMat.opacity = 0.28;
          }
        }

        const contestedRing = mesh.getObjectByName('contestedRing') as THREE.Mesh | undefined;
        const contestedMat = contestedRing?.material as THREE.MeshBasicMaterial | undefined;
        if (contestedRing && contestedMat) {
          if (point.isContested || summary.statusKind === 'capturing') {
            contestedRing.visible = true;
            const pulse = 0.5 + 0.5 * Math.sin(this.simTime * (point.isContested ? 8.5 : 4.0));
            const s = point.isContested ? 0.98 + pulse * 0.05 : 0.88 + point.captureProgress * 0.14;
            contestedRing.scale.set(s, 1, s);
            contestedMat.color.setHex(
              point.isContested ? 0xfbbf24 : (summary.capturingColorHex ?? 0x38bdf8)
            );
            contestedMat.opacity = point.isContested ? 0.35 + pulse * 0.42 : 0.28 + point.captureProgress * 0.35;
          } else {
            contestedRing.visible = false;
          }
        }

        const badge = mesh.getObjectByName('shrineBadge') as THREE.Sprite | undefined;
        if (badge) {
          badge.visible = this.showOverheadBadges;
          const badgeSig = `${summary.ownerName}|${summary.statusKind}|${summary.progressPct}|${summary.blessingPct}|${point.isContested ? 1 : 0}`;
          if (mesh.userData._lastBadgeSig !== badgeSig) {
            mesh.userData._lastBadgeSig = badgeSig;
            const isHostileOwner =
              point.ownerFaction !== 'neutral' &&
              this.isHostileToPlayer({ faction: point.ownerFaction });
            updateBadgeSprite(
              badge,
              point.label,
              summary.shrineIcon,
              summary.badgeValueText,
              summary.badgeRatio,
              isHostileOwner,
              summary.isNeutral && !point.isContested,
              summary.badgeActionText,
              !!point.isContested
            );
          }
        }
      }

      if (
        prevOwner !== point.ownerFaction ||
        prevContested !== !!point.isContested ||
        (point.id === this.selectedContestedPointId && this.contestedUiRefreshAcc >= 0.25)
      ) {
        shouldNotifySelection = true;
      }

      // Income + local aura
      if (point.ownerFaction !== 'neutral') {
        const acc = (this.contestedIncomeAcc.get(point.id) || 0) + dt;
        if (acc >= 1) {
          const ticks = Math.floor(acc);
          this.contestedIncomeAcc.set(point.id, acc - ticks);
          const bag = this.resourcesByFaction[point.ownerFaction];
          if (bag) {
            // Each shrine has a distinct economy role; holding it unlocks a stronger blessing.
            const income = getShrineIncome(point.shrineType, point.siegeSupplyActive);
            bag.food += income.food * ticks;
            bag.wood += income.wood * ticks;
            bag.gold += income.gold * ticks;
            bag.stone += income.stone * ticks;
            if (point.ownerFaction === this.humanPlayerId) this.onResourcesChange?.(bag);
          }
        }
        for (const u of this.units) {
          if (u.faction !== point.ownerFaction || u.hp <= 0) continue;
          if (getDistance(u.x, u.z, point.x, point.z) > point.radius + 5) continue;
          if (point.shrineType === 'harvest') {
            // Harvest shrines accelerate nearby logistics crews as well as protecting the area.
            if (u.unitDef.category === 'worker') {
              u.buffSpeedUntil = Math.max(u.buffSpeedUntil || 0, this.simTime + 0.45);
              continue;
            }
          } else if (u.unitDef.category === 'worker') {
            continue;
          }
          u.buffSpeedUntil = Math.max(u.buffSpeedUntil || 0, this.simTime + 0.45);
          const defenseAura = point.shrineType === 'forge' ? 2 : point.siegeSupplyActive ? 2 : 1;
          u.buffDefenseBonus = Math.max(u.buffDefenseBonus || 0, defenseAura);
        }
      }
    }

    if (shouldNotifySelection) {
      this.contestedUiRefreshAcc = 0;
      this.onSelectionChange?.();
    } else if (this.contestedUiRefreshAcc >= 0.25) {
      this.contestedUiRefreshAcc = 0;
    }
  }

  private updateBuildings(dt: number) {
    const currentBuildings = this.buildings;
    let remainingBuildings: BuildingEntity[] | null = null;
    let selectedDestroyed = false;
    let settlementEnvironmentDirty = false;

    for (let buildingIndex = 0; buildingIndex < currentBuildings.length; buildingIndex++) {
      const bldg = currentBuildings[buildingIndex];
      if (bldg.hp <= 0) {
        if (!remainingBuildings) remainingBuildings = currentBuildings.slice(0, buildingIndex);
        settlementEnvironmentDirty = true;
        this.navGridDirty = true;
        this.waterNavGridDirty = true;
        // Eject any surviving garrisoned units before removing collapsed structure
        if (bldg.garrisonedUnitIds && bldg.garrisonedUnitIds.length > 0) {
          bldg.garrisonedUnitIds.forEach((uid, idx) => {
            const gu = this.units.find((u) => u.id === uid && u.hp > 0);
            if (!gu) return;
            gu.garrisonedInBuildingId = undefined;
            gu.targetGarrisonBuildingId = undefined;
            gu.hp = Math.max(1, Math.round(gu.hp * 0.6));
            const uRadius = getUnitColliderRadius(gu.unitDef.category, gu.unitDef.visual.scale);
            const spot = this.findSafeExteriorSpot(bldg.x, bldg.z, getBuildingCollisionRadius(bldg), uRadius, idx, bldg.id);
            gu.x = spot.x;
            gu.z = spot.z;
            gu.state = 'idle';
            gu.currentActionText = '💥 建築倒塌緊急脫出';
            const uMesh = this.unitMeshes.get(gu.id);
            if (uMesh) {
              uMesh.position.set(gu.x, 0, gu.z);
              uMesh.visible = true;
            }
          });
          bldg.garrisonedUnitIds = [];
        }

        if (this.selectedBuildingId === bldg.id) {
          this.selectedBuildingId = null;
          selectedDestroyed = true;
        }
        const mesh = this.buildingMeshes.get(bldg.id);
        if (mesh) {
          this.buildingMeshes.delete(bldg.id);
          this.animatedBuildingMeshes.delete(mesh);
          const badge = mesh.userData.bldgBadge as THREE.Object3D | undefined;
          if (badge) badge.visible = false;
          const scaf = mesh.getObjectByName('scaffoldGroup');
          if (scaf) scaf.visible = false;

          this.collapsingBuildings.push({
            mesh,
            age: 0,
            duration: 1.15,
            footprint: bldg.buildingDef.size,
            startX: bldg.x,
            startZ: bldg.z,
            dustTimer: 0,
          });
          if (this.rubbleDecalBatch) {
            const slot = addBuildingRubbleDecal(
              this.rubbleDecalBatch,
              bldg.x,
              bldg.z,
              bldg.buildingDef.size
            );
            const recycled = this.rubbleDecals.findIndex((entry) => entry.slot === slot);
            if (recycled >= 0) this.rubbleDecals.splice(recycled, 1);
            this.rubbleDecals.push({ slot, age: 0, maxAge: 9.0 });
          }

          this.spawnShockwaveRing(bldg.x, bldg.z, 0xf97316, bldg.buildingDef.size + 2.2);
          this.spawnParticleBurst(bldg.x, 1.4, bldg.z, 'smoke', 9);
          this.spawnParticleBurst(bldg.x, 1.2, bldg.z, 'ember', 8);
          this.spawnParticleBurst(bldg.x, 0.9, bldg.z, 'stone', 7);
          sound.playBuildingCollapse(this.getSpatialAudioScale(bldg.x, bldg.z));
        }
        continue;
      }

      remainingBuildings?.push(bldg);


      if ((bldg as any).hitFlashTimer && (bldg as any).hitFlashTimer > 0) {
        (bldg as any).hitFlashTimer = Math.max(0, (bldg as any).hitFlashTimer - dt);
      }
      if ((bldg as any)._constructImpulse && (bldg as any)._constructImpulse > 0) {
        (bldg as any)._constructImpulse = Math.max(0, (bldg as any)._constructImpulse - dt * 4.5);
      }

      const bMesh = this.buildingMeshes.get(bldg.id);
      if (bMesh && bldg.isConstructed) removeBuildingScaffoldFromRoot(bMesh);
      const visState = computeBuildingVisualState(bldg.isConstructed, bldg.buildProgress, bldg.hp, bldg.maxHp);
      if (bMesh) {
        if (bldg.buildingType === 'gate') updateGateDoorAnimation(bMesh, !!bldg.gateOpen || !!bldg.wallBreached, dt);
        applyBuildingConstructionVisuals(
          bMesh,
          visState,
          this.simTime,
          (bldg as any)._constructImpulse || 0
        );
        applyBuildingDamageVisuals(
          bMesh,
          visState.damageSeverity,
          !!((bldg as any).hitFlashTimer && (bldg as any).hitFlashTimer > 0),
          visState.sagTiltRad,
          this.simTime
        );

        // Emit periodic rising smoke & glowing embers from damaged buildings
        if (visState.isSmoking || visState.isBurning) {
          const sTimer = ((bldg as any)._smokeTimer || 0) + dt;
          const interval = visState.isBurning ? 0.36 : 0.82;
          if (sTimer >= interval) {
            (bldg as any)._smokeTimer = 0;
            this.spawnParticleBurst(bldg.x, 1.75, bldg.z, 'smoke', visState.isBurning ? 3 : 2);
            if (visState.isBurning) {
              this.spawnParticleBurst(bldg.x, 1.45, bldg.z, 'ember', 2);
            }
          } else {
            (bldg as any)._smokeTimer = sTimer;
          }
        }

        // Keep building overhead badge synced with HP%, garrison count, build progress%, and under-attack alert
        const badge = bMesh.userData.bldgBadge as THREE.Sprite | undefined;
        if (badge) {
          badge.visible = this.showOverheadBadges;
          if ((bldg as any).underAttackTimer && (bldg as any).underAttackTimer > 0) {
            (bldg as any).underAttackTimer = Math.max(0, (bldg as any).underAttackTimer - dt);
          }
          const isUnderAttack =
            !!((bldg as any).underAttackTimer && (bldg as any).underAttackTimer > 0) ||
            !!((bldg as any).lastDamagedTime && performance.now() - (bldg as any).lastDamagedTime < 2600);
          const progPct = bldg.isConstructed ? 100 : Math.floor((bldg.buildProgress * 100) / 5) * 5;
          const hpBucket = Math.ceil((Math.max(0, bldg.hp) / Math.max(1, bldg.maxHp)) * 25);
          const gCount = bldg.garrisonedUnitIds?.length || 0;
          const gMax = getBuildingMaxGarrison(bldg);
          const queueTag = bldg.activeTechId
            ? `tech:${Math.floor((bldg.researchProgress || 0) * 10)}`
            : bldg.queue.length > 0
            ? `q:${bldg.queue.length}:${Math.floor(bldg.queueProgress * 10)}`
            : gCount > 0
            ? `g:${gCount}`
            : 'idle';
          const badgeSig = `${hpBucket}_${progPct}_${isUnderAttack ? 1 : 0}_${queueTag}`;
          if ((bldg as any)._badgeSig !== badgeSig) {
            (bldg as any)._badgeSig = badgeSig;
            const hostile = this.isHostileToPlayer(bldg);
            const pName = this.getParticipant(bldg.faction)?.name || '';
            const prefix = this.isHumanControlled(bldg.faction)
              ? ''
              : this.isSpectatorMode || hostile
              ? `${pName}·`
              : '友軍·';
            const shortName = `${prefix}${bldg.buildingDef.name.split(' ')[0]}`;
            const bIcons: Record<string, string> = {
              town_center: '🏛️',
              house: '🏠',
              barracks: '⚔️',
              archery_range: '🏹',
              farm: '🌾',
              granary: '🌾',
              lumber_camp: '🪵',
              mining_camp: '⛏️',
              dock: '⚓',
              tower: '🗼',
              castle: '🏰',
              armory_forge: '⚒️',
              spirit_shrine: '⛩️',
              mana_well: '🔮',
              ovoo_relay: '🗿',
            };
            const icon = bIcons[bldg.buildingType] || '🏛️';
            const statusText = isUnderAttack
              ? gCount > 0
                ? `⚠️ 交戰反擊 (駐防 ${gCount}/${gMax})`
                : '⚠️ 遭受攻擊!'
              : !bldg.isConstructed
              ? `🔨 建造中 (${Math.round(bldg.buildProgress * 100)}%)`
              : bldg.activeTechId
              ? '🔬 研發科技中'
              : bldg.queue.length > 0
              ? `🛡️ 訓練佇列 (${bldg.queue.length})`
              : gCount > 0
              ? `🛡️ 駐防庇護 (${gCount}/${gMax})`
              : undefined;
            updateBadgeSprite(
              badge,
              shortName,
              icon,
              `${Math.max(0, Math.round(bldg.hp))}/${bldg.maxHp}`,
              Math.max(0, bldg.hp / Math.max(1, bldg.maxHp)),
              hostile,
              false,
              statusText,
              isUnderAttack
            );
          }
        }
      }

      if (!bldg.isConstructed) continue;

      // Garrisoned Building & Fortification Defensive Volleys (Towers, Castles, manned TCs & Special Buildings)
      const defenderTechs = this.getResearchedTechs(bldg.faction);
      const defProfile = computeGarrisonDefenseProfile(bldg, this.units, defenderTechs);
      if (defProfile.volleyCount > 0 && defProfile.range > 0) {
        if (bldg.attackCooldown > 0) bldg.attackCooldown -= dt;
        if (bldg.attackCooldown <= 0) {
          const enemiesInRange = this.units
            .filter(
              (u) =>
                this.isHostile(bldg, u) &&
                u.hp > 0 &&
                !u.garrisonedInBuildingId &&
                getDistance(bldg.x, bldg.z, u.x, u.z) <= defProfile.range
            )
            .sort((a, b) => getDistance(bldg.x, bldg.z, a.x, a.z) - getDistance(bldg.x, bldg.z, b.x, b.z));

          if (enemiesInRange.length > 0) {
            bldg.attackCooldown = defProfile.cooldown;
            const startY =
              bldg.buildingType === 'castle' || bldg.buildingType === 'landmark_citadel'
                ? 7.8
                : bldg.buildingType === 'tower'
                ? 5.2
                : 3.8;
            const pType: Projectile['type'] =
              bldg.buildingType === 'mana_well' || bldg.buildingType === 'spirit_shrine'
                ? 'fireball'
                : 'arrow';
            for (let i = 0; i < defProfile.volleyCount; i++) {
              const targetEnemy = enemiesInRange[i % enemiesInRange.length];
              const spread = (i - (defProfile.volleyCount - 1) / 2) * 0.55;
              this.spawnProjectile(
                bldg.x + spread,
                startY,
                bldg.z + (i % 2 === 0 ? 0.35 : -0.35),
                targetEnemy.id,
                pType,
                defProfile.damagePerBolt,
                pType === 'fireball' ? '#38bdf8' : '#e2e8f0'
              );
            }
          }
        }
      }

      // Passive Resource Generation & Civ Unique Building Effects
      if (bldg.buildingDef.producesResource) {
        const prod = bldg.buildingDef.producesResource;
        const delta = prod.amountPerSec * dt;
        const resBag = this.getResourcesForFaction(bldg.faction);
        resBag[prod.type] += delta;
        if (bldg.buildingType === 'landmark_guildhall') {
          resBag.stone += delta;
        } else if (bldg.buildingType === 'spirit_shrine') {
          resBag.wood += delta * 0.9;
        } else if (bldg.buildingType === 'mana_well') {
          resBag.gold += delta * 0.7;
        }
        this.syncHumanResourcesAlias();
        if (this.isHumanControlled(bldg.faction)) {
          const now = performance.now();
          if (now - this.lastHudResSyncTime >= 250) {
            this.lastHudResSyncTime = now;
            this.onResourcesChange?.(this.playerResources);
          }
        }
      }

      // Unique Civ Building Auras (triggered cleanly)
      if (bldg.buildingType === 'mana_well') {
        for (const ally of this.units) {
          if (ally.hp > 0 && ally.hp < ally.maxHp && !this.isHostile(bldg, ally)) {
            if (getDistance(bldg.x, bldg.z, ally.x, ally.z) <= 9.0) {
              ally.hp = Math.min(ally.maxHp, ally.hp + 3.5 * dt);
            }
          }
        }
      } else if (bldg.buildingType === 'spirit_shrine') {
        for (const ally of this.units) {
          if (ally.hp > 0 && !this.isHostile(bldg, ally)) {
            if (getDistance(bldg.x, bldg.z, ally.x, ally.z) <= 9.0) {
              ally.buffSpeedUntil = Math.max(ally.buffSpeedUntil || 0, this.simTime + 0.8);
            }
          }
        }
      } else if (bldg.buildingType === 'armory_forge') {
        for (const ally of this.units) {
          if (ally.hp > 0 && !this.isHostile(bldg, ally)) {
            if (getDistance(bldg.x, bldg.z, ally.x, ally.z) <= 9.5) {
              ally.buffDefenseBonus = Math.max(ally.buffDefenseBonus || 0, 2);
              ally.buffSpeedUntil = Math.max(ally.buffSpeedUntil || 0, this.simTime + 0.8);
            }
          }
        }
      } else if (bldg.buildingType === 'ovoo_relay') {
        bldg.ovooHornCooldown = Math.max(0, (bldg.ovooHornCooldown || 0) - dt);
        const resources = this.getResourcesForFaction(bldg.faction);
        const nearbyMine = this.resourceNodes.find(
          (node) => node.amount > 0 &&
            (node.resourceType === 'gold' || node.resourceType === 'stone') &&
            getDistance(bldg.x, bldg.z, node.x, node.z) <= 14
        );
        if (bldg.ovooMode === 'sacred_extraction') {
          if (nearbyMine) {
            resources[nearbyMine.resourceType] += 0.75 * dt;
            resources.stone += 0.2 * dt;
          } else {
            resources.gold += 0.35 * dt;
            resources.stone += 0.25 * dt;
          }
          if (Math.floor(this.simTime * 2) !== Math.floor((this.simTime - dt) * 2)) {
            this.spawnParticleBurst(bldg.x, 3.4, bldg.z, nearbyMine ? 'gold' : 'spark', 2);
          }
          this.syncHumanResourcesAlias();
          if (this.isHumanControlled(bldg.faction)) {
            const now = performance.now();
            if (now - this.lastHudResSyncTime >= 250) {
              this.lastHudResSyncTime = now;
              this.onResourcesChange?.(this.playerResources);
            }
          }
        } else {
          if (nearbyMine) resources[nearbyMine.resourceType] += 0.25 * dt;
          for (const ally of this.units) {
            if (ally.hp <= 0 || ally.garrisonedInBuildingId || this.isHostile(bldg, ally)) continue;
            if (getDistance(bldg.x, bldg.z, ally.x, ally.z) > 13.5) continue;
            ally.buffSpeedUntil = Math.max(ally.buffSpeedUntil || 0, this.simTime + 0.8);
            if (ally.unitDef.category === 'cavalry' || this.getCivilizationForFaction(ally.faction) === 'mongol') {
              ally.hp = Math.min(ally.maxHp, ally.hp + 1.8 * dt);
            }
          }
          if (nearbyMine && dt > 0) {
            this.syncHumanResourcesAlias();
            if (this.isHumanControlled(bldg.faction)) {
              const now = performance.now();
              if (now - this.lastHudResSyncTime >= 250) {
                this.lastHudResSyncTime = now;
                this.onResourcesChange?.(this.playerResources);
              }
            }
          }
        }
      }

      const hasNearbyForge =
        bldg.buildingType !== 'armory_forge' &&
        this.buildings.some(
          (f) =>
            f.faction === bldg.faction &&
            f.isConstructed &&
            f.buildingType === 'armory_forge' &&
            getDistance(bldg.x, bldg.z, f.x, f.z) <= 16
        );
      const hasNearbyYamOvoo =
        bldg.buildingType !== 'ovoo_relay' &&
        this.buildings.some(
          (f) =>
            f.faction === bldg.faction && f.isConstructed &&
            f.buildingType === 'ovoo_relay' && f.ovooMode !== 'sacred_extraction' &&
            getDistance(bldg.x, bldg.z, f.x, f.z) <= 16
        );
      const speedBonusMult = getCappedProductionSpeedMultiplier(hasNearbyForge || hasNearbyYamOvoo ? 1.25 : 1.0);

      // Active Civilization Tech Research Progress
      if (bldg.activeTechId) {
        const tech = findTechDef(bldg.activeTechId);
        if (tech) {
          bldg.researchProgress = (bldg.researchProgress || 0) + (speedBonusMult / tech.researchTime) * dt;
          if (bldg.researchProgress >= 1) {
            bldg.activeTechId = null;
            bldg.researchProgress = 0;
            this.applyCompletedTech(bldg.faction, tech);
            if (this.isHumanControlled(bldg.faction)) {
              this.onSelectionChange?.();
            }
          }
        } else {
          bldg.activeTechId = null;
          bldg.researchProgress = 0;
        }
      }

      // Unit Training Queue
      if (bldg.queue.length > 0) {
        const currentUnitId = bldg.queue[0];
        const uDef = this.findUnitDef(currentUnitId, bldg.faction);
        if (uDef) {
          const trainTimeMult = getTrainingTimeMultiplier(
            this.getResearchedTechs(bldg.faction),
            uDef.category
          );
          const landmarkTrainingSpeed = getLandmarkTrainingSpeedMultiplier(
            this.landmarksByFaction[bldg.faction] || [],
            uDef.category
          );
          const trainingDuration = getEffectiveUnitTrainingDuration(
            uDef.stats.trainTime,
            trainTimeMult,
            speedBonusMult,
            landmarkTrainingSpeed
          );
          bldg.queueProgress += dt / trainingDuration;

          const pop = this.getPopulationStats(bldg.faction);
          if (bldg.queueProgress >= 1 && pop.used < pop.max) {
            bldg.queue.shift();
            bldg.queueProgress = 0;
            // Spawn trained unit cleanly outside building collision perimeter (favoring rally point direction)
            const uRadius = getUnitColliderRadius(uDef.category, uDef.visual.scale);
            const isNaval = !!uDef.isNaval || uDef.id === 'fishing_boat';
            const rallyAngle = bldg.rallyPoint
              ? Math.atan2(bldg.rallyPoint.z - bldg.z, bldg.rallyPoint.x - bldg.x)
              : undefined;
            const spot = this.findSafeExteriorSpot(
              bldg.x,
              bldg.z,
              getBuildingCollisionRadius(bldg),
              uRadius,
              0,
              bldg.id,
              rallyAngle,
              isNaval
            );
            const newUnit = this.addUnit(uDef, bldg.faction, spot.x, spot.z);
            this.spawnParticleBurst(spot.x, 0.35, spot.z, 'dust', 3);
            if (this.isHumanControlled(bldg.faction)) sound.playUnitTrained();
            if (isNaval) {
              const rp = bldg.rallyPoint;
              let assignedFish: ResourceNode | null = null;
              if (rp?.targetResourceNodeId) {
                const candidate = this.resourceNodes.find(
                  (n) => n.id === rp.targetResourceNodeId && n.amount > 0 && canUnitGatherNode(newUnit.unitDef, n)
                );
                if (candidate) assignedFish = candidate;
              }
              if (!assignedFish) {
                assignedFish = findBestFoodResourceNode(
                  rp?.x ?? bldg.x,
                  rp?.z ?? bldg.z,
                  this.resourceNodes,
                  110,
                  true,
                  true
                );
              }
              if (assignedFish) {
                const meta = this.getResourceDisplayMeta(assignedFish);
                newUnit.targetResourceNodeId = assignedFish.id;
                newUnit.state = 'gathering';
                newUnit.currentActionText = `${meta.icon} 前往${meta.action}`;
              } else if (rp) {
                const obs = this.getTerrainNavObstacles();
                const waterRects = (obs?.rects || []).filter((r) => r.kind === 'water');
                const waterDiscs = (obs?.discs || []).filter((d) => d.kind === 'water');
                if (isPointInTerrainObstacle(rp.x, rp.z, waterRects, waterDiscs, [])) {
                  newUnit.targetX = rp.x;
                  newUnit.targetZ = rp.z;
                  newUnit.state = 'moving';
                  newUnit.currentActionText = '⛵ 前往水域集結點';
                }
              }
            } else if (bldg.rallyPoint) {
              const rp = bldg.rallyPoint;
              if (newUnit.unitDef.category === 'worker' && rp.targetResourceNodeId) {
                const exactNode = this.resourceNodes.find(
                  (n) => n.id === rp.targetResourceNodeId && n.amount > 0 && canUnitGatherNode(newUnit.unitDef, n)
                );
                const validNodes = this.resourceNodes.filter((n) => canUnitGatherNode(newUnit.unitDef, n));
                const gatherNode =
                  exactNode ||
                  findClosestResourceNode(rp.x, rp.z, validNodes, rp.resourceType, 14);
                if (gatherNode) {
                  const meta = this.getResourceDisplayMeta(gatherNode);
                  newUnit.targetResourceNodeId = gatherNode.id;
                  newUnit.state = 'gathering';
                  newUnit.currentActionText = `${meta.icon} 前往${meta.action}`;
                } else {
                  newUnit.targetX = rp.x;
                  newUnit.targetZ = rp.z;
                  newUnit.state = 'moving';
                  newUnit.currentActionText = '👣 前往集結點';
                }
              } else if (newUnit.unitDef.category === 'worker' && rp.targetBuildingId) {
                const targetBuild = this.buildings.find(
                  (b) => b.id === rp.targetBuildingId && !b.isConstructed && b.hp > 0
                );
                if (targetBuild) {
                  newUnit.targetBuildingId = targetBuild.id;
                  newUnit.state = 'building';
                  newUnit.currentActionText = `🔨 前往建造${targetBuild.buildingDef.name.split(' ')[0]}`;
                } else {
                  newUnit.targetX = rp.x;
                  newUnit.targetZ = rp.z;
                  newUnit.state = 'moving';
                  newUnit.currentActionText = '👣 前往集結點';
                }
              } else {
                newUnit.targetX = rp.x;
                newUnit.targetZ = rp.z;
                newUnit.state = 'moving';
                newUnit.currentActionText = '👣 前往集結點';
              }
            }
          }
        } else {
          // A removed/disabled mod can leave an orphaned unit ID at the queue head.
          // Drop it instead of letting this building remain permanently blocked.
          bldg.queue.shift();
          bldg.queueProgress = 0;
          if (this.isHumanControlled(bldg.faction)) {
            this.addFloatingText(bldg.x, 2.4, bldg.z, '⚠️ 訓練佇列含無效單位，已自動清除', '#f59e0b');
            this.onSelectionChange?.();
          }
        }
      }
    }

    if (remainingBuildings) this.buildings = remainingBuildings;
    if (settlementEnvironmentDirty) {
      this.refreshSettlementEnvironment();
      this.refreshWallTowerConnections();
    }
    if (selectedDestroyed) {
      this.onSelectionChange?.();
    }
  }

  private spawnProjectile(
    startX: number,
    startY: number,
    startZ: number,
    targetId: string,
    type: Projectile['type'],
    damage: number,
    color: string,
    attackerId?: string
  ) {
    const id = `proj_${Date.now()}_${Math.random()}`;
    const proj: Projectile = {
      id,
      type,
      startX,
      startY,
      startZ,
      currentX: startX,
      currentY: startY,
      currentZ: startZ,
      targetEntityId: targetId,
      damage,
      speed: 18,
      progress: 0,
      color,
    };
    if (attackerId) (proj as any).attackerId = attackerId;
    this.projectiles.push(proj);

    const mesh = this.acquireProjectileMesh(type);
    mesh.position.set(startX, startY, startZ);
    mesh.rotation.set(0, 0, 0);
    this.projectileMeshes.set(id, { mesh, type });
  }

  private updateProjectiles(dt: number) {
    if (this.projectiles.length === 0) return;

    // Refresh the persistent O(1) lookup tables after unit/building simulation,
    // because production and destruction may have changed the entity arrays this frame.
    // The helper preserves Array.find's first-match behavior for duplicate IDs.
    this.rebuildCombatEntityLookups();
    const unitsById = this.combatUnitLookupById;
    const buildingsById = this.combatBuildingLookupById;
    const remaining: Projectile[] = [];

    for (const proj of this.projectiles) {
      const targetUnit = unitsById.get(proj.targetEntityId);
      const targetBldg = buildingsById.get(proj.targetEntityId);
      const target = targetUnit || targetBldg;

      if (!target || target.hp <= 0 || (target.type === 'unit' && (target as UnitEntity).garrisonedInBuildingId)) {
        this.releaseProjectileMesh(proj.id);
        continue;
      }

      const totalDist = getDistance(proj.startX, proj.startZ, target.x, target.z);
      const step = (proj.speed * dt) / Math.max(1, totalDist);
      proj.progress += step;

      if (proj.progress >= 1) {
        // Hit target!
        const attackerId = (proj as any).attackerId as string | undefined;
        const attacker = attackerId ? unitsById.get(attackerId) : undefined;
        let dmg: number;
        let directionalZone: 'flank' | 'rear' | null = null;
        if (target.type === 'building') {
          const targetBldg = target as BuildingEntity;
          if (attacker) {
            if (attacker.siegeTargetId === targetBldg.id) {
              attacker.siegeChannelTime = (attacker.siegeChannelTime || 0) + 0.8;
            } else {
              attacker.siegeTargetId = targetBldg.id;
              attacker.siegeChannelTime = 0;
            }
            dmg = calculateBuildingDamage(
              attacker,
              targetBldg,
              this.ageByFaction[targetBldg.faction] || 1,
              this.getResearchedTechs(targetBldg.faction),
              this.getResearchedTechs(attacker.faction),
              this.landmarksByFaction[attacker.faction] || [],
              this.factionHasSiegeSupply(attacker.faction)
            );
            const assault = getBuildingAssaultProfile(attacker);
            targetBldg.lastAttackerFaction = attacker.faction;
            if (assault.method === 'greek_fire') {
              dmg += this.applyGreekFireCone(attacker, targetBldg);
            }
          } else {
            const armor = getEffectiveBuildingArmor(targetBldg, this.ageByFaction[targetBldg.faction] || 1, this.getResearchedTechs(targetBldg.faction));
            dmg = Math.max(1, Math.round(proj.damage - armor * 0.65));
          }
          const isSiegeShot = attacker?.unitDef.category === 'siege' || proj.damage >= 20;
          this.spawnParticleBurst(target.x, 1.3, target.z, isSiegeShot ? 'smoke' : 'ember', isSiegeShot ? 7 : 4);
          if (isSiegeShot) {
            this.spawnParticleBurst(target.x, 1.1, target.z, 'stone', 5);
          }
        } else {
          dmg = getUnitVsUnitDamage(
            proj.damage,
            target as UnitEntity,
            proj.type === 'arrow' || proj.type === 'slash',
            this.simTime,
            attacker?.unitDef.stats.bonusVsCategory
          );
          if (attacker) {
            const directional = this.getUnitDirectionalAttack(
              attacker,
              target as UnitEntity,
              proj.startX,
              proj.startZ,
            );
            dmg = Math.max(1, Math.round(dmg * directional.multiplier));
            directionalZone = directional.zone === 'front' ? null : directional.zone;
          }
          this.spawnParticleBurst(
            target.x,
            1.1,
            target.z,
            proj.type === 'fireball' ? 'spark' : 'hit',
            6
          );
        }

        target.hp -= dmg;
        if (target.type === 'unit') {
          this.applyUnitMoraleImpact(target as UnitEntity, dmg, attacker, directionalZone);
          this.applyUnitSuppression(target as UnitEntity, proj.type, attacker);
        }
        this.creditMongolRaidTribute(attacker, target.type === 'building' ? 'building' : 'unit', target.hp <= 0);
        if (target.type === 'building') this.applyWallBreachIfNeeded(target as BuildingEntity, attacker?.unitDef.category === 'siege' || proj.damage >= 20);
        (target as any).lastDamagedTime = performance.now();
        (target as any).hitFlashTimer = 0.08;
        if (target.type === 'unit') {
          (target as UnitEntity).recoilTimer = 0.12;
        }
        if (this.isHumanControlled(target.faction)) {
          this.triggerUnderAttackAlert(target.x, target.z);
        }
        const directionalLabel = directionalZone === 'rear' ? '背襲 ' : directionalZone === 'flank' ? '側襲 ' : '';
        const damageColor = directionalZone === 'rear'
          ? '#fbbf24'
          : directionalZone === 'flank'
            ? '#c084fc'
            : target.type === 'building' && attacker?.unitDef.category === 'siege'
              ? '#fb923c'
              : '#f97316';
        this.addFloatingText(
          target.x,
          2.0,
          target.z,
          `${directionalLabel}-${dmg}`,
          damageColor
        );

        if (attacker) {
          this.awardUnitXp(attacker, 8);
          if (target.hp <= 0) {
            attacker.kills++;
            this.awardUnitXp(attacker, 35);
          }
        }

        this.releaseProjectileMesh(proj.id);
      } else {
        // Interpolate along arc
        proj.currentX = proj.startX + (target.x - proj.startX) * proj.progress;
        proj.currentZ = proj.startZ + (target.z - proj.startZ) * proj.progress;
        // Parabolic arc for arrows and fireballs
        const arc = Math.sin(proj.progress * Math.PI) * (proj.type === 'arrow' ? 3.5 : proj.type === 'slash' ? 0.6 : 1.2);
        proj.currentY = proj.startY + (1 - proj.startY) * proj.progress + arc;

        const entry = this.projectileMeshes.get(proj.id);
        if (entry) {
          entry.mesh.position.set(proj.currentX, proj.currentY, proj.currentZ);
          if (proj.type === 'slash') {
            entry.mesh.rotation.y += dt * 22;
          } else {
            entry.mesh.lookAt(target.x, 1, target.z);
          }
        }
        remaining.push(proj);
      }
    }

    this.projectiles = remaining;
  }

  private addFloatingText(x: number, y: number, z: number, text: string, color: string) {
    this.floatingTexts.push({
      id: `txt_${Math.random()}`,
      x,
      y,
      z,
      text,
      color,
      opacity: 1,
      lifespan: 1.0,
    });
  }

  private updateFloatingTexts(dt: number) {
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const txt = this.floatingTexts[i];
      txt.lifespan -= dt;
      txt.y += dt * 1.5;
      txt.opacity = Math.max(0, txt.lifespan / 1.0);
      if (txt.lifespan <= 0) {
        this.floatingTexts.splice(i, 1);
      }
    }
  }

  private updateSelectionVisuals() {
    // Hide old rings
    this.selectionRings.forEach((ring) => (ring.visible = false));

    // Show for currently selected units (skip sheltered units hidden inside buildings)
    this.selectedUnitIds.forEach((uid) => {
      const unit = this.units.find((u) => u.id === uid);
      if (!unit || unit.garrisonedInBuildingId) return;

      let ring = this.selectionRings.get(uid);
      if (!ring) {
        ring = createSelectionRing(0.9 * (unit.unitDef.visual.scale || 1));
        this.scene.add(ring);
        this.selectionRings.set(uid, ring);
      }
      ring.position.set(unit.x, 0.03, unit.z);
      ring.visible = true;
    });

    // Show for currently selected resource node
    if (this.selectedNodeId) {
      const node = this.resourceNodes.find((n) => n.id === this.selectedNodeId);
      if (node && node.amount > 0) {
        let nodeRing = this.selectionRings.get('node_' + node.id);
        if (!nodeRing) {
          nodeRing = createSelectionRing(node.resourceType === 'gold' ? 2.2 : node.resourceType === 'stone' ? 2.0 : 1.5);
          this.scene.add(nodeRing);
          this.selectionRings.set('node_' + node.id, nodeRing);
        }
        nodeRing.position.set(node.x, 0.03, node.z);
        nodeRing.visible = true;
      }
    }

    // Show for currently selected contested shrine
    if (this.selectedContestedPointId) {
      const point = this.contestedPoints.find((p) => p.id === this.selectedContestedPointId);
      if (point) {
        let shrineRing = this.selectionRings.get('shrine_' + point.id);
        if (!shrineRing) {
          shrineRing = createSelectionRing(2.9);
          this.scene.add(shrineRing);
          this.selectionRings.set('shrine_' + point.id, shrineRing);
        }
        shrineRing.position.set(point.x, 0.05, point.z);
        shrineRing.visible = true;
      }
    }

    // Update 3D Rally flag & dashed connection line
    this.updateRallyVisuals();
  }

  private animateUnitMesh(unit: UnitEntity, mesh: THREE.Group, dt: number) {
    const parts = mesh.userData.animParts as UnitAnimParts | undefined;
    if (!parts) return;

    const mType = unit.unitDef.visual.modelType;
    const isSiegeUnit = unit.unitDef.id === 'catapult' || mType === 'ram' || mType === 'cannon' || unit.unitDef.category === 'siege';
    const unitScale = unit.unitDef.visual.scale || 1;
    const baseBodyY =
      mType === 'knight'
        ? 0
        : mType === 'mage' || mType === 'oracle'
          ? 0.24
          : isSiegeUnit
            ? 0
            : 0.36;
    const hasVelocityIntent = unit.velocity.x !== 0 || unit.velocity.z !== 0;

    // Persistent smoothed joint & kinematic state per mesh -> zero foot-skating and fluid pose blending
    let anim = mesh.userData.animState as {
      yaw: number;
      prevYaw: number;
      prevX: number;
      prevZ: number;
      moveBlend: number;
      turnLean: number;
      gaitPhase: number;
      wheelRoll: number;
      lLegX: number;
      rLegX: number;
      lKneeX: number;
      rKneeX: number;
      rArmX: number;
      lArmX: number;
      bodyX: number;
      bodyY: number;
      bodyYaw: number;
      bodyZ: number;
      scaleY: number;
      horseHeadX: number;
    } | undefined;
    if (!anim) {
      anim = {
        yaw: mesh.rotation.y,
        prevYaw: mesh.rotation.y,
        prevX: unit.x,
        prevZ: unit.z,
        moveBlend: 0,
        turnLean: 0,
        gaitPhase: 0,
        wheelRoll: 0,
        lLegX: 0,
        rLegX: 0,
        lKneeX: 0,
        rKneeX: 0,
        rArmX: 0,
        lArmX: 0,
        bodyX: 0,
        bodyY: baseBodyY,
        bodyYaw: 0,
        bodyZ: 0,
        scaleY: 1,
        horseHeadX: 0,
      };
      mesh.userData.animState = anim;
    }

    let phaseSeed = 0;
    for (let i = 0; i < unit.id.length; i++) phaseSeed += unit.id.charCodeAt(i);
    const t = this.simTime + (phaseSeed % 17) * 0.23;

    // 0. Smooth shortest-arc yaw turning + subtle banking lean on tight corners
    let desiredYaw = anim.yaw;
    if (hasVelocityIntent) {
      desiredYaw = Math.atan2(unit.velocity.x, unit.velocity.z);
    } else if ((unit as any)._desiredYaw !== undefined) {
      desiredYaw = (unit as any)._desiredYaw;
    }
    anim.prevYaw = anim.yaw;
    anim.yaw = dampAngle(anim.yaw, desiredYaw, 14, dt);
    mesh.rotation.y = anim.yaw;

    let yawDelta = anim.yaw - anim.prevYaw;
    while (yawDelta > Math.PI) yawDelta -= Math.PI * 2;
    while (yawDelta < -Math.PI) yawDelta += Math.PI * 2;
    const rawTurnRate = dt > 0.0001 ? yawDelta / dt : 0;
    anim.turnLean = dampScalar(anim.turnLean, Math.max(-0.2, Math.min(0.2, -rawTurnRate * 0.024)), 12, dt);

    // Track exact post-collision displacement so stride cadence locks to ground velocity (zero ice-skating!)
    const distMoved = Math.hypot(unit.x - anim.prevX, unit.z - anim.prevZ);
    anim.prevX = unit.x;
    anim.prevZ = unit.z;
    const actualSpeed = dt > 0.0001 ? distMoved / dt : 0;
    const activelyTranslating = hasVelocityIntent && actualSpeed > 0.18;
    anim.moveBlend = dampScalar(anim.moveBlend, activelyTranslating ? 1 : 0, activelyTranslating ? 15 : 12, dt);

    // 0.5 Emissive Hit-Flash + Exclusive Saiyan Veteran Rank Halo + Buff Aura Ring
    const flashing = !!(unit.hitFlashTimer && unit.hitFlashTimer > 0);
    if (mesh.userData._wasFlashing !== flashing) {
      mesh.userData._wasFlashing = flashing;
      parts.hitMaterials.forEach((mat) => {
        mat.emissive.setHex(flashing ? 0xffffff : 0x000000);
        mat.emissiveIntensity = flashing ? 0.65 : 0;
      });
    }
    const xpEligible = canUnitGainXp(unit.unitDefId, this.getCivilizationForFaction(unit.faction));
    if (parts.veteranHalo) {
      const veteranLevel = unit.level || 1;
      const isVet = xpEligible && veteranLevel >= 2;
      parts.veteranHalo.visible = isVet;
      if (isVet) {
        parts.veteranHalo.rotation.z = t * 1.9;
        parts.veteranHalo.scale.setScalar(1 + Math.min(0.24, Math.max(0, veteranLevel - 2) * 0.08));
      }
    }
    if (parts.buffRing) {
      const hasBuff = !!(unit.buffSpeedUntil && unit.buffSpeedUntil > this.simTime);
      parts.buffRing.userData.batchVisible = hasBuff;
      parts.buffRing.visible = parts.buffRing.userData.instancedBatch === true ? false : hasBuff;
      if (hasBuff) {
        const baseScale = Number(parts.buffRing.userData.baseScale) || unitScale;
        parts.buffRing.scale.setScalar(baseScale * (1 + Math.sin(t * 7) * 0.08));
      }
    }

    // 1. Carried resource bundle visibility & tint
    const isCarrying = unit.state === 'returning_resource' && !!unit.carryingResource;
    if (parts.carryBundle) {
      if (isCarrying && unit.carryingResource) {
        parts.carryBundle.visible = true;
        const bMat = parts.carryBundle.material as THREE.MeshStandardMaterial;
        const rType = unit.carryingResource.type;
        bMat.color.setHex(
          rType === 'wood'
            ? 0x92400e
            : rType === 'gold'
            ? 0xfbbf24
            : rType === 'stone'
            ? 0x94a3b8
            : 0x4ade80
        );
      } else {
        parts.carryBundle.visible = false;
      }
    }

    // 2. Saiyan aura / Mage orb continuous shimmer (Saiyan aura scales with Awakening Level)
    if (parts.auraMesh) {
      const lvlBoost = xpEligible ? 1 + ((unit.level || 1) - 1) * 0.12 : 1;
      const pulse = lvlBoost * (1 + Math.sin(t * 6.5) * 0.14);
      parts.auraMesh.scale.setScalar(pulse);
      parts.auraMesh.rotation.z = t * 2.5;
    }

    // 3. Smooth Eased Multi-Phase Attack Swing + Torso Twist Follow-through
    let swingTargetArm = 0;
    let swingBodyLean = 0;
    let swingTorsoYaw = 0;
    const swingTimer = (unit as any)._attackSwing || 0;
    if (swingTimer > 0) {
      const next = Math.max(0, swingTimer - dt);
      (unit as any)._attackSwing = next;
      const p = 1 - next / 0.36; // 0 -> 1
      if (p < 0.28) {
        const w = 0.5 - 0.5 * Math.cos((p / 0.28) * Math.PI);
        swingTargetArm = 0.65 * w;
        swingBodyLean = -0.15 * w;
        swingTorsoYaw = -0.28 * w;
      } else if (p < 0.65) {
        const s = 0.5 - 0.5 * Math.cos(((p - 0.28) / 0.37) * Math.PI);
        swingTargetArm = 0.65 - 2.25 * s;
        swingBodyLean = -0.15 + 0.45 * s;
        swingTorsoYaw = -0.28 + 0.62 * s;
      } else {
        const r = 0.5 - 0.5 * Math.cos(((p - 0.65) / 0.35) * Math.PI);
        swingTargetArm = -1.6 * (1 - r);
        swingBodyLean = 0.3 * (1 - r);
        swingTorsoYaw = 0.34 * (1 - r);
      }
    }

    const recoilLean = unit.recoilTimer && unit.recoilTimer > 0 ? -Math.sin((unit.recoilTimer / 0.14) * Math.PI) * 0.24 : 0;

    // 4. Target Joint Angles by Action State (distance-locked stride + knee lift + rolling wheels)
    let tgtLLeg = 0;
    let tgtRLeg = 0;
    let tgtLKnee = 0;
    let tgtRKnee = 0;
    let tgtRArm = 0;
    let tgtLArm = 0;
    let tgtBodyX = 0;
    let tgtBodyYaw = 0;
    let tgtBodyZ = anim.turnLean;
    let tgtBodyY = baseBodyY;
    let tgtScaleY = 1;
    let tgtHorseHead = 0;

    if (anim.moveBlend > 0.04) {
      anim.gaitPhase += computeStridePhaseDelta(distMoved, unitScale, mType === 'knight');
      if (parts.wheels && distMoved > 0) {
        anim.wheelRoll += distMoved / (0.24 * unitScale);
      }

      if (mType === 'knight') {
        // 4-Beat Gallop/Canter: front pair & hind pair phase offset with knee tuck & horse barrel pitch
        const fSin = Math.sin(anim.gaitPhase) * anim.moveBlend;
        const hSin = Math.sin(anim.gaitPhase + 0.65) * anim.moveBlend;
        tgtLLeg = fSin * 0.78;
        tgtRLeg = -hSin * 0.72;
        tgtLKnee = Math.max(0, Math.cos(anim.gaitPhase)) * 0.68 * anim.moveBlend;
        tgtRKnee = Math.max(0, -Math.cos(anim.gaitPhase + 0.65)) * 0.62 * anim.moveBlend;
        tgtRArm = -0.22 + fSin * 0.16; // Lance held poised while bracing reins
        tgtLArm = -0.34 - hSin * 0.14;
        tgtBodyY = baseBodyY + Math.abs(Math.sin(anim.gaitPhase * 0.5)) * 0.08 * anim.moveBlend;
        tgtBodyX = (0.09 + Math.cos(anim.gaitPhase) * 0.075) * anim.moveBlend;
        tgtBodyYaw = -fSin * 0.05;
        tgtHorseHead = Math.sin(anim.gaitPhase - 0.5) * 0.2 * anim.moveBlend;
      } else if (isSiegeUnit) {
        // Wheeled Siege Roll: steady chassis timber vibration + arm ready
        tgtBodyY = baseBodyY + Math.abs(Math.sin(anim.gaitPhase * 2)) * 0.018 * anim.moveBlend;
        tgtBodyX = Math.sin(anim.gaitPhase * 2) * 0.02 * anim.moveBlend;
        tgtRArm = mType === 'ram' || mType === 'cannon' ? 0 : swingTimer > 0 ? swingTargetArm * 0.65 : 0;
        if (parts.rightArmPivot) parts.rightArmPivot.position.z = mType === 'cannon' ? 0.18 : 0;
      } else {
        // Biped Grounded Walk/Run with True Knee Lift, Pelvis Twist, & Arm Counter-Swing
        const strideL = Math.sin(anim.gaitPhase) * anim.moveBlend;
        const strideR = -strideL;
        tgtLLeg = strideL * 0.68;
        tgtRLeg = strideR * 0.68;
        // Knee bends positively (shin tucks back) during forward swing recovery so feet clear ground cleanly
        tgtLKnee = Math.max(0, Math.cos(anim.gaitPhase)) * 0.86 * anim.moveBlend;
        tgtRKnee = Math.max(0, -Math.cos(anim.gaitPhase)) * 0.86 * anim.moveBlend;

        if (isCarrying) {
          // Bracing backpack load with slight forward hunch
          tgtRArm = -0.35 - strideL * 0.18;
          tgtLArm = -0.35 - strideR * 0.18;
          tgtBodyX = 0.2 * anim.moveBlend;
        } else if (mType === 'ninja') {
          tgtRArm = 0.56 - strideL * 0.22;
          tgtLArm = 0.56 + strideL * 0.22;
          tgtBodyX = 0.3 * anim.moveBlend;
        } else {
          tgtRArm = -strideL * 0.58;
          tgtLArm = strideL * 0.58;
          tgtBodyX = (mType === 'saiyan' ? 0.18 : 0.13) * anim.moveBlend;
        }

        // Ground-contact vertical CoM bounce: dips gently on heel strike, rises smoothly at passing stance
        const doubleFreq = Math.abs(Math.cos(anim.gaitPhase));
        tgtBodyY = baseBodyY + (-0.028 + doubleFreq * 0.056) * anim.moveBlend;
        tgtBodyZ += Math.cos(anim.gaitPhase) * 0.052 * anim.moveBlend;
        tgtBodyYaw = -strideL * 0.14;
      }
    } else if (unit.state === 'gathering') {
      const gSub = (unit as any)._gatherNodeType as string | undefined;
      if (gSub === 'shore_fish' || gSub === 'deep_fish') {
        // Bank angling / net-casting pull rhythm
        const cast = 0.5 + 0.5 * Math.sin(t * 5.8);
        tgtRArm = 0.45 - cast * 1.15;
        tgtLArm = -0.3 - (1 - cast) * 0.4;
        tgtBodyX = 0.14 + cast * 0.12;
        tgtBodyYaw = (cast - 0.5) * 0.18;
        tgtLLeg = 0.18;
        tgtRLeg = -0.18;
        tgtLKnee = 0.22;
      } else if (gSub === 'berry' || gSub === 'farm' || gSub === 'hunt') {
        // Low crouching forage / harvest rhythm
        const harvest = 0.5 + 0.5 * Math.sin(t * 7.2);
        tgtRArm = -0.45 - harvest * 0.62;
        tgtLArm = -0.38 - (1 - harvest) * 0.45;
        tgtBodyX = 0.32 + harvest * 0.14;
        tgtBodyY = baseBodyY - 0.06;
        tgtLLeg = 0.28;
        tgtRLeg = -0.22;
        tgtLKnee = 0.45;
        tgtRKnee = 0.35;
      } else {
        // Crisp overhead wood-chop or pickaxe strike cadence
        const raw = 0.5 + 0.5 * Math.sin(t * 9.0);
        const strike = Math.pow(raw, 2.0);
        tgtRArm = 0.55 - strike * 1.65;
        tgtLArm = -0.26 - strike * 0.34;
        tgtBodyX = 0.1 + strike * 0.24;
        tgtBodyYaw = (0.5 - strike) * 0.26;
        tgtLLeg = 0.2;
        tgtRLeg = -0.2;
        tgtLKnee = 0.18;
      }
    } else if (unit.state === 'building' || unit.state === 'assembling') {
      // Carpenter hammer windup -> decisive nail-strike cadence synced to particle & sound bursts
      const hPhase = (unit as any)._hammerPhase !== undefined ? (unit as any)._hammerPhase : t * 9.8;
      const raw = 0.5 - 0.5 * Math.cos(hPhase);
      const hammer = Math.pow(raw, 1.65);
      tgtRArm = 0.62 - hammer * 1.82;
      tgtLArm = -0.44 - Math.sin(hPhase) * 0.08;
      tgtBodyX = 0.08 + hammer * 0.24;
      tgtBodyYaw = (0.45 - hammer) * 0.26;
      tgtBodyY = baseBodyY - hammer * 0.035;
      tgtLLeg = 0.2;
      tgtRLeg = -0.2;
      tgtLKnee = 0.22;
      tgtRKnee = 0.14;
    } else if (unit.state === 'attacking') {
      if (isSiegeUnit) {
        if (mType === 'ram') {
          const pulse = swingTimer > 0 ? Math.sin((1 - swingTimer / 0.36) * Math.PI) : 0;
          parts.rightArmPivot.position.z = pulse * 0.44;
          tgtRArm = 0;
          tgtBodyX = pulse * 0.04;
        } else if (mType === 'cannon') {
          const kick = swingTimer > 0 ? Math.sin((1 - swingTimer / 0.36) * Math.PI) : 0;
          parts.rightArmPivot.position.z = 0.18 - kick * 0.28;
          tgtRArm = -kick * 0.16;
          tgtBodyX = -kick * 0.08;
        } else {
          tgtRArm = swingTimer > 0 ? swingTargetArm * 0.85 : 0;
          tgtBodyX = swingTimer > 0 ? -swingBodyLean * 0.2 : 0;
        }
      } else if (mType === 'archer' || mType === 'mage') {
        tgtLArm = -1.12;
        tgtRArm = -0.68 + swingTargetArm * 0.45;
        tgtBodyX = -swingBodyLean * 0.35;
        tgtBodyYaw = swingTorsoYaw * 0.4;
      } else {
        const readyBreath = Math.sin(t * 4.2) * 0.05;
        tgtRArm = -0.45 + swingTargetArm + readyBreath;
        tgtLArm = -0.6 - swingTargetArm * 0.22;
        tgtBodyX = 0.08 + swingBodyLean;
        tgtBodyYaw = swingTorsoYaw;
      }
      tgtBodyY = baseBodyY + (isSiegeUnit ? 0 : Math.sin(t * 4.5) * 0.03);
      tgtLLeg = 0.26;
      tgtRLeg = -0.26;
      tgtLKnee = 0.16;
      tgtScaleY = swingTimer > 0 && !isSiegeUnit ? 0.95 : 1;
    } else {
      // Calm grounded breathing idle
      tgtRArm = Math.sin(t * 2.1) * 0.06;
      tgtLArm = -Math.sin(t * 2.1) * 0.06;
      tgtBodyY = baseBodyY + (isSiegeUnit ? 0 : Math.sin(t * 2.4) * 0.022);
      tgtHorseHead = Math.sin(t * 1.8) * 0.055;
      if (mType === 'ram') parts.rightArmPivot.position.z = 0;
      else if (mType === 'cannon') parts.rightArmPivot.position.z = 0.18;
    }

    tgtBodyX += recoilLean;

    // 5. Exponentially damp all joints for silky action continuity
    const kLimb = activelyTranslating ? 22 : 14;
    anim.lLegX = dampScalar(anim.lLegX, tgtLLeg, kLimb, dt);
    anim.rLegX = dampScalar(anim.rLegX, tgtRLeg, kLimb, dt);
    anim.lKneeX = dampScalar(anim.lKneeX, tgtLKnee, kLimb, dt);
    anim.rKneeX = dampScalar(anim.rKneeX, tgtRKnee, kLimb, dt);
    anim.rArmX = dampScalar(anim.rArmX, tgtRArm, 22, dt);
    anim.lArmX = dampScalar(anim.lArmX, tgtLArm, 18, dt);
    anim.bodyX = dampScalar(anim.bodyX, tgtBodyX, 16, dt);
    anim.bodyYaw = dampScalar(anim.bodyYaw, tgtBodyYaw, 18, dt);
    anim.bodyZ = dampScalar(anim.bodyZ, tgtBodyZ, 14, dt);
    anim.bodyY = dampScalar(anim.bodyY, tgtBodyY, 16, dt);
    anim.scaleY = dampScalar(anim.scaleY, tgtScaleY, 18, dt);
    anim.horseHeadX = dampScalar(anim.horseHeadX, tgtHorseHead, 14, dt);

    if (parts.leftLeg) parts.leftLeg.rotation.x = anim.lLegX;
    if (parts.rightLeg) parts.rightLeg.rotation.x = anim.rLegX;
    if (parts.leftKnee) parts.leftKnee.rotation.x = anim.lKneeX;
    if (parts.rightKnee) parts.rightKnee.rotation.x = anim.rKneeX;
    if (parts.wheels) {
      for (let w = 0; w < parts.wheels.length; w++) {
        parts.wheels[w].rotation.x = anim.wheelRoll;
      }
    }
    if (parts.robeSkirt) {
      parts.robeSkirt.rotation.x = -anim.bodyX * 0.45 + Math.sin(anim.gaitPhase) * 0.06 * anim.moveBlend;
    }
    if (parts.horseTail) {
      parts.horseTail.rotation.x = 0.15 + anim.moveBlend * 0.42 + Math.sin(t * 4.5) * 0.08;
    }
    parts.rightArmPivot.rotation.x = anim.rArmX;
    if (parts.leftArmPivot) parts.leftArmPivot.rotation.x = anim.lArmX;
    parts.bodyPivot.rotation.x = anim.bodyX;
    parts.bodyPivot.rotation.y = anim.bodyYaw;
    parts.bodyPivot.rotation.z = anim.bodyZ;
    parts.bodyPivot.position.y = anim.bodyY;
    parts.bodyPivot.scale.y = anim.scaleY;
    if (parts.horseHead) parts.horseHead.rotation.x = anim.horseHeadX;

    // Secondary motion follows gait and wind-like idle drift without changing simulation state.
    const secondaryMotionParts = mesh.userData.secondaryMotionParts as Array<{
      object: THREE.Object3D;
      axis: 'x' | 'y' | 'z';
      amplitude: number;
      frequency: number;
      phase: number;
      baseRotation: THREE.Euler;
    }> | undefined;
    secondaryMotionParts?.forEach((part) => {
      const rhythm = t * part.frequency + part.phase + anim.gaitPhase * 0.22;
      const movementGain = 0.22 + anim.moveBlend * 0.95;
      const flutter = Math.sin(rhythm) * part.amplitude * movementGain;
      part.object.rotation[part.axis] = part.baseRotation[part.axis] + flutter;
    });
  }

  // ------------------ AI TACTICS EVALUATOR ------------------

  private findSafeAiBuildSpot(
    anchorX: number,
    anchorZ: number,
    bType: BuildingType,
    preferredAngle?: number,
    minDist = 7.5,
    maxDist = 17
  ): { x: number; z: number } | null {
    const bDef = DEFAULT_BUILDINGS[bType];
    if (!bDef) return null;
    const obs = this.getTerrainNavObstacles();
    const baseAngle = preferredAngle ?? Math.random() * Math.PI * 2;
    const radialStep = bType === 'dock' ? 3.2 : 2.6;
    const angSamples = bType === 'dock' ? 24 : 12;

    for (let r = minDist; r <= maxDist; r += radialStep) {
      for (let i = 0; i < angSamples; i++) {
        const sign = i % 2 === 0 ? 1 : -1;
        const offset = Math.ceil(i / 2) * ((Math.PI * 2) / angSamples) * sign;
        const ang = baseAngle + offset;
        const cx = Math.max(-86, Math.min(86, anchorX + Math.cos(ang) * r));
        const cz = Math.max(-86, Math.min(86, anchorZ + Math.sin(ang) * r));
        if (
          isPlacementLocationValid(
            cx,
            cz,
            bDef.size,
            this.buildings,
            this.resourceNodes,
            !!bDef.isWall,
            obs?.rects,
            obs?.discs,
            obs?.bridges,
            bType
          )
        ) {
          return { x: cx, z: cz };
        }
      }
    }
    return null;
  }

  private tryAiConstructBuilding(
    aiId: FactionId,
    bType: BuildingType,
    aiWorkers: UnitEntity[],
    anchorX: number,
    anchorZ: number,
    preferredAngle?: number,
    minDist = 7.5,
    maxDist = 17
  ): boolean {
    const bDef = DEFAULT_BUILDINGS[bType];
    const aiRes = this.getResourcesForFaction(aiId);
    const aiAge = this.ageByFaction[aiId] || 1;
    const aiCiv = getCivilizationConfig(this.getCivilizationForFaction(aiId));
    if (!bDef || !isBuildingBuildableForCiv(bType, aiCiv.id, aiAge) || !canAfford(aiRes, bDef.cost)) return false;

    const builder =
      aiWorkers.find((w) => w.hp > 0 && w.state === 'idle') ||
      aiWorkers.find((w) => w.hp > 0 && w.state !== 'building' && w.state !== 'returning_resource');
    if (!builder) return false;

    const spot = this.findSafeAiBuildSpot(anchorX, anchorZ, bType, preferredAngle, minDist, maxDist);
    if (!spot) return false;

    this.resourcesByFaction[aiId] = deductCost(aiRes, bDef.cost);
    this.syncHumanResourcesAlias();
    const nb = this.addBuilding(bType, aiId, spot.x, spot.z, false);
    builder.targetBuildingId = nb.id;
    builder.targetResourceNodeId = undefined;
    builder.waypoints = undefined;
    builder.state = 'building';
    builder.currentActionText = `🔨 AI建造${bDef.name.split(' ')[0]}`;
    return true;
  }

  private resolveAiTrainRequest(
    aiId: FactionId,
    aiCiv: ReturnType<typeof getCivilizationConfig>,
    rawTargetId: string,
    aiBuildings: BuildingEntity[]
  ): boolean {
    let unitDefId = rawTargetId;
    if (rawTargetId === 'villager') {
      unitDefId = aiCiv.workerUnitId;
    } else if (rawTargetId === 'swordsman') {
      unitDefId = aiCiv.starterMeleeUnitId;
    } else if (rawTargetId === 'longbowman') {
      unitDefId = aiCiv.starterRangedUnitId;
    } else if (rawTargetId === 'knight') {
      unitDefId = resolveAiKnightUnitId(aiCiv.id);
    } else if (rawTargetId === 'battering_ram') {
      unitDefId = 'battering_ram';
    } else if (rawTargetId === 'bombard_cannon') {
      unitDefId = 'bombard_cannon';
    } else if (rawTargetId === 'catapult') {
      unitDefId = aiCiv.id === 'fantasy' ? 'fantasy_treant' : 'catapult';
    }

    const aiAge = this.ageByFaction[aiId] || 1;
    const uDef = this.findUnitDef(unitDefId, aiId);
    if (!uDef || (uDef.requiredAge && aiAge < uDef.requiredAge)) return false;

    const candidates = aiBuildings
      .filter(
        (b) =>
          b.isConstructed &&
          b.hp > 0 &&
          b.queue.length < 3 &&
          b.buildingDef.trainableUnits.includes(unitDefId)
      )
      .sort((a, b) => a.queue.length - b.queue.length);

    if (candidates.length > 0) {
      return this.trainUnit(candidates[0].id, unitDefId);
    }
    return false;
  }

  private getAiUnitGroupsByFaction(): Map<string, UnitEntity[]> {
    if (this.aiUnitGroupsSource !== this.units || this.aiUnitGroupsLength !== this.units.length) {
      this.aiUnitGroupsByFaction = groupEntitiesByFaction(this.units);
      this.aiUnitGroupsSource = this.units;
      this.aiUnitGroupsLength = this.units.length;
    }
    return this.aiUnitGroupsByFaction;
  }

  private getAiBuildingGroupsByFaction(): Map<string, BuildingEntity[]> {
    if (this.aiBuildingGroupsSource !== this.buildings || this.aiBuildingGroupsLength !== this.buildings.length) {
      this.aiBuildingGroupsByFaction = groupEntitiesByFaction(this.buildings);
      this.aiBuildingGroupsSource = this.buildings;
      this.aiBuildingGroupsLength = this.buildings.length;
    }
    return this.aiBuildingGroupsByFaction;
  }

  private evaluateAiLogic(onlyFactionId?: FactionId) {
    const unitsByFaction = this.getAiUnitGroupsByFaction();
    const buildingsByFaction = this.getAiBuildingGroupsByFaction();
    const modRules = this.activeMods.flatMap((m) => (m.enabled ? m.aiRules : []));
    const standardRules = modRules.length > 0 ? modRules : DEFAULT_AI_RULES;

    for (const participant of this.participants) {
      if (participant.controller !== 'ai' || (onlyFactionId && participant.id !== onlyFactionId)) continue;

      const personality = participant.aiPersonality || 'standard';
      const activeRules =
        personality === 'defensive'
          ? DEFENSIVE_AI_RULES
          : personality === 'easy'
          ? EASY_AI_RULES
          : personality === 'hard'
          ? HARD_AI_RULES
          : standardRules;

      const aiId = participant.id;
      const aiTeam = participant.team;
      const aiCiv = getCivilizationConfig(participant.civilization);
      const aiRes = this.getResourcesForFaction(aiId);

      const aiUnits = (unitsByFaction.get(aiId) || []).filter((unit) => unit.hp > 0);
      const aiNavalBoats = aiUnits.filter((u) => u.unitDef.category === 'worker' && (!!u.unitDef.isNaval || u.unitDefId === 'fishing_boat'));
      const aiWorkers = aiUnits.filter(
        (u) => u.unitDef.category === 'worker' && !u.unitDef.isNaval && u.unitDefId !== 'fishing_boat'
      );
      const aiActiveWorkers = aiWorkers.filter((u) => !u.garrisonedInBuildingId);
      const aiArmy = aiUnits.filter((u) => u.unitDef.category !== 'worker' && !u.garrisonedInBuildingId);
      const aiBuildings = (buildingsByFaction.get(aiId) || []).filter((building) => building.hp > 0);
      const aiTC = aiBuildings.find((b) => b.buildingType === 'town_center');
      const aiBarracksList = aiBuildings.filter((b) => b.buildingType === 'barracks');
      const aiArcheryList = aiBuildings.filter((b) => b.buildingType === 'archery_range');
      const aiStableList = aiBuildings.filter((b) => b.buildingType === 'stable');
      const aiSiegeWorkshopList = aiBuildings.filter((b) => b.buildingType === 'siege_workshop');
      const aiDocks = aiBuildings.filter((b) => b.buildingType === 'dock');
      const aiUniqueBldg = aiBuildings.find((b) => b.buildingType === aiCiv.uniqueBuildingType);

      if (!aiTC && aiWorkers.length === 0 && aiArmy.length === 0) continue;

      // Auto-assign idle AI fishing boats to deep/shore fish
      for (const boat of aiNavalBoats) {
        if (boat.state === 'idle') {
          const fishNode = findBestFoodResourceNode(boat.x, boat.z, this.resourceNodes, 120, true, true);
          if (fishNode) {
            boat.targetResourceNodeId = fishNode.id;
            boat.waypoints = undefined;
            boat.state = 'gathering';
            boat.currentActionText = '⛵ 前往捕魚';
          }
        }
      }

      const aiPop = this.getPopulationStats(aiId);
      const aiMaxPop = aiPop.max;
      const aiAge = this.ageByFaction[aiId] || 1;

      // Mongol AI keeps each Ovoo in Yam mode for production, healing, or nearby threats;
      // sacred extraction is preferred only when the local area is safe and a mine is nearby.
      if (aiCiv.id === 'mongol') {
        for (const ovoo of aiBuildings.filter((building) => building.buildingType === 'ovoo_relay' && building.isConstructed)) {
          const nearEnemy = hasNearbyHostileUnit(
            ovoo,
            this.units,
            (enemy) => this.isHostile(ovoo, enemy),
            18,
          );
          const nearMine = this.resourceNodes.some((node) =>
            node.amount > 0 && (node.resourceType === 'gold' || node.resourceType === 'stone') &&
            getDistance(ovoo.x, ovoo.z, node.x, node.z) <= 14
          );
          const activeProduction = aiBuildings.some((building) => building.id !== ovoo.id &&
            (building.queue.length > 0 || !!building.activeTechId) &&
            getDistance(ovoo.x, ovoo.z, building.x, building.z) <= 16
          );
          const wounded = aiArmy.some((unit) => unit.hp > 0 && unit.hp < unit.maxHp * 0.85 &&
            !unit.garrisonedInBuildingId &&
            getDistance(ovoo.x, ovoo.z, unit.x, unit.z) <= 13.5
          );
          const nearbyFriendlyArmy = aiArmy.some((unit) =>
            unit.hp > 0 && !unit.garrisonedInBuildingId &&
            getDistance(ovoo.x, ovoo.z, unit.x, unit.z) <= 16
          );
          const policy = evaluateMongolOvooPolicy({
            currentMode: ovoo.ovooMode ?? 'yam_relay',
            hasNearbyHostiles: nearEnemy,
            hasNearbyMine: nearMine,
            hasActiveProduction: activeProduction,
            hasWoundedArmy: wounded,
            hasNearbyFriendlyArmy: nearbyFriendlyArmy,
            hornCooldown: ovoo.ovooHornCooldown ?? 0,
          });
          if (policy.shouldChangeMode) this.toggleOvooMode(ovoo.id);
          if (policy.shouldTriggerWarHorn) this.triggerOvooWarHorn(ovoo.id);
        }
      }

      // Auto-trigger special abilities in combat for AI army units
      for (const u of aiArmy) {
        if (u.hp > 0 && u.unitDef.specialAbility && u.abilityCooldown <= 0 && u.state === 'attacking') {
          this.activateUnitAbility(u);
        }
      }

      // Build each AI's live hostile rosters once, then reuse them throughout this planning pass.
      const aiReference = { faction: aiId, team: aiTeam };
      const aiHostileUnits = this.units.filter(
        (unit) => unit.hp > 0 && this.isHostile(aiReference, unit),
      );
      const aiHostileBuildings = this.buildings.filter(
        (building) => building.hp > 0 && this.isHostile(aiReference, building),
      );

      const anchorX = aiTC?.x ?? aiBuildings[0]?.x ?? 0;
      const anchorZ = aiTC?.z ?? aiBuildings[0]?.z ?? 0;
      const toCenterAngle = Math.atan2(-anchorZ, -anchorX);

      // 1. Evaluate threats near base & recently attacked entities
      let underAttack = 0;
      let nearestEnemyDist = 60;
      let baseThreat: UnitEntity | null = null;
      for (const enemy of aiHostileUnits) {
        if (enemy.hp <= 0 || enemy.garrisonedInBuildingId) continue;
        const dBase = getDistance(anchorX, anchorZ, enemy.x, enemy.z);
        if (dBase < nearestEnemyDist) {
          nearestEnemyDist = dBase;
          baseThreat = enemy;
        }
      }
      const nowMs = performance.now();
      const recentBaseDmg = aiBuildings.some((b) => (b as any).lastDamagedTime && nowMs - (b as any).lastDamagedTime < 3500);
      const recentUnitDmg = aiUnits.some(
        (u) => u.lastDamagedTime && nowMs - u.lastDamagedTime < 3000 && getDistance(anchorX, anchorZ, u.x, u.z) < 28
      );
      if (nearestEnemyDist < 20 || recentBaseDmg || recentUnitDmg) {
        underAttack = 1;
      }

      // Use any surviving garrison-capable building; a destroyed Town Center must not disable retreats.
      if (underAttack === 1) {
        const aiShelters = aiBuildings
          .filter((b) => b.hp > 0 && b.isConstructed && getBuildingMaxGarrison(b) > 0)
          .map((b) => {
            const incoming = countPendingGarrisonReservations(b.id, b.faction, aiUnits);
            return {
              id: b.id,
              x: b.x,
              z: b.z,
              bldg: b,
              freeSlots: getAvailableGarrisonSlots(
                getBuildingMaxGarrison(b),
                b.garrisonedUnitIds?.length || 0,
                incoming
              ),
            };
          })
          .filter((s) => s.freeSlots > 0);
        if (aiShelters.length > 0) {
          const exposed = aiActiveWorkers.filter(
            (w) =>
              w.state !== 'building' &&
              w.state !== 'garrisoning' &&
              getDistance(anchorX, anchorZ, w.x, w.z) <= 22
          ).slice(0, 5);
          for (const ew of exposed) {
            const open = selectNearestGarrisonShelter(ew.x, ew.z, aiShelters);
            if (!open) break;
            open.freeSlots--;
            ew.targetGarrisonBuildingId = open.bldg.id;
            ew.targetResourceNodeId = undefined;
            ew.targetEntityId = undefined;
            ew.targetBuildingId = undefined;
            ew.waypoints = undefined;
            ew.pathGoal = undefined;
            ew.attackMoveGoal = null;
            ew.state = 'garrisoning';
            ew.currentActionText = '🔔 緊急避難';
          }
        }

        // Preserve expensive frontline troops: critically wounded non-siege units retreat
        // to the nearest available friendly shelter instead of fighting to the last HP.
        const vulnerableArmy = aiArmy
          .filter(
            (unit) =>
              unit.state !== 'garrisoning' &&
              !unit.garrisonedInBuildingId &&
              shouldAiUnitSeekShelter(unit.hp, unit.maxHp, unit.unitDef.category, personality) &&
              getDistance(anchorX, anchorZ, unit.x, unit.z) <= 28
          )
          .sort(
            (a, b) =>
              a.hp / Math.max(1, a.maxHp) - b.hp / Math.max(1, b.maxHp) ||
              getDistance(a.x, a.z, anchorX, anchorZ) - getDistance(b.x, b.z, anchorX, anchorZ)
          );

        for (const wounded of vulnerableArmy) {
          const open = selectNearestGarrisonShelter(wounded.x, wounded.z, aiShelters);
          if (!open) break;
          open.freeSlots--;

          wounded.targetGarrisonBuildingId = open.bldg.id;
          wounded.targetEntityId = undefined;
          wounded.targetBuildingId = undefined;
          wounded.targetResourceNodeId = undefined;
          wounded.attackMoveGoal = null;
          wounded.wallPatrolRoute = undefined;
          wounded.wallPatrolIndex = undefined;
          wounded.waypoints = undefined;
          wounded.pathGoal = undefined;
          wounded.pathCooldown = 0;
          wounded.state = 'garrisoning';
          wounded.currentActionText = '🛡️ 戰損撤退 · 尋找掩體';
        }
      } else if (nearestEnemyDist > 26 && !recentBaseDmg && !recentUnitDmg) {
        for (const b of aiBuildings) {
          if (b.garrisonedUnitIds && b.garrisonedUnitIds.length > 0) {
            this.ungarrisonRecoveredAiUnits(b.id, 0.72);
          }
        }
      }

      // Cavalry operating away from the base also need a way to break contact.
      // Only evaluate already-wounded riders, then compare local combat numbers
      // so healthy scouts and evenly matched charges are not pulled out of battle.
      const disengagingCavalry = aiArmy
        .filter(
          (unit) =>
            unit.unitDef.category === 'cavalry' &&
            unit.hp > 0 &&
            !unit.garrisonedInBuildingId &&
            unit.state !== 'garrisoning' &&
            unit.hp / Math.max(1, unit.maxHp) <= (personality === 'defensive' ? 0.58 : 0.5)
        )
        .map((unit) => {
          const nearbyUnits = queryCombatSpatialIndex(
            this.combatSpatialIndex!,
            unit.x,
            unit.z,
            11.5,
            this.cavalryRetreatQueryScratch,
          ).units;
          const { nearbyEnemyCount, nearbyAllyCount } = countNearbyCombatForces(
            nearbyUnits,
            aiId,
            (enemy) => this.isHostile({ faction: aiId, team: aiTeam }, enemy),
          );
          return {
            unit,
            shouldDisengage: shouldAiCavalryDisengage({
              hp: unit.hp,
              maxHp: unit.maxHp,
              nearbyEnemyCount,
              nearbyAllyCount,
              personality,
            }),
          };
        })
        .filter((entry) => entry.shouldDisengage)
        .sort(
          (a, b) =>
            a.unit.hp / Math.max(1, a.unit.maxHp) -
            b.unit.hp / Math.max(1, b.unit.maxHp)
        );

      if (disengagingCavalry.length > 0) {
        const fieldShelters = aiBuildings
          .filter((building) => building.hp > 0 && building.isConstructed && getBuildingMaxGarrison(building) > 0)
          .map((building) => ({
            id: building.id,
            x: building.x,
            z: building.z,
            bldg: building,
            freeSlots: getAvailableGarrisonSlots(
              getBuildingMaxGarrison(building),
              building.garrisonedUnitIds?.length || 0,
              countPendingGarrisonReservations(building.id, building.faction, aiUnits)
            ),
          }))
          .filter((shelter) => shelter.freeSlots > 0);

        for (const entry of disengagingCavalry) {
          const rider = entry.unit;
          const shelter = selectNearestGarrisonShelter(rider.x, rider.z, fieldShelters);
          if (!shelter) continue;
          shelter.freeSlots--;
          this.clearFormationMovement(rider);
          rider.targetGarrisonBuildingId = shelter.bldg.id;
          rider.targetEntityId = undefined;
          rider.targetBuildingId = undefined;
          rider.targetResourceNodeId = undefined;
          rider.attackMoveGoal = null;
          rider.commandQueue = undefined;
          rider.wallPatrolRoute = undefined;
          rider.wallPatrolIndex = undefined;
          rider.waypoints = undefined;
          rider.pathGoal = undefined;
          rider.pathCooldown = 0;
          rider.velocity = { x: 0, z: 0 };
          rider.state = 'garrisoning';
          rider.currentActionText = '🐎 騎兵脫戰 · 反包圍撤退';
        }
      }

      const enemyArmyCount = aiHostileUnits.filter(
        (unit) => unit.hp > 0 && !unit.garrisonedInBuildingId && unit.unitDef.category !== 'worker',
      ).length;


      // 1b. Map control: contested shrines + deny high-value resources
      if (participant.aiPersonality !== 'defensive' || underAttack) {
        const contestTimeGate = personality === 'hard' ? 30 : personality === 'easy' ? 100 : 45;
        const contestArmyMin = personality === 'hard' ? 2 : personality === 'easy' ? 4 : 2;
        if (aiArmy.length >= contestArmyMin && this.contestedPoints.length > 0 && this.stats.gameDuration > contestTimeGate) {
          const targets = this.contestedPoints
            .map((cp) => {
              const mine = cp.ownerFaction === aiId;
              const nearbyUnits = queryCombatSpatialIndex(
                this.combatSpatialIndex!,
                cp.x,
                cp.z,
                cp.radius + 8,
                this.combatTargetQueryScratch,
              ).units;
              const threat = nearbyUnits.some(
                (unit) =>
                  unit.hp > 0 &&
                  !unit.garrisonedInBuildingId &&
                  this.isHostile(aiReference, unit),
              );
              let score = 0;
              if (cp.ownerFaction === 'neutral') score = 65;
              else if (!mine) score = 90 + (cp.siegeSupplyActive ? 15 : 0);
              else if (mine && (threat || !cp.siegeSupplyActive)) score = 55;
              else score = 8;
              score += (1 - cp.captureProgress) * 12;
              // Choose objectives that solve the AI's current strategic shortage.
              if (cp.shrineType === 'harvest' && aiRes.food < 500) score += 24;
              if (cp.shrineType === 'forge' && (aiRes.gold < 450 || aiRes.stone < 180)) score += 20;
              if (cp.shrineType === 'war' && aiArmy.length >= 8) score += 14;
              const distHome = getDistance(anchorX, anchorZ, cp.x, cp.z);
              score += Math.max(0, 40 - distHome * 0.35);
              return { cp, score, mine };
            })
            .filter((t) => t.score >= 40)
            .sort((a, b) => b.score - a.score);

          if (targets.length > 0) {
            const focus = targets[0].cp;
            const idleMil = aiArmy.filter(
              (u) =>
                u.unitDef.category !== 'siege' &&
                (u.state === 'idle' ||
                  (u.state === 'moving' && !u.attackMoveGoal && !u.targetEntityId) ||
                  u.currentActionText === '奪取據點')
            );
            const want = Math.min(
              8,
              Math.max(3, Math.floor(aiArmy.length * (focus.ownerFaction === aiId ? 0.25 : 0.45)))
            );
            const squad = (idleMil.length >= 2 ? idleMil : aiArmy.filter((u) => u.unitDef.category !== 'siege')).slice(
              0,
              want
            );
            for (const u of squad) {
              u.targetEntityId = undefined;
              u.targetBuildingId = undefined;
              u.targetResourceNodeId = undefined;
              u.attackMoveGoal = { x: focus.x, z: focus.z };
              u.targetX = focus.x + (Math.random() - 0.5) * 5;
              u.targetZ = focus.z + (Math.random() - 0.5) * 5;
              u.state = 'moving';
              u.waypoints = undefined;
              u.currentActionText = '奪取據點';
            }
          }
        }

        const raidTimeGate = personality === 'hard' ? 40 : personality === 'easy' ? 150 : 55;
        const raidArmyMin = personality === 'hard' ? 3 : personality === 'easy' ? 6 : 4;
        if (
          personality !== 'easy' &&
          aiArmy.length >= raidArmyMin &&
          this.stats.gameDuration > raidTimeGate
        ) {
          const enemyWorkers = aiHostileUnits.filter(
            (unit) => unit.hp > 0 && unit.unitDef.category === 'worker' && !unit.garrisonedInBuildingId,
          );
          let bestRaid: { x: number; z: number; score: number; targetId?: string } | null = null;
          for (const ew of enemyWorkers) {
            let score = 20;
            if (ew.state === 'gathering' || ew.targetResourceNodeId) {
              const node = ew.targetResourceNodeId
                ? this.resourceNodes.find((n) => n.id === ew.targetResourceNodeId)
                : null;
              if (node?.resourceType === 'gold') score += 55;
              else if (node?.resourceType === 'stone') score += 40;
              else if (node?.subtype === 'hunt' || node?.subtype === 'berry') score += 25;
              else score += 15;
            }
            const nearTheirTc = (buildingsByFaction.get(ew.faction) || []).some(
              (building) =>
                building.buildingType === 'town_center' &&
                building.hp > 0 &&
                getDistance(building.x, building.z, ew.x, ew.z) < 14
            );
            if (nearTheirTc) score -= 25;
            else score += 20;
            if (!bestRaid || score > bestRaid.score) {
              bestRaid = { x: ew.x, z: ew.z, score, targetId: ew.id };
            }
          }
          for (const b of aiHostileBuildings) {
            if (b.hp <= 0 || !b.isConstructed) continue;
            if (b.buildingType !== 'farm' && b.buildingType !== 'dock' && b.buildingType !== 'mining_camp') continue;
            const guarded = (unitsByFaction.get(b.faction) || []).some(
              (unit) =>
                unit.hp > 0 &&
                unit.unitDef.category !== 'worker' &&
                getDistance(unit.x, unit.z, b.x, b.z) < 12
            );
            let score = b.buildingType === 'dock' ? 50 : b.buildingType === 'mining_camp' ? 45 : 30;
            if (guarded) score -= 30;
            if (!bestRaid || score > bestRaid.score) {
              bestRaid = { x: b.x, z: b.z, score, targetId: b.id };
            }
          }
          if (bestRaid && bestRaid.score >= 40) {
            const raiders = aiArmy
              .filter(
                (u) =>
                  u.unitDef.category !== 'siege' &&
                  u.currentActionText !== '奪取據點' &&
                  (u.state === 'idle' || u.state === 'moving')
              )
              .slice(0, Math.min(5, Math.max(2, Math.floor(aiArmy.length * 0.3))));
            for (const u of raiders) {
              if (bestRaid.targetId) {
                u.targetEntityId = bestRaid.targetId;
                u.state = 'attacking';
              } else {
                u.targetEntityId = undefined;
                u.state = 'moving';
              }
              u.attackMoveGoal = { x: bestRaid.x, z: bestRaid.z };
              u.waypoints = undefined;
              u.currentActionText = '襲擊經濟';
            }
          }
        }

        if (aiArmy.length >= 8 && !underAttack) {
          const localGold = this.resourceNodes
            .filter((n) => n.resourceType === 'gold' && n.amount > 0)
            .map((n) => ({ n, d: getDistance(anchorX, anchorZ, n.x, n.z) }))
            .filter((x) => x.d < 28)
            .sort((a, b) => a.d - b.d)[0];
          if (localGold) {
            const pickets = aiArmy
              .filter((u) => u.unitDef.category === 'melee' || u.unitDef.category === 'ranged')
              .filter((u) => u.state === 'idle' || u.currentActionText === '礦區警戒')
              .slice(0, 2);
            for (const u of pickets) {
              if (getDistance(u.x, u.z, localGold.n.x, localGold.n.z) > 6) {
                u.targetX = localGold.n.x + (Math.random() - 0.5) * 3;
                u.targetZ = localGold.n.z + (Math.random() - 0.5) * 3;
                u.attackMoveGoal = { x: localGold.n.x, z: localGold.n.z };
                u.targetEntityId = undefined;
                u.state = 'moving';
                u.currentActionText = '礦區警戒';
              }
            }
          }
        }
      } else if (participant.aiPersonality === 'defensive' && aiArmy.length >= 2) {
        const homeShrine = this.contestedPoints
          .map((cp) => ({ cp, d: getDistance(anchorX, anchorZ, cp.x, cp.z) }))
          .filter((x) => x.cp.ownerFaction === 'neutral' || x.cp.ownerFaction === aiId)
          .sort((a, b) => a.d - b.d)[0];
        if (homeShrine && homeShrine.d < 45 && this.stats.gameDuration > 80) {
          const squad = aiArmy.filter((u) => u.unitDef.category !== 'siege').slice(0, 3);
          for (const u of squad) {
            if (u.state !== 'idle' && u.currentActionText !== '奪取據點') continue;
            u.attackMoveGoal = { x: homeShrine.cp.x, z: homeShrine.cp.z };
            u.targetX = homeShrine.cp.x;
            u.targetZ = homeShrine.cp.z;
            u.state = 'moving';
            u.currentActionText = '奪取據點';
          }
        }
      }

      // Role counters include units already in production queues. Without queued reservations,
      // the AI can request the same missing role every decision tick and overfill one unit type.
      const queuedRoleCounts = { melee: 0, ranged: 0, cavalry: 0, siege: 0 };
      for (const building of aiBuildings) {
        for (const queuedUnitId of building.queue) {
          const queuedDef = this.findUnitDef(queuedUnitId, aiId);
          if (queuedDef && queuedDef.category in queuedRoleCounts) {
            queuedRoleCounts[queuedDef.category as keyof typeof queuedRoleCounts]++;
          }
        }
      }
      const roleCounts = {
        melee: aiUnits.filter((unit) => unit.unitDef.category === 'melee').length + queuedRoleCounts.melee,
        ranged: aiUnits.filter((unit) => unit.unitDef.category === 'ranged').length + queuedRoleCounts.ranged,
        cavalry: aiUnits.filter((unit) => unit.unitDef.category === 'cavalry').length + queuedRoleCounts.cavalry,
        siege: aiUnits.filter((unit) => unit.unitDef.category === 'siege').length + queuedRoleCounts.siege,
      };

      const snapshot = {
        food: aiRes.food,
        wood: aiRes.wood,
        gold: aiRes.gold,
        stone: aiRes.stone,
        armyCount: aiArmy.length,
        meleeCount: roleCounts.melee,
        rangedCount: roleCounts.ranged,
        cavalryCount: roleCounts.cavalry,
        siegeCount: roleCounts.siege,
        workerCount: aiWorkers.length,
        underAttack,
        enemyProximity: nearestEnemyDist,
        gameTime: this.stats.gameDuration,
        age: aiAge,
        buildingCount: aiBuildings.length,
        enemyArmyCount,
      };

      const plan = evaluateAiPlan(activeRules, snapshot);
      const gatherFocus = plan.gatherAction?.targetId || (aiWorkers.length >= 8 ? 'military_eco' : 'balanced_eco');

      // 2. Dynamic Worker Allocation & Rebalancing.
      // Builders are excluded from the gatherer target; they are never reassigned from construction.
      const aiEconomicWorkers = aiActiveWorkers.filter((worker) => worker.state !== 'building');

      // Sample net inventory flow over a stable window so the allocation reacts
      // to actual gains/spending, not just a single volatile stock snapshot.
      const economySampleTime = this.stats.gameDuration;
      let economyFlow = this.aiEconomyFlowByFaction.get(aiId);
      if (!economyFlow || economySampleTime < economyFlow.sampledAt) {
        economyFlow = {
          sampledAt: economySampleTime,
          resources: { ...aiRes },
          netRates: {},
        };
        this.aiEconomyFlowByFaction.set(aiId, economyFlow);
      } else if (economySampleTime - economyFlow.sampledAt >= AI_ECONOMY_FLOW_SAMPLE_INTERVAL_SECONDS) {
        const elapsedSeconds = economySampleTime - economyFlow.sampledAt;
        const netRates: Partial<Record<ResourceType, number>> = {};
        for (const type of ['food', 'wood', 'gold', 'stone'] as ResourceType[]) {
          netRates[type] = ((aiRes[type] - economyFlow.resources[type]) / elapsedSeconds) * 60;
        }
        economyFlow = {
          sampledAt: economySampleTime,
          resources: { ...aiRes },
          netRates,
        };
        this.aiEconomyFlowByFaction.set(aiId, economyFlow);
      }

      const desiredAlloc = computeAiWorkerAllocation(
        aiRes,
        aiEconomicWorkers.length,
        gatherFocus,
        aiAge,
        economyFlow.netRates
      );
      const activeCounts: Record<ResourceType, number> = { food: 0, wood: 0, gold: 0, stone: 0 };
      const resourceNodeById = new Map<string, ResourceNode>(
        this.resourceNodes.map((node) => [node.id, node] as const)
      );
      const nodeWorkerCounts = new Map<string, number>();
      const nodeGatherRateById = new Map<string, number>();
      const aiGatherTechs = this.getResearchedTechs(aiId);
      const aiHasStarOath = (this.starOathUntil[aiId] || 0) > this.simTime;
      for (const w of aiActiveWorkers) {
        if (w.state === 'returning_resource' && w.carryingResource) {
          activeCounts[w.carryingResource.type]++;
        } else if (w.state === 'gathering' && w.targetResourceNodeId) {
          const n = resourceNodeById.get(w.targetResourceNodeId);
          if (n && n.amount > 0) {
            activeCounts[n.resourceType]++;
            const gatherRate = (w.unitDef.stats.gatherSpeed || 2) *
              getEffectiveGatherMultiplier(n, aiGatherTechs, aiHasStarOath);
            nodeGatherRateById.set(
              n.id,
              (nodeGatherRateById.get(n.id) || 0) + gatherRate
            );
          }
        }

        if ((w.state === 'gathering' || w.state === 'returning_resource') && w.targetResourceNodeId) {
          const targetNode = resourceNodeById.get(w.targetResourceNodeId);
          if (targetNode && targetNode.amount > 0) {
            nodeWorkerCounts.set(targetNode.id, (nodeWorkerCounts.get(targetNode.id) || 0) + 1);
          }
        }
      }

      // Routine economy assignment excludes offshore fish and aggressive boars.
      // Boars remain available to explicit/coordinated hunting orders.
      const landNodes = this.resourceNodes.filter(
        (rn) => rn.subtype !== 'deep_fish' && rn.subtype !== 'boar'
      );
      const availableResourceTypes = Array.from(
        new Set(landNodes.filter((node) => node.amount > 0).map((node) => node.resourceType))
      );
      const assignWorkerToType = (
        worker: UnitEntity,
        prefType: ResourceType,
        excludedNodeIds?: ReadonlySet<string>
      ): boolean => {
        const preferredRange = prefType === 'food' ? 38 : 36;
        const options = { assignedCounts: nodeWorkerCounts, excludedNodeIds };
        const node =
          this.findBestDeliveredResourceNode(worker, prefType, preferredRange, options) ||
          this.findBestDeliveredResourceNode(worker, prefType, 54, options) ||
          this.findBestDeliveredResourceNode(worker, prefType, Infinity, options);
        if (!node) return false;

        worker.targetResourceNodeId = node.id;
        worker.waypoints = undefined;
        worker.state = 'gathering';
        activeCounts[node.resourceType]++;
        nodeWorkerCounts.set(node.id, (nodeWorkerCounts.get(node.id) || 0) + 1);
        return true;
      };

      for (const w of aiEconomicWorkers) {
        if (w.state !== 'idle') continue;
        // Contest forward gold: if we are poor on gold, claim nodes closer to map center / contested
        if (aiRes.gold < 120 && activeCounts.gold < desiredAlloc.gold) {
          // Prefer somewhat forward mines (not only safest). A single-pass
          // maximum preserves stable tie order without allocating/sorting per worker.
          const forwardGold = selectBestForwardGoldNode(
            this.resourceNodes,
            anchorX,
            anchorZ,
            nodeWorkerCounts,
          );
          if (forwardGold && forwardGold.score > -30) {
            w.targetResourceNodeId = forwardGold.node.id;
            w.waypoints = undefined;
            w.state = 'gathering';
            activeCounts.gold++;
            nodeWorkerCounts.set(
              forwardGold.node.id,
              (nodeWorkerCounts.get(forwardGold.node.id) || 0) + 1
            );
            continue;
          }
        }
        const bestType = selectAiWorkerResourceType(
          activeCounts,
          desiredAlloc,
          availableResourceTypes
        );
        if (bestType) assignWorkerToType(w, bestType);
      }

      // Predict node depletion and move one gatherer before the group runs dry.
      // The cooldown avoids evacuating an entire deposit in one AI decision.
      const nodeRelocationReadyAt = this.aiNodeRelocationReadyAt.get(aiId) || 0;
      if (this.stats.gameDuration >= nodeRelocationReadyAt) {
        const lowStockNodes = [...nodeGatherRateById.entries()]
          .map(([nodeId, totalRate]) => {
            const resourceNode = resourceNodeById.get(nodeId);
            return resourceNode
              ? {
                  node: resourceNode,
                  totalRate,
                  remainingSeconds: resourceNode.amount / Math.max(0.001, totalRate),
                }
              : null;
          })
          .filter((entry): entry is NonNullable<typeof entry> =>
            !!entry && shouldRelocateFromResourceNode(entry.node.amount, entry.totalRate, 12)
          )
          .sort((a, b) =>
            a.remainingSeconds - b.remainingSeconds || a.node.id.localeCompare(b.node.id)
          );

        for (const depletedSoon of lowStockNodes) {
          const relocatingWorker = aiEconomicWorkers
            .filter((worker) =>
              worker.state === 'gathering' &&
              worker.targetResourceNodeId === depletedSoon.node.id
            )
            .sort((a, b) => a.id.localeCompare(b.id))[0];
          if (!relocatingWorker) continue;

          const replacementNode = this.findBestDeliveredResourceNode(
            relocatingWorker,
            depletedSoon.node.resourceType,
            Infinity,
            {
              assignedCounts: nodeWorkerCounts,
              excludedNodeIds: new Set([depletedSoon.node.id]),
            }
          );
          if (!replacementNode) continue;

          const previousCount = nodeWorkerCounts.get(depletedSoon.node.id) || 0;
          nodeWorkerCounts.set(depletedSoon.node.id, Math.max(0, previousCount - 1));
          nodeWorkerCounts.set(
            replacementNode.id,
            (nodeWorkerCounts.get(replacementNode.id) || 0) + 1
          );
          relocatingWorker.targetResourceNodeId = replacementNode.id;
          relocatingWorker.waypoints = undefined;
          relocatingWorker.pathGoal = undefined;
          const replacementMeta = this.getResourceDisplayMeta(replacementNode);
          relocatingWorker.currentActionText = `${replacementMeta.icon} 資源將耗盡，轉往${replacementMeta.action}`;
          this.aiNodeRelocationReadyAt.set(
            aiId,
            this.stats.gameDuration + 4.8
          );
          break;
        }
      }

      // Gradually rebalance one gatherer per decision when a resource has a clear surplus
      // and another has a clear deficit. Carrying workers and builders keep their current task.
      const workerReassignment = selectAiWorkerReassignment(
        activeCounts,
        desiredAlloc,
        availableResourceTypes
      );
      const rebalanceReadyAt = this.aiWorkerRebalanceReadyAt.get(aiId) || 0;
      if (workerReassignment && this.stats.gameDuration >= rebalanceReadyAt) {
        const reassignable = aiEconomicWorkers.find((worker) => {
          if (worker.state !== 'gathering' || !worker.targetResourceNodeId) return false;
          const node = resourceNodeById.get(worker.targetResourceNodeId);
          return node?.resourceType === workerReassignment.from;
        });
        if (reassignable && reassignable.targetResourceNodeId) {
          const previousNodeId = reassignable.targetResourceNodeId;
          activeCounts[workerReassignment.from]--;
          const previousCount = nodeWorkerCounts.get(previousNodeId) || 0;
          nodeWorkerCounts.set(previousNodeId, Math.max(0, previousCount - 1));

          if (assignWorkerToType(reassignable, workerReassignment.to)) {
            this.aiWorkerRebalanceReadyAt.set(
              aiId,
              this.stats.gameDuration + AI_WORKER_REBALANCE_INTERVAL_SECONDS
            );
          } else {
            // A failed reassignment must leave the old gatherer / node counts intact.
            activeCounts[workerReassignment.from]++;
            nodeWorkerCounts.set(previousNodeId, previousCount);
          }
        }
      }

      // 3. Base Expansion, Orphaned Construction Resume, Defenses & Landmark Age Advancement
      const incompleteBuildings = aiBuildings.filter((b) => !b.isConstructed);
      for (const inc of incompleteBuildings) {
        const activeBuilders = aiActiveWorkers.filter(
          (w) => w.state === 'building' && w.targetBuildingId === inc.id
        );
        if (activeBuilders.length === 0 && aiActiveWorkers.length > 0) {
          const resumeCandidates = aiActiveWorkers
            .filter((w) => w.state !== 'building' && w.state !== 'returning_resource')
            .sort((a, b) => getDistance(a.x, a.z, inc.x, inc.z) - getDistance(b.x, b.z, inc.x, inc.z))
            .slice(0, Math.min(2, aiActiveWorkers.length));
          resumeCandidates.forEach((w) => {
            w.targetBuildingId = inc.id;
            w.targetResourceNodeId = undefined;
            w.targetEntityId = undefined;
            w.waypoints = undefined;
            w.pathGoal = undefined;
            w.state = 'building';
            w.currentActionText = `🔨 復工建造${inc.buildingDef.name.split(' ')[0]}`;
          });
        }
      }

      const hasDeepFish = this.resourceNodes.some((n) => n.amount > 0 && n.subtype === 'deep_fish');
      const hasAnyBuildingInProgress = incompleteBuildings.length > 0;
      const needsHouse = aiPop.totalReserved >= Math.max(1, aiMaxPop - 1) && aiMaxPop < 90;
      if (aiTC && aiActiveWorkers.length > 0 && !hasAnyBuildingInProgress) {
        const buildCmd = plan.buildAction;
        if (needsHouse && aiRes.wood >= DEFAULT_BUILDINGS.house.cost.wood) {
          this.tryAiConstructBuilding(
            aiId,
            'house',
            aiActiveWorkers,
            anchorX,
            anchorZ,
            toCenterAngle + Math.PI * 0.55 + (aiBuildings.length % 5) * 0.35
          );
        } else if (buildCmd?.type === 'advance_age' && aiAge < 4) {
          const lmByAge: Record<number, LandmarkType> = {
            1: (buildCmd.targetId as LandmarkType) || 'landmark_barracks',
            2: 'landmark_citadel',
            3: 'landmark_arsenal',
          };
          const lmType = lmByAge[aiAge];
          if (lmType && !this.landmarksByFaction[aiId]?.includes(lmType)) {
            this.tryAiConstructBuilding(aiId, lmType, aiActiveWorkers, anchorX, anchorZ, toCenterAngle + 0.5);
          }
        } else if (
          personality !== 'easy' &&
          aiAge === 1 &&
          aiActiveWorkers.length >= (personality === 'hard' ? 4 : 5) &&
          aiRes.food >= 400 &&
          aiRes.gold >= 200 &&
          !this.landmarksByFaction[aiId]?.includes('landmark_barracks')
        ) {
          // Fallback age-up when rule priority loses to eco spam
          this.tryAiConstructBuilding(
            aiId,
            'landmark_barracks',
            aiActiveWorkers,
            anchorX,
            anchorZ,
            toCenterAngle + 0.5
          );
        } else if (
          buildCmd?.type === 'build' &&
          buildCmd.targetId &&
          aiCiv.buildableBuildings.includes(buildCmd.targetId as BuildingType) &&
          (!(DEFAULT_BUILDINGS[buildCmd.targetId as BuildingType]?.requiredAge) ||
            aiAge >= (DEFAULT_BUILDINGS[buildCmd.targetId as BuildingType]?.requiredAge || 1))
        ) {
          this.tryAiConstructBuilding(aiId, buildCmd.targetId as BuildingType, aiActiveWorkers, anchorX, anchorZ, toCenterAngle);
        } else if (aiBarracksList.length === 0 && aiWorkers.length >= 4 && aiRes.wood >= 150 && this.stats.gameDuration > 10) {
          this.tryAiConstructBuilding(aiId, 'barracks', aiActiveWorkers, anchorX, anchorZ, toCenterAngle + 0.25);
        } else if (aiAge >= 2 && !aiArcheryList.length && this.stats.gameDuration > 16) {
          this.tryAiConstructBuilding(aiId, 'archery_range', aiActiveWorkers, anchorX, anchorZ, toCenterAngle - 0.65);
        } else if (aiAge >= 2 && !aiStableList.length && this.stats.gameDuration > 24) {
          this.tryAiConstructBuilding(aiId, 'stable', aiActiveWorkers, anchorX, anchorZ, toCenterAngle + 0.35);
        } else if (aiAge >= 3 && !aiSiegeWorkshopList.length && this.stats.gameDuration > 55) {
          this.tryAiConstructBuilding(aiId, 'siege_workshop', aiActiveWorkers, anchorX, anchorZ, toCenterAngle - 0.85);
        } else if (!aiUniqueBldg && this.stats.gameDuration > 24) {
          this.tryAiConstructBuilding(aiId, aiCiv.uniqueBuildingType, aiActiveWorkers, anchorX, anchorZ, toCenterAngle + 0.75);
        } else {
          // Sustainable Farms when wild food nearby depletes, Shoreline Docks for deep fish, & fortifications starting Age I
          const nearbyWildFood = landNodes.filter(
            (n) => n.amount > 0 && n.resourceType === 'food' && n.subtype !== 'farm' && getDistance(anchorX, anchorZ, n.x, n.z) <= 28
          ).length;
          const aiFarms = aiBuildings.filter((b) => b.buildingType === 'farm').length;
          const aiTowers = aiBuildings.filter((b) => b.buildingType === 'tower').length;
          const aiCastles = aiBuildings.filter((b) => b.buildingType === 'castle').length;
          const aiLumberCamps = aiBuildings.filter((b) => b.buildingType === 'lumber_camp').length;
          const aiMiningCamps = aiBuildings.filter((b) => b.buildingType === 'mining_camp').length;

          if (hasDeepFish && aiDocks.length === 0 && aiWorkers.length >= 5 && aiRes.wood >= 150 && this.stats.gameDuration > 28) {
            this.tryAiConstructBuilding(aiId, 'dock', aiActiveWorkers, anchorX, anchorZ, toCenterAngle, 14, 54);
          } else if (nearbyWildFood < 2 && aiFarms < 4 && aiRes.wood >= 60) {
            this.tryAiConstructBuilding(aiId, 'farm', aiActiveWorkers, anchorX, anchorZ, toCenterAngle + Math.PI * 0.8);
          } else if (
            aiAge >= 1 &&
            aiTowers < (participant.aiPersonality === 'defensive' ? 4 : 2) &&
            aiRes.wood >= 100 &&
            aiRes.stone >= 35 &&
            this.stats.gameDuration > 30
          ) {
            this.tryAiConstructBuilding(aiId, 'tower', aiActiveWorkers, anchorX, anchorZ, toCenterAngle);
          } else if (aiAge >= 3 && aiCastles === 0 && aiRes.stone >= 650 && aiRes.wood >= 200) {
            this.tryAiConstructBuilding(aiId, 'castle', aiActiveWorkers, anchorX, anchorZ, toCenterAngle + 0.15);
          } else if (aiAge < 4 && aiAge === 2 && aiRes.food >= 1200 && aiRes.gold >= 600) {
            this.tryAiConstructBuilding(aiId, 'landmark_citadel', aiActiveWorkers, anchorX, anchorZ, toCenterAngle + 0.4);
          } else if (aiAge < 4 && aiAge === 3 && aiRes.food >= 2400 && aiRes.gold >= 1200) {
            this.tryAiConstructBuilding(aiId, 'landmark_arsenal', aiActiveWorkers, anchorX, anchorZ, toCenterAngle - 0.4);
          } else if (aiArmy.length >= 6 && aiBarracksList.length < 2 && aiRes.wood >= 220) {
            this.tryAiConstructBuilding(aiId, 'barracks', aiActiveWorkers, anchorX, anchorZ, toCenterAngle + 0.25);
          } else if (
            aiLumberCamps === 0 && aiRes.wood >= 140 && this.stats.gameDuration > 45 &&
            landNodes.some((node) => node.resourceType === 'wood' && node.amount > 0 &&
              getDistance(anchorX, anchorZ, node.x, node.z) > 15 &&
              getDistance(anchorX, anchorZ, node.x, node.z) <= 36)
          ) {
            const woodNode = landNodes
              .filter((node) => node.resourceType === 'wood' && node.amount > 0)
              .map((node) => ({ node, distance: getDistance(anchorX, anchorZ, node.x, node.z) }))
              .filter((entry) => entry.distance > 15 && entry.distance <= 36)
              .sort((a, b) => a.distance - b.distance || a.node.id.localeCompare(b.node.id))[0]?.node;
            if (woodNode && this.tryAiConstructBuilding(aiId, 'lumber_camp', aiActiveWorkers, woodNode.x, woodNode.z)) {
              this.aiCampPlacementReadyAt.set(aiId, this.stats.gameDuration + 45);
            }
          } else if (
            aiMiningCamps === 0 && aiRes.wood >= 140 && this.stats.gameDuration > 55 &&
            landNodes.some((node) => (node.resourceType === 'gold' || node.resourceType === 'stone') &&
              node.amount > 0 && getDistance(anchorX, anchorZ, node.x, node.z) > 15 &&
              getDistance(anchorX, anchorZ, node.x, node.z) <= 38)
          ) {
            const mineNode = landNodes
              .filter((node) => (node.resourceType === 'gold' || node.resourceType === 'stone') && node.amount > 0)
              .map((node) => ({ node, distance: getDistance(anchorX, anchorZ, node.x, node.z) }))
              .filter((entry) => entry.distance > 15 && entry.distance <= 38)
              .sort((a, b) => a.distance - b.distance || a.node.id.localeCompare(b.node.id))[0]?.node;
            if (mineNode && this.tryAiConstructBuilding(aiId, 'mining_camp', aiActiveWorkers, mineNode.x, mineNode.z)) {
              this.aiCampPlacementReadyAt.set(aiId, this.stats.gameDuration + 45);
            }
          } else if (
            aiRes.wood >= 140 &&
            aiWorkers.length >= 6 &&
            this.stats.gameDuration >= (this.aiCampPlacementReadyAt.get(aiId) || 0)
          ) {
            // Add camps only when a sustained gatherer cluster can repay its route savings.
            const assignedGatherers = aiEconomicWorkers.flatMap((worker) => {
              if (worker.state !== 'gathering' || !worker.targetResourceNodeId) return [];
              const node = resourceNodeById.get(worker.targetResourceNodeId);
              if (!node || node.amount <= 0 || !['wood', 'gold', 'stone'].includes(node.resourceType)) return [];
              return [{ worker, node }];
            });
            const processedClusters = new Set<string>();
            let bestCamp: {
              buildingType: 'lumber_camp' | 'mining_camp';
              centerX: number;
              centerZ: number;
              angle: number;
              score: number;
            } | null = null;

            const candidateSeeds = [...new Map(assignedGatherers.map((entry) => [entry.node.id, entry])).values()]
              .sort((a, b) =>
                (nodeWorkerCounts.get(b.node.id) || 0) - (nodeWorkerCounts.get(a.node.id) || 0) ||
                b.node.amount - a.node.amount ||
                a.node.id.localeCompare(b.node.id)
              )
              .slice(0, 8);
            for (const seed of candidateSeeds) {
              const cluster = assignedGatherers.filter((entry) =>
                entry.node.resourceType === seed.node.resourceType &&
                getDistance(seed.node.x, seed.node.z, entry.node.x, entry.node.z) <= 13
              );
              if (cluster.length < 3) continue;
              const nodeIds = [...new Set(cluster.map((entry) => entry.node.id))].sort();
              const clusterKey = nodeIds.join('|');
              if (processedClusters.has(clusterKey)) continue;
              processedClusters.add(clusterKey);

              const totalNodeAmount = nodeIds.reduce(
                (total, nodeId) => total + Math.max(0, resourceNodeById.get(nodeId)?.amount || 0),
                0
              );
              const centerX = cluster.reduce((total, entry) => total + entry.node.x, 0) / cluster.length;
              const centerZ = cluster.reduce((total, entry) => total + entry.node.z, 0) / cluster.length;
              const buildingType = seed.node.resourceType === 'wood' ? 'lumber_camp' : 'mining_camp';
              const hasNearbyCamp = aiBuildings.some((building) =>
                building.buildingType === buildingType &&
                getDistance(centerX, centerZ, building.x, building.z) <= 14
              );
              if (hasNearbyCamp) continue;

              const angle = Math.atan2(anchorZ - centerZ, anchorX - centerX);
              const spot = this.findSafeAiBuildSpot(centerX, centerZ, buildingType, angle, 5, 11);
              if (!spot) continue;

              const profiles = cluster.flatMap(({ worker, node }) => {
                const currentTravelDistance = this.estimateResourceDeliveryTravelDistance(aiId, worker, node);
                if (currentTravelDistance === null) return [];
                return [{
                  gatherPerSecond: (worker.unitDef.stats.gatherSpeed || 2) *
                    getEffectiveGatherMultiplier(node, aiGatherTechs, aiHasStarOath),
                  carryCapacity: worker.unitDef.stats.carryCapacity,
                  moveSpeed: worker.unitDef.stats.speed,
                  currentTravelDistance,
                  proposedTravelDistance: Math.max(2, getDistance(node.x, node.z, spot.x, spot.z) - 4.5),
                }];
              });
              const payback = estimateAiResourceCampPaybackSeconds({
                resourceType: seed.node.resourceType,
                totalNodeAmount,
                gatherers: profiles,
                woodCost: DEFAULT_BUILDINGS[buildingType].cost.wood,
                minimumGatherers: 3,
                minimumDistanceSaved: 8,
                maximumPaybackSeconds: 180,
              });
              if (payback === null) continue;
              const score = profiles.reduce(
                (total, profile) => total + profile.currentTravelDistance - profile.proposedTravelDistance,
                0
              ) - payback * 0.2;
              if (!bestCamp || score > bestCamp.score) bestCamp = { buildingType, centerX, centerZ, angle, score };
            }

            if (bestCamp && this.tryAiConstructBuilding(
              aiId, bestCamp.buildingType, aiActiveWorkers,
              bestCamp.centerX, bestCamp.centerZ, bestCamp.angle, 5, 11
            )) {
              this.aiCampPlacementReadyAt.set(aiId, this.stats.gameDuration + 45);
            }
          }
        }
      }

      // 4. Context-aware counter-tech & economic research from surplus resources (never spend landmark reserve).
      const researched = this.getResearchedTechs(aiId);
      const nextAgeLandmark: LandmarkType | null =
        aiAge === 1 ? 'landmark_barracks' : aiAge === 2 ? 'landmark_citadel' : aiAge === 3 ? 'landmark_arsenal' : null;
      const nextAgeLandmarkActive = !!nextAgeLandmark && (
        !!this.landmarksByFaction[aiId]?.includes(nextAgeLandmark) ||
        aiBuildings.some((building) => building.buildingType === nextAgeLandmark)
      );
      // A started landmark has already committed its cost; do not reserve it twice.
      const nextAgeCost = nextAgeLandmark && !nextAgeLandmarkActive
        ? DEFAULT_BUILDINGS[nextAgeLandmark].cost
        : null;
      const reserveFood = nextAgeCost?.food || 0;
      const reserveGold = nextAgeCost?.gold || 0;
      const enemyComposition = {
        melee: 0,
        ranged: 0,
        cavalry: 0,
        siege: 0,
        fortificationCount: 0,
      };
      for (const u of aiHostileUnits) {
        if (u.hp <= 0) continue;
        if (u.unitDef.category === 'melee') enemyComposition.melee++;
        else if (u.unitDef.category === 'ranged') enemyComposition.ranged++;
        else if (u.unitDef.category === 'cavalry') enemyComposition.cavalry++;
        else if (u.unitDef.category === 'siege') enemyComposition.siege++;
      }
      for (const eb of aiHostileBuildings) {
        if (eb.hp <= 0) continue;
        if (eb.buildingType === 'tower' || eb.buildingType === 'castle' || eb.buildingType === 'wall') {
          enemyComposition.fortificationCount++;
        }
      }
      // Mandatory Age II field engineering gets first access to an idle barracks.
      // Otherwise optional tech scoring could repeatedly occupy the only barracks queue.
      const fieldEngineeringTech = findTechDef(FIELD_RAM_TECH_ID);
      const fieldResearchHall = aiBarracksList.find((b) => b.isConstructed && !b.activeTechId);
      const fieldEngineeringReady = !!fieldEngineeringTech && shouldPrioritizeAiFieldEngineering({
        age: aiAge,
        researched: researched.includes(FIELD_RAM_TECH_ID),
        researchInProgress: aiBuildings.some((b) => b.activeTechId === FIELD_RAM_TECH_ID),
        meleeUnitCount: aiArmy.filter((u) => u.unitDef.category === 'melee').length,
        hasAvailableBarracks: !!fieldResearchHall,
        prerequisitesMet: !!fieldEngineeringTech && canResearchTech(fieldEngineeringTech, researched, aiAge as AgeLevel).ok,
        resources: aiRes,
        reserveFood,
        reserveGold,
        techCost: fieldEngineeringTech?.cost || { food: 0, wood: 0, gold: 0, stone: 0 },
      });
      if (fieldEngineeringReady && fieldEngineeringTech && fieldResearchHall) {
        this.startResearch(fieldResearchHall.id, fieldEngineeringTech.id);
      }

      const techCandidates: Array<{ buildingId: string; tech: TechDefinition }> = [];
      for (const b of aiBuildings) {
        if (!b.isConstructed || b.activeTechId) continue;
        const techs = getAvailableTechsForBuilding(b.buildingType, aiCiv.id, researched, aiAge as AgeLevel);
        for (const tech of techs) {
          techCandidates.push({ buildingId: b.id, tech });
        }
      }
      const chosenTech = evaluateAiTechChoice(techCandidates, {
        resources: aiRes,
        reserveFood,
        reserveGold,
        age: aiAge,
        workerCount: aiWorkers.length,
        aiPersonality: participant.aiPersonality,
        enemyComposition,
      });
      if (chosenTech) {
        this.startResearch(chosenTech.buildingId, chosenTech.tech.id);
      }

      const aiHasRam = aiUnits.some((u) => u.hp > 0 && u.unitDefId === 'battering_ram');
      const aiRamBuilders = aiArmy
        .filter((u) => u.unitDef.category === 'melee' && (u.state === 'idle' || u.state === 'moving'))
        .slice(0, 4);
      if (
        aiAge >= 2 &&
        !aiHasRam &&
        this.getResearchedTechs(aiId).includes(FIELD_RAM_TECH_ID) &&
        aiRamBuilders.length >= 4
      ) {
        this.beginFieldRamAssembly(aiId, aiRamBuilders, false);
      }

      // 5. Reserve the exact landmark cost before optional military production.
      const savingForAgeUp = shouldAiSaveForNextAge({
        age: aiAge,
        gameTime: this.stats.gameDuration,
        workerCount: aiWorkers.length,
        minimumWorkers: aiAge === 1 ? 5 : aiAge === 2 ? 6 : aiAge === 3 ? 8 : Infinity,
        minimumGameTime: aiAge === 1 ? 35 : aiAge === 2 ? 90 : aiAge === 3 ? 180 : Infinity,
        landmarkActive: nextAgeLandmarkActive,
        resources: aiRes,
        ageUpCost: nextAgeCost,
      });
      const deferOptionalMilitaryProduction = shouldAiDeferOptionalMilitaryProduction({
        savingForAgeUp,
        armyCount: aiArmy.length,
        underAttack,
      });

      // Derive the worker cap and next-age workforce target from the active
      // personality's own AI rules, rather than maintaining a second set of
      // hard-coded difficulty values here.
      const workerTrainRule = activeRules.find(
        (rule) =>
          rule.enabled &&
          rule.action.type === 'train_unit' &&
          (!rule.action.targetId || rule.action.targetId === 'villager' || rule.action.targetId === aiCiv.workerUnitId) &&
          rule.conditions.some((condition) => condition.field === 'workerCount' && condition.operator === '<')
      );
      const workerProductionCap =
        workerTrainRule?.conditions.find(
          (condition) => condition.field === 'workerCount' && condition.operator === '<'
        )?.value ?? 12;
      const nextAgeRule = activeRules.find((rule) => {
        if (!rule.enabled || rule.action.type !== 'advance_age') return false;
        const ageCondition = rule.conditions.find((condition) => condition.field === 'age');
        if (!ageCondition) return false;
        switch (ageCondition.operator) {
          case '<': return aiAge < ageCondition.value;
          case '<=': return aiAge <= ageCondition.value;
          case '>': return aiAge > ageCondition.value;
          case '>=': return aiAge >= ageCondition.value;
          case '==': return aiAge === ageCondition.value;
          case '!=': return aiAge !== ageCondition.value;
          default: return false;
        }
      });
      const minimumWorkersForAgeUp =
        nextAgeRule?.conditions.find(
          (condition) => condition.field === 'workerCount' && condition.operator === '>='
        )?.value ?? 0;
      let queuedWorkerCount = aiBuildings.reduce(
        (total, building) =>
          total + building.queue.filter((unitId) => unitId === aiCiv.workerUnitId).length,
        0
      );
      const aiWorkerDefinition = this.findUnitDef(aiCiv.workerUnitId, aiId);

      if (aiPop.totalReserved < aiMaxPop) {
        const readyDock = aiDocks.find((d) => d.isConstructed && d.queue.length < 2);
        if (hasDeepFish && readyDock && aiNavalBoats.length < 2 && aiRes.wood >= 75) {
          this.trainUnit(readyDock.id, 'fishing_boat');
        }

        for (const trainAct of plan.trainActions) {
          const targetId = trainAct.targetId || 'villager';
          const isVillagerTrain = targetId === 'villager' || targetId === aiCiv.workerUnitId;
          if (isVillagerTrain) {
            if (
              !aiWorkerDefinition ||
              !shouldAiQueueWorker({
                workerCount: aiWorkers.length,
                queuedWorkerCount,
                workerCap: workerProductionCap,
                resources: aiRes,
                workerCost: aiWorkerDefinition.stats.cost,
                ageUpReserve: {
                  food: reserveFood,
                  wood: 0,
                  gold: reserveGold,
                  stone: 0,
                },
                minimumWorkersForAgeUp,
              })
            ) {
              continue;
            }
          } else if (deferOptionalMilitaryProduction) {
            continue;
          }
          const queued = this.resolveAiTrainRequest(aiId, aiCiv, targetId, aiBuildings);
          if (isVillagerTrain && queued) queuedWorkerCount++;
        }
      }


      const combatCmd = plan.combatAction;
      const siegePushEnabled =
        !!combatCmd &&
        (combatCmd.type === 'cluster_attack' || combatCmd.type === 'attack_player') &&
        personality !== 'defensive' &&
        personality !== 'easy' &&
        aiAge >= 2 &&
        aiArmy.length >= (personality === 'hard' ? 4 : 5) &&
        this.stats.gameDuration > (personality === 'hard' ? 70 : 100);
      const siegeUnits = siegePushEnabled
        ? aiArmy.filter((unit) => unit.hp > 0 && unit.unitDef.category === 'siege')
        : [];
      const enemyTc = siegePushEnabled
        ? aiHostileBuildings.find(
            (building) => building.hp > 0 && building.isConstructed && building.buildingType === 'town_center',
          ) || null
        : null;
      const siegeEscortAssignments = enemyTc && siegeUnits.length > 0
        ? selectSiegeEscortAssignments(
            siegeUnits,
            aiArmy,
            Math.min(4, Math.max(2, siegeUnits.length * 2)),
          )
        : [];
      const assignedEscortIds = new Set(siegeEscortAssignments.map((assignment) => assignment.escort.id));

      // Release escorts whose siege engine died, whose target changed, or whose army
      // stopped pushing. They rejoin the regular combat plan in this same AI tick.
      for (const unit of aiArmy) {
        if (!unit.siegeEscortTargetId || assignedEscortIds.has(unit.id)) continue;
        unit.siegeEscortTargetId = undefined;
        if (unit.currentActionText?.startsWith('攻城護衛')) {
          this.clearFormationMovement(unit);
          unit.targetEntityId = undefined;
          unit.targetX = undefined;
          unit.targetZ = undefined;
          unit.attackMoveGoal = null;
          unit.waypoints = undefined;
          unit.pathGoal = undefined;
          unit.state = 'idle';
          unit.currentActionText = '💤 待命中 (閒置)';
        }
      }

      if (enemyTc && siegeUnits.length > 0) {
        for (const siege of siegeUnits) {
          if (
            siege.state !== 'attacking' ||
            siege.targetEntityId !== enemyTc.id ||
            !siege.attackMoveGoal ||
            getDistance(siege.attackMoveGoal.x, siege.attackMoveGoal.z, enemyTc.x, enemyTc.z) > 2
          ) {
            siege.targetEntityId = enemyTc.id;
            siege.attackMoveGoal = { x: enemyTc.x, z: enemyTc.z };
            siege.waypoints = undefined;
            siege.state = 'attacking';
            siege.currentActionText = '攻城推進';
          }
        }

        const siegeById = new Map(siegeUnits.map((siege) => [siege.id, siege] as const));
        for (const { escort, siegeId, slotIndex } of siegeEscortAssignments) {
          const siege = siegeById.get(siegeId);
          if (!siege) continue;
          escort.siegeEscortTargetId = siege.id;
          const toObjectiveX = enemyTc.x - siege.x;
          const toObjectiveZ = enemyTc.z - siege.z;
          const objectiveLength = Math.hypot(toObjectiveX, toObjectiveZ) || 1;
          const dirX = toObjectiveX / objectiveLength;
          const dirZ = toObjectiveZ / objectiveLength;
          const sideX = -dirZ;
          const sideZ = dirX;
          const side = slotIndex % 2 === 0 ? -1 : 1;
          const rank = Math.floor(slotIndex / 2);
          const lateral = side * (3.2 + rank * 1.8);
          const followX = Math.max(-84, Math.min(84, siege.x - dirX * 5.5 + sideX * lateral));
          const followZ = Math.max(-84, Math.min(84, siege.z - dirZ * 5.5 + sideZ * lateral));
          const followGoal = { x: followX, z: followZ };
          const nearbyThreat = this.selectNearbyCombatTarget(escort, 12, false);

          this.clearFormationMovement(escort);
          escort.attackMoveGoal = followGoal;
          if (nearbyThreat) {
            if (escort.state !== 'attacking' || escort.targetEntityId !== nearbyThreat.id) {
              escort.targetEntityId = nearbyThreat.id;
              escort.waypoints = undefined;
              escort.pathGoal = undefined;
              escort.state = 'attacking';
            }
            escort.currentActionText = '攻城護衛 · 截擊';
            continue;
          }

          if (getDistance(escort.x, escort.z, followX, followZ) > 2.2) {
            const goalChanged =
              escort.targetX === undefined ||
              escort.targetZ === undefined ||
              getDistance(escort.targetX, escort.targetZ, followX, followZ) > 1.5;
            if (escort.state !== 'moving' || goalChanged || escort.targetEntityId) {
              escort.targetEntityId = undefined;
              escort.targetX = followX;
              escort.targetZ = followZ;
              escort.waypoints = undefined;
              escort.pathGoal = undefined;
              escort.pathCooldown = 0;
              escort.state = 'moving';
            }
            escort.currentActionText = '攻城護衛 · 跟進';
          } else {
            escort.targetEntityId = undefined;
            escort.targetX = undefined;
            escort.targetZ = undefined;
            escort.waypoints = undefined;
            escort.state = 'idle';
            escort.currentActionText = '攻城護衛 · 護衛位置';
          }
        }
      }

      // 6. Execute Tactical Combat Actions (Defend, Rally/Patrol, 1v1 Counter & Cluster Push)
      if (!combatCmd || aiArmy.length === 0) continue;

      // Reuse id indexes throughout this AI decision pass instead of rescanning full entity arrays per unit.
      const combatUnitById = new Map(this.units.map((candidate) => [candidate.id, candidate] as const));
      const combatBuildingById = new Map(this.buildings.map((candidate) => [candidate.id, candidate] as const));

      if (combatCmd.type === 'defend_base' || combatCmd.type === 'retreat_to_base') {
        const defendAnchor = { x: anchorX, z: anchorZ, radius: 26 };
        const baseClusterTarget = selectClusterFocusTarget(aiArmy, this.units, this.buildings, {
          maxEnemyRangeFromCentroid: 40,
          defendAnchor,
        });
        const activeThreat = baseThreat && nearestEnemyDist <= 28 ? baseThreat : null;

        aiArmy.forEach((unit, idx) => {
          if (unit.siegeEscortTargetId) return;
          const targetContext = {
            defendAnchor,
            clusterFocusTargetId: baseClusterTarget?.id,
            maxSearchRange: 30,
          };
          const bestTarget =
            this.selectNearbyCombatTarget(unit, targetContext.maxSearchRange || 30, false, targetContext) || activeThreat;

          if (bestTarget) {
            const currentTarget =
              (unit.targetEntityId ? combatUnitById.get(unit.targetEntityId) : undefined) ||
              (unit.targetEntityId ? combatBuildingById.get(unit.targetEntityId) : undefined) ||
              null;
            const needsRetarget = shouldSwitchCombatTarget(
              unit,
              currentTarget,
              bestTarget,
              this.units,
              { defendAnchor, maxSearchRange: targetContext.maxSearchRange },
              18
            );
            const needsAnchorSync =
              !unit.attackMoveGoal ||
              getDistance(unit.attackMoveGoal.x, unit.attackMoveGoal.z, anchorX, anchorZ) > 1;
            if (unit.state !== 'attacking' || needsRetarget || needsAnchorSync) {
              unit.targetEntityId = bestTarget.id;
              unit.attackMoveGoal = { x: anchorX, z: anchorZ };
              unit.waypoints = undefined;
              unit.state = 'attacking';
            }
          } else {
            // Stable, deterministic defensive arc slots prevent every AI tick from issuing a new random path.
            const centeredIndex = idx - (aiArmy.length - 1) / 2;
            const guardAngle = toCenterAngle + centeredIndex * 0.13;
            const gx = Math.max(-84, Math.min(84, anchorX + Math.cos(guardAngle) * 8));
            const gz = Math.max(-84, Math.min(84, anchorZ + Math.sin(guardAngle) * 8));
            const guardGoalChanged =
              unit.targetX === undefined ||
              unit.targetZ === undefined ||
              getDistance(unit.targetX, unit.targetZ, gx, gz) > 1.5;
            if (
              (getDistance(unit.x, unit.z, anchorX, anchorZ) > 13 || unit.state === 'idle') &&
              (unit.state !== 'moving' || guardGoalChanged)
            ) {
              unit.targetX = gx;
              unit.targetZ = gz;
              unit.targetEntityId = undefined;
              unit.attackMoveGoal = { x: gx, z: gz };
              unit.waypoints = undefined;
              unit.state = 'moving';
            }
          }
        });
      } else if (combatCmd.type === 'patrol_mid') {
        // Stage a cohesive forward guard group 36% toward map center (not wandering solo into enemy TC!)
        const stageX = anchorX * 0.62;
        const stageZ = anchorZ * 0.62;
        const cols = Math.max(2, Math.ceil(Math.sqrt(aiArmy.length)));

        aiArmy.forEach((unit, idx) => {
          if (unit.siegeEscortTargetId) return;
          if (unit.state === 'idle') {
            const nearbyEnemy = this.selectNearbyCombatTarget(unit, 14, false);
            if (nearbyEnemy) {
              unit.targetEntityId = nearbyEnemy.id;
              unit.waypoints = undefined;
              unit.state = 'attacking';
            } else if (getDistance(unit.x, unit.z, stageX, stageZ) > 7.5) {
              const row = Math.floor(idx / cols);
              const col = idx % cols;
              const gx = Math.max(-84, Math.min(84, stageX + (col - (cols - 1) / 2) * 2.2));
              const gz = Math.max(-84, Math.min(84, stageZ + (row - 1) * 2.2));
              unit.targetX = gx;
              unit.targetZ = gz;
              unit.attackMoveGoal = { x: gx, z: gz };
              unit.waypoints = undefined;
              unit.state = 'moving';
            }
          }
        });
      } else if (combatCmd.type === 'cluster_attack' || combatCmd.type === 'attack_player') {
        const enemyTc =
          aiHostileBuildings.find(
            (building) => building.hp > 0 && building.isConstructed && building.buildingType === 'town_center',
          ) || null;
        const stronghold =
          enemyTc ||
          findClosestEnemy(anchorX, anchorZ, aiId, aiHostileBuildings, Infinity, aiTeam) ||
          findClosestEnemy(anchorX, anchorZ, aiId, aiHostileUnits, Infinity, aiTeam);

        if (stronghold) {
          const strikeUnits = aiArmy.filter(
            (u) =>
              !u.siegeEscortTargetId &&
              u.currentActionText !== '奪取據點' &&
              u.currentActionText !== '礦區警戒' &&
              (u.state === 'idle' || u.state === 'moving' || u.state === 'attacking')
          );

          // Preferred soft targets: exposed enemy villagers
          const exposedWorkers = aiHostileUnits.filter(
            (unit) => unit.hp > 0 && unit.unitDef.category === 'worker' && !unit.garrisonedInBuildingId,
          );
          const exposedWorkerById = new Map(exposedWorkers.map((worker) => [worker.id, worker] as const));
          const raiderUnits = strikeUnits.filter(
            (unit, idx) =>
              unit.unitDef.category === 'cavalry' ||
              idx % 3 === 0 ||
              unit.unitDef.stats.speed >= 3.6
          );
          const raidTargetByUnit = new Map<string, string>(
            assignRaidTargets(raiderUnits, exposedWorkers, 2).map((assignment) => [
              assignment.raiderId,
              assignment.targetId,
            ] as const)
          );

          const ecoBuilding =
            aiHostileBuildings
              .filter(
                (b) =>
                  b.hp > 0 &&
                  b.isConstructed &&
                  (b.buildingType === 'farm' ||
                    b.buildingType === 'dock' ||
                    b.buildingType === 'mining_camp' ||
                    b.buildingType === 'lumber_camp')
              )
              .sort(
                (a, b) =>
                  getDistance(anchorX, anchorZ, a.x, a.z) - getDistance(anchorX, anchorZ, b.x, b.z)
              )[0] || null;

          const clusterTarget =
            strikeUnits.length > 0
              ? selectClusterFocusTarget(strikeUnits, this.units, this.buildings, {
                  maxEnemyRangeFromCentroid: 32,
                })
              : null;
          // Keep the main ranged line on one high-value target. Raiding units
          // are excluded so their worker-harassment orders remain independent.
          const rangedStrikeUnits = strikeUnits.filter(
            (unit, index) =>
              unit.unitDef.category === 'ranged' &&
              index % 3 !== 0 &&
              unit.unitDef.stats.speed < 3.6
          );
          const rangedFocusTarget =
            rangedStrikeUnits.length >= 2
              ? selectClusterFocusTarget(rangedStrikeUnits, this.units, this.buildings, {
                  maxEnemyRangeFromCentroid: 32,
                })
              : null;

          const goalX = stronghold.x;
          const goalZ = stronghold.z;
          const formationGroupId = `ai:${aiId}:${combatCmd.type}:${stronghold.id}`;
          const existingFormationMember = strikeUnits.find(
            (unit) =>
              unit.formationGroupId === formationGroupId &&
              unit.formationOrderOrigin &&
              unit.formationOrderGoal &&
              getDistance(unit.formationOrderGoal.x, unit.formationOrderGoal.z, goalX, goalZ) <= 2,
          );
          const formationOrigin = existingFormationMember?.formationOrderOrigin || {
            x: strikeUnits.reduce((sum, unit) => sum + unit.x, 0) / Math.max(1, strikeUnits.length),
            z: strikeUnits.reduce((sum, unit) => sum + unit.z, 0) / Math.max(1, strikeUnits.length),
          };
          const formationSlots = new Map(
            layoutCombatFormation(strikeUnits, { x: goalX, z: goalZ }).map((entry) => [entry.unitId, entry] as const)
          );

          strikeUnits.forEach((unit) => {
            if (unit.unitDef.category !== 'worker') {
              if (
                unit.formationGroupId !== formationGroupId ||
                !unit.formationOrderGoal ||
                getDistance(unit.formationOrderGoal.x, unit.formationOrderGoal.z, goalX, goalZ) > 2
              ) {
                this.assignFormationMovement(unit, formationGroupId, formationOrigin, { x: goalX, z: goalZ });
              }
            } else {
              this.clearFormationMovement(unit);
            }
          });

          strikeUnits.forEach((unit, idx) => {
            const slot = formationSlots.get(unit.id);
            const currentFormationTarget =
              (unit.targetEntityId ? combatUnitById.get(unit.targetEntityId) : undefined) ||
              (unit.targetEntityId ? combatBuildingById.get(unit.targetEntityId) : undefined) ||
              null;
            const targetIsNear =
              !!currentFormationTarget &&
              currentFormationTarget.hp > 0 &&
              getDistance(unit.x, unit.z, currentFormationTarget.x, currentFormationTarget.z) <=
                Math.max(13, Math.min(24, unit.unitDef.stats.range + 2));
            const distanceToSlot = slot
              ? getDistance(unit.x, unit.z, slot.x, slot.z)
              : 0;

            // Keep an active target when it is within the unit's engagement envelope; otherwise stage into the role lane.
            if (slot && distanceToSlot > 1.8 && !targetIsNear) {
              const slotChanged =
                unit.targetX === undefined ||
                unit.targetZ === undefined ||
                getDistance(unit.targetX, unit.targetZ, slot.x, slot.z) > 1.5;
              const formationGoalChanged =
                !unit.attackMoveGoal ||
                getDistance(unit.attackMoveGoal.x, unit.attackMoveGoal.z, slot.x, slot.z) > 1.5;
              const shouldStage =
                unit.state !== 'moving' ||
                slotChanged ||
                formationGoalChanged ||
                !unit.currentActionText?.startsWith('陣型推進');
              if (shouldStage) {
                unit.targetEntityId = undefined;
                unit.targetX = slot.x;
                unit.targetZ = slot.z;
                // Keep the attack-move fallback on the formation slot, not the objective center,
                // so a unit that wins an interception returns to its assigned lane.
                unit.attackMoveGoal = { x: slot.x, z: slot.z };
                unit.waypoints = undefined;
                unit.pathGoal = undefined;
                unit.pathCooldown = 0;
                unit.state = 'moving';
                const roleText =
                  slot.role === 'frontline'
                    ? '前排集結'
                    : slot.role === 'backline'
                      ? '遠程就位'
                      : slot.role === 'flank'
                        ? '騎兵包抄'
                        : slot.role === 'siege'
                          ? '攻城後列'
                          : '支援就位';
                unit.currentActionText = `陣型推進 · ${roleText}`;
              }
              return;
            }

            // Fast units / every 3rd unit: harass workers & eco
            const isRaider =
              unit.unitDef.category === 'cavalry' ||
              idx % 3 === 0 ||
              unit.unitDef.stats.speed >= 3.6;

            const assignedPreyId = raidTargetByUnit.get(unit.id);
            const prey = assignedPreyId ? exposedWorkerById.get(assignedPreyId) : undefined;
            if (isRaider && prey) {
              this.clearFormationMovement(unit);
              const goalChanged =
                !unit.attackMoveGoal ||
                getDistance(unit.attackMoveGoal.x, unit.attackMoveGoal.z, prey.x, prey.z) > 3;
              if (unit.state !== 'attacking' || unit.targetEntityId !== prey.id || goalChanged) {
                unit.targetEntityId = prey.id;
                unit.attackMoveGoal = { x: prey.x, z: prey.z };
                unit.waypoints = undefined;
                unit.state = 'attacking';
              }
              unit.currentActionText = '獵殺村民';
              return;
            }

            // A stable subset of raiders pressures economy buildings; avoid a fresh random roll every AI tick.
            if (isRaider && ecoBuilding && idx % 3 === 1) {
              this.clearFormationMovement(unit);
              const goalChanged =
                !unit.attackMoveGoal ||
                getDistance(unit.attackMoveGoal.x, unit.attackMoveGoal.z, ecoBuilding.x, ecoBuilding.z) > 3;
              if (unit.state !== 'attacking' || unit.targetEntityId !== ecoBuilding.id || goalChanged) {
                unit.targetEntityId = ecoBuilding.id;
                unit.attackMoveGoal = { x: ecoBuilding.x, z: ecoBuilding.z };
                unit.waypoints = undefined;
                unit.state = 'attacking';
              }
              unit.currentActionText = '破壞經濟';
              return;
            }

            // Main body: push toward stronghold, retarget opportunistically
            const targetContext = {
              clusterFocusTargetId: clusterTarget?.id,
              maxSearchRange: 28,
            };
            const optimalLocal = this.selectNearbyCombatTarget(
              unit,
              targetContext.maxSearchRange || 28,
              true,
              targetContext,
            );
            const chosen =
              unit.unitDef.category === 'ranged' && rangedFocusTarget && rangedFocusTarget.hp > 0
                ? rangedFocusTarget
                : clusterTarget || optimalLocal || stronghold;
            const currentTarget =
              (unit.targetEntityId ? combatUnitById.get(unit.targetEntityId) : undefined) ||
              (unit.targetEntityId ? combatBuildingById.get(unit.targetEntityId) : undefined) ||
              null;
            // Compare candidates without the transient cluster-focus bonus. Otherwise a new
            // focus ID can manufacture a +42 score jump and bypass target hysteresis.
            const targetChanged = shouldSwitchCombatTarget(
              unit,
              currentTarget,
              chosen,
              this.units,
              { maxSearchRange: targetContext.maxSearchRange },
              18,
            );
            const goalChanged =
              !unit.attackMoveGoal ||
              getDistance(unit.attackMoveGoal.x, unit.attackMoveGoal.z, goalX, goalZ) > 2;
            if (unit.state !== 'attacking' || targetChanged || goalChanged) {
              unit.targetEntityId = chosen.id;
              unit.attackMoveGoal = { x: goalX, z: goalZ };
              unit.waypoints = undefined;
              unit.state = 'attacking';
              unit.currentActionText =
                unit.unitDef.category === 'ranged' && rangedFocusTarget
                  ? '🏹 集中火力 · 共同目標'
                  : '集群進攻';
            }
          });
        }
      }
    }
  }

  // ------------------ WIN / LOSS ------------------

  private checkWinLossConditions() {
    const outcome = resolveMatchOutcome(this.participants, this.units, this.buildings);
    if (outcome.isOver) {
      this.gameOverWinner = outcome.winner || null;
      this.triggerGameOver(outcome.result || 'victory');
    }
  }

  private triggerGameOver(result: 'victory' | 'defeat') {
    this.gameState = 'gameover';
    this.gameOverResult = result;
    document.body.dataset.state = 'gameover';

    if (result === 'victory') sound.playVictory();
    else sound.playDefeat();

    this.onStateChange?.();
  }

  // ------------------ EVENT BINDINGS ------------------

  private bindEvents() {
    const onKeyDown = (e: KeyboardEvent) => {
      const targetTag = (e.target as HTMLElement)?.tagName;
      const isTyping = targetTag === 'INPUT' || targetTag === 'TEXTAREA' || targetTag === 'SELECT';
      const hasOpenUiModal =
        e.defaultPrevented ||
        !!document.querySelector('[data-hotkeys-modal="true"], [data-age-modal="true"], [data-tech-tree-modal="true"]');

      this.keysHeld.add(e.code);
      if (hasOpenUiModal) return;

      if (!isTyping && e.code === 'F3') {
        e.preventDefault();
        this.togglePerformanceOverlay();
        return;
      }

      if (!isTyping && !e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'F4') {
        e.preventDefault();
        this.exportPerformanceTelemetry();
        return;
      }

      if (!isTyping && (e.code === 'Escape' || e.code === 'KeyP')) {
        if (this.gameState === 'playing') {
          if (this.placementBuildingType) {
            this.cancelPlacement();
            return;
          }
          if (this.pendingCommandMode !== 'normal') {
            this.pendingCommandMode = 'normal';
            this.onSelectionChange?.();
            return;
          }
          this.gameState = 'paused';
          document.body.dataset.state = 'paused';
          this.onStateChange?.();
        } else if (this.gameState === 'paused') {
          this.gameState = 'playing';
          document.body.dataset.state = 'playing';
          this.onStateChange?.();
        }
      }
      if (!isTyping && this.gameState === 'playing' && !this.isSpectatorMode) {
        if (e.code === 'Space' && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          this.selectAllMilitary();
          return;
        }
        if (e.code === 'KeyI' && !e.ctrlKey && !e.metaKey && !e.altKey) {
          this.cycleIdleWorker();
          return;
        }
        if (e.code === 'KeyH' && !e.ctrlKey && !e.metaKey && !e.altKey) {
          this.cycleBuildingByKind('town_center');
          return;
        }
        if (e.code === 'KeyB' && !e.ctrlKey && !e.metaKey && !e.altKey) {
          this.cycleBuildingByKind('military');
          return;
        }

        if (e.code === 'KeyQ' && this.selectedUnitIds.length > 0) {
          this.activateSelectedUnitsAbility();
        } else if (e.code === 'KeyU' && this.selectedUnitIds.length > 0) {
          this.unloadSelectedTransports();
        } else if (e.code === 'KeyX' && this.selectedUnitIds.length > 0) {
          this.stopSelectedUnits();
        } else if (e.code === 'KeyF' && this.selectedUnitIds.length > 0) {
          this.pendingCommandMode = this.pendingCommandMode === 'attack_move' ? 'normal' : 'attack_move';
          this.onSelectionChange?.();
        } else if (!e.ctrlKey && !e.metaKey && !e.altKey) {
          const keyLabel = eventCodeToHotkeyLabel(e.code);
          if (keyLabel) {
            const hasWorkerSelected = this.selectedUnitIds.some((uid) => {
              const u = this.units.find((unit) => unit.id === uid);
              return !!u && u.hp > 0 && u.unitDef.category === 'worker' && this.isHumanControlled(u.faction);
            });

            if (hasWorkerSelected) {
              if (keyLabel === AGE_ADVANCE_HOTKEY && this.playerAge < 4) {
                this.onRequestOpenAgeModal?.();
                return;
              }
              const humanCiv = this.getCivilizationForFaction(this.humanPlayerId);
              const currentAge = this.ageByFaction[this.humanPlayerId] || 1;
              const buildableTypes = getBuildableTypesForCiv(humanCiv, currentAge);
              const bType = findBuildingTypeByHotkey(keyLabel, buildableTypes);
              if (bType) {
                this.startPlacement(bType);
                this.onSelectionChange?.();
                return;
              }
            } else if (this.selectedUnitIds.length === 0 && this.selectedBuildingId) {
              const bldg = this.buildings.find((b) => b.id === this.selectedBuildingId);
              if (bldg && bldg.isConstructed && this.isHumanControlled(bldg.faction)) {
                if (keyLabel === UNGARRISON_HOTKEY && (bldg.garrisonedUnitIds?.length || 0) > 0) {
                  this.ungarrisonAll(bldg.id);
                  return;
                }
                const unitToTrain = findTrainingUnitByHotkey(keyLabel, bldg.buildingDef.trainableUnits);
                if (unitToTrain) {
                  this.trainUnit(bldg.id, unitToTrain);
                  return;
                }
                const bCiv = bldg.civilization || this.getCivilizationForFaction(bldg.faction);
                const techIds = getAllTechsForBuilding(bldg.buildingType, bCiv).map((t) => t.id);
                const techToResearch = findTechIdByHotkey(keyLabel, techIds);
                if (techToResearch) {
                  this.startResearch(bldg.id, techToResearch);
                  return;
                }
              }
            } else if (this.selectedUnitIds.length > 0 && keyLabel === FIELD_ENGINEERING_HOTKEY) {
              this.startFieldRamAssembly();
              return;
            }
          }
        }
      }
      if (!isTyping && e.code === 'KeyM') {
        sound.muted = !sound.muted;
        this.onStateChange?.();
      }

      // Control Group Hotkeys (1-9): Ctrl+N assigns, Shift+N appends, N selects (double-tap centers camera)
      if (!isTyping && this.gameState === 'playing' && !this.isSpectatorMode && /^Digit[1-9]$/.test(e.code)) {
        const num = Number(e.code.replace('Digit', ''));
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          this.assignControlGroup(num, false);
        } else if (e.shiftKey) {
          e.preventDefault();
          this.assignControlGroup(num, true);
        } else {
          const now = performance.now();
          const lastTap = this.lastGroupKeyTime[num] || 0;
          const isDoubleTap = now - lastTap < 360;
          this.lastGroupKeyTime[num] = now;
          this.selectControlGroup(num, isDoubleTap);
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      this.keysHeld.delete(e.code);
    };

    const onBlur = () => {
      this.keysHeld.clear();
      this.clearEdgeScroll();
    };

    const onMouseLeave = () => {
      this.clearEdgeScroll();
    };

    const onPointerMove = (e: PointerEvent) => {
      if (this.gameState !== 'playing') {
        this.clearEdgeScroll();
        return;
      }
      if (document.querySelector('[data-hotkeys-modal="true"], [data-age-modal="true"], [data-tech-tree-modal="true"]')) {
        this.clearEdgeScroll();
        return;
      }
      this.setEdgeScrollFromClient(e.clientX, e.clientY);
    };

    const onWheel = (e: WheelEvent) => {
      if (this.gameState !== 'playing') return;
      const targetEl = e.target as HTMLElement | null;
      if (
        targetEl?.closest(
          '[data-hotkeys-modal="true"], [data-age-modal="true"], [data-tech-tree-modal="true"], .overflow-y-auto',
        )
      ) {
        return;
      }
      e.preventDefault();
      this.adjustCameraZoom(e.deltaY);
    };

    const onResize = () => {
      if (!this.container) return;
      const width = this.container.clientWidth;
      const height = this.container.clientHeight;
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    document.addEventListener('mouseleave', onMouseLeave);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('resize', onResize);

    this.cleanupWindowListeners.push(
      () => window.removeEventListener('keydown', onKeyDown),
      () => window.removeEventListener('keyup', onKeyUp),
      () => window.removeEventListener('blur', onBlur),
      () => document.removeEventListener('mouseleave', onMouseLeave),
      () => window.removeEventListener('pointermove', onPointerMove),
      () => window.removeEventListener('wheel', onWheel),
      () => window.removeEventListener('resize', onResize)
    );
  }

  public screenToWorld(clientX: number, clientY: number): THREE.Vector3 | null {
    const rect = this.container.getBoundingClientRect();
    this.pointerNdc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );

    this.raycaster.setFromCamera(this.pointerNdc, this.camera);

    const terrain = this.terrainMesh || this.scene.getObjectByName('terrain');
    if (!terrain) return null;
    const intersects = this.raycaster.intersectObject(terrain);
    if (intersects.length > 0) {
      return intersects[0].point;
    }
    return null;
  }


  /** Rebuild unit silhouettes when age or visual techs change. */
  public refreshFactionUnitMeshes(faction: FactionId) {
    const age = this.ageByFaction[faction] || 1;
    const techs = this.getResearchedTechs(faction);
    for (const unit of this.units) {
      if (unit.faction !== faction || unit.hp <= 0) continue;
      if (unit.garrisonedInBuildingId?.startsWith('transport:')) continue;
      const old = this.unitMeshes.get(unit.id);
      if (!old) continue;
      const pos = old.position.clone();
      const rotY = old.rotation.y;
      this.scene.remove(old);
      // Only dispose non-shared geometries (named unique parts); skip materials
      old.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh || !mesh.geometry) return;
        if (mesh.name === 'agePlume' || mesh.name === 'weaponGlow' || mesh.userData?.uniqueGeo) {
          mesh.geometry.dispose();
        }
      });
      const next = createUnitMesh(unit.unitDef, faction, {
        age,
        researchedTechIds: techs,
        unitId: unit.unitDefId,
        level: unit.level || 1,
        visualSeed: unit.id,
      });
      this.prepareUnitMeshForDecorationBatch(next);
      next.position.copy(pos);
      next.rotation.y = rotY;
      Object.assign(next.userData, {
        type: 'unit',
        id: unit.id,
        faction,
        team: unit.team,
      });
      this.scene.add(next);
      this.unitMeshes.set(unit.id, next);
    }
  }

  public advanceAge(faction: FactionId, landmarkType: LandmarkType): void {
    const landmarkDef = DEFAULT_BUILDINGS[landmarkType];
    const currentAge = this.ageByFaction[faction] || 1;
    const targetAge = landmarkDef?.landmarkAgeAdvance || ((currentAge + 1) as AgeLevel);
    this.ageByFaction[faction] = targetAge;
    for (const building of this.buildings) {
      if (building.faction !== faction || building.hp <= 0) continue;
      const buildingMesh = this.buildingMeshes.get(building.id);
      if (buildingMesh) updateBuildingAgeVisuals(buildingMesh, targetAge);
    }
    this.refreshFactionUnitMeshes(faction);
    if (!this.landmarksByFaction[faction]) this.landmarksByFaction[faction] = [];
    if (!this.landmarksByFaction[faction].includes(landmarkType)) {
      this.landmarksByFaction[faction].push(landmarkType);
    }

    // Recompute unit stats using updated Age + Landmarks + Unique Building Aura + Researched Techs
    this.refreshFactionUnitStats(faction);

    const ageNames: Record<AgeLevel, string> = {
      1: '黑暗時代',
      2: '封建時代',
      3: '城堡時代',
      4: '帝王時代',
    };

    if (this.isHumanControlled(faction)) {
      this.playerAge = targetAge;
      this.playerLandmarks = [...this.landmarksByFaction[faction]];
      sound.playAgeUp();
      this.addFloatingText(
        this.cameraTarget.x,
        4.5,
        this.cameraTarget.z,
        `🎉 晉升至【${ageNames[targetAge]}】！已啟用：${landmarkDef?.name?.split(' ')[0] || '地標'}`,
        '#facc15'
      );
    } else {
      this.enemyAge = targetAge;
      if (!this.enemyLandmarks.includes(landmarkType)) {
        this.enemyLandmarks.push(landmarkType);
      }
      const tc = this.buildings.find((b) => b.faction === faction && b.buildingType === 'town_center');
      if (tc) {
        const pName = this.getParticipant(faction)?.name || faction;
        this.addFloatingText(
          tc.x,
          5.0,
          tc.z,
          `🏛️ ${pName} 晉升【${ageNames[targetAge]}】`,
          '#facc15'
        );
      }
    }

    this.onStateChange?.();
  }

  public raycastInteractive(clientX: number, clientY: number): {
    hitType: 'unit' | 'building' | 'resource' | 'contested' | 'terrain' | 'none';
    unit?: UnitEntity;
    building?: BuildingEntity;
    resource?: ResourceNode;
    contested?: ContestedPoint;
    point: THREE.Vector3 | null;
  } {
    const rect = this.container.getBoundingClientRect();
    this.pointerNdc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );

    this.raycaster.setFromCamera(this.pointerNdc, this.camera);

    const hasWorkerSelected = this.selectedUnitIds.some((uid) => {
      const u = this.units.find((unit) => unit.id === uid);
      return !!u && u.hp > 0 && u.unitDef.category === 'worker' && this.isHumanControlled(u.faction);
    });

    // 1. First test 3D ray intersection against interactive meshes
    const candidateMeshes: THREE.Object3D[] = [];
    this.unitMeshes.forEach((mesh) => candidateMeshes.push(mesh));
    this.buildingMeshes.forEach((mesh) => candidateMeshes.push(mesh));
    this.nodeMeshes.forEach((mesh) => candidateMeshes.push(mesh));
    this.contestedMeshes.forEach((mesh) => candidateMeshes.push(mesh));

    const hits = this.raycaster.intersectObjects(candidateMeshes, true);
    for (const hit of hits) {
      let obj: THREE.Object3D | null = hit.object;
      while (obj && obj !== this.scene) {
        const uData = obj.userData;
        if (uData && uData.type === 'unit') {
          const u = this.units.find((unit) => unit.id === uData.id);
          if (u && u.hp > 0) return { hitType: 'unit', unit: u, point: hit.point };
        }
        if (uData && uData.type === 'building') {
          const b = this.buildings.find((bldg) => bldg.id === uData.id);
          if (b && b.hp > 0) {
            // If player has workers selected and hits a completed friendly Farm, target its food resource directly!
            if (hasWorkerSelected && b.buildingType === 'farm' && b.isConstructed && !this.isHostileToPlayer(b)) {
              const farmNode = this.getOrCreateFarmFoodNode(b);
              if (farmNode && farmNode.amount > 0) {
                return { hitType: 'resource', resource: farmNode, point: hit.point };
              }
            }
            return { hitType: 'building', building: b, point: hit.point };
          }
        }
        if (uData && uData.type === 'resource') {
          const n = this.resourceNodes.find((node) => node.id === uData.id);
          if (n && n.amount > 0) return { hitType: 'resource', resource: n, point: hit.point };
        }
        if (uData && uData.type === 'contested') {
          const cp = this.contestedPoints.find((point) => point.id === uData.id);
          if (cp) return { hitType: 'contested', contested: cp, point: hit.point };
        }
        obj = obj.parent;
      }
    }

    // 2. Fallback to terrain intersection
    const terrain = this.terrainMesh || this.scene.getObjectByName('terrain');
    let groundPoint: THREE.Vector3 | null = null;
    if (terrain) {
      const terrainHits = this.raycaster.intersectObject(terrain);
      if (terrainHits.length > 0) {
        groundPoint = terrainHits[0].point;
      }
    }

    if (groundPoint) {
      // 3. Proximity check around ground point for forgiving clicks
      let closestUnit: UnitEntity | null = null;
      let minUnitDist = 2.2;
      for (const u of this.units) {
        if (u.hp <= 0 || u.garrisonedInBuildingId) continue;
        const d = Math.hypot(u.x - groundPoint.x, u.z - groundPoint.z);
        if (d < minUnitDist) {
          minUnitDist = d;
          closestUnit = u;
        }
      }
      if (closestUnit) {
        return { hitType: 'unit', unit: closestUnit, point: groundPoint };
      }

      for (const b of this.buildings) {
        if (b.hp <= 0) continue;
        const d = Math.hypot(b.x - groundPoint.x, b.z - groundPoint.z);
        if (d < b.buildingDef.size) {
          if (hasWorkerSelected && b.buildingType === 'farm' && b.isConstructed && !this.isHostileToPlayer(b)) {
            const farmNode = this.getOrCreateFarmFoodNode(b);
            if (farmNode && farmNode.amount > 0) {
              return { hitType: 'resource', resource: farmNode, point: groundPoint };
            }
          }
          return { hitType: 'building', building: b, point: groundPoint };
        }
      }

      for (const n of this.resourceNodes) {
        if (n.amount <= 0) continue;
        const d = Math.hypot(n.x - groundPoint.x, n.z - groundPoint.z);
        const pickR =
          n.resourceType === 'gold'
            ? 3.0
            : n.resourceType === 'stone'
            ? 2.6
            : n.resourceType === 'wood'
            ? 1.5
            : 2.1;
        if (d < pickR) {
          return { hitType: 'resource', resource: n, point: groundPoint };
        }
      }

      for (const cp of this.contestedPoints) {
        const d = Math.hypot(cp.x - groundPoint.x, cp.z - groundPoint.z);
        if (d < 2.8) {
          return { hitType: 'contested', contested: cp, point: groundPoint };
        }
      }

      return { hitType: 'terrain', point: groundPoint };
    }

    return { hitType: 'none', point: null };
  }

  public destroy() {
    this.isDestroyed = true;
    this.aiDecisionFactionIds.length = 0;
    this.aiDecisionSchedulerState.accumulatorSeconds = 0;
    this.aiDecisionSchedulerState.cursor = 0;
    this.cancelPlacement();
    this.fieldSiegeProjects.forEach((project) => this.disposeFieldSiegeProject(project));
    this.fieldSiegeProjects = [];
    this.groundZones.forEach((zone) => {
      this.scene.remove(zone.mesh);
      zone.mesh.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry?.dispose();
        if (Array.isArray(mesh.material)) mesh.material.forEach((material) => material.dispose());
        else mesh.material?.dispose();
      });
    });
    this.groundZones = [];
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.cleanupWindowListeners.forEach((fn) => fn());
    this.cleanupWindowListeners = [];
    this.performanceOverlay?.remove();
    this.performanceOverlay = null;
    const particleGeometry = this.particleSolidBatch?.geometry || this.particleSmokeBatch?.geometry;
    if (this.particleSolidBatch) {
      this.scene.remove(this.particleSolidBatch);
      (this.particleSolidBatch.material as THREE.Material).dispose();
      this.particleSolidBatch = null;
    }
    if (this.particleSmokeBatch) {
      this.scene.remove(this.particleSmokeBatch);
      (this.particleSmokeBatch.material as THREE.Material).dispose();
      this.particleSmokeBatch = null;
    }
    particleGeometry?.dispose();
    this.renderer.dispose();
  }
}
