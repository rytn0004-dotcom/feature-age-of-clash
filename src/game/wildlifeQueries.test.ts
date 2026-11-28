import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyWildlifeHunterAttacks,
  assignWildlifeCarcassHarvestSlotIndices,
  collectWildlifeUnitInteractions,
  getWildlifeCarcassHarvestCapacity,
  getWildlifeInteractionQueryRadius,
  isWildlifeCarcassNode,
  selectNearestWildlifeCarcassHarvesters,
  selectNearestWildlifeHuntParty,
  tryConsumeWildlifeHunterAttack,
  writeWildlifeCarcassWaitingPoint,
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
    rangedUnits: [] as WildlifeHunterAttackUnit[],
    rangedDistances: [] as number[],
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
    rangedUnits: [] as WildlifeHunterAttackUnit[],
    rangedDistances: [] as number[],
  };

  const selected = selectNearestWildlifeHuntParty(candidates, 0, 0, 4, scratch, 2, 1);
  assert.deepEqual(selected.map((unit) => unit.id), [
    'cavalry-frontline',
    'frontline-far',
    'archer-near',
    'archer-next',
  ]);
  assert.deepEqual(scratch.distances, [5, 6, 1, 2]);
  assert.equal(selected, scratch.units);
  assert.equal(scratch.frontlineUnits.length, 2);
  assert.equal(scratch.rangedUnits.length, 1);

  selectNearestWildlifeHuntParty(candidates, 0, 0, 4, scratch, 2, 1);
  assert.equal(scratch.units.length, 4, 'reused output must not retain prior candidates');
  assert.equal(scratch.frontlineUnits.length, 2);
  assert.equal(scratch.rangedUnits.length, 1);
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
    rangedUnits: [] as WildlifeHunterAttackUnit[],
    rangedDistances: [] as number[],
  };
  const selected = selectNearestWildlifeHuntParty(candidates, 0, 0, 4, scratch, 2, 1);
  assert.deepEqual(selected.map((unit) => unit.id), [
    'only-frontline',
    'archer-near',
    'archer-next',
    'archer-third',
  ]);
});


test('AI wildlife hunt party reserves ranged support even when non-frontline hunters are closer', () => {
  const candidates = [
    makeUnit('frontline-1', 4, 0, { category: 'melee' }),
    makeUnit('frontline-2', 5, 0, { category: 'cavalry' }),
    makeUnit('near-special-1', 0.2, 0, { category: 'special' }),
    makeUnit('near-special-2', 0.4, 0, { category: 'special' }),
    makeUnit('archer-near', 8, 0, { category: 'ranged' }),
    makeUnit('archer-far', 10, 0, { category: 'ranged' }),
  ];
  const scratch = {
    units: [] as WildlifeHunterAttackUnit[],
    distances: [] as number[],
    frontlineUnits: [] as WildlifeHunterAttackUnit[],
    frontlineDistances: [] as number[],
    rangedUnits: [] as WildlifeHunterAttackUnit[],
    rangedDistances: [] as number[],
  };

  const selected = selectNearestWildlifeHuntParty(candidates, 0, 0, 4, scratch, 2, 1);
  assert.deepEqual(selected.map((unit) => unit.id), [
    'frontline-1',
    'frontline-2',
    'archer-near',
    'near-special-1',
  ]);
  assert.deepEqual(scratch.distances, [4, 5, 8, 0.2]);
  assert.equal(scratch.rangedUnits.length, 1);
});

test('AI wildlife hunt party falls back when ranged support is not available', () => {
  const candidates = [
    makeUnit('melee-near', 1, 0),
    makeUnit('cavalry', 2, 0, { category: 'cavalry' }),
    makeUnit('melee-far', 4, 0),
  ];
  const scratch = {
    units: [] as WildlifeHunterAttackUnit[],
    distances: [] as number[],
    frontlineUnits: [] as WildlifeHunterAttackUnit[],
    frontlineDistances: [] as number[],
    rangedUnits: [] as WildlifeHunterAttackUnit[],
    rangedDistances: [] as number[],
  };
  const selected = selectNearestWildlifeHuntParty(candidates, 0, 0, 3, scratch, 2, 1);
  assert.deepEqual(selected.map((unit) => unit.id), ['melee-near', 'cavalry', 'melee-far']);
  assert.deepEqual(scratch.rangedUnits, []);
});

test('AI wildlife hunt party safely clears output for invalid targets and empty limits', () => {
  const scratch = {
    units: [makeUnit('stale', 0, 0)],
    distances: [0],
    frontlineUnits: [makeUnit('stale-frontline', 0, 0)],
    frontlineDistances: [0],
    rangedUnits: [makeUnit('stale-ranged', 0, 0, { category: 'ranged' })],
    rangedDistances: [0],
  };
  assert.deepEqual(selectNearestWildlifeHuntParty([makeUnit('candidate', 1, 0)], Number.NaN, 0, 4, scratch), []);
  assert.deepEqual(scratch.distances, []);
  assert.deepEqual(selectNearestWildlifeHuntParty([makeUnit('candidate', 1, 0)], 0, 0, 0, scratch), []);
  assert.deepEqual(scratch.units, []);
  assert.deepEqual(scratch.distances, []);
  assert.deepEqual(scratch.frontlineUnits, []);
  assert.deepEqual(scratch.frontlineDistances, []);
  assert.deepEqual(scratch.rangedUnits, []);
  assert.deepEqual(scratch.rangedDistances, []);
});


test('wildlife perception ignores units with non-finite health', () => {
  const malformed = makeUnit('nan-health', 0.5, 0, {
    hp: Number.NaN,
    state: 'attacking',
    range: 8,
  });
  const valid = makeUnit('valid-hunter', 4, 0, {
    state: 'attacking',
    range: 8,
  });
  const scratch = makeScratch();

  collectWildlifeUnitInteractions([malformed, valid], 0, 0, 18, scratch);
  assert.deepEqual(scratch.nearestThreat, { x: 4, z: 0, d: 4 });
  assert.deepEqual(scratch.attackers.map((unit) => unit.id), ['valid-hunter']);

  const invalidOnly = makeUnit('infinite-health', 1, 0, {
    hp: Number.POSITIVE_INFINITY,
    state: 'attacking',
  });
  collectWildlifeUnitInteractions([invalidOnly], 0, 0, 18, scratch);
  assert.equal(scratch.nearestThreat, null);
  assert.deepEqual(scratch.attackers, []);
});

test('AI wildlife party selection rejects finite coordinates whose distance overflows', () => {
  const overflowFrontliner = makeUnit('overflow-frontline', 1.7e308, 1.7e308, {
    category: 'melee',
  });
  const scratch = {
    units: [] as WildlifeHunterAttackUnit[],
    distances: [] as number[],
    frontlineUnits: [] as WildlifeHunterAttackUnit[],
    frontlineDistances: [] as number[],
    rangedUnits: [] as WildlifeHunterAttackUnit[],
    rangedDistances: [] as number[],
  };

  const selected = selectNearestWildlifeHuntParty(
    [overflowFrontliner],
    0,
    0,
    1,
    scratch,
    1,
    0,
  );
  assert.deepEqual(selected, []);
  assert.deepEqual(scratch.frontlineDistances, []);
});


function makeCarcassWorker(
  id: string,
  x: number,
  z: number,
  options: {
    hp?: number;
    state?: string;
    nodeId?: string;
    category?: string;
    isNaval?: boolean;
    garrisoned?: boolean;
    cargo?: number;
    carryCapacity?: number;
    harvestActive?: boolean;
    harvestSlotIndex?: number;
  } = {},
) {
  return {
    id,
    x,
    z,
    hp: options.hp ?? 100,
    state: options.state ?? 'gathering',
    targetResourceNodeId: options.nodeId ?? 'carcass-1',
    garrisonedInBuildingId: options.garrisoned ? 'town-center' : undefined,
    wildlifeCarcassHarvestNodeId: options.harvestActive ? (options.nodeId ?? 'carcass-1') : undefined,
    wildlifeCarcassHarvestActive: options.harvestActive ?? false,
    wildlifeCarcassHarvestSlotIndex: options.harvestSlotIndex,
    carryingResource: options.cargo === undefined ? undefined : { amount: options.cargo },
    unitDef: {
      category: options.category ?? 'worker',
      isNaval: options.isNaval ?? false,
      stats: { carryCapacity: options.carryCapacity ?? 40 },
    },
  };
}

function makeCarcassSelectionScratch() {
  return {
    units: [] as ReturnType<typeof makeCarcassWorker>[],
    distances: [] as number[],
  };
}

test('only explicitly dead huntable animals are classified as carcasses', () => {
  assert.equal(isWildlifeCarcassNode({ subtype: 'hunt', animalAlive: false, animalHp: 0 }), true);
  assert.equal(isWildlifeCarcassNode({ subtype: 'boar', animalHp: 0 }), true);
  assert.equal(isWildlifeCarcassNode({ subtype: 'aurochs', animalAlive: false }), true);
  assert.equal(isWildlifeCarcassNode({ subtype: 'hunt', animalAlive: true, animalHp: 1 }), false);
  assert.equal(isWildlifeCarcassNode({ subtype: 'hunt', animalAlive: undefined, animalHp: 20 }), false);
  assert.equal(isWildlifeCarcassNode({ subtype: 'berry', animalAlive: false, animalHp: 0 }), false);
  assert.equal(isWildlifeCarcassNode(undefined), false);
});

test('wildlife carcass harvest capacities are explicit per animal size', () => {
  assert.equal(getWildlifeCarcassHarvestCapacity('hunt'), 3);
  assert.equal(getWildlifeCarcassHarvestCapacity('boar'), 4);
  assert.equal(getWildlifeCarcassHarvestCapacity('aurochs'), 6);
  assert.equal(getWildlifeCarcassHarvestCapacity('berry'), 0);
  assert.equal(getWildlifeCarcassHarvestCapacity(undefined), 0);
});

test('carcass harvesting never exceeds the per-animal simultaneous villager cap, even with 400 units', () => {
  const capacities = [
    { subtype: 'hunt', cap: 3 },
    { subtype: 'boar', cap: 4 },
    { subtype: 'aurochs', cap: 6 },
  ];
  for (const { subtype, cap } of capacities) {
    const nodeId = `carcass-${subtype}`;
    const candidates = Array.from({ length: 400 }, (_, index) =>
      makeCarcassWorker(`worker-${String(index).padStart(3, '0')}`, index / 10, (index % 7) / 10, { nodeId }),
    );
    const scratch = makeCarcassSelectionScratch();
    const selected = selectNearestWildlifeCarcassHarvesters(
      candidates,
      nodeId,
      0,
      0,
      getWildlifeCarcassHarvestCapacity(subtype),
      scratch,
    );
    assert.equal(selected.length, cap, `${subtype} should admit exactly ${cap} nearby villagers`);
    assert.equal(selected, scratch.units, 'the caller-owned selection buffer should be reused');
    assert.equal(scratch.distances.length, cap);
    assert.ok(selected.length <= cap, 'the maximum simultaneous headcount must never be exceeded');
  }
});

test('carcass harvester selection prefers the closest villagers and resolves ties by stable ID', () => {
  const candidates = [
    makeCarcassWorker('worker-z', -2, 0),
    makeCarcassWorker('worker-far', 9, 0),
    makeCarcassWorker('worker-b', 2, 0),
    makeCarcassWorker('worker-a', -2, 0),
    makeCarcassWorker('worker-near', 0.5, 0),
  ];
  const scratch = makeCarcassSelectionScratch();
  const selected = selectNearestWildlifeCarcassHarvesters(
    candidates,
    'carcass-1',
    0,
    0,
    3,
    scratch,
  );

  assert.deepEqual(selected.map((unit) => unit.id), ['worker-near', 'worker-a', 'worker-b']);
  assert.deepEqual(scratch.distances, [0.5, 2, 2]);
});

test('carcass slot retention prevents near-equal villagers from swapping every refresh', () => {
  const incumbent = makeCarcassWorker('incumbent', 5, 0, { harvestActive: true });
  const newcomer = makeCarcassWorker('newcomer', 4, 0);
  const scratch = makeCarcassSelectionScratch();

  let selected = selectNearestWildlifeCarcassHarvesters(
    [newcomer, incumbent],
    'carcass-1',
    0,
    0,
    1,
    scratch,
  );
  assert.deepEqual(selected.map((unit) => unit.id), ['incumbent']);

  // A genuinely closer newcomer can still take over the slot.
  newcomer.x = 2;
  selected = selectNearestWildlifeCarcassHarvesters(
    [newcomer, incumbent],
    'carcass-1',
    0,
    0,
    1,
    scratch,
  );
  assert.deepEqual(selected.map((unit) => unit.id), ['newcomer']);
});

test('carcass ring-sector indices stay fixed when incumbent selection order changes', () => {
  const incumbentA = makeCarcassWorker('incumbent-a', 1, 0, {
    harvestActive: true,
    harvestSlotIndex: 2,
  });
  const incumbentB = makeCarcassWorker('incumbent-b', 2, 0, {
    harvestActive: true,
    harvestSlotIndex: 0,
  });
  const newcomer = makeCarcassWorker('newcomer', 0.5, 0);
  const selected = [newcomer, incumbentB, incumbentA];
  const usedSlots = Array(6).fill(false);

  assignWildlifeCarcassHarvestSlotIndices(selected, 'carcass-1', 3, usedSlots);

  assert.equal(incumbentA.wildlifeCarcassHarvestSlotIndex, 2);
  assert.equal(incumbentB.wildlifeCarcassHarvestSlotIndex, 0);
  assert.equal(newcomer.wildlifeCarcassHarvestSlotIndex, 1);
  assert.equal(new Set(selected.map((unit) => unit.wildlifeCarcassHarvestSlotIndex)).size, 3);
});

test('duplicate, invalid and out-of-range carcass sectors recover deterministically', () => {
  const first = makeCarcassWorker('first', 1, 0, { harvestActive: true, harvestSlotIndex: 1 });
  const duplicate = makeCarcassWorker('duplicate', 2, 0, { harvestActive: true, harvestSlotIndex: 1 });
  const outOfRange = makeCarcassWorker('out-of-range', 3, 0, { harvestActive: true, harvestSlotIndex: 5 });
  const selected = [first, duplicate, outOfRange];
  const usedSlots = Array(6).fill(false);

  assignWildlifeCarcassHarvestSlotIndices(selected, 'carcass-1', 3, usedSlots);

  assert.deepEqual(
    selected.map((unit) => unit.wildlifeCarcassHarvestSlotIndex),
    [1, 0, 2],
  );
  assert.equal(new Set(selected.map((unit) => unit.wildlifeCarcassHarvestSlotIndex)).size, 3);
});

test('a full-cargo incumbent releases its carcass slot to the next eligible villager', () => {
  const fullIncumbent = makeCarcassWorker('full-incumbent', 0.5, 0, {
    harvestActive: true,
    cargo: 40,
  });
  const waitingWorker = makeCarcassWorker('waiting-worker', 7, 0);
  const selected = selectNearestWildlifeCarcassHarvesters(
    [fullIncumbent, waitingWorker],
    'carcass-1',
    0,
    0,
    1,
    makeCarcassSelectionScratch(),
  );

  assert.deepEqual(selected.map((unit) => unit.id), ['waiting-worker']);
});

test('separate carcasses maintain independent work caps without sharing villagers', () => {
  const workers = [
    ...Array.from({ length: 24 }, (_, index) =>
      makeCarcassWorker('deer-worker-' + index, index / 4, 0, { nodeId: 'deer-carcass' }),
    ),
    ...Array.from({ length: 24 }, (_, index) =>
      makeCarcassWorker('boar-worker-' + index, index / 4, 0, { nodeId: 'boar-carcass' }),
    ),
  ];
  const deer = selectNearestWildlifeCarcassHarvesters(
    workers.filter((worker) => worker.targetResourceNodeId === 'deer-carcass'),
    'deer-carcass',
    0,
    0,
    getWildlifeCarcassHarvestCapacity('hunt'),
    makeCarcassSelectionScratch(),
  );
  const boar = selectNearestWildlifeCarcassHarvesters(
    workers.filter((worker) => worker.targetResourceNodeId === 'boar-carcass'),
    'boar-carcass',
    0,
    0,
    getWildlifeCarcassHarvestCapacity('boar'),
    makeCarcassSelectionScratch(),
  );

  assert.equal(deer.length, 3);
  assert.equal(boar.length, 4);
  assert.equal(new Set([...deer, ...boar].map((worker) => worker.id)).size, 7);
});

test('carcass harvester selection excludes invalid, busy, naval, garrisoned and full-cargo units', () => {
  const candidates = [
    makeCarcassWorker('valid', 1, 0),
    makeCarcassWorker('dead', 0.1, 0, { hp: 0 }),
    makeCarcassWorker('nan-health', 0.2, 0, { hp: Number.NaN }),
    makeCarcassWorker('wrong-state', 0.3, 0, { state: 'moving' }),
    makeCarcassWorker('wrong-node', 0.4, 0, { nodeId: 'other-carcass' }),
    makeCarcassWorker('military', 0.5, 0, { category: 'melee' }),
    makeCarcassWorker('naval', 0.6, 0, { isNaval: true }),
    makeCarcassWorker('garrisoned', 0.7, 0, { garrisoned: true }),
    makeCarcassWorker('full-cargo', 0.8, 0, { cargo: 40 }),
    makeCarcassWorker('invalid-cargo', 0.9, 0, { cargo: Number.NaN }),
    makeCarcassWorker('invalid-coordinate', Number.NaN, 0),
  ];
  const selected = selectNearestWildlifeCarcassHarvesters(
    candidates,
    'carcass-1',
    0,
    0,
    10,
    makeCarcassSelectionScratch(),
  );
  assert.deepEqual(selected.map((unit) => unit.id), ['valid']);
});

test('carcass waiting points are finite, stable and outside the work ring', () => {
  const first = { x: 0, z: 0 };
  const second = { x: 0, z: 0 };
  writeWildlifeCarcassWaitingPoint(first, 4, -3, 1.5, Math.PI / 3);
  writeWildlifeCarcassWaitingPoint(second, 4, -3, 1.5, Math.PI / 3);

  assert.deepEqual(first, second);
  assert.ok(Math.hypot(first.x - 4, first.z + 3) > 6.7);
  const fallback = { x: 10, z: 10 };
  writeWildlifeCarcassWaitingPoint(fallback, Number.NaN, Number.POSITIVE_INFINITY, Number.NaN, Number.NaN);
  assert.ok(Number.isFinite(fallback.x));
  assert.ok(Number.isFinite(fallback.z));
});
