import test from 'node:test';
import assert from 'node:assert/strict';
import { filterFilesByQuery, MAX_VISIBLE_FILES } from './filter-helpers.ts';

const files = [
  { path: 'app/page.tsx', size: 100 },
  { path: 'app/layout.tsx', size: 120 },
  { path: 'lib/utils.ts', size: 80 },
  { path: 'README.md', size: 40 },
];

test('filterFilesByQuery matches case-insensitively on path substring', () => {
  const { visible, total } = filterFilesByQuery(files, 'APP');
  assert.equal(total, 2);
  assert.deepEqual(
    visible.map((f) => f.path),
    ['app/page.tsx', 'app/layout.tsx']
  );
});

test('filterFilesByQuery returns everything (capped) on empty query', () => {
  const { visible, total } = filterFilesByQuery(files, '   ');
  assert.equal(total, 4);
  assert.equal(visible.length, 4);
});

test('filterFilesByQuery caps visible rows but reports the full total', () => {
  const many = Array.from({ length: MAX_VISIBLE_FILES + 50 }, (_, i) => ({
    path: `src/file-${i}.ts`,
    size: i,
  }));
  const { visible, total } = filterFilesByQuery(many, '');
  assert.equal(total, MAX_VISIBLE_FILES + 50);
  assert.equal(visible.length, MAX_VISIBLE_FILES);
  assert.equal(visible[0].path, 'src/file-0.ts');
});

test('filterFilesByQuery respects an explicit limit', () => {
  const { visible, total } = filterFilesByQuery(files, '', 2);
  assert.equal(total, 4);
  assert.equal(visible.length, 2);
});
