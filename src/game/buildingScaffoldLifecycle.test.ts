import test from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three';
import { removeBuildingScaffoldFromRoot, removeCompletedBuildingScaffold } from './buildingScaffoldLifecycle';

function createTrackedGeometry(): { geometry: BoxGeometry; wasDisposed: () => boolean } {
  const geometry = new BoxGeometry(1, 1, 1);
  let disposed = false;
  const dispose = geometry.dispose.bind(geometry);
  geometry.dispose = () => {
    disposed = true;
    dispose();
  };
  return { geometry, wasDisposed: () => disposed };
}

test('building scaffold lifecycle: removes the scaffold and disposes its temporary geometry', () => {
  const building = new Group();
  const scaffold = new Group();
  scaffold.name = 'scaffoldGroup';
  const tracked = createTrackedGeometry();
  const material = new MeshBasicMaterial();
  scaffold.add(new Mesh(tracked.geometry, material));
  building.add(scaffold);

  removeCompletedBuildingScaffold(scaffold);

  assert.equal(scaffold.visible, false);
  assert.equal(scaffold.parent, null);
  assert.equal(building.children.length, 0);
  assert.equal(scaffold.children.length, 0);
  assert.equal(tracked.wasDisposed(), true);
  assert.equal(scaffold.userData.scaffoldPermanentlyRemoved, true);
  material.dispose();
});

test('building scaffold lifecycle: repeated completion cleanup is safe', () => {
  const building = new Group();
  const scaffold = new Group();
  scaffold.name = 'scaffoldGroup';
  building.add(scaffold);

  removeCompletedBuildingScaffold(scaffold);
  assert.doesNotThrow(() => removeCompletedBuildingScaffold(scaffold));
  assert.equal(building.children.length, 0);
});

test('building scaffold lifecycle: removes wrapper, orphaned frame and instance batches together', () => {
  const building = new Group();
  const wrapper = new Group();
  wrapper.name = 'scaffoldGroup';
  const frame = new Group();
  frame.name = 'scaffoldFrame';
  const pole = createTrackedGeometry();
  frame.add(new Mesh(pole.geometry, new MeshBasicMaterial()));
  wrapper.add(frame);
  building.add(wrapper);

  const orphanBatch = createTrackedGeometry();
  const orphan = new Mesh(orphanBatch.geometry, new MeshBasicMaterial());
  orphan.name = 'instancedScaffoldBoundaryRopeX';
  building.add(orphan);

  const looseHoist = new Group();
  looseHoist.name = 'scaffoldHoistAssembly';
  building.add(looseHoist);

  removeBuildingScaffoldFromRoot(building);

  assert.equal(building.getObjectByName('scaffoldGroup'), undefined);
  assert.equal(building.getObjectByName('scaffoldFrame'), undefined);
  assert.equal(building.getObjectByName('instancedScaffoldBoundaryRopeX'), undefined);
  assert.equal(building.getObjectByName('scaffoldHoistAssembly'), undefined);
  assert.equal(pole.wasDisposed(), true);
  assert.equal(orphanBatch.wasDisposed(), true);
});

test('building scaffold lifecycle: removes scaffold objects reattached after an earlier cleanup', () => {
  const building = new Group();
  removeBuildingScaffoldFromRoot(building);
  assert.equal(building.userData.completedScaffoldRemoved, true);

  const reattachedScaffold = new Group();
  reattachedScaffold.name = 'scaffoldGroup';
  const frame = new Group();
  frame.name = 'scaffoldFrame';
  reattachedScaffold.add(frame);
  building.add(reattachedScaffold);

  removeBuildingScaffoldFromRoot(building);

  assert.equal(building.getObjectByName('scaffoldGroup'), undefined);
  assert.equal(building.getObjectByName('scaffoldFrame'), undefined);
  assert.equal(building.userData.completedScaffoldRemoved, true);
});

test('building scaffold lifecycle: completed roots without any scaffold remain safe and idempotent', () => {
  const building = new Group();
  assert.doesNotThrow(() => removeBuildingScaffoldFromRoot(building));
  assert.doesNotThrow(() => removeBuildingScaffoldFromRoot(building));
  assert.equal(building.userData.completedScaffoldRemoved, true);
});
