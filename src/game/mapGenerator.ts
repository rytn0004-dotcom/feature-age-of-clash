import {
  MapPresetId,
  ResourceNode,
  ResourceRichness,
  ResourceType,
  TerrainBlockedDisc,
  TerrainBlockedRect,
  TerrainPassableBridge,
} from '../types/game';
import { isOffshoreDeepWater, isPointInTerrainObstacle } from './collision';

export interface MapPresetMetadata {
  id: MapPresetId;
  name: string;
  subtitle: string;
  description: string;
  groundTint: string;
  accentHex: number;
}

export const MAP_PRESETS: MapPresetMetadata[] = [
  {
    id: 'river_valley',
    name: '河谷綠洲',
    subtitle: 'River Valley',
    description: '開闊長河搭配石橋與淺灘，河中央蘊藏豐富深海魚群（須建造碼頭與漁船捕撈），兩岸分佈沿岸魚與礦脈。',
    groundTint: '#365314',
    accentHex: 0x0ea5e9,
  },
  {
    id: 'highland_basin',
    name: '黃金高地',
    subtitle: 'Highland Basin',
    description: '岩石山脊形成天然關隘，盆地富含大型金礦、花崗石、野生山羌與高山松林。',
    groundTint: '#4d5d28',
    accentHex: 0xf59e0b,
  },
  {
    id: 'twin_lakes',
    name: '雙湖渡口',
    subtitle: 'Twin Lakes',
    description: '東西雙大湖夾擊中央陸橋，湖心深水蘊含高產深海魚群，湖畔遍佈沿岸魚、漿果與礦脈。',
    groundTint: '#2f5233',
    accentHex: 0x10b981,
  },
];

export interface MapLayoutResult {
  preset: MapPresetId;
  richness: ResourceRichness;
  waterRects: TerrainBlockedRect[];
  waterDiscs: TerrainBlockedDisc[];
  cliffDiscs: TerrainBlockedDisc[];
  bridges: TerrainPassableBridge[];
  resourceNodes: ResourceNode[];
}

function seededRandom(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function generateMapLayout(
  preset: MapPresetId,
  richness: ResourceRichness,
  spawns: Array<{ id: string; x: number; z: number }>,
  seed = 2026
): MapLayoutResult {
  const rand = seededRandom(
    seed + spawns.length * 97 + (preset === 'river_valley' ? 1 : preset === 'highland_basin' ? 2 : 3)
  );
  const mult = richness === 'abundant' ? 1.5 : 1.0;

  const waterRects: TerrainBlockedRect[] = [];
  const waterDiscs: TerrainBlockedDisc[] = [];
  const cliffDiscs: TerrainBlockedDisc[] = [];
  const bridges: TerrainPassableBridge[] = [];
  const resourceNodes: ResourceNode[] = [];

  // 1. Build enlarged terrain features per map preset (playable land spans [-88..88])
  if (preset === 'river_valley') {
    // Wide diagonal river from SW (-96, 64) to NE (96, -64) so center is >9.5m offshore
    waterRects.push({ x1: -96, z1: 64, x2: 96, z2: -64, kind: 'water', halfWidth: 9.8 });
    const riverAngle = Math.atan2(-64 - 64, 96 - -96);
    // Central stone bridge + two flank shallow fords spanning the wide river
    bridges.push(
      { x: 0, z: 0, halfWidth: 6.2, halfLength: 11.4, angle: riverAngle },
      { x: -42, z: 28, halfWidth: 5.0, halfLength: 11.2, angle: riverAngle },
      { x: 42, z: -28, halfWidth: 5.0, halfLength: 11.2, angle: riverAngle }
    );
  } else if (preset === 'highland_basin') {
    const ridgeSpots = [
      { x: -24, z: -7, r: 5.4 },
      { x: -18, z: 6, r: 4.4 },
      { x: 24, z: 7, r: 5.4 },
      { x: 18, z: -6, r: 4.4 },
      { x: -5, z: -28, r: 4.8 },
      { x: 5, z: 28, r: 4.8 },
      { x: -44, z: 18, r: 4.5 },
      { x: 44, z: -18, r: 4.5 },
    ];
    ridgeSpots.forEach((spot) => {
      if (spawns.every((sp) => Math.hypot(sp.x - spot.x, sp.z - spot.z) > 21)) {
        cliffDiscs.push({ x: spot.x, z: spot.z, radius: spot.r, kind: 'cliff' });
      }
    });
  } else if (preset === 'twin_lakes') {
    // Broad West/East lakes (radius 16.5..17.5) providing genuine offshore deep water
    const lakeCandidates = [
      { x: -42, z: 0, radius: 17.5, kind: 'water' as const },
      { x: 42, z: 0, radius: 17.5, kind: 'water' as const },
      { x: 0, z: -28, radius: 15.5, kind: 'water' as const },
      { x: 0, z: 28, radius: 15.5, kind: 'water' as const },
    ];
    for (const lake of lakeCandidates) {
      if (waterDiscs.length >= 2) break;
      const clearOfSpawns = spawns.every((sp) => Math.hypot(sp.x - lake.x, sp.z - lake.z) > lake.radius + 11.5);
      const clearOfLakes = waterDiscs.every((w) => Math.hypot(w.x - lake.x, w.z - lake.z) > lake.radius + w.radius + 6);
      if (clearOfSpawns && clearOfLakes) {
        waterDiscs.push(lake);
      }
    }
  }

  const allBlockedDiscs = [...waterDiscs, ...cliffDiscs];

  // Dry-land node placement rules:
  // - All land nodes stay >= 11.2m from EVERY Town Center (never inside TC base footprint)
  // - Closest Gold & Stone mines are ringed strictly OUTSIDE TC firing range (15m): [16.8 .. 20.8]
  // - Wild / mid-map nodes stay >= 23.5m from EVERY Town Center so base mines remain guaranteed closest
  const isClearForNode = (
    x: number,
    z: number,
    minPad = 2.6,
    edgePad = 2.6,
    isWild = false
  ): boolean => {
    if (Math.abs(x) > 84 || Math.abs(z) > 84) return false;
    const samplePts: Array<[number, number]> = [
      [x, z],
      [x + edgePad, z],
      [x - edgePad, z],
      [x, z + edgePad],
      [x, z - edgePad],
    ];
    for (const [sx, sz] of samplePts) {
      if (isPointInTerrainObstacle(sx, sz, waterRects, allBlockedDiscs, [])) return false;
      for (const br of bridges) {
        if (Math.hypot(sx - br.x, sz - br.z) < Math.max(br.halfWidth, br.halfLength) + 1.8) {
          return false;
        }
      }
    }
    const minTcDist = isWild ? 23.5 : 11.2;
    for (const sp of spawns) {
      if (Math.hypot(x - sp.x, z - sp.z) < minTcDist) return false;
      // Keep approach path in front of TC gate clear
      const len = Math.hypot(sp.x, sp.z) || 1;
      const inX = -sp.x / len;
      const inZ = -sp.z / len;
      const gateX = sp.x + inX * 7.2;
      const gateZ = sp.z + inZ * 7.2;
      if (Math.hypot(x - gateX, z - gateZ) < 4.0) return false;
    }
    for (const existing of resourceNodes) {
      if (Math.hypot(x - existing.x, z - existing.z) < minPad) return false;
    }
    return true;
  };

  const pushNode = (
    id: string,
    resourceType: ResourceType,
    subtype: NonNullable<ResourceNode['subtype']>,
    x: number,
    z: number,
    baseAmount: number,
    edgePad = 2.5,
    isWild = false
  ): boolean => {
    const rx = +x.toFixed(2);
    const rz = +z.toFixed(2);
    const minNodeSpacing =
      subtype === 'wood' ? 1.85 : subtype === 'berry' || subtype === 'hunt' ? 2.2 : 3.3;
    if (!isClearForNode(rx, rz, minNodeSpacing, edgePad, isWild)) {
      return false;
    }
    resourceNodes.push({
      id,
      resourceType,
      subtype,
      x: rx,
      z: rz,
      amount: Math.round(baseAmount * mult),
      maxAmount: Math.round(baseAmount * mult),
    });
    return true;
  };

  // Concentric ring search placing base Gold & Stone mines strictly outside TC range (>15 -> 16.8..20.5)
  const placeBaseRingNode = (
    id: string,
    resourceType: ResourceType,
    subtype: NonNullable<ResourceNode['subtype']>,
    sp: { id: string; x: number; z: number },
    targetAngle: number,
    amount: number,
    minR = 16.8,
    maxR = 20.5
  ): boolean => {
    const radii: number[] = [];
    for (let r = minR; r <= maxR + 0.01; r += 0.65) {
      radii.push(r);
    }
    for (const r of radii) {
      for (let step = 0; step < 32; step++) {
        const sign = step % 2 === 0 ? 1 : -1;
        const delta = Math.ceil(step / 2) * ((Math.PI * 2) / 32) * sign;
        const ang = targetAngle + delta;
        const cx = sp.x + Math.cos(ang) * r;
        const cz = sp.z + Math.sin(ang) * r;
        if (pushNode(id, resourceType, subtype, cx, cz, amount, 2.2, false)) {
          return true;
        }
      }
    }
    return false;
  };

  const placeWithFallback = (
    id: string,
    resourceType: ResourceType,
    subtype: NonNullable<ResourceNode['subtype']>,
    tx: number,
    tz: number,
    amount: number,
    critical = false,
    isWild = false
  ) => {
    if (pushNode(id, resourceType, subtype, tx, tz, amount, 2.5, isWild)) return;
    for (let r = 2.2; r <= 18.0; r += 2.3) {
      for (let a = 0; a < 14; a++) {
        const ang = (a / 14) * Math.PI * 2;
        if (pushNode(id, resourceType, subtype, tx + Math.cos(ang) * r, tz + Math.sin(ang) * r, amount, 2.2, isWild)) {
          return;
        }
      }
    }
    if (critical) {
      for (let r = 2.4; r <= 24; r += 2.6) {
        for (let a = 0; a < 16; a++) {
          const ang = (a / 16) * Math.PI * 2 + 0.2;
          if (pushNode(id, resourceType, subtype, tx + Math.cos(ang) * r, tz + Math.sin(ang) * r, amount, 1.8, false)) {
            return;
          }
        }
      }
    }
  };

  // 2. Starter Personal Resource Clusters around every participant spawn
  spawns.forEach((sp) => {
    const len = Math.hypot(sp.x, sp.z) || 1;
    const inAngle = Math.atan2(-sp.z / len, -sp.x / len);
    const baseSpin = (rand() - 0.5) * 1.15;
    const goldPrimaryAngle = inAngle + (rand() < 0.5 ? -1 : 1) * (1.15 + rand() * 0.45) + baseSpin * 0.35;
    const stonePrimaryAngle = goldPrimaryAngle + Math.PI * (0.72 + rand() * 0.25);

    // Closest Gold & Stone strictly OUTSIDE TC firing range (15 -> placed at 16.8..20.5)
    placeBaseRingNode(
      `gold_base_${sp.id}`,
      'gold',
      'gold',
      sp,
      goldPrimaryAngle,
      1400,
      16.8,
      20.5
    );
    placeBaseRingNode(
      `stone_base_${sp.id}`,
      'stone',
      'stone',
      sp,
      stonePrimaryAngle,
      1000,
      16.8,
      20.5
    );

    // Outer Flank Gold Vein (>= 25m away)
    const outerGoldAngle = goldPrimaryAngle + (rand() - 0.5) * 0.8 + Math.PI * 0.35;
    placeWithFallback(
      `gold_outer_${sp.id}`,
      'gold',
      'gold',
      sp.x + Math.cos(outerGoldAngle) * 26.0,
      sp.z + Math.sin(outerGoldAngle) * 26.0,
      1200,
      true,
      true
    );

    // Berry Bush Cluster outside courtyard (~14.5m out)
    const berryAngle = inAngle + (goldPrimaryAngle > inAngle ? -1.4 : 1.4) + (rand() - 0.5) * 0.4;
    const berryCx = sp.x + Math.cos(berryAngle) * 14.8;
    const berryCz = sp.z + Math.sin(berryAngle) * 14.8;
    for (let b = 0; b < 3; b++) {
      const ang = (b / 3) * Math.PI * 2 + rand() * 0.5;
      placeWithFallback(
        `berry_base_${sp.id}_${b}`,
        'food',
        'berry',
        berryCx + Math.cos(ang) * 2.2,
        berryCz + Math.sin(ang) * 2.2,
        350,
        b === 0,
        false
      );
    }

    // Wild Muntjac Herd (野生山羌) outside courtyard (~16.2m out)
    const huntAngle = inAngle + Math.PI + (rand() - 0.5) * 0.9;
    const deerCx = sp.x + Math.cos(huntAngle) * 16.4;
    const deerCz = sp.z + Math.sin(huntAngle) * 16.4;
    for (let d = 0; d < 2; d++) {
      placeWithFallback(
        `hunt_base_${sp.id}_${d}`,
        'food',
        'hunt',
        deerCx + (d === 0 ? -1.2 : 1.2),
        deerCz + (d % 2 === 0 ? 1.1 : -1.1),
        400,
        d === 0,
        false
      );
    }

    // Main Wood Grove outside courtyard (~17.8m out)
    const woodAngle = inAngle + Math.PI * 0.62 + baseSpin * 0.45;
    const woodCx = sp.x + Math.cos(woodAngle) * 18.0;
    const woodCz = sp.z + Math.sin(woodAngle) * 18.0;
    for (let t = 0; t < 8; t++) {
      const ang = (t / 8) * Math.PI * 2 + rand() * 0.35;
      const dist = t === 0 ? 0.2 : 2.5 + (t % 2) * 0.95;
      placeWithFallback(
        `wood_base_${sp.id}_${t}`,
        'wood',
        'wood',
        woodCx + Math.cos(ang) * dist,
        woodCz + Math.sin(ang) * dist,
        320,
        t < 3,
        false
      );
    }
  });

  // 3. Contested Mid-Map & Outer Flank Resource Richness (strictly >= 23.5m from all TCs)
  const jitter = () => (rand() - 0.5) * 5.0;

  const midGoldVeins = [
    { x: -12 + jitter(), z: 6 + jitter(), amt: 2000 },
    { x: 12 + jitter(), z: -6 + jitter(), amt: 2000 },
    { x: -24 + jitter(), z: -28 + jitter(), amt: 1800 },
    { x: 24 + jitter(), z: 28 + jitter(), amt: 1800 },
    { x: -56 + jitter(), z: 36 + jitter(), amt: 2200 },
    { x: 56 + jitter(), z: -36 + jitter(), amt: 2200 },
    { x: 0 + jitter(), z: -56 + jitter(), amt: 1800 },
    { x: 0 + jitter(), z: 56 + jitter(), amt: 1800 },
  ];
  midGoldVeins.forEach((g, idx) => {
    if (richness === 'standard' && idx >= 6) return;
    placeWithFallback(`gold_mid_${idx}`, 'gold', 'gold', g.x, g.z, g.amt, false, true);
  });

  const midStoneOutcrops = [
    { x: 0 + jitter(), z: 0 + jitter(), amt: 1400 },
    { x: -34 + jitter(), z: -18 + jitter(), amt: 1200 },
    { x: 34 + jitter(), z: 18 + jitter(), amt: 1200 },
    { x: -22 + jitter(), z: 48 + jitter(), amt: 1200 },
    { x: 22 + jitter(), z: -48 + jitter(), amt: 1200 },
  ];
  midStoneOutcrops.forEach((s, idx) => {
    if (richness === 'standard' && idx >= 3) return;
    placeWithFallback(`stone_mid_${idx}`, 'stone', 'stone', s.x, s.z, s.amt, false, true);
  });

  // Wild Berry Orchards across map flanks
  const berryGroves = [
    { x: -18 + jitter(), z: -12 + jitter() },
    { x: 18 + jitter(), z: 12 + jitter() },
    { x: -50 + jitter(), z: -10 + jitter() },
    { x: 50 + jitter(), z: 10 + jitter() },
    { x: 10 + jitter(), z: -42 + jitter() },
    { x: -10 + jitter(), z: 42 + jitter() },
  ];
  berryGroves.forEach((bg, gIdx) => {
    if (richness === 'standard' && gIdx >= 4) return;
    for (let b = 0; b < 3; b++) {
      const ang = (b / 3) * Math.PI * 2 + gIdx;
      placeWithFallback(
        `berry_wild_${gIdx}_${b}`,
        'food',
        'berry',
        bg.x + Math.cos(ang) * 2.3,
        bg.z + Math.sin(ang) * 2.3,
        350,
        false,
        true
      );
    }
  });

  // Wild Muntjac Herds roaming meadows
  const huntHerds = [
    { x: -12 + jitter(), z: 24 + jitter() },
    { x: 12 + jitter(), z: -24 + jitter() },
    { x: -62 + jitter(), z: -4 + jitter() },
    { x: 62 + jitter(), z: 4 + jitter() },
  ];
  huntHerds.forEach((h, hIdx) => {
    for (let d = 0; d < 3; d++) {
      placeWithFallback(
        `hunt_wild_${hIdx}_${d}`,
        'food',
        'hunt',
        h.x + (d - 1) * 2.4,
        h.z + ((d % 2) - 0.5) * 2.2,
        420,
        false,
        true
      );
    }
  });

  // Forest Groves scattered strategically across enlarged battlefield
  const forestCenters = [
    { cx: 0 + jitter(), cz: -34 + jitter(), count: 8 },
    { cx: 0 + jitter(), cz: 34 + jitter(), count: 8 },
    { cx: -32 + jitter(), cz: 4 + jitter(), count: 7 },
    { cx: 32 + jitter(), cz: -4 + jitter(), count: 7 },
    { cx: -66 + jitter(), cz: -20 + jitter(), count: 8 },
    { cx: 66 + jitter(), cz: 20 + jitter(), count: 8 },
    { cx: -22 + jitter(), cz: -66 + jitter(), count: 7 },
    { cx: 22 + jitter(), cz: 66 + jitter(), count: 7 },
  ];
  forestCenters.forEach((spot, sIdx) => {
    const count = richness === 'abundant' ? spot.count + 2 : spot.count;
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2 + rand() * 0.4;
      const rad = 1.8 + rand() * 5.0;
      placeWithFallback(
        `wood_mid_${sIdx}_${i}`,
        'wood',
        'wood',
        spot.cx + Math.cos(ang) * rad,
        spot.cz + Math.sin(ang) * rad,
        320,
        false,
        true
      );
    }
  });

  // 4. Water Fish Schools:
  // - `shore_fish`: hugging riverbanks / lakeshores (gatherable by land villagers AND boats)
  // - `deep_fish`: strictly far offshore (>= 5.5m from dry land; gatherable ONLY by Fishing Boats!)
  const pushWaterFish = (
    id: string,
    subtype: 'shore_fish' | 'deep_fish',
    x: number,
    z: number,
    baseAmount: number
  ): boolean => {
    const rx = +x.toFixed(2);
    const rz = +z.toFixed(2);
    if (Math.abs(rx) > 84 || Math.abs(rz) > 84) return false;
    if (!isPointInTerrainObstacle(rx, rz, waterRects, waterDiscs, [])) return false;
    if (subtype === 'deep_fish' && !isOffshoreDeepWater(rx, rz, waterRects, waterDiscs, bridges, 5.5)) {
      return false;
    }
    for (const br of bridges) {
      if (Math.hypot(rx - br.x, rz - br.z) < Math.max(br.halfWidth, br.halfLength) + 2.2) {
        return false;
      }
    }
    for (const sp of spawns) {
      if (Math.hypot(rx - sp.x, rz - sp.z) < 12.0) return false;
    }
    for (const existing of resourceNodes) {
      if (Math.hypot(rx - existing.x, rz - existing.z) < 3.0) return false;
    }
    resourceNodes.push({
      id,
      resourceType: 'food',
      subtype,
      x: rx,
      z: rz,
      amount: Math.round(baseAmount * mult),
      maxAmount: Math.round(baseAmount * mult),
    });
    return true;
  };

  if (preset === 'river_valley' && waterRects.length > 0) {
    const wr = waterRects[0];
    const hw = wr.halfWidth ?? 9.8;
    const rdx = wr.x2 - wr.x1;
    const rdz = wr.z2 - wr.z1;
    const rLen = Math.hypot(rdx, rdz) || 1;
    const tx = rdx / rLen;
    const tz = rdz / rLen;
    const nx = -tz;
    const nz = tx;

    // Shore fish 1.5..2.0m inside shoreline
    const shoreSlotsT = [0.09, 0.17, 0.35, 0.42, 0.58, 0.65, 0.83, 0.91];
    shoreSlotsT.forEach((tVal, idx) => {
      const t = tVal + (rand() - 0.5) * 0.02;
      const side = idx % 2 === 0 ? 1 : -1;
      const offset = hw - (1.45 + rand() * 0.45);
      const fx = wr.x1 + rdx * t + nx * side * offset;
      const fz = wr.z1 + rdz * t + nz * side * offset;
      pushWaterFish(`shore_fish_river_${idx}`, 'shore_fish', fx, fz, 450);
    });

    // Deep fish strictly down river center (>= 8m offshore)
    const deepSlotsT = [0.14, 0.37, 0.63, 0.86, ...(richness === 'abundant' ? [0.22, 0.78] : [])];
    deepSlotsT.forEach((tVal, idx) => {
      const t = tVal + (rand() - 0.5) * 0.02;
      const offset = (rand() - 0.5) * 2.2;
      const fx = wr.x1 + rdx * t + nx * offset;
      const fz = wr.z1 + rdz * t + nz * offset;
      pushWaterFish(`deep_fish_river_${idx}`, 'deep_fish', fx, fz, 750);
    });
  }

  waterDiscs.forEach((lake, lIdx) => {
    const shoreCount = richness === 'abundant' ? 4 : 3;
    const spin = rand() * Math.PI * 2;
    for (let s = 0; s < shoreCount; s++) {
      const ang = spin + (s / shoreCount) * Math.PI * 2 + (rand() - 0.5) * 0.2;
      const r = lake.radius - (1.35 + rand() * 0.35);
      pushWaterFish(
        `shore_fish_lake_${lIdx}_${s}`,
        'shore_fish',
        lake.x + Math.cos(ang) * r,
        lake.z + Math.sin(ang) * r,
        450
      );
    }

    const deepCount = richness === 'abundant' ? 4 : 3;
    for (let d = 0; d < deepCount; d++) {
      const baseAng = spin + ((d + 0.5) / deepCount) * Math.PI * 2;
      // Place strictly >= 7m inside the lakeshore
      const baseR = Math.max(2.2, Math.min(lake.radius - 7.5, lake.radius * 0.42));
      for (const offset of [0, 0.35, -0.35, 0.7]) {
        const ang = baseAng + offset;
        if (
          pushWaterFish(
            `deep_fish_lake_${lIdx}_${d}`,
            'deep_fish',
            lake.x + Math.cos(ang) * baseR,
            lake.z + Math.sin(ang) * baseR,
            750
          )
        ) {
          break;
        }
      }
    }
  });

  return {
    preset,
    richness,
    waterRects,
    waterDiscs,
    cliffDiscs,
    bridges,
    resourceNodes,
  };
}

