import * as THREE from 'three';
import { MapPresetId } from '../types/game';

export interface PBRMapSet {
  map: THREE.Texture;
  normalMap: THREE.DataTexture;
  roughnessMap?: THREE.DataTexture;
}

function hash2D(ix: number, iy: number, period: number, seed: number): number {
  const x = ((ix % period) + period) % period;
  const y = ((iy % period) + period) % period;
  let n = x * 374761393 + y * 668265263 + seed * 1442695041;
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Seamless periodic value noise in [0, 1] over [0, 1) UV space.
 */
function periodicNoise(u: number, v: number, period: number, seed: number): number {
  const x = u * period;
  const y = v * period;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = smoothstep(x - ix);
  const fy = smoothstep(y - iy);

  const v00 = hash2D(ix, iy, period, seed);
  const v10 = hash2D(ix + 1, iy, period, seed);
  const v01 = hash2D(ix, iy + 1, period, seed);
  const v11 = hash2D(ix + 1, iy + 1, period, seed);

  return lerp(lerp(v00, v10, fx), lerp(v01, v11, fx), fy);
}

function periodicFbm(u: number, v: number, basePeriod: number, octaves: number, seed: number): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let freq = basePeriod;
  for (let o = 0; o < octaves; o++) {
    sum += amp * periodicNoise(u, v, freq, seed + o * 31);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

/**
 * Converts a scalar heightfield [0..1] of size WxH into a seamless tangent-space Normal DataTexture.
 */
function heightToNormalDataTexture(
  heights: Float32Array,
  width: number,
  height: number,
  strength: number,
  repeatX = 1,
  repeatY = 1
): THREE.DataTexture {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const ym = (y - 1 + height) % height;
    const yp = (y + 1) % height;
    for (let x = 0; x < width; x++) {
      const xm = (x - 1 + width) % width;
      const xp = (x + 1) % width;

      const hL = heights[y * width + xm];
      const hR = heights[y * width + xp];
      const hD = heights[ym * width + x];
      const hU = heights[yp * width + x];

      const dx = (hL - hR) * strength;
      const dy = (hD - hU) * strength;
      const dz = 1.0;
      const invLen = 1 / Math.hypot(dx, dy, dz);

      const idx = (y * width + x) * 4;
      data[idx] = Math.round((dx * invLen * 0.5 + 0.5) * 255);
      data[idx + 1] = Math.round((dy * invLen * 0.5 + 0.5) * 255);
      data[idx + 2] = Math.round((dz * invLen * 0.5 + 0.5) * 255);
      data[idx + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = 4;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

function makeColorDataTexture(
  rgba: Uint8Array,
  width: number,
  height: number,
  repeatX = 1,
  repeatY = 1,
  isColor = true
): THREE.DataTexture {
  const tex = new THREE.DataTexture(rgba, width, height, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = 4;
  tex.generateMipmaps = true;
  if (isColor) {
    tex.colorSpace = THREE.SRGBColorSpace;
  }
  tex.needsUpdate = true;
  return tex;
}

// ---------------- CACHED PBR TEXTURE POOLS ----------------

const terrainCache = new Map<MapPresetId, PBRMapSet>();

export function getTerrainPBRMaps(preset: MapPresetId = 'river_valley'): PBRMapSet {
  const cached = terrainCache.get(preset);
  if (cached) return cached;

  const size = 512;
  const colorData = new Uint8Array(size * size * 4);
  const roughData = new Uint8Array(size * size * 4);
  const heights = new Float32Array(size * size);

  const seed = preset === 'river_valley' ? 101 : preset === 'highland_basin' ? 202 : 303;
  const repeat = 10;

  // Biome palette triples: [deepMoss, mainGrass, sunMeadow] + earth/pebble undertones
  const palette =
    preset === 'highland_basin'
      ? {
          a: [58, 70, 30],
          b: [88, 102, 44],
          c: [128, 126, 86],
          soil: [92, 78, 56],
        }
      : preset === 'twin_lakes'
      ? {
          a: [30, 72, 38],
          b: [52, 102, 50],
          c: [92, 138, 68],
          soil: [66, 80, 48],
        }
      : {
          a: [38, 74, 24],
          b: [68, 110, 36],
          c: [110, 146, 52],
          soil: [82, 74, 46],
        };

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const macro = periodicFbm(u, v, 3, 4, seed);
      const mid = periodicFbm(u, v, 7, 3, seed + 29);
      const micro = periodicFbm(u * 2.0, v * 2.0, 12, 3, seed + 55);
      // Multi-directional fine grass blades & clover tufts
      const bladesA = periodicNoise(u * 2.5, v * 0.7, 36, seed + 99);
      const bladesB = periodicNoise(u * 0.8, v * 2.2, 40, seed + 137);
      const blades = bladesA * 0.6 + bladesB * 0.4;
      const pebble = periodicNoise(u, v, 32, seed + 177);
      const flowerFlecks = periodicNoise(u, v, 48, seed + 241);

      const h = macro * 0.45 + mid * 0.22 + micro * 0.16 + blades * 0.17 + (pebble > 0.82 ? 0.16 : 0);
      heights[y * size + x] = h;

      let r: number;
      let g: number;
      let b: number;

      const blendT = macro * 0.7 + mid * 0.3;
      if (blendT < 0.46) {
        const t = blendT / 0.46;
        r = lerp(palette.a[0], palette.b[0], t);
        g = lerp(palette.a[1], palette.b[1], t);
        b = lerp(palette.a[2], palette.b[2], t);
      } else {
        const t = (blendT - 0.46) / 0.54;
        r = lerp(palette.b[0], palette.c[0], t);
        g = lerp(palette.b[1], palette.c[1], t);
        b = lerp(palette.b[2], palette.c[2], t);
      }

      // Organic loamy soil patches & subtle clover/dandelion flecks
      if (micro < 0.34) {
        const soilMix = (0.34 - micro) * 1.7;
        r = lerp(r, palette.soil[0], Math.min(0.68, soilMix));
        g = lerp(g, palette.soil[1], Math.min(0.68, soilMix));
        b = lerp(b, palette.soil[2], Math.min(0.68, soilMix));
      } else if (flowerFlecks > 0.91 && macro > 0.42) {
        r = lerp(r, 185, 0.35);
        g = lerp(g, 195, 0.35);
        b = lerp(b, 95, 0.25);
      }

      // Highlight weathered pebbles
      if (pebble > 0.84 && micro < 0.48) {
        r = lerp(r, 148, 0.45);
        g = lerp(g, 144, 0.45);
        b = lerp(b, 128, 0.45);
      }

      const bladeShade = (blades - 0.5) * 32;
      const idx = (y * size + x) * 4;
      colorData[idx] = Math.max(0, Math.min(255, Math.round(r + bladeShade)));
      colorData[idx + 1] = Math.max(0, Math.min(255, Math.round(g + bladeShade * 1.05)));
      colorData[idx + 2] = Math.max(0, Math.min(255, Math.round(b + bladeShade * 0.65)));
      colorData[idx + 3] = 255;

      const roughByte = Math.max(
        168,
        Math.min(252, Math.round(238 - blades * 42 + (micro < 0.34 ? 14 : 0) - (pebble > 0.84 ? 22 : 0)))
      );
      roughData[idx] = roughByte;
      roughData[idx + 1] = roughByte;
      roughData[idx + 2] = roughByte;
      roughData[idx + 3] = 255;
    }
  }

  const map = makeColorDataTexture(colorData, size, size, repeat, repeat, true);
  const normalMap = heightToNormalDataTexture(heights, size, size, 4.4, repeat, repeat);
  const roughnessMap = makeColorDataTexture(roughData, size, size, repeat, repeat, false);

  const result = { map, normalMap, roughnessMap };
  terrainCache.set(preset, result);
  return result;
}

let stoneCache: PBRMapSet | null = null;
export function getStoneMasonryMaps(): PBRMapSet {
  if (stoneCache) return stoneCache;

  const size = 256;
  const colorData = new Uint8Array(size * size * 4);
  const heights = new Float32Array(size * size);
  const rows = 8;
  const cols = 4;

  for (let y = 0; y < size; y++) {
    const v = y / size;
    const row = Math.floor(v * rows);
    const fy = v * rows - row;
    const offset = row % 2 === 1 ? 0.5 : 0;

    for (let x = 0; x < size; x++) {
      const u = x / size;
      const shiftedU = (u * cols + offset) % cols;
      const col = Math.floor(shiftedU);
      const fx = shiftedU - col;

      const edgeDist = Math.min(fx, 1 - fx, fy, 1 - fy);
      const isMortar = edgeDist < 0.065;
      const bevel = Math.min(1, Math.max(0, (edgeDist - 0.065) / 0.08));
      const grain = periodicFbm(u, v, 8, 3, 411);
      const moss = periodicFbm(u, v, 4, 2, 419);
      const blockTone = (hash2D(col, row, 16, 777) - 0.5) * 34;

      const h = isMortar ? 0.1 : 0.42 + bevel * 0.32 + grain * 0.26;
      heights[y * size + x] = h;

      let base = isMortar ? 92 : 188 + blockTone + (grain - 0.5) * 36 + bevel * 14;
      let r = base * 0.98;
      let g = base * 1.0;
      let b = base * 1.03;
      if (!isMortar && moss > 0.68 && fy < 0.35) {
        const m = (moss - 0.68) * 1.4;
        r = lerp(r, 95, Math.min(0.45, m));
        g = lerp(g, 128, Math.min(0.45, m));
        b = lerp(b, 82, Math.min(0.45, m));
      }
      const idx = (y * size + x) * 4;
      colorData[idx] = Math.max(0, Math.min(255, Math.round(r)));
      colorData[idx + 1] = Math.max(0, Math.min(255, Math.round(g)));
      colorData[idx + 2] = Math.max(0, Math.min(255, Math.round(b)));
      colorData[idx + 3] = 255;
    }
  }

  stoneCache = {
    map: makeColorDataTexture(colorData, size, size, 2, 2, true),
    normalMap: heightToNormalDataTexture(heights, size, size, 5.2, 2, 2),
  };
  return stoneCache;
}

let woodCache: PBRMapSet | null = null;
export function getTimberWoodMaps(): PBRMapSet {
  if (woodCache) return woodCache;

  const size = 256;
  const colorData = new Uint8Array(size * size * 4);
  const heights = new Float32Array(size * size);
  const planks = 6;

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const plankIdx = Math.floor(u * planks);
      const fx = u * planks - plankIdx;
      const isSeam = fx < 0.055 || fx > 0.945;

      const ringWave = Math.sin((fx * 4.5 + periodicNoise(u * 2, v, 8, 501 + plankIdx) * 1.4) * Math.PI * 2) * 0.5 + 0.5;
      const grain = periodicNoise(u * 5.0, v * 0.4, 20, 515 + plankIdx * 13);
      const tone = (hash2D(plankIdx, 0, 16, 909) - 0.5) * 28;
      const h = isSeam ? 0.12 : 0.45 + grain * 0.35 + ringWave * 0.2;
      heights[y * size + x] = h;

      const shade = isSeam ? 0.42 : 0.78 + grain * 0.26 + ringWave * 0.12;
      const idx = (y * size + x) * 4;
      colorData[idx] = Math.max(0, Math.min(255, Math.round((158 + tone) * shade)));
      colorData[idx + 1] = Math.max(0, Math.min(255, Math.round((102 + tone * 0.7) * shade)));
      colorData[idx + 2] = Math.max(0, Math.min(255, Math.round((58 + tone * 0.4) * shade)));
      colorData[idx + 3] = 255;
    }
  }

  woodCache = {
    map: makeColorDataTexture(colorData, size, size, 2, 2, true),
    normalMap: heightToNormalDataTexture(heights, size, size, 4.4, 2, 2),
  };
  return woodCache;
}

let roofCache: PBRMapSet | null = null;
export function getRoofShingleMaps(): PBRMapSet {
  if (roofCache) return roofCache;

  const size = 128;
  const colorData = new Uint8Array(size * size * 4);
  const heights = new Float32Array(size * size);
  const rows = 10;
  const cols = 8;

  for (let y = 0; y < size; y++) {
    const v = y / size;
    const row = Math.floor(v * rows);
    const fy = v * rows - row;
    const offset = row % 2 === 1 ? 0.5 : 0;

    for (let x = 0; x < size; x++) {
      const u = x / size;
      const su = (u * cols + offset) % cols;
      const col = Math.floor(su);
      const fx = su - col;

      const overlapShadow = fy < 0.18 ? 0.56 : 1.0;
      const edgeGap = fx < 0.06 || fx > 0.94 ? 0.68 : 1.0;
      const variation = (hash2D(col, row, 16, 613) - 0.5) * 32;
      const h = (fy < 0.18 ? 0.2 : 0.6 + fy * 0.4) * (edgeGap < 1 ? 0.48 : 1);
      heights[y * size + x] = h;

      const val = Math.max(0, Math.min(255, Math.round((226 + variation) * overlapShadow * edgeGap)));
      const idx = (y * size + x) * 4;
      colorData[idx] = val;
      colorData[idx + 1] = val;
      colorData[idx + 2] = val;
      colorData[idx + 3] = 255;
    }
  }

  roofCache = {
    map: makeColorDataTexture(colorData, size, size, 2, 2, true),
    normalMap: heightToNormalDataTexture(heights, size, size, 4.5, 2, 2),
  };
  return roofCache;
}

let roadCache: PBRMapSet | null = null;
export function getRoadCobbleMaps(): PBRMapSet {
  if (roadCache) return roadCache;

  const size = 256;
  const colorData = new Uint8Array(size * size * 4);
  const heights = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const dirt = periodicFbm(u, v, 6, 3, 811);
      const stone = periodicNoise(u, v, 14, 822);
      const centerDist = Math.abs(u - 0.5) * 2; // 0 at road center, 1 at left/right border
      const wobble = (periodicNoise(u, v * 4, 8, 833) - 0.5) * 0.14;
      const edgeAlpha = 1 - smoothstep(Math.max(0, Math.min(1, (centerDist + wobble - 0.58) / 0.36)));

      const isPebble = stone > 0.64 && centerDist < 0.72;
      heights[y * size + x] = isPebble ? 0.82 : dirt * 0.45;

      const idx = (y * size + x) * 4;
      if (isPebble) {
        const g = Math.round(142 + (stone - 0.64) * 145);
        colorData[idx] = g;
        colorData[idx + 1] = Math.round(g * 0.95);
        colorData[idx + 2] = Math.round(g * 0.86);
      } else {
        colorData[idx] = Math.round(134 + dirt * 40);
        colorData[idx + 1] = Math.round(110 + dirt * 34);
        colorData[idx + 2] = Math.round(78 + dirt * 24);
      }
      colorData[idx + 3] = Math.max(0, Math.min(255, Math.round(edgeAlpha * 245)));
    }
  }

  roadCache = {
    map: makeColorDataTexture(colorData, size, size, 1, 5, true),
    normalMap: heightToNormalDataTexture(heights, size, size, 3.6, 1, 5),
  };
  return roadCache;
}

let waterNormalCache: THREE.DataTexture | null = null;
export function getWaterRippleNormalMap(): THREE.DataTexture {
  if (waterNormalCache) return waterNormalCache;

  const size = 128;
  const heights = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const w1 = Math.sin((u * 3 + v * 2) * Math.PI * 2) * 0.25;
      const w2 = Math.cos((u * 5 - v * 4) * Math.PI * 2) * 0.2;
      const n = periodicFbm(u, v, 8, 3, 941) * 0.55;
      heights[y * size + x] = 0.5 + w1 * 0.35 + w2 * 0.35 + n * 0.3;
    }
  }

  waterNormalCache = heightToNormalDataTexture(heights, size, size, 3.8, 4, 4);
  return waterNormalCache;
}

let wheatCache: PBRMapSet | null = null;
export function getWheatFieldMaps(): PBRMapSet {
  if (wheatCache) return wheatCache;
  const size = 128;
  const colorData = new Uint8Array(size * size * 4);
  const heights = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const stalk = periodicNoise(u * 3, v * 0.5, 20, 991);
      const chaff = periodicFbm(u, v, 8, 2, 997);
      heights[y * size + x] = 0.3 + stalk * 0.5 + chaff * 0.2;
      const idx = (y * size + x) * 4;
      colorData[idx] = Math.round(210 + stalk * 42);
      colorData[idx + 1] = Math.round(166 + stalk * 52);
      colorData[idx + 2] = Math.round(36 + chaff * 36);
      colorData[idx + 3] = 255;
    }
  }
  wheatCache = {
    map: makeColorDataTexture(colorData, size, size, 2, 1, true),
    normalMap: heightToNormalDataTexture(heights, size, size, 3.8, 2, 1),
  };
  return wheatCache;
}

let foliageCache: PBRMapSet | null = null;
export function getFoliagePBRMaps(): PBRMapSet {
  if (foliageCache) return foliageCache;
  const size = 128;
  const colorData = new Uint8Array(size * size * 4);
  const heights = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const leaf = periodicFbm(u, v, 8, 3, 555);
      const needle = periodicNoise(u * 2, v * 2, 24, 577);
      heights[y * size + x] = leaf * 0.65 + needle * 0.35;
      const idx = (y * size + x) * 4;
      const shade = 158 + Math.round(leaf * 64 + needle * 32);
      colorData[idx] = Math.max(0, Math.min(255, shade - 8));
      colorData[idx + 1] = Math.max(0, Math.min(255, shade + 16));
      colorData[idx + 2] = Math.max(0, Math.min(255, shade - 18));
      colorData[idx + 3] = 255;
    }
  }
  foliageCache = {
    map: makeColorDataTexture(colorData, size, size, 2, 2, true),
    normalMap: heightToNormalDataTexture(heights, size, size, 4.0, 2, 2),
  };
  return foliageCache;
}

let craggyRockCache: PBRMapSet | null = null;
export function getCraggyRockMaps(): PBRMapSet {
  if (craggyRockCache) return craggyRockCache;
  const size = 256;
  const colorData = new Uint8Array(size * size * 4);
  const heights = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const macro = periodicFbm(u, v, 4, 4, 404);
      const strata = Math.sin((v * 5 + macro * 1.8) * Math.PI * 2) * 0.5 + 0.5;
      const crack = Math.abs(periodicNoise(u * 2, v * 2, 10, 707) - 0.5) * 2;
      const h = macro * 0.55 + strata * 0.2 + crack * 0.25;
      heights[y * size + x] = h;

      const idx = (y * size + x) * 4;
      const lum = Math.max(82, Math.min(238, Math.round(122 + macro * 68 + strata * 24 + crack * 28)));
      colorData[idx] = Math.round(lum * 0.96);
      colorData[idx + 1] = lum;
      colorData[idx + 2] = Math.min(255, Math.round(lum * 1.04));
      colorData[idx + 3] = 255;
    }
  }

  craggyRockCache = {
    map: makeColorDataTexture(colorData, size, size, 2, 2, true),
    normalMap: heightToNormalDataTexture(heights, size, size, 5.0, 2, 2),
  };
  return craggyRockCache;
}

let armorPlateCache: PBRMapSet | null = null;
export function getArmorPlateMaps(): PBRMapSet {
  if (armorPlateCache) return armorPlateCache;
  const size = 128;
  const colorData = new Uint8Array(size * size * 4);
  const heights = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const brushed = periodicNoise(u * 6, v * 0.5, 16, 1201);
      const plateSeam = (y % 32 < 2 || x % 64 < 2) ? 0.2 : 0.75;
      const h = plateSeam + brushed * 0.25;
      heights[y * size + x] = h;
      const lum = plateSeam < 0.5 ? 168 : Math.round(218 + brushed * 34);
      const idx = (y * size + x) * 4;
      colorData[idx] = lum;
      colorData[idx + 1] = lum;
      colorData[idx + 2] = Math.min(255, lum + 6);
      colorData[idx + 3] = 255;
    }
  }
  armorPlateCache = {
    map: makeColorDataTexture(colorData, size, size, 1, 1, true),
    normalMap: heightToNormalDataTexture(heights, size, size, 3.4, 1, 1),
  };
  return armorPlateCache;
}

let clothWeaveCache: PBRMapSet | null = null;
export function getClothWeaveMaps(): PBRMapSet {
  if (clothWeaveCache) return clothWeaveCache;
  const size = 64;
  const colorData = new Uint8Array(size * size * 4);
  const heights = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const warp = Math.sin(u * Math.PI * 24) * 0.5 + 0.5;
      const weft = Math.sin(v * Math.PI * 24) * 0.5 + 0.5;
      const weave = (warp + weft) * 0.5;
      const fold = periodicFbm(u, v, 3, 2, 1303);
      heights[y * size + x] = weave * 0.45 + fold * 0.55;
      const idx = (y * size + x) * 4;
      const val = Math.round(196 + weave * 32 + (fold - 0.5) * 32);
      colorData[idx] = val;
      colorData[idx + 1] = val;
      colorData[idx + 2] = val;
      colorData[idx + 3] = 255;
    }
  }
  clothWeaveCache = {
    map: makeColorDataTexture(colorData, size, size, 2, 2, true),
    normalMap: heightToNormalDataTexture(heights, size, size, 3.0, 2, 2),
  };
  return clothWeaveCache;
}

let contactShadowTexCache: THREE.CanvasTexture | null = null;
export function getContactShadowTexture(): THREE.CanvasTexture {
  if (contactShadowTexCache) return contactShadowTexCache;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 62);
  grad.addColorStop(0, 'rgba(6, 12, 6, 0.9)');
  grad.addColorStop(0.55, 'rgba(8, 16, 8, 0.55)');
  grad.addColorStop(0.85, 'rgba(8, 16, 8, 0.16)');
  grad.addColorStop(1, 'rgba(8, 16, 8, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  contactShadowTexCache = tex;
  return tex;
}

let barkCache: PBRMapSet | null = null;
export function getTreeBarkMaps(): PBRMapSet {
  if (barkCache) return barkCache;
  const size = 256;
  const colorData = new Uint8Array(size * size * 4);
  const heights = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const ridge = Math.sin((u * 14 + periodicNoise(u, v * 0.5, 6, 301) * 1.6) * Math.PI * 2) * 0.5 + 0.5;
      const fissure = periodicFbm(u * 2.4, v * 0.35, 10, 3, 317);
      const lichen = periodicFbm(u, v, 8, 2, 331);
      const h = ridge * 0.55 + fissure * 0.45;
      heights[y * size + x] = h;

      let r = 82 + h * 54;
      let g = 54 + h * 36;
      let b = 32 + h * 20;
      if (lichen > 0.76) {
        const m = (lichen - 0.76) * 2.2;
        r = lerp(r, 98, Math.min(0.45, m));
        g = lerp(g, 118, Math.min(0.45, m));
        b = lerp(b, 74, Math.min(0.45, m));
      }
      const idx = (y * size + x) * 4;
      colorData[idx] = Math.max(0, Math.min(255, Math.round(r)));
      colorData[idx + 1] = Math.max(0, Math.min(255, Math.round(g)));
      colorData[idx + 2] = Math.max(0, Math.min(255, Math.round(b)));
      colorData[idx + 3] = 255;
    }
  }
  barkCache = {
    map: makeColorDataTexture(colorData, size, size, 2, 2, true),
    normalMap: heightToNormalDataTexture(heights, size, size, 5.4, 2, 2),
  };
  return barkCache;
}

let furCache: PBRMapSet | null = null;
export function getAnimalFurMaps(): PBRMapSet {
  if (furCache) return furCache;
  const size = 128;
  const colorData = new Uint8Array(size * size * 4);
  const heights = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const hair = periodicNoise(u * 0.8, v * 5.0, 28, 741);
      const coat = periodicFbm(u, v, 5, 3, 757);
      const h = hair * 0.55 + coat * 0.45;
      heights[y * size + x] = h;
      const val = Math.max(150, Math.min(250, Math.round(188 + (h - 0.5) * 68)));
      const idx = (y * size + x) * 4;
      colorData[idx] = val;
      colorData[idx + 1] = Math.round(val * 0.96);
      colorData[idx + 2] = Math.round(val * 0.9);
      colorData[idx + 3] = 255;
    }
  }
  furCache = {
    map: makeColorDataTexture(colorData, size, size, 2, 2, true),
    normalMap: heightToNormalDataTexture(heights, size, size, 3.2, 2, 2),
  };
  return furCache;
}

let leatherCache: PBRMapSet | null = null;
export function getLeatherMaps(): PBRMapSet {
  if (leatherCache) return leatherCache;
  const size = 128;
  const colorData = new Uint8Array(size * size * 4);
  const heights = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const pebble = periodicNoise(u, v, 24, 881);
      const crease = periodicFbm(u, v, 6, 3, 887);
      const h = pebble * 0.6 + crease * 0.4;
      heights[y * size + x] = h;
      const shade = Math.max(145, Math.min(242, Math.round(182 + (h - 0.5) * 58)));
      const idx = (y * size + x) * 4;
      colorData[idx] = shade;
      colorData[idx + 1] = Math.round(shade * 0.92);
      colorData[idx + 2] = Math.round(shade * 0.84);
      colorData[idx + 3] = 255;
    }
  }
  leatherCache = {
    map: makeColorDataTexture(colorData, size, size, 2, 2, true),
    normalMap: heightToNormalDataTexture(heights, size, size, 3.6, 2, 2),
  };
  return leatherCache;
}


