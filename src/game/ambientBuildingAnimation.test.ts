import test from 'node:test';
import assert from 'node:assert/strict';
import { hasAmbientBuildingAnimation } from './ambientBuildingAnimation';

test('ambient building animation: excludes missing and empty animation metadata', () => {
  assert.equal(hasAmbientBuildingAnimation(undefined), false);
  assert.equal(hasAmbientBuildingAnimation({}), false);
  assert.equal(hasAmbientBuildingAnimation({ animFlags: [] }), false);
  assert.equal(hasAmbientBuildingAnimation({ animCrystals: [] }), false);
});

test('ambient building animation: includes buildings with animated flags', () => {
  assert.equal(hasAmbientBuildingAnimation({ animFlags: [{}] }), true);
});

test('ambient building animation: includes buildings with animated crystals', () => {
  assert.equal(hasAmbientBuildingAnimation({ animCrystals: [{ obj: {}, baseY: 1 }] }), true);
});

test('ambient building animation: includes buildings with both animated part types', () => {
  assert.equal(hasAmbientBuildingAnimation({ animFlags: [{}], animCrystals: [{}] }), true);
});
