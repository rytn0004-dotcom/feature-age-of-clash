import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateMongolOvooPolicy,
  hasNearbyHostileUnit,
  isMongolRangedSupportUnit,
  shouldTrainMongolLancer,
  shouldTrainMongolShaman,
  type MongolNearbyUnit,
} from './mongolAi';

type TestUnit = MongolNearbyUnit & { faction: 'ally' | 'enemy' };

test('Ovoo threat scan ignores allies, dead units, garrisoned units, and distant enemies', () => {
  const center = { x: 0, z: 0 };
  const units: TestUnit[] = [
    { faction: 'ally', hp: 100, x: 2, z: 0 },
    { faction: 'enemy', hp: 0, x: 1, z: 0 },
    { faction: 'enemy', hp: 100, x: 3, z: 0, garrisonedInBuildingId: 'tower-1' },
    { faction: 'enemy', hp: 100, x: 25, z: 0 },
  ];

  assert.equal(hasNearbyHostileUnit(center, units, (unit) => unit.faction === 'enemy'), false);
  units.push({ faction: 'enemy', hp: 100, x: 0, z: 18 });
  assert.equal(hasNearbyHostileUnit(center, units, (unit) => unit.faction === 'enemy'), true);
});

test('Ovoo threat scan rejects invalid radius and ignores non-finite unit positions', () => {
  const unit = { faction: 'enemy', hp: 100, x: Number.NaN, z: 0 } satisfies TestUnit;
  assert.equal(hasNearbyHostileUnit({ x: 0, z: 0 }, [unit], () => true), false);
  assert.equal(hasNearbyHostileUnit({ x: 0, z: 0 }, [unit], () => true, Number.NaN), false);
});

test('Ovoo switches from extraction to Yam relay when hostile forces approach', () => {
  const policy = evaluateMongolOvooPolicy({
    currentMode: 'sacred_extraction',
    hasNearbyHostiles: true,
    hasNearbyMine: true,
    hasActiveProduction: false,
    hasWoundedArmy: false,
    hasNearbyFriendlyArmy: true,
    hornCooldown: 0,
  });

  assert.equal(policy.desiredMode, 'yam_relay');
  assert.equal(policy.shouldChangeMode, true);
  assert.equal(policy.shouldTriggerWarHorn, true);
});

test('Ovoo keeps Yam relay active for production or wounded troops', () => {
  for (const reason of ['production', 'healing'] as const) {
    const policy = evaluateMongolOvooPolicy({
      currentMode: 'sacred_extraction',
      hasNearbyHostiles: false,
      hasNearbyMine: true,
      hasActiveProduction: reason === 'production',
      hasWoundedArmy: reason === 'healing',
      hasNearbyFriendlyArmy: false,
      hornCooldown: 0,
    });
    assert.equal(policy.desiredMode, 'yam_relay');
    assert.equal(policy.shouldChangeMode, true);
    assert.equal(policy.shouldTriggerWarHorn, false);
  }
});

test('Ovoo uses sacred extraction only when safe and a mine is nearby', () => {
  const policy = evaluateMongolOvooPolicy({
    currentMode: 'yam_relay',
    hasNearbyHostiles: false,
    hasNearbyMine: true,
    hasActiveProduction: false,
    hasWoundedArmy: false,
    hasNearbyFriendlyArmy: false,
    hornCooldown: 0,
  });

  assert.equal(policy.desiredMode, 'sacred_extraction');
  assert.equal(policy.shouldChangeMode, true);
  assert.equal(policy.shouldTriggerWarHorn, false);
});

test('Ovoo war horn requires a hostile threat, nearby friendly army, and a ready cooldown', () => {
  const base = {
    currentMode: 'yam_relay' as const,
    hasNearbyHostiles: true,
    hasNearbyMine: false,
    hasActiveProduction: false,
    hasWoundedArmy: false,
    hornCooldown: 0,
  };
  assert.equal(evaluateMongolOvooPolicy({ ...base, hasNearbyFriendlyArmy: false }).shouldTriggerWarHorn, false);
  assert.equal(evaluateMongolOvooPolicy({ ...base, hasNearbyFriendlyArmy: true, hornCooldown: 12 }).shouldTriggerWarHorn, false);
  assert.equal(evaluateMongolOvooPolicy({ ...base, hasNearbyFriendlyArmy: true, hornCooldown: 0 }).shouldTriggerWarHorn, true);
  assert.equal(evaluateMongolOvooPolicy({ ...base, hasNearbyHostiles: false, hasNearbyFriendlyArmy: true }).shouldTriggerWarHorn, false);
});

test('Ovoo retains its current mode when no strategic condition applies', () => {
  const policy = evaluateMongolOvooPolicy({
    currentMode: 'yam_relay',
    hasNearbyHostiles: false,
    hasNearbyMine: false,
    hasActiveProduction: false,
    hasWoundedArmy: false,
    hasNearbyFriendlyArmy: false,
    hornCooldown: 0,
  });

  assert.equal(policy.desiredMode, 'yam_relay');
  assert.equal(policy.shouldChangeMode, false);
  assert.equal(policy.shouldTriggerWarHorn, false);
});


test('Mongol AI keeps a capped shaman support ratio in ranged formations', () => {
  assert.equal(shouldTrainMongolShaman(5, 0), false);
  assert.equal(shouldTrainMongolShaman(6, 0), true);
  assert.equal(shouldTrainMongolShaman(12, 1), true);
  assert.equal(shouldTrainMongolShaman(18, 2), false);
  assert.equal(shouldTrainMongolShaman(Number.NaN, 0), false);
  assert.equal(shouldTrainMongolShaman(12, Number.NaN), true);
});

test('Mongol ranged roster counts mounted archers and Shaman but not melee cavalry', () => {
  assert.equal(isMongolRangedSupportUnit('mongol_mangudai', 'cavalry'), true);
  assert.equal(isMongolRangedSupportUnit('mongol_shaman', 'ranged'), true);
  assert.equal(isMongolRangedSupportUnit('mongol_lancer', 'cavalry'), false);
  assert.equal(isMongolRangedSupportUnit('mongol_keshik', 'cavalry'), false);
});

test('Mongol AI maintains a small Steppe Lancer wing beside Keshik cavalry', () => {
  assert.equal(shouldTrainMongolLancer(0, 0), false);
  assert.equal(shouldTrainMongolLancer(0, 1), true);
  assert.equal(shouldTrainMongolLancer(1, 1), false);
  assert.equal(shouldTrainMongolLancer(1, 3), true);
  assert.equal(shouldTrainMongolLancer(4, 10), false);
  assert.equal(shouldTrainMongolLancer(Number.NaN, 1), true);
});
