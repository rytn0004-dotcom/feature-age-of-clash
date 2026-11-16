export type WorldEventId = 'tidal_surge' | 'harvest_bloom' | 'ore_pulse' | 'war_drums';

export interface WorldEventModifiers {
  navalSpeedMultiplier: number;
  fishingGatherMultiplier: number;
  foodGatherMultiplier: number;
  farmProductionMultiplier: number;
  mineralGatherMultiplier: number;
  attackRateMultiplier: number;
  trainingSpeedMultiplier: number;
}

export interface WorldEventDefinition {
  id: WorldEventId;
  icon: string;
  title: string;
  description: string;
  modifiers: WorldEventModifiers;
}

export interface WorldEventStatus {
  event: WorldEventDefinition;
  isActive: boolean;
  phase: 'active' | 'intermission';
  secondsRemaining: number;
  cycleIndex: number;
}

export const WORLD_EVENT_DURATION_SECONDS = 90;
export const WORLD_EVENT_BREAK_SECONDS = 45;
export const WORLD_EVENT_CYCLE_SECONDS =
  WORLD_EVENT_DURATION_SECONDS + WORLD_EVENT_BREAK_SECONDS;

export const NEUTRAL_WORLD_EVENT_MODIFIERS: WorldEventModifiers = {
  navalSpeedMultiplier: 1,
  fishingGatherMultiplier: 1,
  foodGatherMultiplier: 1,
  farmProductionMultiplier: 1,
  mineralGatherMultiplier: 1,
  attackRateMultiplier: 1,
  trainingSpeedMultiplier: 1,
};

export const WORLD_EVENTS: WorldEventDefinition[] = [
  {
    id: 'tidal_surge',
    icon: '🌊',
    title: '季風洋流',
    description: '順流而行！漁船航速 +18%，捕魚效率 +25%。',
    modifiers: {
      ...NEUTRAL_WORLD_EVENT_MODIFIERS,
      navalSpeedMultiplier: 1.18,
      fishingGatherMultiplier: 1.25,
    },
  },
  {
    id: 'harvest_bloom',
    icon: '🌾',
    title: '豐收花潮',
    description: '土地進入豐產期，食物採集與農田產出 +18%。',
    modifiers: {
      ...NEUTRAL_WORLD_EVENT_MODIFIERS,
      foodGatherMultiplier: 1.18,
      farmProductionMultiplier: 1.18,
    },
  },
  {
    id: 'ore_pulse',
    icon: '⛏️',
    title: '地脈共鳴',
    description: '古老礦脈甦醒，黃金與石料採集效率 +22%。',
    modifiers: {
      ...NEUTRAL_WORLD_EVENT_MODIFIERS,
      mineralGatherMultiplier: 1.22,
    },
  },
  {
    id: 'war_drums',
    icon: '🥁',
    title: '遠古戰鼓',
    description: '戰意沸騰！部隊攻擊速度 +10%，訓練速度 +12%。',
    modifiers: {
      ...NEUTRAL_WORLD_EVENT_MODIFIERS,
      attackRateMultiplier: 1.1,
      trainingSpeedMultiplier: 1.12,
    },
  },
];

/** Returns a deterministic shuffled event order for a match seed. */
export function createWorldEventOrder(seed: number): WorldEventDefinition[] {
  const order = [...WORLD_EVENTS];
  let state = Math.abs(Math.floor(seed)) % 2147483647;
  if (state === 0) state = 1;

  const random = () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };

  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/**
 * Returns the current global event or a preview of the next event during the
 * intermission. All factions share the same deterministic schedule.
 */
export function getWorldEventStatusAtTime(
  gameTime: number,
  order: WorldEventDefinition[] = WORLD_EVENTS
): WorldEventStatus {
  const safeTime = Number.isFinite(gameTime) ? Math.max(0, gameTime) : 0;
  const safeOrder = order.length > 0 ? order : WORLD_EVENTS;
  const cycleIndex = Math.floor(safeTime / WORLD_EVENT_CYCLE_SECONDS);
  const cyclePhase = safeTime % WORLD_EVENT_CYCLE_SECONDS;
  const isActive = cyclePhase < WORLD_EVENT_DURATION_SECONDS;
  const eventIndex = isActive
    ? cycleIndex % safeOrder.length
    : (cycleIndex + 1) % safeOrder.length;
  const event = safeOrder[eventIndex];

  return {
    event,
    isActive,
    phase: isActive ? 'active' : 'intermission',
    secondsRemaining: Math.ceil(
      isActive
        ? WORLD_EVENT_DURATION_SECONDS - cyclePhase
        : WORLD_EVENT_CYCLE_SECONDS - cyclePhase
    ),
    cycleIndex,
  };
}
