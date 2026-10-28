'use client';

import React, { useState } from 'react';
import { ChevronDown, Terminal } from 'lucide-react';
import type { RouterToolTrace } from '@/types';

export interface InspectorUnixTraceProps {
  toolTraces: RouterToolTrace[];
}

// Collapsible local-agent Unix trace log, extracted verbatim from
// ContextInspector: shell-style command lines with durations and output
// summaries. Renders nothing when there are no traces.
export const InspectorUnixTrace: React.FC<InspectorUnixTraceProps> = ({
  toolTraces,
}) => {
  const [isUnixTraceOpen, setIsUnixTraceOpen] = useState(true);

  if (toolTraces.length === 0) return null;

  return (
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
  );
};
