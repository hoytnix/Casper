'use client';

import React, { useState } from 'react';
import { Cpu, Search } from 'lucide-react';
import type { IngestionSnapshot } from '@/types';
import type { CodeSymbol } from '@/lib/nextjs-code-graph';

export interface InspectorCodeGraphProps {
  symbols: CodeSymbol[];
  snapshot: IngestionSnapshot | null;
}

// Function call-graph exploration, extracted verbatim from
// ContextInspector: symbol search filter and the symbol cards with
// renders/calls chips.
export const InspectorCodeGraph: React.FC<InspectorCodeGraphProps> = ({
  symbols,
  snapshot,
}) => {
  const [graphFilter, setGraphFilter] = useState('');

  const filteredSymbols = symbols.filter(
    (s) =>
      s.name.toLowerCase().includes(graphFilter.toLowerCase()) ||
      s.filePath.toLowerCase().includes(graphFilter.toLowerCase())
  );

  return (
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
  );
};
