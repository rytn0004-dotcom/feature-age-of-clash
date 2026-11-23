import test from 'node:test';
import assert from 'node:assert/strict';
import { updateAmbientTreeWind } from './ambientTreeWind';

function rotationTarget() {
  return { rotation: { x: 0, y: 0.75, z: 0 } };
}

test('ambient tree wind: updates both procedural and distant tree LOD rotations', () => {
  const canopy = rotationTarget();
  const distantLod = rotationTarget();
  const tree = {
    userData: {
      treeWind: { phase: 0.4, amplitude: 0.08, frequency: 1.7 },
      treeCanopy: canopy,
      treeAssetLod: distantLod,
    },
  };
  const simulationTime = 2.25;
  const expectedZ = Math.sin(simulationTime * 1.7 + 0.4) * 0.08;
  const expectedX = Math.cos(simulationTime * 1.7 * 0.76 + 0.4 * 0.71) * 0.08 * 0.58;

  updateAmbientTreeWind([tree], simulationTime);

  assert.ok(Math.abs(canopy.rotation.z - expectedZ) < 1e-12);
  assert.ok(Math.abs(canopy.rotation.x - expectedX) < 1e-12);
  assert.ok(Math.abs(distantLod.rotation.z - expectedZ) < 1e-12);
  assert.ok(Math.abs(distantLod.rotation.x - expectedX) < 1e-12);
  assert.equal(canopy.rotation.y, 0.75);
  assert.equal(distantLod.rotation.y, 0.75);
});

test('ambient tree wind: leaves non-tree resource nodes untouched', () => {
  const animal = {
    userData: {
      treeCanopy: rotationTarget(),
      treeAssetLod: rotationTarget(),
    },
  };
  const beforeCanopy = structuredClone(animal.userData.treeCanopy.rotation);
  const beforeLod = structuredClone(animal.userData.treeAssetLod.rotation);

  updateAmbientTreeWind([animal], 10);

  assert.deepEqual(animal.userData.treeCanopy.rotation, beforeCanopy);
  assert.deepEqual(animal.userData.treeAssetLod.rotation, beforeLod);
});

test('ambient tree wind: uses safe defaults for partial wind metadata', () => {
  const canopy = rotationTarget();
  const tree = { userData: { treeWind: {}, treeCanopy: canopy } };

  updateAmbientTreeWind([tree], 0);

  assert.equal(canopy.rotation.z, 0);
  assert.ok(Math.abs(canopy.rotation.x - 0.035 * 0.58) < 1e-12);
});

test('ambient tree wind: ignores non-finite simulation time', () => {
  const canopy = rotationTarget();
  const before = structuredClone(canopy.rotation);
  const tree = { userData: { treeWind: {}, treeCanopy: canopy } };

  updateAmbientTreeWind([tree], Number.NaN);

  assert.deepEqual(canopy.rotation, before);
});
