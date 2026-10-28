'use client';

import React from 'react';
import {
  GitBranch,
  Sparkles,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Compass,
  FileCode,
  Terminal,
  Coins,
} from 'lucide-react';
import { IngestionProgress } from '@/types';
import { formatCostUsd } from '@/lib/utils';

interface StepLoaderProps {
  progress: IngestionProgress;
}

export const StepLoader: React.FC<StepLoaderProps> = ({ progress }) => {
  if (progress.step === 'idle' || progress.step === 'completed') {
    return null;
  }

  const isAgentic =
    progress.step === 'agentic_exploring' ||
    (progress.explorationTrail && progress.explorationTrail.length > 0) ||
    (progress.toolTraces && progress.toolTraces.length > 0);

  return (
    <div className="w-full rounded-2xl glass-panel border border-indigo-500/30 p-5 shadow-2xl shadow-indigo-950/40 animate-in fade-in duration-300 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
        <div className="flex items-center gap-2">
          <Compass className="w-4 h-4 text-indigo-400" />
          <h4 className="text-xs font-bold text-white tracking-wide">
            {isAgentic
              ? 'Graph-Aware Unix VFS Agent Exploration'
              : 'Repository Ingestion Pipeline'}
          </h4>
        </div>
        <div className="flex items-center gap-2">
          {progress.inputTokens && (
            <span className="text-xs font-mono text-emerald-300 bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded flex items-center gap-1">
              <Coins className="w-3.5 h-3.5 text-emerald-400" />
              <span>~{progress.inputTokens.toLocaleString()} tokens in</span>
              {progress.costDetails && (
                <span className="text-emerald-400 font-bold">&bull; {formatCostUsd(progress.costDetails.totalCostUsd)}</span>
              )}
            </span>
          )}
          {progress.currentRound && progress.maxRounds && (
            <span className="text-xs font-mono text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
              Round {progress.currentRound} of {progress.maxRounds}
            </span>
          )}
        </div>
      </div>

      {/* Main Status Callout */}
      <div className="flex items-start gap-3 p-3.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
        <Loader2 className="w-4 h-4 text-indigo-400 animate-spin mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-slate-100">{progress.message}</p>
          {progress.progressPercent !== undefined && (
            <div className="mt-2.5 space-y-1">
              <div className="flex items-center justify-between text-[10px] font-mono text-indigo-300">
                <span>Model download &amp; warmup progress</span>
                <span>{progress.progressPercent}%</span>
              </div>
              <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden border border-white/[0.08]">
                <div
                  className="h-full bg-indigo-500 transition-all duration-300"
                  style={{ width: `${Math.min(100, Math.max(0, progress.progressPercent))}%` }}
                />
              </div>
            </div>
          )}
          {progress.activePaths && progress.activePaths.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {progress.activePaths.map((p) => (
                <span
                  key={p}
                  className="font-mono text-[10px] text-indigo-300 bg-slate-900 px-2 py-0.5 rounded border border-white/[0.08] flex items-center gap-1"
                >
                  <FileCode className="w-3 h-3 text-indigo-400" />
                  {p}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Model Thinking & Reasoning Log */}
      {progress.thinkingContent && (
        <div className="space-y-2 pt-2 border-t border-white/[0.06]">
          <p className="text-xs font-semibold text-purple-300 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            <span>Agent Reasoning &amp; Thinking Trail (thinkingLevel: {progress.thinkingLevel || 'high'})</span>
            {(progress.thinkingLevel === 'xhigh' || progress.thinkingLevel === 'max') && (
              <span className="text-[10px] font-mono text-fuchsia-300 bg-fuchsia-500/10 px-2 py-0.5 rounded border border-fuchsia-500/30">
                Muse-only
              </span>
            )}
          </p>
          <div className="p-3 rounded-xl bg-purple-950/20 border border-purple-500/30 text-xs font-mono text-purple-200 max-h-40 overflow-y-auto whitespace-pre-wrap leading-relaxed">
            {progress.thinkingContent}
          </div>
        </div>
      )}

      {/* Live Unix Tool Traces ($ grep, $ find, $ trace_call_graph, etc.) */}
      {progress.toolTraces && progress.toolTraces.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-white/[0.06]">
          <p className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
            <Terminal className="w-3.5 h-3.5 text-indigo-400" />
            <span>Live Unix &amp; Code Graph Tool Activity ({progress.toolTraces.length})</span>
          </p>
          <div className="space-y-1.5">
            {progress.toolTraces.map((trace) => {
              let cmdStr = '';
              if (trace.tool === 'grep') {
                cmdStr = `$ grep -rn "${trace.args?.pattern || ''}" ${trace.args?.pathPrefix || '.'}`;
              } else if (trace.tool === 'find') {
                cmdStr = `$ find ${trace.args?.directory || '.'} -name "${trace.args?.pattern || '*'}"`;
              } else if (trace.tool === 'head_tail') {
                cmdStr = `$ head -n ${trace.args?.endLine || 40} ${trace.args?.path || ''}`;
              } else if (trace.tool === 'inspect_graph') {
                cmdStr = `$ inspect-graph ${trace.args?.path || ''}`;
              } else if (trace.tool === 'trace_call_graph') {
                cmdStr = `$ trace-call-graph --symbol "${trace.args?.symbol || ''}"`;
              } else if (trace.tool === 'get_route_map') {
                cmdStr = `$ get-route-map`;
              } else if (trace.tool === 'find_related_symbols') {
                cmdStr = `$ find-related-symbols --query "${trace.args?.query || ''}"`;
              } else {
                cmdStr = `$ ${trace.tool} ${JSON.stringify(trace.args || {})}`;
              }

              return (
                <div
                  key={trace.id}
                  className="p-2 rounded-xl bg-slate-900/90 border border-slate-800 text-xs font-mono space-y-1"
                >
                  <div className="flex items-center justify-between text-indigo-300">
                    <span className="truncate">{cmdStr}</span>
                    <span className="text-[10px] text-slate-500 font-sans flex-shrink-0">
                      {trace.durationMs}ms
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 font-sans">
                    {trace.outputSummary}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Agentic Exploration Trail (Live Breadcrumbs) */}
      {progress.explorationTrail && progress.explorationTrail.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-slate-800/80">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
            Agent Exploration Trail ({progress.explorationTrail.length} rounds):
          </p>
          <div className="space-y-2">
            {progress.explorationTrail.map((step) => (
              <div
                key={step.id}
                className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-semibold text-slate-200">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Round {step.round}: Inspected {step.paths.length} file{step.paths.length > 1 ? 's' : ''}</span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {new Date(step.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </div>

                {step.reason && (
                  <p className="text-[11px] text-slate-400 italic">
                    &ldquo;{step.reason}&rdquo;
                  </p>
                )}

                <div className="flex flex-wrap gap-1 pt-1">
                  {step.paths.map((p) => (
                    <span
                      key={p}
                      className="font-mono text-[10px] text-slate-300 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-850"
                    >
                      @[/{p}]
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error State */}
      {progress.error && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
          <span>{progress.error}</span>
        </div>
      )}
    </div>
  );
};
