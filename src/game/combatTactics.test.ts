import test from 'node:test';
import assert from 'node:assert/strict';
import { getDirectionalAttackModifier } from './combatTactics';

const base = {
  attackerX: 0,
  attackerZ: 2,
  defenderX: 0,
  defenderZ: 0,
  defenderFacingX: 0,
  defenderFacingZ: 1,
  attackerCategory: 'melee' as const,
  defenderCategory: 'melee' as const,
};

test('a frontal melee attack keeps normal damage', () => {
  assert.deepEqual(getDirectionalAttackModifier(base), {
    zone: 'front',
    multiplier: 1,
  });
});

test('a side attack gives infantry a modest flanking bonus', () => {
  const result = getDirectionalAttackModifier({
    ...base,
    attackerX: 2,
    attackerZ: 0,
  });
  assert.equal(result.zone, 'flank');
  assert.equal(result.multiplier, 1.12);
});

test('a rear attack rewards melee infantry more than a side attack', () => {
  const result = getDirectionalAttackModifier({
    ...base,
    attackerZ: -2,
  });
  assert.equal(result.zone, 'rear');
  assert.equal(result.multiplier, 1.24);
});

test('cavalry has a stronger flank and rear attack than infantry', () => {
  const flank = getDirectionalAttackModifier({
    ...base,
    attackerX: 2,
    attackerZ: 0,
    attackerCategory: 'cavalry',
  });
  const rear = getDirectionalAttackModifier({
    ...base,
    attackerZ: -2,
    attackerCategory: 'cavalry',
  });
  assert.equal(flank.multiplier, 1.18);
  assert.equal(rear.multiplier, 1.32);
});

test('rear attacks are especially effective against ranged and siege units', () => {
  const result = getDirectionalAttackModifier({
    ...base,
    attackerZ: -2,
    attackerCategory: 'cavalry',
    defenderCategory: 'ranged',
  });
  assert.equal(result.zone, 'rear');
  assert.equal(result.multiplier, 1.36);
});

test('ranged, siege and special attackers do not gain melee positional bonuses', () => {
  for (const category of ['ranged', 'siege', 'special'] as const) {
    const result = getDirectionalAttackModifier({
      ...base,
      attackerZ: -2,
      attackerCategory: category,
    });
    assert.equal(result.zone, 'front');
    assert.equal(result.multiplier, 1);
  }
});

test('an invalid or overlapping attack position safely falls back to normal damage', () => {
  assert.equal(
    getDirectionalAttackModifier({ ...base, attackerX: Number.NaN }).multiplier,
    1,
  );
  assert.equal(
    getDirectionalAttackModifier({ ...base, attackerX: 0, attackerZ: 0 }).multiplier,
    1,
  );
  assert.equal(
    getDirectionalAttackModifier({ ...base, defenderFacingZ: 0 }).multiplier,
    1,
  );
});
