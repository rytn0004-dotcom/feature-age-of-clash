import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyAiFactionBuildings,
  classifyAiFactionUnits,
} from './aiFactionRoster';

test('AI faction unit classification preserves alive rosters and worker/military eligibility', () => {
  const units = [
    { id: 'worker', hp: 50, unitDefId: 'villager', unitDef: { category: 'worker' } },
    { id: 'naval-worker', hp: 45, unitDefId: 'fishing_boat', unitDef: { category: 'worker', isNaval: true } },
    { id: 'boat-by-id', hp: 40, unitDefId: 'fishing_boat', unitDef: { category: 'worker' } },
    { id: 'garrisoned-worker', hp: 50, unitDefId: 'villager', garrisonedInBuildingId: 'tc', unitDef: { category: 'worker' } },
    { id: 'melee', hp: 100, unitDefId: 'swordsman', unitDef: { category: 'melee' } },
    { id: 'garrisoned-siege', hp: 100, unitDefId: 'ram', garrisonedInBuildingId: 'castle', unitDef: { category: 'siege' } },
    { id: 'dead-worker', hp: 0, unitDefId: 'villager', unitDef: { category: 'worker' } },
  ];

  const roster = classifyAiFactionUnits(units, (_id, category) =>
    category === 'melee' || category === 'siege'
  );

  assert.deepEqual(roster.units.map((unit) => unit.id), [
    'worker',
    'naval-worker',
    'boat-by-id',
    'garrisoned-worker',
    'melee',
    'garrisoned-siege',
  ]);
  assert.deepEqual(roster.navalBoats.map((unit) => unit.id), ['naval-worker', 'boat-by-id']);
  assert.deepEqual(roster.workers.map((unit) => unit.id), ['worker', 'garrisoned-worker']);
  assert.deepEqual(roster.activeWorkers.map((unit) => unit.id), ['worker']);
  assert.deepEqual(roster.army.map((unit) => unit.id), ['melee']);
});

test('AI faction building classification keeps first anchors and source order', () => {
  const buildings = [
    { id: 'damaged-tc', hp: 0, buildingType: 'town_center' },
    { id: 'first-tc', hp: 500, buildingType: 'town_center' },
    { id: 'second-tc', hp: 500, buildingType: 'town_center' },
    { id: 'barracks-a', hp: 400, buildingType: 'barracks' },
    { id: 'barracks-b', hp: 400, buildingType: 'barracks' },
    { id: 'range', hp: 400, buildingType: 'archery_range' },
    { id: 'stable', hp: 400, buildingType: 'stable' },
    { id: 'workshop', hp: 400, buildingType: 'siege_workshop' },
    { id: 'dock', hp: 400, buildingType: 'dock' },
    { id: 'unfinished-ovoo', hp: 400, buildingType: 'ovoo_relay', isConstructed: false },
    { id: 'ovoo', hp: 400, buildingType: 'ovoo_relay', isConstructed: true },
    { id: 'unique', hp: 400, buildingType: 'mongol_landmark' },
    { id: 'dead-barracks', hp: 0, buildingType: 'barracks' },
  ];

  const roster = classifyAiFactionBuildings(buildings, 'mongol_landmark');

  assert.equal(roster.townCenter?.id, 'first-tc');
  assert.equal(roster.uniqueBuilding?.id, 'unique');
  assert.deepEqual(roster.buildings.map((building) => building.id), [
    'first-tc',
    'second-tc',
    'barracks-a',
    'barracks-b',
    'range',
    'stable',
    'workshop',
    'dock',
    'unfinished-ovoo',
    'ovoo',
    'unique',
  ]);
  assert.deepEqual(roster.barracks.map((building) => building.id), ['barracks-a', 'barracks-b']);
  assert.deepEqual(roster.archeryRanges.map((building) => building.id), ['range']);
  assert.deepEqual(roster.stables.map((building) => building.id), ['stable']);
  assert.deepEqual(roster.siegeWorkshops.map((building) => building.id), ['workshop']);
  assert.deepEqual(roster.docks.map((building) => building.id), ['dock']);
  assert.deepEqual(roster.ovooBuildings.map((building) => building.id), ['ovoo']);
});


test('AI faction unit counters preserve production-role and military-cap semantics in one roster pass', () => {
  const units = [
    { id: 'melee', hp: 100, unitDefId: 'swordsman', unitDef: { category: 'melee' } },
    { id: 'ranged-support', hp: 100, unitDefId: 'mongol_mangudai', unitDef: { category: 'cavalry' } },
    { id: 'plain-ranged', hp: 100, unitDefId: 'archer', unitDef: { category: 'ranged' } },
    { id: 'cavalry', hp: 100, unitDefId: 'knight', unitDef: { category: 'cavalry' } },
    { id: 'siege', hp: 100, unitDefId: 'ram', unitDef: { category: 'siege' } },
    { id: 'special', hp: 100, unitDefId: 'hero', unitDef: { category: 'special' } },
    { id: 'garrisoned-special', hp: 100, unitDefId: 'hero', garrisonedInBuildingId: 'keep', unitDef: { category: 'special' } },
    { id: 'dead-melee', hp: 0, unitDefId: 'swordsman', unitDef: { category: 'melee' } },
  ];
  let militaryChecks = 0;
  let supportChecks = 0;
  const roster = classifyAiFactionUnits(
    units,
    (_id, category) => {
      militaryChecks++;
      return category !== 'worker';
    },
    (unit) => {
      supportChecks++;
      return unit.unitDefId === 'mongol_mangudai' || unit.unitDef.category === 'ranged';
    },
  );

  assert.equal(militaryChecks, 7, 'each living unit should be checked once for the military production cap');
  assert.equal(supportChecks, 7, 'each living unit should be checked once for ranged-support composition');
  assert.equal(roster.meleeCount, 1);
  assert.equal(roster.rangedSupportCount, 2);
  assert.equal(roster.cavalryCount, 2);
  assert.equal(roster.siegeCount, 1);
  assert.equal(roster.specialCount, 1, 'special units in garrison remain excluded from field army composition');
  assert.equal(roster.militaryCount, 7, 'the military cap keeps counting living military units regardless of garrison');
  assert.equal(roster.mongolMountedArcherCount, 1);
});


test('AI unit and building roster subsets avoid repeat filters and retain original eligibility', () => {
  const units = [
    { id: 'melee', hp: 100, unitDefId: 'swordsman', unitDef: { category: 'melee' } },
    { id: 'ram', hp: 100, unitDefId: 'battering_ram', unitDef: { category: 'siege' } },
    { id: 'garrisoned-siege', hp: 100, unitDefId: 'ram', garrisonedInBuildingId: 'keep', unitDef: { category: 'siege' } },
    { id: 'ranged', hp: 100, unitDefId: 'archer', unitDef: { category: 'ranged' } },
  ];
  const roster = classifyAiFactionUnits(
    units,
    (_id, category) => category !== 'worker',
    (unit) => unit.unitDef.category === 'ranged',
  );
  assert.deepEqual(roster.nonSiegeArmy.map((unit) => unit.id), ['melee', 'ranged']);
  assert.deepEqual(roster.siegeArmy.map((unit) => unit.id), ['ram']);
  assert.equal(roster.meleeArmyCount, 1);
  assert.equal(roster.hasBatteringRam, true);
  assert.equal(roster.army.length, 3, 'garrisoned military units remain outside the field army');

  const buildings = [
    { id: 'farm', hp: 100, buildingType: 'farm' },
    { id: 'farm-dead', hp: 0, buildingType: 'farm' },
    { id: 'tower', hp: 100, buildingType: 'tower' },
    { id: 'castle', hp: 100, buildingType: 'castle' },
    { id: 'lumber', hp: 100, buildingType: 'lumber_camp' },
    { id: 'mine', hp: 100, buildingType: 'mining_camp' },
  ];
  const buildingRoster = classifyAiFactionBuildings(buildings, 'unique');
  assert.equal(buildingRoster.farmCount, 1);
  assert.equal(buildingRoster.towerCount, 1);
  assert.equal(buildingRoster.castleCount, 1);
  assert.equal(buildingRoster.lumberCampCount, 1);
  assert.equal(buildingRoster.miningCampCount, 1);
});


test('AI hostile roster collection matches team/faction hostility and reuses stable-order output', async () => {
  const {
    collectAiHostileEntitiesInOrder,
    isAiFactionHostile,
  } = await import('./aiFactionRoster');
  const teamByFaction = new Map<string, number | undefined>([
    ['blue', 1],
    ['ally', 1],
    ['red', 2],
    ['green', 3],
    ['no-team', undefined],
  ]);
  const entities = [
    { id: 'blue-unit', faction: 'blue', team: 1, hp: 100 },
    { id: 'ally-unit', faction: 'ally', team: 1, hp: 100 },
    { id: 'red-unit', faction: 'red', team: 2, hp: 100 },
    { id: 'green-unit', faction: 'green', hp: 100 },
    { id: 'neutral-unit', faction: 'neutral', hp: 100 },
    { id: 'dead-red-unit', faction: 'red', team: 2, hp: 0 },
    { id: 'no-team-unit', faction: 'no-team', hp: 100 },
  ];

  assert.equal(isAiFactionHostile('blue', 1, entities[2], teamByFaction), true);
  assert.equal(isAiFactionHostile('blue', 1, entities[1], teamByFaction), false);
  assert.equal(isAiFactionHostile('blue', 1, entities[4], teamByFaction), false);
  assert.equal(isAiFactionHostile('blue', undefined, entities[2], teamByFaction), true);
  assert.equal(isAiFactionHostile('blue', undefined, entities[6], teamByFaction), true);

  const output = [{ id: 'stale', faction: 'red', hp: 1 }];
  const first = collectAiHostileEntitiesInOrder(entities, 'blue', 1, teamByFaction, output);
  assert.equal(first, output);
  assert.deepEqual(first.map((entity) => entity.id), ['red-unit', 'green-unit']);

  const second = collectAiHostileEntitiesInOrder(
    entities.slice(0, 2),
    'blue',
    1,
    teamByFaction,
    output,
  );
  assert.equal(second, output);
  assert.deepEqual(second.map((entity) => entity.id), [], 'the reused output must not leak a previous enemy roster');
});
