import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyWildlifeHunterAttacks,
  collectWildlifeUnitInteractions,
  getWildlifeInteractionQueryRadius,
  tryConsumeWildlifeHunterAttack,
  type WildlifeHunterAttackUnit,
  type WildlifeUnitInteractionScratch,
} from './wildlifeQueries';

function makeUnit(
  id: string,
  x: number,
  z: number,
  options: {
    category?: string;
    hp?: number;
    state?: string;
    isNaval?: boolean;
    range?: number;
    attack?: number;
    attackRate?: number;
    attackMoveGoal?: unknown;
  } = {},
): WildlifeHunterAttackUnit {
  return {
    id,
    x,
    z,
    hp: options.hp ?? 100,
    state: options.state ?? 'idle',
    attackMoveGoal: options.attackMoveGoal,
    unitDef: {
      category: options.category ?? 'melee',
      isNaval: options.isNaval ?? false,
      stats: {
        range: options.range ?? 1.5,
        attack: options.attack ?? 10,
        attackRate: options.attackRate ?? 1,
      },
    },
  };
}

function makeScratch(): WildlifeUnitInteractionScratch<WildlifeHunterAttackUnit> {
  return { nearestThreat: null, attackers: [] };
}

test('wildlife interaction chooses the nearest threat deterministically when distances tie', () => {
  const left = makeUnit('threat-z', -4, 0);
  const right = makeUnit('threat-a', 4, 0);
  const scratch = makeScratch();

  collectWildlifeUnitInteractions([left, right], 0, 0, 18, scratch);
  assert.deepEqual(scratch.nearestThreat, { x: 4, z: 0, d: 4 });

  collectWildlifeUnitInteractions([right, left], 0, 0, 18, scratch);
  assert.deepEqual(scratch.nearestThreat, { x: 4, z: 0, d: 4 });
});

test('wildlife interactions keep idle units as threats but only active non-workers as hunters', () => {
  const idle = makeUnit('idle', 1, 0);
  const worker = makeUnit('worker', 2, 0, { category: 'worker', state: 'attacking' });
  const naval = makeUnit('naval', 2.5, 0, { isNaval: true, state: 'attacking' });
  const active = makeUnit('active', 3, 0, { state: 'attacking', range: 4 });
  const attackMoving = makeUnit('attack-moving', 4, 0, { range: 5, attackMoveGoal: { x: 8, z: 0 } });
  const dead = makeUnit('dead', 0.5, 0, { hp: 0, state: 'attacking' });
  const scratch = makeScratch();

  collectWildlifeUnitInteractions([idle, worker, naval, active, attackMoving, dead], 0, 0, 18, scratch);

  assert.equal(scratch.nearestThreat?.x, 1);
  assert.deepEqual(scratch.attackers.map((unit) => unit.id), ['active', 'attack-moving']);
});

test('wildlife squared-distance checks preserve flee and hunter range boundaries', () => {
  const boundary = makeUnit('boundary', 18, 0);
  const atHunterReach = makeUnit('at-range-edge', 2.5, 0, {
    state: 'attacking',
    range: 2,
  });
  const outsideHunterReach = makeUnit('outside-range-edge', 2.5001, 0, {
    state: 'attacking',
    range: 2,
  });
  const scratch = makeScratch();

  collectWildlifeUnitInteractions(
    [boundary, outsideHunterReach, atHunterReach],
    0,
    0,
    18,
    scratch,
  );

  assert.deepEqual(scratch.nearestThreat, { x: 2.5, z: 0, d: 2.5 });
  assert.deepEqual(scratch.attackers.map((unit) => unit.id), ['at-range-edge']);
});

test('wildlife interaction query radius expands only for active hunters', () => {
  const idleLongRange = makeUnit('idle', 0, 0, { range: 60 });
  const activeLongRange = makeUnit('active', 0, 0, { state: 'attacking', range: 60 });
  assert.equal(getWildlifeInteractionQueryRadius([idleLongRange], 18), 18);
  assert.equal(getWildlifeInteractionQueryRadius([activeLongRange], 18), 60.5);
});

test('wildlife hunter attacks stop immediately after the animal dies', () => {
  const first = makeUnit('first', 0, 0, { state: 'attacking', attack: 10 });
  const finisher = makeUnit('finisher', 0, 0, { state: 'attacking', attack: 10 });
  const shouldNotFire = makeUnit('third', 0, 0, { state: 'attacking', attack: 50 });
  const animal = { animalAlive: true, animalHp: 15 };
  const hits: string[] = [];
  let killCount = 0;

  const applied = applyWildlifeHunterAttacks(
    animal,
    [first, finisher, shouldNotFire],
    12,
    (attacker, damage) => hits.push(`${attacker.id}:${damage}`),
    () => { killCount++; },
  );

  assert.equal(applied, 2);
  assert.equal(animal.animalHp, 0);
  assert.equal(animal.animalAlive, false);
  assert.deepEqual(hits, ['first:10', 'finisher:10']);
  assert.equal(killCount, 1);
  assert.equal(shouldNotFire.wildlifeHuntReadyAt, undefined);
});

test('already-dead wildlife cannot consume hunter cooldowns or emit hit/kill callbacks', () => {
  const attacker = makeUnit('attacker', 0, 0, { state: 'attacking' });
  const animal = { animalAlive: false, animalHp: 0 };
  let callbacks = 0;

  const applied = applyWildlifeHunterAttacks(
    animal,
    [attacker],
    20,
    () => { callbacks++; },
    () => { callbacks++; },
  );

  assert.equal(applied, 0);
  assert.equal(attacker.wildlifeHuntReadyAt, undefined);
  assert.equal(callbacks, 0);
});

test('wildlife hunter cooldown is shared across nearby animals at one simulation time', () => {
  const attacker = makeUnit('attacker', 0, 0, { state: 'attacking', attackRate: 2 });
  assert.equal(tryConsumeWildlifeHunterAttack(attacker, 5, 2), true);
  assert.equal(tryConsumeWildlifeHunterAttack(attacker, 5, 2), false);
  assert.equal(tryConsumeWildlifeHunterAttack(attacker, 5.5, 2), true);
});
