'use client';

import React from 'react';
import Link from 'next/link';
import { Layers, Settings, Plus, ArrowLeft, TrendingUp } from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';
import { Repo } from '@/types';

interface HeaderProps {
  activeRepo: Repo | null;
  onBackToGrid: () => void;
  onOpenAddModal: () => void;
  onOpenSettings: () => void;
  hasPat: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  activeRepo,
  onBackToGrid,
  onOpenAddModal,
  onOpenSettings,
  hasPat,
}) => {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/[0.08] bg-[#07090e]/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-15 flex items-center justify-between gap-8">
        {/* Zone 1: Brand title, one line / Contextual Breadcrumb */}
        <div className="flex items-center gap-3 whitespace-nowrap shrink-0">
          {activeRepo ? (
            <div className="flex items-center gap-2 text-xs sm:text-sm font-medium">
              <button
                onClick={onBackToGrid}
                className="group flex items-center gap-1.5 text-slate-400 hover:text-white transition py-1"
                title="Return to repositories"
              >
                <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
                <span className="hidden sm:inline">Repositories</span>
              </button>
              <span className="text-slate-600" aria-hidden="true">/</span>
              <span className="text-slate-400 font-mono">{activeRepo.owner}</span>
              <span className="text-slate-600" aria-hidden="true">/</span>
              <span className="text-white font-mono font-semibold">{activeRepo.repo}</span>
            </div>
          ) : (
            <button
              onClick={onBackToGrid}
              className="flex items-center gap-2.5 text-left group transition"
            >
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-sky-500 to-indigo-600 p-[1px] shadow-sm flex items-center justify-center">
                <div className="w-full h-full bg-[#0a0d14] rounded-[7px] flex items-center justify-center">
                  <Layers className="w-4 h-4 text-sky-400 group-hover:scale-105 transition-transform" />
                </div>
              </div>
              <span className="text-base font-bold tracking-tight text-white">
                Next.js <span className="bg-gradient-to-r from-sky-400 to-indigo-400 bg-clip-text text-transparent">Expert</span>
              </span>
            </button>
          )}
        </div>

        {/* Zone 2: Navigation Links / Architecture capabilities */}
        <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-400">
          <span className="hover:text-slate-200 transition-colors whitespace-nowrap shrink-0">
            App Router Cartography
          </span>
          <span className="text-slate-700" aria-hidden="true">&bull;</span>
          <span className="hover:text-slate-200 transition-colors whitespace-nowrap shrink-0">
            Server Component Graph
          </span>
          <span className="text-slate-700" aria-hidden="true">&bull;</span>
          <span className="hover:text-slate-200 transition-colors whitespace-nowrap shrink-0">
            In-Memory Unix VFS
          </span>
          <span className="text-slate-700" aria-hidden="true">&bull;</span>
          <span className="hover:text-slate-200 transition-colors whitespace-nowrap shrink-0">
            Gemini 4 Argon
          </span>
        </nav>

        {/* Zone 3: Action Controls */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <Link
            href="/finance"
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg border border-white/[0.08] bg-slate-900/60 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-medium transition whitespace-nowrap shrink-0"
            title="Open Financial Tracker & Spending Analytics"
          >
            <TrendingUp className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden sm:inline">Finances</span>
          </Link>

          <PWAInstallButton />

          <button
            onClick={onOpenSettings}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg border text-xs font-medium transition whitespace-nowrap shrink-0 ${
              hasPat
                ? 'border-white/[0.08] bg-slate-900/60 text-slate-300 hover:text-white hover:border-white/20'
                : 'border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20'
            }`}
            title="Configure GitHub PAT & Gemini Model Settings"
            aria-label="Settings"
          >
            <Settings className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Settings</span>
          </button>

          {!activeRepo && (
            <button
              onClick={onOpenAddModal}
              className="flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm hover:shadow-indigo-500/25 active:scale-95 transition whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Repo</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
