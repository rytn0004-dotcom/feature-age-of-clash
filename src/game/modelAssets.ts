import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export type KayKitTreeVariant = 'A' | 'B';

const treeAssetUrls: Record<KayKitTreeVariant, string> = {
  A: `${import.meta.env.BASE_URL}assets/models/kaykit/trees/tree_single_A.gltf`,
  B: `${import.meta.env.BASE_URL}assets/models/kaykit/trees/tree_single_B.gltf`,
};

const gltfLoader = new GLTFLoader();
const treePrototypeCache = new Map<KayKitTreeVariant, Promise<THREE.Group>>();
const treeLodWorldCenter = new THREE.Vector3();
const treeLodWorldScale = new THREE.Vector3();

function loadTreePrototype(variant: KayKitTreeVariant): Promise<THREE.Group> {
  let pending = treePrototypeCache.get(variant);
  if (!pending) {
    pending = gltfLoader.loadAsync(treeAssetUrls[variant]).then((gltf) => {
      const prototype = gltf.scene;
      prototype.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        // Distant-only silhouettes keep their color and lighting but skip shadow passes.
        mesh.castShadow = false;
        mesh.receiveShadow = false;
      });
      return prototype;
    });
    treePrototypeCache.set(variant, pending);
    pending.catch(() => {
      if (treePrototypeCache.get(variant) === pending) treePrototypeCache.delete(variant);
    });
  }
  return pending;
}

/**
 * Attach one shared KayKit tree prototype as a distant silhouette.
 * The existing procedural tree remains visible until the GLTF and its atlas
 * texture have both loaded successfully.
 */
export function attachKayKitTreeLod(root: THREE.Group, variant: KayKitTreeVariant): void {
  if (root.userData.treeAssetLoadStarted) return;
  const detailedVisual = root.userData.treeDetailedVisual as THREE.Group | undefined;
  if (!detailedVisual) return;
  root.userData.treeAssetLoadStarted = true;

  void loadTreePrototype(variant)
    .then((prototype) => {
      // A match may have been cleared while the asynchronous model was loading.
      if (!root.parent || root.userData.treeAssetLod) return;

      const simplifiedVisual = new THREE.Group();
      simplifiedVisual.name = 'treeAssetLod';
      const model = prototype.clone(true);
      const bounds = new THREE.Box3().setFromObject(model);
      const height = Math.max(0.1, bounds.max.y - bounds.min.y);
      const scale = 4.15 / height;

      simplifiedVisual.add(model);
      simplifiedVisual.scale.setScalar(scale);
      simplifiedVisual.position.y = -bounds.min.y * scale;
      simplifiedVisual.visible = false;
      simplifiedVisual.userData.depletionModel = model;
      simplifiedVisual.userData.depletionMinY = bounds.min.y;
      root.add(simplifiedVisual);

      root.userData.treeAssetLod = simplifiedVisual;
      root.userData.treeLodUsingDetailed = true;
    })
    .catch(() => {
      // Keep the procedural tree as a complete fallback when the asset is unavailable.
      root.userData.treeAssetLoadStarted = false;
    });
}

/**
 * Hysteretic projected-size switching avoids flicker around the threshold.
 * The detailed procedural tree is kept for close inspection; the compact
 * textured GLTF silhouette is used only when it occupies a small screen area.
 */
export function updateTreeVisualLod(
  root: THREE.Group,
  camera: THREE.PerspectiveCamera,
  viewportHeight: number
): void {
  const detailedVisual = root.userData.treeDetailedVisual as THREE.Group | undefined;
  const simplifiedVisual = root.userData.treeAssetLod as THREE.Group | undefined;
  if (!detailedVisual || !simplifiedVisual) return;

  root.updateMatrixWorld(true);
  root.getWorldPosition(treeLodWorldCenter);
  root.getWorldScale(treeLodWorldScale);
  treeLodWorldCenter.y += 2.0 * treeLodWorldScale.y;

  const distance = Math.max(0.001, camera.position.distanceTo(treeLodWorldCenter));
  const safeHeight = Math.max(1, viewportHeight);
  const focalPixels = safeHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.getEffectiveFOV()) * 0.5));
  const worldRadius = 2.15 * treeLodWorldScale.x;
  const projectedRadius = (worldRadius * focalPixels) / distance;
  const wasDetailed = root.userData.treeLodUsingDetailed !== false;
  const showDetailed = wasDetailed ? projectedRadius >= 22 : projectedRadius >= 29;

  if (detailedVisual.visible !== showDetailed) detailedVisual.visible = showDetailed;
  if (simplifiedVisual.visible !== !showDetailed) simplifiedVisual.visible = !showDetailed;
  root.userData.treeLodUsingDetailed = showDetailed;

  const model = simplifiedVisual.userData.depletionModel as THREE.Object3D | undefined;
  if (model) {
    const ratio = typeof root.userData.treeDepletionRatio === 'number' ? root.userData.treeDepletionRatio : 1;
    const scaleY = 0.64 + 0.36 * THREE.MathUtils.clamp(ratio, 0, 1);
    const minY = simplifiedVisual.userData.depletionMinY as number;
    model.scale.y = scaleY;
    model.position.y = minY * (1 - scaleY);
  }
}
