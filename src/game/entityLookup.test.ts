import test from 'node:test';
import assert from 'node:assert/strict';
import { createEntityIdIndex, groupEntitiesByFaction, rebuildEntityIdIndex } from './entityLookup';

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


test('entity faction grouping: preserves entity identity and source order in one stable bucket per faction', () => {
  const firstBlue = { id: 'blue-1', faction: 'blue', hp: 100 };
  const red = { id: 'red-1', faction: 'red', hp: 100 };
  const secondBlue = { id: 'blue-2', faction: 'blue', hp: 0 };
  const groups = groupEntitiesByFaction([firstBlue, red, secondBlue]);

  assert.deepEqual([...groups.keys()], ['blue', 'red']);
  assert.equal(groups.get('blue')?.[0], firstBlue);
  assert.equal(groups.get('blue')?.[1], secondBlue);
  assert.equal(groups.get('red')?.[0], red);
  assert.deepEqual(groups.get('blue')?.map((entity) => entity.id), ['blue-1', 'blue-2']);
});

test('entity faction grouping: handles empty and immutable collections without mutation', () => {
  assert.equal(groupEntitiesByFaction([]).size, 0);
  const entities: readonly { id: string; faction: string }[] = [
    { id: 'one', faction: 'gold' },
    { id: 'two', faction: 'gold' },
  ];
  const grouped = groupEntitiesByFaction(entities);
  assert.deepEqual(grouped.get('gold')?.map((entity) => entity.id), ['one', 'two']);
  assert.deepEqual(entities.map((entity) => entity.id), ['one', 'two']);
});


test('entity index: rebuilds the same map, removes stale IDs and preserves first duplicate', () => {
  const previous = { id: 'old', hp: 1 };
  const first = { id: 'shared', faction: 'blue', hp: 20 };
  const duplicate = { id: 'shared', faction: 'red', hp: 35 };
  const index = createEntityIdIndex([previous]);
  const originalMap = index;

  const rebuilt = rebuildEntityIdIndex(index, [first, duplicate]);

  assert.equal(rebuilt, originalMap);
  assert.equal(index.size, 1);
  assert.equal(index.has('old'), false);
  assert.equal(index.get('shared'), first);
  assert.equal(index.get('missing'), undefined);

  rebuildEntityIdIndex(index, []);
  assert.equal(index.size, 0);
});
