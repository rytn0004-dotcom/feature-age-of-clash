import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyMoraleImpact,
  getMoraleCombatModifiers,
  getMoraleRoutGoal,
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
