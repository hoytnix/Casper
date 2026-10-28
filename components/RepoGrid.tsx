'use client';

import React, { useState } from 'react';
import { Search, Plus, Sparkles, FolderGit2, Zap, ShieldCheck, ArrowRight, Layers, Cpu, Server, Layout } from 'lucide-react';
import { Repo } from '@/types';
import { RepoCard } from './RepoCard';

interface RepoGridProps {
  repos: Repo[];
  onOpenRepo: (repoId: string) => void;
  onDeleteRepo: (repoId: string) => void;
  onOpenAddModal: () => void;
}

export const RepoGrid: React.FC<RepoGridProps> = ({
  repos,
  onOpenRepo,
  onDeleteRepo,
  onOpenAddModal,
}) => {
  const [search, setSearch] = useState('');

  const filteredRepos = repos.filter(
    (r) =>
      r.owner.toLowerCase().includes(search.toLowerCase()) ||
      r.repo.toLowerCase().includes(search.toLowerCase()) ||
      (r.description && r.description.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-8">
      {/* Hero Banner: 2-Column Split Architecture Spotlight */}
      <div className="relative rounded-3xl overflow-hidden glass-panel p-6 sm:p-10 border border-white/[0.08] bg-gradient-to-b from-[#0c101c] via-[#090d17] to-[#07090e]">
        {/* Subtle Ambient Radial Lighting */}
        <div className="absolute top-0 right-1/4 -mt-24 w-96 h-96 rounded-full bg-sky-500/[0.07] blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-10 -mb-20 w-80 h-80 rounded-full bg-indigo-600/[0.07] blur-3xl pointer-events-none" />

        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Left Column: Headline, Narrative & Unboxed Metadata */}
          <div className="lg:col-span-7 space-y-5">
            {/* 1-Line Quiet Kicker (Zero-Pill Discipline) */}
            <div className="flex items-center gap-2 text-xs font-semibold text-sky-400">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Next.js Full-Stack Architecture Cartography</span>
              <span className="text-slate-600" aria-hidden="true">&bull;</span>
              <span className="text-slate-400">App Router &middot; RSC &middot; Unix VFS</span>
            </div>

            <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight text-balance">
              Compile Bulletproof Next.js Architecture Prompts with{' '}
              <span className="bg-gradient-to-r from-sky-400 via-indigo-300 to-indigo-400 bg-clip-text text-transparent">
                Casper 👻
              </span>
            </h2>

            <p className="text-slate-400 text-sm leading-relaxed max-w-xl">
              Connect any Next.js repository. Casper the friendly ghost reads all ur code lol — inspecting your App Router structure, Server/Client Component boundaries, Server Actions, and Route Handlers with zero CORS friction, leveraging in-memory Unix VFS tools and Gemini 4 Argon to compile high-precision prompts for autonomous coding agents.
            </p>

            {/* Unboxed Metadata Strip (Zero-Pill Discipline with Typographic Separators) */}
            <div className="pt-2 flex flex-wrap items-center gap-2 sm:gap-3 text-xs text-slate-400">
              <span className="inline-flex items-center gap-1.5 text-slate-300 font-medium">
                <FolderGit2 className="w-3.5 h-3.5 text-sky-400" />
                <span className="font-mono tabular-nums">{repos.length}</span> Repositories Tracked
              </span>
              <span className="text-slate-600" aria-hidden="true">&bull;</span>
              <span className="inline-flex items-center gap-1.5 text-slate-300 font-medium">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                App Router &amp; RSC Aware
              </span>
              <span className="text-slate-600" aria-hidden="true">&bull;</span>
              <span className="inline-flex items-center gap-1.5 text-slate-300 font-medium">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                Gemini 4 Argon &amp; Cascading Waterfall
              </span>
            </div>
          </div>

          {/* Right Column: Architectural Monolith Interactive Visualization */}
          <div className="lg:col-span-5 relative flex items-center justify-center">
            <div className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-[#0b0f1a]/80 p-5 shadow-2xl relative overflow-hidden">
              {/* Monolith Schematic Header */}
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-white/[0.06] text-xs">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-sky-400" />
                  <span className="font-bold text-white tracking-wide">App Cartography Engine</span>
                </div>
                <span className="font-mono text-[11px] text-emerald-400 tabular-nums">Live Inspection</span>
              </div>

              {/* Stack Architecture Blueprint Layers */}
              <div className="space-y-2.5 text-xs font-mono">
                {/* Layer 1: App Router Root */}
                <div className="p-3 rounded-xl bg-slate-900/70 border border-white/[0.06] flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-2 h-2 rounded-sm bg-sky-400" />
                    <span className="text-slate-200">app/layout.tsx</span>
                  </div>
                  <span className="text-[11px] text-sky-400 font-medium">Root Layout (RSC)</span>
                </div>

                {/* Layer 2: Server Actions */}
                <div className="p-3 rounded-xl bg-slate-900/70 border border-white/[0.06] flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-2 h-2 rounded-sm bg-indigo-400" />
                    <span className="text-slate-200">actions/*.ts</span>
                  </div>
                  <span className="text-[11px] text-indigo-400 font-medium">&apos;use server&apos; Actions</span>
                </div>

                {/* Layer 3: Route Handlers */}
                <div className="p-3 rounded-xl bg-slate-900/70 border border-white/[0.06] flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-2 h-2 rounded-sm bg-emerald-400" />
                    <span className="text-slate-200">app/api/*/route.ts</span>
                  </div>
                  <span className="text-[11px] text-emerald-400 font-medium">HTTP Endpoints</span>
                </div>

                {/* Layer 4: Client Island */}
                <div className="p-3 rounded-xl bg-slate-900/70 border border-white/[0.06] flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-2 h-2 rounded-sm bg-amber-400" />
                    <span className="text-slate-200">components/*</span>
                  </div>
                  <span className="text-[11px] text-amber-400 font-medium">&apos;use client&apos; Leaf Nodes</span>
                </div>
              </div>

              {/* Monolith Telemetry Footnote */}
              <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-slate-400">
                <span>In-Memory Unix Tools: grep &middot; find &middot; call-graph</span>
                <span className="text-sky-400 font-medium">Zero CORS</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Search and Action Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search repositories by name, owner, or description..."
            className="w-full pl-10 pr-12 py-2.5 rounded-xl bg-slate-900/70 border border-white/[0.08] focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-xs font-mono text-slate-200 placeholder:text-slate-500 outline-none transition"
          />
          <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-500 font-mono bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-700/60">
            /
          </kbd>
        </div>

        <button
          onClick={onOpenAddModal}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm hover:shadow-indigo-500/20 active:scale-95 transition"
        >
          <Plus className="w-4 h-4" />
          <span>Connect Repository</span>
        </button>
      </div>

      {/* Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredRepos.map((repo) => (
          <RepoCard
            key={repo.id}
            repo={repo}
            onOpen={onOpenRepo}
            onDelete={onDeleteRepo}
          />
        ))}

        {/* Add New Repo Tile */}
        <button
          onClick={onOpenAddModal}
          className="rounded-2xl border-2 border-dashed border-white/[0.08] hover:border-indigo-500/50 bg-[#080c14]/40 hover:bg-slate-900/30 p-6 flex flex-col items-center justify-center text-center gap-3 transition-all duration-200 min-h-[220px] group cursor-pointer"
        >
          <div className="w-12 h-12 rounded-xl bg-indigo-500/10 group-hover:bg-indigo-500/20 text-indigo-400 flex items-center justify-center transition-colors">
            <Plus className="w-6 h-6 group-hover:scale-110 transition-transform" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-200 group-hover:text-white">
              Connect Repository
            </h4>
            <p className="text-xs text-slate-500 mt-1 max-w-[240px]">
              Provide any public GitHub repo (Next.js, Hono, or Vite) or private repository with PAT.
            </p>
          </div>
        </button>
      </div>

      {filteredRepos.length === 0 && search && (
        <div className="p-12 text-center glass-panel rounded-2xl border border-white/[0.08]">
          <p className="text-sm text-slate-400">No repositories found matching &quot;{search}&quot;.</p>
        </div>
      )}
    </div>
  );
};
