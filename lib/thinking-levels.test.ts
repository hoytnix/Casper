import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGeminiThinkingConfig,
  buildMuseThinkingPayload,
  isMuseOnlyThinkingLevel,
  normalizeThinkingLevel,
  normalizeThinkingSummaries,
  resolveGeminiThinkingLevel,
} from './thinking-levels.ts';

test('normalizeThinkingLevel accepts the Muse-only xhigh and max tiers', () => {
  assert.equal(normalizeThinkingLevel('xhigh'), 'xhigh');
  assert.equal(normalizeThinkingLevel('max'), 'max');
  assert.equal(normalizeThinkingLevel('MAX'), 'max');
  assert.equal(normalizeThinkingLevel('  xhigh  '), 'xhigh');
});

test('normalizeThinkingLevel keeps standard tiers and falls back on invalid input', () => {
  assert.equal(normalizeThinkingLevel('low'), 'low');
  assert.equal(normalizeThinkingLevel('medium'), 'medium');
  assert.equal(normalizeThinkingLevel('high'), 'high');
  assert.equal(normalizeThinkingLevel('ultra'), 'high');
  assert.equal(normalizeThinkingLevel(undefined), 'high');
  assert.equal(normalizeThinkingLevel(42), 'high');
});

test('resolveGeminiThinkingLevel maps Muse-only tiers down to high', () => {
  assert.equal(resolveGeminiThinkingLevel('xhigh'), 'high');
  assert.equal(resolveGeminiThinkingLevel('max'), 'high');
  assert.equal(resolveGeminiThinkingLevel('low'), 'low');
  assert.equal(resolveGeminiThinkingLevel('medium'), 'medium');
  assert.equal(resolveGeminiThinkingLevel('high'), 'high');
});

test('isMuseOnlyThinkingLevel flags only xhigh and max', () => {
  assert.equal(isMuseOnlyThinkingLevel('xhigh'), true);
  assert.equal(isMuseOnlyThinkingLevel('max'), true);
  assert.equal(isMuseOnlyThinkingLevel('high'), false);
  assert.equal(isMuseOnlyThinkingLevel('low'), false);
});

test('buildMuseThinkingPayload forwards the full level; Gemini payload maps it', () => {
  const muse = buildMuseThinkingPayload('max', 'auto');
  assert.equal(muse.reasoning_effort, 'max');
  assert.equal(muse.thinkingConfig.thinkingLevel, 'max');
  assert.equal(muse.thinkingConfig.thinkingSummaries, 'auto');

  const gemini = buildGeminiThinkingConfig('max', 'enabled');
  assert.equal(gemini.thinkingLevel, 'high');
  assert.equal(gemini.thinkingSummaries, 'enabled');
});

test('normalizeThinkingSummaries accepts auto/enabled/disabled with auto fallback', () => {
  assert.equal(normalizeThinkingSummaries('enabled'), 'enabled');
  assert.equal(normalizeThinkingSummaries('disabled'), 'disabled');
  assert.equal(normalizeThinkingSummaries('verbose'), 'auto');
  assert.equal(normalizeThinkingSummaries(undefined), 'auto');
});
