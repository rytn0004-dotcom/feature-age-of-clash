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

test('building scaffold lifecycle: completed building roots are scanned only once', () => {
  const building = new Group();
  const originalTraverse = building.traverse.bind(building);
  let traverseCalls = 0;
  building.traverse = (callback) => {
    traverseCalls += 1;
    return originalTraverse(callback);
  };

  removeBuildingScaffoldFromRoot(building);
  const callsAfterCleanup = traverseCalls;
  assert.equal(callsAfterCleanup, 1);

  removeBuildingScaffoldFromRoot(building);
  removeBuildingScaffoldFromRoot(building);

  assert.equal(traverseCalls, callsAfterCleanup);
  assert.equal(building.userData.completedScaffoldRemoved, true);
});

test('building scaffold lifecycle: completed roots without any scaffold remain safe and idempotent', () => {
  const building = new Group();
  assert.doesNotThrow(() => removeBuildingScaffoldFromRoot(building));
  assert.doesNotThrow(() => removeBuildingScaffoldFromRoot(building));
  assert.equal(building.userData.completedScaffoldRemoved, true);
});

test('building scaffold lifecycle: removes the rising architecture facade frame after completion without disposing shared geometry', () => {
  const building = new Group();
  const facade = new Group();
  facade.name = 'originalArchitectureFacadeKit';
  facade.userData.removeOnConstructionComplete = true;
  facade.userData.ownsGeometry = false;
  const sharedGeometry = createTrackedGeometry();
  facade.add(new Mesh(sharedGeometry.geometry, new MeshBasicMaterial()));
  building.add(facade);

  removeBuildingScaffoldFromRoot(building);

  assert.equal(building.getObjectByName('originalArchitectureFacadeKit'), undefined);
  assert.equal(facade.parent, null);
  assert.equal(sharedGeometry.wasDisposed(), false, 'cached facade geometry must remain available to other buildings');
  assert.equal(building.userData.completedScaffoldRemoved, true);
});


test('building scaffold lifecycle: a late-added construction overlay is removed after the first completion scan', () => {
  const building = new Group();
  const originalBuildingBody = new Group();
  originalBuildingBody.name = 'buildingBody';
  building.add(originalBuildingBody);

  const originalTraverse = building.traverse.bind(building);
  let traverseCalls = 0;
  building.traverse = (callback) => {
    traverseCalls += 1;
    return originalTraverse(callback);
  };

  removeBuildingScaffoldFromRoot(building);
  assert.equal(traverseCalls, 1);
  assert.equal(building.userData.completedScaffoldChildCount, 1);

  // Civilization/age model refreshes may attach a temporary facade after the
  // initial cleanup. A tracked structural change must trigger one new scan.
  const lateFacade = new Group();
  lateFacade.name = 'originalArchitectureFacadeKit';
  lateFacade.userData.removeOnConstructionComplete = true;
  lateFacade.userData.ownsGeometry = false;
  const sharedGeometry = createTrackedGeometry();
  const material = new MeshBasicMaterial();
  lateFacade.add(new Mesh(sharedGeometry.geometry, material));
  building.add(lateFacade);

  removeBuildingScaffoldFromRoot(building);

  assert.equal(lateFacade.parent, null);
  assert.equal(building.getObjectByName('originalArchitectureFacadeKit'), undefined);
  assert.equal(sharedGeometry.wasDisposed(), false, 'shared facade geometry must remain cached');
  assert.equal(building.userData.completedScaffoldChildCount, 1);
  assert.equal(traverseCalls, 2);

  removeBuildingScaffoldFromRoot(building);
  assert.equal(traverseCalls, 2, 'unchanged completed roots must not be rescanned each frame');
  material.dispose();
});


test('building scaffold lifecycle: nested late overlays invalidate cleanup without changing root child count', () => {
  const building = new Group();
  const architecture = new Group();
  architecture.name = 'architectureRoot';
  const facadeSlot = new Group();
  facadeSlot.name = 'facadeSlot';
  architecture.add(facadeSlot);
  building.add(architecture);

  const originalTraverse = building.traverse.bind(building);
  let traverseCalls = 0;
  building.traverse = (callback) => {
    traverseCalls += 1;
    return originalTraverse(callback);
  };

  removeBuildingScaffoldFromRoot(building);
  assert.equal(traverseCalls, 1);
  const rootChildCount = building.children.length;

  const nestedFacade = new Group();
  nestedFacade.name = 'originalArchitectureFacadeKit';
  nestedFacade.userData.removeOnConstructionComplete = true;
  nestedFacade.userData.ownsGeometry = false;
  const sharedGeometry = createTrackedGeometry();
  const material = new MeshBasicMaterial();
  nestedFacade.add(new Mesh(sharedGeometry.geometry, material));

  // The overlay is inserted two levels below the building root, so the root
  // child count remains unchanged. The tracked parent.add() must still dirty it.
  facadeSlot.add(nestedFacade);
  assert.equal(building.children.length, rootChildCount);

  removeBuildingScaffoldFromRoot(building);

  assert.equal(traverseCalls, 2);
  assert.equal(nestedFacade.parent, null);
  assert.equal(building.getObjectByName('originalArchitectureFacadeKit'), undefined);
  assert.equal(sharedGeometry.wasDisposed(), false, 'shared facade geometry must remain cached');

  removeBuildingScaffoldFromRoot(building);
  assert.equal(traverseCalls, 2, 'stable completed buildings must not be rescanned');
  material.dispose();
});

test('building scaffold lifecycle: newly attached nested containers are tracked for later child additions', () => {
  const building = new Group();
  removeBuildingScaffoldFromRoot(building);

  const lateContainer = new Group();
  lateContainer.name = 'lateArchitectureContainer';
  building.add(lateContainer);
  removeBuildingScaffoldFromRoot(building);

  const lateScaffold = new Group();
  lateScaffold.name = 'scaffoldNestedOverlay';
  lateContainer.add(lateScaffold);
  removeBuildingScaffoldFromRoot(building);

  assert.equal(lateScaffold.parent, null);
  assert.equal(building.getObjectByName('scaffoldNestedOverlay'), undefined);
  assert.equal(building.userData.completedScaffoldRemoved, true);
});
