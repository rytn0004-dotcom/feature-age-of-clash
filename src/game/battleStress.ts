import type {
  CivilizationId,
  MatchParticipant,
  UnitCategory,
} from '../types/game';

export const BATTLE_STRESS_UNIT_COUNTS = [100, 200, 400] as const;
export type BattleStressUnitCount = (typeof BATTLE_STRESS_UNIT_COUNTS)[number];
export type BattleStressRole = Extract<
  UnitCategory,
  'melee' | 'ranged' | 'cavalry' | 'siege' | 'special'
>;

export interface BattleStressSpawn {
  id: string;
  factionId: string;
  role: BattleStressRole;
  unitIndex: number;
  x: number;
  z: number;
  targetX: number;
  targetZ: number;
}

export interface BattleStressPlan {
  seed: number;
  unitCount: BattleStressUnitCount;
  starterUnitCount: number;
  participants: MatchParticipant[];
  units: BattleStressSpawn[];
}

const STRESS_FACTIONS: Array<{
  id: string;
  name: string;
  civilization: CivilizationId;
  aiPersonality: NonNullable<MatchParticipant['aiPersonality']>;
  colorHex: number;
  colorCss: string;
  accentHex: number;
}> = [
  {
    id: 'stress_medieval',
    name: '壓測·王國軍',
    civilization: 'medieval',
    aiPersonality: 'easy',
    colorHex: 0x2563eb,
    colorCss: '#3b82f6',
    accentHex: 0x60a5fa,
  },
  {
    id: 'stress_anime',
    name: '壓測·忍界軍',
    civilization: 'anime',
    aiPersonality: 'standard',
    colorHex: 0xdc2626,
    colorCss: '#ef4444',
    accentHex: 0xf87171,
  },
  {
    id: 'stress_fantasy',
    name: '壓測·森靈軍',
    civilization: 'fantasy',
    aiPersonality: 'hard',
    colorHex: 0x059669,
    colorCss: '#10b981',
    accentHex: 0x34d399,
  },
  {
    id: 'stress_medieval_elite',
    name: '壓測·遠征軍',
    civilization: 'medieval',
    aiPersonality: 'defensive',
    colorHex: 0xd97706,
    colorCss: '#f59e0b',
    accentHex: 0xfbbf24,
  },
];

const ROLE_DECK: BattleStressRole[] = [
  'melee',
  'melee',
  'melee',
  'ranged',
  'ranged',
  'cavalry',
  'siege',
  'special',
];

function normalizeSeed(seed: number): number {
  if (!Number.isFinite(seed)) {
    throw new RangeError('Battle stress seed must be a finite number.');
  }
  return (Math.floor(Math.abs(seed)) >>> 0) || 1;
}

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Builds an identical all-AI four-way battle for a fixed seed and requested
 * initial unit count. The first 16 units are spawned by the normal world setup.
 */
export function createBattleStressPlan(unitCount: number, seed = 20261122): BattleStressPlan {
  if (!BATTLE_STRESS_UNIT_COUNTS.includes(unitCount as BattleStressUnitCount)) {
    throw new RangeError('Battle stress unit count must be 100, 200, or 400.');
  }

  const normalizedSeed = normalizeSeed(seed);
  const random = createSeededRandom(normalizedSeed);
  const participants: MatchParticipant[] = STRESS_FACTIONS.map((faction, index) => ({
    id: faction.id,
    name: faction.name,
    controller: 'ai',
    team: index + 1,
    civilization: faction.civilization,
    aiPersonality: faction.aiPersonality,
    colorHex: faction.colorHex,
    colorCss: faction.colorCss,
    accentHex: faction.accentHex,
  }));

  const starterUnitCount = participants.length * 4;
  const additionalUnitCount = unitCount - starterUnitCount;
  const perFactionBase = Math.floor(additionalUnitCount / participants.length);
  const remainder = additionalUnitCount % participants.length;
  const units: BattleStressSpawn[] = [];
  let globalIndex = 0;

  participants.forEach((participant, factionIndex) => {
    const factionUnitCount = perFactionBase + (factionIndex < remainder ? 1 : 0);
    const angle = (-3 * Math.PI) / 4 + (factionIndex / participants.length) * Math.PI * 2;
    const radialX = Math.cos(angle);
    const radialZ = Math.sin(angle);
    const tangentX = -radialZ;
    const tangentZ = radialX;
    const columns = Math.ceil(Math.sqrt(factionUnitCount));
    const rowCount = Math.ceil(factionUnitCount / columns);
    const roleOffset = Math.floor(random() * ROLE_DECK.length);

    for (let unitIndex = 0; unitIndex < factionUnitCount; unitIndex++) {
      const row = Math.floor(unitIndex / columns);
      const column = unitIndex % columns;
      const lateral = (column - (Math.min(columns, factionUnitCount - row * columns) - 1) / 2) * 1.45;
      const radialDistance = 43 - row * 1.45;
      const jitterX = (random() - 0.5) * 0.18;
      const jitterZ = (random() - 0.5) * 0.18;
      const role = ROLE_DECK[(unitIndex + roleOffset) % ROLE_DECK.length];

      units.push({
        id: `stress-${normalizedSeed}-${globalIndex++}`,
        factionId: participant.id,
        role,
        unitIndex,
        x: radialX * radialDistance + tangentX * lateral + jitterX,
        z: radialZ * radialDistance + tangentZ * lateral + jitterZ,
        targetX: radialX * 2.4,
        targetZ: radialZ * 2.4,
      });
    }

    // Keep the formation planner honest when the count is small or uneven.
    if (factionUnitCount > 0 && rowCount < 1) {
      throw new Error('Invalid battle stress formation dimensions.');
    }
  });

  return {
    seed: normalizedSeed,
    unitCount: unitCount as BattleStressUnitCount,
    starterUnitCount,
    participants,
    units,
  };
}
