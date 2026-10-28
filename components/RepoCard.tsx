'use client';

import React from 'react';
import { GitBranch, Star, Trash2, ArrowUpRight, Clock, Lock, Globe, Layers } from 'lucide-react';
import { Repo } from '@/types';
import { frameworkBadgeLabel } from '@/lib/framework-detector';

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
    <div className="group relative rounded-2xl glass-panel p-5 sm:p-6 flex flex-col justify-between transition-all duration-200 hover:border-indigo-500/40 hover:bg-slate-900/40 hover:shadow-xl hover:shadow-indigo-500/5">
      {/* Top Details */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {/* Unboxed Status & Branch Header (Zero-Pill Discipline) */}
            <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
              <span className="font-mono text-slate-400">{repo.owner}</span>
              <span className="text-slate-600" aria-hidden="true">/</span>
              <span className="inline-flex items-center gap-1 font-mono text-indigo-300">
                <GitBranch className="w-3 h-3 text-indigo-400" />
                <span>{repo.branch || repo.defaultBranch}</span>
              </span>
              <span className="text-slate-600" aria-hidden="true">&bull;</span>
              <span className="text-slate-400 inline-flex items-center gap-1">
                {repo.isPrivate ? (
                  <>
                    <Lock className="w-2.5 h-2.5 text-amber-400" />
                    <span>Private</span>
                  </>
                ) : (
                  <>
                    <Globe className="w-2.5 h-2.5 text-slate-500" />
                    <span>Public</span>
                  </>
                )}
              </span>
            </div>

            <h3 className="text-base font-bold text-white font-mono tracking-tight truncate group-hover:text-indigo-200 transition-colors">
              {repo.repo}
            </h3>

            <p className="text-xs text-slate-400 line-clamp-2 mt-2 leading-relaxed">
              {repo.description || 'Repository ready for architectural compilation and prompt generation.'}
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
            aria-label={`Delete ${repo.owner}/${repo.repo}`}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        {/* Unboxed Metadata & Stars */}
        <div className="flex items-center gap-2 text-xs text-slate-400 pt-1">
          <div className="flex items-center gap-1">
            <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400/20" />
            <span className="font-mono tabular-nums">{repo.stars.toLocaleString()}</span>
          </div>

          <span className="text-slate-700" aria-hidden="true">&bull;</span>

          <div className="flex items-center gap-1 text-slate-500 text-[11px]">
            <Clock className="w-3 h-3" />
            <span>{formatTime(repo.lastSyncedAt)}</span>
          </div>
        </div>
      </div>

      {/* Bottom Action Strip */}
      <div className="mt-5 pt-4 border-t border-white/[0.06] flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <Layers className="w-3.5 h-3.5 text-sky-400" />
          <span className="font-medium text-slate-300">{repo.detectedFramework ? frameworkBadgeLabel(repo.detectedFramework) : 'Multi-Framework'}</span>
        </div>

        <button
          onClick={() => onOpen(repo.id)}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-slate-900 group-hover:bg-indigo-600 text-slate-200 group-hover:text-white text-xs font-semibold border border-white/[0.08] group-hover:border-indigo-500 transition-all shadow-sm active:scale-95"
        >
          <span>Open Compiler</span>
          <ArrowUpRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </button>
      </div>
    </div>
  );
};
