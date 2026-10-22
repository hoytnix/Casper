'use client';

import React from 'react';
import Link from 'next/link';
import { Layers, ArrowLeft, Cpu, Coins } from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';

export const FinanceHeader: React.FC = () => {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/[0.08] bg-[#07090e]/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-15 flex items-center justify-between gap-8">
        {/* Zone 1: Brand title / Contextual Breadcrumb */}
        <div className="flex items-center gap-3 whitespace-nowrap shrink-0">
          <Link
            href="/"
            className="flex items-center gap-2 text-xs sm:text-sm font-medium text-slate-400 hover:text-white transition py-1 group"
          >
            <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-sky-500 to-indigo-600 p-[1px] shadow-sm flex items-center justify-center">
              <div className="w-full h-full bg-[#0a0d14] rounded-[6px] flex items-center justify-center">
                <Layers className="w-3.5 h-3.5 text-sky-400 group-hover:scale-105 transition-transform" />
              </div>
            </div>
            <span className="text-slate-300 font-semibold hidden sm:inline">Casper 👻</span>
          </Link>
          <span className="text-slate-600" aria-hidden="true">/</span>
          <div className="flex items-center gap-1.5 text-white font-semibold text-xs sm:text-sm">
            <Coins className="w-3.5 h-3.5 text-indigo-400" />
            <span>Token Costs Tracker</span>
          </div>
        </div>

        {/* Zone 2: Navigation Links */}
        <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-400">
          <Link href="/" className="hover:text-slate-200 transition-colors whitespace-nowrap shrink-0">
            Repositories &amp; Cartography
          </Link>
          <span className="text-slate-700" aria-hidden="true">&bull;</span>
          <span className="text-indigo-400 font-semibold whitespace-nowrap shrink-0">
            Token Costs Over Time &amp; Analytics
          </span>
          <span className="text-slate-700" aria-hidden="true">&bull;</span>
          <span className="hover:text-slate-200 transition-colors whitespace-nowrap shrink-0">
            Gemini 4 Argon &amp; Cascading Models
          </span>
        </nav>

        {/* Zone 3: Action Controls */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <PWAInstallButton />
          <Link
            href="/"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/[0.08] bg-slate-900/60 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-medium transition whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Repository Hub</span>
          </Link>
        </div>
      </div>
    </header>
  );
};
