/**
 * Shared heading and locomotion contract for wildlife visuals.
 *
 * The procedural deer, boar and aurochs rigs all face local +X. With a
 * Three.js Y rotation, +X maps to (cos(yaw), -sin(yaw)) in the XZ plane.
 */
export const DEER_ASSET_FORWARD_ALIGNMENT_YAW = Math.PI / 2;
export const WILDLIFE_MIN_FACING_DISPLACEMENT = 0.002;
export const WILDLIFE_MAX_SPEED = 8;
export const WILDLIFE_GAIT_PHASE_WRAP = Math.PI * 200;
export const WILDLIFE_FALLBACK_DELTA_SECONDS = 1 / 60;

export interface WildlifeForwardDirection {
  x: number;
  z: number;
}

export interface WildlifeGaitState {
  gaitPhase: number;
  moveBlend: number;
}

export interface WildlifeIdleMotion {
  breathing: number;
  weightShift: number;
  headNod: number;
  headLook: number;
  tailSway: number;
  grazing: boolean;
  grazingAmount: number;
}

/** Writes deterministic, phase-offset idle motion into caller-owned storage. */
export function writeWildlifeIdleMotion(
  output: WildlifeIdleMotion,
  time: number,
  phaseOffset = 0,
): WildlifeIdleMotion {
  const safeTime = Number.isFinite(time) ? time : 0;
  const safeOffset = Number.isFinite(phaseOffset) ? phaseOffset : 0;
  const t = safeTime + safeOffset;
  const grazingWave = Math.sin(t * 0.23 + safeOffset * 0.31);
  output.breathing = 0.5 + 0.5 * Math.sin(t * 1.34 + safeOffset * 0.63);
  output.weightShift = Math.sin(t * 0.78 + safeOffset * 0.91);
  output.headNod = Math.sin(t * 1.06 + safeOffset * 0.47);
  output.headLook = Math.sin(t * 0.39 + safeOffset * 1.13);
  output.tailSway = Math.sin(t * 1.82 + safeOffset * 0.73);
  output.grazing = grazingWave > 0.52;
  output.grazingAmount = Math.max(0, Math.min(1, (grazingWave - 0.28) / 0.72));
  return output;
}

/** Convenience value API for callers that do not need to reuse storage. */
export function getWildlifeIdleMotion(time: number, phaseOffset = 0): WildlifeIdleMotion {
  return writeWildlifeIdleMotion({
    breathing: 0,
    weightShift: 0,
    headNod: 0,
    headLook: 0,
    tailSway: 0,
    grazing: false,
    grazingAmount: 0,
  }, time, phaseOffset);
}

/** Stable id-derived angle without allocating split/reduce arrays inside simulation loops. */
export function getWildlifeHuntFallbackAngle(unitId: string): number {
  if (typeof unitId !== 'string' || unitId.length === 0) return 0;
  let hash = 2166136261;
  for (let index = 0; index < unitId.length; index++) {
    hash = Math.imul(hash ^ unitId.charCodeAt(index), 16777619);
  }
  return ((hash >>> 0) / 4294967296) * Math.PI * 2;
}

/** Converts real, collision-resolved ground displacement into the rig's Y yaw. */
export function getWildlifeFacingYaw(dx: number, dz: number): number | null {
  if (
    !Number.isFinite(dx) ||
    !Number.isFinite(dz) ||
    Math.hypot(dx, dz) <= WILDLIFE_MIN_FACING_DISPLACEMENT
  ) {
    return null;
  }

  return Math.atan2(-dz, dx);
}

/** Returns the world XZ direction of a local +X-facing wildlife rig. */
export function getWildlifeForwardDirection(yaw: number): WildlifeForwardDirection | null {
  if (!Number.isFinite(yaw)) return null;
  return {
    x: Math.cos(yaw),
    z: -Math.sin(yaw),
  };
}

/** Keeps persisted or mod-provided headings finite and in a stable [0, 2π) range. */
export function sanitizeWildlifeYaw(yaw: number | undefined, fallback = 0): number {
  const safeFallback = Number.isFinite(fallback) ? fallback : 0;
  const value = Number.isFinite(yaw) ? yaw as number : safeFallback;
  const wrapped = value % (Math.PI * 2);
  return wrapped < 0 ? wrapped + Math.PI * 2 : wrapped;
}

/** Invalid speeds become zero; extreme legacy values cannot launch wildlife across the map. */
export function sanitizeWildlifeVelocity(value: number | undefined): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-WILDLIFE_MAX_SPEED, Math.min(WILDLIFE_MAX_SPEED, value as number));
}

/** Simulation delta is bounded to the same stable range used by wildlife steering. */
export function clampWildlifeDeltaSeconds(dt: number): number {
  if (!Number.isFinite(dt)) return WILDLIFE_FALLBACK_DELTA_SECONDS;
  return Math.max(0.0001, Math.min(0.1, dt));
}

/** Advances footfall phase only by actual movement and eases stride amplitude at starts/stops. */
export function advanceWildlifeGait(
  previousPhase: number | undefined,
  previousBlend: number | undefined,
  distanceMoved: number,
  actualSpeed: number,
  dt: number,
  strideRadiansPerWorldUnit = 2.8,
): WildlifeGaitState {
  const phase = Number.isFinite(previousPhase) ? previousPhase as number : 0;
  const distance = Number.isFinite(distanceMoved) ? Math.max(0, distanceMoved) : 0;
  const strideScale = Number.isFinite(strideRadiansPerWorldUnit) && strideRadiansPerWorldUnit > 0
    ? strideRadiansPerWorldUnit
    : 2.8;
  const unwrappedPhase = phase + distance * strideScale;
  const gaitPhase = unwrappedPhase >= WILDLIFE_GAIT_PHASE_WRAP || unwrappedPhase < 0
    ? ((unwrappedPhase % WILDLIFE_GAIT_PHASE_WRAP) + WILDLIFE_GAIT_PHASE_WRAP) % WILDLIFE_GAIT_PHASE_WRAP
    : unwrappedPhase;

  const speed = Number.isFinite(actualSpeed) ? Math.max(0, actualSpeed) : 0;
  const safeDt = clampWildlifeDeltaSeconds(dt);
  const blend = Number.isFinite(previousBlend)
    ? Math.max(0, Math.min(1, previousBlend as number))
    : 0;
  const targetBlend = speed < 0.18 ? 0 : Math.min(1, speed / 4.8);
  let moveBlend = blend + (targetBlend - blend) * (1 - Math.exp(-12 * safeDt));
  if (speed < 0.18 && moveBlend < 0.03) moveBlend = 0;

  return { gaitPhase, moveBlend };
}
