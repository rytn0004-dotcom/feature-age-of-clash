import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyConstructionWorkToHealth,
  calculateConstructionCancellationRefund,
  DELETE_HOLD_DURATION_MS,
  getDeleteHoldProgress,
} from './entityActions';
import type { Resources } from '../types/game';

const cost: Resources = { food: 40, wood: 120, gold: 30, stone: 80 };

test('construction cancellation refunds only the un-damaged completed HP ratio', () => {
  assert.deepEqual(
    calculateConstructionCancellationRefund(cost, 60, 100),
    { food: 24, wood: 72, gold: 18, stone: 48 },
  );
});

test('construction cancellation accounts for a foundation damaged before cancellation', () => {
  // A new foundation starts at 10% HP; taking half of that HP leaves 5% refund.
  assert.deepEqual(
    calculateConstructionCancellationRefund(cost, 5, 100),
    { food: 2, wood: 6, gold: 1, stone: 4 },
  );
});

test('construction cancellation refund is clamped and rejects invalid health values', () => {
  assert.deepEqual(
    calculateConstructionCancellationRefund(cost, 130, 100),
    cost,
  );
  assert.deepEqual(
    calculateConstructionCancellationRefund(cost, -10, 100),
    { food: 0, wood: 0, gold: 0, stone: 0 },
  );
  assert.deepEqual(
    calculateConstructionCancellationRefund(cost, 50, 0),
    { food: 0, wood: 0, gold: 0, stone: 0 },
  );
  assert.deepEqual(
    calculateConstructionCancellationRefund(cost, Number.NaN, 100),
    { food: 0, wood: 0, gold: 0, stone: 0 },
  );
});

test('delete hold progress reaches completion only after three seconds', () => {
  assert.equal(DELETE_HOLD_DURATION_MS, 3000);
  assert.equal(getDeleteHoldProgress(1000, 999), 0);
  assert.equal(getDeleteHoldProgress(1000, 2500), 0.5);
  assert.equal(getDeleteHoldProgress(1000, 4000), 1);
  assert.equal(getDeleteHoldProgress(1000, 5000), 1);
  assert.equal(getDeleteHoldProgress(Number.NaN, 5000), 0);
});

test('construction work adds new health without restoring damage already taken', () => {
  assert.equal(applyConstructionWorkToHealth(30, 100, 0.2), 50);
  assert.equal(applyConstructionWorkToHealth(80, 100, 0.5), 100);
  assert.equal(applyConstructionWorkToHealth(20, 100, -0.4), 20);
  assert.equal(applyConstructionWorkToHealth(20, 0, 0.4), 0);
});
