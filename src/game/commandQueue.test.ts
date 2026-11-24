import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activateNextUnitCommand,
  clearUnitCommandQueue,
  enqueueCommandsForUnits,
  enqueueUnitCommand,
  type CommandQueueUnit,
} from './commandQueue';

function makeUnit(id: string): CommandQueueUnit {
  return {
    id,
    state: 'idle',
    targetX: undefined,
    targetZ: undefined,
    targetEntityId: undefined,
    targetResourceNodeId: undefined,
    targetBuildingId: undefined,
    targetGarrisonBuildingId: undefined,
    attackMoveGoal: null,
  };
}

test('Shift appends an independent FIFO queue to every selected unit', () => {
  const first = makeUnit('unit-a');
  const second = makeUnit('unit-b');
  const queued = enqueueCommandsForUnits([first, second, first], (unit, index) => ({
    type: 'move',
    x: index + 10,
    z: index + 20,
  }));

  assert.equal(queued, 2);
  assert.notEqual(first.commandQueue, second.commandQueue);
  assert.deepEqual(first.commandQueue, [{ type: 'move', x: 10, z: 20 }]);
  assert.deepEqual(second.commandQueue, [{ type: 'move', x: 11, z: 21 }]);
});

test('queued movement and attack-move activate as distinct unit states', () => {
  const unit = makeUnit('unit-a');
  enqueueUnitCommand(unit, { type: 'move', x: 12, z: 18 });
  enqueueUnitCommand(unit, { type: 'attackMove', x: 25, z: 30 });

  assert.equal(activateNextUnitCommand(unit)?.type, 'move');
  assert.equal(unit.state, 'moving');
  assert.deepEqual([unit.targetX, unit.targetZ], [12, 18]);
  assert.equal(unit.attackMoveGoal, null);

  assert.equal(activateNextUnitCommand(unit)?.type, 'attackMove');
  assert.equal(unit.state, 'moving');
  assert.deepEqual(unit.attackMoveGoal, { x: 25, z: 30 });
  assert.equal(unit.commandQueue, undefined);
});

test('queued gathering ends after one delivery when another action follows', () => {
  const unit = makeUnit('worker-a');
  enqueueUnitCommand(unit, { type: 'gather', nodeId: 'wood-a' });
  enqueueUnitCommand(unit, { type: 'build', buildingId: 'foundation-a' });

  assert.equal(activateNextUnitCommand(unit)?.type, 'gather');
  assert.equal(unit.state, 'gathering');
  assert.equal(unit.targetResourceNodeId, 'wood-a');
  assert.equal(unit.queuedGatherStopAfterDeposit, true);

  assert.equal(activateNextUnitCommand(unit)?.type, 'build');
  assert.equal(unit.state, 'building');
  assert.equal(unit.targetBuildingId, 'foundation-a');
  assert.equal(unit.queuedGatherStopAfterDeposit, false);
});

test('attack, boarding, build, repair, and garrison all activate from the same FIFO', () => {
  const unit = makeUnit('unit-a');
  const commands = [
    { type: 'attack', targetId: 'enemy-a' },
    { type: 'board', targetId: 'transport-a' },
    { type: 'build', buildingId: 'foundation-a' },
    { type: 'repair', buildingId: 'breached-wall-a' },
    { type: 'garrison', buildingId: 'keep-a' },
  ] as const;

  commands.forEach((command) => enqueueUnitCommand(unit, command));

  assert.equal(activateNextUnitCommand(unit)?.type, 'attack');
  assert.equal(unit.state, 'attacking');
  assert.equal(unit.targetEntityId, 'enemy-a');

  assert.equal(activateNextUnitCommand(unit)?.type, 'board');
  assert.equal(unit.state, 'moving');
  assert.equal(unit.targetEntityId, 'transport-a');

  assert.equal(activateNextUnitCommand(unit)?.type, 'build');
  assert.equal(unit.state, 'building');
  assert.equal(unit.targetBuildingId, 'foundation-a');

  assert.equal(activateNextUnitCommand(unit)?.type, 'repair');
  assert.equal(unit.state, 'building');
  assert.equal(unit.targetBuildingId, 'breached-wall-a');

  assert.equal(activateNextUnitCommand(unit)?.type, 'garrison');
  assert.equal(unit.state, 'garrisoning');
  assert.equal(unit.targetGarrisonBuildingId, 'keep-a');
  assert.equal(unit.commandQueue, undefined);
});

test('queued transport movement retains unload-on-arrival intent', () => {
  const unit = makeUnit('transport-a');
  enqueueUnitCommand(unit, { type: 'move', x: 40, z: -12, unload: true });
  const next = activateNextUnitCommand(unit);
  assert.equal(next?.type, 'move');
  assert.equal(next?.unload, true);
  assert.deepEqual([unit.targetX, unit.targetZ], [40, -12]);
});

test('clearing a queue also clears its finite-gather marker', () => {
  const unit = makeUnit('worker-a');
  unit.queuedGatherStopAfterDeposit = true;
  enqueueUnitCommand(unit, { type: 'move', x: 0, z: 0 });
  clearUnitCommandQueue(unit);
  assert.equal(unit.commandQueue, undefined);
  assert.equal(unit.queuedGatherStopAfterDeposit, false);
});
