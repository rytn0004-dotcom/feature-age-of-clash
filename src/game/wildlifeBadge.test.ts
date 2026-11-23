import test from 'node:test';
import assert from 'node:assert/strict';
import { getWildlifeBadgePresentation } from './wildlifeBadge';

test('wildlife badge: live boar shows its name and current health instead of crop reserves', () => {
  const badge = getWildlifeBadgePresentation({
    subtype: 'boar',
    animalAlive: true,
    animalHp: 145,
    animalMaxHp: 200,
    amount: 900,
    maxAmount: 900,
  });

  assert.ok(badge);
  assert.equal(badge.title, '野生野豬');
  assert.equal(badge.icon, '🐗');
  assert.equal(badge.valueText, '145/200 HP');
  assert.equal(badge.ratio, 0.725);
  assert.match(badge.actionText, /反擊/);
});

test('wildlife badge: health bucket changes as damage is taken', () => {
  const before = getWildlifeBadgePresentation({
    subtype: 'boar', animalAlive: true, animalHp: 200, animalMaxHp: 200, amount: 900, maxAmount: 900,
  });
  const after = getWildlifeBadgePresentation({
    subtype: 'boar', animalAlive: true, animalHp: 180, animalMaxHp: 200, amount: 900, maxAmount: 900,
  });

  assert.ok(before);
  assert.ok(after);
  assert.notEqual(before.signature, after.signature);
  assert.equal(after.valueText, '180/200 HP');
});

test('wildlife badge: carcass switches to meat reserve and a corpse label', () => {
  const badge = getWildlifeBadgePresentation({
    subtype: 'boar',
    animalAlive: false,
    animalHp: 0,
    animalMaxHp: 200,
    amount: 420,
    maxAmount: 900,
  });

  assert.ok(badge);
  assert.equal(badge.title, '野豬屍體');
  assert.equal(badge.valueText, '420/900');
  assert.ok(Math.abs(badge.ratio - 420 / 900) < 1e-12);
});

test('wildlife badge: deer presentation remains species-specific', () => {
  const badge = getWildlifeBadgePresentation({
    subtype: 'hunt', animalAlive: true, animalHp: 16, animalMaxHp: 32, amount: 100, maxAmount: 100,
  });

  assert.ok(badge);
  assert.equal(badge.title, '野生山羌');
  assert.equal(badge.valueText, '16/32 HP');
});

test('wildlife badge: ignores ordinary resource nodes', () => {
  assert.equal(getWildlifeBadgePresentation({
    subtype: 'farm', animalAlive: true, animalHp: 10, animalMaxHp: 10, amount: 100, maxAmount: 100,
  }), null);
});
