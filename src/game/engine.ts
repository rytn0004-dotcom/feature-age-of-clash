import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  AgeLevel,
  EconomyMode,
  BuildingDefinition,
  BuildingEntity,
  BuildingType,
  CivilizationId,
  FactionId,
  FloatingText,
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
} from '../types/game';
import { DEFAULT_BUILDINGS, INITIAL_MODS } from './mods';
import {
  applyCivilizationAndTechStats,
  canUnitGainXp,
  computeUnitXpGain,
  dampAngle,
  dampScalar,
  findTechDef,
  getAllTechsForBuilding,
  getAvailableTechsForBuilding,
  getBuildableTypesForCiv,
  getCivilizationConfig,
  getLevelTitle,
  getTrainableUnitsForBuilding,
} from './civilizations';
import {
  AGE_ADVANCE_HOTKEY,
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
  canAfford,
  computeAiWorkerAllocation,
  computeBuildingVisualState,
  computeGarrisonDefenseProfile,
  computeSpatialAudioGain,
  computeStridePhaseDelta,
  createDefaultParticipants,
  deductCost,
  evaluateAiPlan,
  findClosestEnemy,
  findClosestResourceNode,
  generateSpawnPositions,
  getBuildingMaxGarrison,
  getDistance,
  getEffectiveBuildingArmor,
  getUnitVsUnitDamage,
  isAllAiMatch,
  MatchWinnerSummary,
  resolveMatchOutcome,
  selectClusterFocusTarget,
  selectEconomyRebalancePlan,
  selectOptimalCombatTarget,
} from './rules';
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
import { buildNavGrid, findPath, NavGrid, TerrainNavObstacles } from './pathfinding';
import { generateMapLayout, MapLayoutResult } from './mapGenerator';
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
  applyTerrainBiomeMaterial,
  createBerryBushMesh,
  createBuildingMesh,
  createCommandRingMesh,
  createDeerMesh,
  createEnvironmentFeaturesGroup,
  createGoldMineMesh,
  createRallyFlagMesh,
  createRubbleDecalMesh,
  createSelectionRing,
  createStoneQuarryMesh,
  createTreeMesh,
  createUnitMesh,
  disposeBuildingVisualResources,
  registerFactionVisual,
  UnitAnimParts,
  updateBadgeSprite,
} from './proceduralGraphics';
import { getCraggyRockMaps, getWaterRippleNormalMap } from './proceduralTextures';

type ParticleKind = 'hit' | 'spark' | 'wood' | 'gold' | 'stone' | 'leaf' | 'dust' | 'smoke' | 'ember';

interface PooledParticle {
  mesh: THREE.Mesh;
  kind: ParticleKind;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  baseScale: number;
  active: boolean;
}

export class RtsEngine {
  public container: HTMLElement;
  public renderer!: THREE.WebGLRenderer;
  public scene!: THREE.Scene;
  public camera!: THREE.PerspectiveCamera;
  public isSoftwareGl = false;

  private frameId = 0;
  private isDestroyed = false;

  // RTS Multi-Participant & Team State
  public participants: MatchParticipant[] = createDefaultParticipants();
  public isSpectatorMode = false;
  public humanPlayerId: string = 'player';
  public humanTeam: number = 1;
  public observedFactionId: FactionId = 'player';
  public resourcesByFaction: Record<string, Resources> = {};
  public playerResources: Resources = { food: 250, wood: 200, gold: 120, stone: 60 };
  public enemyResources: Resources = { food: 250, wood: 200, gold: 120, stone: 60 };
  public activeMods: GameMod[] = JSON.parse(JSON.stringify(INITIAL_MODS));

  public units: UnitEntity[] = [];
  public buildings: BuildingEntity[] = [];
  public resourceNodes: ResourceNode[] = [];
  public projectiles: Projectile[] = [];
  public floatingTexts: FloatingText[] = [];

  // Map Preset & Terrain Obstacles
  public mapPreset: MapPresetId = 'river_valley';
  public resourceRichness: ResourceRichness = 'standard';
  public economyMode: EconomyMode = 'classic';
  public mapLayout: MapLayoutResult | null = null;
  private environmentGroup: THREE.Group | null = null;
  private terrainMesh: THREE.Mesh | null = null;

  // Pathfinding Navigation Grid Cache
  private navGrid: NavGrid | null = null;
  private navGridDirty = true;

  // Reusable Raycaster & HUD Sync Throttle
  private raycaster = new THREE.Raycaster();
  private pointerNdc = new THREE.Vector2();
  private lastHudResSyncTime = 0;

  // Control Groups (1-9) & Quick Cycling Indices
  public controlGroups: ControlGroupsMap = createEmptyControlGroups();
  private lastGroupKeyTime: Record<number, number> = {};
  private idleCycleIdx = 0;
  private militaryBldgCycleIdx = 0;

  // Minimap Direct Order Ping
  public lastMinimapPing: { x: number; z: number; type: 'move' | 'attack'; time: number } | null = null;

  // Meshes cache
  private unitMeshes = new Map<string, THREE.Group>();
  private buildingMeshes = new Map<string, THREE.Group>();
  private nodeMeshes = new Map<string, THREE.Group>();
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
  private rallyFlagMesh: THREE.Group | null = null;
  private rallyLineMesh: THREE.Line | null = null;

  // Civilization Progression & Research State
  public researchedTechsByFaction: Record<string, string[]> = {};
  public pendingCommandMode: 'normal' | 'attack_move' = 'normal';

  // Pooled 3D Particle VFX, KO Topples, Shockwaves & World Animation Clock
  private simTime = 0;
  private lastHudSelectionSyncTime = 0;
  private lastTimerSec = -1;
  private particlePool: PooledParticle[] = [];
  private particleCursor = 0;
  private particleMaterials: Record<ParticleKind, THREE.MeshBasicMaterial> | null = null;
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
  private rubbleDecals: Array<{ mesh: THREE.Group; age: number; maxAge: number }> = [];
  private shockwaveRings: Array<{ mesh: THREE.Mesh; age: number; maxAge: number; maxScale: number }> = [];

  // Tactical Event Alert State (Enemy spotted / Under attack / Resource depleted)
  public lastAttackAlert: { x: number; z: number; time: number; active: boolean } | null = null;
  public lastTacticalBroadcast: {
    kind: 'enemy_spotted' | 'under_attack' | 'resource_depleted';
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
  public inspectedEntity: { type: 'unit' | 'building'; id: string; faction: FactionId } | null = null;
  public showOverheadBadges = true;

  // Placement mode
  public placementBuildingType: BuildingType | null = null;
  private placementGhostMesh: THREE.Group | null = null;

  // Camera navigation
  public cameraTarget = new THREE.Vector3(0, 0, 0);
  private cameraDesiredTarget: THREE.Vector3 | null = null;
  private cameraPanVelX = 0;
  private cameraPanVelZ = 0;
  private keysHeld = new Set<string>();

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
  private aiTickAccumulator = 0;

  // Callbacks for UI updates
  public onStateChange?: () => void;
  public onResourcesChange?: (res: Resources) => void;
  public onSelectionChange?: () => void;
  public onRequestOpenAgeModal?: () => void;

  constructor(container: HTMLElement) {
    this.container = container;
    this.restoreSavedMods();
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

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb); // Clear blue sky
    this.scene.fog = new THREE.FogExp2(0x87ceeb, 0.007);

    // Studio Environment map
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    // Isometric tilt RTS camera
    const aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(42, aspect, 1, 300);
    this.updateCameraPosition();

    // Lighting: Warm key directional sun + cool hemisphere fill
    const sunLight = new THREE.DirectionalLight(0xfffaed, 2.2);
    sunLight.position.set(40, 60, 30);
    sunLight.castShadow = !this.isSoftwareGl;
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    sunLight.shadow.camera.near = 10;
    sunLight.shadow.camera.far = 150;
    const d = 45;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.bias = -0.0005;
    this.scene.add(sunLight);

    const hemiLight = new THREE.HemisphereLight(0xb1e1ff, 0x3b5323, 1.05);
    this.scene.add(hemiLight);

    const rimLight = new THREE.DirectionalLight(0xbae6fd, 0.72);
    rimLight.position.set(-36, 38, -32);
    rimLight.castShadow = false;
    this.scene.add(rimLight);

    // Terrain Plane with level playable arena [-55..55] and sculpted rolling outer hills
    const terrainGeo = new THREE.PlaneGeometry(160, 160, 44, 44);
    terrainGeo.rotateX(-Math.PI / 2);
    const posAttr = terrainGeo.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      const vx = posAttr.getX(i);
      const vz = posAttr.getZ(i);
      const edgeDist = Math.max(Math.abs(vx), Math.abs(vz)) - 56;
      if (edgeDist > 0) {
        const ridge =
          Math.sin(vx * 0.14) * Math.cos(vz * 0.14) * 1.4 +
          Math.sin((vx + vz) * 0.08) * 1.1;
        const elev = Math.min(7.5, edgeDist * 0.22 + Math.max(0, ridge) * (edgeDist / 16));
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
      const edgeDist = Math.max(0, Math.max(Math.abs(vx), Math.abs(vz)) - 54);
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
    const pGeo = new THREE.BoxGeometry(0.18, 0.18, 0.18);
    this.particleMaterials = {
      hit: new THREE.MeshBasicMaterial({ color: 0xef4444 }),
      spark: new THREE.MeshBasicMaterial({ color: 0xfef08a }),
      wood: new THREE.MeshBasicMaterial({ color: 0x92400e }),
      gold: new THREE.MeshBasicMaterial({ color: 0xfbbf24 }),
      stone: new THREE.MeshBasicMaterial({ color: 0x94a3b8 }),
      leaf: new THREE.MeshBasicMaterial({ color: 0x22c55e }),
      dust: new THREE.MeshBasicMaterial({ color: 0xe2e8f0 }),
      smoke: new THREE.MeshBasicMaterial({ color: 0x475569, transparent: true, opacity: 0.72 }),
      ember: new THREE.MeshBasicMaterial({ color: 0xf97316 }),
    };
    const count = 112;
    this.particlePool = [];
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(pGeo, this.particleMaterials.spark);
      mesh.visible = false;
      this.scene.add(mesh);
      this.particlePool.push({
        mesh,
        kind: 'spark',
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 0.4,
        baseScale: 1,
        active: false,
      });
    }
  }

  private getSpatialAudioScale(x: number, z: number): number {
    const dist = Math.hypot(x - this.cameraTarget.x, z - this.cameraTarget.z);
    return computeSpatialAudioGain(dist, 42);
  }

  public spawnParticleBurst(x: number, y: number, z: number, kind: ParticleKind, count = 6) {
    if (!this.particleMaterials || this.particlePool.length === 0) return;
    const mat = this.particleMaterials[kind];
    const isBuoyant = kind === 'smoke' || kind === 'ember';
    for (let i = 0; i < count; i++) {
      const p = this.particlePool[this.particleCursor];
      this.particleCursor = (this.particleCursor + 1) % this.particlePool.length;
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.65;
      const speed = isBuoyant ? 0.35 + Math.random() * 0.85 : 1.6 + Math.random() * 2.6;
      const baseScale = kind === 'smoke' ? 2.1 + Math.random() * 1.4 : kind === 'ember' ? 0.75 + Math.random() * 0.5 : 0.8 + Math.random() * 0.6;
      p.mesh.material = mat;
      p.mesh.position.set(
        x + (isBuoyant ? (Math.random() - 0.5) * 1.2 : 0),
        y,
        z + (isBuoyant ? (Math.random() - 0.5) * 1.2 : 0)
      );
      p.mesh.scale.setScalar(baseScale);
      p.mesh.visible = true;
      p.kind = kind;
      p.baseScale = baseScale;
      p.vx = Math.cos(angle) * speed;
      p.vy = kind === 'smoke' ? 1.8 + Math.random() * 1.2 : kind === 'ember' ? 2.6 + Math.random() * 1.8 : 2.4 + Math.random() * 2.5;
      p.vz = Math.sin(angle) * speed;
      p.life = 0;
      p.maxLife = kind === 'smoke' ? 0.85 + Math.random() * 0.45 : kind === 'ember' ? 0.55 + Math.random() * 0.35 : 0.32 + Math.random() * 0.24;
      p.active = true;
    }
  }

  private updateParticles(dt: number) {
    for (let i = 0; i < this.particlePool.length; i++) {
      const p = this.particlePool[i];
      if (!p.active) continue;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        p.mesh.visible = false;
        continue;
      }
      const prog = p.life / p.maxLife;
      if (p.kind === 'smoke') {
        p.vy += 1.2 * dt;
        p.vx *= Math.max(0, 1 - 1.5 * dt);
        p.vz *= Math.max(0, 1 - 1.5 * dt);
        p.mesh.scale.setScalar(p.baseScale * (0.85 + prog * 1.15) * (1 - prog * 0.65));
      } else if (p.kind === 'ember') {
        p.vy += 0.8 * dt;
        p.mesh.scale.setScalar(Math.max(0.08, p.baseScale * (1 - prog)));
      } else {
        p.vy -= 9.5 * dt;
        p.mesh.scale.setScalar(Math.max(0.05, p.baseScale * (1 - prog)));
      }
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y = Math.max(0.05, p.mesh.position.y + p.vy * dt);
      p.mesh.position.z += p.vz * dt;
      p.mesh.rotation.x += (p.kind === 'smoke' ? 1.6 : 6) * dt;
      p.mesh.rotation.y += (p.kind === 'smoke' ? 1.4 : 5) * dt;
    }
  }

  private createMountainPerimeter() {
    const rockMaps = getCraggyRockMaps();
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
    const peakGeo = new THREE.DodecahedronGeometry(1, 1);
    const count = 48;
    const radius = 75;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const dist = radius + Math.sin(i * 1.9) * 3.5;
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      const w = 6.5 + (i % 4) * 1.6;
      const h = 8.5 + ((i * 7) % 9) * 1.2;

      const peak = new THREE.Mesh(peakGeo, i % 2 === 0 ? rockMat : darkRockMat);
      peak.scale.set(w, h, w * 0.88);
      peak.rotation.set((i % 3) * 0.14, angle + i * 0.5, ((i + 1) % 3) * 0.1);
      peak.position.set(x, h * 0.42, z);
      this.scene.add(peak);

      // Foothill spur
      const spur = new THREE.Mesh(peakGeo, darkRockMat);
      spur.scale.set(w * 0.72, h * 0.48, w * 0.72);
      spur.rotation.y = angle + 1.1;
      spur.position.set(x - Math.cos(angle) * 3.8, h * 0.18, z - Math.sin(angle) * 3.8);
      this.scene.add(spur);
    }
  }

  public getParticipant(factionId: FactionId): MatchParticipant | undefined {
    return this.participants.find((p) => p.id === factionId);
  }

  public getCivilizationForFaction(factionId: FactionId): CivilizationId {
    return getCivilizationConfig(this.getParticipant(factionId)?.civilization).id;
  }

  private modScope(mod: GameMod): CivilizationId | 'shared' {
    if (mod.civilizationId) return mod.civilizationId;
    const legacyScope = mod.id.startsWith('mod_') ? mod.id.slice(4) : '';
    return legacyScope === 'medieval' || legacyScope === 'anime' || legacyScope === 'fantasy'
      ? legacyScope
      : 'shared';
  }

  private modAppliesToFaction(mod: GameMod, faction: FactionId): boolean {
    if (!mod.enabled) return false;
    const scope = this.modScope(mod);
    return scope === 'shared' || scope === this.getCivilizationForFaction(faction);
  }

  public getCustomTechDefinitions(faction: FactionId): TechDefinition[] {
    return this.activeMods
      .filter((mod) => this.modAppliesToFaction(mod, faction))
      .flatMap((mod) => mod.techDefinitions || []);
  }

  public findTechDefinition(techId: string, faction: FactionId): TechDefinition | undefined {
    return findTechDef(techId, this.getCustomTechDefinitions(faction));
  }

  public getAvailableTechsForBuilding(faction: FactionId, buildingType: BuildingType): TechDefinition[] {
    const civ = this.getCivilizationForFaction(faction);
    return getAvailableTechsForBuilding(
      buildingType,
      civ,
      this.getResearchedTechs(faction),
      (this.ageByFaction[faction] || 1) as AgeLevel,
      this.getCustomTechDefinitions(faction)
    );
  }

  public getAllTechsForBuilding(faction: FactionId, buildingType: BuildingType): TechDefinition[] {
    return getAllTechsForBuilding(
      buildingType,
      this.getCivilizationForFaction(faction),
      this.getCustomTechDefinitions(faction)
    );
  }

  public getBuildingDefinition(type: BuildingType, faction?: FactionId): BuildingDefinition {
    const base = DEFAULT_BUILDINGS[type];
    if (!base) throw new Error(`Unknown building type: ${String(type)}`);
    let resolved: BuildingDefinition = {
      ...base,
      cost: { ...base.cost },
      trainableUnits: [...base.trainableUnits],
    };

    for (const mod of this.activeMods) {
      if (!mod.enabled) continue;
      if (faction && !this.modAppliesToFaction(mod, faction)) continue;
      if (!faction && this.modScope(mod) !== 'shared') continue;
      const override = mod.buildingOverrides?.[type];
      if (!override) continue;
      resolved = {
        ...resolved,
        ...override,
        id: type,
        cost: { ...resolved.cost, ...(override.cost || {}) },
        trainableUnits: override.trainableUnits
          ? [...override.trainableUnits]
          : [...resolved.trainableUnits],
      };
    }
    return resolved;
  }

  public saveModsToLocalStorage(): boolean {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return false;
      window.localStorage.setItem('age-of-clash-mods-v1', JSON.stringify(this.activeMods));
      return true;
    } catch {
      return false;
    }
  }

  private restoreSavedMods(): void {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      const raw = window.localStorage.getItem('age-of-clash-mods-v1');
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      const valid = parsed.filter(
        (mod) =>
          mod &&
          typeof mod.id === 'string' &&
          typeof mod.name === 'string' &&
          Array.isArray(mod.unitDefinitions) &&
          mod.balanceMultipliers &&
          Array.isArray(mod.aiRules)
      );
      if (valid.length !== parsed.length) return;
      this.activeMods = valid.map((mod) => ({
        ...mod,
        civilizationId: mod.civilizationId || this.modScope(mod),
        buildingOverrides: mod.buildingOverrides || {},
        techDefinitions: Array.isArray(mod.techDefinitions) ? mod.techDefinitions : [],
      }));
    } catch {
      // Ignore invalid browser storage and keep the built-in packs.
    }
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

  public setupWorld(
    customParticipants?: MatchParticipant[],
    mapPreset?: MapPresetId,
    resourceRichness?: ResourceRichness,
    economyMode?: EconomyMode
  ) {
    if (mapPreset) this.mapPreset = mapPreset;
    if (resourceRichness) this.resourceRichness = resourceRichness;
    if (economyMode) this.economyMode = economyMode;

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
    this.unitMeshes.forEach((m) => this.scene.remove(m));
    this.buildingMeshes.forEach((m) => {
      disposeBuildingVisualResources(m);
      this.scene.remove(m);
    });
    this.nodeMeshes.forEach((m) => this.scene.remove(m));
    this.selectionRings.forEach((r) => this.scene.remove(r));
    this.selectionRings.clear();
    this.commandIndicators.forEach((c) => this.scene.remove(c.mesh));
    this.commandIndicators = [];
    this.particlePool.forEach((p) => {
      p.active = false;
      p.mesh.visible = false;
    });
    this.dyingEffects.forEach((d) => this.scene.remove(d.mesh));
    this.dyingEffects = [];
    this.collapsingBuildings.forEach((cb) => {
      disposeBuildingVisualResources(cb.mesh);
      this.scene.remove(cb.mesh);
    });
    this.collapsingBuildings = [];
    this.rubbleDecals.forEach((rd) => this.scene.remove(rd.mesh));
    this.rubbleDecals = [];
    this.shockwaveRings.forEach((s) => {
      this.scene.remove(s.mesh);
      (s.mesh.material as THREE.Material).dispose();
    });
    this.shockwaveRings = [];
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
    this.nodeMeshes.clear();
    this.projectileMeshes.forEach((entry) => {
      entry.mesh.visible = false;
      (this.projectilePool[entry.type] || this.projectilePool.arrow).push(entry.mesh);
    });
    this.projectileMeshes.clear();
    this.units = [];
    this.buildings = [];
    this.resourceNodes = [];
    this.projectiles = [];
    this.floatingTexts = [];
    this.selectedUnitIds = [];
    this.selectedBuildingId = null;
    this.selectedNodeId = null;
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
    this.aiTickAccumulator = 1.2;
    this.playerAge = 1;
    this.enemyAge = 1;
    this.playerLandmarks = [];
    this.enemyLandmarks = [];

    this.participants.forEach((p) => {
      const civId = getCivilizationConfig(p.civilization).id;
      p.civilization = civId;
      this.resourcesByFaction[p.id] =
        this.economyMode === 'economic_sandbox'
          ? { food: 650, wood: 500, gold: 350, stone: 250 }
          : { food: 250, wood: 200, gold: 120, stone: 60 };
      this.ageByFaction[p.id] = 1;
      this.landmarksByFaction[p.id] = [];
      this.researchedTechsByFaction[p.id] = [];

      const hostile = this.isSpectatorMode ? false : p.team !== this.humanTeam;
      registerFactionVisual(p.id, {
        primary: p.colorHex,
        banner: p.accentHex,
        ring: p.accentHex,
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

    const spawns = generateSpawnPositions(this.participants.length, 36);
    const layout = generateMapLayout(
      this.mapPreset,
      this.resourceRichness,
      this.participants.map((p, idx) => ({ id: p.id, x: spawns[idx].x, z: spawns[idx].z }))
    );
    this.mapLayout = layout;

    this.environmentGroup = createEnvironmentFeaturesGroup(layout);
    this.scene.add(this.environmentGroup);

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
          const cx = Math.max(-52, Math.min(52, tx + Math.cos(ang) * r));
          const cz = Math.max(-52, Math.min(52, tz + Math.sin(ang) * r));
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

    let humanCameraTarget = { x: -28, z: -24 };

    // Spawn each participant at a distinct position with balanced starter TC, Barracks & Farm
    this.participants.forEach((p, idx) => {
      const sp = spawns[idx];
      const len = Math.hypot(sp.x, sp.z) || 1;
      const inX = -sp.x / len;
      const inZ = -sp.z / len;
      const tanX = -inZ;
      const tanZ = inX;

      const civCfg = getCivilizationConfig(p.civilization);
      const workerDef = this.findUnitDef(civCfg.workerUnitId) || fallbackWorker;
      const starterCombatDef = this.findUnitDef(civCfg.starterMeleeUnitId) || fallbackWarrior;

      const tc = this.addBuilding('town_center', p.id, sp.x, sp.z, true);
      tc.rallyPoint = { x: sp.x + inX * 6, z: sp.z + inZ * 6 };

      const barracksSpot = findValidStarterSpot(sp.x + tanX * 10.5, sp.z + tanZ * 10.5, DEFAULT_BUILDINGS.barracks.size);
      const barracks = this.addBuilding('barracks', p.id, barracksSpot.x, barracksSpot.z, true);
      barracks.rallyPoint = { x: barracksSpot.x + inX * 6.5, z: barracksSpot.z + inZ * 6.5 };

      const farmSpot = findValidStarterSpot(sp.x - tanX * 8.5, sp.z - tanZ * 8.5, DEFAULT_BUILDINGS.farm.size);
      const farmBldg = this.addBuilding('farm', p.id, farmSpot.x, farmSpot.z, true);
      this.addResourceNode(`food_${farmBldg.id}`, 'food', farmSpot.x, farmSpot.z, 2500, true, 'farm');

      if (p.id === this.humanPlayerId) {
        humanCameraTarget = { x: sp.x, z: sp.z };
      }

      // Initial Civilization Units (3 unique workers + 1 signature guard)
      this.addUnit(workerDef, p.id, sp.x + inX * 5.8 - tanX * 2, sp.z + inZ * 5.8 - tanZ * 2);
      this.addUnit(workerDef, p.id, sp.x + inX * 5.8, sp.z + inZ * 5.8);
      this.addUnit(workerDef, p.id, sp.x + inX * 5.8 + tanX * 2, sp.z + inZ * 5.8 + tanZ * 2);
      this.addUnit(starterCombatDef, p.id, sp.x + inX * 7.5 + tanX * 5.5, sp.z + inZ * 7.5 + tanZ * 5.5);
    });

    // Spawn all map resource nodes (mines, quarries, forests, berry groves, deer herds)
    const groveBadgeFlags = new Set<string>();
    layout.resourceNodes.forEach((rn) => {
      let showBadge = true;
      if (rn.subtype === 'wood' || rn.subtype === 'berry' || rn.subtype === 'hunt') {
        const prefix = rn.id.replace(/_\d+$/, '');
        if (groveBadgeFlags.has(prefix)) {
          showBadge = false;
        } else {
          groveBadgeFlags.add(prefix);
        }
      }
      this.addResourceNode(rn.id, rn.resourceType, rn.x, rn.z, rn.amount, showBadge, rn.subtype);
    });

    this.navGridDirty = true;

    // Center camera on Human Player Town Center
    this.cameraTarget.set(humanCameraTarget.x, 0, humanCameraTarget.z);
    this.updateCameraPosition();
  }

  public findUnitDef(id: string, faction?: FactionId): UnitDefinition | undefined {
    for (const mod of this.activeMods) {
      if (!mod.enabled || (faction && !this.modAppliesToFaction(mod, faction))) continue;
      const found = mod.unitDefinitions.find((u) => u.id === id);
      if (found) {
        const modStats = applyBalanceMultipliers(found.stats, mod.balanceMultipliers);
        if (faction) {
          const civ = this.getCivilizationForFaction(faction);
          const techs = this.getResearchedTechs(faction);
          return {
            ...found,
            stats: applyCivilizationAndTechStats(modStats, found.category, civ, techs, this.getCustomTechDefinitions(faction)),
          };
        }
        return {
          ...found,
          stats: modStats,
        };
      }
    }
    return undefined;
  }

  public getAvailableUnitDefs(faction: FactionId): UnitDefinition[] {
    const list: UnitDefinition[] = [];
    const civ = this.getCivilizationForFaction(faction);
    const techs = this.getResearchedTechs(faction);
    for (const mod of this.activeMods) {
      if (!this.modAppliesToFaction(mod, faction)) continue;
      for (const u of mod.unitDefinitions) {
        const modStats = applyBalanceMultipliers(u.stats, mod.balanceMultipliers);
        list.push({
          ...u,
          stats: applyCivilizationAndTechStats(modStats, u.category, civ, techs, this.getCustomTechDefinitions(faction)),
        });
      }
    }
    return list;
  }

  public addUnit(def: UnitDefinition, faction: FactionId, x: number, z: number): UnitEntity {
    const id = `unit_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const team = this.getParticipant(faction)?.team ?? (faction === 'player' ? 1 : 2);
    const effectiveDef = this.findUnitDef(def.id, faction) || {
      ...def,
      stats: applyCivilizationAndTechStats(
        def.stats,
        def.category,
        this.getCivilizationForFaction(faction),
        this.getResearchedTechs(faction),
        this.getCustomTechDefinitions(faction)
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
      kills: 0,
      xp: xpEligible ? 0 : undefined,
      level: xpEligible ? 1 : undefined,
      attackMoveGoal: null,
    };
    this.units.push(unit);

    const mesh = createUnitMesh(unit.unitDef, faction);
    mesh.position.set(x, 0, z);
    Object.assign(mesh.userData, { type: 'unit', id, faction, team });
    this.scene.add(mesh);
    this.unitMeshes.set(id, mesh);

    if (this.isHumanControlled(faction)) {
      this.stats.unitsTrained++;
    }

    return unit;
  }

  public addBuilding(
    type: BuildingType,
    faction: FactionId,
    x: number,
    z: number,
    instant = false
  ): BuildingEntity {
    const baseDef = this.getBuildingDefinition(type, faction);
    const civ = this.getCivilizationForFaction(faction);
    const civCfg = getCivilizationConfig(civ);
    const customName = civCfg.buildingNames[type]
      ? `${civCfg.buildingNames[type]} (${baseDef.name.split('(')[1] || `${type})`}`
      : baseDef.name;
    const customTrainables = this.activeMods
      .filter((mod) => this.modAppliesToFaction(mod, faction))
      .flatMap((mod) =>
        mod.unitDefinitions
          .filter((unit) => unit.availableInBuildings?.includes(type))
          .map((unit) => unit.id)
      );
    const bDef = {
      ...baseDef,
      name: customName,
      trainableUnits: Array.from(
        new Set([...getTrainableUnitsForBuilding(type, civ, baseDef.trainableUnits), ...customTrainables])
      ),
    };
    const researchedTechs = this.getResearchedTechs(faction);
    let hpMult = 1;
    researchedTechs.forEach((tId) => {
      const t = this.findTechDefinition(tId, faction);
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
    };
    this.buildings.push(building);
    this.navGridDirty = true;

    const mesh = createBuildingMesh(type, faction, civ);
    mesh.position.set(x, 0, z);
    mesh.userData = { ...mesh.userData, type: 'building', id, faction, team };
    applyBuildingConstructionVisuals(
      mesh,
      computeBuildingVisualState(instant, building.buildProgress, building.hp, building.maxHp)
    );
    this.scene.add(mesh);
    this.buildingMeshes.set(id, mesh);

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
    subtype?: ResourceNode['subtype']
  ): ResourceNode {
    const resolvedSubtype: ResourceNode['subtype'] =
      subtype || (type === 'food' ? 'farm' : type);
    const node: ResourceNode = {
      id,
      resourceType: type,
      subtype: resolvedSubtype,
      x,
      z,
      amount,
      maxAmount: amount,
    };
    this.resourceNodes.push(node);
    this.navGridDirty = true;

    let mesh: THREE.Group;
    if (type === 'wood') {
      mesh = createTreeMesh(hasBadge);
    } else if (type === 'gold') {
      mesh = createGoldMineMesh(amount);
    } else if (type === 'stone') {
      mesh = createStoneQuarryMesh(amount);
    } else if (resolvedSubtype === 'berry') {
      mesh = createBerryBushMesh(amount, hasBadge);
    } else if (resolvedSubtype === 'hunt') {
      mesh = createDeerMesh(amount, hasBadge);
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
    mesh.userData = { type: 'resource', id, resourceType: type, subtype: resolvedSubtype };
    this.scene.add(mesh);
    this.nodeMeshes.set(id, mesh);

    return node;
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
      Math.max(-45, Math.min(45, x)),
      0,
      Math.max(-45, Math.min(45, z))
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

    const tech = this.findTechDefinition(techId, bldg.faction);
    if (!tech) return false;
    if (tech.buildingType !== bldg.buildingType) return false;

    const researched = this.getResearchedTechs(bldg.faction);
    if (researched.includes(techId)) return false;

    const age = this.ageByFaction[bldg.faction] || 1;
    if (tech.requiredAge && age < tech.requiredAge) return false;

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
    this.units.forEach((u) => {
      if (u.faction !== faction || u.hp <= 0) return;
      if (tech.targetCategories && !tech.targetCategories.includes(u.unitDef.category)) return;

      if (tech.effect.hpMultiplier) {
        const oldMax = u.maxHp;
        u.maxHp = Math.round(u.maxHp * tech.effect.hpMultiplier);
        u.hp = Math.min(u.maxHp, u.hp + Math.max(0, u.maxHp - oldMax));
      }
      if (tech.effect.attackBonus) u.unitDef.stats.attack += tech.effect.attackBonus;
      if (tech.effect.defenseBonus) u.unitDef.stats.defense += tech.effect.defenseBonus;
      if (tech.effect.speedMultiplier) u.unitDef.stats.speed = +(u.unitDef.stats.speed * tech.effect.speedMultiplier).toFixed(2);
      if (tech.effect.gatherMultiplier) u.unitDef.stats.gatherSpeed = +(u.unitDef.stats.gatherSpeed * tech.effect.gatherMultiplier).toFixed(2);
      if (tech.effect.rangeBonus) u.unitDef.stats.range = +(u.unitDef.stats.range + tech.effect.rangeBonus).toFixed(2);
      if (tech.effect.rangedDefenseBonus) {
        u.unitDef.stats.rangedDefense = (u.unitDef.stats.rangedDefense || 0) + tech.effect.rangedDefenseBonus;
      }
      if (tech.effect.siegeDamageMultiplier && u.unitDef.stats.buildingAttack !== undefined) {
        u.unitDef.stats.buildingAttack = Math.round(u.unitDef.stats.buildingAttack * tech.effect.siegeDamageMultiplier);
      }
      if (cooldownMult !== 1 && u.unitDef.specialAbility) {
        u.unitDef.specialAbility.cooldown = Math.max(3, Math.round(u.unitDef.specialAbility.cooldown * cooldownMult));
      }
    });

    if (tech.effect.buildingHpMultiplier) {
      const bHpMult = tech.effect.buildingHpMultiplier;
      this.buildings.forEach((b) => {
        if (b.faction !== faction || b.hp <= 0) return;
        const oldMax = b.maxHp;
        b.maxHp = Math.round(b.maxHp * bHpMult);
        b.hp = Math.min(b.maxHp, b.hp + Math.max(0, b.maxHp - oldMax));
      });
    }

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

  public activateUnitAbility(unit: UnitEntity): boolean {
    if (!unit || unit.hp <= 0 || !unit.unitDef.specialAbility || unit.abilityCooldown > 0) return false;
    const ab = unit.unitDef.specialAbility;
    const researched = this.getResearchedTechs(unit.faction);
    let cdMult = 1;
    researched.forEach((tId) => {
      const t = this.findTechDefinition(tId, unit.faction);
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
      this.addFloatingText(unit.x, 2.8, unit.z, `💚 ${ab.name} (治療 ${healedCount} 名)`, '#34d399');
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
      this.addFloatingText(unit.x, 2.8, unit.z, `⚡ ${ab.name}！全軍疾衝`, '#fbbf24');
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
      u.waypoints = undefined;
      u.pathGoal = undefined;
      u.velocity = { x: 0, z: 0 };
      u.state = 'idle';
      u.currentActionText = '🛑 停止待命';
    });
    sound.playSelect();
    this.onSelectionChange?.();
  }

  public issueAttackMoveOrder(x: number, z: number) {
    const playerUnits = this.selectedUnitIds
      .map((uid) => this.units.find((u) => u.id === uid))
      .filter((u): u is UnitEntity => !!u && u.hp > 0 && this.isHumanControlled(u.faction));
    if (playerUnits.length === 0) return;

    this.pendingCommandMode = 'normal';
    sound.playAttackOrder();
    this.spawnCommandIndicator(x, z, 'attack');
    this.addFloatingText(x, 2.5, z, '⚔️ 攻擊推進指令', '#f87171');

    const count = playerUnits.length;
    const spacing = 1.6;
    const cols = Math.ceil(Math.sqrt(count));
    playerUnits.forEach((unit, idx) => {
      const row = Math.floor(idx / cols);
      const col = idx % cols;
      const ox = (col - (cols - 1) / 2) * spacing;
      const oz = (row - Math.floor((count - 1) / cols) / 2) * spacing;
      const gx = Math.max(-58, Math.min(58, x + ox));
      const gz = Math.max(-58, Math.min(58, z + oz));

      unit.targetX = gx;
      unit.targetZ = gz;
      unit.attackMoveGoal = { x: gx, z: gz };
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
    this.inspectedEntity = null;
    this.setCameraFocus(target.x, target.z);
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
      const clampedX = Math.max(-56, Math.min(56, worldX));
      const clampedZ = Math.max(-56, Math.min(56, worldZ));
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

  public issueMoveOrder(x: number, z: number) {
    const playerUnits = this.selectedUnitIds
      .map((uid) => this.units.find((u) => u.id === uid))
      .filter((u): u is UnitEntity => !!u && this.isHumanControlled(u.faction));
    if (playerUnits.length === 0) return;
    this.pendingCommandMode = 'normal';
    sound.playOrder();
    this.spawnCommandIndicator(x, z, 'move');

    // Formation dispersion
    const count = playerUnits.length;
    const spacing = 1.5;
    const cols = Math.ceil(Math.sqrt(count));

    playerUnits.forEach((unit, idx) => {
      const row = Math.floor(idx / cols);
      const col = idx % cols;
      const ox = (col - (cols - 1) / 2) * spacing;
      const oz = (row - Math.floor((count - 1) / cols) / 2) * spacing;

      unit.targetX = Math.max(-58, Math.min(58, x + ox));
      unit.targetZ = Math.max(-58, Math.min(58, z + oz));
      unit.attackMoveGoal = null;
      unit.targetEntityId = undefined;
      unit.targetResourceNodeId = undefined;
      unit.targetBuildingId = undefined;
      unit.waypoints = undefined;
      unit.pathGoal = undefined;
      unit.pathCooldown = 0;
      unit.state = 'moving';
      unit.currentActionText = '👣 行軍移動中';
    });
  }

  public issueAttackOrder(targetId: string) {
    const playerUnits = this.selectedUnitIds
      .map((uid) => this.units.find((u) => u.id === uid))
      .filter((u): u is UnitEntity => !!u && this.isHumanControlled(u.faction));
    if (playerUnits.length === 0) return;
    this.pendingCommandMode = 'normal';
    sound.playAttackOrder();

    const target =
      this.units.find((u) => u.id === targetId) ||
      this.buildings.find((b) => b.id === targetId);
    if (target) {
      this.spawnCommandIndicator(target.x, target.z, 'attack');
    }

    playerUnits.forEach((unit) => {
      unit.attackMoveGoal = null;
      unit.targetEntityId = targetId;
      unit.targetResourceNodeId = undefined;
      unit.targetBuildingId = undefined;
      unit.waypoints = undefined;
      unit.pathGoal = undefined;
      unit.pathCooldown = 0;
      unit.state = 'attacking';
      unit.currentActionText = '⚔️ 奔赴交戰';
    });
  }

  public getResourceDisplayMeta(node: ResourceNode): { icon: string; name: string; action: string } {
    const sub = node.subtype || node.resourceType;
    switch (sub) {
      case 'wood':
        return { icon: '🪓', name: '森林原木', action: '伐木' };
      case 'hunt':
        return { icon: '🥩', name: '野生鹿群', action: '採集肉類' };
      case 'berry':
        return { icon: '🫐', name: '野生漿果', action: '採集漿果' };
      case 'farm':
        return { icon: '🌾', name: '豐饒農田', action: '農田耕作' };
      case 'gold':
        return { icon: '🪙', name: '黃金礦脈', action: '開採金礦' };
      case 'stone':
        return { icon: '🪨', name: '花崗石礦', action: '開採石料' };
      default:
        return { icon: '🌾', name: '糧食', action: '採集糧食' };
    }
  }

  public issueGatherOrder(nodeId: string) {
    const workers = this.selectedUnitIds
      .map((id) => this.units.find((u) => u.id === id))
      .filter((u): u is UnitEntity => !!u && this.isHumanControlled(u.faction) && u.unitDef.category === 'worker');

    if (workers.length === 0) return;
    sound.playOrder();

    const node = this.resourceNodes.find((n) => n.id === nodeId);
    if (node) {
      this.spawnCommandIndicator(node.x, node.z, 'gather');
    }
    const meta = node ? this.getResourceDisplayMeta(node) : { icon: '⛏️', name: '資源', action: '採集資源' };

    workers.forEach((worker) => {
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

  public issueBuildOrder(buildingId: string) {
    const bldg = this.buildings.find((b) => b.id === buildingId);
    if (!bldg || bldg.isConstructed || bldg.hp <= 0) return;

    const workers = this.selectedUnitIds
      .map((id) => this.units.find((u) => u.id === id))
      .filter((u): u is UnitEntity => !!u && this.isHumanControlled(u.faction) && u.unitDef.category === 'worker');

    if (workers.length === 0) return;
    sound.playOrder();
    this.spawnCommandIndicator(bldg.x, bldg.z, 'build');

    const bName = bldg.buildingDef.name.split(' ')[0];
    workers.forEach((worker) => {
      worker.targetBuildingId = buildingId;
      worker.targetResourceNodeId = undefined;
      worker.targetEntityId = undefined;
      worker.waypoints = undefined;
      worker.pathGoal = undefined;
      worker.pathCooldown = 0;
      worker.state = 'building';
      worker.currentActionText = `🔨 前往建造${bName}`;
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
    ignoreBuildingId?: string
  ): { x: number; z: number } {
    const obs = this.getTerrainNavObstacles();
    const minDistBase = Math.max(2.0, baseRadius + unitRadius + 0.75);

    for (let ring = 0; ring < 4; ring++) {
      const r = minDistBase + ring * 1.15;
      for (let step = 0; step < 12; step++) {
        const ang = Math.PI * 0.5 + ((step + indexOffset) / 12) * Math.PI * 2;
        const candX = Math.max(-56, Math.min(56, cx + Math.cos(ang) * r));
        const candZ = Math.max(-56, Math.min(56, cz + Math.sin(ang) * r));

        if (isPointInTerrainObstacle(candX, candZ, obs?.rects, obs?.discs, obs?.bridges)) continue;

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
      x: Math.max(-56, Math.min(56, cx)),
      z: Math.max(-56, Math.min(56, cz + minDistBase)),
    };
  }

  public canGarrisonInBuilding(unit: UnitEntity, bldg: BuildingEntity): boolean {
    if (!unit || unit.hp <= 0 || unit.garrisonedInBuildingId) return false;
    if (unit.unitDef.category === 'siege') return false;
    if (!bldg || bldg.hp <= 0 || !bldg.isConstructed || bldg.faction !== unit.faction) return false;
    const maxCap = getBuildingMaxGarrison(bldg);
    if (maxCap <= 0) return false;
    return (bldg.garrisonedUnitIds?.length || 0) < maxCap;
  }

  public issueGarrisonOrder(buildingId: string): boolean {
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
    const availableSlots = Math.max(0, maxCap - currentCount);
    if (availableSlots <= 0) {
      this.addFloatingText(bldg.x, 3.0, bldg.z, `🛡️ 駐防已滿 (${currentCount}/${maxCap})`, '#f59e0b');
      sound.playInvalid();
      return false;
    }

    const chosen = [...eligible]
      .sort((a, b) => getDistance(a.x, a.z, bldg.x, bldg.z) - getDistance(b.x, b.z, bldg.x, bldg.z))
      .slice(0, availableSlots);

    const bName = bldg.buildingDef.name.split(' ')[0];
    chosen.forEach((u) => {
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

  public ungarrisonAll(buildingId: string): number {
    const bldg = this.buildings.find((b) => b.id === buildingId);
    if (!bldg || !bldg.garrisonedUnitIds || bldg.garrisonedUnitIds.length === 0) return 0;

    const ids = [...bldg.garrisonedUnitIds];
    bldg.garrisonedUnitIds = [];
    let released = 0;

    ids.forEach((uid, idx) => {
      const unit = this.units.find((u) => u.id === uid && u.hp > 0);
      if (!unit) return;
      unit.garrisonedInBuildingId = undefined;
      unit.targetGarrisonBuildingId = undefined;

      const uRadius = getUnitColliderRadius(unit.unitDef.category, unit.unitDef.visual.scale);
      const spot = this.findSafeExteriorSpot(bldg.x, bldg.z, getBuildingCollisionRadius(bldg), uRadius, idx, bldg.id);
      unit.x = spot.x;
      unit.z = spot.z;
      unit.velocity = { x: 0, z: 0 };
      unit.waypoints = undefined;
      unit.state = 'idle';
      unit.currentActionText = '🚪 撤出建築待命';

      const mesh = this.unitMeshes.get(unit.id);
      if (mesh) {
        mesh.position.set(unit.x, 0, unit.z);
        mesh.visible = true;
      }

      if (unit.unitDef.category === 'worker' && bldg.rallyPoint?.targetResourceNodeId) {
        const resNode = this.resourceNodes.find(
          (n) => n.id === bldg.rallyPoint!.targetResourceNodeId && n.amount > 0
        );
        if (resNode) {
          unit.targetResourceNodeId = resNode.id;
          unit.state = 'gathering';
          const meta = this.getResourceDisplayMeta(resNode);
          unit.currentActionText = `${meta.icon} 前往${meta.action}`;
        }
      }
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
    if (def.requiredAge && currentAge < def.requiredAge) {
      if (this.isHumanControlled(bldg.faction)) {
        sound.playInvalid();
        this.addFloatingText(bldg.x, 3.0, bldg.z, `🔒 需先晉升至時代 ${def.requiredAge} 才能建造`, '#ef4444');
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

  public startPlacement(type: BuildingType) {
    const bDef = this.getBuildingDefinition(type, this.humanPlayerId);
    if (!canAfford(this.playerResources, bDef.cost)) return;

    this.placementBuildingType = type;
    if (this.placementGhostMesh) {
      this.scene.remove(this.placementGhostMesh);
    }
    this.placementGhostMesh = createBuildingMesh(type, this.humanPlayerId, this.getCivilizationForFaction(this.humanPlayerId));
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
  }

  public confirmPlacement(x: number, z: number): boolean {
    if (!this.placementBuildingType) return false;
    const bDef = this.getBuildingDefinition(this.placementBuildingType, this.humanPlayerId);
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
      obs?.bridges
    );
    if (!isValid) {
      this.addFloatingText(x, 2.5, z, '⚠️ 無法建造：不可建於水域、山崖或重疊建築！', '#ef4444');
      sound.playInvalid();
      return false;
    }

    this.resourcesByFaction[this.humanPlayerId] = deductCost(humanRes, bDef.cost);
    this.syncHumanResourcesAlias();
    this.onResourcesChange?.(this.playerResources);

    const bldg = this.addBuilding(this.placementBuildingType, this.humanPlayerId, x, z, false);
    sound.playConstruct();
    this.spawnCommandIndicator(x, z, 'build');

    // Assign currently selected workers to construct it
    const workers = this.selectedUnitIds
      .map((id) => this.units.find((u) => u.id === id))
      .filter((u): u is UnitEntity => !!u && u.unitDef.category === 'worker' && this.isHumanControlled(u.faction));

    workers.forEach((w) => {
      w.targetBuildingId = bldg.id;
      w.targetResourceNodeId = undefined;
      w.targetEntityId = undefined;
      w.waypoints = undefined;
      w.pathGoal = undefined;
      w.pathCooldown = 0;
      w.state = 'building';
      w.currentActionText = `🔨 前往建造${bDef.name.split(' ')[0]}`;
    });

    this.cancelPlacement();
    return true;
  }

  public cancelPlacement() {
    this.placementBuildingType = null;
    if (this.placementGhostMesh) {
      this.scene.remove(this.placementGhostMesh);
      this.placementGhostMesh = null;
    }
  }

  // ------------------ MAIN SIMULATION LOOP ------------------

  private startLoop() {
    let lastTime = performance.now();

    const tick = () => {
      if (this.isDestroyed) return;

      const now = performance.now();
      const rawDt = Math.max(0.001, (now - lastTime) / 1000);
      lastTime = now;
      const clampedRawDt = Math.min(rawDt, this.isSoftwareGl ? 0.25 : 0.05);
      const totalDt = clampedRawDt * this.gameSpeed;

      if (this.gameState === 'playing') {
        let remaining = totalDt;
        while (remaining > 0.0001) {
          const step = Math.min(remaining, 0.05);
          this.updateSimulation(step);
          this.stats.gameDuration += step;
          remaining -= step;
        }
      } else if (this.gameState === 'title') {
        // Atmospheric live camera pan over the battlefield
        const t = now * 0.0003;
        this.cameraTarget.x = Math.sin(t) * 15;
        this.cameraTarget.z = Math.cos(t) * 15;
        this.updateCameraPosition();
      }

      this.renderer.render(this.scene, this.camera);

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
    waterNorm.offset.x = (this.simTime * 0.036) % 1;
    waterNorm.offset.y = (this.simTime * 0.022) % 1;

    let flagIdx = 0;
    this.buildingMeshes.forEach((bMesh) => {
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

    let envIdx = 0;
    this.nodeMeshes.forEach((nMesh) => {
      const canopy = nMesh.userData.treeCanopy as THREE.Object3D | undefined;
      if (canopy) {
        canopy.rotation.z = Math.sin(this.simTime * 1.6 + envIdx * 0.7) * 0.035;
        canopy.rotation.x = Math.cos(this.simTime * 1.2 + envIdx * 0.5) * 0.02;
      } else {
        const deerHead = nMesh.userData.deerHeadPivot as THREE.Object3D | undefined;
        if (deerHead) {
          const graze = Math.max(0, Math.sin(this.simTime * 1.1 + envIdx * 1.7));
          deerHead.rotation.z = -graze * 0.45;
        }
      }
      envIdx++;
    });

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

    // 2.5 Layer-based Collision Resolution (Prevents clipping & overlapping)
    resolveUnitUnitCollisions(this.units);
    resolveUnitBuildingCollisions(this.units, this.buildings);
    resolveUnitResourceCollisions(this.units, this.resourceNodes);

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
      }
    }

    // 3. Buildings simulation & Civ Building Auras
    this.updateBuildings(dt);

    // 4. Projectiles
    this.updateProjectiles(dt);

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
      }
    }

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
        this.scene.remove(rd.mesh);
        this.rubbleDecals.splice(i, 1);
      } else if (remain < 0.35) {
        const s = Math.max(0.05, remain / 0.35);
        rd.mesh.scale.set(s, s, s);
      }
    }

    for (let i = this.shockwaveRings.length - 1; i >= 0; i--) {
      const sr = this.shockwaveRings[i];
      sr.age += dt;
      const p = sr.age / sr.maxAge;
      if (p >= 1) {
        this.scene.remove(sr.mesh);
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
    this.aiTickAccumulator += dt;
    if (this.aiTickAccumulator >= 1.2) {
      this.aiTickAccumulator = 0;
      this.evaluateAiLogic();
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

  private handleCameraMovement(dt: number) {
    const panSpeed = 28;
    let inputX = 0;
    let inputZ = 0;

    if (this.keysHeld.has('KeyW') || this.keysHeld.has('ArrowUp')) {
      inputX -= panSpeed;
      inputZ -= panSpeed;
    }
    if (this.keysHeld.has('KeyS') || this.keysHeld.has('ArrowDown')) {
      inputX += panSpeed;
      inputZ += panSpeed;
    }
    if (this.keysHeld.has('KeyA') || this.keysHeld.has('ArrowLeft')) {
      inputX -= panSpeed;
      inputZ += panSpeed;
    }
    if (this.keysHeld.has('KeyD') || this.keysHeld.has('ArrowRight')) {
      inputX += panSpeed;
      inputZ -= panSpeed;
    }

    if (inputX !== 0 || inputZ !== 0) {
      this.cameraDesiredTarget = null;
    }

    this.cameraPanVelX = dampScalar(this.cameraPanVelX, inputX, 14, dt);
    this.cameraPanVelZ = dampScalar(this.cameraPanVelZ, inputZ, 14, dt);

    if (Math.abs(this.cameraPanVelX) > 0.05 || Math.abs(this.cameraPanVelZ) > 0.05) {
      this.cameraTarget.x = Math.max(-46, Math.min(46, this.cameraTarget.x + this.cameraPanVelX * dt));
      this.cameraTarget.z = Math.max(-46, Math.min(46, this.cameraTarget.z + this.cameraPanVelZ * dt));
      this.updateCameraPosition();
    } else {
      this.cameraPanVelX = 0;
      this.cameraPanVelZ = 0;
    }
  }

  private updateCameraPosition() {
    this.camera.position.set(
      this.cameraTarget.x + 22,
      this.cameraTarget.y + 30,
      this.cameraTarget.z + 26
    );
    this.camera.lookAt(this.cameraTarget.x, 0, this.cameraTarget.z);
  }

  private updateUnits(dt: number) {
    const remainingUnits: UnitEntity[] = [];
    let anyDied = false;

    for (const unit of this.units) {
      if (unit.hp <= 0) {
        anyDied = true;
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

      remainingUnits.push(unit);

      // Cooldowns & timers
      if (unit.attackCooldown > 0) unit.attackCooldown -= dt;
      if (unit.abilityCooldown > 0) unit.abilityCooldown -= dt;
      if (unit.pathCooldown && unit.pathCooldown > 0) unit.pathCooldown -= dt;
      if (unit.hitFlashTimer && unit.hitFlashTimer > 0) unit.hitFlashTimer = Math.max(0, unit.hitFlashTimer - dt);
      if (unit.recoilTimer && unit.recoilTimer > 0) unit.recoilTimer = Math.max(0, unit.recoilTimer - dt);

      // Garrisoned units are sheltered from enemy melee/ranged fire & regenerate HP slowly
      if (unit.garrisonedInBuildingId) {
        const hostBldg = this.buildings.find((b) => b.id === unit.garrisonedInBuildingId && b.hp > 0 && b.isConstructed);
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

      // Behavior by state
      switch (unit.state) {
        case 'moving':
          if (unit.attackMoveGoal && unit.unitDef.category !== 'worker') {
            const enemy = selectOptimalCombatTarget(unit, this.units, this.buildings, this.units, {
              maxSearchRange: 13,
            });
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
        case 'garrisoning':
          this.stepUnitGarrisoning(unit, dt);
          break;
        case 'idle':
          // Auto acquire nearby hostile enemies with 1v1 counter-matchup scoring (or resume attackMoveGoal if set!)
          if (unit.unitDef.category !== 'worker') {
            const enemy = selectOptimalCombatTarget(unit, this.units, this.buildings, this.units, {
              maxSearchRange: 14,
            });
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
          badge.visible = this.showOverheadBadges;
          const now = performance.now();
          const isUnderAttack = !!(unit.lastDamagedTime && now - unit.lastDamagedTime < 2500);
          const xpEligible = canUnitGainXp(unit.unitDefId, this.getCivilizationForFaction(unit.faction));
          const lvl = xpEligible ? unit.level || 1 : 1;
          const lastHp = (unit as any)._lastHp;
          const lastAction = (unit as any)._lastAction;
          const lastAttack = (unit as any)._lastAttack;
          const lastLvl = (unit as any)._lastLvl;

          if (
            lastHp !== unit.hp ||
            lastAction !== unit.currentActionText ||
            lastAttack !== isUnderAttack ||
            lastLvl !== lvl
          ) {
            (unit as any)._lastHp = unit.hp;
            (unit as any)._lastAction = unit.currentActionText;
            (unit as any)._lastAttack = isUnderAttack;
            (unit as any)._lastLvl = lvl;

            const roleIcons: Record<string, string> = {
              villager: '⛏️',
              swordsman: '⚔️',
              archer: '🏹',
              knight: '🐎',
              ninja: '🥷',
              saiyan: '⚡',
              mage: '🔮',
              golem: '🪵',
              ram: '🐏',
              cannon: '💣',
            };
            const icon = roleIcons[unit.unitDef.visual.modelType] || '⚔️';
            const hostile = this.isHostileToPlayer(unit);
            const pName = this.getParticipant(unit.faction)?.name || '';
            const prefix = this.isHumanControlled(unit.faction)
              ? ''
              : this.isSpectatorMode || hostile
              ? `${pName}·`
              : '友軍·';
            const lvlSuffix = xpEligible && lvl >= 2 ? ` ★Lv.${lvl}` : '';
            const displayName = `${prefix}${unit.unitDef.name.split(' ')[0]}${lvlSuffix}`;
            const ratio = Math.max(0, unit.hp / unit.maxHp);
            const actionText = isUnderAttack
              ? '⚠️ 遭受攻擊!'
              : unit.currentActionText || (unit.state === 'idle' ? '💤 待命中' : '');
            updateBadgeSprite(
              badge,
              displayName,
              icon,
              `${Math.max(0, unit.hp)}/${unit.maxHp}`,
              ratio,
              hostile,
              false,
              actionText,
              isUnderAttack
            );
          }
        }
      }
    }

    this.units = remainingUnits;

    if (anyDied) {
      const aliveSet = new Set(remainingUnits.map((u) => u.id));
      this.selectedUnitIds = this.selectedUnitIds.filter((id) => aliveSet.has(id));
      this.controlGroups = pruneControlGroups(this.controlGroups, aliveSet);
    }
  }

  /**
   * Moves a unit toward (goalX, goalZ) along obstacle-free A* waypoints with automatic re-routing if blocked.
   */
  private moveUnitAlongPath(unit: UnitEntity, goalX: number, goalZ: number, dt: number) {
    const navGrid = this.getNavGrid();

    // Detect if unit is stalled against an obstacle and force quick path refresh
    unit.stuckAccumulator = (unit.stuckAccumulator || 0) + dt;
    if (unit.stuckAccumulator >= 0.45) {
      if (unit.lastProgressCheckPos) {
        const moved = getDistance(unit.x, unit.z, unit.lastProgressCheckPos.x, unit.lastProgressCheckPos.z);
        if (moved < 0.25 && (!unit.pathCooldown || unit.pathCooldown <= 0)) {
          unit.waypoints = undefined;
        }
      }
      unit.lastProgressCheckPos = { x: unit.x, z: unit.z };
      unit.stuckAccumulator = 0;
    }

    const goalShifted =
      !unit.pathGoal || getDistance(unit.pathGoal.x, unit.pathGoal.z, goalX, goalZ) > 1.8;

    if (!unit.waypoints || unit.waypoints.length === 0 || (goalShifted && (!unit.pathCooldown || unit.pathCooldown <= 0))) {
      unit.waypoints = findPath(unit.x, unit.z, goalX, goalZ, navGrid);
      unit.pathGoal = { x: goalX, z: goalZ };
      unit.pathCooldown = 0.4;
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

    const activeTarget = unit.waypoints[0] || { x: goalX, z: goalZ };
    const distToWp = getDistance(unit.x, unit.z, activeTarget.x, activeTarget.z);
    if (distToWp <= 0.001) return;

    const hasteMult = unit.buffSpeedUntil && unit.buffSpeedUntil > this.simTime ? 1.35 : 1;
    const speed = unit.unitDef.stats.speed * hasteMult;
    const dx = (activeTarget.x - unit.x) / distToWp;
    const dz = (activeTarget.z - unit.z) / distToWp;
    const stepLen = Math.min(distToWp, speed * dt);

    unit.velocity = { x: dx, z: dz };
    unit.x += dx * stepLen;
    unit.z += dz * stepLen;
  }

  private stepUnitMoving(unit: UnitEntity, dt: number) {
    if (unit.targetX === undefined || unit.targetZ === undefined) {
      unit.state = 'idle';
      unit.attackMoveGoal = null;
      unit.currentActionText = '💤 待命中 (閒置)';
      return;
    }

    const dist = getDistance(unit.x, unit.z, unit.targetX, unit.targetZ);
    if (dist < 0.45) {
      unit.state = 'idle';
      unit.attackMoveGoal = null;
      unit.currentActionText = '💤 待命中 (閒置)';
      unit.velocity = { x: 0, z: 0 };
      unit.waypoints = undefined;
      return;
    }

    this.moveUnitAlongPath(unit, unit.targetX, unit.targetZ, dt);
    if (!unit.currentActionText || unit.currentActionText.includes('待命')) {
      unit.currentActionText = unit.attackMoveGoal ? '⚔️ 警戒推進中' : '👣 行軍移動中';
    }
  }

  private stepUnitAttacking(unit: UnitEntity, dt: number) {
    if (!unit.targetEntityId) {
      unit.state = 'idle';
      unit.currentActionText = '💤 待命中 (閒置)';
      return;
    }

    let targetUnit = this.units.find((u) => u.id === unit.targetEntityId);
    let targetBuilding = this.buildings.find((b) => b.id === unit.targetEntityId);
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
        const nearbyThreat = selectOptimalCombatTarget(unit, this.units, shouldSwitchOffBuilding ? [] : this.buildings, this.units, {
          maxSearchRange: Math.max(11, unit.unitDef.stats.range + 6),
        });
        if (nearbyThreat && nearbyThreat.id !== target.id && (shouldSwitchOffBuilding || nearbyThreat.hp < nearbyThreat.maxHp * 0.45)) {
          unit.targetEntityId = nearbyThreat.id;
          unit.waypoints = undefined;
          target = nearbyThreat;
        }
      } else {
        (unit as any)._retargetTimer = rt;
      }
    }

    if (!target || target.hp <= 0 || (target.type === 'unit' && (target as UnitEntity).garrisonedInBuildingId)) {
      unit.targetEntityId = undefined;
      unit.waypoints = undefined;
      const followUp = selectOptimalCombatTarget(unit, this.units, this.buildings, this.units, {
        maxSearchRange: unit.attackMoveGoal ? 15 : 12,
      });
      if (followUp && (!this.isHumanControlled(unit.faction) || !!unit.attackMoveGoal)) {
        unit.targetEntityId = followUp.id;
        unit.state = 'attacking';
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

    if (effectiveDist > range) {
      this.moveUnitAlongPath(unit, target.x, target.z, dt);
    } else {
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
        } else {
          let dmg: number;
          if (target.type === 'building') {
            const targetBldg = target as BuildingEntity;
            dmg = calculateBuildingDamage(
              unit,
              targetBldg,
              this.ageByFaction[targetBldg.faction] || 1,
              this.getResearchedTechs(targetBldg.faction),
              this.getResearchedTechs(unit.faction),
              this.landmarksByFaction[unit.faction] || []
            );
            const isRamOrTreant = unit.unitDef.category === 'siege' || unit.unitDefId === 'fantasy_treant';
            this.spawnParticleBurst(target.x, isRamOrTreant ? 1.2 : 1.0, target.z, isRamOrTreant ? 'stone' : 'ember', isRamOrTreant ? 6 : 4);
            this.spawnParticleBurst(target.x, 1.1, target.z, isRamOrTreant ? 'dust' : 'smoke', 3);
          } else {
            dmg = getUnitVsUnitDamage(unit.unitDef.stats.attack, target as UnitEntity, false, this.simTime);
            this.spawnParticleBurst(target.x, 0.9, target.z, 'hit', 5);
            this.spawnParticleBurst(target.x, 1.0, target.z, 'spark', 3);
          }

          target.hp -= dmg;
          (target as any).lastDamagedTime = performance.now();
          (target as any).hitFlashTimer = 0.085;
          if (target.type === 'unit') {
            (target as UnitEntity).recoilTimer = 0.14;
          }
          if (this.isHumanControlled(target.faction)) {
            this.triggerUnderAttackAlert(target.x, target.z);
          }
          this.addFloatingText(target.x, 2.2, target.z, `-${dmg}`, target.type === 'building' && unit.unitDef.category === 'siege' ? '#fb923c' : '#ef4444');
          this.awardUnitXp(unit, 8);

          if (target.hp <= 0) {
            unit.kills++;
            this.awardUnitXp(unit, 35);
          }
        }
      }
    }
  }

  private stepUnitGathering(unit: UnitEntity, dt: number) {
    if (!unit.targetResourceNodeId) {
      unit.state = 'idle';
      unit.currentActionText = '💤 待命中 (閒置)';
      return;
    }

    const node = this.resourceNodes.find((n) => n.id === unit.targetResourceNodeId);
    if (!node || node.amount <= 0) {
      const nextNode = findClosestResourceNode(unit.x, unit.z, this.resourceNodes, node?.resourceType, 24);
      if (nextNode) {
        unit.targetResourceNodeId = nextNode.id;
        unit.waypoints = undefined;
      } else if (unit.carryingResource && unit.carryingResource.amount >= 1) {
        unit.targetResourceNodeId = undefined;
        unit.waypoints = undefined;
        unit.state = 'returning_resource';
        unit.currentActionText = '🏃 送回剩餘資源';
      } else {
        unit.targetResourceNodeId = undefined;
        unit.state = 'idle';
        unit.currentActionText = '💤 附近資源已採盡';
      }
      return;
    }

    const curAmt = Math.round(unit.carryingResource?.amount || 0);
    const cap = unit.unitDef.stats.carryCapacity;
    const labelMap: Record<string, string> = {
      wood: '木材',
      gold: '黃金',
      stone: '石料',
      berry: '漿果',
      hunt: '獵物',
      farm: '農田',
      food: '糧食',
    };
    const rLabel = labelMap[node.subtype || node.resourceType] || '資源';
    unit.currentActionText = `⛏️ 採集${rLabel} (${curAmt}/${cap})`;

    const dist = getDistance(unit.x, unit.z, node.x, node.z);
    const nodeRadius = getResourceColliderRadius(node.resourceType, node.subtype);
    const gatherRange = nodeRadius + 1.35;

    if (dist > gatherRange) {
      this.moveUnitAlongPath(unit, node.x, node.z, dt);
    } else {
      unit.velocity = { x: 0, z: 0 };
      (unit as any)._desiredYaw = Math.atan2(node.x - unit.x, node.z - unit.z);
      if (!unit.carryingResource) {
        unit.carryingResource = { type: node.resourceType, amount: 0 };
      }

      const modeGatherMultiplier = this.economyMode === 'economic_sandbox' ? 1.25 : 1;
      const gatherRate = (unit.unitDef.stats.gatherSpeed || 2) * modeGatherMultiplier;
      const prevAmount = node.amount;
      const deltaGather = Math.min(node.amount, gatherRate * dt);
      unit.carryingResource.amount += deltaGather;
      node.amount -= deltaGather;

      const fxTimer = ((unit as any)._gatherFxTimer || 0) + dt;
      if (fxTimer >= 0.52) {
        (unit as any)._gatherFxTimer = 0;
        (unit as any)._gatherNodeType = node.subtype || node.resourceType;
        const pKind: ParticleKind =
          node.resourceType === 'wood'
            ? 'wood'
            : node.resourceType === 'gold'
            ? 'gold'
            : node.resourceType === 'stone'
            ? 'stone'
            : 'leaf';
        this.spawnParticleBurst(node.x, 0.85, node.z, pKind, 4);
      } else {
        (unit as any)._gatherFxTimer = fxTimer;
        (unit as any)._gatherNodeType = node.subtype || node.resourceType;
      }

      // Throttled remaining resource badge update (updates every ~10 units gathered to save canvas redraws)
      if (node.amount > 0) {
        const nodeMesh = this.nodeMeshes.get(node.id);
        if (nodeMesh) {
          const badge = nodeMesh.getObjectByName('badgeSprite') as THREE.Sprite;
          if (badge) {
            badge.visible = this.showOverheadBadges;
            const bucket = Math.ceil(node.amount / 10);
            if ((node as any)._lastBucket !== bucket) {
              (node as any)._lastBucket = bucket;
              const curNodeAmt = Math.round(node.amount);
              const icon =
                node.subtype === 'berry'
                  ? '🫐'
                  : node.subtype === 'hunt'
                  ? '🦌'
                  : node.resourceType === 'wood'
                  ? '🪵'
                  : node.resourceType === 'gold'
                  ? '🪙'
                  : node.resourceType === 'stone'
                  ? '🪨'
                  : '🌾';
              const title =
                node.subtype === 'berry'
                  ? '野生漿果'
                  : node.subtype === 'hunt'
                  ? '野生鹿群'
                  : node.resourceType === 'wood'
                  ? '木材'
                  : node.resourceType === 'gold'
                  ? '金礦'
                  : node.resourceType === 'stone'
                  ? '石礦'
                  : '農田';
              updateBadgeSprite(
                badge,
                title,
                icon,
                `${curNodeAmt}/${node.maxAmount}`,
                node.amount / node.maxAmount,
                false,
                true,
                `剩餘 ${Math.round((node.amount / node.maxAmount) * 100)}%`
              );
            }
          }
        }
      }

      if (prevAmount > 0 && node.amount <= 0) {
        this.navGridDirty = true;
        const mesh = this.nodeMeshes.get(node.id);
        if (mesh) {
          this.scene.remove(mesh);
          this.nodeMeshes.delete(node.id);
        }
        if (this.isHumanControlled(unit.faction) && !this.isSpectatorMode) {
          const meta = this.getResourceDisplayMeta(node);
          sound.playResourceDepleted(node.resourceType);
          this.lastTacticalBroadcast = {
            kind: 'resource_depleted',
            message: `${meta.icon} 播報：${meta.name}資源已採盡，請派遣村民轉往他處！`,
            x: node.x,
            z: node.z,
            time: performance.now(),
          };
          this.addFloatingText(node.x, 2.4, node.z, `${meta.icon} 資源已採盡！`, '#f59e0b');
          this.onStateChange?.();
        }
      }

      if (unit.carryingResource.amount >= unit.unitDef.stats.carryCapacity) {
        unit.waypoints = undefined;
        unit.state = 'returning_resource';
        unit.currentActionText = `🏃 運送物資回基地`;
      }
    }
  }

  private stepUnitReturning(unit: UnitEntity, dt: number) {
    if (!unit.carryingResource || unit.carryingResource.amount <= 0) {
      unit.state = 'idle';
      unit.currentActionText = '💤 待命中 (閒置)';
      return;
    }

    const resNames: Record<ResourceType, string> = { wood: '木材', gold: '黃金', stone: '石料', food: '糧食' };
    unit.currentActionText = `🏃 運送${resNames[unit.carryingResource.type] || '物資'}回基地`;

    const dropOffs = this.buildings.filter(
      (b) =>
        b.faction === unit.faction &&
        b.isConstructed &&
        (b.buildingType === 'town_center' ||
          (unit.carryingResource?.type === 'wood' && b.buildingType === 'lumber_camp') ||
          ((unit.carryingResource?.type === 'gold' || unit.carryingResource?.type === 'stone') &&
            b.buildingType === 'mining_camp'))
    );

    if (dropOffs.length === 0) {
      unit.state = 'idle';
      unit.currentActionText = '💤 無存放建築待命';
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

    const depositRange = Math.max(2.6, getBuildingCollisionRadius(nearest) + 1.85);
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

      if (unit.targetResourceNodeId) {
        unit.state = 'gathering';
      } else {
        unit.state = 'idle';
        unit.currentActionText = '💤 待命中 (閒置)';
      }
    }
  }

  private stepUnitBuilding(unit: UnitEntity, dt: number) {
    if (!unit.targetBuildingId) {
      unit.state = 'idle';
      unit.currentActionText = '💤 待命中 (閒置)';
      return;
    }

    const bldg = this.buildings.find((b) => b.id === unit.targetBuildingId);
    if (!bldg || bldg.hp <= 0 || bldg.isConstructed) {
      unit.targetBuildingId = undefined;
      unit.waypoints = undefined;
      unit.state = 'idle';
      unit.currentActionText = '💤 待命中 (閒置)';
      return;
    }

    const pct = Math.round(bldg.buildProgress * 100);
    unit.currentActionText = `🔨 建造${bldg.buildingDef.name.split(' ')[0]} (${pct}%)`;

    const dist = getDistance(unit.x, unit.z, bldg.x, bldg.z);
    const buildReach = Math.max(2.6, getBuildingCollisionRadius(bldg) + 2.1);

    if (dist > buildReach) {
      this.moveUnitAlongPath(unit, bldg.x, bldg.z, dt);
    } else {
      unit.velocity = { x: 0, z: 0 };
      (unit as any)._desiredYaw = Math.atan2(bldg.x - unit.x, bldg.z - unit.z);
      const buildSpeed = 1 / bldg.buildingDef.buildTime;
      bldg.buildProgress += buildSpeed * dt;
      bldg.hp = Math.round(bldg.maxHp * Math.min(1, bldg.buildProgress));

      const bFxTimer = ((unit as any)._buildFxTimer || 0) + dt;
      if (bFxTimer >= 0.54) {
        (unit as any)._buildFxTimer = 0;
        this.spawnParticleBurst(
          bldg.x + (unit.x - bldg.x) * 0.45,
          0.9,
          bldg.z + (unit.z - bldg.z) * 0.45,
          'dust',
          4
        );
        sound.playHammerBuild(this.getSpatialAudioScale(bldg.x, bldg.z));
      } else {
        (unit as any)._buildFxTimer = bFxTimer;
      }

      if (bldg.buildProgress >= 1) {
        bldg.isConstructed = true;
        bldg.buildProgress = 1;
        bldg.hp = bldg.maxHp;
        const mesh = this.buildingMeshes.get(bldg.id);
        if (mesh) {
          applyBuildingConstructionVisuals(
            mesh,
            computeBuildingVisualState(true, 1, bldg.hp, bldg.maxHp)
          );
        }
        sound.playConstruct(this.getSpatialAudioScale(bldg.x, bldg.z));
        this.spawnParticleBurst(bldg.x, 1.4, bldg.z, 'gold', 10);
        this.spawnParticleBurst(bldg.x, 1.1, bldg.z, 'dust', 8);
        this.spawnShockwaveRing(bldg.x, bldg.z, 0xfbbf24, bldg.buildingDef.size + 1.4);
        this.navGridDirty = true;
        if (this.isHumanControlled(bldg.faction)) this.stats.buildingsConstructed++;
        if (this.selectedBuildingId === bldg.id) this.onSelectionChange?.();
        unit.targetBuildingId = undefined;

        if (bldg.buildingDef.landmarkAgeAdvance) {
          this.advanceAge(bldg.faction, bldg.buildingType as LandmarkType);
        }

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
        } else {
          const nearbyRes = findClosestResourceNode(bldg.x, bldg.z, this.resourceNodes);
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
      unit.state = 'idle';
      unit.currentActionText = '💤 待命中 (閒置)';
      return;
    }

    const bldg = this.buildings.find((b) => b.id === unit.targetGarrisonBuildingId);
    if (!bldg || bldg.hp <= 0 || !bldg.isConstructed || bldg.faction !== unit.faction) {
      unit.targetGarrisonBuildingId = undefined;
      unit.waypoints = undefined;
      unit.state = 'idle';
      unit.currentActionText = '💤 待命中 (閒置)';
      return;
    }

    const maxCap = getBuildingMaxGarrison(bldg);
    const curCount = bldg.garrisonedUnitIds?.length || 0;
    if (curCount >= maxCap) {
      unit.targetGarrisonBuildingId = undefined;
      unit.waypoints = undefined;
      unit.state = 'idle';
      unit.currentActionText = '🛡️ 駐防已滿待命';
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

  private updateBuildings(dt: number) {
    const remainingBuildings: BuildingEntity[] = [];
    let selectedDestroyed = false;

    for (const bldg of this.buildings) {
      if (bldg.hp <= 0) {
        this.navGridDirty = true;
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
          const rubble = createRubbleDecalMesh(bldg.buildingDef.size);
          rubble.position.set(bldg.x, 0, bldg.z);
          this.scene.add(rubble);
          this.rubbleDecals.push({ mesh: rubble, age: 0, maxAge: 9.0 });

          this.spawnShockwaveRing(bldg.x, bldg.z, 0xf97316, bldg.buildingDef.size + 2.2);
          this.spawnParticleBurst(bldg.x, 1.4, bldg.z, 'smoke', 9);
          this.spawnParticleBurst(bldg.x, 1.2, bldg.z, 'ember', 8);
          this.spawnParticleBurst(bldg.x, 0.9, bldg.z, 'stone', 7);
          sound.playBuildingCollapse(this.getSpatialAudioScale(bldg.x, bldg.z));
        }
        continue;
      }

      remainingBuildings.push(bldg);

      if ((bldg as any).hitFlashTimer && (bldg as any).hitFlashTimer > 0) {
        (bldg as any).hitFlashTimer = Math.max(0, (bldg as any).hitFlashTimer - dt);
      }

      const bMesh = this.buildingMeshes.get(bldg.id);
      const visState = computeBuildingVisualState(bldg.isConstructed, bldg.buildProgress, bldg.hp, bldg.maxHp);
      if (bMesh) {
        applyBuildingConstructionVisuals(bMesh, visState);
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
              barracks: '⚔️',
              archery_range: '🏹',
              farm: '🌾',
              lumber_camp: '🪵',
              mining_camp: '⛏️',
              tower: '🗼',
              castle: '🏰',
              armory_forge: '⚒️',
              spirit_shrine: '⛩️',
              mana_well: '🔮',
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
      const speedBonusMult = hasNearbyForge ? 1.25 : 1.0;

      // Active Civilization Tech Research Progress
      if (bldg.activeTechId) {
        const tech = this.findTechDefinition(bldg.activeTechId, bldg.faction);
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
          const speed = speedBonusMult / uDef.stats.trainTime;
          bldg.queueProgress += speed * dt;

          if (bldg.queueProgress >= 1) {
            bldg.queue.shift();
            bldg.queueProgress = 0;
            // Spawn trained unit cleanly outside building collision perimeter
            const uRadius = getUnitColliderRadius(uDef.category, uDef.visual.scale);
            const spot = this.findSafeExteriorSpot(
              bldg.x,
              bldg.z,
              getBuildingCollisionRadius(bldg),
              uRadius,
              Math.floor(Math.random() * 6),
              bldg.id
            );
            const newUnit = this.addUnit(uDef, bldg.faction, spot.x, spot.z);
            this.spawnParticleBurst(spot.x, 0.35, spot.z, 'dust', 3);
            if (this.isHumanControlled(bldg.faction)) sound.playUnitTrained();
            if (bldg.rallyPoint) {
              const rp = bldg.rallyPoint;
              if (newUnit.unitDef.category === 'worker' && rp.targetResourceNodeId) {
                const exactNode = this.resourceNodes.find((n) => n.id === rp.targetResourceNodeId && n.amount > 0);
                const gatherNode =
                  exactNode ||
                  findClosestResourceNode(rp.x, rp.z, this.resourceNodes, rp.resourceType, 14);
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
        }
      }
    }

    this.buildings = remainingBuildings;
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
    const remaining: Projectile[] = [];

    for (const proj of this.projectiles) {
      const targetUnit = this.units.find((u) => u.id === proj.targetEntityId);
      const targetBldg = this.buildings.find((b) => b.id === proj.targetEntityId);
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
        const attacker = attackerId ? this.units.find((u) => u.id === attackerId) : undefined;
        let dmg: number;
        if (target.type === 'building') {
          const targetBldg = target as BuildingEntity;
          if (attacker) {
            dmg = calculateBuildingDamage(
              attacker,
              targetBldg,
              this.ageByFaction[targetBldg.faction] || 1,
              this.getResearchedTechs(targetBldg.faction),
              this.getResearchedTechs(attacker.faction),
              this.landmarksByFaction[attacker.faction] || []
            );
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
            this.simTime
          );
          this.spawnParticleBurst(
            target.x,
            1.1,
            target.z,
            proj.type === 'fireball' ? 'spark' : 'hit',
            6
          );
        }

        target.hp -= dmg;
        (target as any).lastDamagedTime = performance.now();
        (target as any).hitFlashTimer = 0.08;
        if (target.type === 'unit') {
          (target as UnitEntity).recoilTimer = 0.12;
        }
        if (this.isHumanControlled(target.faction)) {
          this.triggerUnderAttackAlert(target.x, target.z);
        }
        this.addFloatingText(
          target.x,
          2.0,
          target.z,
          `-${dmg}`,
          target.type === 'building' && attacker?.unitDef.category === 'siege' ? '#fb923c' : '#f97316'
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

    // Update 3D Rally flag & dashed connection line
    this.updateRallyVisuals();
  }

  private animateUnitMesh(unit: UnitEntity, mesh: THREE.Group, dt: number) {
    const parts = mesh.userData.animParts as UnitAnimParts | undefined;
    if (!parts) return;

    const mType = unit.unitDef.visual.modelType;
    const isSiegeUnit = unit.unitDef.id === 'catapult' || mType === 'ram' || mType === 'cannon' || unit.unitDef.category === 'siege';
    const unitScale = unit.unitDef.visual.scale || 1;
    const baseBodyY = mType === 'knight' ? 0 : mType === 'mage' ? 0.24 : isSiegeUnit ? 0 : 0.36;
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
      const isVet = xpEligible && (unit.level || 1) >= 2;
      parts.veteranHalo.visible = isVet;
      if (isVet) parts.veteranHalo.rotation.z = t * 1.9;
    }
    if (parts.buffRing) {
      const hasBuff = !!(unit.buffSpeedUntil && unit.buffSpeedUntil > this.simTime);
      parts.buffRing.visible = hasBuff;
      if (hasBuff) {
        parts.buffRing.scale.setScalar(1 + Math.sin(t * 7) * 0.08);
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
      if (gSub === 'berry' || gSub === 'farm' || gSub === 'hunt') {
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
    } else if (unit.state === 'building') {
      // Carpenter hammer double-strike cadence
      const raw = 0.5 + 0.5 * Math.sin(t * 10.6);
      const hammer = Math.pow(raw, 2.0);
      tgtRArm = 0.45 - hammer * 1.55;
      tgtLArm = -0.38;
      tgtBodyX = 0.12 + hammer * 0.2;
      tgtBodyYaw = (0.5 - hammer) * 0.2;
      tgtLLeg = 0.16;
      tgtRLeg = -0.16;
      tgtLKnee = 0.14;
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
  }

  // ------------------ AI TACTICS EVALUATOR ------------------

  private findSafeAiBuildSpot(
    faction: FactionId,
    anchorX: number,
    anchorZ: number,
    bType: BuildingType,
    preferredAngle?: number,
    minDist = 7.5,
    maxDist = 17
  ): { x: number; z: number } | null {
    const bDef = this.getBuildingDefinition(bType, faction);
    if (!bDef) return null;
    const obs = this.getTerrainNavObstacles();
    const baseAngle = preferredAngle ?? Math.random() * Math.PI * 2;

    for (let r = minDist; r <= maxDist; r += 2.6) {
      for (let i = 0; i < 12; i++) {
        const sign = i % 2 === 0 ? 1 : -1;
        const offset = Math.ceil(i / 2) * (Math.PI / 6) * sign;
        const ang = baseAngle + offset;
        const cx = Math.max(-50, Math.min(50, anchorX + Math.cos(ang) * r));
        const cz = Math.max(-50, Math.min(50, anchorZ + Math.sin(ang) * r));
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
            obs?.bridges
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
    preferredAngle?: number
  ): boolean {
    const bDef = this.getBuildingDefinition(bType, aiId);
    const aiRes = this.getResourcesForFaction(aiId);
    if (!bDef || !canAfford(aiRes, bDef.cost)) return false;

    const builder =
      aiWorkers.find((w) => w.hp > 0 && w.state === 'idle') ||
      aiWorkers.find((w) => w.hp > 0 && w.state !== 'building' && w.state !== 'returning_resource');
    if (!builder) return false;

    const spot = this.findSafeAiBuildSpot(aiId, anchorX, anchorZ, bType, preferredAngle);
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
  ) {
    let unitDefId = rawTargetId;
    if (rawTargetId === 'villager') {
      unitDefId = aiCiv.workerUnitId;
    } else if (rawTargetId === 'swordsman') {
      unitDefId = aiCiv.starterMeleeUnitId;
    } else if (rawTargetId === 'longbowman') {
      unitDefId = aiCiv.starterRangedUnitId;
    } else if (rawTargetId === 'knight') {
      unitDefId =
        aiCiv.id === 'anime'
          ? 'anime_saiyan_brawler'
          : aiCiv.id === 'fantasy'
          ? 'fantasy_paladin'
          : 'knight';
    } else if (rawTargetId === 'battering_ram') {
      unitDefId = 'battering_ram';
    } else if (rawTargetId === 'bombard_cannon') {
      unitDefId = 'bombard_cannon';
    } else if (rawTargetId === 'catapult') {
      unitDefId = aiCiv.id === 'fantasy' ? 'fantasy_treant' : 'catapult';
    }

    const aiAge = this.ageByFaction[aiId] || 1;
    const uDef = this.findUnitDef(unitDefId, aiId);
    if (!uDef || (uDef.requiredAge && aiAge < uDef.requiredAge)) return;

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
      this.trainUnit(candidates[0].id, unitDefId);
    }
  }

  private evaluateAiLogic() {
    const activeRules = this.activeMods.flatMap((m) => (m.enabled ? m.aiRules : []));

    for (const participant of this.participants) {
      if (participant.controller !== 'ai') continue;

      const aiId = participant.id;
      const aiTeam = participant.team;
      const aiCiv = getCivilizationConfig(participant.civilization);
      const aiRes = this.getResourcesForFaction(aiId);

      const aiUnits = this.units.filter((u) => u.faction === aiId && u.hp > 0);
      const aiWorkers = aiUnits.filter((u) => u.unitDef.category === 'worker');
      const aiActiveWorkers = aiWorkers.filter((u) => !u.garrisonedInBuildingId);
      const aiArmy = aiUnits.filter((u) => u.unitDef.category !== 'worker' && !u.garrisonedInBuildingId);
      const aiBuildings = this.buildings.filter((b) => b.faction === aiId && b.hp > 0);
      const aiTC = aiBuildings.find((b) => b.buildingType === 'town_center');
      const aiBarracksList = aiBuildings.filter((b) => b.buildingType === 'barracks');
      const aiArcheryList = aiBuildings.filter((b) => b.buildingType === 'archery_range');
      const aiUniqueBldg = aiBuildings.find((b) => b.buildingType === aiCiv.uniqueBuildingType);

      if (!aiTC && aiWorkers.length === 0 && aiArmy.length === 0) continue;

      const aiMaxPop = aiBuildings
        .filter((b) => b.isConstructed)
        .reduce((acc, b) => acc + (b.buildingDef.populationProvided || 0), 10);
      const aiAge = this.ageByFaction[aiId] || 1;

      // Auto-trigger special abilities in combat for AI army units
      for (const u of aiArmy) {
        if (u.hp > 0 && u.unitDef.specialAbility && u.abilityCooldown <= 0 && u.state === 'attacking') {
          this.activateUnitAbility(u);
        }
      }

      const anchorX = aiTC?.x ?? aiBuildings[0]?.x ?? 0;
      const anchorZ = aiTC?.z ?? aiBuildings[0]?.z ?? 0;
      const toCenterAngle = Math.atan2(-anchorZ, -anchorX);

      // 1. Evaluate threats near base & recently attacked entities
      let underAttack = 0;
      let nearestEnemyDist = 60;
      let baseThreat: UnitEntity | null = null;
      for (const enemy of this.units) {
        if (enemy.hp <= 0 || enemy.garrisonedInBuildingId || !this.isHostile({ faction: aiId, team: aiTeam }, enemy)) continue;
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

      // AI Tactical Garrison Defense: shelter exposed villagers during base raids & release once threat clears!
      if (underAttack === 1 && aiTC) {
        const aiShelters = aiBuildings
          .filter((b) => b.isConstructed && getBuildingMaxGarrison(b) > 0)
          .map((b) => ({
            bldg: b,
            freeSlots: Math.max(0, getBuildingMaxGarrison(b) - (b.garrisonedUnitIds?.length || 0)),
          }))
          .filter((s) => s.freeSlots > 0);
        if (aiShelters.length > 0) {
          const exposed = aiActiveWorkers.filter(
            (w) =>
              w.state !== 'building' &&
              w.state !== 'garrisoning' &&
              getDistance(anchorX, anchorZ, w.x, w.z) <= 22
          ).slice(0, 5);
          for (const ew of exposed) {
            const open = aiShelters.find((s) => s.freeSlots > 0);
            if (!open) break;
            open.freeSlots--;
            ew.targetGarrisonBuildingId = open.bldg.id;
            ew.targetResourceNodeId = undefined;
            ew.waypoints = undefined;
            ew.state = 'garrisoning';
          }
        }
      } else if (nearestEnemyDist > 26 && !recentBaseDmg) {
        for (const b of aiBuildings) {
          if (b.garrisonedUnitIds && b.garrisonedUnitIds.length > 0) {
            this.ungarrisonAll(b.id);
          }
        }
      }

      const enemyArmyCount = this.units.filter(
        (u) => u.hp > 0 && !u.garrisonedInBuildingId && u.unitDef.category !== 'worker' && this.isHostile({ faction: aiId, team: aiTeam }, u)
      ).length;

      const snapshot = {
        food: aiRes.food,
        wood: aiRes.wood,
        gold: aiRes.gold,
        stone: aiRes.stone,
        armyCount: aiArmy.length,
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

      // 2. Dynamic Worker Allocation & Rebalancing (never pulls active builders or garrisoned workers)
      const desiredAlloc = computeAiWorkerAllocation(
        aiRes,
        aiActiveWorkers.length,
        gatherFocus,
        aiAge
      );
      const activeCounts: Record<ResourceType, number> = { food: 0, wood: 0, gold: 0, stone: 0 };
      for (const w of aiActiveWorkers) {
        if (w.state === 'returning_resource' && w.carryingResource) {
          activeCounts[w.carryingResource.type]++;
        } else if (w.state === 'gathering' && w.targetResourceNodeId) {
          const n = this.resourceNodes.find((rn) => rn.id === w.targetResourceNodeId && rn.amount > 0);
          if (n) activeCounts[n.resourceType]++;
        }
      }

      const assignWorkerToType = (worker: UnitEntity, prefType: ResourceType) => {
        const node =
          findClosestResourceNode(anchorX, anchorZ, this.resourceNodes, prefType, 34) ||
          findClosestResourceNode(anchorX, anchorZ, this.resourceNodes, undefined, 48) ||
          findClosestResourceNode(worker.x, worker.z, this.resourceNodes);
        if (node) {
          worker.targetResourceNodeId = node.id;
          worker.waypoints = undefined;
          worker.state = 'gathering';
          activeCounts[node.resourceType]++;
        }
      };

      const resourcePriorityOrder: ResourceType[] = ['food', 'wood', 'gold', 'stone'];
      for (const w of aiActiveWorkers) {
        if (w.state !== 'idle') continue;
        // Find resource type with biggest deficit relative to desired allocation
        let bestType: ResourceType = 'food';
        let biggestNeed = -Infinity;
        for (const rt of resourcePriorityOrder) {
          const need = desiredAlloc[rt] - activeCounts[rt];
          if (need > biggestNeed) {
            biggestNeed = need;
            bestType = rt;
          }
        }
        assignWorkerToType(w, bestType);
      }

      // Gently rebalance 1 surplus gatherer per tick if AI is starving for food/wood
      if (aiRes.food < 75 && activeCounts.food < desiredAlloc.food) {
        const surplusType = (['stone', 'gold', 'wood'] as ResourceType[]).find(
          (t) => activeCounts[t] > desiredAlloc[t] + 1
        );
        if (surplusType) {
          const reassignable = aiActiveWorkers.find((w) => {
            if (w.state !== 'gathering' || !w.targetResourceNodeId) return false;
            const n = this.resourceNodes.find((rn) => rn.id === w.targetResourceNodeId);
            return n?.resourceType === surplusType;
          });
          if (reassignable) {
            activeCounts[surplusType]--;
            assignWorkerToType(reassignable, 'food');
          }
        }
      }

      // 3. Base Expansion, Economic Camps, Defenses & Landmark Age Advancement
      const hasAnyBuildingInProgress = aiBuildings.some((b) => !b.isConstructed);
      if (aiTC && aiActiveWorkers.length > 0 && !hasAnyBuildingInProgress) {
        const buildCmd = plan.buildAction;
        if (buildCmd?.type === 'advance_age' && aiAge < 4) {
          const lmByAge: Record<number, LandmarkType> = {
            1: (buildCmd.targetId as LandmarkType) || 'landmark_barracks',
            2: 'landmark_citadel',
            3: 'landmark_arsenal',
          };
          const lmType = lmByAge[aiAge];
          if (lmType && !this.landmarksByFaction[aiId]?.includes(lmType)) {
            this.tryAiConstructBuilding(aiId, lmType, aiActiveWorkers, anchorX, anchorZ, toCenterAngle + 0.5);
          }
        } else if (buildCmd?.type === 'build' && buildCmd.targetId) {
          this.tryAiConstructBuilding(aiId, buildCmd.targetId as BuildingType, aiActiveWorkers, anchorX, anchorZ, toCenterAngle);
        } else if (!aiArcheryList.length && this.stats.gameDuration > 16) {
          this.tryAiConstructBuilding(aiId, 'archery_range', aiActiveWorkers, anchorX, anchorZ, toCenterAngle - 0.65);
        } else if (!aiUniqueBldg && this.stats.gameDuration > 24) {
          this.tryAiConstructBuilding(aiId, aiCiv.uniqueBuildingType, aiActiveWorkers, anchorX, anchorZ, toCenterAngle + 0.75);
        } else {
          // Sustainable Farms when wild food nearby depletes & fortifications in Age II-III+
          const nearbyWildFood = this.resourceNodes.filter(
            (n) => n.amount > 0 && n.resourceType === 'food' && n.subtype !== 'farm' && getDistance(anchorX, anchorZ, n.x, n.z) <= 28
          ).length;
          const aiFarms = aiBuildings.filter((b) => b.buildingType === 'farm').length;
          const aiTowers = aiBuildings.filter((b) => b.buildingType === 'tower').length;
          const aiCastles = aiBuildings.filter((b) => b.buildingType === 'castle').length;
          const aiLumberCamps = aiBuildings.filter((b) => b.buildingType === 'lumber_camp').length;
          const aiMiningCamps = aiBuildings.filter((b) => b.buildingType === 'mining_camp').length;

          if (nearbyWildFood < 2 && aiFarms < 4 && aiRes.wood >= 60) {
            this.tryAiConstructBuilding(aiId, 'farm', aiActiveWorkers, anchorX, anchorZ, toCenterAngle + Math.PI * 0.8);
          } else if (aiAge >= 2 && aiTowers < 2 && aiRes.wood >= 125 && aiRes.stone >= 50) {
            this.tryAiConstructBuilding(aiId, 'tower', aiActiveWorkers, anchorX, anchorZ, toCenterAngle);
          } else if (aiAge >= 3 && aiCastles === 0 && aiRes.stone >= 650 && aiRes.wood >= 200) {
            this.tryAiConstructBuilding(aiId, 'castle', aiActiveWorkers, anchorX, anchorZ, toCenterAngle + 0.15);
          } else if (aiAge < 4 && aiAge === 2 && aiRes.food >= 1200 && aiRes.gold >= 600) {
            this.tryAiConstructBuilding(aiId, 'landmark_citadel', aiActiveWorkers, anchorX, anchorZ, toCenterAngle + 0.4);
          } else if (aiAge < 4 && aiAge === 3 && aiRes.food >= 2400 && aiRes.gold >= 1200) {
            this.tryAiConstructBuilding(aiId, 'landmark_arsenal', aiActiveWorkers, anchorX, anchorZ, toCenterAngle - 0.4);
          } else if (aiArmy.length >= 6 && aiBarracksList.length < 2 && aiRes.wood >= 220) {
            this.tryAiConstructBuilding(aiId, 'barracks', aiActiveWorkers, anchorX, anchorZ, toCenterAngle + 0.25);
          } else if (aiLumberCamps === 0 && aiRes.wood >= 140 && this.stats.gameDuration > 45) {
            const woodNode = findClosestResourceNode(anchorX, anchorZ, this.resourceNodes, 'wood', 32);
            if (woodNode && getDistance(anchorX, anchorZ, woodNode.x, woodNode.z) > 15) {
              this.tryAiConstructBuilding(aiId, 'lumber_camp', aiActiveWorkers, woodNode.x, woodNode.z);
            }
          } else if (aiMiningCamps === 0 && aiRes.wood >= 140 && this.stats.gameDuration > 55) {
            const mineNode = findClosestResourceNode(anchorX, anchorZ, this.resourceNodes, 'gold', 34);
            if (mineNode && getDistance(anchorX, anchorZ, mineNode.x, mineNode.z) > 15) {
              this.tryAiConstructBuilding(aiId, 'mining_camp', aiActiveWorkers, mineNode.x, mineNode.z);
            }
          }
        }
      }

      // 4. AI Researches available civilization techs cleanly
      const researched = this.getResearchedTechs(aiId);
      for (const b of aiBuildings) {
        if (!b.isConstructed || b.activeTechId) continue;
        const techs = this.getAvailableTechsForBuilding(aiId, b.buildingType);
        if (techs.length > 0 && canAfford(this.getResourcesForFaction(aiId), techs[0].cost)) {
          this.startResearch(b.id, techs[0].id);
          break;
        }
      }

      // 5. Execute AI Production Actions (Worker + Military Composition concurrently)
      if (aiUnits.length < aiMaxPop) {
        for (const trainAct of plan.trainActions) {
          this.resolveAiTrainRequest(aiId, aiCiv, trainAct.targetId || 'villager', aiBuildings);
        }
      }

      // 6. Execute Tactical Combat Actions (Defend, Rally/Patrol, 1v1 Counter & Cluster Push)
      const combatCmd = plan.combatAction;
      if (!combatCmd || aiArmy.length === 0) continue;

      if (combatCmd.type === 'defend_base' || combatCmd.type === 'retreat_to_base') {
        const defendAnchor = { x: anchorX, z: anchorZ, radius: 26 };
        const baseClusterTarget = selectClusterFocusTarget(aiArmy, this.units, this.buildings, {
          maxEnemyRangeFromCentroid: 40,
          defendAnchor,
        });
        const activeThreat = baseThreat && nearestEnemyDist <= 28 ? baseThreat : null;

        aiArmy.forEach((unit) => {
          const bestTarget =
            selectOptimalCombatTarget(unit, this.units, [], this.units, {
              defendAnchor,
              clusterFocusTargetId: baseClusterTarget?.id,
              maxSearchRange: 30,
            }) || activeThreat;

          if (bestTarget) {
            unit.targetEntityId = bestTarget.id;
            unit.attackMoveGoal = { x: anchorX, z: anchorZ };
            unit.waypoints = undefined;
            unit.state = 'attacking';
          } else {
            // Form defensive perimeter in front of TC facing the threat
            const guardAngle = toCenterAngle + (Math.random() - 0.5) * 1.4;
            const gx = Math.max(-52, Math.min(52, anchorX + Math.cos(guardAngle) * 8));
            const gz = Math.max(-52, Math.min(52, anchorZ + Math.sin(guardAngle) * 8));
            if (getDistance(unit.x, unit.z, anchorX, anchorZ) > 13 || unit.state === 'idle') {
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
          if (unit.state === 'idle') {
            const nearbyEnemy = selectOptimalCombatTarget(unit, this.units, [], this.units, {
              maxSearchRange: 14,
            });
            if (nearbyEnemy) {
              unit.targetEntityId = nearbyEnemy.id;
              unit.waypoints = undefined;
              unit.state = 'attacking';
            } else if (getDistance(unit.x, unit.z, stageX, stageZ) > 7.5) {
              const row = Math.floor(idx / cols);
              const col = idx % cols;
              const gx = Math.max(-50, Math.min(50, stageX + (col - (cols - 1) / 2) * 2.2));
              const gz = Math.max(-50, Math.min(50, stageZ + (row - 1) * 2.2));
              unit.targetX = gx;
              unit.targetZ = gz;
              unit.attackMoveGoal = { x: gx, z: gz };
              unit.waypoints = undefined;
              unit.state = 'moving';
            }
          }
        });
      } else if (combatCmd.type === 'cluster_attack' || combatCmd.type === 'attack_player') {
        const stronghold =
          findClosestEnemy(anchorX, anchorZ, aiId, this.buildings, Infinity, aiTeam) ||
          findClosestEnemy(anchorX, anchorZ, aiId, this.units, Infinity, aiTeam);

        if (stronghold) {
          const strikeUnits = aiArmy.filter((u) => u.state === 'idle' || u.state === 'moving' || u.state === 'attacking');
          const clusterTarget =
            combatCmd.type === 'cluster_attack'
              ? selectClusterFocusTarget(strikeUnits, this.units, this.buildings, {
                  maxEnemyRangeFromCentroid: 28,
                })
              : null;

          strikeUnits.forEach((unit) => {
            // Allow units to keep fighting valid targets if already close and in range, otherwise assign optimal 1v1 / cluster target
            if (unit.state === 'idle' || unit.state === 'moving' || combatCmd.type === 'cluster_attack') {
              const optimalLocal = selectOptimalCombatTarget(unit, this.units, this.buildings, this.units, {
                clusterFocusTargetId: clusterTarget?.id,
                maxSearchRange: 26,
              });
              const chosen = optimalLocal || clusterTarget || stronghold;
              if (unit.state !== 'attacking' || !unit.targetEntityId || (chosen && chosen.id !== unit.targetEntityId && Math.random() < 0.45)) {
                unit.targetEntityId = chosen.id;
                unit.attackMoveGoal = { x: stronghold.x, z: stronghold.z };
                unit.waypoints = undefined;
                unit.state = 'attacking';
              }
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
    window.addEventListener('keydown', (e) => {
      const targetTag = (e.target as HTMLElement)?.tagName;
      const isTyping = targetTag === 'INPUT' || targetTag === 'TEXTAREA' || targetTag === 'SELECT';
      const hasOpenUiModal =
        e.defaultPrevented || !!document.querySelector('[data-hotkeys-modal="true"], [data-age-modal="true"]');

      this.keysHeld.add(e.code);
      if (hasOpenUiModal) return;

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
              const buildableTypes = getBuildableTypesForCiv(humanCiv);
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
                const techIds = this.getAllTechsForBuilding(bldg.faction, bldg.buildingType).map((t) => t.id);
                const techToResearch = findTechIdByHotkey(keyLabel, techIds);
                if (techToResearch) {
                  this.startResearch(bldg.id, techToResearch);
                  return;
                }
              }
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
    });

    window.addEventListener('keyup', (e) => {
      this.keysHeld.delete(e.code);
    });

    window.addEventListener('blur', () => {
      this.keysHeld.clear();
    });

    window.addEventListener('resize', () => {
      if (!this.container) return;
      const width = this.container.clientWidth;
      const height = this.container.clientHeight;
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);
    });
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

  public advanceAge(faction: FactionId, landmarkType: LandmarkType): void {
    const landmarkDef = this.getBuildingDefinition(landmarkType, faction);
    const currentAge = this.ageByFaction[faction] || 1;
    const targetAge = landmarkDef?.landmarkAgeAdvance || ((currentAge + 1) as AgeLevel);
    this.ageByFaction[faction] = targetAge;
    if (!this.landmarksByFaction[faction]) this.landmarksByFaction[faction] = [];
    if (!this.landmarksByFaction[faction].includes(landmarkType)) {
      this.landmarksByFaction[faction].push(landmarkType);
    }

    // Apply landmark bonuses symmetrically for human and AI factions
    if (landmarkType === 'landmark_aachen') {
      this.units
        .filter((u) => u.faction === faction && u.unitDef.category === 'worker')
        .forEach((w) => {
          w.unitDef.stats.gatherSpeed *= 1.25;
          w.unitDef.stats.speed *= 1.15;
        });
    } else if (landmarkType === 'landmark_barracks') {
      this.units
        .filter((u) => u.faction === faction && u.unitDef.category !== 'worker')
        .forEach((a) => {
          a.unitDef.stats.attack += 3;
        });
    } else if (landmarkType === 'landmark_observatory') {
      this.units
        .filter((u) => u.faction === faction)
        .forEach((u) => {
          u.unitDef.stats.defense += 4;
          u.maxHp = Math.round(u.maxHp * 1.2);
          u.hp = Math.min(u.maxHp, Math.round(u.hp * 1.2));
        });
    }

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
    hitType: 'unit' | 'building' | 'resource' | 'terrain' | 'none';
    unit?: UnitEntity;
    building?: BuildingEntity;
    resource?: ResourceNode;
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

      return { hitType: 'terrain', point: groundPoint };
    }

    return { hitType: 'none', point: null };
  }

  public destroy() {
    this.isDestroyed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.renderer.dispose();
  }
}
