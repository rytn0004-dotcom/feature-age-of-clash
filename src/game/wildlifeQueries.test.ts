import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyWildlifeHunterAttacks,
  collectWildlifeUnitInteractions,
  getWildlifeInteractionQueryRadius,
  selectNearestWildlifeHuntParty,
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
    targetResourceNodeId?: string;
  } = {},
): WildlifeHunterAttackUnit {
  return {
    id,
    x,
    z,
    hp: options.hp ?? 100,
    state: options.state ?? 'idle',
    attackMoveGoal: options.attackMoveGoal,
    targetResourceNodeId: options.targetResourceNodeId,
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

test('direct gather orders are handled by gathering and excluded from ambient wildlife attacks', () => {
  const correctTarget = makeUnit('correct-target', 1, 0, {
    category: 'melee',
    state: 'gathering',
    targetResourceNodeId: 'deer-1',
  });
  const wrongTarget = makeUnit('wrong-target', 1, 0, {
    category: 'ranged',
    state: 'gathering',
    targetResourceNodeId: 'deer-2',
    range: 10,
  });
  const siege = makeUnit('siege', 1, 0, {
    category: 'siege',
    state: 'gathering',
    targetResourceNodeId: 'deer-1',
  });
  const scratch = makeScratch();
  collectWildlifeUnitInteractions([correctTarget, wrongTarget, siege], 0, 0, 18, scratch);
  assert.deepEqual(scratch.attackers, []);
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

test('wildlife interaction query radius does not expand for direct gather orders', () => {
  const idleLongRange = makeUnit('idle', 0, 0, { range: 60 });
  const activeLongRange = makeUnit('active', 0, 0, { state: 'attacking', range: 60 });
  const assignedRanged = makeUnit('assigned-ranged', 0, 0, {
    category: 'ranged',
    state: 'gathering',
    targetResourceNodeId: 'deer-1',
    range: 25,
  });
  assert.equal(getWildlifeInteractionQueryRadius([idleLongRange], 18), 18);
  assert.equal(getWildlifeInteractionQueryRadius([activeLongRange], 18), 60.5);
  assert.equal(getWildlifeInteractionQueryRadius([assignedRanged], 18), 18);
});

test('a directly assigned military hunter is not double-counted by the ambient wildlife pass', () => {
  const hunter = makeUnit('hunter', 1, 0, {
    state: 'gathering',
    targetResourceNodeId: 'deer-1',
    attack: 12,
  });
  const animal = { animalAlive: true, animalHp: 30 };
  const hits: string[] = [];
  const count = applyWildlifeHunterAttacks(
    animal,
    [hunter],
    8,
    (attacker) => hits.push(attacker.id),
    () => undefined,
  );
  assert.equal(count, 0);
  assert.deepEqual(hits, []);
  assert.equal(animal.animalHp, 30);
  assert.equal(hunter.wildlifeHuntReadyAt, undefined);
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


test('AI wildlife hunt party selects nearest hunters in stable roster order and reuses scratch', () => {
  const candidates = [
    makeUnit('tie-first', -5, 0),
    makeUnit('far', 9, 0),
    makeUnit('nearest', 1, 0),
    makeUnit('middle', 0, 3),
    makeUnit('tie-second', 5, 0),
  ];
  const scratch = {
    units: [] as WildlifeHunterAttackUnit[],
    distances: [] as number[],
    frontlineUnits: [] as WildlifeHunterAttackUnit[],
    frontlineDistances: [] as number[],
  };

  const selected = selectNearestWildlifeHuntParty(candidates, 0, 0, 4, scratch);
  assert.equal(selected, scratch.units);
  assert.deepEqual(selected.map((unit) => unit.id), [
    'nearest',
    'middle',
    'tie-first',
    'tie-second',
  ]);
  assert.deepEqual(scratch.distances, [1, 3, 5, 5]);

  const secondSelection = selectNearestWildlifeHuntParty(candidates, 0, 0, 2, scratch);
  assert.equal(secondSelection, selected, 'the caller-owned array should be reused');
  assert.deepEqual(secondSelection.map((unit) => unit.id), ['nearest', 'middle']);
  assert.deepEqual(scratch.distances, [1, 3]);
});

test('AI wildlife hunt party reserves two nearest frontline hunters before ranged support', () => {
  const candidates = [
    makeUnit('archer-near', 1, 0, { category: 'ranged' }),
    makeUnit('archer-next', 2, 0, { category: 'ranged' }),
    makeUnit('frontline-far', 6, 0, { category: 'melee' }),
    makeUnit('cavalry-frontline', 5, 0, { category: 'cavalry' }),
    makeUnit('archer-far', 9, 0, { category: 'ranged' }),
  ];
  const scratch = {
    units: [] as WildlifeHunterAttackUnit[],
    distances: [] as number[],
    frontlineUnits: [] as WildlifeHunterAttackUnit[],
    frontlineDistances: [] as number[],
  };

  const selected = selectNearestWildlifeHuntParty(candidates, 0, 0, 4, scratch, 2);
  assert.deepEqual(selected.map((unit) => unit.id), [
    'cavalry-frontline',
    'frontline-far',
    'archer-near',
    'archer-next',
  ]);
  assert.deepEqual(scratch.distances, [5, 6, 1, 2]);
  assert.equal(selected, scratch.units);
  assert.equal(scratch.frontlineUnits.length, 2);

  selectNearestWildlifeHuntParty(candidates, 0, 0, 4, scratch, 2);
  assert.equal(scratch.units.length, 4, 'reused output must not retain prior candidates');
  assert.equal(scratch.frontlineUnits.length, 2);
});

test('AI wildlife hunt party fills spare frontline slots with nearest available roles', () => {
  const candidates = [
    makeUnit('archer-near', 1, 0, { category: 'ranged' }),
    makeUnit('only-frontline', 7, 0, { category: 'melee' }),
    makeUnit('archer-next', 2, 0, { category: 'ranged' }),
    makeUnit('archer-third', 3, 0, { category: 'ranged' }),
  ];
  const scratch = {
    units: [] as WildlifeHunterAttackUnit[],
    distances: [] as number[],
    frontlineUnits: [] as WildlifeHunterAttackUnit[],
    frontlineDistances: [] as number[],
  };
  const selected = selectNearestWildlifeHuntParty(candidates, 0, 0, 4, scratch, 2);
  assert.deepEqual(selected.map((unit) => unit.id), [
    'only-frontline',
    'archer-near',
    'archer-next',
    'archer-third',
  ]);
});


test('AI wildlife hunt party safely clears output for invalid targets and empty limits', () => {
  const scratch = {
    units: [makeUnit('stale', 0, 0)],
    distances: [0],
    frontlineUnits: [makeUnit('stale-frontline', 0, 0)],
    frontlineDistances: [0],
  };
  assert.deepEqual(selectNearestWildlifeHuntParty([makeUnit('candidate', 1, 0)], Number.NaN, 0, 4, scratch), []);
  assert.deepEqual(scratch.distances, []);
  assert.deepEqual(selectNearestWildlifeHuntParty([makeUnit('candidate', 1, 0)], 0, 0, 0, scratch), []);
  assert.deepEqual(scratch.units, []);
  assert.deepEqual(scratch.distances, []);
  assert.deepEqual(scratch.frontlineUnits, []);
  assert.deepEqual(scratch.frontlineDistances, []);
});
