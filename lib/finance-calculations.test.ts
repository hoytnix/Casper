import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSpendingSummary, filterTransactions } from './finance-calculations.ts';
import type { Transaction } from '../types/index.ts';

const testTransactions: Transaction[] = [
  { id: '1', title: 'AWS Cloud', amount: 150.50, category: 'Infrastructure', type: 'expense', date: '2026-05-01' },
  { id: '2', title: 'Client Retainer', amount: 3500.00, category: 'Revenue', type: 'income', date: '2026-05-02' },
  { id: '3', title: 'GitHub Enterprise', amount: 42.00, category: 'Software', type: 'expense', date: '2026-05-03' },
  { id: '4', title: 'Figma Subscription', amount: 45.00, category: 'Software', type: 'expense', date: '2026-05-03' },
];

test('calculateSpendingSummary aggregates totals correctly', () => {
  const summary = calculateSpendingSummary(testTransactions);

  assert.equal(summary.totalSpent, 237.5);
  assert.equal(summary.totalIncome, 3500);
  assert.equal(summary.netBalance, 3262.5);
  assert.equal(summary.byCategory['Infrastructure'], 150.5);
  assert.equal(summary.byCategory['Software'], 87);
  assert.equal(summary.historicalTrend.length, 3);
  assert.equal(summary.historicalTrend[0].date, '2026-05-01');
  assert.equal(summary.historicalTrend[0].expenseAmount, 150.5);
});

test('calculateSpendingSummary handles empty transactions', () => {
  const summary = calculateSpendingSummary([]);
  assert.equal(summary.totalSpent, 0);
  assert.equal(summary.totalIncome, 0);
  assert.equal(summary.netBalance, 0);
  assert.deepEqual(summary.byCategory, {});
  assert.deepEqual(summary.historicalTrend, []);
});

test('filterTransactions filters by type and search query', () => {
  const expenses = filterTransactions(testTransactions, { type: 'expense' });
  assert.equal(expenses.length, 3);

  const queryResult = filterTransactions(testTransactions, { query: 'figma' });
  assert.equal(queryResult.length, 1);
  assert.equal(queryResult[0].title, 'Figma Subscription');

  const categoryResult = filterTransactions(testTransactions, { category: 'Infrastructure' });
  assert.equal(categoryResult.length, 1);
  assert.equal(categoryResult[0].id, '1');
});
