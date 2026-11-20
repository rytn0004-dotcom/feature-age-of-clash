import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';

export type KayKitTreeVariant = 'A' | 'B';

const treeAssetUrls: Record<KayKitTreeVariant, string> = {
  A: `${import.meta.env.BASE_URL}assets/models/kaykit/trees/tree_single_A.gltf`,
  B: `${import.meta.env.BASE_URL}assets/models/kaykit/trees/tree_single_B.gltf`,
};

const gltfLoader = new GLTFLoader();
const treePrototypeCache = new Map<KayKitTreeVariant, Promise<THREE.Group>>();
const treeLodWorldCenter = new THREE.Vector3();
const treeLodWorldScale = new THREE.Vector3();

const deerAssetUrl = `${import.meta.env.BASE_URL}assets/models/quaternius/animals/Deer.glb`;
export type DeerAnimationState = 'idle' | 'graze' | 'walk' | 'gallop' | 'death';
interface DeerPrototype {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
}
const deerPrototypeCache: { current?: Promise<DeerPrototype> } = {};
const deerLodWorldCenter = new THREE.Vector3();
const deerLodWorldScale = new THREE.Vector3();

function loadDeerPrototype(): Promise<DeerPrototype> {
  let pending = deerPrototypeCache.current;
  if (!pending) {
    pending = gltfLoader.loadAsync(deerAssetUrl).then((gltf) => {
      gltf.scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        // This compact distant model intentionally skips shadow rendering.
        mesh.castShadow = false;
        mesh.receiveShadow = false;
      });
      return { scene: gltf.scene, animations: gltf.animations };
    });
    deerPrototypeCache.current = pending;
    pending.catch(() => {
      if (deerPrototypeCache.current === pending) deerPrototypeCache.current = undefined;
    });
  }
  return pending;
}

function findDeerClip(clips: THREE.AnimationClip[], suffix: string): THREE.AnimationClip | undefined {
  const normalized = suffix.toLowerCase();
  return clips.find((clip) =>
    clip.name.toLowerCase() === normalized ||
    clip.name.toLowerCase().endsWith(`|${normalized}`) ||
    clip.name.toLowerCase().endsWith(normalized)
  );
}

function setDeerLodAnimation(root: THREE.Group, state: DeerAnimationState, fadeSeconds = 0.18): void {
  const actions = root.userData.deerAnimationActions as Partial<Record<DeerAnimationState, THREE.AnimationAction>> | undefined;
  if (!actions) return;

  const next = actions[state] || actions.idle;
  if (!next) return;
  const previous = root.userData.deerCurrentAction as THREE.AnimationAction | undefined;
  if (previous === next) return;

  if (previous) previous.fadeOut(fadeSeconds);
  next.reset();
  next.enabled = true;
  next.setEffectiveTimeScale(1);
  next.setEffectiveWeight(1);
  next.fadeIn(fadeSeconds);
  next.play();
  root.userData.deerCurrentAction = next;
}

/**
 * Adds a skinned Quaternius deer as a distant LOD while retaining the procedural
 * deer for close combat and inspection. SkeletonUtils.clone gives every deer an
 * independent skeleton; immutable geometry and materials remain shared.
 */
export function attachDeerAssetLod(root: THREE.Group): void {
  if (root.userData.deerAssetLoadStarted) return;
  if (!root.userData.deerDetailedVisual) return;
  root.userData.deerAssetLoadStarted = true;

  void loadDeerPrototype()
    .then((prototype) => {
      if (!root.parent || root.userData.deerAssetLod) return;

      const model = cloneSkeleton(prototype.scene) as THREE.Group;
      // The source animal faces local -Z; rotate that forward axis onto the
      // procedural deer rig's +X heading so both LODs turn identically.
      model.rotation.y = -Math.PI / 2;
      model.updateMatrixWorld(true);

      const bounds = new THREE.Box3().setFromObject(model);
      const height = Math.max(0.1, bounds.max.y - bounds.min.y);
      const scale = 1.62 / height;

      const simplifiedVisual = new THREE.Group();
      simplifiedVisual.name = 'deerAssetLod';
      simplifiedVisual.add(model);
      simplifiedVisual.scale.setScalar(scale);
      simplifiedVisual.position.y = -bounds.min.y * scale;
      simplifiedVisual.visible = false;
      root.add(simplifiedVisual);

      const mixer = new THREE.AnimationMixer(model);
      const idleClip = findDeerClip(prototype.animations, 'Idle') ||
        findDeerClip(prototype.animations, 'Idle_2');
      const grazeClip = findDeerClip(prototype.animations, 'Idle_Headlow') ||
        findDeerClip(prototype.animations, 'Eating') || idleClip;
      const walkClip = findDeerClip(prototype.animations, 'Walk') || idleClip;
      const gallopClip = findDeerClip(prototype.animations, 'Gallop') || walkClip || idleClip;
      const deathClip = findDeerClip(prototype.animations, 'Death') || idleClip;
      const actions: Partial<Record<DeerAnimationState, THREE.AnimationAction>> = {};

      const addAction = (state: DeerAnimationState, clip?: THREE.AnimationClip, oneShot = false) => {
        if (!clip) return;
        const action = mixer.clipAction(clip, model);
        action.setLoop(oneShot ? THREE.LoopOnce : THREE.LoopRepeat, oneShot ? 1 : Infinity);
        action.clampWhenFinished = oneShot;
        actions[state] = action;
      };

      addAction('idle', idleClip);
      addAction('graze', grazeClip);
      addAction('walk', walkClip);
      addAction('gallop', gallopClip);
      addAction('death', deathClip, true);

      root.userData.deerAssetLod = simplifiedVisual;
      root.userData.deerAnimationMixer = mixer;
      root.userData.deerAnimationActions = actions;
      root.userData.deerLodUsingDetailed = true;
      setDeerLodAnimation(root, (root.userData.deerVisualState as DeerAnimationState) || 'idle', 0);
    })
    .catch(() => {
      // The procedural animal remains available when the network or asset fails.
      root.userData.deerAssetLoadStarted = false;
    });
}

/** Keep the distant animated model in the same high-level state as the procedural deer. */
export function updateDeerAssetAnimation(root: THREE.Group, state: DeerAnimationState, dt: number): void {
  root.userData.deerVisualState = state;
  if (!root.userData.deerAssetLod) return;
  setDeerLodAnimation(root, state);
  const mixer = root.userData.deerAnimationMixer as THREE.AnimationMixer | undefined;
  mixer?.update(Math.max(0, dt));
}

/** Projected-size switching keeps animated GLB deer at distance and procedural detail nearby. */
export function updateDeerVisualLod(
  root: THREE.Group,
  camera: THREE.PerspectiveCamera,
  viewportHeight: number,
  forceHighDetail = false
): void {
  const detailedVisual = root.userData.deerDetailedVisual as THREE.Group | undefined;
  const simplifiedVisual = root.userData.deerAssetLod as THREE.Group | undefined;
  if (!detailedVisual || !simplifiedVisual) return;

  root.updateMatrixWorld(true);
  root.getWorldPosition(deerLodWorldCenter);
  root.getWorldScale(deerLodWorldScale);
  deerLodWorldCenter.y += 0.82 * deerLodWorldScale.y;

  const distance = Math.max(0.001, camera.position.distanceTo(deerLodWorldCenter));
  const safeHeight = Math.max(1, viewportHeight);
  const focalPixels = safeHeight /
    (2 * Math.tan(THREE.MathUtils.degToRad(camera.getEffectiveFOV()) * 0.5));
  const projectedRadius = (0.9 * deerLodWorldScale.x * focalPixels) / distance;
  const wasDetailed = root.userData.deerLodUsingDetailed !== false;
  const showDetailed = forceHighDetail || (wasDetailed ? projectedRadius >= 19 : projectedRadius >= 25);

  if (detailedVisual.visible !== showDetailed) detailedVisual.visible = showDetailed;
  if (simplifiedVisual.visible !== !showDetailed) simplifiedVisual.visible = !showDetailed;
  root.userData.deerLodUsingDetailed = showDetailed;
}


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
