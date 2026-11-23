import type * as THREE from 'three';

/** Permanently detach and release a completed building's temporary scaffold geometry. */
export function removeCompletedBuildingScaffold(scaffoldGroup: THREE.Group): void {
  if (scaffoldGroup.userData.scaffoldPermanentlyRemoved) return;

  scaffoldGroup.visible = false;
  const ownedGeometries = new Set<THREE.BufferGeometry>();
  scaffoldGroup.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh && mesh.geometry) ownedGeometries.add(mesh.geometry);
  });
  ownedGeometries.forEach((geometry) => geometry.dispose());

  scaffoldGroup.parent?.remove(scaffoldGroup);
  scaffoldGroup.clear();
  scaffoldGroup.userData.scaffoldPermanentlyRemoved = true;
}
