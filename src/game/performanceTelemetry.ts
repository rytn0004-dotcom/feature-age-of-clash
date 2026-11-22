export interface PerformanceSample {
  elapsedSeconds: number;
  wallTime: string;
  fps: number;
  frameAverageMs: number;
  frameP95Ms: number;
  maxHitchMs: number;
  simulationUpdateAverageMs: number;
  simulationUpdateMaxMs: number;
  renderCallAverageMs: number;
  renderCallMaxMs: number;
  pathSearchSamples: number;
  aiPathSearchSamples: number;
  emptyPathSearches: number;
  aiEmptyPathSearches: number;
  pathSearchAverageMs: number;
  pathSearchMaxMs: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  aliveUnits: number;
  aiAliveUnits: number;
  aiStalledUnits: number;
  aiPathRecoveryCount: number;
  aiMaxStuckSeconds: number;
  aiIdleUnits: number;
  aiMovingUnits: number;
  aiAttackingUnits: number;
  aiGatheringUnits: number;
  aiReturningUnits: number;
  aiBuildingUnits: number;
  aiAssemblingUnits: number;
  aiGarrisoningUnits: number;
  aiQueuedUnits: number;
  aiResearchingBuildings: number;
  aiDecisionCount: number;
  aiDecisionAccumulatorSeconds: number;
  aiDecisionTimingSamples: number;
  aiDecisionLastMs: number;
  aiDecisionAverageMs: number;
  aiDecisionMaxMs: number;
  projectileCount: number;
  activeParticles: number;
  particleCapacity: number;
  pixelRatio: number;
  rendererMode: string;
  qualityLevel: number;
  stressUnitCount: number | null;
  stressSeed: number | null;
  mapPreset: string;
  gameDurationSeconds: number;
  gameSpeed: number;
  gameState: string;
  participantCount: number;
  aiParticipantCount: number;
  viewportWidth: number;
  viewportHeight: number;
}

const CSV_COLUMNS: (keyof PerformanceSample)[] = [
  'elapsedSeconds',
  'wallTime',
  'fps',
  'frameAverageMs',
  'frameP95Ms',
  'maxHitchMs',
  'simulationUpdateAverageMs',
  'simulationUpdateMaxMs',
  'renderCallAverageMs',
  'renderCallMaxMs',
  'pathSearchSamples',
  'aiPathSearchSamples',
  'emptyPathSearches',
  'aiEmptyPathSearches',
  'pathSearchAverageMs',
  'pathSearchMaxMs',
  'drawCalls',
  'triangles',
  'geometries',
  'textures',
  'aliveUnits',
  'aiAliveUnits',
  'aiStalledUnits',
  'aiPathRecoveryCount',
  'aiMaxStuckSeconds',
  'aiIdleUnits',
  'aiMovingUnits',
  'aiAttackingUnits',
  'aiGatheringUnits',
  'aiReturningUnits',
  'aiBuildingUnits',
  'aiAssemblingUnits',
  'aiGarrisoningUnits',
  'aiQueuedUnits',
  'aiResearchingBuildings',
  'aiDecisionCount',
  'aiDecisionAccumulatorSeconds',
  'aiDecisionTimingSamples',
  'aiDecisionLastMs',
  'aiDecisionAverageMs',
  'aiDecisionMaxMs',
  'projectileCount',
  'activeParticles',
  'particleCapacity',
  'pixelRatio',
  'rendererMode',
  'qualityLevel',
  'stressUnitCount',
  'stressSeed',
  'mapPreset',
  'gameDurationSeconds',
  'gameSpeed',
  'gameState',
  'participantCount',
  'aiParticipantCount',
  'viewportWidth',
  'viewportHeight',
];

function escapeCsvValue(value: string | number | null): string {
  if (value === null) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';

  // Prevent spreadsheet formula execution when a text field is opened in Excel/Sheets.
  const safeValue = /^[\s]*[=+\-@]/.test(value) ? "'" + value : value;
  if (!/[",\r\n]/.test(safeValue)) return safeValue;
  return '"' + safeValue.replace(/"/g, '""') + '"';
}

/** Converts a bounded capture window into a spreadsheet-friendly UTF-8 CSV document. */
export function formatPerformanceTelemetryCsv(samples: readonly PerformanceSample[]): string {
  const header = CSV_COLUMNS.join(',');
  const rows = samples.map((sample) =>
    CSV_COLUMNS.map((column) => escapeCsvValue(sample[column])).join(','),
  );
  return '\uFEFF' + [header, ...rows].join('\r\n');
}

export interface AiDecisionTiming {
  sampleCount: number;
  totalMs: number;
  lastMs: number;
  maxMs: number;
}

export const EMPTY_AI_DECISION_TIMING: AiDecisionTiming = {
  sampleCount: 0,
  totalMs: 0,
  lastMs: 0,
  maxMs: 0,
};

/** Records wall-clock duration for one synchronous AI planning pass without keeping an unbounded history. */
export function recordAiDecisionTiming(
  previous: AiDecisionTiming,
  elapsedMs: number,
): AiDecisionTiming {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return previous;

  const lastMs = elapsedMs;
  const totalMs = previous.totalMs + elapsedMs;
  const sampleCount = previous.sampleCount + 1;
  return {
    sampleCount,
    totalMs,
    lastMs,
    maxMs: Math.max(previous.maxMs, elapsedMs),
  };
}

export function getAverageAiDecisionMs(timing: AiDecisionTiming): number {
  return timing.sampleCount > 0 ? timing.totalMs / timing.sampleCount : 0;
}

export interface PathSearchTiming {
  sampleCount: number;
  aiSampleCount: number;
  emptyPathCount: number;
  aiEmptyPathCount: number;
  totalMs: number;
  maxMs: number;
}

export const EMPTY_PATH_SEARCH_TIMING: PathSearchTiming = {
  sampleCount: 0,
  aiSampleCount: 0,
  emptyPathCount: 0,
  aiEmptyPathCount: 0,
  totalMs: 0,
  maxMs: 0,
};

/** Adds one path request to the current capture without storing per-search history. */
export function recordPathSearchTiming(
  previous: PathSearchTiming,
  elapsedMs: number,
  isAiPathSearch: boolean,
  hasPath: boolean,
): PathSearchTiming {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return previous;
  return {
    sampleCount: previous.sampleCount + 1,
    aiSampleCount: previous.aiSampleCount + (isAiPathSearch ? 1 : 0),
    emptyPathCount: previous.emptyPathCount + (hasPath ? 0 : 1),
    aiEmptyPathCount: previous.aiEmptyPathCount + (isAiPathSearch && !hasPath ? 1 : 0),
    totalMs: previous.totalMs + elapsedMs,
    maxMs: Math.max(previous.maxMs, elapsedMs),
  };
}

export function getAveragePathSearchMs(timing: PathSearchTiming): number {
  return timing.sampleCount > 0 ? timing.totalMs / timing.sampleCount : 0;
}
