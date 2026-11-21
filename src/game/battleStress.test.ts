import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BATTLE_STRESS_UNIT_COUNTS,
  createBattleStressPlan,
} from './battleStress';

test('battle stress: supports only the documented 100 / 200 / 400 unit tiers', () => {
  assert.deepEqual(BATTLE_STRESS_UNIT_COUNTS, [100, 200, 400]);
  for (const count of BATTLE_STRESS_UNIT_COUNTS) {
    const plan = createBattleStressPlan(count, 20261122);
    assert.equal(plan.unitCount, count);
    assert.equal(plan.starterUnitCount, 16);
    assert.equal(plan.units.length + plan.starterUnitCount, count);
  }
  assert.throws(() => createBattleStressPlan(50), RangeError);
  assert.throws(() => createBattleStressPlan(800), RangeError);
});

test('battle stress: fixed seed produces an identical reproducible four-faction plan', () => {
  const first = createBattleStressPlan(200, 123456);
  const second = createBattleStressPlan(200, 123456);
  assert.deepEqual(second, first);
  assert.equal(first.seed, 123456);
  assert.equal(new Set(first.units.map((unit) => unit.id)).size, first.units.length);
});

test('battle stress: all three civilizations and four AI personalities are represented', () => {
  const plan = createBattleStressPlan(100, 7);
  assert.equal(plan.participants.length, 4);
  assert.ok(plan.participants.every((participant) => participant.controller === 'ai'));

  const civilizations = new Set(plan.participants.map((participant) => participant.civilization));
  const personalities = new Set(plan.participants.map((participant) => participant.aiPersonality));
  assert.deepEqual([...civilizations].sort(), ['anime', 'fantasy', 'medieval']);
  assert.deepEqual([...personalities].sort(), ['defensive', 'easy', 'hard', 'standard']);
  assert.equal(new Set(plan.participants.map((participant) => participant.team)).size, 4);
});

test('battle stress: generated armies contain every combat role and finite inward attack goals', () => {
  for (const count of BATTLE_STRESS_UNIT_COUNTS) {
    const plan = createBattleStressPlan(count, 2026);
    const roles = new Set(plan.units.map((unit) => unit.role));
    assert.deepEqual(
      [...roles].sort(),
      ['cavalry', 'melee', 'ranged', 'siege', 'special'].sort(),
    );

    for (const unit of plan.units) {
      assert.ok(Number.isFinite(unit.x) && Number.isFinite(unit.z));
      assert.ok(Number.isFinite(unit.targetX) && Number.isFinite(unit.targetZ));
      assert.ok(plan.participants.some((participant) => participant.id === unit.factionId));
      assert.ok(unit.id.startsWith('stress-2026-'));
      assert.ok(Math.hypot(unit.targetX, unit.targetZ) < Math.hypot(unit.x, unit.z));
    }
  }
});

test('battle stress: seed normalization is stable and invalid seeds are rejected', () => {
  assert.deepEqual(createBattleStressPlan(100, 0), createBattleStressPlan(100, 1));
  assert.deepEqual(createBattleStressPlan(100, -42), createBattleStressPlan(100, 42));
  assert.throws(() => createBattleStressPlan(100, Number.NaN), RangeError);
  assert.throws(() => createBattleStressPlan(100, Number.POSITIVE_INFINITY), RangeError);
});
