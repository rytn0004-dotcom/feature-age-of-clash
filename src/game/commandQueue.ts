import type { UnitQueuedCommand } from '../types/game';

export interface CommandQueueUnit {
  id: string;
  commandQueue?: UnitQueuedCommand[];
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

export function clearUnitCommandQueue<T extends CommandQueueUnit>(unit: T): void {
  unit.commandQueue = undefined;
}
