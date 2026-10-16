'use client';

import React, { useState, useEffect } from 'react';
import { 
  Coins, 
  TrendingUp, 
  Cpu, 
  Search, 
  Plus, 
  Trash2, 
  Calendar, 
  Filter, 
  ArrowUpRight, 
  Layers, 
  Download,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Zap,
  RotateCcw
} from 'lucide-react';
import { TokenCostRecord, TokenCostSummary } from '@/types';
import { calculateTokenCostSummary, filterTokenRecords } from '@/lib/finance-calculations';
import { AddTransactionModal } from './AddTransactionModal';

const STORAGE_KEY = 'nextjs_expert_token_records_v1';

export const FinanceWorkspace: React.FC = () => {
  const [tokenRecords, setTokenRecords] = useState<TokenCostRecord[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // fallback
    }
    return []; // Real data only by default (no mock seed data)
  });

  const [summary, setSummary] = useState<TokenCostSummary>(() => calculateTokenCostSummary(tokenRecords));
  const [isLoading, setIsLoading] = useState(false);

  // Filters state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedModel, setSelectedModel] = useState<string>('all');
  const [dateRange, setDateRange] = useState<'all' | '7d' | '30d' | '90d' | 'year'>('all');

  // Modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Persist records to localStorage and re-calculate summary whenever tokenRecords change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tokenRecords));
      setSummary(calculateTokenCostSummary(tokenRecords));
    } catch (e) {
      console.warn('Failed to save token records to localStorage:', e);
    }
  }, [tokenRecords]);

  // Sync / reload from localStorage on focus or mount
  useEffect(() => {
    const handleStorageChange = () => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            setTokenRecords(parsed);
          }
        }
      } catch {
        // fallback
      }
    };
    window.addEventListener('storage', handleStorageChange);
    // Also load on interval or mount
    handleStorageChange();
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const handleDeleteRecord = (id: string) => {
    if (!confirm('Are you sure you want to delete this token cost record?')) return;
    setDeletingId(id);
    try {
      const updated = tokenRecords.filter((r) => r.id !== id);
      setTokenRecords(updated);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.warn('Failed to delete record:', e);
    } finally {
      setDeletingId(null);
    }
  };

  const handleClearAll = () => {
    if (!confirm('Are you sure you want to clear all token records?')) return;
    setTokenRecords([]);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
    } catch {
      // fallback
    }
  };

  const filteredRecords = filterTokenRecords(tokenRecords, {
    query: searchQuery,
    modelName: selectedModel,
    dateRange,
  });

  const uniqueModels = Array.from(new Set(tokenRecords.map((r) => r.modelName))).filter(Boolean);

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Top Banner Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/[0.08] pb-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-indigo-400 mb-1">
            <Coins className="w-4 h-4" />
            <span>AI Token Cost Intelligence &amp; Analytics (Real Data DB)</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Token Costs Over Time Tracker
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-2xl">
            Monitor API token consumption, model inference expenses, input vs. output token volumes, and historical spending trends across your prompt compilation sessions.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-xs font-semibold shadow-lg shadow-indigo-600/30 transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Log Token Usage</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
                  onClick={() => setDateRange(r)}
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

        {/* Model Cost Breakdown (1 col) */}
        <div className="glass-panel p-6 rounded-2xl border border-white/[0.08] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                <Cpu className="w-4 h-4 text-purple-400" />
                <span>Cost by Gemini Model</span>
              </h2>
            </div>
            <p className="text-xs text-slate-400 mb-6">Proportion of token spending per model tier</p>

            <div className="space-y-4">
              {summary && Object.keys(summary.byModel).length > 0 ? (
                Object.entries(summary.byModel).map(([modelName, data]) => {
                  const percentage = summary.totalSpentUsd > 0 ? (data.cost / summary.totalSpentUsd) * 100 : 0;
                  return (
                    <div key={modelName} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-mono text-slate-200 font-medium truncate max-w-[160px]">{modelName}</span>
                        <span className="font-mono text-indigo-400 font-semibold">${data.cost.toFixed(4)}</span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-900 overflow-hidden border border-white/[0.04]">
                        <div
                          className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500"
                          style={{ width: `${Math.max(4, percentage)}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-slate-500">
                        <span>{data.runs} runs</span>
                        <span>{percentage.toFixed(1)}% total</span>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="py-12 text-center text-slate-500 text-xs">
                  <span>No model usage recorded</span>
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-white/[0.08] flex items-center justify-between text-xs text-slate-400">
            <span>Real Data Storage</span>
            <span className="text-emerald-400 font-semibold">Active</span>
          </div>
        </div>
      </div>

      {/* Token Cost Records Ledger Table */}
      <div className="glass-panel rounded-2xl border border-white/[0.08] overflow-hidden">
        {/* Table Header Controls */}
        <div className="p-4 sm:p-6 border-b border-white/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-white tracking-tight">Token Usage &amp; Cost Ledger</h2>
            <p className="text-xs text-slate-400">Detailed log of all prompt compilation runs and token expenses</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {tokenRecords.length > 0 && (
              <button
                onClick={handleClearAll}
                className="px-3 py-1.5 text-xs font-medium text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-xl transition cursor-pointer"
              >
                Clear All
              </button>
            )}

            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search repository or notes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full sm:w-64 pl-9 pr-3 py-1.5 text-xs rounded-xl bg-slate-900/80 border border-white/[0.08] text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition"
              />
            </div>

            {/* Model Filter */}
            <div className="relative">
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="px-3 py-1.5 text-xs rounded-xl bg-slate-900/80 border border-white/[0.08] text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition"
              >
                <option value="all">All Models</option>
                {uniqueModels.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Table / List */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/[0.08] bg-slate-900/40 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-4 sm:px-6">Repository / Session</th>
                <th className="py-3 px-4">Model Name</th>
                <th className="py-3 px-4 text-right">Input Tokens</th>
                <th className="py-3 px-4 text-right">Output Tokens</th>
                <th className="py-3 px-4 text-right">Cost (USD)</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04] text-xs">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
                      <span>Loading token cost records...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredRecords.length > 0 ? (
                filteredRecords.map((record) => (
                  <tr key={record.id} className="hover:bg-white/[0.02] transition-colors group">
                    <td className="py-3.5 px-4 sm:px-6">
                      <div className="font-semibold text-white font-mono">{record.repoName}</div>
                      {record.notes && <div className="text-[11px] text-slate-400 truncate max-w-xs">{record.notes}</div>}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-mono font-medium bg-indigo-500/10 text-indigo-300 border border-indigo-500/25">
                        {record.modelName}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-slate-300">
                      {record.inputTokens.toLocaleString()}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-slate-300">
                      {record.outputTokens.toLocaleString()}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-emerald-400">
                      ${record.totalCostUsd.toFixed(4)}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-400 whitespace-nowrap">
                      {record.date}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => handleDeleteRecord(record.id)}
                        disabled={deletingId === record.id}
                        aria-label="Delete record"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition disabled:opacity-50 cursor-pointer"
                        title="Delete record"
                      >
                        {deletingId === record.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-400" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Coins className="w-8 h-8 opacity-30 text-slate-400" />
                      <span>No token cost records found. Log token usage or compile prompts to populate real data.</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Token Cost Record Modal */}
      <AddTransactionModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={() => {
          try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
              const parsed = JSON.parse(stored);
              if (Array.isArray(parsed)) setTokenRecords(parsed);
            }
          } catch {
            // fallback
          }
        }}
      />
    </div>
  );
};
