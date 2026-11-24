export interface ConstructionApproachPoint {
  x: number;
  z: number;
}

export const CONSTRUCTION_APPROACH_DIRECTION_COUNT = 8;

/**
 * Returns a stable point on a construction work ring.
 * The caller can advance candidateIndex after a blocked route without letting the
 * destination orbit around the worker as its position changes.
 */
export function getConstructionApproachPoint(
  center: ConstructionApproachPoint,
  radius: number,
  preferredAngle: number,
  candidateIndex: number,
  candidateCount = CONSTRUCTION_APPROACH_DIRECTION_COUNT
): ConstructionApproachPoint {
  const safeCount = Number.isInteger(candidateCount) && candidateCount > 0
    ? candidateCount
    : CONSTRUCTION_APPROACH_DIRECTION_COUNT;
  const safeIndex = ((Math.floor(candidateIndex) % safeCount) + safeCount) % safeCount;
  const safeRadius = Number.isFinite(radius) ? Math.max(0, radius) : 0;
  const safeAngle = Number.isFinite(preferredAngle) ? preferredAngle : 0;
  const angle = safeAngle + (safeIndex * Math.PI * 2) / safeCount;
  return {
    x: center.x + Math.cos(angle) * safeRadius,
    z: center.z + Math.sin(angle) * safeRadius,
  };
}

export interface ConstructionWorkerPosition {
  x: number;
  z: number;
}

export interface ConstructionWorkTarget {
  x: number;
  z: number;
}

/**
 * Match each construction target to a distinct closest worker. Candidate pairs are
 * considered globally, preventing an early target from consuming the only worker
 * who can reach a later target efficiently.
 *
 * The returned array is indexed by target and contains the original worker index.
 * Targets outnumbering workers receive -1.
 */
export function assignWorkersToConstructionTargets(
  workers: readonly ConstructionWorkerPosition[],
  targets: readonly ConstructionWorkTarget[],
): number[] {
  const assignments = new Array<number>(targets.length).fill(-1);
  if (workers.length === 0 || targets.length === 0) return assignments;

  const candidates: Array<{ targetIndex: number; workerIndex: number; distanceSquared: number }> = [];
  targets.forEach((target, targetIndex) => {
    workers.forEach((worker, workerIndex) => {
      const dx = worker.x - target.x;
      const dz = worker.z - target.z;
      candidates.push({
        targetIndex,
        workerIndex,
        distanceSquared: dx * dx + dz * dz,
      });
    });
  });

  candidates.sort((a, b) =>
    a.distanceSquared - b.distanceSquared ||
    a.targetIndex - b.targetIndex ||
    a.workerIndex - b.workerIndex
  );

  const assignedWorkers = new Set<number>();
  let assignedCount = 0;
  for (const candidate of candidates) {
    if (assignments[candidate.targetIndex] !== -1 || assignedWorkers.has(candidate.workerIndex)) continue;
    assignments[candidate.targetIndex] = candidate.workerIndex;
    assignedWorkers.add(candidate.workerIndex);
    assignedCount++;
    if (assignedCount >= Math.min(workers.length, targets.length)) break;
  }

  return assignments;
}


export interface ConstructionWorkerCountCandidate {
  x: number;
  z: number;
  hp: number;
  faction: string;
  state?: string;
  targetBuildingId?: string;
  garrisonedInBuildingId?: string | null;
}

export interface ConstructionWorkerCountTarget {
  id: string;
  x: number;
  z: number;
  faction: string;
}

/** Preserve active-builder eligibility while avoiding a square-root distance calculation. */
export function isActiveConstructionWorkerWithinReach(
  worker: ConstructionWorkerCountCandidate,
  target: ConstructionWorkerCountTarget,
  buildReach: number,
): boolean {
  if (
    !Number.isFinite(buildReach) ||
    buildReach < 0 ||
    worker.hp <= 0 ||
    worker.faction !== target.faction ||
    worker.state !== 'building' ||
    worker.targetBuildingId !== target.id ||
    !!worker.garrisonedInBuildingId
  ) {
    return false;
  }

  const dx = worker.x - target.x;
  const dz = worker.z - target.z;
  return dx * dx + dz * dz <= buildReach * buildReach;
}


/** Add one eligible worker to a reusable per-building count map. */
export function accumulateActiveConstructionWorkerCount(
  counts: Map<string, number>,
  worker: ConstructionWorkerCountCandidate,
  target: ConstructionWorkerCountTarget,
  buildReach: number,
): void {
  if (!isActiveConstructionWorkerWithinReach(worker, target, buildReach)) return;
  counts.set(target.id, (counts.get(target.id) ?? 0) + 1);
}


export interface BlockedWallConstructionTarget {
  id: string;
  wallChainId?: string;
  faction: string;
  hp: number;
  isWall: boolean;
  isConstructed: boolean;
}

export interface QueuedWallConstructionCommand {
  type: string;
  buildingId?: string;
}

/**
 * A worker may defer an unreachable wall segment only when its next queued
 * command is another unfinished segment in the same wall chain. This keeps
 * normal build/repair orders and unrelated player commands in FIFO order.
 */
export function shouldDeferBlockedWallConstructionTarget(
  current: BlockedWallConstructionTarget,
  nextCommand: QueuedWallConstructionCommand | undefined,
  next: BlockedWallConstructionTarget | undefined,
): boolean {
  return !!nextCommand &&
    !!next &&
    nextCommand.type === 'build' &&
    nextCommand.buildingId === next.id &&
    !!current.wallChainId &&
    current.id !== next.id &&
    current.isWall &&
    next.isWall &&
    current.wallChainId === next.wallChainId &&
    current.faction === next.faction &&
    current.hp > 0 &&
    next.hp > 0 &&
    !current.isConstructed &&
    !next.isConstructed;
}


/**
 * Move a blocked wall command behind the remaining consecutive commands for
 * its chain, without moving it past later unrelated Shift-queued orders.
 */
export function deferBlockedWallConstructionCommand(
  queue: QueuedWallConstructionCommand[],
  currentBuildingId: string,
  wallChainId: string | undefined,
  resolveWallChainId: (buildingId: string) => string | undefined,
): boolean {
  if (!wallChainId || !currentBuildingId) return false;
  const first = queue[0];
  if (
    first?.type !== 'build' ||
    !first.buildingId ||
    resolveWallChainId(first.buildingId) !== wallChainId
  ) {
    return false;
  }

  let insertIndex = 0;
  while (insertIndex < queue.length) {
    const command = queue[insertIndex];
    if (
      command.type !== 'build' ||
      !command.buildingId ||
      resolveWallChainId(command.buildingId) !== wallChainId
    ) {
      break;
    }
    insertIndex++;
  }
  queue.splice(insertIndex, 0, { type: 'build', buildingId: currentBuildingId });
  return true;
}
