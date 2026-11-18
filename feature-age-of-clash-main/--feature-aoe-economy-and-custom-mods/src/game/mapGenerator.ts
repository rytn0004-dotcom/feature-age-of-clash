import {
  MapPresetId,
  ResourceNode,
  ResourceRichness,
  ResourceType,
  TerrainBlockedDisc,
  TerrainBlockedRect,
  TerrainPassableBridge,
} from '../types/game';
import { isPointInTerrainObstacle } from './collision';

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
    description: '蜿蜒長河搭配石橋與淺灘，兩岸蘊藏豐富莓果叢、鹿群與金石礦脈。',
    groundTint: '#365314',
    accentHex: 0x0ea5e9,
  },
  {
    id: 'highland_basin',
    name: '黃金高地',
    subtitle: 'Highland Basin',
    description: '岩石山脊形成天然關隘，盆地富含大型金礦、花崗石與高山松林。',
    groundTint: '#4d5d28',
    accentHex: 0xf59e0b,
  },
  {
    id: 'twin_lakes',
    name: '雙湖渡口',
    subtitle: 'Twin Lakes',
    description: '東西雙湖夾擊中央陸橋，湖畔遍佈漿果園、野生鹿群與豐富礦藏。',
    groundTint: '#2f5233',
    accentHex: 0x10b981,
  },
];

export interface RoadSegment {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  width: number;
}

export interface MapLayoutResult {
  preset: MapPresetId;
  richness: ResourceRichness;
  waterRects: TerrainBlockedRect[];
  waterDiscs: TerrainBlockedDisc[];
  cliffDiscs: TerrainBlockedDisc[];
  bridges: TerrainPassableBridge[];
  roads: RoadSegment[];
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
  const rand = seededRandom(seed + spawns.length * 97 + (preset === 'river_valley' ? 1 : preset === 'highland_basin' ? 2 : 3));
  const mult = richness === 'abundant' ? 1.5 : 1.0;

  const waterRects: TerrainBlockedRect[] = [];
  const waterDiscs: TerrainBlockedDisc[] = [];
  const cliffDiscs: TerrainBlockedDisc[] = [];
  const bridges: TerrainPassableBridge[] = [];
  const roads: RoadSegment[] = [];
  const resourceNodes: ResourceNode[] = [];

  // 1. Build terrain features per map preset
  if (preset === 'river_valley') {
    // Diagonal river from SW (-58, 38) to NE (58, -38)
    waterRects.push({ x1: -62, z1: 42, x2: 62, z2: -42, kind: 'water' });
    const riverAngle = Math.atan2(-42 - 42, 62 - -62);
    // Central stone bridge + two shallow fords
    bridges.push(
      { x: 0, z: 0, halfWidth: 5.5, halfLength: 5.0, angle: riverAngle },
      { x: -25, z: 17, halfWidth: 4.5, halfLength: 4.8, angle: riverAngle },
      { x: 25, z: -17, halfWidth: 4.5, halfLength: 4.8, angle: riverAngle }
    );
    // Roads connecting bridges and spawns
    roads.push(
      { x1: -28, z1: -24, x2: 0, z2: 0, width: 2.3 },
      { x1: 28, z1: 24, x2: 0, z2: 0, width: 2.3 },
      { x1: -36, z1: 8, x2: -25, z2: 17, width: 2.0 },
      { x1: 36, z1: -8, x2: 25, z2: -17, width: 2.0 }
    );
  } else if (preset === 'highland_basin') {
    // Tactical cliff outcrops creating highland passes (kept clear of 2-6 player bases)
    const ridgeSpots = [
      { x: -16, z: -4, r: 4.5 },
      { x: -13, z: 3, r: 3.7 },
      { x: 16, z: 4, r: 4.5 },
      { x: 13, z: -3, r: 3.7 },
      { x: -3, z: -19, r: 4.1 },
      { x: 3, z: 19, r: 4.1 },
    ];
    ridgeSpots.forEach((spot) => {
      if (spawns.every((sp) => Math.hypot(sp.x - spot.x, sp.z - spot.z) > 15.5)) {
        cliffDiscs.push({ x: spot.x, z: spot.z, radius: spot.r, kind: 'cliff' });
      }
    });
    // Crossroad trails converging on central basin
    roads.push(
      { x1: -32, z1: -28, x2: 32, z2: 28, width: 2.3 },
      { x1: -28, z1: 26, x2: 28, z2: -26, width: 2.1 }
    );
  } else if (preset === 'twin_lakes') {
    // Twin lakes on West and East flanks leaving central corridor & outer paths
    const lakeCandidates = [
      { x: -24, z: 0, radius: 7.8, kind: 'water' as const },
      { x: 24, z: 0, radius: 7.8, kind: 'water' as const },
    ];
    lakeCandidates.forEach((lake) => {
      if (spawns.every((sp) => Math.hypot(sp.x - lake.x, sp.z - lake.z) > 16.5)) {
        waterDiscs.push(lake);
      }
    });
    // Causeway trails skirting lake centers / connecting flanks
    roads.push(
      { x1: 0, z1: -42, x2: 0, z2: 42, width: 2.4 },
      { x1: -36, z1: -28, x2: 0, z2: 0, width: 2.0 },
      { x1: 36, z1: 28, x2: 0, z2: 0, width: 2.0 }
    );
  }

  // Connect each participant spawn toward the central arena with a weathered dirt trail
  spawns.forEach((sp) => {
    const len = Math.hypot(sp.x, sp.z) || 1;
    const inX = -sp.x / len;
    const inZ = -sp.z / len;
    roads.push({
      x1: +(sp.x + inX * 5.2).toFixed(2),
      z1: +(sp.z + inZ * 5.2).toFixed(2),
      x2: +(sp.x * 0.35).toFixed(2),
      z2: +(sp.z * 0.35).toFixed(2),
      width: 2.0,
    });
  });

  const allBlockedDiscs = [...waterDiscs, ...cliffDiscs];
  const isClearForNode = (x: number, z: number, minPad = 2.6, edgePad = 2.6): boolean => {
    if (Math.abs(x) > 55 || Math.abs(z) > 55) return false;
    // Keep resource meshes completely off water, cliffs, riverbanks, and bridge decks
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
        if (Math.hypot(sx - br.x, sz - br.z) < Math.max(br.halfWidth, br.halfLength) + 1.4) {
          return false;
        }
      }
    }
    // Keep away from Town Center & immediate starter barracks/farm footprints
    for (const sp of spawns) {
      if (Math.hypot(x - sp.x, z - sp.z) < 8.4) return false;
      const len = Math.hypot(sp.x, sp.z) || 1;
      const tanX = sp.z / len;
      const tanZ = -sp.x / len;
      if (Math.hypot(x - (sp.x + tanX * 10.5), z - (sp.z + tanZ * 10.5)) < 4.5) return false;
      if (Math.hypot(x - (sp.x - tanX * 8.5), z - (sp.z - tanZ * 8.5)) < 3.6) return false;
    }
    // Keep nodes from stacking on top of each other
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
    edgePad = 2.6
  ): boolean => {
    const rx = +x.toFixed(2);
    const rz = +z.toFixed(2);
    if (
      !isClearForNode(
        rx,
        rz,
        subtype === 'wood' ? 1.85 : subtype === 'berry' || subtype === 'hunt' ? 2.0 : 3.0,
        edgePad
      )
    ) {
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

  // Expanded spiral search so starter/contested nodes are reliably placed on every preset
  const placeWithFallback = (
    id: string,
    resourceType: ResourceType,
    subtype: NonNullable<ResourceNode['subtype']>,
    tx: number,
    tz: number,
    amount: number,
    critical = false
  ) => {
    if (pushNode(id, resourceType, subtype, tx, tz, amount)) return;
    for (let r = 2.0; r <= 16.5; r += 2.2) {
      for (let a = 0; a < 12; a++) {
        const ang = (a / 12) * Math.PI * 2;
        if (pushNode(id, resourceType, subtype, tx + Math.cos(ang) * r, tz + Math.sin(ang) * r, amount)) {
          return;
        }
      }
    }
    if (critical) {
      for (let r = 2.0; r <= 20; r += 2.5) {
        for (let a = 0; a < 12; a++) {
          const ang = (a / 12) * Math.PI * 2 + 0.25;
          if (pushNode(id, resourceType, subtype, tx + Math.cos(ang) * r, tz + Math.sin(ang) * r, amount, 1.8)) {
            return;
          }
        }
      }
    }
  };

  // 2. Starter Personal Resource Clusters around every participant spawn
  spawns.forEach((sp) => {
    const len = Math.hypot(sp.x, sp.z) || 1;
    const inX = -sp.x / len;
    const inZ = -sp.z / len;
    const tanX = -inZ;
    const tanZ = inX;

    // Gold Vein #1 (close safe gold) + Gold Vein #2 (outer flank gold)
    placeWithFallback(
      `gold_base_${sp.id}`,
      'gold',
      'gold',
      sp.x + inX * 10.5 - tanX * 7.5,
      sp.z + inZ * 10.5 - tanZ * 7.5,
      1400,
      true
    );
    placeWithFallback(
      `gold_outer_${sp.id}`,
      'gold',
      'gold',
      sp.x - inX * 10.5 - tanX * 8.5,
      sp.z - inZ * 10.5 - tanZ * 8.5,
      1100,
      true
    );

    // Stone Outcrop
    placeWithFallback(
      `stone_base_${sp.id}`,
      'stone',
      'stone',
      sp.x - inX * 9.5 + tanX * 6.0,
      sp.z - inZ * 9.5 + tanZ * 6.0,
      1000,
      true
    );

    // Berry Bush Cluster (3 bushes per spawn for rapid early food!)
    const berryCx = sp.x + inX * 8.5 - tanX * 4.5;
    const berryCz = sp.z + inZ * 8.5 - tanZ * 4.5;
    for (let b = 0; b < 3; b++) {
      const ang = (b / 3) * Math.PI * 2;
      placeWithFallback(
        `berry_base_${sp.id}_${b}`,
        'food',
        'berry',
        berryCx + Math.cos(ang) * 2.1,
        berryCz + Math.sin(ang) * 2.1,
        350,
        b === 0
      );
    }

    // Wild Deer Herd nearby (2 deer per spawn)
    const deerCx = sp.x - inX * 9.0 - tanX * 3.0;
    const deerCz = sp.z - inZ * 9.0 - tanZ * 3.0;
    for (let d = 0; d < 2; d++) {
      placeWithFallback(
        `hunt_base_${sp.id}_${d}`,
        'food',
        'hunt',
        deerCx + d * 2.4,
        deerCz + (d % 2 === 0 ? 1.2 : -1.2),
        400,
        d === 0
      );
    }

    // Main Wood Grove near base
    const woodCx = sp.x + inX * 12.5 + tanX * 4.5;
    const woodCz = sp.z + inZ * 12.5 + tanZ * 4.5;
    for (let t = 0; t < 7; t++) {
      const ang = (t / 7) * Math.PI * 2;
      const dist = t === 0 ? 0.2 : 2.5 + (t % 2) * 0.9;
      placeWithFallback(
        `wood_base_${sp.id}_${t}`,
        'wood',
        'wood',
        woodCx + Math.cos(ang) * dist,
        woodCz + Math.sin(ang) * dist,
        320,
        t < 3
      );
    }
  });

  // 3. Contested Mid-Map & Flank Resource Richness (Many diverse targets across map!)
  const midGoldVeins = [
    { x: -7, z: 4, amt: 2000 },
    { x: 7, z: -4, amt: 2000 },
    { x: -16, z: -18, amt: 1800 },
    { x: 16, z: 18, amt: 1800 },
    { x: -34, z: 24, amt: 2200 },
    { x: 34, z: -24, amt: 2200 },
    { x: 0, z: -34, amt: 1800 },
    { x: 0, z: 34, amt: 1800 },
  ];
  midGoldVeins.forEach((g, idx) => {
    if (richness === 'standard' && idx >= 6) return;
    placeWithFallback(`gold_mid_${idx}`, 'gold', 'gold', g.x, g.z, g.amt);
  });

  const midStoneOutcrops = [
    { x: 0, z: 0, amt: 1400 },
    { x: -22, z: -12, amt: 1200 },
    { x: 22, z: 12, amt: 1200 },
    { x: -14, z: 30, amt: 1200 },
    { x: 14, z: -30, amt: 1200 },
  ];
  midStoneOutcrops.forEach((s, idx) => {
    if (richness === 'standard' && idx >= 3) return;
    placeWithFallback(`stone_mid_${idx}`, 'stone', 'stone', s.x, s.z, s.amt);
  });

  // Wild Berry Orchards across map flanks
  const berryGroves = [
    { x: -12, z: -8 },
    { x: 12, z: 8 },
    { x: -30, z: -6 },
    { x: 30, z: 6 },
    { x: 6, z: -26 },
    { x: -6, z: 26 },
  ];
  berryGroves.forEach((bg, gIdx) => {
    if (richness === 'standard' && gIdx >= 4) return;
    for (let b = 0; b < 3; b++) {
      const ang = (b / 3) * Math.PI * 2 + gIdx;
      placeWithFallback(
        `berry_wild_${gIdx}_${b}`,
        'food',
        'berry',
        bg.x + Math.cos(ang) * 2.2,
        bg.z + Math.sin(ang) * 2.2,
        350
      );
    }
  });

  // Wild Deer Herds roaming open meadows
  const huntHerds = [
    { x: -8, z: 16 },
    { x: 8, z: -16 },
    { x: -38, z: -2 },
    { x: 38, z: 2 },
  ];
  huntHerds.forEach((h, hIdx) => {
    for (let d = 0; d < 3; d++) {
      placeWithFallback(
        `hunt_wild_${hIdx}_${d}`,
        'food',
        'hunt',
        h.x + (d - 1) * 2.3,
        h.z + ((d % 2) - 0.5) * 2.0,
        420
      );
    }
  });

  // Forest Groves scattered strategically across mid-map & edges
  const forestCenters = [
    { cx: 0, cz: -21, count: 8 },
    { cx: 0, cz: 21, count: 8 },
    { cx: -21, cz: 2, count: 7 },
    { cx: 21, cz: -2, count: 7 },
    { cx: -42, cz: -14, count: 7 },
    { cx: 42, cz: 14, count: 7 },
    { cx: -14, cz: -42, count: 7 },
    { cx: 14, cz: 42, count: 7 },
  ];
  forestCenters.forEach((spot, sIdx) => {
    const count = richness === 'abundant' ? spot.count + 2 : spot.count;
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2 + rand() * 0.4;
      const rad = 1.8 + rand() * 4.5;
      placeWithFallback(
        `wood_mid_${sIdx}_${i}`,
        'wood',
        'wood',
        spot.cx + Math.cos(ang) * rad,
        spot.cz + Math.sin(ang) * rad,
        320
      );
    }
  });

  return {
    preset,
    richness,
    waterRects,
    waterDiscs,
    cliffDiscs,
    bridges,
    roads,
    resourceNodes,
  };
}
