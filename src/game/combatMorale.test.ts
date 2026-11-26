import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyMoraleImpact,
  getMoraleCombatModifiers,
  getMoraleRoutGoal,
  selectNearestMoraleRoutThreat,
  shouldUnitRout,
} from './combatMorale';

test('small hits cause pressure while morale remains bounded', () => {
  const next = applyMoraleImpact({
    morale: 100,
    damage: 6,
    maxHp: 100,
    attackerCategory: 'ranged',
  });
  assert.ok(next < 100);
  assert.ok(next > 90);
  assert.equal(applyMoraleImpact({ morale: 2, damage: 500, maxHp: 100 }), 0);
});

test('siege, flanking and rear attacks create stronger morale shock', () => {
  const normal = applyMoraleImpact({ morale: 100, damage: 18, maxHp: 100 });
  const flank = applyMoraleImpact({
    morale: 100, damage: 18, maxHp: 100, direction: 'flank',
  });
  const rear = applyMoraleImpact({
    morale: 100, damage: 18, maxHp: 100, direction: 'rear',
  });
  const siege = applyMoraleImpact({
    morale: 100, damage: 18, maxHp: 100, attackerCategory: 'siege',
  });
  assert.ok(flank < normal);
  assert.ok(rear < flank);
  assert.ok(siege < normal);
});

test('a nearby allied casualty lowers morale even without direct damage', () => {
  assert.equal(
    applyMoraleImpact({
      morale: 80,
      damage: 0,
      maxHp: 100,
      nearbyAllyCasualty: true,
    }),
    72.5,
  );
});

test('killing blows carry additional morale shock', () => {
  const survived = applyMoraleImpact({ morale: 80, damage: 30, maxHp: 100 });
  const killed = applyMoraleImpact({
    morale: 80, damage: 30, maxHp: 100, wasKilled: true,
  });
  assert.ok(Math.abs((survived - killed) - 8) < 0.000001);
});

test('shaken and broken morale slows movement and attack tempo', () => {
  assert.deepEqual(getMoraleCombatModifiers(100), {
    state: 'steady',
    movementSpeedMultiplier: 1,
    attackRateMultiplier: 1,
  });
  assert.equal(getMoraleCombatModifiers(55).state, 'shaken');
  assert.ok(getMoraleCombatModifiers(55).attackRateMultiplier < 1);
  assert.equal(getMoraleCombatModifiers(20).state, 'broken');
  assert.ok(getMoraleCombatModifiers(20).movementSpeedMultiplier < 0.9);
});

test('AI combat units rout at the break point, while human orders and workers remain protected', () => {
  const eligible = {
    morale: 10,
    isHumanControlled: false,
    isWorker: false,
    alreadyRouted: false,
    cooldownReady: true,
  };
  assert.equal(shouldUnitRout(eligible), true);
  assert.equal(shouldUnitRout({ ...eligible, isHumanControlled: true }), false);
  assert.equal(shouldUnitRout({ ...eligible, isWorker: true }), false);
  assert.equal(shouldUnitRout({ ...eligible, alreadyRouted: true }), false);
  assert.equal(shouldUnitRout({ ...eligible, cooldownReady: false }), false);
});

test('morale rout escapes away from the threat and stays in world bounds', () => {
  const goal = getMoraleRoutGoal({
    x: 0, z: 0, threatX: -4, threatZ: 0, worldLimit: 10,
  });
  assert.ok(goal);
  assert.ok(goal.x > 0);
  assert.ok(Math.abs(goal.x) <= 10 && Math.abs(goal.z) <= 10);
});

test('morale rout tries a side lane if the direct escape route is blocked', () => {
  let checks = 0;
  const goal = getMoraleRoutGoal({
    x: 0, z: 0, threatX: -4, threatZ: 0,
    isPositionClear: (x, z) => {
      checks++;
      return Math.abs(z) > 0.01;
    },
  });
  assert.ok(goal);
  assert.notEqual(goal.z, 0);
  assert.ok(checks > 1);
});

test('morale rout safely rejects invalid, overlapping and fully blocked positions', () => {
  assert.equal(getMoraleRoutGoal({ x: 0, z: 0, threatX: 0, threatZ: 0 }), null);
  assert.equal(getMoraleRoutGoal({ x: Number.NaN, z: 0, threatX: 1, threatZ: 0 }), null);
  assert.equal(getMoraleRoutGoal({
    x: 0, z: 0, threatX: -4, threatZ: 0, isPositionClear: () => false,
  }), null);
});

test('leadership resistance softens direct morale shocks', () => {
  const exposed = applyMoraleImpact({ morale: 100, damage: 24, maxHp: 100 });
  const supported = applyMoraleImpact({
    morale: 100,
    damage: 24,
    maxHp: 100,
    moraleShockResistance: 0.25,
  });
  assert.ok(supported > exposed);
});

test('a commander casualty causes a larger nearby morale shock', () => {
  const normal = applyMoraleImpact({
    morale: 80, damage: 0, maxHp: 100, nearbyAllyCasualty: true,
  });
  const commander = applyMoraleImpact({
    morale: 80,
    damage: 0,
    maxHp: 100,
    nearbyAllyCasualty: true,
    leaderCasualty: true,
  });
  assert.equal(normal, 72.5);
  assert.equal(commander, 67.5);
});

test('leadership resistance also reduces the shock of a commander casualty', () => {
  const unsupported = applyMoraleImpact({
    morale: 80, damage: 0, maxHp: 100, nearbyAllyCasualty: true, leaderCasualty: true,
  });
  const supported = applyMoraleImpact({
    morale: 80,
    damage: 0,
    maxHp: 100,
    nearbyAllyCasualty: true,
    leaderCasualty: true,
    moraleShockResistance: 0.4,
  });
  assert.ok(supported > unsupported);
});


test('morale combat modifiers reuse immutable presets for every morale band', () => {
  const steady = getMoraleCombatModifiers(100);
  const shaken = getMoraleCombatModifiers(55);
  const broken = getMoraleCombatModifiers(20);
  const critical = getMoraleCombatModifiers(5);

  assert.equal(getMoraleCombatModifiers(85), steady);
  assert.equal(getMoraleCombatModifiers(50), shaken);
  assert.equal(getMoraleCombatModifiers(15), broken);
  assert.equal(getMoraleCombatModifiers(0), critical);
  assert.notEqual(steady, shaken);
  assert.notEqual(broken, critical);
  assert.equal(Object.isFrozen(steady), true);
  assert.equal(Object.isFrozen(shaken), true);
  assert.equal(Object.isFrozen(broken), true);
  assert.equal(Object.isFrozen(critical), true);
  assert.deepEqual(critical, {
    state: 'broken',
    movementSpeedMultiplier: 0.76,
    attackRateMultiplier: 0.55,
  });
});


test('morale rout threat selection ignores invalid candidates and resolves equal-distance ties by stable ID', () => {
  const hostileIds = new Set(['red-z', 'red-a', 'red-near']);
  const candidates = [
    { id: 'self', x: 0, z: 0, hp: 100 },
    { id: 'dead', x: 0.5, z: 0, hp: 0 },
    { id: 'sheltered', x: 0.25, z: 0, hp: 100, garrisonedInBuildingId: 'keep' },
    { id: 'friend', x: 0.2, z: 0, hp: 100 },
    { id: 'red-z', x: -3, z: 0, hp: 100 },
    { id: 'red-a', x: 3, z: 0, hp: 100 },
    { id: 'red-near', x: 0, z: 4, hp: 100 },
    { id: 'red-far', x: 20, z: 0, hp: 100 },
  ];
  const isHostile = (candidate: (typeof candidates)[number]) => hostileIds.has(candidate.id);

  assert.equal(
    selectNearestMoraleRoutThreat(candidates, 'self', 0, 0, 24, isHostile)?.id,
    'red-a',
  );
  assert.equal(
    selectNearestMoraleRoutThreat([candidates[5], candidates[4]], 'self', 0, 0, 24, isHostile)?.id,
    'red-a',
    'equal-distance selection must not depend on spatial bucket traversal order',
  );
});

test('morale rout threat selection rejects boundary, invalid and unbounded query inputs', () => {
  const candidates = [
    { id: 'boundary', x: 24, z: 0, hp: 100 },
    { id: 'invalid', x: Number.NaN, z: 0, hp: 100 },
  ];
  assert.equal(selectNearestMoraleRoutThreat(candidates, 'self', 0, 0, 24, () => true), null);
  assert.equal(selectNearestMoraleRoutThreat(candidates, 'self', Number.NaN, 0, 24, () => true), null);
  assert.equal(selectNearestMoraleRoutThreat(candidates, 'self', 0, 0, Infinity, () => true), null);
});
