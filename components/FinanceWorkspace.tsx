'use client';

import React, { useState, useEffect } from 'react';
import {
  Coins,
  Plus,
} from 'lucide-react';
import { TokenCostRecord } from '@/types';
import { calculateTokenCostSummary, filterTokenRecords } from '@/lib/finance-calculations';
import { AddTransactionModal } from './AddTransactionModal';
import { FinanceTrendChart } from './FinanceTrendChart';
import { FinanceModelBreakdown } from './FinanceModelBreakdown';
import { FinanceLedgerTable } from './FinanceLedgerTable';

const STORAGE_KEY = 'nextjs_expert_token_records_v1';

export const FinanceWorkspace: React.FC = () => {
  const [tokenRecords, setTokenRecords] = useState<TokenCostRecord[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          // Filter out legacy mock seed records if any remain in localStorage
          const realRecords = parsed.filter((r: TokenCostRecord) => {
            if (!r.id) return false;
            const isLegacyMockId = /^tok-([1-9]|10)$/.test(r.id);
            const isLegacyMockRepo = ['facebook/react', 'vercel/next.js', 'tailwindlabs/tailwindcss', 'shadcn/ui', 'supabase/supabase'].includes(r.repoName) && r.date?.startsWith('2026-05-');
            return !(isLegacyMockId || isLegacyMockRepo);
          });
          return realRecords;
        }
      }
    } catch {
      // fallback
    }
    return []; // Real data only by default (no mock seed data)
  });

  const summary = React.useMemo(() => calculateTokenCostSummary(tokenRecords), [tokenRecords]);
  const [isLoading, setIsLoading] = useState(false);

  // Filters state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedModel, setSelectedModel] = useState<string>('all');
  const [dateRange, setDateRange] = useState<'all' | '7d' | '30d' | '90d' | 'year'>('all');
  // Deferred query keeps the ledger search input responsive (low INP) while
  // the table re-filters; the input itself stays controlled on `searchQuery`.
  const deferredSearchQuery = React.useDeferredValue(searchQuery);

  // Modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Persist records to localStorage whenever tokenRecords change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tokenRecords));
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
            const realRecords = parsed.filter((r: TokenCostRecord) => {
              if (!r.id) return false;
              const isLegacyMockId = /^tok-([1-9]|10)$/.test(r.id);
              const isLegacyMockRepo = ['facebook/react', 'vercel/next.js', 'tailwindlabs/tailwindcss', 'shadcn/ui', 'supabase/supabase'].includes(r.repoName) && r.date?.startsWith('2026-05-');
              return !(isLegacyMockId || isLegacyMockRepo);
            });
            setTokenRecords(realRecords);
          }
        }
      } catch {
        // fallback
      }
    };
    window.addEventListener('storage', handleStorageChange);
    handleStorageChange();
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Stable callbacks: the memoized ledger table depends on them, so they
  // must not change per search keystroke.
  const handleDeleteRecord = React.useCallback(async (id: string) => {
    if (!confirm('Are you sure you want to delete this token cost record?')) return;
    setDeletingId(id);
    try {
      const updated = tokenRecords.filter((r) => r.id !== id);
      setTokenRecords(updated);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));

      // Call API endpoint to delete on server side as well
      await fetch(`/api/finance?id=${id}`, { method: 'DELETE' });
    } catch (e) {
      console.warn('Failed to delete record:', e);
    } finally {
      setDeletingId(null);
    }
  }, [tokenRecords]);

  const handleClearAll = React.useCallback(() => {
    if (!confirm('Are you sure you want to clear all token records?')) return;
    setTokenRecords([]);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
    } catch {
      // fallback
    }
  }, []);

  // Memoized derivations: without this, every search keystroke re-filters
  // AND rebuilds new array identities, busting the memoized table below.
  const filteredRecords = React.useMemo(
    () =>
      filterTokenRecords(tokenRecords, {
        query: deferredSearchQuery,
        modelName: selectedModel,
        dateRange,
      }),
    [tokenRecords, deferredSearchQuery, selectedModel, dateRange]
  );

  const uniqueModels = React.useMemo(
    () => Array.from(new Set(tokenRecords.map((r) => r.modelName))).filter(Boolean),
    [tokenRecords]
  );

  // Memoized children element: without this, the chart's `children` prop is
  // a new element every parent render, busting its memo on each keystroke.
  const modelBreakdown = React.useMemo(
    () => <FinanceModelBreakdown summary={summary} />,
    [summary]
  );

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

      <FinanceTrendChart
        summary={summary}
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
      >
        {modelBreakdown}
      </FinanceTrendChart>

      <FinanceLedgerTable
        records={filteredRecords}
        hasRecords={tokenRecords.length > 0}
        isLoading={isLoading}
        deletingId={deletingId}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedModel={selectedModel}
        onModelChange={setSelectedModel}
        uniqueModels={uniqueModels}
        onClearAll={handleClearAll}
        onDeleteRecord={handleDeleteRecord}
      />

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
