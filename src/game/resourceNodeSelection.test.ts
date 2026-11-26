import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createResourceNodeCandidateScratch,
  insertResourceNodeCandidate,
} from './resourceNodeSelection';

test('resource node top-K selection retains the best candidates in stable score order', () => {
  const slots = createResourceNodeCandidateScratch<{ id: string }>(4);
  let count = 0;
  const nodes = [
    { id: 'node-e', score: 8 },
    { id: 'node-d', score: 4 },
    { id: 'node-c', score: 4 },
    { id: 'node-b', score: 2 },
    { id: 'node-a', score: 1 },
    { id: 'node-f', score: 10 },
  ];

  for (const node of nodes) {
    count = insertResourceNodeCandidate(slots, count, node, node.score, 0, node.score);
  }

  assert.equal(count, 4);
  assert.deepEqual(
    slots.slice(0, count).map((entry) => entry.node?.id),
    ['node-a', 'node-b', 'node-c', 'node-d'],
  );
});

test('resource node top-K selection reuses fixed record objects across repeated worker queries', () => {
  const slots = createResourceNodeCandidateScratch<{ id: string }>(3);
  const firstRecord = slots[0];
  const secondRecord = slots[1];

  let count = 0;
  count = insertResourceNodeCandidate(slots, count, { id: 'far' }, 10, 0, 10);
  count = insertResourceNodeCandidate(slots, count, { id: 'near' }, 1, 0, 1);
  assert.equal(slots[0], firstRecord);
  assert.equal(slots[1], secondRecord);

  count = 0;
  count = insertResourceNodeCandidate(slots, count, { id: 'middle' }, 5, 0, 5);
  assert.equal(slots[0], firstRecord);
  assert.equal(slots[1], secondRecord);
  assert.equal(slots[0].node?.id, 'middle');
  assert.equal(slots[1].node?.id, 'far', 'stale records outside the active prefix are retained but ignored by the count');
});

test('resource node top-K selection safely ignores invalid coordinates and score inputs', () => {
  const slots = createResourceNodeCandidateScratch<{ id: string }>(2);
  let count = 0;
  count = insertResourceNodeCandidate(slots, count, { id: 'bad-distance' }, Number.NaN, 0, 0);
  count = insertResourceNodeCandidate(slots, count, { id: 'bad-assignment' }, 2, Number.POSITIVE_INFINITY, 2);
  count = insertResourceNodeCandidate(slots, count, { id: 'bad-score' }, 2, 0, Number.NaN);
  assert.equal(count, 0);
});
