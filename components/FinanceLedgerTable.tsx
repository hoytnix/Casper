'use client';

import React from 'react';
import { Coins, Loader2, Search, Trash2 } from 'lucide-react';
import type { TokenCostRecord } from '@/types';

export interface FinanceLedgerTableProps {
  records: TokenCostRecord[];
  hasRecords: boolean;
  isLoading: boolean;
  deletingId: string | null;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedModel: string;
  onModelChange: (model: string) => void;
  uniqueModels: string[];
  onClearAll: () => void;
  onDeleteRecord: (id: string) => void;
}

// Token cost records ledger, extracted verbatim from FinanceWorkspace:
// filter controls, records table with cached-input column, and per-row
// delete. All state lives in the parent; this is display + events only.
export const FinanceLedgerTable: React.FC<FinanceLedgerTableProps> = ({
  records,
  hasRecords,
  isLoading,
  deletingId,
  searchQuery,
  onSearchChange,
  selectedModel,
  onModelChange,
  uniqueModels,
  onClearAll,
  onDeleteRecord,
}) => {
  return (
    <div className="glass-panel rounded-2xl border border-white/[0.08] overflow-hidden">
      {/* Table Header Controls */}
      <div className="p-4 sm:p-6 border-b border-white/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-white tracking-tight">Token Usage &amp; Cost Ledger</h2>
          <p className="text-xs text-slate-400">Detailed log of all prompt compilation runs and token expenses</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {hasRecords && (
            <button
              onClick={onClearAll}
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
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full sm:w-64 pl-9 pr-3 py-1.5 text-xs rounded-xl bg-slate-900/80 border border-white/[0.08] text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition"
            />
          </div>

          {/* Model Filter */}
          <div className="relative">
            <select
              value={selectedModel}
              onChange={(e) => onModelChange(e.target.value)}
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
              <th className="py-3 px-4 text-right">Cached Input</th>
              <th className="py-3 px-4 text-right">Cost (USD)</th>
              <th className="py-3 px-4">Date</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04] text-xs">
            {isLoading ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-slate-400">
                  <div className="flex items-center justify-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
                    <span>Loading token cost records...</span>
                  </div>
                </td>
              </tr>
            ) : records.length > 0 ? (
              records.map((record) => (
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
                  <td
                    className="py-3.5 px-4 text-right font-mono text-amber-300"
                    title={(record.cachedInputCostUsd ?? 0) > 0 ? `Cached cost: $${(record.cachedInputCostUsd ?? 0).toFixed(6)}` : 'No cached input tokens'}
                  >
                    {(record.cachedInputTokens ?? 0).toLocaleString()}
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
                      onClick={() => onDeleteRecord(record.id)}
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
                <td colSpan={8} className="py-16 text-center text-slate-500">
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
  );
};
