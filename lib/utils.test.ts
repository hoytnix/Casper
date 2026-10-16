import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatCostUsd,
  calculateModelCost,
  resolveModelPricing,
  formatCompiledPrompt,
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
