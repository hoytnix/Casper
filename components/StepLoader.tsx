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
} from 'lucide-react';
import { IngestionProgress } from '@/types';

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
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-ping" />
          <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Compass className="w-4 h-4 text-indigo-400" />
            {isAgentic
              ? 'Graph-Aware Unix VFS Agent Exploration'
              : 'Repository Ingestion Pipeline'}
          </h4>
        </div>
        {progress.currentRound && progress.maxRounds && (
          <span className="text-[11px] font-mono text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
            Round {progress.currentRound} of {progress.maxRounds}
          </span>
        )}
      </div>

      {/* Main Status Callout */}
      <div className="flex items-start gap-3 p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
        <Loader2 className="w-4 h-4 text-indigo-400 animate-spin mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-slate-100">{progress.message}</p>
          {progress.activePaths && progress.activePaths.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {progress.activePaths.map((p) => (
                <span
                  key={p}
                  className="font-mono text-[10px] text-indigo-300 bg-slate-900 px-2 py-0.5 rounded border border-slate-800 flex items-center gap-1"
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
        <div className="space-y-2 pt-2 border-t border-slate-800/80">
          <p className="text-[10px] font-semibold text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-purple-400 animate-pulse" />
            Agent Reasoning & Thinking Trail (thinkingLevel: high):
          </p>
          <div className="p-3 rounded-xl bg-purple-950/20 border border-purple-500/30 text-xs font-mono text-purple-200 max-h-40 overflow-y-auto whitespace-pre-wrap leading-relaxed">
            {progress.thinkingContent}
          </div>
        </div>
      )}

      {/* Live Unix Tool Traces ($ grep, $ find, $ trace_call_graph, etc.) */}
      {progress.toolTraces && progress.toolTraces.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-slate-800/80">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Terminal className="w-3.5 h-3.5 text-indigo-400" />
            Live Unix & Code Graph Tool Activity ({progress.toolTraces.length}):
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
