export interface FormationMovementMember {
  id: string;
  x: number;
  z: number;
  stuckDuration?: number;
  formationOrderOrigin: { x: number; z: number };
  formationOrderGoal: { x: number; z: number };
}

export interface FormationRegroupState {
  slowestProgress: number;
  activeMemberCount: number;
  stalledMemberCount: number;
}

export const FORMATION_REGROUP_STALL_SECONDS = 1.8;
export const FORMATION_REGROUP_ABANDON_STALL_SECONDS = 4.5;

/** Returns clamped progress along a squad's shared order vector (0 = start, 1 = goal). */
export function getFormationMoveProgress(
  x: number,
  z: number,
  origin: { x: number; z: number },
  goal: { x: number; z: number },
): number {
  if (![x, z, origin.x, origin.z, goal.x, goal.z].every(Number.isFinite)) return 0;
  const dx = goal.x - origin.x;
  const dz = goal.z - origin.z;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared <= 0.0001) return 1;

  const projected = ((x - origin.x) * dx + (z - origin.z) * dz) / lengthSquared;
  return Math.max(0, Math.min(1, projected));
}

/**
 * Starts a short squad regroup window when at least one member has been blocked
 * long enough to trigger path recovery. A member blocked for too long is excluded
 * so one permanently unreachable unit cannot freeze the entire army.
 */
export function measureFormationRegroup(
  members: readonly FormationMovementMember[],
): FormationRegroupState | null {
  if (members.length < 2) return null;

  const active = members.filter(
    (member) =>
      Number.isFinite(member.x) &&
      Number.isFinite(member.z) &&
      Number.isFinite(member.formationOrderOrigin.x) &&
      Number.isFinite(member.formationOrderOrigin.z) &&
      Number.isFinite(member.formationOrderGoal.x) &&
      Number.isFinite(member.formationOrderGoal.z) &&
      (!Number.isFinite(member.stuckDuration) ||
        (member.stuckDuration as number) < FORMATION_REGROUP_ABANDON_STALL_SECONDS),
  );
  if (active.length < 2) return null;

  const stalledMemberCount = active.filter(
    (member) =>
      Number.isFinite(member.stuckDuration) &&
      (member.stuckDuration as number) >= FORMATION_REGROUP_STALL_SECONDS,
  ).length;
  if (stalledMemberCount === 0) return null;

  const progress = active.map((member) =>
    getFormationMoveProgress(
      member.x,
      member.z,
      member.formationOrderOrigin,
      member.formationOrderGoal,
    ),
  );

  return {
    slowestProgress: Math.min(...progress),
    activeMemberCount: active.length,
    stalledMemberCount,
  };
}

/** Slows only the units that have pulled ahead while a blocked squadmate catches up. */
export function getFormationCohesionSpeedScale(
  progress: number,
  slowestProgress: number,
  regrouping: boolean,
): number {
  if (!regrouping || !Number.isFinite(progress) || !Number.isFinite(slowestProgress)) return 1;
  const gap = Math.max(0, progress - slowestProgress);
  const freeGap = 0.08;
  if (gap <= freeGap) return 1;
  return Math.max(0.25, Math.min(1, 1 - (gap - freeGap) * 2.4));
}
