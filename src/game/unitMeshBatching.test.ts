import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { mergeStaticUnitMeshes } from './unitMeshBatching';

function createLargeStaticMesh(material: THREE.Material, x = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), material);
  mesh.position.x = x;
  return mesh;
}

function assertVectorClose(actual: THREE.Vector3, expected: THREE.Vector3): void {
  assert.ok(actual.distanceTo(expected) < 1e-5, `Expected ${actual.toArray()} to match ${expected.toArray()}`);
}

test('merges opaque sibling meshes and bakes local transforms without changing bounds', () => {
  const root = new THREE.Group();
  const pivot = new THREE.Group();
  pivot.position.set(0.5, 1.2, -0.3);
  pivot.rotation.z = 0.24;
  pivot.scale.set(1.1, 0.9, 1.2);
  root.add(pivot);

  const material = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.7 });
  const first = createLargeStaticMesh(material, -0.8);
  const second = createLargeStaticMesh(material, 0.9);
  second.rotation.y = 0.42;
  second.scale.set(1.2, 0.8, 1.1);
  pivot.add(first, second);

  root.updateMatrixWorld(true);
  const expectedBounds = new THREE.Box3().setFromObject(root);
  const originalVertex = first.geometry.attributes.position.getX(0);
  const stats = mergeStaticUnitMeshes(root);
  root.updateMatrixWorld(true);
  const actualBounds = new THREE.Box3().setFromObject(root);
  const batches = pivot.children.filter((child) => (child as THREE.Mesh).isMesh) as THREE.Mesh[];

  assert.equal(stats.eligibleMeshes, 2);
  assert.equal(stats.mergedSourceMeshes, 2);
  assert.equal(stats.mergedBatches, 1);
  assert.equal(stats.remainingEligibleMeshes, 1);
  assert.equal(stats.estimatedDrawCallsSaved, 1);
  assert.equal(batches.length, 1);
  assert.equal(batches[0].name, 'unitStaticMeshBatch');
  assertVectorClose(actualBounds.min, expectedBounds.min);
  assertVectorClose(actualBounds.max, expectedBounds.max);
  assert.equal(first.geometry.attributes.position.getX(0), originalVertex, 'Shared source geometry must not be mutated');
  assert.equal(batches[0].parent, pivot, 'The original animated parent pivot must be retained');
});

test('never merges meshes across separate animation pivots', () => {
  const root = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: 0x94a3b8 });
  const leftPivot = new THREE.Group();
  const rightPivot = new THREE.Group();
  leftPivot.add(createLargeStaticMesh(material, -1));
  rightPivot.add(createLargeStaticMesh(material, 1));
  root.add(leftPivot, rightPivot);

  const stats = mergeStaticUnitMeshes(root);

  assert.equal(stats.eligibleMeshes, 2);
  assert.equal(stats.mergedBatches, 0);
  assert.equal(stats.estimatedDrawCallsSaved, 0);
  assert.equal(leftPivot.children.length, 1);
  assert.equal(rightPivot.children.length, 1);
});

test('keeps animation-referenced and secondary-motion meshes individual', () => {
  const root = new THREE.Group();
  const armPivot = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: 0x475569 });
  const protectedAura = createLargeStaticMesh(material, 2);
  const cloak = createLargeStaticMesh(material, 3);
  cloak.userData.secondaryMotion = { axis: 'x', amplitude: 0.15 };
  armPivot.add(createLargeStaticMesh(material, -1), createLargeStaticMesh(material, 1), protectedAura);
  root.add(armPivot, cloak);
  root.userData.animParts = { rightArmPivot: armPivot, auraMesh: protectedAura };
  root.userData.secondaryMotionParts = [{ object: cloak, axis: 'x', amplitude: 0.15 }];

  const stats = mergeStaticUnitMeshes(root);

  assert.equal(stats.mergedBatches, 1);
  assert.equal(stats.mergedSourceMeshes, 2);
  assert.equal(armPivot.children.length, 2, 'The static pair becomes one batch while the animated aura stays separate');
  assert.equal(protectedAura.parent, armPivot);
  assert.equal(cloak.parent, root);
});

test('preserves per-part distance LOD by excluding meshes inside the micro-detail radius band', () => {
  const root = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: 0x64748b });
  const first = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), material);
  const second = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), material);
  root.add(first, second);

  const stats = mergeStaticUnitMeshes(root);

  assert.equal(stats.eligibleMeshes, 0);
  assert.equal(stats.mergedBatches, 0);
  assert.equal(root.children.length, 2);
});

test('skips transparent, named, hidden and user-data-bearing meshes', () => {
  const root = new THREE.Group();
  const opaque = new THREE.MeshStandardMaterial({ color: 0x64748b });
  const transparent = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 });
  const transparentA = createLargeStaticMesh(transparent, -2);
  const transparentB = createLargeStaticMesh(transparent, 2);
  const namedA = createLargeStaticMesh(opaque, -1);
  const namedB = createLargeStaticMesh(opaque, 1);
  namedA.name = 'weaponGlow';
  namedB.name = 'agePlume';
  const hidden = createLargeStaticMesh(opaque, 0);
  hidden.visible = false;
  const decorated = createLargeStaticMesh(opaque, 3);
  decorated.userData.secondaryMotion = { axis: 'z' };
  root.add(transparentA, transparentB, namedA, namedB, hidden, decorated);

  const stats = mergeStaticUnitMeshes(root);

  assert.equal(stats.mergedBatches, 0);
  assert.equal(root.children.length, 6);
});

test('keeps different materials and render states in separate batches', () => {
  const root = new THREE.Group();
  const shared = new THREE.MeshStandardMaterial({ color: 0x64748b });
  const other = new THREE.MeshStandardMaterial({ color: 0x94a3b8 });
  const sameStateA = createLargeStaticMesh(shared, -2);
  const sameStateB = createLargeStaticMesh(shared, -1);
  const differentMaterial = createLargeStaticMesh(other, 1);
  const differentShadowState = createLargeStaticMesh(shared, 2);
  differentShadowState.castShadow = false;
  root.add(sameStateA, sameStateB, differentMaterial, differentShadowState);

  const stats = mergeStaticUnitMeshes(root);

  assert.equal(stats.eligibleMeshes, 4);
  assert.equal(stats.mergedSourceMeshes, 2);
  assert.equal(stats.mergedBatches, 1);
  assert.equal(stats.estimatedDrawCallsSaved, 1);
  assert.equal(root.children.length, 3);
  const batch = root.children.find((child) => child.name === 'unitStaticMeshBatch') as THREE.Mesh;
  assert.equal(batch.castShadow, true);
});

test('does not merge meshes with incompatible vertex layouts', () => {
  const root = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: 0x64748b });
  const first = createLargeStaticMesh(material, -1);
  const second = createLargeStaticMesh(material, 1);
  second.geometry.deleteAttribute('uv');
  root.add(first, second);

  const stats = mergeStaticUnitMeshes(root);

  assert.equal(stats.eligibleMeshes, 2);
  assert.equal(stats.mergedBatches, 0);
  assert.equal(root.children.length, 2);
});
