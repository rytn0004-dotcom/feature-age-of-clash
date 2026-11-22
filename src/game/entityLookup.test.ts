import test from 'node:test';
import assert from 'node:assert/strict';
import { createEntityIdIndex } from './entityLookup';

test('entity index: resolves IDs to the original entity objects', () => {
  const first = { id: 'unit-1', hp: 20 };
  const second = { id: 'unit-2', hp: 35 };
  const entities = [first, second];

  const index = createEntityIdIndex(entities);

  assert.equal(index.size, 2);
  assert.equal(index.get('unit-1'), first);
  assert.equal(index.get('unit-2'), second);
  assert.equal(index.get('missing'), undefined);
  assert.equal(entities.length, 2);
});

test('entity index: preserves first-match behavior for duplicate IDs', () => {
  const first = { id: 'same-id', faction: 'blue' };
  const duplicate = { id: 'same-id', faction: 'red' };

  const index = createEntityIdIndex([first, duplicate]);

  assert.equal(index.size, 1);
  assert.equal(index.get('same-id'), first);
});

test('entity index: safely handles empty and immutable inputs', () => {
  const empty = createEntityIdIndex([]);
  const source: readonly { id: string }[] = [{ id: 'one' }, { id: 'two' }];
  const index = createEntityIdIndex(source);

  assert.equal(empty.size, 0);
  assert.deepEqual([...index.keys()], ['one', 'two']);
  assert.deepEqual(source.map((entity) => entity.id), ['one', 'two']);
});
