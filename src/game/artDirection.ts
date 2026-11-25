import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BuildingType, CivilizationId, UnitCategory } from '../types/game';

export interface UnitArtPalette {
  primary: number;
  secondary: number;
  banner: number;
}

export interface UnitSignatureKitOptions {
  unitId: string;
  civilization: CivilizationId;
  category: UnitCategory;
  modelType: string;
  age: number;
  palette: UnitArtPalette;
}

type ArtVariant = 0 | 1 | 2;
type ArtRole = 'frontline' | 'ranger' | 'skirmisher' | 'arcanist' | 'mounted' | 'laborer' | 'champion' | 'artificer';

interface SculptPart {
  geometry: THREE.BufferGeometry;
  color: number;
  position: [number, number, number];
  scale: [number, number, number];
  rotation?: [number, number, number];
}

const signatureGeometryCache = new Map<string, THREE.BufferGeometry>();
const signatureMaterialCache = new Map<string, THREE.MeshStandardMaterial>();
const signatureClothGeometryCache = new Map<string, THREE.BufferGeometry>();
const signatureClothMaterialCache = new Map<string, THREE.MeshStandardMaterial>();
const faceGeometryCache = new Map<string, THREE.BufferGeometry>();
const faceMaterialCache = new Map<string, THREE.MeshStandardMaterial>();

/** Stable per-entity art variation: units look related without being identical clones. */
export function getDeterministicArtVariant(unitId: string): ArtVariant {
  let hash = 2166136261;
  for (let i = 0; i < unitId.length; i++) {
    hash ^= unitId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 3) as ArtVariant;
}

function colorKey(palette: UnitArtPalette): string {
  return [palette.primary, palette.secondary, palette.banner]
    .map((value) => value.toString(16))
    .join('-');
}

function makePart(
  geometry: THREE.BufferGeometry,
  color: number,
  position: [number, number, number],
  scale: [number, number, number] = [1, 1, 1],
  rotation: [number, number, number] = [0, 0, 0]
): SculptPart {
  return { geometry, color, position, scale, rotation };
}

/** Build one vertex-coloured geometry so each character gets only one extra draw call. */
function mergeSculptParts(parts: SculptPart[]): THREE.BufferGeometry {
  const geometries: THREE.BufferGeometry[] = [];
  for (const part of parts) {
    let geometry = part.geometry;
    // Primitive generators mix indexed and non-indexed layouts. Normalize before merging.
    if (geometry.index) {
      const nonIndexed = geometry.toNonIndexed();
      geometry.dispose();
      geometry = nonIndexed;
    }
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(...part.position),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...part.rotation!)),
      new THREE.Vector3(...part.scale)
    );
    geometry.applyMatrix4(matrix);
    const tint = new THREE.Color(part.color);
    const position = geometry.getAttribute('position');
    const colors = new Float32Array(position.count * 3);
    for (let i = 0; i < position.count; i++) {
      const offset = i * 3;
      colors[offset] = tint.r;
      colors[offset + 1] = tint.g;
      colors[offset + 2] = tint.b;
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometries.push(geometry);
  }

  const merged = mergeGeometries(geometries, false);
  geometries.forEach((geometry) => geometry.dispose());
  if (!merged) {
    throw new Error('Unable to merge procedural character art geometry');
  }
  merged.computeBoundingSphere();
  return merged;
}

function resolveArtRole(category: UnitCategory, modelType: string): ArtRole | null {
  if (category === 'siege' || modelType === 'boat' || modelType === 'ram' || modelType === 'cannon' || modelType === 'golem') {
    return null;
  }
  if (modelType === 'artificer') return 'artificer';
  if (category === 'worker') return 'laborer';
  if (category === 'cavalry' || modelType === 'knight') return 'mounted';
  if (modelType === 'mage' || modelType === 'oracle' || modelType === 'shaman') return 'arcanist';
  if (modelType === 'guardian') return 'frontline';
  if (modelType === 'ninja') return 'skirmisher';
  if (modelType === 'saiyan') return 'champion';
  if (category === 'ranged' || modelType === 'archer') return 'ranger';
  return 'frontline';
}

export interface UnitBodyProportionProfile {
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  archetype: ArtRole | 'neutral';
  variant: ArtVariant;
}

/**
 * Gives each combat role a readable body silhouette before equipment is layered on.
 * The small deterministic offsets add natural crowd variation without affecting gameplay.
 */
export function getUnitBodyProportionProfile(
  unitId: string,
  category: UnitCategory,
  modelType: string
): UnitBodyProportionProfile {
  const archetype = resolveArtRole(category, modelType);
  const base: Record<ArtRole, [number, number, number]> = {
    laborer: [1.035, 0.97, 1.04],
    mounted: [1.015, 1.005, 1.025],
    arcanist: [0.965, 1.055, 0.97],
    ranger: [0.945, 1.045, 0.955],
    skirmisher: [0.925, 1.06, 0.93],
    frontline: [1.065, 1.0, 1.035],
    champion: [1.025, 1.065, 0.99],
    artificer: [1.045, 0.985, 1.055],
  };
  const variant = getDeterministicArtVariant(unitId);
  const variation: Record<ArtVariant, [number, number, number]> = {
    0: [-0.012, 0.014, -0.008],
    1: [0.012, -0.008, 0.01],
    2: [0, 0, 0],
  };
  const profile = archetype ? base[archetype] : [1, 1, 1];
  const offset = variation[variant];
  return {
    scaleX: THREE.MathUtils.clamp(profile[0] + offset[0], 0.9, 1.12),
    scaleY: THREE.MathUtils.clamp(profile[1] + offset[1], 0.9, 1.12),
    scaleZ: THREE.MathUtils.clamp(profile[2] + offset[2], 0.9, 1.12),
    archetype: archetype || 'neutral',
    variant,
  };
}

function createSignatureGeometry(
  civilization: CivilizationId,
  role: ArtRole,
  variant: ArtVariant,
  tier: number,
  palette: UnitArtPalette
): THREE.BufferGeometry {
  const p: SculptPart[] = [];
  const add = (
    geometry: THREE.BufferGeometry,
    color: number,
    position: [number, number, number],
    scale: [number, number, number] = [1, 1, 1],
    rotation: [number, number, number] = [0, 0, 0]
  ) => p.push(makePart(geometry, color, position, scale, rotation));
  const metal = palette.secondary;
  const cloth = palette.primary;
  const emblem = palette.banner;
  const tierScale = 1 + tier * 0.055;

  if (role === 'laborer') {
    // Art-directed craft harness: a compact utility pack, asymmetric shoulder pad and tool-belt pouches.
    add(new THREE.BoxGeometry(0.34, 0.055, 0.12), metal, [0, 0.19, 0.015]);
    add(new THREE.BoxGeometry(0.22, 0.27, 0.10), cloth, [0, 0.36, -0.285], [1, 1, 0.82]);
    add(new THREE.SphereGeometry(0.085, 10, 8), emblem, [0.22, 0.16, 0.11], [1.25, 0.85, 0.65]);
    add(new RoundedBoxGeometry(0.12, 0.16, 0.07, 2, 0.018), metal, [-0.19, 0.18, 0.19]);
    add(new THREE.TorusGeometry(0.11, 0.018, 5, 12), emblem, [0, 0.48, -0.27], [1, 1, 1], [Math.PI / 2, 0, 0]);
  } else if (role === 'mounted') {
    // Horse barding gets its own silhouette language instead of scaling infantry ornaments onto a rider.
    add(new RoundedBoxGeometry(0.34, 0.32, 0.075, 3, 0.045), cloth, [0, 0.88, 0.58], [1, 1.12, 1]);
    add(new THREE.OctahedronGeometry(0.13 * tierScale, 1), emblem, [0, 0.9, 0.64], [1, 1.24, 0.55]);
    add(new RoundedBoxGeometry(0.19, 0.26, 0.065, 3, 0.025), metal, [-0.36, 0.93, -0.06], [1, 1, 0.8], [0, 0, -0.12]);
    add(new RoundedBoxGeometry(0.19, 0.26, 0.065, 3, 0.025), metal, [0.36, 0.93, -0.06], [1, 1, 0.8], [0, 0, 0.12]);
    if (civilization === 'fantasy') {
      add(new THREE.ConeGeometry(0.065, 0.3, 6), emblem, [-0.15, 1.22, -0.03], [1, 1, 1], [0, 0, 0.38]);
      add(new THREE.ConeGeometry(0.065, 0.3, 6), emblem, [0.15, 1.22, -0.03], [1, 1, 1], [0, 0, -0.38]);
    } else {
      add(new THREE.TorusGeometry(0.17, 0.026, 6, 14), metal, [0, 1.2, -0.22], [1, 0.78, 1], [Math.PI / 2, 0, 0]);
    }
  } else if (role === 'arcanist') {
    // A structured mantle and faceted focus frame make the mage read as a specialist at RTS scale.
    add(new THREE.TorusGeometry(0.245, 0.045, 7, 18), metal, [0, 0.95, -0.02], [1, 0.8, 1], [Math.PI / 2, 0, 0]);
    add(new RoundedBoxGeometry(0.13, 0.58, 0.045, 3, 0.022), cloth, [0, 0.46, 0.255], [1, 1, 1], [0, 0, variant === 1 ? 0.08 : -0.04]);
    add(new THREE.OctahedronGeometry(0.115 + tier * 0.012, 1), emblem, [0, 0.87, 0.29], [0.9, 1.2, 0.58]);
    add(new THREE.SphereGeometry(0.12, 10, 8), metal, [-0.27, 0.76, -0.05], [1, 0.72, 0.82]);
    add(new THREE.SphereGeometry(0.12, 10, 8), metal, [0.27, 0.76, -0.05], [1, 0.72, 0.82]);
    if (civilization === 'anime') {
      add(new RoundedBoxGeometry(0.075, 0.34, 0.025, 2, 0.012), emblem, [0.2, 0.28, -0.28], [1, 1, 1], [0, 0, -0.2]);
      add(new RoundedBoxGeometry(0.075, 0.34, 0.025, 2, 0.012), cloth, [-0.2, 0.28, -0.28], [1, 1, 1], [0, 0, 0.2]);
    } else {
      add(new THREE.TorusGeometry(0.2, 0.018, 5, 16), emblem, [0, 0.48, -0.27], [1, 1, 1], [Math.PI / 2, 0, 0]);
    }
  } else if (role === 'artificer') {
    // A deliberately asymmetrical toolwright silhouette: reinforced harness, shoulder tool-rail and a gear hub.
    add(new RoundedBoxGeometry(0.13, 0.54, 0.075, 3, 0.024), cloth, [-0.105, 0.27, 0.255], [1, 1, 1], [0, 0, -0.22]);
    add(new RoundedBoxGeometry(0.27, 0.19, 0.14, 3, 0.035), metal, [0.285, 0.54, 0.015], [1, 1, 1], [0, 0, -0.12]);
    add(new THREE.TorusGeometry(0.13, 0.026, 6, 16), emblem, [-0.23, 0.39, -0.29], [1, 0.84, 1], [Math.PI / 2, 0, 0]);
    add(new THREE.CylinderGeometry(0.075, 0.09, 0.09, 10), metal, [-0.23, 0.39, -0.29], [1, 1, 1], [Math.PI / 2, 0, 0]);
    add(new THREE.OctahedronGeometry(0.06, 0), emblem, [0.285, 0.57, 0.105], [1, 1.15, 0.7]);
  } else if (role === 'ranger' || role === 'skirmisher') {
    // Asymmetric shoulder mantle, arm bracer and paired backstreamers give agile units a clean readable profile.
    const isSkirmisher = role === 'skirmisher';
    add(new THREE.SphereGeometry(1, 12, 8), metal, [-0.255, 0.54, -0.015], [0.19 * tierScale, 0.11, 0.2]);
    add(new RoundedBoxGeometry(0.12, 0.24, 0.09, 3, 0.025), cloth, [0.3, 0.34, 0.06], [1, 1, 1], [0, 0, -0.12]);
    add(new THREE.OctahedronGeometry(0.075, 1), emblem, [-0.26, 0.57, 0.09], [0.9, 1.15, 0.55]);
    add(new RoundedBoxGeometry(0.12, 0.44, 0.045, 3, 0.018), cloth, [-0.17, 0.16, -0.3], [1, 1, 1], [0.05, 0, -0.16]);
    add(new RoundedBoxGeometry(0.12, 0.38, 0.045, 3, 0.018), emblem, [0.18, 0.18, -0.3], [1, 1, 1], [-0.04, 0, 0.18]);
    if (isSkirmisher || civilization === 'anime') {
      add(new THREE.TorusGeometry(0.19, 0.035, 6, 14), emblem, [0, 0.61, -0.04], [1, 1, 1], [Math.PI / 2, 0, 0]);
      add(new RoundedBoxGeometry(0.07, 0.19, 0.025, 2, 0.01), metal, [0.17, 0.36, -0.34], [1, 1, 1], [0, 0, -0.18]);
    } else {
      add(new THREE.TorusGeometry(0.16, 0.02, 5, 14), metal, [0, 0.2, 0.01], [1, 1, 1], [Math.PI / 2, 0, 0]);
    }
  } else {
    // Frontline/champion: layered shoulder silhouette, cuirass crest, articulated waist lames.
    const shoulderGeo = new THREE.SphereGeometry(1, 14, 10);
    add(shoulderGeo, metal, [-0.265, 0.54, 0], [0.19 * tierScale, 0.13 * tierScale, 0.21]);
    add(new THREE.SphereGeometry(1, 14, 10), metal, [0.265, 0.54, 0], [0.19 * tierScale, 0.13 * tierScale, 0.21]);
    add(new RoundedBoxGeometry(0.29, 0.32, 0.065, 3, 0.04), cloth, [0, 0.39, 0.235], [1, 1, 1], [0, 0, variant === 1 ? 0.04 : 0]);
    add(new THREE.OctahedronGeometry(0.09 + tier * 0.01, 1), emblem, [0, 0.42, 0.292], [0.88, 1.24, 0.55]);
    for (const x of [-0.14, 0, 0.14]) {
      add(new RoundedBoxGeometry(0.105, 0.23, 0.05, 3, 0.022), metal, [x, 0.035, 0.23], [1, 1 + tier * 0.04, 1], [0, 0, -x * 0.5]);
    }
    if (civilization === 'fantasy') {
      add(new THREE.ConeGeometry(0.06, 0.3 + tier * 0.025, 6), emblem, [-0.31, 0.69, -0.02], [1, 1, 1], [0, 0, 0.42]);
      add(new THREE.ConeGeometry(0.06, 0.3 + tier * 0.025, 6), emblem, [0.31, 0.69, -0.02], [1, 1, 1], [0, 0, -0.42]);
    } else if (civilization === 'anime') {
      add(new RoundedBoxGeometry(0.08, 0.46, 0.035, 2, 0.015), emblem, [-0.2, 0.13, -0.29], [1, 1, 1], [0, 0, -0.18]);
      add(new RoundedBoxGeometry(0.08, 0.46, 0.035, 2, 0.015), cloth, [0.2, 0.13, -0.29], [1, 1, 1], [0, 0, 0.18]);
    } else {
      add(new THREE.TorusGeometry(0.19, 0.02, 5, 14), emblem, [0, 0.69, -0.12], [1, 0.8, 1], [Math.PI / 2, 0, 0]);
    }
  }

  if (tier >= 1 && role !== 'laborer') {
    const rivet = new THREE.SphereGeometry(0.027, 8, 6);
    add(rivet, 0xffe7a3, [-0.24, 0.56, 0.13], [1, 1, 0.6]);
    add(new THREE.SphereGeometry(0.027, 8, 6), 0xffe7a3, [0.24, 0.56, 0.13], [1, 1, 0.6]);
  }
  if (variant === 2 && role !== 'laborer') {
    add(new THREE.ConeGeometry(0.055, 0.18 + tier * 0.025, 5), emblem, [0, role === 'mounted' ? 1.32 : 0.76, -0.12], [1, 1, 1], [0.18, 0, 0]);
  }

  return mergeSculptParts(p);
}

function getSignatureGeometry(options: UnitSignatureKitOptions, role: ArtRole): THREE.BufferGeometry {
  const tier = Math.max(0, Math.min(3, Math.floor(options.age) - 1));
  const variant = getDeterministicArtVariant(options.unitId);
  const key = [options.civilization, role, variant, tier, colorKey(options.palette)].join('|');
  let geometry = signatureGeometryCache.get(key);
  if (!geometry) {
    geometry = createSignatureGeometry(options.civilization, role, variant, tier, options.palette);
    signatureGeometryCache.set(key, geometry);
  }
  return geometry;
}

function getSignatureMaterial(options: UnitSignatureKitOptions): THREE.MeshStandardMaterial {
  const key = [options.civilization, colorKey(options.palette)].join('|');
  let material = signatureMaterialCache.get(key);
  if (!material) {
    material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      metalness: options.civilization === 'fantasy' ? 0.52 : 0.64,
      roughness: options.civilization === 'anime' ? 0.38 : 0.44,
    });
    signatureMaterialCache.set(key, material);
  }
  return material;
}

function createSplitClothPanelGeometry(width: number, height: number, variant: ArtVariant): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const notch = variant === 1 ? 0.29 : variant === 2 ? 0.34 : 0.31;
  shape.moveTo(-width * 0.5, height * 0.5);
  shape.bezierCurveTo(-width * 0.52, height * 0.06, -width * 0.47, -height * 0.2, -width * 0.36, -height * 0.5);
  shape.lineTo(-width * 0.09, -height * 0.45);
  shape.lineTo(0, -height * notch);
  shape.lineTo(width * 0.09, -height * 0.45);
  shape.lineTo(width * 0.36, -height * 0.5);
  shape.bezierCurveTo(width * 0.47, -height * 0.2, width * 0.52, height * 0.06, width * 0.5, height * 0.5);
  shape.quadraticCurveTo(0, height * 0.42, -width * 0.5, height * 0.5);

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.028,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelThickness: 0.009,
    bevelSize: 0.008,
    curveSegments: 7,
  });
  geometry.translate(0, 0, -0.014);
  geometry.computeVertexNormals();
  return geometry;
}

function createSignatureClothGeometry(
  role: ArtRole,
  variant: ArtVariant,
  tier: number,
  palette: UnitArtPalette
): THREE.BufferGeometry {
  const parts: SculptPart[] = [];
  const addPanel = (
    width: number,
    height: number,
    color: number,
    position: [number, number, number],
    rotation: [number, number, number] = [0, 0, 0],
    scale: [number, number, number] = [1, 1, 1]
  ) => parts.push(makePart(createSplitClothPanelGeometry(width, height, variant), color, position, scale, rotation));
  const tierScale = 1 + tier * 0.035;

  if (role === 'laborer') {
    addPanel(0.24, 0.34, palette.primary, [0, 0.015, 0.265]);
    parts.push(makePart(new RoundedBoxGeometry(0.045, 0.22, 0.025, 2, 0.009), palette.banner, [0, 0.07, 0.29]));
  } else if (role === 'mounted') {
    // A split saddle cloth reads as horse equipment, not another infantry cape.
    addPanel(0.23, 0.4, palette.primary, [-0.34, 0.58, 0.4], [0, 0, -0.12], [1, 1, 0.72]);
    addPanel(0.23, 0.4, palette.banner, [0.34, 0.58, 0.4], [0, 0, 0.12], [1, 1, 0.72]);
  } else if (role === 'arcanist') {
    addPanel(0.18, 0.62, palette.primary, [0, 0.17, 0.305], [0.04, 0, 0]);
    addPanel(0.13, 0.5, palette.banner, [-0.2, 0.14, -0.245], [0, 0, -0.1]);
    addPanel(0.13, 0.5, palette.primary, [0.2, 0.14, -0.245], [0, 0, 0.1]);
  } else if (role === 'ranger' || role === 'skirmisher') {
    const panelHeight = role === 'skirmisher' ? 0.46 : 0.58;
    addPanel(0.13, panelHeight, palette.primary, [-0.15, 0.16, -0.315], [0.02, 0, -0.11]);
    addPanel(0.13, panelHeight, palette.banner, [0.15, 0.16, -0.315], [-0.02, 0, 0.11]);
    if (role === 'ranger') addPanel(0.2, 0.32, palette.primary, [0, 0.02, 0.29]);
  } else if (role === 'frontline') {
    addPanel(0.3, 0.54 * tierScale, palette.primary, [0, 0.12, 0.32]);
    parts.push(makePart(new THREE.OctahedronGeometry(0.075, 1), palette.banner, [0, 0.34, 0.355], [0.9, 1.2, 0.5]));
  } else if (role === 'champion') {
    addPanel(0.34, 0.61 * tierScale, palette.primary, [0, 0.13, 0.33]);
    addPanel(0.2, 0.45, palette.banner, [0, 0.12, -0.31]);
  } else {
    // Artificers wear a leather work apron with a clipped side tool-roll.
    addPanel(0.25, 0.39, palette.primary, [0, 0.035, 0.285]);
    addPanel(0.14, 0.34, palette.banner, [0.23, 0.12, -0.2], [0, 0, -0.18]);
  }

  return mergeSculptParts(parts);
}

function getSignatureClothGeometry(options: UnitSignatureKitOptions, role: ArtRole): THREE.BufferGeometry {
  const tier = Math.max(0, Math.min(3, Math.floor(options.age) - 1));
  const variant = getDeterministicArtVariant(options.unitId);
  const key = [options.civilization, role, variant, tier, colorKey(options.palette)].join('|');
  let geometry = signatureClothGeometryCache.get(key);
  if (!geometry) {
    geometry = createSignatureClothGeometry(role, variant, tier, options.palette);
    signatureClothGeometryCache.set(key, geometry);
  }
  return geometry;
}

function getSignatureClothMaterial(options: UnitSignatureKitOptions): THREE.MeshStandardMaterial {
  const key = [options.civilization, colorKey(options.palette)].join('|');
  let material = signatureClothMaterialCache.get(key);
  if (!material) {
    material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.9,
      metalness: 0.025,
      side: THREE.DoubleSide,
    });
    signatureClothMaterialCache.set(key, material);
  }
  return material;
}


/** Fresh, original faction motifs layered over the legacy rig; no generated model files are required. */
export function createUnitSignatureKit(options: UnitSignatureKitOptions): THREE.Group {
  const group = new THREE.Group();
  group.name = 'originalFactionSilhouetteKit';
  const role = resolveArtRole(options.category, options.modelType);
  if (!role) return group;

  const mesh = new THREE.Mesh(getSignatureGeometry(options, role), getSignatureMaterial(options));
  mesh.name = 'originalFactionSilhouette';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);

  const cloth = new THREE.Mesh(getSignatureClothGeometry(options, role), getSignatureClothMaterial(options));
  cloth.name = 'originalFactionCloth';
  cloth.castShadow = true;
  cloth.receiveShadow = false;
  cloth.userData.distanceLodMinPixels = 3.8;
  group.add(cloth);

  group.userData.artDirection = options.civilization;
  group.userData.artRole = role;
  group.userData.artVariant = getDeterministicArtVariant(options.unitId);
  return group;
}

export interface CharacterFaceOptions {
  civilization?: CivilizationId;
  modelType?: string;
  unitId?: string;
}

function createFaceGeometry(
  eyeColor: number,
  options: CharacterFaceOptions = {}
): THREE.BufferGeometry {
  const parts: SculptPart[] = [];
  const add = (
    geometry: THREE.BufferGeometry,
    color: number,
    position: [number, number, number],
    scale: [number, number, number],
    rotation: [number, number, number] = [0, 0, 0]
  ) => parts.push(makePart(geometry, color, position, scale, rotation));
  const white = 0xf8fafc;
  const ink = 0x171923;
  const civilization = options.civilization || 'medieval';
  const modelType = options.modelType || 'villager';
  const variant = getDeterministicArtVariant(options.unitId || modelType);
  const hairColor =
    modelType === 'saiyan'
      ? 0xfacc15
      : civilization === 'anime'
        ? variant === 0 ? 0x1e1b4b : variant === 1 ? 0x7c2d92 : 0x0f766e
        : civilization === 'fantasy'
          ? variant === 0 ? 0xdbeafe : variant === 1 ? 0x78350f : 0x475569
          : variant === 0 ? 0x422006 : variant === 1 ? 0x292524 : 0x713f12;

  // Eyes, irises, catchlights, eyebrows and sculpted nose; all merged into one face-detail draw call.
  for (const x of [-0.066, 0.066]) {
    add(new THREE.SphereGeometry(0.029, 10, 8), white, [x, 0.012, 0.158], [1.2, 0.78, 0.52]);
    add(new THREE.SphereGeometry(0.015, 8, 6), eyeColor, [x, 0.01, 0.176], [0.9, 1.05, 0.45]);
    add(new THREE.SphereGeometry(0.008, 8, 6), ink, [x, 0.01, 0.183], [1, 1, 0.45]);
    add(new THREE.SphereGeometry(0.0045, 6, 5), white, [x - 0.004, 0.016, 0.188], [1, 1, 0.42]);
    add(new RoundedBoxGeometry(0.052, 0.012, 0.012, 2, 0.003), ink, [x, 0.055, 0.154], [1, 1, 1], [0, 0, x > 0 ? -0.08 : 0.08]);
  }
  add(new THREE.OctahedronGeometry(0.024, 0), 0xe9b49d, [0, -0.02, 0.174], [0.75, 1.25, 0.72]);
  add(new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.03, -0.09, 0.16),
      new THREE.Vector3(0, -0.098, 0.168),
      new THREE.Vector3(0.03, -0.09, 0.16),
    ]),
    8,
    0.006,
    5,
    false
  ), 0x8b4a42, [0, 0, 0], [1, 1, 1]);

  // Hairline and side locks vary by civilization and deterministic unit identity.
  // Hooded / helmed archetypes keep their bespoke authored headwear unobstructed.
  const hasDedicatedHeadwear = ['archer', 'mage', 'shaman', 'ninja', 'saiyan'].includes(modelType);
  if (!hasDedicatedHeadwear) {
    add(
      new THREE.SphereGeometry(0.178, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.58),
      hairColor,
      [0, 0.105, -0.018],
      [1.02, 0.82, 0.98]
    );
    for (const side of [-1, 1]) {
      const lockHeight = civilization === 'anime' ? 0.2 : 0.15;
      add(
        new THREE.CapsuleGeometry(0.043, lockHeight, 4, 8),
        hairColor,
        [side * 0.145, -0.012, 0.015],
        [0.78, 1, 0.82],
        [0, 0, side * -0.16]
      );
    }
  }
  if (civilization === 'anime') {
    // Layered fringe and paired hair ornaments create a recognisable anime silhouette.
    for (let index = 0; index < 3; index++) {
      const x = (index - 1) * 0.082;
      add(
        new RoundedBoxGeometry(0.072, 0.12 + (index === 1 ? 0.035 : 0), 0.045, 3, 0.018),
        hairColor,
        [x, 0.095 - Math.abs(index - 1) * 0.012, 0.13],
        [1, 1, 0.9],
        [0, 0, (index - 1) * -0.18]
      );
    }
    const clipColor = modelType === 'saiyan' ? 0xfacc15 : 0xf9a8d4;
    add(new THREE.TorusGeometry(0.052, 0.012, 5, 12), clipColor, [-0.17, 0.13, 0.03], [1, 0.7, 1], [Math.PI / 2, 0, 0]);
    add(new THREE.TorusGeometry(0.052, 0.012, 5, 12), clipColor, [0.17, 0.13, 0.03], [1, 0.7, 1], [Math.PI / 2, 0, 0]);
  } else if (civilization === 'fantasy') {
    // Fine circlet and tapered ear tips: visible at close range but don't collide with a mage's tall hat.
    if (modelType !== 'mage') {
      add(new THREE.TorusGeometry(0.17, 0.014, 5, 20, Math.PI), 0xd6b56d, [0, 0.105, 0.045], [1, 0.72, 1], [Math.PI / 2, 0, 0]);
    }
    for (const side of [-1, 1]) {
      add(new THREE.ConeGeometry(0.037, 0.22, 5), hairColor, [side * 0.19, -0.02, 0], [0.72, 1, 0.62], [0, 0, side * -Math.PI / 2]);
    }
  } else {
    // A simple leather/hair brow band for the grounded historical silhouette.
    add(new THREE.TorusGeometry(0.17, 0.014, 5, 18, Math.PI), 0x6b3e1b, [0, 0.07, 0.05], [1, 0.75, 1], [Math.PI / 2, 0, 0]);
  }

  if (modelType === 'villager' || modelType === 'artificer') {
    // Short beard and moustache enrich worker faces without forcing every unit into the same appearance.
    add(new THREE.SphereGeometry(0.047, 10, 7), hairColor, [-0.042, -0.105, 0.132], [1, 0.5, 0.68]);
    add(new THREE.SphereGeometry(0.047, 10, 7), hairColor, [0.042, -0.105, 0.132], [1, 0.5, 0.68]);
    add(new THREE.ConeGeometry(0.052, 0.12, 7), hairColor, [0, -0.16, 0.11], [1, 1, 0.72], [Math.PI, 0, 0]);
  }
  return mergeSculptParts(parts);
}

const faceHairGeometryCache = new Map<number, THREE.BufferGeometry>();
const faceHairMaterialCache = new Map<number, THREE.MeshStandardMaterial>();

function createCharacterHairTail(options: CharacterFaceOptions, hairColor: number): THREE.Group | undefined {
  const civilization = options.civilization || 'medieval';
  const modelType = options.modelType || 'villager';
  if (civilization === 'medieval' || modelType === 'artificer') return undefined;

  let geometry = faceHairGeometryCache.get(hairColor);
  if (!geometry) {
    const tailCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.015, -0.065, -0.08),
      new THREE.Vector3(-0.025, -0.14, -0.18),
      new THREE.Vector3(0.012, -0.22, -0.28),
    ]);
    geometry = new THREE.TubeGeometry(tailCurve, 16, 0.043, 7, false);
    faceHairGeometryCache.set(hairColor, geometry);
  }
  let material = faceHairMaterialCache.get(hairColor);
  if (!material) {
    material = new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.76 });
    faceHairMaterialCache.set(hairColor, material);
  }
  const hairTail = new THREE.Group();
  hairTail.name = 'secondaryMotion:hair';
  hairTail.userData.secondaryMotion = {
    axis: 'x',
    amplitude: 0.2,
    frequency: 5.8,
    phase: getDeterministicArtVariant(options.unitId || modelType) * 0.7,
  };
  hairTail.position.set(0, 0.07, -0.125);
  const tail = new THREE.Mesh(geometry, material);
  tail.castShadow = true;
  hairTail.add(tail);
  return hairTail;
}
export function createCharacterFaceDetails(
  eyeColor: number,
  options: CharacterFaceOptions = {}
): THREE.Group {
  const variant = getDeterministicArtVariant(options.unitId || options.modelType || 'villager');
  const key = [eyeColor.toString(16), options.civilization || 'medieval', options.modelType || 'villager', variant].join('|');
  let geometry = faceGeometryCache.get(key);
  if (!geometry) {
    geometry = createFaceGeometry(eyeColor, options);
    faceGeometryCache.set(key, geometry);
  }
  const modelType = options.modelType || 'villager';
  const civilization = options.civilization || 'medieval';
  const variantHairColor =
    modelType === 'saiyan'
      ? 0xfacc15
      : civilization === 'anime'
        ? variant === 0 ? 0x1e1b4b : variant === 1 ? 0x7c2d92 : 0x0f766e
        : variant === 0 ? 0xdbeafe : variant === 1 ? 0x78350f : 0x475569;
  const hairTail = createCharacterHairTail(options, variantHairColor);
  let material = faceMaterialCache.get(key);
  if (!material) {
    material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.48,
      metalness: 0.02,
    });
    faceMaterialCache.set(key, material);
  }
  const group = new THREE.Group();
  group.name = 'sculptedCharacterFace';
  const face = new THREE.Mesh(geometry, material);
  face.name = 'sculptedFaceDetails';
  face.raycast = () => {};
  group.add(face);
  if (hairTail) {
    group.add(hairTail);
    group.userData.secondaryMotionParts = [{
      object: hairTail,
      axis: 'x',
      amplitude: 0.2,
      frequency: 5.8,
      phase: variant * 0.7,
    }];
  } else {
    group.userData.secondaryMotionParts = [];
  }
  group.userData.artVariant = variant;
  group.userData.artCivilization = options.civilization || 'medieval';
  return group;
}



// ----------------- CHARACTER GRIP HANDS -----------------

const handGeometryCache = new Map<string, THREE.BufferGeometry>();
const handMaterialCache = new Map<string, THREE.MeshStandardMaterial>();

function createCharacterHandGeometry(
  skinColor: number,
  trimColor: number,
  variant: ArtVariant
): THREE.BufferGeometry {
  const parts: SculptPart[] = [];
  const add = (
    geometry: THREE.BufferGeometry,
    color: number,
    position: [number, number, number],
    scale: [number, number, number] = [1, 1, 1],
    rotation: [number, number, number] = [0, 0, 0]
  ) => parts.push(makePart(geometry, color, position, scale, rotation));

  // A compact palm, tapered wrist cuff, four curled fingers and a separately shaped thumb.
  // The open end faces the forearm so the hand can be positioned at each rig's wrist pivot.
  add(new THREE.CylinderGeometry(0.052, 0.061, 0.055, 10), trimColor, [0, 0.105, 0]);
  add(new RoundedBoxGeometry(0.115, 0.135, 0.074, 3, 0.025), skinColor, [0, 0.012, 0.012]);
  const fingerSpread = variant === 1 ? 0.023 : 0.022;
  for (let i = 0; i < 4; i++) {
    const x = (i - 1.5) * fingerSpread;
    const length = 0.071 + (i === 1 || i === 2 ? 0.008 : 0);
    add(
      new THREE.CapsuleGeometry(0.012, length, 3, 6),
      skinColor,
      [x, -0.078 - (i === 0 || i === 3 ? 0.004 : 0), 0.031],
      [1, 1, 0.9],
      [0, 0, (i - 1.5) * 0.035]
    );
    add(
      new THREE.SphereGeometry(0.014, 7, 6),
      0xd8a995,
      [x, -0.034, 0.052],
      [1, 0.82, 0.62]
    );
  }
  add(
    new THREE.CapsuleGeometry(0.017, 0.064, 3, 7),
    skinColor,
    [0.067, -0.018, 0.015],
    [1, 1, 0.92],
    [0, 0, -0.72]
  );
  add(new THREE.SphereGeometry(0.017, 7, 6), skinColor, [0.071, -0.047, 0.035], [1, 0.82, 0.78]);
  return mergeSculptParts(parts);
}

/**
 * One cached draw call for a sculpted, five-digit grip. The caller parents it to
 * the animated forearm pivot, so swords, bows, tools and shields remain attached.
 */
export function createCharacterHandDetails(
  skinColor: number,
  trimColor: number,
  civilization: CivilizationId,
  unitId: string,
  mirrored = false
): THREE.Group {
  const variant = getDeterministicArtVariant(unitId);
  const key = [skinColor.toString(16), trimColor.toString(16), civilization, variant].join('|');
  let geometry = handGeometryCache.get(key);
  if (!geometry) {
    geometry = createCharacterHandGeometry(skinColor, trimColor, variant);
    handGeometryCache.set(key, geometry);
  }
  let material = handMaterialCache.get(key);
  if (!material) {
    material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.68,
      metalness: 0.08,
    });
    handMaterialCache.set(key, material);
  }
  const group = new THREE.Group();
  group.name = mirrored ? 'sculptedGripHand:left' : 'sculptedGripHand:right';
  const hand = new THREE.Mesh(geometry, material);
  hand.name = 'sculptedFiveDigitHand';
  hand.castShadow = true;
  hand.receiveShadow = true;
  group.add(hand);
  if (mirrored) group.scale.x = -1;
  group.userData.artCivilization = civilization;
  group.userData.artVariant = variant;
  return group;
}


// ----------------- ARCHITECTURAL FACADE MODULES -----------------

const facadeGeometryCache = new Map<string, THREE.BufferGeometry>();
const facadeMaterialCache = new Map<string, THREE.MeshStandardMaterial>();

const FACADE_BUILDING_TYPES = new Set<BuildingType>([
  'town_center',
  'house',
  'barracks',
  'archery_range',
  'stable',
  'siege_workshop',
  'granary',
  'lumber_camp',
  'mining_camp',
  'tower',
  'castle',
  'armory_forge',
  'spirit_shrine',
  'mana_well',
  'landmark_aachen',
  'landmark_barracks',
  'landmark_guildhall',
  'landmark_citadel',
  'landmark_observatory',
  'landmark_arsenal',
]);

function createBuildingFacadeGeometry(
  civilization: CivilizationId,
  palette: UnitArtPalette,
  width: number,
  depth: number,
  height: number
): THREE.BufferGeometry {
  const parts: SculptPart[] = [];
  const add = (
    geometry: THREE.BufferGeometry,
    color: number,
    position: [number, number, number],
    scale: [number, number, number] = [1, 1, 1],
    rotation: [number, number, number] = [0, 0, 0]
  ) => parts.push(makePart(geometry, color, position, scale, rotation));

  const w = THREE.MathUtils.clamp(width, 1.1, 12);
  const d = THREE.MathUtils.clamp(depth, 1.1, 12);
  const h = THREE.MathUtils.clamp(height, 0.9, 12);
  const stone = palette.secondary;
  const main = civilization === 'anime' ? 0xb91c1c : palette.primary;
  const highlight = civilization === 'fantasy' ? 0x67e8f9 : palette.banner;
  const trim = THREE.MathUtils.clamp(Math.min(w, d) * 0.045, 0.075, 0.22);
  const band = THREE.MathUtils.clamp(h * 0.045, 0.07, 0.2);
  const halfW = w * 0.46;
  const halfD = d * 0.46;

  // Continuous foundation course and upper string course: the wall reads as masonry,
  // not as a stack of unrelated props.
  add(new RoundedBoxGeometry(w * 0.94, band, trim, 3, trim * 0.16), stone, [0, band * 0.62, halfD]);
  add(new RoundedBoxGeometry(w * 0.94, band, trim, 3, trim * 0.16), stone, [0, band * 0.62, -halfD]);
  add(new RoundedBoxGeometry(trim, band, d * 0.92, 3, trim * 0.16), stone, [halfW, band * 0.62, 0]);
  add(new RoundedBoxGeometry(trim, band, d * 0.92, 3, trim * 0.16), stone, [-halfW, band * 0.62, 0]);
  add(new RoundedBoxGeometry(w * 0.91, band * 0.72, trim * 0.72, 3, trim * 0.12), main, [0, h * 0.68, halfD]);
  add(new RoundedBoxGeometry(trim * 0.72, band * 0.72, d * 0.9, 3, trim * 0.12), main, [halfW, h * 0.68, 0]);
  add(new RoundedBoxGeometry(trim * 0.72, band * 0.72, d * 0.9, 3, trim * 0.12), main, [-halfW, h * 0.68, 0]);

  // Four corner piers provide visible wall thickness and a readable load-bearing rhythm.
  const pierHeight = h * 0.58;
  const pierWidth = trim * 1.28;
  for (const x of [-1, 1]) {
    for (const z of [-1, 1]) {
      add(
        new RoundedBoxGeometry(pierWidth, pierHeight, pierWidth, 3, pierWidth * 0.16),
        stone,
        [x * (halfW - pierWidth * 0.38), h * 0.36, z * (halfD - pierWidth * 0.38)]
      );
      if (civilization === 'fantasy') {
        add(
          new THREE.OctahedronGeometry(trim * 0.25, 0),
          highlight,
          [x * (halfW - pierWidth * 0.38), h * 0.67, z * (halfD - pierWidth * 0.38)],
          [0.78, 1.25, 0.78]
        );
      }
    }
  }

  // A framed entrance on the front (+Z) side; the lintel and side posts adapt to footprint.
  const portalHalf = Math.min(w * 0.2, 0.62);
  const portalHeight = h * 0.43;
  const portalZ = halfD + trim * 0.22;
  const portalPost = Math.max(0.085, trim * 0.62);
  for (const x of [-portalHalf, portalHalf]) {
    add(
      new RoundedBoxGeometry(portalPost, portalHeight, trim * 0.72, 3, portalPost * 0.18),
      civilization === 'anime' ? main : stone,
      [x, portalHeight * 0.48, portalZ]
    );
  }
  add(
    new RoundedBoxGeometry(portalHalf * 2 + portalPost, portalPost, trim * 0.92, 3, portalPost * 0.18),
    civilization === 'anime' ? palette.secondary : main,
    [0, portalHeight, portalZ]
  );

  if (civilization === 'medieval') {
    add(new THREE.OctahedronGeometry(trim * 0.58, 0), highlight, [0, portalHeight + portalPost * 0.38, portalZ + trim * 0.36], [0.85, 1.2, 0.45]);
    add(new RoundedBoxGeometry(portalHalf * 1.3, trim * 0.22, trim * 0.18, 2, trim * 0.04), stone, [0, band * 1.4, portalZ + trim * 0.36]);
  } else if (civilization === 'anime') {
    // A compact torii beam and hanging seal give the entrance a faction-specific silhouette.
    add(new RoundedBoxGeometry(portalHalf * 2.35, trim * 0.42, trim * 0.5, 3, trim * 0.12), main, [0, portalHeight + portalPost * 0.82, portalZ]);
    add(new RoundedBoxGeometry(trim * 0.72, h * 0.13, trim * 0.48, 2, trim * 0.08), palette.secondary, [0, portalHeight * 0.55, portalZ + trim * 0.55]);
    add(new THREE.OctahedronGeometry(trim * 0.34, 0), highlight, [0, band * 1.8, portalZ + trim * 0.62]);
  } else if (civilization === 'mongol') {
    // Steppe entrances use a timber lintel, felt awning and paired Sulde pennons.
    add(new RoundedBoxGeometry(portalHalf * 2.35, trim * 0.52, trim * 0.72, 3, trim * 0.16), 0x70452a, [0, portalHeight + portalPost * 0.78, portalZ]);
    add(new RoundedBoxGeometry(portalHalf * 1.8, h * 0.12, trim * 0.48, 3, trim * 0.12), main, [0, portalHeight + portalPost * 0.48, portalZ + trim * 0.36]);
    for (const side of [-1, 1]) {
      add(new THREE.CylinderGeometry(trim * 0.08, trim * 0.1, h * 0.28, 6), palette.secondary, [side * portalHalf * 1.62, portalHeight + h * 0.07, portalZ + trim * 0.1]);
      add(new THREE.ConeGeometry(trim * 0.18, h * 0.1, 4), palette.banner, [side * portalHalf * 1.62, portalHeight + h * 0.22, portalZ + trim * 0.1], [0.72, 1.6, 0.22], [0, 0, side * -0.18]);
    }
    add(new THREE.OctahedronGeometry(trim * 0.38, 0), palette.secondary, [0, band * 1.8, portalZ + trim * 0.62]);
  } else {
    // Fantasy entrances use an illuminated keystone and paired crystal fins.
    add(new THREE.OctahedronGeometry(trim * 0.8, 1), highlight, [0, portalHeight + portalPost * 0.55, portalZ + trim * 0.45], [0.85, 1.45, 0.62]);
    for (const x of [-1, 1]) {
      add(new THREE.ConeGeometry(trim * 0.34, h * 0.18, 5), palette.secondary, [x * portalHalf * 1.55, portalHeight + h * 0.08, portalZ], [1, 1, 1], [0, 0, -x * 0.18]);
    }
  }
  return mergeSculptParts(parts);
}

/**
 * Adds one cached vertex-coloured structural layer around a building's bounding footprint.
 * Farms, wall segments, gates and docks deliberately keep their functional silhouettes.
 */
export function createBuildingFacadeKit(
  type: BuildingType,
  civilization: CivilizationId,
  palette: UnitArtPalette,
  width: number,
  depth: number,
  height: number
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'originalArchitectureFacadeKit';
  // This coloured frame is a construction-stage visual overlay, not part of the
  // finished building's silhouette. It is shared through geometry/material
  // caches, so completion cleanup must detach it without disposing its assets.
  group.userData.removeOnConstructionComplete = true;
  group.userData.ownsGeometry = false;
  if (!FACADE_BUILDING_TYPES.has(type)) return group;

  const w = THREE.MathUtils.clamp(Number.isFinite(width) ? width : 3, 1.1, 12);
  const d = THREE.MathUtils.clamp(Number.isFinite(depth) ? depth : 3, 1.1, 12);
  const h = THREE.MathUtils.clamp(Number.isFinite(height) ? height : 3, 0.9, 12);
  const paletteKey = colorKey(palette);
  const dimensionKey = [w, d, h].map(value => value.toFixed(2)).join('|');
  const key = [type, civilization, paletteKey, dimensionKey].join('|');
  let geometry = facadeGeometryCache.get(key);
  if (!geometry) {
    geometry = createBuildingFacadeGeometry(civilization, palette, w, d, h);
    facadeGeometryCache.set(key, geometry);
  }
  const materialKey = [civilization, paletteKey].join('|');
  let material = facadeMaterialCache.get(materialKey);
  if (!material) {
    material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      metalness: civilization === 'fantasy' ? 0.42 : 0.3,
      roughness: civilization === 'anime' ? 0.52 : 0.64,
    });
    facadeMaterialCache.set(materialKey, material);
  }
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'originalArchitectureFacade';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.distanceLodMinPixels = 4.5;
  group.add(mesh);
  group.userData.artDirection = civilization;
  group.userData.buildingType = type;
  return group;
}

const buildingGeometryCache = new Map<string, THREE.BufferGeometry>();
const buildingMaterialCache = new Map<string, THREE.MeshStandardMaterial>();

const SIGNATURE_BUILDING_TYPES = new Set<BuildingType>([
  'town_center',
  'tower',
  'castle',
  'armory_forge',
  'spirit_shrine',
  'mana_well',
  'landmark_aachen',
  'landmark_barracks',
  'landmark_guildhall',
  'landmark_citadel',
  'landmark_observatory',
  'landmark_arsenal',
]);

function createBuildingCrownGeometry(
  civilization: CivilizationId,
  scale: number,
  palette: UnitArtPalette,
  type: BuildingType
): THREE.BufferGeometry {
  const p: SculptPart[] = [];
  const add = (
    geometry: THREE.BufferGeometry,
    color: number,
    position: [number, number, number],
    size: [number, number, number] = [1, 1, 1],
    rotation: [number, number, number] = [0, 0, 0]
  ) => p.push(makePart(geometry, color, position, size, rotation));
  const s = scale;
  const highProfile = type === 'castle' || type.startsWith('landmark') || type === 'town_center';

  if (civilization === 'medieval') {
    // Heraldic roof standard: layered bronze socket, swept crossbar and enamel pennant.
    add(new THREE.TorusGeometry(0.22 * s, 0.035 * s, 6, 16), palette.secondary, [0, 0.12 * s, 0], [1, 0.82, 1], [Math.PI / 2, 0, 0]);
    add(new THREE.CylinderGeometry(0.045 * s, 0.07 * s, 0.6 * s, 8), palette.secondary, [0, 0.39 * s, 0]);
    add(new RoundedBoxGeometry(0.62 * s, 0.07 * s, 0.075 * s, 3, 0.018 * s), palette.primary, [0, 0.62 * s, 0]);
    add(new RoundedBoxGeometry(0.28 * s, (highProfile ? 0.46 : 0.34) * s, 0.045 * s, 3, 0.025 * s), palette.banner, [0.2 * s, 0.34 * s, 0], [1, 1, 1], [0, 0, -0.08]);
    add(new THREE.OctahedronGeometry(0.105 * s, 1), palette.secondary, [0, 0.68 * s, 0.015 * s], [0.8, 1.1, 0.7]);
  } else if (civilization === 'anime') {
    // Original torii roof crown: vermilion gate beam with upturned eave tips and hanging seal.
    add(new RoundedBoxGeometry(0.72 * s, 0.09 * s, 0.12 * s, 3, 0.025 * s), palette.primary, [0, 0.52 * s, 0]);
    add(new RoundedBoxGeometry(0.48 * s, 0.07 * s, 0.1 * s, 3, 0.02 * s), palette.secondary, [0, 0.42 * s, 0]);
    add(new RoundedBoxGeometry(0.065 * s, 0.42 * s, 0.065 * s, 3, 0.018 * s), palette.primary, [-0.22 * s, 0.22 * s, 0]);
    add(new RoundedBoxGeometry(0.065 * s, 0.42 * s, 0.065 * s, 3, 0.018 * s), palette.primary, [0.22 * s, 0.22 * s, 0]);
    add(new THREE.ConeGeometry(0.045 * s, 0.25 * s, 5), palette.banner, [-0.4 * s, 0.64 * s, 0], [1, 1, 1], [0, 0, 0.72]);
    add(new THREE.ConeGeometry(0.045 * s, 0.25 * s, 5), palette.banner, [0.4 * s, 0.64 * s, 0], [1, 1, 1], [0, 0, -0.72]);
    add(new RoundedBoxGeometry(0.16 * s, 0.23 * s, 0.035 * s, 2, 0.012 * s), 0xfef3c7, [0, 0.18 * s, 0.14 * s]);
    add(new THREE.OctahedronGeometry(0.06 * s, 0), palette.secondary, [0, 0.18 * s, 0.17 * s]);
  } else if (civilization === 'mongol') {
    // Steppe roofline: a central Sulde standard, crossbar pennons and a horsehair halo.
    add(new THREE.TorusGeometry(0.3 * s, 0.025 * s, 6, 20), palette.secondary, [0, 0.26 * s, 0], [1, 0.82, 1], [Math.PI / 2, 0, 0]);
    add(new THREE.CylinderGeometry(0.035 * s, 0.06 * s, 0.72 * s, 8), palette.secondary, [0, 0.48 * s, 0]);
    add(new RoundedBoxGeometry(0.72 * s, 0.075 * s, 0.07 * s, 3, 0.02 * s), palette.primary, [0, 0.66 * s, 0]);
    add(new RoundedBoxGeometry(0.26 * s, (highProfile ? 0.55 : 0.38) * s, 0.035 * s, 3, 0.02 * s), palette.banner, [0.18 * s, 0.42 * s, 0], [1, 1, 1], [0, 0, -0.1]);
    for (const side of [-1, 1]) add(new THREE.ConeGeometry(0.06 * s, 0.32 * s, 5), palette.secondary, [side * 0.28 * s, 0.34 * s, 0], [0.6, 1.2, 0.5], [0, 0, side * -0.3]);
  } else {
    // Fantasy crown: a suspended rune ring around a faceted crystal, with three shard spires.
    add(new THREE.TorusGeometry(0.28 * s, 0.025 * s, 6, 22), palette.secondary, [0, 0.3 * s, 0], [1, 0.9, 1], [Math.PI / 2, 0, 0]);
    add(new THREE.OctahedronGeometry((highProfile ? 0.19 : 0.15) * s, 1), palette.banner, [0, 0.36 * s, 0], [0.9, 1.35, 0.72]);
    add(new THREE.ConeGeometry(0.065 * s, 0.38 * s, 6), palette.secondary, [-0.31 * s, 0.28 * s, 0], [1, 1, 1], [0, 0, 0.42]);
    add(new THREE.ConeGeometry(0.065 * s, 0.38 * s, 6), palette.secondary, [0.31 * s, 0.28 * s, 0], [1, 1, 1], [0, 0, -0.42]);
    add(new THREE.OctahedronGeometry(0.075 * s, 0), palette.banner, [0, 0.72 * s, 0]);
  }

  if (highProfile) {
    add(new THREE.TorusGeometry(0.12 * s, 0.018 * s, 5, 16), palette.secondary, [0, 0.82 * s, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
  }
  return mergeSculptParts(p);
}

/**
 * A unique roofline signature for important structures. Geometry and materials are cached,
 * while the caller computes a safe roof anchor from the original building meshes.
 */
export function createBuildingHeritageKit(
  type: BuildingType,
  civilization: CivilizationId,
  palette: UnitArtPalette,
  size: number
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'originalArchitectureHeritageKit';
  if (!SIGNATURE_BUILDING_TYPES.has(type)) return group;

  const scale = THREE.MathUtils.clamp(Number.isFinite(size) ? size / 4.2 : 1, 0.72, 1.5);
  const paletteKey = colorKey(palette);
  const key = [type, civilization, scale.toFixed(2), paletteKey].join('|');
  let geometry = buildingGeometryCache.get(key);
  if (!geometry) {
    geometry = createBuildingCrownGeometry(civilization, scale, palette, type);
    buildingGeometryCache.set(key, geometry);
  }
  const materialKey = [civilization, paletteKey].join('|');
  let material = buildingMaterialCache.get(materialKey);
  if (!material) {
    material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      metalness: civilization === 'fantasy' ? 0.56 : 0.68,
      roughness: civilization === 'anime' ? 0.36 : 0.43,
    });
    buildingMaterialCache.set(materialKey, material);
  }

  const crown = new THREE.Mesh(geometry, material);
  crown.name = 'originalArchitectureCrown';
  crown.castShadow = true;
  crown.receiveShadow = true;
  group.add(crown);
  group.userData.artDirection = civilization;
  group.userData.buildingType = type;
  return group;
}


const buildingEraGeometryCache = new Map<string, THREE.BufferGeometry>();
const buildingEraMaterialCache = new Map<string, THREE.MeshStandardMaterial>();
const BUILDING_ERA_EXCLUDED_TYPES = new Set<BuildingType>(['farm', 'wall', 'gate', 'dock']);

function createBuildingEraGeometry(
  type: BuildingType,
  civilization: CivilizationId,
  palette: UnitArtPalette,
  width: number,
  depth: number,
  height: number,
  age: number
): THREE.BufferGeometry {
  const parts: SculptPart[] = [];
  const add = (
    geometry: THREE.BufferGeometry,
    color: number,
    position: [number, number, number],
    scale: [number, number, number] = [1, 1, 1],
    rotation: [number, number, number] = [0, 0, 0]
  ) => parts.push(makePart(geometry, color, position, scale, rotation));

  const w = THREE.MathUtils.clamp(width, 1.1, 12);
  const d = THREE.MathUtils.clamp(depth, 1.1, 12);
  const h = THREE.MathUtils.clamp(height, 0.9, 12);
  const s = THREE.MathUtils.clamp(Math.min(w, d) / 4, 0.58, 1.42);
  const post = Math.max(0.075, Math.min(0.17, s * 0.09));
  const rail = Math.max(0.055, Math.min(0.12, s * 0.065));
  const x = Math.max(post, w * 0.39);
  const z = Math.max(post, d * 0.39);
  const top = Math.max(0.1, h * 0.025);

  // Age II: stone/wood reinforcement at the roof corners and a visible civilization-specific fascia.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      add(
        new RoundedBoxGeometry(post * 1.6, 0.28 * s, post * 1.6, 3, post * 0.22),
        civilization === 'fantasy' ? palette.secondary : palette.primary,
        [sx * x, top + 0.12 * s, sz * z]
      );
      if (civilization === 'mongol') {
        add(new THREE.ConeGeometry(post * 0.38, 0.42 * s, 5), palette.banner, [sx * x, top + 0.35 * s, sz * z], [0.58, 1.35, 0.5], [0, 0, sx * -0.18]);
      } else {
        add(new THREE.OctahedronGeometry(post * 0.7, 0), palette.banner, [sx * x, top + 0.29 * s, sz * z], [1, 1.12, 0.8]);
      }
    }
  }

  if (civilization === 'mongol') {
    add(new RoundedBoxGeometry(w * 0.84, rail * 1.25, rail * 1.45, 3, rail * 0.2), palette.secondary, [0, top + 0.16 * s, z]);
    add(new THREE.CylinderGeometry(rail * 0.18, rail * 0.24, 0.62 * s, 7), palette.primary, [0, top + 0.42 * s, z]);
    add(new RoundedBoxGeometry(0.3 * s, 0.38 * s, 0.035 * s, 3, 0.02 * s), palette.banner, [0.18 * s, top + 0.54 * s, z], [1, 1, 1], [0, 0, -0.1]);
  } else if (civilization === 'anime') {
    add(new RoundedBoxGeometry(w * 0.9, rail * 1.35, rail * 1.5, 3, rail * 0.24), palette.primary, [0, top + 0.13 * s, z]);
    add(new RoundedBoxGeometry(w * 0.78, rail, rail * 1.35, 3, rail * 0.2), palette.secondary, [0, top + 0.23 * s, z]);
    add(new RoundedBoxGeometry(rail * 1.25, 0.27 * s, rail, 2, rail * 0.15), palette.banner, [0, top + 0.05 * s, z + rail]);
  } else if (civilization === 'fantasy') {
    add(new THREE.TorusGeometry(0.22 * s, 0.025 * s, 6, 18), palette.secondary, [0, top + 0.2 * s, 0], [w / d, 1, 1], [Math.PI / 2, 0, 0]);
    add(new THREE.OctahedronGeometry(0.12 * s, 1), palette.banner, [0, top + 0.31 * s, z * 0.72], [0.82, 1.35, 0.72]);
  } else {
    add(new RoundedBoxGeometry(w * 0.86, rail, rail * 1.45, 3, rail * 0.18), palette.secondary, [0, top + 0.16 * s, z]);
    for (const sx of [-1, 1]) {
      add(new THREE.BoxGeometry(post * 0.75, rail * 2.2, rail * 1.3), palette.banner, [sx * x, top + 0.26 * s, z]);
    }
  }

  if (age >= 3) {
    // Age III: taller corner turrets/pinnacles make castles and military buildings read as fortified.
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        add(
          civilization === 'mongol'
            ? new THREE.CylinderGeometry(post * 0.22, post * 0.4, 0.62 * s, 6)
            : new THREE.ConeGeometry(post * (civilization === 'fantasy' ? 1.05 : 0.82), 0.42 * s, civilization === 'anime' ? 4 : 6),
          civilization === 'anime' ? palette.primary : palette.secondary,
          [sx * x, top + 0.48 * s, sz * z],
          [1, 1, 1],
          [0, sx * 0.12, sz * -0.12]
        );
      }
    }
    if (civilization === 'mongol') {
      add(new THREE.TorusGeometry(0.34 * s, 0.026 * s, 6, 22), palette.secondary, [0, top + 0.38 * s, 0], [w / d, 1, 1], [Math.PI / 2, 0, 0]);
      add(new THREE.CylinderGeometry(0.03 * s, 0.05 * s, 0.92 * s, 7), palette.secondary, [0, top + 0.66 * s, 0]);
      add(new RoundedBoxGeometry(0.34 * s, 0.46 * s, 0.035 * s, 3, 0.02 * s), palette.banner, [0.21 * s, top + 0.72 * s, 0], [1, 1, 1], [0, 0, -0.12]);
    } else if (civilization === 'anime') {
      add(new RoundedBoxGeometry(w * 0.58, rail * 1.4, rail * 1.7, 3, rail * 0.25), palette.banner, [0, top + 0.45 * s, z * 0.83]);
    } else {
      add(new THREE.TorusGeometry(0.3 * s, 0.027 * s, 6, 20), palette.banner, [0, top + 0.35 * s, 0], [w / d, 1, 1], [Math.PI / 2, 0, 0]);
    }
  }

  if (age >= 4) {
    // Age IV: an unmistakable imperial / sacred crown, deliberately restrained to one merged mesh.
    const apexY = top + 0.82 * s;
    if (civilization === 'mongol') {
      add(new THREE.CylinderGeometry(0.045 * s, 0.075 * s, 1.02 * s, 8), palette.secondary, [0, apexY + 0.08 * s, 0]);
      add(new RoundedBoxGeometry(0.48 * s, 0.76 * s, 0.04 * s, 3, 0.025 * s), palette.banner, [0.25 * s, apexY + 0.24 * s, 0], [1, 1, 1], [0, 0, -0.14]);
      add(new THREE.TorusGeometry(0.4 * s, 0.03 * s, 6, 24), palette.secondary, [0, apexY - 0.22 * s, 0], [w / d, 1, 1], [Math.PI / 2, 0, 0]);
      for (const side of [-1, 1]) add(new THREE.ConeGeometry(0.075 * s, 0.38 * s, 5), palette.primary, [side * 0.38 * s, apexY + 0.42 * s, 0], [0.7, 1.4, 0.6], [0, 0, side * -0.2]);
    } else if (civilization === 'fantasy') {
      add(new THREE.OctahedronGeometry(0.19 * s, 1), palette.banner, [0, apexY, 0], [0.82, 1.55, 0.76]);
      add(new THREE.TorusGeometry(0.38 * s, 0.028 * s, 6, 24), palette.secondary, [0, apexY - 0.12 * s, 0], [w / d, 1, 1], [Math.PI / 2, 0.15, 0]);
      for (const sx of [-1, 1]) {
        add(new THREE.ConeGeometry(0.065 * s, 0.34 * s, 5), palette.banner, [sx * 0.3 * s, apexY + 0.08 * s, 0], [1, 1, 1], [0, 0, sx * -0.22]);
      }
    } else if (civilization === 'anime') {
      add(new RoundedBoxGeometry(w * 0.42, rail * 1.8, rail * 1.8, 3, rail * 0.3), palette.primary, [0, apexY - 0.12 * s, 0]);
      add(new THREE.OctahedronGeometry(0.14 * s, 1), palette.banner, [0, apexY + 0.12 * s, 0.02 * s], [0.8, 1.5, 0.7]);
    } else {
      add(new THREE.CylinderGeometry(0.035 * s, 0.07 * s, 0.56 * s, 8), palette.secondary, [0, apexY, 0]);
      add(new THREE.OctahedronGeometry(0.14 * s, 1), palette.banner, [0, apexY + 0.31 * s, 0], [0.86, 1.35, 0.74]);
      add(new RoundedBoxGeometry(0.3 * s, 0.06 * s, 0.045 * s, 3, 0.014 * s), palette.primary, [0, apexY - 0.16 * s, 0]);
    }
  }

  return mergeSculptParts(parts);
}

/**
 * Age-specific roofline modules are separate from structural collision/build meshes.
 * They are cached by footprint, palette, civilization and age, then swapped on age-up.
 */
export function createBuildingAgeEvolutionKit(
  type: BuildingType,
  civilization: CivilizationId,
  palette: UnitArtPalette,
  width: number,
  depth: number,
  height: number,
  age: number
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'buildingAgeEvolutionKit';
  const ageTier = THREE.MathUtils.clamp(Math.floor(Number.isFinite(age) ? age : 1), 1, 4);
  group.userData.ageTier = ageTier;
  group.userData.artDirection = civilization;
  if (ageTier <= 1 || BUILDING_ERA_EXCLUDED_TYPES.has(type)) return group;

  const w = THREE.MathUtils.clamp(width, 1.1, 12);
  const d = THREE.MathUtils.clamp(depth, 1.1, 12);
  const h = THREE.MathUtils.clamp(height, 0.9, 12);
  const paletteKey = [palette.primary, palette.secondary, palette.banner].map(v => v.toString(16)).join('-');
  const sizeKey = [w, d, h].map(v => v.toFixed(2)).join('|');
  const key = [type, civilization, ageTier, paletteKey, sizeKey].join('|');
  let geometry = buildingEraGeometryCache.get(key);
  if (!geometry) {
    geometry = createBuildingEraGeometry(type, civilization, palette, w, d, h, ageTier);
    buildingEraGeometryCache.set(key, geometry);
  }
  const materialKey = [civilization, paletteKey].join('|');
  let material = buildingEraMaterialCache.get(materialKey);
  if (!material) {
    material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      metalness: civilization === 'fantasy' ? 0.48 : 0.62,
      roughness: civilization === 'anime' ? 0.38 : 0.48,
    });
    buildingEraMaterialCache.set(materialKey, material);
  }
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'buildingAgeEvolutionDetails';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.distanceLodMinPixels = 4.2;
  group.add(mesh);
  return group;
}
