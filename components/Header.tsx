'use client';

import React from 'react';
import { Layers, Settings, Plus, ArrowLeft, Coins } from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';
import { Repo } from '@/types';

interface HeaderProps {
  activeRepo: Repo | null;
  onBackToGrid: () => void;
  onOpenAddModal: () => void;
  onOpenSettings: () => void;
  onOpenCashier: () => void;
  hasPat: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  activeRepo,
  onBackToGrid,
  onOpenAddModal,
  onOpenSettings,
  onOpenCashier,
  hasPat,
}) => {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        {/* Brand / Navigation */}
        <div className="flex items-center gap-3">
          {activeRepo ? (
            <button
              onClick={onBackToGrid}
              className="group flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900/60 hover:bg-slate-800 text-slate-300 hover:text-white transition text-xs font-medium"
            >
              <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
              <span>Back to Repos</span>
            </button>
          ) : (
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-500 via-indigo-500 to-violet-500 p-0.5 shadow-lg shadow-indigo-500/20 flex items-center justify-center">
                <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                  <Layers className="w-4 h-4 text-sky-400" />
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-sm sm:text-base font-bold tracking-tight text-white flex items-center gap-1.5">
                    Next.js <span className="bg-gradient-to-r from-sky-400 to-indigo-400 bg-clip-text text-transparent font-semibold">Expert</span>
                  </h1>
                  <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">
                    App Router &bull; RSC &bull; Actions
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 hidden sm:block">
                  AI-Powered Next.js Architecture &amp; Context Compiler
                </p>
              </div>
            </div>
          )}

          {activeRepo && (
            <div className="flex items-center gap-2">
              <div className="h-4 w-px bg-slate-800" />
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-slate-400 font-mono">{activeRepo.owner}/</span>
                <span className="text-white font-mono font-semibold">{activeRepo.repo}</span>
              </div>
            </div>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          <PWAInstallButton />

          <button
            onClick={onOpenCashier}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-xs font-medium transition"
            title="NOW Payments Cashier & Gateway"
          >
            <Coins className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Cashier</span>
          </button>

          <button
            onClick={onOpenSettings}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
              hasPat
                ? 'border-slate-800 bg-slate-900/60 text-slate-300 hover:text-white hover:border-slate-700'
                : 'border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20'
            }`}
            title="Configure GitHub PAT & Gemini Model Settings"
          >
            <Settings className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Settings</span>
            {!hasPat && (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            )}
          </button>

          {!activeRepo && (
            <button
              onClick={onOpenAddModal}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-medium shadow-md shadow-indigo-600/30 active:scale-95 transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Repository</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
