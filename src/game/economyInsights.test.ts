import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateAgeResourceShortfall,
  calculateEconomyNetRates,
  getResourceHealthStatus,
  selectNearestResourceDropOffBuilding,
} from './economyInsights';

test('economy net flow uses simulated game time and includes all stock changes', () => {
  const older = { gameTime: 30, resources: { food: 500, wood: 400, gold: 300, stone: 200 } };
  const newer = { gameTime: 90, resources: { food: 650, wood: 340, gold: 300, stone: 260 } };
  assert.deepEqual(calculateEconomyNetRates(older, newer), {
    food: 150, wood: -60, gold: 0, stone: 60,
  });
});

test('economy net flow waits for a meaningful window and rejects invalid samples', () => {
  const older = { gameTime: 10, resources: { food: 1, wood: 2, gold: 3, stone: 4 } };
  const tooSoon = { gameTime: 15, resources: { food: 2, wood: 2, gold: 3, stone: 4 } };
  assert.equal(calculateEconomyNetRates(older, tooSoon), null);
  assert.equal(calculateEconomyNetRates(older, { ...tooSoon, gameTime: 30, resources: { ...tooSoon.resources, food: Number.NaN } }), null);
  assert.equal(calculateEconomyNetRates(older, { ...tooSoon, gameTime: Number.NaN }), null);
});

test('resource risk estimates depletion in game minutes', () => {
  assert.deepEqual(getResourceHealthStatus(50, -60), { status: 'critical', runwayMinutes: 0.8333333333333334 });
  assert.equal(getResourceHealthStatus(120, -60).status, 'warning');
  assert.equal(getResourceHealthStatus(180, -60).status, 'warning');
  assert.equal(getResourceHealthStatus(240, -60).status, 'draining');
  assert.equal(getResourceHealthStatus(180, 30).status, 'growing');
  assert.equal(getResourceHealthStatus(100, 0).status, 'stable');
  assert.equal(getResourceHealthStatus(0, -1).status, 'critical');
});

test('age readiness reports only the remaining food and gold requirements', () => {
  assert.deepEqual(
    calculateAgeResourceShortfall({ food: 500, gold: 125 }, { food: 400, gold: 200 }),
    { food: 0, gold: 75, ready: false },
  );
  assert.deepEqual(
    calculateAgeResourceShortfall({ food: 500, gold: 250 }, { food: 400, gold: 200 }),
    { food: 0, gold: 0, ready: true },
  );
});

test('delivered gathering rate accounts for round-trip storage travel and carry capacity', async () => {
  const { estimateDeliveredResourcePerMinute } = await import('./economyInsights');
  const theoreticalPerMinute = 0.75 * 60;
  const atDropOff = estimateDeliveredResourcePerMinute(0.75, 15, 1.5, 0);
  const nearbyStorage = estimateDeliveredResourcePerMinute(0.75, 15, 1.5, 12);
  const distantStorage = estimateDeliveredResourcePerMinute(0.75, 15, 1.5, 36);
  assert.equal(atDropOff, theoreticalPerMinute);
  assert.ok(nearbyStorage < atDropOff);
  assert.ok(distantStorage < nearbyStorage);
  assert.ok(
    estimateDeliveredResourcePerMinute(0.75, 30, 1.5, 36) > distantStorage,
    'Larger carry capacity should amortize travel time over more gathered resources.',
  );
  assert.ok(
    estimateDeliveredResourcePerMinute(0.75, 15, 3, 36) > distantStorage,
    'Faster workers should spend less simulated time walking.',
  );
  assert.equal(estimateDeliveredResourcePerMinute(0, 15, 1.5, 10), 0);
});


test('nearest resource drop-off selection applies resource/faction rules in one stable pass', () => {
  const buildings = [
    { id: 'tc-far', faction: 'blue', isConstructed: true, hp: 100, buildingType: 'town_center', x: 10, z: 0 },
    { id: 'farm-near', faction: 'blue', isConstructed: true, hp: 100, buildingType: 'farm', x: 2, z: 0 },
    { id: 'dock-near', faction: 'blue', isConstructed: true, hp: 100, buildingType: 'dock', x: 1, z: 0 },
    { id: 'camp-near', faction: 'blue', isConstructed: true, hp: 100, buildingType: 'lumber_camp', x: 0.5, z: 0 },
    { id: 'enemy-tc', faction: 'red', isConstructed: true, hp: 100, buildingType: 'town_center', x: 0.1, z: 0 },
    { id: 'unfinished-tc', faction: 'blue', isConstructed: false, hp: 100, buildingType: 'town_center', x: 0.2, z: 0 },
    { id: 'destroyed-tc', faction: 'blue', isConstructed: true, hp: 0, buildingType: 'town_center', x: 0.3, z: 0 },
  ];

  assert.equal(
    selectNearestResourceDropOffBuilding(buildings, 'blue', 'food', false, 0, 0)?.id,
    'dock-near',
  );
  assert.equal(
    selectNearestResourceDropOffBuilding(buildings, 'blue', 'wood', false, 0, 0)?.id,
    'camp-near',
  );
  assert.equal(
    selectNearestResourceDropOffBuilding(buildings, 'blue', 'gold', false, 0, 0)?.id,
    'tc-far',
    'gold can use the town center when no mining camp exists',
  );
  assert.equal(
    selectNearestResourceDropOffBuilding(buildings, 'blue', 'food', true, 0, 0)?.id,
    'dock-near',
    'naval workers must return to a dock only',
  );
});

test('nearest resource drop-off selection keeps first insertion on equal distances', () => {
  const buildings = [
    { id: 'first', faction: 'blue', isConstructed: true, hp: 100, buildingType: 'town_center', x: 2, z: 0 },
    { id: 'second', faction: 'blue', isConstructed: true, hp: 100, buildingType: 'town_center', x: -2, z: 0 },
  ];
  assert.equal(
    selectNearestResourceDropOffBuilding(buildings, 'blue', 'food', false, 0, 0)?.id,
    'first',
  );
  assert.equal(
    selectNearestResourceDropOffBuilding(buildings, 'blue', 'food', false, Number.NaN, 0),
    null,
  );
});

test('age readiness shortfall remains finite for invalid and negative save/mod values', () => {
  assert.deepEqual(
    calculateAgeResourceShortfall(
      { food: Number.NaN, gold: Number.POSITIVE_INFINITY },
      { food: 400, gold: 200 },
    ),
    { food: 400, gold: 200, ready: false },
  );
  assert.deepEqual(
    calculateAgeResourceShortfall(
      { food: -25, gold: 80 },
      { food: -10, gold: Number.NaN },
    ),
    { food: 0, gold: 0, ready: true },
  );
});


test('nearest drop-off ignores damaged data with non-finite health or coordinates', () => {
  const buildings = [
    { id: 'invalid-coordinate', faction: 'blue', isConstructed: true, hp: 100, buildingType: 'town_center', x: Number.NaN, z: 0 },
    { id: 'invalid-health', faction: 'blue', isConstructed: true, hp: Number.POSITIVE_INFINITY, buildingType: 'town_center', x: 0.1, z: 0 },
    { id: 'negative-health', faction: 'blue', isConstructed: true, hp: -1, buildingType: 'town_center', x: 0.2, z: 0 },
    { id: 'valid', faction: 'blue', isConstructed: true, hp: 100, buildingType: 'town_center', x: 4, z: 0 },
  ];

  assert.equal(
    selectNearestResourceDropOffBuilding(buildings, 'blue', 'food', false, 0, 0)?.id,
    'valid',
  );
});
