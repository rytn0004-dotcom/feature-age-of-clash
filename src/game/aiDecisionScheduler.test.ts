import assert from 'node:assert/strict';
import test from 'node:test';
import {
  advanceAiDecisionScheduler,
  rebuildAiDecisionRoster,
} from './aiDecisionScheduler';

test('staggered AI turns rotate one faction at a time at an equal per-faction cadence', () => {
  const factions = ['blue', 'red', 'green', 'gold'];
  const state = { accumulatorSeconds: 0, cursor: 0 };
  const stateIdentity = state;

  assert.equal(advanceAiDecisionScheduler(state, factions, 0.29), null);
  assert.equal(state.accumulatorSeconds, 0.29);
  assert.equal(advanceAiDecisionScheduler(state, factions, 0.02), 'blue');
  assert.ok(Math.abs(state.accumulatorSeconds - 0.01) < 1e-9);
  assert.equal(state.cursor, 1);

  assert.equal(advanceAiDecisionScheduler(state, factions, 0.31), 'red');
  assert.equal(advanceAiDecisionScheduler(state, factions, 0.31), 'green');
  assert.equal(advanceAiDecisionScheduler(state, factions, 0.31), 'gold');
  assert.equal(state.cursor, 0);
  assert.equal(state, stateIdentity);
});

test('a single AI faction keeps the original 1.2 second cadence', () => {
  const state = { accumulatorSeconds: 0, cursor: 0 };
  assert.equal(advanceAiDecisionScheduler(state, ['solo'], 1.19), null);
  assert.equal(advanceAiDecisionScheduler(state, ['solo'], 0.02), 'solo');
  assert.ok(Math.abs(state.accumulatorSeconds - 0.01) < 1e-9);
});

test('long frame hitches do not release a burst of queued AI decisions', () => {
  const state = { accumulatorSeconds: 0.1, cursor: 0 };
  assert.equal(advanceAiDecisionScheduler(state, ['blue', 'red', 'green', 'gold'], 5), 'blue');
  assert.equal(state.cursor, 1);
  assert.equal(state.accumulatorSeconds, 0.15);
});

test('an empty AI roster clears stale scheduler time and cursor', () => {
  const state = { accumulatorSeconds: 4, cursor: 3 };
  assert.equal(advanceAiDecisionScheduler(state, [], 0.5), null);
  assert.deepEqual(state, { accumulatorSeconds: 0, cursor: 0 });
});

test('invalid roster entries are skipped without changing the valid-faction cadence', () => {
  const factions = ['', 'blue', '', 'red'];
  const state = { accumulatorSeconds: 0, cursor: 0 };

  assert.equal(advanceAiDecisionScheduler(state, factions, 0.59), null);
  assert.equal(advanceAiDecisionScheduler(state, factions, 0.02), 'blue');
  assert.equal(state.cursor, 2);
  assert.equal(advanceAiDecisionScheduler(state, factions, 0.59), 'red');
  assert.equal(state.cursor, 0);
});

test('AI participant roster is rebuilt in place and excludes player or empty IDs', () => {
  const output = ['stale'];
  const identity = output;
  const participants = Object.freeze([
    Object.freeze({ id: 'blue', controller: 'ai' }),
    Object.freeze({ id: 'player', controller: 'player' }),
    Object.freeze({ id: '', controller: 'ai' }),
    Object.freeze({ id: 'gold', controller: 'ai' }),
  ]);

  assert.equal(rebuildAiDecisionRoster(participants, output), identity);
  assert.deepEqual(output, ['blue', 'gold']);
  rebuildAiDecisionRoster([{ id: 'human', controller: 'player' }], output);
  assert.deepEqual(output, []);
  assert.equal(output, identity);
});

test('invalid scheduler state and elapsed time recover deterministically', () => {
  const state = { accumulatorSeconds: Number.NaN, cursor: Number.NaN };
  assert.equal(advanceAiDecisionScheduler(state, ['blue'], Number.POSITIVE_INFINITY), null);
  assert.deepEqual(state, { accumulatorSeconds: 0, cursor: 0 });
  assert.equal(advanceAiDecisionScheduler(state, ['blue'], 1.2), 'blue');
});
