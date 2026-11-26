import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceUnitAttackWindup,
  getUnitAttackTiming,
} from './unitAttackTiming';

test('unit attack timing gives heavier weapons a more readable windup and recovery', () => {
  const melee = getUnitAttackTiming('melee');
  const ranged = getUnitAttackTiming('ranged');
  const cavalry = getUnitAttackTiming('cavalry');
  const siege = getUnitAttackTiming('siege');

  assert.ok(melee.windupSeconds > ranged.windupSeconds);
  assert.ok(cavalry.windupSeconds > melee.windupSeconds);
  assert.ok(siege.windupSeconds > cavalry.windupSeconds);
  assert.ok(siege.recoverySeconds > ranged.recoverySeconds);
});

test('attack windup cannot release before its full telegraph duration', () => {
  const first = advanceUnitAttackWindup(0.22, 0.1, true);
  assert.equal(first.cancelled, false);
  assert.equal(first.ready, false);
  assert.ok(Math.abs(first.remainingSeconds - 0.12) < 1e-9);

  const second = advanceUnitAttackWindup(first.remainingSeconds, 0.1, true);
  assert.equal(second.ready, false);
  assert.ok(Math.abs(second.remainingSeconds - 0.02) < 1e-9);

  const released = advanceUnitAttackWindup(second.remainingSeconds, 0.03, true);
  assert.equal(released.ready, true);
  assert.equal(released.remainingSeconds, 0);
});

test('movement, retargeting, or leaving range cancels the pending attack without a release', () => {
  const cancelled = advanceUnitAttackWindup(0.01, 0.05, false);
  assert.deepEqual(cancelled, {
    remainingSeconds: 0,
    ready: false,
    cancelled: true,
  });
});

test('invalid frame deltas cannot skip the windup', () => {
  const progress = advanceUnitAttackWindup(0.18, Number.NaN, true);
  assert.equal(progress.remainingSeconds, 0.18);
  assert.equal(progress.ready, false);
  assert.equal(progress.cancelled, false);
});
