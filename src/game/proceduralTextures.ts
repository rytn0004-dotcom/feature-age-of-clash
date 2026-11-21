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

  // 2K-class world coverage is expensive; 1K keeps ground detail crisp without a huge GPU footprint.
  const size = 1024;
  const colorData = new Uint8Array(size * size * 4);
  const roughData = new Uint8Array(size * size * 4);
  const heights = new Float32Array(size * size);

  const seed = preset === 'river_valley' ? 101 : preset === 'highland_basin' ? 202 : 303;
  const repeat = 10;

  // Natural meadow palettes: [deepMoss, mainGrass, sunMeadow] + loamy earth undertones
  const palette =
    preset === 'highland_basin'
      ? {
          a: [50, 62, 26],
          b: [78, 92, 40],
          c: [116, 114, 72],
          soil: [86, 70, 48],
        }
      : preset === 'twin_lakes'
      ? {
          a: [26, 62, 34],
          b: [44, 88, 44],
          c: [76, 120, 56],
          soil: [62, 72, 42],
        }
      : {
          a: [32, 66, 22],
          b: [56, 94, 32],
          c: [90, 124, 44],
          soil: [78, 66, 40],
        };

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const macro = periodicFbm(u, v, 3, 4, seed);
      const mid = periodicFbm(u, v, 7, 3, seed + 29);
      const micro = periodicFbm(u * 2.0, v * 2.0, 12, 3, seed + 55);
      // Multi-directional fine grass blades & clover tufts
      const bladesA = periodicNoise(u * 2.8, v * 0.75, 38, seed + 99);
      const bladesB = periodicNoise(u * 0.85, v * 2.4, 44, seed + 137);
      const blades = bladesA * 0.58 + bladesB * 0.42;
      const pebble = periodicNoise(u, v, 34, seed + 177);
      const cloverCluster = periodicNoise(u, v, 14, seed + 211);
      const flowerFlecks = periodicNoise(u, v, 52, seed + 241);
      const fineGrain = periodicNoise(u * 2.6, v * 2.6, 96, seed + 263);
      const mineralDust = periodicNoise(u * 1.8, v * 1.8, 128, seed + 277);

      const h = macro * 0.38 + mid * 0.2 + micro * 0.15 + blades * 0.18 + fineGrain * 0.06 + mineralDust * 0.03 + (pebble > 0.82 ? 0.16 : 0);
      heights[y * size + x] = h;

      let r: number;
      let g: number;
      let b: number;

      const blendT = macro * 0.68 + mid * 0.32;
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

      // Lush darker clover pockets vs warm loamy soil patches
      if (cloverCluster > 0.68 && micro > 0.36) {
        const cloverMix = Math.min(0.45, (cloverCluster - 0.68) * 1.4);
        r = lerp(r, palette.a[0] * 0.88, cloverMix);
        g = lerp(g, palette.a[1] * 1.04, cloverMix);
        b = lerp(b, palette.a[2] * 0.92, cloverMix);
      } else if (micro < 0.31) {
        const soilMix = (0.31 - micro) * 1.65;
        r = lerp(r, palette.soil[0], Math.min(0.65, soilMix));
        g = lerp(g, palette.soil[1], Math.min(0.65, soilMix));
        b = lerp(b, palette.soil[2], Math.min(0.65, soilMix));
      } else if (flowerFlecks > 0.95 && macro > 0.52 && blades > 0.58) {
        r = lerp(r, 184, 0.26);
        g = lerp(g, 190, 0.24);
        b = lerp(b, 92, 0.16);
      }

      // Subtle mineral earth grit only inside bare soil patches
      if (pebble > 0.87 && micro < 0.26) {
        const gritMix = Math.min(0.34, (0.26 - micro) * 1.85);
        r = lerp(r, palette.soil[0] * 1.2, gritMix);
        g = lerp(g, palette.soil[1] * 1.15, gritMix);
        b = lerp(b, palette.soil[2] * 1.12, gritMix);
      }

      const bladeShade = (blades - 0.5) * 34 + (fineGrain - 0.5) * 9 + (mineralDust - 0.5) * 5;
      const idx = (y * size + x) * 4;
      colorData[idx] = Math.max(0, Math.min(255, Math.round(r + bladeShade)));
      colorData[idx + 1] = Math.max(0, Math.min(255, Math.round(g + bladeShade * 1.06)));
      colorData[idx + 2] = Math.max(0, Math.min(255, Math.round(b + bladeShade * 0.65)));
      colorData[idx + 3] = 255;

      const roughByte = Math.max(
        172,
        Math.min(252, Math.round(240 - blades * 44 + (micro < 0.34 ? 14 : 0) - (pebble > 0.84 ? 20 : 0)))
      );
      roughData[idx] = roughByte;
      roughData[idx + 1] = roughByte;
      roughData[idx + 2] = roughByte;
      roughData[idx + 3] = 255;
    }
  }

  const map = makeColorDataTexture(colorData, size, size, repeat, repeat, true);
  const normalMap = heightToNormalDataTexture(heights, size, size, 5.4, repeat, repeat);
  const roughnessMap = makeColorDataTexture(roughData, size, size, repeat, repeat, false);

  const result = { map, normalMap, roughnessMap };
  terrainCache.set(preset, result);
  return result;
}

let stoneCache: PBRMapSet | null = null;
export function getStoneMasonryMaps(): PBRMapSet {
  if (stoneCache) return stoneCache;

  const size = 512;
  const colorData = new Uint8Array(size * size * 4);
  const roughData = new Uint8Array(size * size * 4);
  const heights = new Float32Array(size * size);
  const rows = 8;
  const cols = 4;

  for (let y = 0; y < size; y++) {
    const v = y / size;
    const row = Math.floor(v * rows);
    const fy = v * rows - row;
    const offset = row % 2 === 1 ? 0.5 : 0.14 * ((row % 3) - 1);

    for (let x = 0; x < size; x++) {
      const u = x / size;
      const shiftedU = (u * cols + offset + cols) % cols;
      const col = Math.floor(shiftedU);
      const fx = shiftedU - col;

      // Subtle organic mortar irregularity so courses look hand-laid
      const mortarJitter = (periodicNoise(u * 3, v * 3, 18, 409) - 0.5) * 0.025;
      const edgeDist = Math.min(fx, 1 - fx, fy, 1 - fy) + mortarJitter;
      const isMortar = edgeDist < 0.068;
      const bevel = Math.min(1, Math.max(0, (edgeDist - 0.068) / 0.095));
      const grain = periodicFbm(u, v, 8, 4, 411);
      const chisel = periodicNoise(u * 2.4, v * 1.4, 28, 427);
      const moss = periodicFbm(u, v, 4, 3, 419);
      const pore = periodicNoise(u * 4.8, v * 4.8, 76, 433);
      const edgeWear = periodicNoise(u * 2.2, v * 2.2, 48, 439);
      const blockTone = (hash2D(col, row, 16, 777) - 0.5) * 38;
      const warmTint = (hash2D(col + 7, row + 3, 16, 787) - 0.5) * 14;

      const h = isMortar ? 0.06 : 0.38 + bevel * 0.32 + grain * 0.16 + chisel * 0.08 + pore * 0.035 + edgeWear * 0.025;
      heights[y * size + x] = h;

      const aoShadow = isMortar ? 0.52 : 0.8 + bevel * 0.2;
      let base = isMortar
        ? 88 + grain * 18
        : (186 + blockTone + (grain - 0.5) * 34 + (chisel - 0.5) * 18 + (pore - 0.5) * 12 + (edgeWear - 0.5) * 9 + bevel * 16) * aoShadow;
      let r = base * 0.99 + warmTint * 0.6;
      let g = base * 1.0 + warmTint * 0.2;
      let b = base * 1.02 - warmTint * 0.4;
      if (!isMortar && moss > 0.66 && fy < 0.38) {
        const m = (moss - 0.66) * 1.65;
        r = lerp(r, 86, Math.min(0.48, m));
        g = lerp(g, 124, Math.min(0.48, m));
        b = lerp(b, 76, Math.min(0.48, m));
      }
      const idx = (y * size + x) * 4;
      colorData[idx] = Math.max(0, Math.min(255, Math.round(r)));
      colorData[idx + 1] = Math.max(0, Math.min(255, Math.round(g)));
      colorData[idx + 2] = Math.max(0, Math.min(255, Math.round(b)));
      colorData[idx + 3] = 255;

      const roughByte = isMortar
        ? 244
        : Math.max(132, Math.min(222, Math.round(186 - bevel * 24 + (1 - chisel) * 28 - grain * 18)));
      roughData[idx] = roughByte;
      roughData[idx + 1] = roughByte;
      roughData[idx + 2] = roughByte;
      roughData[idx + 3] = 255;
    }
  }

  stoneCache = {
    map: makeColorDataTexture(colorData, size, size, 2, 2, true),
    normalMap: heightToNormalDataTexture(heights, size, size, 5.8, 2, 2),
    roughnessMap: makeColorDataTexture(roughData, size, size, 2, 2, false),
  };
  return stoneCache;
}

let woodCache: PBRMapSet | null = null;
export function getTimberWoodMaps(): PBRMapSet {
  if (woodCache) return woodCache;

  const size = 512;
  const colorData = new Uint8Array(size * size * 4);
  const roughData = new Uint8Array(size * size * 4);
  const heights = new Float32Array(size * size);
  const planks = 6;

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const plankIdx = Math.floor(u * planks);
      const fx = u * planks - plankIdx;
      const vShift = (plankIdx % 2) * 0.48 + hash2D(plankIdx, 3, 16, 541) * 0.16;
      const endV = (v * 2 + vShift) % 1;
      const isVSeam = fx < 0.048 || fx > 0.952;
      const isHSeam = endV < 0.025 || endV > 0.975;
      const isSeam = isVSeam || isHSeam;

      // Forged iron nail pegs near plank butt-joints
      const pegLeft = Math.hypot((fx - 0.22) * 0.7, (endV - 0.09) * 1.4);
      const pegRight = Math.hypot((fx - 0.78) * 0.7, (endV - 0.09) * 1.4);
      const isNail = !isSeam && (pegLeft < 0.055 || pegRight < 0.055);

      // Natural wood knots warping cathedral grain
      const knotDist = Math.hypot((fx - 0.54) * 1.3, (endV - 0.56) * 1.8);
      const knotWarp = knotDist < 0.22 ? Math.exp(-knotDist * 11) * 1.4 : 0;

      const ringWave =
        Math.sin((fx * 4.2 + knotWarp + periodicNoise(u * 2.2, v, 8, 501 + plankIdx) * 1.5) * Math.PI * 2) * 0.5 + 0.5;
      const fiberGrain = periodicNoise(u * 6.0, v * 0.35, 24, 515 + plankIdx * 13);
      const finePores = periodicNoise(u * 10, v * 0.5, 32, 529);
      const fiberMicro = periodicNoise(u * 18, v * 0.72, 64, 537);
      const tone = (hash2D(plankIdx, Math.floor(v * 2 + vShift), 16, 909) - 0.5) * 30;

      const h = isSeam
        ? 0.08
        : isNail
        ? 0.88
        : 0.4 + fiberGrain * 0.3 + ringWave * 0.18 + finePores * 0.07 + fiberMicro * 0.07 - knotWarp * 0.12;
      heights[y * size + x] = h;

      const shade = isSeam ? 0.36 : 0.72 + fiberGrain * 0.22 + ringWave * 0.13 + (fiberMicro - 0.5) * 0.08 - knotWarp * 0.22;
      const idx = (y * size + x) * 4;
      if (isNail) {
        colorData[idx] = 54;
        colorData[idx + 1] = 52;
        colorData[idx + 2] = 58;
      } else {
        colorData[idx] = Math.max(0, Math.min(255, Math.round((164 + tone) * shade)));
        colorData[idx + 1] = Math.max(0, Math.min(255, Math.round((106 + tone * 0.72) * shade)));
        colorData[idx + 2] = Math.max(0, Math.min(255, Math.round((60 + tone * 0.45) * shade)));
      }
      colorData[idx + 3] = 255;

      const roughByte = isSeam
        ? 236
        : isNail
        ? 92
        : Math.max(115, Math.min(212, Math.round(166 - ringWave * 28 + (1 - fiberGrain) * 26)));
      roughData[idx] = roughByte;
      roughData[idx + 1] = roughByte;
      roughData[idx + 2] = roughByte;
      roughData[idx + 3] = 255;
    }
  }

  woodCache = {
    map: makeColorDataTexture(colorData, size, size, 2, 2, true),
    normalMap: heightToNormalDataTexture(heights, size, size, 4.9, 2, 2),
    roughnessMap: makeColorDataTexture(roughData, size, size, 2, 2, false),
  };
  return woodCache;
}

let roofCache: PBRMapSet | null = null;
export function getRoofShingleMaps(): PBRMapSet {
  if (roofCache) return roofCache;

  const size = 512;
  const colorData = new Uint8Array(size * size * 4);
  const roughData = new Uint8Array(size * size * 4);
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

      // Arched shingle / kawara tile crown profile with overlapping shadow lip
      const barrelCrown = Math.sin(fx * Math.PI);
      const grain = periodicNoise(u * 2, v * 2, 24, 619);
      const overlapShadow = fy < 0.17 ? 0.48 + (fy / 0.17) * 0.25 : 0.9 + fy * 0.12;
      const edgeGap = fx < 0.065 || fx > 0.935 ? 0.6 : 1.0;
      const variation = (hash2D(col, row, 16, 613) - 0.5) * 34;
      const lichen = periodicFbm(u, v, 6, 2, 631);

      const h = (fy < 0.17 ? 0.14 : 0.46 + fy * 0.3 + barrelCrown * 0.24) * (edgeGap < 1 ? 0.45 : 1);
      heights[y * size + x] = h;

      let val = (218 + variation + (grain - 0.5) * 20 + barrelCrown * 18) * overlapShadow * edgeGap;
      let r = val;
      let g = val;
      let b = val;
      if (fy < 0.26 && lichen > 0.72) {
        const lm = Math.min(0.4, (lichen - 0.72) * 1.8);
        r = lerp(r, 128, lm);
        g = lerp(g, 152, lm);
        b = lerp(b, 108, lm);
      }

      const idx = (y * size + x) * 4;
      colorData[idx] = Math.max(0, Math.min(255, Math.round(r)));
      colorData[idx + 1] = Math.max(0, Math.min(255, Math.round(g)));
      colorData[idx + 2] = Math.max(0, Math.min(255, Math.round(b)));
      colorData[idx + 3] = 255;

      const roughByte = fy < 0.17 || edgeGap < 1
        ? 230
        : Math.max(92, Math.min(198, Math.round(148 - barrelCrown * 38 + (1 - grain) * 20)));
      roughData[idx] = roughByte;
      roughData[idx + 1] = roughByte;
      roughData[idx + 2] = roughByte;
      roughData[idx + 3] = 255;
    }
  }

  roofCache = {
    map: makeColorDataTexture(colorData, size, size, 2, 2, true),
    normalMap: heightToNormalDataTexture(heights, size, size, 5.2, 2, 2),
    roughnessMap: makeColorDataTexture(roughData, size, size, 2, 2, false),
  };
  return roofCache;
}

let waterNormalCache: THREE.DataTexture | null = null;
export function getWaterRippleNormalMap(): THREE.DataTexture {
  if (waterNormalCache) return waterNormalCache;

  const size = 512;
  const heights = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const w1 = Math.sin((u * 4 + v * 2) * Math.PI * 2) * 0.22;
      const w2 = Math.cos((u * 6 - v * 5) * Math.PI * 2) * 0.18;
      const w3 = Math.sin((u * 11 + v * 9) * Math.PI * 2) * 0.08;
      const n = periodicFbm(u, v, 10, 4, 941) * 0.52;
      heights[y * size + x] = 0.5 + w1 * 0.34 + w2 * 0.32 + w3 * 0.22 + n * 0.34;
    }
  }

  waterNormalCache = heightToNormalDataTexture(heights, size, size, 4.4, 6, 6);
  return waterNormalCache;
}

let wheatCache: PBRMapSet | null = null;
export function getWheatFieldMaps(): PBRMapSet {
  if (wheatCache) return wheatCache;
  const size = 256;
  const colorData = new Uint8Array(size * size * 4);
  const roughData = new Uint8Array(size * size * 4);
  const heights = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const stalk = periodicNoise(u * 3.2, v * 0.45, 22, 991);
      const chaff = periodicFbm(u, v, 8, 3, 997);
      const h = 0.28 + stalk * 0.52 + chaff * 0.2;
      heights[y * size + x] = h;
      const idx = (y * size + x) * 4;
      colorData[idx] = Math.round(206 + stalk * 46);
      colorData[idx + 1] = Math.round(162 + stalk * 54);
      colorData[idx + 2] = Math.round(34 + chaff * 36);
      colorData[idx + 3] = 255;
      const rb = Math.max(150, Math.min(238, Math.round(220 - stalk * 54)));
      roughData[idx] = rb;
      roughData[idx + 1] = rb;
      roughData[idx + 2] = rb;
      roughData[idx + 3] = 255;
    }
  }
  wheatCache = {
    map: makeColorDataTexture(colorData, size, size, 2, 1, true),
    normalMap: heightToNormalDataTexture(heights, size, size, 4.1, 2, 1),
    roughnessMap: makeColorDataTexture(roughData, size, size, 2, 1, false),
  };
  return wheatCache;
}

let foliageCache: PBRMapSet | null = null;
export function getFoliagePBRMaps(): PBRMapSet {
  if (foliageCache) return foliageCache;
  const size = 512;
  const colorData = new Uint8Array(size * size * 4);
  const roughData = new Uint8Array(size * size * 4);
  const heights = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const cluster = periodicFbm(u, v, 6, 4, 555);
      const leafVein = periodicNoise(u * 2.2, v * 2.2, 28, 577);
      const speck = periodicNoise(u * 3, v * 3, 40, 593);
      const microVein = periodicNoise(u * 9, v * 9, 72, 599);
      const h = cluster * 0.52 + leafVein * 0.26 + speck * 0.14 + microVein * 0.08;
      heights[y * size + x] = h;
      const idx = (y * size + x) * 4;
      const shade = 146 + Math.round(cluster * 70 + leafVein * 25 + (microVein - 0.5) * 18);
      colorData[idx] = Math.max(0, Math.min(255, shade - 10));
      colorData[idx + 1] = Math.max(0, Math.min(255, shade + 18));
      colorData[idx + 2] = Math.max(0, Math.min(255, shade - 22));
      colorData[idx + 3] = 255;
      // Waxy top leaf highlights vs deep matte shadow pockets
      const rb = Math.max(122, Math.min(238, Math.round(224 - cluster * 78 - leafVein * 18)));
      roughData[idx] = rb;
      roughData[idx + 1] = rb;
      roughData[idx + 2] = rb;
      roughData[idx + 3] = 255;
    }
  }
  foliageCache = {
    map: makeColorDataTexture(colorData, size, size, 2, 2, true),
    normalMap: heightToNormalDataTexture(heights, size, size, 4.6, 2, 2),
    roughnessMap: makeColorDataTexture(roughData, size, size, 2, 2, false),
  };
  return foliageCache;
}

let craggyRockCache: PBRMapSet | null = null;
export function getCraggyRockMaps(): PBRMapSet {
  if (craggyRockCache) return craggyRockCache;
  const size = 512;
  const colorData = new Uint8Array(size * size * 4);
  const roughData = new Uint8Array(size * size * 4);
  const heights = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const macro = periodicFbm(u, v, 4, 4, 404);
      const strata = Math.sin((v * 5 + macro * 1.8) * Math.PI * 2) * 0.5 + 0.5;
      const crack = Math.abs(periodicNoise(u * 2, v * 2, 12, 707) - 0.5) * 2;
      const mica = periodicNoise(u * 4, v * 4, 42, 719);
      const h = macro * 0.52 + strata * 0.2 + crack * 0.28;
      heights[y * size + x] = h;

      const idx = (y * size + x) * 4;
      const creviceAO = crack < 0.16 ? 0.65 : 1.0;
      const lum = Math.max(72, Math.min(244, Math.round((118 + macro * 68 + strata * 26 + crack * 28) * creviceAO)));
      colorData[idx] = Math.round(lum * 0.96);
      colorData[idx + 1] = lum;
      colorData[idx + 2] = Math.min(255, Math.round(lum * 1.04));
      colorData[idx + 3] = 255;

      const rb = mica > 0.84 && crack > 0.25
        ? 92
        : crack < 0.16
        ? 238
        : Math.max(138, Math.min(228, Math.round(205 - macro * 42)));
      roughData[idx] = rb;
      roughData[idx + 1] = rb;
      roughData[idx + 2] = rb;
      roughData[idx + 3] = 255;
    }
  }

  craggyRockCache = {
    map: makeColorDataTexture(colorData, size, size, 2, 2, true),
    normalMap: heightToNormalDataTexture(heights, size, size, 5.5, 2, 2),
    roughnessMap: makeColorDataTexture(roughData, size, size, 2, 2, false),
  };
  return craggyRockCache;
}

let armorPlateCache: PBRMapSet | null = null;
export function getArmorPlateMaps(): PBRMapSet {
  if (armorPlateCache) return armorPlateCache;
  const size = 512;
  const colorData = new Uint8Array(size * size * 4);
  const roughData = new Uint8Array(size * size * 4);
  const heights = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    const localY = (y % 64) / 64;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const localX = (x % 128) / 128;
      const brushed = periodicNoise(u * 8, v * 0.45, 22, 1201);
      const hammer = periodicNoise(u * 2, v * 2, 18, 1213);
      const polishGrain = periodicNoise(u * 16, v * 0.8, 56, 1229);
      const fluting = Math.pow(Math.abs(Math.sin(u * Math.PI * 6)), 0.7) * 0.14;
      const seamDist = Math.min(localY, 1 - localY, localX * 2, (1 - localX) * 2);
      const isSeam = seamDist < 0.045;
      const bevel = Math.min(1, Math.max(0, (seamDist - 0.045) / 0.08));

      // Raised forged dome rivets spaced near horizontal plate borders
      const rivetCellU = ((u * 8) % 1) - 0.5;
      const rivetDist = Math.hypot(rivetCellU, (localY - 0.13) * 2.2);
      const isRivet = !isSeam && rivetDist < 0.18;
      const rivetHeight = isRivet ? Math.sqrt(Math.max(0, 1 - (rivetDist / 0.18) ** 2)) * 0.35 : 0;

      const h = isSeam ? 0.12 : 0.44 + bevel * 0.22 + brushed * 0.14 + hammer * 0.1 + fluting + rivetHeight;
      heights[y * size + x] = h;
      const lum = isSeam
        ? 132
        : isRivet
        ? Math.min(255, Math.round(228 + rivetHeight * 80))
        : Math.max(166, Math.min(252, Math.round(202 + bevel * 20 + brushed * 24 + fluting * 85 + (hammer - 0.5) * 14 + (polishGrain - 0.5) * 9)));
      const idx = (y * size + x) * 4;
      colorData[idx] = lum;
      colorData[idx + 1] = lum;
      colorData[idx + 2] = Math.min(255, lum + 9);
      colorData[idx + 3] = 255;

      // Burnished plate faces & rivets catch bright metallic specular; seams stay dark/oiled
      const rb = isSeam
        ? 206
        : isRivet
        ? 44
        : Math.max(48, Math.min(144, Math.round(104 - bevel * 24 - brushed * 26 - fluting * 80 + (1 - hammer) * 16)));
      roughData[idx] = rb;
      roughData[idx + 1] = rb;
      roughData[idx + 2] = rb;
      roughData[idx + 3] = 255;
    }
  }
  armorPlateCache = {
    map: makeColorDataTexture(colorData, size, size, 1, 1, true),
    normalMap: heightToNormalDataTexture(heights, size, size, 4.4, 1, 1),
    roughnessMap: makeColorDataTexture(roughData, size, size, 1, 1, false),
  };
  return armorPlateCache;
}

let clothWeaveCache: PBRMapSet | null = null;
export function getClothWeaveMaps(): PBRMapSet {
  if (clothWeaveCache) return clothWeaveCache;
  const size = 256;
  const colorData = new Uint8Array(size * size * 4);
  const roughData = new Uint8Array(size * size * 4);
  const heights = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const warp = Math.sin((u * 24 + v * 6) * Math.PI * 2) * 0.5 + 0.5;
      const weft = Math.sin((v * 24 - u * 6) * Math.PI * 2) * 0.5 + 0.5;
      const weave = (warp + weft) * 0.5;
      const fold = periodicFbm(u, v, 3, 3, 1303);
      heights[y * size + x] = weave * 0.48 + fold * 0.52;
      const idx = (y * size + x) * 4;
      const val = Math.max(150, Math.min(248, Math.round(194 + weave * 34 + (fold - 0.5) * 34)));
      colorData[idx] = val;
      colorData[idx + 1] = val;
      colorData[idx + 2] = val;
      colorData[idx + 3] = 255;
      const rb = Math.max(185, Math.min(244, Math.round(230 - weave * 30)));
      roughData[idx] = rb;
      roughData[idx + 1] = rb;
      roughData[idx + 2] = rb;
      roughData[idx + 3] = 255;
    }
  }
  clothWeaveCache = {
    map: makeColorDataTexture(colorData, size, size, 2, 2, true),
    normalMap: heightToNormalDataTexture(heights, size, size, 3.4, 2, 2),
    roughnessMap: makeColorDataTexture(roughData, size, size, 2, 2, false),
  };
  return clothWeaveCache;
}

let contactShadowTexCache: THREE.DataTexture | null = null;

/** Radial contact shadow generated as raw pixels so graphics modules are safe to import outside the browser. */
export function getContactShadowTexture(): THREE.DataTexture {
  if (contactShadowTexCache) return contactShadowTexCache;
  const size = 128;
  const pixels = new Uint8Array(size * size * 4);
  const stops: Array<[number, number]> = [
    [0, 0.9],
    [0.55, 0.55],
    [0.85, 0.16],
    [1, 0],
  ];
  const innerRadius = 8;
  const outerRadius = 62;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const distance = Math.hypot(x + 0.5 - size * 0.5, y + 0.5 - size * 0.5);
      const t = THREE.MathUtils.clamp((distance - innerRadius) / (outerRadius - innerRadius), 0, 1);
      let alpha = stops[stops.length - 1][1];
      for (let index = 0; index < stops.length - 1; index++) {
        const [leftT, leftAlpha] = stops[index];
        const [rightT, rightAlpha] = stops[index + 1];
        if (t <= rightT) {
          const blend = (t - leftT) / Math.max(0.0001, rightT - leftT);
          alpha = THREE.MathUtils.lerp(leftAlpha, rightAlpha, blend);
          break;
        }
      }
      const offset = (y * size + x) * 4;
      pixels[offset] = 8;
      pixels[offset + 1] = 14;
      pixels[offset + 2] = 8;
      pixels[offset + 3] = Math.round(alpha * 255);
    }
  }
  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  contactShadowTexCache = texture;
  return texture;
}

let barkCache: PBRMapSet | null = null;
export function getTreeBarkMaps(): PBRMapSet {
  if (barkCache) return barkCache;
  const size = 512;
  const colorData = new Uint8Array(size * size * 4);
  const roughData = new Uint8Array(size * size * 4);
  const heights = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const ridge = Math.sin((u * 14 + periodicNoise(u, v * 0.5, 6, 301) * 1.7) * Math.PI * 2) * 0.5 + 0.5;
      const fissure = periodicFbm(u * 2.4, v * 0.35, 10, 3, 317);
      const crossCrack = periodicNoise(u * 1.2, v * 3.5, 16, 325);
      const lichen = periodicFbm(u, v, 8, 2, 331);
      const barkFiber = periodicNoise(u * 8, v * 0.7, 64, 337);
      const h = ridge * 0.44 + fissure * 0.34 + crossCrack * 0.13 + barkFiber * 0.09;
      heights[y * size + x] = h;

      let r = 76 + h * 58 + (barkFiber - 0.5) * 9;
      let g = 52 + h * 38;
      let b = 30 + h * 22;
      if (lichen > 0.74) {
        const m = (lichen - 0.74) * 2.3;
        r = lerp(r, 98, Math.min(0.48, m));
        g = lerp(g, 120, Math.min(0.48, m));
        b = lerp(b, 74, Math.min(0.48, m));
      }
      const idx = (y * size + x) * 4;
      colorData[idx] = Math.max(0, Math.min(255, Math.round(r)));
      colorData[idx + 1] = Math.max(0, Math.min(255, Math.round(g)));
      colorData[idx + 2] = Math.max(0, Math.min(255, Math.round(b)));
      colorData[idx + 3] = 255;

      const rb = Math.max(182, Math.min(248, Math.round(240 - h * 48)));
      roughData[idx] = rb;
      roughData[idx + 1] = rb;
      roughData[idx + 2] = rb;
      roughData[idx + 3] = 255;
    }
  }
  barkCache = {
    map: makeColorDataTexture(colorData, size, size, 2, 2, true),
    normalMap: heightToNormalDataTexture(heights, size, size, 5.8, 2, 2),
    roughnessMap: makeColorDataTexture(roughData, size, size, 2, 2, false),
  };
  return barkCache;
}

let furCache: PBRMapSet | null = null;
export function getAnimalFurMaps(): PBRMapSet {
  if (furCache) return furCache;
  const size = 256;
  const colorData = new Uint8Array(size * size * 4);
  const roughData = new Uint8Array(size * size * 4);
  const heights = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const hair = periodicNoise(u * 0.85, v * 5.5, 30, 741);
      const coat = periodicFbm(u, v, 5, 3, 757);
      const dapple = periodicNoise(u * 1.4, v * 1.4, 9, 769);
      const h = hair * 0.52 + coat * 0.36 + dapple * 0.12;
      heights[y * size + x] = h;
      const dappleLift = dapple > 0.62 ? (dapple - 0.62) * 42 : 0;
      const val = Math.max(145, Math.min(252, Math.round(184 + (h - 0.5) * 66 + dappleLift)));
      const idx = (y * size + x) * 4;
      colorData[idx] = val;
      colorData[idx + 1] = Math.round(val * 0.96);
      colorData[idx + 2] = Math.round(val * 0.9);
      colorData[idx + 3] = 255;

      // Sleek healthy horse-coat highlights vs textured hair grain
      const rb = Math.max(122, Math.min(212, Math.round(176 - hair * 36 - dapple * 22)));
      roughData[idx] = rb;
      roughData[idx + 1] = rb;
      roughData[idx + 2] = rb;
      roughData[idx + 3] = 255;
    }
  }
  furCache = {
    map: makeColorDataTexture(colorData, size, size, 2, 2, true),
    normalMap: heightToNormalDataTexture(heights, size, size, 3.4, 2, 2),
    roughnessMap: makeColorDataTexture(roughData, size, size, 2, 2, false),
  };
  return furCache;
}

let leatherCache: PBRMapSet | null = null;
export function getLeatherMaps(): PBRMapSet {
  if (leatherCache) return leatherCache;
  const size = 256;
  const colorData = new Uint8Array(size * size * 4);
  const roughData = new Uint8Array(size * size * 4);
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
      const rb = Math.max(132, Math.min(218, Math.round(196 - pebble * 46)));
      roughData[idx] = rb;
      roughData[idx + 1] = rb;
      roughData[idx + 2] = rb;
      roughData[idx + 3] = 255;
    }
  }
  leatherCache = {
    map: makeColorDataTexture(colorData, size, size, 2, 2, true),
    normalMap: heightToNormalDataTexture(heights, size, size, 3.8, 2, 2),
    roughnessMap: makeColorDataTexture(roughData, size, size, 2, 2, false),
  };
  return leatherCache;
}

let constructionPadCache: PBRMapSet | null = null;
export function getConstructionPadMaps(): PBRMapSet {
  if (constructionPadCache) return constructionPadCache;
  const size = 512;
  const colorData = new Uint8Array(size * size * 4);
  const roughData = new Uint8Array(size * size * 4);
  const heights = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const earth = periodicFbm(u, v, 5, 4, 1409);
      const gravel = periodicNoise(u * 2, v * 2, 34, 1423);
      const track = Math.sin((u * 6 + earth * 1.4) * Math.PI * 2) * 0.5 + 0.5;
      const sawdust = periodicNoise(u * 3, v * 3, 44, 1447);
      const edgeDist = Math.min(u, 1 - u, v, 1 - v);
      const isCurb = edgeDist < 0.05;

      const h = isCurb ? 0.68 + gravel * 0.2 : 0.25 + earth * 0.4 + gravel * 0.25 + track * 0.1;
      heights[y * size + x] = h;

      let r = 132 + earth * 44 + (gravel - 0.5) * 32;
      let g = 104 + earth * 34 + (gravel - 0.5) * 26;
      let b = 72 + earth * 22 + (gravel - 0.5) * 18;
      if (isCurb) {
        r = lerp(r, 152, 0.55);
        g = lerp(g, 146, 0.55);
        b = lerp(b, 134, 0.55);
      } else if (sawdust > 0.8 && earth > 0.45) {
        r = lerp(r, 208, 0.48);
        g = lerp(g, 174, 0.48);
        b = lerp(b, 114, 0.48);
      }
      const idx = (y * size + x) * 4;
      colorData[idx] = Math.max(0, Math.min(255, Math.round(r)));
      colorData[idx + 1] = Math.max(0, Math.min(255, Math.round(g)));
      colorData[idx + 2] = Math.max(0, Math.min(255, Math.round(b)));
      colorData[idx + 3] = 255;

      const rb = Math.max(176, Math.min(248, Math.round(236 - (isCurb ? 28 : 0) - gravel * 24)));
      roughData[idx] = rb;
      roughData[idx + 1] = rb;
      roughData[idx + 2] = rb;
      roughData[idx + 3] = 255;
    }
  }

  constructionPadCache = {
    map: makeColorDataTexture(colorData, size, size, 1, 1, true),
    normalMap: heightToNormalDataTexture(heights, size, size, 4.6, 1, 1),
    roughnessMap: makeColorDataTexture(roughData, size, size, 1, 1, false),
  };
  return constructionPadCache;
}

let damascusCache: PBRMapSet | null = null;
export function getDamascusSteelMaps(): PBRMapSet {
  if (damascusCache) return damascusCache;
  const size = 256;
  const colorData = new Uint8Array(size * size * 4);
  const roughData = new Uint8Array(size * size * 4);
  const heights = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const warp = periodicFbm(u * 2, v * 2, 4, 3, 1601) * 1.65;
      const foldBands = Math.sin((u * 10 + v * 3 + warp * 2.4) * Math.PI * 2) * 0.5 + 0.5;
      const grind = periodicNoise(u * 0.6, v * 9.0, 32, 1613);
      const edgePolish = Math.abs(u - 0.5) * 2;
      const h = foldBands * 0.55 + grind * 0.25 + edgePolish * 0.2;
      heights[y * size + x] = h;

      const lum = Math.max(150, Math.min(255, Math.round(176 + foldBands * 48 + edgePolish * 24 + (grind - 0.5) * 16)));
      const idx = (y * size + x) * 4;
      colorData[idx] = Math.round(lum * 0.96);
      colorData[idx + 1] = Math.round(lum * 0.98);
      colorData[idx + 2] = Math.min(255, Math.round(lum * 1.03));
      colorData[idx + 3] = 255;

      // Mirror-honed edge vs acid-etched Damascus waves
      const rb = Math.max(32, Math.min(128, Math.round(98 - foldBands * 34 - edgePolish * 38)));
      roughData[idx] = rb;
      roughData[idx + 1] = rb;
      roughData[idx + 2] = rb;
      roughData[idx + 3] = 255;
    }
  }
  damascusCache = {
    map: makeColorDataTexture(colorData, size, size, 1, 2, true),
    normalMap: heightToNormalDataTexture(heights, size, size, 3.6, 1, 2),
    roughnessMap: makeColorDataTexture(roughData, size, size, 1, 2, false),
  };
  return damascusCache;
}

let chainmailCache: PBRMapSet | null = null;
export function getChainmailPlateMaps(): PBRMapSet {
  if (chainmailCache) return chainmailCache;
  const size = 256;
  const colorData = new Uint8Array(size * size * 4);
  const roughData = new Uint8Array(size * size * 4);
  const heights = new Float32Array(size * size);
  const ringsX = 12;
  const ringsY = 12;
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const row = Math.floor(v * ringsY);
      const fu = ((u * ringsX + (row % 2) * 0.5) % 1) - 0.5;
      const fv = (v * ringsY - row) - 0.5;
      const dist = Math.hypot(fu, fv);
      const ringBand = Math.max(0, 1 - Math.abs(dist - 0.34) / 0.14);
      const glint = periodicNoise(u * 4, v * 4, 24, 1709);
      const h = ringBand * 0.82 + glint * 0.18;
      heights[y * size + x] = h;

      const lum = Math.max(76, Math.min(248, Math.round(92 + ringBand * 136 + glint * 20)));
      const idx = (y * size + x) * 4;
      colorData[idx] = lum;
      colorData[idx + 1] = lum;
      colorData[idx + 2] = Math.min(255, lum + 10);
      colorData[idx + 3] = 255;

      const rb = ringBand > 0.25 ? Math.max(46, Math.min(115, Math.round(108 - ringBand * 48))) : 216;
      roughData[idx] = rb;
      roughData[idx + 1] = rb;
      roughData[idx + 2] = rb;
      roughData[idx + 3] = 255;
    }
  }
  chainmailCache = {
    map: makeColorDataTexture(colorData, size, size, 2, 2, true),
    normalMap: heightToNormalDataTexture(heights, size, size, 5.2, 2, 2),
    roughnessMap: makeColorDataTexture(roughData, size, size, 2, 2, false),
  };
  return chainmailCache;
}

let goldFiligreeCache: PBRMapSet | null = null;
export function getGoldFiligreeMaps(): PBRMapSet {
  if (goldFiligreeCache) return goldFiligreeCache;
  const size = 256;
  const colorData = new Uint8Array(size * size * 4);
  const roughData = new Uint8Array(size * size * 4);
  const heights = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const scroll = Math.sin((u * 6 + Math.sin(v * Math.PI * 4) * 0.45) * Math.PI * 2) * 0.5 + 0.5;
      const borderBand = v < 0.14 || v > 0.86 ? 0.9 : 0;
      const hammer = periodicNoise(u * 3, v * 3, 20, 1801);
      const relief = Math.max(borderBand, Math.pow(scroll, 2.2) * 0.85);
      const h = relief * 0.72 + hammer * 0.28;
      heights[y * size + x] = h;

      const idx = (y * size + x) * 4;
      colorData[idx] = Math.min(255, Math.round(188 + relief * 62));
      colorData[idx + 1] = Math.min(255, Math.round(142 + relief * 64));
      colorData[idx + 2] = Math.min(255, Math.round(52 + relief * 48));
      colorData[idx + 3] = 255;

      const rb = Math.max(36, Math.min(148, Math.round(134 - relief * 88)));
      roughData[idx] = rb;
      roughData[idx + 1] = rb;
      roughData[idx + 2] = rb;
      roughData[idx + 3] = 255;
    }
  }
  goldFiligreeCache = {
    map: makeColorDataTexture(colorData, size, size, 1, 1, true),
    normalMap: heightToNormalDataTexture(heights, size, size, 4.5, 1, 1),
    roughnessMap: makeColorDataTexture(roughData, size, size, 1, 1, false),
  };
  return goldFiligreeCache;
}

let oakHullCache: PBRMapSet | null = null;
export function getOakHullMaps(): PBRMapSet {
  if (oakHullCache) return oakHullCache;
  const size = 512;
  const colorData = new Uint8Array(size * size * 4);
  const roughData = new Uint8Array(size * size * 4);
  const heights = new Float32Array(size * size);
  const strakes = 8;
  for (let y = 0; y < size; y++) {
    const v = y / size;
    const strakeIdx = Math.floor(v * strakes);
    const fv = v * strakes - strakeIdx;
    const isCaulk = fv < 0.06 || fv > 0.94;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const jointU = (u * 2 + (strakeIdx % 2) * 0.5) % 1;
      const isButt = jointU < 0.025;
      const trunnelDist = Math.hypot((jointU - 0.07) * 2.0, fv - 0.5);
      const isBolt = !isCaulk && !isButt && trunnelDist < 0.09;
      const grain = periodicNoise(u * 0.4, v * 7.5, 24, 1907 + strakeIdx * 11);
      const damp = periodicFbm(u, v, 4, 3, 1931);
      const plankShade = (hash2D(strakeIdx, Math.floor(u * 2), 16, 1949) - 0.5) * 26;

      const h = isCaulk || isButt ? 0.08 : isBolt ? 0.9 : 0.46 + grain * 0.36 + damp * 0.18;
      heights[y * size + x] = h;

      const idx = (y * size + x) * 4;
      if (isCaulk || isButt) {
        colorData[idx] = 44;
        colorData[idx + 1] = 32;
        colorData[idx + 2] = 24;
      } else if (isBolt) {
        colorData[idx] = 66;
        colorData[idx + 1] = 64;
        colorData[idx + 2] = 68;
      } else {
        const shade = 0.78 + grain * 0.24 - (damp < 0.35 ? 0.12 : 0);
        colorData[idx] = Math.max(0, Math.min(255, Math.round((138 + plankShade) * shade)));
        colorData[idx + 1] = Math.max(0, Math.min(255, Math.round((88 + plankShade * 0.7) * shade)));
        colorData[idx + 2] = Math.max(0, Math.min(255, Math.round((48 + plankShade * 0.4) * shade)));
      }
      colorData[idx + 3] = 255;

      const rb = isCaulk || isButt ? 236 : isBolt ? 96 : Math.max(134, Math.min(218, Math.round(188 - grain * 34)));
      roughData[idx] = rb;
      roughData[idx + 1] = rb;
      roughData[idx + 2] = rb;
      roughData[idx + 3] = 255;
    }
  }
  oakHullCache = {
    map: makeColorDataTexture(colorData, size, size, 1, 1, true),
    normalMap: heightToNormalDataTexture(heights, size, size, 5.1, 1, 1),
    roughnessMap: makeColorDataTexture(roughData, size, size, 1, 1, false),
  };
  return oakHullCache;
}

let canvasSailCache: PBRMapSet | null = null;
export function getCanvasSailMaps(): PBRMapSet {
  if (canvasSailCache) return canvasSailCache;
  const size = 256;
  const colorData = new Uint8Array(size * size * 4);
  const roughData = new Uint8Array(size * size * 4);
  const heights = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    const reefBand = ((v * 4) % 1) < 0.05;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const panelSeam = ((u * 4) % 1) < 0.04;
      const flax = Math.sin(u * Math.PI * 36) * 0.5 + 0.5;
      const weaveY = Math.sin(v * Math.PI * 36) * 0.5 + 0.5;
      const billow = Math.sin(u * Math.PI) * Math.sin(v * Math.PI) * 0.25;
      const h = (reefBand || panelSeam ? 0.72 : 0.4 + (flax + weaveY) * 0.16) + billow;
      heights[y * size + x] = h;

      const seamShade = reefBand || panelSeam ? 0.86 : 1.0;
      const idx = (y * size + x) * 4;
      const val = Math.max(180, Math.min(252, Math.round((234 + (flax - 0.5) * 14) * seamShade)));
      colorData[idx] = val;
      colorData[idx + 1] = Math.round(val * 0.98);
      colorData[idx + 2] = Math.round(val * 0.93);
      colorData[idx + 3] = 255;

      const rb = reefBand || panelSeam ? 228 : Math.max(178, Math.min(232, Math.round(210 - (flax + weaveY) * 14)));
      roughData[idx] = rb;
      roughData[idx + 1] = rb;
      roughData[idx + 2] = rb;
      roughData[idx + 3] = 255;
    }
  }
  canvasSailCache = {
    map: makeColorDataTexture(colorData, size, size, 1, 1, true),
    normalMap: heightToNormalDataTexture(heights, size, size, 3.6, 1, 1),
    roughnessMap: makeColorDataTexture(roughData, size, size, 1, 1, false),
  };
  return canvasSailCache;
}
