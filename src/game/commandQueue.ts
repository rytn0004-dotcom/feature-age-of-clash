import type { UnitQueuedCommand } from '../types/game';

export interface CommandQueueUnit {
  id: string;
  commandQueue?: UnitQueuedCommand[];
  targetX?: number;
  targetZ?: number;
  targetEntityId?: string;
  targetResourceNodeId?: string;
  targetBuildingId?: string;
  targetGarrisonBuildingId?: string;
  attackMoveGoal?: { x: number; z: number } | null;
  waypoints?: Array<{ x: number; z: number }>;
  pathGoal?: { x: number; z: number };
  pathCooldown?: number;
  state?: string;
  currentActionText?: string;
  queuedGatherStopAfterDeposit?: boolean;
  wildlifeHuntApproachAngle?: number;
  wildlifeHuntApproachTargetNodeId?: string;
  wildlifeHuntApproachGoal?: { x: number; z: number };
  wildlifeCarcassHarvestNodeId?: string;
  wildlifeCarcassHarvestActive?: boolean;
  wildlifeCarcassHarvestSlotIndex?: number;
}

/** Append one independently-owned FIFO command to a unit's personal queue. */
export function enqueueUnitCommand<T extends CommandQueueUnit>(
  unit: T,
  command: UnitQueuedCommand,
): void {
  if (!unit.commandQueue) unit.commandQueue = [];
  unit.commandQueue.push(command);
}

/** Queue one command per eligible selected unit without sharing mutable queue arrays. */
export function enqueueCommandsForUnits<T extends CommandQueueUnit>(
  selectedUnits: readonly T[],
  createCommand: (unit: T, index: number) => UnitQueuedCommand | null,
): number {
  const seen = new Set<string>();
  let queued = 0;
  for (let index = 0; index < selectedUnits.length; index++) {
    const unit = selectedUnits[index];
    if (seen.has(unit.id)) continue;
    seen.add(unit.id);
    const command = createCommand(unit, index);
    if (!command) continue;
    enqueueUnitCommand(unit, command);
    queued++;
  }
  return queued;
}

/** Consume only this unit's next command; release the array when it becomes empty. */
export function takeNextUnitCommand<T extends CommandQueueUnit>(
  unit: T,
): UnitQueuedCommand | undefined {
  const next = unit.commandQueue?.shift();
  if (unit.commandQueue?.length === 0) unit.commandQueue = undefined;
  return next;
}

/** Activate a queued command on exactly one unit, keeping all other units' queues untouched. */
export function activateNextUnitCommand<T extends CommandQueueUnit>(
  unit: T,
): UnitQueuedCommand | undefined {
  const next = takeNextUnitCommand(unit);
  if (!next) return undefined;

  unit.targetEntityId = undefined;
  unit.targetResourceNodeId = undefined;
  unit.targetBuildingId = undefined;
  unit.targetGarrisonBuildingId = undefined;
  unit.attackMoveGoal = null;
  unit.waypoints = undefined;
  unit.pathGoal = undefined;
  unit.pathCooldown = 0;
  unit.queuedGatherStopAfterDeposit = false;
  unit.wildlifeHuntApproachAngle = undefined;
  unit.wildlifeHuntApproachTargetNodeId = undefined;
  unit.wildlifeHuntApproachGoal = undefined;
  unit.wildlifeCarcassHarvestNodeId = undefined;
  unit.wildlifeCarcassHarvestActive = undefined;
  unit.wildlifeCarcassHarvestSlotIndex = undefined;

  switch (next.type) {
    case 'move':
      unit.targetX = next.x;
      unit.targetZ = next.z;
      unit.state = 'moving';
      unit.currentActionText = '👣 佇列行軍';
      break;
    case 'attackMove':
      unit.targetX = next.x;
      unit.targetZ = next.z;
      unit.attackMoveGoal = { x: next.x, z: next.z };
      unit.state = 'moving';
      unit.currentActionText = '⚔️ 佇列攻擊推進';
      break;
    case 'gather':
      unit.targetResourceNodeId = next.nodeId;
      if (Number.isFinite(next.wildlifeHuntApproachAngle)) {
        unit.wildlifeHuntApproachAngle = next.wildlifeHuntApproachAngle;
        unit.wildlifeHuntApproachTargetNodeId = next.nodeId;
      }
      unit.queuedGatherStopAfterDeposit = !!unit.commandQueue?.length;
      unit.state = 'gathering';
      unit.currentActionText = '⋯佇列採集';
      break;
    case 'attack':
      unit.targetEntityId = next.targetId;
      unit.state = 'attacking';
      unit.currentActionText = '⚔️ 佇列攻擊';
      break;
    case 'board':
      unit.targetEntityId = next.targetId;
      unit.state = 'moving';
      unit.currentActionText = '🚢 佇列登船';
      break;
    case 'build':
      unit.targetBuildingId = next.buildingId;
      unit.state = 'building';
      unit.currentActionText = '🔨 佇列建造';
      break;
    case 'repair':
      unit.targetBuildingId = next.buildingId;
      unit.state = 'building';
      unit.currentActionText = '🧱 佇列修復';
      break;
    case 'garrison':
      unit.targetGarrisonBuildingId = next.buildingId;
      unit.state = 'garrisoning';
      unit.currentActionText = '🛡️ 佇列進駐';
      break;
  }

  return next;
}

export function clearUnitCommandQueue<T extends CommandQueueUnit>(unit: T): void {
  unit.commandQueue = undefined;
  unit.queuedGatherStopAfterDeposit = false;
}
