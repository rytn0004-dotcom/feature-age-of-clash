import type * as THREE from 'three';

function disposeAndDetachScaffoldObject(
  scaffoldObject: THREE.Object3D,
  disposeGeometry = true,
): void {
  scaffoldObject.visible = false;
  if (disposeGeometry) {
    const ownedGeometries = new Set<THREE.BufferGeometry>();
    scaffoldObject.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh && mesh.geometry) ownedGeometries.add(mesh.geometry);
    });
    ownedGeometries.forEach((geometry) => geometry.dispose());
  }

  scaffoldObject.parent?.remove(scaffoldObject);
  scaffoldObject.clear();
  scaffoldObject.userData.scaffoldPermanentlyRemoved = true;
}

/** Permanently detach and release a completed building's temporary scaffold geometry. */
export function removeCompletedBuildingScaffold(scaffoldGroup: THREE.Group): void {
  if (scaffoldGroup.userData.scaffoldPermanentlyRemoved) return;
  disposeAndDetachScaffoldObject(scaffoldGroup);
}

function isConstructionScaffoldObject(object: THREE.Object3D): boolean {
  return object.name === 'scaffoldGroup' ||
    object.name.startsWith('scaffold') ||
    object.name.startsWith('instancedScaffold') ||
    object.userData.removeOnConstructionComplete === true;
}

interface ScaffoldMutationTracker {
  dirty: boolean;
  instrumentedObjects: WeakSet<THREE.Object3D>;
}

const scaffoldMutationTrackers = new WeakMap<THREE.Object3D, ScaffoldMutationTracker>();

function getScaffoldMutationTrackerFor(object: THREE.Object3D): ScaffoldMutationTracker | null {
  let current: THREE.Object3D | null = object;
  while (current) {
    const tracker = scaffoldMutationTrackers.get(current);
    if (tracker) return tracker;
    current = current.parent;
  }
  return null;
}

function instrumentScaffoldMutationObject(
  object: THREE.Object3D,
  tracker: ScaffoldMutationTracker,
): void {
  if (tracker.instrumentedObjects.has(object)) return;
  tracker.instrumentedObjects.add(object);

  // Model refreshes can attach overlays below an existing nested group. Track
  // add() on each node so those changes invalidate the completion scan without
  // traversing every building on every simulation frame.
  const originalAdd = object.add.bind(object);
  const mutableObject = object as unknown as {
    add: (...objects: THREE.Object3D[]) => THREE.Object3D;
  };
  mutableObject.add = (...objects: THREE.Object3D[]): THREE.Object3D => {
    const result = originalAdd(...objects);
    const activeTracker = getScaffoldMutationTrackerFor(object);
    if (activeTracker && objects.length > 0) {
      activeTracker.dirty = true;
      objects.forEach((addedObject) => {
        addedObject.traverse((descendant) => {
          instrumentScaffoldMutationObject(descendant, activeTracker);
        });
      });
    }
    return result;
  };
}

/**
 * Remove every temporary scaffold object below a building root, not just the
 * conventional wrapper group. Child additions at any nesting depth invalidate
 * the cached result; unchanged completed buildings stay O(1) between mutations.
 */
export function removeBuildingScaffoldFromRoot(buildingRoot: THREE.Group): void {
  let tracker = scaffoldMutationTrackers.get(buildingRoot);
  if (!tracker) {
    tracker = { dirty: true, instrumentedObjects: new WeakSet<THREE.Object3D>() };
    scaffoldMutationTrackers.set(buildingRoot, tracker);
  }

  if (buildingRoot.userData.completedScaffoldRemoved && !tracker.dirty) return;

  const candidates: THREE.Object3D[] = [];
  buildingRoot.traverse((object) => {
    instrumentScaffoldMutationObject(object, tracker!);
    if (object !== buildingRoot && isConstructionScaffoldObject(object)) candidates.push(object);
  });

  const topLevelCandidates = candidates.filter((candidate) => {
    let parent = candidate.parent;
    while (parent && parent !== buildingRoot) {
      if (isConstructionScaffoldObject(parent)) return false;
      parent = parent.parent;
    }
    return true;
  });

  topLevelCandidates.forEach((object) => {
    // Facade overlays reuse cached geometry across buildings. Detach their
    // construction-only wrapper, but keep the shared cached buffers alive.
    disposeAndDetachScaffoldObject(object, object.userData.ownsGeometry !== false);
  });
  buildingRoot.userData.completedScaffoldRemoved = true;
  buildingRoot.userData.completedScaffoldChildCount = buildingRoot.children.length;
  tracker.dirty = false;
}
