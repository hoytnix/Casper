import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeConversationHistory,
  toGenAiHistory,
  toMuseMessages,
} from './chat-history.ts';

test('maps user and assistant roles to Gemini history parts', () => {
  const history = normalizeConversationHistory([
    { role: 'user', content: 'Add auth' },
    { role: 'assistant', content: 'Here is the plan' },
  ]);
  assert.deepEqual(history, [
    { role: 'user', content: 'Add auth' },
    { role: 'assistant', content: 'Here is the plan' },
  ]);
  assert.deepEqual(toGenAiHistory(history), [
    { role: 'user', parts: [{ text: 'Add auth' }] },
    { role: 'model', parts: [{ text: 'Here is the plan' }] },
  ]);
});

test('drops empty, blank, and unknown-role turns', () => {
  const history = normalizeConversationHistory([
    { role: 'user', content: '  ' },
    { role: 'system', content: 'ignored' },
    { role: 'assistant', content: '' },
    { role: 'user', content: 'Real question' },
  ]);
  assert.deepEqual(history, [{ role: 'user', content: 'Real question' }]);
});

test('drops leading assistant turns so history starts with user', () => {
  const history = normalizeConversationHistory([
    { role: 'assistant', content: 'Stale orphan' },
    { role: 'user', content: 'First real turn' },
    { role: 'assistant', content: 'Answer' },
  ]);
  assert.deepEqual(history, [
    { role: 'user', content: 'First real turn' },
    { role: 'assistant', content: 'Answer' },
  ]);
});

test('merges consecutive same-role turns', () => {
  const history = normalizeConversationHistory([
    { role: 'user', content: 'Part one' },
    { role: 'user', content: 'Part two' },
    { role: 'assistant', content: 'Answer' },
  ]);
  assert.deepEqual(history, [
    { role: 'user', content: 'Part one\n\nPart two' },
    { role: 'assistant', content: 'Answer' },
  ]);
});

test('keeps only the most recent turns and caps characters', () => {
  const turns = Array.from({ length: 12 }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: `turn-${i}`,
  }));
  const history = normalizeConversationHistory(turns, { maxTurns: 4 });
  assert.equal(history.length, 4);
  assert.equal(history[3].content, 'turn-11');

  const long = normalizeConversationHistory(
    [{ role: 'user', content: 'x'.repeat(9000) }],
    { maxCharsPerTurn: 100, maxTotalChars: 10000 }
  );
  assert.equal(long[0].content.length, 100);

  const total = normalizeConversationHistory(
    [
      { role: 'user', content: 'a'.repeat(60) },
      { role: 'assistant', content: 'b'.repeat(60) },
    ],
    { maxTotalChars: 100 }
  );
  const totalChars = total.reduce((acc, t) => acc + t.content.length, 0);
  assert.ok(totalChars <= 100);
  // Newest turn survives total-budget trimming.
  assert.ok(total[total.length - 1].content.includes('b'));
});

test('non-array and malformed input yields empty history, never throws', () => {
  assert.deepEqual(normalizeConversationHistory(undefined as any), []);
  assert.deepEqual(normalizeConversationHistory(null as any), []);
  assert.deepEqual(normalizeConversationHistory('nope' as any), []);
  assert.deepEqual(
    normalizeConversationHistory([{ role: 'user' }, { content: 'x' }, null] as any),
    []
  );
});

test('Muse mapping preserves user and assistant roles', () => {
  const msgs = toMuseMessages([
    { role: 'user', content: 'Q' },
    { role: 'assistant', content: 'A' },
  ]);
  assert.deepEqual(msgs, [
    { role: 'user', content: 'Q' },
    { role: 'assistant', content: 'A' },
  ]);
});
