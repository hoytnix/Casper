import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeCascadeFailures } from './cascade-failures.ts';

test('summarizeCascadeFailures joins one line per attempt', () => {
  const summary = summarizeCascadeFailures([
    { model: 'gemini-4-argon', pass: 1, thinking: true, error: new Error('404 NOT_FOUND') },
    { model: 'gemini-4-argon', pass: 1, thinking: false, error: new Error('404 NOT_FOUND') },
  ]);
  assert.equal(
    summary,
    'gemini-4-argon (pass 1, thinking on): 404 NOT_FOUND\ngemini-4-argon (pass 1, thinking off): 404 NOT_FOUND'
  );
});

test('summarizeCascadeFailures dedupes identical lines', () => {
  const summary = summarizeCascadeFailures([
    { model: 'muse-spark-1.3', pass: 1, error: new Error('fetch failed') },
    { model: 'muse-spark-1.3', pass: 1, error: new Error('fetch failed') },
  ]);
  assert.equal(summary, 'muse-spark-1.3 (pass 1): fetch failed');
});

test('summarizeCascadeFailures caps output length', () => {
  const summary = summarizeCascadeFailures(
    [{ model: 'gemini-4-argon', pass: 1, error: new Error('x'.repeat(5000)) }],
    100
  );
  assert.ok(summary.length <= 100);
  assert.ok(summary.startsWith('gemini-4-argon (pass 1): xxx'));
});

test('summarizeCascadeFailures handles empty attempts and non-Error values', () => {
  assert.equal(summarizeCascadeFailures([]), 'No provider attempts were recorded.');
  const summary = summarizeCascadeFailures([
    { model: 'gemini-3.8-flash', pass: 2, error: 'socket timeout' },
    { model: 'gemini-3.5-flash', pass: 2, error: undefined },
  ]);
  assert.equal(
    summary,
    'gemini-3.8-flash (pass 2): socket timeout\ngemini-3.5-flash (pass 2): Unknown error'
  );
});
