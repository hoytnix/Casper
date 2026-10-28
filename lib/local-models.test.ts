import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_LOCAL_CONTEXT_TOKENS,
  LOCAL_ENGINE_VALUES,
  LOCAL_MODELS,
  assertAllowedQuantization,
  getFittingModelsUnder2GB,
  getLocalModelSpec,
  isKnownRouterEngine,
  isLocalGenerationEngine,
  isTinyFilter,
  requiresGatingNotice,
  validateLocalContextTokens,
} from './local-models.ts';
import { normalizeStoredSettings } from './settings-store.ts';

test('registry holds all 10 engine values exactly once', () => {
  assert.equal(LOCAL_MODELS.length, 10);
  assert.equal(new Set(LOCAL_MODELS.map((m) => m.id)).size, 10);
  for (const id of LOCAL_ENGINE_VALUES) {
    assert.ok(getLocalModelSpec(id), `missing spec for ${id}`);
  }
});

test('every spec is int4 and carries the short-context note', () => {
  for (const spec of LOCAL_MODELS) {
    assert.equal(spec.quantizationLabel, 'int4');
    assert.match(spec.ramNote, /1536/);
  }
});

test('new MLC IDs use only q4f16_1, never q8/fp16/q4f32', () => {
  for (const spec of LOCAL_MODELS) {
    if (spec.mlcModelId) {
      assert.match(spec.mlcModelId, /q4f16_1-MLC$/);
    }
  }
  assert.throws(() => assertAllowedQuantization('q8', 'probe'));
  assert.throws(() => assertAllowedQuantization('fp16', 'probe'));
  assert.throws(() => assertAllowedQuantization('q4f32', 'probe'));
  assert.doesNotThrow(() => assertAllowedQuantization('int4', 'probe'));
});

test('blocked Gemma card never fits and requires gating notice', () => {
  const gemma = getLocalModelSpec('gemma-3-270m-int4');
  assert.equal(gemma?.fitBadge, 'BLOCKED');
  assert.equal(gemma?.verified, false);
  assert.equal(requiresGatingNotice('gemma-3-270m-int4'), true);
  assert.equal(isTinyFilter('gemma-3-270m-int4'), false);
  assert.ok(!getFittingModelsUnder2GB().some((m) => m.id === 'gemma-3-270m-int4'));
});

test('tiny filters and generation-engine classification', () => {
  assert.equal(isTinyFilter('smollm2-360m-int4'), true);
  assert.equal(isTinyFilter('qwen3-0.6b-int4'), false);
  assert.equal(isLocalGenerationEngine('qwen3-0.6b-int4'), true);
  assert.equal(isLocalGenerationEngine('arctic-embed-xs-only'), false);
  assert.equal(isLocalGenerationEngine('gemini-nano-only'), false);
  assert.equal(isLocalGenerationEngine('auto'), false);
  assert.equal(isKnownRouterEngine('smollm2-1.7b-int4'), true);
  assert.equal(isKnownRouterEngine('qwen-3b'), false);
});

test('context tokens clamp to 1024-2048, default 1536', () => {
  assert.equal(validateLocalContextTokens(undefined), 1536);
  assert.equal(validateLocalContextTokens(1536), 1536);
  assert.equal(validateLocalContextTokens(500), 1024);
  assert.equal(validateLocalContextTokens(8192), 2048);
  assert.equal(validateLocalContextTokens('nope'), 1536);
  assert.equal(DEFAULT_LOCAL_CONTEXT_TOKENS, 1536);
});

test('normalizeStoredSettings allowlists engines, backfills judge + tokens', () => {
  const normalized = normalizeStoredSettings({ routerEngine: 'qwen-3b', localContextTokens: 99 });
  assert.equal(normalized.routerEngine, 'auto');
  assert.equal(normalized.localContextTokens, 1024);
  assert.equal(normalized.selectedLocalModelId, 'qwen3-0.6b-int4');
  const explicit = normalizeStoredSettings({
    routerEngine: 'llama-3.2-1b-int4',
    selectedLocalModelId: 'llama-3.2-1b-int4',
    localContextTokens: 2048,
  });
  assert.equal(explicit.routerEngine, 'llama-3.2-1b-int4');
  assert.equal(explicit.selectedLocalModelId, 'llama-3.2-1b-int4');
  assert.equal(explicit.localContextTokens, 2048);
});
