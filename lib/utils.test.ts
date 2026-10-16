import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatCostUsd,
  calculateModelCost,
  resolveModelPricing,
  formatCompiledPrompt,
  extractSuggestedRefactors,
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

