import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canAfford,
  canAssembleFieldRam,
  FIELD_RAM_COST,
  FIELD_RAM_TECH_ID,
  isAgeUnlocked,
  shouldPrioritizeAiFieldEngineering,
  resolveAiKnightUnitId,
  selectAiWorkerReassignment,
  selectSiegeEscortUnits,
  deductCost,
  addResources,
  calculateDamage,
  applyBalanceMultipliers,
  evaluateCondition,
  evaluateAiScript,
  getDistance,
  findBalancedResourceNode,
  findClosestResourceNode,
  findClosestEnemy,
  getShrineIncome,
  getShrineBlessingHoldTime,
  advanceStarRelicChannel,
  pickStarRelicSite,
  resolveStarRelicDelivery,
  starRelicChannelComplete,
  starRelicShouldFall,
  STAR_RELIC_CHANNEL_SEC,
  STAR_RELIC_FALL_AT,
} from './rules';
import { AiRule, ResourceNode, EntityCommon } from '../types/game';
import { DEFAULT_BUILDINGS, MEDIEVAL_UNITS, ANIME_UNITS, FANTASY_UNITS, SHARED_UNITS } from './mods';
import { canResearchTech, getAllTechsForBuilding, getCivilizationConfig } from './civilizations';

test('progression: military production buildings unlock at the intended ages', () => {
  assert.equal(DEFAULT_BUILDINGS.barracks.requiredAge, 1);
  assert.equal(DEFAULT_BUILDINGS.archery_range.requiredAge, 2);
  assert.equal(DEFAULT_BUILDINGS.stable.requiredAge, 2);
  assert.equal(DEFAULT_BUILDINGS.siege_workshop.requiredAge, 3);

  const allUnitDefs = [...MEDIEVAL_UNITS, ...ANIME_UNITS, ...FANTASY_UNITS, ...SHARED_UNITS];
  const unitDefById = new Map(allUnitDefs.map((unit) => [unit.id, unit]));
  const assertProductionRole = (ids: string[], expected: string, civId: string, building: string) => {
    assert.ok(ids.length > 0, civId + ' ' + building + ' must have a production roster');
    ids.forEach((id) => assert.equal(unitDefById.get(id)?.category, expected, civId + ' ' + building + ' cannot train ' + id));
  };

  const civIds = ['medieval', 'anime', 'fantasy'] as const;
  for (const civId of civIds) {
    const civ = getCivilizationConfig(civId);
    assert.ok(civ.buildableBuildings.includes('barracks'));
    assert.ok(civ.buildableBuildings.includes('archery_range'));
    assert.ok(civ.buildableBuildings.includes('stable'));
    assert.ok(civ.buildableBuildings.includes('siege_workshop'));

    const barracksUnits = civ.trainableByBuilding.barracks || [];
    assert.ok(barracksUnits.length > 0, civId + ' must have Age I infantry');
    assert.equal(barracksUnits.some((id) => ['longbowman', 'anime_ninja_assassin', 'anime_saiyan_brawler', 'fantasy_mage', 'knight', 'scout_rider', 'fantasy_paladin', 'battering_ram', 'catapult', 'bombard_cannon'].includes(id)), false, civId + ' barracks must not bypass later-age production');
    const stableUnits = civ.trainableByBuilding.stable || [];
    assert.ok(stableUnits.every((id) => ['knight', 'scout_rider', 'fantasy_paladin'].includes(id)), civId + ' stable may only train cavalry');
    assertProductionRole(barracksUnits, 'melee', civId, 'barracks');
    assertProductionRole(civ.trainableByBuilding.archery_range || [], 'ranged', civId, 'archery_range');
    assertProductionRole(stableUnits, 'cavalry', civId, 'stable');
    assertProductionRole(civ.trainableByBuilding.siege_workshop || [], 'siege', civId, 'siege_workshop');
  }

  assert.deepEqual(getCivilizationConfig('medieval').trainableByBuilding.siege_workshop, ['catapult', 'bombard_cannon', 'greek_fire_siphon']);
  assert.deepEqual(getCivilizationConfig('anime').trainableByBuilding.siege_workshop, ['catapult', 'bombard_cannon']);
  assert.deepEqual(getCivilizationConfig('fantasy').trainableByBuilding.barracks, ['fantasy_footman']);

  allUnitDefs
    .filter((unit) => unit.category === 'ranged' || unit.category === 'cavalry')
    .forEach((unit) => assert.ok((unit.requiredAge || 1) >= 2, unit.id + ' ranged/cavalry unit must be Age II+'));
  allUnitDefs
    .filter((unit) => unit.category === 'siege' && unit.id !== 'battering_ram')
    .forEach((unit) => assert.ok((unit.requiredAge || 1) >= 3, unit.id + ' advanced siege unit must be Age III+'));
  assert.equal(allUnitDefs.find((unit) => unit.id === 'battering_ram')?.requiredAge, 2);
});

test('progression: field engineering is an Age II barracks technology', () => {
  const fieldTech = getAllTechsForBuilding('barracks', 'medieval').find((tech) => tech.id === 'shared_field_engineering');
  assert.ok(fieldTech, 'Field engineering must be available from the barracks tech list');
  assert.equal(fieldTech.requiredAge, 2);
  assert.equal(canResearchTech(fieldTech, [], 1).ok, false);
  assert.equal(canResearchTech(fieldTech, [], 2).ok, true);
  assert.match(fieldTech.description, /至少 4 名步兵/);
  const siegeTech = getAllTechsForBuilding('siege_workshop', 'medieval').find((tech) => tech.id === 'shared_siege_engineers');
  assert.ok(siegeTech, 'Advanced siege improvements belong to the siege workshop');
});

test('economy: canAfford accurately checks resource amounts', () => {
  const current = { food: 100, wood: 50, gold: 20, stone: 0 };
  assert.equal(canAfford(current, { food: 50, wood: 20, gold: 0, stone: 0 }), true);
  assert.equal(canAfford(current, { food: 100, wood: 50, gold: 20, stone: 0 }), true);
  assert.equal(canAfford(current, { food: 120, wood: 50, gold: 20, stone: 0 }), false);
  assert.equal(canAfford(current, { food: 50, wood: 20, gold: 50, stone: 0 }), false);
});

test('economy: deductCost and addResources compute correct balances', () => {
  const current = { food: 100, wood: 50, gold: 30, stone: 10 };
  const cost = { food: 40, wood: 25, gold: 0, stone: 5 };
  const afterDeduct = deductCost(current, cost);
  assert.deepEqual(afterDeduct, { food: 60, wood: 25, gold: 30, stone: 5 });

  const afterAdd = addResources(afterDeduct, { food: 15, gold: 10 });
  assert.deepEqual(afterAdd, { food: 75, wood: 25, gold: 40, stone: 5 });
});

test('combat: calculateDamage respects defense and minimum damage of 1', () => {
  assert.equal(calculateDamage(15, 5), 10);
  assert.equal(calculateDamage(10, 10), 1); // min damage floor
  assert.equal(calculateDamage(5, 20), 1); // floor when defense exceeds attack
  assert.equal(calculateDamage(20, 5, 1.5), 25); // with 1.5x multiplier: (30 - 5)
});

test('mods: applyBalanceMultipliers updates unit stats cleanly', () => {
  const base = {
    maxHp: 100,
    attack: 10,
    defense: 2,
    range: 1.5,
    speed: 4,
    attackRate: 1,
    cost: { food: 50, wood: 0, gold: 20, stone: 0 },
    trainTime: 12,
    gatherSpeed: 2,
    carryCapacity: 15,
  };
  const multipliers = {
    gatherRate: 1.5,
    unitHp: 1.2,
    unitDamage: 2.0,
    buildSpeed: 1.0,
    moveSpeed: 1.25,
  };
  const boosted = applyBalanceMultipliers(base, multipliers);
  assert.equal(boosted.maxHp, 120);
  assert.equal(boosted.attack, 20);
  assert.equal(boosted.speed, 5);
  assert.equal(boosted.gatherSpeed, 3);
});

test('ai-script: evaluateCondition checks operators properly', () => {
  const snapshot = {
    food: 200,
    wood: 80,
    gold: 50,
    stone: 0,
    armyCount: 6,
    workerCount: 5,
    underAttack: 1,
    enemyProximity: 15,
    gameTime: 45,
  };

  assert.equal(evaluateCondition({ field: 'food', operator: '>=', value: 200 }, snapshot), true);
  assert.equal(evaluateCondition({ field: 'food', operator: '<', value: 100 }, snapshot), false);
  assert.equal(evaluateCondition({ field: 'underAttack', operator: '==', value: 1 }, snapshot), true);
  assert.equal(evaluateCondition({ field: 'armyCount', operator: '>', value: 5 }, snapshot), true);
});

test('ai-script: evaluateAiScript triggers highest priority rule that matches', () => {
  const rules: AiRule[] = [
    {
      id: 'rule_eco',
      name: 'Train Villagers if food > 50',
      enabled: true,
      conditions: [{ field: 'food', operator: '>=', value: 50 }],
      action: { type: 'train_unit', targetId: 'villager', priority: 10 },
    },
    {
      id: 'rule_defend',
      name: 'Defend if under attack',
      enabled: true,
      conditions: [{ field: 'underAttack', operator: '==', value: 1 }],
      action: { type: 'retreat_to_base', priority: 90 },
    },
    {
      id: 'rule_attack',
      name: 'All out attack if army > 10',
      enabled: true,
      conditions: [{ field: 'armyCount', operator: '>=', value: 10 }],
      action: { type: 'attack_player', priority: 50 },
    },
  ];

  const underAttackSnapshot = {
    food: 100,
    wood: 100,
    gold: 100,
    stone: 0,
    armyCount: 4,
    workerCount: 5,
    underAttack: 1,
    enemyProximity: 10,
    gameTime: 60,
  };

  const action = evaluateAiScript(rules, underAttackSnapshot);
  assert.ok(action);
  assert.equal(action.type, 'retreat_to_base');
});

test('spatial: getDistance, findClosestResourceNode and findClosestEnemy', () => {
  assert.equal(getDistance(0, 0, 3, 4), 5);

  const nodes: ResourceNode[] = [
    { id: 'wood1', resourceType: 'wood', x: 10, z: 10, amount: 100, maxAmount: 100 },
    { id: 'gold1', resourceType: 'gold', x: 3, z: 4, amount: 200, maxAmount: 200 },
    { id: 'wood2', resourceType: 'wood', x: 2, z: 2, amount: 0, maxAmount: 100 }, // empty
  ];

  const closestAny = findClosestResourceNode(0, 0, nodes);
  assert.equal(closestAny?.id, 'gold1');

  const closestWood = findClosestResourceNode(0, 0, nodes, 'wood');
  assert.equal(closestWood?.id, 'wood1');

  const entities: EntityCommon[] = [
    { id: 'ally1', faction: 'player', x: 1, z: 1, hp: 50, maxHp: 50 },
    { id: 'enemy1', faction: 'enemy', x: 8, z: 6, hp: 40, maxHp: 40 },
    { id: 'enemy2', faction: 'enemy', x: 20, z: 20, hp: 40, maxHp: 40 },
    { id: 'deadEnemy', faction: 'enemy', x: 2, z: 2, hp: 0, maxHp: 40 },
  ];

  const enemy = findClosestEnemy(0, 0, 'player', entities);
  assert.equal(enemy?.id, 'enemy1');
});

test('spatial: balanced resource selection distributes workers across available nodes', () => {
  const nodes: ResourceNode[] = [
    { id: 'wood-near', resourceType: 'wood', x: 4, z: 0, amount: 300, maxAmount: 300 },
    { id: 'wood-free', resourceType: 'wood', x: 10, z: 0, amount: 300, maxAmount: 300 },
    { id: 'gold-near', resourceType: 'gold', x: 2, z: 0, amount: 300, maxAmount: 300 },
  ];
  const assigned = new Map<string, number>([['wood-near', 2]]);

  assert.equal(findBalancedResourceNode(0, 0, nodes, 'wood', assigned, 30)?.id, 'wood-free');
  assert.equal(findBalancedResourceNode(0, 0, nodes, 'gold', assigned, 30)?.id, 'gold-near');
  assert.equal(findBalancedResourceNode(0, 0, nodes, 'wood', assigned, 3), null);
});

test('collision: resolveUnitBuildingCollisions pushes units out of solid building core while leaving auto-channel', async () => {
  const { resolveUnitBuildingCollisions, getBuildingCollisionRadius, getUnitColliderRadius } = await import('./collision');
  const dummyUnit = {
    id: 'u1',
    type: 'unit' as const,
    faction: 'player' as const,
    x: 0.1,
    z: 0.1,
    hp: 100,
    maxHp: 100,
    unitDefId: 'villager',
    unitDef: {
      id: 'villager',
      name: '村民',
      factionPack: 'medieval',
      category: 'worker' as const,
      description: '',
      stats: { maxHp: 50, attack: 3, defense: 0, range: 1, speed: 3.5, attackRate: 1, cost: { food: 50, wood: 0, gold: 0, stone: 0 }, trainTime: 8, gatherSpeed: 3, carryCapacity: 15 },
      visual: { color: '#fff', modelType: 'villager' as const },
    },
    state: 'idle' as const,
    attackCooldown: 0,
    abilityCooldown: 0,
    velocity: { x: 0, z: 0 },
    kills: 0,
  };

  const dummyBuilding = {
    id: 'b1',
    type: 'building' as const,
    faction: 'player' as const,
    x: 0,
    z: 0,
    hp: 2000,
    maxHp: 2000,
    buildingType: 'town_center' as const,
    buildingDef: {
      id: 'town_center' as const,
      name: '城鎮中心',
      description: '',
      maxHp: 2400,
      cost: { food: 0, wood: 400, gold: 0, stone: 100 },
      buildTime: 35,
      trainableUnits: [],
      size: 4.5,
    },
    isConstructed: true,
    buildProgress: 1,
    queue: [],
    queueProgress: 0,
    attackCooldown: 0,
  };

  resolveUnitBuildingCollisions([dummyUnit], [dummyBuilding]);
  const expectedMinDist = getBuildingCollisionRadius(dummyBuilding) + getUnitColliderRadius('worker');
  const distAfter = Math.hypot(dummyUnit.x - dummyBuilding.x, dummyUnit.z - dummyBuilding.z);
  assert.ok(
    distAfter >= expectedMinDist - 0.01,
    `Unit distance ${distAfter} should be pushed out beyond core radius ${expectedMinDist}`
  );
  // Farms should allow workers to walk onto plots cleanly
  const farmBuilding = {
    ...dummyBuilding,
    id: 'farm1',
    buildingType: 'farm' as const,
    buildingDef: { ...dummyBuilding.buildingDef, id: 'farm' as const, size: 2.8 },
  };
  assert.equal(getBuildingCollisionRadius(farmBuilding), 0);
});

test('collision: isPlacementLocationValid allows flush buildings and blocks water/cliffs/overlaps', async () => {
  const { isPlacementLocationValid } = await import('./collision');
  const buildings = [
    {
      id: 'tc',
      type: 'building' as const,
      faction: 'player' as const,
      x: 0,
      z: 0,
      hp: 1000,
      maxHp: 1000,
      buildingType: 'town_center' as const,
      buildingDef: { id: 'town_center' as const, name: 'TC', description: '', maxHp: 2000, cost: { food: 0, wood: 0, gold: 0, stone: 0 }, buildTime: 20, trainableUnits: [], size: 4.5 },
      isConstructed: true,
      buildProgress: 1,
      queue: [],
      queueProgress: 0,
      attackCooldown: 0,
    },
  ];
  const nodes = [
    { id: 'gold1', resourceType: 'gold' as const, x: 20, z: 20, amount: 1000, maxAmount: 1000 },
  ];

  // Directly on top of Town Center should be invalid
  assert.equal(isPlacementLocationValid(1, 1, 3.5, buildings, nodes), false);
  // Placed flush right next to TC (4.5 + 3.5 = 8.0 <= 8.2) MUST be valid because inset cores auto-leave a passage channel
  assert.equal(isPlacementLocationValid(8.2, 0, 3.5, buildings, nodes), true);
  // Overlapping TC footprint (7.5 < 4.5 + 3.5) should be invalid
  assert.equal(isPlacementLocationValid(7.5, 0, 3.5, buildings, nodes), false);
  // Directly on top of Gold Node should be invalid
  assert.equal(isPlacementLocationValid(20.5, 20.5, 3.0, buildings, nodes), false);
  // On water strip without bridge should be invalid; on bridge should be valid
  const waterRects = [{ x1: -10, z1: 31, x2: 10, z2: 31, kind: 'water' as const }];
  const bridges = [{ x: 0, z: 31, halfWidth: 2.5, halfLength: 5, angle: 0 }];
  assert.equal(isPlacementLocationValid(6, 31, 1.5, buildings, nodes, false, waterRects, [], bridges), false);
  // In clear space should be valid
  assert.equal(isPlacementLocationValid(35, -20, 3.5, buildings, nodes), true);
});

test('pathfinding: flush buildings leave a passable corridor and units route over river bridges', async () => {
  const { buildNavGrid, findPath } = await import('./pathfinding');
  const makeBarracks = (id: string, x: number, z: number) => ({
    id,
    type: 'building' as const,
    faction: 'enemy' as const,
    x,
    z,
    hp: 1000,
    maxHp: 1000,
    buildingType: 'barracks' as const,
    buildingDef: {
      id: 'barracks' as const,
      name: 'Barracks',
      description: '',
      maxHp: 1200,
      cost: { food: 0, wood: 150, gold: 0, stone: 0 },
      buildTime: 20,
      trainableUnits: [],
      size: 3.5,
    },
    isConstructed: true,
    buildProgress: 1,
    queue: [],
    queueProgress: 0,
    attackCooldown: 0,
  });

  // Two barracks placed completely flush: centers at x=-3.6 and x=3.6 (dist = 7.2 >= 3.5+3.5)
  const bLeft = makeBarracks('bL', -3.6, 0);
  const bRight = makeBarracks('bR', 3.6, 0);
  const gridFlush = buildNavGrid([bLeft, bRight], []);
  const corridorPath = findPath(0, -10, 0, 10, gridFlush);
  assert.ok(corridorPath.length >= 1, 'Expected valid path through auto-channel between flush buildings');
  // Unit should pass cleanly between them (staying within |x| < 1.5 rather than walking all the way around |x| > 6)
  assert.ok(
    corridorPath.every((wp) => Math.abs(wp.x) < 1.5),
    `Expected direct corridor route through gap, got ${JSON.stringify(corridorPath)}`
  );

  // Single blocking building should detour smoothly around perimeter
  const gridSingle = buildNavGrid([makeBarracks('center', 0, 0)], []);
  const detour = findPath(-10, 0, 10, 0, gridSingle);
  assert.ok(detour.some((wp) => Math.abs(wp.z) >= 2.5), 'Expected detour around blocking building');

  // River obstacle across z=0 (x=-104..104) with bridge at x=15 (width 6, spanning full river halfWidth=9.8)
  const riverGrid = buildNavGrid([], [], {
    rects: [{ x1: -104, z1: 0, x2: 104, z2: 0, kind: 'water', halfWidth: 9.8 }],
    discs: [],
    bridges: [{ x: 15, z: 0, halfWidth: 3.0, halfLength: 11.4, angle: 0 }],
  });
  const bridgePath = findPath(-5, -14, -5, 14, riverGrid);
  assert.ok(
    bridgePath.some((wp) => wp.x >= 11 && wp.x <= 19),
    `Expected unit to route over river bridge at x=[12,18], got ${JSON.stringify(bridgePath)}`
  );
});

test('mapGenerator: produces varied terrain features and abundant diverse resources', async () => {
  const { generateMapLayout } = await import('./mapGenerator');
  const spawns = [
    { id: 'player', x: -30, z: -20 },
    { id: 'ai1', x: 30, z: 20 },
  ];

  const river = generateMapLayout('river_valley', 'standard', spawns);
  assert.ok(river.waterRects.length > 0 && river.bridges.length >= 2, 'River Valley should include river and crossings');

  const highland = generateMapLayout('highland_basin', 'standard', spawns);
  assert.ok(highland.cliffDiscs.length >= 4, 'Highland Basin should include rocky cliff outcrops');

  const lakes = generateMapLayout('twin_lakes', 'abundant', spawns);
  assert.ok(lakes.waterDiscs.length >= 2, 'Twin Lakes should include two lakes');

  const riverAbundant = generateMapLayout('river_valley', 'abundant', spawns);
  assert.ok(riverAbundant.resourceNodes.some((n) => n.subtype === 'berry'), 'Map should spawn berry bushes');
  assert.ok(riverAbundant.resourceNodes.some((n) => n.subtype === 'hunt'), 'Map should spawn deer herds');
  assert.ok(
    riverAbundant.resourceNodes.filter((n) => n.resourceType === 'gold').length >= 6,
    'Map should spawn multiple gold veins'
  );
  assert.ok(
    riverAbundant.resourceNodes.length > river.resourceNodes.length,
    'Abundant richness should spawn more resource nodes than standard'
  );
});

test('controlGroups: supports assigning, appending, and pruning dead units', async () => {
  const { createEmptyControlGroups, updateControlGroup, pruneControlGroups } = await import('./controlGroups');
  let groups = createEmptyControlGroups();
  groups = updateControlGroup(groups, 1, ['u1', 'u2'], false);
  assert.deepEqual(groups[1], ['u1', 'u2']);

  // Append u2 (duplicate) and u3
  groups = updateControlGroup(groups, 1, ['u2', 'u3'], true);
  assert.deepEqual(groups[1], ['u1', 'u2', 'u3']);

  // Overwrite group 1
  groups = updateControlGroup(groups, 1, ['u4'], false);
  assert.deepEqual(groups[1], ['u4']);

  // Prune dead units
  groups = updateControlGroup(groups, 2, ['u1', 'u4'], false);
  groups = pruneControlGroups(groups, new Set(['u4']));
  assert.deepEqual(groups[2], ['u4']);
});

test('teams & spawns: distinct spawn positions and team-based hostility', async () => {
  const { generateSpawnPositions, areHostile } = await import('./rules');
  const spawns = generateSpawnPositions(6, 58);
  assert.equal(spawns.length, 6);
  for (let i = 0; i < spawns.length; i++) {
    for (let j = i + 1; j < spawns.length; j++) {
      const dist = Math.hypot(spawns[i].x - spawns[j].x, spawns[i].z - spawns[j].z);
      assert.ok(dist > 40, `Spawn ${i} and ${j} too close: ${dist}`);
    }
  }

  assert.equal(areHostile({ faction: 'slot_1', team: 1 }, { faction: 'slot_2', team: 1 }), false);
  assert.equal(areHostile({ faction: 'slot_1', team: 1 }, { faction: 'slot_2', team: 2 }), true);
  assert.equal(areHostile({ faction: 'slot_1', team: 1 }, { faction: 'neutral' }), false);
});

test('civilizations: each civ has distinct workers, buildable structures, training rosters, and tech upgrades', async () => {
  const {
    canUnitGainXp,
    getCivilizationConfig,
    getBuildableTypesForCiv,
    getTrainableUnitsForBuilding,
    getAvailableTechsForBuilding,
    applyCivilizationAndTechStats,
    computeUnitXpGain,
    dampAngle,
    dampScalar,
  } = await import('./civilizations');

  const med = getCivilizationConfig('medieval');
  const ani = getCivilizationConfig('anime');
  const fan = getCivilizationConfig('fantasy');

  assert.equal(med.workerUnitId, 'villager');
  assert.equal(ani.workerUnitId, 'anime_spirit_harvester');
  assert.equal(fan.workerUnitId, 'fantasy_goblin_sapper');

  assert.ok(getBuildableTypesForCiv('medieval').includes('armory_forge'));
  assert.ok(!getBuildableTypesForCiv('medieval').includes('spirit_shrine'));
  assert.ok(getBuildableTypesForCiv('anime').includes('spirit_shrine'));
  assert.ok(getBuildableTypesForCiv('fantasy').includes('mana_well'));

  // Building training rosters are tailored per civilization
  assert.deepEqual(getTrainableUnitsForBuilding('barracks', 'anime'), ['anime_katana_shinigami']);
  assert.deepEqual(getTrainableUnitsForBuilding('barracks', 'fantasy'), ['fantasy_footman']);
  assert.deepEqual(getTrainableUnitsForBuilding('barracks', 'medieval'), ['swordsman']);
  assert.deepEqual(getTrainableUnitsForBuilding('stable', 'medieval'), ['knight', 'scout_rider']);
  assert.deepEqual(getTrainableUnitsForBuilding('stable', 'anime'), ['scout_rider']);
  assert.deepEqual(getTrainableUnitsForBuilding('stable', 'fantasy'), ['fantasy_paladin', 'scout_rider']);

  // Tech research filtering and stat application
  const shrineTechs = getAvailableTechsForBuilding('spirit_shrine', 'anime', [], 1);
  assert.equal(shrineTechs.length, 2);
  const afterOne = getAvailableTechsForBuilding('spirit_shrine', 'anime', ['ani_chakra_flow'], 1);
  assert.equal(afterOne.length, 1);

  const baseStats = {
    maxHp: 100,
    attack: 10,
    defense: 2,
    range: 1.5,
    speed: 4,
    attackRate: 1,
    cost: { food: 50, wood: 0, gold: 20, stone: 0 },
    trainTime: 10,
    gatherSpeed: 0,
    carryCapacity: 0,
  };
  const upgraded = applyCivilizationAndTechStats(baseStats, 'melee', 'anime', ['ani_chakra_flow', 'ani_shunpo']);
  assert.equal(upgraded.attack, 14);
  assert.ok(upgraded.speed > 4.8);

  // XP & Leveling progression (strictly exclusive to anime_saiyan_brawler)
  assert.equal(canUnitGainXp('anime_saiyan_brawler', 'anime'), true);
  assert.equal(canUnitGainXp('anime_katana_shinigami', 'anime'), false);
  assert.equal(canUnitGainXp('anime_ninja_assassin', 'anime'), false);
  assert.equal(canUnitGainXp('swordsman', 'medieval'), false);
  assert.equal(canUnitGainXp('villager', 'medieval'), false);
  assert.equal(canUnitGainXp('fantasy_paladin', 'fantasy'), false);

  const xpRes = computeUnitXpGain(40, 1, 30);
  assert.equal(xpRes.xp, 70);
  assert.equal(xpRes.level, 2);
  assert.equal(xpRes.levelsGained, 1);

  // Shortest-arc damped angle handles wrap-around across PI/-PI without reverse spin
  const nearPi = Math.PI - 0.1;
  const acrossPi = -Math.PI + 0.1;
  const stepped = dampAngle(nearPi, acrossPi, 10, 0.05);
  // Stepping from +3.04 toward -3.04 via +0.2 rad shortest path should stay near PI (abs > 2.9)
  assert.ok(Math.abs(stepped) > 2.9, `Expected shortest-arc wrap around PI, got ${stepped}`);

  const damped = dampScalar(0, 10, 10, 0.1);
  assert.ok(damped > 5 && damped < 10);
});

test('resources & map fairness: maxDistance cap and guaranteed starter resources for 4 spawns across all presets', async () => {
  const { generateMapLayout } = await import('./mapGenerator');
  const { generateSpawnPositions } = await import('./rules');

  // maxDistance cap excludes far nodes
  const farNodes: ResourceNode[] = [
    { id: 'farGold', resourceType: 'gold', x: 40, z: 0, amount: 500, maxAmount: 500 },
  ];
  assert.equal(findClosestResourceNode(0, 0, farNodes, 'gold', 24), null);
  assert.equal(findClosestResourceNode(0, 0, farNodes, 'gold', 45)?.id, 'farGold');

  const spawns = generateSpawnPositions(4, 58).map((sp, i) => ({ id: `slot_${i + 1}`, x: sp.x, z: sp.z }));
  for (const preset of ['river_valley', 'highland_basin', 'twin_lakes'] as const) {
    const layout = generateMapLayout(preset, 'standard', spawns);
    for (const sp of spawns) {
      const hasGold = layout.resourceNodes.some(
        (n) => n.resourceType === 'gold' && Math.hypot(n.x - sp.x, n.z - sp.z) <= 26
      );
      const hasStone = layout.resourceNodes.some(
        (n) => n.resourceType === 'stone' && Math.hypot(n.x - sp.x, n.z - sp.z) <= 26
      );
      const hasWood = layout.resourceNodes.some(
        (n) => n.resourceType === 'wood' && Math.hypot(n.x - sp.x, n.z - sp.z) <= 26
      );
      const hasFood = layout.resourceNodes.some(
        (n) => n.resourceType === 'food' && Math.hypot(n.x - sp.x, n.z - sp.z) <= 26
      );
      assert.ok(hasGold, `${preset} spawn ${sp.id} missing nearby gold`);
      assert.ok(hasStone, `${preset} spawn ${sp.id} missing nearby stone`);
      assert.ok(hasWood, `${preset} spawn ${sp.id} missing nearby wood`);
      assert.ok(hasFood, `${preset} spawn ${sp.id} missing nearby food`);
    }
  }
});

test('hotkeys: worker build, training slots, and tech slots map cleanly without WASD collisions', async () => {
  const {
    BUILDING_HOTKEYS,
    eventCodeToHotkeyLabel,
    findBuildingTypeByHotkey,
    findTrainingUnitByHotkey,
    findTechIdByHotkey,
  } = await import('./hotkeys');
  const { getBuildableTypesForCiv } = await import('./civilizations');

  // M is intentionally context-sensitive: with workers selected it builds the Siege Workshop; otherwise it toggles mute.
  const wasdReserved = new Set(['W', 'A', 'S', 'D', 'Q', 'F', 'X', 'H', 'B', 'I', 'P']);
  Object.values(BUILDING_HOTKEYS).forEach((k) => {
    assert.ok(k && !wasdReserved.has(k), `Building hotkey ${k} conflicts with camera/global keys`);
  });

  assert.equal(eventCodeToHotkeyLabel('KeyV'), 'V');
  assert.equal(findBuildingTypeByHotkey('K', getBuildableTypesForCiv('medieval')), 'armory_forge');
  assert.equal(findBuildingTypeByHotkey('K', getBuildableTypesForCiv('anime')), 'spirit_shrine');
  assert.equal(findBuildingTypeByHotkey('K', getBuildableTypesForCiv('fantasy')), 'mana_well');
  assert.equal(findBuildingTypeByHotkey('V', getBuildableTypesForCiv('medieval')), 'barracks');
  assert.equal(findBuildingTypeByHotkey('Z', getBuildableTypesForCiv('medieval')), 'stable');
  assert.equal(findTrainingUnitByHotkey('C', ['swordsman', 'knight', 'catapult']), 'knight');
  assert.equal(findTechIdByHotkey('R', ['tech_a', 'tech_b']), 'tech_a');
  assert.equal(findTechIdByHotkey('T', ['tech_a', 'tech_b']), 'tech_b');
});

test('all-ai spectator: isAllAiMatch and resolveMatchOutcome handle zero-human multi-team AI battles', async () => {
  const { isAllAiMatch, resolveMatchOutcome } = await import('./rules');
  const allAiParticipants = [
    { id: 'ai1', name: 'AI 1', controller: 'ai' as const, team: 1, colorHex: 0, colorCss: '#3b82f6', accentHex: 0 },
    { id: 'ai2', name: 'AI 2', controller: 'ai' as const, team: 2, colorHex: 0, colorCss: '#ef4444', accentHex: 0 },
    { id: 'ai3', name: 'AI 3', controller: 'ai' as const, team: 3, colorHex: 0, colorCss: '#10b981', accentHex: 0 },
  ];
  assert.equal(isAllAiMatch(allAiParticipants), true);

  const mkBldg = (faction: string, team: number, hp = 1000) => ({
    faction,
    team,
    hp,
    buildingType: 'town_center' as const,
  });

  // Still 2 alive teams -> match continues
  const midGame = resolveMatchOutcome(
    allAiParticipants,
    [],
    [mkBldg('ai1', 1, 1000), mkBldg('ai2', 2, 0), mkBldg('ai3', 3, 900)]
  );
  assert.equal(midGame.isOver, false);

  // Only team 3 survives -> victory for team 3
  const endGame = resolveMatchOutcome(
    allAiParticipants,
    [],
    [mkBldg('ai1', 1, 0), mkBldg('ai2', 2, 0), mkBldg('ai3', 3, 900)]
  );
  assert.equal(endGame.isOver, true);
  assert.equal(endGame.winner?.team, 3);
  assert.deepEqual(endGame.winner?.names, ['AI 3']);
});

test('ai-planner & economy: evaluateAiPlan prevents rule starvation and computeAiWorkerAllocation balances deficits', async () => {
  const { evaluateAiPlan, computeAiWorkerAllocation } = await import('./rules');
  const rules: AiRule[] = [
    {
      id: 'atk',
      name: 'Cluster Attack',
      enabled: true,
      conditions: [{ field: 'armyCount', operator: '>=', value: 8 }],
      action: { type: 'cluster_attack', priority: 85 },
    },
    {
      id: 'worker',
      name: 'Train Worker',
      enabled: true,
      conditions: [
        { field: 'food', operator: '>=', value: 50 },
        { field: 'workerCount', operator: '<', value: 12 },
      ],
      action: { type: 'train_unit', targetId: 'villager', priority: 75 },
    },
    {
      id: 'army',
      name: 'Train Swordsman',
      enabled: true,
      conditions: [{ field: 'food', operator: '>=', value: 70 }],
      action: { type: 'train_unit', targetId: 'swordsman', priority: 65 },
    },
    {
      id: 'age',
      name: 'Advance Age',
      enabled: true,
      conditions: [
        { field: 'food', operator: '>=', value: 400 },
        { field: 'gold', operator: '>=', value: 200 },
        { field: 'age', operator: '<', value: 2 },
      ],
      action: { type: 'advance_age', priority: 78 },
    },
    {
      id: 'eco',
      name: 'Gather Military Eco',
      enabled: true,
      conditions: [{ field: 'workerCount', operator: '>=', value: 6 }],
      action: { type: 'gather_priority', targetId: 'military_eco', priority: 70 },
    },
  ];

  const plan = evaluateAiPlan(rules, {
    food: 450,
    wood: 180,
    gold: 230,
    stone: 60,
    armyCount: 9,
    workerCount: 8,
    underAttack: 0,
    enemyProximity: 45,
    gameTime: 95,
    age: 1,
  });

  assert.equal(plan.combatAction?.type, 'cluster_attack');
  assert.equal(plan.buildAction?.type, 'advance_age');
  assert.equal(plan.gatherAction?.targetId, 'military_eco');
  assert.deepEqual(
    plan.trainActions.map((t) => t.targetId),
    ['villager', 'swordsman']
  );

  // Worker allocation prioritizes food when starving
  const starvedAlloc = computeAiWorkerAllocation(
    { food: 30, wood: 250, gold: 180, stone: 100 },
    8,
    'balanced_eco',
    1
  );
  assert.equal(starvedAlloc.food + starvedAlloc.wood + starvedAlloc.gold + starvedAlloc.stone, 8);
  assert.ok(starvedAlloc.food >= 4, `Expected >=4 workers on food when starving, got ${JSON.stringify(starvedAlloc)}`);
});

test('tactical-combat: 1v1 counter matchups and coordinated cluster focus-fire select optimal targets', async () => {
  const { selectOptimalCombatTarget, selectClusterFocusTarget } = await import('./rules');

  const mkUnit = (
    id: string,
    faction: string,
    team: number,
    category: 'melee' | 'ranged' | 'cavalry' | 'siege' | 'worker',
    x: number,
    z: number,
    hp = 100,
    maxHp = 100,
    range = 1.5,
    speed = 3.8
  ) => ({
    id,
    type: 'unit' as const,
    faction,
    team,
    x,
    z,
    hp,
    maxHp,
    unitDefId: category,
    unitDef: {
      id: category,
      name: category,
      factionPack: 'medieval',
      category,
      description: '',
      stats: {
        maxHp,
        attack: 15,
        defense: 2,
        range,
        speed,
        attackRate: 1,
        cost: { food: 50, wood: 0, gold: 0, stone: 0 },
        trainTime: 10,
        gatherSpeed: 0,
        carryCapacity: 0,
      },
      visual: { color: '#fff', modelType: 'swordsman' as const },
    },
    state: 'idle' as const,
    attackCooldown: 0,
    abilityCooldown: 0,
    velocity: { x: 0, z: 0 },
    kills: 0,
  });

  const mkBldg = (id: string, faction: string, team: number, buildingType: 'farm' | 'tower', x: number, z: number) => ({
    id,
    type: 'building' as const,
    faction,
    team,
    x,
    z,
    hp: 800,
    maxHp: 800,
    buildingType,
    buildingDef: {
      id: buildingType,
      name: buildingType,
      description: '',
      maxHp: 800,
      cost: { food: 0, wood: 100, gold: 0, stone: 0 },
      buildTime: 15,
      trainableUnits: [],
      size: 2.5,
    },
    isConstructed: true,
    buildProgress: 1,
    queue: [],
    queueProgress: 0,
    attackCooldown: 0,
  });

  // 1. Cavalry should flank enemy archer even when enemy swordsman is slightly closer
  const knight = mkUnit('k1', 'ai1', 1, 'cavalry', 0, 0, 210, 210, 1.8, 5.6);
  const enemyMelee = mkUnit('em1', 'ai2', 2, 'melee', 4, 0, 110, 110, 1.5, 3.8);
  const enemyArcher = mkUnit('ea1', 'ai2', 2, 'ranged', 7, 0, 65, 65, 14, 3.4);
  const cavPick = selectOptimalCombatTarget(knight, [enemyMelee, enemyArcher], [], [knight]);
  assert.equal(cavPick?.id, 'ea1');

  // 2. Siege catapult should prioritize enemy defensive Watch Tower over a skirmisher
  const catapult = mkUnit('cat1', 'ai1', 1, 'siege', 0, 0, 160, 160, 18, 2.2);
  const enemyTower = mkBldg('tw1', 'ai2', 2, 'tower', 12, 0);
  const siegePick = selectOptimalCombatTarget(catapult, [enemyMelee], [enemyTower], [catapult]);
  assert.equal(siegePick?.id, 'tw1');

  // 3. Melee defender should attack enemy soldier threatening base instead of a closer Farm
  const swordsman = mkUnit('sw1', 'ai1', 1, 'melee', 0, 0);
  const enemyFarm = mkBldg('fm1', 'ai2', 2, 'farm', 3, 0);
  const meleePick = selectOptimalCombatTarget(swordsman, [enemyMelee], [enemyFarm], [swordsman]);
  assert.equal(meleePick?.id, 'em1');

  // 4. Cluster focus-fire prioritizes wounded high-value enemy archer
  const squad = [
    mkUnit('a1', 'ai1', 1, 'ranged', 0, 0, 65, 65, 14, 3.4),
    mkUnit('a2', 'ai1', 1, 'ranged', 1, 1, 65, 65, 14, 3.4),
    mkUnit('s1', 'ai1', 1, 'melee', 2, 0, 110, 110, 1.5, 3.8),
  ];
  const woundedArcher = mkUnit('eaLow', 'ai2', 2, 'ranged', 8, 1, 20, 65, 14, 3.4);
  const healthyMelee = mkUnit('emFull', 'ai2', 2, 'melee', 7, 0, 110, 110, 1.5, 3.8);
  const clusterTarget = selectClusterFocusTarget(squad, [healthyMelee, woundedArcher], [enemyFarm]);
  assert.equal(clusterTarget?.id, 'eaLow');
});

test('audio-locomotion-buildings: spatial gain, staged construction/damage visuals, and stride phase math', async () => {
  const { computeSpatialAudioGain, computeBuildingVisualState, computeStridePhaseDelta } = await import('./rules');

  // 1. Spatial audio attenuation
  assert.equal(computeSpatialAudioGain(0, 42), 1);
  assert.equal(computeSpatialAudioGain(42, 42), 0);
  assert.equal(computeSpatialAudioGain(65, 42), 0);
  assert.equal(computeSpatialAudioGain(-5, 42), 1);
  const nearGain = computeSpatialAudioGain(10, 42);
  const farGain = computeSpatialAudioGain(30, 42);
  assert.ok(nearGain > farGain && farGain > 0, `Expected monotonic rolloff: near=${nearGain}, far=${farGain}`);

  // 2. Staged building construction & progressive damage states
  const stage1 = computeBuildingVisualState(false, 0.15, 180, 1200);
  assert.equal(stage1.stage, 1);
  assert.equal(stage1.showScaffold, true);
  assert.ok(stage1.tier1Reveal > 0.4 && stage1.tier2Reveal === 0 && stage1.tier3Reveal === 0);
  assert.equal(stage1.isSmoking, false);

  const stage2 = computeBuildingVisualState(false, 0.5, 600, 1200);
  assert.equal(stage2.stage, 2);
  assert.equal(stage2.showScaffold, true);
  assert.ok(stage2.tier2Reveal > 0.5 && stage2.tier3Reveal === 0);

  const stage3 = computeBuildingVisualState(false, 0.85, 1020, 1200);
  assert.equal(stage3.stage, 3);
  assert.equal(stage3.showScaffold, true);
  assert.ok(stage3.tier3Reveal > 0.5);

  const healthyBuilt = computeBuildingVisualState(true, 1, 1200, 1200);
  assert.equal(healthyBuilt.stage, 4);
  assert.equal(healthyBuilt.showScaffold, false);
  assert.equal(healthyBuilt.tier1Reveal, 1);
  assert.equal(healthyBuilt.tier2Reveal, 1);
  assert.equal(healthyBuilt.tier3Reveal, 1);
  assert.equal(healthyBuilt.isSmoking, false);
  assert.equal(healthyBuilt.isBurning, false);
  assert.equal(healthyBuilt.sagTiltRad, 0);

  const damagedSmoking = computeBuildingVisualState(true, 1, 720, 1200); // 60% HP
  assert.equal(damagedSmoking.isSmoking, true);
  assert.equal(damagedSmoking.isBurning, false);
  assert.ok(damagedSmoking.damageSeverity > 0.1);

  const criticalBurning = computeBuildingVisualState(true, 1, 300, 1200); // 25% HP
  assert.equal(criticalBurning.isSmoking, true);
  assert.equal(criticalBurning.isBurning, true);
  assert.ok(criticalBurning.sagTiltRad > 0.01);

  // 3. Distance-locked locomotion phase delta
  assert.equal(computeStridePhaseDelta(0, 1, false), 0);
  assert.equal(computeStridePhaseDelta(-1, 1, false), 0);
  const footStep = computeStridePhaseDelta(0.115, 1, false); // 1/8 of 0.92m full cycle -> PI/4
  assert.ok(Math.abs(footStep - Math.PI / 4) < 0.02, `Expected ~PI/4 rad for 1/8 foot cycle, got ${footStep}`);
  const giantStep = computeStridePhaseDelta(0.115, 1.5, false);
  assert.ok(giantStep < footStep, 'Larger unit scale should take slower angular cadence per meter');
  const mountStep = computeStridePhaseDelta(0.115, 1, true);
  assert.ok(mountStep < footStep, 'Mounted stride covers more ground per gait cycle');
  assert.equal(computeStridePhaseDelta(100, 1, false), 1.15, 'Large teleports/jumps must clamp phase delta');
});

test('collision-tightening: resource hulls and special building radii prevent visual clipping while keeping flush paths', async () => {
  const {
    resolveUnitResourceCollisions,
    getResourceColliderRadius,
    getBuildingCollisionRadius,
    getUnitColliderRadius,
  } = await import('./collision');
  const worker = {
    id: 'w1',
    type: 'unit' as const,
    faction: 'player' as const,
    x: 0.2,
    z: 0.2,
    hp: 65,
    maxHp: 65,
    unitDefId: 'villager',
    unitDef: {
      id: 'villager',
      name: '村民',
      factionPack: 'medieval',
      category: 'worker' as const,
      description: '',
      stats: { maxHp: 65, attack: 4, defense: 0, range: 1, speed: 3.6, attackRate: 1, cost: { food: 50, wood: 0, gold: 0, stone: 0 }, trainTime: 8, gatherSpeed: 5, carryCapacity: 15 },
      visual: { color: '#fff', modelType: 'villager' as const },
    },
    state: 'gathering' as const,
    attackCooldown: 0,
    abilityCooldown: 0,
    velocity: { x: 0, z: 0 },
    kills: 0,
  };

  const stoneNode = { id: 'st1', resourceType: 'stone' as const, x: 0, z: 0, amount: 800, maxAmount: 800 };
  resolveUnitResourceCollisions([worker], [stoneNode]);
  const stoneDist = Math.hypot(worker.x, worker.z);
  const minClear = getResourceColliderRadius(stoneNode.resourceType, undefined) + getUnitColliderRadius('worker') * 0.45;
  assert.ok(stoneDist >= minClear - 0.01, `Worker pushed outside stone quarry boundary (${stoneDist} >= ${minClear})`);

  const berryNode = { id: 'br1', resourceType: 'food' as const, subtype: 'berry' as const, x: 10, z: 0, amount: 400, maxAmount: 400 };
  assert.ok(getResourceColliderRadius(berryNode.resourceType, berryNode.subtype) >= 1.0, 'Berry bush keeps physical radius so units never stand inside bush foliage');

  const barracks = {
    id: 'bk1',
    type: 'building' as const,
    faction: 'player' as const,
    x: 0,
    z: 0,
    hp: 1400,
    maxHp: 1400,
    buildingType: 'barracks' as const,
    buildingDef: { id: 'barracks' as const, name: 'Barracks', description: '', maxHp: 1400, cost: { food: 0, wood: 150, gold: 0, stone: 0 }, buildTime: 20, trainableUnits: [], size: 3.5 },
    isConstructed: true,
    buildProgress: 1,
    queue: [],
    queueProgress: 0,
    attackCooldown: 0,
  };
  assert.ok(getBuildingCollisionRadius(barracks) >= 2.65 && getBuildingCollisionRadius(barracks) < 3.5);
});

test('siege-and-garrison: anti-building armor blocks early soldiers while siege engines ignore armor, and garrison shelters & empowers buildings', async () => {
  const {
    getEffectiveBuildingArmor,
    calculateBuildingDamage,
    getUnitVsUnitDamage,
    getBuildingMaxGarrison,
    computeGarrisonDefenseProfile,
  } = await import('./rules');
  const { DEFAULT_BUILDINGS, MEDIEVAL_UNITS } = await import('./mods');
  const { applyCivilizationAndTechStats } = await import('./civilizations');

  const byId = (id: string) => {
    const u = MEDIEVAL_UNITS.find((def) => def.id === id);
    if (!u) throw new Error(`Missing unit def ${id}`);
    return u;
  };
  const villagerDef = byId('villager');
  const archerDef = byId('longbowman');
  const swordsmanDef = byId('swordsman');
  const ramDef = byId('battering_ram');
  const cannonDef = byId('bombard_cannon');

  const tc = {
    id: 'tc1',
    type: 'building' as const,
    faction: 'enemy' as const,
    team: 2,
    x: 20,
    z: 20,
    hp: 3000,
    maxHp: 3000,
    buildingType: 'town_center' as const,
    buildingDef: DEFAULT_BUILDINGS.town_center,
    isConstructed: true,
    buildProgress: 1,
    queue: [],
    queueProgress: 0,
    attackCooldown: 0,
    garrisonedUnitIds: [] as string[],
  };
  const armory = { ...tc, id: 'arm1', buildingType: 'armory_forge' as const, buildingDef: DEFAULT_BUILDINGS.armory_forge };
  const tower = { ...tc, id: 'tw1', buildingType: 'tower' as const, buildingDef: DEFAULT_BUILDINGS.tower };

  // 1. Garrison capacities: Special buildings hold more (14) than TC (10) and Watch Tower (5)
  assert.equal(getBuildingMaxGarrison(armory), 14);
  assert.equal(getBuildingMaxGarrison(tc), 10);
  assert.equal(getBuildingMaxGarrison(tower), 5);

  // 2. Town Center starts unmanned with 0 defensive shots, then fires scaled volleys when garrisoned
  const unmannedTcDef = computeGarrisonDefenseProfile(tc, [], []);
  assert.equal(unmannedTcDef.volleyCount, 0);
  assert.equal(unmannedTcDef.damagePerBolt, 0);

  const mkUnitEnt = (id: string, def: typeof villagerDef, garrisonedIn?: string) => ({
    id,
    type: 'unit' as const,
    faction: 'enemy' as const,
    team: 2,
    x: 20,
    z: 20,
    hp: def.stats.maxHp,
    maxHp: def.stats.maxHp,
    unitDefId: def.id,
    unitDef: def,
    state: 'idle' as const,
    attackCooldown: 0,
    abilityCooldown: 0,
    velocity: { x: 0, z: 0 },
    kills: 0,
    garrisonedInBuildingId: garrisonedIn,
  });

  const defenders = [
    mkUnitEnt('d1', archerDef, 'tc1'),
    mkUnitEnt('d2', archerDef, 'tc1'),
    mkUnitEnt('d3', villagerDef, 'tc1'),
    mkUnitEnt('d4', villagerDef, 'tc1'),
  ];
  tc.garrisonedUnitIds = defenders.map((d) => d.id);
  const mannedTcDef = computeGarrisonDefenseProfile(tc, defenders, ['shared_arrow_slits', 'shared_murder_holes']);
  assert.ok(mannedTcDef.volleyCount >= 2 && mannedTcDef.damagePerBolt >= 15, 'Manned Town Center gains multi-arrow volley fire');

  // 3. Garrisoned units must NOT be targetable by enemy units
  assert.equal(findClosestEnemy(18, 18, 'player', defenders), null);

  // 4. Separate anti-building attack & armor balance:
  const tcAge3Armor = getEffectiveBuildingArmor(tc, 3, ['shared_masonry']);
  assert.ok(tcAge3Armor >= 12);
  const swordsmanUnit = mkUnitEnt('sw1', swordsmanDef);
  const swordVsTcDmg = calculateBuildingDamage(swordsmanUnit, tc, 3, ['shared_masonry']);
  assert.ok(swordVsTcDmg <= 3, `Early soldier torch damage (${swordVsTcDmg}) should be strongly mitigated by Masonry TC`);

  // Battering Ram ignores building armor + has high rangedDefense vs arrows
  const ramUnit = mkUnitEnt('ram1', ramDef);
  const ramVsTcDmg = calculateBuildingDamage(ramUnit, tc, 3, ['shared_masonry']);
  assert.ok(ramVsTcDmg >= 90, `Battering ram (${ramVsTcDmg}) should crush building armor`);
  const ramUpgradedStats = applyCivilizationAndTechStats(ramDef.stats, 'siege', 'medieval', ['shared_siege_engineers']);
  assert.ok(ramUpgradedStats.buildingAttack! > ramDef.stats.buildingAttack!);

  const arrowVsRam = getUnitVsUnitDamage(archerDef.stats.attack, ramUnit, true);
  assert.ok(arrowVsRam <= 2, `Battering ram arrow resistance should blunt archers (${arrowVsRam})`);

  const cannonUnit = mkUnitEnt('can1', cannonDef);
  const cannonVsTcDmg = calculateBuildingDamage(cannonUnit, tc, 3, ['shared_masonry']);
  assert.ok(cannonVsTcDmg >= 200, `Imperial bombard cannon (${cannonVsTcDmg}) should devastate fortified structures`);
});

test('economy-and-early-defense: 35/60s base gather rate, carry 15, Age I wall & tower unlock, and building combat stats inspection', async () => {
  const { getBuildingCombatStats, calculateBuildingDamage } = await import('./rules');
  const { isPlacementLocationValid } = await import('./collision');
  const { DEFAULT_BUILDINGS, MEDIEVAL_UNITS, ANIME_UNITS, FANTASY_UNITS } = await import('./mods');
  const { getBuildableTypesForCiv } = await import('./civilizations');

  const villager = MEDIEVAL_UNITS.find((u) => u.id === 'villager')!;
  const spiritWorker = ANIME_UNITS.find((u) => u.id === 'anime_spirit_harvester')!;
  const goblinWorker = FANTASY_UNITS.find((u) => u.id === 'fantasy_goblin_sapper')!;
  const swordsman = MEDIEVAL_UNITS.find((u) => u.id === 'swordsman')!;

  // 1. Gather rate ~35 resources per 60s (0.583/s) & carryCapacity 15
  assert.ok(Math.abs(villager.stats.gatherSpeed - 35 / 60) < 0.01, `Expected ~0.583 gatherSpeed, got ${villager.stats.gatherSpeed}`);
  assert.equal(villager.stats.carryCapacity, 15);
  assert.equal(spiritWorker.stats.carryCapacity, 15);
  assert.equal(goblinWorker.stats.carryCapacity, 15);

  // 2. Age I unlocks both Wall and Watch Tower across all civilizations
  assert.equal(DEFAULT_BUILDINGS.wall.requiredAge, 1);
  assert.equal(DEFAULT_BUILDINGS.tower.requiredAge, 1);
  assert.ok(getBuildableTypesForCiv('medieval').includes('wall'));
  assert.ok(getBuildableTypesForCiv('anime').includes('wall'));
  assert.ok(getBuildableTypesForCiv('fantasy').includes('wall'));

  // 3. Regular early infantry only chips Age I walls/towers, requiring siege engines
  const wallBldg = {
    id: 'w1',
    type: 'building' as const,
    faction: 'player' as const,
    x: 0,
    z: 0,
    hp: DEFAULT_BUILDINGS.wall.maxHp,
    maxHp: DEFAULT_BUILDINGS.wall.maxHp,
    buildingType: 'wall' as const,
    buildingDef: DEFAULT_BUILDINGS.wall,
    isConstructed: true,
    buildProgress: 1,
    queue: [],
    queueProgress: 0,
    attackCooldown: 0,
    garrisonedUnitIds: [] as string[],
  };
  const towerBldg = {
    ...wallBldg,
    id: 'tw_inspect',
    x: 8,
    z: 0,
    hp: DEFAULT_BUILDINGS.tower.maxHp,
    maxHp: DEFAULT_BUILDINGS.tower.maxHp,
    buildingType: 'tower' as const,
    buildingDef: DEFAULT_BUILDINGS.tower,
  };
  const tcBldg = {
    ...wallBldg,
    id: 'tc_inspect',
    x: -10,
    z: 0,
    hp: DEFAULT_BUILDINGS.town_center.maxHp,
    maxHp: DEFAULT_BUILDINGS.town_center.maxHp,
    buildingType: 'town_center' as const,
    buildingDef: DEFAULT_BUILDINGS.town_center,
  };

  const swEnt = {
    id: 'sw_chip',
    type: 'unit' as const,
    faction: 'enemy' as const,
    x: 1,
    z: 0,
    hp: swordsman.stats.maxHp,
    maxHp: swordsman.stats.maxHp,
    unitDefId: swordsman.id,
    unitDef: swordsman,
    state: 'attacking' as const,
    attackCooldown: 0,
    abilityCooldown: 0,
    velocity: { x: 0, z: 0 },
    kills: 0,
  };
  assert.equal(calculateBuildingDamage(swEnt, wallBldg, 1, []), 1);
  assert.equal(calculateBuildingDamage(swEnt, towerBldg, 1, []), 1);

  // 4. Wall segments can chain tightly edge-to-edge while non-walls maintain clearance
  assert.equal(isPlacementLocationValid(2.35, 0, DEFAULT_BUILDINGS.wall.size, [wallBldg], [], true), true);
  assert.equal(isPlacementLocationValid(2.35, 0, DEFAULT_BUILDINGS.barracks.size, [wallBldg], [], false), false);

  // 5. Building combat stats inspection accuracy
  const wallStats = getBuildingCombatStats(wallBldg, [], 1, []);
  assert.equal(wallStats.attackDamage, 0);
  assert.equal(wallStats.buildingArmor, DEFAULT_BUILDINGS.wall.buildingArmor);
  assert.ok(wallStats.attackMethod.includes('堅壁'));

  const towerStats = getBuildingCombatStats(towerBldg, [], 1, ['shared_arrow_slits']);
  assert.ok(towerStats.attackDamage >= 15);
  assert.equal(DEFAULT_BUILDINGS.tower.maxHp, 700);
  assert.ok((DEFAULT_BUILDINGS.tower.range || 0) <= 13);
  assert.ok((DEFAULT_BUILDINGS.town_center.range || 0) > (DEFAULT_BUILDINGS.tower.range || 0));
  assert.ok(towerStats.range >= (DEFAULT_BUILDINGS.tower.range || 13) + 2);
  assert.ok(towerStats.attackType.includes('穿刺'));

  const tcUnmannedStats = getBuildingCombatStats(tcBldg, [], 1, []);
  assert.equal(tcUnmannedStats.volleyCount, 0);
  assert.equal(tcUnmannedStats.range, DEFAULT_BUILDINGS.town_center.range);
  assert.ok(tcUnmannedStats.buildingArmor >= 13);
});

test('map-resource-clearance-and-food-priority: zero nodes in base, closest gold/stone outside TC, and food speed deep_fish > shore_fish > hunt > berry = farm', async () => {
  const { generateMapLayout } = await import('./mapGenerator');
  const { generateSpawnPositions, getFoodGatherMultiplier, getFoodSourcePriority, findBestFoodResourceNode } = await import('./rules');
  const { isPointInTerrainObstacle, isPointOnBridge } = await import('./collision');

  // 1. Exact food speed & priority ordering
  const deepRate = getFoodGatherMultiplier('deep_fish');
  const shoreRate = getFoodGatherMultiplier('shore_fish');
  const huntRate = getFoodGatherMultiplier('hunt');
  const berryRate = getFoodGatherMultiplier('berry');
  const farmRate = getFoodGatherMultiplier('farm');
  assert.ok(deepRate > shoreRate, `Expected deep_fish (${deepRate}) > shore_fish (${shoreRate})`);
  assert.ok(shoreRate > huntRate, `Expected shore_fish (${shoreRate}) > hunt (${huntRate})`);
  assert.ok(huntRate > berryRate, `Expected hunt (${huntRate}) > berry (${berryRate})`);
  assert.equal(berryRate, farmRate, `Expected berry (${berryRate}) === farm (${farmRate})`);

  assert.ok(
    getFoodSourcePriority('deep_fish') > getFoodSourcePriority('shore_fish') &&
      getFoodSourcePriority('shore_fish') > getFoodSourcePriority('hunt') &&
      getFoodSourcePriority('hunt') > getFoodSourcePriority('berry') &&
      getFoodSourcePriority('berry') === getFoodSourcePriority('farm')
  );

  // 2. Priority selection beats closer lower-tier food sources cleanly
  const sampleFoodNodes: ResourceNode[] = [
    { id: 'farm1', resourceType: 'food', subtype: 'farm', x: 3, z: 0, amount: 2500, maxAmount: 2500 },
    { id: 'berry1', resourceType: 'food', subtype: 'berry', x: 5, z: 0, amount: 350, maxAmount: 350 },
    { id: 'hunt1', resourceType: 'food', subtype: 'hunt', x: 9, z: 0, amount: 400, maxAmount: 400 },
    { id: 'shore1', resourceType: 'food', subtype: 'shore_fish', x: 14, z: 0, amount: 450, maxAmount: 450 },
    { id: 'deep1', resourceType: 'food', subtype: 'deep_fish', x: 18, z: 0, amount: 650, maxAmount: 650 },
  ];
  // Land gatherers skip offshore deep_fish by default; naval fishing boats pick deep_fish first
  assert.equal(findBestFoodResourceNode(0, 0, sampleFoodNodes, 36)?.id, 'shore1');
  assert.equal(findBestFoodResourceNode(0, 0, sampleFoodNodes, 36, true, true)?.id, 'deep1');
  assert.equal(
    findBestFoodResourceNode(0, 0, sampleFoodNodes.filter((n) => n.subtype !== 'deep_fish' && n.subtype !== 'shore_fish'), 36)?.id,
    'hunt1'
  );

  // 3. Seeded layout invariants: enlarged map, no roads, zero nodes in base, closest gold/stone strictly outside TC range
  const { DEFAULT_BUILDINGS } = await import('./mods');
  const { isOffshoreDeepWater } = await import('./collision');
  const tcRange = DEFAULT_BUILDINGS.town_center.range || 15;
  assert.equal(tcRange, 15);
  assert.equal(DEFAULT_BUILDINGS.tower.range, 12);

  const seeds = [101, 777, 2026, 4242, 9999];
  const presets = ['river_valley', 'highland_basin', 'twin_lakes'] as const;
  for (const preset of presets) {
    for (const playerCount of [2, 3, 4, 6]) {
      const spawns = generateSpawnPositions(playerCount, 58).map((sp, i) => ({
        id: `slot_${i + 1}`,
        x: sp.x,
        z: sp.z,
      }));
      for (const seed of seeds) {
        const layout = generateMapLayout(preset, 'standard', spawns, seed);
        assert.equal((layout as any).roads, undefined, 'MapLayout should not generate any roads');

        for (const sp of spawns) {
          for (const node of layout.resourceNodes) {
            const distToTc = Math.hypot(node.x - sp.x, node.z - sp.z);
            assert.ok(
              distToTc >= 9.0,
              `${preset} (${playerCount}p seed=${seed}) node ${node.id} spawned too close to TC ${sp.id}: dist=${distToTc.toFixed(2)}`
            );
          }

          const goldDists = layout.resourceNodes
            .filter((n) => n.resourceType === 'gold')
            .map((n) => Math.hypot(n.x - sp.x, n.z - sp.z))
            .sort((a, b) => a - b);
          const stoneDists = layout.resourceNodes
            .filter((n) => n.resourceType === 'stone')
            .map((n) => Math.hypot(n.x - sp.x, n.z - sp.z))
            .sort((a, b) => a - b);

          assert.ok(
            goldDists.length > 0 && goldDists[0] > tcRange + 0.5 && goldDists[0] <= 22.0,
            `${preset} (${playerCount}p seed=${seed}) ${sp.id} closest gold at ${goldDists[0]?.toFixed(2)}, expected (${tcRange + 0.5}, 22.0]`
          );
          assert.ok(
            stoneDists.length > 0 && stoneDists[0] > tcRange + 0.5 && stoneDists[0] <= 22.0,
            `${preset} (${playerCount}p seed=${seed}) ${sp.id} closest stone at ${stoneDists[0]?.toFixed(2)}, expected (${tcRange + 0.5}, 22.0]`
          );
        }

        if (preset === 'river_valley' || preset === 'twin_lakes') {
          const shoreFish = layout.resourceNodes.filter((n) => n.subtype === 'shore_fish');
          const deepFish = layout.resourceNodes.filter((n) => n.subtype === 'deep_fish');
          assert.ok(shoreFish.length >= 4, `${preset} should spawn shore_fish nodes`);
          assert.ok(deepFish.length >= 2, `${preset} should spawn deep_fish nodes`);
          for (const fn of [...shoreFish, ...deepFish]) {
            assert.equal(
              isPointInTerrainObstacle(fn.x, fn.z, layout.waterRects, layout.waterDiscs, []),
              true,
              `${preset} fish ${fn.id} must be inside water`
            );
            assert.equal(
              isPointOnBridge(fn.x, fn.z, layout.bridges),
              false,
              `${preset} fish ${fn.id} must not overlap bridges`
            );
          }
          for (const df of deepFish) {
            assert.equal(
              isOffshoreDeepWater(df.x, df.z, layout.waterRects, layout.waterDiscs, layout.bridges, 5.5),
              true,
              `${preset} deep_fish ${df.id} must stay strictly offshore (>=5.5m from dry land)`
            );
          }
        }
      }
    }
  }
});

test('unit-rebalance-and-naval: villager 55/5/0.7 vs Age-1 infantry 1.6x/1.6x/2x, Age/unique scaling, and dock/fishing_boat constraints', async () => {
  const { canUnitGatherNode } = await import('./rules');
  const { MEDIEVAL_UNITS, ANIME_UNITS, FANTASY_UNITS, DEFAULT_BUILDINGS } = await import('./mods');
  const { applyCivilizationAndTechStats, getBuildableTypesForCiv } = await import('./civilizations');
  const { canPlaceDockLocation, isPlacementLocationValid } = await import('./collision');

  const villager = MEDIEVAL_UNITS.find((u) => u.id === 'villager')!;
  const swordsman = MEDIEVAL_UNITS.find((u) => u.id === 'swordsman')!;
  const boat = MEDIEVAL_UNITS.find((u) => u.id === 'fishing_boat')!;

  // 1. Exact baseline villager vs Age I infantry ratios
  assert.equal(villager.stats.maxHp, 55);
  assert.equal(villager.stats.attack, 5);
  assert.equal(villager.stats.attackRate, 0.7);
  assert.equal(villager.stats.defense, 0);

  assert.equal(swordsman.stats.maxHp, 88); // 55 * 1.6
  assert.equal(swordsman.stats.attack, 8); // 5 * 1.6
  assert.equal(swordsman.stats.attackRate, 1.4); // 0.7 * 2
  assert.equal(swordsman.stats.defense, 1);

  // All Age I combat units keep low base defense (0..2) so early fights stay decisive without unkillable walls
  for (const def of [...MEDIEVAL_UNITS, ...ANIME_UNITS, ...FANTASY_UNITS]) {
    if ((!def.requiredAge || def.requiredAge === 1) && def.category !== 'siege') {
      assert.ok(def.stats.defense <= 2, `${def.id} Age 1 base defense ${def.stats.defense} exceeds <= 2`);
    }
  }

  // 2. Age progression (I->IV) and Special Building Aura progressively scale unit threat
  const age1 = applyCivilizationAndTechStats(swordsman.stats, 'melee', 'medieval', [], 1, false);
  const age4WithAura = applyCivilizationAndTechStats(swordsman.stats, 'melee', 'medieval', [], 4, true);
  assert.ok(age4WithAura.maxHp > age1.maxHp * 1.35, 'Age IV + Unique Aura should substantially boost unit HP');
  assert.ok(age4WithAura.attack > age1.attack + 5, 'Age IV + Unique Aura should substantially boost unit ATK');
  assert.ok(age4WithAura.defense >= age1.defense + 3, 'Age IV + Unique Aura should scale armor (+2 Age IV +1 Forge Aura)');

  // 3. Gather permissions: villagers blocked from deep_fish; fishing_boat restricted to water fish nodes
  const deepNode = { resourceType: 'food' as const, subtype: 'deep_fish' as const };
  const shoreNode = { resourceType: 'food' as const, subtype: 'shore_fish' as const };
  const woodNode = { resourceType: 'wood' as const, subtype: 'wood' as const };
  assert.equal(canUnitGatherNode(villager, deepNode), false);
  assert.equal(canUnitGatherNode(villager, shoreNode), true);
  assert.equal(canUnitGatherNode(villager, woodNode), true);
  assert.equal(canUnitGatherNode(boat, deepNode), true);
  assert.equal(canUnitGatherNode(boat, shoreNode), true);
  assert.equal(canUnitGatherNode(boat, woodNode), false);

  // 4. Dock availability and shoreline-only placement
  assert.ok(getBuildableTypesForCiv('medieval').includes('dock'));
  assert.ok(getBuildableTypesForCiv('anime').includes('dock'));
  assert.ok(getBuildableTypesForCiv('fantasy').includes('dock'));
  assert.ok(DEFAULT_BUILDINGS.dock.trainableUnits.includes('fishing_boat'));

  const riverRects = [{ x1: -80, z1: 0, x2: 80, z2: 0, kind: 'water' as const, halfWidth: 10 }];
  // Water boundary is z=±10. Shoreline spot z=11 (sd = +1.0 within [-2.6, 3.2]) is valid; z=30 inland is invalid
  assert.equal(canPlaceDockLocation(0, 11, DEFAULT_BUILDINGS.dock.size, [], [], riverRects, [], []), true);
  assert.equal(canPlaceDockLocation(0, 30, DEFAULT_BUILDINGS.dock.size, [], [], riverRects, [], []), false);
  assert.equal(
    isPlacementLocationValid(0, 30, DEFAULT_BUILDINGS.dock.size, [], [], false, riverRects, [], [], 'dock'),
    false
  );
  assert.equal(
    isPlacementLocationValid(0, 11, DEFAULT_BUILDINGS.dock.size, [], [], false, riverRects, [], [], 'dock'),
    true
  );
});



test('medieval-assault: torch/sap channel, no burn DoT; greek fire profile', async () => {
  const { getBuildingAssaultProfile, calculateBuildingDamage, getSiegeChannelMultiplier } = await import('./rules');
  const { MEDIEVAL_UNITS, DEFAULT_BUILDINGS } = await import('./mods');
  const sword = MEDIEVAL_UNITS.find((u) => u.id === 'swordsman')!;
  const ram = MEDIEVAL_UNITS.find((u) => u.id === 'battering_ram')!;
  const archer = MEDIEVAL_UNITS.find((u) => u.id === 'longbowman')!;
  const flame = MEDIEVAL_UNITS.find((u) => u.id === 'greek_fire_siphon');
  const farm = { buildingDef: DEFAULT_BUILDINGS.farm, buildingType: 'farm' as const };
  const castle = { buildingDef: DEFAULT_BUILDINGS.castle, buildingType: 'castle' as const };

  const torch = getBuildingAssaultProfile({ unitDef: sword, unitDefId: 'swordsman' });
  assert.equal(torch.method, 'torch');
  assert.equal(torch.wantsContact, true);

  const ramP = getBuildingAssaultProfile({ unitDef: ram, unitDefId: 'battering_ram' });
  assert.equal(ramP.method, 'ram');

  const arrow = getBuildingAssaultProfile({ unitDef: archer, unitDefId: 'longbowman' });
  assert.equal(arrow.method, 'arrow_chip');

  if (flame) {
    const g = getBuildingAssaultProfile({ unitDef: flame, unitDefId: 'greek_fire_siphon' });
    assert.equal(g.method, 'greek_fire');
  }

  assert.ok(getSiegeChannelMultiplier(14, 'torch') > 1.4);
  assert.equal(getSiegeChannelMultiplier(0, 'torch'), 1);

  const fresh = calculateBuildingDamage({ unitDef: sword, unitDefId: 'swordsman', siegeChannelTime: 0 }, farm, 1, [], [], []);
  const sapped = calculateBuildingDamage({ unitDef: sword, unitDefId: 'swordsman', siegeChannelTime: 12 }, farm, 1, [], [], []);
  assert.ok(sapped > fresh, 'sapping channel should increase torch damage');
});


test('ai-progression: every personality waits for the real landmark cost and can reach Age IV', async () => {
  const {
    DEFAULT_BUILDINGS,
    DEFAULT_AI_RULES,
    DEFENSIVE_AI_RULES,
    EASY_AI_RULES,
    HARD_AI_RULES,
  } = await import('./mods');

  const personalities = [
    DEFAULT_AI_RULES,
    DEFENSIVE_AI_RULES,
    EASY_AI_RULES,
    HARD_AI_RULES,
  ];
  const ageRules = [
    ['landmark_barracks', 2],
    ['landmark_citadel', 3],
    ['landmark_arsenal', 4],
  ] as const;

  for (const rules of personalities) {
    for (const [landmarkId, targetAge] of ageRules) {
      const rule = rules.find((candidate) =>
        candidate.action.type === 'advance_age' &&
        candidate.action.targetId === landmarkId
      );
      assert.ok(rule, `Missing Age ${targetAge} rule for ${landmarkId}`);
      const food = rule.conditions.find((condition) => condition.field === 'food');
      const gold = rule.conditions.find((condition) => condition.field === 'gold');
      const cost = DEFAULT_BUILDINGS[landmarkId].cost;
      assert.equal(food?.operator, '>=');
      assert.equal(gold?.operator, '>=');
      assert.equal(food?.value, cost.food, `${rule.id} must wait for the actual food cost`);
      assert.equal(gold?.value, cost.gold, `${rule.id} must wait for the actual gold cost`);
    }
  }
});


test('shrines: war, harvest and forge blessings have distinct economic identities', () => {
  assert.deepEqual(getShrineIncome('war', false), { food: 0, wood: 1, gold: 3, stone: 0 });
  assert.deepEqual(getShrineIncome('harvest', false), { food: 2, wood: 2, gold: 0, stone: 0 });
  assert.deepEqual(getShrineIncome('forge', false), { food: 0, wood: 0, gold: 2, stone: 2 });
  assert.deepEqual(getShrineIncome('harvest', true), { food: 3, wood: 2, gold: 0, stone: 0 });
  assert.deepEqual(getShrineIncome('forge', true), { food: 0, wood: 0, gold: 3, stone: 3 });
  assert.deepEqual(getShrineIncome('war', true), { food: 0, wood: 2, gold: 4, stone: 0 });
});

test('shrines: blessing activation rewards holding different shrine roles', () => {
  assert.equal(getShrineBlessingHoldTime('forge'), 16);
  assert.equal(getShrineBlessingHoldTime('war'), 18);
  assert.equal(getShrineBlessingHoldTime('harvest'), 24);
});


test('star relic: falls once, channels only while a worker stands on it, and delivery is a choice', () => {
  assert.equal(starRelicShouldFall(STAR_RELIC_FALL_AT - 1, 'waiting'), false);
  assert.equal(starRelicShouldFall(STAR_RELIC_FALL_AT, 'waiting'), true);
  assert.equal(starRelicShouldFall(STAR_RELIC_FALL_AT + 20, 'ground'), false);

  let channel = 0;
  channel = advanceStarRelicChannel(channel, true, 3);
  assert.equal(starRelicChannelComplete(channel), false);
  channel = advanceStarRelicChannel(channel, false, 1);
  assert.ok(channel < 3, 'stepping away should decay the channel');
  channel = advanceStarRelicChannel(0, true, STAR_RELIC_CHANNEL_SEC);
  assert.equal(starRelicChannelComplete(channel), true);

  let n = 0;
  const site = pickStarRelicSite(() => {
    n += 1;
    return (n * 0.37) % 1;
  }, [{ x: 0, z: 0 }]);
  assert.ok(Math.hypot(site.x, site.z) > 20, 'landing should avoid the spawn courtyard');

  assert.equal(
    resolveStarRelicDelivery({
      carrierX: 10,
      carrierZ: 0,
      townCenterX: 40,
      townCenterZ: 0,
      shrine: { x: 10, z: 0, radius: 6, ownerFaction: 'neutral', carrierFaction: 'player' },
    }),
    'shrine'
  );
  assert.equal(
    resolveStarRelicDelivery({
      carrierX: 38,
      carrierZ: 1,
      townCenterX: 40,
      townCenterZ: 0,
      shrine: null,
    }),
    'oath'
  );
  assert.equal(
    resolveStarRelicDelivery({
      carrierX: 0,
      carrierZ: 0,
      townCenterX: 40,
      townCenterZ: 0,
      shrine: { x: 20, z: 20, radius: 5, ownerFaction: 'player', carrierFaction: 'player' },
    }),
    'none'
  );
});

test('contested shrines: evaluates opposing teams, retains persistent owner summary when empty, and reports contested battles', async () => {
  const { evaluateContestedPresence, getContestedShrineSummary } = await import('./rules');
  const participants = [
    { id: 'player' as const, name: '玩家', colorHex: 0x3b82f6, colorCss: '#3b82f6' },
    { id: 'enemy' as const, name: '紅軍', colorHex: 0xef4444, colorCss: '#ef4444' },
  ];

  // 1. Tie between opposing teams halts leader & flags contested
  const tie = evaluateContestedPresence([
    { faction: 'player', team: 1, weight: 2 },
    { faction: 'enemy', team: 2, weight: 2 },
  ]);
  assert.equal(tie.leader, null);
  assert.equal(tie.isTie, true);
  assert.equal(tie.isContested, true);

  // 2. Unequal opposing clash still flags isContested while identifying stronger leader
  const push = evaluateContestedPresence([
    { faction: 'player', team: 1, weight: 3 },
    { faction: 'enemy', team: 2, weight: 1 },
  ]);
  assert.equal(push.leader, 'player');
  assert.equal(push.isTie, false);
  assert.equal(push.isContested, true);

  // 3. Owned shrine with zero present units retains persistent owner color & name
  const ownedSummary = getContestedShrineSummary(
    {
      id: 'cp_north',
      x: 0,
      z: -30,
      radius: 10,
      ownerFaction: 'enemy',
      captureProgress: 1,
      label: '北嶺戰壇',
      shrineType: 'war',
      holdTime: 9,
      siegeSupplyActive: false,
      isContested: false,
    },
    participants
  );
  assert.equal(ownedSummary.isNeutral, false);
  assert.equal(ownedSummary.ownerName, '紅軍');
  assert.equal(ownedSummary.ownerColorHex, 0xef4444);
  assert.equal(ownedSummary.statusKind, 'owned');

  // 4. Contested clash reports battle status cleanly
  const clashSummary = getContestedShrineSummary(
    {
      id: 'cp_north',
      x: 0,
      z: -30,
      radius: 10,
      ownerFaction: 'enemy',
      captureProgress: 0.45,
      capturingFaction: 'player',
      label: '北嶺戰壇',
      shrineType: 'war',
      holdTime: 0,
      siegeSupplyActive: false,
      isContested: true,
    },
    participants
  );
  assert.equal(clashSummary.statusKind, 'contested_push');
  assert.ok(clashSummary.badgeActionText.includes('爭奪'));
});

test('wild deer (山羌): steers cleanly around obstacles, avoids jumping when blocked or in cooldown, and bounds only when translating', async () => {
  const { stepWildAnimalState, triggerWildAnimalPanic } = await import('./rules');

  // Deer standing with water blocking +X >= 1.0 (only -X/+Z/-Z are clear)
  const deer: ResourceNode = {
    id: 'deer_test',
    resourceType: 'food',
    subtype: 'hunt',
    x: 0,
    z: 0,
    amount: 400,
    maxAmount: 400,
    animalHp: 32,
    animalMaxHp: 32,
    animalAlive: true,
    animalVx: 0,
    animalVz: 0,
  };

  // Threat approaches from -X (x = -4), trying to push deer toward blocked +X wall; steering should deflect along +/-Z
  const isEastBlocked = (cx: number) => cx >= 1.0;
  let t = 10;
  for (let i = 0; i < 8; i++) {
    t += 0.05;
    stepWildAnimalState(deer, { x: -4, z: 0, d: 4 }, t, 0.05, isEastBlocked, () => 0.5);
  }
  assert.ok(deer.x < 1.0, 'Deer must steer clear of blocked +X bank');
  assert.ok(Math.abs(deer.z) > 0.5, 'Deer should smoothly flank along open coastline instead of getting stuck');

  // Completely boxed-in deer must NEVER jump in place (hopY === 0, zero actual speed)
  const trappedDeer: ResourceNode = {
    ...deer,
    id: 'deer_trapped',
    x: 0,
    z: 0,
    animalVx: 6,
    animalVz: 0,
  };
  triggerWildAnimalPanic(trappedDeer, -2, 0, 20);
  const trappedStep = stepWildAnimalState(
    trappedDeer,
    { x: -2, z: 0, d: 2 },
    20.05,
    0.05,
    (cx, cz) => Math.hypot(cx, cz) > 0.2,
    () => 0.5
  );
  assert.equal(trappedStep.actualSpeed, 0);
  assert.equal(trappedStep.hopY, 0, 'Blocked deer must never bounce vertically in place');

  // After threat disappears and flee cooldown finishes, deer settles calmly to graze with hopY === 0
  const openDeer: ResourceNode = {
    ...deer,
    id: 'deer_open',
    x: 0,
    z: 0,
    animalVx: 0,
    animalVz: 0,
  };
  triggerWildAnimalPanic(openDeer, -3, 0, 30, 1.0);
  let fleeStep = stepWildAnimalState(openDeer, { x: -3, z: 0, d: 3 }, 30.05, 0.05, () => false, () => 0.8);
  for (let i = 1; i <= 4; i++) {
    fleeStep = stepWildAnimalState(openDeer, { x: -3, z: 0, d: 3 }, 30.05 + i * 0.05, 0.05, () => false, () => 0.8);
  }
  assert.equal(fleeStep.isFleeing, true);
  assert.ok(fleeStep.actualSpeed > 2.2 && fleeStep.hopY >= 0);

  // Advance past flee timer -> enters calm flee cooldown with zero random hopping
  let calmOut = fleeStep;
  for (let i = 0; i < 30; i++) {
    calmOut = stepWildAnimalState(openDeer, null, 31.2 + i * 0.05, 0.05, () => false, () => 0.9);
  }
  assert.equal(calmOut.isFleeing, false);
  assert.equal(calmOut.hopY, 0, 'Calm/cooldown deer must never hop in place');
  assert.equal(calmOut.isGrazing, true);
});

test('strategic tech tree: prerequisites, mutually exclusive doctrines, counter damage, eco multipliers, and AI counter-picks', async () => {
  const {
    findTechDef,
    canResearchTech,
    isTechLockedByExclusion,
    isTechMissingPrerequisite,
    getAvailableTechsForBuilding,
    getAllTechsForCiv,
    getTrainingTimeMultiplier,
    getResourceGatherTechMultiplier,
    applyCivilizationAndTechStats,
  } = await import('./civilizations');
  const { evaluateAiTechChoice, getUnitVsUnitDamage, getEffectiveBuildingArmor } = await import('./rules');

  // 1. Rich tech pool across all 3 civilizations and eco/military buildings
  for (const civ of ['medieval', 'anime', 'fantasy'] as const) {
    assert.ok(getAllTechsForCiv(civ).length >= 22, `${civ} should have expanded tech depth`);
  }
  assert.equal(getAvailableTechsForBuilding('lumber_camp', 'medieval', [], 1).length, 1);
  assert.equal(getAvailableTechsForBuilding('mining_camp', 'medieval', [], 1).length, 1);
  assert.equal(getAvailableTechsForBuilding('granary', 'medieval', [], 1).length, 1);
  assert.equal(getAvailableTechsForBuilding('dock', 'medieval', [], 1).length, 1);

  // 2. Prerequisite chain: Sawmill Gear requires Double Bit Axe even at Age 2
  const sawmill = findTechDef('shared_sawmill_gear')!;
  assert.equal(canResearchTech(sawmill, [], 2).ok, false);
  assert.equal(isTechMissingPrerequisite(sawmill, [])?.id, 'shared_double_bit_axe');
  assert.equal(canResearchTech(sawmill, ['shared_double_bit_axe'], 2).ok, true);

  // 3. Mutually exclusive doctrines lock rival branches
  const blitz = findTechDef('shared_doctrine_blitz')!;
  const elite = findTechDef('shared_doctrine_elite')!;
  assert.equal(canResearchTech(blitz, [], 2).ok, true);
  assert.equal(canResearchTech(elite, ['shared_doctrine_blitz'], 2).ok, false);
  assert.equal(isTechLockedByExclusion(elite, ['shared_doctrine_blitz'])?.id, 'shared_doctrine_blitz');
  const barracksAge2Avail = getAvailableTechsForBuilding('barracks', 'medieval', ['shared_doctrine_blitz'], 2);
  assert.ok(!barracksAge2Avail.some((t) => t.id === 'shared_doctrine_elite'));

  // 4. Stat modifiers: carryCapacity, trainTime, gatherByType, regen, counter bonuses, and building armor
  const workerBase = {
    maxHp: 55,
    attack: 5,
    defense: 0,
    range: 1.4,
    speed: 3.1,
    attackRate: 0.7,
    cost: { food: 50, wood: 0, gold: 0, stone: 0 },
    trainTime: 7,
    gatherSpeed: 0.6,
    carryCapacity: 15,
  };
  const upgradedWorker = applyCivilizationAndTechStats(workerBase, 'worker', 'medieval', ['shared_wheelbarrow']);
  assert.equal(upgradedWorker.carryCapacity, 21);
  assert.ok(upgradedWorker.speed > 3.4);

  assert.equal(getTrainingTimeMultiplier(['shared_doctrine_blitz']), 0.75);
  assert.equal(getResourceGatherTechMultiplier(['shared_double_bit_axe'], 'wood'), 1.25);
  assert.equal(getResourceGatherTechMultiplier(['shared_double_bit_axe'], 'gold'), 1);

  const meleeBase = {
    ...workerBase,
    maxHp: 88,
    attack: 8,
    defense: 1,
    gatherSpeed: 0,
    carryCapacity: 0,
  };
  const counterMelee = applyCivilizationAndTechStats(
    meleeBase,
    'melee',
    'medieval',
    ['shared_shield_pavise', 'shared_pike_formation', 'shared_preserved_rations'],
    2
  );
  assert.equal(counterMelee.rangedDefense, 3);
  assert.equal(counterMelee.bonusVsCategory?.cavalry, 6);
  assert.equal(counterMelee.hpRegenPerSec, 1.4);

  const knightTarget = {
    unitDef: {
      id: 'knight',
      name: 'Knight',
      factionPack: 'medieval',
      category: 'cavalry' as const,
      description: '',
      stats: { ...meleeBase, defense: 2 },
      visual: { color: '#fff', modelType: 'knight' as const },
    },
  };
  const archerTarget = {
    unitDef: {
      ...knightTarget.unitDef,
      category: 'melee' as const,
      stats: counterMelee,
    },
  };
  // Pike melee gets +6 bonus vs cavalry (8+6 - 2 = 12 vs 8 - 2 = 6)
  assert.equal(getUnitVsUnitDamage(8, knightTarget, false, 0, counterMelee.bonusVsCategory), 12);
  assert.equal(getUnitVsUnitDamage(8, knightTarget, false, 0), 6);
  // Shield Pavise melee absorbs +3 ranged arrow damage
  assert.equal(getUnitVsUnitDamage(10, archerTarget, true, 0), 5);

  // Dynamic building armor includes doctrine_bastion (+4)
  const sampleTower = { buildingType: 'tower' as const, buildingDef: { buildingArmor: 11 } as any };
  assert.equal(getEffectiveBuildingArmor(sampleTower, 2, ['med_doctrine_bastion']), 17);

  // 5. AI reacts to enemy composition & personality
  const pavise = findTechDef('shared_shield_pavise')!;
  const axe = findTechDef('shared_double_bit_axe')!;
  const pike = findTechDef('shared_pike_formation')!;
  const bastion = findTechDef('med_doctrine_bastion')!;
  const crusade = findTechDef('med_doctrine_crusade')!;

  const vsArcherPick = evaluateAiTechChoice(
    [
      { buildingId: 'b1', tech: axe },
      { buildingId: 'b2', tech: pavise },
      { buildingId: 'b3', tech: pike },
    ],
    {
      resources: { food: 500, wood: 500, gold: 500, stone: 500 },
      reserveFood: 0,
      reserveGold: 0,
      age: 2,
      workerCount: 8,
      aiPersonality: 'standard',
      enemyComposition: { melee: 1, ranged: 6, cavalry: 0, siege: 0, fortificationCount: 0 },
    }
  );
  assert.equal(vsArcherPick?.tech.id, 'shared_shield_pavise');

  const vsCavPick = evaluateAiTechChoice(
    [
      { buildingId: 'b1', tech: axe },
      { buildingId: 'b2', tech: pavise },
      { buildingId: 'b3', tech: pike },
    ],
    {
      resources: { food: 500, wood: 500, gold: 500, stone: 500 },
      reserveFood: 0,
      reserveGold: 0,
      age: 2,
      workerCount: 8,
      aiPersonality: 'standard',
      enemyComposition: { melee: 1, ranged: 0, cavalry: 4, siege: 0, fortificationCount: 0 },
    }
  );
  assert.equal(vsCavPick?.tech.id, 'shared_pike_formation');

  const defDoctrine = evaluateAiTechChoice(
    [
      { buildingId: 'f1', tech: bastion },
      { buildingId: 'f1', tech: crusade },
    ],
    {
      resources: { food: 500, wood: 500, gold: 500, stone: 500 },
      reserveFood: 0,
      reserveGold: 0,
      age: 2,
      workerCount: 8,
      aiPersonality: 'defensive',
      enemyComposition: { melee: 2, ranged: 2, cavalry: 0, siege: 0, fortificationCount: 0 },
    }
  );
  assert.equal(defDoctrine?.tech.id, 'med_doctrine_bastion');

  const aggDoctrine = evaluateAiTechChoice(
    [
      { buildingId: 'f1', tech: bastion },
      { buildingId: 'f1', tech: crusade },
    ],
    {
      resources: { food: 500, wood: 500, gold: 500, stone: 500 },
      reserveFood: 0,
      reserveGold: 0,
      age: 2,
      workerCount: 8,
      aiPersonality: 'hard',
      enemyComposition: { melee: 2, ranged: 2, cavalry: 0, siege: 0, fortificationCount: 0 },
    }
  );
  assert.equal(aggDoctrine?.tech.id, 'med_doctrine_crusade');
});

test('population-cap-8-house-and-scout: initial TC cap 8, House +5, queued reservation, hotkey E, and Age II stable scout parity', async () => {
  const {
    INITIAL_POPULATION_CAP,
    HOUSE_POPULATION_BONUS,
    getFactionPopulationStats,
  } = await import('./rules');
  const { DEFAULT_BUILDINGS, SHARED_UNITS } = await import('./mods');
  const { getBuildableTypesForCiv, getTrainableUnitsForBuilding } = await import('./civilizations');
  const { BUILDING_HOTKEYS } = await import('./hotkeys');

  assert.equal(INITIAL_POPULATION_CAP, 8);
  assert.equal(HOUSE_POPULATION_BONUS, 5);
  assert.equal(DEFAULT_BUILDINGS.town_center.populationProvided, 8);
  assert.equal(DEFAULT_BUILDINGS.house.populationProvided, 5);
  assert.equal(DEFAULT_BUILDINGS.barracks.populationProvided, undefined);
  assert.equal(DEFAULT_BUILDINGS.archery_range.populationProvided, undefined);
  assert.equal(DEFAULT_BUILDINGS.stable.requiredAge, 2);
  assert.equal(BUILDING_HOTKEYS.house, 'E');

  const scout = SHARED_UNITS.find((u) => u.id === 'scout_rider');
  assert.ok(scout, 'Shared scout_rider must exist in SHARED_UNITS');
  for (const civ of ['medieval', 'anime', 'fantasy'] as const) {
    assert.ok(getBuildableTypesForCiv(civ).includes('house'), `${civ} must be able to build House`);
    assert.ok(
      getTrainableUnitsForBuilding('stable', civ).includes('scout_rider'),
      `${civ} stable must be able to train shared Age II scout_rider`
    );
  }

  const tcBuilding = {
    faction: 'player' as const,
    hp: 3000,
    isConstructed: true,
    buildingDef: DEFAULT_BUILDINGS.town_center,
    queue: ['villager', 'villager'],
  };
  const incompleteHouse = {
    faction: 'player' as const,
    hp: 150,
    isConstructed: false,
    buildingDef: DEFAULT_BUILDINGS.house,
    queue: [],
  };
  const constructedHouse = {
    faction: 'player' as const,
    hp: 600,
    isConstructed: true,
    buildingDef: DEFAULT_BUILDINGS.house,
    queue: [],
  };
  const starterUnits = Array.from({ length: 4 }, () => ({ faction: 'player' as const, hp: 55 }));

  // 4 active + 2 queued = 6 reserved, max = 8 (incomplete house does not increase cap)
  const beforeHouse = getFactionPopulationStats('player', [tcBuilding, incompleteHouse], starterUnits);
  assert.equal(beforeHouse.used, 4);
  assert.equal(beforeHouse.queued, 2);
  assert.equal(beforeHouse.totalReserved, 6);
  assert.equal(beforeHouse.max, 8);

  // Constructed house raises cap from 8 to 13
  const afterHouse = getFactionPopulationStats('player', [tcBuilding, constructedHouse], starterUnits);
  assert.equal(afterHouse.max, 13);
});

test('resource-module-upgrade: rich vein tiers, effective gather multipliers, telemetry /min, and mid-map rich spawns', async () => {
  const {
    RICH_NODE_GATHER_MULTIPLIER,
    FARM_RESEED_WOOD_COST,
    getNodeTierGatherMultiplier,
    getEffectiveGatherMultiplier,
    computeFactionResourceTelemetry,
    generateSpawnPositions,
  } = await import('./rules');
  const { generateMapLayout } = await import('./mapGenerator');
  const { MEDIEVAL_UNITS } = await import('./mods');

  assert.equal(RICH_NODE_GATHER_MULTIPLIER, 1.35);
  assert.equal(FARM_RESEED_WOOD_COST, 60);
  assert.equal(getNodeTierGatherMultiplier('rich'), 1.35);
  assert.equal(getNodeTierGatherMultiplier('standard'), 1.0);
  assert.equal(getNodeTierGatherMultiplier(undefined), 1.0);

  // Effective multiplier combines subtype, nodeTier, eco tech, and Star Relic Oath
  const richGoldWithTech = getEffectiveGatherMultiplier(
    { resourceType: 'gold', subtype: 'gold', nodeTier: 'rich' },
    ['shared_prospecting_picks'],
    false
  );
  assert.ok(richGoldWithTech > 1.65, `Expected rich gold + prospecting tech > 1.65, got ${richGoldWithTech}`);

  const deepFishMult = getEffectiveGatherMultiplier(
    { resourceType: 'food', subtype: 'deep_fish', nodeTier: 'standard' },
    [],
    false
  );
  assert.equal(deepFishMult, 1.55);

  // Live worker allocation + /min telemetry including shrines
  const villagerDef = MEDIEVAL_UNITS.find((u) => u.id === 'villager')!;
  const nodes = [
    { id: 'n_food', resourceType: 'food' as const, subtype: 'hunt' as const, nodeTier: 'standard' as const, amount: 300 },
    { id: 'n_gold', resourceType: 'gold' as const, subtype: 'gold' as const, nodeTier: 'rich' as const, amount: 2200 },
    { id: 'n_wood', resourceType: 'wood' as const, subtype: 'wood' as const, nodeTier: 'standard' as const, amount: 300 },
  ];
  const workers = [
    { faction: 'player' as const, hp: 55, state: 'gathering' as const, unitDef: villagerDef, targetResourceNodeId: 'n_food' },
    { faction: 'player' as const, hp: 55, state: 'returning_resource' as const, unitDef: villagerDef, targetResourceNodeId: 'n_gold', carryingResource: { type: 'gold' as const, amount: 12 } },
    { faction: 'player' as const, hp: 55, state: 'building' as const, unitDef: villagerDef },
    { faction: 'player' as const, hp: 55, state: 'idle' as const, unitDef: villagerDef },
  ];
  const shrines = [
    { ownerFaction: 'player' as const, shrineType: 'forge' as const, siegeSupplyActive: false }, // +2G/s, +2S/s = +120/min each
  ];
  const telemetry = computeFactionResourceTelemetry('player', workers, nodes, shrines, [], false);
  assert.equal(telemetry.totalWorkers, 4);
  assert.equal(telemetry.workersByResource.food, 1);
  assert.equal(telemetry.workersByResource.gold, 1);
  assert.equal(telemetry.workersByResource.wood, 0);
  assert.equal(telemetry.workersByResource.building, 1);
  assert.equal(telemetry.workersByResource.idle, 1);
  // 1 villager on hunt (35 * 1.15 ≈ 40/min), 1 villager on rich gold (35 * 1.35 ≈ 47) + forge shrine (+120G, +120S)
  assert.ok(telemetry.incomePerMin.food >= 38 && telemetry.incomePerMin.food <= 42);
  assert.ok(telemetry.incomePerMin.gold >= 165 && telemetry.incomePerMin.gold <= 170);
  assert.equal(telemetry.incomePerMin.stone, 120);

  // Map generator spawns rich deposits in mid-map contested zones strictly >= 23.5m away from starter TCs
  const spawns = generateSpawnPositions(2, 58).map((sp, idx) => ({ id: `p${idx}`, x: sp.x, z: sp.z }));
  const layout = generateMapLayout('highland_basin', 'standard', spawns, 2026);
  const richNodes = layout.resourceNodes.filter((n) => n.nodeTier === 'rich');
  assert.ok(richNodes.length >= 6, `Expected rich mid-map gold/stone/ancient-wood nodes, found ${richNodes.length}`);
  for (const rn of richNodes) {
    for (const sp of spawns) {
      const dist = Math.hypot(rn.x - sp.x, rn.z - sp.z);
      assert.ok(dist >= 23.5, `Rich node ${rn.id} (${dist.toFixed(1)}m) must stay contested outside base radius`);
    }
  }
});

test('high-speed-presets-and-continuous-construction: 10x/20x speeds, substepping safety, and smooth build curves', async () => {
  const {
    GAME_SPEED_OPTIONS,
    getNextGameSpeed,
    computeSimulationSubsteps,
    computeBuildingVisualState,
  } = await import('./rules');

  const speedValues = GAME_SPEED_OPTIONS.map((o) => o.value);
  assert.deepEqual(speedValues, [1, 1.5, 2, 10, 20]);
  assert.equal(getNextGameSpeed(1), 1.5);
  assert.equal(getNextGameSpeed(2), 10);
  assert.equal(getNextGameSpeed(10), 20);
  assert.equal(getNextGameSpeed(20), 1);
  assert.equal(getNextGameSpeed(99), 1);

  // 20x speed on 60fps frame (~0.0167s) must sub-step accurately without tunneling (>0.05s step)
  const fast60 = computeSimulationSubsteps(0.0167, 20, false);
  assert.ok(fast60.steps >= 7 && fast60.stepDt <= 0.05 && fast60.stepDt > 0.01);
  assert.ok(Math.abs(fast60.steps * fast60.stepDt - 0.0167 * 20) < 1e-6);

  // Software GL slow frame at 20x caps cleanly to prevent CPU spiral-of-death while keeping stepDt <= 0.05
  const slowSw = computeSimulationSubsteps(0.5, 20, true);
  assert.ok(slowSw.stepDt <= 0.05 && slowSw.steps <= 36);

  // Continuous construction state avoids jarring jumps at p=0 and smoothly rises across all tiers
  const start = computeBuildingVisualState(false, 0.0, 10, 1000);
  assert.ok(start.tier1Reveal > 0 && start.tier1Reveal < 0.15, `Start plinth should emerge gently, got ${start.tier1Reveal}`);
  assert.ok(start.foundationReveal > 0.2 && start.scaffoldHeightScale < 0.2);

  let prevT1 = start.tier1Reveal;
  let prevT2 = start.tier2Reveal;
  let prevT3 = start.tier3Reveal;
  for (let i = 1; i <= 20; i++) {
    const p = i / 20;
    const st = computeBuildingVisualState(false, p, Math.round(p * 1000), 1000);
    assert.ok(st.tier1Reveal >= prevT1 - 1e-9);
    assert.ok(st.tier2Reveal >= prevT2 - 1e-9);
    assert.ok(st.tier3Reveal >= prevT3 - 1e-9);
    prevT1 = st.tier1Reveal;
    prevT2 = st.tier2Reveal;
    prevT3 = st.tier3Reveal;
  }
  const nearDone = computeBuildingVisualState(false, 0.96, 960, 1000);
  assert.ok(nearDone.planksOpacity < 0.5 && nearDone.scaffoldHeightScale < 0.5);
  const finished = computeBuildingVisualState(true, 1, 1000, 1000);
  assert.equal(finished.showScaffold, false);
  assert.equal(finished.planksOpacity, 0);
});

test('unit-portraits: every built-in unit has a distinct portrait spec and all modelType fallbacks exist', async () => {
  const { getUnitPortraitSpec } = await import('./unitPortraits');
  const { SHARED_UNITS, MEDIEVAL_UNITS, ANIME_UNITS, FANTASY_UNITS } = await import('./mods');

  const allUnits = [...SHARED_UNITS, ...MEDIEVAL_UNITS, ...ANIME_UNITS, ...FANTASY_UNITS];
  assert.ok(allUnits.length >= 20, `Expected at least 20 built-in units, found ${allUnits.length}`);

  const seenKeys = new Set<string>();
  for (const unit of allUnits) {
    const spec = getUnitPortraitSpec(unit.id, unit.visual.modelType);
    assert.equal(spec.key, unit.id, `Expected dedicated portrait key for ${unit.id}, got ${spec.key}`);
    assert.ok(spec.label.length > 0);
    assert.ok(spec.accentHex.startsWith('#'));
    seenKeys.add(spec.key);
  }
  assert.equal(seenKeys.size, allUnits.length, 'Every built-in unit needs its own dedicated portrait');

  const modelTypes = [
    'villager',
    'swordsman',
    'archer',
    'knight',
    'ninja',
    'saiyan',
    'mage',
    'golem',
    'ram',
    'cannon',
    'boat',
  ] as const;
  for (const mt of modelTypes) {
    const fallbackSpec = getUnitPortraitSpec(`custom_${mt}`, mt);
    assert.equal(fallbackSpec.key, `fallback_${mt}`);
  }
});


test('field engineering: ram assembly uses one shared Age II, research, infantry and resource gate', () => {
  const resources = { food: 0, wood: 180, gold: 80, stone: 0 };
  assert.deepEqual(FIELD_RAM_COST, { food: 0, wood: 140, gold: 60, stone: 0 });
  assert.equal(isAgeUnlocked(2, 1), false);
  assert.equal(isAgeUnlocked(2, 2), true);
  assert.equal(canAssembleFieldRam(1, [FIELD_RAM_TECH_ID], 4, resources).ok, false);
  assert.equal(canAssembleFieldRam(2, [], 4, resources).ok, false);
  assert.equal(canAssembleFieldRam(2, [FIELD_RAM_TECH_ID], 3, resources).ok, false);
  assert.equal(canAssembleFieldRam(2, [FIELD_RAM_TECH_ID], 4, { ...resources, wood: 139 }).ok, false);
  assert.equal(canAssembleFieldRam(2, [FIELD_RAM_TECH_ID], 4, resources).ok, true);
});


test('AI siege: all personalities field-assemble battering rams instead of training them from buildings', async () => {
  const { DEFAULT_AI_RULES, DEFENSIVE_AI_RULES, EASY_AI_RULES, HARD_AI_RULES } = await import('./mods');
  const allPersonalityRules = [
    ...DEFAULT_AI_RULES,
    ...DEFENSIVE_AI_RULES,
    ...EASY_AI_RULES,
    ...HARD_AI_RULES,
  ];
  const invalidRamTrainRules = allPersonalityRules.filter(
    (rule) => rule.action.type === 'train_unit' && rule.action.targetId === 'battering_ram'
  );
  assert.deepEqual(invalidRamTrainRules.map((rule) => rule.id), []);
});


test('AI progression: mandatory field engineering takes priority only when safe and ready', () => {
  const base = {
    age: 2,
    researched: false,
    researchInProgress: false,
    meleeUnitCount: 4,
    hasAvailableBarracks: true,
    prerequisitesMet: true,
    resources: { food: 1400, wood: 180, gold: 700, stone: 0 },
    reserveFood: 1200,
    reserveGold: 600,
    techCost: { food: 80, wood: 120, gold: 60, stone: 0 },
  };

  assert.equal(shouldPrioritizeAiFieldEngineering(base), true);
  assert.equal(shouldPrioritizeAiFieldEngineering({ ...base, age: 1 }), false);
  assert.equal(shouldPrioritizeAiFieldEngineering({ ...base, researched: true }), false);
  assert.equal(shouldPrioritizeAiFieldEngineering({ ...base, researchInProgress: true }), false);
  assert.equal(shouldPrioritizeAiFieldEngineering({ ...base, meleeUnitCount: 3 }), false);
  assert.equal(shouldPrioritizeAiFieldEngineering({ ...base, hasAvailableBarracks: false }), false);
  assert.equal(shouldPrioritizeAiFieldEngineering({ ...base, prerequisitesMet: false }), false);
  assert.equal(
    shouldPrioritizeAiFieldEngineering({
      ...base,
      resources: { ...base.resources, food: 1279 },
    }),
    false,
    'AI must preserve the next landmark food reserve'
  );
  assert.equal(
    shouldPrioritizeAiFieldEngineering({
      ...base,
      resources: { ...base.resources, gold: 659 },
    }),
    false,
    'AI must preserve the next landmark gold reserve'
  );
});


test('AI army composition: role counters prevent single-unit-type overproduction', async () => {
  const { evaluateCondition } = await import('./rules');
  const cavalryUnderCap = { field: 'cavalryCount', operator: '<', value: 4 } as const;
  const rangedUnderCap = { field: 'rangedCount', operator: '<', value: 8 } as const;
  const meleeUnderCap = { field: 'meleeCount', operator: '<', value: 10 } as const;
  const siegeUnderCap = { field: 'siegeCount', operator: '<', value: 2 } as const;

  const snapshot = {
    food: 500,
    wood: 500,
    gold: 500,
    stone: 200,
    armyCount: 18,
    workerCount: 12,
    underAttack: 0,
    enemyProximity: 40,
    gameTime: 180,
    age: 3,
    cavalryCount: 4,
    rangedCount: 3,
    meleeCount: 9,
    siegeCount: 1,
  };

  assert.equal(evaluateCondition(cavalryUnderCap, snapshot), false);
  assert.equal(evaluateCondition(rangedUnderCap, snapshot), true);
  assert.equal(evaluateCondition(meleeUnderCap, snapshot), true);
  assert.equal(evaluateCondition(siegeUnderCap, snapshot), true);
  assert.equal(resolveAiKnightUnitId('anime'), 'scout_rider');
  assert.equal(resolveAiKnightUnitId('fantasy'), 'fantasy_paladin');
  assert.equal(resolveAiKnightUnitId('medieval'), 'knight');
});

test('AI army composition: every personality has role-aware military training caps', async () => {
  const { DEFAULT_AI_RULES, DEFENSIVE_AI_RULES, EASY_AI_RULES, HARD_AI_RULES } = await import('./mods');
  const cases = [
    { rules: DEFAULT_AI_RULES, melee: 10, ranged: 8, cavalry: 4, siege: 2 },
    { rules: DEFENSIVE_AI_RULES, melee: 8, ranged: 6, cavalry: null, siege: null },
    { rules: EASY_AI_RULES, melee: 6, ranged: 6, cavalry: null, siege: null },
    { rules: HARD_AI_RULES, melee: 10, ranged: 10, cavalry: 5, siege: 2 },
  ] as const;

  for (const item of cases) {
    const trainingRules = item.rules.filter((rule) => rule.action.type === 'train_unit');
    const hasCap = (targetId: string, field: string, value: number) =>
      trainingRules.some(
        (rule) =>
          rule.action.targetId === targetId &&
          rule.conditions.some((condition) => condition.field === field && condition.operator === '<' && condition.value === value)
      );
    assert.ok(hasCap('swordsman', 'meleeCount', item.melee), 'melee needs a role cap');
    assert.ok(hasCap('longbowman', 'rangedCount', item.ranged), 'ranged needs a role cap');
    if (item.cavalry !== null) assert.ok(hasCap('knight', 'cavalryCount', item.cavalry), 'cavalry needs a role cap');
    if (item.siege !== null) {
      assert.ok(trainingRules.some((rule) => rule.action.targetId === 'catapult' && rule.conditions.some((c) => c.field === 'siegeCount' && c.value === item.siege)), 'siege needs a role cap');
    }
  }
});


test('siege tactics: select nearby frontline escorts and preserve units with active orders', () => {
  const siege = [{ x: 10, z: 10 }, { x: 12, z: 10 }];
  const candidates = [
    { id: 'far-melee', x: 19, z: 10, state: 'idle', unitDef: { category: 'melee' as const } },
    { id: 'near-ranged', x: 11, z: 10, state: 'idle', unitDef: { category: 'ranged' as const } },
    { id: 'near-cavalry', x: 12, z: 12, state: 'idle', unitDef: { category: 'cavalry' as const } },
    { id: 'busy-melee', x: 10, z: 10, state: 'attacking', unitDef: { category: 'melee' as const } },
    { id: 'other-siege', x: 10, z: 11, state: 'idle', unitDef: { category: 'siege' as const } },
    { id: 'worker', x: 10, z: 11, state: 'idle', unitDef: { category: 'worker' as const } },
  ];

  const escort = selectSiegeEscortUnits(siege, candidates, 2);
  assert.deepEqual(escort.map((unit) => unit.id), ['near-cavalry', 'far-melee']);
  assert.deepEqual(selectSiegeEscortUnits([], candidates, 2), []);
  assert.deepEqual(selectSiegeEscortUnits(siege, candidates, 0), []);
});


test('AI economy: rebalance one worker from a clear surplus into the largest resource deficit', () => {
  assert.deepEqual(
    selectAiWorkerReassignment(
      { food: 2, wood: 5, gold: 1, stone: 0 },
      { food: 5, wood: 1, gold: 1, stone: 1 }
    ),
    { from: 'wood', to: 'food' }
  );
  assert.deepEqual(
    selectAiWorkerReassignment(
      { food: 1, wood: 1, gold: 4, stone: 0 },
      { food: 1, wood: 3, gold: 1, stone: 1 }
    ),
    { from: 'gold', to: 'wood' }
  );
  assert.equal(
    selectAiWorkerReassignment(
      { food: 2, wood: 2, gold: 1, stone: 1 },
      { food: 2, wood: 2, gold: 1, stone: 1 }
    ),
    null
  );
  assert.equal(
    selectAiWorkerReassignment(
      { food: 3, wood: 1, gold: 1, stone: 1 },
      { food: 2, wood: 2, gold: 1, stone: 1 }
    ),
    null,
    'Do not churn workers for one-worker differences'
  );
});


test('wall-chain planning: creates modular segments for each polyline edge and scales costs by distance', async () => {
  const { layoutWallChain, calculateWallChainCost, WALL_SEGMENT_SPACING } = await import('./rules');
  const layout = layoutWallChain([
    { x: 0, z: 0 },
    { x: 5.4, z: 0 },
    { x: 5.4, z: 5.4 },
  ]);

  assert.equal(WALL_SEGMENT_SPACING, 2.7);
  assert.equal(layout.length, 4);
  assert.deepEqual(
    layout.map((segment) => [Number(segment.x.toFixed(2)), Number(segment.z.toFixed(2))]),
    [[1.35, 0], [4.05, 0], [5.4, 1.35], [5.4, 4.05]]
  );
  assert.ok(layout.slice(0, 2).every((segment) => Math.abs(segment.rotationY) < 0.001));
  assert.ok(layout.slice(2).every((segment) => Math.abs(segment.rotationY + Math.PI / 2) < 0.001));
  assert.deepEqual(calculateWallChainCost(layout.length, { food: 0, wood: 25, gold: 0, stone: 10 }), {
    food: 0,
    wood: 100,
    gold: 0,
    stone: 40,
  });
  assert.deepEqual(layoutWallChain([{ x: 0, z: 0 }, { x: 0.5, z: 0 }]), []);
  assert.deepEqual(calculateWallChainCost(-3, { food: 0, wood: 25, gold: 0, stone: 10 }), {
    food: 0, wood: 0, gold: 0, stone: 0,
  });
});
