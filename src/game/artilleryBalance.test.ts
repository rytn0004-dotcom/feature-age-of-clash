import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOMBARD_CANNON_SPLASH_RADIUS,
  getBombardCannonSplashDamage,
} from './artilleryBalance';

test('bombard cannon splash is dangerous at the impact point and falls off predictably', () => {
  assert.equal(getBombardCannonSplashDamage(0), 24);
  assert.equal(getBombardCannonSplashDamage(BOMBARD_CANNON_SPLASH_RADIUS), 8);
  assert.ok(
    getBombardCannonSplashDamage(BOMBARD_CANNON_SPLASH_RADIUS * 0.5) > 8,
  );
  assert.equal(getBombardCannonSplashDamage(BOMBARD_CANNON_SPLASH_RADIUS + 0.01), 0);
});

test('bombard cannon splash rejects invalid and negative distances', () => {
  assert.equal(getBombardCannonSplashDamage(Number.NaN), 0);
  assert.equal(getBombardCannonSplashDamage(Number.POSITIVE_INFINITY), 0);
  assert.equal(getBombardCannonSplashDamage(-0.1), 0);
});
