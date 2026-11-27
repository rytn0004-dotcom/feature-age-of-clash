import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { DEER_ASSET_FORWARD_ALIGNMENT_YAW } from './wildlifeFacing';

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
      // The GLB's internal Z-up conversion leaves the deer facing local +Z
      // (Head bone sits ahead of Back along that axis). Rotate +90° around Y
      // to align its forward axis with the procedural rig's local +X heading.
      model.rotation.y = DEER_ASSET_FORWARD_ALIGNMENT_YAW;
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

  // Only the root transform is required for projected-size LOD. Recursively
  // updating every animated child before the renderer visits it is redundant.
  root.updateWorldMatrix(true, false);
  deerLodWorldCenter.setFromMatrixPosition(root.matrixWorld);
  deerLodWorldScale.setFromMatrixScale(root.matrixWorld);
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

  // Only the root transform is required for projected-size LOD. Recursively
  // updating every animated child before the renderer visits it is redundant.
  root.updateWorldMatrix(true, false);
  treeLodWorldCenter.setFromMatrixPosition(root.matrixWorld);
  treeLodWorldScale.setFromMatrixScale(root.matrixWorld);
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

export type FishSchoolType = 'shore' | 'deep';
type FishModelVariant = 'Fish1' | 'Fish2' | 'Fish3' | 'Shark' | 'Dolphin' | 'Manta_ray';
interface FishPrototype {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
}
interface FishLodTransform {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch?: number;
  scale: number;
}
const fishAssetUrls: Record<FishModelVariant, string> = {
  Fish1: `${import.meta.env.BASE_URL}assets/models/quaternius/fish/Fish1.glb`,
  Fish2: `${import.meta.env.BASE_URL}assets/models/quaternius/fish/Fish2.glb`,
  Fish3: `${import.meta.env.BASE_URL}assets/models/quaternius/fish/Fish3.glb`,
  Shark: `${import.meta.env.BASE_URL}assets/models/quaternius/fish/Shark.glb`,
  Dolphin: `${import.meta.env.BASE_URL}assets/models/quaternius/fish/Dolphin.glb`,
  Manta_ray: `${import.meta.env.BASE_URL}assets/models/quaternius/fish/Manta_ray.glb`,
};
const fishPrototypeCache = new Map<FishModelVariant, Promise<FishPrototype>>();
const fishLodWorldCenter = new THREE.Vector3();
const fishLodWorldScale = new THREE.Vector3();

function loadFishPrototype(variant: FishModelVariant): Promise<FishPrototype> {
  let pending = fishPrototypeCache.get(variant);
  if (!pending) {
    pending = gltfLoader.loadAsync(fishAssetUrls[variant]).then((gltf) => {
      gltf.scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
      });
      return { scene: gltf.scene, animations: gltf.animations };
    });
    fishPrototypeCache.set(variant, pending);
    pending.catch(() => {
      if (fishPrototypeCache.get(variant) === pending) fishPrototypeCache.delete(variant);
    });
  }
  return pending;
}

/** Adds three animated Quaternius fish as a distant LOD without replacing water or hit-test meshes. */
export function attachFishAssetLod(root: THREE.Group): void {
  if (root.userData.fishAssetLoadStarted || !root.userData.fishDetailedVisual) return;
  const schoolType = root.userData.fishVisualType as FishSchoolType | undefined;
  const transforms = root.userData.fishAssetTransforms as FishLodTransform[] | undefined;
  if (!schoolType || !transforms?.length) return;
  root.userData.fishAssetLoadStarted = true;

  const variants: FishModelVariant[] = schoolType === 'shore'
    ? ['Fish1', 'Fish2', 'Fish3']
    : ['Shark', 'Dolphin', 'Manta_ray'];

  void Promise.all(variants.map(loadFishPrototype))
    .then((prototypes) => {
      if (!root.parent || root.userData.fishAssetLod) return;

      const simplifiedVisual = new THREE.Group();
      simplifiedVisual.name = 'fishAssetLod';
      simplifiedVisual.visible = false;
      const mixers: THREE.AnimationMixer[] = [];

      prototypes.forEach((prototype, index) => {
        const entry = transforms[index];
        if (!entry) return;

        const model = cloneSkeleton(prototype.scene) as THREE.Group;
        // All fish assets use local -Z as their forward axis; the game school faces +X.
        model.rotation.y = -Math.PI / 2;
        model.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(model);
        const horizontalLength = Math.max(
          0.1,
          bounds.max.x - bounds.min.x,
          bounds.max.z - bounds.min.z
        );
        const targetLength = schoolType === 'shore' ? 0.52 : 0.72;
        const scale = targetLength / horizontalLength;
        model.scale.setScalar(scale);
        model.position.y = -((bounds.min.y + bounds.max.y) * 0.5) * scale;

        const fishRoot = new THREE.Group();
        fishRoot.position.set(entry.x, entry.y, entry.z);
        fishRoot.rotation.set(0, entry.yaw, entry.pitch || 0);
        fishRoot.scale.setScalar(entry.scale);
        fishRoot.add(model);
        simplifiedVisual.add(fishRoot);

        const swimClip = prototype.animations.find((clip) =>
          clip.name.toLowerCase().includes('swim')
        ) || prototype.animations[0];
        if (swimClip) {
          const mixer = new THREE.AnimationMixer(model);
          const swim = mixer.clipAction(swimClip, model);
          swim.setLoop(THREE.LoopRepeat, Infinity);
          swim.play();
          mixers.push(mixer);
        }
      });

      if (mixers.length === 0) {
        root.userData.fishAssetLoadStarted = false;
        return;
      }

      root.add(simplifiedVisual);
      root.userData.fishAssetLod = simplifiedVisual;
      root.userData.fishAnimationMixers = mixers;
      root.userData.fishLodUsingDetailed = true;
    })
    .catch(() => {
      // The instanced procedural fish remain visible if any GLB cannot be fetched.
      root.userData.fishAssetLoadStarted = false;
    });
}

/** Swim animations continue while the scene is paused, but only for visible LOD models. */
export function updateFishAssetAnimations(root: THREE.Group, dt: number): void {
  const asset = root.userData.fishAssetLod as THREE.Group | undefined;
  if (!asset?.visible) return;
  const mixers = root.userData.fishAnimationMixers as THREE.AnimationMixer[] | undefined;
  mixers?.forEach((mixer) => mixer.update(Math.max(0, Math.min(dt, 0.1))));
}

/** Switch fish geometry by projected size while keeping the water, ripples and raycast disc visible. */
export function updateFishVisualLod(
  root: THREE.Group,
  camera: THREE.PerspectiveCamera,
  viewportHeight: number,
  forceHighDetail = false
): void {
  const detailedVisual = root.userData.fishDetailedVisual as THREE.Group | undefined;
  const simplifiedVisual = root.userData.fishAssetLod as THREE.Group | undefined;
  if (!detailedVisual || !simplifiedVisual) return;

  // Only the root transform is required for projected-size LOD. Recursively
  // updating every animated child before the renderer visits it is redundant.
  root.updateWorldMatrix(true, false);
  fishLodWorldCenter.setFromMatrixPosition(root.matrixWorld);
  fishLodWorldScale.setFromMatrixScale(root.matrixWorld);
  fishLodWorldCenter.y += 0.45 * fishLodWorldScale.y;

  const distance = Math.max(0.001, camera.position.distanceTo(fishLodWorldCenter));
  const safeHeight = Math.max(1, viewportHeight);
  const focalPixels = safeHeight /
    (2 * Math.tan(THREE.MathUtils.degToRad(camera.getEffectiveFOV()) * 0.5));
  const projectedRadius = (1.05 * fishLodWorldScale.x * focalPixels) / distance;
  const wasDetailed = root.userData.fishLodUsingDetailed !== false;
  const showDetailed = forceHighDetail || (wasDetailed ? projectedRadius >= 24 : projectedRadius >= 30);

  if (detailedVisual.visible !== showDetailed) detailedVisual.visible = showDetailed;
  if (simplifiedVisual.visible !== !showDetailed) simplifiedVisual.visible = !showDetailed;
  root.userData.fishLodUsingDetailed = showDetailed;
}
