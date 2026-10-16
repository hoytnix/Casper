import type { Transaction, SpendingSummary } from '../types/index.ts';

/**
 * Computes financial metrics and historical trends from an array of transactions.
 */
export function calculateSpendingSummary(transactions: Transaction[]): SpendingSummary {
  let totalSpent = 0;
  let totalIncome = 0;
  const byCategory: Record<string, number> = {};
  const dailyMap: Record<string, { expense: number; income: number }> = {};

  for (const t of transactions) {
    const amt = typeof t.amount === 'number' && !isNaN(t.amount) ? Math.max(0, t.amount) : 0;
    const dateKey = t.date || new Date().toISOString().split('T')[0];

    if (!dailyMap[dateKey]) {
      dailyMap[dateKey] = { expense: 0, income: 0 };
    }

    if (t.type === 'expense') {
      totalSpent += amt;
      const cat = t.category || 'General';
      byCategory[cat] = (byCategory[cat] || 0) + amt;
      dailyMap[dateKey].expense += amt;
    } else if (t.type === 'income') {
      totalIncome += amt;
      dailyMap[dateKey].income += amt;
    }
  }

  // Sort dates chronologically
  const sortedDates = Object.keys(dailyMap).sort((a, b) => a.localeCompare(b));

  const historicalTrend = sortedDates.map((date) => ({
    date,
    amount: dailyMap[date].expense, // Historical expense amount for spending trend
    expenseAmount: dailyMap[date].expense,
    incomeAmount: dailyMap[date].income,
  }));

  return {
    totalSpent: Math.round(totalSpent * 100) / 100,
    totalIncome: Math.round(totalIncome * 100) / 100,
    netBalance: Math.round((totalIncome - totalSpent) * 100) / 100,
    byCategory,
    historicalTrend,
  };
}

/**
 * Filters transactions based on search term, category, type, and date range.
 */
export function filterTransactions(
  transactions: Transaction[],
  filters: {
    query?: string;
    category?: string;
    type?: 'all' | 'expense' | 'income';
    dateRange?: 'all' | '7d' | '30d' | '90d' | 'year';
    currentDate?: Date;
  }
): Transaction[] {
  const { query, category, type = 'all', dateRange = 'all', currentDate = new Date() } = filters;

  return transactions.filter((t) => {
    // Type filter
    if (type !== 'all' && t.type !== type) {
      return false;
    }

    // Category filter
    if (category && category !== 'all' && t.category !== category) {
      return false;
    }

    // Query filter (matches title, notes, or category)
    if (query && query.trim() !== '') {
      const q = query.toLowerCase().trim();
      const matchTitle = t.title.toLowerCase().includes(q);
      const matchNotes = t.notes ? t.notes.toLowerCase().includes(q) : false;
      const matchCat = t.category.toLowerCase().includes(q);
      if (!matchTitle && !matchNotes && !matchCat) {
        return false;
      }
    }

    // Date range filter
    if (dateRange !== 'all') {
      const txDate = new Date(t.date);
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
