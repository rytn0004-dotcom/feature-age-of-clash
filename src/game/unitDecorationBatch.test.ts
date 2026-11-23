import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  createUnitBuffRingBatch,
  createUnitRoleMarkerBatch,
} from './proceduralGraphics';

test('role marker batches use distinct crest and siege geometries with dynamic instance matrices', () => {
  const crest = createUnitRoleMarkerBatch('crest', 12);
  const siege = createUnitRoleMarkerBatch('siege', 12);

  assert.equal(crest.name, 'unitRoleCrestBatch');
  assert.equal(siege.name, 'unitRoleSiegeBatch');
  assert.equal(crest.count, 0);
  assert.equal(siege.count, 0);
  assert.notEqual(crest.geometry, siege.geometry);
  assert.equal(crest.material, siege.material === crest.material ? crest.material : crest.material);
  assert.equal((crest.material as THREE.Material).transparent, true);
  assert.equal((siege.material as THREE.Material).transparent, true);

  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(2, 0.034, -3),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.7, 0)),
    new THREE.Vector3(1.4, 1.4, 1.4),
  );
  crest.setMatrixAt(0, matrix);
  crest.count = 1;
  crest.instanceMatrix.needsUpdate = true;
  const actual = new THREE.Matrix4();
  crest.getMatrixAt(0, actual);
  assert.ok(actual.elements.every((value, index) => Math.abs(value - matrix.elements[index]) < 1e-6));
});

test('buff ring batch shares one transparent horizontal ring geometry', () => {
  const batch = createUnitBuffRingBatch(16);
  assert.equal(batch.name, 'unitBuffRingBatch');
  assert.equal(batch.count, 0);
  assert.equal((batch.material as THREE.Material).transparent, true);
  assert.equal(batch.frustumCulled, false);

  const position = batch.geometry.attributes.position;
  const normal = batch.geometry.attributes.normal;
  assert.ok(position.count > 0);
  assert.ok(normal.count > 0);
  const averageAbsY = Array.from({ length: normal.count }, (_, i) => Math.abs(normal.getY(i)))
    .reduce((sum, value) => sum + value, 0) / normal.count;
  assert.ok(averageAbsY > 0.99, 'Buff ring geometry must remain horizontal after its X rotation.');
});

test('role and buff batches respect the requested fixed instance capacity', () => {
  const crest = createUnitRoleMarkerBatch('crest', 7);
  const buff = createUnitBuffRingBatch(9);
  assert.equal(crest.instanceMatrix.count, 7);
  assert.equal(buff.instanceMatrix.count, 9);
});
