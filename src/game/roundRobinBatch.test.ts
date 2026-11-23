import test from 'node:test';
import assert from 'node:assert/strict';
import { RoundRobinBatch } from './roundRobinBatch';

interface Item {
  id: string;
  value: number;
}

const item = (id: string, value = 0): Item => ({ id, value });

test('round robin batch: respects its hard per-call work budget', () => {
  const queue = new RoundRobinBatch<Item>((entry) => entry.id);
  ['a', 'b', 'c', 'd', 'e'].forEach((id) => queue.add(item(id)));

  const visited: string[] = [];
  assert.equal(queue.process(2, (entry) => visited.push(entry.id)), 2);
  assert.equal(queue.process(2, (entry) => visited.push(entry.id)), 2);
  assert.equal(queue.process(2, (entry) => visited.push(entry.id)), 2);

  assert.deepEqual(visited, ['a', 'b', 'c', 'd', 'e', 'a']);
  assert.equal(queue.size, 5);
});

test('round robin batch: resumes fairly across complete cycles', () => {
  const queue = new RoundRobinBatch<Item>((entry) => entry.id);
  ['a', 'b', 'c'].forEach((id) => queue.add(item(id)));
  const first: string[] = [];
  const second: string[] = [];

  queue.process(2, (entry) => first.push(entry.id));
  queue.process(3, (entry) => second.push(entry.id));

  assert.deepEqual(first, ['a', 'b']);
  assert.deepEqual(second, ['c', 'a', 'b']);
});

test('round robin batch: replacing an existing key does not duplicate membership', () => {
  const queue = new RoundRobinBatch<Item>((entry) => entry.id);
  queue.add(item('a', 1));
  queue.add(item('b', 2));
  queue.add(item('a', 3));

  const visited: Item[] = [];
  queue.process(10, (entry) => visited.push(entry));

  assert.equal(queue.size, 2);
  assert.equal(visited.length, 2);
  assert.equal(visited.find((entry) => entry.id === 'a')?.value, 3);
});

test('round robin batch: swap-removal preserves dense membership and cursor validity', () => {
  const queue = new RoundRobinBatch<Item>((entry) => entry.id);
  ['a', 'b', 'c', 'd'].forEach((id) => queue.add(item(id)));

  const first: string[] = [];
  queue.process(2, (entry) => first.push(entry.id));
  assert.deepEqual(first, ['a', 'b']);

  assert.equal(queue.remove('a'), true);
  assert.equal(queue.remove('missing'), false);
  assert.equal(queue.size, 3);

  const visited: string[] = [];
  queue.process(3, (entry) => visited.push(entry.id));
  assert.deepEqual(new Set(visited), new Set(['b', 'c', 'd']));
  assert.equal(visited.length, 3);
});

test('round robin batch: removes the current and final item safely', () => {
  const queue = new RoundRobinBatch<Item>((entry) => entry.id);
  ['a', 'b', 'c'].forEach((id) => queue.add(item(id)));
  const first: string[] = [];
  queue.process(1, (entry) => first.push(entry.id));
  assert.deepEqual(first, ['a']);

  assert.equal(queue.remove('b'), true);
  assert.equal(queue.remove('c'), true);
  const remaining: string[] = [];
  queue.process(10, (entry) => remaining.push(entry.id));
  assert.deepEqual(remaining, ['a']);
  assert.equal(queue.size, 1);
});

test('round robin batch: ignores invalid budgets and resets after clear', () => {
  const queue = new RoundRobinBatch<Item>((entry) => entry.id);
  queue.add(item('a'));
  assert.equal(queue.process(0, () => assert.fail('zero budget must not visit items')), 0);
  assert.equal(queue.process(Number.NaN, () => assert.fail('NaN budget must not visit items')), 0);
  assert.equal(queue.process(Number.POSITIVE_INFINITY, () => assert.fail('infinite budget must not visit items')), 0);

  queue.clear();
  assert.equal(queue.size, 0);
  queue.add(item('fresh'));
  const visited: string[] = [];
  queue.process(1, (entry) => visited.push(entry.id));
  assert.deepEqual(visited, ['fresh']);
});
