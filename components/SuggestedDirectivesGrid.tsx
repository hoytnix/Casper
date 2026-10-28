'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Layers, Loader2, RefreshCw, Sparkles, X } from 'lucide-react';
import type {
  DirectiveGenerationStatus,
  IngestionSnapshot,
  Repo,
  SuggestedDirective,
} from '@/types';
import { generateSuggestedDirectives } from '@/lib/local-context-router';
import {
  loadCachedDirectives,
  loadDismissedPrompts,
  saveCachedDirectives,
  saveDismissedPrompt,
} from '@/hooks/useRepoStore';

export interface SuggestedDirectivesGridProps {
  repo: Repo;
  snapshot: IngestionSnapshot | null;
  messagesLength: number;
  isBusy: boolean;
  onUsePrompt: (prompt: string) => void;
}

// Empty-state suggested-directives grid, extracted verbatim from
// ChatCompiler: last-good cache hydrate, background Local AI refresh with
// nonce seed, dismissal persistence, skeleton cards, engine badge, and
// the welcome hero. Clicking a card populates the input without
// auto-submitting. Failures show fallback cards, never a blank grid.
export const SuggestedDirectivesGrid: React.FC<SuggestedDirectivesGridProps> = ({
  repo,
  snapshot,
  messagesLength,
  isBusy,
  onUsePrompt,
}) => {
  const [directives, setDirectives] = useState<SuggestedDirective[]>([]);
  const [directiveStatus, setDirectiveStatus] = useState<DirectiveGenerationStatus>('idle');
  const [directiveEngine, setDirectiveEngine] = useState<string>('');
  const directiveReqId = useRef(0);

  const repoKey = `${repo.owner}/${repo.repo}/${repo.branch}`;
  const snapshotFilesKey = (snapshot?.files || []).length;

  const refreshDirectives = React.useCallback(async (isManual = false) => {
    const files = snapshot?.files || [];
    if (messagesLength > 0 && !isManual) return;
    const reqId = ++directiveReqId.current;
    setDirectiveStatus('generating');
    try {
      // Instant hydrate from last-good cache, then refresh in background.
      if (!isManual) {
        const cached = loadCachedDirectives(repoKey);
        if (cached.length > 0 && reqId === directiveReqId.current) {
          setDirectives(cached);
        }
      }
      const dismissed = loadDismissedPrompts(repoKey);
      const seed = `${repo.owner}/${repo.repo}-${Date.now()}-${Math.random()}`;
      const result = await generateSuggestedDirectives(seed, files.slice(0, 40), `${repo.owner}/${repo.repo}-${repo.branch}`);
      if (reqId !== directiveReqId.current) return;
      const filtered = result.directives.filter(
        (d) => !dismissed.has(d.prompt.toLowerCase().trim())
      );
      const finalList = filtered.length > 0 ? filtered.slice(0, 4) : result.directives.slice(0, 4);
      setDirectives(finalList);
      setDirectiveEngine(result.engineUsed);
      setDirectiveStatus(result.engineUsed === 'Fallback Keyword' ? 'fallback' : 'ready');
      if (finalList.length > 0) saveCachedDirectives(repoKey, finalList);
    } catch {
      // Local try/catch with fallback (app.onError equivalent): never blank grid, never throw to render.
      if (reqId !== directiveReqId.current) return;
      const cached = loadCachedDirectives(repoKey);
      if (cached.length > 0) {
        setDirectives(cached);
        setDirectiveStatus('fallback');
      } else {
        setDirectiveStatus('error');
      }
    }
  }, [messagesLength, repo.branch, repo.owner, repo.repo, repoKey, snapshot]);

  // Generate fresh repo-grounded directives on workspace load / branch switch.
  // Debounced so rapid branch switches collapse into one generation.
  useEffect(() => {
    if (messagesLength > 0) return;
    if (!snapshot || !snapshot.files || snapshot.files.length === 0) return;
    if (isBusy) return;
    const t = setTimeout(() => {
      refreshDirectives(false);
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshotFilesKey, repo.owner, repo.repo, repo.branch, messagesLength]);

  const handleDismissDirective = (e: React.MouseEvent, prompt: string) => {
    e.stopPropagation();
    saveDismissedPrompt(repoKey, prompt);
    setDirectives((prev) => prev.filter((d) => d.prompt !== prompt));
  };

  return (
    <div className="max-w-2xl mx-auto py-12 text-center space-y-6 animate-in fade-in duration-300">
      {/* Visual Anchor: Architectural Geometric Core */}
      <div className="relative w-16 h-16 mx-auto flex items-center justify-center">
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-sky-500/20 to-indigo-500/20 blur-xl pointer-events-none" />
        <div className="relative w-14 h-14 rounded-2xl border border-white/[0.1] bg-[#0b0f19] flex items-center justify-center shadow-lg shadow-indigo-950/50">
          <Layers className="w-7 h-7 text-sky-400" />
        </div>
      </div>

      <div className="space-y-2.5">
        <h3 className="text-xl font-bold text-white tracking-tight">
          Casper is ready to compile execution directives for{' '}
          <span className="text-indigo-300 font-mono">
            {repo.owner}/{repo.repo}
          </span>
        </h3>
        <p className="text-xs sm:text-sm text-slate-400 max-w-lg mx-auto leading-relaxed text-balance">
          Casper the friendly ghost reads all ur code lol, traverses the repository tree, executes in-memory Unix VFS tools, and produces an Antigravity-ready step-by-step choreography with exact <code className="text-indigo-300 bg-slate-900/90 px-1.5 py-0.5 rounded font-mono text-xs">@[/paths]</code>.
        </p>
      </div>

      {/* Quick Directive Cards */}
      <div className="space-y-3 text-left max-w-xl mx-auto pt-4">
        <div className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-400">
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-sky-400" />
            <span>Suggested Architectural Directives</span>
            {directiveEngine && (
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-300 border border-white/[0.06]">
                {directiveEngine}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => refreshDirectives(true)}
            disabled={directiveStatus === 'generating'}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition disabled:opacity-40"
            title="Refresh directives (fresh Local AI generation)"
          >
            {directiveStatus === 'generating' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {directiveStatus === 'generating' && directives.length === 0 ? (
            [0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="p-3.5 rounded-xl bg-slate-900/60 border border-white/[0.06] animate-pulse"
              >
                <div className="h-3 rounded bg-slate-800 w-3/4 mb-2" />
                <div className="h-3 rounded bg-slate-800/70 w-full" />
              </div>
            ))
          ) : (
            directives.map((d, idx) => (
              <div
                key={d.id}
                className="relative p-3.5 rounded-xl bg-slate-900/60 hover:bg-slate-900 border border-white/[0.06] hover:border-indigo-500/40 text-left text-xs text-slate-300 hover:text-white transition shadow-sm"
              >
                <button
                  type="button"
                  onClick={() => onUsePrompt(d.prompt)}
                  className="flex items-start gap-2.5 w-full text-left cursor-pointer active:scale-[0.99]"
                >
                  <span className="font-mono text-slate-500 text-[11px] mt-0.5">0{idx + 1}.</span>
                  <span className="flex-1 min-w-0">
                    <span className="block leading-relaxed line-clamp-2">{d.title}</span>
                    <span className="block mt-1 text-[11px] text-slate-500 leading-relaxed">
                      {d.rationale || d.engine}
                      {d.anchorPaths.length > 0 && (
                        <span className="ml-1.5 font-mono px-1 py-px rounded bg-slate-800 text-slate-400">
                          {d.anchorPaths.length} anchor{d.anchorPaths.length === 1 ? '' : 's'}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={(e) => handleDismissDirective(e, d.prompt)}
                  className="absolute top-1.5 right-1.5 p-1 rounded text-slate-600 hover:text-slate-300 hover:bg-slate-800 transition"
                  title="Dismiss this directive"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
