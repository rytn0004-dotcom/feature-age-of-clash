import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceMovementStallDuration,
  MAX_TRACKED_MOVEMENT_STALL_SECONDS,
  MOVEMENT_STALL_PROGRESS_DISTANCE,
  MOVEMENT_STALL_RECOVERY_SECONDS,
  shouldRecoverStalledPath,
} from './movementDiagnostics';

test('movement diagnostics: low displacement accumulates and real progress resets the timer', () => {
  assert.equal(advanceMovementStallDuration(undefined, 0.1, 0.45), 0.45);
  assert.equal(advanceMovementStallDuration(0.9, 0.05, 0.45), 1.35);
  assert.equal(advanceMovementStallDuration(1.35, MOVEMENT_STALL_PROGRESS_DISTANCE, 0.45), 0);
  assert.equal(advanceMovementStallDuration(1.35, 0.8, 0.45), 0);
});

test('movement diagnostics: recovery requires sustained stall and expired cooldowns', () => {
  assert.equal(shouldRecoverStalledPath(MOVEMENT_STALL_RECOVERY_SECONDS - 0.01, 0, 0), false);
  assert.equal(shouldRecoverStalledPath(MOVEMENT_STALL_RECOVERY_SECONDS, 0, 0), true);
  assert.equal(shouldRecoverStalledPath(4, 0.1, 0), false);
  assert.equal(shouldRecoverStalledPath(4, 0, 0.1), false);
  assert.equal(shouldRecoverStalledPath(4, 0, 0), true);
});

test('movement diagnostics: durations are capped and invalid intervals never trigger recovery', () => {
  assert.equal(
    advanceMovementStallDuration(MAX_TRACKED_MOVEMENT_STALL_SECONDS - 1, 0, 5),
    MAX_TRACKED_MOVEMENT_STALL_SECONDS,
  );
  assert.equal(advanceMovementStallDuration(1, 0, Number.NaN), 0);
  assert.equal(advanceMovementStallDuration(1, Number.NaN, 0.45), 0);
  assert.equal(shouldRecoverStalledPath(Number.NaN, 0, 0), false);
});
