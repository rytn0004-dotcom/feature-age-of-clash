export interface PerformanceSample {
  elapsedSeconds: number;
  wallTime: string;
  fps: number;
  frameAverageMs: number;
  frameP95Ms: number;
  maxHitchMs: number;
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
