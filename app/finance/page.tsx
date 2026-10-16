import React from 'react';
import { FinanceWorkspace } from '@/components/FinanceWorkspace';
import { FinanceHeader } from '@/components/FinanceHeader';

export const metadata = {
  title: 'Financial Tracker & Spending Analytics - Next.js Expert',
  description: 'Track and graph spending over time with modern React Server Components and Tailwind CSS.',
};

export default function FinancePage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-indigo-500/30 selection:text-indigo-200">
      <FinanceHeader />
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-8">
        <FinanceWorkspace />
      </main>
    </div>
  );
}
