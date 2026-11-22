import test from 'node:test';
import assert from 'node:assert/strict';
import { getAgeResourceProgress } from './ageProgress';

test('reports the bottleneck resource as the overall age-up readiness', () => {
  const result = getAgeResourceProgress(
    { food: 300, gold: 50 },
    { food: 400, gold: 200 }
  );

  assert.equal(result.foodRatio, 0.75);
  assert.equal(result.goldRatio, 0.25);
  assert.equal(result.overallRatio, 0.25);
  assert.equal(result.foodMissing, 100);
  assert.equal(result.goldMissing, 150);
  assert.equal(result.ready, false);
});

test('marks resources ready at the exact requirement and clamps excess stock', () => {
  const exact = getAgeResourceProgress(
    { food: 400, gold: 200 },
    { food: 400, gold: 200 }
  );
  const excess = getAgeResourceProgress(
    { food: 900, gold: 700 },
    { food: 400, gold: 200 }
  );

  assert.equal(exact.ready, true);
  assert.equal(exact.overallRatio, 1);
  assert.equal(excess.foodRatio, 1);
  assert.equal(excess.goldRatio, 1);
  assert.equal(excess.foodMissing, 0);
  assert.equal(excess.goldMissing, 0);
});

test('handles zero requirements and invalid stock safely', () => {
  const result = getAgeResourceProgress(
    { food: Number.NaN, gold: Number.POSITIVE_INFINITY },
    { food: 0, gold: 100 }
  );

  assert.equal(result.foodRatio, 1);
  assert.equal(result.goldRatio, 0);
  assert.equal(result.overallRatio, 0);
  assert.equal(result.foodMissing, 0);
  assert.equal(result.goldMissing, 100);
  assert.equal(result.ready, false);
});
