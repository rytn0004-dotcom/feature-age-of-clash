import test from 'node:test';
import assert from 'node:assert/strict';
import { isFishAnimationSubtype } from './fishAnimationRegistry';

test('fish animation registry: includes both shoreline and deep-water fish', () => {
  assert.equal(isFishAnimationSubtype('shore_fish'), true);
  assert.equal(isFishAnimationSubtype('deep_fish'), true);
});

test('fish animation registry: excludes non-fish resources and missing subtypes', () => {
  for (const subtype of [undefined, 'farm', 'berry', 'hunt', 'boar', 'wood', 'gold', 'stone']) {
    assert.equal(isFishAnimationSubtype(subtype), false);
  }
});
