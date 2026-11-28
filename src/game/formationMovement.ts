import type { UnitCategory } from '../types/game';

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

export interface FormationStallCandidate {
  id: string;
  formationGroupId?: string;
  hp: number;
  stuckDuration?: number;
}

/** Groups recoverable stalled units once per update instead of rescanning the full army per squad. */
export function groupStalledFormationUnits<T extends FormationStallCandidate>(
  units: readonly T[],
): Map<string, T[]> {
  const groups = new Map<string, T[]>();

  for (const unit of units) {
    const groupId = unit.formationGroupId;
    const stuckDuration = unit.stuckDuration || 0;
    if (
      !groupId ||
      unit.hp <= 0 ||
      stuckDuration < FORMATION_REGROUP_STALL_SECONDS ||
      stuckDuration >= FORMATION_REGROUP_ABANDON_STALL_SECONDS
    ) {
      continue;
    }

    const members = groups.get(groupId) || [];
    members.push(unit);
    groups.set(groupId, members);
  }

  for (const members of groups.values()) {
    members.sort(
      (a, b) =>
        (b.stuckDuration || 0) - (a.stuckDuration || 0) ||
        a.id.localeCompare(b.id),
    );
  }

  return groups;
}

/** Returns clamped progress along a squad's shared order vector (0 = start, 1 = goal). */
export function getFormationMoveProgress(
  x: number,
  z: number,
  origin: { x: number; z: number },
  goal: { x: number; z: number },
): number {
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(z) ||
    !Number.isFinite(origin.x) ||
    !Number.isFinite(origin.z) ||
    !Number.isFinite(goal.x) ||
    !Number.isFinite(goal.z)
  ) return 0;
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

  let activeMemberCount = 0;
  let stalledMemberCount = 0;
  let slowestProgress = 1;

  // Keep this hot-path reducer allocation-free; it runs during group refreshes
  // and can be called for many squads in large battles.
  for (const member of members) {
    if (
      !Number.isFinite(member.x) ||
      !Number.isFinite(member.z) ||
      !Number.isFinite(member.formationOrderOrigin.x) ||
      !Number.isFinite(member.formationOrderOrigin.z) ||
      !Number.isFinite(member.formationOrderGoal.x) ||
      !Number.isFinite(member.formationOrderGoal.z)
    ) continue;

    const stuckDuration = member.stuckDuration;
    if (
      Number.isFinite(stuckDuration) &&
      (stuckDuration as number) >= FORMATION_REGROUP_ABANDON_STALL_SECONDS
    ) continue;

    activeMemberCount++;
    if (
      Number.isFinite(stuckDuration) &&
      (stuckDuration as number) >= FORMATION_REGROUP_STALL_SECONDS
    ) {
      stalledMemberCount++;
    }

    const progress = getFormationMoveProgress(
      member.x,
      member.z,
      member.formationOrderOrigin,
      member.formationOrderGoal,
    );
    if (progress < slowestProgress) slowestProgress = progress;
  }

  if (activeMemberCount < 2 || stalledMemberCount === 0) return null;

  return {
    slowestProgress,
    activeMemberCount,
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


export interface FormationNarrowPassage {
  x: number;
  z: number;
  directionX: number;
  directionZ: number;
  width: number;
  halfLength: number;
}

export interface FormationTrafficMember {
  id: string;
  x: number;
  z: number;
  stuckDuration?: number;
}

/**
 * Finds the first sustained narrow section along an already-computed A* route.
 * widthAt must return the walkable cross-section width at the supplied route point.
 */
export function findNarrowPassageOnRoute(
  route: readonly { x: number; z: number }[],
  widthAt: (x: number, z: number, directionX: number, directionZ: number) => number,
  maxWidth = 3.25,
): FormationNarrowPassage | null {
  if (route.length < 2 || !Number.isFinite(maxWidth) || maxWidth <= 0) return null;

  const segments: Array<{
    start: { x: number; z: number };
    end: { x: number; z: number };
    length: number;
    directionX: number;
    directionZ: number;
  }> = [];
  let totalLength = 0;

  for (let index = 0; index < route.length - 1; index++) {
    const start = route[index];
    const end = route[index + 1];
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const length = Math.hypot(dx, dz);
    if (!Number.isFinite(length) || length < 0.05) continue;
    segments.push({
      start,
      end,
      length,
      directionX: dx / length,
      directionZ: dz / length,
    });
    totalLength += length;
  }

  if (totalLength < 7) return null;

  type WidthSample = {
    x: number;
    z: number;
    directionX: number;
    directionZ: number;
    width: number;
    distance: number;
  };
  let run: WidthSample[] = [];
  let runEndDistance = -Infinity;

  const finishRun = (): FormationNarrowPassage | null => {
    if (run.length < 2) {
      run = [];
      runEndDistance = -Infinity;
      return null;
    }

    const averageX = run.reduce((sum, sample) => sum + sample.x, 0) / run.length;
    const averageZ = run.reduce((sum, sample) => sum + sample.z, 0) / run.length;
    const rawDirX = run.reduce((sum, sample) => sum + sample.directionX, 0);
    const rawDirZ = run.reduce((sum, sample) => sum + sample.directionZ, 0);
    const directionLength = Math.hypot(rawDirX, rawDirZ) || 1;
    const span = Math.max(0, run[run.length - 1].distance - run[0].distance);
    const passage = {
      x: averageX,
      z: averageZ,
      directionX: rawDirX / directionLength,
      directionZ: rawDirZ / directionLength,
      width: Math.min(...run.map((sample) => sample.width)),
      halfLength: Math.max(1.6, Math.min(5.5, span * 0.5 + 1.1)),
    };
    run = [];
    runEndDistance = -Infinity;
    return passage;
  };

  let travelled = 0;
  for (const segment of segments) {
    const steps = Math.max(1, Math.ceil(segment.length / 0.85));
    for (let step = 0; step <= steps; step++) {
      if (step === 0 && travelled > 0) continue;
      const localDistance = (step / steps) * segment.length;
      const routeDistance = travelled + localDistance;
      if (routeDistance < 3 || totalLength - routeDistance < 3) continue;

      const t = localDistance / segment.length;
      const x = segment.start.x + (segment.end.x - segment.start.x) * t;
      const z = segment.start.z + (segment.end.z - segment.start.z) * t;
      const measuredWidth = widthAt(x, z, segment.directionX, segment.directionZ);
      const isNarrow =
        Number.isFinite(measuredWidth) &&
        measuredWidth >= 0.75 &&
        measuredWidth <= maxWidth;

      if (isNarrow) {
        if (run.length > 0 && routeDistance - runEndDistance > 1.55) {
          const finished = finishRun();
          if (finished) return finished;
        }
        run.push({
          x,
          z,
          directionX: segment.directionX,
          directionZ: segment.directionZ,
          width: measuredWidth,
          distance: routeDistance,
        });
        runEndDistance = routeDistance;
      } else {
        const finished = finishRun();
        if (finished) return finished;
      }
    }
    travelled += segment.length;
  }

  return finishRun();
}

/**
 * Serializes units through a narrow route section. A unit that has already exited
 * is released immediately; abandoned, unreachable units never occupy a traffic slot.
 */
function isActiveFormationTrafficMember(member: FormationTrafficMember): boolean {
  return (
    Number.isFinite(member.x) &&
    Number.isFinite(member.z) &&
    (!Number.isFinite(member.stuckDuration) ||
      (member.stuckDuration as number) < FORMATION_REGROUP_ABANDON_STALL_SECONDS)
  );
}

/**
 * Applies narrow-passage traffic control without allocating filtered member
 * arrays or per-call position closures. This runs in the unit movement path,
 * so it scans the existing group roster with scalar state only.
 */
export function getFormationNarrowPassageTrafficScale(
  memberId: string,
  members: readonly FormationTrafficMember[],
  passage: FormationNarrowPassage,
): number {
  const halfLength = Math.max(1.6, passage.halfLength);
  const corridorHalfWidth = Math.max(0.5, passage.width * 0.5 + 0.45);
  const lateralX = -passage.directionZ;
  const lateralZ = passage.directionX;

  let currentAlong = 0;
  let currentLateral = 0;
  let hasCurrent = false;

  for (const member of members) {
    if (member.id !== memberId || !isActiveFormationTrafficMember(member)) continue;
    const dx = member.x - passage.x;
    const dz = member.z - passage.z;
    currentAlong = dx * passage.directionX + dz * passage.directionZ;
    currentLateral = dx * lateralX + dz * lateralZ;
    hasCurrent = true;
    break;
  }

  if (!hasCurrent) return 1;

  const capacity = Math.max(1, Math.floor((passage.width + 0.2) / 1.35));
  const currentInside =
    Math.abs(currentAlong) <= halfLength &&
    Math.abs(currentLateral) <= corridorHalfWidth;

  let occupantCount = 0;
  let unitsAhead = 0;

  for (const member of members) {
    if (member.id === memberId || !isActiveFormationTrafficMember(member)) continue;

    const dx = member.x - passage.x;
    const dz = member.z - passage.z;
    const along = dx * passage.directionX + dz * passage.directionZ;
    const lateral = dx * lateralX + dz * lateralZ;
    if (
      Math.abs(along) > halfLength ||
      Math.abs(lateral) > corridorHalfWidth
    ) {
      continue;
    }

    occupantCount++;
    if (
      currentInside &&
      (along > currentAlong + 0.4 ||
        (Math.abs(along - currentAlong) <= 0.4 && member.id < memberId))
    ) {
      unitsAhead++;
    }
  }

  if (currentInside) return unitsAhead >= capacity ? 0 : 1;

  const isQueuingAtEntrance =
    currentAlong < -halfLength &&
    currentAlong >= -halfLength - 3.8 &&
    Math.abs(currentLateral) <= corridorHalfWidth + 3.0;

  return isQueuingAtEntrance && occupantCount >= capacity ? 0 : 1;
}


export type FormationTacticalRole = 'frontline' | 'backline' | 'flank' | 'siege';

export interface FormationTacticalMember {
  id: string;
  category: UnitCategory;
}

/** True when a group has at least two melee units available to screen ranged allies. */
export function hasFormationShieldWallComposition(
  members: readonly FormationTacticalMember[],
): boolean {
  let meleeCount = 0;
  let hasRanged = false;
  for (const member of members) {
    if (member.category === 'melee') meleeCount++;
    else if (member.category === 'ranged') hasRanged = true;
    if (meleeCount >= 2 && hasRanged) return true;
  }
  return false;
}

export interface FormationTacticalSlot {
  x: number;
  z: number;
  role: FormationTacticalRole;
  lateralOffset: number;
  distanceFromTarget: number;
  /** True when melee form a compact screen in front of ranged allies. */
  shieldWall: boolean;
}

export interface FormationTacticalSlotInput {
  unitId: string;
  members: readonly FormationTacticalMember[];
  category: UnitCategory;
  groupOrigin: { x: number; z: number };
  memberPosition: { x: number; z: number };
  target: { x: number; z: number; radius: number };
  attackRange: number;
  unitRadius: number;
}

/** Stable, role-aware combat positions around a target. All slots remain inside weapon reach. */
export function getFormationTacticalSlot(
  input: FormationTacticalSlotInput,
): FormationTacticalSlot | null {
  const {
    unitId,
    members,
    category,
    groupOrigin,
    memberPosition,
    target,
  } = input;
  const attackRange = Number.isFinite(input.attackRange)
    ? Math.max(0.8, Math.min(24, input.attackRange))
    : 0.8;
  const targetRadius = Number.isFinite(target.radius)
    ? Math.max(0, target.radius)
    : 0;
  const unitRadius = Number.isFinite(input.unitRadius)
    ? Math.max(0.1, input.unitRadius)
    : 0.4;

  if (
    category === 'worker' ||
    members.length < 2 ||
    ![groupOrigin.x, groupOrigin.z, memberPosition.x, memberPosition.z, target.x, target.z].every(Number.isFinite)
  ) {
    return null;
  }

  const role: FormationTacticalRole =
    category === 'cavalry'
      ? 'flank'
      : category === 'siege'
        ? 'siege'
        : attackRange > 2.5 && (category === 'ranged' || category === 'special')
          ? 'backline'
          : 'frontline';
  const shieldWall =
    members.filter((member) => member.category === 'melee').length >= 2 &&
    members.some((member) => member.category === 'ranged');

  const sameRoleMembers = members
    .filter((member) => member.category === category)
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id));
  const slotIndex = sameRoleMembers.findIndex((member) => member.id === unitId);
  if (slotIndex < 0 || sameRoleMembers.length === 0) return null;

  let forwardX = target.x - groupOrigin.x;
  let forwardZ = target.z - groupOrigin.z;
  let forwardLength = Math.hypot(forwardX, forwardZ);
  if (forwardLength < 0.001) {
    forwardX = target.x - memberPosition.x;
    forwardZ = target.z - memberPosition.z;
    forwardLength = Math.hypot(forwardX, forwardZ);
  }
  if (forwardLength < 0.001) {
    forwardX = 1;
    forwardZ = 0;
    forwardLength = 1;
  }
  forwardX /= forwardLength;
  forwardZ /= forwardLength;
  const sideX = -forwardZ;
  const sideZ = forwardX;

  const maxCenterDistance = Math.max(
    targetRadius + unitRadius + 0.12,
    attackRange + targetRadius - 0.22,
  );
  let baseDistance = targetRadius + unitRadius + 0.42;
  let lateralOffset = 0;

  if (role === 'flank') {
    // Alternate cavalry across both sides, then widen each side by rank.
    const side = slotIndex % 2 === 0 ? -1 : 1;
    const rank = Math.floor(slotIndex / 2);
    baseDistance = Math.min(0.48, maxCenterDistance * 0.22);
    const maxLateral = Math.sqrt(Math.max(0, maxCenterDistance ** 2 - baseDistance ** 2));
    lateralOffset = side * Math.min(maxLateral, 1.15 + rank * 0.78);
  } else if (role === 'backline' || role === 'siege') {
    const preferredStandOff = attackRange * (role === 'siege' ? 0.8 : 0.72);
    baseDistance = targetRadius + Math.max(2.4, Math.min(role === 'siege' ? 14 : 11, preferredStandOff));
    baseDistance = Math.min(baseDistance, Math.max(targetRadius + 0.35, maxCenterDistance - 0.18));
    const spacing = role === 'siege' ? 2.3 : 1.85;
    const centered = (slotIndex - (sameRoleMembers.length - 1) / 2) * spacing;
    const maxLateral = Math.sqrt(Math.max(0, maxCenterDistance ** 2 - baseDistance ** 2));
    lateralOffset = Math.max(-maxLateral, Math.min(maxLateral, centered));
  } else {
    // Mixed squads close infantry gaps so the front row acts as a screen for archers.
    const spacing = shieldWall ? 1.05 : 1.35;
    const centered = (slotIndex - (sameRoleMembers.length - 1) / 2) * spacing;
    baseDistance = Math.min(baseDistance, Math.max(targetRadius + 0.25, maxCenterDistance - 0.2));
    const maxLateral = Math.sqrt(Math.max(0, maxCenterDistance ** 2 - baseDistance ** 2));
    lateralOffset = Math.max(-maxLateral, Math.min(maxLateral, centered));
  }

  const x =
    target.x -
    forwardX * baseDistance +
    sideX * lateralOffset;
  const z =
    target.z -
    forwardZ * baseDistance +
    sideZ * lateralOffset;
  const distanceFromTarget = Math.hypot(x - target.x, z - target.z);

  return {
    x,
    z,
    role,
    lateralOffset,
    distanceFromTarget,
    shieldWall,
  };
}

/** Avoids rebuilding tactical slots every frame; moving targets refresh only after a meaningful displacement. */
export function shouldRefreshFormationTacticalSlot(
  currentTargetId: string | undefined,
  currentAnchor: { x: number; z: number } | undefined,
  nextTargetId: string,
  nextTarget: { x: number; z: number },
  refreshDistance = 3.25,
): boolean {
  if (currentTargetId !== nextTargetId || !currentAnchor) return true;
  if (
    ![currentAnchor.x, currentAnchor.z, nextTarget.x, nextTarget.z, refreshDistance].every(Number.isFinite) ||
    refreshDistance < 0
  ) {
    return true;
  }
  return Math.hypot(nextTarget.x - currentAnchor.x, nextTarget.z - currentAnchor.z) >= refreshDistance;
}


export interface AiCavalryDisengageInput {
  hp: number;
  maxHp: number;
  nearbyEnemyCount: number;
  nearbyAllyCount: number;
  personality?: 'easy' | 'standard' | 'hard' | 'defensive';
}

/**
 * Allows cavalry to break contact when wounded and locally outnumbered.
 * Different AI personalities use different risk tolerances; the numeric
 * threshold is intentionally separate from the existing base-garrison rule.
 */
export function shouldAiCavalryDisengage(input: AiCavalryDisengageInput): boolean {
  const { hp, maxHp, nearbyEnemyCount, nearbyAllyCount, personality = 'standard' } = input;
  if (
    ![hp, maxHp, nearbyEnemyCount, nearbyAllyCount].every(Number.isFinite) ||
    maxHp <= 0 ||
    nearbyEnemyCount < 2 ||
    nearbyAllyCount < 1
  ) {
    return false;
  }

  const hpThreshold =
    personality === 'defensive'
      ? 0.58
      : personality === 'easy'
        ? 0.4
        : personality === 'hard'
          ? 0.44
          : 0.5;
  const healthRatio = Math.max(0, Math.min(1, hp / maxHp));
  const enemyCount = Math.max(0, Math.floor(nearbyEnemyCount));
  const allyCount = Math.max(1, Math.floor(nearbyAllyCount));
  return healthRatio <= hpThreshold && enemyCount > allyCount;
}
