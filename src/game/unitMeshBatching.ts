import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface StaticUnitMeshBatchStats {
  eligibleMeshes: number;
  mergedSourceMeshes: number;
  mergedBatches: number;
  remainingEligibleMeshes: number;
  estimatedDrawCallsSaved: number;
}

const UNIT_LOD_MIN_RADIUS = 0.012;
const UNIT_LOD_MAX_RADIUS = 0.105;

type MergeableMesh = THREE.Mesh & {
  isSkinnedMesh?: boolean;
  isInstancedMesh?: boolean;
  isBatchedMesh?: boolean;
  morphTargetInfluences?: number[] | undefined;
  customDepthMaterial?: THREE.Material | undefined;
  customDistanceMaterial?: THREE.Material | undefined;
};

function collectObjectReferences(
  value: unknown,
  output: Set<THREE.Object3D>,
  visited: Set<object>,
): void {
  if (!value || typeof value !== 'object') return;
  const candidate = value as THREE.Object3D & { isObject3D?: boolean };
  if (candidate.isObject3D) {
    output.add(candidate);
    return;
  }
  if (visited.has(value)) return;
  visited.add(value);

  if (Array.isArray(value)) {
    for (const entry of value) collectObjectReferences(entry, output, visited);
    return;
  }

  if (Object.getPrototypeOf(value) !== Object.prototype) return;
  for (const entry of Object.values(value as Record<string, unknown>)) {
    collectObjectReferences(entry, output, visited);
  }
}

/** Objects directly referenced by animation and secondary-motion systems must remain individual. */
function getProtectedObjects(root: THREE.Group): Set<THREE.Object3D> {
  const protectedObjects = new Set<THREE.Object3D>();
  const visited = new Set<object>();
  collectObjectReferences(root.userData.animParts, protectedObjects, visited);
  collectObjectReferences(root.userData.secondaryMotionParts, protectedObjects, visited);
  collectObjectReferences(root.userData.unitBadge, protectedObjects, visited);
  collectObjectReferences(root.userData.battlefieldRoleMarker, protectedObjects, visited);
  return protectedObjects;
}

function getAttributeSignature(geometry: THREE.BufferGeometry): string | null {
  const attributes = Object.keys(geometry.attributes).sort().map((name) => {
    const attribute = geometry.attributes[name] as THREE.BufferAttribute & {
      isInterleavedBufferAttribute?: boolean;
      data?: { array: ArrayLike<number>; stride: number };
    };
    const interleaved = attribute.isInterleavedBufferAttribute === true;
    const array = interleaved ? attribute.data?.array : attribute.array;
    if (!array) return null;
    return [
      name,
      attribute.itemSize,
      attribute.normalized ? 1 : 0,
      array.constructor.name,
      interleaved ? attribute.data?.stride ?? 0 : 0,
      (attribute as THREE.BufferAttribute & { gpuType?: number }).gpuType ?? 0,
    ].join(':');
  });

  if (attributes.some((attribute) => attribute === null)) return null;
  return JSON.stringify({
    indexed: geometry.index !== null,
    indexType: geometry.index?.array.constructor.name ?? '',
    attributes,
  });
}

function isMaterialSafeToMerge(material: THREE.Material): boolean {
  const extended = material as THREE.Material & {
    alphaHash?: boolean;
    alphaToCoverage?: boolean;
  };

  return (
    material.visible &&
    !material.transparent &&
    material.opacity >= 0.999 &&
    material.alphaTest <= 0 &&
    !extended.alphaHash &&
    !extended.alphaToCoverage &&
    material.blending === THREE.NormalBlending &&
    !(material.clippingPlanes?.length)
  );
}

function getMergeKey(
  mesh: MergeableMesh,
  material: THREE.Material,
  geometrySignature: string,
): string {
  return [
    material.uuid,
    geometrySignature,
    mesh.castShadow ? 1 : 0,
    mesh.receiveShadow ? 1 : 0,
    mesh.frustumCulled ? 1 : 0,
    mesh.renderOrder,
    mesh.layers.mask,
  ].join('|');
}

function isMeshEligible(
  object: THREE.Object3D,
  protectedObjects: ReadonlySet<THREE.Object3D>,
): object is MergeableMesh {
  const mesh = object as MergeableMesh;
  if (!mesh.isMesh || !mesh.geometry?.isBufferGeometry) return false;
  if (
    protectedObjects.has(mesh) ||
    mesh.visible !== true ||
    mesh.name.length > 0 ||
    Object.keys(mesh.userData || {}).length > 0 ||
    !mesh.matrixAutoUpdate ||
    !mesh.matrixWorldAutoUpdate ||
    mesh.isSkinnedMesh ||
    mesh.isInstancedMesh ||
    mesh.isBatchedMesh ||
    mesh.morphTargetInfluences?.length ||
    mesh.customDepthMaterial ||
    mesh.customDistanceMaterial
  ) {
    return false;
  }

  if (Array.isArray(mesh.material) || !isMaterialSafeToMerge(mesh.material)) return false;

  const geometry = mesh.geometry;
  if (
    geometry.groups.length > 0 ||
    (geometry as THREE.BufferGeometry & { isInstancedBufferGeometry?: boolean }).isInstancedBufferGeometry ||
    Object.keys(geometry.userData || {}).length > 0 ||
    Object.values(geometry.morphAttributes).some((attributes) => attributes.length > 0) ||
    geometry.drawRange.start !== 0 ||
    geometry.drawRange.count !== Infinity
  ) {
    return false;
  }

  // Keep the small meshes that the per-part distance LOD must still cull independently.
  if (!geometry.boundingSphere) geometry.computeBoundingSphere();
  const radius = geometry.boundingSphere?.radius ?? Number.NaN;
  if (!Number.isFinite(radius) || (radius >= UNIT_LOD_MIN_RADIUS && radius <= UNIT_LOD_MAX_RADIUS)) {
    return false;
  }

  return getAttributeSignature(geometry) !== null;
}

/**
 * Merge only opaque, static sibling meshes that share one parent, one material,
 * compatible vertex layouts and identical render flags. Local transforms are
 * baked into cloned geometries, so animated parent pivots keep working.
 */
export function mergeStaticUnitMeshes(root: THREE.Group): StaticUnitMeshBatchStats {
  const protectedObjects = getProtectedObjects(root);
  const parents: THREE.Object3D[] = [];
  root.traverse((object) => parents.push(object));

  const stats: StaticUnitMeshBatchStats = {
    eligibleMeshes: 0,
    mergedSourceMeshes: 0,
    mergedBatches: 0,
    remainingEligibleMeshes: 0,
    estimatedDrawCallsSaved: 0,
  };

  for (const parent of parents) {
    const groups = new Map<string, MergeableMesh[]>();

    for (const child of [...parent.children]) {
      if (!isMeshEligible(child, protectedObjects)) continue;
      const mesh = child as MergeableMesh;
      const material = mesh.material as THREE.Material;
      const signature = getAttributeSignature(mesh.geometry);
      if (!signature) continue;

      stats.eligibleMeshes += 1;
      const key = getMergeKey(mesh, material, signature);
      const group = groups.get(key);
      if (group) group.push(mesh);
      else groups.set(key, [mesh]);
    }

    for (const meshes of groups.values()) {
      if (meshes.length < 2) continue;

      const transformedGeometries: THREE.BufferGeometry[] = [];
      let mergedGeometry: THREE.BufferGeometry | null = null;
      try {
        for (const mesh of meshes) {
          mesh.updateMatrix();
          const geometry = mesh.geometry.clone();
          geometry.applyMatrix4(mesh.matrix);
          transformedGeometries.push(geometry);
        }
        mergedGeometry = mergeGeometries(transformedGeometries, false);
      } catch {
        mergedGeometry = null;
      } finally {
        for (const geometry of transformedGeometries) geometry.dispose();
      }

      // A malformed or unusual geometry should never prevent the unit from rendering.
      if (!mergedGeometry) continue;

      mergedGeometry.computeBoundingBox();
      mergedGeometry.computeBoundingSphere();

      const first = meshes[0];
      const batch = new THREE.Mesh(mergedGeometry, first.material as THREE.Material);
      batch.name = 'unitStaticMeshBatch';
      batch.castShadow = first.castShadow;
      batch.receiveShadow = first.receiveShadow;
      batch.frustumCulled = first.frustumCulled;
      batch.renderOrder = first.renderOrder;
      batch.layers.mask = first.layers.mask;
      batch.userData.staticMeshBatch = true;

      for (const mesh of meshes) parent.remove(mesh);
      parent.add(batch);

      stats.mergedSourceMeshes += meshes.length;
      stats.mergedBatches += 1;
    }
  }

  stats.remainingEligibleMeshes = stats.eligibleMeshes - stats.mergedSourceMeshes + stats.mergedBatches;
  stats.estimatedDrawCallsSaved = stats.mergedSourceMeshes - stats.mergedBatches;
  return stats;
}
