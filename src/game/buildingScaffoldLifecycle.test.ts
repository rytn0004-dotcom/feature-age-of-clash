import test from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three';
import { removeCompletedBuildingScaffold } from './buildingScaffoldLifecycle';

test('building scaffold lifecycle: removes the scaffold and disposes its temporary geometry', () => {
  const building = new Group();
  const scaffold = new Group();
  const geometry = new BoxGeometry(1, 1, 1);
  const material = new MeshBasicMaterial();
  let disposed = false;
  const dispose = geometry.dispose.bind(geometry);
  geometry.dispose = () => {
    disposed = true;
    dispose();
  };
  scaffold.add(new Mesh(geometry, material));
  building.add(scaffold);

  removeCompletedBuildingScaffold(scaffold);

  assert.equal(scaffold.visible, false);
  assert.equal(scaffold.parent, null);
  assert.equal(building.children.length, 0);
  assert.equal(scaffold.children.length, 0);
  assert.equal(disposed, true);
  assert.equal(scaffold.userData.scaffoldPermanentlyRemoved, true);
  material.dispose();
});

test('building scaffold lifecycle: repeated completion cleanup is safe', () => {
  const building = new Group();
  const scaffold = new Group();
  building.add(scaffold);

  removeCompletedBuildingScaffold(scaffold);
  assert.doesNotThrow(() => removeCompletedBuildingScaffold(scaffold));
  assert.equal(building.children.length, 0);
});
