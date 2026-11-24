import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applySuppressionImpact,
  decaySuppression,
  getSuppressionCombatModifiers,
  getSuppressionImpact,
} from './combatSuppression';

test('repeated ranged hits build suppression without exceeding its cap', () => {
  const first = applySuppressionImpact(0, getSuppressionImpact('arrow', 'ranged'));
  const second = applySuppressionImpact(first, getSuppressionImpact('arrow', 'ranged'));
  assert.equal(first, 9);
  assert.equal(second, 18);
  assert.equal(applySuppressionImpact(96, 20), 100);
});

test('siege and magical fire create stronger suppression than ordinary arrows', () => {
  assert.ok(getSuppressionImpact('arrow', 'siege') > getSuppressionImpact('arrow', 'ranged'));
  assert.ok(getSuppressionImpact('fireball', 'ranged') > getSuppressionImpact('arrow', 'ranged'));
  assert.ok(getSuppressionImpact('ki_blast', 'special') > getSuppressionImpact('arrow', 'ranged'));
});

test('ordinary melee attacks do not generate suppressive fire', () => {
  assert.equal(getSuppressionImpact('slash', 'melee'), 0);
  assert.equal(getSuppressionImpact('arrow', 'worker'), 0);
});

test('leadership resistance reduces incoming suppression', () => {
  const exposed = applySuppressionImpact(10, 20);
  const protectedValue = applySuppressionImpact(10, 20, 0.25);
  assert.ok(protectedValue < exposed);
});

test('suppression decays after incoming fire stops', () => {
  assert.equal(decaySuppression(50, 2), 33);
  assert.equal(decaySuppression(5, 2), 0);
  assert.equal(decaySuppression(Number.NaN, 2), 0);
});

test('pressure thresholds reduce movement and attack tempo progressively', () => {
  assert.equal(getSuppressionCombatModifiers(0).state, 'clear');
  assert.equal(getSuppressionCombatModifiers(30).state, 'pressured');
  assert.equal(getSuppressionCombatModifiers(55).state, 'suppressed');
  assert.equal(getSuppressionCombatModifiers(90).state, 'pinned');
  assert.ok(getSuppressionCombatModifiers(90).attackRateMultiplier < getSuppressionCombatModifiers(55).attackRateMultiplier);
});

test('invalid inputs safely return neutral suppression', () => {
  assert.equal(applySuppressionImpact(Number.NaN, Number.NaN), 0);
  assert.deepEqual(getSuppressionCombatModifiers(Number.NaN), {
    state: 'clear',
    movementSpeedMultiplier: 1,
    attackRateMultiplier: 1,
  });
});
