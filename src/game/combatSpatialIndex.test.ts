import test from 'node:test';
import assert from 'node:assert/strict';
import {
  countNearbyCombatForces,
  createCombatSpatialIndex,
  queryCombatSpatialIndex,
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
