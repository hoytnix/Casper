import type { TokenCostRecord, TokenCostSummary } from '../types/index.ts';

/**
 * Computes token cost metrics and historical trends from an array of token cost records.
 */
export function calculateTokenCostSummary(records: TokenCostRecord[]): TokenCostSummary {
  let totalSpentUsd = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCachedInputTokens = 0;
  let totalCachedCostUsd = 0;
  const byModel: Record<string, { cost: number; inputTokens: number; outputTokens: number; cachedInputTokens: number; cachedInputCostUsd: number; runs: number }> = {};
  const dailyMap: Record<string, { costUsd: number; inputTokens: number; outputTokens: number; cachedInputTokens: number; runs: number }> = {};

  for (const r of records) {
    const cost = typeof r.totalCostUsd === 'number' && !isNaN(r.totalCostUsd) ? Math.max(0, r.totalCostUsd) : (typeof r.amount === 'number' ? r.amount : 0);
    const input = typeof r.inputTokens === 'number' && !isNaN(r.inputTokens) ? Math.max(0, r.inputTokens) : 0;
    const output = typeof r.outputTokens === 'number' && !isNaN(r.outputTokens) ? Math.max(0, r.outputTokens) : 0;
    const cached = typeof r.cachedInputTokens === 'number' && !isNaN(r.cachedInputTokens) ? Math.max(0, Math.min(input, r.cachedInputTokens)) : 0;
    const cachedCost = typeof r.cachedInputCostUsd === 'number' && !isNaN(r.cachedInputCostUsd) ? Math.max(0, r.cachedInputCostUsd) : 0;
    const dateKey = r.date || new Date().toISOString().split('T')[0];
    const model = r.modelName || 'gemini-2.5-pro';

    totalSpentUsd += cost;
    totalInputTokens += input;
    totalOutputTokens += output;
    totalCachedInputTokens += cached;
    totalCachedCostUsd += cachedCost;

    if (!byModel[model]) {
      byModel[model] = { cost: 0, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, cachedInputCostUsd: 0, runs: 0 };
    }
    byModel[model].cost += cost;
    byModel[model].inputTokens += input;
    byModel[model].outputTokens += output;
    byModel[model].cachedInputTokens += cached;
    byModel[model].cachedInputCostUsd += cachedCost;
    byModel[model].runs += 1;

    if (!dailyMap[dateKey]) {
      dailyMap[dateKey] = { costUsd: 0, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, runs: 0 };
    }
    dailyMap[dateKey].costUsd += cost;
    dailyMap[dateKey].inputTokens += input;
    dailyMap[dateKey].outputTokens += output;
    dailyMap[dateKey].cachedInputTokens += cached;
    dailyMap[dateKey].runs += 1;
  }

  const sortedDates = Object.keys(dailyMap).sort((a, b) => a.localeCompare(b));
  const historicalTrend = sortedDates.map((date) => ({
    date,
    costUsd: Math.round(dailyMap[date].costUsd * 10000) / 10000,
    inputTokens: dailyMap[date].inputTokens,
    outputTokens: dailyMap[date].outputTokens,
    cachedInputTokens: dailyMap[date].cachedInputTokens,
    runs: dailyMap[date].runs,
    amount: dailyMap[date].costUsd,
    expenseAmount: dailyMap[date].costUsd,
    incomeAmount: 0,
  }));

  const totalSpent = Math.round(totalSpentUsd * 100) / 100;
  const totalIncome = 0;
  const netBalance = -totalSpent;
  const byCategory: Record<string, number> = {};
  for (const [model, data] of Object.entries(byModel)) {
    byCategory[model] = Math.round(data.cost * 100) / 100;
  }

  return {
    totalSpentUsd: Math.round(totalSpentUsd * 10000) / 10000,
    totalInputTokens,
    totalOutputTokens,
    totalCachedInputTokens,
    totalCachedCostUsd: Math.round(totalCachedCostUsd * 10000) / 10000,
    totalRuns: records.length,
    byModel,
    historicalTrend,
    totalSpent,
    totalIncome,
    netBalance,
    byCategory,
  } as any;
}

export const calculateSpendingSummary = calculateTokenCostSummary;

/**
 * Filters token cost records based on search query, model, and date range.
 */
export function filterTokenRecords(
  records: TokenCostRecord[],
  filters: {
    query?: string;
    modelName?: string;
    dateRange?: 'all' | '7d' | '30d' | '90d' | 'year';
    currentDate?: Date;
    type?: string;
    category?: string;
  }
): TokenCostRecord[] {
  const { query, modelName, dateRange = 'all', currentDate = new Date() } = filters;

  return records.filter((r) => {
    if (modelName && modelName !== 'all' && r.modelName !== modelName) {
      return false;
    }

    if (query && query.trim() !== '') {
      const q = query.toLowerCase().trim();
      const matchRepo = (r.repoName || '').toLowerCase().includes(q);
      const matchModel = (r.modelName || '').toLowerCase().includes(q);
      const matchNotes = (r.notes || '').toLowerCase().includes(q);
      const matchTitle = (r.title || '').toLowerCase().includes(q);
      if (!matchRepo && !matchModel && !matchNotes && !matchTitle) {
        return false;
      }
    }

    if (dateRange !== 'all') {
      const txDate = new Date(r.date);
      if (isNaN(txDate.getTime())) return false;

      const diffTime = currentDate.getTime() - txDate.getTime();
      const diffDays = diffTime / (1000 * 60 * 60 * 24);

      if (dateRange === '7d' && diffDays > 7) return false;
      if (dateRange === '30d' && diffDays > 30) return false;
      if (dateRange === '90d' && diffDays > 90) return false;
      if (dateRange === 'year' && diffDays > 365) return false;
    }

    return true;
  });
}

export const filterTransactions = filterTokenRecords;
