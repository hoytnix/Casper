import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFileDelta, canApplyDelta } from './delta-sync.ts';
import type { DeltaSourceFile } from './delta-sync.ts';

test('applyFileDelta correctly updates modified files', () => {
  const initialFiles: DeltaSourceFile[] = [
    { path: 'src/index.ts', content: 'console.log("v1");', size: 18 },
    { path: 'src/utils.ts', content: 'export const x = 1;', size: 19 },
    { path: 'README.md', content: '# Docs', size: 6 },
  ];

  const modifiedFiles = [
    { path: 'src/index.ts', status: 'modified' },
  ];

  const freshFiles: DeltaSourceFile[] = [
    { path: 'src/index.ts', content: 'console.log("v2");', size: 18 },
  ];

  const result = applyFileDelta(initialFiles, modifiedFiles, freshFiles);

  assert.equal(result.length, 3);
  const updatedIndex = result.find((f) => f.path === 'src/index.ts');
  assert.equal(updatedIndex?.content, 'console.log("v2");');
  const utils = result.find((f) => f.path === 'src/utils.ts');
  assert.equal(utils?.content, 'export const x = 1;');
});

test('applyFileDelta removes deleted files and appends new files', () => {
  const initialFiles: DeltaSourceFile[] = [
    { path: 'src/index.ts', content: 'hello', size: 5 },
    { path: 'src/old.ts', content: 'deprecated', size: 10 },
  ];

  const delta = [
    { path: 'src/old.ts', status: 'removed' },
    { path: 'src/new.ts', status: 'added' },
  ];

  const freshFiles: DeltaSourceFile[] = [
    { path: 'src/new.ts', content: 'brand new feature', size: 17 },
  ];

  const result = applyFileDelta(initialFiles, delta, freshFiles);

  assert.equal(result.length, 2);
  assert.ok(!result.some((f) => f.path === 'src/old.ts'));
  assert.ok(result.some((f) => f.path === 'src/new.ts'));
  const newFile = result.find((f) => f.path === 'src/new.ts');
  assert.equal(newFile?.content, 'brand new feature');
});

test('applyFileDelta returns original set when delta is empty', () => {
  const initialFiles: DeltaSourceFile[] = [
    { path: 'src/main.ts', content: 'main', size: 4 },
  ];

  const result = applyFileDelta(initialFiles, [], []);
  assert.equal(result.length, 1);
  assert.equal(result[0].path, 'src/main.ts');
});

test('canApplyDelta accurately gates fast-forward deltas', () => {
  assert.equal(canApplyDelta({ isFastForward: true, modifiedFiles: [] }), true);
  assert.equal(canApplyDelta({ isFastForward: false, modifiedFiles: [{ path: 'a.ts', status: 'modified' }] }), false);
});
