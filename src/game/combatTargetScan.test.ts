import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COMBAT_TARGET_SCAN_INTERVAL_SECONDS,
  consumeCombatTargetScanCooldown,
  type CombatTargetScanState,
} from './combatTargetScan';

test('nearby target scans run immediately or after a stable initial phase', () => {
  const unit: CombatTargetScanState = { id: 'unit_alpha' };
  const first = consumeCombatTargetScanCooldown(unit, 0.01);

  assert.equal(typeof first, 'boolean');
  assert.ok(
    unit.combatTargetScanCooldown! >= 0 &&
      unit.combatTargetScanCooldown! <= COMBAT_TARGET_SCAN_INTERVAL_SECONDS,
  );
  const repeated: CombatTargetScanState = { id: 'unit_alpha' };
  assert.equal(consumeCombatTargetScanCooldown(repeated, 0.01), first);
  assert.equal(repeated.combatTargetScanCooldown, unit.combatTargetScanCooldown);
});

test('nearby target scans respect a stable per-unit cadence', () => {
  const unit: CombatTargetScanState = { id: 'unit_cadence' };
  assert.equal(consumeCombatTargetScanCooldown(unit, 1), true);

  const interval = unit.combatTargetScanCooldown!;
  assert.ok(interval >= 0.12 && interval <= COMBAT_TARGET_SCAN_INTERVAL_SECONDS);
  assert.equal(consumeCombatTargetScanCooldown(unit, 0.05), false);
  assert.ok(Math.abs(unit.combatTargetScanCooldown! - (interval - 0.05)) < 1e-9);
  assert.equal(consumeCombatTargetScanCooldown(unit, interval - 0.05), true);
  assert.equal(unit.combatTargetScanCooldown, interval);
});

test('initial phases and recurring intervals are deterministic for each unit ID', () => {
  const ids = ['unit_a', 'unit_b', 'unit_c', 'unit_d', 'unit_e', 'unit_f'];
  const createSchedule = () => ids.map((id) => {
    const unit: CombatTargetScanState = { id };
    consumeCombatTargetScanCooldown(unit, 0);
    const initial = unit.combatTargetScanCooldown!;
    consumeCombatTargetScanCooldown(unit, 1);
    return [initial, unit.combatTargetScanCooldown!];
  });

  assert.deepEqual(createSchedule(), createSchedule());
  const schedules = createSchedule();
  assert.ok(schedules.every(([phase, interval]) =>
    phase >= 0 &&
    phase <= COMBAT_TARGET_SCAN_INTERVAL_SECONDS &&
    interval >= 0.12 &&
    interval <= COMBAT_TARGET_SCAN_INTERVAL_SECONDS
  ));
});

test('invalid delta times cannot poison the scan timer', () => {
  const unit: CombatTargetScanState = {
    id: 'unit_nan',
    combatTargetScanCooldown: 0.05,
  };

  assert.equal(consumeCombatTargetScanCooldown(unit, Number.NaN), false);
  assert.equal(unit.combatTargetScanCooldown, 0.05);
  assert.equal(consumeCombatTargetScanCooldown(unit, -1), false);
  assert.equal(unit.combatTargetScanCooldown, 0.05);
});


test('nearby target scan caches the deterministic interval for recurring updates', () => {
  const unit: CombatTargetScanState = { id: 'unit_cached_schedule' };

  assert.equal(consumeCombatTargetScanCooldown(unit, 1), true);
  const cachedInterval = unit.combatTargetScanIntervalSeconds;
  assert.ok(Number.isFinite(cachedInterval));
  assert.equal(unit.combatTargetScanCooldown, cachedInterval);

  assert.equal(consumeCombatTargetScanCooldown(unit, cachedInterval!), true);
  assert.equal(unit.combatTargetScanIntervalSeconds, cachedInterval);
  assert.equal(unit.combatTargetScanCooldown, cachedInterval);
});
