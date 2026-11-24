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

/**
 * Remove every temporary scaffold object below a building root, not just the
 * conventional wrapper group. All scaffold objects exist before a building
 * reaches its completed state, so this expensive tree scan only needs to run once.
 */
export function removeBuildingScaffoldFromRoot(buildingRoot: THREE.Group): void {
  const completedChildCount = buildingRoot.userData.completedScaffoldChildCount;
  if (
    buildingRoot.userData.completedScaffoldRemoved &&
    completedChildCount === buildingRoot.children.length
  ) {
    return;
  }

  const candidates: THREE.Object3D[] = [];
  buildingRoot.traverse((object) => {
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
}
