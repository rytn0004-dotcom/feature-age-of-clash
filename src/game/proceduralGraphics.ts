import * as THREE from 'three';
import { BuildingType, CivilizationId, FactionId, UnitDefinition, LandmarkType } from '../types/game';
import type { BuildingVisualState } from './rules';

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
  getClothWeaveMaps,
  getContactShadowTexture,
  getCraggyRockMaps,
  getFoliagePBRMaps,
  getLeatherMaps,
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

function makeCraggyRockGeo(radius: number, detail = 1): THREE.DodecahedronGeometry {
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
  geo.computeVertexNormals();
  return safeComputeTangents(geo);
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
    normalScale: new THREE.Vector2(0.9, 0.9),
    roughness: civ === 'fantasy' ? 0.48 : 0.85,
    metalness: 0.06,
  });
  const darkStoneMat = new THREE.MeshStandardMaterial({
    color: civ === 'fantasy' ? 0xcbd5e1 : 0x475569,
    map: stoneMaps.map,
    normalMap: stoneMaps.normalMap,
    normalScale: new THREE.Vector2(1.0, 1.0),
    roughness: 0.9,
  });
  const woodMat = new THREE.MeshStandardMaterial({
    color: woodColor,
    map: woodMaps.map,
    normalMap: woodMaps.normalMap,
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughness: 0.76,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    color: civ === 'fantasy' ? 0x0f766e : civ === 'anime' ? 0x1e293b : colors.primary,
    map: roofMaps.map,
    normalMap: roofMaps.normalMap,
    normalScale: new THREE.Vector2(1.0, 1.0),
    roughness: 0.4,
    metalness: 0.16,
  });
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.22, metalness: 0.88 });
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.35, metalness: 0.82 });
  const plasterMat = new THREE.MeshStandardMaterial({
    color: 0xe7dec8,
    map: stoneMaps.map,
    roughness: 0.82,
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
    const steps = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.65, 1.0), stoneMat);
    steps.position.set(0, 0.32, 2.85);
    group.add(steps);

    const tier1 = new THREE.Mesh(new THREE.BoxGeometry(4.5, 1.85, 4.5), woodMat);
    tier1.position.y = 2.15;
    tier1.castShadow = true;
    group.add(tier1);

    // White shikkui plaster facade inset
    const plaster1 = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.5, 4.62), plasterMat);
    plaster1.position.y = 2.15;
    group.add(plaster1);

    const eave1 = new THREE.Mesh(makePagodaRoofGeo(3.65, 1.35), roofMat);
    eave1.position.y = 3.05;
    eave1.castShadow = true;
    group.add(eave1);

    const tier2 = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.55, 3.2), plasterMat);
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
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.6, 0.16), woodMat);
      post.position.set(px, 4.45, pz);
      group.add(post);
    });

    const eave2 = new THREE.Mesh(makePagodaRoofGeo(2.8, 1.2), roofMat);
    eave2.position.y = 5.15;
    eave2.castShadow = true;
    group.add(eave2);

    const tier3 = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.15, 2.1), plasterMat);
    tier3.position.y = 6.25;
    tier3.castShadow = true;
    group.add(tier3);

    const eave3 = new THREE.Mesh(makePagodaRoofGeo(2.05, 1.15), roofMat);
    eave3.position.y = 6.75;
    eave3.castShadow = true;
    group.add(eave3);

    // Golden Shachihoko Roof Ridge Finials
    const ridgeBeam = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.18, 0.2), goldMat);
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
    const kasagi = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.24, 0.34), vermilionMat);
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
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.72, 5.6), darkStoneMat);
    plinth.position.y = 0.36;
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    group.add(plinth);

    const keepLower = new THREE.Mesh(new THREE.BoxGeometry(4.15, 2.3, 4.15), stoneMat);
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
      const buttress = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.4, 0.5), darkStoneMat);
      buttress.position.set(bx, 1.85, bz);
      group.add(buttress);
    });

    // Tudor half-timbered upper solar hall
    const hallUpper = new THREE.Mesh(new THREE.BoxGeometry(4.45, 1.45, 4.45), plasterMat);
    hallUpper.position.y = 3.72;
    hallUpper.castShadow = true;
    group.add(hallUpper);

    [-1.48, 0, 1.48].forEach((tx) => {
      const beamF = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.48, 4.54), woodMat);
      beamF.position.set(tx, 3.72, 0);
      group.add(beamF);
      const beamS = new THREE.Mesh(new THREE.BoxGeometry(4.54, 1.48, 0.16), woodMat);
      beamS.position.set(0, 3.72, tx);
      group.add(beamS);
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

    // 4 Corner Bastion Turrets with corbelled tops & conical slate roofs
    const towerGeo = new THREE.CylinderGeometry(0.64, 0.78, 4.4, 10);
    const corbelGeo = new THREE.CylinderGeometry(0.82, 0.64, 0.42, 10);
    const turretRoofGeo = new THREE.ConeGeometry(0.92, 1.55, 10);
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
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughness: civ === 'fantasy' ? 0.5 : 0.88,
  });
  const woodMat = new THREE.MeshStandardMaterial({
    color: civ === 'anime' ? 0x6b2710 : civ === 'fantasy' ? 0x166534 : 0xa36c3e,
    map: woodMaps.map,
    normalMap: woodMaps.normalMap,
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughness: 0.74,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    color: civ === 'anime' ? 0x1e293b : civ === 'fantasy' ? 0x0f766e : colors.primary,
    map: roofMaps.map,
    normalMap: roofMaps.normalMap,
    normalScale: new THREE.Vector2(0.95, 0.95),
    roughness: 0.4,
  });
  const plasterMat = new THREE.MeshStandardMaterial({ color: 0xe7dec8, roughness: 0.8 });
  const steelMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.18, metalness: 0.85 });
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.35, metalness: 0.8 });

  // Stone foundation plinth + Lower garrison wall (fits <= 3.02m collider)
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(4.25, 0.45, 3.75), stoneMat);
  plinth.position.y = 0.22;
  plinth.receiveShadow = true;
  group.add(plinth);

  const base = new THREE.Mesh(new THREE.BoxGeometry(4.0, 1.2, 3.45), stoneMat);
  base.position.y = 1.02;
  base.castShadow = true;
  group.add(base);

  // Timber-framed upper floor
  const upper = new THREE.Mesh(new THREE.BoxGeometry(3.85, 1.35, 3.25), civ === 'anime' ? plasterMat : woodMat);
  upper.position.y = 2.28;
  upper.castShadow = true;
  group.add(upper);

  [-1.7, 0, 1.7].forEach((tx) => {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.4, 3.35), woodMat);
    beam.position.set(tx, 2.28, 0);
    group.add(beam);
  });

  // Sculpted gabled / pagoda roof
  if (civ === 'anime') {
    const roof = new THREE.Mesh(makePagodaRoofGeo(3.0, 1.6), roofMat);
    roof.scale.set(1.08, 1, 0.94);
    roof.position.y = 2.95;
    roof.castShadow = true;
    group.add(roof);

    const toriiTop = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.22, 0.28), new THREE.MeshStandardMaterial({ color: 0xdc2626 }));
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

    const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 3.75), woodMat);
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
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.11, 1.35, 0.07), steelMat);
    blade.position.set(0, 2.55, 1.74);
    blade.rotation.z = rot;
    group.add(blade);
  });

  // Outdoor Training Weapon Rack + Shield (tucked tightly alongside barracks plinth)
  const rackPost1 = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 1.25, 6), woodMat);
  rackPost1.position.set(2.02, 0.62, 0.12);
  const rackPost2 = rackPost1.clone();
  rackPost2.position.set(2.02, 0.62, 0.95);
  const rackBar = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 1.0), woodMat);
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
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughness: 0.74,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    color: colors.primary,
    map: roofMaps.map,
    normalMap: roofMaps.normalMap,
    normalScale: new THREE.Vector2(0.95, 0.95),
    roughness: 0.38,
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


export function createMarketMesh(faction: FactionId): THREE.Group {
  const group = new THREE.Group();
  const colors = getFactionPalette(faction);
  addContactShadow(group, 1.5);
  const wood = sharedWoodScaffoldMat;
  const cloth = new THREE.MeshStandardMaterial({ color: colors.primary, roughness: 0.85 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.25, 2.2), wood);
  base.position.y = 0.12;
  base.castShadow = true;
  const stall = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.0, 1.6), wood);
  stall.position.y = 0.7;
  stall.castShadow = true;
  const awning = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.12, 1.9), cloth);
  awning.position.y = 1.35;
  awning.rotation.x = -0.15;
  const poleL = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.5, 6), wood);
  poleL.position.set(-1.0, 0.75, 0.9);
  const poleR = poleL.clone();
  poleR.position.x = 1.0;
  // Gold crate
  const crate = new THREE.Mesh(
    new THREE.BoxGeometry(0.45, 0.35, 0.45),
    new THREE.MeshStandardMaterial({ color: 0xeab308, metalness: 0.4, roughness: 0.4 })
  );
  crate.position.set(0.7, 0.35, 1.1);
  group.add(base, stall, awning, poleL, poleR, crate);
  const badge = createBadgeSprite('市集', '⚖️', '', 0.9, colors.isHostile, false);
  badge.position.y = 2.4;
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
      sheafColor.setHSL(0.11 + ((col + row) % 4) * 0.009, 0.78, 0.46 + ((row + col) % 3) * 0.06);
      wheatInst.setColorAt(idx, sheafColor);
      idx++;
    }
  }
  wheatInst.instanceMatrix.needsUpdate = true;
  if (wheatInst.instanceColor) wheatInst.instanceColor.needsUpdate = true;
  wheatInst.castShadow = true;
  group.add(wheatInst);

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
    roughness: 0.78,
  });
  const barkMat = new THREE.MeshStandardMaterial({
    color: 0x6b3e1b,
    map: barkMaps.map,
    normalMap: barkMaps.normalMap,
    roughness: 0.9,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    color: colors.primary,
    map: roofMaps.map,
    normalMap: roofMaps.normalMap,
    roughness: 0.42,
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
    roughness: 0.78,
  });
  const plankMat = new THREE.MeshStandardMaterial({
    color: 0xb45309,
    map: woodMaps.map,
    normalMap: woodMaps.normalMap,
    roughness: 0.74,
  });
  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    map: stoneMaps.map,
    normalMap: stoneMaps.normalMap,
    roughness: 0.88,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    color: colors.primary,
    map: roofMaps.map,
    normalMap: roofMaps.normalMap,
    roughness: 0.42,
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
    normalScale: new THREE.Vector2(0.9, 0.9),
    roughness: 0.86,
  });
  const darkStoneMat = new THREE.MeshStandardMaterial({
    color: 0x475569,
    map: stoneMaps.map,
    normalMap: stoneMaps.normalMap,
    roughness: 0.9,
  });
  const woodMat = new THREE.MeshStandardMaterial({
    color: 0x9a6234,
    map: woodMaps.map,
    normalMap: woodMaps.normalMap,
    roughness: 0.74,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    color: colors.primary,
    map: roofMaps.map,
    normalMap: roofMaps.normalMap,
    roughness: 0.38,
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
    normalScale: new THREE.Vector2(0.95, 0.95),
    roughness: 0.84,
  });
  const darkStoneMat = new THREE.MeshStandardMaterial({
    color: 0x475569,
    map: stoneMaps.map,
    normalMap: stoneMaps.normalMap,
    roughness: 0.92,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    map: stoneMaps.map,
    normalMap: stoneMaps.normalMap,
    roughness: 0.55,
  });
  const woodMat = new THREE.MeshStandardMaterial({
    color: 0x8d572c,
    map: woodMaps.map,
    normalMap: woodMaps.normalMap,
    roughness: 0.72,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    color: colors.primary,
    map: roofMaps.map,
    normalMap: roofMaps.normalMap,
    roughness: 0.36,
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
    normalScale: new THREE.Vector2(0.45, 0.45),
    roughness: 0.36,
  });
  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    map: stoneMaps.map,
    normalMap: stoneMaps.normalMap,
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughness: 0.8,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    color: colors.primary,
    map: roofMaps.map,
    normalMap: roofMaps.normalMap,
    normalScale: new THREE.Vector2(0.9, 0.9),
    roughness: 0.34,
  });
  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    map: stoneMaps.map,
    normalMap: stoneMaps.normalMap,
    roughness: 0.72,
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
    roughness: 0.88,
  });
  const woodMat = new THREE.MeshStandardMaterial({
    color: 0x78350f,
    map: woodMaps.map,
    normalMap: woodMaps.normalMap,
    roughness: 0.78,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    color: colors.primary,
    map: roofMaps.map,
    normalMap: roofMaps.normalMap,
    roughness: 0.42,
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
    roughness: 0.78,
  });
  const woodMat = new THREE.MeshStandardMaterial({
    color: 0x5c2d16,
    map: woodMaps.map,
    normalMap: woodMaps.normalMap,
    roughness: 0.72,
  });
  const plasterMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.72 });
  const vermilionMat = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.42 });
  const roofMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    map: roofMaps.map,
    normalMap: roofMaps.normalMap,
    roughness: 0.36,
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
  baseRotZ: number;
}

interface BuildingVisualRig {
  parts: BuildingTierPart[];
  scaffoldGroup: THREE.Group;
  scaffoldFrame: THREE.Group;
  maxY: number;
  footprintHalf: number;
}

const scaffoldPadMat = new THREE.MeshStandardMaterial({
  color: 0xa18259,
  roughness: 0.96,
});
const scaffoldPoleMat = new THREE.MeshStandardMaterial({
  color: 0x8b5a2b,
  roughness: 0.85,
});
const scaffoldCrateMat = new THREE.MeshStandardMaterial({
  color: 0xb47b44,
  roughness: 0.8,
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

  const parts: BuildingTierPart[] = partBoxes.map(({ obj, box }) => {
    const centerY = (box.min.y + box.max.y) * 0.5;
    let tier: 1 | 2 | 3;
    if (type === 'farm') {
      // Farms grow soil -> fence/crops -> barn/windmill trim
      tier = centerY <= 0.14 ? 1 : centerY <= 0.45 ? 2 : 3;
    } else if (box.min.y <= 0.25 && box.max.y <= maxY * 0.34) {
      tier = 1;
    } else if (centerY <= maxY * 0.58) {
      tier = 2;
    } else {
      tier = 3;
    }
    return {
      obj,
      tier,
      basePosY: obj.position.y,
      baseScaleX: obj.scale.x,
      baseScaleY: obj.scale.y,
      baseScaleZ: obj.scale.z,
      boxMinY: Math.max(0, box.min.y),
      baseRotZ: obj.rotation.z,
    };
  });

  // Grounded Timber Construction Scaffolding + Foundation Site Apron
  const scaffoldGroup = new THREE.Group();
  scaffoldGroup.name = 'scaffoldGroup';
  scaffoldGroup.visible = false;

  const pad = new THREE.Mesh(
    new THREE.BoxGeometry(halfX * 2.15, 0.04, halfZ * 2.15),
    scaffoldPadMat
  );
  pad.position.y = 0.02;
  pad.receiveShadow = true;
  scaffoldGroup.add(pad);

  const scaffoldFrame = new THREE.Group();
  scaffoldGroup.add(scaffoldFrame);

  const scafH = Math.max(1.5, Math.min(6.4, maxY * 0.82));
  const poleGeo = new THREE.CylinderGeometry(0.065, 0.08, scafH, 6);
  const px = halfX + 0.16;
  const pz = halfZ + 0.16;
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
  });

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
    maxY,
    footprintHalf,
  };
  group.userData.buildRig = rig;
}

/**
 * Updates building mesh to show realistic staged construction (foundation -> framing walls -> roof)
 * anchored cleanly on the ground without stretching/floating the entire building or overhead badge.
 */
export function applyBuildingConstructionVisuals(
  mesh: THREE.Group,
  state: BuildingVisualState
): void {
  const rig = mesh.userData.buildRig as BuildingVisualRig | undefined;
  if (!rig) return;

  rig.scaffoldGroup.visible = state.showScaffold;
  if (state.showScaffold) {
    rig.scaffoldFrame.scale.set(1, state.scaffoldHeightScale, 1);
  }

  for (const part of rig.parts) {
    const reveal =
      part.tier === 1
        ? state.tier1Reveal
        : part.tier === 2
        ? state.tier2Reveal
        : state.tier3Reveal;

    if (reveal <= 0.02) {
      part.obj.visible = false;
      continue;
    }

    part.obj.visible = true;
    if (reveal >= 0.999) {
      part.obj.scale.set(part.baseScaleX, part.baseScaleY, part.baseScaleZ);
      part.obj.position.y = part.basePosY;
    } else if (part.tier === 1) {
      const sY = Math.max(0.22, reveal);
      part.obj.scale.set(part.baseScaleX, part.baseScaleY * sY, part.baseScaleZ);
      part.obj.position.y = part.basePosY - (1 - sY) * Math.max(0, part.basePosY - part.boxMinY);
    } else if (part.tier === 2) {
      const sY = Math.max(0.14, reveal);
      part.obj.scale.set(part.baseScaleX, part.baseScaleY * sY, part.baseScaleZ);
      part.obj.position.y = part.basePosY - (1 - sY) * Math.max(0, part.basePosY - part.boxMinY);
    } else {
      // Tier 3 (roofs/turrets): settle cleanly down onto rising walls without floating overhead
      const wallTopFraction = state.tier2Reveal;
      const dropOffset = (1 - wallTopFraction) * Math.max(0.45, part.boxMinY * 0.72);
      const s = 0.65 + 0.35 * reveal;
      part.obj.scale.set(part.baseScaleX * s, part.baseScaleY * Math.max(0.25, reveal), part.baseScaleZ * s);
      part.obj.position.y = Math.max(0.15, part.basePosY - dropOffset);
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

const rubbleCharMat = new THREE.MeshStandardMaterial({
  color: 0x292524,
  roughness: 0.96,
});
const rubbleStoneMat = new THREE.MeshStandardMaterial({
  color: 0x57534e,
  roughness: 0.92,
});

export function createRubbleDecalMesh(footprintSize: number): THREE.Group {
  const group = new THREE.Group();
  const radius = Math.max(1.8, footprintSize * 0.96);

  const ashDisc = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 18),
    new THREE.MeshBasicMaterial({
      color: 0x1c1917,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
    })
  );
  ashDisc.rotation.x = -Math.PI / 2;
  ashDisc.position.y = 0.03;
  group.add(ashDisc);

  const emberCore = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 0.42, 12),
    new THREE.MeshBasicMaterial({
      color: 0xea580c,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    })
  );
  emberCore.rotation.x = -Math.PI / 2;
  emberCore.position.y = 0.04;
  group.add(emberCore);

  const chunkGeo = new THREE.DodecahedronGeometry(0.42, 0);
  const plankGeo = new THREE.BoxGeometry(1.15, 0.14, 0.28);
  for (let i = 0; i < 11; i++) {
    const ang = (i / 11) * Math.PI * 2 + (i % 3) * 0.25;
    const dist = i === 0 ? 0.15 : radius * (0.2 + (i % 4) * 0.17);
    const isPlank = i % 3 === 0;
    const debris = new THREE.Mesh(
      isPlank ? plankGeo : chunkGeo,
      i % 2 === 0 ? rubbleStoneMat : rubbleCharMat
    );
    debris.position.set(Math.cos(ang) * dist, isPlank ? 0.12 : 0.24, Math.sin(ang) * dist);
    debris.rotation.set(i * 0.35, ang + 0.6, (i % 2 === 0 ? 1 : -1) * 0.28);
    debris.scale.setScalar(0.9 + (i % 3) * 0.32);
    group.add(debris);
  }

  return group;
}


/** Neutral contested shrine / banner — readable from mid-distance */
export function createContestedShrineMesh(label = '爭奪點'): THREE.Group {
  const group = new THREE.Group();
  group.name = 'contestedShrine';
  addContactShadow(group, 2.4);

  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0x78716c,
    roughness: 0.88,
    metalness: 0.08,
  });
  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xfbbf24,
    emissive: 0xb45309,
    emissiveIntensity: 0.35,
    roughness: 0.45,
    metalness: 0.4,
  });
  const clothMat = new THREE.MeshStandardMaterial({
    color: 0xa8a29e,
    roughness: 0.75,
  });

  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.35, 0.45, 8), stoneMat);
  plinth.position.y = 0.22;
  plinth.castShadow = true;
  group.add(plinth);

  const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.55, 2.2, 0.55), stoneMat);
  pillar.position.y = 1.4;
  pillar.castShadow = true;
  group.add(pillar);

  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.45, 4), goldMat);
  cap.position.y = 2.7;
  group.add(cap);

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.8, 6), stoneMat);
  pole.position.set(0.85, 1.5, 0);
  group.add(pole);

  const banner = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.1), clothMat);
  banner.position.set(1.35, 2.1, 0);
  banner.rotation.y = -0.4;
  banner.name = 'shrineBanner';
  group.add(banner);

  // Capture ring (horizontal)
  const ringGeo = new THREE.RingGeometry(9.5, 11.0, 48);
  ringGeo.rotateX(-Math.PI / 2);
  const ring = new THREE.Mesh(
    ringGeo,
    new THREE.MeshBasicMaterial({
      color: 0xf8fafc,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  ring.position.y = 0.06;
  ring.name = 'captureRing';
  group.add(ring);

  const badge = createBadgeSprite(label, '⚔️', '中立', 1, false, false, '爭奪中');
  badge.position.y = 3.4;
  badge.name = 'shrineBadge';
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
    case 'market':
      group = createMarketMesh(faction);
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

const sharedPineSkirt1Geo = makeLatheGeo([
  [1.62, 0.0],
  [1.38, 0.35],
  [0.78, 1.15],
  [0.01, 1.45],
], 11);
const sharedPineSkirt2Geo = makeLatheGeo([
  [1.26, 0.0],
  [1.04, 0.3],
  [0.55, 0.98],
  [0.01, 1.25],
], 11);
const sharedPineSkirt3Geo = makeLatheGeo([
  [0.88, 0.0],
  [0.7, 0.26],
  [0.34, 0.85],
  [0.01, 1.15],
], 10);
const sharedOakBoughGeo = new THREE.IcosahedronGeometry(0.82, 1);

const sharedTreeTrunkMat = new THREE.MeshStandardMaterial({
  color: 0x7c5032,
  map: resBarkMaps.map,
  normalMap: resBarkMaps.normalMap,
  normalScale: new THREE.Vector2(1.15, 1.15),
  roughness: 0.92,
});
const sharedTreeLeafMats = [
  new THREE.MeshStandardMaterial({
    color: 0x1e6b35,
    map: resFoliageMaps.map,
    normalMap: resFoliageMaps.normalMap,
    normalScale: new THREE.Vector2(1.05, 1.05),
    roughness: 0.76,
  }),
  new THREE.MeshStandardMaterial({
    color: 0x165329,
    map: resFoliageMaps.map,
    normalMap: resFoliageMaps.normalMap,
    normalScale: new THREE.Vector2(1.05, 1.05),
    roughness: 0.78,
  }),
  new THREE.MeshStandardMaterial({
    color: 0x2b7e40,
    map: resFoliageMaps.map,
    normalMap: resFoliageMaps.normalMap,
    normalScale: new THREE.Vector2(1.05, 1.05),
    roughness: 0.72,
  }),
];

export function createTreeMesh(hasBadge = false): THREE.Group {
  const group = new THREE.Group();
  addContactShadow(group, 1.55);

  const leafMat = sharedTreeLeafMats[Math.floor(Math.random() * sharedTreeLeafMats.length)];
  const isBroadleaf = Math.random() > 0.52;

  const trunk = new THREE.Mesh(sharedTreeTrunkGeo, sharedTreeTrunkMat);
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  group.add(trunk);

  // 3 Flared Root Spurs gripping the terrain
  for (let r = 0; r < 3; r++) {
    const root = new THREE.Mesh(sharedTreeRootGeo, sharedTreeTrunkMat);
    root.rotation.y = (r * Math.PI * 2) / 3 + 0.3;
    group.add(root);
  }

  const canopyPivot = new THREE.Group();
  canopyPivot.name = 'treeCanopy';
  // Raised above unit eye-level so low conifer boughs never swallow nearby soldiers
  canopyPivot.position.y = 1.92;
  group.add(canopyPivot);
  group.userData.treeCanopy = canopyPivot;

  if (isBroadleaf) {
    // Broadleaf Oak Silhouette: 2 exposed lower forked limbs + 6 organically clustered foliage crowns
    [-0.4, 2.3].forEach((ang, idx) => {
      const bough = new THREE.Mesh(sharedTreeBranchGeo, sharedTreeTrunkMat);
      bough.position.y = 0.25 + idx * 0.22;
      bough.rotation.y = ang;
      canopyPivot.add(bough);
    });

    const crownOffsets: Array<[number, number, number, number]> = [
      [0, 1.55, 0, 1.25],
      [-0.72, 1.15, 0.42, 0.96],
      [0.75, 1.22, 0.35, 0.92],
      [0.25, 1.12, -0.74, 0.94],
      [-0.42, 1.72, -0.35, 0.85],
      [0.4, 1.78, 0.32, 0.82],
    ];
    crownOffsets.forEach(([ox, oy, oz, sc], idx) => {
      const cl = new THREE.Mesh(sharedOakBoughGeo, leafMat);
      cl.position.set(ox, oy, oz);
      cl.scale.set(sc * 1.12, sc * 0.84, sc * 1.05);
      cl.rotation.set(idx * 0.4, idx * 1.1, 0);
      cl.castShadow = true;
      canopyPivot.add(cl);
    });
  } else {
    // Natural Asymmetric Layered Conifer Pine
    const tier1 = new THREE.Mesh(sharedPineSkirt1Geo, leafMat);
    tier1.position.set(0.05, 0.0, -0.04);
    tier1.rotation.set(0.03, 0.2, -0.03);
    tier1.castShadow = true;
    canopyPivot.add(tier1);

    const tier2 = new THREE.Mesh(sharedPineSkirt2Geo, leafMat);
    tier2.position.set(-0.04, 0.88, 0.05);
    tier2.rotation.set(-0.03, 0.75, 0.02);
    tier2.castShadow = true;
    canopyPivot.add(tier2);

    const tier3 = new THREE.Mesh(sharedPineSkirt3Geo, leafMat);
    tier3.position.set(0.03, 1.72, 0);
    tier3.rotation.y = 1.3;
    tier3.castShadow = true;
    canopyPivot.add(tier3);

    const tip = new THREE.Mesh(sharedPineSkirt3Geo, leafMat);
    tip.scale.set(0.62, 0.78, 0.62);
    tip.position.y = 2.42;
    tip.castShadow = true;
    canopyPivot.add(tip);
  }

  if (hasBadge) {
    const badge = createBadgeSprite('森林原木', '🪵', '320', 1, false, true, '可供伐木');
    badge.position.set(0, 5.1, 0);
    group.add(badge);
    group.userData.badgeSprite = badge;
  }

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
  normalScale: new THREE.Vector2(1.25, 1.25),
  roughness: 0.88,
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
  roughness: 0.8,
});
const sharedGoldNuggetGeo = new THREE.OctahedronGeometry(0.38, 0);

export function createGoldMineMesh(amount = 1400): THREE.Group {
  const group = new THREE.Group();
  addContactShadow(group, 2.25);

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
  const veinConfigs: Array<[number, number, number, number, number, number]> = [
    [0.05, 1.52, -0.15, 0.12, -0.1, 1.15],
    [-0.65, 1.22, 0.35, 0.35, 0.45, 0.95],
    [0.72, 1.18, 0.25, -0.32, -0.42, 1.0],
    [-0.35, 1.15, -0.78, -0.45, 0.22, 0.88],
    [0.45, 1.3, -0.62, -0.3, -0.35, 0.92],
  ];
  veinConfigs.forEach(([vx, vy, vz, rx, rz, sc]) => {
    const spire = new THREE.Mesh(sharedGoldCrystalGeo, sharedGoldOreMat);
    spire.position.set(vx, vy, vz);
    spire.rotation.set(rx, vx, rz);
    spire.scale.setScalar(sc);
    spire.castShadow = true;
    group.add(spire);
  });

  // Exposed raw gold ore nuggets along base
  const nug1 = new THREE.Mesh(sharedGoldNuggetGeo, sharedGoldOreMat);
  nug1.position.set(-0.78, 0.55, 1.25);
  const nug2 = new THREE.Mesh(sharedGoldNuggetGeo, sharedGoldOreMat);
  nug2.position.set(0.92, 0.62, 1.05);
  group.add(nug1, nug2);

  // Mine Adit Timber Portal + Rails + Ore Crate + Miner's Lantern
  const post1 = new THREE.Mesh(sharedGoldPostGeo, sharedWoodScaffoldMat);
  post1.position.set(-1.15, 1.15, 1.28);
  post1.rotation.z = -0.08;
  const post2 = new THREE.Mesh(sharedGoldPostGeo, sharedWoodScaffoldMat);
  post2.position.set(1.15, 1.15, 1.28);
  post2.rotation.z = 0.08;
  const beam = new THREE.Mesh(sharedGoldBeamGeo, sharedWoodScaffoldMat);
  beam.position.set(0, 2.28, 1.28);
  group.add(post1, post2, beam);

  const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), new THREE.MeshBasicMaterial({ color: 0xfde047 }));
  lantern.position.set(0.85, 1.98, 1.32);
  group.add(lantern);

  const badge = createBadgeSprite('金礦', '🪙', `${amount}`, 1, false, true);
  badge.position.set(0, 3.85, 0);
  group.add(badge);
  group.userData.badgeSprite = badge;

  return group;
}

const sharedQuarryBlockGeo = new THREE.BoxGeometry(0.88, 0.46, 0.74);
const sharedCranePostGeo = new THREE.CylinderGeometry(0.09, 0.11, 2.7, 8);
const sharedCraneArmGeo = new THREE.BoxGeometry(1.8, 0.14, 0.14);
const sharedStoneLightMat = new THREE.MeshStandardMaterial({
  color: 0xcbd5e1,
  map: resRockMaps.map,
  normalMap: resRockMaps.normalMap,
  normalScale: new THREE.Vector2(1.05, 1.05),
  roughness: 0.86,
});
const sharedStoneDarkMat = new THREE.MeshStandardMaterial({
  color: 0x64748b,
  map: resRockMaps.map,
  normalMap: resRockMaps.normalMap,
  normalScale: new THREE.Vector2(1.15, 1.15),
  roughness: 0.92,
});

export function createStoneQuarryMesh(amount = 1000): THREE.Group {
  const group = new THREE.Group();
  addContactShadow(group, 2.05);

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
  });

  // Timber Quarry Jib Crane + Rope + Suspended Ashlar Block
  const cranePost = new THREE.Mesh(sharedCranePostGeo, sharedWoodScaffoldMat);
  cranePost.position.set(1.32, 1.35, -0.5);
  const craneArm = new THREE.Mesh(sharedCraneArmGeo, sharedWoodScaffoldMat);
  craneArm.position.set(0.55, 2.6, -0.5);
  craneArm.rotation.z = -0.28;
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.75, 5), sharedWoodScaffoldMat);
  rope.position.set(-0.2, 2.05, -0.5);
  const hungBlock = new THREE.Mesh(sharedQuarryBlockGeo, sharedStoneLightMat);
  hungBlock.scale.setScalar(0.62);
  hungBlock.position.set(-0.2, 1.58, -0.5);
  group.add(cranePost, craneArm, rope, hungBlock);

  const badge = createBadgeSprite('石礦', '🪨', `${amount}`, 1, false, true);
  badge.position.set(0, 3.6, 0);
  group.add(badge);
  group.userData.badgeSprite = badge;

  return group;
}

const sharedBushClumpGeo = new THREE.IcosahedronGeometry(0.56, 1);
const sharedBerryDotGeo = new THREE.SphereGeometry(0.085, 8, 8);
const sharedBushLeafMat = new THREE.MeshStandardMaterial({
  color: 0x1e7e34,
  map: resFoliageMaps.map,
  normalMap: resFoliageMaps.normalMap,
  normalScale: new THREE.Vector2(0.95, 0.95),
  roughness: 0.78,
});
const sharedBerryFruitMat = new THREE.MeshStandardMaterial({
  color: 0xe11d48,
  roughness: 0.14,
  metalness: 0.06,
});

export function createBerryBushMesh(amount = 350, hasBadge = false): THREE.Group {
  const group = new THREE.Group();
  addContactShadow(group, 1.1);

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
    clump.position.set(cx, cy, cz);
    clump.scale.set(sx, sy, sz);
    clump.rotation.y = i * 0.8;
    clump.castShadow = true;
    group.add(clump);
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
  berryOffsets.forEach(([bx, by, bz]) => {
    const berry = new THREE.Mesh(sharedBerryDotGeo, sharedBerryFruitMat);
    berry.position.set(bx, by, bz);
    group.add(berry);
  });

  if (hasBadge) {
    const badge = createBadgeSprite('野生漿果', '🫐', `${amount}`, 1, false, true, '快速採集糧食');
    badge.position.set(0, 2.25, 0);
    group.add(badge);
    group.userData.badgeSprite = badge;
  }
  return group;
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

  const body = new THREE.Mesh(sharedDeerTorsoGeo, sharedDeerMat);
  body.position.y = 0.7;
  body.castShadow = true;
  group.add(body);

  // Pale cream chest/belly & white tail tuft
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), sharedDeerCreamMat);
  belly.scale.set(1.9, 0.7, 0.85);
  belly.position.set(0, 0.58, 0);
  group.add(belly);

  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 6), sharedDeerCreamMat);
  tail.position.set(-0.5, 0.74, 0);
  tail.rotation.z = 0.9;
  group.add(tail);

  const headPivot = new THREE.Group();
  headPivot.name = 'deerHeadPivot';
  headPivot.position.set(0.32, 0.78, 0);
  group.add(headPivot);
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

  // 4 Slender Jointed Legs with Hooves grounded at y=0
  [
    [-0.31, -0.13],
    [-0.31, 0.13],
    [0.29, -0.12],
    [0.29, 0.12],
  ].forEach(([lx, lz]) => {
    const upper = new THREE.Mesh(sharedDeerLegUpperGeo, sharedDeerMat);
    upper.position.set(lx, 0.42, lz);
    const lower = new THREE.Mesh(sharedDeerLegLowerGeo, sharedDeerMat);
    lower.position.set(lx, 0.17, lz);
    const hoof = new THREE.Mesh(sharedDeerHoofGeo, sharedHoofMat);
    hoof.position.set(lx, 0.025, lz);
    group.add(upper, lower, hoof);
  });

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
    normalScale: new THREE.Vector2(0.75, 0.75),
    roughness: 0.14,
    metalness: 0.32,
    transparent: true,
    opacity: 0.84,
  });
  const bankMat = new THREE.MeshStandardMaterial({
    color: 0xb89b6a,
    map: resRockMaps.map,
    normalMap: resRockMaps.normalMap,
    normalScale: new THREE.Vector2(0.8, 0.8),
    roughness: 0.94,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });
  const bridgeStoneMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    map: stoneMaps.map,
    normalMap: stoneMaps.normalMap,
    normalScale: new THREE.Vector2(0.9, 0.9),
    roughness: 0.78,
  });
  const bridgeParapetMat = new THREE.MeshStandardMaterial({
    color: 0x64748b,
    map: stoneMaps.map,
    normalMap: stoneMaps.normalMap,
    roughness: 0.85,
  });
  const cliffMat = new THREE.MeshStandardMaterial({
    color: 0x78716c,
    map: resRockMaps.map,
    normalMap: resRockMaps.normalMap,
    normalScale: new THREE.Vector2(1.35, 1.35),
    roughness: 0.92,
  });

  // River strips scaled to match wide navigable halfWidth
  layout.waterRects.forEach((wr) => {
    const dx = wr.x2 - wr.x1;
    const dz = wr.z2 - wr.z1;
    const len = Math.hypot(dx, dz);
    const angle = Math.atan2(dx, dz);
    const waterWidth = (wr.halfWidth ?? 9.8) * 2;
    const bankWidth = waterWidth + 4.4;

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
    bank.position.set((wr.x1 + wr.x2) / 2, 0.022, (wr.z1 + wr.z2) / 2);
    bank.rotation.y = angle;
    envGroup.add(bank);

    const water = new THREE.Mesh(new THREE.BoxGeometry(waterWidth, 0.08, len), waterMat);
    water.position.set((wr.x1 + wr.x2) / 2, 0.05, (wr.z1 + wr.z2) / 2);
    water.rotation.y = angle;
    envGroup.add(water);
  });

  // 3. Lake discs
  layout.waterDiscs.forEach((wd) => {
    const shore = new THREE.Mesh(new THREE.CircleGeometry(wd.radius + 1.25, 28), new THREE.MeshStandardMaterial({
      color: 0xb89b6a,
      map: resRockMaps.map,
      normalMap: resRockMaps.normalMap,
      roughness: 0.94,
    }));
    shore.rotation.x = -Math.PI / 2;
    shore.position.set(wd.x, 0.022, wd.z);
    envGroup.add(shore);

    const lake = new THREE.Mesh(new THREE.CircleGeometry(wd.radius, 28), waterMat);
    lake.rotation.x = -Math.PI / 2;
    lake.position.set(wd.x, 0.06, wd.z);
    envGroup.add(lake);
  });

  // 4. Bridges & stone fords across rivers
  layout.bridges.forEach((br, idx) => {
    const bridgeGroup = new THREE.Group();
    bridgeGroup.position.set(br.x, 0, br.z);
    bridgeGroup.rotation.y = -br.angle;

    const deckGeo = new THREE.BoxGeometry(br.halfWidth * 1.9, 0.26, br.halfLength * 2.0);
    scalePlanarBoxUVs(deckGeo, 1.5, 2.2);
    const deck = new THREE.Mesh(deckGeo, bridgeStoneMat);
    deck.position.y = 0.16;
    deck.receiveShadow = true;
    bridgeGroup.add(deck);

    if (idx === 0) {
      [-br.halfWidth * 0.9, br.halfWidth * 0.9].forEach((px) => {
        const rail = new THREE.Mesh(
          new THREE.BoxGeometry(0.4, 0.75, br.halfLength * 1.95),
          bridgeParapetMat
        );
        rail.position.set(px, 0.55, 0);
        rail.castShadow = true;
        bridgeGroup.add(rail);
      });
    }
    envGroup.add(bridgeGroup);
  });

  // 5. Highland cliffs & multi-tiered craggy rocky mesas
  const cragGeo = new THREE.DodecahedronGeometry(1, 0);
  const mossCapMat = new THREE.MeshStandardMaterial({
    color: 0x3f6212,
    map: resFoliageMaps.map,
    normalMap: resFoliageMaps.normalMap,
    roughness: 0.88,
  });
  layout.cliffDiscs.forEach((cd, cIdx) => {
    const mesa = new THREE.Mesh(cragGeo, cliffMat);
    mesa.scale.set(cd.radius * 0.98, 2.2, cd.radius * 0.92);
    mesa.position.set(cd.x, 1.15, cd.z);
    mesa.rotation.set(0.12, cIdx * 0.9, 0.08);
    mesa.castShadow = true;
    mesa.receiveShadow = true;
    envGroup.add(mesa);

    const spire = new THREE.Mesh(cragGeo, sharedStoneDarkMat);
    spire.scale.set(cd.radius * 0.62, 2.6, cd.radius * 0.58);
    spire.position.set(cd.x + 0.35, 2.8, cd.z - 0.25);
    spire.rotation.set(-0.15, cIdx * 1.4, 0.1);
    spire.castShadow = true;
    envGroup.add(spire);

    const cap = new THREE.Mesh(new THREE.CylinderGeometry(cd.radius * 0.52, cd.radius * 0.68, 0.35, 7), mossCapMat);
    cap.position.set(cd.x - 0.25, 2.45, cd.z + 0.2);
    envGroup.add(cap);
  });

  // 6. Instanced decorative shoreline & cliff-base boulders (1 draw call)
  const pebblePts: Array<{ x: number; z: number; s: number }> = [];
  layout.cliffDiscs.forEach((cd) => {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + 0.25;
      pebblePts.push({
        x: cd.x + Math.cos(a) * (cd.radius + 0.3),
        z: cd.z + Math.sin(a) * (cd.radius + 0.3),
        s: 0.7 + (k % 3) * 0.35,
      });
    }
  });
  layout.waterDiscs.forEach((wd) => {
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 + 0.12;
      pebblePts.push({
        x: wd.x + Math.cos(a) * (wd.radius + 0.9),
        z: wd.z + Math.sin(a) * (wd.radius + 0.9),
        s: 0.5 + (k % 3) * 0.28,
      });
    }
  });
  if (pebblePts.length > 0) {
    const rockGeo = new THREE.DodecahedronGeometry(0.45, 0);
    const instancedRocks = new THREE.InstancedMesh(rockGeo, sharedStoneLightMat, pebblePts.length);
    const rDummy = new THREE.Object3D();
    pebblePts.forEach((pt, idx) => {
      rDummy.position.set(pt.x, 0.16 * pt.s, pt.z);
      rDummy.scale.set(pt.s * 1.2, pt.s * 0.75, pt.s);
      rDummy.rotation.set(idx * 0.5, idx * 1.1, 0);
      rDummy.updateMatrix();
      instancedRocks.setMatrixAt(idx, rDummy.matrix);
    });
    instancedRocks.instanceMatrix.needsUpdate = true;
    envGroup.add(instancedRocks);
  }

  // 7. Instanced decorative grass tufts & wildflowers across enlarged terrain (1 draw call)
  const tuftGeo = new THREE.ConeGeometry(0.22, 0.45, 4);
  const tuftMat = new THREE.MeshStandardMaterial({ color: 0x84cc16, roughness: 0.85 });
  const tuftCount = 220;
  const instancedTufts = new THREE.InstancedMesh(tuftGeo, tuftMat, tuftCount);
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  for (let i = 0; i < tuftCount; i++) {
    const rawX = (Math.sin(i * 78.233) * 43758.5453) % 1;
    const rawZ = (Math.sin(i * 19.913) * 19283.1234) % 1;
    const tx = (rawX < 0 ? rawX + 1 : rawX) * 168 - 84;
    const tz = (rawZ < 0 ? rawZ + 1 : rawZ) * 168 - 84;
    dummy.position.set(tx, 0.22, tz);
    const scale = 0.7 + (i % 5) * 0.14;
    dummy.scale.set(scale, scale, scale);
    dummy.rotation.y = (i * 1.1) % (Math.PI * 2);
    dummy.updateMatrix();
    instancedTufts.setMatrixAt(i, dummy.matrix);
    tint.setHex(i % 7 === 0 ? 0xfacc15 : i % 5 === 0 ? 0xfb7185 : 0x65a30d);
    instancedTufts.setColorAt(i, tint);
  }
  instancedTufts.instanceMatrix.needsUpdate = true;
  if (instancedTufts.instanceColor) instancedTufts.instanceColor.needsUpdate = true;
  envGroup.add(instancedTufts);

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

// Shared Unit Sub-Geometries
const unitThighGeo = new THREE.CapsuleGeometry(0.068, 0.12, 4, 8);
const unitShinGeo = new THREE.CapsuleGeometry(0.056, 0.11, 4, 8);
const unitBootGeo = new THREE.BoxGeometry(0.12, 0.08, 0.2);
const unitArmSegmentGeo = new THREE.CapsuleGeometry(0.052, 0.18, 4, 8);
const unitHandGeo = new THREE.SphereGeometry(0.065, 8, 6);
const unitHeadGeo = new THREE.SphereGeometry(0.185, 14, 12);

const unitTunicGeo = makeLatheGeo([
  [0.24, 0.0],
  [0.21, 0.16],
  [0.19, 0.34],
  [0.23, 0.52],
  [0.14, 0.6],
  [0.01, 0.61],
], 12);

const unitBreastplateGeo = makeLatheGeo([
  [0.23, 0.0],
  [0.22, 0.2],
  [0.265, 0.42],
  [0.25, 0.58],
  [0.15, 0.64],
  [0.01, 0.65],
], 12);

const unitPauldronGeo = new THREE.SphereGeometry(0.14, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.58);
const unitStrawHatGeo = makeLatheGeo([
  [0.37, 0.0],
  [0.29, 0.06],
  [0.18, 0.13],
  [0.11, 0.22],
  [0.01, 0.27],
], 14);
const unitHelmGeo = makeLatheGeo([
  [0.22, -0.05],
  [0.24, 0.04],
  [0.22, 0.18],
  [0.16, 0.3],
  [0.01, 0.35],
], 14);

const unitShieldShape = new THREE.Shape();
unitShieldShape.moveTo(-0.22, 0.24);
unitShieldShape.lineTo(0.22, 0.24);
unitShieldShape.lineTo(0.21, -0.04);
unitShieldShape.quadraticCurveTo(0.14, -0.26, 0, -0.36);
unitShieldShape.quadraticCurveTo(-0.14, -0.26, -0.21, -0.04);
unitShieldShape.closePath();
const unitHeaterShieldGeo = makeExtrudeGeo(unitShieldShape, 0.06, 0.015, 0.015, 2, true);

const unitBowGeo = makeTubeGeo([
  [0, -0.42, -0.1],
  [0, -0.22, 0.12],
  [0, 0, 0.18],
  [0, 0.22, 0.12],
  [0, 0.42, -0.1],
], 0.028, 14, 6);

const unitMageRobeGeo = makeLatheGeo([
  [0.42, 0.0],
  [0.33, 0.32],
  [0.25, 0.68],
  [0.22, 0.94],
  [0.12, 1.06],
  [0.01, 1.08],
], 14);
const unitWizardHatGeo = makeLatheGeo([
  [0.46, 0.0],
  [0.28, 0.04],
  [0.22, 0.18],
  [0.15, 0.42],
  [0.06, 0.68],
  [0.01, 0.82],
], 14);
const unitStaffGeo = makeTubeGeo([
  [0, -0.58, 0],
  [0.02, -0.1, 0.03],
  [-0.02, 0.35, -0.02],
  [0.04, 0.72, 0.04],
], 0.036, 12, 6);

// Anatomical Equine Geometries (for Knights/Paladins)
const horseBarrelGeo = makeLatheGeo([
  [0.01, -0.68],
  [0.26, -0.58],
  [0.33, -0.26],
  [0.29, 0.08],
  [0.34, 0.44],
  [0.24, 0.64],
  [0.01, 0.7],
], 14);
horseBarrelGeo.rotateX(Math.PI / 2);

const horseNeckGeo = makeLatheGeo([
  [0.22, 0.0],
  [0.19, 0.24],
  [0.14, 0.52],
], 12);
const horseMuzzleGeo = makeLatheGeo([
  [0.01, -0.18],
  [0.145, -0.08],
  [0.13, 0.12],
  [0.09, 0.28],
  [0.065, 0.38],
  [0.01, 0.4],
], 12);
horseMuzzleGeo.rotateX(Math.PI / 2);

const horseTailGeo = makeTubeGeo([
  [0, 0, 0],
  [0, -0.14, -0.14],
  [0, -0.45, -0.2],
], 0.055, 8, 6);
const horseLegUpperGeo = new THREE.CylinderGeometry(0.085, 0.055, 0.34, 8);
const horseLegLowerGeo = new THREE.CylinderGeometry(0.052, 0.04, 0.28, 7);
const horseHoofGeo = new THREE.CylinderGeometry(0.044, 0.054, 0.07, 8);

export interface UnitVisualContext {
  age?: number;
  researchedTechIds?: string[];
  unitId?: string;
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
      : unitId === 'greek_fire_siphon'
      ? '🔥'
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

  const armorMat = new THREE.MeshStandardMaterial({
    color: colors.primary,
    map: unitArmorMaps.map,
    normalMap: unitArmorMaps.normalMap,
    normalScale: new THREE.Vector2(0.75, 0.75),
    roughness: 0.26,
    metalness: 0.58,
  });
  const fleshMat = new THREE.MeshStandardMaterial({ color: 0xf7cbb8, roughness: 0.72 });
  const steelMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    map: unitArmorMaps.map,
    normalMap: unitArmorMaps.normalMap,
    roughness: 0.16,
    metalness: 0.9,
  });
  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    map: unitClothMaps.map,
    normalMap: unitClothMaps.normalMap,
    roughness: 0.82,
  });
  const leatherMat = new THREE.MeshStandardMaterial({
    color: 0x6b3e1b,
    map: resLeatherMaps.map,
    normalMap: resLeatherMaps.normalMap,
    roughness: 0.68,
  });
  const goldTrimMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    roughness: 0.22,
    metalness: 0.88,
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

  // Hip-pivoted + knee-articulated biped legs (thigh + kneePivot(shin + boot) grounded at y=0)
  const addBipedLegs = (legMat: THREE.Material, bootMat: THREE.Material = leatherMat) => {
    const makeLeg = (hipX: number) => {
      const hipPivot = new THREE.Group();
      hipPivot.position.set(hipX, 0.36, 0);
      const thigh = new THREE.Mesh(unitThighGeo, legMat);
      thigh.position.y = -0.095;
      thigh.castShadow = true;

      const kneePivot = new THREE.Group();
      kneePivot.position.set(0, -0.175, 0);
      const shin = new THREE.Mesh(unitShinGeo, bootMat);
      shin.position.y = -0.075;
      const boot = new THREE.Mesh(unitBootGeo, bootMat);
      boot.position.set(0, -0.145, 0.04);
      kneePivot.add(shin, boot);

      hipPivot.add(thigh, kneePivot);
      group.add(hipPivot);
      return { hipPivot, kneePivot };
    };
    const left = makeLeg(-0.11);
    const right = makeLeg(0.11);
    animParts.leftLeg = left.hipPivot;
    animParts.rightLeg = right.hipPivot;
    animParts.leftKnee = left.kneePivot;
    animParts.rightKnee = right.kneePivot;
  };

  const mType = unitDef.visual.modelType;

  if (mType === 'villager') {
    addBipedLegs(darkMat, leatherMat);

    const tunicMat = new THREE.MeshStandardMaterial({
      color: unitDef.visual.color,
      map: unitClothMaps.map,
      normalMap: unitClothMaps.normalMap,
      normalScale: new THREE.Vector2(0.65, 0.65),
      roughness: 0.84,
    });
    animParts.hitMaterials.push(tunicMat);

    const torso = new THREE.Mesh(unitTunicGeo, tunicMat);
    torso.castShadow = true;
    bodyPivot.add(torso);

    // Waist leather apron belt & buckle
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.205, 0.21, 0.08, 12), leatherMat);
    belt.position.y = 0.22;
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.05), goldTrimMat);
    buckle.position.set(0, 0.22, 0.2);
    bodyPivot.add(belt, buckle);

    const head = new THREE.Mesh(unitHeadGeo, fleshMat);
    head.position.y = 0.76;
    head.castShadow = true;
    bodyPivot.add(head);

    const hat = new THREE.Mesh(unitStrawHatGeo, new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.88 }));
    hat.position.y = 0.87;
    hat.castShadow = true;
    bodyPivot.add(hat);

    // Woven wicker basket backpack
    const pack = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.15, 0.38, 10), leatherMat);
    pack.position.set(0, 0.34, -0.27);
    bodyPivot.add(pack);

    const carryBundle = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.22, 0),
      new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.55 })
    );
    carryBundle.position.set(0, 0.64, -0.3);
    carryBundle.visible = false;
    bodyPivot.add(carryBundle);
    animParts.carryBundle = carryBundle;

    // Articulated arms + Contoured Axe/Pickaxe
    rightArmPivot.position.set(0.27, 0.5, 0.02);
    bodyPivot.add(rightArmPivot);
    const rArm = new THREE.Mesh(unitArmSegmentGeo, fleshMat);
    rArm.position.set(0, -0.14, 0.05);
    const rHand = new THREE.Mesh(unitHandGeo, fleshMat);
    rHand.position.set(0, -0.26, 0.11);
    const toolHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.035, 0.72, 6), sharedWoodScaffoldMat);
    toolHandle.position.set(0.02, -0.14, 0.3);
    toolHandle.rotation.x = Math.PI / 3;
    const axeBlade = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.24, 4), steelMat);
    axeBlade.rotation.x = Math.PI / 2;
    axeBlade.scale.set(0.35, 1, 1);
    axeBlade.position.set(0.02, 0.02, 0.54);
    rightArmPivot.add(rArm, rHand, toolHandle, axeBlade);

    leftArmPivot.position.set(-0.27, 0.5, 0.02);
    bodyPivot.add(leftArmPivot);
    const lArm = new THREE.Mesh(unitArmSegmentGeo, fleshMat);
    lArm.position.set(0, -0.14, 0.04);
    leftArmPivot.add(lArm);
  } else if (mType === 'swordsman') {
    addBipedLegs(darkMat, steelMat);

    const torso = new THREE.Mesh(unitBreastplateGeo, armorMat);
    torso.castShadow = true;
    bodyPivot.add(torso);

    // Shoulder Pauldrons & Flowing Heraldic Cape
    const paulL = new THREE.Mesh(unitPauldronGeo, steelMat);
    paulL.position.set(-0.26, 0.54, 0);
    paulL.rotation.z = 0.3;
    const paulR = new THREE.Mesh(unitPauldronGeo, steelMat);
    paulR.position.set(0.26, 0.54, 0);
    paulR.rotation.z = -0.3;
    const cape = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.56, 0.05), armorMat);
    cape.position.set(0, 0.3, -0.24);
    cape.rotation.x = 0.22;
    bodyPivot.add(paulL, paulR, cape);

    // Visored Steel Sallet Helmet + Recessed Eye Slit + Plume Crest
    const helm = new THREE.Mesh(unitHelmGeo, steelMat);
    helm.position.y = 0.78;
    helm.castShadow = true;
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.045, 0.08), darkMat);
    visor.position.set(0, 0.82, 0.18);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.04, 0.1), steelMat);
    brow.position.set(0, 0.86, 0.18);
    const crest = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.32), armorMat);
    crest.position.set(0, 1.06, -0.02);
    bodyPivot.add(helm, visor, brow, crest);

    // Left Arm + Beveled Heater Shield with Brass Boss
    leftArmPivot.position.set(-0.31, 0.5, 0.04);
    bodyPivot.add(leftArmPivot);
    const lArm = new THREE.Mesh(unitArmSegmentGeo, steelMat);
    lArm.position.set(0, -0.14, 0.04);
    const shield = new THREE.Mesh(unitHeaterShieldGeo, armorMat);
    shield.rotation.y = -Math.PI / 2.4;
    shield.position.set(-0.1, -0.06, 0.14);
    const boss = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 8), goldTrimMat);
    boss.position.set(-0.14, -0.05, 0.16);
    leftArmPivot.add(lArm, shield, boss);

    // Right Arm + Crossguarded Broadsword
    rightArmPivot.position.set(0.31, 0.5, 0.04);
    bodyPivot.add(rightArmPivot);
    const rArm = new THREE.Mesh(unitArmSegmentGeo, steelMat);
    rArm.position.set(0, -0.14, 0.04);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.045, 0.06), goldTrimMat);
    guard.position.set(0.02, -0.1, 0.22);
    guard.rotation.x = Math.PI / 4;
    const blade = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.82, 4), steelMat);
    blade.scale.set(0.45, 1, 1.1);
    blade.position.set(0.02, 0.18, 0.42);
    blade.rotation.x = Math.PI / 4;
    rightArmPivot.add(rArm, guard, blade);
  } else if (mType === 'archer') {
    addBipedLegs(darkMat, leatherMat);

    const jerkinMat = new THREE.MeshStandardMaterial({
      color: unitDef.visual.color,
      map: unitClothMaps.map,
      normalMap: unitClothMaps.normalMap,
      roughness: 0.72,
    });
    animParts.hitMaterials.push(jerkinMat);

    const torso = new THREE.Mesh(unitTunicGeo, jerkinMat);
    torso.scale.set(0.92, 1, 0.92);
    torso.castShadow = true;
    bodyPivot.add(torso);

    const head = new THREE.Mesh(unitHeadGeo, fleshMat);
    head.position.y = 0.76;
    const hoodMat = new THREE.MeshStandardMaterial({ color: 0x166534, roughness: 0.78 });
    const hood = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.36, 10), hoodMat);
    hood.position.set(0, 0.92, -0.02);
    hood.rotation.x = -0.15;
    const cloak = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.58, 0.05), hoodMat);
    cloak.position.set(0, 0.32, -0.22);
    cloak.rotation.x = 0.25;
    bodyPivot.add(head, hood, cloak);

    // Leather Quiver with 3 feathered arrow fletchings
    const quiver = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.075, 0.52, 8), leatherMat);
    quiver.position.set(-0.16, 0.38, -0.23);
    quiver.rotation.z = 0.32;
    bodyPivot.add(quiver);
    [-0.03, 0, 0.03].forEach((ax, i) => {
      const fletch = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 4), goldTrimMat);
      fletch.position.set(-0.24 + ax, 0.66 + i * 0.02, -0.24);
      fletch.rotation.z = 0.32;
      bodyPivot.add(fletch);
    });

    // Left Arm + Recurved Composite Bow + Bowstring
    leftArmPivot.position.set(-0.27, 0.48, 0.1);
    bodyPivot.add(leftArmPivot);
    const lArm = new THREE.Mesh(unitArmSegmentGeo, leatherMat);
    lArm.position.set(0, -0.1, 0.12);
    lArm.rotation.x = -0.8;
    const bow = new THREE.Mesh(unitBowGeo, sharedWoodScaffoldMat);
    bow.position.set(0.06, -0.02, 0.28);
    const stringMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.82, 4), steelMat);
    stringMesh.position.set(0.06, -0.02, 0.18);
    leftArmPivot.add(lArm, bow, stringMesh);

    rightArmPivot.position.set(0.27, 0.48, 0.04);
    bodyPivot.add(rightArmPivot);
    const rArm = new THREE.Mesh(unitArmSegmentGeo, fleshMat);
    rArm.position.set(0, -0.14, 0.06);
    rightArmPivot.add(rArm);
  } else if (mType === 'knight') {
    bodyPivot.position.y = 0.0;
    const horseMat = new THREE.MeshStandardMaterial({
      color: 0x5c2b10,
      map: resFurMaps.map,
      normalMap: resFurMaps.normalMap,
      normalScale: new THREE.Vector2(0.55, 0.55),
      roughness: 0.62,
    });
    const maneMat = new THREE.MeshStandardMaterial({ color: 0x1e1b18, roughness: 0.85 });
    animParts.hitMaterials.push(horseMat);

    // Sculpted Warhorse Torso + Saddle Barding Cloth + Leather Saddle
    const horseBody = new THREE.Mesh(horseBarrelGeo, horseMat);
    horseBody.position.set(0, 0.88, 0);
    horseBody.castShadow = true;
    bodyPivot.add(horseBody);

    const barding = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.39, 0.68, 12), armorMat);
    barding.rotation.x = Math.PI / 2;
    barding.position.set(0, 0.86, 0.02);
    const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.12, 0.46), leatherMat);
    saddle.position.set(0, 1.2, -0.04);
    const tail = new THREE.Mesh(horseTailGeo, maneMat);
    tail.position.set(0, 0.98, -0.66);
    bodyPivot.add(barding, saddle, tail);
    animParts.horseTail = tail;

    // 4 Articulated Equine Legs with knee/hock pivots (front pair in leftLeg/leftKnee, hind pair in rightLeg/rightKnee)
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

    // Pivoting Arched Horse Neck + Head + Muzzle + Ears + Chamfron + Mane
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
    const chamfron = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.28), steelMat);
    chamfron.position.set(0, 0.51, 0.3);
    chamfron.rotation.x = 0.48;
    const mane = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.48, 0.14), maneMat);
    mane.position.set(0, 0.26, 0.02);
    mane.rotation.x = 0.48;
    horseHeadPivot.add(hNeck, hHead, chamfron, mane);

    [-0.08, 0.08].forEach((ez) => {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.14, 5), horseMat);
      ear.position.set(ez, 0.58, 0.16);
      horseHeadPivot.add(ear);
    });

    // Seated Armored Rider with Pauldrons, Plumed Helm, Heater Shield & Lance + Pennant
    const rider = new THREE.Mesh(unitBreastplateGeo, armorMat);
    rider.position.set(0, 1.18, -0.04);
    rider.castShadow = true;
    bodyPivot.add(rider);

    const rPaulL = new THREE.Mesh(unitPauldronGeo, steelMat);
    rPaulL.position.set(-0.26, 1.72, -0.04);
    const rPaulR = new THREE.Mesh(unitPauldronGeo, steelMat);
    rPaulR.position.set(0.26, 1.72, -0.04);
    const helm = new THREE.Mesh(unitHelmGeo, steelMat);
    helm.position.set(0, 1.88, -0.04);
    const plume = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.34, 6), goldTrimMat);
    plume.rotation.x = -0.8;
    plume.position.set(0, 2.22, -0.14);
    bodyPivot.add(rPaulL, rPaulR, helm, plume);

    leftArmPivot.position.set(-0.3, 1.66, 0.04);
    bodyPivot.add(leftArmPivot);
    const shield = new THREE.Mesh(unitHeaterShieldGeo, armorMat);
    shield.rotation.y = -Math.PI / 2.2;
    shield.position.set(-0.08, -0.08, 0.12);
    leftArmPivot.add(shield);

    rightArmPivot.position.set(0.32, 1.66, 0.06);
    bodyPivot.add(rightArmPivot);
    const lanceShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.055, 2.05, 8), sharedWoodScaffoldMat);
    lanceShaft.rotation.x = Math.PI / 2.25;
    lanceShaft.position.set(0.05, 0.02, 0.62);
    const lanceTip = new THREE.Mesh(new THREE.ConeGeometry(0.068, 0.38, 6), steelMat);
    lanceTip.rotation.x = Math.PI / 2.25;
    lanceTip.position.set(0.05, 0.18, 1.66);
    const pennant = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.18, 0.44), goldTrimMat);
    pennant.position.set(0.05, 0.11, 1.3);
    rightArmPivot.add(lanceShaft, lanceTip, pennant);
  } else if (mType === 'ninja') {
    addBipedLegs(darkMat, darkMat);

    const torso = new THREE.Mesh(unitTunicGeo, darkMat);
    torso.scale.set(0.92, 1, 0.9);
    torso.castShadow = true;
    bodyPivot.add(torso);

    // Shinobi Scarf Collar, Chest Vest & Crossed Katana Scabbard
    const scarfMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.65 });
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.055, 6, 12), scarfMat);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 0.6;
    const scarfTail = new THREE.Mesh(
      makeTubeGeo([
        [0, 0.56, -0.18],
        [0.08, 0.45, -0.45],
        [-0.05, 0.36, -0.68],
      ], 0.05, 8, 5),
      scarfMat
    );
    const katanaSaya = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.85, 6), leatherMat);
    katanaSaya.position.set(0.02, 0.42, -0.2);
    katanaSaya.rotation.z = 0.68;
    bodyPivot.add(collar, scarfTail, katanaSaya);

    const head = new THREE.Mesh(unitHeadGeo, fleshMat);
    head.position.y = 0.76;
    const mask = new THREE.Mesh(new THREE.CylinderGeometry(0.195, 0.19, 0.16, 12), darkMat);
    mask.position.y = 0.72;
    const headband = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.09, 0.05), steelMat);
    headband.position.set(0, 0.83, 0.18);
    bodyPivot.add(head, mask, headband);

    rightArmPivot.position.set(0.28, 0.48, 0.06);
    bodyPivot.add(rightArmPivot);
    const rArm = new THREE.Mesh(unitArmSegmentGeo, darkMat);
    rArm.position.set(0, -0.14, 0.05);
    const kunai1 = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.34, 4), steelMat);
    kunai1.position.set(0.02, -0.18, 0.24);
    kunai1.rotation.x = Math.PI / 2;
    rightArmPivot.add(rArm, kunai1);

    leftArmPivot.position.set(-0.28, 0.48, 0.06);
    bodyPivot.add(leftArmPivot);
    const lArm = new THREE.Mesh(unitArmSegmentGeo, darkMat);
    lArm.position.set(0, -0.14, 0.05);
    const kunai2 = kunai1.clone();
    leftArmPivot.add(lArm, kunai2);
  } else if (mType === 'saiyan') {
    addBipedLegs(darkMat, steelMat);

    const giMat = new THREE.MeshStandardMaterial({
      color: 0xea580c,
      map: unitClothMaps.map,
      normalMap: unitClothMaps.normalMap,
      roughness: 0.72,
    });
    animParts.hitMaterials.push(giMat);

    const torso = new THREE.Mesh(unitBreastplateGeo, giMat);
    torso.castShadow = true;
    bodyPivot.add(torso);

    // Saiyan Shoulder Armor Pads & Blue Waist Sash
    const sash = new THREE.Mesh(new THREE.CylinderGeometry(0.215, 0.22, 0.1, 12), armorMat);
    sash.position.y = 0.2;
    const padL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.28), goldTrimMat);
    padL.position.set(-0.28, 0.56, 0);
    padL.rotation.z = 0.35;
    const padR = padL.clone();
    padR.position.set(0.28, 0.56, 0);
    padR.rotation.z = -0.35;
    bodyPivot.add(sash, padL, padR);

    const head = new THREE.Mesh(unitHeadGeo, fleshMat);
    head.position.y = 0.76;
    bodyPivot.add(head);

    // Layered Sculpted Golden Super Saiyan Hair Spikes
    const hairMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      roughness: 0.18,
      emissive: 0x854d0e,
    });
    for (let i = 0; i < 8; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.44, 5), hairMat);
      const angle = (i * Math.PI) / 4;
      const rad = i % 2 === 0 ? 0.16 : 0.08;
      spike.position.set(Math.cos(angle) * rad, 1.0 + (i % 2) * 0.08, Math.sin(angle) * rad);
      spike.rotation.z = -Math.cos(angle) * 0.45;
      spike.rotation.x = Math.sin(angle) * 0.45;
      bodyPivot.add(spike);
    }

    rightArmPivot.position.set(0.3, 0.48, 0.04);
    bodyPivot.add(rightArmPivot);
    const rArm = new THREE.Mesh(unitArmSegmentGeo, fleshMat);
    rArm.position.set(0, -0.14, 0.05);
    const fistR = new THREE.Mesh(unitHandGeo, armorMat);
    fistR.position.set(0, -0.25, 0.12);
    rightArmPivot.add(rArm, fistR);

    leftArmPivot.position.set(-0.3, 0.48, 0.04);
    bodyPivot.add(leftArmPivot);
    const lArm = new THREE.Mesh(unitArmSegmentGeo, fleshMat);
    lArm.position.set(0, -0.14, 0.05);
    const fistL = new THREE.Mesh(unitHandGeo, armorMat);
    fistL.position.set(0, -0.25, 0.12);
    leftArmPivot.add(lArm, fistL);

    const aura = new THREE.Mesh(
      new THREE.TorusGeometry(0.52, 0.05, 8, 20),
      new THREE.MeshBasicMaterial({ color: 0xfef08a, transparent: true, opacity: 0.78 })
    );
    aura.rotation.x = Math.PI / 2;
    aura.position.y = 0.12;
    group.add(aura);
    animParts.auraMesh = aura;
  } else if (mType === 'mage') {
    addBipedLegs(darkMat, leatherMat);
    bodyPivot.position.y = 0.24;
    const robeMat = new THREE.MeshStandardMaterial({
      color: unitDef.visual.color,
      map: unitClothMaps.map,
      normalMap: unitClothMaps.normalMap,
      roughness: 0.62,
    });
    animParts.hitMaterials.push(robeMat);

    const robe = new THREE.Mesh(unitMageRobeGeo, robeMat);
    robe.position.y = 0.02;
    robe.scale.set(0.95, 0.94, 0.95);
    robe.castShadow = true;
    bodyPivot.add(robe);
    animParts.robeSkirt = robe;

    const sash = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.68, 0.06), goldTrimMat);
    sash.position.set(0, 0.44, 0.24);
    sash.rotation.x = -0.14;
    const head = new THREE.Mesh(unitHeadGeo, fleshMat);
    head.position.y = 1.09;
    const beard = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.28, 6), new THREE.MeshStandardMaterial({ color: 0xf1f5f9 }));
    beard.rotation.x = Math.PI;
    beard.position.set(0, 0.95, 0.14);
    const hat = new THREE.Mesh(unitWizardHatGeo, new THREE.MeshStandardMaterial({ color: 0x6d28d9, roughness: 0.5 }));
    hat.position.y = 1.18;
    hat.castShadow = true;
    bodyPivot.add(sash, head, beard, hat);

    leftArmPivot.position.set(-0.3, 0.76, 0.06);
    bodyPivot.add(leftArmPivot);
    const lArm = new THREE.Mesh(unitArmSegmentGeo, robeMat);
    lArm.position.set(0, -0.14, 0.05);
    const lHand = new THREE.Mesh(unitHandGeo, fleshMat);
    lHand.position.set(0, -0.26, 0.1);
    const spellTome = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.18, 0.05), goldTrimMat);
    spellTome.position.set(0.02, -0.24, 0.16);
    leftArmPivot.add(lArm, lHand, spellTome);

    rightArmPivot.position.set(0.32, 0.78, 0.08);
    bodyPivot.add(rightArmPivot);
    const staff = new THREE.Mesh(unitStaffGeo, sharedWoodScaffoldMat);
    staff.position.set(0.02, 0.05, 0.12);
    const cradle = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.022, 6, 12), goldTrimMat);
    cradle.position.set(0.06, 0.79, 0.16);
    const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.14, 0), new THREE.MeshBasicMaterial({ color: 0x38bdf8 }));
    orb.position.set(0.06, 0.85, 0.16);
    rightArmPivot.add(staff, cradle, orb);
    animParts.auraMesh = orb;
  } else if (mType === 'ram') {
    // Era II Armored Timber & Boiled-Hide Battering Ram on 4 Spoked Wheels
    bodyPivot.position.y = 0.0;
    const timberMat = sharedWoodScaffoldMat;
    const ironMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.35, metalness: 0.85 });
    const hideMat = leatherMat;
    const wheels: THREE.Object3D[] = [];

    // Heavy Timber Chassis + Side Beams
    [-0.4, 0.4].forEach((bx) => {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 1.52), timberMat);
      beam.position.set(bx, 0.3, 0);
      beam.castShadow = true;
      bodyPivot.add(beam);
    });
    [-0.48, 0.48].forEach((az) => {
      const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.08, 8), ironMat);
      axle.rotation.z = Math.PI / 2;
      axle.position.set(0, 0.24, az);
      bodyPivot.add(axle);

      [-0.54, 0.54].forEach((wx) => {
        const wheelPivot = new THREE.Group();
        wheelPivot.position.set(wx, 0.24, az);
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.09, 12), timberMat);
        wheel.rotation.z = Math.PI / 2;
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.025, 6, 12), ironMat);
        rim.rotation.y = Math.PI / 2;
        const spoke1 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.44, 0.045), ironMat);
        const spoke2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.045, 0.44), ironMat);
        wheelPivot.add(wheel, rim, spoke1, spoke2);
        group.add(wheelPivot);
        wheels.push(wheelPivot);
      });
    });
    animParts.wheels = wheels;

    // Pitched Arrow-Proof Roof Shed
    const roofShape = new THREE.Shape();
    roofShape.moveTo(-0.56, 0);
    roofShape.lineTo(0.56, 0);
    roofShape.lineTo(0.32, 0.65);
    roofShape.lineTo(-0.32, 0.65);
    roofShape.closePath();
    const shedRoof = new THREE.Mesh(makeExtrudeGeo(roofShape, 1.48, 0.02, 0.02, 1, true), hideMat);
    shedRoof.position.set(0, 0.38, 0);
    shedRoof.castShadow = true;
    bodyPivot.add(shedRoof);

    // Iron-banded corner posts + faction shield banner
    [-0.38, 0.38].forEach((sx) => {
      [-0.58, 0.58].forEach((sz) => {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.58, 0.08), ironMat);
        post.position.set(sx, 0.66, sz);
        bodyPivot.add(post);
      });
    });

    // Swinging Heavy Iron-Headed Battering Log driven by rightArmPivot
    rightArmPivot.position.set(0, 0.62, 0);
    bodyPivot.add(rightArmPivot);
    const ramLog = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 1.85, 10), timberMat);
    ramLog.rotation.x = Math.PI / 2;
    ramLog.position.set(0, -0.1, 0.14);
    ramLog.castShadow = true;
    const ramHead = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.16, 0.34, 8), steelMat);
    ramHead.rotation.x = Math.PI / 2;
    ramHead.position.set(0, -0.1, 1.02);
    const ramTip = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.28, 8), steelMat);
    ramTip.rotation.x = Math.PI / 2;
    ramTip.position.set(0, -0.1, 1.31);
    rightArmPivot.add(ramLog, ramHead, ramTip);
  } else if (mType === 'cannon') {
    // Era IV Imperial Bombard Cannon on Heavy Oak Artillery Carriage
    bodyPivot.position.y = 0.0;
    const timberMat = sharedWoodScaffoldMat;
    const ironMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.32, metalness: 0.88 });
    const bronzeMat = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.25, metalness: 0.86 });
    const wheels: THREE.Object3D[] = [];

    // Heavy Gun Carriage Cheeks & Trail
    [-0.24, 0.24].forEach((cx) => {
      const cheek = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.36, 1.25), timberMat);
      cheek.position.set(cx, 0.38, -0.16);
      cheek.rotation.x = 0.12;
      cheek.castShadow = true;
      bodyPivot.add(cheek);
    });
    const trailBrace = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.14, 0.24), ironMat);
    trailBrace.position.set(0, 0.28, -0.72);
    bodyPivot.add(trailBrace);

    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.15, 8), ironMat);
    axle.rotation.z = Math.PI / 2;
    axle.position.set(0, 0.34, 0.24);
    bodyPivot.add(axle);

    [-0.56, 0.56].forEach((wx) => {
      const wheelPivot = new THREE.Group();
      wheelPivot.position.set(wx, 0.34, 0.24);
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.1, 14), timberMat);
      wheel.rotation.z = Math.PI / 2;
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.032, 6, 14), ironMat);
      rim.rotation.y = Math.PI / 2;
      const spoke1 = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.62, 0.05), timberMat);
      const spoke2 = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.05, 0.62), timberMat);
      wheelPivot.add(wheel, rim, spoke1, spoke2);
      group.add(wheelPivot);
      wheels.push(wheelPivot);
    });
    animParts.wheels = wheels;

    // Banded Bronze Cannon Barrel (recoils subtly via rightArmPivot)
    rightArmPivot.position.set(0, 0.58, 0.18);
    bodyPivot.add(rightArmPivot);
    const barrel = new THREE.Mesh(
      makeLatheGeo([
        [0.01, -0.62],
        [0.21, -0.58],
        [0.19, -0.1],
        [0.15, 0.55],
        [0.18, 0.72],
        [0.14, 0.75],
      ], 14),
      bronzeMat
    );
    barrel.rotation.x = Math.PI / 2 - 0.14;
    barrel.position.set(0, 0.06, 0.18);
    barrel.castShadow = true;
    const band1 = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 12), goldTrimMat);
    band1.rotation.x = Math.PI / 2 - 0.14;
    band1.position.set(0, 0.04, 0.02);
    const band2 = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.08, 12), goldTrimMat);
    band2.rotation.x = Math.PI / 2 - 0.14;
    band2.position.set(0, 0.09, 0.44);
    rightArmPivot.add(barrel, band1, band2);
  } else if (unitDef.id === 'catapult' || unitDef.category === 'siege') {
    // Realistic Wheeled Wooden Medieval Siege Trebuchet / Catapult
    bodyPivot.position.y = 0.0;
    const timberMat = sharedWoodScaffoldMat;
    const ironMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.35, metalness: 0.85 });
    const wheels: THREE.Object3D[] = [];

    // Heavy Timber Chassis Beams
    [-0.38, 0.38].forEach((bx) => {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 1.45), timberMat);
      rail.position.set(bx, 0.32, 0);
      rail.castShadow = true;
      bodyPivot.add(rail);
    });
    [-0.5, 0.5].forEach((az) => {
      const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.05, 8), ironMat);
      axle.rotation.z = Math.PI / 2;
      axle.position.set(0, 0.24, az);
      bodyPivot.add(axle);

      [-0.52, 0.52].forEach((wx) => {
        const wheelPivot = new THREE.Group();
        wheelPivot.position.set(wx, 0.24, az);
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.09, 12), timberMat);
        wheel.rotation.z = Math.PI / 2;
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.025, 6, 12), ironMat);
        rim.rotation.y = Math.PI / 2;
        const spoke1 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.44, 0.045), ironMat);
        const spoke2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.045, 0.44), ironMat);
        wheelPivot.add(wheel, rim, spoke1, spoke2);
        group.add(wheelPivot);
        wheels.push(wheelPivot);
      });
    });
    animParts.wheels = wheels;

    // A-Frame Upright Towers
    [-0.36, 0.36].forEach((tx) => {
      const fStrut = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.92, 0.1), timberMat);
      fStrut.position.set(tx, 0.72, 0.2);
      fStrut.rotation.x = 0.26;
      const bStrut = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.92, 0.1), timberMat);
      bStrut.position.set(tx, 0.72, -0.2);
      bStrut.rotation.x = -0.26;
      bodyPivot.add(fStrut, bStrut);
    });
    const crossbar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.9, 8), ironMat);
    crossbar.rotation.z = Math.PI / 2;
    crossbar.position.set(0, 1.08, 0);
    bodyPivot.add(crossbar);

    // Pivoting Throwing Arm + Boulder Payload via rightArmPivot
    rightArmPivot.position.set(0, 1.08, 0);
    bodyPivot.add(rightArmPivot);
    const armBeam = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 1.35), timberMat);
    armBeam.position.set(0, 0.05, -0.18);
    armBeam.rotation.x = -0.35;
    const spoon = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.12, 0.14, 10), ironMat);
    spoon.position.set(0, 0.3, -0.78);
    const boulder = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16, 0), sharedStoneDarkMat);
    boulder.position.set(0, 0.42, -0.78);
    const counterweight = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.26, 0.24), sharedStoneLightMat);
    counterweight.position.set(0, -0.2, 0.44);
    rightArmPivot.add(armBeam, spoon, boulder, counterweight);
  } else if (mType === 'boat') {
    const oakMat = sharedWoodScaffoldMat;
    const trimMat = new THREE.MeshStandardMaterial({ color: colors.primary, roughness: 0.45 });
    const isTransport = unitId === 'transport_boat';

    if (isTransport) {
      // Wide flat-bottom troop barge — distinct from fishing sailboat
      bodyPivot.position.y = 0.06;
      const bargeMat = new THREE.MeshStandardMaterial({
        color: flags.imperial ? 0x57534e : flags.eliteTrim ? 0x78716c : 0x92400e,
        roughness: 0.7,
        metalness: 0.08,
      });
      animParts.hitMaterials.push(bargeMat);
      const hull = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.32, 1.85), bargeMat);
      hull.position.set(0, 0.28, 0);
      hull.castShadow = true;
      // Bow/stern taper blocks
      const bow = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.28, 0.35), bargeMat);
      bow.position.set(0, 0.26, 0.95);
      const stern = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.28, 0.3), bargeMat);
      stern.position.set(0, 0.26, -0.95);
      const deck = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.06, 1.7), leatherMat);
      deck.position.set(0, 0.46, 0);
      bodyPivot.add(hull, bow, stern, deck);

      // Troop benches
      [-0.28, 0.28].forEach((bx) => {
        const bench = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 1.2), oakMat);
        bench.position.set(bx, 0.54, 0);
        bodyPivot.add(bench);
      });
      // Side shields / gunwales (faction color)
      [-0.58, 0.58].forEach((sx, i) => {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.28, 1.5), trimMat);
        rail.position.set(sx, 0.58, 0);
        bodyPivot.add(rail);
        if (flags.eliteTrim || flags.plateArmor) {
          const shield = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.34, 0.28), armorMat);
          shield.position.set(sx * 1.05, 0.72, i === 0 ? -0.35 : 0.35);
          bodyPivot.add(shield);
        }
      });
      // Boarding ramp (front)
      const ramp = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.05, 0.7), oakMat);
      ramp.position.set(0, 0.38, 1.15);
      ramp.rotation.x = -0.35;
      bodyPivot.add(ramp);
      // Short mast + signal flag (not a fishing sail)
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.1, 6), oakMat);
      mast.position.set(0, 1.0, -0.4);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.28), trimMat);
      flag.position.set(0.28, 1.45, -0.4);
      bodyPivot.add(mast, flag);
      if (flags.siegeEngineers || flags.imperial) {
        const ironBand = new THREE.Mesh(
          new THREE.TorusGeometry(0.55, 0.04, 6, 16),
          new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.7, roughness: 0.35 })
        );
        ironBand.rotation.x = Math.PI / 2;
        ironBand.position.set(0, 0.42, 0);
        bodyPivot.add(ironBand);
      }
      // Iconic oars on sides
      rightArmPivot.position.set(0.7, 0.5, 0.2);
      bodyPivot.add(rightArmPivot);
      const oar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 1.1, 5), oakMat);
      oar.rotation.z = Math.PI / 2.2;
      rightArmPivot.add(oar);
    } else {
      // Fishing vessel — pointed hull, tall sail, lantern, net boom
      bodyPivot.position.y = 0.08;
      const sailMat = new THREE.MeshStandardMaterial({
        color: flags.imperial ? 0xfef3c7 : 0xf8fafc,
        map: unitClothMaps.map,
        side: THREE.DoubleSide,
        roughness: 0.68,
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
          12
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
      const yard = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.96, 6), oakMat);
      yard.rotation.z = Math.PI / 2;
      yard.position.set(0, 1.66, 0.08);
      const sail = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.92, 4, 4), sailMat);
      sail.position.set(0, 1.18, 0.14);
      const emblem = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.02), trimMat);
      emblem.position.set(0, 1.2, 0.155);
      bodyPivot.add(mast, yard, sail, emblem);

      const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), lanternMat);
      lantern.position.set(0, 0.55, 0.96);
      bodyPivot.add(lantern);

      if (flags.forgedWeapons || flags.age >= 3) {
        const netPile = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.05, 6, 10), leatherMat);
        netPile.position.set(-0.2, 0.48, 0.4);
        bodyPivot.add(netPile);
      }

      rightArmPivot.position.set(-0.34, 0.42, 0.15);
      bodyPivot.add(rightArmPivot);
      const netPole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.85, 6), oakMat);
      netPole.rotation.z = 0.55;
      netPole.position.set(-0.22, 0.12, 0.18);
      rightArmPivot.add(netPole);
    }
  } else {
    // Ancient Living Treant / Guardian Colossus
    const barkMat = new THREE.MeshStandardMaterial({
      color: unitDef.visual.color,
      map: resBarkMaps.map,
      normalMap: resBarkMaps.normalMap,
      normalScale: new THREE.Vector2(1.2, 1.2),
      roughness: 0.92,
    });
    animParts.hitMaterials.push(barkMat);
    addBipedLegs(barkMat, barkMat);

    const torso = new THREE.Mesh(
      makeLatheGeo([
        [0.38, 0.0],
        [0.32, 0.32],
        [0.44, 0.72],
        [0.36, 1.05],
        [0.18, 1.18],
        [0.01, 1.2],
      ], 9),
      barkMat
    );
    torso.castShadow = true;
    bodyPivot.add(torso);

    // Mossy Canopy Crown & Shoulder Boughs
    const foliageCrown = new THREE.Mesh(sharedOakBoughGeo, sharedBushLeafMat);
    foliageCrown.scale.set(0.68, 0.46, 0.62);
    foliageCrown.position.set(0, 1.26, -0.05);
    bodyPivot.add(foliageCrown);

    leftArmPivot.position.set(-0.48, 0.85, 0);
    bodyPivot.add(leftArmPivot);
    const lBranch = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.68, 7), barkMat);
    lBranch.position.set(-0.04, -0.25, 0);
    const lFist = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22), barkMat);
    lFist.position.set(-0.05, -0.58, 0.04);
    leftArmPivot.add(lBranch, lFist);

    rightArmPivot.position.set(0.48, 0.85, 0);
    bodyPivot.add(rightArmPivot);
    const rBranch = lBranch.clone();
    rBranch.position.set(0.04, -0.25, 0);
    const rFist = lFist.clone();
    rFist.position.set(0.05, -0.58, 0.04);
    rightArmPivot.add(rBranch, rFist);

    const eyeGlow = new THREE.MeshBasicMaterial({ color: 0x4ade80 });
    [-0.12, 0.12].forEach((ex) => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.065, 6, 6), eyeGlow);
      eye.position.set(ex, 0.92, 0.34);
      bodyPivot.add(eye);
    });
  }


  // --- Age / tech silhouette upgrades (shared accents) ---
  if (flags.eliteTrim || flags.plateArmor || flags.forgedWeapons || flags.imperial) {
    const accent = new THREE.MeshStandardMaterial({
      color: flags.imperial ? 0xfbbf24 : flags.plateArmor ? 0xcbd5e1 : colors.primary,
      metalness: flags.plateArmor ? 0.75 : 0.35,
      roughness: 0.35,
    });
    if (mType === 'swordsman' || mType === 'knight' || mType === 'ninja' || mType === 'saiyan') {
      if (flags.eliteTrim || flags.imperial) {
        const plume = new THREE.Mesh(new THREE.ConeGeometry(0.06 * s, 0.28 * s, 5), accent);
        plume.position.set(0, 1.22 * s, -0.02);
        plume.name = 'agePlume';
        bodyPivot.add(plume);
      }
      if (flags.plateArmor) {
        const gorget = new THREE.Mesh(new THREE.TorusGeometry(0.16 * s, 0.035 * s, 6, 12), accent);
        gorget.rotation.x = Math.PI / 2;
        gorget.position.set(0, 0.62 * s, 0.05);
        bodyPivot.add(gorget);
      }
      if (flags.forgedWeapons) {
        const edgeGlow = new THREE.Mesh(
          new THREE.BoxGeometry(0.04 * s, 0.5 * s, 0.04 * s),
          new THREE.MeshBasicMaterial({ color: flags.imperial ? 0xfde68a : 0x93c5fd })
        );
        edgeGlow.position.set(0.42 * s, 0.35 * s, 0.15 * s);
        edgeGlow.name = 'weaponGlow';
        bodyPivot.add(edgeGlow);
      }
    }
    if (mType === 'archer' && (flags.eliteTrim || flags.age >= 2)) {
      const quiverCap = new THREE.Mesh(new THREE.CylinderGeometry(0.08 * s, 0.09 * s, 0.12 * s, 6), accent);
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


  // Unique unit silhouettes (always on)
  if (unitId === 'greek_fire_siphon' && mType === 'cannon') {
    const nozzle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07 * s, 0.13 * s, 0.6 * s, 8),
      new THREE.MeshStandardMaterial({ color: 0xea580c, metalness: 0.55, roughness: 0.38 })
    );
    nozzle.rotation.z = Math.PI / 2;
    nozzle.position.set(0.5 * s, 0.55 * s, 0.15 * s);
    const tank = new THREE.Mesh(
      new THREE.SphereGeometry(0.24 * s, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0x44403c, metalness: 0.4, roughness: 0.5 })
    );
    tank.position.set(-0.2 * s, 0.48 * s, -0.12 * s);
    bodyPivot.add(nozzle, tank);
  }

  group.userData.animParts = animParts;
  group.userData.visualFlags = flags;
  group.userData.visualUnitId = unitId;
  group.scale.set(s, s, s);
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
