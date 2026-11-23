import type * as THREE from 'three';

function disposeAndDetachScaffoldObject(scaffoldObject: THREE.Object3D): void {
  scaffoldObject.visible = false;
  const ownedGeometries = new Set<THREE.BufferGeometry>();
  scaffoldObject.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh && mesh.geometry) ownedGeometries.add(mesh.geometry);
  });
  ownedGeometries.forEach((geometry) => geometry.dispose());

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
    object.name.startsWith('instancedScaffold');
}

/**
 * Remove every temporary scaffold object below a building root, not just the
 * conventional wrapper group. All scaffold objects exist before a building
 * reaches its completed state, so this expensive tree scan only needs to run once.
 */
export function removeBuildingScaffoldFromRoot(buildingRoot: THREE.Group): void {
  if (buildingRoot.userData.completedScaffoldRemoved) return;

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

  topLevelCandidates.forEach(disposeAndDetachScaffoldObject);
  buildingRoot.userData.completedScaffoldRemoved = true;
}
