'use client';

import React, { useState } from 'react';
import {
  FolderTree,
  Compass,
  X,
  Network,
  Coins,
} from 'lucide-react';
import { IngestionSnapshot } from '@/types';
import { buildNextJsCodeGraph, NextJsCodeGraph } from '@/lib/nextjs-code-graph';
import { formatCostUsd, calculateModelCost } from '@/lib/utils';
import { InspectorFileList, InspectorExcludes } from './InspectorFileList';
import { InspectorCodeGraph } from './InspectorCodeGraph';
import { InspectorUnixTrace } from './InspectorUnixTrace';

interface ContextInspectorProps {
  isOpen: boolean;
  onToggle: () => void;
  snapshot: IngestionSnapshot | null;
  excludedPatterns: string[];
  onUpdateExcludes: (patterns: string[]) => void;
}

// Drawer shell + tab controller. File search/lists live in
// InspectorFileList, the symbol graph in InspectorCodeGraph, and the Unix
// trace log in InspectorUnixTrace; this file keeps the header, tabs, the
// snapshot cost metrics bar, and section composition.
export const ContextInspector: React.FC<ContextInspectorProps> = ({
  isOpen,
  onToggle,
  snapshot,
  excludedPatterns,
  onUpdateExcludes,
}) => {
  const [activeTab, setActiveTab] = useState<'files' | 'graph'>('files');

  const files = snapshot?.files || [];

  const explorationTrail = snapshot?.explorationTrail || [];
  const toolTraces = (snapshot as any)?.toolTraces || [];
  const isAgentic = snapshot?.mode === 'agentic' || explorationTrail.length > 0 || toolTraces.length > 0;

  // Build code graph if files exist
  const codeGraph: NextJsCodeGraph | null = files.length > 0 ? buildNextJsCodeGraph(files) : null;
  const symbols = codeGraph ? Object.values(codeGraph.symbols) : [];

  return (
    <aside
      className={`fixed lg:static top-15 right-0 lg:right-auto bottom-0 z-30 transition-all duration-300 ease-in-out border-l lg:border-l-0 lg:border-r border-white/[0.08] bg-[#07090e]/95 lg:bg-[#07090e]/70 backdrop-blur-xl flex flex-col ${
        isOpen
          ? 'w-80 sm:w-96 translate-x-0'
          : 'w-0 -translate-x-full lg:translate-x-0 lg:w-0 overflow-hidden border-none'
      }`}
    >
      {/* Header */}
      <div className="p-4 border-b border-white/[0.08] flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isAgentic ? (
            <Compass className="w-4 h-4 text-indigo-400" />
          ) : (
            <FolderTree className="w-4 h-4 text-sky-400" />
          )}
          <h3 className="text-xs font-bold text-white tracking-wide">
            {isAgentic ? 'Agentic Unix VFS Inspector' : 'Context Inspector'}
          </h3>
        </div>
        <button
          onClick={onToggle}
          className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
          title="Collapse Drawer"
          aria-label="Collapse Context Inspector"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Tabs: Files vs Function Code Graph */}
      <div className="flex border-b border-white/[0.08] bg-slate-900/40 p-1 gap-1">
        <button
          onClick={() => setActiveTab('files')}
          className={`flex-1 py-1.5 px-3 text-xs font-medium rounded-md flex items-center justify-center gap-1.5 transition ${
            activeTab === 'files'
              ? 'bg-slate-800/90 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <FolderTree className="w-3.5 h-3.5" />
          <span>Files ({files.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('graph')}
          className={`flex-1 py-1.5 px-3 text-xs font-medium rounded-md flex items-center justify-center gap-1.5 transition ${
            activeTab === 'graph'
              ? 'bg-slate-800/90 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Network className="w-3.5 h-3.5" />
          <span>Call Graph ({symbols.length})</span>
        </button>
      </div>

      {/* Snapshot Metrics Bar */}
      <div className="p-4 bg-slate-900/60 border-b border-slate-800 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-400">Strategy:</span>
          <span className="font-mono font-semibold text-indigo-300">
            Graph-Aware Agentic VFS
          </span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-400">Targeted Files:</span>
          <span className="font-mono font-bold text-white">
            {snapshot ? snapshot.includedFilesCount : 0}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-400">Context Tokens:</span>
          <div className="text-right">
            <span className="font-mono font-bold text-violet-300">
              ~{snapshot ? snapshot.estimatedTokens.toLocaleString() : '0'} tokens
            </span>
            {snapshot?.outputTokens && snapshot.outputTokens > 0 && (
              <span className="block text-[10px] font-mono text-slate-500">
                Output: ~{snapshot.outputTokens.toLocaleString()} tokens
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-400">Commit SHA:</span>
          <span className="font-mono text-[11px] text-slate-300 truncate max-w-[140px]">
            {snapshot?.commitSha?.substring(0, 7) || 'None yet'}
          </span>
        </div>

        {/* Dynamic Cumulative API Cost Panel */}
        {(() => {
          const cost =
            snapshot?.costDetails ||
            (snapshot && snapshot.estimatedTokens > 0
              ? calculateModelCost(
                  'gemini-3.8-flash',
                  snapshot.estimatedTokens,
                  Math.max(500, Math.ceil(snapshot.charCount / 4))
                )
              : null);

          if (!cost) return null;

          return (
            <div className="mt-2.5 pt-2.5 border-t border-slate-800/80 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Coins className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Est. API Cost:</span>
                </span>
                <span className="font-mono font-bold text-emerald-300">
                  {formatCostUsd(cost.totalCostUsd)}
                </span>
              </div>

              {/* In/Out Breakdown */}
              <div className="p-2 rounded-lg bg-slate-950/80 border border-emerald-500/20 text-[10px] font-mono space-y-1">
                <div className="flex items-center justify-between text-slate-400">
                  <span>Input ({cost.inputTokens.toLocaleString()} tok):</span>
                  <span className="text-emerald-400 font-semibold">${cost.inputCostUsd.toFixed(6)}</span>
                </div>
                <div className="flex items-center justify-between text-slate-400">
                  <span>Output ({cost.outputTokens.toLocaleString()} tok):</span>
                  <span className="text-emerald-400 font-semibold">${cost.outputCostUsd.toFixed(6)}</span>
                </div>
                {(cost.cachedInputTokens ?? 0) > 0 && (
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="text-amber-400 font-medium">
                      Cached Input ({(cost.cachedInputTokens ?? 0).toLocaleString()} tok):
                    </span>
                    <span className="text-amber-300 font-semibold">
                      ${(cost.cachedInputCostUsd ?? 0).toFixed(6)}
                    </span>
                  </div>
                )}
                <div className="pt-1 border-t border-slate-800 flex items-center justify-between text-slate-300 text-[10px]">
                  <span>Tier:</span>
                  <span className="text-indigo-300 font-sans">{cost.modelName}</span>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Local Agent Unix Trace Collapsible Drawer */}
      <InspectorUnixTrace toolTraces={toolTraces} />

      {/* Exclude Patterns Section */}
      <InspectorExcludes excludedPatterns={excludedPatterns} onUpdateExcludes={onUpdateExcludes} />

      {/* Main Tab Content */}
      <div className="flex-1 min-h-0 flex flex-col p-4">
        {activeTab === 'files' ? (
          <InspectorFileList files={files} snapshot={snapshot} />
        ) : (
          <InspectorCodeGraph symbols={symbols} snapshot={snapshot} />
        )}
      </div>
    </aside>
  );
};
