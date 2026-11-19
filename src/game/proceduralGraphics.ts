import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { BuildingEntity, BuildingType, CivilizationId, FactionId, UnitDefinition, LandmarkType, ShrineType } from '../types/game';
import type { BuildingVisualState } from './rules';
import { isPointInTerrainObstacle } from './collision';

export interface DeerAnimParts {
  bodyPivot: THREE.Group;
  headPivot: THREE.Group;
  tailPivot: THREE.Group;
  flLeg: THREE.Group;
  frLeg: THREE.Group;
  blLeg: THREE.Group;
  brLeg: THREE.Group;
}

export interface FactionVisualConfig {
  primary: number;
  secondary: number;
  banner: number;
  ring: number;
  isHostile: boolean;
  labelPrefix?: string;
  civilization?: CivilizationId;
}

const FACTION_COLORS: Record<string, FactionVisualConfig> = {
  player: {
    primary: 0x2563eb,
    secondary: 0xf59e0b,
    banner: 0x1d4ed8,
    ring: 0x38bdf8,
    isHostile: false,
    labelPrefix: '',
    civilization: 'medieval',
  },
  enemy: {
    primary: 0xdc2626,
    secondary: 0x1f2937,
    banner: 0xef4444,
    ring: 0xef4444,
    isHostile: true,
    labelPrefix: '敵軍·',
    civilization: 'anime',
  },
  neutral: {
    primary: 0x64748b,
    secondary: 0x334155,
    banner: 0x94a3b8,
    ring: 0x94a3b8,
    isHostile: false,
    labelPrefix: '',
    civilization: 'medieval',
  },
};

export function registerFactionVisual(faction: FactionId, config: Partial<FactionVisualConfig>): void {
  const fallback = config.isHostile ? FACTION_COLORS.enemy : FACTION_COLORS.player;
  FACTION_COLORS[faction] = {
    primary: config.primary ?? fallback.primary,
    secondary: config.secondary ?? fallback.secondary,
    banner: config.banner ?? config.primary ?? fallback.banner,
    ring: config.ring ?? config.banner ?? config.primary ?? fallback.ring,
    isHostile: config.isHostile ?? fallback.isHostile,
    labelPrefix: config.labelPrefix ?? (config.isHostile ? '敵軍·' : ''),
    civilization: config.civilization ?? fallback.civilization ?? 'medieval',
  };
}

export function getFactionPalette(faction: FactionId): FactionVisualConfig {
  return FACTION_COLORS[faction] || FACTION_COLORS.enemy;
}

import { MapPresetId } from '../types/game';
import type { MapLayoutResult } from './mapGenerator';
import {
  getAnimalFurMaps,
  getArmorPlateMaps,
  getCanvasSailMaps,
  getChainmailPlateMaps,
  getClothWeaveMaps,
  getConstructionPadMaps,
  getContactShadowTexture,
  getCraggyRockMaps,
  getDamascusSteelMaps,
  getFoliagePBRMaps,
  getGoldFiligreeMaps,
  getLeatherMaps,
  getOakHullMaps,
  getRoofShingleMaps,
  getStoneMasonryMaps,
  getTerrainPBRMaps,
  getTimberWoodMaps,
  getTreeBarkMaps,
  getWaterRippleNormalMap,
  getWheatFieldMaps,
} from './proceduralTextures';

export function createTerrainTexture(preset: MapPresetId = 'river_valley'): THREE.Texture {
  return getTerrainPBRMaps(preset).map;
}

export function applyTerrainBiomeMaterial(
  mat: THREE.MeshStandardMaterial,
  preset: MapPresetId = 'river_valley'
): void {
  const maps = getTerrainPBRMaps(preset);
  mat.map = maps.map;
  mat.normalMap = maps.normalMap;
  mat.normalScale.set(1.35, 1.35);
  mat.roughnessMap = maps.roughnessMap || null;
  mat.roughness = 0.92;
  mat.metalness = 0.04;
  mat.vertexColors = true;
  mat.needsUpdate = true;
}

// ----------------- SCULPTURAL GEOMETRY HELPERS -----------------

/** Light vertex relaxation that softens harsh polygon corners without adding triangles. */
function softenGeometrySurface(geo: THREE.BufferGeometry, strength = 0.16, iterations = 1): THREE.BufferGeometry {
  const smoothGeo = mergeVertices(geo, 1e-4);
  const position = smoothGeo.attributes.position;
  const index = smoothGeo.index;
  if (!index || position.count < 4) { smoothGeo.computeVertexNormals(); return smoothGeo; }
  const neighbours: Array<Set<number>> = Array.from({ length: position.count }, () => new Set<number>());
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i), b = index.getX(i + 1), c = index.getX(i + 2);
    neighbours[a].add(b); neighbours[a].add(c); neighbours[b].add(a); neighbours[b].add(c); neighbours[c].add(a); neighbours[c].add(b);
  }
  let source = new Float32Array(position.array);
  let target = new Float32Array(source.length);
  for (let pass = 0; pass < Math.max(1, iterations); pass++) {
    target.set(source);
    for (let i = 0; i < position.count; i++) {
      const adjacent = neighbours[i]; if (adjacent.size < 3) continue;
      let ax = 0, ay = 0, az = 0;
      adjacent.forEach((n) => { ax += source[n * 3]; ay += source[n * 3 + 1]; az += source[n * 3 + 2]; });
      const inv = 1 / adjacent.size, offset = i * 3;
      target[offset] += (ax * inv - source[offset]) * strength;
      target[offset + 1] += (ay * inv - source[offset + 1]) * strength;
      target[offset + 2] += (az * inv - source[offset + 2]) * strength;
    }
    const swap = source; source = target; target = swap;
  }
  position.array.set(source); position.needsUpdate = true; smoothGeo.computeVertexNormals(); return smoothGeo;
}

function safeComputeTangents<T extends THREE.BufferGeometry>(geo: T): T {
  if (geo.index && geo.attributes.uv && geo.attributes.normal) {
    geo.computeTangents();
  }
  return geo;
}

function makeLatheGeo(profile: Array<[number, number]>, segments = 16): THREE.LatheGeometry {
  const pts = profile.map(([r, y]) => new THREE.Vector2(Math.max(0.001, r), y));
  const geo = new THREE.LatheGeometry(pts, segments);
  geo.computeVertexNormals();
  return safeComputeTangents(geo);
}

function makeExtrudeGeo(
  shape: THREE.Shape,
  depth: number,
  bevelThickness = 0.03,
  bevelSize = 0.03,
  bevelSegments = 2,
  centerZ = true
): THREE.ExtrudeGeometry {
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevelThickness > 0 && bevelSize > 0,
    bevelThickness,
    bevelSize,
    bevelSegments,
    curveSegments: 10,
  });
  if (centerZ) geo.translate(0, 0, -depth * 0.5);
  geo.computeVertexNormals();
  return safeComputeTangents(geo);
}

function makeTubeGeo(
  points: Array<[number, number, number]>,
  radius: number,
  tubularSegments = 12,
  radialSegments = 6
): THREE.TubeGeometry {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  const geo = new THREE.TubeGeometry(curve, tubularSegments, radius, radialSegments, false);
  geo.computeVertexNormals();
  return safeComputeTangents(geo);
}

/**
 * Curved upturned pagoda eave profile rotated in 4-sided hipped roof geometry.
 * Ordered bottom-to-top (increasing Y) so LatheGeometry faces wind outward.
 */
function makePagodaRoofGeo(baseRadius: number, height: number): THREE.LatheGeometry {
  const pts = [
    [baseRadius * 1.04, 0.14], // classic upturned tip
    [baseRadius * 0.96, 0.02],
    [baseRadius * 0.74, 0.14],
    [baseRadius * 0.42, height * 0.38],
    [baseRadius * 0.16, height * 0.72],
    [0.01, height],
  ] as Array<[number, number]>;
  const geo = makeLatheGeo(pts, 4);
  geo.rotateY(Math.PI / 4);
  return geo;
}

function makeCraggyRockGeo(radius: number, detail = 1): THREE.BufferGeometry {
  const geo = new THREE.DodecahedronGeometry(radius, detail);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const qx = Math.round(x * 100);
    const qy = Math.round(y * 100);
    const qz = Math.round(z * 100);
    const hash = Math.sin(qx * 0.13 + qy * 0.31 + qz * 0.23) * 0.18 + Math.cos(qx * 0.27 - qz * 0.19) * 0.11;
    const scale = 0.88 + hash;
    pos.setXYZ(i, x * scale, y * (y < 0 ? 0.55 : scale * 0.88), z * scale);
  }
  pos.needsUpdate = true;
  const softened = softenGeometrySurface(geo, 0.2, 1);
  softened.computeVertexNormals();
  return safeComputeTangents(softened);
}

function makeFoliageClusterGeo(radius: number, detail = 1): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(radius, detail);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const qx = Math.round(x * 100);
    const qy = Math.round(y * 100);
    const qz = Math.round(z * 100);
    const ripple =
      Math.sin(qx * 0.19 + qy * 0.27) * 0.16 +
      Math.cos(qz * 0.23 - qx * 0.15) * 0.12;
    const scale = 0.92 + ripple;
    pos.setXYZ(i, x * scale, y * (y < 0 ? 0.72 : scale * 0.9), z * scale);
  }
  pos.needsUpdate = true;
  const softened = softenGeometrySurface(geo, 0.22, 1);
  softened.computeVertexNormals();
  return safeComputeTangents(softened);
}

function makePineSkirtGeo(baseRadius: number, height: number, radialSegs = 12): THREE.BufferGeometry {
  const geo = new THREE.ConeGeometry(baseRadius, height, radialSegs, 3);
  geo.translate(0, height * 0.5, 0);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    if (r > 0.05) {
      const ang = Math.atan2(z, x);
      const boughWave = 1 + Math.sin(ang * 5 + y * 2.2) * 0.14 + Math.cos(ang * 3 - y) * 0.08;
      const droop = y < height * 0.28 ? -0.07 : 0;
      pos.setXYZ(i, x * boughWave, Math.max(0, y + droop), z * boughWave);
    }
  }
  pos.needsUpdate = true;
  const softened = softenGeometrySurface(geo, 0.12, 1);
  softened.computeVertexNormals();
  return safeComputeTangents(softened);
}

function makeGrassClumpGeo(): THREE.BufferGeometry {
  // Five crossed, tapered blades with a gentle two-stage bend for a less rigid silhouette.
  const positions: number[] = [];
  const indices: number[] = [];
  const blades = [
    { angle: 0.15, w: 0.13, h: 0.62, lean: 0.16 },
    { angle: 1.45, w: 0.12, h: 0.54, lean: 0.2 },
    { angle: 2.75, w: 0.12, h: 0.68, lean: 0.14 },
    { angle: 4.05, w: 0.11, h: 0.48, lean: 0.18 },
    { angle: 5.25, w: 0.11, h: 0.58, lean: 0.15 },
  ];
  blades.forEach((b, idx) => {
    const base = idx * 5;
    const variation = 1 + Math.sin(idx * 2.37) * 0.07;
    const width = b.w * variation;
    const height = b.h * (1 + Math.cos(idx * 1.83) * 0.055);
    const lean = b.lean * (0.9 + (Math.sin(idx * 1.41) + 1) * 0.12);
    const cos = Math.cos(b.angle);
    const sin = Math.sin(b.angle);
    const px = -sin * width * 0.5;
    const pz = cos * width * 0.5;
    const lx = cos * lean;
    const lz = sin * lean;
    positions.push(
      -px, 0, -pz,
      px, 0, pz,
      -px * 0.58 + lx * 0.16, height * 0.52, -pz * 0.58 + lz * 0.16,
      px * 0.58 + lx * 0.16, height * 0.52, pz * 0.58 + lz * 0.16,
      lx * 1.12, height, lz * 1.12
    );
    indices.push(base, base + 1, base + 3, base, base + 3, base + 2, base + 2, base + 3, base + 4);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function makeReedTuftGeo(): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const stalks = [
    { ox: -0.08, oz: 0.04, ang: 0.3, w: 0.055, h: 1.15, lean: 0.22 },
    { ox: 0.09, oz: -0.05, ang: 2.1, w: 0.05, h: 0.98, lean: 0.25 },
    { ox: 0.02, oz: 0.08, ang: 4.1, w: 0.052, h: 1.28, lean: 0.18 },
    { ox: -0.05, oz: -0.07, ang: 5.4, w: 0.048, h: 0.88, lean: 0.2 },
  ];
  stalks.forEach((s, idx) => {
    const base = idx * 5;
    const cos = Math.cos(s.ang);
    const sin = Math.sin(s.ang);
    const px = -sin * s.w * 0.5;
    const pz = cos * s.w * 0.5;
    const lx = cos * s.lean;
    const lz = sin * s.lean;
    positions.push(
      s.ox - px, 0, s.oz - pz,
      s.ox + px, 0, s.oz + pz,
      s.ox - px * 0.5 + lx * 0.4, s.h * 0.56, s.oz - pz * 0.5 + lz * 0.4,
      s.ox + px * 0.5 + lx * 0.4, s.h * 0.56, s.oz + pz * 0.5 + lz * 0.4,
      s.ox + lx, s.h, s.oz + lz
    );
    for (let k = 0; k < 5; k++) normals.push(0, 1, 0);
    indices.push(base, base + 1, base + 3, base, base + 3, base + 2, base + 2, base + 3, base + 4);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

const sharedWarmWindowMat = new THREE.MeshStandardMaterial({
  color: 0xfef08a,
  emissive: 0xf59e0b,
  emissiveIntensity: 0.65,
  roughness: 0.28,
  metalness: 0.15,
});

function addMullionedWindow(
  parent: THREE.Group,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  rotY: number,
  frameMat: THREE.Material
) {
  const winGroup = new THREE.Group();
  winGroup.position.set(x, y, z);
  winGroup.rotation.y = rotY;
  const pane = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.08), sharedWarmWindowMat);
  const vBar = new THREE.Mesh(new THREE.BoxGeometry(0.05, h + 0.06, 0.12), frameMat);
  const hBar = new THREE.Mesh(new THREE.BoxGeometry(w + 0.06, 0.05, 0.12), frameMat);
  const sill = new THREE.Mesh(new THREE.BoxGeometry(w + 0.14, 0.08, 0.16), frameMat);
  sill.position.y = -h * 0.52;
  winGroup.add(pane, vBar, hBar, sill);
  parent.add(winGroup);
}

function addArchedDoorway(
  parent: THREE.Group,
  x: number,
  y: number,
  z: number,
  width: number,
  height: number,
  stoneMat: THREE.Material,
  woodMat: THREE.Material,
  ironMat: THREE.Material
) {
  const archShape = new THREE.Shape();
  const hw = width * 0.5;
  const r = hw;
  archShape.moveTo(-hw, 0);
  archShape.lineTo(hw, 0);
  archShape.lineTo(hw, height - r);
  archShape.absarc(0, height - r, r, 0, Math.PI, false);
  archShape.lineTo(-hw, 0);

  const doorGeo = makeExtrudeGeo(archShape, 0.24, 0.02, 0.02, 1, true);
  const door = new THREE.Mesh(doorGeo, woodMat);
  door.position.set(x, y, z);
  parent.add(door);

  // Stone surround arch voussoir
  const frameShape = new THREE.Shape();
  const fw = hw + 0.18;
  frameShape.moveTo(-fw, 0);
  frameShape.lineTo(fw, 0);
  frameShape.lineTo(fw, height - r);
  frameShape.absarc(0, height - r, fw, 0, Math.PI, false);
  frameShape.lineTo(-fw, 0);
  const hole = new THREE.Path();
  hole.moveTo(-hw, 0);
  hole.lineTo(hw, 0);
  hole.lineTo(hw, height - r);
  hole.absarc(0, height - r, hw, 0, Math.PI, false);
  hole.lineTo(-hw, 0);
  frameShape.holes.push(hole);

  const frameGeo = makeExtrudeGeo(frameShape, 0.34, 0.03, 0.03, 1, true);
  const frame = new THREE.Mesh(frameGeo, stoneMat);
  frame.position.set(x, y, z + 0.02);
  parent.add(frame);

  // Iron hinge bands across double doors
  [0.35, 0.85].forEach((hy) => {
    const band = new THREE.Mesh(new THREE.BoxGeometry(width * 0.9, 0.07, 0.28), ironMat);
    band.position.set(x, y + hy, z + 0.02);
    parent.add(band);
  });
}

function addMerlonsAroundBox(
  parent: THREE.Group,
  halfW: number,
  halfD: number,
  y: number,
  countPerSide: number,
  mat: THREE.Material
) {
  const mGeo = new THREE.BoxGeometry(0.38, 0.36, 0.28);
  for (let i = 0; i < countPerSide; i++) {
    const t = countPerSide === 1 ? 0 : (i / (countPerSide - 1)) * 2 - 1;
    const xPos = t * (halfW - 0.28);
    const zPos = t * (halfD - 0.28);

    const f = new THREE.Mesh(mGeo, mat);
    f.position.set(xPos, y, halfD - 0.1);
    parent.add(f);

    const b = new THREE.Mesh(mGeo, mat);
    b.position.set(xPos, y, -halfD + 0.1);
    parent.add(b);

    const l = new THREE.Mesh(mGeo, mat);
    l.rotation.y = Math.PI / 2;
    l.position.set(-halfW + 0.1, y, zPos);
    parent.add(l);

    const r = new THREE.Mesh(mGeo, mat);
    r.rotation.y = Math.PI / 2;
    r.position.set(halfW - 0.1, y, zPos);
    parent.add(r);
  }
}

function addWarmLantern(parent: THREE.Group, x: number, y: number, z: number, frameMat: THREE.Material) {
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xfde047 });
  const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.22, 6), glowMat);
  housing.position.set(x, y, z);
  parent.add(housing);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.12, 6), frameMat);
  cap.position.set(x, y + 0.16, z);
  parent.add(cap);
}

// Soft radial contact shadow disc geometry and material
const shadowGeo = new THREE.CircleGeometry(1, 20);
shadowGeo.rotateX(-Math.PI / 2);
const shadowMat = new THREE.MeshBasicMaterial({
  map: getContactShadowTexture(),
  transparent: true,
  opacity: 0.62,
  depthWrite: false,
});

export function addContactShadow(group: THREE.Group, radius: number): THREE.Mesh {
  const mesh = new THREE.Mesh(shadowGeo, shadowMat);
  mesh.name = 'contactShadow';
  mesh.scale.set(radius * 1.15, radius * 1.15, radius * 1.15);
  mesh.position.y = 0.018;
  group.add(mesh);
  return mesh;
}

// Subtle architectural edge rounding; radius is kept small to preserve silhouette.
function roundedBuildingBox(width: number, height: number, depth: number): THREE.BufferGeometry {
  const smallest = Math.min(Math.abs(width), Math.abs(height), Math.abs(depth));
  const radius = Math.max(0.006, Math.min(smallest * 0.045, 0.075));
  return new RoundedBoxGeometry(width, height, depth, 1, radius);
}


// Shared low-poly shingle geometry; each building uses one InstancedMesh batch.
const sharedGableShingleGeo = new RoundedBoxGeometry(0.42, 0.065, 0.34, 2, 0.026);
const sharedGableRafterGeo = new RoundedBoxGeometry(1, 0.13, 0.12, 2, 0.025);

/**
 * Adds overlapping shingle courses to a simple gable roof.
 * Tiles are instanced in one draw call and stay within the existing roof silhouette.
 */
function addGableRoofShingles(
  parent: THREE.Group,
  halfWidth: number,
  rise: number,
  baseY: number,
  halfDepth: number,
  material: THREE.Material,
  depthRows = 5
): void {
  const slopeLength = Math.hypot(halfWidth, rise);
  const rows = Math.max(4, Math.ceil(slopeLength / 0.38));
  const count = rows * depthRows * 2;
  const shingles = new THREE.InstancedMesh(sharedGableShingleGeo, material, count);
  shingles.name = 'instancedRoofShingles';
  shingles.userData.distanceLodMinPixels = 36;
  shingles.castShadow = true;
  shingles.receiveShadow = true;
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  let index = 0;

  for (let side = 0; side < 2; side++) {
    const sign = side === 0 ? -1 : 1;
    const rotation = sign === -1 ? Math.atan2(rise, halfWidth) : -Math.atan2(rise, halfWidth);
    for (let row = 0; row < rows; row++) {
      const t = 0.12 + (row / Math.max(1, rows - 1)) * 0.76;
      const x = sign * halfWidth * (1 - t);
      const y = baseY + rise * t + 0.045;
      for (let depth = 0; depth < depthRows; depth++) {
        const zT = depthRows === 1 ? 0.5 : depth / (depthRows - 1);
        const z = THREE.MathUtils.lerp(-halfDepth * 0.82, halfDepth * 0.82, zT);
        dummy.position.set(x, y, z);
        dummy.rotation.set(0, 0, rotation);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        shingles.setMatrixAt(index, dummy.matrix);
        const shade = 0.91 + ((row * 7 + depth * 3 + side * 5) % 7) * 0.012;
        color.setRGB(shade, shade, shade);
        shingles.setColorAt(index, color);
        index++;
      }
    }
  }
  shingles.instanceMatrix.needsUpdate = true;
  if (shingles.instanceColor) shingles.instanceColor.needsUpdate = true;
  parent.add(shingles);

  // Exposed verge rafters make the timber structure legible from close camera angles.
  // A single instanced batch keeps the added architectural detail inexpensive.
  const rafters = new THREE.InstancedMesh(sharedGableRafterGeo, material, 4);
  rafters.name = 'instancedGableRafters';
  rafters.userData.distanceLodMinPixels = 24;
  rafters.castShadow = true;
  rafters.receiveShadow = true;
  const beamColor = new THREE.Color(0.58, 0.42, 0.28);
  let beamIndex = 0;
  for (let side = 0; side < 2; side++) {
    const sign = side === 0 ? -1 : 1;
    const angle = sign === -1 ? Math.atan2(rise, halfWidth) : -Math.atan2(rise, halfWidth);
    for (let end = 0; end < 2; end++) {
      dummy.position.set(
        sign * halfWidth * 0.5,
        baseY + rise * 0.5,
        (end === 0 ? -1 : 1) * (halfDepth + 0.035)
      );
      dummy.rotation.set(0, 0, angle);
      dummy.scale.set(slopeLength + 0.12, 1, 1);
      dummy.updateMatrix();
      rafters.setMatrixAt(beamIndex, dummy.matrix);
      rafters.setColorAt(beamIndex, beamColor);
      beamIndex++;
    }
  }
  rafters.instanceMatrix.needsUpdate = true;
  if (rafters.instanceColor) rafters.instanceColor.needsUpdate = true;
  parent.add(rafters);
}

// ----------------- BUILDINGS (Sculpted Multi-Part Architecture) -----------------

export function createTownCenterMesh(faction: FactionId, civId?: CivilizationId): THREE.Group {
  const group = new THREE.Group();
  const colors = getFactionPalette(faction);
  const civ = civId || colors.civilization || 'medieval';

  addContactShadow(group, 4.3);

  const stoneMaps = getStoneMasonryMaps();
  const woodMaps = getTimberWoodMaps();
  const roofMaps = getRoofShingleMaps();

  const stoneColor = civ === 'fantasy' ? 0xf1f5f9 : civ === 'anime' ? 0x64748b : 0xcbd5e1;
  const woodColor = civ === 'anime' ? 0x5c2d16 : civ === 'fantasy' ? 0x94a3b8 : 0x9a6234;

  const stoneMat = new THREE.MeshStandardMaterial({
    color: stoneColor,
    map: stoneMaps.map,
    normalMap: stoneMaps.normalMap,
    normalScale: new THREE.Vector2(1.0, 1.0),
    roughnessMap: stoneMaps.roughnessMap || null,
    roughness: civ === 'fantasy' ? 0.62 : 0.96,
    metalness: 0.06,
  });
  const darkStoneMat = new THREE.MeshStandardMaterial({
    color: civ === 'fantasy' ? 0xcbd5e1 : 0x475569,
    map: stoneMaps.map,
    normalMap: stoneMaps.normalMap,
    normalScale: new THREE.Vector2(1.05, 1.05),
    roughnessMap: stoneMaps.roughnessMap || null,
    roughness: 0.98,
  });
  const woodMat = new THREE.MeshStandardMaterial({
    color: woodColor,
    map: woodMaps.map,
    normalMap: woodMaps.normalMap,
    normalScale: new THREE.Vector2(0.95, 0.95),
    roughnessMap: woodMaps.roughnessMap || null,
    roughness: 0.9,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    color: civ === 'fantasy' ? 0x0f766e : civ === 'anime' ? 0x1e293b : colors.primary,
    map: roofMaps.map,
    normalMap: roofMaps.normalMap,
    normalScale: new THREE.Vector2(1.1, 1.1),
    roughnessMap: roofMaps.roughnessMap || null,
    roughness: 0.72,
    metalness: 0.16,
  });
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.22, metalness: 0.88 });
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.35, metalness: 0.82 });
  const plasterMat = new THREE.MeshStandardMaterial({
    color: 0xe7dec8,
    map: stoneMaps.map,
    normalMap: stoneMaps.normalMap,
    normalScale: new THREE.Vector2(0.35, 0.35),
    roughnessMap: stoneMaps.roughnessMap || null,
    roughness: 0.9,
  });

  if (civ === 'anime') {
    // Authentic Tenshu Castle on battered trapezoidal Ishigaki stone foundation (fits <= 4.18m collider)
    const ishigaki = new THREE.Mesh(
      makeLatheGeo([
        [3.92, 0.0],
        [3.82, 0.25],
        [3.35, 1.25],
        [0.01, 1.25],
      ], 4),
      darkStoneMat
    );
    ishigaki.rotateY(Math.PI / 4);
    ishigaki.castShadow = true;
    ishigaki.receiveShadow = true;
    group.add(ishigaki);

    // Stone entrance stair apron
    const steps = new THREE.Mesh(roundedBuildingBox(1.9, 0.65, 1.0), stoneMat);
    steps.position.set(0, 0.32, 2.85);
    group.add(steps);

    const tier1 = new THREE.Mesh(roundedBuildingBox(4.5, 1.85, 4.5), woodMat);
    tier1.position.y = 2.15;
    tier1.castShadow = true;
    group.add(tier1);

    // White shikkui plaster facade inset
    const plaster1 = new THREE.Mesh(roundedBuildingBox(4.2, 1.5, 4.62), plasterMat);
    plaster1.position.y = 2.15;
    group.add(plaster1);

    const eave1 = new THREE.Mesh(makePagodaRoofGeo(3.65, 1.35), roofMat);
    eave1.position.y = 3.05;
    eave1.castShadow = true;
    group.add(eave1);

    const tier2 = new THREE.Mesh(roundedBuildingBox(3.2, 1.55, 3.2), plasterMat);
    tier2.position.y = 4.45;
    tier2.castShadow = true;
    group.add(tier2);

    // Timber corner posts on upper watch gallery
    [
      [-1.55, -1.55],
      [1.55, -1.55],
      [-1.55, 1.55],
      [1.55, 1.55],
    ].forEach(([px, pz]) => {
      const post = new THREE.Mesh(roundedBuildingBox(0.16, 1.6, 0.16), woodMat);
      post.position.set(px, 4.45, pz);
      group.add(post);
    });

    const eave2 = new THREE.Mesh(makePagodaRoofGeo(2.8, 1.2), roofMat);
    eave2.position.y = 5.15;
    eave2.castShadow = true;
    group.add(eave2);

    const tier3 = new THREE.Mesh(roundedBuildingBox(2.1, 1.15, 2.1), plasterMat);
    tier3.position.y = 6.25;
    tier3.castShadow = true;
    group.add(tier3);

    // Warm glowing shoji lattice windows across upper watch tiers
    [-0.65, 0.65].forEach((wx) => {
      addMullionedWindow(group, wx, 4.48, 1.62, 0.56, 0.68, 0, woodMat);
      addMullionedWindow(group, wx, 4.48, -1.62, 0.56, 0.68, Math.PI, woodMat);
    });
    addMullionedWindow(group, 0, 6.28, 1.08, 0.68, 0.52, 0, woodMat);

    const eave3 = new THREE.Mesh(makePagodaRoofGeo(2.05, 1.15), roofMat);
    eave3.position.y = 6.75;
    eave3.castShadow = true;
    group.add(eave3);

    // Golden Shachihoko Roof Ridge Finials
    const ridgeBeam = new THREE.Mesh(roundedBuildingBox(1.15, 0.18, 0.2), goldMat);
    ridgeBeam.position.y = 7.9;
    group.add(ridgeBeam);
    [-0.55, 0.55].forEach((sx) => {
      const shachi = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.45, 5), goldMat);
      shachi.position.set(sx, 8.15, 0);
      group.add(shachi);
    });

    // Vermilion Torii entrance & cyan spirit lanterns
    const vermilionMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.45 });
    [-1.25, 1.25].forEach((lx) => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 2.3, 10), vermilionMat);
      post.position.set(lx, 1.4, 2.8);
      post.castShadow = true;
      group.add(post);
      const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshBasicMaterial({ color: 0x38bdf8 }));
      lantern.position.set(lx, 2.25, 2.8);
      group.add(lantern);
    });
    const kasagi = new THREE.Mesh(roundedBuildingBox(3.2, 0.24, 0.34), vermilionMat);
    kasagi.position.set(0, 2.62, 2.8);
    group.add(kasagi);
  } else if (civ === 'fantasy') {
    // Elven Sanctuary Keep: Tiered Marble Plinth + Fluted Colonnade + Living Roots + Spire
    const plinth1 = new THREE.Mesh(new THREE.CylinderGeometry(3.65, 3.88, 0.48, 12), darkStoneMat);
    plinth1.position.y = 0.24;
    plinth1.receiveShadow = true;
    group.add(plinth1);

    const plinth2 = new THREE.Mesh(new THREE.CylinderGeometry(3.3, 3.6, 0.52, 12), stoneMat);
    plinth2.position.y = 0.74;
    plinth2.castShadow = true;
    group.add(plinth2);

    const rotunda = new THREE.Mesh(
      makeLatheGeo([
        [2.45, 0.0],
        [2.25, 0.35],
        [2.15, 2.9],
        [2.45, 3.35],
        [0.01, 3.35],
      ], 12),
      stoneMat
    );
    rotunda.position.y = 1.0;
    rotunda.castShadow = true;
    group.add(rotunda);

    // Fluted perimeter marble columns & pointed canopy spirettes
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      const cx = Math.cos(a) * 2.75;
      const cz = Math.sin(a) * 2.75;
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 3.4, 10), stoneMat);
      col.position.set(cx, 2.6, cz);
      col.castShadow = true;
      group.add(col);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.3, 8), roofMat);
      cap.position.set(cx, 4.9, cz);
      group.add(cap);
    }

    // Living ancient roots spiraling around the marble sanctuary
    const barkMaps = getTreeBarkMaps();
    const rootMat = new THREE.MeshStandardMaterial({
      color: 0x5c3a1e,
      map: barkMaps.map,
      normalMap: barkMaps.normalMap,
      roughness: 0.9,
    });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.78 });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.35;
      const rootCurve = makeTubeGeo([
        [Math.cos(a) * 3.35, 0.14, Math.sin(a) * 3.35],
        [Math.cos(a + 0.24) * 2.58, 0.92, Math.sin(a + 0.24) * 2.58],
        [Math.cos(a + 0.52) * 2.28, 2.02, Math.sin(a + 0.52) * 2.28],
        [Math.cos(a + 0.82) * 2.24, 3.2, Math.sin(a + 0.82) * 2.24],
      ], 0.14, 14, 6);
      const rootMesh = new THREE.Mesh(rootCurve, rootMat);
      rootMesh.castShadow = true;
      group.add(rootMesh);
    }

    const mossGarland = new THREE.Mesh(new THREE.TorusGeometry(2.35, 0.22, 8, 20), leafMat);
    mossGarland.rotation.x = Math.PI / 2;
    mossGarland.position.y = 4.25;
    group.add(mossGarland);

    const roof = new THREE.Mesh(
      makeLatheGeo([
        [2.65, 0.0],
        [1.85, 1.15],
        [0.95, 2.45],
        [0.12, 3.6],
        [0.01, 3.7],
      ], 12),
      roofMat
    );
    roof.position.y = 4.35;
    roof.castShadow = true;
    group.add(roof);

    // Floating Arcane Emerald Crown Crystal
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.62, 0), new THREE.MeshBasicMaterial({ color: 0x34d399 }));
    crystal.position.y = 8.65;
    crystal.name = 'animatedCrystal';
    group.add(crystal);
  } else {
    // Medieval Fortified Keep: Stepped Stone Plinth + Buttresses + Half-Timbered Upper Hall + Hipped Roof + 4 Turrets (fits <= 4.18m collider)
    const plinth = new THREE.Mesh(roundedBuildingBox(5.6, 0.72, 5.6), darkStoneMat);
    plinth.position.y = 0.36;
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    group.add(plinth);

    // Front cobblestone entry apron
    const apron = new THREE.Mesh(roundedBuildingBox(2.8, 0.14, 1.15), darkStoneMat);
    apron.position.set(0, 0.07, 3.15);
    apron.receiveShadow = true;
    group.add(apron);

    const keepLower = new THREE.Mesh(roundedBuildingBox(4.15, 2.3, 4.15), stoneMat);
    keepLower.position.y = 1.87;
    keepLower.castShadow = true;
    group.add(keepLower);

    // Corner masonry buttresses
    [
      [-2.02, -2.02],
      [2.02, -2.02],
      [-2.02, 2.02],
      [2.02, 2.02],
    ].forEach(([bx, bz]) => {
      const buttress = new THREE.Mesh(roundedBuildingBox(0.5, 2.4, 0.5), darkStoneMat);
      buttress.position.set(bx, 1.85, bz);
      group.add(buttress);
    });

    // Tudor half-timbered upper solar hall
    const hallUpper = new THREE.Mesh(roundedBuildingBox(4.45, 1.45, 4.45), plasterMat);
    hallUpper.position.y = 3.72;
    hallUpper.castShadow = true;
    group.add(hallUpper);

    [-1.48, 0, 1.48].forEach((tx) => {
      const beamF = new THREE.Mesh(roundedBuildingBox(0.16, 1.48, 4.54), woodMat);
      beamF.position.set(tx, 3.72, 0);
      group.add(beamF);
      const beamS = new THREE.Mesh(roundedBuildingBox(4.54, 1.48, 0.16), woodMat);
      beamS.position.set(0, 3.72, tx);
      group.add(beamS);
    });

    // Warm mullioned solar hall windows on all 4 facades
    [-0.74, 0.74].forEach((wx) => {
      addMullionedWindow(group, wx, 3.74, 2.25, 0.52, 0.62, 0, woodMat);
      addMullionedWindow(group, wx, 3.74, -2.25, 0.52, 0.62, Math.PI, woodMat);
      addMullionedWindow(group, 2.25, 3.74, wx, 0.52, 0.62, Math.PI / 2, woodMat);
      addMullionedWindow(group, -2.25, 3.74, wx, 0.52, 0.62, -Math.PI / 2, woodMat);
    });

    addMerlonsAroundBox(group, 2.26, 2.26, 4.55, 5, stoneMat);

    // Steep hipped roof with overhanging eaves
    const roof = new THREE.Mesh(
      makeLatheGeo([
        [3.45, 0.0],
        [2.6, 0.85],
        [1.38, 1.75],
        [0.01, 2.55],
      ], 4),
      roofMat
    );
    roof.rotateY(Math.PI / 4);
    roof.position.y = 4.45;
    roof.castShadow = true;
    group.add(roof);

    // 4 Corner Bastion Turrets with corbelled tops, conical slate roofs & gilded finials
    const towerGeo = new THREE.CylinderGeometry(0.64, 0.78, 4.4, 10);
    const corbelGeo = new THREE.CylinderGeometry(0.82, 0.64, 0.42, 10);
    const turretRoofGeo = new THREE.ConeGeometry(0.92, 1.55, 10);
    const finialGeo = new THREE.SphereGeometry(0.11, 8, 8);
    [
      [-2.28, -2.28],
      [2.28, -2.28],
      [-2.28, 2.28],
      [2.28, 2.28],
    ].forEach(([ox, oz]) => {
      const tower = new THREE.Mesh(towerGeo, stoneMat);
      tower.position.set(ox, 2.2, oz);
      tower.castShadow = true;
      group.add(tower);

      const corbel = new THREE.Mesh(corbelGeo, darkStoneMat);
      corbel.position.set(ox, 4.55, oz);
      group.add(corbel);

      const tRoof = new THREE.Mesh(turretRoofGeo, roofMat);
      tRoof.position.set(ox, 5.5, oz);
      tRoof.castShadow = true;
      group.add(tRoof);

      const finial = new THREE.Mesh(finialGeo, goldMat);
      finial.position.set(ox, 6.32, oz);
      group.add(finial);
    });

    // Arched Portcullis Gate + Warm Entry Lanterns
    addArchedDoorway(group, 0, 0.72, 2.12, 1.3, 1.75, darkStoneMat, woodMat, ironMat);
    addWarmLantern(group, -1.0, 2.2, 2.22, ironMat);
    addWarmLantern(group, 1.0, 2.2, 2.22, ironMat);
  }

  // Central Spire & Faction Flag
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.6, 8), goldMat);
  pole.position.set(0, 7.6, 0);
  group.add(pole);

  const flagGeo = new THREE.PlaneGeometry(1.3, 0.72);
  flagGeo.translate(0.65, 0, 0);
  const flagMat = new THREE.MeshStandardMaterial({
    color: colors.banner,
    side: THREE.DoubleSide,
    roughness: 0.88,
    metalness: 0.02,
  });
  const flag = new THREE.Mesh(flagGeo, flagMat);
  flag.position.set(0, 8.35, 0);
  flag.name = 'animatedFlag';
  group.add(flag);

  const tcTitle = civ === 'anime' ? '天守本陣' : civ === 'fantasy' ? '生命聖樹' : '城鎮中心';
  const tcBadge = createBadgeSprite(
    colors.isHostile ? `${colors.labelPrefix || ''}${tcTitle}` : tcTitle,
    civ === 'anime' ? '⛩️' : civ === 'fantasy' ? '🌳' : '🏰',
    '2400',
    1.0,
    colors.isHostile,
    false
  );
  tcBadge.position.set(0, 9.6, 0);
  tcBadge.name = 'bldgBadge';
  group.add(tcBadge);

  return group;
}

export function createBarracksMesh(faction: FactionId, civId?: CivilizationId): THREE.Group {
  const group = new THREE.Group();
  const colors = getFactionPalette(faction);
  const civ = civId || colors.civilization || 'medieval';

  addContactShadow(group, 3.3);

  const stoneMaps = getStoneMasonryMaps();
  const woodMaps = getTimberWoodMaps();
  const roofMaps = getRoofShingleMaps();

  const stoneMat = new THREE.MeshStandardMaterial({
    color: civ === 'fantasy' ? 0xe2e8f0 : 0x94a3b8,
    map: stoneMaps.map,
    normalMap: stoneMaps.normalMap,
    normalScale: new THREE.Vector2(0.95, 0.95),
    roughnessMap: stoneMaps.roughnessMap || null,
    roughness: civ === 'fantasy' ? 0.64 : 0.95,
  });
  const woodMat = new THREE.MeshStandardMaterial({
    color: civ === 'anime' ? 0x6b2710 : civ === 'fantasy' ? 0x166534 : 0xa36c3e,
    map: woodMaps.map,
    normalMap: woodMaps.normalMap,
    normalScale: new THREE.Vector2(0.95, 0.95),
    roughnessMap: woodMaps.roughnessMap || null,
    roughness: 0.88,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    color: civ === 'anime' ? 0x1e293b : civ === 'fantasy' ? 0x0f766e : colors.primary,
    map: roofMaps.map,
    normalMap: roofMaps.normalMap,
    normalScale: new THREE.Vector2(1.05, 1.05),
    roughnessMap: roofMaps.roughnessMap || null,
    roughness: 0.7,
  });
  const plasterMat = new THREE.MeshStandardMaterial({ color: 0xe7dec8, roughness: 0.8 });
  const steelMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.18, metalness: 0.85 });
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.35, metalness: 0.8 });

  // Stone foundation plinth + Lower garrison wall (fits <= 3.02m collider)
  const plinth = new THREE.Mesh(roundedBuildingBox(4.25, 0.45, 3.75), stoneMat);
  plinth.position.y = 0.22;
  plinth.receiveShadow = true;
  group.add(plinth);

  const base = new THREE.Mesh(roundedBuildingBox(4.0, 1.2, 3.45), stoneMat);
  base.position.y = 1.02;
  base.castShadow = true;
  group.add(base);

  // Timber-framed upper floor
  const upper = new THREE.Mesh(roundedBuildingBox(3.85, 1.35, 3.25), civ === 'anime' ? plasterMat : woodMat);
  upper.position.y = 2.28;
  upper.castShadow = true;
  group.add(upper);

  [-1.7, 0, 1.7].forEach((tx) => {
    const beam = new THREE.Mesh(roundedBuildingBox(0.16, 1.4, 3.35), woodMat);
    beam.position.set(tx, 2.28, 0);
    group.add(beam);
  });

  // Warm garrison upper-floor windows + front stone threshold apron
  [-1.12, 1.12].forEach((wx) => {
    addMullionedWindow(group, wx, 2.32, 1.65, 0.46, 0.56, 0, woodMat);
    addMullionedWindow(group, wx, 2.32, -1.65, 0.46, 0.56, Math.PI, woodMat);
  });
  const frontStep = new THREE.Mesh(roundedBuildingBox(2.0, 0.14, 0.75), stoneMat);
  frontStep.position.set(0, 0.07, 2.15);
  group.add(frontStep);

  // Sculpted gabled / pagoda roof
  if (civ === 'anime') {
    const roof = new THREE.Mesh(makePagodaRoofGeo(3.0, 1.6), roofMat);
    roof.scale.set(1.08, 1, 0.94);
    roof.position.y = 2.95;
    roof.castShadow = true;
    group.add(roof);

    const toriiTop = new THREE.Mesh(roundedBuildingBox(2.6, 0.22, 0.28), new THREE.MeshStandardMaterial({ color: 0xdc2626 }));
    toriiTop.position.set(0, 2.85, 1.88);
    group.add(toriiTop);
    [-0.98, 0.98].forEach((px) => {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 2.4, 8), new THREE.MeshStandardMaterial({ color: 0xdc2626 }));
      p.position.set(px, 1.65, 1.88);
      group.add(p);
    });

    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), new THREE.MeshBasicMaterial({ color: 0x38bdf8 }));
    crystal.position.set(0, 5.0, 0);
    crystal.name = 'animatedCrystal';
    group.add(crystal);
  } else {
    const roofShape = new THREE.Shape();
    roofShape.moveTo(-2.3, 0);
    roofShape.lineTo(2.3, 0);
    roofShape.lineTo(0, 1.7);
    roofShape.closePath();
    const roof = new THREE.Mesh(makeExtrudeGeo(roofShape, 3.65, 0.04, 0.04, 1, true), roofMat);
    roof.position.set(0, 2.95, 0);
    roof.castShadow = true;
    group.add(roof);

    addGableRoofShingles(group, 2.3, 1.7, 2.95, 1.825, roofMat, 7);

    const ridge = new THREE.Mesh(roundedBuildingBox(0.22, 0.2, 3.75), woodMat);
    ridge.position.set(0, 4.68, 0);
    group.add(ridge);

    if (civ === 'fantasy') {
      const spire = new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0), new THREE.MeshBasicMaterial({ color: 0x4ade80 }));
      spire.position.set(0, 5.25, 0);
      spire.name = 'animatedCrystal';
      group.add(spire);
    }
  }

  addArchedDoorway(group, 0, 0.44, 1.75, 1.1, 1.45, stoneMat, woodMat, ironMat);
  addWarmLantern(group, -0.9, 1.75, 1.84, ironMat);
  addWarmLantern(group, 0.9, 1.75, 1.84, ironMat);

  // Crossed Broadswords Insignia above Door
  [-Math.PI / 4, Math.PI / 4].forEach((rot) => {
    const blade = new THREE.Mesh(roundedBuildingBox(0.11, 1.35, 0.07), steelMat);
    blade.position.set(0, 2.55, 1.74);
    blade.rotation.z = rot;
    group.add(blade);
  });

  // Outdoor Training Weapon Rack + Shield (tucked tightly alongside barracks plinth)
  const rackPost1 = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 1.25, 6), woodMat);
  rackPost1.position.set(2.02, 0.62, 0.12);
  const rackPost2 = rackPost1.clone();
  rackPost2.position.set(2.02, 0.62, 0.95);
  const rackBar = new THREE.Mesh(roundedBuildingBox(0.1, 0.1, 1.0), woodMat);
  rackBar.position.set(2.02, 1.12, 0.54);
  group.add(rackPost1, rackPost2, rackBar);

  const shieldProp = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.08, 12), roofMat);
  shieldProp.rotation.z = Math.PI / 2.3;
  shieldProp.position.set(1.88, 0.45, 0.54);
  group.add(shieldProp);

  const label = civ === 'anime' ? '忍術道場' : civ === 'fantasy' ? '古樹林苑' : '兵營';
  const bBadge = createBadgeSprite(
    colors.isHostile ? `${colors.labelPrefix || ''}${label}` : label,
    '⚔️',
    '1500',
    1.0,
    colors.isHostile,
    false
  );
  bBadge.position.set(0, 5.4, 0);
  bBadge.name = 'bldgBadge';
  group.add(bBadge);

  return group;
}

export function createArcheryRangeMesh(faction: FactionId): THREE.Group {
  const group = new THREE.Group();
  const colors = getFactionPalette(faction);

  addContactShadow(group, 3.2);

  const woodMaps = getTimberWoodMaps();
  const roofMaps = getRoofShingleMaps();

  const woodMat = new THREE.MeshStandardMaterial({
    color: 0xa36c3e,
    map: woodMaps.map,
    normalMap: woodMaps.normalMap,
    normalScale: new THREE.Vector2(0.95, 0.95),
    roughnessMap: woodMaps.roughnessMap || null,
    roughness: 0.88,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    color: colors.primary,
    map: roofMaps.map,
    normalMap: roofMaps.normalMap,
    normalScale: new THREE.Vector2(1.05, 1.05),
    roughnessMap: roofMaps.roughnessMap || null,
    roughness: 0.68,
  });
  const strawMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.86 });
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.65 });
  const redMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.55 });

  // Timber deck platform
  const platform = new THREE.Mesh(new THREE.BoxGeometry(4.3, 0.35, 3.2), woodMat);
  platform.position.y = 0.175;
  platform.receiveShadow = true;
  group.add(platform);

  // Heavy corner pillars with diagonal knee braces + back timber rack wall
  const pillarGeo = new THREE.CylinderGeometry(0.14, 0.16, 2.35, 8);
  [
    [-1.8, -1.25],
    [1.8, -1.25],
    [-1.8, 1.25],
    [1.8, 1.25],
  ].forEach(([px, pz]) => {
    const p = new THREE.Mesh(pillarGeo, woodMat);
    p.position.set(px, 1.35, pz);
    p.castShadow = true;
    group.add(p);

    const brace = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.72, 0.1), woodMat);
    brace.position.set(px - Math.sign(px) * 0.22, 2.25, pz);
    brace.rotation.z = Math.sign(px) * 0.68;
    group.add(brace);
  });

  // Back range wall with mounted archery shields & quiver barrel
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(3.8, 1.55, 0.18), woodMat);
  backWall.position.set(0, 1.05, -1.28);
  backWall.castShadow = true;
  group.add(backWall);

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.2, 0.65, 10), woodMat);
  barrel.position.set(1.35, 0.62, 0.65);
  group.add(barrel);
  [-0.08, 0, 0.08].forEach((ax) => {
    const arrow = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.75, 5), strawMat);
    arrow.position.set(1.35 + ax, 0.96, 0.65);
    arrow.rotation.z = ax * 1.4;
    group.add(arrow);
  });

  // Gabled overhanging pavilion canopy
  const canopyShape = new THREE.Shape();
  canopyShape.moveTo(-2.45, 0);
  canopyShape.lineTo(2.45, 0);
  canopyShape.lineTo(0, 1.38);
  canopyShape.closePath();
  const canopy = new THREE.Mesh(makeExtrudeGeo(canopyShape, 3.65, 0.04, 0.04, 1, true), roofMat);
  canopy.position.set(0, 2.45, 0);
  canopy.castShadow = true;
  group.add(canopy);
  addGableRoofShingles(group, 2.45, 1.38, 2.45, 1.825, roofMat, 7);

  // Twin Straw Archery Targets tucked within collision footprint facing camera
  [-1.02, 0.88].forEach((tx, idx) => {
    const tz = idx === 0 ? 1.72 : 1.8;
    const targetGrp = new THREE.Group();
    targetGrp.position.set(tx, 0, tz);
    targetGrp.rotation.y = 0.28;

    const stand1 = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 1.38, 6), woodMat);
    stand1.position.set(-0.24, 0.64, -0.18);
    stand1.rotation.x = 0.28;
    const stand2 = stand1.clone();
    stand2.position.set(0.24, 0.64, -0.18);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.56, 0.18, 16), strawMat);
    disc.rotation.x = Math.PI / 2.25;
    disc.position.set(0, 0.94, 0);
    const ringW = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.195, 16), whiteMat);
    ringW.rotation.x = Math.PI / 2.25;
    ringW.position.set(0, 0.94, 0);
    const bull = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.21, 16), redMat);
    bull.rotation.x = Math.PI / 2.25;
    bull.position.set(0, 0.94, 0);

    targetGrp.add(stand1, stand2, disc, ringW, bull);
    group.add(targetGrp);
  });

  const aBadge = createBadgeSprite(
    colors.isHostile ? `${colors.labelPrefix || ''}道場` : '射箭道場',
    '🏹',
    '1200',
    1.0,
    colors.isHostile,
    false
  );
  aBadge.position.set(0, 4.75, 0);
  aBadge.name = 'bldgBadge';
  group.add(aBadge);

  return group;
}


export function createGranaryMesh(faction: FactionId): THREE.Group {
  const group = new THREE.Group();
  const colors = getFactionPalette(faction);
  addContactShadow(group, 1.4);
  const wood = sharedWoodScaffoldMat;
  const roof = new THREE.MeshStandardMaterial({ color: colors.primary, roughness: 0.7 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.35, 2.0), wood);
  base.position.y = 0.18;
  base.castShadow = true;
  const walls = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.1, 1.7), wood);
  walls.position.y = 0.85;
  walls.castShadow = true;
  const roofMesh = new THREE.Mesh(new THREE.ConeGeometry(1.55, 0.7, 4), roof);
  roofMesh.position.y = 1.75;
  roofMesh.rotation.y = Math.PI / 4;
  roofMesh.castShadow = true;
  // Grain sacks
  for (let i = 0; i < 3; i++) {
    const sack = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 6, 5),
      new THREE.MeshStandardMaterial({ color: 0xd6b482, roughness: 0.9 })
    );
    sack.position.set(-0.5 + i * 0.45, 0.45, 1.15);
    group.add(sack);
  }
  group.add(base, walls, roofMesh);
  const badge = createBadgeSprite('農莊', '🌾', '', 0.9, colors.isHostile, false);
  badge.position.y = 2.6;
  badge.name = 'bldgBadge';
  group.add(badge);
  return group;
}

export function createHouseMesh(faction: FactionId, civId?: CivilizationId): THREE.Group {
  const group = new THREE.Group();
  const colors = getFactionPalette(faction);
  const civ = civId || colors.civilization || 'medieval';

  addContactShadow(group, 2.15);

  const stoneMaps = getStoneMasonryMaps();
  const woodMaps = getTimberWoodMaps();
  const roofMaps = getRoofShingleMaps();

  const stoneMat = new THREE.MeshStandardMaterial({
    color: civ === 'fantasy' ? 0xdbeafe : 0x94a3b8,
    map: stoneMaps.map,
    normalMap: stoneMaps.normalMap,
    normalScale: new THREE.Vector2(0.9, 0.9),
    roughnessMap: stoneMaps.roughnessMap || null,
    roughness: 0.95,
  });
  const woodMat = new THREE.MeshStandardMaterial({
    color: civ === 'anime' ? 0x5c2310 : civ === 'fantasy' ? 0x6b4226 : 0x925e34,
    map: woodMaps.map,
    normalMap: woodMaps.normalMap,
    normalScale: new THREE.Vector2(0.95, 0.95),
    roughnessMap: woodMaps.roughnessMap || null,
    roughness: 0.88,
  });
  const wallMat = new THREE.MeshStandardMaterial({
    color: civ === 'anime' ? 0xf3ead8 : civ === 'fantasy' ? 0xdfd9c8 : 0xe7dec8,
    normalMap: stoneMaps.normalMap,
    normalScale: new THREE.Vector2(0.28, 0.28),
    roughness: 0.86,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    color: civ === 'anime' ? 0x1e293b : civ === 'fantasy' ? 0x15803d : colors.primary,
    map: roofMaps.map,
    normalMap: roofMaps.normalMap,
    normalScale: new THREE.Vector2(1.05, 1.05),
    roughnessMap: roofMaps.roughnessMap || null,
    roughness: 0.7,
  });
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.35, metalness: 0.8 });
  const warmGlassMat = new THREE.MeshStandardMaterial({
    color: 0xfde68a,
    emissive: 0xf59e0b,
    emissiveIntensity: 0.55,
    roughness: 0.2,
  });

  // 1. Stone foundation plinth (fits neatly inside house 1.65m collision radius)
  const plinth = new THREE.Mesh(roundedBuildingBox(2.75, 0.32, 2.45), stoneMat);
  plinth.position.y = 0.16;
  plinth.receiveShadow = true;
  group.add(plinth);

  // 2. Main cottage body & corner timber posts
  const lowerWall = new THREE.Mesh(roundedBuildingBox(2.45, 0.65, 2.15), stoneMat);
  lowerWall.position.y = 0.64;
  lowerWall.castShadow = true;
  group.add(lowerWall);

  const upperWall = new THREE.Mesh(roundedBuildingBox(2.38, 0.92, 2.08), wallMat);
  upperWall.position.y = 1.42;
  upperWall.castShadow = true;
  group.add(upperWall);

  const postPositions: Array<[number, number]> = [
    [-1.18, 1.03],
    [1.18, 1.03],
    [-1.18, -1.03],
    [1.18, -1.03],
  ];
  postPositions.forEach(([px, pz]) => {
    const post = new THREE.Mesh(roundedBuildingBox(0.14, 1.02, 0.14), woodMat);
    post.position.set(px, 1.42, pz);
    group.add(post);
  });

  // 3. Roof silhouette (Machiya curved kawara vs Medieval pitched gable + chimney vs Fantasy mossy gable)
  if (civ === 'anime') {
    const roof = new THREE.Mesh(makePagodaRoofGeo(1.92, 1.05), roofMat);
    roof.scale.set(1.06, 0.95, 0.92);
    roof.position.y = 1.88;
    roof.castShadow = true;
    group.add(roof);
  } else {
    const roofShape = new THREE.Shape();
    roofShape.moveTo(-1.45, 0);
    roofShape.lineTo(1.45, 0);
    roofShape.lineTo(0, 1.12);
    roofShape.closePath();
    const roof = new THREE.Mesh(makeExtrudeGeo(roofShape, 2.35, 0.04, 0.04, 1, true), roofMat);
    roof.position.set(0, 1.88, 0);
    roof.castShadow = true;
    group.add(roof);

    addGableRoofShingles(group, 1.45, 1.12, 1.88, 1.175, roofMat, 5);

    const ridge = new THREE.Mesh(roundedBuildingBox(0.16, 0.14, 2.45), woodMat);
    ridge.position.set(0, 3.01, 0);
    group.add(ridge);

    if (civ === 'medieval') {
      const chimney = new THREE.Mesh(roundedBuildingBox(0.38, 1.1, 0.38), stoneMat);
      chimney.position.set(0.68, 2.65, -0.55);
      chimney.castShadow = true;
      const cap = new THREE.Mesh(roundedBuildingBox(0.46, 0.1, 0.46), stoneMat);
      cap.position.set(0.68, 3.22, -0.55);
      group.add(chimney, cap);
    } else {
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), new THREE.MeshBasicMaterial({ color: 0x4ade80 }));
      crystal.position.set(0, 3.35, 0);
      crystal.name = 'animatedCrystal';
      group.add(crystal);
    }
  }

  // 4. Doorway with jambs + warm lit windows + hanging porch lantern
  addArchedDoorway(group, -0.35, 0.32, 1.07, 0.68, 1.02, stoneMat, woodMat, ironMat);
  addWarmLantern(group, 0.32, 1.38, 1.15, ironMat);

  // Warm windows on front & side walls
  const frontWin = new THREE.Mesh(roundedBuildingBox(0.44, 0.42, 0.08), warmGlassMat);
  frontWin.position.set(0.55, 1.38, 1.04);
  const winFrame = new THREE.Mesh(roundedBuildingBox(0.54, 0.5, 0.05), woodMat);
  winFrame.position.set(0.55, 1.38, 1.02);
  const sideWinL = new THREE.Mesh(roundedBuildingBox(0.08, 0.42, 0.46), warmGlassMat);
  sideWinL.position.set(-1.2, 1.38, 0);
  const sideWinR = new THREE.Mesh(roundedBuildingBox(0.08, 0.42, 0.46), warmGlassMat);
  sideWinR.position.set(1.2, 1.38, 0);
  group.add(frontWin, winFrame, sideWinL, sideWinR);

  // Stacked firewood bundle tucked against side wall
  for (let i = 0; i < 3; i++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.72, 6), woodMat);
    log.rotation.x = Math.PI / 2;
    log.position.set(1.32, 0.38 + (i === 2 ? 0.14 : 0), i === 2 ? 0 : -0.1 + i * 0.2);
    group.add(log);
  }

  const badgeTitle =
    civ === 'anime' ? '和風町屋' : civ === 'fantasy' ? '精靈樹屋' : '帝國民居';
  const badge = createBadgeSprite(
    colors.isHostile ? `${colors.labelPrefix || ''}${badgeTitle}` : badgeTitle,
    '🏠',
    '600',
    0.95,
    colors.isHostile,
    false
  );
  badge.position.set(0, 3.65, 0);
  badge.name = 'bldgBadge';
  group.add(badge);
  return group;
}

export function createFarmMesh(): THREE.Group {
  const group = new THREE.Group();

  addContactShadow(group, 2.65);

  const wheatMaps = getWheatFieldMaps();
  const woodMaps = getTimberWoodMaps();
  const stoneMaps = getStoneMasonryMaps();

  const soilMat = new THREE.MeshStandardMaterial({
    color: 0x5c3416,
    normalMap: wheatMaps.normalMap,
    normalScale: new THREE.Vector2(1.0, 1.0),
    roughness: 0.96,
  });
  const wheatMat = new THREE.MeshStandardMaterial({
    color: 0xfacc15,
    map: wheatMaps.map,
    normalMap: wheatMaps.normalMap,
    normalScale: new THREE.Vector2(0.95, 0.95),
    roughness: 0.72,
  });
  const fenceMat = new THREE.MeshStandardMaterial({
    color: 0x8d572c,
    map: woodMaps.map,
    normalMap: woodMaps.normalMap,
    roughness: 0.85,
  });
  const curbMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    map: stoneMaps.map,
    normalMap: stoneMaps.normalMap,
    roughness: 0.9,
  });

  // Low stone/timber retaining bed + mounded tilled soil
  const border = new THREE.Mesh(new THREE.BoxGeometry(3.85, 0.16, 3.85), curbMat);
  border.position.y = 0.08;
  border.receiveShadow = true;
  group.add(border);

  const soil = new THREE.Mesh(new THREE.BoxGeometry(3.55, 0.22, 3.55), soilMat);
  soil.position.y = 0.11;
  soil.receiveShadow = true;
  group.add(soil);

  // Sculpted organic flared wheat sheaf tufts (stalk narrows at waist, fuller golden head on top!)
  const stalkGeo = makeLatheGeo([
    [0.05, 0.0],
    [0.085, 0.18],
    [0.055, 0.32],
    [0.145, 0.48],
    [0.095, 0.62],
    [0.01, 0.68],
  ], 7);
  const stalkCount = 84;
  const wheatInst = new THREE.InstancedMesh(stalkGeo, wheatMat, stalkCount);
  const dummy = new THREE.Object3D();
  const sheafColor = new THREE.Color();
  const farmCropBaseMatrices: THREE.Matrix4[] = [];
  const farmCropBaseColors: THREE.Color[] = [];
  let idx = 0;
  for (let row = 0; row < 6; row++) {
    const z = -1.28 + row * 0.51;
    const ridge = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.23, 3.25, 6), soilMat);
    ridge.rotation.z = Math.PI / 2;
    ridge.position.set(0, 0.22, z);
    group.add(ridge);

    for (let col = 0; col < 14; col++) {
      const jitterX = (((col * 7 + row * 13) % 11) - 5) * 0.016;
      const jitterZ = (((col * 5 + row * 9) % 9) - 4) * 0.022;
      const x = -1.46 + col * 0.225 + (row % 2) * 0.05 + jitterX;
      dummy.position.set(x, 0.21, z + jitterZ);
      dummy.rotation.set(
        (((row + col) % 5) - 2) * 0.09,
        (col * 1.3 + row * 0.7) % (Math.PI * 2),
        (((col * 2 + row) % 5) - 2) * 0.09
      );
      const hScale = 0.85 + ((row * 3 + col * 7) % 5) * 0.1;
      dummy.scale.set(0.92 + ((col + row) % 3) * 0.14, hScale, 0.92 + ((col + row) % 3) * 0.14);
      dummy.updateMatrix();
      wheatInst.setMatrixAt(idx, dummy.matrix);
      farmCropBaseMatrices.push(dummy.matrix.clone());
      sheafColor.setHSL(0.11 + ((col + row) % 4) * 0.009, 0.78, 0.46 + ((row + col) % 3) * 0.06);
      wheatInst.setColorAt(idx, sheafColor);
      farmCropBaseColors.push(sheafColor.clone());
      idx++;
    }
  }
  wheatInst.instanceMatrix.needsUpdate = true;
  if (wheatInst.instanceColor) wheatInst.instanceColor.needsUpdate = true;
  wheatInst.castShadow = true;
  group.add(wheatInst);
  group.userData.farmCropInstances = wheatInst;
  group.userData.farmCropBaseMatrices = farmCropBaseMatrices;
  group.userData.farmCropBaseColors = farmCropBaseColors;

  // Split-rail perimeter fence posts & horizontal rails
  const postGeo = new THREE.CylinderGeometry(0.07, 0.08, 0.72, 6);
  const corners: Array<[number, number]> = [
    [-1.78, -1.78],
    [1.78, -1.78],
    [-1.78, 1.78],
    [1.78, 1.78],
  ];
  corners.forEach(([cx, cz]) => {
    const post = new THREE.Mesh(postGeo, fenceMat);
    post.position.set(cx, 0.36, cz);
    group.add(post);
  });
  [-1.78, 1.78].forEach((pos) => {
    const railX = new THREE.Mesh(new THREE.BoxGeometry(3.56, 0.08, 0.07), fenceMat);
    railX.position.set(0, 0.52, pos);
    group.add(railX);
    const railZ = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, 3.56), fenceMat);
    railZ.position.set(pos, 0.52, 0);
    group.add(railZ);
  });

  // Wooden harvest wheelbarrow + tied grain sack at corner
  const sackMat = new THREE.MeshStandardMaterial({ color: 0xd6b57c, roughness: 0.92 });
  const sack = new THREE.Mesh(
    makeLatheGeo([
      [0.01, 0.0],
      [0.24, 0.06],
      [0.26, 0.25],
      [0.14, 0.42],
      [0.2, 0.5],
      [0.01, 0.52],
    ], 10),
    sackMat
  );
  sack.position.set(1.48, 0.18, 1.48);
  group.add(sack);

  const farmBadge = createBadgeSprite('豐饒農田', '🌾', '產糧中', 1.0, false, true);
  farmBadge.position.set(0, 2.55, 0);
  farmBadge.name = 'bldgBadge';
  group.add(farmBadge);

  return group;
}

export function createCampMesh(type: 'lumber' | 'mining', faction: FactionId): THREE.Group {
  const group = new THREE.Group();
  const colors = getFactionPalette(faction);

  addContactShadow(group, 2.35);

  const woodMaps = getTimberWoodMaps();
  const barkMaps = getTreeBarkMaps();
  const roofMaps = getRoofShingleMaps();
  const woodMat = new THREE.MeshStandardMaterial({
    color: 0xa36c3e,
    map: woodMaps.map,
    normalMap: woodMaps.normalMap,
    roughnessMap: woodMaps.roughnessMap || null,
    roughness: 0.9,
  });
  const barkMat = new THREE.MeshStandardMaterial({
    color: 0x6b3e1b,
    map: barkMaps.map,
    normalMap: barkMaps.normalMap,
    roughnessMap: barkMaps.roughnessMap || null,
    roughness: 0.96,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    color: colors.primary,
    map: roofMaps.map,
    normalMap: roofMaps.normalMap,
    roughnessMap: roofMaps.roughnessMap || null,
    roughness: 0.7,
  });

  // Timber deck + open-sided workshop frame + pitched shingled roof
  const deck = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.2, 2.2), woodMat);
  deck.position.y = 0.1;
  deck.receiveShadow = true;
  group.add(deck);

  const shedWall = new THREE.Mesh(new THREE.BoxGeometry(1.95, 1.32, 1.7), woodMat);
  shedWall.position.set(0, 0.84, -0.05);
  shedWall.castShadow = true;
  group.add(shedWall);

  // Corner timber framing posts + exposed ridge beam
  [
    [-1.08, -0.96],
    [1.08, -0.96],
    [-1.08, 0.96],
    [1.08, 0.96],
  ].forEach(([px, pz]) => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 1.5, 6), barkMat);
    post.position.set(px, 0.88, pz);
    group.add(post);
  });

  const gableShape = new THREE.Shape();
  gableShape.moveTo(-1.5, 0);
  gableShape.lineTo(1.5, 0);
  gableShape.lineTo(0, 0.98);
  gableShape.closePath();
  const roof = new THREE.Mesh(makeExtrudeGeo(gableShape, 2.35, 0.03, 0.03, 1, true), roofMat);
  roof.position.set(0, 1.52, 0);
  roof.castShadow = true;
  group.add(roof);

  if (type === 'lumber') {
    // Stacked bark-textured timber logs on saw-horse + chopping stump tucked within 2.05m collider
    [
      [1.06, 0.2, 0.15],
      [1.06, 0.2, 0.56],
      [1.06, 0.54, 0.35],
    ].forEach(([lx, ly, lz]) => {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 1.25, 10), barkMat);
      log.rotation.z = Math.PI / 2;
      log.position.set(lx, ly, lz);
      log.castShadow = true;
      group.add(log);
    });
    const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.32, 0.52, 10), barkMat);
    stump.position.set(-1.12, 0.26, 0.55);
    const axeHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.65, 6), woodMat);
    axeHandle.position.set(-1.12, 0.72, 0.55);
    axeHandle.rotation.z = 0.45;
    group.add(stump, axeHandle);
  } else {
    // Wheeled Wooden Minecart loaded with faceted Gold/Iron Ore on steel rails (inside 2.05m collider)
    const ironMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.35, metalness: 0.82 });
    const oreMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.18, metalness: 0.9 });
    [-0.3, 0, 0.3, 0.6].forEach((rx) => {
      const sleeper = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.76), barkMat);
      sleeper.position.set(1.0 + rx, 0.025, 0.32);
      group.add(sleeper);
    });
    [-0.25, 0.25].forEach((rz) => {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.06, 0.06), ironMat);
      rail.position.set(1.12, 0.06, 0.32 + rz);
      group.add(rail);
    });
    const cart = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.48, 0.66), woodMat);
    cart.position.set(1.12, 0.42, 0.32);
    cart.castShadow = true;
    group.add(cart);
    [
      [0.82, 0.16, 0.66],
      [1.42, 0.16, 0.66],
      [0.82, 0.16, -0.02],
      [1.42, 0.16, -0.02],
    ].forEach(([wx, wy, wz]) => {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.08, 10), ironMat);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(wx, wy, wz);
      group.add(wheel);
    });
    const ore1 = new THREE.Mesh(new THREE.OctahedronGeometry(0.25, 0), oreMat);
    ore1.position.set(1.02, 0.72, 0.3);
    const ore2 = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), oreMat);
    ore2.position.set(1.28, 0.7, 0.38);
    group.add(ore1, ore2);
  }

  return group;
}

export function createDockMesh(faction: FactionId): THREE.Group {
  const group = new THREE.Group();
  const colors = getFactionPalette(faction);

  addContactShadow(group, 2.8);

  const woodMaps = getTimberWoodMaps();
  const stoneMaps = getStoneMasonryMaps();
  const roofMaps = getRoofShingleMaps();

  const timberMat = new THREE.MeshStandardMaterial({
    color: 0x854d0e,
    map: woodMaps.map,
    normalMap: woodMaps.normalMap,
    roughnessMap: woodMaps.roughnessMap || null,
    roughness: 0.9,
  });
  const plankMat = new THREE.MeshStandardMaterial({
    color: 0xb45309,
    map: woodMaps.map,
    normalMap: woodMaps.normalMap,
    roughnessMap: woodMaps.roughnessMap || null,
    roughness: 0.88,
  });
  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    map: stoneMaps.map,
    normalMap: stoneMaps.normalMap,
    roughnessMap: stoneMaps.roughnessMap || null,
    roughness: 0.94,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    color: colors.primary,
    map: roofMaps.map,
    normalMap: roofMaps.normalMap,
    roughnessMap: roofMaps.roughnessMap || null,
    roughness: 0.7,
  });
  const sailClothMat = new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.75 });

  // Stone quay foundation & heavy harbor pilings
  const quay = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.7, 2.8), stoneMat);
  quay.position.set(0, 0.35, -0.75);
  quay.castShadow = true;
  quay.receiveShadow = true;
  group.add(quay);

  // Extended timber jetty deck reaching into water
  const deck = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.22, 4.4), plankMat);
  deck.position.set(0, 0.8, 0.85);
  deck.castShadow = true;
  deck.receiveShadow = true;
  group.add(deck);

  // Support pilings down into water bed
  [-1.9, -0.65, 0.65, 1.9].forEach((px) => {
    [-0.6, 1.1, 2.75].forEach((pz) => {
      const piling = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 1.35, 8), timberMat);
      piling.position.set(px, 0.52, pz);
      piling.castShadow = true;
      group.add(piling);
    });
  });

  // Harbor boathouse / fish-market warehouse on landward side
  const house = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.9, 2.2), plankMat);
  house.position.set(-0.4, 1.85, -0.6);
  house.castShadow = true;
  group.add(house);

  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.45, 1.45, 4), roofMat);
  roof.rotation.y = Math.PI / 4;
  roof.position.set(-0.4, 3.45, -0.6);
  roof.castShadow = true;
  group.add(roof);

  // Harbor loading crane boom & hanging net/crate
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 3.3, 8), timberMat);
  mast.position.set(1.5, 2.4, 1.9);
  mast.castShadow = true;
  const boom = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 1.9), timberMat);
  boom.position.set(1.5, 3.55, 2.55);
  boom.rotation.x = -0.3;
  const crate = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.55, 0.65), timberMat);
  crate.position.set(1.5, 1.2, 2.8);
  const netRoll = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 1.1, 8), sailClothMat);
  netRoll.rotation.z = Math.PI / 2;
  netRoll.position.set(-1.3, 1.15, 2.1);
  group.add(mast, boom, crate, netRoll);

  // Harbor banner flag
  const flagPole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.2, 6), timberMat);
  flagPole.position.set(-0.4, 4.7, -0.6);
  const banner = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.45, 0.04), roofMat);
  banner.position.set(0.05, 5.45, -0.6);
  banner.name = 'animatedFlag';
  group.add(flagPole, banner);

  return group;
}

export function createTowerMesh(faction: FactionId): THREE.Group {
  const group = new THREE.Group();
  const colors = getFactionPalette(faction);

  addContactShadow(group, 1.9);

  const stoneMaps = getStoneMasonryMaps();
  const woodMaps = getTimberWoodMaps();
  const roofMaps = getRoofShingleMaps();

  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    map: stoneMaps.map,
    normalMap: stoneMaps.normalMap,
    normalScale: new THREE.Vector2(1.0, 1.0),
    roughnessMap: stoneMaps.roughnessMap || null,
    roughness: 0.94,
  });
  const darkStoneMat = new THREE.MeshStandardMaterial({
    color: 0x475569,
    map: stoneMaps.map,
    normalMap: stoneMaps.normalMap,
    roughnessMap: stoneMaps.roughnessMap || null,
    roughness: 0.96,
  });
  const woodMat = new THREE.MeshStandardMaterial({
    color: 0x9a6234,
    map: woodMaps.map,
    normalMap: woodMaps.normalMap,
    roughnessMap: woodMaps.roughnessMap || null,
    roughness: 0.88,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    color: colors.primary,
    map: roofMaps.map,
    normalMap: roofMaps.normalMap,
    roughnessMap: roofMaps.roughnessMap || null,
    roughness: 0.68,
  });
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.35, metalness: 0.82 });

  // Battered stone base + tapered octagonal masonry shaft
  const shaft = new THREE.Mesh(
    makeLatheGeo([
      [1.42, 0.0],
      [1.36, 0.7],
      [1.1, 1.2],
      [0.92, 5.2],
      [1.18, 5.55],
      [1.18, 5.9],
      [0.01, 5.9],
    ], 8),
    stoneMat
  );
  shaft.castShadow = true;
  shaft.receiveShadow = true;
  group.add(shaft);

  // Dark recessed arrow slits on 4 cardinal faces
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    const slit = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.75, 0.14), ironMat);
    slit.position.set(Math.sin(a) * 0.98, 3.3, Math.cos(a) * 0.98);
    slit.rotation.y = a;
    group.add(slit);
  }

  // Timber hoarding balcony with corbel brackets & merlon parapet
  const balcony = new THREE.Mesh(new THREE.CylinderGeometry(1.38, 1.22, 0.75, 8), woodMat);
  balcony.position.y = 5.72;
  balcony.castShadow = true;
  group.add(balcony);

  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const merlon = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.36, 0.22), darkStoneMat);
    merlon.position.set(Math.sin(a) * 1.24, 6.22, Math.cos(a) * 1.24);
    merlon.rotation.y = a;
    group.add(merlon);
  }

  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.52, 1.85, 8), roofMat);
  roof.position.y = 7.05;
  roof.castShadow = true;
  group.add(roof);

  const spireFinial = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.25, metalness: 0.88 })
  );
  spireFinial.position.y = 8.05;
  group.add(spireFinial);

  addWarmLantern(group, 0, 2.4, 1.25, ironMat);
  addWarmLantern(group, 0, 2.4, -1.25, ironMat);

  return group;
}

export function createWallMesh(faction: FactionId, civId?: CivilizationId): THREE.Group {
  const group = new THREE.Group();
  const colors = getFactionPalette(faction);
  const civ = civId || colors.civilization || 'medieval';

  addContactShadow(group, 1.85);
  const stoneMaps = getStoneMasonryMaps();
  const woodMaps = getTimberWoodMaps();

  const stoneMat = new THREE.MeshStandardMaterial({
    color: civ === 'fantasy' ? 0xdbeafe : 0x64748b,
    map: stoneMaps.map,
    normalMap: stoneMaps.normalMap,
    normalScale: new THREE.Vector2(0.9, 0.9),
    roughness: 0.85,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: civ === 'anime' ? 0xe7dec8 : 0x94a3b8,
    map: stoneMaps.map,
    roughness: 0.68,
  });
  const woodMat = new THREE.MeshStandardMaterial({
    color: civ === 'anime' ? 0x7c2d12 : civ === 'fantasy' ? 0x166534 : 0x78350f,
    map: woodMaps.map,
    normalMap: woodMaps.normalMap,
    roughness: 0.78,
  });
  const bannerMat = new THREE.MeshStandardMaterial({
    color: colors.primary,
    roughness: 0.52,
  });

  // Ground stone sill (tier1)
  const sill = new THREE.Mesh(new THREE.BoxGeometry(2.85, 0.42, 1.15), stoneMat);
  sill.position.y = 0.21;
  sill.castShadow = true;
  sill.receiveShadow = true;
  group.add(sill);

  // Main fortified wall curtain (tier2)
  const curtain = new THREE.Mesh(new THREE.BoxGeometry(2.7, 1.55, 0.88), civ === 'anime' ? trimMat : stoneMat);
  curtain.position.y = 1.18;
  curtain.castShadow = true;
  curtain.receiveShadow = true;
  group.add(curtain);

  // Corner heavy buttresses
  [-1.22, 1.22].forEach((px) => {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.56, 2.25, 1.06), stoneMat);
    pillar.position.set(px, 1.12, 0);
    pillar.castShadow = true;
    group.add(pillar);
  });

  // Top palisade / battlements & walkway (tier3)
  const walkway = new THREE.Mesh(new THREE.BoxGeometry(2.75, 0.2, 1.08), woodMat);
  walkway.position.y = 2.02;
  group.add(walkway);

  [-0.85, 0, 0.85].forEach((mx) => {
    const merlon = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.42, 0.34), civ === 'fantasy' ? bannerMat : stoneMat);
    merlon.position.set(mx, 2.32, 0.34);
    merlon.castShadow = true;
    group.add(merlon);
  });

  // Sharpened palisade stakes on outer face
  for (let i = -2; i <= 2; i++) {
    const stake = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.62, 6), woodMat);
    stake.position.set(i * 0.48, 0.72, 0.62);
    stake.rotation.x = Math.PI * 0.22;
    group.add(stake);
  }

  return group;
}

export function createCastleMesh(faction: FactionId): THREE.Group {
  const group = new THREE.Group();
  const colors = getFactionPalette(faction);

  addContactShadow(group, 5.1);

  const stoneMaps = getStoneMasonryMaps();
  const woodMaps = getTimberWoodMaps();
  const roofMaps = getRoofShingleMaps();

  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0x64748b,
    map: stoneMaps.map,
    normalMap: stoneMaps.normalMap,
    normalScale: new THREE.Vector2(1.05, 1.05),
    roughnessMap: stoneMaps.roughnessMap || null,
    roughness: 0.94,
  });
  const darkStoneMat = new THREE.MeshStandardMaterial({
    color: 0x475569,
    map: stoneMaps.map,
    normalMap: stoneMaps.normalMap,
    roughnessMap: stoneMaps.roughnessMap || null,
    roughness: 0.98,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    map: stoneMaps.map,
    normalMap: stoneMaps.normalMap,
    roughnessMap: stoneMaps.roughnessMap || null,
    roughness: 0.74,
  });
  const woodMat = new THREE.MeshStandardMaterial({
    color: 0x8d572c,
    map: woodMaps.map,
    normalMap: woodMaps.normalMap,
    roughnessMap: woodMaps.roughnessMap || null,
    roughness: 0.88,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    color: colors.primary,
    map: roofMaps.map,
    normalMap: roofMaps.normalMap,
    roughnessMap: roofMaps.roughnessMap || null,
    roughness: 0.68,
  });
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.35, metalness: 0.85 });

  // 1. Battered Foundation Plinth (fits cleanly within 4.52m castle collider)
  const foundation = new THREE.Mesh(
    makeLatheGeo([
      [4.38, 0.0],
      [4.05, 1.15],
      [0.01, 1.15],
    ], 4),
    darkStoneMat
  );
  foundation.rotateY(Math.PI / 4);
  foundation.castShadow = true;
  foundation.receiveShadow = true;
  group.add(foundation);

  // 2. Central Great Keep with buttresses & crenellated crown
  const keep = new THREE.Mesh(new THREE.BoxGeometry(3.8, 5.6, 3.8), stoneMat);
  keep.position.y = 3.9;
  keep.castShadow = true;
  group.add(keep);

  [
    [-1.9, -1.9],
    [1.9, -1.9],
    [-1.9, 1.9],
    [1.9, 1.9],
  ].forEach(([bx, bz]) => {
    const buttress = new THREE.Mesh(new THREE.BoxGeometry(0.54, 5.4, 0.54), darkStoneMat);
    buttress.position.set(bx, 3.8, bz);
    group.add(buttress);
  });

  const keepCrown = new THREE.Mesh(new THREE.BoxGeometry(4.25, 0.65, 4.25), trimMat);
  keepCrown.position.y = 7.0;
  keepCrown.castShadow = true;
  group.add(keepCrown);
  addMerlonsAroundBox(group, 2.12, 2.12, 7.45, 5, trimMat);

  const keepRoof = new THREE.Mesh(new THREE.ConeGeometry(3.05, 2.85, 4), roofMat);
  keepRoof.rotateY(Math.PI / 4);
  keepRoof.position.y = 8.9;
  keepRoof.castShadow = true;
  group.add(keepRoof);

  const goldFinialMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.24, metalness: 0.88 });
  const keepFinial = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), goldFinialMat);
  keepFinial.position.y = 10.42;
  group.add(keepFinial);

  [-0.95, 0.95].forEach((wx) => {
    addMullionedWindow(group, wx, 5.2, 1.94, 0.44, 0.82, 0, ironMat);
    addMullionedWindow(group, wx, 5.2, -1.94, 0.44, 0.82, Math.PI, ironMat);
  });

  // 3. Four Corner Bastion Towers with corbels, arrow slits & banners
  const towerGeo = makeLatheGeo([
    [1.35, 0.0],
    [1.26, 1.2],
    [1.08, 7.0],
    [1.42, 7.45],
    [1.42, 8.0],
    [0.01, 8.0],
  ], 10);
  const spireGeo = new THREE.ConeGeometry(1.56, 2.45, 10);
  const poleGeo = new THREE.CylinderGeometry(0.06, 0.06, 1.85, 6);
  const flagGeo = new THREE.PlaneGeometry(0.95, 0.52);
  flagGeo.translate(0.475, 0, 0);
  const flagMat = new THREE.MeshStandardMaterial({ color: colors.banner, side: THREE.DoubleSide, roughness: 0.88, metalness: 0.02 });

  [
    [-2.62, -2.62],
    [2.62, -2.62],
    [-2.62, 2.62],
    [2.62, 2.62],
  ].forEach(([tx, tz]) => {
    const tower = new THREE.Mesh(towerGeo, stoneMat);
    tower.position.set(tx, 0, tz);
    tower.castShadow = true;
    group.add(tower);

    const spire = new THREE.Mesh(spireGeo, roofMat);
    spire.position.set(tx, 9.15, tz);
    spire.castShadow = true;
    group.add(spire);

    const flagPole = new THREE.Mesh(poleGeo, ironMat);
    flagPole.position.set(tx, 10.8, tz);
    group.add(flagPole);

    const flag = new THREE.Mesh(flagGeo, flagMat);
    flag.position.set(tx, 11.2, tz);
    flag.name = 'animatedFlag';
    group.add(flag);
  });

  // 4. Connecting Curtain Walls + Individual Parapet Merlons
  const wallFront = new THREE.Mesh(new THREE.BoxGeometry(3.8, 3.4, 0.98), stoneMat);
  wallFront.position.set(0, 2.45, 2.52);
  wallFront.castShadow = true;
  group.add(wallFront);

  const wallBack = new THREE.Mesh(new THREE.BoxGeometry(3.8, 3.4, 0.98), stoneMat);
  wallBack.position.set(0, 2.45, -2.52);
  wallBack.castShadow = true;
  group.add(wallBack);

  for (let mx = -1.4; mx <= 1.41; mx += 0.7) {
    const mf = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.44, 0.3), trimMat);
    mf.position.set(mx, 4.35, 2.86);
    const mb = mf.clone();
    mb.position.set(mx, 4.35, -2.86);
    group.add(mf, mb);
  }

  // 5. Barbican Arched Portcullis Gateway + Iron Grate + Lanterns
  addArchedDoorway(group, 0, 1.05, 3.02, 1.65, 2.15, trimMat, woodMat, ironMat);
  for (let gx = -0.5; gx <= 0.51; gx += 0.34) {
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.75, 5), ironMat);
    bar.position.set(gx, 1.95, 3.16);
    group.add(bar);
  }
  addWarmLantern(group, -1.15, 2.45, 3.14, ironMat);
  addWarmLantern(group, 1.15, 2.45, 3.14, ironMat);

  const badge = createBadgeSprite(
    colors.isHostile ? `${colors.labelPrefix || ''}城堡要塞` : '防禦城堡要塞',
    '🏰',
    '4800',
    1.0,
    colors.isHostile,
    false
  );
  badge.position.set(0, 12.8, 0);
  badge.name = 'bldgBadge';
  group.add(badge);

  return group;
}

export function createLandmarkMesh(type: LandmarkType, faction: FactionId): THREE.Group {
  const group = new THREE.Group();
  const colors = getFactionPalette(faction);

  addContactShadow(group, 5.2);

  const stoneMaps = getStoneMasonryMaps();
  const roofMaps = getRoofShingleMaps();

  const goldMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.2, metalness: 0.9 });
  const marbleMat = new THREE.MeshStandardMaterial({
    color: 0xf1f5f9,
    map: stoneMaps.map,
    normalMap: stoneMaps.normalMap,
    normalScale: new THREE.Vector2(0.55, 0.55),
    roughnessMap: stoneMaps.roughnessMap || null,
    roughness: 0.56,
  });
  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    map: stoneMaps.map,
    normalMap: stoneMaps.normalMap,
    normalScale: new THREE.Vector2(0.95, 0.95),
    roughnessMap: stoneMaps.roughnessMap || null,
    roughness: 0.92,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    color: colors.primary,
    map: roofMaps.map,
    normalMap: roofMaps.normalMap,
    normalScale: new THREE.Vector2(1.0, 1.0),
    roughnessMap: roofMaps.roughnessMap || null,
    roughness: 0.64,
  });
  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    map: stoneMaps.map,
    normalMap: stoneMaps.normalMap,
    roughnessMap: stoneMaps.roughnessMap || null,
    roughness: 0.85,
  });
  const holyGlowMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });

  switch (type) {
    case 'landmark_aachen': {
      // Aachen Cathedral: Stepped Plinth, Cruciform Nave & Transept, Pitched Roofs, Octagonal Drum, Gold Cupola & Rose Windows
      const base = new THREE.Mesh(new THREE.BoxGeometry(6.7, 0.9, 5.4), marbleMat);
      base.position.y = 0.45;
      base.receiveShadow = true;
      group.add(base);

      const nave = new THREE.Mesh(new THREE.BoxGeometry(5.2, 4.1, 3.2), stoneMat);
      nave.position.y = 2.95;
      nave.castShadow = true;
      group.add(nave);

      const transept = new THREE.Mesh(new THREE.BoxGeometry(2.9, 4.1, 5.6), stoneMat);
      transept.position.y = 2.95;
      transept.castShadow = true;
      group.add(transept);

      // Pitched cathedral gables over nave
      const gableShape = new THREE.Shape();
      gableShape.moveTo(-1.75, 0);
      gableShape.lineTo(1.75, 0);
      gableShape.lineTo(0, 1.4);
      gableShape.closePath();
      const naveRoof = new THREE.Mesh(makeExtrudeGeo(gableShape, 5.4, 0.04, 0.04, 1, true), roofMat);
      naveRoof.rotation.y = Math.PI / 2;
      naveRoof.position.y = 5.0;
      group.add(naveRoof);

      const domeDrum = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.85, 2.1, 8), goldMat);
      domeDrum.position.y = 6.2;
      domeDrum.castShadow = true;
      group.add(domeDrum);

      const spire = new THREE.Mesh(new THREE.ConeGeometry(1.68, 4.6, 8), roofMat);
      spire.position.y = 9.5;
      spire.castShadow = true;
      group.add(spire);

      const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.25, 0.16), goldMat);
      crossV.position.y = 12.25;
      const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.16, 0.16), goldMat);
      crossH.position.y = 12.45;
      group.add(crossV, crossH);

      // Glowing stained glass lancet & rose windows
      const roseWin = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.65, 0.2, 16), holyGlowMat);
      roseWin.rotation.z = Math.PI / 2;
      roseWin.position.set(2.65, 3.6, 0);
      const frontWin = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.2, 16), holyGlowMat);
      frontWin.rotation.x = Math.PI / 2;
      frontWin.position.set(0, 3.7, 2.82);
      group.add(roseWin, frontWin);

      const b = createBadgeSprite(
        colors.isHostile ? '敵·亞琛大教堂' : '亞琛皇家大教堂',
        '⛪',
        '3500',
        1.0,
        colors.isHostile,
        false
      );
      b.position.set(0, 13.5, 0);
      b.name = 'bldgBadge';
      group.add(b);
      break;
    }

    case 'landmark_barracks': {
      const base = new THREE.Mesh(new THREE.BoxGeometry(6.4, 4.5, 5.5), marbleMat);
      base.position.y = 2.25;
      base.castShadow = true;
      group.add(base);

      const crown = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.75, 5.9), darkMat);
      crown.position.y = 4.75;
      group.add(crown);
      addMerlonsAroundBox(group, 3.4, 2.95, 5.28, 6, marbleMat);

      [-2.4, 2.4].forEach((tx) => {
        const tw = new THREE.Mesh(new THREE.CylinderGeometry(1.18, 1.38, 6.2, 10), marbleMat);
        tw.position.set(tx, 3.1, 2.4);
        tw.castShadow = true;
        group.add(tw);

        const roof = new THREE.Mesh(new THREE.ConeGeometry(1.42, 2.25, 10), roofMat);
        roof.position.set(tx, 7.25, 2.4);
        group.add(roof);
      });

      const halberd1 = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.2, 6), goldMat);
      halberd1.position.set(0, 3.0, 2.85);
      halberd1.rotation.z = Math.PI / 4;
      const halberd2 = halberd1.clone();
      halberd2.rotation.z = -Math.PI / 4;
      group.add(halberd1, halberd2);

      const b = createBadgeSprite(
        colors.isHostile ? '敵·白塔軍械院' : '白塔軍械學院',
        '⚔️',
        '3500',
        1.0,
        colors.isHostile,
        false
      );
      b.position.set(0, 9.8, 0);
      b.name = 'bldgBadge';
      group.add(b);
      break;
    }

    case 'landmark_guildhall': {
      const base = new THREE.Mesh(new THREE.BoxGeometry(6.8, 1.15, 6.2), marbleMat);
      base.position.y = 0.58;
      group.add(base);

      const colMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.28 });
      [-2.4, -0.8, 0.8, 2.4].forEach((cx) => {
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 4.0, 14), colMat);
        col.position.set(cx, 2.9, 2.55);
        col.castShadow = true;
        group.add(col);
      });

      // Classical triangular pediment over portico
      const pedShape = new THREE.Shape();
      pedShape.moveTo(-3.1, 0);
      pedShape.lineTo(3.1, 0);
      pedShape.lineTo(0, 1.15);
      pedShape.closePath();
      const pediment = new THREE.Mesh(makeExtrudeGeo(pedShape, 0.9, 0.03, 0.03, 1, true), marbleMat);
      pediment.position.set(0, 4.9, 2.3);
      group.add(pediment);

      const body = new THREE.Mesh(new THREE.BoxGeometry(5.8, 3.6, 4.6), marbleMat);
      body.position.set(0, 2.6, -0.4);
      body.castShadow = true;
      group.add(body);

      const dome = new THREE.Mesh(new THREE.SphereGeometry(2.4, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2), goldMat);
      dome.position.set(0, 4.8, -0.4);
      dome.castShadow = true;
      group.add(dome);

      const chest = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 0.8), goldMat);
      chest.position.set(0, 1.55, 2.45);
      group.add(chest);

      const b = createBadgeSprite(
        colors.isHostile ? '敵·金帳行會廳' : '金帳行會大廳',
        '🪙',
        '4500',
        1.0,
        colors.isHostile,
        false
      );
      b.position.set(0, 9.8, 0);
      b.name = 'bldgBadge';
      group.add(b);
      break;
    }

    case 'landmark_citadel': {
      const citadel = createCastleMesh(faction);
      const b = createBadgeSprite(
        colors.isHostile ? '敵·聖馬可要塞' : '聖馬可要塞督府',
        '🛡️',
        '5200',
        1.0,
        colors.isHostile,
        false
      );
      b.position.set(0, 13.5, 0);
      b.name = 'bldgBadge';
      citadel.add(b);
      return citadel;
    }

    case 'landmark_observatory': {
      const dais1 = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.9, 1.2, 16), stoneMat);
      dais1.position.y = 0.6;
      group.add(dais1);

      const dais2 = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.95, 2.2, 16), marbleMat);
      dais2.position.y = 2.2;
      group.add(dais2);

      const dome = new THREE.Mesh(new THREE.SphereGeometry(1.85, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2), darkMat);
      dome.position.y = 3.3;
      group.add(dome);

      const ringMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.2, metalness: 0.9 });
      const ring1 = new THREE.Mesh(new THREE.TorusGeometry(2.45, 0.12, 10, 28), ringMat);
      ring1.position.y = 4.9;
      ring1.rotateX(Math.PI / 3);
      group.add(ring1);

      const ring2 = new THREE.Mesh(new THREE.TorusGeometry(2.05, 0.1, 10, 28), ringMat);
      ring2.position.y = 4.9;
      ring2.rotateY(Math.PI / 4);
      group.add(ring2);

      const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.54, 4.6, 14), goldMat);
      scope.position.set(0.6, 6.0, 0.6);
      scope.rotateZ(-Math.PI / 4);
      scope.rotateX(Math.PI / 6);
      group.add(scope);

      const b = createBadgeSprite(
        colors.isHostile ? '敵·帝國天文台' : '帝國天文觀象奇觀',
        '🔭',
        '6000',
        1.0,
        colors.isHostile,
        false
      );
      b.position.set(0, 11.0, 0);
      b.name = 'bldgBadge';
      group.add(b);
      break;
    }

    case 'landmark_arsenal': {
      const forge = new THREE.Mesh(new THREE.BoxGeometry(6.2, 3.8, 5.2), new THREE.MeshStandardMaterial({ color: 0x881337, roughness: 0.58 }));
      forge.position.y = 1.9;
      forge.castShadow = true;
      group.add(forge);

      const stackMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.78 });
      [-1.8, 1.8].forEach((sx) => {
        const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.78, 5.4, 12), stackMat);
        stack.position.set(sx, 4.5, -1.2);
        group.add(stack);
      });

      const cannonMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.26, metalness: 0.85 });
      [-1.4, 1.4].forEach((cx) => {
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.38, 2.7, 12), cannonMat);
        barrel.position.set(cx, 4.2, 1.5);
        barrel.rotateX(-Math.PI / 6);
        group.add(barrel);
      });

      const b = createBadgeSprite(
        colors.isHostile ? '敵·紅宮火器坊' : '紅宮神威火器坊',
        '💥',
        '6000',
        1.0,
        colors.isHostile,
        false
      );
      b.position.set(0, 10.5, 0);
      b.name = 'bldgBadge';
      group.add(b);
      break;
    }
  }

  return group;
}

export function createArmoryForgeMesh(faction: FactionId): THREE.Group {
  const group = new THREE.Group();
  const colors = getFactionPalette(faction);
  addContactShadow(group, 3.25);

  const stoneMaps = getStoneMasonryMaps();
  const woodMaps = getTimberWoodMaps();
  const roofMaps = getRoofShingleMaps();
  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0x64748b,
    map: stoneMaps.map,
    normalMap: stoneMaps.normalMap,
    roughnessMap: stoneMaps.roughnessMap || null,
    roughness: 0.95,
  });
  const woodMat = new THREE.MeshStandardMaterial({
    color: 0x78350f,
    map: woodMaps.map,
    normalMap: woodMaps.normalMap,
    roughnessMap: woodMaps.roughnessMap || null,
    roughness: 0.9,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    color: colors.primary,
    map: roofMaps.map,
    normalMap: roofMaps.normalMap,
    roughnessMap: roofMaps.roughnessMap || null,
    roughness: 0.7,
  });
  const emberMat = new THREE.MeshBasicMaterial({ color: 0xf97316 });
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.32, metalness: 0.88 });

  const hall = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.2, 3.4), stoneMat);
  hall.position.y = 1.1;
  hall.castShadow = true;
  group.add(hall);

  const gable = new THREE.Shape();
  gable.moveTo(-2.35, 0);
  gable.lineTo(2.35, 0);
  gable.lineTo(0, 1.5);
  gable.closePath();
  const roof = new THREE.Mesh(makeExtrudeGeo(gable, 3.7, 0.04, 0.04, 1, true), roofMat);
  roof.position.y = 2.2;
  roof.castShadow = true;
  group.add(roof);

  // Tapered masonry chimney stack + stone cap
  const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.65, 4.6, 8), stoneMat);
  chimney.position.set(-1.35, 2.3, -0.85);
  chimney.castShadow = true;
  group.add(chimney);

  // Recessed arched forge furnace hearth
  const hearthFrame = new THREE.Mesh(new THREE.BoxGeometry(1.35, 1.15, 0.35), stoneMat);
  hearthFrame.position.set(-0.65, 0.65, 1.72);
  group.add(hearthFrame);
  const hearthGlow = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.75, 0.38), emberMat);
  hearthGlow.position.set(-0.65, 0.55, 1.74);
  group.add(hearthGlow);

  // Sculpted Blacksmith Anvil on Oak Stump
  const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.58, 10), woodMat);
  stump.position.set(1.4, 0.29, 2.1);
  group.add(stump);

  const anvilShape = new THREE.Shape();
  anvilShape.moveTo(-0.35, 0);
  anvilShape.lineTo(0.35, 0);
  anvilShape.lineTo(0.24, 0.18);
  anvilShape.lineTo(0.45, 0.28);
  anvilShape.lineTo(0.45, 0.38);
  anvilShape.lineTo(-0.55, 0.36);
  anvilShape.lineTo(-0.22, 0.22);
  anvilShape.closePath();
  const anvil = new THREE.Mesh(makeExtrudeGeo(anvilShape, 0.3, 0.02, 0.02, 1, true), ironMat);
  anvil.position.set(1.4, 0.58, 2.1);
  group.add(anvil);

  const badge = createBadgeSprite(
    colors.isHostile ? `${colors.labelPrefix || ''}鍛造工坊` : '皇家鍛造工坊',
    '🔨',
    '1600',
    1.0,
    colors.isHostile,
    false
  );
  badge.position.set(0, 5.1, 0);
  badge.name = 'bldgBadge';
  group.add(badge);

  return group;
}

export function createSpiritShrineMesh(faction: FactionId): THREE.Group {
  const group = new THREE.Group();
  const colors = getFactionPalette(faction);
  addContactShadow(group, 3.25);

  const stoneMaps = getStoneMasonryMaps();
  const woodMaps = getTimberWoodMaps();
  const roofMaps = getRoofShingleMaps();
  const slateMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    map: stoneMaps.map,
    normalMap: stoneMaps.normalMap,
    roughnessMap: stoneMaps.roughnessMap || null,
    roughness: 0.9,
  });
  const woodMat = new THREE.MeshStandardMaterial({
    color: 0x5c2d16,
    map: woodMaps.map,
    normalMap: woodMaps.normalMap,
    roughnessMap: woodMaps.roughnessMap || null,
    roughness: 0.86,
  });
  const plasterMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.78 });
  const vermilionMat = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.46 });
  const roofMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    map: roofMaps.map,
    normalMap: roofMaps.normalMap,
    roughnessMap: roofMaps.roughnessMap || null,
    roughness: 0.66,
    metalness: 0.24,
  });
  const spiritGlowMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
  const shojiMat = new THREE.MeshBasicMaterial({ color: 0xfef3c7 });

  const base = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.48, 4.6), slateMat);
  base.position.y = 0.24;
  base.receiveShadow = true;
  group.add(base);

  // Raised wooden engawa porch deck
  const porch = new THREE.Mesh(new THREE.BoxGeometry(3.75, 0.28, 3.2), woodMat);
  porch.position.set(0, 0.62, -0.5);
  group.add(porch);

  // White shikkui sanctuary hall framed with dark cypress pillars + glowing shoji doors
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.9, 1.75, 2.4), plasterMat);
  body.position.set(0, 1.62, -0.55);
  body.castShadow = true;
  group.add(body);

  [
    [-1.44, -1.74],
    [1.44, -1.74],
    [-1.44, 0.64],
    [1.44, 0.64],
  ].forEach(([px, pz]) => {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 1.85, 8), vermilionMat);
    col.position.set(px, 1.62, pz);
    group.add(col);
  });

  const shojiDoor = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.35, 0.12), shojiMat);
  shojiDoor.position.set(0, 1.45, 0.64);
  const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(1.34, 1.5, 0.08), woodMat);
  doorFrame.position.set(0, 1.48, 0.62);
  group.add(doorFrame, shojiDoor);

  const roof1 = new THREE.Mesh(makePagodaRoofGeo(2.55, 1.15), roofMat);
  roof1.position.set(0, 2.42, -0.55);
  roof1.castShadow = true;
  group.add(roof1);

  const upperTier = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.9, 1.65), plasterMat);
  upperTier.position.set(0, 3.25, -0.55);
  group.add(upperTier);

  const roof2 = new THREE.Mesh(makePagodaRoofGeo(1.85, 1.05), roofMat);
  roof2.position.set(0, 3.65, -0.55);
  roof2.castShadow = true;
  group.add(roof2);

  // Authentic Crimson Torii Gate + Twin Stone Toro Lanterns
  [-1.25, 1.25].forEach((px) => {
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.17, 2.55, 10), vermilionMat);
    pillar.position.set(px, 1.5, 1.65);
    pillar.castShadow = true;
    group.add(pillar);

    const lanternBase = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.75, 6), slateMat);
    lanternBase.position.set(px * 1.42, 0.62, 1.85);
    group.add(lanternBase);
    const lanternCore = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), spiritGlowMat);
    lanternCore.position.set(px * 1.42, 1.08, 1.85);
    group.add(lanternCore);
  });

  const kasagiCurve = makeTubeGeo([
    [-1.85, 2.86, 1.65],
    [0, 2.74, 1.65],
    [1.85, 2.86, 1.65],
  ], 0.14, 10, 6);
  const kasagi = new THREE.Mesh(kasagiCurve, roofMat);
  group.add(kasagi);
  const nuki = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.16, 0.22), vermilionMat);
  nuki.position.set(0, 2.35, 1.65);
  group.add(nuki);

  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0), spiritGlowMat);
  crystal.position.set(0, 5.35, -0.55);
  crystal.name = 'animatedCrystal';
  group.add(crystal);

  const badge = createBadgeSprite(
    colors.isHostile ? `${colors.labelPrefix || ''}靈脈神社` : '靈脈神社',
    '⛩️',
    '1350',
    1.0,
    colors.isHostile,
    false
  );
  badge.position.set(0, 6.2, 0);
  badge.name = 'bldgBadge';
  group.add(badge);

  return group;
}

export function createManaWellMesh(faction: FactionId): THREE.Group {
  const group = new THREE.Group();
  const colors = getFactionPalette(faction);
  addContactShadow(group, 3.25);

  const stoneMaps = getStoneMasonryMaps();
  const marbleMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    map: stoneMaps.map,
    normalMap: stoneMaps.normalMap,
    roughness: 0.36,
  });
  const poolMat = new THREE.MeshStandardMaterial({
    color: 0x06b6d4,
    emissive: 0x0891b2,
    emissiveIntensity: 0.45,
    roughness: 0.15,
    metalness: 0.2,
  });
  const crystalMat = new THREE.MeshBasicMaterial({ color: 0x34d399 });
  const mossMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.82 });

  const rim = new THREE.Mesh(
    makeLatheGeo([
      [3.05, 0.0],
      [2.85, 0.35],
      [2.75, 0.72],
      [2.32, 0.72],
      [2.25, 0.25],
      [0.01, 0.25],
    ], 20),
    marbleMat
  );
  rim.castShadow = true;
  rim.receiveShadow = true;
  group.add(rim);

  const pool = new THREE.Mesh(new THREE.CylinderGeometry(2.22, 2.22, 0.38, 20), poolMat);
  pool.position.y = 0.44;
  group.add(pool);

  // Carved central lotus pedestal spire rising from fountain center
  const pedestal = new THREE.Mesh(
    makeLatheGeo([
      [0.65, 0.25],
      [0.42, 0.75],
      [0.32, 1.35],
      [0.52, 1.65],
      [0.2, 1.75],
      [0.01, 1.78],
    ], 12),
    marbleMat
  );
  pedestal.castShadow = true;
  group.add(pedestal);

  // 4 marble columns + graceful curved stone ribs arching above the orb
  [
    [-1.85, -1.85],
    [1.85, -1.85],
    [-1.85, 1.85],
    [1.85, 1.85],
  ].forEach(([px, pz]) => {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 3.05, 10), marbleMat);
    col.position.set(px, 1.72, pz);
    col.castShadow = true;
    group.add(col);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.75, 8), mossMat);
    tip.position.set(px, 3.55, pz);
    group.add(tip);

    const archRib = new THREE.Mesh(
      makeTubeGeo([
        [px, 3.1, pz],
        [px * 0.48, 3.85, pz * 0.48],
        [0, 4.15, 0],
      ], 0.11, 10, 6),
      marbleMat
    );
    archRib.castShadow = true;
    group.add(archRib);
  });

  const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.62, 0), crystalMat);
  orb.position.set(0, 2.7, 0);
  orb.name = 'animatedCrystal';
  group.add(orb);

  const badge = createBadgeSprite(
    colors.isHostile ? `${colors.labelPrefix || ''}魔力之泉` : '精靈魔力之泉',
    '🔮',
    '1450',
    1.0,
    colors.isHostile,
    false
  );
  badge.position.set(0, 4.9, 0);
  badge.name = 'bldgBadge';
  group.add(badge);

  return group;
}

interface BuildingTierPart {
  obj: THREE.Object3D;
  tier: 1 | 2 | 3;
  basePosY: number;
  baseScaleX: number;
  baseScaleY: number;
  baseScaleZ: number;
  boxMinY: number;
  boxMaxY: number;
  baseRotZ: number;
  staggerBias: number;
}

interface BuildingVisualRig {
  parts: BuildingTierPart[];
  scaffoldGroup: THREE.Group;
  scaffoldFrame: THREE.Group;
  padMesh: THREE.Mesh;
  planksGroup: THREE.Group;
  pulleyLoad: THREE.Object3D | null;
  tier2MaxY: number;
  maxY: number;
  footprintHalf: number;
}

const scaffoldPadMaps = getConstructionPadMaps();
const scaffoldWoodMaps = getTimberWoodMaps();

const scaffoldPadMat = new THREE.MeshStandardMaterial({
  color: 0xd6c4a4,
  map: scaffoldPadMaps.map,
  normalMap: scaffoldPadMaps.normalMap,
  normalScale: new THREE.Vector2(1.05, 1.05),
  roughnessMap: scaffoldPadMaps.roughnessMap || null,
  roughness: 0.96,
});
const scaffoldPoleMat = new THREE.MeshStandardMaterial({
  color: 0x9c6b3a,
  map: scaffoldWoodMaps.map,
  normalMap: scaffoldWoodMaps.normalMap,
  roughnessMap: scaffoldWoodMaps.roughnessMap || null,
  roughness: 0.9,
});
const scaffoldPlankMat = new THREE.MeshStandardMaterial({
  color: 0xc68b52,
  map: scaffoldWoodMaps.map,
  normalMap: scaffoldWoodMaps.normalMap,
  roughnessMap: scaffoldWoodMaps.roughnessMap || null,
  roughness: 0.88,
  transparent: true,
  opacity: 1,
});
const scaffoldRopeMat = new THREE.MeshStandardMaterial({
  color: 0xd4b483,
  roughness: 0.92,
});
const scaffoldCrateMat = new THREE.MeshStandardMaterial({
  color: 0xb47b44,
  map: scaffoldWoodMaps.map,
  normalMap: scaffoldWoodMaps.normalMap,
  roughnessMap: scaffoldWoodMaps.roughnessMap || null,
  roughness: 0.86,
});

function attachBuildingConstructionRig(group: THREE.Group, type: BuildingType): void {
  group.updateMatrixWorld(true);
  const overallBox = new THREE.Box3();
  const partBoxes: Array<{ obj: THREE.Object3D; box: THREE.Box3 }> = [];

  for (const child of group.children) {
    if (
      child.name === 'bldgBadge' ||
      child.name === 'contactShadow' ||
      child.name === 'factionRing' ||
      child.name === 'scaffoldGroup'
    ) {
      continue;
    }
    const box = new THREE.Box3().setFromObject(child);
    if (!box.isEmpty()) {
      overallBox.union(box);
      partBoxes.push({ obj: child, box });
    }
  }

  const maxY = Math.max(1.2, overallBox.max.y || 3.5);
  const halfX = Math.max(1.3, (overallBox.max.x - overallBox.min.x) * 0.52);
  const halfZ = Math.max(1.3, (overallBox.max.z - overallBox.min.z) * 0.52);
  const footprintHalf = Math.max(halfX, halfZ);

  let tier2MaxY = 0;
  const parts: BuildingTierPart[] = partBoxes.map(({ obj, box }, idx) => {
    const centerY = (box.min.y + box.max.y) * 0.5;
    let tier: 1 | 2 | 3;
    if (type === 'farm') {
      tier = centerY <= 0.14 ? 1 : centerY <= 0.45 ? 2 : 3;
    } else if (box.min.y <= 0.25 && box.max.y <= maxY * 0.34) {
      tier = 1;
    } else if (centerY <= maxY * 0.58) {
      tier = 2;
    } else {
      tier = 3;
    }
    if (tier === 2) {
      tier2MaxY = Math.max(tier2MaxY, box.max.y);
    }
    return {
      obj,
      tier,
      basePosY: obj.position.y,
      baseScaleX: obj.scale.x,
      baseScaleY: obj.scale.y,
      baseScaleZ: obj.scale.z,
      boxMinY: Math.max(0, box.min.y),
      boxMaxY: Math.max(0.1, box.max.y),
      baseRotZ: obj.rotation.z,
      staggerBias: ((idx * 37) % 11) * 0.012,
    };
  });
  if (tier2MaxY <= 0.1) tier2MaxY = maxY * 0.52;

  // Grounded Excavated Construction Apron + Timber Scaffolding + Cross Braces + Catwalks + Hoist Pulley
  const scaffoldGroup = new THREE.Group();
  scaffoldGroup.name = 'scaffoldGroup';
  scaffoldGroup.visible = false;

  const padMesh = new THREE.Mesh(
    new THREE.BoxGeometry(halfX * 2.24, 0.05, halfZ * 2.24),
    scaffoldPadMat
  );
  padMesh.position.y = 0.025;
  padMesh.receiveShadow = true;
  scaffoldGroup.add(padMesh);

  const scaffoldFrame = new THREE.Group();
  scaffoldGroup.add(scaffoldFrame);

  const planksGroup = new THREE.Group();
  scaffoldFrame.add(planksGroup);

  const scafH = Math.max(1.5, Math.min(6.4, maxY * 0.84));
  const poleGeo = new THREE.CylinderGeometry(0.062, 0.078, scafH, 6);
  const px = halfX + 0.18;
  const pz = halfZ + 0.18;
  const corners: Array<[number, number]> = [
    [-px, -pz],
    [px, -pz],
    [px, pz],
    [-px, pz],
  ];
  corners.forEach(([cx, cz]) => {
    const pole = new THREE.Mesh(poleGeo, scaffoldPoleMat);
    pole.position.set(cx, scafH * 0.5, cz);
    pole.castShadow = true;
    scaffoldFrame.add(pole);

    // Timber corner stake footing collar
    const stakeCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.22, 6), scaffoldCrateMat);
    stakeCollar.position.set(cx, 0.11, cz);
    scaffoldFrame.add(stakeCollar);
  });

  // Ground boundary rope perimeter connecting corner stakes
  const ropeXGeo = new THREE.CylinderGeometry(0.022, 0.022, px * 2, 5);
  ropeXGeo.rotateZ(Math.PI / 2);
  const ropeZGeo = new THREE.CylinderGeometry(0.022, 0.022, pz * 2, 5);
  ropeZGeo.rotateX(Math.PI / 2);
  [pz, -pz].forEach((rz) => {
    const r = new THREE.Mesh(ropeXGeo, scaffoldRopeMat);
    r.position.set(0, 0.36, rz);
    scaffoldFrame.add(r);
  });
  [px, -px].forEach((rx) => {
    const r = new THREE.Mesh(ropeZGeo, scaffoldRopeMat);
    r.position.set(rx, 0.36, 0);
    scaffoldFrame.add(r);
  });

  let pulleyLoad: THREE.Object3D | null = null;

  if (type !== 'farm') {
    const ledgerH1 = scafH * 0.42;
    const ledgerH2 = scafH * 0.82;
    const xBeamGeo = new THREE.BoxGeometry(px * 2 + 0.14, 0.08, 0.09);
    const zBeamGeo = new THREE.BoxGeometry(0.09, 0.08, pz * 2 + 0.14);
    [ledgerH1, ledgerH2].forEach((ly) => {
      [pz, -pz].forEach((bz) => {
        const xb = new THREE.Mesh(xBeamGeo, scaffoldPoleMat);
        xb.position.set(0, ly, bz);
        scaffoldFrame.add(xb);
      });
      [px, -px].forEach((bx) => {
        const zb = new THREE.Mesh(zBeamGeo, scaffoldPoleMat);
        zb.position.set(bx, ly, 0);
        scaffoldFrame.add(zb);
      });
    });

    // Diagonal cross-braces on side scaffolding frames for structural authenticity
    const diagLen = Math.hypot(px * 1.9, ledgerH2 * 0.88);
    const diagAngle = Math.atan2(ledgerH2 * 0.88, px * 1.9);
    const braceGeo = new THREE.BoxGeometry(diagLen, 0.055, 0.055);
    [pz, -pz].forEach((bz) => {
      const b1 = new THREE.Mesh(braceGeo, scaffoldPoleMat);
      b1.position.set(0, ledgerH2 * 0.5, bz);
      b1.rotation.z = diagAngle;
      const b2 = new THREE.Mesh(braceGeo, scaffoldPoleMat);
      b2.position.set(0, ledgerH2 * 0.5, bz);
      b2.rotation.z = -diagAngle;
      scaffoldFrame.add(b1, b2);
    });

    // Wooden plank catwalks at mid-level for builders
    const frontWalk = new THREE.Mesh(new THREE.BoxGeometry(px * 1.95, 0.06, 0.38), scaffoldPlankMat);
    frontWalk.position.set(0, ledgerH1 + 0.05, pz - 0.12);
    const rightWalk = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.06, pz * 1.95), scaffoldPlankMat);
    rightWalk.position.set(px - 0.12, ledgerH1 + 0.05, 0);
    planksGroup.add(frontWalk, rightWalk);

    // Timber Hoist Jib Arm & Suspended Rope/Beam Bundle
    const jibMast = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.08, scafH * 0.45, 6), scaffoldPoleMat);
    jibMast.position.set(-px, scafH + scafH * 0.18, pz);
    const jibArm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.95), scaffoldPoleMat);
    jibArm.position.set(-px, scafH + scafH * 0.36, pz + 0.32);
    jibArm.rotation.x = -0.22;
    scaffoldFrame.add(jibMast, jibArm);

    const hoistPivot = new THREE.Group();
    hoistPivot.position.set(-px, scafH + scafH * 0.4, pz + 0.68);
    const ropeDrop = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.85, 5), scaffoldRopeMat);
    ropeDrop.position.y = -0.42;
    const hungTimber = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.24), scaffoldCrateMat);
    hungTimber.position.y = -0.88;
    hoistPivot.add(ropeDrop, hungTimber);
    scaffoldFrame.add(hoistPivot);
    pulleyLoad = hoistPivot;

    // Corner supply crates & stacked timber logs on construction plot edge
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.45, 0.55), scaffoldCrateMat);
    crate.position.set(px - 0.35, 0.24, pz + 0.28);
    scaffoldFrame.add(crate);
    for (let l = 0; l < 2; l++) {
      const log = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.1, 0.95, 6),
        scaffoldPoleMat
      );
      log.rotation.z = Math.PI / 2;
      log.position.set(-px + 0.55, 0.12 + l * 0.16, pz + 0.28);
      scaffoldFrame.add(log);
    }
  }

  group.add(scaffoldGroup);

  const rig: BuildingVisualRig = {
    parts,
    scaffoldGroup,
    scaffoldFrame,
    padMesh,
    planksGroup,
    pulleyLoad,
    tier2MaxY,
    maxY,
    footprintHalf,
  };
  group.userData.buildRig = rig;
}

/**
 * Updates building mesh to show realistic, continuous staged construction (excavated pad -> stone plinth ->
 * rising masonry/timber framing -> grounded roof assembly & seamless scaffolding dismantle) plus subtle impact settle.
 */
export function applyBuildingConstructionVisuals(
  mesh: THREE.Group,
  state: BuildingVisualState,
  simTime = 0,
  hammerImpulse = 0
): void {
  const rig = mesh.userData.buildRig as BuildingVisualRig | undefined;
  if (!rig) return;

  rig.scaffoldGroup.visible = state.showScaffold;
  if (state.showScaffold) {
    rig.padMesh.scale.set(1, Math.max(0.2, state.foundationReveal), 1);
    rig.scaffoldFrame.scale.set(1, state.scaffoldHeightScale, 1);
    rig.planksGroup.visible = state.planksOpacity > 0.06;
    scaffoldPlankMat.opacity = Math.max(0.08, state.planksOpacity);
    if (rig.pulleyLoad) {
      rig.pulleyLoad.position.y =
        rig.maxY * 0.84 * 1.4 - Math.sin(simTime * 2.1) * 0.16;
      rig.pulleyLoad.rotation.z = Math.sin(simTime * 1.4) * 0.05;
    }
  }

  // Subtle tactile masonry/timber settle pulse when workers strike with hammers
  const settleCompress = hammerImpulse > 0.005 ? 1 - hammerImpulse * 0.014 : 1;

  for (const part of rig.parts) {
    const rawReveal =
      part.tier === 1
        ? state.tier1Reveal
        : part.tier === 2
        ? state.tier2Reveal
        : state.tier3Reveal;

    // Gentle part stagger for multi-element walls/turrets so assembly flows smoothly
    const reveal =
      rawReveal >= 0.999
        ? 1
        : rawReveal <= 0.001
        ? 0
        : Math.max(0, Math.min(1, (rawReveal - part.staggerBias * 0.4) / Math.max(0.6, 1 - part.staggerBias * 0.4)));

    if (reveal <= 0.015) {
      part.obj.visible = false;
      continue;
    }

    part.obj.visible = true;
    if (reveal >= 0.999) {
      part.obj.scale.set(part.baseScaleX, part.baseScaleY * settleCompress, part.baseScaleZ);
      part.obj.position.y = part.basePosY;
    } else if (part.tier === 1) {
      const sY = Math.max(0.06, reveal) * settleCompress;
      const sXZ = 0.86 + 0.14 * reveal;
      part.obj.scale.set(part.baseScaleX * sXZ, part.baseScaleY * sY, part.baseScaleZ * sXZ);
      part.obj.position.y = part.basePosY - (1 - sY) * Math.max(0, part.basePosY - part.boxMinY * 0.6);
    } else if (part.tier === 2) {
      const sY = Math.max(0.04, reveal) * settleCompress;
      const sXZ = 0.92 + 0.08 * reveal;
      part.obj.scale.set(part.baseScaleX * sXZ, part.baseScaleY * sY, part.baseScaleZ * sXZ);
      part.obj.position.y = part.basePosY - (1 - sY) * Math.max(0, part.basePosY - part.boxMinY);
    } else {
      // Tier 3 (roofs/turrets/spires): track exact rising crown of Tier 2 walls so roofs never float detached
      const wallTopFraction = state.tier2Reveal;
      const maxDrop = Math.max(0.35, part.boxMinY - Math.min(part.boxMinY, rig.tier2MaxY * 0.35));
      const dropOffset = (1 - wallTopFraction) * maxDrop;
      const sXZ = 0.8 + 0.2 * Math.min(1, reveal * 1.15);
      const sY = Math.max(0.08, reveal) * settleCompress;
      part.obj.scale.set(part.baseScaleX * sXZ, part.baseScaleY * sY, part.baseScaleZ * sXZ);
      part.obj.position.y = Math.max(0.18, part.basePosY - dropOffset - (1 - sY) * Math.max(0, part.basePosY - part.boxMinY));
    }
  }
}

interface ClonedDamageMatEntry {
  mat: THREE.MeshStandardMaterial;
  origColor: THREE.Color;
  origEmissive: THREE.Color;
  origEmissiveIntensity: number;
}

const SCORCH_TARGET_COLOR = new THREE.Color(0x2a1f1d);
const EMBER_GLOW_COLOR = new THREE.Color(0xb45309);
const HIT_FLASH_COLOR = new THREE.Color(0xfdba74);

/**
 * Lazily clones materials for an individual damaged/hit-flashing building (leaving shared scene materials untouched),
 * applies progressive charcoal scorch tint, ember glow at critical HP, and subtle structural sag from the base.
 */
export function applyBuildingDamageVisuals(
  mesh: THREE.Group,
  damageSeverity: number,
  hitFlashActive: boolean,
  sagTiltRad: number,
  simTime: number
): void {
  let entries = mesh.userData.damageMatEntries as ClonedDamageMatEntry[] | undefined;
  const needsEffects = damageSeverity > 0.01 || hitFlashActive || sagTiltRad > 0.001;

  if (!entries && !needsEffects) return;

  if (!entries) {
    entries = [];
    const seenMatMap = new Map<THREE.Material, THREE.MeshStandardMaterial>();
    mesh.traverse((child) => {
      if (
        child.name === 'bldgBadge' ||
        child.name === 'contactShadow' ||
        child.name === 'factionRing' ||
        child.name === 'scaffoldGroup'
      ) {
        return;
      }
      const mObj = child as THREE.Mesh;
      if (!mObj.isMesh || !mObj.material || Array.isArray(mObj.material)) return;
      const std = mObj.material as THREE.MeshStandardMaterial;
      if (!std.isMeshStandardMaterial) return;

      let cloned = seenMatMap.get(std);
      if (!cloned) {
        cloned = std.clone();
        seenMatMap.set(std, cloned);
        entries!.push({
          mat: cloned,
          origColor: cloned.color.clone(),
          origEmissive: cloned.emissive.clone(),
          origEmissiveIntensity: cloned.emissiveIntensity ?? 1,
        });
      }
      mObj.material = cloned;
    });
    mesh.userData.damageMatEntries = entries;
  }

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (damageSeverity > 0.01) {
      e.mat.color.copy(e.origColor).lerp(SCORCH_TARGET_COLOR, damageSeverity * 0.56);
    } else {
      e.mat.color.copy(e.origColor);
    }

    if (hitFlashActive) {
      e.mat.emissive.copy(HIT_FLASH_COLOR);
      e.mat.emissiveIntensity = 0.55;
    } else if (damageSeverity > 0.48) {
      const emberStrength = ((damageSeverity - 0.48) / 0.52) * (0.28 + 0.16 * Math.sin(simTime * 7.5 + i));
      e.mat.emissive.copy(e.origEmissive).lerp(EMBER_GLOW_COLOR, emberStrength);
      e.mat.emissiveIntensity = Math.max(e.origEmissiveIntensity, 0.35 + emberStrength);
    } else {
      e.mat.emissive.copy(e.origEmissive);
      e.mat.emissiveIntensity = e.origEmissiveIntensity;
    }
  }

  const rig = mesh.userData.buildRig as BuildingVisualRig | undefined;
  if (rig) {
    for (const part of rig.parts) {
      if (part.tier >= 2) {
        part.obj.rotation.z = part.baseRotZ + sagTiltRad;
      }
    }
  }
}

export function disposeBuildingVisualResources(mesh: THREE.Group): void {
  const entries = mesh.userData.damageMatEntries as ClonedDamageMatEntry[] | undefined;
  if (entries) {
    for (const e of entries) {
      e.mat.dispose();
    }
    mesh.userData.damageMatEntries = undefined;
  }
}

const sharedRubbleAshGeo = new THREE.CircleGeometry(1, 18);
const sharedRubbleEmberGeo = new THREE.CircleGeometry(1, 12);
const sharedRubbleDebrisChunkGeo = new THREE.DodecahedronGeometry(0.42, 0);
const sharedRubbleDebrisPlankGeo = new THREE.BoxGeometry(1.15, 0.14, 0.28);
const sharedRubbleAshMat = new THREE.MeshBasicMaterial({
  color: 0x1c1917,
  transparent: true,
  opacity: 0.78,
  depthWrite: false,
});
const sharedRubbleEmberMat = new THREE.MeshBasicMaterial({
  color: 0xea580c,
  transparent: true,
  opacity: 0.42,
  depthWrite: false,
});
const sharedRubbleDebrisMat = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  vertexColors: true,
  roughness: 0.94,
});
const sharedRubbleStoneColor = new THREE.Color(0x57534e);
const sharedRubbleCharColor = new THREE.Color(0x292524);
const sharedRubbleDummy = new THREE.Object3D();
const sharedRubbleScale = new THREE.Vector3();
const sharedRubbleMatrix = new THREE.Matrix4();

export interface BuildingRubbleBatch {
  group: THREE.Group;
  capacity: number;
  nextSlot: number;
  ash: THREE.InstancedMesh;
  ember: THREE.InstancedMesh;
  chunks: THREE.InstancedMesh;
  planks: THREE.InstancedMesh;
  ashBase: THREE.Matrix4[];
  emberBase: THREE.Matrix4[];
  chunkBase: THREE.Matrix4[];
  plankBase: THREE.Matrix4[];
}

function makeHiddenRubbleMatrices(count: number): THREE.Matrix4[] {
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  return Array.from({ length: count }, () => hidden.clone());
}

/**
 * A fixed-size, reusable batch for temporary building-collapse debris.
 * Four InstancedMeshes render every active rubble decal, regardless of building count.
 */
export function createBuildingRubbleBatch(capacity = 64): BuildingRubbleBatch {
  const slots = Math.max(1, Math.floor(capacity));
  const group = new THREE.Group();
  group.name = 'building-collapse-rubble-batch';
  group.userData.isBuildingRubbleBatch = true;

  const makeBatch = (
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    count: number,
    name: string
  ): THREE.InstancedMesh => {
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.name = name;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    for (let i = 0; i < count; i++) {
      mesh.setMatrixAt(i, sharedRubbleMatrix.makeScale(0, 0, 0));
    }
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
    return mesh;
  };

  const batch: BuildingRubbleBatch = {
    group,
    capacity: slots,
    nextSlot: 0,
    ash: makeBatch(sharedRubbleAshGeo, sharedRubbleAshMat, slots, 'buildingRubbleAsh'),
    ember: makeBatch(sharedRubbleEmberGeo, sharedRubbleEmberMat, slots, 'buildingRubbleEmbers'),
    chunks: makeBatch(sharedRubbleDebrisChunkGeo, sharedRubbleDebrisMat, slots * 7, 'buildingRubbleStoneChunks'),
    planks: makeBatch(sharedRubbleDebrisPlankGeo, sharedRubbleDebrisMat, slots * 4, 'buildingRubbleTimberPlanks'),
    ashBase: makeHiddenRubbleMatrices(slots),
    emberBase: makeHiddenRubbleMatrices(slots),
    chunkBase: makeHiddenRubbleMatrices(slots * 7),
    plankBase: makeHiddenRubbleMatrices(slots * 4),
  };

  for (let slot = 0; slot < slots; slot++) {
    for (let i = 0; i < 7; i++) {
      batch.chunks.setColorAt(slot * 7 + i, i % 2 === 0 ? sharedRubbleStoneColor : sharedRubbleCharColor);
    }
    for (let i = 0; i < 4; i++) {
      batch.planks.setColorAt(slot * 4 + i, i % 2 === 0 ? sharedRubbleStoneColor : sharedRubbleCharColor);
    }
  }
  if (batch.chunks.instanceColor) batch.chunks.instanceColor.needsUpdate = true;
  if (batch.planks.instanceColor) batch.planks.instanceColor.needsUpdate = true;

  return batch;
}

function writeBuildingRubbleMatrix(
  mesh: THREE.InstancedMesh,
  baseMatrices: THREE.Matrix4[],
  index: number,
  x: number,
  y: number,
  z: number,
  rotationX: number,
  rotationY: number,
  rotationZ: number,
  scaleX: number,
  scaleY: number,
  scaleZ: number
): void {
  sharedRubbleDummy.position.set(x, y, z);
  sharedRubbleDummy.rotation.set(rotationX, rotationY, rotationZ);
  sharedRubbleDummy.scale.set(scaleX, scaleY, scaleZ);
  sharedRubbleDummy.updateMatrix();
  baseMatrices[index].copy(sharedRubbleDummy.matrix);
  mesh.setMatrixAt(index, baseMatrices[index]);
}

/** Adds a collapse decal to the next ring-buffer slot, recycling the oldest visual when full. */
export function addBuildingRubbleDecal(
  batch: BuildingRubbleBatch,
  x: number,
  z: number,
  footprintSize: number
): number {
  const slot = batch.nextSlot;
  batch.nextSlot = (batch.nextSlot + 1) % batch.capacity;
  const radius = Math.max(1.8, footprintSize * 0.96);

  writeBuildingRubbleMatrix(batch.ash, batch.ashBase, slot, x, 0.03, z, -Math.PI / 2, 0, 0, radius, radius, 1);
  writeBuildingRubbleMatrix(batch.ember, batch.emberBase, slot, x, 0.04, z, -Math.PI / 2, 0, 0, radius * 0.42, radius * 0.42, 1);

  let chunkIndex = 0;
  let plankIndex = 0;
  for (let i = 0; i < 11; i++) {
    const angle = (i / 11) * Math.PI * 2 + (i % 3) * 0.25;
    const distance = i === 0 ? 0.15 : radius * (0.2 + (i % 4) * 0.17);
    const isPlank = i % 3 === 0;
    const localIndex = isPlank ? slot * 4 + plankIndex++ : slot * 7 + chunkIndex++;
    const mesh = isPlank ? batch.planks : batch.chunks;
    const matrices = isPlank ? batch.plankBase : batch.chunkBase;
    const size = 0.9 + (i % 3) * 0.32;
    writeBuildingRubbleMatrix(
      mesh,
      matrices,
      localIndex,
      x + Math.cos(angle) * distance,
      isPlank ? 0.12 : 0.24,
      z + Math.sin(angle) * distance,
      i * 0.35,
      angle + 0.6,
      (i % 2 === 0 ? 1 : -1) * 0.28,
      size,
      size,
      size
    );
  }

  const touched = [batch.ash, batch.ember, batch.chunks, batch.planks];
  touched.forEach((mesh) => {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.boundingBox = null;
    mesh.boundingSphere = null;
  });
  return slot;
}

/** Shrinks a rubble slot during its final fade window without allocating or rebuilding meshes. */
export function setBuildingRubbleDecalScale(batch: BuildingRubbleBatch, slot: number, scale: number): void {
  if (slot < 0 || slot >= batch.capacity) return;
  const factor = Math.max(0, scale);
  const apply = (mesh: THREE.InstancedMesh, base: THREE.Matrix4[], index: number) => {
    sharedRubbleScale.set(factor, factor, factor);
    sharedRubbleMatrix.copy(base[index]).scale(sharedRubbleScale);
    mesh.setMatrixAt(index, sharedRubbleMatrix);
    mesh.instanceMatrix.needsUpdate = true;
  };

  apply(batch.ash, batch.ashBase, slot);
  apply(batch.ember, batch.emberBase, slot);
  for (let i = 0; i < 7; i++) apply(batch.chunks, batch.chunkBase, slot * 7 + i);
  for (let i = 0; i < 4; i++) apply(batch.planks, batch.plankBase, slot * 4 + i);
}



/** Neutral contested shrine / banner — readable from mid-distance, clickable, and continuously reflects owner & contested clash */
export function createContestedShrineMesh(label = '爭奪點', shrineType: ShrineType = 'war'): THREE.Group {
  const group = new THREE.Group();
  group.name = 'contestedShrine';
  addContactShadow(group, 2.65);

  const stoneMaps = getStoneMasonryMaps();
  const rockMaps = getCraggyRockMaps();
  const goldMaps = getGoldFiligreeMaps();
  const steelMaps = getDamascusSteelMaps();

  const stoneMat = new THREE.MeshStandardMaterial({
    color: shrineType === 'forge' ? 0x475569 : shrineType === 'harvest' ? 0xcbd5e1 : 0x78716c,
    map: stoneMaps.map,
    normalMap: stoneMaps.normalMap,
    normalScale: new THREE.Vector2(1.05, 1.05),
    roughnessMap: stoneMaps.roughnessMap || null,
    roughness: 0.88,
    metalness: 0.08,
  });
  const darkStoneMat = new THREE.MeshStandardMaterial({
    color: shrineType === 'forge' ? 0x1e293b : 0x44403c,
    map: rockMaps.map,
    normalMap: rockMaps.normalMap,
    roughness: 0.92,
  });
  const metalMat = new THREE.MeshStandardMaterial({
    color: shrineType === 'harvest' ? 0xf59e0b : 0x94a3b8,
    map: shrineType === 'harvest' ? goldMaps.map : steelMaps.map,
    normalMap: shrineType === 'harvest' ? goldMaps.normalMap : steelMaps.normalMap,
    roughness: 0.28,
    metalness: 0.86,
  });
  const crystalMat = new THREE.MeshStandardMaterial({
    color: shrineType === 'harvest' ? 0x4ade80 : shrineType === 'forge' ? 0xfb923c : 0xfbbf24,
    emissive: shrineType === 'harvest' ? 0x15803d : shrineType === 'forge' ? 0xc2410c : 0xb45309,
    emissiveIntensity: 0.45,
    roughness: 0.25,
    metalness: 0.35,
  });
  const clothMat = new THREE.MeshStandardMaterial({
    color: 0xa8a29e,
    map: getClothWeaveMaps().map,
    roughness: 0.72,
    side: THREE.DoubleSide,
  });

  // Two-stepped octagonal dais plinth shared across monuments
  const step1 = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.98, 0.26, 8), darkStoneMat);
  step1.position.y = 0.13;
  step1.receiveShadow = true;
  step1.castShadow = true;
  const step2 = new THREE.Mesh(new THREE.CylinderGeometry(1.22, 1.42, 0.34, 8), stoneMat);
  step2.position.y = 0.43;
  step2.receiveShadow = true;
  step2.castShadow = true;
  group.add(step1, step2);

  if (shrineType === 'war') {
    // War Shrine: carved war pedestal + 4 corner obelisks with warm braziers + crossed halberd spears
    const altar = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.7, 1.5, 8), stoneMat);
    altar.position.y = 1.32;
    altar.castShadow = true;
    const altarCap = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.18, 1.18), darkStoneMat);
    altarCap.position.y = 2.08;
    group.add(altar, altarCap);

    // 4 Corner Obelisks + Braziers
    [
      [-1.08, -1.08],
      [1.08, -1.08],
      [-1.08, 1.08],
      [1.08, 1.08],
    ].forEach(([ox, oz]) => {
      const obelisk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, 1.45, 4), darkStoneMat);
      obelisk.rotation.y = Math.PI / 4;
      obelisk.position.set(ox, 1.02, oz);
      obelisk.castShadow = true;
      group.add(obelisk);
      addWarmLantern(group, ox, 1.85, oz, metalMat);
    });

    // Crossed bronze/steel halberds behind altar
    [-0.45, 0.45].forEach((rot) => {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.35, 6), metalMat);
      shaft.position.set(0, 1.9, -0.42);
      shaft.rotation.z = rot;
      const spearTip = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.36, 4), metalMat);
      spearTip.position.set(-Math.sin(rot) * 1.25, 1.9 + Math.cos(rot) * 1.25, -0.42);
      spearTip.rotation.z = rot;
      group.add(shaft, spearTip);
    });
  } else if (shrineType === 'harvest') {
    // Harvest Shrine: twin sculpted sanctuary pillars + curved stone arch + golden chalice & moss wreath
    [-0.95, 0.95].forEach((px) => {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 2.55, 8), stoneMat);
      col.position.set(px, 1.82, 0);
      col.castShadow = true;
      group.add(col);
      const colBase = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.24, 0.62), darkStoneMat);
      colBase.position.set(px, 0.68, 0);
      group.add(colBase);
    });
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(2.55, 0.34, 0.62), stoneMat);
    lintel.position.y = 3.28;
    lintel.castShadow = true;
    const keystone = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 1.08, 0.3, 6), darkStoneMat);
    keystone.position.y = 3.56;
    const archCrest = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.62, 0.24, 6), metalMat);
    archCrest.position.y = 3.82;
    group.add(lintel, keystone, archCrest);

    // Central altar table + golden harvest bowl + moss garland + golden wheat bundles
    const table = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.56, 1.15, 8), stoneMat);
    table.position.y = 1.15;
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.2, 0.34, 12), metalMat);
    bowl.position.y = 1.88;
    const mossMat = new THREE.MeshStandardMaterial({ color: 0x15803d, map: getFoliagePBRMaps().map, roughness: 0.85 });
    const garland = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.11, 6, 14), mossMat);
    garland.rotation.x = Math.PI / 2;
    garland.position.y = 1.72;
    group.add(table, bowl, garland);

    const wheatMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.72 });
    [-0.78, 0.78].forEach((wx) => {
      const sheaf = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 0.75, 7), wheatMat);
      sheaf.position.set(wx, 0.92, 0.42);
      sheaf.rotation.z = -wx * 0.15;
      group.add(sheaf);
    });
  } else {
    // Forge Shrine: dwarven basalt anvil altar + glowing ember crucible + twin forge chimneys
    const anvilBase = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.92, 0.88), darkStoneMat);
    anvilBase.position.y = 1.04;
    anvilBase.castShadow = true;
    const anvilHorn = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.34, 0.58), metalMat);
    anvilHorn.position.y = 1.65;
    anvilHorn.castShadow = true;
    const emberPool = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.55, 0.08, 12),
      new THREE.MeshBasicMaterial({ color: 0xfb923c })
    );
    emberPool.position.set(0, 0.62, 0.72);
    group.add(anvilBase, anvilHorn, emberPool);

    [-0.98, 0.98].forEach((cx) => {
      const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 2.35, 6), stoneMat);
      stack.position.set(cx, 1.7, -0.35);
      stack.castShadow = true;
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.24, 0.24, 6), metalMat);
      cap.position.set(cx, 2.95, -0.35);
      const glow = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: 0xf97316 }));
      glow.position.set(cx, 3.06, -0.35);
      group.add(stack, cap, glow);
    });
  }

  // Central floating Shrine Crystal (engine.ts animates crystal.position.y around 2.82)
  const cap = new THREE.Mesh(new THREE.OctahedronGeometry(0.46, 0), crystalMat);
  cap.position.y = 2.82;
  cap.name = 'shrineCrystal';
  group.add(cap);

  // Elevated Faction Banner Standard
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.06, 3.3, 8), metalMat);
  pole.position.set(1.25, 1.72, 0);
  pole.castShadow = true;
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), metalMat);
  finial.position.set(1.25, 3.42, 0);
  group.add(pole, finial);

  const banner = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 1.25), clothMat);
  banner.position.set(1.78, 2.65, 0);
  banner.rotation.y = -0.35;
  banner.name = 'shrineBanner';
  group.add(banner);

  // Inner owner halo around pedestal — permanently displays owning faction color
  const ownerRingGeo = new THREE.RingGeometry(1.92, 2.48, 36);
  ownerRingGeo.rotateX(-Math.PI / 2);
  const ownerRing = new THREE.Mesh(
    ownerRingGeo,
    new THREE.MeshBasicMaterial({
      color: 0xa8a29e,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  ownerRing.position.y = 0.08;
  ownerRing.name = 'ownerRing';
  ownerRing.raycast = () => {};
  group.add(ownerRing);

  // Outer capture zone ring (horizontal) — non-raycastable so terrain clicks inside ring still command units
  const ringGeo = new THREE.RingGeometry(9.4, 10.7, 48);
  ringGeo.rotateX(-Math.PI / 2);
  const ring = new THREE.Mesh(
    ringGeo,
    new THREE.MeshBasicMaterial({
      color: 0xe2e8f0,
      transparent: true,
      opacity: 0.34,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  ring.position.y = 0.06;
  ring.name = 'captureRing';
  ring.raycast = () => {};
  group.add(ring);

  // Inner pulse ring shown while actively capturing or under contested battle
  const contestedRingGeo = new THREE.RingGeometry(8.5, 9.25, 48);
  contestedRingGeo.rotateX(-Math.PI / 2);
  const contestedRing = new THREE.Mesh(
    contestedRingGeo,
    new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.0,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  contestedRing.position.y = 0.07;
  contestedRing.name = 'contestedRing';
  contestedRing.visible = false;
  contestedRing.raycast = () => {};
  group.add(contestedRing);

  // Dedicated click-target cylinder centered on the shrine monument
  const hitMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(2.45, 2.6, 4.0, 12),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hitMesh.position.y = 2.0;
  hitMesh.name = 'shrineHitVolume';
  group.add(hitMesh);

  const shrineIcon = shrineType === 'war' ? '⚔️' : shrineType === 'harvest' ? '🌾' : '⚒️';
  const shrineRole = shrineType === 'war' ? '戰意祭壇' : shrineType === 'harvest' ? '豐饒祭壇' : '鍛造祭壇';
  const badge = createBadgeSprite(label, shrineIcon, '中立', 0, false, true, `${shrineRole} · 可佔領`);
  badge.position.y = 4.15;
  badge.name = 'shrineBadge';
  badge.raycast = () => {};
  group.add(badge);

  return group;
}

export function createBuildingMesh(
  type: BuildingType,
  faction: FactionId,
  civId?: CivilizationId
): THREE.Group {
  const resolvedCiv = civId || getFactionPalette(faction).civilization || 'medieval';
  let group: THREE.Group;
  switch (type) {
    case 'town_center':
      group = createTownCenterMesh(faction, resolvedCiv);
      break;
    case 'house':
      group = createHouseMesh(faction, resolvedCiv);
      break;
    case 'barracks':
      group = createBarracksMesh(faction, resolvedCiv);
      break;
    case 'archery_range':
      group = createArcheryRangeMesh(faction);
      break;
    case 'dock':
      group = createDockMesh(faction);
      break;
    case 'farm':
      group = createFarmMesh();
      break;
    case 'granary':
      group = createGranaryMesh(faction);
      break;
    case 'lumber_camp':
      group = createCampMesh('lumber', faction);
      break;
    case 'mining_camp':
      group = createCampMesh('mining', faction);
      break;
    case 'wall':
      group = createWallMesh(faction, resolvedCiv);
      break;
    case 'tower':
      group = createTowerMesh(faction);
      break;
    case 'castle':
      group = createCastleMesh(faction);
      break;
    case 'armory_forge':
      group = createArmoryForgeMesh(faction);
      break;
    case 'spirit_shrine':
      group = createSpiritShrineMesh(faction);
      break;
    case 'mana_well':
      group = createManaWellMesh(faction);
      break;
    case 'landmark_aachen':
    case 'landmark_barracks':
    case 'landmark_guildhall':
    case 'landmark_citadel':
    case 'landmark_observatory':
    case 'landmark_arsenal':
      group = createLandmarkMesh(type, faction);
      break;
  }

  attachBuildingConstructionRig(group, type);
  addBuildingGroundDetails(group, type);
  prepareBuildingVisualLod(group);

  // Pre-collect animated flags, crystals & badge references so simulation never traverses per frame
  const animFlags: THREE.Object3D[] = [];
  const animCrystals: Array<{ obj: THREE.Object3D; baseY: number }> = [];
  let bldgBadge: THREE.Object3D | null = null;
  group.traverse((child) => {
    if (child.name === 'animatedFlag') animFlags.push(child);
    else if (child.name === 'animatedCrystal') animCrystals.push({ obj: child, baseY: child.position.y });
    else if (child.name === 'bldgBadge') bldgBadge = child;
  });
  group.userData.animFlags = animFlags;
  group.userData.animCrystals = animCrystals;
  group.userData.bldgBadge = bldgBadge;
  return group;
}

// Subtle ground apron and entrance stepping stones shared by every building of a type.
// Each building receives one compact mesh; geometry and material are cached to avoid
// regenerating the same decorative vertices and materials for every placement.
interface BuildingGroundProfile {
  halfWidth: number;
  halfDepth: number;
  pathLength: number;
  pathWidth: number;
}

const buildingGroundProfile = (type: BuildingType): BuildingGroundProfile | null => {
  switch (type) {
    case 'town_center':
      return { halfWidth: 4.45, halfDepth: 4.05, pathLength: 4.6, pathWidth: 2.0 };
    case 'castle':
    case 'landmark_aachen':
    case 'landmark_barracks':
    case 'landmark_guildhall':
    case 'landmark_citadel':
    case 'landmark_observatory':
    case 'landmark_arsenal':
      return { halfWidth: 4.0, halfDepth: 3.7, pathLength: 4.0, pathWidth: 1.85 };
    case 'barracks':
      return { halfWidth: 2.75, halfDepth: 2.45, pathLength: 3.2, pathWidth: 1.65 };
    case 'archery_range':
      return { halfWidth: 2.85, halfDepth: 2.7, pathLength: 3.25, pathWidth: 1.6 };
    case 'house':
      return { halfWidth: 1.88, halfDepth: 1.7, pathLength: 2.7, pathWidth: 1.15 };
    case 'granary':
      return { halfWidth: 2.2, halfDepth: 2.15, pathLength: 2.5, pathWidth: 1.25 };
    case 'lumber_camp':
    case 'mining_camp':
      return { halfWidth: 2.35, halfDepth: 2.15, pathLength: 2.65, pathWidth: 1.3 };
    case 'armory_forge':
      return { halfWidth: 2.55, halfDepth: 2.45, pathLength: 2.9, pathWidth: 1.4 };
    case 'tower':
      return { halfWidth: 1.55, halfDepth: 1.55, pathLength: 1.8, pathWidth: 0.9 };
    case 'spirit_shrine':
    case 'mana_well':
      return { halfWidth: 1.85, halfDepth: 1.85, pathLength: 2.0, pathWidth: 1.0 };
    case 'farm':
    case 'dock':
    case 'wall':
      return null;
    default:
      return null;
  }
};

const buildingGroundGeometryCache = new Map<BuildingType, THREE.BufferGeometry>();
const buildingGroundMaterial = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  vertexColors: true,
  transparent: true,
  opacity: 0.84,
  depthWrite: false,
  side: THREE.DoubleSide,
  toneMapped: false,
});

function createBuildingGroundGeometry(profile: BuildingGroundProfile): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const addVertex = (x: number, y: number, z: number, color: THREE.Color): number => {
    const index = positions.length / 3;
    positions.push(x, y, z);
    colors.push(color.r, color.g, color.b);
    return index;
  };
  const color = new THREE.Color();

  // Feathered, slightly irregular earth apron around the building foundation.
  const segments = 32;
  const ringScales = [0.56, 0.74, 0.9, 1.0];
  const ringColors = [0x806547, 0x88734f, 0x7d7953, 0x617044];
  const center = addVertex(0, 0.025, 0, color.setHex(ringColors[0]));
  const rings: number[][] = [];
  ringScales.forEach((scale, ringIndex) => {
    const ring: number[] = [];
    for (let seg = 0; seg < segments; seg++) {
      const angle = (seg / segments) * Math.PI * 2;
      const ripple = 1 + Math.sin(angle * 3 + ringIndex * 0.8) * 0.045 +
        Math.cos(angle * 5 - ringIndex * 1.3) * 0.025;
      const x = Math.cos(angle) * profile.halfWidth * 1.16 * scale * ripple;
      const z = Math.sin(angle) * profile.halfDepth * 1.16 * scale * ripple;
      const tint = color.setHex(ringColors[ringIndex]);
      ring.push(addVertex(x, 0.025, z, tint));
    }
    rings.push(ring);
  });
  for (let seg = 0; seg < segments; seg++) {
    const next = (seg + 1) % segments;
    indices.push(center, rings[0][seg], rings[0][next]);
  }
  for (let ring = 0; ring < rings.length - 1; ring++) {
    const inner = rings[ring];
    const outer = rings[ring + 1];
    for (let seg = 0; seg < segments; seg++) {
      const next = (seg + 1) % segments;
      indices.push(inner[seg], outer[seg], outer[next], inner[seg], outer[next], inner[next]);
    }
  }

  // Low-opacity worn-earth lane leading away from the main entrance.
  const startZ = profile.halfDepth * 0.72;
  const endZ = startZ + profile.pathLength;
  const halfStart = profile.pathWidth * 0.38;
  const halfEnd = profile.pathWidth * 0.58;
  const pathCenter = addVertex(0, 0.031, (startZ + endZ) * 0.5, color.setHex(0x786348));
  const pathPts: Array<[number, number]> = [
    [-halfStart, startZ],
    [-halfEnd * 0.96, endZ * 0.42 + startZ * 0.58],
    [-halfEnd, endZ],
    [halfEnd, endZ],
    [halfEnd * 0.96, endZ * 0.42 + startZ * 0.58],
    [halfStart, startZ],
  ];
  const pathIndices = pathPts.map(([x, z]) => addVertex(x, 0.031, z, color.setHex(0x806b4e)));
  for (let i = 0; i < pathIndices.length; i++) {
    indices.push(pathCenter, pathIndices[i], pathIndices[(i + 1) % pathIndices.length]);
  }

  // Irregular pale stone pavers set into the dirt lane. They are all part of the same mesh.
  const stonePalette = [0xb5ad98, 0x9d9684, 0xc0b7a0, 0xaaa38f];
  const stoneCount = Math.max(4, Math.round(profile.pathLength / 0.62));
  for (let stone = 0; stone < stoneCount; stone++) {
    const t = (stone + 0.45) / stoneCount;
    const z = THREE.MathUtils.lerp(startZ + 0.16, endZ - 0.14, t);
    const xOffset = Math.sin(stone * 2.17) * profile.pathWidth * 0.095;
    const stoneWidth = profile.pathWidth * (0.25 + (stone % 3) * 0.025);
    const stoneDepth = 0.28 + (stone % 2) * 0.08;
    const yaw = Math.sin(stone * 1.63) * 0.12;
    const shape: Array<[number, number]> = [
      [-0.78, -0.5], [0.58, -0.56], [0.92, -0.22], [0.8, 0.52],
      [-0.46, 0.62], [-0.92, 0.18],
    ];
    const stoneCenter = addVertex(xOffset, 0.043 + (stone % 2) * 0.002, z, color.setHex(stonePalette[stone % stonePalette.length]));
    const stoneVertices = shape.map(([sx, sz], idx) => {
      const jitter = 0.94 + ((stone * 5 + idx * 3) % 7) * 0.018;
      const px = sx * stoneWidth * jitter;
      const pz = sz * stoneDepth * jitter;
      const rx = px * Math.cos(yaw) - pz * Math.sin(yaw);
      const rz = px * Math.sin(yaw) + pz * Math.cos(yaw);
      return addVertex(xOffset + rx, 0.043 + (stone % 2) * 0.002, z + rz, color.setHex(stonePalette[stone % stonePalette.length]));
    });
    for (let i = 0; i < stoneVertices.length; i++) {
      indices.push(stoneCenter, stoneVertices[i], stoneVertices[(i + 1) % stoneVertices.length]);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function addBuildingGroundDetails(group: THREE.Group, type: BuildingType): void {
  const profile = buildingGroundProfile(type);
  if (!profile) return;

  let geometry = buildingGroundGeometryCache.get(type);
  if (!geometry) {
    geometry = createBuildingGroundGeometry(profile);
    buildingGroundGeometryCache.set(type, geometry);
  }

  const mesh = new THREE.Mesh(geometry, buildingGroundMaterial);
  mesh.name = 'buildingGroundDetails';
  mesh.userData.distanceLodMinPixels = 30;
  mesh.renderOrder = 1;
  mesh.frustumCulled = true;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  group.add(mesh);
}

// ----------------- SETTLEMENT ROADS & YARD PROPS -----------------

type SettlementBuildingInput = Pick<
  BuildingEntity,
  'id' | 'faction' | 'buildingType' | 'x' | 'z' | 'hp'
>;

interface SettlementRoadNode {
  source: SettlementBuildingInput;
  entranceX: number;
  entranceZ: number;
  profile: BuildingGroundProfile;
}

interface SettlementRoadEdge {
  a: SettlementRoadNode;
  b: SettlementRoadNode;
  distance: number;
}

const settlementRoadMaterial = new THREE.MeshBasicMaterial({
  vertexColors: true,
  transparent: true,
  opacity: 0.88,
  depthWrite: false,
  side: THREE.DoubleSide,
  toneMapped: false,
});

function createSettlementRoadGeometry(edges: SettlementRoadEdge[]): THREE.BufferGeometry | null {
  if (edges.length === 0) return null;

  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const addVertex = (x: number, y: number, z: number, hex: number): number => {
    const color = new THREE.Color(hex);
    const index = positions.length / 3;
    positions.push(x, y, z);
    colors.push(color.r, color.g, color.b);
    return index;
  };
  const addQuad = (a: number, b: number, c: number, d: number) => {
    indices.push(a, b, c, a, c, d);
  };

  const edgeBands = [
    { offset: -0.5, color: 0x59603b },
    { offset: -0.31, color: 0x786246 },
    { offset: 0.31, color: 0x786246 },
    { offset: 0.5, color: 0x59603b },
  ];

  edges.forEach((edge, edgeIndex) => {
    const start = new THREE.Vector3(edge.a.entranceX, 0, edge.a.entranceZ);
    const end = new THREE.Vector3(edge.b.entranceX, 0, edge.b.entranceZ);
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const length = Math.hypot(dx, dz);
    if (length < 2.8) return;

    const sideX = -dz / length;
    const sideZ = dx / length;
    const bend = Math.sin((edgeIndex + 1) * 2.17) * Math.min(0.5, length * 0.025);
    const control = new THREE.Vector3(
      (start.x + end.x) * 0.5 + sideX * bend,
      0,
      (start.z + end.z) * 0.5 + sideZ * bend
    );
    const curvePoint = (t: number): THREE.Vector3 => {
      const oneMinus = 1 - t;
      return new THREE.Vector3(
        oneMinus * oneMinus * start.x + 2 * oneMinus * t * control.x + t * t * end.x,
        0,
        oneMinus * oneMinus * start.z + 2 * oneMinus * t * control.z + t * t * end.z
      );
    };

    const rows = Math.max(8, Math.ceil(length / 1.15));
    const rowIndices: number[][] = [];
    for (let row = 0; row <= rows; row++) {
      const t = row / rows;
      const point = curvePoint(t);
      const tangent = new THREE.Vector3(
        2 * (1 - t) * (control.x - start.x) + 2 * t * (end.x - control.x),
        0,
        2 * (1 - t) * (control.z - start.z) + 2 * t * (end.z - control.z)
      ).normalize();
      const nx = -tangent.z;
      const nz = tangent.x;
      const ids: number[] = [];
      edgeBands.forEach((band) => {
        ids.push(addVertex(
          point.x + nx * band.offset * 1.9,
          0.034,
          point.z + nz * band.offset * 1.9,
          band.color
        ));
      });
      rowIndices.push(ids);
    }
    for (let row = 0; row < rows; row++) {
      for (let band = 0; band < edgeBands.length - 1; band++) {
        addQuad(
          rowIndices[row][band],
          rowIndices[row + 1][band],
          rowIndices[row + 1][band + 1],
          rowIndices[row][band + 1]
        );
      }
    }

    // Flat, irregular paving stones share the road mesh and therefore do not add draw calls.
    const paverCount = Math.max(3, Math.floor(length / 1.0));
    for (let stone = 0; stone < paverCount; stone++) {
      const t = (stone + 0.5) / paverCount;
      const point = curvePoint(t);
      const tangent = new THREE.Vector3(
        2 * (1 - t) * (control.x - start.x) + 2 * t * (end.x - control.x),
        0,
        2 * (1 - t) * (control.z - start.z) + 2 * t * (end.z - control.z)
      ).normalize();
      const nx = -tangent.z;
      const nz = tangent.x;
      const lane = ((stone % 3) - 1) * 0.17;
      const jitter = Math.sin((stone + 1) * 1.91 + edgeIndex) * 0.08;
      const centerX = point.x + nx * (lane + jitter);
      const centerZ = point.z + nz * (lane + jitter);
      const halfW = 0.27 + (stone % 2) * 0.045;
      const halfL = 0.19 + (stone % 3) * 0.025;
      const stoneColor = [0xa49c89, 0xb6ad98, 0x958d7c, 0xc0b6a0][stone % 4];
      const corners: Array<[number, number]> = [
        [-halfW, -halfL], [halfW, -halfL], [halfW * 0.92, halfL], [-halfW * 0.9, halfL * 0.94],
      ];
      const ids = corners.map(([localX, localZ]) => {
        const x = centerX + nx * localX + tangent.x * localZ;
        const z = centerZ + nz * localX + tangent.z * localZ;
        return addVertex(x, 0.043, z, stoneColor);
      });
      addQuad(ids[0], ids[1], ids[2], ids[3]);
    }
  });

  if (positions.length === 0) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

interface SettlementPropTransform {
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: number;
}

let settlementPropGeometries: {
  crate: THREE.BufferGeometry;
  barrel: THREE.BufferGeometry;
  log: THREE.BufferGeometry;
  ore: THREE.BufferGeometry;
} | null = null;

let settlementPropMaterials: {
  wood: THREE.MeshStandardMaterial;
  ore: THREE.MeshStandardMaterial;
} | null = null;

function getSettlementPropAssets() {
  if (!settlementPropGeometries) {
    settlementPropGeometries = {
      crate: new RoundedBoxGeometry(0.72, 0.62, 0.72, 1, 0.045),
      barrel: new THREE.CylinderGeometry(0.28, 0.32, 0.76, 8),
      log: new THREE.CylinderGeometry(0.15, 0.18, 1.35, 7),
      ore: makeCraggyRockGeo(0.34, 0),
    };
  }
  if (!settlementPropMaterials) {
    const wood = getTimberWoodMaps();
    const stone = getCraggyRockMaps();
    settlementPropMaterials = {
      wood: new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: wood.map,
        normalMap: wood.normalMap,
        roughness: 0.91,
      }),
      ore: new THREE.MeshStandardMaterial({
        color: 0x9ca3af,
        map: stone.map,
        normalMap: stone.normalMap,
        roughness: 0.94,
      }),
    };
  }
  return { geometries: settlementPropGeometries, materials: settlementPropMaterials };
}

function appendSettlementProps(
  group: THREE.Group,
  buildings: SettlementBuildingInput[],
  layout: MapLayoutResult | null
): void {
  const props: Record<'crate' | 'barrel' | 'log' | 'ore', SettlementPropTransform[]> = {
    crate: [], barrel: [], log: [], ore: [],
  };
  const obstacleDiscs = layout ? [...layout.waterDiscs, ...layout.cliffDiscs] : [];
  const isClear = (x: number, z: number, ownerId: string): boolean => {
    if (layout && isPointInTerrainObstacle(x, z, layout.waterRects, obstacleDiscs, layout.bridges)) return false;
    return buildings.every((other) => {
      if (other.id === ownerId || other.hp <= 0) return true;
      const otherProfile = buildingGroundProfile(other.buildingType);
      if (!otherProfile) return true;
      return !(
        Math.abs(x - other.x) < otherProfile.halfWidth * 0.72 + 0.5 &&
        Math.abs(z - other.z) < otherProfile.halfDepth * 0.72 + 0.5
      );
    });
  };
  const place = (kind: keyof typeof props, building: SettlementBuildingInput, x: number, z: number, yaw: number, scale = 1) => {
    if (!isClear(x, z, building.id)) return;
    const y = kind === 'crate' ? 0.31 * scale : kind === 'barrel' ? 0.38 * scale : kind === 'log' ? 0.17 * scale : 0.22 * scale;
    props[kind].push({ x, y, z, yaw, scale });
  };

  buildings.forEach((building) => {
    if (building.hp <= 0) return;
    const profile = buildingGroundProfile(building.buildingType);
    if (!profile) return;
    const sideX = building.x + profile.halfWidth + 0.58;
    const rearZ = building.z - profile.halfDepth * 0.42;

    switch (building.buildingType) {
      case 'lumber_camp':
        place('log', building, sideX, rearZ - 0.48, 0.12, 1);
        place('log', building, sideX + 0.04, rearZ + 0.02, -0.08, 0.88);
        place('crate', building, sideX - 0.15, rearZ + 0.9, 0.18, 0.78);
        break;
      case 'mining_camp':
        place('ore', building, sideX, rearZ - 0.35, 0.2, 1.1);
        place('ore', building, sideX + 0.55, rearZ + 0.3, -0.2, 0.82);
        place('crate', building, sideX - 0.1, rearZ + 0.95, 0.35, 0.82);
        break;
      case 'granary':
        place('barrel', building, sideX, rearZ - 0.25, 0.16, 0.92);
        place('crate', building, sideX + 0.5, rearZ + 0.55, -0.18, 0.78);
        break;
      case 'house':
        place('barrel', building, sideX, rearZ - 0.1, 0.12, 0.74);
        place('crate', building, sideX + 0.42, rearZ + 0.6, -0.12, 0.64);
        break;
      case 'barracks':
      case 'archery_range':
      case 'armory_forge':
        place('crate', building, sideX, rearZ - 0.2, 0.22, 0.86);
        place('barrel', building, sideX + 0.48, rearZ + 0.55, -0.1, 0.82);
        break;
      default:
        break;
    }
  });

  if (!Object.values(props).some((items) => items.length > 0)) return;

  const assets = getSettlementPropAssets();
  const dummy = new THREE.Object3D();
  (Object.keys(props) as Array<keyof typeof props>).forEach((kind) => {
    const items = props[kind];
    if (items.length === 0) return;
    const isOre = kind === 'ore';
    const mesh = new THREE.InstancedMesh(
      assets.geometries[kind],
      isOre ? assets.materials.ore : assets.materials.wood,
      items.length
    );
    mesh.name = 'settlementProps_' + kind;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    items.forEach((item, index) => {
      dummy.position.set(item.x, item.y, item.z);
      dummy.rotation.set(kind === 'log' ? Math.PI / 2 : 0, item.yaw, 0);
      dummy.scale.setScalar(item.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  });
}

export function createSettlementEnvironment(
  buildings: SettlementBuildingInput[],
  layout: MapLayoutResult | null
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'settlementEnvironment';
  const liveBuildings = buildings.filter((building) => building.hp > 0);
  const roadNodes: SettlementRoadNode[] = liveBuildings.flatMap((building) => {
    const profile = buildingGroundProfile(building.buildingType);
    if (!profile) return [];
    return [{
      source: building,
      profile,
      entranceX: building.x,
      entranceZ: building.z + profile.halfDepth * 0.72 + profile.pathLength,
    }];
  });

  const obstacleDiscs = layout ? [...layout.waterDiscs, ...layout.cliffDiscs] : [];
  const candidates: SettlementRoadEdge[] = [];
  for (let i = 0; i < roadNodes.length; i++) {
    for (let j = i + 1; j < roadNodes.length; j++) {
      const a = roadNodes[i];
      const b = roadNodes[j];
      if (a.source.faction !== b.source.faction) continue;
      const distance = Math.hypot(a.entranceX - b.entranceX, a.entranceZ - b.entranceZ);
      if (distance < 3.6 || distance > 25) continue;

      let blocked = false;
      for (let sample = 1; sample <= 11 && !blocked; sample++) {
        const t = sample / 12;
        const x = THREE.MathUtils.lerp(a.entranceX, b.entranceX, t);
        const z = THREE.MathUtils.lerp(a.entranceZ, b.entranceZ, t);
        const dx = b.entranceX - a.entranceX;
        const dz = b.entranceZ - a.entranceZ;
        const len = Math.hypot(dx, dz) || 1;
        const nx = -dz / len;
        const nz = dx / len;
        for (const side of [-0.72, 0, 0.72]) {
          const sx = x + nx * side;
          const sz = z + nz * side;
          if (layout && isPointInTerrainObstacle(sx, sz, layout.waterRects, obstacleDiscs, layout.bridges)) {
            blocked = true;
            break;
          }
          for (let k = 0; k < roadNodes.length; k++) {
            if (k === i || k === j) continue;
            const other = roadNodes[k];
            if (
              Math.abs(sx - other.source.x) < other.profile.halfWidth * 0.68 &&
              Math.abs(sz - other.source.z) < other.profile.halfDepth * 0.68
            ) {
              blocked = true;
              break;
            }
          }
          if (blocked) break;
        }
      }
      if (!blocked) candidates.push({ a, b, distance });
    }
  }

  candidates.sort((a, b) => a.distance - b.distance);
  const parent = roadNodes.map((_, index) => index);
  const degree = roadNodes.map(() => 0);
  const findRoot = (index: number): number => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]];
      index = parent[index];
    }
    return index;
  };
  const selectedEdges: SettlementRoadEdge[] = [];
  const nodeIndex = new Map<string, number>();
  roadNodes.forEach((node, index) => nodeIndex.set(node.source.id, index));
  for (const edge of candidates) {
    const aIndex = nodeIndex.get(edge.a.source.id);
    const bIndex = nodeIndex.get(edge.b.source.id);
    if (aIndex === undefined || bIndex === undefined) continue;
    const aRoot = findRoot(aIndex);
    const bRoot = findRoot(bIndex);
    if (aRoot === bRoot || degree[aIndex] >= 2 || degree[bIndex] >= 2) continue;
    parent[aRoot] = bRoot;
    degree[aIndex] += 1;
    degree[bIndex] += 1;
    selectedEdges.push(edge);
  }

  const roadGeometry = createSettlementRoadGeometry(selectedEdges);
  if (roadGeometry) {
    const roads = new THREE.Mesh(roadGeometry, settlementRoadMaterial);
    roads.name = 'settlementRoadLinks';
    roads.userData.ownedGeometry = true;
    roads.renderOrder = 2;
    roads.castShadow = false;
    roads.receiveShadow = false;
    group.add(roads);
  }

  appendSettlementProps(group, liveBuildings, layout);
  return group;
}

export function disposeSettlementEnvironment(group: THREE.Group | null): void {
  if (!group) return;
  group.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh && mesh.userData.ownedGeometry) {
      mesh.geometry.dispose();
      mesh.userData.ownedGeometry = false;
    }
  });
}

// ----------------- OVERHEAD BILLBOARDS & BADGES -----------------


export function createBadgeCanvas(
  title: string,
  icon: string,
  valueText: string,
  ratio: number,
  isEnemy: boolean,
  isResource = false,
  actionText?: string,
  isUnderAttack = false
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 260;
  canvas.height = 80;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, 260, 80);

  // Background capsule
  if (isUnderAttack) {
    ctx.fillStyle = 'rgba(127, 29, 29, 0.95)';
    ctx.strokeStyle = '#f87171';
    ctx.lineWidth = 3.5;
  } else if (isResource) {
    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2.5;
  } else if (isEnemy) {
    ctx.fillStyle = 'rgba(69, 10, 10, 0.94)';
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2.5;
  } else {
    ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.5;
  }

  // Rounded rectangle
  const r = 12;
  ctx.beginPath();
  ctx.moveTo(r, 4);
  ctx.lineTo(260 - r, 4);
  ctx.quadraticCurveTo(260 - 4, 4, 260 - 4, 4 + r);
  ctx.lineTo(260 - 4, 76 - r);
  ctx.quadraticCurveTo(260 - 4, 76, 260 - r, 76);
  ctx.lineTo(r, 76);
  ctx.quadraticCurveTo(4, 76, 4, 76 - r);
  ctx.lineTo(4, 4 + r);
  ctx.quadraticCurveTo(4, 4, r, 4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Top line: Name and HP value
  ctx.font = 'bold 18px "Microsoft JhengHei", sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(`${icon} ${title}`, 14, 26);

  ctx.font = 'bold 15px monospace';
  ctx.fillStyle = isUnderAttack ? '#fecaca' : isResource ? '#fbbf24' : isEnemy ? '#fca5a5' : '#93c5fd';
  ctx.textAlign = 'right';
  ctx.fillText(valueText, 246, 26);
  ctx.textAlign = 'left';

  // Middle line: Live Action Status
  if (actionText) {
    let statusBg = 'rgba(51, 65, 85, 0.8)';
    let statusColor = '#e2e8f0';

    if (isUnderAttack) {
      statusBg = 'rgba(239, 68, 68, 0.85)';
      statusColor = '#ffffff';
    } else if (actionText.includes('交戰') || actionText.includes('攻擊')) {
      statusBg = 'rgba(220, 38, 38, 0.7)';
      statusColor = '#fecaca';
    } else if (actionText.includes('採集')) {
      statusBg = 'rgba(217, 119, 6, 0.7)';
      statusColor = '#fef3c7';
    } else if (actionText.includes('運送')) {
      statusBg = 'rgba(16, 185, 129, 0.7)';
      statusColor = '#d1fae5';
    } else if (actionText.includes('建造')) {
      statusBg = 'rgba(37, 99, 235, 0.7)';
      statusColor = '#dbeafe';
    } else if (actionText.includes('移動') || actionText.includes('行軍')) {
      statusBg = 'rgba(14, 165, 233, 0.7)';
      statusColor = '#e0f2fe';
    }

    ctx.fillStyle = statusBg;
    ctx.beginPath();
    ctx.roundRect(14, 32, 232, 20, 6);
    ctx.fill();

    ctx.font = 'bold 13px "Microsoft JhengHei", sans-serif';
    ctx.fillStyle = statusColor;
    ctx.fillText(actionText, 20, 46);
  }

  // Bottom line: HP bar / Resource capacity bar
  const barY = actionText ? 58 : 46;
  const barH = actionText ? 10 : 12;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.fillRect(14, barY, 232, barH);

  const fillWidth = Math.max(0, Math.min(232, 232 * ratio));
  ctx.fillStyle = isUnderAttack
    ? '#ef4444'
    : isResource
    ? '#f59e0b'
    : isEnemy
    ? '#ef4444'
    : '#22c55e';
  ctx.fillRect(14, barY, fillWidth, barH);

  return canvas;
}

export function createBadgeSprite(
  title: string,
  icon: string,
  valueText: string,
  ratio: number,
  isEnemy: boolean,
  isResource = false,
  actionText?: string,
  isUnderAttack = false
): THREE.Sprite {
  const canvas = createBadgeCanvas(title, icon, valueText, ratio, isEnemy, isResource, actionText, isUnderAttack);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const mat = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(3.4, 1.05, 1);
  sprite.name = 'badgeSprite';
  return sprite;
}

export function updateBadgeSprite(
  sprite: THREE.Sprite,
  title: string,
  icon: string,
  valueText: string,
  ratio: number,
  isEnemy: boolean,
  isResource = false,
  actionText?: string,
  isUnderAttack = false
) {
  const canvas = createBadgeCanvas(title, icon, valueText, ratio, isEnemy, isResource, actionText, isUnderAttack);
  if (sprite.material.map) {
    sprite.material.map.dispose();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  sprite.material.map = texture;
  sprite.material.needsUpdate = true;
}

// ----------------- RALLY POINT VISUAL (集結點) -----------------
export function createRallyFlagMesh(faction: FactionId = 'player'): THREE.Group {
  const group = new THREE.Group();
  group.name = 'rallyFlag';
  const colors = getFactionPalette(faction);

  // 1. Ground reticle ring
  const ringGeo = new THREE.RingGeometry(0.7, 0.95, 24);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xf59e0b,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.y = 0.04;
  group.add(ring);

  const innerDotGeo = new THREE.CircleGeometry(0.2, 16);
  innerDotGeo.rotateX(-Math.PI / 2);
  const dotMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24, side: THREE.DoubleSide, depthWrite: false });
  const dot = new THREE.Mesh(innerDotGeo, dotMat);
  dot.position.y = 0.05;
  group.add(dot);

  // 2. Brass flagpole
  const poleGeo = new THREE.CylinderGeometry(0.06, 0.08, 3.0, 8);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.85, roughness: 0.2 });
  const pole = new THREE.Mesh(poleGeo, poleMat);
  pole.position.y = 1.5;
  pole.castShadow = true;
  group.add(pole);

  // 3. Top golden finial sphere
  const finialGeo = new THREE.SphereGeometry(0.16, 8, 8);
  const finialMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.9, roughness: 0.1 });
  const finial = new THREE.Mesh(finialGeo, finialMat);
  finial.position.y = 3.0;
  group.add(finial);

  // 4. Triangular faction banner
  const bannerShape = new THREE.Shape();
  bannerShape.moveTo(0, 0);
  bannerShape.lineTo(1.3, -0.4);
  bannerShape.lineTo(0, -0.8);
  bannerShape.closePath();

  const bannerGeo = new THREE.ShapeGeometry(bannerShape);
  const bannerMat = new THREE.MeshStandardMaterial({
    color: colors.primary,
    side: THREE.DoubleSide,
    roughness: 0.3,
  });
  const banner = new THREE.Mesh(bannerGeo, bannerMat);
  banner.position.set(0.04, 2.9, 0);
  banner.castShadow = true;
  banner.name = 'animatedFlag';
  group.add(banner);

  // 5. Overhead "集結點 (Rally Point)" Sprite
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 44;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.roundRect(3, 3, 154, 38, 8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#fde68a';
  ctx.font = 'bold 16px "Microsoft JhengHei", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('📍 集結點', 80, 26);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.scale.set(2.4, 0.65, 1);
  sprite.position.set(0, 3.6, 0);
  group.add(sprite);

  return group;
}

// ----------------- ENVIRONMENT & RESOURCE NODES (SHARED GEOMETRY & MATERIAL POOLS) -----------------

const resWoodMaps = getTimberWoodMaps();
const resBarkMaps = getTreeBarkMaps();
const resFoliageMaps = getFoliagePBRMaps();
const resRockMaps = getCraggyRockMaps();
const resFurMaps = getAnimalFurMaps();
const resLeatherMaps = getLeatherMaps();
const unitArmorMaps = getArmorPlateMaps();
const unitClothMaps = getClothWeaveMaps();
const unitDamascusMaps = getDamascusSteelMaps();
const unitChainmailMaps = getChainmailPlateMaps();
const unitGoldFiligreeMaps = getGoldFiligreeMaps();
const unitOakHullMaps = getOakHullMaps();
const unitSailMaps = getCanvasSailMaps();

// Realistic Fluted Bark Trunk + Root Buttresses
const sharedTreeTrunkGeo = makeLatheGeo([
  [0.54, 0.0],
  [0.42, 0.28],
  [0.31, 0.72],
  [0.24, 1.45],
  [0.18, 2.25],
  [0.08, 2.75],
  [0.01, 2.8],
], 10);
const sharedTreeRootGeo = makeTubeGeo([
  [0.0, 0.34, 0.0],
  [0.3, 0.14, 0.05],
  [0.58, 0.02, 0.0],
], 0.09, 6, 5);
const sharedTreeBranchGeo = makeTubeGeo([
  [0.0, 0.0, 0.0],
  [0.36, 0.25, 0.04],
  [0.72, 0.42, 0.0],
], 0.075, 6, 5);

const sharedPineSkirt1Geo = makePineSkirtGeo(1.65, 1.48, 12);
const sharedPineSkirt2Geo = makePineSkirtGeo(1.28, 1.28, 12);
const sharedPineSkirt3Geo = makePineSkirtGeo(0.92, 1.15, 11);
const sharedOakBoughGeo = makeFoliageClusterGeo(0.84, 1);

const sharedTreeTrunkMat = new THREE.MeshStandardMaterial({
  color: 0x7c5032,
  map: resBarkMaps.map,
  normalMap: resBarkMaps.normalMap,
  normalScale: new THREE.Vector2(1.25, 1.25),
  roughnessMap: resBarkMaps.roughnessMap || null,
  roughness: 0.96,
});
const sharedBirchTrunkMat = new THREE.MeshStandardMaterial({
  color: 0xe7e5e4,
  map: resBarkMaps.map,
  normalMap: resBarkMaps.normalMap,
  normalScale: new THREE.Vector2(1.0, 1.0),
  roughness: 0.86,
});
const sharedTreeLeafMats = [
  new THREE.MeshStandardMaterial({
    color: 0x1e6b35,
    map: resFoliageMaps.map,
    normalMap: resFoliageMaps.normalMap,
    normalScale: new THREE.Vector2(1.15, 1.15),
    roughnessMap: resFoliageMaps.roughnessMap || null,
    roughness: 0.9,
  }),
  new THREE.MeshStandardMaterial({
    color: 0x165329,
    map: resFoliageMaps.map,
    normalMap: resFoliageMaps.normalMap,
    normalScale: new THREE.Vector2(1.15, 1.15),
    roughnessMap: resFoliageMaps.roughnessMap || null,
    roughness: 0.92,
  }),
  new THREE.MeshStandardMaterial({
    color: 0x2b7e40,
    map: resFoliageMaps.map,
    normalMap: resFoliageMaps.normalMap,
    normalScale: new THREE.Vector2(1.15, 1.15),
    roughnessMap: resFoliageMaps.roughnessMap || null,
    roughness: 0.86,
  }),
];
const sharedBirchLeafMat = new THREE.MeshStandardMaterial({
  color: 0x84a92c,
  map: resFoliageMaps.map,
  normalMap: resFoliageMaps.normalMap,
  normalScale: new THREE.Vector2(1.1, 1.1),
  roughnessMap: resFoliageMaps.roughnessMap || null,
  roughness: 0.84,
});
const sharedTreeMossMat = new THREE.MeshStandardMaterial({
  color: 0x365314,
  map: resFoliageMaps.map,
  roughness: 0.92,
});

const sharedRichTreeLeafMat = new THREE.MeshStandardMaterial({
  color: 0x65a30d,
  map: resFoliageMaps.map,
  normalMap: resFoliageMaps.normalMap,
  normalScale: new THREE.Vector2(1.18, 1.18),
  roughnessMap: resFoliageMaps.roughnessMap || null,
  roughness: 0.78,
  emissive: 0x365314,
  emissiveIntensity: 0.25,
});

export function createTreeMesh(
  hasBadge = false,
  nodeTier: 'standard' | 'rich' = 'standard',
  amount = 320
): THREE.Group {
  const group = new THREE.Group();
  const isRich = nodeTier === 'rich';
  addContactShadow(group, isRich ? 1.95 : 1.62);
  const detailedVisual = new THREE.Group();
  detailedVisual.name = 'treeDetailedVisual';
  group.add(detailedVisual);

  const roll = Math.random();
  const species: 'rich' | 'oak' | 'birch' | 'pine' = isRich
    ? 'rich'
    : roll < 0.36
    ? 'oak'
    : roll < 0.56
    ? 'birch'
    : 'pine';

  const trunkMat = species === 'birch' ? sharedBirchTrunkMat : sharedTreeTrunkMat;
  const leafMat =
    species === 'rich'
      ? sharedRichTreeLeafMat
      : species === 'birch'
      ? sharedBirchLeafMat
      : sharedTreeLeafMats[Math.floor(Math.random() * sharedTreeLeafMats.length)];

  const trunk = new THREE.Mesh(sharedTreeTrunkGeo, trunkMat);
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  if (isRich) trunk.scale.set(1.26, 1.18, 1.26);
  else if (species === 'birch') trunk.scale.set(0.84, 1.08, 0.84);
  detailedVisual.add(trunk);

  // Flared root spurs + mossy root mound gripping the soil.
  // Small deterministic offsets make each root system feel grown into the terrain.
  const rootCount = isRich ? 4 : 3;
  const rootPhase = Math.random() * Math.PI * 2;
  for (let r = 0; r < rootCount; r++) {
    const root = new THREE.Mesh(sharedTreeRootGeo, trunkMat);
    const angle = (r * Math.PI * 2) / rootCount + 0.3 + Math.sin(r * 2.1 + rootPhase) * 0.11;
    const length = (isRich ? 1.22 : 1) * (0.9 + (Math.sin(r * 1.7 + rootPhase) + 1) * 0.065);
    root.rotation.y = angle;
    root.position.set(Math.cos(angle) * 0.025, Math.sin(r * 1.9 + rootPhase) * 0.012, -Math.sin(angle) * 0.025);
    root.scale.set(length, 0.92 + Math.cos(r * 2.3 + rootPhase) * 0.07, length);
    detailedVisual.add(root);
  }
  const mossMound = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.72, 0.16, 8), sharedTreeMossMat);
  mossMound.position.y = 0.08;
  mossMound.scale.set(1 + Math.sin(rootPhase) * 0.08, 1, 1 + Math.cos(rootPhase) * 0.08);
  mossMound.rotation.y = rootPhase * 0.35;
  detailedVisual.add(mossMound);

  const canopyPivot = new THREE.Group();
  canopyPivot.name = 'treeCanopy';
  // Raised above unit eye-level so low conifer boughs never swallow nearby soldiers
  canopyPivot.position.y = isRich ? 2.18 : 1.94;
  // Slight per-tree lean and yaw break the repeated silhouettes while keeping the canopy above unit eye level.
  canopyPivot.rotation.set((Math.random() - 0.5) * 0.045, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.045);
  if (isRich) canopyPivot.scale.setScalar(1.22);
  detailedVisual.add(canopyPivot);
  group.userData.treeCanopy = canopyPivot;
  group.userData.baseCanopyScale = isRich ? 1.22 : 1.0;

  if (species === 'oak' || species === 'birch' || species === 'rich') {
    // Broadleaf Canopy: 3 exposed lower forked limbs + 7 organically clustered displaced leaf boughs
    [-0.4, 1.8, 3.9].forEach((ang, idx) => {
      const bough = new THREE.Mesh(sharedTreeBranchGeo, trunkMat);
      bough.position.y = 0.24 + idx * 0.18;
      bough.rotation.y = ang;
      canopyPivot.add(bough);
    });

    const crownOffsets: Array<[number, number, number, number]> = [
      [0, 1.58, 0, 1.28],
      [-0.78, 1.16, 0.44, 0.98],
      [0.8, 1.24, 0.36, 0.95],
      [0.26, 1.14, -0.78, 0.96],
      [-0.46, 1.78, -0.38, 0.88],
      [0.44, 1.82, 0.34, 0.86],
      [0.02, 2.15, -0.04, 0.74],
    ];
    crownOffsets.forEach(([ox, oy, oz, sc], idx) => {
      const cl = new THREE.Mesh(sharedOakBoughGeo, leafMat);
      cl.position.set(ox, oy, oz);
      cl.scale.set(sc * 1.14, sc * 0.84, sc * 1.08);
      cl.rotation.set(idx * 0.45, idx * 1.15, idx * 0.22);
      cl.castShadow = true;
      canopyPivot.add(cl);
    });
  } else {
    // Natural 5-Tier Asymmetric Alpine Conifer Pine
    const tiers: Array<[THREE.BufferGeometry, number, number, number, number, number]> = [
      [sharedPineSkirt1Geo, 0.05, -0.1, -0.04, 0.2, 1.04],
      [sharedPineSkirt2Geo, -0.04, 0.58, 0.05, 0.85, 1.00],
      [sharedPineSkirt2Geo, 0.03, 1.28, -0.02, 1.65, 0.88],
      [sharedPineSkirt3Geo, -0.02, 1.98, 0.03, 2.4, 0.88],
      [sharedPineSkirt3Geo, 0.0, 2.58, 0.0, 0.4, 0.62],
    ];
    tiers.forEach(([geo, px, py, pz, ry, sc]) => {
      const tier = new THREE.Mesh(geo, leafMat);
      tier.position.set(px, py, pz);
      tier.rotation.set(0.02, ry, -0.02);
      tier.scale.setScalar(sc);
      tier.castShadow = true;
      canopyPivot.add(tier);
    });
  }

  if (isRich) {
    // Glowing amber sap crystal clusters nestled at base of Ancient World-Tree
    const sapMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      emissive: 0xd97706,
      emissiveIntensity: 0.45,
      roughness: 0.25,
    });
    [0.5, 2.6, 4.7].forEach((ang) => {
      const sap = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), sapMat);
      sap.position.set(Math.cos(ang) * 0.65, 0.24, Math.sin(ang) * 0.65);
      sap.scale.set(0.8, 1.35, 0.8);
      detailedVisual.add(sap);
    });

    const amberHalo = new THREE.Mesh(
      new THREE.RingGeometry(1.18, 1.52, 24),
      new THREE.MeshBasicMaterial({ color: 0xa3e635, transparent: true, opacity: 0.42, side: THREE.DoubleSide })
    );
    amberHalo.rotation.x = -Math.PI / 2;
    amberHalo.position.y = 0.04;
    detailedVisual.add(amberHalo);
  }

  if (hasBadge) {
    const badge = createBadgeSprite(
      isRich ? '遠古神木' : '森林原木',
      isRich ? '🌲' : '🪵',
      `${amount}`,
      1,
      false,
      true,
      isRich ? '✨富產林木 · 採速×1.35' : '可供伐木'
    );
    badge.position.set(0, isRich ? 5.75 : 5.15, 0);
    group.add(badge);
    group.userData.badgeSprite = badge;
  }

  group.userData.treeDetailedVisual = detailedVisual;
  return group;
}

const sharedGoldRockGeo = makeCraggyRockGeo(1.48, 1);
const sharedGoldCrystalGeo = new THREE.CylinderGeometry(0.14, 0.36, 1.35, 6);
const sharedGoldPostGeo = new THREE.CylinderGeometry(0.09, 0.11, 2.3, 8);
const sharedGoldBeamGeo = new THREE.BoxGeometry(2.5, 0.18, 0.2);
const sharedGoldRockMat = new THREE.MeshStandardMaterial({
  color: 0x475569,
  map: resRockMaps.map,
  normalMap: resRockMaps.normalMap,
  normalScale: new THREE.Vector2(1.3, 1.3),
  roughnessMap: resRockMaps.roughnessMap || null,
  roughness: 0.94,
});
const sharedGoldOreMat = new THREE.MeshStandardMaterial({
  color: 0xfacc15,
  normalMap: resRockMaps.normalMap,
  roughness: 0.14,
  metalness: 0.92,
  emissive: 0xd97706,
  emissiveIntensity: 0.45,
});
const sharedWoodScaffoldMat = new THREE.MeshStandardMaterial({
  color: 0x9a6234,
  map: resWoodMaps.map,
  normalMap: resWoodMaps.normalMap,
  roughnessMap: resWoodMaps.roughnessMap || null,
  roughness: 0.9,
});
const sharedIronRailMat = new THREE.MeshStandardMaterial({
  color: 0x334155,
  roughness: 0.32,
  metalness: 0.85,
});
const sharedGoldNuggetGeo = new THREE.OctahedronGeometry(0.38, 0);

const sharedRichGoldOreMat = new THREE.MeshStandardMaterial({
  color: 0xfde047,
  normalMap: resRockMaps.normalMap,
  roughness: 0.1,
  metalness: 0.96,
  emissive: 0xf59e0b,
  emissiveIntensity: 0.72,
});
const sharedRichQuartzMat = new THREE.MeshStandardMaterial({
  color: 0xe0f2fe,
  normalMap: resRockMaps.normalMap,
  roughness: 0.16,
  metalness: 0.45,
  emissive: 0x38bdf8,
  emissiveIntensity: 0.42,
});

export function createGoldMineMesh(
  amount = 1400,
  nodeTier: 'standard' | 'rich' = 'standard'
): THREE.Group {
  const group = new THREE.Group();
  const isRich = nodeTier === 'rich';
  addContactShadow(group, isRich ? 2.55 : 2.3);

  const depletableParts: Array<{ mesh: THREE.Object3D; baseScale: THREE.Vector3 }> = [];

  // Multi-rock stratified slate outcrop
  [
    { x: 0, y: 0.68, z: -0.1, sx: 1.45, sy: 0.78, sz: 1.25, ry: 0.2 },
    { x: -0.85, y: 0.45, z: 0.45, sx: 0.85, sy: 0.55, sz: 0.8, ry: 1.1 },
    { x: 0.95, y: 0.5, z: -0.55, sx: 0.9, sy: 0.65, sz: 0.85, ry: -0.6 },
  ].forEach((r) => {
    const rock = new THREE.Mesh(sharedGoldRockGeo, sharedGoldRockMat);
    rock.scale.set(r.sx, r.sy, r.sz);
    rock.position.set(r.x, r.y, r.z);
    rock.rotation.y = r.ry;
    rock.castShadow = true;
    rock.receiveShadow = true;
    group.add(rock);
  });

  // Faceted hexagonal crystalline gold quartz veins jutting from strata seams
  const oreMat = isRich ? sharedRichGoldOreMat : sharedGoldOreMat;
  const veinConfigs: Array<[number, number, number, number, number, number]> = [
    [0.05, 1.52, -0.15, 0.12, -0.1, isRich ? 1.38 : 1.15],
    [-0.65, 1.22, 0.35, 0.35, 0.45, isRich ? 1.12 : 0.95],
    [0.72, 1.18, 0.25, -0.32, -0.42, isRich ? 1.18 : 1.0],
    [-0.35, 1.15, -0.78, -0.45, 0.22, 0.88],
    [0.45, 1.3, -0.62, -0.3, -0.35, 0.92],
    ...(isRich
      ? ([
          [-0.08, 1.72, 0.45, 0.25, 0.14, 1.15],
          [0.98, 1.08, 0.72, -0.22, -0.5, 0.92],
        ] as Array<[number, number, number, number, number, number]>)
      : []),
  ];
  veinConfigs.forEach(([vx, vy, vz, rx, rz, sc]) => {
    const spire = new THREE.Mesh(sharedGoldCrystalGeo, oreMat);
    spire.position.set(vx, vy, vz);
    spire.rotation.set(rx, vx, rz);
    spire.scale.setScalar(sc);
    spire.castShadow = true;
    group.add(spire);
    depletableParts.push({ mesh: spire, baseScale: spire.scale.clone() });
  });

  // Exposed raw gold ore nuggets along base
  const nug1 = new THREE.Mesh(sharedGoldNuggetGeo, oreMat);
  nug1.position.set(-0.92, 0.55, 1.22);
  const nug2 = new THREE.Mesh(sharedGoldNuggetGeo, oreMat);
  nug2.position.set(0.95, 0.62, 1.05);
  group.add(nug1, nug2);
  depletableParts.push(
    { mesh: nug1, baseScale: nug1.scale.clone() },
    { mesh: nug2, baseScale: nug2.scale.clone() }
  );

  // Mine Adit Timber Portal + Wooden Track Sleepers + Iron Rails + Ore Cart
  const post1 = new THREE.Mesh(sharedGoldPostGeo, sharedWoodScaffoldMat);
  post1.position.set(-1.15, 1.15, 1.28);
  post1.rotation.z = -0.08;
  const post2 = new THREE.Mesh(sharedGoldPostGeo, sharedWoodScaffoldMat);
  post2.position.set(1.15, 1.15, 1.28);
  post2.rotation.z = 0.08;
  const beam = new THREE.Mesh(sharedGoldBeamGeo, sharedWoodScaffoldMat);
  beam.position.set(0, 2.28, 1.28);
  group.add(post1, post2, beam);

  // Rail sleepers & twin iron rails
  [1.15, 1.55, 1.95, 2.35].forEach((tz) => {
    const sleeper = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.06, 0.14), sharedWoodScaffoldMat);
    sleeper.position.set(0, 0.03, tz);
    group.add(sleeper);
  });
  [-0.32, 0.32].forEach((rx) => {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, 1.55), sharedIronRailMat);
    rail.position.set(rx, 0.08, 1.75);
    group.add(rail);
  });

  // Rolling Wooden Ore Cart loaded with gold nuggets
  const cartGroup = new THREE.Group();
  cartGroup.position.set(0, 0.34, 1.92);
  const cartBody = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.44, 0.92), sharedWoodScaffoldMat);
  cartBody.castShadow = true;
  cartGroup.add(cartBody);
  [
    [-0.4, -0.26],
    [0.4, -0.26],
    [-0.4, 0.26],
    [0.4, 0.26],
  ].forEach(([wx, wz]) => {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.06, 10), sharedIronRailMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, -0.2, wz);
    cartGroup.add(wheel);
  });
  [-0.14, 0.12].forEach((nx, i) => {
    const cNug = new THREE.Mesh(sharedGoldNuggetGeo, oreMat);
    cNug.scale.setScalar(0.55);
    cNug.position.set(nx, 0.24, i === 0 ? -0.1 : 0.14);
    cartGroup.add(cNug);
    depletableParts.push({ mesh: cNug, baseScale: cNug.scale.clone() });
  });
  group.add(cartGroup);

  addWarmLantern(group, 0.88, 1.96, 1.32, sharedIronRailMat);

  if (isRich) {
    const goldHalo = new THREE.Mesh(
      new THREE.RingGeometry(1.78, 2.15, 28),
      new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.45, side: THREE.DoubleSide })
    );
    goldHalo.rotation.x = -Math.PI / 2;
    goldHalo.position.y = 0.05;
    group.add(goldHalo);
  }

  group.userData.depletableParts = depletableParts;

  const badge = createBadgeSprite(
    isRich ? '富金礦脈' : '金礦',
    '🪙',
    `${amount}`,
    1,
    false,
    true,
    isRich ? '✨高純度金脈 · 採速×1.35' : undefined
  );
  badge.position.set(0, isRich ? 4.15 : 3.85, 0);
  group.add(badge);
  group.userData.badgeSprite = badge;

  return group;
}

const sharedQuarryBlockGeo = new THREE.BoxGeometry(0.88, 0.46, 0.74);
const sharedCranePostGeo = new THREE.CylinderGeometry(0.09, 0.11, 2.7, 8);
const sharedCraneArmGeo = new THREE.BoxGeometry(1.85, 0.14, 0.14);
const sharedStoneLightMat = new THREE.MeshStandardMaterial({
  color: 0xcbd5e1,
  map: resRockMaps.map,
  normalMap: resRockMaps.normalMap,
  normalScale: new THREE.Vector2(1.1, 1.1),
  roughnessMap: resRockMaps.roughnessMap || null,
  roughness: 0.94,
});
const sharedStoneDarkMat = new THREE.MeshStandardMaterial({
  color: 0x64748b,
  map: resRockMaps.map,
  normalMap: resRockMaps.normalMap,
  normalScale: new THREE.Vector2(1.2, 1.2),
  roughnessMap: resRockMaps.roughnessMap || null,
  roughness: 0.96,
});

export function createStoneQuarryMesh(
  amount = 1000,
  nodeTier: 'standard' | 'rich' = 'standard'
): THREE.Group {
  const group = new THREE.Group();
  const isRich = nodeTier === 'rich';
  addContactShadow(group, isRich ? 2.35 : 2.1);

  const depletableParts: Array<{ mesh: THREE.Object3D; baseScale: THREE.Vector3 }> = [];

  // Multi-tiered granite quarry cliff shelves
  const baseCliff = new THREE.Mesh(sharedGoldRockGeo, sharedStoneDarkMat);
  baseCliff.scale.set(1.35, 0.7, 1.15);
  baseCliff.position.set(-0.15, 0.62, -0.15);
  baseCliff.castShadow = true;
  group.add(baseCliff);

  const upperCliff = new THREE.Mesh(sharedGoldRockGeo, sharedStoneDarkMat);
  upperCliff.scale.set(0.9, 0.65, 0.82);
  upperCliff.position.set(-0.4, 1.2, -0.35);
  group.add(upperCliff);
  depletableParts.push({ mesh: upperCliff, baseScale: upperCliff.scale.clone() });

  // Neatly chiseled ashlar stone blocks stacked at base
  [
    [-0.55, 0.25, 0.95, 0.1],
    [0.42, 0.25, 0.92, -0.15],
    [-0.08, 0.72, 0.92, 0.05],
  ].forEach(([bx, by, bz, ry]) => {
    const block = new THREE.Mesh(sharedQuarryBlockGeo, sharedStoneLightMat);
    block.position.set(bx, by, bz);
    block.rotation.y = ry;
    block.castShadow = true;
    group.add(block);
    depletableParts.push({ mesh: block, baseScale: block.scale.clone() });
  });

  // Quarry iron crowbar wedge & mason's wooden mallet leaning on blocks
  const crowbar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.05, 6), sharedIronRailMat);
  crowbar.position.set(0.88, 0.45, 1.18);
  crowbar.rotation.z = 0.42;
  const malletHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.55, 6), sharedWoodScaffoldMat);
  malletHandle.position.set(-0.55, 0.62, 1.05);
  malletHandle.rotation.set(0.35, 0, -0.5);
  const malletHead = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.24, 8), sharedWoodScaffoldMat);
  malletHead.position.set(-0.36, 0.76, 1.12);
  malletHead.rotation.z = Math.PI / 2;
  group.add(crowbar, malletHandle, malletHead);

  if (isRich) {
    // Gleaming marble-quartz mineral seams on rich stone quarry
    [
      [-0.35, 1.48, -0.15, 0.15, -0.2, 0.95],
      [0.32, 1.15, -0.32, -0.28, 0.3, 0.85],
    ].forEach(([qx, qy, qz, rx, rz, sc]) => {
      const quartz = new THREE.Mesh(sharedGoldCrystalGeo, sharedRichQuartzMat);
      quartz.position.set(qx, qy, qz);
      quartz.rotation.set(rx, qx, rz);
      quartz.scale.setScalar(sc);
      group.add(quartz);
      depletableParts.push({ mesh: quartz, baseScale: quartz.scale.clone() });
    });

    const stoneHalo = new THREE.Mesh(
      new THREE.RingGeometry(1.6, 1.95, 28),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.4, side: THREE.DoubleSide })
    );
    stoneHalo.rotation.x = -Math.PI / 2;
    stoneHalo.position.y = 0.05;
    group.add(stoneHalo);
  }

  // Timber Quarry Jib Crane + Brace + Iron Pulley Wheel + Rope + Suspended Ashlar Block
  const cranePost = new THREE.Mesh(sharedCranePostGeo, sharedWoodScaffoldMat);
  cranePost.position.set(1.32, 1.35, -0.5);
  cranePost.castShadow = true;
  const craneBrace = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.1, 0.1), sharedWoodScaffoldMat);
  craneBrace.position.set(0.95, 2.05, -0.5);
  craneBrace.rotation.z = 0.72;
  const craneArm = new THREE.Mesh(sharedCraneArmGeo, sharedWoodScaffoldMat);
  craneArm.position.set(0.55, 2.6, -0.5);
  craneArm.rotation.z = -0.24;
  const pulleyWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.08, 12), sharedIronRailMat);
  pulleyWheel.rotation.x = Math.PI / 2;
  pulleyWheel.position.set(-0.22, 2.75, -0.5);
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.85, 5), sharedWoodScaffoldMat);
  rope.position.set(-0.22, 2.15, -0.5);
  const hungBlock = new THREE.Mesh(sharedQuarryBlockGeo, sharedStoneLightMat);
  hungBlock.scale.setScalar(0.62);
  hungBlock.position.set(-0.22, 1.62, -0.5);
  hungBlock.castShadow = true;
  group.add(cranePost, craneBrace, craneArm, pulleyWheel, rope, hungBlock);

  group.userData.depletableParts = depletableParts;

  const badge = createBadgeSprite(
    isRich ? '精良石脈' : '石礦',
    '🪨',
    `${amount}`,
    1,
    false,
    true,
    isRich ? '✨高產石脈 · 採速×1.35' : undefined
  );
  badge.position.set(0, isRich ? 3.85 : 3.6, 0);
  group.add(badge);
  group.userData.badgeSprite = badge;

  return group;
}

const sharedResourceScarGeo = new THREE.CircleGeometry(1, 20);
const sharedResourceScarMat = new THREE.MeshBasicMaterial({
  color: 0x51483d,
  transparent: true,
  opacity: 0.58,
  depthWrite: false,
});
const sharedExcavationRimGeo = new THREE.RingGeometry(1.02, 1.16, 20);
const sharedExcavationRimMat = new THREE.MeshStandardMaterial({
  color: 0x746958,
  roughness: 1,
});
const sharedStumpGeo = new THREE.CylinderGeometry(0.32, 0.43, 0.3, 10);
const sharedStumpCutGeo = new THREE.CircleGeometry(0.315, 10);
const sharedStumpCutMat = new THREE.MeshStandardMaterial({
  color: 0xc29a6b,
  roughness: 0.96,
});
const sharedStumpGrowthRingGeo = new THREE.RingGeometry(0.105, 0.125, 10);
const sharedStumpGrowthRingMat = new THREE.MeshStandardMaterial({
  color: 0x795437,
  roughness: 1,
});
const sharedStumpChipGeo = new THREE.CylinderGeometry(0.075, 0.095, 0.48, 6);

export interface ResourceDepletionBatch {
  group: THREE.Group;
  capacity: number;
  count: number;
  scars: THREE.InstancedMesh;
  stumps: THREE.InstancedMesh;
  stumpCuts: THREE.InstancedMesh;
  stumpRings: THREE.InstancedMesh;
  woodChips: THREE.InstancedMesh;
  excavationRims: THREE.InstancedMesh;
  rubble: THREE.InstancedMesh;
}

/**
 * Creates one fixed set of instanced batches for every depleted resource site on a map.
 * Capacity is reserved once at setup; individual depletion events only write instance matrices.
 */
export function createResourceDepletionBatch(capacity: number): ResourceDepletionBatch {
  const siteCapacity = Math.max(1, Math.floor(capacity));
  const group = new THREE.Group();
  group.name = 'resource-depletion-remnant-batches';
  group.userData.isResourceRemnantBatch = true;

  const makeBatch = (geo: THREE.BufferGeometry, material: THREE.Material, count: number, name: string) => {
    const mesh = new THREE.InstancedMesh(geo, material, count);
    mesh.name = name;
    mesh.count = 0;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(mesh);
    return mesh;
  };

  const batch: ResourceDepletionBatch = {
    group,
    capacity: siteCapacity,
    count: 0,
    scars: makeBatch(sharedResourceScarGeo, sharedResourceScarMat, siteCapacity, 'depletedSiteScars'),
    stumps: makeBatch(sharedStumpGeo, sharedTreeTrunkMat, siteCapacity, 'depletedTreeStumps'),
    stumpCuts: makeBatch(sharedStumpCutGeo, sharedStumpCutMat, siteCapacity, 'depletedTreeCutFaces'),
    stumpRings: makeBatch(sharedStumpGrowthRingGeo, sharedStumpGrowthRingMat, siteCapacity, 'depletedTreeGrowthRings'),
    woodChips: makeBatch(sharedStumpChipGeo, sharedTreeTrunkMat, siteCapacity * 2, 'depletedWoodChips'),
    excavationRims: makeBatch(sharedExcavationRimGeo, sharedExcavationRimMat, siteCapacity, 'depletedExcavationRims'),
    rubble: makeBatch(sharedGoldRockGeo, sharedGoldRockMat, siteCapacity * 5, 'depletedMineralRubble'),
  };

  return batch;
}

const sharedResourceRemnantDummy = new THREE.Object3D();

function writeResourceRemnantInstance(
  mesh: THREE.InstancedMesh,
  index: number,
  x: number,
  y: number,
  z: number,
  rotationX: number,
  rotationY: number,
  rotationZ: number,
  scaleX: number,
  scaleY: number,
  scaleZ: number
): void {
  sharedResourceRemnantDummy.position.set(x, y, z);
  sharedResourceRemnantDummy.rotation.set(rotationX, rotationY, rotationZ);
  sharedResourceRemnantDummy.scale.set(scaleX, scaleY, scaleZ);
  sharedResourceRemnantDummy.updateMatrix();
  mesh.setMatrixAt(index, sharedResourceRemnantDummy.matrix);
}

/**
 * Adds a depleted site to shared instance batches. It never creates an Object3D per site.
 * Returns false only if the map-reserved capacity is exceeded.
 */
export function addResourceDepletionRemnant(
  batch: ResourceDepletionBatch,
  x: number,
  z: number,
  subtype: 'wood' | 'gold' | 'stone',
  nodeTier: 'standard' | 'rich' = 'standard'
): boolean {
  if (batch.count >= batch.capacity) return false;

  const slot = batch.count;
  const tierScale = nodeTier === 'rich' ? 1.12 : 1;
  if (subtype === 'wood') {
    writeResourceRemnantInstance(batch.scars, slot, x, 0.018, z, -Math.PI / 2, 0, 0, 0.78 * tierScale, 0.68 * tierScale, 1);
    writeResourceRemnantInstance(batch.stumps, slot, x, 0.15 * tierScale, z, 0, 0, 0, tierScale, tierScale, tierScale);
    writeResourceRemnantInstance(batch.stumpCuts, slot, x, 0.303 * tierScale, z, -Math.PI / 2, 0, 0, tierScale, tierScale, tierScale);
    writeResourceRemnantInstance(batch.stumpRings, slot, x, 0.306 * tierScale, z, -Math.PI / 2, 0, 0, tierScale, tierScale, tierScale);

    const chips = [
      { x: 0.48, z: -0.2, yaw: 0.38, tilt: 1.42, scale: 1 },
      { x: -0.34, z: 0.52, yaw: -0.62, tilt: 1.5, scale: 0.76 },
    ];
    chips.forEach((chip, index) => {
      writeResourceRemnantInstance(
        batch.woodChips,
        slot * 2 + index,
        x + chip.x * tierScale,
        0.09 * tierScale,
        z + chip.z * tierScale,
        0.04,
        chip.yaw,
        chip.tilt,
        chip.scale * tierScale,
        chip.scale * tierScale,
        chip.scale * tierScale
      );
    });
  } else {
    const scarScaleX = 1.55 * tierScale;
    const scarScaleZ = 1.3 * tierScale;
    writeResourceRemnantInstance(batch.scars, slot, x, 0.018, z, -Math.PI / 2, 0, 0, scarScaleX, scarScaleZ, 1);
    writeResourceRemnantInstance(
      batch.excavationRims,
      slot,
      x,
      0.026,
      z,
      -Math.PI / 2,
      0,
      0,
      subtype === 'gold' ? 1 : 0.88,
      subtype === 'gold' ? 0.82 : 0.9,
      1
    );

    const rubbleCount = subtype === 'gold' ? 4 : 5;
    for (let i = 0; i < rubbleCount; i++) {
      const angle = (i / rubbleCount) * Math.PI * 2 + (subtype === 'gold' ? 0.18 : 0.42);
      const radius = (subtype === 'gold' ? 1.28 : 1.18) * tierScale;
      const size = (subtype === 'gold' ? 0.11 : 0.13) * (0.82 + (i % 3) * 0.12);
      writeResourceRemnantInstance(
        batch.rubble,
        slot * 5 + i,
        x + Math.cos(angle) * radius,
        0.075,
        z + Math.sin(angle) * radius * 0.82,
        0.18 + i * 0.09,
        angle * 1.7,
        0.12 - i * 0.035,
        size * 1.25,
        size * 0.82,
        size
      );
    }
  }

  batch.count++;
  batch.scars.count = batch.count;
  batch.stumps.count = batch.count;
  batch.stumpCuts.count = batch.count;
  batch.stumpRings.count = batch.count;
  batch.woodChips.count = batch.count * 2;
  batch.excavationRims.count = batch.count;
  batch.rubble.count = batch.count * 5;

  const touched = [
    batch.scars,
    batch.stumps,
    batch.stumpCuts,
    batch.stumpRings,
    batch.woodChips,
    batch.excavationRims,
    batch.rubble,
  ];
  touched.forEach((mesh) => {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.boundingBox = null;
    mesh.boundingSphere = null;
  });

  return true;
}


const sharedBushClumpGeo = makeFoliageClusterGeo(0.56, 1);
const sharedBerryDotGeo = new THREE.SphereGeometry(0.085, 8, 8);
const sharedBushLeafMat = new THREE.MeshStandardMaterial({
  color: 0x1e7e34,
  map: resFoliageMaps.map,
  normalMap: resFoliageMaps.normalMap,
  normalScale: new THREE.Vector2(1.05, 1.05),
  roughnessMap: resFoliageMaps.roughnessMap || null,
  roughness: 0.9,
});
const sharedBerryFruitMat = new THREE.MeshStandardMaterial({
  color: 0xe11d48,
  roughness: 0.14,
  metalness: 0.06,
});
const sharedBushBlossomMat = new THREE.MeshStandardMaterial({
  color: 0xfef9c3,
  roughness: 0.65,
});

export function createBerryBushMesh(amount = 350, hasBadge = false): THREE.Group {
  const group = new THREE.Group();
  addContactShadow(group, 1.15);

  // Woody stems at shrub core
  [-0.18, 0, 0.2].forEach((sx, i) => {
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.055, 0.5, 6), sharedTreeTrunkMat);
    stem.position.set(sx, 0.22, (i - 1) * 0.1);
    stem.rotation.z = sx * 0.6;
    group.add(stem);
  });

  // 5 clustered organic shrub lobes
  [
    [0, 0.56, 0, 1.25, 0.9, 1.15],
    [0.44, 0.42, 0.25, 0.85, 0.72, 0.85],
    [-0.42, 0.44, -0.18, 0.88, 0.75, 0.82],
    [0.12, 0.45, -0.42, 0.82, 0.72, 0.82],
    [-0.18, 0.4, 0.44, 0.8, 0.7, 0.8],
  ].forEach(([cx, cy, cz, sx, sy, sz], i) => {
    const clump = new THREE.Mesh(sharedBushClumpGeo, sharedBushLeafMat);
    // Deterministic per-lobe variation breaks the repeated round silhouette without adding geometry.
    const fullness = 1 + Math.sin(i * 2.17) * 0.055;
    clump.position.set(cx, cy + Math.cos(i * 1.73) * 0.025, cz);
    clump.scale.set(sx * fullness, sy * (1 + Math.cos(i * 1.31) * 0.045), sz * (1 - Math.sin(i * 1.91) * 0.05));
    clump.rotation.set(Math.sin(i * 1.47) * 0.075, i * 0.8, Math.cos(i * 1.23) * 0.075);
    clump.castShadow = true;
    group.add(clump);
  });

  // Tiny cream shrub blossoms nestled between berries
  [
    [-0.36, 0.84, 0.15],
    [0.36, 0.8, 0.24],
    [0.08, 0.98, -0.22],
    [-0.18, 0.72, 0.48],
  ].forEach(([fx, fy, fz]) => {
    const blossom = new THREE.Mesh(new THREE.OctahedronGeometry(0.06, 0), sharedBushBlossomMat);
    blossom.position.set(fx, fy, fz);
    group.add(blossom);
  });

  // Plump glossy wild berry racemes
  const berryOffsets: Array<[number, number, number]> = [
    [-0.3, 0.82, 0.42],
    [-0.22, 0.76, 0.52],
    [0.24, 0.9, -0.32],
    [0.34, 0.83, -0.24],
    [0.54, 0.62, 0.42],
    [0.46, 0.68, 0.34],
    [-0.48, 0.6, -0.22],
    [-0.42, 0.66, -0.12],
    [0.04, 1.0, 0.26],
    [0.12, 0.96, 0.36],
    [-0.08, 0.98, 0.16],
    [0.02, 0.68, 0.62],
  ];
  const berryDots: THREE.Mesh[] = [];
  berryOffsets.forEach(([bx, by, bz]) => {
    const berry = new THREE.Mesh(sharedBerryDotGeo, sharedBerryFruitMat);
    berry.position.set(bx, by, bz);
    group.add(berry);
    berryDots.push(berry);
  });
  group.userData.berryDots = berryDots;

  if (hasBadge) {
    const badge = createBadgeSprite('野生漿果', '🫐', `${amount}`, 1, false, true, '快速採集糧食');
    badge.position.set(0, 2.25, 0);
    group.add(badge);
    group.userData.badgeSprite = badge;
  }
  return group;
}

/**
 * Thins, shortens, and dries the farm's crop instances as its food reserve is harvested.
 * A deterministic shuffled order keeps missing stalks distributed across the whole plot.
 */
export function updateFarmCropVisual(mesh: THREE.Group, amount: number, maxAmount: number): void {
  const instances = mesh.userData.farmCropInstances as THREE.InstancedMesh | undefined;
  const baseMatrices = mesh.userData.farmCropBaseMatrices as THREE.Matrix4[] | undefined;
  const baseColors = mesh.userData.farmCropBaseColors as THREE.Color[] | undefined;
  if (!instances || !baseMatrices || baseMatrices.length !== instances.count) return;

  const ratio = THREE.MathUtils.clamp(amount / Math.max(1, maxAmount), 0, 1);
  const scratch = new THREE.Object3D();
  const color = new THREE.Color();
  const dryCropTint = new THREE.Color(0xa18b5d);
  const dryFactor = (1 - ratio) * 0.42;

  for (let i = 0; i < instances.count; i++) {
    baseMatrices[i].decompose(scratch.position, scratch.quaternion, scratch.scale);
    const removalRank = ((i * 37) % instances.count + 0.5) / instances.count;
    if (removalRank > ratio) {
      scratch.scale.setScalar(0);
    } else {
      scratch.scale.y *= 0.7 + ratio * 0.3;
    }
    scratch.updateMatrix();
    instances.setMatrixAt(i, scratch.matrix);

    if (baseColors && baseColors[i] && instances.instanceColor) {
      color.copy(baseColors[i]).lerp(dryCropTint, dryFactor);
      instances.setColorAt(i, color);
    }
  }

  instances.instanceMatrix.needsUpdate = true;
  if (instances.instanceColor) instances.instanceColor.needsUpdate = true;
}

/**
 * Updates visual depletion cues on a resource node mesh (shrinking crystals/stone slabs,
 * thinning tree canopy, or picked berry clusters) as remaining reserves fall.
 */
export function updateResourceNodeDepletionVisual(
  mesh: THREE.Group,
  amount: number,
  maxAmount: number,
  subtype?: string
): void {
  const ratio = Math.max(0, Math.min(1, amount / Math.max(1, maxAmount)));
  if (subtype === 'wood') mesh.userData.treeDepletionRatio = ratio;

  if (subtype === 'wood' && mesh.userData.treeCanopy) {
    const canopy = mesh.userData.treeCanopy as THREE.Object3D;
    const baseScale = typeof mesh.userData.baseCanopyScale === 'number' ? mesh.userData.baseCanopyScale : 1.0;
    const s = baseScale * (0.64 + 0.36 * ratio);
    canopy.scale.setScalar(s);
    return;
  }

  if (subtype === 'berry' && Array.isArray(mesh.userData.berryDots)) {
    const dots = mesh.userData.berryDots as THREE.Mesh[];
    const visibleCount = Math.ceil(dots.length * ratio);
    dots.forEach((dot, idx) => {
      dot.visible = idx < visibleCount;
    });
    return;
  }

  if (Array.isArray(mesh.userData.depletableParts)) {
    const parts = mesh.userData.depletableParts as Array<{ mesh: THREE.Object3D; baseScale: THREE.Vector3 }>;
    const factor = 0.42 + 0.58 * ratio;
    parts.forEach((p) => {
      p.mesh.scale.set(
        p.baseScale.x * factor,
        p.baseScale.y * factor,
        p.baseScale.z * factor
      );
    });
  }
}

// Anatomical Sculpted Stag Deer Geometries
const sharedDeerTorsoGeo = makeLatheGeo([
  [0.01, -0.48],
  [0.16, -0.44],
  [0.24, -0.22],
  [0.21, 0.05],
  [0.24, 0.3],
  [0.18, 0.46],
  [0.01, 0.5],
], 12);
sharedDeerTorsoGeo.rotateZ(-Math.PI / 2);

const sharedDeerNeckGeo = makeLatheGeo([
  [0.13, 0.0],
  [0.11, 0.18],
  [0.085, 0.36],
], 10);
const sharedDeerHeadGeo = makeLatheGeo([
  [0.01, -0.14],
  [0.11, -0.06],
  [0.1, 0.08],
  [0.065, 0.2],
  [0.04, 0.27],
  [0.01, 0.29],
], 10);
sharedDeerHeadGeo.rotateZ(-Math.PI / 2);

const sharedDeerLegUpperGeo = new THREE.CylinderGeometry(0.055, 0.038, 0.28, 8);
const sharedDeerLegLowerGeo = new THREE.CylinderGeometry(0.036, 0.026, 0.28, 7);
const sharedDeerHoofGeo = new THREE.CylinderGeometry(0.028, 0.034, 0.05, 7);
const sharedDeerAntlerMainGeo = makeTubeGeo([
  [0.0, 0.0, 0.0],
  [-0.04, 0.16, 0.05],
  [-0.1, 0.32, 0.08],
], 0.022, 7, 5);
const sharedDeerAntlerTineGeo = makeTubeGeo([
  [-0.03, 0.14, 0.04],
  [0.07, 0.24, 0.06],
], 0.016, 5, 4);

const sharedDeerMat = new THREE.MeshStandardMaterial({
  color: 0xb9621f,
  map: resFurMaps.map,
  normalMap: resFurMaps.normalMap,
  normalScale: new THREE.Vector2(0.65, 0.65),
  roughness: 0.78,
});
const sharedDeerCreamMat = new THREE.MeshStandardMaterial({
  color: 0xfef3c7,
  map: resFurMaps.map,
  roughness: 0.82,
});
const sharedHoofMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.45 });
const sharedAntlerMat = new THREE.MeshStandardMaterial({ color: 0xfde68a, roughness: 0.48 });

export function createDeerMesh(amount = 400, hasBadge = false): THREE.Group {
  const group = new THREE.Group();
  addContactShadow(group, 0.9);

  // Articulated upper body pivot centered near chest/hip midpoint so bounding tilts naturally
  const bodyPivot = new THREE.Group();
  bodyPivot.position.set(0, 0.7, 0);
  group.add(bodyPivot);

  const body = new THREE.Mesh(sharedDeerTorsoGeo, sharedDeerMat);
  body.castShadow = true;
  bodyPivot.add(body);

  // Pale cream chest/belly & subtle dappled coat spots + articulated white tail tuft
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), sharedDeerCreamMat);
  belly.scale.set(1.9, 0.7, 0.85);
  belly.position.set(0, -0.12, 0);
  bodyPivot.add(belly);

  const spotGeo = new THREE.SphereGeometry(0.035, 6, 6);
  [
    [-0.16, 0.14, 0.17],
    [0.05, 0.16, 0.16],
    [-0.06, 0.12, -0.17],
    [0.12, 0.15, -0.16],
  ].forEach(([sx, sy, sz]) => {
    const spot = new THREE.Mesh(spotGeo, sharedDeerCreamMat);
    spot.scale.set(1.1, 0.8, 0.4);
    spot.position.set(sx, sy, sz);
    bodyPivot.add(spot);
  });

  const tailPivot = new THREE.Group();
  tailPivot.position.set(-0.46, 0.02, 0);
  bodyPivot.add(tailPivot);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 6), sharedDeerCreamMat);
  tail.position.set(-0.04, 0.04, 0);
  tail.rotation.z = 0.9;
  tailPivot.add(tail);

  const headPivot = new THREE.Group();
  headPivot.name = 'deerHeadPivot';
  headPivot.position.set(0.32, 0.08, 0);
  bodyPivot.add(headPivot);
  group.userData.deerHeadPivot = headPivot;

  const neck = new THREE.Mesh(sharedDeerNeckGeo, sharedDeerMat);
  neck.position.set(0.02, 0.02, 0);
  neck.rotation.z = -0.35;
  neck.castShadow = true;
  headPivot.add(neck);

  const head = new THREE.Mesh(sharedDeerHeadGeo, sharedDeerMat);
  head.position.set(0.16, 0.36, 0);
  head.rotation.z = 0.14;
  head.castShadow = true;
  headPivot.add(head);

  // Dark muzzle nose + Twin alert ears + Branched 2-tine Antlers
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.032, 6, 6), sharedHoofMat);
  nose.position.set(0.43, 0.32, 0);
  headPivot.add(nose);

  [-0.08, 0.08].forEach((sideZ, idx) => {
    const sideSign = idx === 0 ? -1 : 1;
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.14, 5), sharedDeerMat);
    ear.position.set(0.06, 0.47, sideZ * 1.15);
    ear.rotation.set(sideSign * 0.45, 0, 0.5);
    headPivot.add(ear);

    const antGrp = new THREE.Group();
    antGrp.position.set(0.1, 0.44, sideZ * 0.75);
    antGrp.scale.z = sideSign;
    const beam = new THREE.Mesh(sharedDeerAntlerMainGeo, sharedAntlerMat);
    const tine = new THREE.Mesh(sharedDeerAntlerTineGeo, sharedAntlerMat);
    antGrp.add(beam, tine);
    headPivot.add(antGrp);
  });

  // 4 Articulated Hip/Shoulder Pivots with Hooves grounded at y=0
  const makeLegPivot = (lx: number, lz: number): THREE.Group => {
    const legPivot = new THREE.Group();
    legPivot.position.set(lx, 0.54, lz);
    const upper = new THREE.Mesh(sharedDeerLegUpperGeo, sharedDeerMat);
    upper.position.set(0, -0.12, 0);
    upper.castShadow = true;
    const lower = new THREE.Mesh(sharedDeerLegLowerGeo, sharedDeerMat);
    lower.position.set(0, -0.37, 0);
    const hoof = new THREE.Mesh(sharedDeerHoofGeo, sharedHoofMat);
    hoof.position.set(0, -0.515, 0);
    legPivot.add(upper, lower, hoof);
    group.add(legPivot);
    return legPivot;
  };

  const blLeg = makeLegPivot(-0.31, -0.13);
  const brLeg = makeLegPivot(-0.31, 0.13);
  const flLeg = makeLegPivot(0.29, -0.12);
  const frLeg = makeLegPivot(0.29, 0.12);

  const animParts: DeerAnimParts = {
    bodyPivot,
    headPivot,
    tailPivot,
    flLeg,
    frLeg,
    blLeg,
    brLeg,
  };
  group.userData.deerAnimParts = animParts;

  if (hasBadge) {
    const badge = createBadgeSprite('野生山羌', '🦌', `${amount}`, 1, false, true, '狩獵採集肉類 (×1.15)');
    badge.position.set(0, 2.35, 0);
    group.add(badge);
    group.userData.badgeSprite = badge;
  }
  return group;
}

const sharedFishBodyGeo = makeLatheGeo([
  [0.01, -0.22],
  [0.065, -0.1],
  [0.08, 0.04],
  [0.045, 0.17],
  [0.01, 0.24],
], 8);
sharedFishBodyGeo.rotateZ(-Math.PI / 2);

const sharedShoreFishMat = new THREE.MeshStandardMaterial({
  color: 0x38bdf8,
  emissive: 0x0369a1,
  emissiveIntensity: 0.22,
  roughness: 0.28,
  metalness: 0.35,
});

const sharedDeepFishMat = new THREE.MeshStandardMaterial({
  color: 0xf59e0b,
  emissive: 0x1d4ed8,
  emissiveIntensity: 0.28,
  roughness: 0.22,
  metalness: 0.45,
});

const sharedFishTailGeo = new THREE.ConeGeometry(0.055, 0.12, 4);
sharedFishTailGeo.rotateZ(-Math.PI / 2);

export function createShoreFishMesh(amount = 450, hasBadge = false): THREE.Group {
  const group = new THREE.Group();

  // Gentle pale cyan water ripple ring around shallow fish shoal
  const rippleOuter = new THREE.Mesh(
    new THREE.RingGeometry(0.56, 0.78, 22),
    new THREE.MeshBasicMaterial({
      color: 0xbae6fd,
      transparent: true,
      opacity: 0.62,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  rippleOuter.rotation.x = -Math.PI / 2;
  rippleOuter.position.y = 0.11;
  group.add(rippleOuter);

  const rippleInner = new THREE.Mesh(
    new THREE.RingGeometry(0.24, 0.34, 18),
    new THREE.MeshBasicMaterial({
      color: 0xe0f2fe,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  rippleInner.rotation.x = -Math.PI / 2;
  rippleInner.position.y = 0.115;
  group.add(rippleInner);

  // Invisible raycast hit disc above water plane so clicking & hovering feels snappy
  const hitDisc = new THREE.Mesh(
    new THREE.CylinderGeometry(1.0, 1.0, 0.35, 14),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hitDisc.position.y = 0.18;
  group.add(hitDisc);

  // 3 darting shore fish circling just at the water surface
  [
    { x: 0.28, y: 0.14, z: 0.12, yaw: 0.4, scale: 1.0 },
    { x: -0.26, y: 0.13, z: -0.22, yaw: 2.3, scale: 0.88 },
    { x: -0.05, y: 0.16, z: 0.32, yaw: -1.4, scale: 0.82 },
  ].forEach((f) => {
    const fish = new THREE.Group();
    const body = new THREE.Mesh(sharedFishBodyGeo, sharedShoreFishMat);
    const tail = new THREE.Mesh(sharedFishTailGeo, sharedShoreFishMat);
    tail.position.set(-0.24, 0, 0);
    fish.add(body, tail);
    fish.position.set(f.x, f.y, f.z);
    fish.rotation.y = f.yaw;
    fish.scale.setScalar(f.scale);
    group.add(fish);
  });

  if (hasBadge) {
    const badge = createBadgeSprite('沿岸魚群', '🐟', `${amount}`, 1, false, true, '沿岸捕魚 (×1.32)');
    badge.position.set(0, 1.85, 0);
    group.add(badge);
    group.userData.badgeSprite = badge;
  }
  return group;
}

export function createDeepFishMesh(amount = 650, hasBadge = false): THREE.Group {
  const group = new THREE.Group();

  // Deeper sapphire water swirl pool + twin concentric ripples
  const deepPool = new THREE.Mesh(
    new THREE.CircleGeometry(0.92, 22),
    new THREE.MeshBasicMaterial({
      color: 0x0c4a6e,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  deepPool.rotation.x = -Math.PI / 2;
  deepPool.position.y = 0.105;
  group.add(deepPool);

  const ripple = new THREE.Mesh(
    new THREE.RingGeometry(0.68, 0.94, 24),
    new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  ripple.rotation.x = -Math.PI / 2;
  ripple.position.y = 0.12;
  group.add(ripple);

  const hitDisc = new THREE.Mesh(
    new THREE.CylinderGeometry(1.15, 1.15, 0.45, 14),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hitDisc.position.y = 0.22;
  group.add(hitDisc);

  // 3 larger golden-cobalt deep-water tuna/marlin arcing near surface
  [
    { x: 0.05, y: 0.22, z: -0.05, yaw: 0.75, pitch: -0.25, scale: 1.45 },
    { x: -0.34, y: 0.16, z: 0.28, yaw: 2.5, pitch: 0.1, scale: 1.18 },
    { x: 0.36, y: 0.15, z: 0.25, yaw: -1.1, pitch: 0.08, scale: 1.12 },
  ].forEach((f) => {
    const fish = new THREE.Group();
    const body = new THREE.Mesh(sharedFishBodyGeo, sharedDeepFishMat);
    const tail = new THREE.Mesh(sharedFishTailGeo, sharedDeepFishMat);
    tail.position.set(-0.24, 0, 0);
    const dorsal = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.13, 3), sharedDeepFishMat);
    dorsal.position.set(0.02, 0.1, 0);
    dorsal.rotation.z = 0.45;
    fish.add(body, tail, dorsal);
    fish.position.set(f.x, f.y, f.z);
    fish.rotation.y = f.yaw;
    fish.rotation.z = f.pitch;
    fish.scale.setScalar(f.scale);
    group.add(fish);
  });

  if (hasBadge) {
    const badge = createBadgeSprite('深海魚群', '🐠', `${amount}`, 1, false, true, '深海捕撈 (最快 ×1.55)');
    badge.position.set(0, 2.0, 0);
    group.add(badge);
    group.userData.badgeSprite = badge;
  }
  return group;
}

/**
 * Scales BoxGeometry UVs proportionally to world dimensions so tiled road/bridge PBR textures never stretch.
 */
function scalePlanarBoxUVs(geo: THREE.BoxGeometry, uScale: number, vScale: number) {
  const uv = geo.attributes.uv;
  if (!uv) return;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * uScale, uv.getY(i) * vScale);
  }
  uv.needsUpdate = true;
}

/**
 * Builds rich 3D terrain features (rivers with animated normal ripples, lakes, stone bridges/fords,
 * textured cobble roads, craggy highland cliffs, shoreline boulders, and meadow wildflowers).
 */
export function createEnvironmentFeaturesGroup(layout: MapLayoutResult): THREE.Group {
  const envGroup = new THREE.Group();
  envGroup.name = 'environmentFeatures';

  const waterNormal = getWaterRippleNormalMap();
  const stoneMaps = getStoneMasonryMaps();

  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x0ea5e9,
    normalMap: waterNormal,
    normalScale: new THREE.Vector2(0.95, 0.95),
    roughness: 0.1,
    metalness: 0.36,
    transparent: true,
    opacity: 0.82,
  });
  const deepWaterMat = new THREE.MeshBasicMaterial({
    color: 0x075985,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
  });
  const foamMat = new THREE.MeshBasicMaterial({
    color: 0xe0f2fe,
    transparent: true,
    opacity: 0.32,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const bankMat = new THREE.MeshStandardMaterial({
    color: 0xc2a878,
    map: resRockMaps.map,
    normalMap: resRockMaps.normalMap,
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughness: 0.94,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });
  const bridgeStoneMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    map: stoneMaps.map,
    normalMap: stoneMaps.normalMap,
    normalScale: new THREE.Vector2(1.0, 1.0),
    roughness: 0.76,
  });
  const bridgeParapetMat = new THREE.MeshStandardMaterial({
    color: 0x64748b,
    map: stoneMaps.map,
    normalMap: stoneMaps.normalMap,
    roughness: 0.84,
  });
  const bridgeIronMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.35,
    metalness: 0.82,
  });
  const cliffMat = new THREE.MeshStandardMaterial({
    color: 0x78716c,
    map: resRockMaps.map,
    normalMap: resRockMaps.normalMap,
    normalScale: new THREE.Vector2(1.4, 1.4),
    roughness: 0.92,
  });

  // Helper containment checks so meadow grass & wildflowers never appear underwater or on bridges
  const distToSegment = (px: number, pz: number, x1: number, z1: number, x2: number, z2: number): number => {
    const vx = x2 - x1;
    const vz = z2 - z1;
    const lenSq = vx * vx + vz * vz;
    if (lenSq < 1e-6) return Math.hypot(px - x1, pz - z1);
    const t = Math.max(0, Math.min(1, ((px - x1) * vx + (pz - z1) * vz) / lenSq));
    return Math.hypot(px - (x1 + t * vx), pz - (z1 + t * vz));
  };

  const isOnBridge = (x: number, z: number): boolean => {
    return layout.bridges.some((br) => {
      const dx = x - br.x;
      const dz = z - br.z;
      const c = Math.cos(br.angle);
      const s = Math.sin(br.angle);
      const lx = dx * c + dz * s;
      const lz = -dx * s + dz * c;
      return Math.abs(lx) <= br.halfWidth + 1.0 && Math.abs(lz) <= br.halfLength + 1.1;
    });
  };

  const isInWaterOrShore = (x: number, z: number, pad = 1.4): boolean => {
    if (
      layout.waterRects.some(
        (wr) => distToSegment(x, z, wr.x1, wr.z1, wr.x2, wr.z2) <= (wr.halfWidth ?? 9.8) + pad
      )
    ) {
      return true;
    }
    if (layout.waterDiscs.some((wd) => Math.hypot(x - wd.x, z - wd.z) <= wd.radius + pad)) {
      return true;
    }
    return false;
  };

  const isInCliff = (x: number, z: number, pad = 1.2): boolean => {
    return layout.cliffDiscs.some((cd) => Math.hypot(x - cd.x, z - cd.z) <= cd.radius + pad);
  };

  const getResourceFootprint = (subtype?: string): number => {
    switch (subtype) {
      case 'wood': return 1.65;
      case 'gold':
      case 'stone': return 2.05;
      case 'berry': return 1.25;
      case 'hunt': return 1.1;
      case 'farm': return 1.8;
      default: return 1.25;
    }
  };

  // Keep decorative vegetation outside harvestable silhouettes so trees, mines and bushes
  // sit directly on the terrain instead of appearing to grow through grass blades.
  const isNearResourceNode = (x: number, z: number, pad = 0): boolean => {
    return layout.resourceNodes.some((node) =>
      Math.hypot(x - node.x, z - node.z) <= getResourceFootprint(node.subtype) + pad
    );
  };

  // Soft, irregular earth wear around harvest sites visually anchors resource props.
  // A single instanced mesh keeps the extra ground layer to one draw call.
  const wearNodes = layout.resourceNodes.filter((node) =>
    node.subtype !== 'shore_fish' &&
    node.subtype !== 'deep_fish' &&
    !isOnBridge(node.x, node.z) &&
    !isInWaterOrShore(node.x, node.z, 1.25) &&
    !isInCliff(node.x, node.z, 0.8)
  );
  if (wearNodes.length > 0) {
    const segments = 20;
    const rings = [0.32, 0.68, 1.0];
    const positions: number[] = [0, 0, 0];
    const colors: number[] = [0.27, 0.19, 0.12, 0.24];
    const indices: number[] = [];
    for (let ring = 0; ring < rings.length; ring++) {
      for (let seg = 0; seg < segments; seg++) {
        const angle = (seg / segments) * Math.PI * 2;
        const irregularity = 1 + Math.sin(angle * 3 + ring * 0.7) * 0.09 +
          Math.cos(angle * 5 - ring * 1.1) * 0.045;
        const radius = rings[ring] * irregularity;
        positions.push(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
        const alpha = ring === 0 ? 0.25 : ring === 1 ? 0.19 : 0;
        colors.push(0.29, 0.205, 0.125, alpha);
      }
    }
    const firstRing = 1;
    for (let seg = 0; seg < segments; seg++) {
      const next = (seg + 1) % segments;
      indices.push(0, firstRing + seg, firstRing + next);
    }
    for (let ring = 0; ring < rings.length - 1; ring++) {
      const inner = 1 + ring * segments;
      const outer = inner + segments;
      for (let seg = 0; seg < segments; seg++) {
        const next = (seg + 1) % segments;
        indices.push(
          inner + seg, outer + seg, outer + next,
          inner + seg, outer + next, inner + next
        );
      }
    }
    const wearGeo = new THREE.BufferGeometry();
    wearGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    wearGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
    wearGeo.setIndex(indices);
    const wearMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      vertexColors: true,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });
    const wearMesh = new THREE.InstancedMesh(wearGeo, wearMat, wearNodes.length);
    const wearDummy = new THREE.Object3D();
    wearNodes.forEach((node, idx) => {
      const radius = node.subtype === 'gold' || node.subtype === 'stone'
        ? 2.65
        : node.subtype === 'wood' ? 2.25
        : node.subtype === 'farm' ? 2.4
        : node.subtype === 'berry' ? 1.85
        : 1.65;
      wearDummy.position.set(node.x, 0.026, node.z);
      wearDummy.scale.set(
        radius * (0.88 + (idx % 4) * 0.045),
        1,
        radius * (0.76 + ((idx * 3) % 5) * 0.055)
      );
      wearDummy.rotation.y = (idx * 1.71) % (Math.PI * 2);
      wearDummy.updateMatrix();
      wearMesh.setMatrixAt(idx, wearDummy.matrix);
    });
    wearMesh.instanceMatrix.needsUpdate = true;
    wearMesh.computeBoundingSphere();
    wearMesh.renderOrder = 1;
    envGroup.add(wearMesh);
  }

  // 1. River strips with deep central channel, shimmering normal-mapped surface, and shoreline foam lines
  layout.waterRects.forEach((wr) => {
    const dx = wr.x2 - wr.x1;
    const dz = wr.z2 - wr.z1;
    const len = Math.hypot(dx, dz);
    const angle = Math.atan2(dx, dz);
    const cx = (wr.x1 + wr.x2) / 2;
    const cz = (wr.z1 + wr.z2) / 2;
    const waterWidth = (wr.halfWidth ?? 9.8) * 2;
    const bankWidth = waterWidth + 4.8;

    const bankGeo = new THREE.PlaneGeometry(bankWidth, len + 2);
    bankGeo.rotateX(-Math.PI / 2);
    const bankUv = bankGeo.attributes.uv;
    if (bankUv) {
      for (let i = 0; i < bankUv.count; i++) {
        bankUv.setXY(i, bankUv.getX(i) * 2.5, bankUv.getY(i) * Math.max(3, len / 6.0));
      }
      bankUv.needsUpdate = true;
    }
    const bank = new THREE.Mesh(bankGeo, bankMat);
    bank.position.set(cx, 0.018, cz);
    bank.rotation.y = angle;
    envGroup.add(bank);

    const deepBedGeo = new THREE.PlaneGeometry(waterWidth * 0.56, len);
    deepBedGeo.rotateX(-Math.PI / 2);
    const deepBed = new THREE.Mesh(deepBedGeo, deepWaterMat);
    deepBed.position.set(cx, 0.036, cz);
    deepBed.rotation.y = angle;
    envGroup.add(deepBed);

    const water = new THREE.Mesh(new THREE.BoxGeometry(waterWidth, 0.08, len), waterMat);
    water.position.set(cx, 0.056, cz);
    water.rotation.y = angle;
    envGroup.add(water);

    // Subtle pale shoreline ripple borders
    [-waterWidth * 0.48, waterWidth * 0.48].forEach((offset) => {
      const foamGeo = new THREE.PlaneGeometry(0.46, len);
      foamGeo.rotateX(-Math.PI / 2);
      const foam = new THREE.Mesh(foamGeo, foamMat);
      foam.position.set(
        cx + Math.cos(angle) * offset,
        0.068,
        cz - Math.sin(angle) * offset
      );
      foam.rotation.y = angle;
      envGroup.add(foam);
    });
  });

  // 2. Lake discs with deep center pool + shoreline foam ring
  layout.waterDiscs.forEach((wd) => {
    const shore = new THREE.Mesh(new THREE.CircleGeometry(wd.radius + 1.5, 32), bankMat);
    shore.rotation.x = -Math.PI / 2;
    shore.position.set(wd.x, 0.018, wd.z);
    envGroup.add(shore);

    const deepCenter = new THREE.Mesh(new THREE.CircleGeometry(wd.radius * 0.62, 28), deepWaterMat);
    deepCenter.rotation.x = -Math.PI / 2;
    deepCenter.position.set(wd.x, 0.036, wd.z);
    envGroup.add(deepCenter);

    const lake = new THREE.Mesh(new THREE.CircleGeometry(wd.radius, 32), waterMat);
    lake.rotation.x = -Math.PI / 2;
    lake.position.set(wd.x, 0.06, wd.z);
    envGroup.add(lake);

    const foamRing = new THREE.Mesh(new THREE.RingGeometry(wd.radius - 0.55, wd.radius - 0.05, 32), foamMat);
    foamRing.rotation.x = -Math.PI / 2;
    foamRing.position.set(wd.x, 0.068, wd.z);
    envGroup.add(foamRing);
  });

  // 3. Arched Stone Bridges & Flank Fords across rivers
  layout.bridges.forEach((br, idx) => {
    const bridgeGroup = new THREE.Group();
    bridgeGroup.position.set(br.x, 0, br.z);
    bridgeGroup.rotation.y = -br.angle;

    const fullLen = br.halfLength * 2.02;
    const fullW = br.halfWidth * 1.9;

    const deckGeo = new THREE.BoxGeometry(fullW, 0.28, fullLen);
    scalePlanarBoxUVs(deckGeo, 1.5, 2.4);
    const deck = new THREE.Mesh(deckGeo, bridgeStoneMat);
    deck.position.y = 0.17;
    deck.receiveShadow = true;
    bridgeGroup.add(deck);

    // Beveled side arch beams & cobble approach ramps
    [-br.halfLength - 0.55, br.halfLength + 0.55].forEach((rz) => {
      const rampGeo = new THREE.BoxGeometry(fullW * 0.94, 0.14, 1.2);
      scalePlanarBoxUVs(rampGeo, 1.4, 0.6);
      const ramp = new THREE.Mesh(rampGeo, bridgeStoneMat);
      ramp.position.set(0, 0.08, rz);
      ramp.receiveShadow = true;
      bridgeGroup.add(ramp);
    });

    [-br.halfWidth * 0.92, br.halfWidth * 0.92].forEach((px) => {
      const curb = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, idx === 0 ? 0.48 : 0.34, fullLen * 0.98),
        bridgeParapetMat
      );
      curb.position.set(px, idx === 0 ? 0.42 : 0.34, 0);
      curb.castShadow = true;
      bridgeGroup.add(curb);

      // Periodic stone merlons along primary & secondary stone bridges
      const merlonCount = idx === 0 ? 7 : 5;
      for (let m = 0; m < merlonCount; m++) {
        const mz = ((m / (merlonCount - 1)) * 2 - 1) * (br.halfLength * 0.85);
        const merlon = new THREE.Mesh(
          new THREE.BoxGeometry(0.46, idx === 0 ? 0.38 : 0.24, 0.65),
          bridgeStoneMat
        );
        merlon.position.set(px, idx === 0 ? 0.84 : 0.62, mz);
        merlon.castShadow = true;
        bridgeGroup.add(merlon);
      }

      // Corner stone anchor pillars + warm glowing iron bridge lanterns
      [-br.halfLength * 0.92, br.halfLength * 0.92].forEach((pz) => {
        const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.68, idx === 0 ? 1.25 : 0.9, 0.68), bridgeParapetMat);
        pillar.position.set(px, idx === 0 ? 0.68 : 0.5, pz);
        pillar.castShadow = true;
        bridgeGroup.add(pillar);
        if (idx === 0) {
          addWarmLantern(bridgeGroup, px, 1.44, pz, bridgeIronMat);
        }
      });

      // River cutwater piers anchoring the bridge into the riverbed
      [-br.halfLength * 0.45, br.halfLength * 0.45].forEach((pierZ) => {
        const pier = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.42, 1.1), bridgeParapetMat);
        pier.position.set(px * 0.98, 0.14, pierZ);
        bridgeGroup.add(pier);
      });
    });

    envGroup.add(bridgeGroup);
  });

  // 4. Highland cliffs & multi-tiered craggy rocky mesas
  const cragGeo = makeCraggyRockGeo(1.0, 1);
  const mossCapMat = new THREE.MeshStandardMaterial({
    color: 0x3f6212,
    map: resFoliageMaps.map,
    normalMap: resFoliageMaps.normalMap,
    roughness: 0.88,
  });
  layout.cliffDiscs.forEach((cd, cIdx) => {
    const mesa = new THREE.Mesh(cragGeo, cliffMat);
    mesa.scale.set(cd.radius * 0.98, 2.3, cd.radius * 0.92);
    mesa.position.set(cd.x, 1.15, cd.z);
    mesa.rotation.set(0.12, cIdx * 0.9, 0.08);
    mesa.castShadow = true;
    mesa.receiveShadow = true;
    envGroup.add(mesa);

    const spire = new THREE.Mesh(cragGeo, sharedStoneDarkMat);
    spire.scale.set(cd.radius * 0.62, 2.75, cd.radius * 0.58);
    spire.position.set(cd.x + 0.35, 2.75, cd.z - 0.25);
    spire.rotation.set(-0.15, cIdx * 1.4, 0.1);
    spire.castShadow = true;
    envGroup.add(spire);

    const cap = new THREE.Mesh(new THREE.CylinderGeometry(cd.radius * 0.52, cd.radius * 0.68, 0.35, 8), mossCapMat);
    cap.position.set(cd.x - 0.25, 2.48, cd.z + 0.2);
    envGroup.add(cap);
  });

  // 5. Instanced decorative shoreline & cliff-base boulders (1 draw call)
  const pebblePts: Array<{ x: number; z: number; s: number }> = [];
  layout.cliffDiscs.forEach((cd) => {
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 + 0.25;
      pebblePts.push({
        x: cd.x + Math.cos(a) * (cd.radius + 0.35),
        z: cd.z + Math.sin(a) * (cd.radius + 0.35),
        s: 0.72 + (k % 3) * 0.34,
      });
    }
  });
  layout.waterDiscs.forEach((wd) => {
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2 + 0.12;
      const bx = wd.x + Math.cos(a) * (wd.radius + 0.95);
      const bz = wd.z + Math.sin(a) * (wd.radius + 0.95);
      if (!isOnBridge(bx, bz)) {
        pebblePts.push({ x: bx, z: bz, s: 0.5 + (k % 3) * 0.28 });
      }
    }
  });
  // Extend the existing pebble batch along riverbanks to soften the straight bank-plane edge.
  layout.waterRects.forEach((wr, riverIdx) => {
    const dx = wr.x2 - wr.x1;
    const dz = wr.z2 - wr.z1;
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len;
    const nz = dx / len;
    const halfWidth = wr.halfWidth ?? 9.8;
    for (let k = 0; k < 84; k++) {
      const t = 0.035 + (k / 83) * 0.93;
      const side = k % 2 === 0 ? 1 : -1;
      const jitter = (Math.sin((k + riverIdx * 13) * 2.37) + 1) * 0.42;
      const offset = halfWidth + 1.45 + jitter;
      const px = wr.x1 + dx * t + nx * side * offset;
      const pz = wr.z1 + dz * t + nz * side * offset;
      if (Math.abs(px) > 89 || Math.abs(pz) > 89 || isOnBridge(px, pz) || isInCliff(px, pz, 0.4)) {
        continue;
      }
      pebblePts.push({
        x: px,
        z: pz,
        s: 0.46 + ((k * 3 + riverIdx) % 4) * 0.12,
      });
    }
  });

  if (pebblePts.length > 0) {
    const rockGeo = makeCraggyRockGeo(0.45, 0);
    const instancedRocks = new THREE.InstancedMesh(rockGeo, sharedStoneLightMat, pebblePts.length);
    const rDummy = new THREE.Object3D();
    const rockTint = new THREE.Color();
    pebblePts.forEach((pt, idx) => {
      rDummy.position.set(pt.x, 0.105 * pt.s, pt.z);
      rDummy.scale.set(pt.s * (1.12 + (idx % 3) * 0.09), pt.s * (0.58 + (idx % 4) * 0.07), pt.s * (0.88 + (idx % 5) * 0.055));
      rDummy.rotation.set(Math.sin(idx * 1.37) * 0.12, idx * 1.1, Math.cos(idx * 0.91) * 0.1);
      rDummy.updateMatrix();
      instancedRocks.setMatrixAt(idx, rDummy.matrix);
      rockTint.setHex(idx % 3 === 0 ? 0xa3a3a3 : idx % 3 === 1 ? 0x8c9586 : 0xb8b2a6);
      instancedRocks.setColorAt(idx, rockTint);
    });
    instancedRocks.instanceMatrix.needsUpdate = true;
    if (instancedRocks.instanceColor) instancedRocks.instanceColor.needsUpdate = true;
    instancedRocks.computeBoundingSphere();
    envGroup.add(instancedRocks);
  }

  // 6. Dense Instanced 3D Crossed Grass Clumps (skipping rivers, lakes, cliffs, and bridges)
  const grassPts: Array<{ x: number; z: number; scale: number; yaw: number; hex: number }> = [];
  const grassPalette = [0x3f6212, 0x4d7c0f, 0x365314, 0x65a30d, 0x2d4a1e];
  for (let i = 0; i < 3800 && grassPts.length < 1750; i++) {
    const rawX = (Math.sin(i * 78.233) * 43758.5453) % 1;
    const rawZ = (Math.sin(i * 19.913) * 19283.1234) % 1;
    const gx = (rawX < 0 ? rawX + 1 : rawX) * 172 - 86;
    const gz = (rawZ < 0 ? rawZ + 1 : rawZ) * 172 - 86;
    if (isOnBridge(gx, gz) || isInWaterOrShore(gx, gz, 0.85) || isInCliff(gx, gz, 0.8) || isNearResourceNode(gx, gz, 0.55)) continue;
    grassPts.push({
      x: gx,
      z: gz,
      scale: 0.9 + (i % 5) * 0.16,
      yaw: (i * 1.37) % (Math.PI * 2),
      hex: grassPalette[i % grassPalette.length],
    });
  }
  if (grassPts.length > 0) {
    const grassGeo = makeGrassClumpGeo();
    const grassMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.84,
      metalness: 0.02,
      side: THREE.DoubleSide,
    });
    const instancedGrass = new THREE.InstancedMesh(grassGeo, grassMat, grassPts.length);
    const gDummy = new THREE.Object3D();
    const gTint = new THREE.Color();
    grassPts.forEach((pt, idx) => {
      gDummy.position.set(pt.x, 0.0, pt.z);
      gDummy.scale.set(pt.scale, pt.scale * (0.88 + (idx % 5) * 0.09), pt.scale * (0.92 + (idx % 4) * 0.045));
      gDummy.rotation.set(Math.sin(idx * 1.73) * 0.055, pt.yaw, Math.cos(idx * 1.29) * 0.055);
      gDummy.updateMatrix();
      instancedGrass.setMatrixAt(idx, gDummy.matrix);
      gTint.setHex(pt.hex);
      instancedGrass.setColorAt(idx, gTint);
    });
    instancedGrass.instanceMatrix.needsUpdate = true;
    if (instancedGrass.instanceColor) instancedGrass.instanceColor.needsUpdate = true;
    instancedGrass.computeBoundingSphere();
    envGroup.add(instancedGrass);
  }

  // 7. Instanced Meadow Wildflowers scattered naturally across clear turf
  const flowerPts: Array<{ x: number; z: number; scale: number; hex: number }> = [];
  const flowerPalette = [0xfacc15, 0xfef9c3, 0xfb7185, 0xc084fc, 0xfde047];
  for (let i = 0; i < 980 && flowerPts.length < 320; i++) {
    const rawX = (Math.sin(i * 41.13 + 7.2) * 31987.412) % 1;
    const rawZ = (Math.sin(i * 67.89 + 3.1) * 51234.789) % 1;
    const fx = (rawX < 0 ? rawX + 1 : rawX) * 166 - 83;
    const fz = (rawZ < 0 ? rawZ + 1 : rawZ) * 166 - 83;
    if (isOnBridge(fx, fz) || isInWaterOrShore(fx, fz, 1.1) || isInCliff(fx, fz, 1.0) || isNearResourceNode(fx, fz, 0.45)) continue;
    flowerPts.push({
      x: fx,
      z: fz,
      scale: 0.85 + (i % 4) * 0.16,
      hex: flowerPalette[i % flowerPalette.length],
    });
  }
  if (flowerPts.length > 0) {
    const flowerGeo = new THREE.OctahedronGeometry(0.15, 0);
    const flowerMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.62 });
    const instancedFlowers = new THREE.InstancedMesh(flowerGeo, flowerMat, flowerPts.length);
    const fDummy = new THREE.Object3D();
    const fTint = new THREE.Color();
    flowerPts.forEach((pt, idx) => {
      fDummy.position.set(pt.x, 0.28 * pt.scale, pt.z);
      fDummy.scale.set(pt.scale * (0.9 + (idx % 3) * 0.08), pt.scale * (0.58 + (idx % 4) * 0.055), pt.scale * (0.9 + (idx % 5) * 0.04));
      fDummy.rotation.set(Math.sin(idx * 1.7) * 0.18, idx * 0.9, Math.cos(idx * 1.13) * 0.16);
      fDummy.updateMatrix();
      instancedFlowers.setMatrixAt(idx, fDummy.matrix);
      fTint.setHex(pt.hex);
      instancedFlowers.setColorAt(idx, fTint);
    });
    instancedFlowers.instanceMatrix.needsUpdate = true;
    if (instancedFlowers.instanceColor) instancedFlowers.instanceColor.needsUpdate = true;
    instancedFlowers.computeBoundingSphere();
    envGroup.add(instancedFlowers);
  }

  // 8. Instanced Shoreline Cattail & Reed Tufts along riverbanks & lakes
  const reedPts: Array<{ x: number; z: number; scale: number; yaw: number }> = [];
  layout.waterRects.forEach((wr) => {
    const dx = wr.x2 - wr.x1;
    const dz = wr.z2 - wr.z1;
    const len = Math.hypot(dx, dz);
    const nx = -dz / Math.max(1, len);
    const nz = dx / Math.max(1, len);
    const hw = wr.halfWidth ?? 9.8;
    for (let s = 0; s < 56; s++) {
      const t = 0.05 + (s / 55) * 0.9;
      const side = s % 2 === 0 ? 1 : -1;
      const jitter = ((Math.sin(s * 17.3) * 0.5) + 0.5) * 1.1;
      const rx = wr.x1 + dx * t + nx * side * (hw + 0.35 + jitter);
      const rz = wr.z1 + dz * t + nz * side * (hw + 0.35 + jitter);
      if (Math.abs(rx) > 86 || Math.abs(rz) > 86) continue;
      if (isOnBridge(rx, rz)) continue;
      reedPts.push({ x: rx, z: rz, scale: 0.85 + (s % 4) * 0.16, yaw: s * 1.4 });
    }
  });
  layout.waterDiscs.forEach((wd) => {
    for (let s = 0; s < 24; s++) {
      const a = (s / 24) * Math.PI * 2 + 0.18;
      const rDist = wd.radius + 0.25 + (s % 3) * 0.32;
      const rx = wd.x + Math.cos(a) * rDist;
      const rz = wd.z + Math.sin(a) * rDist;
      if (!isOnBridge(rx, rz)) {
        reedPts.push({ x: rx, z: rz, scale: 0.82 + (s % 4) * 0.15, yaw: a });
      }
    }
  });
  if (reedPts.length > 0) {
    const reedGeo = makeReedTuftGeo();
    const reedMat = new THREE.MeshStandardMaterial({
      color: 0x3f6212,
      roughness: 0.85,
      side: THREE.DoubleSide,
    });
    const instancedReeds = new THREE.InstancedMesh(reedGeo, reedMat, reedPts.length);
    const cattailGeo = new THREE.CylinderGeometry(0.036, 0.036, 0.22, 6);
    const cattailMat = new THREE.MeshStandardMaterial({ color: 0x713f12, roughness: 0.92 });
    const instancedCattails = new THREE.InstancedMesh(cattailGeo, cattailMat, reedPts.length);
    const rdDummy = new THREE.Object3D();
    reedPts.forEach((pt, idx) => {
      rdDummy.position.set(pt.x, 0.0, pt.z);
      rdDummy.scale.setScalar(pt.scale);
      rdDummy.rotation.set(0, pt.yaw, 0);
      rdDummy.updateMatrix();
      instancedReeds.setMatrixAt(idx, rdDummy.matrix);

      rdDummy.position.set(pt.x + Math.cos(pt.yaw) * 0.12, 0.92 * pt.scale, pt.z + Math.sin(pt.yaw) * 0.12);
      rdDummy.rotation.set(0, pt.yaw, 0.12);
      rdDummy.updateMatrix();
      instancedCattails.setMatrixAt(idx, rdDummy.matrix);
    });
    instancedReeds.instanceMatrix.needsUpdate = true;
    instancedCattails.instanceMatrix.needsUpdate = true;
    instancedReeds.computeBoundingSphere();
    instancedCattails.computeBoundingSphere();
    envGroup.add(instancedReeds, instancedCattails);
  }

  return envGroup;
}

const cmdRingGeo = new THREE.RingGeometry(0.55, 0.9, 24);
cmdRingGeo.rotateX(-Math.PI / 2);

export function createCommandRingMesh(colorHex: number): THREE.Mesh {
  const mat = new THREE.MeshBasicMaterial({
    color: colorHex,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(cmdRingGeo, mat);
  mesh.position.y = 0.06;
  return mesh;
}

// ----------------- UNITS (Sculpted Multi-Part Articulated Rigs) -----------------

export interface UnitAnimParts {
  bodyPivot: THREE.Group;
  rightArmPivot: THREE.Group;
  leftArmPivot?: THREE.Group;
  leftLeg?: THREE.Object3D;
  rightLeg?: THREE.Object3D;
  leftKnee?: THREE.Object3D;
  rightKnee?: THREE.Object3D;
  wheels?: THREE.Object3D[];
  robeSkirt?: THREE.Object3D;
  carryBundle?: THREE.Mesh;
  auraMesh?: THREE.Object3D;
  horseHead?: THREE.Object3D;
  horseTail?: THREE.Object3D;
  veteranHalo?: THREE.Mesh;
  buffRing?: THREE.Mesh;
  hitMaterials: THREE.MeshStandardMaterial[];
}

// Shared Sculpted Unit Sub-Geometries
const unitThighGeo = new THREE.CapsuleGeometry(0.072, 0.125, 7, 14);
const unitShinGeo = makeLatheGeo([
  [0.048, -0.13],
  [0.064, -0.05],
  [0.068, 0.04],
  [0.058, 0.09],
], 14);
const unitBootGeo = new RoundedBoxGeometry(0.125, 0.085, 0.22, 2, 0.022);
const unitPoleynGeo = new THREE.SphereGeometry(0.068, 12, 8);
const unitArmSegmentGeo = new THREE.CapsuleGeometry(0.054, 0.18, 7, 14);
const unitHandGeo = new THREE.SphereGeometry(0.066, 12, 8);
const unitHeadGeo = new THREE.SphereGeometry(0.185, 24, 18);

const unitTunicGeo = makeLatheGeo([
  [0.245, 0.0],
  [0.215, 0.14],
  [0.195, 0.34],
  [0.238, 0.52],
  [0.145, 0.6],
  [0.118, 0.635],
  [0.096, 0.715],
  [0.01, 0.735],
], 20);

const unitBreastplateGeo = makeLatheGeo([
  [0.235, 0.0],
  [0.21, 0.18],
  [0.275, 0.42],
  [0.26, 0.58],
  [0.155, 0.64],
  [0.124, 0.665],
  [0.098, 0.73],
  [0.01, 0.75],
], 20);

const unitPauldronGeo = new THREE.SphereGeometry(0.148, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.6);
const unitStrawHatGeo = makeLatheGeo([
  [0.39, 0.0],
  [0.31, 0.055],
  [0.2, 0.125],
  [0.12, 0.21],
  [0.01, 0.27],
], 16);
const unitHelmGeo = makeLatheGeo([
  [0.225, -0.06],
  [0.245, 0.04],
  [0.228, 0.18],
  [0.17, 0.3],
  [0.06, 0.36],
  [0.01, 0.37],
], 22);

// Tapered Flowing Cape Shape (curved top & scalloped hem)
const unitCapeShape = new THREE.Shape();
unitCapeShape.moveTo(-0.16, 0.28);
unitCapeShape.lineTo(0.16, 0.28);
unitCapeShape.lineTo(0.26, -0.34);
unitCapeShape.quadraticCurveTo(0, -0.4, -0.26, -0.34);
unitCapeShape.closePath();
const unitCapeGeo = makeExtrudeGeo(unitCapeShape, 0.032, 0.01, 0.01, 1, true);

// Contoured Heater Shield
const unitShieldShape = new THREE.Shape();
unitShieldShape.moveTo(-0.23, 0.25);
unitShieldShape.lineTo(0.23, 0.25);
unitShieldShape.lineTo(0.22, -0.04);
unitShieldShape.quadraticCurveTo(0.14, -0.27, 0, -0.38);
unitShieldShape.quadraticCurveTo(-0.14, -0.27, -0.22, -0.04);
unitShieldShape.closePath();
const unitHeaterShieldGeo = makeExtrudeGeo(unitShieldShape, 0.065, 0.016, 0.016, 2, true);

// Beveled Broadsword Blade Shape
const unitSwordBladeShape = new THREE.Shape();
unitSwordBladeShape.moveTo(-0.042, 0);
unitSwordBladeShape.lineTo(0.042, 0);
unitSwordBladeShape.lineTo(0.034, 0.66);
unitSwordBladeShape.lineTo(0, 0.82);
unitSwordBladeShape.lineTo(-0.034, 0.66);
unitSwordBladeShape.closePath();
const unitBroadswordGeo = makeExtrudeGeo(unitSwordBladeShape, 0.022, 0.008, 0.008, 1, true);

// Curved Katana / Nodachi Blade
const unitKatanaGeo = makeTubeGeo([
  [0, 0, 0],
  [0, 0.3, 0.03],
  [0, 0.62, 0.09],
  [0, 0.92, 0.2],
], 0.02, 12, 6);
unitKatanaGeo.scale(0.42, 1.0, 1.35);

// Double-Curve Composite Bow
const unitBowGeo = makeTubeGeo([
  [0, -0.44, -0.14],
  [0, -0.28, 0.08],
  [0, -0.12, 0.16],
  [0, 0, 0.19],
  [0, 0.12, 0.16],
  [0, 0.28, 0.08],
  [0, 0.44, -0.14],
], 0.028, 16, 6);

const unitMageRobeGeo = makeLatheGeo([
  [0.44, 0.0],
  [0.34, 0.3],
  [0.25, 0.68],
  [0.23, 0.94],
  [0.13, 1.06],
  [0.01, 1.08],
], 16);
const unitWizardHatGeo = makeLatheGeo([
  [0.48, 0.0],
  [0.28, 0.04],
  [0.22, 0.18],
  [0.15, 0.42],
  [0.07, 0.66],
  [0.01, 0.84],
], 16);
const unitStaffGeo = makeTubeGeo([
  [0, -0.58, 0],
  [0.02, -0.1, 0.03],
  [-0.02, 0.35, -0.02],
  [0.04, 0.72, 0.04],
], 0.036, 12, 6);

// Warship Curved Hull Extrusion Helper
const warshipHullShape = new THREE.Shape();
warshipHullShape.moveTo(0, 1.25);
warshipHullShape.quadraticCurveTo(0.46, 0.75, 0.48, -0.15);
warshipHullShape.quadraticCurveTo(0.42, -0.95, 0.24, -1.18);
warshipHullShape.lineTo(-0.24, -1.18);
warshipHullShape.quadraticCurveTo(-0.42, -0.95, -0.48, -0.15);
warshipHullShape.quadraticCurveTo(-0.46, 0.75, 0, 1.25);
const unitWarshipHullGeo = makeExtrudeGeo(warshipHullShape, 0.44, 0.05, 0.05, 2, true);
unitWarshipHullGeo.rotateX(Math.PI / 2);

// Anatomical Equine Geometries (for Knights/Paladins/Scouts)
const horseBarrelGeo = makeLatheGeo([
  [0.01, -0.7],
  [0.27, -0.58],
  [0.34, -0.26],
  [0.295, 0.08],
  [0.345, 0.44],
  [0.245, 0.65],
  [0.01, 0.72],
], 22);
horseBarrelGeo.rotateX(Math.PI / 2);

const horseNeckGeo = makeLatheGeo([
  [0.225, 0.0],
  [0.195, 0.24],
  [0.14, 0.54],
], 16);
const horseMuzzleGeo = makeLatheGeo([
  [0.01, -0.18],
  [0.148, -0.08],
  [0.132, 0.12],
  [0.092, 0.28],
  [0.066, 0.39],
  [0.01, 0.41],
], 12);
horseMuzzleGeo.rotateX(Math.PI / 2);

const horseTailGeo = makeTubeGeo([
  [0, 0, 0],
  [0, -0.14, -0.14],
  [0, -0.46, -0.22],
], 0.056, 10, 6);
const horseLegUpperGeo = new THREE.CylinderGeometry(0.086, 0.056, 0.34, 8);
const horseLegLowerGeo = new THREE.CylinderGeometry(0.052, 0.04, 0.28, 8);
const horseHoofGeo = new THREE.CylinderGeometry(0.045, 0.056, 0.075, 8);

// Shared Siege Spoked Wheel Builder
function makeSiegeWheel(
  radius: number,
  width: number,
  woodMat: THREE.Material,
  ironMat: THREE.Material,
  numSpokes = 6
): THREE.Group {
  const wheelPivot = new THREE.Group();
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.26, radius * 0.26, width * 1.35, 10), ironMat);
  hub.rotation.z = Math.PI / 2;
  const felloe = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.88, radius * 0.12, 8, 16), woodMat);
  felloe.rotation.y = Math.PI / 2;
  const tire = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.028, 6, 16), ironMat);
  tire.rotation.y = Math.PI / 2;
  wheelPivot.add(hub, felloe, tire);

  const spokeGeo = new THREE.BoxGeometry(width * 0.72, radius * 1.66, 0.042);
  for (let i = 0; i < numSpokes / 2; i++) {
    const spoke = new THREE.Mesh(spokeGeo, woodMat);
    spoke.rotation.x = (i / (numSpokes / 2)) * Math.PI;
    wheelPivot.add(spoke);
  }
  return wheelPivot;
}

interface BuildingDistanceLodPart {
  object: THREE.Object3D;
  baseVisible: boolean;
  minPixelRadius: number;
}

const buildingLodWorldCenter = new THREE.Vector3();

/**
 * Cache only authored, optional architecture layers. Structural meshes,
 * construction rigs, damage visuals, animated flags, and badges stay untouched.
 */
function prepareBuildingVisualLod(group: THREE.Group): void {
  const parts: BuildingDistanceLodPart[] = [];
  group.updateMatrixWorld(true);

  group.traverse((object) => {
    const minPixelRadius = object.userData.distanceLodMinPixels;
    if (typeof minPixelRadius !== 'number' || !Number.isFinite(minPixelRadius)) return;
    parts.push({ object, baseVisible: object.visible, minPixelRadius });
  });

  if (parts.length === 0) return;

  const bounds = new THREE.Box3().setFromObject(group);
  const sphere = new THREE.Sphere();
  bounds.getBoundingSphere(sphere);
  group.userData.buildingLodParts = parts;
  group.userData.buildingLodCenter = sphere.center.clone();
  group.userData.buildingLodRadius = Math.max(0.5, sphere.radius);
}

/** Hide only roof micro-geometry and ground aprons below their projected size. */
export function updateBuildingVisualLod(
  group: THREE.Group,
  camera: THREE.PerspectiveCamera,
  viewportHeight: number,
  forceHighDetail = false
): void {
  const parts = group.userData.buildingLodParts as BuildingDistanceLodPart[] | undefined;
  const localCenter = group.userData.buildingLodCenter as THREE.Vector3 | undefined;
  const localRadius = group.userData.buildingLodRadius as number | undefined;
  if (!parts?.length || !localCenter || typeof localRadius !== 'number') return;

  group.updateMatrixWorld(true);
  buildingLodWorldCenter.copy(localCenter).applyMatrix4(group.matrixWorld);
  const distance = Math.max(0.001, camera.position.distanceTo(buildingLodWorldCenter));
  const safeHeight = Math.max(1, viewportHeight);
  const focalPixels = safeHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.getEffectiveFOV()) * 0.5));
  const worldRadius = localRadius * group.matrixWorld.getMaxScaleOnAxis();
  const projectedRadius = (worldRadius * focalPixels) / distance;

  for (const part of parts) {
    const shouldShow = part.baseVisible && (forceHighDetail || projectedRadius >= part.minPixelRadius);
    if (part.object.visible !== shouldShow) part.object.visible = shouldShow;
  }
}

export interface UnitVisualContext {
  age?: number;
  researchedTechIds?: string[];
  unitId?: string;
}

interface UnitDistanceLodPart {
  mesh: THREE.Mesh;
  baseVisible: boolean;
  radius: number;
}

const unitLodWorldCenter = new THREE.Vector3();
const UNIT_LOD_MIN_RADIUS = 0.012;
const UNIT_LOD_MAX_RADIUS = 0.105;
const UNIT_LOD_MIN_PIXEL_RADIUS = 1.45;

/**
 * Cache tiny authored mesh parts once so far-away armies can skip details
 * that occupy less than roughly 1.5 screen pixels. Main silhouettes, weapons,
 * equipment and animation pivots stay untouched.
 */
export function prepareUnitVisualLod(group: THREE.Group): void {
  const parts: UnitDistanceLodPart[] = [];
  group.updateMatrixWorld(true);

  group.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry || mesh.name === 'contactShadow') return;

    const geometry = mesh.geometry;
    if (!geometry.boundingSphere) geometry.computeBoundingSphere();
    const radius = geometry.boundingSphere?.radius ?? 0;
    if (radius < UNIT_LOD_MIN_RADIUS || radius > UNIT_LOD_MAX_RADIUS) return;

    parts.push({ mesh, baseVisible: mesh.visible, radius });
  });

  group.userData.distanceLodParts = parts;
}

/**
 * Toggle only micro-details according to their projected size in the current
 * perspective view. Selected / inspected units keep all details enabled.
 */
export function updateUnitVisualLod(
  group: THREE.Group,
  camera: THREE.PerspectiveCamera,
  viewportHeight: number,
  forceHighDetail = false
): void {
  const parts = group.userData.distanceLodParts as UnitDistanceLodPart[] | undefined;
  if (!parts?.length) return;

  group.updateMatrixWorld(true);
  const safeHeight = Math.max(1, viewportHeight);
  const focalPixels = safeHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.getEffectiveFOV()) * 0.5));

  for (const part of parts) {
    if (!part.baseVisible) continue;
    let shouldShow = true;

    if (!forceHighDetail) {
      const bounds = part.mesh.geometry.boundingSphere;
      if (bounds) {
        unitLodWorldCenter.copy(bounds.center).applyMatrix4(part.mesh.matrixWorld);
        const distance = Math.max(0.001, camera.position.distanceTo(unitLodWorldCenter));
        const worldRadius = part.radius * part.mesh.matrixWorld.getMaxScaleOnAxis();
        shouldShow = (worldRadius * focalPixels) / distance >= UNIT_LOD_MIN_PIXEL_RADIUS;
      }
    }

    if (part.mesh.visible !== shouldShow) part.mesh.visible = shouldShow;
  }
}

/** Map researched tech ids to silhouette upgrades (procedural accessories). */
export function getUnitVisualFlags(ctx?: UnitVisualContext) {
  const age = ctx?.age || 1;
  const techs = ctx?.researchedTechIds || [];
  const has = (id: string) => techs.includes(id);
  return {
    age,
    plateArmor: has('med_plate_tempering') || has('fan_elder_bark') || has('ani_ki_awakening') || age >= 4,
    forgedWeapons: has('med_forged_blades') || has('fan_arcane_resonance') || has('ani_chakra_flow') || age >= 3,
    eliteTrim: age >= 3,
    imperial: age >= 4,
    siegeEngineers: has('shared_siege_engineers'),
  };
}

export function createUnitMesh(
  unitDef: UnitDefinition,
  faction: FactionId,
  visualCtx?: UnitVisualContext
): THREE.Group {
  const group = new THREE.Group();
  const colors = getFactionPalette(faction);
  const s = unitDef.visual.scale || 1;
  const unitId = visualCtx?.unitId || unitDef.id;
  const flags = getUnitVisualFlags(visualCtx);

  addContactShadow(group, 0.72 * s);

  const factionRingGeo = new THREE.RingGeometry(0.55 * s, 0.7 * s, 20);
  factionRingGeo.rotateX(-Math.PI / 2);
  const factionRingMat = new THREE.MeshBasicMaterial({
    color: colors.ring,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });
  const factionRing = new THREE.Mesh(factionRingGeo, factionRingMat);
  factionRing.position.y = 0.025;
  group.add(factionRing);

  const buffRingGeo = new THREE.RingGeometry(0.74 * s, 0.9 * s, 20);
  buffRingGeo.rotateX(-Math.PI / 2);
  const buffRing = new THREE.Mesh(
    buffRingGeo,
    new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
    })
  );
  buffRing.position.y = 0.04;
  buffRing.visible = false;
  group.add(buffRing);

  const vetGeo = new THREE.TorusGeometry(0.32 * s, 0.035 * s, 6, 16);
  vetGeo.rotateX(Math.PI / 2);
  const veteranHalo = new THREE.Mesh(
    vetGeo,
    new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.92 })
  );
  veteranHalo.position.y = 1.65 * s;
  veteranHalo.visible = false;
  group.add(veteranHalo);

  const roleIcons: Record<string, string> = {
    villager: '⛏️',
    boat: '⛵',
    swordsman: '⚔️',
    archer: '🏹',
    knight: '🐎',
    ninja: '🥷',
    saiyan: '⚡',
    mage: '🔮',
    ram: '🐏',
    cannon: '💣',
    golem: unitDef.category === 'siege' ? '🪨' : '🪵',
  };
  const icon =
    unitId === 'transport_boat'
      ? '🚢'
      : unitId === 'war_galley'
      ? '⛵'
      : unitId === 'greek_fire_siphon'
      ? '🔥'
      : unitId === 'scout_rider'
      ? '🔭'
      : unitId === 'anime_katana_shinigami'
      ? '🗡️'
      : unitId === 'fantasy_paladin'
      ? '🛡️'
      : roleIcons[unitDef.visual.modelType] || '⚔️';
  const displayName = `${colors.labelPrefix || ''}${unitDef.name.split(' ')[0]}`;
  const badge = createBadgeSprite(
    displayName,
    icon,
    `${unitDef.stats.maxHp}`,
    1.0,
    colors.isHostile,
    false
  );
  badge.position.set(0, 2.55 * s, 0);
  badge.name = 'unitBadge';
  group.add(badge);
  group.userData.unitBadge = badge;

  // High-contrast PBR unit materials with >= 0.25 roughness separation
  const armorMat = new THREE.MeshStandardMaterial({
    color: colors.primary,
    map: unitArmorMaps.map,
    normalMap: unitArmorMaps.normalMap,
    normalScale: new THREE.Vector2(1.0, 1.0),
    roughnessMap: unitArmorMaps.roughnessMap || null,
    roughness: 0.46,
    metalness: 0.72,
  });
  const chainmailMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    map: unitChainmailMaps.map,
    normalMap: unitChainmailMaps.normalMap,
    normalScale: new THREE.Vector2(1.1, 1.1),
    roughnessMap: unitChainmailMaps.roughnessMap || null,
    roughness: 0.44,
    metalness: 0.84,
  });
  const fleshMat = new THREE.MeshStandardMaterial({ color: 0xf7cbb8, roughness: 0.76, metalness: 0.02 });
  const steelMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    map: unitArmorMaps.map,
    normalMap: unitArmorMaps.normalMap,
    normalScale: new THREE.Vector2(0.95, 0.95),
    roughnessMap: unitArmorMaps.roughnessMap || null,
    roughness: 0.34,
    metalness: 0.92,
  });
  const damascusBladeMat = new THREE.MeshStandardMaterial({
    color: 0xf1f5f9,
    map: unitDamascusMaps.map,
    normalMap: unitDamascusMaps.normalMap,
    normalScale: new THREE.Vector2(0.9, 0.9),
    roughnessMap: unitDamascusMaps.roughnessMap || null,
    roughness: 0.26,
    metalness: 0.95,
  });
  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    map: unitClothMaps.map,
    normalMap: unitClothMaps.normalMap,
    roughnessMap: unitClothMaps.roughnessMap || null,
    roughness: 0.92,
  });
  const leatherMat = new THREE.MeshStandardMaterial({
    color: 0x6b3e1b,
    map: resLeatherMaps.map,
    normalMap: resLeatherMaps.normalMap,
    roughnessMap: resLeatherMaps.roughnessMap || null,
    roughness: 0.82,
  });
  const goldTrimMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    map: unitGoldFiligreeMaps.map,
    normalMap: unitGoldFiligreeMaps.normalMap,
    normalScale: new THREE.Vector2(0.95, 0.95),
    roughnessMap: unitGoldFiligreeMaps.roughnessMap || null,
    roughness: 0.24,
    metalness: 0.9,
  });
  const hullOakMat = new THREE.MeshStandardMaterial({
    color: 0xb47b47,
    map: unitOakHullMaps.map,
    normalMap: unitOakHullMaps.normalMap,
    normalScale: new THREE.Vector2(1.05, 1.05),
    roughnessMap: unitOakHullMaps.roughnessMap || null,
    roughness: 0.84,
  });

  const bodyPivot = new THREE.Group();
  bodyPivot.position.y = 0.36;
  group.add(bodyPivot);

  const rightArmPivot = new THREE.Group();
  const leftArmPivot = new THREE.Group();
  const animParts: UnitAnimParts = {
    bodyPivot,
    rightArmPivot,
    leftArmPivot,
    veteranHalo,
    buffRing,
    hitMaterials: [armorMat, fleshMat, darkMat, leatherMat],
  };

  // Hip-pivoted + knee-articulated biped legs with knee poleyn guards
  const addBipedLegs = (legMat: THREE.Material, bootMat: THREE.Material = leatherMat, armoredKnees = false) => {
    const makeLeg = (hipX: number) => {
      const hipPivot = new THREE.Group();
      hipPivot.position.set(hipX, 0.36, 0);
      const thigh = new THREE.Mesh(unitThighGeo, legMat);
      thigh.position.y = -0.095;
      thigh.castShadow = true;

      const kneePivot = new THREE.Group();
      kneePivot.position.set(0, -0.175, 0);
      if (armoredKnees) {
        const poleyn = new THREE.Mesh(unitPoleynGeo, steelMat);
        poleyn.position.set(0, 0.015, 0.045);
        kneePivot.add(poleyn);
      }
      const shin = new THREE.Mesh(unitShinGeo, bootMat);
      shin.position.y = -0.075;
      const boot = new THREE.Mesh(unitBootGeo, bootMat);
      boot.position.set(0, -0.145, 0.042);
      kneePivot.add(shin, boot);

      hipPivot.add(thigh, kneePivot);
      group.add(hipPivot);
      return { hipPivot, kneePivot };
    };
    const left = makeLeg(-0.115);
    const right = makeLeg(0.115);
    animParts.leftLeg = left.hipPivot;
    animParts.rightLeg = right.hipPivot;
    animParts.leftKnee = left.kneePivot;
    animParts.rightKnee = right.kneePivot;
  };

  const mType = unitDef.visual.modelType;

  if (mType === 'villager') {
    const isSpiritHarvester = unitId === 'anime_spirit_harvester';
    const isGoblinSapper = unitId === 'fantasy_goblin_sapper';
    const skinMat = isGoblinSapper
      ? new THREE.MeshStandardMaterial({ color: 0x84cc16, roughness: 0.72 })
      : fleshMat;
    if (isGoblinSapper) animParts.hitMaterials.push(skinMat);

    addBipedLegs(darkMat, isSpiritHarvester ? darkMat : leatherMat);

    const tunicMat = new THREE.MeshStandardMaterial({
      color: isSpiritHarvester ? 0xf472b6 : isGoblinSapper ? 0x3f6212 : unitDef.visual.color,
      map: unitClothMaps.map,
      normalMap: unitClothMaps.normalMap,
      normalScale: new THREE.Vector2(0.75, 0.75),
      roughnessMap: unitClothMaps.roughnessMap || null,
      roughness: 0.86,
    });
    animParts.hitMaterials.push(tunicMat);

    const torso = new THREE.Mesh(unitTunicGeo, tunicMat);
    torso.castShadow = true;
    bodyPivot.add(torso);

    // Waist belt + buckle/obi
    const belt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.21, 0.215, isSpiritHarvester ? 0.13 : 0.085, 12),
      isSpiritHarvester ? goldTrimMat : leatherMat
    );
    belt.position.y = 0.22;
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.085, 0.055), goldTrimMat);
    buckle.position.set(0, 0.22, 0.205);
    bodyPivot.add(belt, buckle);

    const head = new THREE.Mesh(unitHeadGeo, skinMat);
    head.position.y = 0.76;
    head.castShadow = true;
    bodyPivot.add(head);

    if (isSpiritHarvester) {
      // Japanese Shrine Spirit Gatherer: Kitsune side-mask + twin hair buns + Ofuda charm pack + Kama sickle
      const hairMat = new THREE.MeshStandardMaterial({ color: 0x312e81, roughness: 0.65 });
      const crown = new THREE.Mesh(new THREE.SphereGeometry(0.195, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.56), hairMat);
      crown.position.y = 0.77;
      const maskPlate = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.18, 4), new THREE.MeshStandardMaterial({ color: 0xfef2f2, roughness: 0.38 }));
      maskPlate.rotation.set(-0.3, 0, -0.45);
      maskPlate.position.set(0.14, 0.88, 0.11);
      const ofuda = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.02), new THREE.MeshBasicMaterial({ color: 0xfef08a }));
      ofuda.position.set(-0.14, 0.84, 0.14);
      ofuda.rotation.z = 0.18;
      bodyPivot.add(crown, maskPlate, ofuda);

      const charmPack = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.14, 0.34, 8), armorMat);
      charmPack.position.set(0, 0.34, -0.26);
      bodyPivot.add(charmPack);
    } else if (isGoblinSapper) {
      // Goblin Sapper: Pointed goblin ears, brass goggles, explosive barrel backpack
      [-1, 1].forEach((dir) => {
        const ear = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.22, 5), skinMat);
        ear.rotation.z = -dir * 1.15;
        ear.position.set(dir * 0.24, 0.78, 0);
        bodyPivot.add(ear);
      });
      const strap = new THREE.Mesh(new THREE.CylinderGeometry(0.198, 0.198, 0.06, 12), leatherMat);
      strap.position.y = 0.82;
      bodyPivot.add(strap);
      [-0.07, 0.07].forEach((gx) => {
        const goggleRim = new THREE.Mesh(new THREE.TorusGeometry(0.048, 0.014, 6, 12), goldTrimMat);
        goggleRim.position.set(gx, 0.83, 0.185);
        const lens = new THREE.Mesh(new THREE.CircleGeometry(0.042, 10), new THREE.MeshBasicMaterial({ color: 0x38bdf8 }));
        lens.position.set(gx, 0.83, 0.19);
        bodyPivot.add(goggleRim, lens);
      });
      // Red gunpowder keg backpack with iron hoops
      const kegMat = new THREE.MeshStandardMaterial({ color: 0xb91c1c, map: unitOakHullMaps.map, roughness: 0.7 });
      const keg = new THREE.Mesh(new THREE.CylinderGeometry(0.165, 0.165, 0.38, 12), kegMat);
      keg.position.set(0, 0.36, -0.27);
      const hoop1 = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.015, 6, 12), steelMat);
      hoop1.rotation.x = Math.PI / 2;
      hoop1.position.set(0, 0.46, -0.27);
      const hoop2 = hoop1.clone();
      hoop2.position.y = 0.26;
      bodyPivot.add(keg, hoop1, hoop2);
    } else {
      // Classic Medieval Craftsman Villager
      const hat = new THREE.Mesh(
        unitStrawHatGeo,
        new THREE.MeshStandardMaterial({ color: 0xd97706, map: unitClothMaps.map, roughness: 0.86 })
      );
      hat.position.y = 0.87;
      hat.castShadow = true;
      const pack = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.15, 0.38, 10), leatherMat);
      pack.position.set(0, 0.34, -0.27);
      bodyPivot.add(hat, pack);
    }

    const carryBundle = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.22, 0),
      new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.55 })
    );
    carryBundle.position.set(0, 0.64, -0.3);
    carryBundle.visible = false;
    bodyPivot.add(carryBundle);
    animParts.carryBundle = carryBundle;

    // Articulated arms + Role-specific Tool (Axe / Harvest Sickle / Mining Pick)
    rightArmPivot.position.set(0.27, 0.5, 0.02);
    bodyPivot.add(rightArmPivot);
    const rArm = new THREE.Mesh(unitArmSegmentGeo, skinMat);
    rArm.position.set(0, -0.14, 0.05);
    const rHand = new THREE.Mesh(unitHandGeo, skinMat);
    rHand.position.set(0, -0.26, 0.11);
    const toolHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.034, 0.74, 8), hullOakMat);
    toolHandle.position.set(0.02, -0.14, 0.3);
    toolHandle.rotation.x = Math.PI / 3;
    rightArmPivot.add(rArm, rHand, toolHandle);

    if (isGoblinSapper) {
      const pickCurve = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.024, 6, 10, Math.PI * 0.85), damascusBladeMat);
      pickCurve.rotation.set(Math.PI / 2, Math.PI / 2, 0.3);
      pickCurve.position.set(0.02, 0.04, 0.52);
      rightArmPivot.add(pickCurve);
    } else if (isSpiritHarvester) {
      const sickle = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.022, 6, 10, Math.PI * 1.1), damascusBladeMat);
      sickle.rotation.y = Math.PI / 2;
      sickle.position.set(0.02, 0.02, 0.56);
      rightArmPivot.add(sickle);
    } else {
      const axeBlade = new THREE.Mesh(new THREE.ConeGeometry(0.115, 0.25, 4), damascusBladeMat);
      axeBlade.rotation.x = Math.PI / 2;
      axeBlade.scale.set(0.32, 1, 1);
      axeBlade.position.set(0.02, 0.02, 0.54);
      const hammerPoll = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.11, 0.12), steelMat);
      hammerPoll.position.set(0.02, 0.03, 0.43);
      rightArmPivot.add(axeBlade, hammerPoll);
    }

    leftArmPivot.position.set(-0.27, 0.5, 0.02);
    bodyPivot.add(leftArmPivot);
    const lArm = new THREE.Mesh(unitArmSegmentGeo, skinMat);
    lArm.position.set(0, -0.14, 0.04);
    const lHand = new THREE.Mesh(unitHandGeo, skinMat);
    lHand.position.set(0, -0.26, 0.09);
    leftArmPivot.add(lArm, lHand);
  } else if (mType === 'swordsman') {
    const isShinigami = unitId === 'anime_katana_shinigami';

    if (isShinigami) {
      // Soul Reaper / Samurai Katana Master (Hakama + Haori + Kabuto/Horns + Dual Scabbard + Curved Nodachi)
      const robeDarkMat = new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        map: unitClothMaps.map,
        normalMap: unitClothMaps.normalMap,
        roughness: 0.88,
      });
      const crimsonSashMat = new THREE.MeshStandardMaterial({
        color: colors.isHostile ? 0xdc2626 : 0x0284c7,
        map: unitClothMaps.map,
        roughness: 0.72,
      });
      animParts.hitMaterials.push(robeDarkMat, crimsonSashMat);

      addBipedLegs(robeDarkMat, darkMat, false);

      const torso = new THREE.Mesh(unitTunicGeo, robeDarkMat);
      torso.scale.set(1.06, 1.04, 1.02);
      torso.castShadow = true;
      const obiSash = new THREE.Mesh(new THREE.CylinderGeometry(0.225, 0.23, 0.12, 12), crimsonSashMat);
      obiSash.position.y = 0.22;
      const haoriCape = new THREE.Mesh(unitCapeGeo, robeDarkMat);
      haoriCape.position.set(0, 0.26, -0.22);
      haoriCape.rotation.x = 0.2;
      bodyPivot.add(torso, obiSash, haoriCape);

      // Samurai Layered Shoulder Sode Guards
      [-1, 1].forEach((dir) => {
        const sode = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.22, 0.22), armorMat);
        sode.position.set(dir * 0.27, 0.52, 0);
        sode.rotation.z = -dir * 0.25;
        bodyPivot.add(sode);
      });

      // Head + Demon/Samurai Kabuto Mask & Sweeping Crescent Crest
      const head = new THREE.Mesh(unitHeadGeo, fleshMat);
      head.position.y = 0.77;
      const kabuto = new THREE.Mesh(unitHelmGeo, robeDarkMat);
      kabuto.position.y = 0.8;
      kabuto.scale.set(1.12, 0.96, 1.12);
      const shikoro = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.16, 10, 1, true, Math.PI * 0.65, Math.PI * 1.7), armorMat);
      shikoro.material.side = THREE.DoubleSide;
      shikoro.position.set(0, 0.76, -0.02);
      const halfMask = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.18, 0.13, 12), steelMat);
      halfMask.position.y = 0.72;
      // Sweeping Kuwagata Crescent Horns
      const hornShape = new THREE.TorusGeometry(0.18, 0.024, 6, 12, Math.PI * 0.9);
      const crescent = new THREE.Mesh(hornShape, goldTrimMat);
      crescent.rotation.z = -Math.PI * 0.95;
      crescent.position.set(0, 1.06, 0.18);
      bodyPivot.add(head, kabuto, shikoro, halfMask, crescent);

      // Left Hand gripping Black Scabbard (Saya)
      leftArmPivot.position.set(-0.3, 0.5, 0.04);
      bodyPivot.add(leftArmPivot);
      const lArm = new THREE.Mesh(unitArmSegmentGeo, robeDarkMat);
      lArm.position.set(0, -0.14, 0.04);
      const scabbard = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.026, 0.92, 8), robeDarkMat);
      scabbard.rotation.x = Math.PI / 2.8;
      scabbard.position.set(-0.04, -0.18, 0.12);
      const scabbardTip = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.028, 0.08, 8), goldTrimMat);
      scabbardTip.rotation.x = Math.PI / 2.8;
      scabbardTip.position.set(-0.04, -0.34, -0.26);
      leftArmPivot.add(lArm, scabbard, scabbardTip);

      // Right Arm wielding Curved Black-Gold Tachi/Nodachi
      rightArmPivot.position.set(0.3, 0.5, 0.04);
      bodyPivot.add(rightArmPivot);
      const rArm = new THREE.Mesh(unitArmSegmentGeo, robeDarkMat);
      rArm.position.set(0, -0.14, 0.04);
      const tsuba = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.024, 12), goldTrimMat);
      tsuba.rotation.x = Math.PI / 3.4;
      tsuba.position.set(0.02, -0.14, 0.22);
      const katanaBlade = new THREE.Mesh(unitKatanaGeo, damascusBladeMat);
      katanaBlade.position.set(0.02, -0.14, 0.22);
      katanaBlade.rotation.x = Math.PI / 3.4;
      rightArmPivot.add(rArm, tsuba, katanaBlade);
    } else {
      // Heavy Plate Man-at-Arms Swordsman
      addBipedLegs(chainmailMat, steelMat, true);

      const chainSkirt = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.27, 0.22, 12), chainmailMat);
      chainSkirt.position.y = 0.08;
      const torso = new THREE.Mesh(unitBreastplateGeo, armorMat);
      torso.castShadow = true;
      const waistBelt = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.225, 0.08, 12), leatherMat);
      waistBelt.position.y = 0.2;
      bodyPivot.add(chainSkirt, torso, waistBelt);

      // Layered Shoulder Pauldrons with Gold Trim + Flowing Beveled Heraldic Cape
      const paulL = new THREE.Mesh(unitPauldronGeo, steelMat);
      paulL.position.set(-0.27, 0.55, 0);
      paulL.rotation.z = 0.3;
      const paulR = new THREE.Mesh(unitPauldronGeo, steelMat);
      paulR.position.set(0.27, 0.55, 0);
      paulR.rotation.z = -0.3;
      const cape = new THREE.Mesh(unitCapeGeo, armorMat);
      cape.position.set(0, 0.28, -0.24);
      cape.rotation.x = 0.22;
      bodyPivot.add(paulL, paulR, cape);

      // Visored Sallet Helmet + Recessed Slit + Nasal Bar + Crest
      const helm = new THREE.Mesh(unitHelmGeo, steelMat);
      helm.position.y = 0.78;
      helm.castShadow = true;
      const aventail = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.25, 0.14, 12), chainmailMat);
      aventail.position.y = 0.67;
      const visor = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.045, 0.085), darkMat);
      visor.position.set(0, 0.82, 0.185);
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.042, 0.11), steelMat);
      brow.position.set(0, 0.865, 0.185);
      const crest = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.15, 0.34), goldTrimMat);
      crest.position.set(0, 1.07, -0.02);
      bodyPivot.add(helm, aventail, visor, brow, crest);

      // Left Arm + Beveled Heater Shield with Steel Rim & Gold Boss
      leftArmPivot.position.set(-0.31, 0.5, 0.04);
      bodyPivot.add(leftArmPivot);
      const lArm = new THREE.Mesh(unitArmSegmentGeo, chainmailMat);
      lArm.position.set(0, -0.14, 0.04);
      const shield = new THREE.Mesh(unitHeaterShieldGeo, armorMat);
      shield.rotation.y = -Math.PI / 2.4;
      shield.position.set(-0.1, -0.06, 0.14);
      const boss = new THREE.Mesh(new THREE.SphereGeometry(0.078, 10, 8), goldTrimMat);
      boss.position.set(-0.145, -0.05, 0.16);
      leftArmPivot.add(lArm, shield, boss);

      // Right Arm + Sculpted Damascus Broadsword + Pommel
      rightArmPivot.position.set(0.31, 0.5, 0.04);
      bodyPivot.add(rightArmPivot);
      const rArm = new THREE.Mesh(unitArmSegmentGeo, chainmailMat);
      rArm.position.set(0, -0.14, 0.04);
      const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.2, 6), leatherMat);
      hilt.position.set(0.02, -0.18, 0.14);
      hilt.rotation.x = Math.PI / 4;
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.042, 0.06), goldTrimMat);
      guard.position.set(0.02, -0.1, 0.22);
      guard.rotation.x = Math.PI / 4;
      const blade = new THREE.Mesh(unitBroadswordGeo, damascusBladeMat);
      blade.position.set(0.02, -0.08, 0.24);
      blade.rotation.x = Math.PI / 4;
      rightArmPivot.add(rArm, hilt, guard, blade);
    }
  } else if (mType === 'archer') {
    addBipedLegs(darkMat, leatherMat, false);

    const jerkinMat = new THREE.MeshStandardMaterial({
      color: unitDef.visual.color,
      map: unitClothMaps.map,
      normalMap: unitClothMaps.normalMap,
      roughnessMap: unitClothMaps.roughnessMap || null,
      roughness: 0.78,
    });
    animParts.hitMaterials.push(jerkinMat);

    const torso = new THREE.Mesh(unitTunicGeo, jerkinMat);
    torso.scale.set(0.94, 1, 0.94);
    torso.castShadow = true;
    const chestStrap = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.6, 0.44), leatherMat);
    chestStrap.position.set(0, 0.34, 0);
    chestStrap.rotation.z = 0.52;
    bodyPivot.add(torso, chestStrap);

    const head = new THREE.Mesh(unitHeadGeo, fleshMat);
    head.position.y = 0.76;
    const hoodMat = new THREE.MeshStandardMaterial({
      color: 0x166534,
      map: unitClothMaps.map,
      normalMap: unitClothMaps.normalMap,
      roughness: 0.82,
    });
    const hood = new THREE.Mesh(new THREE.ConeGeometry(0.265, 0.38, 12), hoodMat);
    hood.position.set(0, 0.92, -0.02);
    hood.rotation.x = -0.16;
    const cloak = new THREE.Mesh(unitCapeGeo, hoodMat);
    cloak.position.set(0, 0.28, -0.22);
    cloak.rotation.x = 0.24;
    bodyPivot.add(head, hood, cloak);

    // Leather Quiver with 4 feathered arrows
    const quiver = new THREE.Mesh(new THREE.CylinderGeometry(0.098, 0.075, 0.54, 10), leatherMat);
    quiver.position.set(-0.16, 0.38, -0.24);
    quiver.rotation.z = 0.32;
    bodyPivot.add(quiver);
    [-0.035, -0.012, 0.012, 0.035].forEach((ax, i) => {
      const fletch = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.13, 4), goldTrimMat);
      fletch.position.set(-0.24 + ax, 0.67 + (i % 2) * 0.02, -0.24);
      fletch.rotation.z = 0.32;
      bodyPivot.add(fletch);
    });

    // Left Arm + Recurved Composite Bow + Bowstring + Nocked Arrow
    leftArmPivot.position.set(-0.27, 0.48, 0.1);
    bodyPivot.add(leftArmPivot);
    const lArm = new THREE.Mesh(unitArmSegmentGeo, leatherMat);
    lArm.position.set(0, -0.1, 0.12);
    lArm.rotation.x = -0.8;
    const bow = new THREE.Mesh(unitBowGeo, hullOakMat);
    bow.position.set(0.06, -0.02, 0.28);
    const bowTips1 = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.09, 6), goldTrimMat);
    bowTips1.position.set(0.06, 0.44, 0.14);
    const bowTips2 = bowTips1.clone();
    bowTips2.position.y = -0.46;
    bowTips2.rotation.x = Math.PI;
    const stringMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.86, 4), steelMat);
    stringMesh.position.set(0.06, -0.02, 0.14);
    const nockedArrow = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.62, 5), hullOakMat);
    nockedArrow.rotation.x = Math.PI / 2;
    nockedArrow.position.set(0.06, 0.01, 0.34);
    const arrowTip = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.09, 4), damascusBladeMat);
    arrowTip.rotation.x = Math.PI / 2;
    arrowTip.position.set(0.06, 0.01, 0.68);
    leftArmPivot.add(lArm, bow, bowTips1, bowTips2, stringMesh, nockedArrow, arrowTip);

    rightArmPivot.position.set(0.27, 0.48, 0.04);
    bodyPivot.add(rightArmPivot);
    const rArm = new THREE.Mesh(unitArmSegmentGeo, jerkinMat);
    rArm.position.set(0, -0.14, 0.06);
    const rHand = new THREE.Mesh(unitHandGeo, fleshMat);
    rHand.position.set(0, -0.25, 0.1);
    rightArmPivot.add(rArm, rHand);
  } else if (mType === 'knight') {
    const isScout = unitId === 'scout_rider';
    const isPaladin = unitId === 'fantasy_paladin';
    bodyPivot.position.y = 0.0;

    const horseMat = new THREE.MeshStandardMaterial({
      color: isPaladin ? 0xf8fafc : isScout ? 0x8b5a2b : 0x5c2b10,
      map: resFurMaps.map,
      normalMap: resFurMaps.normalMap,
      normalScale: new THREE.Vector2(0.65, 0.65),
      roughnessMap: resFurMaps.roughnessMap || null,
      roughness: 0.6,
    });
    const maneMat = new THREE.MeshStandardMaterial({
      color: isPaladin ? 0xfef3c7 : isScout ? 0x292524 : 0x1e1b18,
      roughness: 0.86,
    });
    animParts.hitMaterials.push(horseMat);

    // Sculpted Warhorse Torso + Caparison Barding
    const horseBody = new THREE.Mesh(horseBarrelGeo, horseMat);
    horseBody.position.set(0, 0.88, 0);
    horseBody.castShadow = true;
    bodyPivot.add(horseBody);

    if (!isScout) {
      const caparisonMat = isPaladin ? goldTrimMat : armorMat;
      const barding = new THREE.Mesh(new THREE.CylinderGeometry(0.355, 0.41, 0.72, 14), caparisonMat);
      barding.rotation.x = Math.PI / 2;
      barding.position.set(0, 0.86, 0.02);
      const peytral = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), isPaladin ? steelMat : chainmailMat);
      peytral.rotation.x = Math.PI / 2;
      peytral.position.set(0, 0.88, 0.44);
      bodyPivot.add(barding, peytral);
    } else {
      const saddleCloth = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.14, 0.58), armorMat);
      saddleCloth.position.set(0, 1.12, -0.04);
      // Rolled bedroll & leather saddlebags
      const bedroll = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.52, 8), leatherMat);
      bedroll.rotation.z = Math.PI / 2;
      bedroll.position.set(0, 1.24, -0.32);
      bodyPivot.add(saddleCloth, bedroll);
    }

    const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.12, 0.46), leatherMat);
    saddle.position.set(0, 1.2, -0.04);
    const tail = new THREE.Mesh(horseTailGeo, maneMat);
    tail.position.set(0, 0.98, -0.66);
    bodyPivot.add(saddle, tail);
    animParts.horseTail = tail;

    // 4 Articulated Equine Legs with knee/hock pivots
    const makeHorseLegPair = (zPos: number, pivotY: number) => {
      const pairPivot = new THREE.Group();
      pairPivot.position.set(0, pivotY, zPos);
      const kneePairPivot = new THREE.Group();
      kneePairPivot.position.set(0, -0.31, 0);
      [-0.18, 0.18].forEach((lx) => {
        const up = new THREE.Mesh(horseLegUpperGeo, horseMat);
        up.position.set(lx, -0.155, 0);
        up.castShadow = true;
        pairPivot.add(up);

        const low = new THREE.Mesh(horseLegLowerGeo, horseMat);
        low.position.set(lx, -0.13, 0.02);
        const hoof = new THREE.Mesh(horseHoofGeo, maneMat);
        hoof.position.set(lx, -0.275, 0.03);
        kneePairPivot.add(low, hoof);
      });
      pairPivot.add(kneePairPivot);
      group.add(pairPivot);
      return { pairPivot, kneePairPivot };
    };
    const frontPair = makeHorseLegPair(0.44, 0.62);
    const hindPair = makeHorseLegPair(-0.44, 0.62);
    animParts.leftLeg = frontPair.pairPivot;
    animParts.leftKnee = frontPair.kneePairPivot;
    animParts.rightLeg = hindPair.pairPivot;
    animParts.rightKnee = hindPair.kneePairPivot;

    // Pivoting Arched Horse Neck + Head + Muzzle + Ears + Chamfron
    const horseHeadPivot = new THREE.Group();
    horseHeadPivot.position.set(0, 1.0, 0.52);
    bodyPivot.add(horseHeadPivot);
    animParts.horseHead = horseHeadPivot;

    const hNeck = new THREE.Mesh(horseNeckGeo, horseMat);
    hNeck.rotation.x = 0.48;
    hNeck.castShadow = true;
    const hHead = new THREE.Mesh(horseMuzzleGeo, horseMat);
    hHead.position.set(0, 0.44, 0.25);
    hHead.rotation.x = 0.48;
    const mane = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.48, 0.14), maneMat);
    mane.position.set(0, 0.26, 0.02);
    mane.rotation.x = 0.48;
    horseHeadPivot.add(hNeck, hHead, mane);
    if (!isScout) {
      const chamfron = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.09, 0.3), isPaladin ? goldTrimMat : steelMat);
      chamfron.position.set(0, 0.51, 0.3);
      chamfron.rotation.x = 0.48;
      horseHeadPivot.add(chamfron);
    }

    [-0.08, 0.08].forEach((ez) => {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.14, 5), horseMat);
      ear.position.set(ez, 0.58, 0.16);
      horseHeadPivot.add(ear);
    });

    if (isScout) {
      // Light Hooded Scout Rider with Cloak, Brass Spyglass & Pennon Spear
      const rider = new THREE.Mesh(unitTunicGeo, leatherMat);
      rider.position.set(0, 1.18, -0.04);
      rider.castShadow = true;
      const cloak = new THREE.Mesh(unitCapeGeo, armorMat);
      cloak.position.set(0, 1.46, -0.22);
      cloak.rotation.x = 0.28;
      const head = new THREE.Mesh(unitHeadGeo, fleshMat);
      head.position.set(0, 1.88, -0.02);
      const hood = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.36, 9), armorMat);
      hood.position.set(0, 2.02, -0.05);
      hood.rotation.x = -0.22;
      const feather = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.28, 5), goldTrimMat);
      feather.position.set(0.14, 2.15, -0.06);
      feather.rotation.z = -0.35;
      bodyPivot.add(rider, cloak, head, hood, feather);

      leftArmPivot.position.set(-0.28, 1.64, 0.06);
      bodyPivot.add(leftArmPivot);
      const spyglass = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.032, 0.36, 8), goldTrimMat);
      spyglass.rotation.x = Math.PI / 2.2;
      spyglass.position.set(0, -0.06, 0.22);
      leftArmPivot.add(spyglass);

      rightArmPivot.position.set(0.3, 1.64, 0.04);
      bodyPivot.add(rightArmPivot);
      const scoutSpear = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.035, 1.75, 8), hullOakMat);
      scoutSpear.rotation.x = Math.PI / 6;
      scoutSpear.position.set(0.04, 0.25, 0.3);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.26, 5), damascusBladeMat);
      tip.rotation.x = Math.PI / 6;
      tip.position.set(0.04, 1.04, 0.75);
      const pennon = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.22, 0.44), armorMat);
      pennon.position.set(0.04, 0.78, 0.8);
      rightArmPivot.add(scoutSpear, tip, pennon);
    } else if (isPaladin) {
      // Fantasy Holy Paladin: White-Gold Armor, Winged Helm, Sun Shield & Radiant Warhammer
      const paladinPlateMat = new THREE.MeshStandardMaterial({
        color: 0xf8fafc,
        map: unitArmorMaps.map,
        normalMap: unitArmorMaps.normalMap,
        roughnessMap: unitArmorMaps.roughnessMap || null,
        roughness: 0.26,
        metalness: 0.86,
      });
      animParts.hitMaterials.push(paladinPlateMat);

      const rider = new THREE.Mesh(unitBreastplateGeo, paladinPlateMat);
      rider.position.set(0, 1.18, -0.04);
      rider.castShadow = true;
      const holyCape = new THREE.Mesh(unitCapeGeo, armorMat);
      holyCape.position.set(0, 1.44, -0.26);
      holyCape.rotation.x = 0.25;
      bodyPivot.add(rider, holyCape);

      const rPaulL = new THREE.Mesh(unitPauldronGeo, goldTrimMat);
      rPaulL.position.set(-0.27, 1.73, -0.04);
      const rPaulR = new THREE.Mesh(unitPauldronGeo, goldTrimMat);
      rPaulR.position.set(0.27, 1.73, -0.04);
      const helm = new THREE.Mesh(unitHelmGeo, paladinPlateMat);
      helm.position.set(0, 1.88, -0.04);
      // Sweeping Winged Paladin Helm Crests
      [-1, 1].forEach((dir) => {
        const wing = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.34, 4), goldTrimMat);
        wing.scale.set(0.35, 1, 1);
        wing.position.set(dir * 0.22, 2.08, -0.06);
        wing.rotation.z = -dir * 0.65;
        wing.rotation.x = -0.35;
        bodyPivot.add(wing);
      });
      bodyPivot.add(rPaulL, rPaulR, helm);

      leftArmPivot.position.set(-0.3, 1.66, 0.04);
      bodyPivot.add(leftArmPivot);
      const shield = new THREE.Mesh(unitHeaterShieldGeo, paladinPlateMat);
      shield.rotation.y = -Math.PI / 2.2;
      shield.position.set(-0.08, -0.08, 0.12);
      const sunBoss = new THREE.Mesh(new THREE.OctahedronGeometry(0.09, 0), goldTrimMat);
      sunBoss.position.set(-0.14, -0.08, 0.14);
      leftArmPivot.add(shield, sunBoss);

      // Radiant Light Warhammer
      rightArmPivot.position.set(0.32, 1.66, 0.06);
      bodyPivot.add(rightArmPivot);
      const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.04, 1.25, 8), hullOakMat);
      haft.rotation.x = Math.PI / 4;
      haft.position.set(0.04, 0.08, 0.34);
      const hammerHead = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.42), goldTrimMat);
      hammerHead.rotation.x = Math.PI / 4;
      hammerHead.position.set(0.04, 0.46, 0.72);
      const lightCore = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), new THREE.MeshBasicMaterial({ color: 0xfef08a }));
      lightCore.position.set(0.04, 0.46, 0.72);
      rightArmPivot.add(haft, hammerHead, lightCore);
    } else {
      // Heavy Armored Royal Knight with Great-Helm, Plume, Vamplate Lance & Heater Shield
      const rider = new THREE.Mesh(unitBreastplateGeo, armorMat);
      rider.position.set(0, 1.18, -0.04);
      rider.castShadow = true;
      const knightCape = new THREE.Mesh(unitCapeGeo, armorMat);
      knightCape.position.set(0, 1.44, -0.26);
      knightCape.rotation.x = 0.25;
      bodyPivot.add(rider, knightCape);

      const rPaulL = new THREE.Mesh(unitPauldronGeo, steelMat);
      rPaulL.position.set(-0.27, 1.72, -0.04);
      const rPaulR = new THREE.Mesh(unitPauldronGeo, steelMat);
      rPaulR.position.set(0.27, 1.72, -0.04);
      const helm = new THREE.Mesh(unitHelmGeo, steelMat);
      helm.position.set(0, 1.88, -0.04);
      const visorSlit = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.08), darkMat);
      visorSlit.position.set(0, 1.94, 0.14);
      const plume = new THREE.Mesh(new THREE.ConeGeometry(0.095, 0.36, 7), goldTrimMat);
      plume.rotation.x = -0.82;
      plume.position.set(0, 2.22, -0.14);
      bodyPivot.add(rPaulL, rPaulR, helm, visorSlit, plume);

      leftArmPivot.position.set(-0.3, 1.66, 0.04);
      bodyPivot.add(leftArmPivot);
      const shield = new THREE.Mesh(unitHeaterShieldGeo, armorMat);
      shield.rotation.y = -Math.PI / 2.2;
      shield.position.set(-0.08, -0.08, 0.12);
      const sBoss = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 8), goldTrimMat);
      sBoss.position.set(-0.13, -0.08, 0.14);
      leftArmPivot.add(shield, sBoss);

      rightArmPivot.position.set(0.32, 1.66, 0.06);
      bodyPivot.add(rightArmPivot);
      const lanceShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.056, 2.1, 10), hullOakMat);
      lanceShaft.rotation.x = Math.PI / 2.25;
      lanceShaft.position.set(0.05, 0.02, 0.62);
      const vamplate = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.16, 10), steelMat);
      vamplate.rotation.x = -Math.PI / 2.25;
      vamplate.position.set(0.05, -0.04, 0.25);
      const lanceTip = new THREE.Mesh(new THREE.ConeGeometry(0.068, 0.38, 6), damascusBladeMat);
      lanceTip.rotation.x = Math.PI / 2.25;
      lanceTip.position.set(0.05, 0.18, 1.68);
      const pennant = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.18, 0.44), goldTrimMat);
      pennant.position.set(0.05, 0.11, 1.32);
      rightArmPivot.add(lanceShaft, vamplate, lanceTip, pennant);
    }
  } else if (mType === 'ninja') {
    addBipedLegs(darkMat, darkMat, false);

    const torso = new THREE.Mesh(unitTunicGeo, chainmailMat);
    torso.scale.set(0.92, 1, 0.9);
    torso.castShadow = true;
    const shinobiVest = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.44, 0.34), darkMat);
    shinobiVest.position.y = 0.36;
    bodyPivot.add(torso, shinobiVest);

    // Shinobi Flowing Scarf Collar + Trailing Tail + Diagonal Katana Sheath
    const scarfMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      map: unitClothMaps.map,
      roughness: 0.72,
    });
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.185, 0.058, 8, 14), scarfMat);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 0.6;
    const scarfTail = new THREE.Mesh(
      makeTubeGeo([
        [0, 0.56, -0.18],
        [0.09, 0.45, -0.46],
        [-0.06, 0.36, -0.72],
      ], 0.052, 10, 6),
      scarfMat
    );
    const katanaSaya = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.88, 8), leatherMat);
    katanaSaya.position.set(0.02, 0.42, -0.2);
    katanaSaya.rotation.z = 0.68;
    const hiltWrap = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.22, 6), goldTrimMat);
    hiltWrap.position.set(-0.27, 0.72, -0.2);
    hiltWrap.rotation.z = 0.68;
    bodyPivot.add(collar, scarfTail, katanaSaya, hiltWrap);

    const head = new THREE.Mesh(unitHeadGeo, fleshMat);
    head.position.y = 0.76;
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.78 });
    for (let i = 0; i < 5; i++) {
      const hSpike = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.22, 4), hairMat);
      const ang = (i - 2) * 0.55;
      hSpike.position.set(Math.sin(ang) * 0.14, 0.98, -0.05 - Math.cos(ang) * 0.06);
      hSpike.rotation.x = -0.45;
      hSpike.rotation.z = -ang * 0.4;
      bodyPivot.add(hSpike);
    }
    const mask = new THREE.Mesh(new THREE.CylinderGeometry(0.195, 0.19, 0.16, 12), darkMat);
    mask.position.y = 0.72;
    const headband = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.09, 0.055), steelMat);
    headband.position.set(0, 0.84, 0.185);
    bodyPivot.add(head, mask, headband);

    rightArmPivot.position.set(0.28, 0.48, 0.06);
    bodyPivot.add(rightArmPivot);
    const rArm = new THREE.Mesh(unitArmSegmentGeo, darkMat);
    rArm.position.set(0, -0.14, 0.05);
    const kunai1 = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.36, 4), damascusBladeMat);
    kunai1.position.set(0.02, -0.18, 0.25);
    kunai1.rotation.x = Math.PI / 2;
    const ring1 = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.009, 5, 10), steelMat);
    ring1.position.set(0.02, -0.18, 0.06);
    rightArmPivot.add(rArm, kunai1, ring1);

    leftArmPivot.position.set(-0.28, 0.48, 0.06);
    bodyPivot.add(leftArmPivot);
    const lArm = new THREE.Mesh(unitArmSegmentGeo, darkMat);
    lArm.position.set(0, -0.14, 0.05);
    const kunai2 = kunai1.clone();
    const ring2 = ring1.clone();
    leftArmPivot.add(lArm, kunai2, ring2);
  } else if (mType === 'saiyan') {
    addBipedLegs(darkMat, steelMat, false);

    const giMat = new THREE.MeshStandardMaterial({
      color: 0xea580c,
      map: unitClothMaps.map,
      normalMap: unitClothMaps.normalMap,
      roughnessMap: unitClothMaps.roughnessMap || null,
      roughness: 0.76,
    });
    animParts.hitMaterials.push(giMat);

    const torso = new THREE.Mesh(unitBreastplateGeo, giMat);
    torso.castShadow = true;
    bodyPivot.add(torso);

    // Sculpted Saiyan Battle Armor Pauldrons, Chest Trim & Waist Sash
    const sash = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.225, 0.11, 12), armorMat);
    sash.position.y = 0.2;
    const chestPlate = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.26, 0.3), goldTrimMat);
    chestPlate.position.set(0, 0.42, 0.04);
    const padL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.08, 0.3), goldTrimMat);
    padL.position.set(-0.29, 0.56, 0);
    padL.rotation.z = 0.36;
    const padR = padL.clone();
    padR.position.set(0.29, 0.56, 0);
    padR.rotation.z = -0.36;
    bodyPivot.add(sash, chestPlate, padL, padR);

    const head = new THREE.Mesh(unitHeadGeo, fleshMat);
    head.position.y = 0.76;
    bodyPivot.add(head);

    // Layered Multi-Tier Golden Super Saiyan Spikes
    const hairMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      roughness: 0.2,
      metalness: 0.35,
      emissive: 0x854d0e,
    });
    for (let i = 0; i < 9; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.46, 5), hairMat);
      const angle = (i * Math.PI * 2) / 9;
      const rad = i % 2 === 0 ? 0.165 : 0.085;
      spike.position.set(Math.cos(angle) * rad, 1.0 + (i % 2) * 0.09, Math.sin(angle) * rad);
      spike.rotation.z = -Math.cos(angle) * 0.48;
      spike.rotation.x = Math.sin(angle) * 0.48;
      bodyPivot.add(spike);
    }

    rightArmPivot.position.set(0.3, 0.48, 0.04);
    bodyPivot.add(rightArmPivot);
    const rArm = new THREE.Mesh(unitArmSegmentGeo, fleshMat);
    rArm.position.set(0, -0.14, 0.05);
    const gauntletR = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.062, 0.14, 8), armorMat);
    gauntletR.position.set(0, -0.2, 0.08);
    const fistR = new THREE.Mesh(unitHandGeo, fleshMat);
    fistR.position.set(0, -0.27, 0.12);
    rightArmPivot.add(rArm, gauntletR, fistR);

    leftArmPivot.position.set(-0.3, 0.48, 0.04);
    bodyPivot.add(leftArmPivot);
    const lArm = new THREE.Mesh(unitArmSegmentGeo, fleshMat);
    lArm.position.set(0, -0.14, 0.05);
    const gauntletL = gauntletR.clone();
    const fistL = fistR.clone();
    leftArmPivot.add(lArm, gauntletL, fistL);

    const aura = new THREE.Mesh(
      new THREE.TorusGeometry(0.54, 0.052, 8, 22),
      new THREE.MeshBasicMaterial({ color: 0xfef08a, transparent: true, opacity: 0.82 })
    );
    aura.rotation.x = Math.PI / 2;
    aura.position.y = 0.12;
    group.add(aura);
    animParts.auraMesh = aura;
  } else if (mType === 'mage') {
    addBipedLegs(darkMat, leatherMat, false);
    bodyPivot.position.y = 0.24;
    const robeMat = new THREE.MeshStandardMaterial({
      color: unitDef.visual.color,
      map: unitClothMaps.map,
      normalMap: unitClothMaps.normalMap,
      roughnessMap: unitClothMaps.roughnessMap || null,
      roughness: 0.72,
    });
    animParts.hitMaterials.push(robeMat);

    const robe = new THREE.Mesh(unitMageRobeGeo, robeMat);
    robe.position.y = 0.02;
    robe.scale.set(0.95, 0.94, 0.95);
    robe.castShadow = true;
    bodyPivot.add(robe);
    animParts.robeSkirt = robe;

    // Gold-Filigree Mantle Collar & Stole
    const mantle = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.065, 8, 14, Math.PI * 1.45), goldTrimMat);
    mantle.rotation.set(Math.PI / 2 - 0.35, 0, Math.PI * 0.78);
    mantle.position.set(0, 0.96, -0.06);
    const sash = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.7, 0.065), goldTrimMat);
    sash.position.set(0, 0.44, 0.245);
    sash.rotation.x = -0.14;
    const head = new THREE.Mesh(unitHeadGeo, fleshMat);
    head.position.y = 1.09;
    const beard = new THREE.Mesh(new THREE.ConeGeometry(0.125, 0.3, 7), new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.9 }));
    beard.rotation.x = Math.PI;
    beard.position.set(0, 0.94, 0.14);
    const hat = new THREE.Mesh(
      unitWizardHatGeo,
      new THREE.MeshStandardMaterial({ color: 0x6d28d9, map: unitClothMaps.map, roughness: 0.62 })
    );
    hat.position.y = 1.18;
    hat.castShadow = true;
    const hatBand = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.026, 6, 16), goldTrimMat);
    hatBand.rotation.x = Math.PI / 2;
    hatBand.position.y = 1.24;
    bodyPivot.add(mantle, sash, head, beard, hat, hatBand);

    leftArmPivot.position.set(-0.3, 0.76, 0.06);
    bodyPivot.add(leftArmPivot);
    const lArm = new THREE.Mesh(unitArmSegmentGeo, robeMat);
    lArm.position.set(0, -0.14, 0.05);
    const lHand = new THREE.Mesh(unitHandGeo, fleshMat);
    lHand.position.set(0, -0.26, 0.1);
    const spellTome = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.21, 0.055), goldTrimMat);
    spellTome.position.set(0.02, -0.24, 0.16);
    const tomePages = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.18, 0.06), new THREE.MeshBasicMaterial({ color: 0xfef3c7 }));
    tomePages.position.set(0.02, -0.24, 0.165);
    leftArmPivot.add(lArm, lHand, spellTome, tomePages);

    rightArmPivot.position.set(0.32, 0.78, 0.08);
    bodyPivot.add(rightArmPivot);
    const staff = new THREE.Mesh(unitStaffGeo, hullOakMat);
    staff.position.set(0.02, 0.05, 0.12);
    const cradle = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.024, 6, 14), goldTrimMat);
    cradle.position.set(0.06, 0.79, 0.16);
    const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.145, 0), new THREE.MeshBasicMaterial({ color: 0x38bdf8 }));
    orb.position.set(0.06, 0.85, 0.16);
    rightArmPivot.add(staff, cradle, orb);
    animParts.auraMesh = orb;
  } else if (mType === 'ram') {
    // Era II Armored Timber & Boiled-Hide Battering Ram on 4 Heavy Spoked Wheels
    bodyPivot.position.y = 0.0;
    const timberMat = hullOakMat;
    const ironMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.34, metalness: 0.88 });
    const hideMat = leatherMat;
    const wheels: THREE.Object3D[] = [];

    [-0.4, 0.4].forEach((bx) => {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 1.54), timberMat);
      beam.position.set(bx, 0.3, 0);
      beam.castShadow = true;
      bodyPivot.add(beam);
    });
    [-0.48, 0.48].forEach((az) => {
      const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 1.12, 8), ironMat);
      axle.rotation.z = Math.PI / 2;
      axle.position.set(0, 0.24, az);
      bodyPivot.add(axle);

      [-0.54, 0.54].forEach((wx) => {
        const wheelPivot = makeSiegeWheel(0.24, 0.1, timberMat, ironMat, 6);
        wheelPivot.position.set(wx, 0.24, az);
        group.add(wheelPivot);
        wheels.push(wheelPivot);
      });
    });
    animParts.wheels = wheels;

    // Pitched Arrow-Proof Roof Shed + Hanging Faction Side Shields
    const roofShape = new THREE.Shape();
    roofShape.moveTo(-0.58, 0);
    roofShape.lineTo(0.58, 0);
    roofShape.lineTo(0.32, 0.66);
    roofShape.lineTo(-0.32, 0.66);
    roofShape.closePath();
    const shedRoof = new THREE.Mesh(makeExtrudeGeo(roofShape, 1.5, 0.025, 0.025, 1, true), hideMat);
    shedRoof.position.set(0, 0.38, 0);
    shedRoof.castShadow = true;
    const ridgeCap = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.09, 1.56), ironMat);
    ridgeCap.position.set(0, 1.05, 0);
    bodyPivot.add(shedRoof, ridgeCap);

    [-0.56, 0.56].forEach((sx) => {
      [-0.28, 0.28].forEach((sz) => {
        const sideShield = new THREE.Mesh(unitHeaterShieldGeo, armorMat);
        sideShield.scale.set(0.65, 0.65, 0.65);
        sideShield.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
        sideShield.position.set(sx, 0.52, sz);
        bodyPivot.add(sideShield);
      });
    });

    // Iron-banded corner posts
    [-0.38, 0.38].forEach((sx) => {
      [-0.58, 0.58].forEach((sz) => {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.58, 0.08), ironMat);
        post.position.set(sx, 0.66, sz);
        bodyPivot.add(post);
      });
    });

    // Swinging Iron-Capped Battering Log driven by rightArmPivot
    rightArmPivot.position.set(0, 0.62, 0);
    bodyPivot.add(rightArmPivot);
    const ramLog = new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.165, 1.88, 12), timberMat);
    ramLog.rotation.x = Math.PI / 2;
    ramLog.position.set(0, -0.1, 0.14);
    ramLog.castShadow = true;
    const ramHead = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.165, 0.36, 10), steelMat);
    ramHead.rotation.x = Math.PI / 2;
    ramHead.position.set(0, -0.1, 1.04);
    const ramTip = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.3, 8), damascusBladeMat);
    ramTip.rotation.x = Math.PI / 2;
    ramTip.position.set(0, -0.1, 1.35);
    const snoutCollar = new THREE.Mesh(new THREE.TorusGeometry(0.185, 0.025, 6, 12), goldTrimMat);
    snoutCollar.position.set(0, -0.1, 0.9);
    rightArmPivot.add(ramLog, ramHead, ramTip, snoutCollar);
  } else if (mType === 'cannon') {
    const isSiphon = unitId === 'greek_fire_siphon';
    bodyPivot.position.y = 0.0;
    const timberMat = hullOakMat;
    const ironMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.32, metalness: 0.88 });
    const bronzeMat = new THREE.MeshStandardMaterial({
      color: isSiphon ? 0xc2410c : 0xb45309,
      map: unitGoldFiligreeMaps.map,
      normalMap: unitGoldFiligreeMaps.normalMap,
      roughnessMap: unitGoldFiligreeMaps.roughnessMap || null,
      roughness: 0.28,
      metalness: 0.88,
    });
    const wheels: THREE.Object3D[] = [];

    // Heavy Gun Carriage Cheeks & Trail
    [-0.24, 0.24].forEach((cx) => {
      const cheek = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.36, 1.25), timberMat);
      cheek.position.set(cx, 0.38, -0.16);
      cheek.rotation.x = 0.12;
      cheek.castShadow = true;
      bodyPivot.add(cheek);
    });
    const trailBrace = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.14, 0.24), ironMat);
    trailBrace.position.set(0, 0.28, -0.72);
    bodyPivot.add(trailBrace);

    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.18, 8), ironMat);
    axle.rotation.z = Math.PI / 2;
    axle.position.set(0, 0.34, 0.24);
    bodyPivot.add(axle);

    [-0.56, 0.56].forEach((wx) => {
      const wheelPivot = makeSiegeWheel(0.34, 0.11, timberMat, ironMat, 8);
      wheelPivot.position.set(wx, 0.34, 0.24);
      group.add(wheelPivot);
      wheels.push(wheelPivot);
    });
    animParts.wheels = wheels;

    rightArmPivot.position.set(0, 0.58, 0.18);
    bodyPivot.add(rightArmPivot);

    if (isSiphon) {
      // Dedicated Greek Fire Naphtha Siphon: Riveted Copper Cauldron + Pressurized Bellows + Flared Flame Nozzle
      const copperMat = new THREE.MeshStandardMaterial({ color: 0xea580c, roughness: 0.32, metalness: 0.82 });
      const tank = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), copperMat);
      tank.scale.set(0.95, 1.05, 1.15);
      tank.position.set(0, 0.56, -0.28);
      tank.castShadow = true;
      const tankBand = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.026, 6, 14), goldTrimMat);
      tankBand.rotation.x = Math.PI / 2;
      tankBand.position.set(0, 0.56, -0.28);
      const shieldMantlet = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.44, 0.06), ironMat);
      shieldMantlet.position.set(0, 0.6, 0.34);
      bodyPivot.add(tank, tankBand, shieldMantlet);

      const siphonTube = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.145, 0.92, 12), copperMat);
      siphonTube.rotation.x = Math.PI / 2 - 0.1;
      siphonTube.position.set(0, 0.06, 0.24);
      const flareNozzle = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.24, 10, 1, true), goldTrimMat);
      flareNozzle.material.side = THREE.DoubleSide;
      flareNozzle.rotation.x = -Math.PI / 2 + 0.1;
      flareNozzle.position.set(0, 0.11, 0.72);
      const pilotFlame = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfb923c }));
      pilotFlame.position.set(0, 0.11, 0.78);
      rightArmPivot.add(siphonTube, flareNozzle, pilotFlame);
    } else {
      // Fluted Banded Bronze Bombard Cannon Barrel
      const barrel = new THREE.Mesh(
        makeLatheGeo([
          [0.01, -0.64],
          [0.215, -0.58],
          [0.195, -0.1],
          [0.155, 0.55],
          [0.195, 0.72],
          [0.14, 0.76],
        ], 16),
        bronzeMat
      );
      barrel.rotation.x = Math.PI / 2 - 0.14;
      barrel.position.set(0, 0.06, 0.18);
      barrel.castShadow = true;
      const band1 = new THREE.Mesh(new THREE.CylinderGeometry(0.205, 0.205, 0.085, 14), goldTrimMat);
      band1.rotation.x = Math.PI / 2 - 0.14;
      band1.position.set(0, 0.04, 0.02);
      const band2 = new THREE.Mesh(new THREE.CylinderGeometry(0.175, 0.175, 0.085, 14), goldTrimMat);
      band2.rotation.x = Math.PI / 2 - 0.14;
      band2.position.set(0, 0.09, 0.44);
      const cascabel = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 8), goldTrimMat);
      cascabel.position.set(0, -0.04, -0.48);
      rightArmPivot.add(barrel, band1, band2, cascabel);
    }
  } else if (unitDef.id === 'catapult' || unitDef.category === 'siege') {
    // Realistic Wheeled Timber Trebuchet / Catapult with Spoked Wheels & Iron Gussets
    bodyPivot.position.y = 0.0;
    const timberMat = hullOakMat;
    const ironMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.35, metalness: 0.85 });
    const wheels: THREE.Object3D[] = [];

    [-0.38, 0.38].forEach((bx) => {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 1.48), timberMat);
      rail.position.set(bx, 0.32, 0);
      rail.castShadow = true;
      bodyPivot.add(rail);
    });
    [-0.5, 0.5].forEach((az) => {
      const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.08, 8), ironMat);
      axle.rotation.z = Math.PI / 2;
      axle.position.set(0, 0.24, az);
      bodyPivot.add(axle);

      [-0.52, 0.52].forEach((wx) => {
        const wheelPivot = makeSiegeWheel(0.24, 0.095, timberMat, ironMat, 6);
        wheelPivot.position.set(wx, 0.24, az);
        group.add(wheelPivot);
        wheels.push(wheelPivot);
      });
    });
    animParts.wheels = wheels;

    [-0.36, 0.36].forEach((tx) => {
      const fStrut = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.94, 0.1), timberMat);
      fStrut.position.set(tx, 0.72, 0.2);
      fStrut.rotation.x = 0.26;
      const bStrut = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.94, 0.1), timberMat);
      bStrut.position.set(tx, 0.72, -0.2);
      bStrut.rotation.x = -0.26;
      const gusset = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.18), ironMat);
      gusset.position.set(tx, 1.06, 0);
      bodyPivot.add(fStrut, bStrut, gusset);
    });
    const crossbar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.92, 8), ironMat);
    crossbar.rotation.z = Math.PI / 2;
    crossbar.position.set(0, 1.08, 0);
    bodyPivot.add(crossbar);

    // Pivoting Throwing Arm + Boulder Payload via rightArmPivot
    rightArmPivot.position.set(0, 1.08, 0);
    bodyPivot.add(rightArmPivot);
    const armBeam = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.105, 1.38), timberMat);
    armBeam.position.set(0, 0.05, -0.18);
    armBeam.rotation.x = 0.35;
    const spoon = new THREE.Mesh(new THREE.CylinderGeometry(0.185, 0.12, 0.15, 10), ironMat);
    spoon.position.set(0, 0.29, -0.78);
    spoon.rotation.x = 0.28;
    const boulder = new THREE.Mesh(new THREE.DodecahedronGeometry(0.165, 0), sharedStoneDarkMat);
    boulder.position.set(0, 0.39, -0.78);
    const counterweight = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.28, 0.25), sharedStoneLightMat);
    counterweight.position.set(0, -0.22, 0.46);
    rightArmPivot.add(armBeam, spoon, boulder, counterweight);
  } else if (mType === 'boat') {
    const oakMat = hullOakMat;
    const trimMat = new THREE.MeshStandardMaterial({
      color: colors.primary,
      map: unitClothMaps.map,
      roughness: 0.56,
    });
    const isTransport = unitId === 'transport_boat';
    const isWarGalley = unitId === 'war_galley';

    if (isWarGalley) {
      // Dedicated Armored Naval War Galley: Bronze Ram Prow, Twin Oar Banks, Forecastle, War Sail & Swivel Ballista
      bodyPivot.position.y = 0.08;
      const hull = new THREE.Mesh(unitWarshipHullGeo, oakMat);
      hull.position.set(0, 0.26, 0);
      hull.castShadow = true;
      animParts.hitMaterials.push(oakMat);

      // Bronze-clad Battering Ram Prow
      const ramProw = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.62, 6), goldTrimMat);
      ramProw.rotation.x = Math.PI / 2;
      ramProw.position.set(0, 0.22, 1.38);

      // Raised Stern Quarterdeck & Crenellated Forecastle
      const sternCastle = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.38, 0.52), trimMat);
      sternCastle.position.set(0, 0.6, -0.78);
      sternCastle.castShadow = true;
      const foreCastle = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.3, 0.44), trimMat);
      foreCastle.position.set(0, 0.54, 0.65);

      // Shield-lined gunwales
      [-0.48, 0.48].forEach((sx) => {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 1.45), trimMat);
        rail.position.set(sx, 0.52, -0.05);
        bodyPivot.add(rail);
        [-0.36, 0, 0.36].forEach((sz) => {
          const shieldDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.04, 10), goldTrimMat);
          shieldDisc.rotation.z = Math.PI / 2;
          shieldDisc.position.set(sx * 1.06, 0.54, sz);
          bodyPivot.add(shieldDisc);
        });
      });

      // War Mast & Billowing Faction-Crested Canvas Sail
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.068, 1.85, 8), oakMat);
      mast.position.set(0, 1.25, 0.05);
      const yard = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 1.28, 6), oakMat);
      yard.rotation.z = Math.PI / 2;
      yard.position.set(0, 1.92, 0.08);
      const warSailMat = new THREE.MeshStandardMaterial({
        color: 0xfef3c7,
        map: unitSailMaps.map,
        normalMap: unitSailMaps.normalMap,
        roughnessMap: unitSailMaps.roughnessMap || null,
        side: THREE.DoubleSide,
        roughness: 0.78,
      });
      const sail = new THREE.Mesh(new THREE.PlaneGeometry(1.16, 1.12, 6, 4), warSailMat);
      sail.position.set(0, 1.36, 0.14);
      const bannerStripe = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.46, 0.025), trimMat);
      bannerStripe.position.set(0, 1.38, 0.16);
      const pennant = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.22, 0.52), goldTrimMat);
      pennant.position.set(0, 2.24, -0.18);

      // Forward Swivel Ballista Arm on rightArmPivot
      rightArmPivot.position.set(0, 0.76, 0.68);
      bodyPivot.add(rightArmPivot);
      const ballistaArm = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.05, 0.08), oakMat);
      const ballistaRail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.52), steelMat);
      ballistaRail.position.z = 0.14;
      rightArmPivot.add(ballistaArm, ballistaRail);

      // Banked Oars
      [-0.5, 0.5].forEach((ox) => {
        const dir = ox > 0 ? 1 : -1;
        [-0.35, 0, 0.35].forEach((oz) => {
          const oar = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.028, 0.95, 5), oakMat);
          oar.rotation.z = dir * 1.15;
          oar.position.set(ox + dir * 0.28, 0.28, oz);
          bodyPivot.add(oar);
        });
      });

      bodyPivot.add(hull, ramProw, sternCastle, foreCastle, mast, yard, sail, bannerStripe, pennant);
    } else if (isTransport) {
      // Wide flat-bottom troop barge — distinct from fishing sailboat & war galley
      bodyPivot.position.y = 0.06;
      const bargeMat = new THREE.MeshStandardMaterial({
        color: flags.imperial ? 0x64748b : flags.eliteTrim ? 0x78716c : 0x92400e,
        map: unitOakHullMaps.map,
        normalMap: unitOakHullMaps.normalMap,
        roughnessMap: unitOakHullMaps.roughnessMap || null,
        roughness: 0.8,
      });
      animParts.hitMaterials.push(bargeMat);
      const hull = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.32, 1.88), bargeMat);
      hull.position.set(0, 0.28, 0);
      hull.castShadow = true;
      const bow = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.28, 0.35), bargeMat);
      bow.position.set(0, 0.26, 0.96);
      const stern = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.28, 0.3), bargeMat);
      stern.position.set(0, 0.26, -0.96);
      const deck = new THREE.Mesh(new THREE.BoxGeometry(1.06, 0.06, 1.72), leatherMat);
      deck.position.set(0, 0.46, 0);
      bodyPivot.add(hull, bow, stern, deck);

      [-0.28, 0.28].forEach((bx) => {
        const bench = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 1.24), oakMat);
        bench.position.set(bx, 0.54, 0);
        bodyPivot.add(bench);
      });
      [-0.58, 0.58].forEach((sx, i) => {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.28, 1.52), trimMat);
        rail.position.set(sx, 0.58, 0);
        bodyPivot.add(rail);
        [-0.35, 0.35].forEach((sz) => {
          const shield = new THREE.Mesh(unitHeaterShieldGeo, i === 0 ? armorMat : goldTrimMat);
          shield.scale.set(0.55, 0.55, 0.55);
          shield.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
          shield.position.set(sx * 1.06, 0.68, sz);
          bodyPivot.add(shield);
        });
      });
      const ramp = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.05, 0.72), oakMat);
      ramp.position.set(0, 0.38, 1.16);
      ramp.rotation.x = -0.35;
      bodyPivot.add(ramp);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.15, 6), oakMat);
      mast.position.set(0, 1.0, -0.4);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.48, 0.3), trimMat);
      flag.material.side = THREE.DoubleSide;
      flag.position.set(0.28, 1.48, -0.4);
      bodyPivot.add(mast, flag);

      rightArmPivot.position.set(0.7, 0.5, 0.2);
      bodyPivot.add(rightArmPivot);
      const oar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 1.15, 6), oakMat);
      oar.rotation.z = Math.PI / 2.2;
      rightArmPivot.add(oar);
    } else {
      // Fishing vessel — sculpted curved oak hull, stitched canvas sail, lantern, cargo crate & net pole
      bodyPivot.position.y = 0.08;
      const sailMat = new THREE.MeshStandardMaterial({
        color: flags.imperial ? 0xfef3c7 : 0xf8fafc,
        map: unitSailMaps.map,
        normalMap: unitSailMaps.normalMap,
        roughnessMap: unitSailMaps.roughnessMap || null,
        side: THREE.DoubleSide,
        roughness: 0.76,
      });
      const lanternMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24 });
      const hull = new THREE.Mesh(
        makeLatheGeo(
          [
            [0.02, -0.92],
            [0.34, -0.68],
            [0.44, -0.1],
            [0.42, 0.45],
            [0.24, 0.85],
            [0.02, 1.05],
          ],
          14
        ),
        oakMat
      );
      hull.rotation.x = Math.PI / 2;
      hull.scale.set(flags.eliteTrim ? 1.08 : 1.0, 0.62, flags.eliteTrim ? 1.1 : 1.0);
      hull.position.set(0, 0.24, 0);
      hull.castShadow = true;
      animParts.hitMaterials.push(oakMat);
      bodyPivot.add(hull);

      const deck = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.08, 1.28), leatherMat);
      deck.position.set(0, 0.34, -0.02);
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.32, 0.44), trimMat);
      cabin.position.set(0, 0.52, -0.35);
      cabin.castShadow = true;
      const crate = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.22, 0.28), goldTrimMat);
      crate.position.set(0.1, 0.46, 0.32);
      bodyPivot.add(deck, cabin, crate);

      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 1.55, 8), oakMat);
      mast.position.set(0, 1.1, 0.06);
      mast.castShadow = true;
      const yard = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.98, 6), oakMat);
      yard.rotation.z = Math.PI / 2;
      yard.position.set(0, 1.66, 0.08);
      const sail = new THREE.Mesh(new THREE.PlaneGeometry(0.88, 0.94, 4, 4), sailMat);
      sail.position.set(0, 1.18, 0.14);
      const emblem = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.02), trimMat);
      emblem.position.set(0, 1.2, 0.155);
      bodyPivot.add(mast, yard, sail, emblem);

      const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), lanternMat);
      lantern.position.set(0, 0.55, 0.96);
      bodyPivot.add(lantern);

      const netPile = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.052, 6, 12), leatherMat);
      netPile.position.set(-0.2, 0.46, 0.4);
      bodyPivot.add(netPile);

      rightArmPivot.position.set(-0.34, 0.42, 0.15);
      bodyPivot.add(rightArmPivot);
      const netPole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.85, 6), oakMat);
      netPole.rotation.z = 0.55;
      netPole.position.set(-0.22, 0.12, 0.18);
      rightArmPivot.add(netPole);
    }
  } else {
    // Ancient Living Treant / Guardian Colossus (Root Legs, Heartwood Rune Core, Stag Antler Crown & Leafy Shoulders)
    const barkMat = new THREE.MeshStandardMaterial({
      color: unitDef.visual.color,
      map: resBarkMaps.map,
      normalMap: resBarkMaps.normalMap,
      normalScale: new THREE.Vector2(1.25, 1.25),
      roughnessMap: resBarkMaps.roughnessMap || null,
      roughness: 0.92,
    });
    animParts.hitMaterials.push(barkMat);
    addBipedLegs(barkMat, barkMat);

    const torso = new THREE.Mesh(
      makeLatheGeo([
        [0.4, 0.0],
        [0.33, 0.32],
        [0.46, 0.72],
        [0.37, 1.05],
        [0.19, 1.18],
        [0.01, 1.2],
      ], 10),
      barkMat
    );
    torso.castShadow = true;
    bodyPivot.add(torso);

    // Glowing Emerald Heartwood Rune Core
    const runeCore = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.16, 0),
      new THREE.MeshBasicMaterial({ color: 0x34d399 })
    );
    runeCore.position.set(0, 0.62, 0.42);
    bodyPivot.add(runeCore);
    animParts.auraMesh = runeCore;

    // Mossy Canopy Crown & Shoulder Boughs + Stag Antler Horns
    const foliageCrown = new THREE.Mesh(sharedOakBoughGeo, sharedBushLeafMat);
    foliageCrown.scale.set(0.7, 0.48, 0.64);
    foliageCrown.position.set(0, 1.28, -0.05);
    bodyPivot.add(foliageCrown);

    const antlerMat = new THREE.MeshStandardMaterial({
      color: 0x7a5434,
      map: unitOakHullMaps.map,
      normalMap: unitOakHullMaps.normalMap,
      roughness: 0.78,
    });
    [-1, 1].forEach((dir) => {
      const antler = new THREE.Mesh(
        makeTubeGeo([
          [dir * 0.22, 1.24, 0.06],
          [dir * 0.56, 1.62, 0.0],
          [dir * 0.72, 1.96, 0.12],
        ], 0.046, 8, 5),
        antlerMat
      );
      const tine = new THREE.Mesh(
        makeTubeGeo([
          [dir * 0.46, 1.52, 0.03],
          [dir * 0.54, 1.78, 0.24],
        ], 0.03, 6, 4),
        antlerMat
      );
      bodyPivot.add(antler, tine);
    });

    leftArmPivot.position.set(-0.5, 0.85, 0);
    bodyPivot.add(leftArmPivot);
    const lBranch = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.165, 0.7, 8), barkMat);
    lBranch.position.set(-0.04, -0.25, 0);
    const lFist = new THREE.Mesh(new THREE.DodecahedronGeometry(0.23), barkMat);
    lFist.position.set(-0.05, -0.58, 0.04);
    leftArmPivot.add(lBranch, lFist);

    rightArmPivot.position.set(0.5, 0.85, 0);
    bodyPivot.add(rightArmPivot);
    const rBranch = lBranch.clone();
    rBranch.position.set(0.04, -0.25, 0);
    const rFist = lFist.clone();
    rFist.position.set(0.05, -0.58, 0.04);
    rightArmPivot.add(rBranch, rFist);

    const eyeGlow = new THREE.MeshBasicMaterial({ color: 0x4ade80 });
    [-0.12, 0.12].forEach((ex) => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.068, 6, 6), eyeGlow);
      eye.position.set(ex, 0.94, 0.35);
      bodyPivot.add(eye);
    });
  }

  // --- Age / tech silhouette upgrades (shared accents) ---
  if (flags.eliteTrim || flags.plateArmor || flags.forgedWeapons || flags.imperial) {
    const accent = new THREE.MeshStandardMaterial({
      color: flags.imperial ? 0xfbbf24 : flags.plateArmor ? 0xcbd5e1 : colors.primary,
      metalness: flags.plateArmor ? 0.78 : 0.38,
      roughness: 0.32,
    });
    if (mType === 'swordsman' || mType === 'knight' || mType === 'ninja' || mType === 'saiyan') {
      if (flags.eliteTrim || flags.imperial) {
        const plume = new THREE.Mesh(new THREE.ConeGeometry(0.06 * s, 0.28 * s, 5), accent);
        plume.position.set(0, (mType === 'knight' ? 2.28 : 1.22) * s, -0.02);
        plume.name = 'agePlume';
        bodyPivot.add(plume);
      }
      if (flags.plateArmor && mType !== 'knight') {
        const gorget = new THREE.Mesh(new THREE.TorusGeometry(0.16 * s, 0.035 * s, 6, 12), accent);
        gorget.rotation.x = Math.PI / 2;
        gorget.position.set(0, 0.62 * s, 0.05);
        bodyPivot.add(gorget);
      }
      if (flags.forgedWeapons) {
        const edgeGlow = new THREE.Mesh(
          new THREE.BoxGeometry(0.036 * s, 0.48 * s, 0.036 * s),
          new THREE.MeshBasicMaterial({ color: flags.imperial ? 0xfde68a : 0x93c5fd })
        );
        edgeGlow.position.set(0.42 * s, (mType === 'knight' ? 1.5 : 0.35) * s, 0.18 * s);
        edgeGlow.name = 'weaponGlow';
        bodyPivot.add(edgeGlow);
      }
    }
    if (mType === 'archer' && (flags.eliteTrim || flags.age >= 2)) {
      const quiverCap = new THREE.Mesh(new THREE.CylinderGeometry(0.085 * s, 0.095 * s, 0.12 * s, 6), accent);
      quiverCap.position.set(-0.28 * s, 0.55 * s, -0.15 * s);
      bodyPivot.add(quiverCap);
    }
    if ((mType === 'cannon' || mType === 'ram') && (flags.siegeEngineers || flags.imperial)) {
      const plate = new THREE.Mesh(
        new THREE.BoxGeometry(0.5 * s, 0.08 * s, 0.6 * s),
        new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.8, roughness: 0.3 })
      );
      plate.position.set(0, 0.55 * s, 0);
      bodyPivot.add(plate);
    }
  }

  group.userData.animParts = animParts;
  group.userData.visualFlags = flags;
  group.userData.visualUnitId = unitId;
  group.scale.set(s, s, s);
  prepareUnitVisualLod(group);
  return group;
}

// ----------------- SELECTION RING DECAL -----------------
const ringGeo = new THREE.RingGeometry(0.7, 0.85, 24);
ringGeo.rotateX(-Math.PI / 2);
const playerRingMat = new THREE.MeshBasicMaterial({
  color: 0x38bdf8,
  side: THREE.DoubleSide,
  transparent: true,
  opacity: 0.85,
  depthWrite: false,
});

export function createSelectionRing(radius = 1.0): THREE.Mesh {
  const mesh = new THREE.Mesh(ringGeo, playerRingMat);
  mesh.scale.set(radius, radius, radius);
  mesh.position.y = 0.03;
  return mesh;
}
