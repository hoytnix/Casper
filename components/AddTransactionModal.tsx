'use client';

import React, { useState, useEffect } from 'react';
import { X, DollarSign, Calendar, Tag, FileText, ArrowDownRight, ArrowUpRight, Loader2 } from 'lucide-react';
import { z } from 'zod';
import { TransactionType } from '@/types';

const transactionFormSchema = z.object({
  title: z.string().trim().min(2, 'Title must be at least 2 characters'),
  amount: z.number().positive('Amount must be greater than $0'),
  category: z.string().trim().min(1, 'Please choose or enter a category'),
  type: z.enum(['expense', 'income'] as const),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Valid date (YYYY-MM-DD) is required'),
  notes: z.string().optional(),
});

interface AddTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const CATEGORY_PRESETS: Record<TransactionType, string[]> = {
  expense: ['Infrastructure', 'Software', 'Personnel', 'Hardware', 'Marketing', 'Office', 'General'],
  income: ['Revenue', 'Consulting', 'Client Retainer', 'Investment', 'Grant', 'General'],
};

export const AddTransactionModal: React.FC<AddTransactionModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const today = new Date().toISOString().split('T')[0];

  const [type, setType] = useState<TransactionType>('expense');
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('Infrastructure');
  const [date, setDate] = useState(today);
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const handleTypeChange = (newType: TransactionType) => {
    setType(newType);
    if (newType === 'expense' && !CATEGORY_PRESETS.expense.includes(category)) {
      setCategory('Infrastructure');
    } else if (newType === 'income' && !CATEGORY_PRESETS.income.includes(category)) {
      setCategory('Revenue');
    }
  };

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

    const numericAmount = parseFloat(amount);

    const validation = transactionFormSchema.safeParse({
      title,
      amount: isNaN(numericAmount) ? undefined : numericAmount,
      category,
      type,
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
      const res = await fetch('/api/finance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validation.data),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to record transaction');
      }

      // Reset form state
      setTitle('');
      setAmount('');
      setNotes('');
      setDate(today);
      onSuccess();
      onClose();
    } catch (err: unknown) {
      setApiError(err instanceof Error ? err.message : 'Network error recording transaction');
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
            <DollarSign className="w-5 h-5 text-indigo-400" />
            <span>Record New Transaction</span>
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

          {/* Type Segmented Control */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300">Transaction Type</label>
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-900/80 rounded-xl border border-white/[0.06]">
              <button
                type="button"
                onClick={() => handleTypeChange('expense')}
                className={`flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg transition-all ${
                  type === 'expense'
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <ArrowDownRight className="w-4 h-4 text-rose-400" />
                <span>Expense</span>
              </button>
              <button
                type="button"
                onClick={() => handleTypeChange('income')}
                className={`flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg transition-all ${
                  type === 'income'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <ArrowUpRight className="w-4 h-4 text-emerald-400" />
                <span>Income</span>
              </button>
            </div>
          </div>

          {/* Title & Amount Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="tx-title" className="text-xs font-medium text-slate-300">
                Title / Description *
              </label>
              <input
                id="tx-title"
                type="text"
                placeholder="e.g. AWS Cloud Hosting"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={`w-full px-3 py-2 text-xs rounded-xl bg-slate-900/70 border text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition ${
                  errors.title ? 'border-rose-500/60 bg-rose-500/5' : 'border-white/[0.08]'
                }`}
              />
              {errors.title && <p className="text-[11px] text-rose-400">{errors.title}</p>}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="tx-amount" className="text-xs font-medium text-slate-300">
                Amount (USD) *
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-mono">$</span>
                <input
                  id="tx-amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className={`w-full pl-7 pr-3 py-2 text-xs font-mono rounded-xl bg-slate-900/70 border text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition ${
                    errors.amount ? 'border-rose-500/60 bg-rose-500/5' : 'border-white/[0.08]'
                  }`}
                />
              </div>
              {errors.amount && <p className="text-[11px] text-rose-400">{errors.amount}</p>}
            </div>
          </div>

          {/* Category & Date Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="tx-category" className="text-xs font-medium text-slate-300 flex items-center gap-1">
                <Tag className="w-3.5 h-3.5 text-slate-400" />
                <span>Category *</span>
              </label>
              <select
                id="tx-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl bg-slate-900/70 border border-white/[0.08] text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition"
              >
                {CATEGORY_PRESETS[type].map((cat) => (
                  <option key={cat} value={cat} className="bg-slate-900 text-slate-100">
                    {cat}
                  </option>
                ))}
              </select>
              {errors.category && <p className="text-[11px] text-rose-400">{errors.category}</p>}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="tx-date" className="text-xs font-medium text-slate-300 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>Date *</span>
              </label>
              <input
                id="tx-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={`w-full px-3 py-2 text-xs font-mono rounded-xl bg-slate-900/70 border text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition ${
                  errors.date ? 'border-rose-500/60 bg-rose-500/5' : 'border-white/[0.08]'
                }`}
              />
              {errors.date && <p className="text-[11px] text-rose-400">{errors.date}</p>}
            </div>
          </div>

          {/* Optional Notes */}
          <div className="space-y-1.5">
            <label htmlFor="tx-notes" className="text-xs font-medium text-slate-300 flex items-center gap-1">
              <FileText className="w-3.5 h-3.5 text-slate-400" />
              <span>Notes (Optional)</span>
            </label>
            <input
              id="tx-notes"
              type="text"
              placeholder="e.g. Monthly ECS cluster invoice"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl bg-slate-900/70 border border-white/[0.08] text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition"
            />
          </div>

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end gap-3 border-t border-white/[0.08]">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-medium rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.06] transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white shadow-md shadow-indigo-600/30 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Recording...</span>
                </>
              ) : (
                <span>Record Transaction</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
