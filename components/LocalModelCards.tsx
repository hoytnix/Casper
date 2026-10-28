'use client';

import React from 'react';
import { AlertCircle, CheckCircle2, Cpu, Loader2, RotateCcw } from 'lucide-react';
import type { LocalModelFit, LocalModelSpec, RouterEngineType } from '@/types';
import { LOCAL_MODELS } from '@/hooks/useRepoStore';
import {
  ensureQwenEngine,
  getMlcLoadError,
  getResidentModelId,
  isModelLoaded,
  unloadLocalModel,
} from '@/lib/routers/qwen-mlc-router';
import { isLocalGenerationEngine } from '@/lib/settings-store';

const FIT_BADGE_TEXT: Record<LocalModelFit, string> = {
  FITS: 'FITS under 2GB',
  CEILING: 'CEILING',
  TINY_FILTER: 'TINY_FILTER',
  EMBEDDING_ONLY: 'EMBEDDING_ONLY',
  CHROME_BUILTIN: 'CHROME_BUILT-IN / AVAILABILITY VARIES',
  BLOCKED: 'BLOCKED',
};

const FIT_BADGE_STYLE: Record<LocalModelFit, string> = {
  FITS: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  CEILING: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  TINY_FILTER: 'bg-sky-500/10 text-sky-300 border-sky-500/30',
  EMBEDDING_ONLY: 'bg-violet-500/10 text-violet-300 border-violet-500/30',
  CHROME_BUILTIN: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30',
  BLOCKED: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
};

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 text-xs">
      <span className="text-slate-500 flex-shrink-0">{label}</span>
      <span className="text-slate-200 font-mono text-right">{value}</span>
    </div>
  );
}

const LocalModelCard: React.FC<{
  spec: LocalModelSpec;
  selected: boolean;
  resident: boolean;
  loading: boolean;
  loadError: { id: string; message: string; action: string } | null;
  onSelect: (id: RouterEngineType) => void;
  onLoad: (spec: LocalModelSpec) => void;
  onUnload: () => void;
}> = ({ spec, selected, resident, loading, loadError, onSelect, onLoad, onUnload }) => {
  const loadable = isLocalGenerationEngine(spec.id) && spec.fitBadge !== 'BLOCKED' && !!spec.mlcModelId;
  return (
    <div
      className={`p-4 rounded-xl border transition-all ${
        selected
          ? 'bg-indigo-950/40 border-indigo-500/40'
          : spec.fitBadge === 'BLOCKED'
            ? 'bg-slate-950/60 border-rose-500/20 opacity-90'
            : 'bg-slate-900/90 border-white/[0.08]'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Cpu className="w-4 h-4 text-sky-400 flex-shrink-0" />
            <span className="text-sm font-semibold text-white">{spec.displayName}</span>
            <span className="font-mono text-xs text-slate-400">{spec.paramsLabel}</span>
            <span className="font-mono text-xs text-sky-300 bg-slate-950 px-2 py-0.5 rounded border border-white/[0.08]">
              {spec.quantizationLabel}
            </span>
            <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${FIT_BADGE_STYLE[spec.fitBadge]}`}>
              {FIT_BADGE_TEXT[spec.fitBadge]}
            </span>
            {spec.gated && (
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded border bg-amber-500/10 text-amber-300 border-amber-500/30">
                GATED
              </span>
            )}
            {selected && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-200 border border-indigo-500/30">
                SELECTED
              </span>
            )}
            {resident && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                RESIDENT
              </span>
            )}
          </div>
          {!spec.verified && (
            <p className="mt-1 text-[11px] font-mono text-amber-300/90">
              approximate / unverified — see final report
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 space-y-1.5">
        <Field label="Download / cache" value={spec.downloadSizeApprox} />
        <Field label="RAM (short prompt)" value={spec.ramTotalApproxShortContext} />
        <Field label="Device guidance" value={spec.minDeviceGuidance} />
        <Field label="Runtime" value={spec.runtimeLabel} />
        <Field label="Best for" value={spec.bestFor} />
      </div>

      <p className="mt-2 text-[11px] font-mono text-slate-500">{spec.ramNote}</p>

      {spec.warning && (
        <p className="mt-2 text-[11px] text-amber-300/90 bg-amber-950/30 border border-amber-500/20 rounded-lg px-2.5 py-1.5">
          {spec.warning}
        </p>
      )}

      {loadError && loadError.id === spec.id && (
        <div className="mt-2 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs space-y-1">
          <p className="text-rose-300 flex items-start gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span>{loadError.message}</span>
          </p>
          <p className="text-rose-200/80 font-mono text-[11px]">{loadError.action}</p>
        </div>
      )}

      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => onSelect(spec.id)}
          disabled={selected}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium font-mono border transition ${
            selected
              ? 'bg-indigo-500/15 border-indigo-500/30 text-indigo-200'
              : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-indigo-500/40'
          }`}
        >
          {selected ? 'SELECTED' : 'SELECT'}
        </button>
        {loadable ? (
          resident ? (
            <button
              type="button"
              onClick={onUnload}
              disabled={loading}
              className="px-3 py-1.5 rounded-lg text-xs font-medium font-mono border bg-slate-800 border-slate-700 text-slate-300 hover:border-rose-500/40 transition flex items-center gap-1.5"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              <span>Unload</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onLoad(spec)}
              disabled={loading}
              className="px-3 py-1.5 rounded-lg text-xs font-medium font-mono border bg-sky-600 border-sky-500 text-white hover:bg-sky-500 transition flex items-center gap-1.5 disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              <span>{loadError ? 'Retry' : 'Load'}</span>
            </button>
          )
        ) : (
          <span className="px-3 py-1.5 rounded-lg text-xs font-mono border bg-slate-900 border-white/[0.06] text-slate-500">
            {spec.fitBadge === 'BLOCKED' ? 'Load disabled (BLOCKED)' : 'No separate load'}
          </span>
        )}
        {loadError && !resident && loadable && (
          <button
            type="button"
            onClick={() => onLoad(spec)}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg text-xs font-medium font-mono border bg-slate-800 border-slate-700 text-slate-300 hover:border-sky-500/40 transition flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Retry</span>
          </button>
        )}
      </div>
    </div>
  );
};

export const LocalModelCards: React.FC<{
  selectedId: string;
  localContextTokens: number;
  onSelect: (id: RouterEngineType) => void;
}> = ({ selectedId, localContextTokens, onSelect }) => {
  // Lazy initializer reads the client-only router singleton once;
  // no effect needed (SSR-safe: guarded for pre-hydration renders).
  const [residentId, setResidentId] = React.useState<string>(() => {
    try {
      return isModelLoaded() ? getResidentModelId() : '';
    } catch {
      return '';
    }
  });
  const [loadingId, setLoadingId] = React.useState<string | null>(null);
  const [loadError, setLoadError] = React.useState<{ id: string; message: string; action: string } | null>(null);

  const handleLoad = React.useCallback(
    async (spec: LocalModelSpec) => {
      setLoadingId(spec.id);
      setLoadError(null);
      try {
        const ok = await ensureQwenEngine(spec.id, undefined, localContextTokens);
        if (ok) {
          setResidentId(getResidentModelId());
          setLoadError(null);
        } else {
          const err = getMlcLoadError();
          setLoadError(err ? { id: spec.id, ...err } : null);
        }
      } catch (e) {
        setLoadError({
          id: spec.id,
          message: e instanceof Error ? e.message : String(e),
          action: 'Close other tabs, keep context at 1536, and retry — or pick a TINY_FILTER first.',
        });
      } finally {
        setLoadingId(null);
      }
    },
    [localContextTokens]
  );

  const handleUnload = React.useCallback(async () => {
    setLoadingId('__unload');
    try {
      await unloadLocalModel();
      setResidentId('');
      setLoadError(null);
    } finally {
      setLoadingId(null);
    }
  }, []);

  const showResidentNotice = residentId.length > 0 && residentId !== selectedId;

  return (
    <div className="space-y-3">
      {showResidentNotice && (
        <p className="text-xs text-sky-300 font-mono bg-sky-950/40 border border-sky-500/20 p-2.5 rounded-lg">
          One model resident at a time: loading {selectedId} unloads {residentId}.
        </p>
      )}
      {LOCAL_MODELS.map((spec) => (
        <LocalModelCard
          key={spec.id}
          spec={spec}
          selected={selectedId === spec.id}
          resident={residentId === spec.mlcModelId || residentId === spec.id}
          loading={loadingId === spec.id || loadingId === '__unload'}
          loadError={loadError}
          onSelect={onSelect}
          onLoad={handleLoad}
          onUnload={handleUnload}
        />
      ))}
    </div>
  );
};
