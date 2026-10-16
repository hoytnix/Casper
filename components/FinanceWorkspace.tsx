'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp,
  DollarSign,
  PieChart,
  Plus,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Search,
  Filter,
  Trash2,
  RefreshCw,
  Wallet,
  Layers,
  CheckCircle2,
} from 'lucide-react';
import { Transaction, SpendingSummary, TransactionType } from '@/types';
import { AddTransactionModal } from './AddTransactionModal';
import { filterTransactions } from '@/lib/finance-calculations';

type DateRangeFilter = 'all' | '7d' | '30d' | '90d';

export const FinanceWorkspace: React.FC = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<SpendingSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedType, setSelectedType] = useState<'all' | 'expense' | 'income'>('all');
  const [dateRange, setDateRange] = useState<DateRangeFilter>('all');
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null);
  const [feedbackNotice, setFeedbackNotice] = useState<string | null>(null);

  const fetchFinanceData = async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/finance');
      const data = await res.json();
      if (res.ok) {
        setTransactions(data.transactions || []);
        setSummary(data.summary || null);
      }
    } catch (err) {
      console.error('Failed to load finance data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    fetch('/api/finance')
      .then((res) => res.json())
      .then((data) => {
        if (isMounted) {
          setTransactions(data.transactions || []);
          setSummary(data.summary || null);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        console.error('Failed to load finance data:', err);
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleDeleteTransaction = async (id: string, title: string) => {
    try {
      const res = await fetch(`/api/finance?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        const data = await res.json();
        setTransactions((prev) => prev.filter((t) => t.id !== id));
        if (data.summary) {
          setSummary(data.summary);
        }
        setFeedbackNotice(`Removed "${title}"`);
        setTimeout(() => setFeedbackNotice(null), 3000);
      }
    } catch (err) {
      console.error('Failed to delete transaction:', err);
    }
  };

  // Distinct categories available in current transactions
  const availableCategories = useMemo(() => {
    const cats = new Set<string>();
    transactions.forEach((t) => {
      if (t.category) cats.add(t.category);
    });
    return Array.from(cats).sort();
  }, [transactions]);

  // Filtered transactions for the ledger view
  const filteredTransactions = useMemo(() => {
    return filterTransactions(transactions, {
      query: searchQuery,
      category: selectedCategory,
      type: selectedType,
      dateRange,
    });
  }, [transactions, searchQuery, selectedCategory, selectedType, dateRange]);

  // Calculate historical trend points for the chart
  const chartData = useMemo(() => {
    if (!summary?.historicalTrend || summary.historicalTrend.length === 0) {
      return [];
    }

    // Filter trend by dateRange if needed
    const now = new Date();
    return summary.historicalTrend.filter((pt) => {
      if (dateRange === 'all') return true;
      const d = new Date(pt.date);
      if (isNaN(d.getTime())) return true;
      const diffDays = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
      if (dateRange === '7d') return diffDays <= 7;
      if (dateRange === '30d') return diffDays <= 30;
      if (dateRange === '90d') return diffDays <= 90;
      return true;
    });
  }, [summary, dateRange]);

  // Chart coordinates calculation (SVG)
  const chartMetrics = useMemo(() => {
    if (chartData.length === 0) {
      return {
        maxAmount: 0,
        points: '',
        fillPath: '',
        coordinates: [],
        chartWidth: 800,
        chartHeight: 220,
        baselineY: 196,
      };
    }

    const amounts = chartData.map((d) => d.amount);
    const maxVal = Math.max(...amounts, 100);
    const chartWidth = 800;
    const chartHeight = 220;
    const paddingX = 40;
    const paddingY = 24;

    const effectiveWidth = chartWidth - paddingX * 2;
    const effectiveHeight = chartHeight - paddingY * 2;

    const coordinates = chartData.map((pt, i) => {
      const x =
        chartData.length === 1
          ? chartWidth / 2
          : paddingX + (i / (chartData.length - 1)) * effectiveWidth;
      const y = paddingY + effectiveHeight - (pt.amount / maxVal) * effectiveHeight;
      return { x, y, pt, index: i };
    });

    const points = coordinates.map((c) => `${c.x},${c.y}`).join(' ');

    // Fill path for gradient background under curve
    const first = coordinates[0];
    const last = coordinates[coordinates.length - 1];
    const baselineY = paddingY + effectiveHeight;
    const fillPath = `M ${first.x},${baselineY} L ${first.x},${first.y} ${coordinates
      .map((c) => `L ${c.x},${c.y}`)
      .join(' ')} L ${last.x},${baselineY} Z`;

    return { maxAmount: maxVal, points, fillPath, coordinates, chartWidth, chartHeight, baselineY };
  }, [chartData]);

  // Category distribution calculation
  const categoryPercentages = useMemo(() => {
    if (!summary?.byCategory) return [];
    const total = summary.totalSpent || 1;
    return Object.entries(summary.byCategory)
      .map(([cat, amt]) => ({
        category: cat,
        amount: amt,
        percentage: Math.round((amt / total) * 100),
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [summary]);

  const activePoint = hoveredPointIndex !== null && chartMetrics.coordinates[hoveredPointIndex]
    ? chartMetrics.coordinates[hoveredPointIndex]
    : null;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Top Header & Context */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-white/[0.08]">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-indigo-400 mb-1">
            <Wallet className="w-3.5 h-3.5" />
            <span>FINANCIAL ANALYTICS &amp; CASH FLOW LEDGER</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight flex items-center gap-2">
            Spending Over Time &amp; Financial Tracker
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-2xl">
            Track and graph expenses chronologically, inspect real-time cash flow distributions, and manage transaction ledgers with zero latency.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={fetchFinanceData}
            title="Refresh data"
            className="p-2.5 rounded-xl border border-white/[0.08] bg-slate-900/60 text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/30 transition active:scale-95 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Add Transaction</span>
          </button>
        </div>
      </div>

      {/* Floating feedback toast */}
      {feedbackNotice && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-medium animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{feedbackNotice}</span>
        </div>
      )}

      {/* Metric Cards Bento Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Expenses */}
        <div className="glass-panel p-5 rounded-2xl border border-white/[0.08] relative overflow-hidden group">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="font-medium">Total Expenses</span>
            <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400">
              <ArrowDownRight className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-rose-400 font-mono tabular-nums tracking-tight">
            ${summary ? summary.totalSpent.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
          </div>
          <p className="text-[11px] text-slate-500 mt-2 font-mono">
            {transactions.filter((t) => t.type === 'expense').length} recorded expenses
          </p>
        </div>

        {/* Total Income */}
        <div className="glass-panel p-5 rounded-2xl border border-white/[0.08] relative overflow-hidden group">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="font-medium">Total Income</span>
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-emerald-400 font-mono tabular-nums tracking-tight">
            ${summary ? summary.totalIncome.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
          </div>
          <p className="text-[11px] text-slate-500 mt-2 font-mono">
            {transactions.filter((t) => t.type === 'income').length} income events
          </p>
        </div>

        {/* Net Cash Flow */}
        <div className="glass-panel p-5 rounded-2xl border border-white/[0.08] relative overflow-hidden group">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="font-medium">Net Cash Flow</span>
            <div className={`p-1.5 rounded-lg ${
              (summary?.netBalance ?? 0) >= 0 ? 'bg-indigo-500/10 text-indigo-400' : 'bg-amber-500/10 text-amber-400'
            }`}>
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className={`text-2xl sm:text-3xl font-bold font-mono tabular-nums tracking-tight ${
            (summary?.netBalance ?? 0) >= 0 ? 'text-indigo-300' : 'text-amber-400'
          }`}>
            {(summary?.netBalance ?? 0) < 0 ? '-' : ''}$
            {summary ? Math.abs(summary.netBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
          </div>
          <p className="text-[11px] text-slate-500 mt-2 font-mono">
            Income minus total outflow
          </p>
        </div>

        {/* Categories Tracked */}
        <div className="glass-panel p-5 rounded-2xl border border-white/[0.08] relative overflow-hidden group">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="font-medium">Top Category</span>
            <div className="p-1.5 rounded-lg bg-sky-500/10 text-sky-400">
              <PieChart className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-bold text-slate-100 tracking-tight truncate">
            {categoryPercentages[0]?.category || 'None'}
          </div>
          <p className="text-[11px] text-slate-500 mt-2 font-mono">
            {categoryPercentages[0] ? `$${categoryPercentages[0].amount.toLocaleString()} (${categoryPercentages[0].percentage}%)` : 'No expenses logged'}
          </p>
        </div>
      </div>

      {/* Historical Spending Chart Section */}
      <div className="glass-panel rounded-2xl border border-white/[0.08] p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-indigo-400" />
              <span>Historical Spending Over Time</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Visualizes daily cumulative expense burn rate across chronological date points.
            </p>
          </div>

          {/* Time Range Filter Controls */}
          <div className="flex items-center gap-1 p-1 bg-slate-900/80 rounded-xl border border-white/[0.06] shrink-0">
            {(['all', '90d', '30d', '7d'] as DateRangeFilter[]).map((range) => (
              <button
                key={range}
                onClick={() => setDateRange(range)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                  dateRange === range
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {range === 'all' ? 'All Time' : range === '90d' ? 'Last 90d' : range === '30d' ? 'Last 30d' : 'Last 7d'}
              </button>
            ))}
          </div>
        </div>

        {/* SVG Graph Viewport */}
        {chartData.length > 0 ? (
          <div className="relative w-full overflow-hidden">
            {/* Interactive tooltip pill */}
            {activePoint && (
              <div
                className="absolute z-20 pointer-events-none transform -translate-x-1/2 -translate-y-full px-3 py-1.5 rounded-lg bg-slate-900/95 border border-indigo-500/40 shadow-xl backdrop-blur-md text-xs font-mono"
                style={{
                  left: `${(activePoint.x / (chartMetrics.chartWidth || 800)) * 100}%`,
                  top: `${Math.max(10, activePoint.y - 12)}px`,
                }}
              >
                <div className="text-[10px] text-slate-400">{activePoint.pt.date}</div>
                <div className="text-rose-400 font-bold">
                  Spent: ${activePoint.pt.amount.toFixed(2)}
                </div>
                {activePoint.pt.incomeAmount && activePoint.pt.incomeAmount > 0 ? (
                  <div className="text-emerald-400 font-bold">
                    Income: +${activePoint.pt.incomeAmount.toFixed(2)}
                  </div>
                ) : null}
              </div>
            )}

            <div className="w-full aspect-[21/9] sm:aspect-[24/8] min-h-[200px]">
              <svg
                viewBox={`0 0 ${chartMetrics.chartWidth || 800} ${chartMetrics.chartHeight || 220}`}
                className="w-full h-full overflow-visible"
              >
                <defs>
                  <linearGradient id="spending-gradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity="0.45" />
                    <stop offset="60%" stopColor="#6366f1" stopOpacity="0.12" />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
                  </linearGradient>
                </defs>

                {/* Horizontal guide lines */}
                {[0.25, 0.5, 0.75, 1].map((ratio) => {
                  const y = 24 + (1 - ratio) * (220 - 48);
                  const labelValue = Math.round(chartMetrics.maxAmount * ratio);
                  return (
                    <g key={ratio}>
                      <line
                        x1="40"
                        y1={y}
                        x2={chartMetrics.chartWidth ? chartMetrics.chartWidth - 40 : 760}
                        y2={y}
                        stroke="rgba(255,255,255,0.06)"
                        strokeDasharray="4 4"
                      />
                      <text
                        x="32"
                        y={y + 3}
                        textAnchor="end"
                        className="text-[10px] fill-slate-500 font-mono"
                      >
                        ${labelValue}
                      </text>
                    </g>
                  );
                })}

                {/* Filled Area */}
                {chartMetrics.fillPath && (
                  <path
                    d={chartMetrics.fillPath}
                    fill="url(#spending-gradient)"
                  />
                )}

                {/* Main Curve Line */}
                {chartMetrics.points && (
                  <polyline
                    fill="none"
                    stroke="#818cf8"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={chartMetrics.points}
                  />
                )}

                {/* Data Points */}
                {chartMetrics.coordinates.map((c) => (
                  <g key={c.index} className="cursor-pointer">
                    <circle
                      cx={c.x}
                      cy={c.y}
                      r={hoveredPointIndex === c.index ? 6 : 4}
                      className={`transition-all duration-150 ${
                        hoveredPointIndex === c.index
                          ? 'fill-indigo-300 stroke-indigo-600 stroke-[3px]'
                          : 'fill-indigo-400 stroke-slate-950 stroke-2'
                      }`}
                      onMouseEnter={() => setHoveredPointIndex(c.index)}
                      onMouseLeave={() => setHoveredPointIndex(null)}
                    />
                    {/* Date label on x-axis */}
                    <text
                      x={c.x}
                      y={chartMetrics.baselineY + 16}
                      textAnchor="middle"
                      className="text-[10px] fill-slate-500 font-mono"
                    >
                      {c.pt.date.slice(5)}
                    </text>
                  </g>
                ))}
              </svg>
            </div>
          </div>
        ) : (
          <div className="py-12 text-center text-slate-500 text-xs font-mono">
            No historical spending points found for this range.
          </div>
        )}

        {/* Category Breakdown Bar */}
        {categoryPercentages.length > 0 && (
          <div className="pt-4 border-t border-white/[0.08] space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold text-slate-300 uppercase tracking-wider text-[11px]">
                Expense Category Distribution
              </span>
              <span className="font-mono text-[11px] text-slate-500">
                100% Total Outflow
              </span>
            </div>

            {/* Segmented Distribution Bar */}
            <div className="h-3 w-full rounded-full bg-slate-900 overflow-hidden flex p-[1px] gap-0.5 border border-white/[0.08]">
              {categoryPercentages.map((item, idx) => {
                const colors = [
                  'bg-indigo-500',
                  'bg-sky-500',
                  'bg-emerald-500',
                  'bg-purple-500',
                  'bg-amber-500',
                  'bg-rose-500',
                ];
                const color = colors[idx % colors.length];
                return (
                  <div
                    key={item.category}
                    style={{ width: `${Math.max(item.percentage, 3)}%` }}
                    className={`${color} h-full rounded-sm transition-all hover:opacity-80`}
                    title={`${item.category}: $${item.amount.toFixed(2)} (${item.percentage}%)`}
                  />
                );
              })}
            </div>

            {/* Legend Chips */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-mono">
              {categoryPercentages.map((item, idx) => {
                const dotColors = [
                  'bg-indigo-400',
                  'bg-sky-400',
                  'bg-emerald-400',
                  'bg-purple-400',
                  'bg-amber-400',
                  'bg-rose-400',
                ];
                const dot = dotColors[idx % dotColors.length];
                return (
                  <div key={item.category} className="flex items-center gap-1.5 text-slate-400">
                    <span className={`w-2 h-2 rounded-full ${dot}`} aria-hidden="true" />
                    <span className="text-slate-300 font-sans">{item.category}</span>
                    <span className="text-slate-500 tabular-nums">
                      ${item.amount.toLocaleString()} ({item.percentage}%)
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Ledger & Transactions Table Section */}
      <div className="glass-panel rounded-2xl border border-white/[0.08] p-6 space-y-4">
        {/* Search, Filter and Actions Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Layers className="w-4 h-4 text-sky-400" />
              <span>Transaction History ({filteredTransactions.length})</span>
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Search Input */}
            <div className="relative min-w-[200px]">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search description, notes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-slate-900/80 border border-white/[0.08] text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            {/* Type Filter */}
            <div className="flex items-center gap-1 p-0.5 bg-slate-900/80 rounded-xl border border-white/[0.06]">
              {(['all', 'expense', 'income'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setSelectedType(t)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-lg capitalize transition-colors ${
                    selectedType === t
                      ? 'bg-slate-800 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* Category Filter */}
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-xl bg-slate-900/80 border border-white/[0.08] text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="all">All Categories</option>
              {availableCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Ledger Table */}
        <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-white/[0.08] bg-slate-900/60 text-slate-400">
                <th className="py-3 px-4 font-semibold">Title / Description</th>
                <th className="py-3 px-4 font-semibold">Category</th>
                <th className="py-3 px-4 font-semibold">Date</th>
                <th className="py-3 px-4 font-semibold">Notes</th>
                <th className="py-3 px-4 font-semibold text-right">Amount</th>
                <th className="py-3 px-4 font-semibold text-right w-12">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {isLoading ? (
                // Skeleton loading rows
                [1, 2, 3, 4].map((i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="py-3 px-4">
                      <div className="h-4 bg-slate-800 rounded w-32" />
                    </td>
                    <td className="py-3 px-4">
                      <div className="h-4 bg-slate-800 rounded w-20" />
                    </td>
                    <td className="py-3 px-4">
                      <div className="h-4 bg-slate-800 rounded w-24" />
                    </td>
                    <td className="py-3 px-4">
                      <div className="h-4 bg-slate-800 rounded w-36" />
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="h-4 bg-slate-800 rounded w-16 ml-auto" />
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="h-4 bg-slate-800 rounded w-6 ml-auto" />
                    </td>
                  </tr>
                ))
              ) : filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500 font-sans">
                    <p className="text-sm">No transactions match your current filters.</p>
                    <button
                      onClick={() => {
                        setSearchQuery('');
                        setSelectedCategory('all');
                        setSelectedType('all');
                        setDateRange('all');
                      }}
                      className="mt-2 text-xs text-indigo-400 hover:underline"
                    >
                      Clear all filters
                    </button>
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-white/[0.02] transition">
                    <td className="py-3 px-4 text-slate-200 font-sans font-medium">
                      {tx.title}
                    </td>
                    <td className="py-3 px-4 text-indigo-400 font-sans">
                      {tx.category}
                    </td>
                    <td className="py-3 px-4 text-slate-400 tabular-nums">
                      {tx.date}
                    </td>
                    <td className="py-3 px-4 text-slate-500 font-sans max-w-xs truncate">
                      {tx.notes || '—'}
                    </td>
                    <td
                      className={`py-3 px-4 text-right font-bold tabular-nums ${
                        tx.type === 'income' ? 'text-emerald-400' : 'text-slate-100'
                      }`}
                    >
                      {tx.type === 'income' ? '+' : '-'}${tx.amount.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => handleDeleteTransaction(tx.id, tx.title)}
                        aria-label={`Delete ${tx.title}`}
                        className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal for Recording New Transaction */}
      <AddTransactionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={fetchFinanceData}
      />
    </div>
  );
};
