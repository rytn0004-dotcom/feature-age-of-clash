import test from 'node:test';
import assert from 'node:assert/strict';
import { getCachedUnitBadge, getUnitRoleBadgeIcon } from './unitBadgeCache';

test('unit badge lookup is cached after the first successful recursive search', () => {
  const badge = { visible: true };
  const cache: { unitBadge?: typeof badge | null } = {};
  let lookups = 0;
  const lookup = () => {
    lookups++;
    return badge;
  };

  assert.equal(getCachedUnitBadge(cache, lookup), badge);
  assert.equal(getCachedUnitBadge(cache, lookup), badge);
  assert.equal(getCachedUnitBadge(cache, lookup), badge);
  assert.equal(lookups, 1);
});

test('a missing badge can still be discovered when it is attached later', () => {
  const badge = { visible: true };
  const cache: { unitBadge?: typeof badge | null } = {};
  let available = false;
  let lookups = 0;
  const lookup = () => {
    lookups++;
    return available ? badge : null;
  };

  assert.equal(getCachedUnitBadge(cache, lookup), null);
  available = true;
  assert.equal(getCachedUnitBadge(cache, lookup), badge);
  assert.equal(getCachedUnitBadge(cache, lookup), badge);
  assert.equal(lookups, 2);
});

test('unit role icons preserve special siege golem and default behavior', () => {
  assert.equal(getUnitRoleBadgeIcon('villager', false), '⛏️');
  assert.equal(getUnitRoleBadgeIcon('knight', false), '🐎');
  assert.equal(getUnitRoleBadgeIcon('golem', false), '🪵');
  assert.equal(getUnitRoleBadgeIcon('golem', true), '🪨');
  assert.equal(getUnitRoleBadgeIcon('unknown-model', false), '⚔️');
});
