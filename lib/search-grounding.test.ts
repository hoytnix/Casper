import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isSearchContextSize,
  normalizeSearchContextSize,
  SEARCH_CONTEXT_SIZES,
} from './search-grounding.ts';

test('normalizeSearchContextSize passes valid sizes through', () => {
  assert.equal(normalizeSearchContextSize('low'), 'low');
  assert.equal(normalizeSearchContextSize('medium'), 'medium');
  assert.equal(normalizeSearchContextSize('high'), 'high');
});

test('normalizeSearchContextSize falls back on invalid input', () => {
  assert.equal(normalizeSearchContextSize(undefined), 'medium');
  assert.equal(normalizeSearchContextSize(null), 'medium');
  assert.equal(normalizeSearchContextSize('ultra'), 'medium');
  assert.equal(normalizeSearchContextSize('HIGH'), 'medium');
  assert.equal(normalizeSearchContextSize('ultra', 'low'), 'low');
});

test('isSearchContextSize guards the union', () => {
  assert.ok(isSearchContextSize('high'));
  assert.ok(!isSearchContextSize('highest'));
  assert.ok(!isSearchContextSize(undefined));
  assert.deepEqual([...SEARCH_CONTEXT_SIZES], ['low', 'medium', 'high']);
});
