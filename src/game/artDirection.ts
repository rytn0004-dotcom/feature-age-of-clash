import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CivilizationId, UnitCategory } from '../types/game';

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
type ArtRole = 'frontline' | 'ranger' | 'skirmisher' | 'arcanist' | 'mounted' | 'laborer' | 'champion';

interface SculptPart {
  geometry: THREE.BufferGeometry;
  color: number;
  position: [number, number, number];
  scale: [number, number, number];
  rotation?: [number, number, number];
}

const signatureGeometryCache = new Map<string, THREE.BufferGeometry>();
const signatureMaterialCache = new Map<string, THREE.MeshStandardMaterial>();
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
    const geometry = part.geometry;
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
  if (category === 'worker') return 'laborer';
  if (category === 'cavalry' || modelType === 'knight') return 'mounted';
  if (modelType === 'mage') return 'arcanist';
  if (modelType === 'ninja') return 'skirmisher';
  if (modelType === 'saiyan') return 'champion';
  if (category === 'ranged' || modelType === 'archer') return 'ranger';
  return 'frontline';
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
  group.userData.artDirection = options.civilization;
  group.userData.artRole = role;
  group.userData.artVariant = getDeterministicArtVariant(options.unitId);
  return group;
}

function createFaceGeometry(eyeColor: number): THREE.BufferGeometry {
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
  for (const x of [-0.066, 0.066]) {
    add(new THREE.SphereGeometry(0.029, 10, 8), white, [x, 0.012, 0.158], [1.2, 0.78, 0.52]);
    add(new THREE.SphereGeometry(0.015, 8, 6), eyeColor, [x, 0.01, 0.176], [0.9, 1.05, 0.45]);
    add(new THREE.SphereGeometry(0.008, 8, 6), ink, [x, 0.01, 0.183], [1, 1, 0.45]);
    add(new RoundedBoxGeometry(0.052, 0.012, 0.012, 2, 0.003), ink, [x, 0.055, 0.154], [1, 1, 1], [0, 0, x > 0 ? -0.08 : 0.08]);
  }
  add(new THREE.OctahedronGeometry(0.024, 0), 0xe9b49d, [0, -0.02, 0.174], [0.75, 1.25, 0.72]);
  return mergeSculptParts(parts);
}

export function createCharacterFaceDetails(eyeColor: number): THREE.Group {
  const key = eyeColor.toString(16);
  let geometry = faceGeometryCache.get(key);
  if (!geometry) {
    geometry = createFaceGeometry(eyeColor);
    faceGeometryCache.set(key, geometry);
  }
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
  return group;
}
