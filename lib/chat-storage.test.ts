import test from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';
import {
  cancelScheduledPersist,
  formatMessagesForSave,
  needsPromptFormatting,
  schedulePersistChatMessages,
} from './chat-storage.ts';
import type { ChatMessage } from '../types/index.ts';

const assistantMsg = (content: string, extra?: Partial<ChatMessage>): ChatMessage => ({
  id: 'asst-1',
  role: 'assistant',
  content,
  timestamp: 1,
  ...extra,
});

test('needsPromptFormatting is false for plain markdown without markers', () => {
  assert.equal(
    needsPromptFormatting('# Title\n\nSome `inline code` and a list:\n- a\n- b\n'),
    false
  );
});

test('needsPromptFormatting is true for delimiters, fences, and trailing backticks', () => {
  assert.equal(needsPromptFormatting('text\n---SUGGESTED_REFACTORS---\n["x"]'), true);
  assert.equal(needsPromptFormatting('````markdown\nhello\n````'), true);
  assert.equal(needsPromptFormatting('hello\n```'), true);
});

test('formatMessagesForSave leaves clean prompts byte-identical (fast path)', () => {
  const content = '# Plan\n\nDo `this` and that.\n';
  const [saved] = formatMessagesForSave([assistantMsg(content)]);
  assert.equal(saved.content, content.trim());
  assert.equal(saved.suggestedRefactors, undefined);
});

test('formatMessagesForSave preserves pre-existing suggested refactors on clean prompts', () => {
  const [saved] = formatMessagesForSave([
    assistantMsg('# Plan\n', { suggestedRefactors: ['refactor x'] }),
  ]);
  assert.equal(saved.content, '# Plan');
  assert.deepEqual(saved.suggestedRefactors, ['refactor x']);
});

test('formatMessagesForSave still strips delimiters and fences (slow path intact)', () => {
  const raw =
    '````markdown\n# Plan\n\nDo it.\n---SUGGESTED_REFACTORS---\n["refactor x", "refactor y"]\n````';
  const [saved] = formatMessagesForSave([assistantMsg(raw)]);
  assert.ok(!saved.content.includes('SUGGESTED_REFACTORS'));
  assert.ok(!saved.content.includes('````'));
  assert.deepEqual(saved.suggestedRefactors, ['refactor x', 'refactor y']);
});

test('schedulePersistChatMessages coalesces rapid saves into one write of the latest', () => {
  mock.timers.enable({ apis: ['setTimeout'], now: 0 });
  try {
    const writes: Array<{ key: string; messages: ChatMessage[] }> = [];
    const first = [assistantMsg('first')];
    const second = [assistantMsg('second')];
    schedulePersistChatMessages('test-key', first, (k, m) => {
      writes.push({ key: k, messages: m });
    });
    schedulePersistChatMessages('test-key', second, (k, m) => {
      writes.push({ key: k, messages: m });
    });
    mock.timers.tick(0);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].key, 'test-key');
    assert.deepEqual(writes[0].messages, second);
  } finally {
    mock.timers.reset();
  }
});

test('cancelScheduledPersist suppresses the pending write', () => {
  mock.timers.enable({ apis: ['setTimeout'], now: 0 });
  try {
    let calls = 0;
    schedulePersistChatMessages('test-key-cancel', [assistantMsg('x')], () => {
      calls += 1;
    });
    cancelScheduledPersist('test-key-cancel');
    mock.timers.tick(1000);
    assert.equal(calls, 0);
  } finally {
    mock.timers.reset();
  }
});
