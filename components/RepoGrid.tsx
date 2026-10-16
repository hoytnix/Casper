'use client';

import React, { useState } from 'react';
import { Search, Plus, Sparkles, FolderGit2, Zap, ShieldCheck } from 'lucide-react';
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
    <div className="space-y-6">
      {/* Hero Banner / Bento Header */}
      <div className="relative rounded-3xl overflow-hidden glass-panel p-6 sm:p-8 border border-slate-800/80 bg-gradient-to-b from-slate-900/60 to-slate-950/80">
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-80 h-80 rounded-full bg-indigo-600/10 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 -mb-20 w-60 h-60 rounded-full bg-violet-600/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-3xl space-y-4">
          <div className="inline-flex items-center gap-2 text-sky-400 text-xs font-medium">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Next.js Full-Stack Architecture Cartography</span>
          </div>

          <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Compile Bulletproof Next.js Architecture Prompts with <span className="bg-gradient-to-r from-sky-400 via-indigo-400 to-violet-400 bg-clip-text text-transparent">Next.js Expert</span>
          </h2>

          <p className="text-slate-400 text-xs sm:text-sm leading-relaxed">
            Connect any Next.js repository. Next.js Expert indexes your App Router conventions, Server/Client Component boundaries, Server Actions, and Route Handlers with zero CORS friction—leveraging an in-browser local AI context router (Chrome Gemini Nano &amp; Snowflake Arctic-Embed-XS) for near-instant prefilled prompts.
          </p>

          {/* Quick Metrics Bar */}
          <div className="pt-2 flex flex-wrap items-center gap-4 text-xs text-slate-400 font-mono">
            <div className="flex items-center gap-1.5 bg-slate-900/80 px-3 py-1.5 rounded-lg border border-slate-800">
              <FolderGit2 className="w-3.5 h-3.5 text-sky-400" />
              <span>{repos.length} Repositories Tracked</span>
            </div>

            <div className="flex items-center gap-1.5 bg-slate-900/80 px-3 py-1.5 rounded-lg border border-slate-800">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>App Router &amp; RSC Aware</span>
            </div>

            <div className="flex items-center gap-1.5 bg-slate-900/80 px-3 py-1.5 rounded-lg border border-slate-800">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Local AI Router (Nano + Arctic)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Search and Filter Controls */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search repositories..."
            className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-slate-900/70 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-xs font-mono text-slate-200 placeholder:text-slate-500 outline-none transition"
          />
        </div>

        <button
          onClick={onOpenAddModal}
          className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 active:scale-95 transition"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Repository</span>
        </button>
      </div>

      {/* Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
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
          className="rounded-2xl border-2 border-dashed border-slate-800/80 hover:border-indigo-500/50 bg-slate-950/40 hover:bg-slate-900/30 p-6 flex flex-col items-center justify-center text-center gap-3 transition-all duration-200 min-h-[220px] group"
        >
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 group-hover:bg-indigo-500/20 text-indigo-400 flex items-center justify-center transition-colors">
            <Plus className="w-6 h-6 group-hover:scale-110 transition-transform" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-200 group-hover:text-white">
              Connect Next.js Repository
            </h4>
            <p className="text-xs text-slate-500 mt-1 max-w-[220px]">
              Provide any public GitHub Next.js repo or private repository with PAT.
            </p>
          </div>
        </button>
      </div>

      {filteredRepos.length === 0 && search && (
        <div className="p-8 text-center glass-panel rounded-2xl border border-slate-800">
          <p className="text-sm text-slate-400">No repositories found matching &quot;{search}&quot;.</p>
        </div>
      )}
    </div>
  );
};
