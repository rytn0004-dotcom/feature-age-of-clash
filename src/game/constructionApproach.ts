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
