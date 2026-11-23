import test from 'node:test';
import assert from 'node:assert/strict';
import { createUnitLodHighDetailSet } from './unitLodSelection';

test('unit LOD selection: combines selected and inspected units', () => {
  const highDetailIds = createUnitLodHighDetailSet(
    ['unit-1', 'unit-2', 'unit-1'],
    'unit-3',
  );

  assert.equal(highDetailIds.size, 3);
  assert.equal(highDetailIds.has('unit-1'), true);
  assert.equal(highDetailIds.has('unit-2'), true);
  assert.equal(highDetailIds.has('unit-3'), true);
});

test('unit LOD selection: returns an empty set when nothing is selected or inspected', () => {
  const highDetailIds = createUnitLodHighDetailSet([], null);

  assert.equal(highDetailIds.size, 0);
  assert.equal(highDetailIds.has('unit-1'), false);
});

test('unit LOD selection: uses exact unit IDs without partial matches', () => {
  const highDetailIds = createUnitLodHighDetailSet(['unit-1'], 'unit-12');

  assert.equal(highDetailIds.has('unit-1'), true);
  assert.equal(highDetailIds.has('unit-12'), true);
  assert.equal(highDetailIds.has('unit-2'), false);
});
