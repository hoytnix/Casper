'use client';

import React, { useState, useEffect } from 'react';
import { X, Coins, Calendar, Tag, FileText, Cpu, Loader2 } from 'lucide-react';
import { z } from 'zod';
import { TokenCostRecord } from '@/types';

const STORAGE_KEY = 'nextjs_expert_token_records_v1';

const tokenRecordFormSchema = z.object({
  repoName: z.string().trim().min(2, 'Repository name is required'),
  modelName: z.string().trim().min(2, 'Model name is required'),
  inputTokens: z.number().nonnegative('Input tokens must be >= 0'),
  outputTokens: z.number().nonnegative('Output tokens must be >= 0'),
  totalCostUsd: z.number().nonnegative('Cost must be >= 0'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Valid date (YYYY-MM-DD) is required'),
  notes: z.string().optional(),
});

interface AddTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const MODEL_PRESETS = [
  'gemini-4-argon',
  'gemini-2.5-pro',
  'gemini-3.8-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite',
];

export const AddTransactionModal: React.FC<AddTransactionModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const today = new Date().toISOString().split('T')[0];

  const [repoName, setRepoName] = useState('owner/repo');
  const [modelName, setModelName] = useState('gemini-4-argon');
  const [inputTokens, setInputTokens] = useState('50000');
  const [outputTokens, setOutputTokens] = useState('10000');
  const [totalCostUsd, setTotalCostUsd] = useState('0.25');
  const [date, setDate] = useState(today);
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // Keyboard Escape listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiError(null);
    setErrors({});

    const numInput = parseInt(inputTokens, 10);
    const numOutput = parseInt(outputTokens, 10);
    const numCost = parseFloat(totalCostUsd);

    const validation = tokenRecordFormSchema.safeParse({
      repoName,
      modelName,
      inputTokens: isNaN(numInput) ? -1 : numInput,
      outputTokens: isNaN(numOutput) ? -1 : numOutput,
      totalCostUsd: isNaN(numCost) ? -1 : numCost,
      date,
      notes: notes.trim() || undefined,
    });

    if (!validation.success) {
      const fieldErrors: Record<string, string> = {};
      validation.error.issues.forEach((issue) => {
        const fieldName = issue.path[0] as string;
        if (fieldName && !fieldErrors[fieldName]) {
          fieldErrors[fieldName] = issue.message;
        }
      });
      setErrors(fieldErrors);
      return;
    }

    try {
      setIsSubmitting(true);

      const newRecord: TokenCostRecord = {
        id: `tok-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        repoName: validation.data.repoName,
        modelName: validation.data.modelName,
        inputTokens: validation.data.inputTokens,
        outputTokens: validation.data.outputTokens,
        totalCostUsd: validation.data.totalCostUsd,
        date: validation.data.date,
        notes: validation.data.notes,
        title: validation.data.repoName,
        amount: validation.data.totalCostUsd,
        category: validation.data.modelName,
        type: 'expense',
      };

      // Save to localStorage DB
      try {
        const existingStored = localStorage.getItem(STORAGE_KEY);
        const existingRecords: TokenCostRecord[] = existingStored ? JSON.parse(existingStored) : [];
        const updated = [newRecord, ...existingRecords];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch (e) {
        console.warn('Failed to save to localStorage:', e);
      }

      // Also call API endpoint for consistency
      fetch('/api/finance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validation.data),
      }).catch(() => {});

      // Reset form
      setRepoName('owner/repo');
      setNotes('');
      setDate(today);
      onSuccess();
      onClose();
    } catch (err: unknown) {
      setApiError(err instanceof Error ? err.message : 'Error recording token usage');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="glass-panel-elevated w-full max-w-lg rounded-2xl border border-white/[0.1] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.08]">
          <h2 id="modal-title" className="text-base font-bold text-white tracking-tight flex items-center gap-2">
            <Coins className="w-5 h-5 text-indigo-400" />
            <span>Log Token Cost &amp; Usage Record</span>
          </h2>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {apiError && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
              {apiError}
            </div>
          )}

          {/* Repo Name & Model Name */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="repo-name" className="text-xs font-medium text-slate-300 flex items-center gap-1">
                <Tag className="w-3.5 h-3.5 text-slate-400" />
                <span>Repository / Session *</span>
              </label>
              <input
                id="repo-name"
                type="text"
                placeholder="e.g. facebook/react"
                value={repoName}
                onChange={(e) => setRepoName(e.target.value)}
                className={`w-full px-3 py-2 text-xs font-mono rounded-xl bg-slate-900/70 border text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition ${
                  errors.repoName ? 'border-rose-500/60 bg-rose-500/5' : 'border-white/[0.08]'
                }`}
              />
              {errors.repoName && <p className="text-[11px] text-rose-400">{errors.repoName}</p>}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="model-name" className="text-xs font-medium text-slate-300 flex items-center gap-1">
                <Cpu className="w-3.5 h-3.5 text-slate-400" />
                <span>Gemini Model *</span>
              </label>
              <select
                id="model-name"
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl bg-slate-900/70 border border-white/[0.08] text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition"
              >
                {MODEL_PRESETS.map((m) => (
                  <option key={m} value={m} className="bg-slate-900 text-slate-100 font-mono">
                    {m}
                  </option>
                ))}
              </select>
              {errors.modelName && <p className="text-[11px] text-rose-400">{errors.modelName}</p>}
            </div>
          </div>

          {/* Tokens & Cost Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="input-tokens" className="text-xs font-medium text-slate-300">
                Input Tokens *
              </label>
              <input
                id="input-tokens"
                type="number"
                min="0"
                step="100"
                value={inputTokens}
                onChange={(e) => setInputTokens(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono rounded-xl bg-slate-900/70 border border-white/[0.08] text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="output-tokens" className="text-xs font-medium text-slate-300">
                Output Tokens *
              </label>
              <input
                id="output-tokens"
                type="number"
                min="0"
                step="50"
                value={outputTokens}
                onChange={(e) => setOutputTokens(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono rounded-xl bg-slate-900/70 border border-white/[0.08] text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="total-cost" className="text-xs font-medium text-slate-300">
                Cost ($ USD) *
              </label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-mono">$</span>
                <input
                  id="total-cost"
                  type="number"
                  step="0.0001"
                  min="0"
                  value={totalCostUsd}
                  onChange={(e) => setTotalCostUsd(e.target.value)}
                  className="w-full pl-6 pr-2.5 py-2 text-xs font-mono rounded-xl bg-slate-900/70 border border-white/[0.08] text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition"
                />
              </div>
            </div>
          </div>

          {/* Date & Notes Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="token-date" className="text-xs font-medium text-slate-300 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>Date *</span>
              </label>
              <input
                id="token-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono rounded-xl bg-slate-900/70 border border-white/[0.08] text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="token-notes" className="text-xs font-medium text-slate-300 flex items-center gap-1">
                <FileText className="w-3.5 h-3.5 text-slate-400" />
                <span>Notes (Optional)</span>
              </label>
              <input
                id="token-notes"
                type="text"
                placeholder="e.g. Agentic compilation run"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl bg-slate-900/70 border border-white/[0.08] text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end gap-3 border-t border-white/[0.08]">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-medium rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.06] transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white shadow-md shadow-indigo-600/30 transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Recording...</span>
                </>
              ) : (
                <span>Log Token Cost</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
