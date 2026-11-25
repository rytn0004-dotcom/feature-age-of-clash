import test from 'node:test';
import {
  collectWildlifeUnitInteractions,
  getWildlifeInteractionQueryRadius,
  tryConsumeWildlifeHunterAttack,
  type WildlifeInteractionUnit,
} from './wildlifeQueries';
import assert from 'node:assert/strict';
import {
  countNearbyCombatForces,
  createCombatSpatialIndex,
  type CombatSpatialCandidates,
  queryCombatSpatialIndex,
  rebuildCombatSpatialIndexInPlace,
} from './combatSpatialIndex';

test('combat spatial index: queries exact circular neighbors across cell boundaries', () => {
  const units = [
    { id: 'center', x: 15.8, z: 0, hp: 100 },
    { id: 'edge', x: 16.2, z: 0, hp: 100 },
    { id: 'inside-diagonal', x: 18, z: 3, hp: 100 },
    { id: 'outside-circle', x: 20.5, z: 0, hp: 100 },
    { id: 'far', x: 80, z: 80, hp: 100 },
  ];
  const buildings = [
    { id: 'near-tower', x: 19, z: 0, hp: 500 },
    { id: 'outside-tower', x: 28, z: 0, hp: 500 },
  ];
  const index = createCombatSpatialIndex(units, buildings, 16);
  const result = queryCombatSpatialIndex(index, 16, 0, 4);

  assert.deepEqual(result.units.map((unit) => unit.id), [
    'center',
    'edge',
    'inside-diagonal',
  ]);
  assert.deepEqual(result.buildings.map((building) => building.id), ['near-tower']);
});

test('combat spatial index: excludes destroyed and garrisoned units but rechecks live state', () => {
  const units = [
    { id: 'alive', x: 0, z: 0, hp: 100 },
    { id: 'dead', x: 1, z: 0, hp: 0 },
    { id: 'garrisoned', x: 2, z: 0, hp: 100, garrisonedInBuildingId: 'tc' },
  ];
  const buildings = [
    { id: 'alive-building', x: 0, z: 1, hp: 500 },
    { id: 'dead-building', x: 1, z: 1, hp: 0 },
  ];
  const index = createCombatSpatialIndex(units, buildings);
  assert.deepEqual(queryCombatSpatialIndex(index, 0, 0, 5).units.map((unit) => unit.id), ['alive']);
  assert.deepEqual(queryCombatSpatialIndex(index, 0, 0, 5).buildings.map((building) => building.id), ['alive-building']);

  units[0].hp = 0;
  buildings[0].hp = 0;
  assert.deepEqual(queryCombatSpatialIndex(index, 0, 0, 5), { units: [], buildings: [] });
});

test('combat spatial index: indexed finite-radius results match a brute-force reference', () => {
  const units = Array.from({ length: 240 }, (_, index) => ({
    id: 'unit-' + index,
    x: ((index * 37) % 181) - 90,
    z: ((index * 53) % 179) - 89,
    hp: index % 19 === 0 ? 0 : 100,
    ...(index % 23 === 0 ? { garrisonedInBuildingId: 'shelter' } : {}),
  }));
  const buildings = Array.from({ length: 52 }, (_, index) => ({
    id: 'building-' + index,
    x: ((index * 29) % 171) - 85,
    z: ((index * 41) % 173) - 86,
    hp: index % 11 === 0 ? 0 : 600,
  }));
  const index = createCombatSpatialIndex(units, buildings, 13);
  const queries = [
    { x: 0, z: 0, radius: 14 },
    { x: -31.5, z: 22, radius: 28 },
    { x: 76, z: -64, radius: 9.5 },
    { x: 11, z: 74, radius: 44 },
  ];

  for (const query of queries) {
    const result = queryCombatSpatialIndex(index, query.x, query.z, query.radius);
    const expectedUnits = units
      .filter(
        (unit) =>
          unit.hp > 0 &&
          !unit.garrisonedInBuildingId &&
          Math.hypot(unit.x - query.x, unit.z - query.z) <= query.radius,
      )
      .map((unit) => unit.id)
      .sort();
    const expectedBuildings = buildings
      .filter(
        (building) =>
          building.hp > 0 &&
          Math.hypot(building.x - query.x, building.z - query.z) <= query.radius,
      )
      .map((building) => building.id)
      .sort();
    assert.deepEqual(result.units.map((unit) => unit.id).sort(), expectedUnits);
    assert.deepEqual(result.buildings.map((building) => building.id).sort(), expectedBuildings);
  }
});

test('combat spatial index: invalid query inputs safely return no candidates', () => {
  const index = createCombatSpatialIndex([{ id: 'u', x: 0, z: 0, hp: 100 }], []);
  assert.deepEqual(queryCombatSpatialIndex(index, Number.NaN, 0, 5), { units: [], buildings: [] });
  assert.deepEqual(queryCombatSpatialIndex(index, 0, 0, Number.NaN), { units: [], buildings: [] });
  assert.deepEqual(queryCombatSpatialIndex(index, 0, 0, -1), { units: [], buildings: [] });
});

test('combat spatial index: infinite range retains all living candidates', () => {
  const index = createCombatSpatialIndex(
    [
      { id: 'one', x: -80, z: 0, hp: 100 },
      { id: 'dead', x: 80, z: 0, hp: 0 },
    ],
    [{ id: 'town', x: 0, z: 0, hp: 1000 }],
  );
  const result = queryCombatSpatialIndex(index, 500, 500, Infinity);
  assert.deepEqual(result.units.map((unit) => unit.id), ['one']);
  assert.deepEqual(result.buildings.map((building) => building.id), ['town']);
});


test('combat spatial index: local cavalry force counts preserve AI faction and worker semantics', () => {
  const units = [
    { id: 'rider', x: 0, z: 0, hp: 45, faction: 'blue', unitDef: { category: 'cavalry' } },
    { id: 'ally', x: 4, z: 0, hp: 100, faction: 'blue', unitDef: { category: 'melee' } },
    { id: 'enemy', x: 8, z: 0, hp: 100, faction: 'red', unitDef: { category: 'ranged' } },
    { id: 'enemy-worker', x: 2, z: 0, hp: 100, faction: 'red', unitDef: { category: 'worker' } },
    { id: 'same-team-other-faction', x: 3, z: 0, hp: 100, faction: 'green', unitDef: { category: 'melee' } },
    { id: 'dead-enemy', x: 1, z: 0, hp: 0, faction: 'red', unitDef: { category: 'melee' } },
    { id: 'garrisoned-enemy', x: 1, z: 0, hp: 100, faction: 'red', garrisonedInBuildingId: 'keep', unitDef: { category: 'melee' } },
    { id: 'far-enemy', x: 11.51, z: 0, hp: 100, faction: 'red', unitDef: { category: 'melee' } },
  ];
  const index = createCombatSpatialIndex(units, []);
  const nearby = queryCombatSpatialIndex(index, 0, 0, 11.5).units;
  const counts = countNearbyCombatForces(nearby, 'blue', (unit) => unit.faction === 'red');

  assert.deepEqual(counts, { nearbyEnemyCount: 1, nearbyAllyCount: 2 });
});


test('combat spatial index: rebuild reuses maps, active arrays and bucket arrays without stale cells', () => {
  const firstUnit = { id: 'first', x: 1, z: 1, hp: 100 };
  const firstBuilding = { id: 'first-building', x: 2, z: 1, hp: 500 };
  const index = createCombatSpatialIndex([firstUnit], [firstBuilding], 16);
  const unitsArray = index.units;
  const buildingsArray = index.buildings;
  const unitMap = index.unitBuckets;
  const buildingMap = index.buildingBuckets;
  const unitBucket = index.unitBuckets.get('0:0');
  const buildingBucket = index.buildingBuckets.get('0:0');

  const movedUnit = { id: 'moved', x: 97, z: 81, hp: 100 };
  const movedBuilding = { id: 'moved-building', x: 98, z: 82, hp: 700 };
  const rebuilt = rebuildCombatSpatialIndexInPlace(index, [movedUnit], [movedBuilding]);

  assert.equal(rebuilt, index);
  assert.equal(index.units, unitsArray);
  assert.equal(index.buildings, buildingsArray);
  assert.equal(index.unitBuckets, unitMap);
  assert.equal(index.buildingBuckets, buildingMap);
  assert.equal(index.unitBuckets.has('0:0'), false);
  assert.equal(index.buildingBuckets.has('0:0'), false);
  assert.equal(index.unitBuckets.get('6:5'), unitBucket);
  assert.equal(index.buildingBuckets.get('6:5'), buildingBucket);
  assert.deepEqual(index.units.map((unit) => unit.id), ['moved']);
  assert.deepEqual(index.buildings.map((building) => building.id), ['moved-building']);

  const cleared = rebuildCombatSpatialIndexInPlace(index, [], []);
  assert.equal(cleared.units.length, 0);
  assert.equal(cleared.buildings.length, 0);
  assert.equal(cleared.unitBuckets.size, 0);
  assert.equal(cleared.buildingBuckets.size, 0);
});

test('combat spatial index: reusable query outputs retain identity and clear previous candidates', () => {
  type TestUnit = { id: string; x: number; z: number; hp: number };
  type TestBuilding = { id: string; x: number; z: number; hp: number };
  const unit: TestUnit = { id: 'near', x: 0, z: 0, hp: 100 };
  const building: TestBuilding = { id: 'tower', x: 1, z: 0, hp: 500 };
  const index = createCombatSpatialIndex<TestUnit, TestBuilding>([unit], [building]);
  const output: CombatSpatialCandidates<TestUnit, TestBuilding> = { units: [], buildings: [] };
  const unitsBuffer = output.units;
  const buildingsBuffer = output.buildings;

  const first = queryCombatSpatialIndex(index, 0, 0, 5, output);
  assert.equal(first, output);
  assert.deepEqual(output.units.map((unit) => unit.id), ['near']);
  assert.deepEqual(output.buildings.map((building) => building.id), ['tower']);

  const invalid = queryCombatSpatialIndex(index, Number.NaN, 0, 5, output);
  assert.equal(invalid, output);
  assert.equal(output.units, unitsBuffer);
  assert.equal(output.buildings, buildingsBuffer);
  assert.equal(output.units.length, 0);
  assert.equal(output.buildings.length, 0);

  const all = queryCombatSpatialIndex(index, 100, 100, Infinity, output);
  assert.equal(all, output);
  assert.deepEqual(output.units.map((unit) => unit.id), ['near']);
  assert.deepEqual(output.buildings.map((building) => building.id), ['tower']);
});


test('wildlife interaction query: finds nearest ground threat and only active attackers in their own range', () => {
  type Candidate = WildlifeInteractionUnit;
  const makeUnit = (
    id: string,
    x: number,
    options: {
      hp?: number;
      category?: string;
      isNaval?: boolean;
      range?: number;
      state?: string;
      attackMoveGoal?: unknown;
      garrisonedInBuildingId?: string;
    } = {},
  ): Candidate => ({
    id,
    x,
    z: 0,
    hp: options.hp ?? 100,
    garrisonedInBuildingId: options.garrisonedInBuildingId,
    unitDef: {
      category: options.category ?? 'melee',
      isNaval: options.isNaval,
      stats: { range: options.range ?? 1.5 },
    },
    state: options.state ?? 'idle',
    attackMoveGoal: options.attackMoveGoal,
  });

  const idleThreat = makeUnit('idle-threat', 0.5);
  const closeMelee = makeUnit('close-melee', 2.4, { state: 'moving', attackMoveGoal: { x: 20, z: 0 } });
  const rangedAttacker = makeUnit('ranged-attacker', 6, { category: 'ranged', range: 6, state: 'attacking' });
  const outOfRange = makeUnit('out-of-range', 7, { category: 'ranged', range: 5, state: 'attacking' });
  const worker = makeUnit('worker', 1, { category: 'worker', state: 'attacking' });
  const idleMilitary = makeUnit('idle-military', 1.2);
  const naval = makeUnit('naval', 0.2, { isNaval: true, state: 'attacking' });
  const dead = makeUnit('dead', 0.1, { hp: 0, state: 'attacking' });
  const garrisoned = makeUnit('garrisoned', 0.15, { garrisonedInBuildingId: 'keep', state: 'attacking' });

  const output = {
    nearestThreat: null as { x: number; z: number; d: number } | null,
    attackers: [] as Candidate[],
  };
  const attackersBuffer = output.attackers;
  const first = collectWildlifeUnitInteractions(
    [idleThreat, closeMelee, rangedAttacker, outOfRange, worker, idleMilitary, naval, dead, garrisoned],
    0,
    0,
    18,
    output,
  );

  assert.equal(first, output);
  assert.equal(output.nearestThreat?.x, 0.5);
  assert.deepEqual(output.attackers.map((unit) => unit.id), ['close-melee', 'ranged-attacker']);
  assert.equal(output.attackers, attackersBuffer);

  const nearestVector = output.nearestThreat;
  collectWildlifeUnitInteractions([rangedAttacker], 0, 0, 18, output);
  assert.equal(output.nearestThreat, nearestVector, 'nearest-threat vector should be reused');
  assert.equal(output.nearestThreat?.x, 6);
  assert.deepEqual(output.attackers.map((unit) => unit.id), ['ranged-attacker']);
});

test('wildlife interaction query: invalid and out-of-range candidates are ignored safely', () => {
  const output = {
    nearestThreat: null as { x: number; z: number; d: number } | null,
    attackers: [] as WildlifeInteractionUnit[],
  };
  collectWildlifeUnitInteractions([], 0, 0, 18, output);
  assert.deepEqual(output, { nearestThreat: null, attackers: [] });
  collectWildlifeUnitInteractions([], Number.NaN, 0, 18, output);
  assert.deepEqual(output, { nearestThreat: null, attackers: [] });
});


test('wildlife query radius: only active ground hunters expand deer interaction range', () => {
  const makeUnit = (
    id: string,
    options: {
      range?: number;
      category?: string;
      state?: string;
      isNaval?: boolean;
      hp?: number;
      garrisonedInBuildingId?: string;
      attackMoveGoal?: unknown;
    } = {},
  ): WildlifeInteractionUnit => ({
    id,
    x: 0,
    z: 0,
    hp: options.hp ?? 100,
    garrisonedInBuildingId: options.garrisonedInBuildingId,
    unitDef: {
      category: options.category ?? 'ranged',
      isNaval: options.isNaval,
      stats: { range: options.range ?? 1.5 },
    },
    state: options.state ?? 'idle',
    attackMoveGoal: options.attackMoveGoal,
  });

  const units = [
    makeUnit('idle-long-range', { range: 500 }),
    makeUnit('worker', { range: 700, category: 'worker', state: 'attacking' }),
    makeUnit('naval', { range: 800, isNaval: true, state: 'attacking' }),
    makeUnit('garrisoned', { range: 900, garrisonedInBuildingId: 'keep', state: 'attacking' }),
    makeUnit('dead', { range: 1000, hp: 0, state: 'attacking' }),
    makeUnit('active-ranged', { range: 8, state: 'attacking' }),
  ];

  assert.equal(getWildlifeInteractionQueryRadius(units, 18), 18);
  assert.equal(
    getWildlifeInteractionQueryRadius([makeUnit('long-range-hunter', { range: 28, state: 'attacking' })], 18),
    28.5,
  );
  assert.equal(
    getWildlifeInteractionQueryRadius([makeUnit('infinite-hunter', { range: Infinity, state: 'attacking' })], 18),
    Infinity,
  );
  assert.equal(getWildlifeInteractionQueryRadius(units, Number.NaN), 0);
});

test('wildlife hunter cooldown: one unit cannot spend its attack interval multiple times on the same frame', () => {
  const hunter: { wildlifeHuntReadyAt?: number } = {};

  assert.equal(tryConsumeWildlifeHunterAttack(hunter, 10, 1), true);
  assert.equal(hunter.wildlifeHuntReadyAt, 11);
  // A second nearby deer in the same simulation frame must not decrement or reset cooldown.
  assert.equal(tryConsumeWildlifeHunterAttack(hunter, 10, 1), false);
  assert.equal(tryConsumeWildlifeHunterAttack(hunter, 10.99, 1), false);
  assert.equal(tryConsumeWildlifeHunterAttack(hunter, 11, 1), true);
  assert.equal(hunter.wildlifeHuntReadyAt, 12);

  const fastHunter: { wildlifeHuntReadyAt?: number } = {};
  assert.equal(tryConsumeWildlifeHunterAttack(fastHunter, 2, 5), true);
  assert.equal(fastHunter.wildlifeHuntReadyAt, 2.5);
  assert.equal(tryConsumeWildlifeHunterAttack(fastHunter, Number.NaN, 5), false);
});
