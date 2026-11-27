import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeWildlifeSimulationState, type WildlifeSimulationState } from './wildlifeInitialization';

test('wildlife initialization: preserves spawned HP/alive state while initializing motion', () => {
  const node: WildlifeSimulationState = {
    animalAlive: true,
    animalHp: 200,
    animalMaxHp: 200,
  };

  initializeWildlifeSimulationState(node, 3, 32);

  assert.equal(node.animalAlive, true);
  assert.equal(node.animalHp, 200);
  assert.equal(node.animalMaxHp, 200);
  assert.equal(node.animalVx, 0);
  assert.equal(node.animalVz, 0);
  assert.ok(Math.abs((node.animalYaw ?? 0) - 5.7) < 1e-12);
});

test('wildlife initialization: preserves existing motion and health fields', () => {
  const node: WildlifeSimulationState = {
    animalAlive: true,
    animalHp: 12,
    animalMaxHp: 32,
    animalVx: 1.25,
    animalVz: -0.5,
    animalYaw: 0.8,
  };

  initializeWildlifeSimulationState(node, 10, 200);

  assert.equal(node.animalAlive, true);
  assert.equal(node.animalHp, 12);
  assert.equal(node.animalMaxHp, 32);
  assert.equal(node.animalVx, 1.25);
  assert.equal(node.animalVz, -0.5);
  assert.equal(node.animalYaw, 0.8);
});

test('wildlife initialization: does not revive a previously dead animal', () => {
  const node: WildlifeSimulationState = {
    animalAlive: false,
    animalHp: 0,
  };

  initializeWildlifeSimulationState(node, 1, 200);

  assert.equal(node.animalAlive, false);
  assert.equal(node.animalHp, 0);
  assert.equal(node.animalMaxHp, 200);
  assert.equal(node.animalVx, 0);
  assert.equal(node.animalVz, 0);
});

test('wildlife initialization: restores missing HP from a living legacy state', () => {
  const node: WildlifeSimulationState = {
    animalAlive: true,
  };

  initializeWildlifeSimulationState(node, 0, 32);

  assert.equal(node.animalAlive, true);
  assert.equal(node.animalHp, 32);
  assert.equal(node.animalMaxHp, 32);
});

test('wildlife initialization: derives alive state from existing HP when the flag is missing', () => {
  const liveNode: WildlifeSimulationState = { animalHp: 6, animalMaxHp: 32 };
  const deadNode: WildlifeSimulationState = { animalHp: 0, animalMaxHp: 32 };

  initializeWildlifeSimulationState(liveNode, 1, 32);
  initializeWildlifeSimulationState(deadNode, 2, 32);

  assert.equal(liveNode.animalAlive, true);
  assert.equal(deadNode.animalAlive, false);
});


test('wildlife initialization: sanitizes malformed headings and clamps extreme legacy velocity', () => {
  const malformed: WildlifeSimulationState = {
    animalAlive: true,
    animalHp: 50,
    animalMaxHp: 50,
    animalVx: Number.POSITIVE_INFINITY,
    animalVz: Number.NaN,
    animalYaw: Number.NEGATIVE_INFINITY,
  };
  initializeWildlifeSimulationState(malformed, 2, 50);

  assert.equal(malformed.animalVx, 0);
  assert.equal(malformed.animalVz, 0);
  assert.ok(Math.abs((malformed.animalYaw ?? 0) - 3.8) < 1e-12);

  const excessive: WildlifeSimulationState = {
    animalVx: 120,
    animalVz: -120,
    animalYaw: -0.5,
  };
  initializeWildlifeSimulationState(excessive, 0, 32);

  assert.equal(excessive.animalVx, 8);
  assert.equal(excessive.animalVz, -8);
  assert.ok((excessive.animalYaw ?? 0) > Math.PI * 2 - 0.51);
});
