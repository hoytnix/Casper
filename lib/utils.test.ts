import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatCostUsd,
  calculateModelCost,
  resolveModelPricing,
  formatCompiledPrompt,
  extractGeminiCachedTokens,
  extractSuggestedRefactors,
  isDuplicateDelta,
  dedupeConsecutiveAssistantMessages,
  replaceAssistantContent,
} from './utils.ts';

test('resolveModelPricing correctly identifies Gemini 4 Argon', () => {
  const pricing = resolveModelPricing('gemini-4-argon');
  assert.equal(pricing.name, 'Gemini 4 Argon');
  assert.ok(pricing.inputCostPerMillion >= 2);
  assert.ok(pricing.outputCostPerMillion >= 10);
});

test('calculateModelCost calculates exact fractional token costs', () => {
  const cost = calculateModelCost('gemini-4-argon', 10000, 2000);
  assert.equal(cost.inputTokens, 10000);
  assert.equal(cost.outputTokens, 2000);
  assert.equal(cost.inputCostUsd, 0.02);
  assert.equal(cost.outputCostUsd, 0.02);
  assert.equal(cost.totalCostUsd, 0.04);
  assert.equal(cost.modelName, 'Gemini 4 Argon');
});

test('resolveModelPricing correctly identifies Muse Spark tiers', () => {
  const contributor = resolveModelPricing('muse-spark-1.3-contributor');
  assert.equal(contributor.name, 'Muse Spark 1.3 Contributor');
  assert.equal(contributor.inputCostPerMillion, 0.10);
  assert.equal(contributor.outputCostPerMillion, 0.20);

  const standard = resolveModelPricing('muse-spark-1.3');
  assert.equal(standard.name, 'Muse Spark 1.3');
  assert.equal(standard.inputCostPerMillion, 1.25);
  assert.equal(standard.outputCostPerMillion, 4.25);

  // Tag casing, display-name spacing, and bare muse- prefixes resolve identically
  assert.equal(resolveModelPricing('MUSE-SPARK-1.3').name, 'Muse Spark 1.3');
  assert.equal(resolveModelPricing('Muse Spark 1.3 Contributor').name, 'Muse Spark 1.3 Contributor');
  assert.equal(resolveModelPricing('muse-spark-1.3-contributor').name, 'Muse Spark 1.3 Contributor');
});

test('calculateModelCost computes exact Muse Spark costs at whole-million tokens', () => {
  const cost = calculateModelCost('muse-spark-1.3', 1000000, 1000000);
  assert.equal(cost.inputTokens, 1000000);
  assert.equal(cost.outputTokens, 1000000);
  assert.equal(cost.inputCostUsd, 1.25);
  assert.equal(cost.outputCostUsd, 4.25);
  assert.equal(cost.modelName, 'Muse Spark 1.3');
  assert.ok(Math.abs(cost.totalCostUsd - 5.5) < 1e-9);
});

test('calculateModelCost computes exact Muse contributor costs at half-million tokens', () => {
  const cost = calculateModelCost('muse-spark-1.3-contributor', 500000, 500000);
  assert.equal(cost.inputTokens, 500000);
  assert.equal(cost.outputTokens, 500000);
  assert.equal(cost.inputCostUsd, 0.05);
  assert.equal(cost.outputCostUsd, 0.1);
  assert.equal(cost.modelName, 'Muse Spark 1.3 Contributor');
  assert.ok(Math.abs(cost.totalCostUsd - 0.15) < 1e-9);
});

test('formatCostUsd handles sub-cent precision and zero cleanly', () => {
  assert.equal(formatCostUsd(0), '$0.0000 USD');
  assert.equal(formatCostUsd(0.04), '$0.0400 USD');
  assert.ok(formatCostUsd(0.00005).includes('USD'));
});

test('formatCompiledPrompt encapsulates markdown prompt cleanly', () => {
  const result = formatCompiledPrompt('Test repo instructions');
  assert.ok(result.includes('Test repo instructions'));
});

test('extractSuggestedRefactors splices out plaintext SUGGESTED_REFACTORS delimiter and parses items', () => {
  const rawOutput = `## Step-by-Step Execution
1. Update @[/components/Sidebar.tsx]
2. Verify build

---SUGGESTED_REFACTORS--- [ "Extract folder creation path normalization into a dedicated helper module.", "Add a confirmation badge in @[/src/components/sidebar/NewNoteModal.tsx].", "Implement automated unit tests for @[/src/lib/markdown/frontmatter.ts].", "Refactor @[/src/components/editor/components/NotePropertiesCard.tsx] custom property inputs." ]`;

  const { cleanPrompt, refactors } = extractSuggestedRefactors(rawOutput);

  assert.ok(!cleanPrompt.includes('---SUGGESTED_REFACTORS---'));
  assert.ok(!cleanPrompt.includes('Extract folder creation'));
  assert.ok(cleanPrompt.includes('## Step-by-Step Execution'));
  assert.ok(cleanPrompt.includes('@[/components/Sidebar.tsx]'));

  assert.equal(refactors.length, 4);
  assert.equal(refactors[0], 'Extract folder creation path normalization into a dedicated helper module.');
  assert.equal(refactors[3], 'Refactor @[/src/components/editor/components/NotePropertiesCard.tsx] custom property inputs.');
});

test('formatCompiledPrompt removes plaintext SUGGESTED_REFACTORS completely', () => {
  const rawWithDelim = `## Architectural Context
Some text here.

---SUGGESTED_REFACTORS---
[
  "Refactor 1",
  "Refactor 2"
]`;

  const formatted = formatCompiledPrompt(rawWithDelim);
  assert.ok(!formatted.includes('---SUGGESTED_REFACTORS---'));
  assert.ok(!formatted.includes('Refactor 1'));
  assert.ok(formatted.includes('## Architectural Context'));
});

test('extractSuggestedRefactors handles in-flight streaming partial delimiters without leaking', () => {
  const inFlightText = `## Step 1\nDo something\n\n---SUGGESTED_RE`;
  const { cleanPrompt, refactors } = extractSuggestedRefactors(inFlightText);
  assert.equal(cleanPrompt, `## Step 1\nDo something`);
  assert.equal(refactors.length, 0);
});

test('pricing tiers expose cached input rates at 10% of standard', () => {
  assert.equal(resolveModelPricing('muse-spark-1.3-contributor').cachedInputCostPerMillion, 0.01);
  assert.equal(resolveModelPricing('muse-spark-1.3').cachedInputCostPerMillion, 0.125);
  assert.equal(resolveModelPricing('gemini-3.5-flash-lite').cachedInputCostPerMillion, 0.03);
});

test('calculateModelCost defaults to zero cached tokens (legacy behavior preserved)', () => {
  const cost = calculateModelCost('muse-spark-1.3', 1000000, 1000000);
  assert.equal(cost.cachedInputTokens, 0);
  assert.equal(cost.cachedInputCostUsd, 0);
  assert.ok(Math.abs(cost.totalCostUsd - 5.5) < 1e-9);
});

test('calculateModelCost discounts cached input tokens at the cached rate', () => {
  // 1M contributor input, 400k cached: 600k * $0.10 + 400k * $0.01 = $0.064 input
  const cost = calculateModelCost('muse-spark-1.3-contributor', 1000000, 1000000, 400000);
  assert.equal(cost.cachedInputTokens, 400000);
  assert.ok(Math.abs(cost.cachedInputCostUsd - 0.004) < 1e-9);
  assert.ok(Math.abs(cost.inputCostUsd - 0.064) < 1e-9);
  assert.ok(Math.abs(cost.totalCostUsd - 0.264) < 1e-9);
});

test('calculateModelCost clamps cached tokens to [0, inputTokens]', () => {
  const over = calculateModelCost('gemini-3.5-flash', 1000000, 0, 1500000);
  assert.equal(over.cachedInputTokens, 1000000);
  assert.ok(Math.abs(over.inputCostUsd - 0.15) < 1e-9);

  const negative = calculateModelCost('gemini-3.5-flash', 1000000, 0, -500);
  assert.equal(negative.cachedInputTokens, 0);
  assert.ok(Math.abs(negative.inputCostUsd - 1.5) < 1e-9);
});


test('extractGeminiCachedTokens reads usageMetadata cache reads', () => {
  assert.equal(
    extractGeminiCachedTokens({ usageMetadata: { promptTokenCount: 1000, cachedContentTokenCount: 320 } }),
    320
  );
  assert.equal(extractGeminiCachedTokens({ candidates: [] }), 0);
  assert.equal(extractGeminiCachedTokens({ usageMetadata: {} }), 0);
  assert.equal(extractGeminiCachedTokens(null), 0);
  assert.equal(extractGeminiCachedTokens({ usageMetadata: { cachedContentTokenCount: -5 } }), 0);
});

test('calculateModelCost fourth arg prices measured cache reads at the cached rate', () => {
  const cost = calculateModelCost('gemini-3.8-flash', 10000, 0, 4000);
  assert.equal(cost.cachedInputTokens, 4000);
  // 6000 fresh @ $0.75/M + 4000 cached @ $0.075/M.
  assert.ok(Math.abs(cost.inputCostUsd - (6000 / 1_000_000 * 0.75 + 4000 / 1_000_000 * 0.075)) < 1e-9);
});

test('isDuplicateDelta swallows empties and resends, passes fresh text', () => {
  assert.equal(isDuplicateDelta('hello', ''), true);
  assert.equal(isDuplicateDelta('', 'hello'), false);
  assert.equal(isDuplicateDelta('hello world', 'world'), true);
  assert.equal(isDuplicateDelta('abc', 'abc'), true);
  assert.equal(isDuplicateDelta('hello', 'world'), false);
  assert.equal(isDuplicateDelta('ab', 'abc'), false);
});

test('dedupeConsecutiveAssistantMessages drops fast identical assistant repeats', () => {
  const base = { role: 'assistant', content: 'same prompt', timestamp: 1000 } as const;
  const msgs = [
    { id: 'u1', role: 'user', content: 'go', timestamp: 900 },
    { id: 'a1', ...base },
    { id: 'a2', ...base, timestamp: 3000 },
    { id: 'a3', ...base, content: 'different', timestamp: 3200 },
    { id: 'a4', ...base, content: 'different', timestamp: 40000 },
  ] as any;
  const out = dedupeConsecutiveAssistantMessages(msgs);
  assert.deepEqual(out.map((m: any) => m.id), ['u1', 'a1', 'a3', 'a4']);
});

test('replaceAssistantContent swaps one message by id without touching others', () => {
  const msgs = [
    { id: 'a', role: 'assistant', content: 'old', timestamp: 1 },
    { id: 'b', role: 'user', content: 'keep', timestamp: 2 },
  ] as any;
  const out = replaceAssistantContent(msgs, 'a', 'new');
  assert.equal(out[0].content, 'new');
  assert.equal(out[1].content, 'keep');
  assert.equal(msgs[0].content, 'old');
});
