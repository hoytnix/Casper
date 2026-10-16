'use client';

import React, { useState } from 'react';
import {
  FolderTree,
  FileCode,
  Search,
  Filter,
  Plus,
  X,
  FileText,
  FileJson,
  Hash,
  Compass,
  CheckCircle2,
  Terminal,
  ChevronDown,
  Network,
  Cpu,
  Layers,
  Coins,
  Receipt,
} from 'lucide-react';
import { IngestionSnapshot, RouterToolTrace } from '@/types';
import { buildNextJsCodeGraph, NextJsCodeGraph } from '@/lib/nextjs-code-graph';
import { formatCostUsd, calculateModelCost } from '@/lib/utils';

interface ContextInspectorProps {
  isOpen: boolean;
  onToggle: () => void;
  snapshot: IngestionSnapshot | null;
  excludedPatterns: string[];
  onUpdateExcludes: (patterns: string[]) => void;
}

export const ContextInspector: React.FC<ContextInspectorProps> = ({
  isOpen,
  onToggle,
  snapshot,
  excludedPatterns,
  onUpdateExcludes,
}) => {
  const [activeTab, setActiveTab] = useState<'files' | 'graph'>('files');
  const [fileFilter, setFileFilter] = useState('');
  const [graphFilter, setGraphFilter] = useState('');
  const [newExcludeInput, setNewExcludeInput] = useState('');
  const [isUnixTraceOpen, setIsUnixTraceOpen] = useState(true);

  const COMMON_EXCLUDES = [
    'test/',
    'tests/',
    'docs/',
    'examples/',
    '*.spec.ts',
    '*.test.tsx',
    '*.md',
    '*.stories.tsx',
  ];

  const handleAddExclude = (pattern: string) => {
    const trimmed = pattern.trim();
    if (!trimmed || excludedPatterns.includes(trimmed)) return;
    onUpdateExcludes([...excludedPatterns, trimmed]);
    setNewExcludeInput('');
  };

  const handleRemoveExclude = (pattern: string) => {
    onUpdateExcludes(excludedPatterns.filter((p) => p !== pattern));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    const kb = (bytes / 1024).toFixed(1);
    return `${kb} KB`;
  };

  const getFileIcon = (path: string) => {
    if (path.endsWith('.ts') || path.endsWith('.tsx') || path.endsWith('.js') || path.endsWith('.jsx')) {
      return <FileCode className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />;
    }
    if (path.endsWith('.json')) {
      return <FileJson className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />;
    }
    if (path.endsWith('.css') || path.endsWith('.scss')) {
      return <Hash className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />;
    }
    return <FileText className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />;
  };

  const files = snapshot?.files || [];
  const filteredFiles = files.filter((f) =>
    f.path.toLowerCase().includes(fileFilter.toLowerCase())
  );

  const explorationTrail = snapshot?.explorationTrail || [];
  const toolTraces = (snapshot as any)?.toolTraces || [];
  const isAgentic = snapshot?.mode === 'agentic' || explorationTrail.length > 0 || toolTraces.length > 0;

  // Build code graph if files exist
  const codeGraph: NextJsCodeGraph | null = files.length > 0 ? buildNextJsCodeGraph(files) : null;
  const symbols = codeGraph ? Object.values(codeGraph.symbols) : [];
  const filteredSymbols = symbols.filter(
    (s) =>
      s.name.toLowerCase().includes(graphFilter.toLowerCase()) ||
      s.filePath.toLowerCase().includes(graphFilter.toLowerCase())
  );

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
            {isAgentic ? 'Graph-Aware Unix VFS' : 'Full Ingestion'}
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
      {toolTraces.length > 0 && (
        <div className="border-b border-slate-800 bg-slate-900/40">
          <button
            type="button"
            onClick={() => setIsUnixTraceOpen(!isUnixTraceOpen)}
            className="w-full p-3 flex items-center justify-between text-left hover:bg-slate-800/50 transition text-xs"
          >
            <div className="flex items-center gap-2 font-semibold text-indigo-300">
              <Terminal className="w-3.5 h-3.5 text-indigo-400" />
              <span>Local Agent Unix Trace ({toolTraces.length})</span>
            </div>
            <ChevronDown
              className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${
                isUnixTraceOpen ? 'rotate-180 text-indigo-400' : ''
              }`}
            />
          </button>

          {isUnixTraceOpen && (
            <div className="px-3 pb-3 space-y-2 max-h-48 overflow-y-auto">
              {toolTraces.map((trace: RouterToolTrace) => {
                let cmdStr = '';
                if (trace.tool === 'grep') {
                  cmdStr = `$ grep -rn "${trace.args?.pattern || ''}"`;
                } else if (trace.tool === 'find') {
                  cmdStr = `$ find ${trace.args?.directory || '.'} -name "${trace.args?.pattern || '*'}"`;
                } else if (trace.tool === 'head_tail') {
                  cmdStr = `$ head -n ${trace.args?.endLine || 40} ${trace.args?.path || ''}`;
                } else if (trace.tool === 'inspect_graph') {
                  cmdStr = `$ inspect-graph ${trace.args?.path || trace.args?.symbol || ''}`;
                } else {
                  cmdStr = `$ ${trace.tool}`;
                }

                return (
                  <div
                    key={trace.id}
                    className="p-2 rounded-lg bg-slate-950 border border-slate-800 text-[11px] font-mono space-y-0.5"
                  >
                    <div className="flex items-center justify-between text-indigo-200">
                      <span className="truncate">{cmdStr}</span>
                      <span className="text-[10px] text-slate-500">{trace.durationMs}ms</span>
                    </div>
                    <p className="text-[10px] text-slate-400 font-sans">{trace.outputSummary}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Exclude Patterns Section */}
      <div className="p-4 border-b border-slate-800 space-y-2.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-indigo-400" />
            Tree Exclude Patterns
          </label>
          <span className="text-[10px] text-slate-500 font-mono">
            {excludedPatterns.length} active
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5 pt-1">
          {COMMON_EXCLUDES.map((comm) => {
            const isExcluded = excludedPatterns.includes(comm);
            return (
              <button
                key={comm}
                onClick={() =>
                  isExcluded ? handleRemoveExclude(comm) : handleAddExclude(comm)
                }
                className={`text-[10px] font-mono px-2 py-0.5 rounded-md border transition cursor-pointer ${
                  isExcluded
                    ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                    : 'bg-slate-900 border-white/[0.08] text-slate-400 hover:text-slate-200 hover:border-white/20'
                }`}
              >
                {isExcluded ? '✓ ' : '+ '}
                {comm}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5 pt-1">
          <input
            type="text"
            value={newExcludeInput}
            onChange={(e) => setNewExcludeInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddExclude(newExcludeInput);
              }
            }}
            placeholder="Add custom pattern (e.g. mock/)"
            className="flex-1 px-2.5 py-1.5 rounded-lg bg-slate-900/90 border border-white/[0.08] text-xs font-mono text-slate-200 placeholder:text-slate-500 outline-none focus:border-indigo-500"
          />
          <button
            onClick={() => handleAddExclude(newExcludeInput)}
            disabled={!newExcludeInput.trim()}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-40 transition"
            aria-label="Add exclude pattern"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Tab Content */}
      <div className="flex-1 min-h-0 flex flex-col p-4">
        {activeTab === 'files' ? (
          <>
            <div className="relative mb-3">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
              <input
                type="text"
                value={fileFilter}
                onChange={(e) => setFileFilter(e.target.value)}
                placeholder="Filter files..."
                className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800 text-xs font-mono text-slate-200 placeholder:text-slate-500 outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex-1 overflow-y-auto space-y-1 pr-1">
              {filteredFiles.length > 0 ? (
                filteredFiles.map((file) => (
                  <div
                    key={file.path}
                    className="group flex items-center justify-between gap-2 p-1.5 rounded-lg hover:bg-slate-900/80 text-xs transition"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      {getFileIcon(file.path)}
                      <span className="font-mono text-slate-300 truncate" title={file.path}>
                        {file.path}
                      </span>
                    </div>
                    <span className="font-mono text-[10px] text-slate-500 group-hover:text-slate-400 flex-shrink-0">
                      {formatFileSize(file.size)}
                    </span>
                  </div>
                ))
              ) : (
                <div className="py-8 text-center text-xs text-slate-500 leading-relaxed">
                  {snapshot ? 'No files matching search filter.' : 'Submit a prompt to fetch and inspect repository.'}
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="relative mb-3">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
              <input
                type="text"
                value={graphFilter}
                onChange={(e) => setGraphFilter(e.target.value)}
                placeholder="Filter symbols & components..."
                className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800 text-xs font-mono text-slate-200 placeholder:text-slate-500 outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {filteredSymbols.length > 0 ? (
                filteredSymbols.map((sym, idx) => (
                  <div
                    key={`${sym.filePath}-${sym.name}-${idx}`}
                    className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-mono font-bold text-indigo-300 truncate">
                        <Cpu className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                        <span className="truncate">{sym.name}</span>
                      </div>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-950 text-slate-400 border border-slate-800">
                        {sym.type}
                      </span>
                    </div>
                    <p className="font-mono text-[10px] text-slate-400 truncate" title={sym.filePath}>
                      @[/{sym.filePath}] (line {sym.line})
                    </p>
                    {sym.renders.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        <span className="text-[10px] text-slate-500">Renders:</span>
                        {sym.renders.map((r) => (
                          <span
                            key={r}
                            className="font-mono text-[9px] text-violet-300 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-850"
                          >
                            &lt;{r}&gt;
                          </span>
                        ))}
                      </div>
                    )}
                    {sym.calls.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-0.5">
                        <span className="text-[10px] text-slate-500">Calls:</span>
                        {sym.calls.slice(0, 4).map((c) => (
                          <span
                            key={c}
                            className="font-mono text-[9px] text-slate-300 bg-slate-950 px-1 py-0.5 rounded border border-slate-850"
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="py-8 text-center text-xs text-slate-500 leading-relaxed">
                  {snapshot ? 'No matching symbols found in code graph.' : 'Submit a prompt to inspect code graph.'}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </aside>
  );
};
