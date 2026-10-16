'use client';

import React from 'react';
import { GitBranch, Star, Trash2, ArrowUpRight, Clock, Lock, Globe, Terminal } from 'lucide-react';
import { Repo } from '@/types';

interface RepoCardProps {
  repo: Repo;
  onOpen: (repoId: string) => void;
  onDelete: (repoId: string) => void;
}

export const RepoCard: React.FC<RepoCardProps> = ({ repo, onOpen, onDelete }) => {
  const formatTime = (ts: number | null) => {
    if (!ts) return 'Never compiled';
    return new Date(ts).toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="group relative rounded-2xl glass-panel p-5 flex flex-col justify-between transition-all duration-300 hover:border-indigo-500/50 hover:shadow-xl hover:shadow-indigo-500/10">
      {/* Glow on hover */}
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-indigo-500/5 via-transparent to-violet-500/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

      {/* Top Details */}
      <div className="space-y-3 relative z-10">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs text-slate-400 font-mono">{repo.owner}/</span>
              <h3 className="text-sm font-bold text-white font-mono truncate">{repo.repo}</h3>
              {repo.isPrivate ? (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <Lock className="w-2.5 h-2.5" /> Private
                </span>
              ) : (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-300 border border-slate-700/60">
                  <Globe className="w-2.5 h-2.5 text-slate-400" /> Public
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 line-clamp-2 mt-1.5 leading-relaxed">
              {repo.description || 'No repository description available.'}
            </p>
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              if (confirm(`Remove "${repo.owner}/${repo.repo}" from saved repositories?`)) {
                onDelete(repo.id);
              }
            }}
            className="text-slate-500 hover:text-rose-400 p-1.5 rounded-lg hover:bg-rose-500/10 transition opacity-0 group-hover:opacity-100"
            title="Delete repository"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Badges / Metrics */}
        <div className="flex items-center gap-3 text-[11px] text-slate-400">
          <div className="flex items-center gap-1 font-mono text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded-md border border-indigo-500/20">
            <GitBranch className="w-3 h-3 text-indigo-400" />
            <span>{repo.branch || repo.defaultBranch}</span>
          </div>

          <div className="flex items-center gap-1">
            <Star className="w-3 h-3 text-amber-400 fill-amber-400/20" />
            <span>{repo.stars.toLocaleString()}</span>
          </div>

          <div className="flex items-center gap-1 ml-auto text-slate-500">
            <Clock className="w-3 h-3" />
            <span>{formatTime(repo.lastSyncedAt)}</span>
          </div>
        </div>
      </div>

      {/* Bottom CTA */}
      <div className="mt-5 pt-4 border-t border-slate-800/80 flex items-center justify-between relative z-10">
        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-mono">
          <Terminal className="w-3 h-3 text-sky-400" />
          <span>Next.js Target</span>
        </div>

        <button
          onClick={() => onOpen(repo.id)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 group-hover:bg-indigo-600 text-slate-200 group-hover:text-white text-xs font-semibold border border-slate-800 group-hover:border-indigo-500 transition-all shadow-sm"
        >
          <span>Open Compiler</span>
          <ArrowUpRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </button>
      </div>
    </div>
  );
};
