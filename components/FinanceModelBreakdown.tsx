'use client';

import React from 'react';
import { Cpu } from 'lucide-react';
import type { TokenCostSummary } from '@/types';

export interface FinanceModelBreakdownProps {
  summary: TokenCostSummary | null;
}

// Per-model cost proportion bars, extracted verbatim from
// FinanceWorkspace. Pure derivation display over the cost summary.
// Memoized alongside FinanceTrendChart: same search-keystroke parent.
export const FinanceModelBreakdown: React.FC<FinanceModelBreakdownProps> = React.memo(function FinanceModelBreakdown({
  summary,
}) {
  return (
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
  );
});
