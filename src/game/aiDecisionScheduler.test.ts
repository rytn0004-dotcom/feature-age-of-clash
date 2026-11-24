import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceAiDecisionScheduler } from './aiDecisionScheduler';

test('staggered AI turns rotate one faction at a time at an equal per-faction cadence', () => {
  const factions = ['blue', 'red', 'green', 'gold'];
  let state = { accumulatorSeconds: 0, cursor: 0 };

  let step = advanceAiDecisionScheduler(state, factions, 0.29);
  assert.equal(step.factionId, null);
  state = step.state;

  step = advanceAiDecisionScheduler(state, factions, 0.02);
  assert.equal(step.factionId, 'blue');
  assert.equal(step.intervalSeconds, 0.3);
  state = step.state;

  step = advanceAiDecisionScheduler(state, factions, 0.31);
  assert.equal(step.factionId, 'red');
  state = step.state;

  step = advanceAiDecisionScheduler(state, factions, 0.31);
  assert.equal(step.factionId, 'green');
  state = step.state;

  step = advanceAiDecisionScheduler(state, factions, 0.31);
  assert.equal(step.factionId, 'gold');
  assert.equal(step.state.cursor, 0);
});

test('a single AI faction keeps the original 1.2 second cadence', () => {
  const first = advanceAiDecisionScheduler(
    { accumulatorSeconds: 0, cursor: 0 },
    ['solo'],
    1.19,
  );
  assert.equal(first.factionId, null);
  const second = advanceAiDecisionScheduler(first.state, ['solo'], 0.02);
  assert.equal(second.factionId, 'solo');
  assert.equal(second.intervalSeconds, 1.2);
});

test('long frame hitches do not release a burst of queued AI decisions', () => {
  const step = advanceAiDecisionScheduler(
    { accumulatorSeconds: 0.1, cursor: 0 },
    ['blue', 'red', 'green', 'gold'],
    5,
  );
  assert.equal(step.factionId, 'blue');
  assert.equal(step.state.cursor, 1);
  assert.equal(step.state.accumulatorSeconds, 0.15);
});

test('an empty AI roster clears stale scheduler time and cursor', () => {
  const step = advanceAiDecisionScheduler(
    { accumulatorSeconds: 4, cursor: 3 },
    [],
    0.5,
  );
  assert.equal(step.factionId, null);
  assert.deepEqual(step.state, { accumulatorSeconds: 0, cursor: 0 });
});
