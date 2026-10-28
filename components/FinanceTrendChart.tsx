'use client';

import React from 'react';
import { Coins, Cpu, Layers, TrendingUp, Zap } from 'lucide-react';
import type { TokenCostSummary } from '@/types';

export type TrendDateRange = 'all' | '7d' | '30d' | '90d';

export interface FinanceTrendChartProps {
  summary: TokenCostSummary | null;
  dateRange: 'all' | '7d' | '30d' | '90d' | 'year';
  onDateRangeChange: (range: 'all' | '7d' | '30d' | '90d' | 'year') => void;
  children?: React.ReactNode;
}

// Summary KPI cards + spending-over-time chart, extracted verbatim from
// FinanceWorkspace. Pure derivation display over the cost summary; the
// date-range buttons drive the parent's filter state. The model breakdown
// panel arrives as children so the original analytics grid DOM is intact.
export const FinanceTrendChart: React.FC<FinanceTrendChartProps> = ({
  summary,
  dateRange,
  onDateRangeChange,
  children,
}) => {
  return (
    <>
      {/* Summary KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {/* Total Cost Card */}
        <div className="glass-panel p-5 rounded-2xl border border-white/[0.08] relative overflow-hidden group">
          <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-indigo-500/10 rounded-full blur-2xl group-hover:bg-indigo-500/20 transition-all" />
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-3">
            <span>Total Token Spend</span>
            <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Coins className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-white font-mono tracking-tight">
            ${summary ? summary.totalSpentUsd.toFixed(4) : '0.0000'}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 mt-2 font-medium">
            <Zap className="w-3.5 h-3.5" />
            <span>Real LocalStorage Persistent DB</span>
          </div>
        </div>

        {/* Total Input Tokens Card */}
        <div className="glass-panel p-5 rounded-2xl border border-white/[0.08] relative overflow-hidden group">
          <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-sky-500/10 rounded-full blur-2xl group-hover:bg-sky-500/20 transition-all" />
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-3">
            <span>Total Input Context Tokens</span>
            <div className="w-8 h-8 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
              <Cpu className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-white font-mono tracking-tight">
            {summary ? summary.totalInputTokens.toLocaleString() : '0'}
          </div>
          <div className="text-[11px] text-slate-400 mt-2">
            Across {summary ? summary.totalRuns : 0} compilation runs
          </div>
        </div>

        {/* Total Output Tokens Card */}
        <div className="glass-panel p-5 rounded-2xl border border-white/[0.08] relative overflow-hidden group">
          <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-purple-500/10 rounded-full blur-2xl group-hover:bg-purple-500/20 transition-all" />
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-3">
            <span>Total Output Tokens</span>
            <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-white font-mono tracking-tight">
            {summary ? summary.totalOutputTokens.toLocaleString() : '0'}
          </div>
          <div className="text-[11px] text-slate-400 mt-2">
            Generated prompt specifications
          </div>
        </div>

        {/* Total Cached Input Tokens Card */}
        <div className="glass-panel p-5 rounded-2xl border border-white/[0.08] relative overflow-hidden group">
          <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl group-hover:bg-amber-500/20 transition-all" />
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-3">
            <span>Cached Input Tokens</span>
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Cpu className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-white font-mono tracking-tight">
            {summary ? summary.totalCachedInputTokens.toLocaleString() : '0'}
          </div>
          <div className="text-[11px] text-amber-400 mt-2 font-medium">
            {summary && summary.totalCachedCostUsd > 0
              ? `$${summary.totalCachedCostUsd.toFixed(4)} discounted cached spend`
              : 'Context caching discount active'}
          </div>
        </div>

        {/* Avg Cost / Run Card */}
        <div className="glass-panel p-5 rounded-2xl border border-white/[0.08] relative overflow-hidden group">
          <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl group-hover:bg-emerald-500/20 transition-all" />
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-3">
            <span>Avg Cost per Compilation</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-white font-mono tracking-tight">
            ${summary && summary.totalRuns > 0 ? (summary.totalSpentUsd / summary.totalRuns).toFixed(4) : '0.0000'}
          </div>
          <div className="text-[11px] text-slate-400 mt-2">
            Per repository session run
          </div>
        </div>
      </div>

      {/* Main Analytics Section: Historical Trend & Model Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Spending Over Time Chart (2 cols) */}
      <div className="glass-panel p-6 rounded-2xl border border-white/[0.08] lg:col-span-2 flex flex-col justify-between">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-indigo-400" />
              <span>Token Spending Over Time (USD)</span>
            </h2>
            <p className="text-xs text-slate-400">Chronological daily token cost expenditure trend</p>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-900/80 p-1 rounded-xl border border-white/[0.06] text-xs">
            {(['all', '7d', '30d', '90d'] as const).map((r) => (
              <button
                key={r}
                onClick={() => onDateRangeChange(r)}
                className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
                  dateRange === r ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                {r.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* SVG Line / Bar Chart */}
        <div className="h-64 w-full relative flex items-end pt-6 pb-2 px-2">
          {summary && summary.historicalTrend.length > 0 ? (
            <div className="w-full h-full flex items-end justify-between gap-2">
              {summary.historicalTrend.map((point, idx) => {
                const maxCost = Math.max(...summary.historicalTrend.map((p) => p.costUsd), 0.01);
                const heightPercent = Math.max(12, Math.min(100, (point.costUsd / maxCost) * 100));
                return (
                  <div key={idx} className="flex-1 flex flex-col items-center h-full justify-end group relative">
                    <div className="absolute -top-12 bg-slate-900 border border-white/20 text-white text-[10px] rounded-lg px-2 py-1 opacity-0 group-hover:opacity-100 transition pointer-events-none whitespace-nowrap z-20 shadow-xl">
                      <div className="font-semibold">{point.date}</div>
                      <div>Cost: ${point.costUsd.toFixed(4)} ({point.runs} runs)</div>
                    </div>

                    <div
                      style={{ height: `${heightPercent}%` }}
                      className="w-full max-w-[36px] bg-gradient-to-t from-indigo-600 to-sky-400 rounded-t-lg transition-all duration-300 group-hover:from-indigo-500 group-hover:to-sky-300 shadow-sm shadow-indigo-500/20"
                    />
                    <span className="text-[10px] text-slate-500 font-mono mt-2 truncate max-w-full">
                      {point.date.slice(5)}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 text-xs">
              <Coins className="w-8 h-8 mb-2 opacity-40" />
              <span>No token expenditure data logged yet. Compile prompts or log token usage above.</span>
            </div>
          )}
        </div>
      </div>

      {children}
      </div>
    </>
  );
};
