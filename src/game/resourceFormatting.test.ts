import test from 'node:test';
import assert from 'node:assert/strict';
import { formatCompactResourceCount, formatResourceCount } from './resourceFormatting';

test('formats exact resource counts with locale grouping', () => {
  assert.equal(formatResourceCount(0), '0');
  assert.equal(formatResourceCount(1234), '1,234');
  assert.equal(formatResourceCount(1234567), '1,234,567');
});

test('keeps small resource counts exact in compact HUD cells', () => {
  assert.equal(formatCompactResourceCount(9999), '9,999');
  assert.equal(formatCompactResourceCount(10000), '1萬');
});

test('compacts large resource counts without rounding above the stock', () => {
  assert.equal(formatCompactResourceCount(12345), '1.2萬');
  assert.equal(formatCompactResourceCount(99999), '9.9萬');
  assert.equal(formatCompactResourceCount(999999), '99.9萬');
  assert.equal(formatCompactResourceCount(100000000), '1億');
  assert.equal(formatCompactResourceCount(999999999), '9.9億');
});

test('normalizes invalid and negative resource counts safely', () => {
  for (const value of [-10, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assert.equal(formatResourceCount(value), '0');
    assert.equal(formatCompactResourceCount(value), '0');
  }
});
