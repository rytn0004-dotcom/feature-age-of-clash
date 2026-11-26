import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyConstructionWorkToHealth,
  calculateConstructionCancellationRefund,
  CONSTRUCTION_CANCELLATION_UNDO_WINDOW_MS,
  DELETE_HOLD_DURATION_MS,
  getConstructionCancellationUndoRemainingMs,
  getDeleteHoldProgress,
} from './entityActions';
import type { Resources } from '../types/game';

const cost: Resources = { food: 40, wood: 120, gold: 30, stone: 80 };

test('cancelling a pristine foundation refunds the full cost even at 10% progress', () => {
  assert.deepEqual(calculateConstructionCancellationRefund(cost, 10, 100, 0.1), cost);
});

test('cancelling an undamaged partially-built structure still refunds the full cost', () => {
  assert.deepEqual(calculateConstructionCancellationRefund(cost, 40, 100, 0.4), cost);
});

test('construction cancellation withholds only the percentage of HP damage', () => {
  assert.deepEqual(
    calculateConstructionCancellationRefund(cost, 30, 100, 0.4),
    { food: 30, wood: 90, gold: 22, stone: 60 },
  );
  assert.deepEqual(
    calculateConstructionCancellationRefund(cost, 45, 100, 0.9),
    { food: 20, wood: 60, gold: 15, stone: 40 },
  );
});

test('construction cancellation refund clamps invalid health and progress values', () => {
  assert.deepEqual(calculateConstructionCancellationRefund(cost, 130, 100, 0.4), cost);
  assert.deepEqual(calculateConstructionCancellationRefund(cost, -10, 100, 0.4), { food: 0, wood: 0, gold: 0, stone: 0 });
  assert.deepEqual(calculateConstructionCancellationRefund(cost, 50, 0, 0.5), { food: 0, wood: 0, gold: 0, stone: 0 });
  assert.deepEqual(calculateConstructionCancellationRefund(cost, Number.NaN, 100, 0.5), { food: 0, wood: 0, gold: 0, stone: 0 });
  assert.deepEqual(calculateConstructionCancellationRefund(cost, 0, 100, Number.NaN), { food: 0, wood: 0, gold: 0, stone: 0 });
});

test('tiny HP rounding differences do not penalize a pristine foundation', () => {
  assert.deepEqual(calculateConstructionCancellationRefund(cost, 39.6, 100, 0.4), cost);
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


test('construction cancellation undo window uses a bounded real-time deadline', () => {
  assert.equal(CONSTRUCTION_CANCELLATION_UNDO_WINDOW_MS, 5000);
  assert.equal(getConstructionCancellationUndoRemainingMs(6000, 1000), 5000);
  assert.equal(getConstructionCancellationUndoRemainingMs(6000, 4250), 1750);
  assert.equal(getConstructionCancellationUndoRemainingMs(6000, 7000), 0);
  assert.equal(getConstructionCancellationUndoRemainingMs(Number.NaN, 1000), 0);
  assert.equal(getConstructionCancellationUndoRemainingMs(6000, Number.NaN), 0);
});
