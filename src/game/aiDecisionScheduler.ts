export interface AiDecisionSchedulerState {
  accumulatorSeconds: number;
  cursor: number;
}

export interface AiDecisionParticipant<TId extends string = string> {
  id: TId;
  controller: string;
}

/** Rebuilds a caller-owned match roster without allocating a new array. */
export function rebuildAiDecisionRoster<
  TId extends string,
  TParticipant extends AiDecisionParticipant<TId>,
>(participants: readonly TParticipant[], output: TId[]): TId[] {
  output.length = 0;
  for (let i = 0; i < participants.length; i++) {
    const participant = participants[i];
    if (
      participant.controller === 'ai' &&
      typeof participant.id === 'string' &&
      participant.id.length > 0
    ) {
      output.push(participant.id);
    }
  }
  return output;
}

/**
 * Advances a bounded round-robin schedule for AI faction planning.
 *
 * The total strategic cadence remains baseIntervalSeconds per faction. With
 * multiple AI factions, their turns are staggered so expensive planning passes
 * do not all run in the same simulation frame. After a long hitch, at most one
 * faction is emitted and excess backlog is capped.
 *
 * Mutates the caller-owned state and returns only the faction due this frame,
 * avoiding per-frame state/result objects and filtered roster arrays.
 */
export function advanceAiDecisionScheduler<TId extends string>(
  state: AiDecisionSchedulerState,
  factionIds: readonly TId[],
  deltaSeconds: number,
  baseIntervalSeconds = 1.2,
): TId | null {
  const baseInterval =
    Number.isFinite(baseIntervalSeconds) && baseIntervalSeconds > 0 ? baseIntervalSeconds : 1.2;
  const factionCount = factionIds.length;
  if (factionCount === 0) {
    state.accumulatorSeconds = 0;
    state.cursor = 0;
    return null;
  }

  let validFactionCount = 0;
  for (let i = 0; i < factionCount; i++) {
    const id = factionIds[i];
    if (typeof id === 'string' && id.length > 0) validFactionCount++;
  }
  if (validFactionCount === 0) {
    state.accumulatorSeconds = 0;
    state.cursor = 0;
    return null;
  }

  const intervalSeconds = baseInterval / validFactionCount;
  const safeCursor = Number.isFinite(state.cursor)
    ? ((Math.trunc(state.cursor) % factionCount) + factionCount) % factionCount
    : 0;
  const currentAccumulator =
    Number.isFinite(state.accumulatorSeconds) && state.accumulatorSeconds > 0
      ? state.accumulatorSeconds
      : 0;
  const elapsed = Number.isFinite(deltaSeconds) && deltaSeconds > 0 ? deltaSeconds : 0;
  const accumulated = currentAccumulator + elapsed;

  if (accumulated < intervalSeconds) {
    state.accumulatorSeconds = accumulated;
    state.cursor = safeCursor;
    return null;
  }

  let selectedIndex = safeCursor;
  let factionId: TId | null = null;
  for (let checked = 0; checked < factionCount; checked++) {
    const candidate = factionIds[selectedIndex];
    if (typeof candidate === 'string' && candidate.length > 0) {
      factionId = candidate;
      break;
    }
    selectedIndex = (selectedIndex + 1) % factionCount;
  }

  if (factionId === null) {
    state.accumulatorSeconds = 0;
    state.cursor = 0;
    return null;
  }

  state.accumulatorSeconds = Math.min(
    Math.max(0, accumulated - intervalSeconds),
    intervalSeconds * 0.5,
  );
  state.cursor = (selectedIndex + 1) % factionCount;
  return factionId;
}
