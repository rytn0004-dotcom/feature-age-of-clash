export interface ConstructionApproachPoint {
  x: number;
  z: number;
}

export const CONSTRUCTION_APPROACH_DIRECTION_COUNT = 8;

/** A failed route is temporarily excluded, then retried if the battlefield changes. */
export const CONSTRUCTION_HANDOFF_FAILURE_COOLDOWN_SECONDS = 30;

/** Record a failure once per cooldown; repeated polls must not extend the deadline. */
export function recordConstructionHandoffFailure(
  retryAtByWorkerId: Map<string, number>,
  workerId: string,
  now: number,
): void {
  if (!workerId || !Number.isFinite(now)) return;
  const retryAt = retryAtByWorkerId.get(workerId);
  if (Number.isFinite(retryAt) && retryAt! > now) return;
  retryAtByWorkerId.set(workerId, now + CONSTRUCTION_HANDOFF_FAILURE_COOLDOWN_SECONDS);
}

/** Remove expired worker failures and return the workers still cooling down. */
export function getActiveConstructionHandoffFailureIds(
  retryAtByWorkerId: Map<string, number>,
  now: number,
  reusableResult: Set<string> = new Set<string>(),
): Set<string> {
  // The engine supplies one caller-owned Set so repeated blocked-route checks
  // do not allocate a fresh exclusion collection for every handoff attempt.
  reusableResult.clear();

  if (!Number.isFinite(now)) {
    for (const workerId of retryAtByWorkerId.keys()) reusableResult.add(workerId);
    return reusableResult;
  }

  for (const [workerId, retryAt] of retryAtByWorkerId) {
    if (!Number.isFinite(retryAt) || retryAt <= now) retryAtByWorkerId.delete(workerId);
  }

  for (const workerId of retryAtByWorkerId.keys()) reusableResult.add(workerId);
  return reusableResult;
}

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

export interface ConstructionHandoffCandidate extends ConstructionWorkerPosition {
  id: string;
  hp: number;
  faction: string;
  category?: string;
  unitDef?: { category: string };
  state: string;
  targetBuildingId?: string;
  targetResourceNodeId?: string;
  targetEntityId?: string;
  targetGarrisonBuildingId?: string;
  targetX?: number;
  targetZ?: number;
  attackMoveGoal?: { x: number; z: number } | null;
  formationGroupId?: string;
  wallPatrolRoute?: readonly unknown[];
  pathGoal?: { x: number; z: number };
  waypoints?: readonly unknown[];
  garrisonedInBuildingId?: string | null;
  fieldAssemblyProjectId?: string;
  commandQueue?: readonly unknown[];
  queuedCommandCount?: number;
  carryingResource?: unknown;
  hasCarriedResource?: boolean;
  queuedGatherStopAfterDeposit?: boolean;
}

export interface ConstructionHandoffTarget extends ConstructionWorkTarget {
  faction: string;
}

/**
 * Select the nearest genuinely idle worker for a blocked construction target.
 * Workers with active orders, cargo, garrison reservations, or a previous
 * failed attempt are excluded so handoffs cannot steal another task or loop.
 * Returns the original candidate index, or -1 when no safe replacement exists.
 */
export function selectConstructionHandoffWorker(
  candidates: readonly ConstructionHandoffCandidate[],
  target: ConstructionHandoffTarget,
  excludedWorkerIds: ReadonlySet<string> = new Set<string>(),
  maxDistance = Number.POSITIVE_INFINITY,
): number {
  if (!Number.isFinite(target.x) || !Number.isFinite(target.z)) return -1;
  if (Number.isNaN(maxDistance) || maxDistance < 0) return -1;

  const maxDistanceSquared = Number.isFinite(maxDistance)
    ? maxDistance * maxDistance
    : Number.POSITIVE_INFINITY;
  let selectedIndex = -1;
  let selectedDistanceSquared = Number.POSITIVE_INFINITY;

  for (let index = 0; index < candidates.length; index++) {
    const candidate = candidates[index];
    if (
      !candidate.id ||
      excludedWorkerIds.has(candidate.id) ||
      !Number.isFinite(candidate.hp) ||
      candidate.hp <= 0 ||
      candidate.faction !== target.faction ||
      (candidate.unitDef?.category ?? candidate.category) !== 'worker' ||
      candidate.state !== 'idle' ||
      !!candidate.targetBuildingId ||
      !!candidate.targetResourceNodeId ||
      !!candidate.targetEntityId ||
      !!candidate.targetGarrisonBuildingId ||
      candidate.targetX !== undefined ||
      candidate.targetZ !== undefined ||
      !!candidate.attackMoveGoal ||
      !!candidate.formationGroupId ||
      !!candidate.wallPatrolRoute?.length ||
      !!candidate.pathGoal ||
      !!candidate.waypoints?.length ||
      !!candidate.garrisonedInBuildingId ||
      !!candidate.fieldAssemblyProjectId ||
      !!candidate.carryingResource ||
      !!candidate.hasCarriedResource ||
      !!candidate.queuedGatherStopAfterDeposit ||
      (candidate.commandQueue?.length ?? candidate.queuedCommandCount ?? 0) > 0 ||
      !Number.isFinite(candidate.x) ||
      !Number.isFinite(candidate.z)
    ) {
      continue;
    }

    const dx = candidate.x - target.x;
    const dz = candidate.z - target.z;
    const distanceSquared = dx * dx + dz * dz;
    if (
      Number.isFinite(distanceSquared) &&
      distanceSquared <= maxDistanceSquared &&
      (distanceSquared < selectedDistanceSquared - 1e-9 ||
        (Math.abs(distanceSquared - selectedDistanceSquared) <= 1e-9 && selectedIndex < 0))
    ) {
      selectedIndex = index;
      selectedDistanceSquared = distanceSquared;
    }
  }

  return selectedIndex;
}

/**
 * Solve a rectangular minimum-cost assignment matrix where rows <= columns.
 * The Hungarian algorithm gives a globally optimal one-to-one matching in O(n^2 m).
 */
function solveMinimumCostAssignment(costs: readonly (readonly number[])[]): number[] {
  const rowCount = costs.length;
  if (rowCount === 0) return [];
  const columnCount = costs[0]?.length ?? 0;
  if (columnCount < rowCount || costs.some((row) => row.length !== columnCount)) {
    return new Array<number>(rowCount).fill(-1);
  }

  const rowPotential = new Array<number>(rowCount + 1).fill(0);
  const columnPotential = new Array<number>(columnCount + 1).fill(0);
  const matchedRowForColumn = new Array<number>(columnCount + 1).fill(0);
  const previousColumn = new Array<number>(columnCount + 1).fill(0);

  for (let row = 1; row <= rowCount; row++) {
    matchedRowForColumn[0] = row;
    let currentColumn = 0;
    const minimumReducedCost = new Array<number>(columnCount + 1).fill(Number.POSITIVE_INFINITY);
    const visited = new Array<boolean>(columnCount + 1).fill(false);

    do {
      visited[currentColumn] = true;
      const currentRow = matchedRowForColumn[currentColumn];
      let delta = Number.POSITIVE_INFINITY;
      let nextColumn = 0;

      for (let column = 1; column <= columnCount; column++) {
        if (visited[column]) continue;
        const reducedCost =
          costs[currentRow - 1][column - 1] -
          rowPotential[currentRow] -
          columnPotential[column];
        if (reducedCost < minimumReducedCost[column]) {
          minimumReducedCost[column] = reducedCost;
          previousColumn[column] = currentColumn;
        }
        if (minimumReducedCost[column] < delta) {
          delta = minimumReducedCost[column];
          nextColumn = column;
        }
      }

      if (!Number.isFinite(delta) || nextColumn === 0) return new Array<number>(rowCount).fill(-1);
      for (let column = 0; column <= columnCount; column++) {
        if (visited[column]) {
          rowPotential[matchedRowForColumn[column]] += delta;
          columnPotential[column] -= delta;
        } else {
          minimumReducedCost[column] -= delta;
        }
      }
      currentColumn = nextColumn;
    } while (matchedRowForColumn[currentColumn] !== 0);

    do {
      const priorColumn = previousColumn[currentColumn];
      matchedRowForColumn[currentColumn] = matchedRowForColumn[priorColumn];
      currentColumn = priorColumn;
    } while (currentColumn !== 0);
  }

  const rowToColumn = new Array<number>(rowCount).fill(-1);
  for (let column = 1; column <= columnCount; column++) {
    const matchedRow = matchedRowForColumn[column];
    if (matchedRow > 0) rowToColumn[matchedRow - 1] = column - 1;
  }
  return rowToColumn;
}

/**
 * Match construction targets to distinct workers while minimizing total travel
 * distance, rather than greedily consuming the nearest pair. The result is
 * indexed by target and contains the original worker index; unmatched targets
 * and targets/workers with invalid coordinates remain unassigned.
 */
export function assignWorkersToConstructionTargets(
  workers: readonly ConstructionWorkerPosition[],
  targets: readonly ConstructionWorkTarget[],
): number[] {
  const assignments = new Array<number>(targets.length).fill(-1);
  if (workers.length === 0 || targets.length === 0) return assignments;

  const validWorkerIndices = workers
    .map((worker, index) => ({ worker, index }))
    .filter(({ worker }) => Number.isFinite(worker.x) && Number.isFinite(worker.z))
    .map(({ index }) => index);
  const validTargetIndices = targets
    .map((target, index) => ({ target, index }))
    .filter(({ target }) => Number.isFinite(target.x) && Number.isFinite(target.z))
    .map(({ index }) => index);
  if (validWorkerIndices.length === 0 || validTargetIndices.length === 0) return assignments;

  const travelDistance = (workerIndex: number, targetIndex: number): number => {
    const dx = workers[workerIndex].x - targets[targetIndex].x;
    const dz = workers[workerIndex].z - targets[targetIndex].z;
    const distance = Math.hypot(dx, dz);
    return Number.isFinite(distance) ? distance : Number.MAX_SAFE_INTEGER;
  };

  if (validWorkerIndices.length <= validTargetIndices.length) {
    const costs = validWorkerIndices.map((workerIndex) =>
      validTargetIndices.map((targetIndex) => travelDistance(workerIndex, targetIndex))
    );
    const workerToTarget = solveMinimumCostAssignment(costs);
    workerToTarget.forEach((targetColumn, workerRow) => {
      if (targetColumn < 0) return;
      assignments[validTargetIndices[targetColumn]] = validWorkerIndices[workerRow];
    });
  } else {
    const costs = validTargetIndices.map((targetIndex) =>
      validWorkerIndices.map((workerIndex) => travelDistance(workerIndex, targetIndex))
    );
    const targetToWorker = solveMinimumCostAssignment(costs);
    targetToWorker.forEach((workerColumn, targetRow) => {
      if (workerColumn < 0) return;
      assignments[validTargetIndices[targetRow]] = validWorkerIndices[workerColumn];
    });
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


/**
 * Choose the least-congested construction work-ring slot while keeping the
 * worker close to its natural approach side. This is evaluated only when a
 * worker changes construction targets, not on every simulation frame.
 */
export function selectConstructionApproachCandidateIndex(
  worker: ConstructionWorkerPosition,
  center: ConstructionApproachPoint,
  radius: number,
  preferredAngle: number,
  occupiedPoints: readonly ConstructionApproachPoint[],
  candidateCount = CONSTRUCTION_APPROACH_DIRECTION_COUNT,
  preferredSpacing = 1.35,
): number {
  const safeCount = Number.isInteger(candidateCount) && candidateCount > 0
    ? candidateCount
    : CONSTRUCTION_APPROACH_DIRECTION_COUNT;
  const safeSpacing = Number.isFinite(preferredSpacing) ? Math.max(0, preferredSpacing) : 0;
  let bestIndex = 0;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let index = 0; index < safeCount; index++) {
    const candidate = getConstructionApproachPoint(center, radius, preferredAngle, index, safeCount);
    const travelDistance = Math.hypot(worker.x - candidate.x, worker.z - candidate.z);
    let congestionPenalty = 0;

    for (const occupied of occupiedPoints) {
      const separation = Math.hypot(candidate.x - occupied.x, candidate.z - occupied.z);
      if (separation < safeSpacing) {
        const overlap = safeSpacing - separation;
        congestionPenalty += overlap * overlap * 5;
      }
    }

    const score = travelDistance + congestionPenalty;
    if (score < bestScore - 1e-9) {
      bestScore = score;
      bestIndex = index;
    }
  }

  return bestIndex;
}
