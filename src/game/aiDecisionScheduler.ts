export interface AiDecisionSchedulerState {
  accumulatorSeconds: number;
  cursor: number;
}

export interface AiDecisionScheduleStep {
  state: AiDecisionSchedulerState;
  factionId: string | null;
  intervalSeconds: number;
}

/**
 * Advances a bounded round-robin schedule for AI faction planning.
 *
 * The total strategic cadence remains baseIntervalSeconds per faction. With
 * multiple AI factions, their turns are staggered so their expensive planning
 * passes do not all run in the same simulation frame. After a long hitch, at
 * most one faction is emitted per call and excess backlog is capped.
 */
export function advanceAiDecisionScheduler(
  state: AiDecisionSchedulerState,
  factionIds: readonly string[],
  deltaSeconds: number,
  baseIntervalSeconds = 1.2,
): AiDecisionScheduleStep {
  // The engine passes a stable, match-scoped roster; reuse it directly so
  // scheduling does not allocate a filtered array on every simulation frame.
  const factions = factionIds;
  if (factions.length === 0) {
    return {
      state: { accumulatorSeconds: 0, cursor: 0 },
      factionId: null,
      intervalSeconds: baseIntervalSeconds > 0 && Number.isFinite(baseIntervalSeconds) ? baseIntervalSeconds : 1.2,
    };
  }

  const baseInterval =
    Number.isFinite(baseIntervalSeconds) && baseIntervalSeconds > 0 ? baseIntervalSeconds : 1.2;
  const intervalSeconds = baseInterval / factions.length;
  const safeCursor = Number.isFinite(state.cursor)
    ? ((Math.trunc(state.cursor) % factions.length) + factions.length) % factions.length
    : 0;
  const currentAccumulator =
    Number.isFinite(state.accumulatorSeconds) && state.accumulatorSeconds > 0
      ? state.accumulatorSeconds
      : 0;
  const elapsed = Number.isFinite(deltaSeconds) && deltaSeconds > 0 ? deltaSeconds : 0;
  const accumulated = currentAccumulator + elapsed;

  if (accumulated < intervalSeconds) {
    return {
      state: { accumulatorSeconds: accumulated, cursor: safeCursor },
      factionId: null,
      intervalSeconds,
    };
  }

  return {
    state: {
      accumulatorSeconds: Math.min(Math.max(0, accumulated - intervalSeconds), intervalSeconds * 0.5),
      cursor: (safeCursor + 1) % factions.length,
    },
    factionId: factions[safeCursor],
    intervalSeconds,
  };
}
