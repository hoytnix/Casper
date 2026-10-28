'use client';

import React from 'react';
import {
  GitBranch,
  FolderTree,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Compass,
  Cpu,
  Layers,
  Coins,
  Sparkles,
  HelpCircle,
  Zap,
} from 'lucide-react';
import type {
  DetectedFramework,
  IngestionMode,
  IngestionProgress,
  IngestionSnapshot,
  Repo,
} from '@/types';
import { frameworkBadgeLabel } from '@/lib/framework-detector';
import { formatCostUsd } from '@/lib/utils';
import type { DeltaStatus } from '@/hooks/useRepoDeltaSync';

export interface WorkspaceHeaderProps {
  repo: Repo;
  branches: string[];
  isBranchLoading: boolean;
  detectedFramework: DetectedFramework;
  snapshot: IngestionSnapshot | null;
  deltaStatus: DeltaStatus;
  mode: IngestionMode;
  progress: IngestionProgress;
  isDrawerOpen: boolean;
  onToggleDrawer: () => void;
  onBranchChange: (newBranch: string) => void;
  onToggleMode: (newMode: IngestionMode) => void;
  localJudgeLabel?: string;
}

// Workspace sub-header shell, extracted verbatim from RepoWorkspace:
// hamburger inspector toggle, repo + branch picker, framework badge,
// delta-cache status, mode switcher, snapshot cost pill, status badge.
export const WorkspaceHeader: React.FC<WorkspaceHeaderProps> = ({
  repo,
  branches,
  isBranchLoading,
  detectedFramework,
  snapshot,
  deltaStatus,
  mode,
  progress,
  isDrawerOpen,
  onToggleDrawer,
  onBranchChange,
  onToggleMode,
  localJudgeLabel,
}) => {
  const getStatusBadge = () => {
    switch (progress.step) {
      case 'fetching_tree':
      case 'downloading_files':
        return (
          <div className="flex items-center gap-1.5 text-sky-400 text-xs font-medium">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Fetching repo tree...</span>
          </div>
        );
      case 'agentic_exploring':
        return (
          <div className="flex items-center gap-1.5 text-indigo-300 text-xs font-medium">
            <Compass className="w-3.5 h-3.5 animate-spin" />
            <span>Exploring (Round {progress.currentRound || 1})...</span>
          </div>
        );
      case 'compiling_prompt':
        return (
          <div className="flex items-center gap-1.5 text-violet-300 text-xs font-medium">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Compiling prompt...</span>
          </div>
        );
      case 'error':
        return (
          <div className="flex items-center gap-1.5 text-rose-400 text-xs font-medium">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Failed</span>
          </div>
        );
      default:
        return (
          <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-medium">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Ready</span>
          </div>
        );
    }
  };

  return (
    <div className="h-13 border-b border-white/[0.08] bg-[#07090e]/70 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between gap-4 flex-wrap">
      {/* Left Zone: Hamburger Context Inspector Toggle + Repo & Branch Info */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleDrawer}
          className={`flex items-center justify-center p-2 rounded-lg border text-xs font-medium transition cursor-pointer ${
            isDrawerOpen
              ? 'bg-indigo-600/20 border-indigo-500/30 text-indigo-300'
              : 'bg-slate-900 border-white/[0.08] text-slate-400 hover:text-white hover:border-white/20'
          }`}
          title="Toggle Context Inspector"
          aria-label="Toggle Context Inspector Drawer"
        >
          <FolderTree className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2 text-xs">
          <span className="font-mono text-slate-400">{repo.owner}/</span>
          <span className="font-mono font-bold text-white text-sm">{repo.repo}</span>
          <a
            href={`https://github.com/${repo.owner}/${repo.repo}`}
            target="_blank"
            rel="noreferrer"
            className="text-slate-500 hover:text-indigo-400 transition ml-0.5"
            title="Open on GitHub"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        {/* Detected Framework Badge */}
        {detectedFramework !== 'unknown' && (
          <span
            className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-mono font-semibold ${
              detectedFramework === 'hono'
                ? 'bg-orange-950/40 border-orange-500/25 text-orange-300'
                : 'bg-indigo-950/40 border-indigo-500/25 text-indigo-300'
            }`}
            title={`Detected framework: ${frameworkBadgeLabel(detectedFramework)}`}
          >
            <Layers className="w-3 h-3" />
            {frameworkBadgeLabel(detectedFramework)}
          </span>
        )}

        <span className="text-slate-700" aria-hidden="true">|</span>

        {/* Active local judge label */}
        {localJudgeLabel && (
          <span
            className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-950/40 border border-emerald-500/25 text-emerald-300 text-xs font-mono font-semibold"
            title="Active local relevance judge (int4, short context)"
          >
            <Cpu className="w-3 h-3 text-emerald-400" />
            {localJudgeLabel}
          </span>
        )}

        {/* Branch Picker */}
        <div className="relative flex items-center">
          <GitBranch className="w-3.5 h-3.5 text-indigo-400 mr-1.5" />
          <select
            value={repo.branch}
            onChange={(e) => onBranchChange(e.target.value)}
            disabled={isBranchLoading}
            className="bg-slate-900 border border-white/[0.08] hover:border-white/20 text-slate-200 text-xs font-mono rounded-lg px-2.5 py-1 outline-none focus:border-indigo-500 transition cursor-pointer"
          >
            {branches.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>

        {/* AST-Aware Incremental Delta Cache Status */}
        <div
          className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900/90 border border-white/[0.08] text-xs font-mono"
          title={
            snapshot?.commitSha
              ? `IndexedDB Snapshot Commit SHA: ${snapshot.commitSha}\nCached Files in VFS: ${snapshot.files?.length || 0}`
              : 'No cached snapshot in IndexedDB yet'
          }
        >
          <Zap className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-slate-400">Delta Cache:</span>
          {deltaStatus === 'cached' && snapshot?.commitSha ? (
            <span className="text-emerald-400 font-semibold flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              {snapshot.commitSha.slice(0, 7)}
            </span>
          ) : deltaStatus === 'syncing' ? (
            <span className="text-sky-400 flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              Syncing...
            </span>
          ) : deltaStatus === 'checking' ? (
            <span className="text-slate-400 flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              Checking...
            </span>
          ) : snapshot?.commitSha ? (
            <span className="text-slate-300">{snapshot.commitSha.slice(0, 7)}</span>
          ) : (
            <span className="text-slate-500">Uncached</span>
          )}
        </div>
      </div>

      {/* Right Zone: Mode Switcher, Cost Badges & Status */}
      <div className="flex items-center gap-3">
        {/* Mode Switcher Segmented Control */}
        <div className="flex items-center bg-slate-900/90 border border-white/[0.08] rounded-lg p-0.5 text-xs overflow-x-auto">
          <button
            type="button"
            onClick={() => onToggleMode('agentic')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition whitespace-nowrap ${
              mode === 'agentic'
                ? 'bg-indigo-600 text-white font-medium shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Prompt: Agentic Sequential Exploration & Compilation"
          >
            <Compass className="w-3 h-3" />
            <span>Prompt</span>
          </button>
          <button
            type="button"
            onClick={() => onToggleMode('idea')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition whitespace-nowrap ${
              mode === 'idea'
                ? 'bg-amber-600 text-white font-medium shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Ideas: Generates 77 ideas ranked by RICE & VRIN-EO"
          >
            <Sparkles className="w-3 h-3" />
            <span>Ideas</span>
          </button>
          <button
            type="button"
            onClick={() => onToggleMode('btw')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition whitespace-nowrap ${
              mode === 'btw'
                ? 'bg-emerald-600 text-white font-medium shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="BTW: Direct conversational codebase answers with @[/path] citations"
          >
            <HelpCircle className="w-3 h-3" />
            <span>BTW</span>
          </button>
        </div>

        {/* Dynamic API Cost Indicator */}
        {snapshot?.costDetails && (
          <div
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-950/40 border border-emerald-500/20 text-emerald-300 font-mono text-xs shadow-sm cursor-help"
            title={`Latest Snapshot API Cost: ${formatCostUsd(snapshot.costDetails.totalCostUsd)}\n• Model: ${snapshot.costDetails.modelName}\n• Input: ${snapshot.costDetails.inputTokens.toLocaleString()} tokens ($${snapshot.costDetails.inputCostUsd.toFixed(6)})\n• Output: ${snapshot.costDetails.outputTokens.toLocaleString()} tokens ($${snapshot.costDetails.outputCostUsd.toFixed(6)})${(snapshot.costDetails.cachedInputTokens ?? 0) > 0 ? `\n• Cached input: ${(snapshot.costDetails.cachedInputTokens ?? 0).toLocaleString()} tokens ($${(snapshot.costDetails.cachedInputCostUsd ?? 0).toFixed(6)})` : ''}`}
          >
            <Coins className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
            <span className="font-semibold text-emerald-300 tabular-nums">
              {formatCostUsd(snapshot.costDetails.totalCostUsd)}
            </span>
          </div>
        )}

        {getStatusBadge()}
      </div>
    </div>
  );
};
