import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateTokenCostSummary, filterTokenRecords } from './finance-calculations.ts';
import type { TokenCostRecord } from '../types/index.ts';

const testRecords: TokenCostRecord[] = [
  { id: '1', repoName: 'facebook/react', modelName: 'gemini-4-argon', inputTokens: 45000, outputTokens: 8000, totalCostUsd: 0.2450, date: '2026-05-01', notes: 'Initial prompt compile' },
  { id: '2', repoName: 'vercel/next.js', modelName: 'gemini-2.5-pro', inputTokens: 120000, outputTokens: 15000, totalCostUsd: 0.9750, date: '2026-05-02', notes: 'Deep agentic exploration' },
  { id: '3', repoName: 'tailwindlabs/tailwindcss', modelName: 'gemini-3.8-flash', inputTokens: 20000, outputTokens: 4000, totalCostUsd: 0.0480, date: '2026-05-03', notes: 'Quick styling prompt' },
  { id: '4', repoName: 'facebook/react', modelName: 'gemini-3.8-flash', inputTokens: 25000, outputTokens: 5000, totalCostUsd: 0.0600, date: '2026-05-03', notes: 'Component refactor' },
];

test('calculateTokenCostSummary aggregates token costs and usage correctly', () => {
  const summary = calculateTokenCostSummary(testRecords);

  assert.equal(summary.totalSpentUsd, 1.328);
  assert.equal(summary.totalInputTokens, 210000);
  assert.equal(summary.totalOutputTokens, 32000);
  assert.equal(summary.totalRuns, 4);
  assert.equal(summary.byModel['gemini-4-argon'].cost, 0.245);
  assert.equal(summary.byModel['gemini-2.5-pro'].cost, 0.975);
  assert.equal(summary.historicalTrend.length, 3);
  assert.equal(summary.historicalTrend[0].date, '2026-05-01');
  assert.equal(summary.historicalTrend[2].costUsd, 0.108);
});

test('calculateTokenCostSummary handles empty records', () => {
  const summary = calculateTokenCostSummary([]);
  assert.equal(summary.totalSpentUsd, 0);
  assert.equal(summary.totalInputTokens, 0);
  assert.equal(summary.totalOutputTokens, 0);
  assert.equal(summary.totalRuns, 0);
  assert.deepEqual(summary.byModel, {});
  assert.deepEqual(summary.historicalTrend, []);
});

test('filterTokenRecords filters by modelName and search query', () => {
  const flashRecords = filterTokenRecords(testRecords, { modelName: 'gemini-3.8-flash' });
  assert.equal(flashRecords.length, 2);

  const queryResult = filterTokenRecords(testRecords, { query: 'next.js' });
  assert.equal(queryResult.length, 1);
  assert.equal(queryResult[0].repoName, 'vercel/next.js');

  const modelQuery = filterTokenRecords(testRecords, { query: 'argon' });
  assert.equal(modelQuery.length, 1);
  assert.equal(modelQuery[0].modelName, 'gemini-4-argon');
});
