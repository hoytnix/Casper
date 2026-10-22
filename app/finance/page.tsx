import React from 'react';
import { FinanceWorkspace } from '@/components/FinanceWorkspace';
import { FinanceHeader } from '@/components/FinanceHeader';

export const metadata = {
  title: 'Token Costs Over Time & Token Spending Analytics - Casper',
  description: 'Track API token consumption, model inference expenses, and spending over time for your Gemini code compilation sessions.',
};

export default function FinancePage() {
  return (
    <div className="h-screen bg-slate-950 text-slate-100 flex flex-col overflow-hidden selection:bg-indigo-500/30 selection:text-indigo-200">
      <FinanceHeader />
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-8 overflow-y-auto min-h-0">
        <FinanceWorkspace />
      </main>
    </div>
  );
}
