'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Key,
  ShieldCheck,
  Cpu,
  ExternalLink,
  Check,
  AlertCircle,
  Loader2,
  ChevronUp,
  ChevronDown,
  Sparkles,
  RotateCcw,
  Clock,
  Save,
  Globe,
} from 'lucide-react';
import { useRepoStore, DEFAULT_MODELS } from '@/hooks/useRepoStore';
import { checkGeminiNanoAvailability, warmUpLocalContextRouter } from '@/lib/local-context-router';
import { Header } from '@/components/Header';
import { RouterEngineType, ModelConfig, ThinkingLevel, ThinkingSummaryMode, SearchContextSize } from '@/types';
import { MUSE_THINKING_LEVELS, normalizeThinkingLevel, normalizeThinkingSummaries } from '@/lib/thinking-levels';
import { normalizeSearchContextSize, SEARCH_CONTEXT_SIZES } from '@/lib/search-grounding';

// Model priority waterfall: memoized so credential-input keystrokes (PAT /
// API keys live in the page's state) skip re-rendering all model cards —
// the button.px-3 + span renders in the INP trace. Callbacks are
// useCallbacks with functional setState, so their identity never busts
// this memo on keystrokes.
const ModelWaterfall: React.FC<{
  models: ModelConfig[];
  onMove: (index: number, direction: 'up' | 'down') => void;
  onToggle: (id: string) => void;
  onReset: () => void;
}> = React.memo(function ModelWaterfall({ models, onMove, onToggle, onReset }) {
  return (
    <div className="glass-panel p-6 rounded-2xl border border-white/[0.08] space-y-4">
      <div className="flex items-center justify-between">
        <label className="text-sm font-bold text-white flex items-center gap-2">
          <Cpu className="w-4 h-4 text-indigo-400" />
          Model Priority &amp; Fallback Waterfall
        </label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onReset}
            className="text-xs text-slate-400 hover:text-indigo-300 flex items-center gap-1 transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>
          <span className="text-[10px] font-mono text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
            Gemini 4 Argon Active
          </span>
        </div>
      </div>

      <p className="text-xs text-slate-400 leading-relaxed">
        Adjust priority ordering or toggle models on/off. If a model encounters quota errors, the compiler automatically cascades to the next active model in sequence.
      </p>

      <div className="space-y-3 pt-2">
        {models.map((model, idx) => (
          <div
            key={model.id}
            className={`p-4 rounded-xl border transition-all ${
              model.enabled
                ? model.id === 'gemini-4-argon'
                  ? 'bg-indigo-950/40 border-indigo-500/40'
                  : 'bg-slate-900/90 border-white/[0.08]'
                : 'bg-slate-950/60 border-slate-900 opacity-60'
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-7 h-7 rounded-lg text-xs font-mono font-bold flex items-center justify-center flex-shrink-0 bg-indigo-600/30 text-indigo-300 border border-indigo-500/40">
                  #{idx + 1}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-sm font-semibold ${model.enabled ? 'text-white' : 'text-slate-400 line-through'}`}>
                      {model.name}
                    </span>
                    <span className="font-mono text-xs text-indigo-400 bg-slate-950 px-2 py-0.5 rounded border border-white/[0.08]">
                      {model.tag}
                    </span>
                    {model.id === 'gemini-4-argon' && (
                      <span className="text-[10px] font-semibold bg-gradient-to-r from-amber-500/20 to-indigo-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-amber-400" />
                        <span>Argon Tier</span>
                      </span>
                    )}
                  </div>
                  {model.id === 'gemini-4-argon' ? (
                    <div className="mt-1.5 text-xs font-mono text-emerald-400 bg-emerald-950/40 border border-emerald-500/20 px-2 py-0.5 rounded-md inline-block">
                      $2/M input, $10/M output ($4/M &amp; $20/M after Nov 30, 2026)
                    </div>
                  ) : model.inputPricing ? (
                    <div className="mt-1 text-xs font-mono text-slate-400">
                      {model.inputPricing} in &bull; {model.outputPricing} out
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <div className="flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => onMove(idx, 'up')}
                    disabled={idx === 0}
                    className="p-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300 transition"
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onMove(idx, 'down')}
                    disabled={idx === models.length - 1}
                    className="p-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300 transition"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => onToggle(model.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium font-mono border transition ${
                    model.enabled
                      ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                      : 'bg-slate-800 border-slate-700 text-slate-500'
                  }`}
                >
                  {model.enabled ? 'ENABLED' : 'OFF'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

export default function SettingsPage() {
  const router = useRouter();
  const { settings, updateSettings, selectRepo, activeRepo } = useRepoStore();

  const [pat, setPat] = useState(settings.githubPat || '');
  const [apiKey, setApiKey] = useState(settings.customApiKey || '');
  const [museApiKey, setMuseApiKey] = useState(settings.museApiKey || '');
  const [maxRounds, setMaxRounds] = useState<number>(settings.maxAgenticRounds || 3);
  const [requestTimeout, setRequestTimeout] = useState<number>(settings.requestTimeout || 60);
  const [routerEngine, setRouterEngine] = useState<RouterEngineType>(settings.routerEngine || 'auto');
  const [thinkingLevel, setThinkingLevel] = useState<ThinkingLevel>(
    normalizeThinkingLevel(settings.thinkingLevel)
  );
  const [thinkingSummaries, setThinkingSummaries] = useState<ThinkingSummaryMode>(
    normalizeThinkingSummaries(settings.thinkingSummaries)
  );
  const [searchGrounding, setSearchGrounding] = useState(settings.searchGrounding === true);
  const [searchContextSize, setSearchContextSize] = useState<SearchContextSize>(
    normalizeSearchContextSize(settings.searchContextSize)
  );
  const [nanoStatus, setNanoStatus] = useState<string>('checking...');
  const [isWarmingUp, setIsWarmingUp] = useState(false);
  const [showSavedToast, setShowSavedToast] = useState(false);
  const [warmupNotice, setWarmupNotice] = useState<string | null>(null);

  const [models, setModels] = useState<ModelConfig[]>(() => {
    if (settings.models && settings.models.length > 0) {
      let list = [...settings.models];
      const museDefaults = DEFAULT_MODELS.filter((m) => m.id.startsWith('muse-'));
      for (let i = museDefaults.length - 1; i >= 0; i--) {
        const museDefault = museDefaults[i];
        if (!list.some((m) => m.id === museDefault.id || m.tag === museDefault.tag)) {
          list = [museDefault, ...list];
        }
      }
      const argonDefault = DEFAULT_MODELS.find((m) => m.id === 'gemini-4-argon');
      if (argonDefault && !list.some((m) => m.id === 'gemini-4-argon' || m.tag === 'gemini-4-argon')) {
        list = [argonDefault, ...list];
      }
      return list.sort((a, b) => a.priority - b.priority);
    }
    return DEFAULT_MODELS;
  });

  React.useEffect(() => {
    checkGeminiNanoAvailability().then((st) => setNanoStatus(st));
  }, []);

  // Stable, functional updates: identity never changes, so the memoized
  // waterfall below survives credential-input keystrokes.
  const moveModel = React.useCallback((index: number, direction: 'up' | 'down') => {
    setModels((prev) => {
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(targetIndex, 0, moved);
      return next.map((m, idx) => ({ ...m, priority: idx + 1 }));
    });
  }, []);

  const toggleModel = React.useCallback((id: string) => {
    setModels((prev) => {
      const enabledCount = prev.filter((m) => m.enabled).length;
      return prev.map((m) => {
        if (m.id === id) {
          if (m.enabled && enabledCount <= 1) return m;
          return { ...m, enabled: !m.enabled };
        }
        return m;
      });
    });
  }, []);

  const resetModels = React.useCallback(() => setModels(DEFAULT_MODELS), []);

  const handleSave = () => {
    updateSettings({
      githubPat: pat.trim(),
      customApiKey: apiKey.trim(),
      museApiKey: museApiKey.trim(),
      thinkingLevel,
      thinkingSummaries,
      searchGrounding,
      searchContextSize,
      maxAgenticRounds: maxRounds,
      routerEngine,
      models,
      preferredModel: models.find((m) => m.enabled)?.tag || 'gemini-4-argon',
      requestTimeout,
    });
    setShowSavedToast(true);
    setTimeout(() => setShowSavedToast(false), 2500);
  };

  return (
    <div className="h-screen bg-slate-950 text-slate-100 flex flex-col overflow-hidden selection:bg-indigo-500/30 selection:text-indigo-200">
      <Header
        activeRepo={activeRepo}
        onBackToGrid={() => { selectRepo(null); router.push('/'); }}
        hasPat={!!settings.githubPat}
      />

      <main className="flex-1 overflow-y-auto px-4 sm:px-8 py-8">
        <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-300">
          {/* Page Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.08] pb-6">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-indigo-400 mb-1">
                <Key className="w-4 h-4" />
                <span>Global Compiler &amp; Environment Configuration</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                Compiler Settings &amp; AI Cascades
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 mt-1">
                Configure GitHub Personal Access Tokens, local AI context router engines, request timeouts, and model priority waterfalls.
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <button
                onClick={() => router.back()}
                className="px-4 py-2.5 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-900 transition border border-white/[0.06]"
              >
                Back
              </button>
              <button
                onClick={handleSave}
                disabled={showSavedToast}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/30 transition active:scale-95 disabled:opacity-50"
              >
                {showSavedToast ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-300" />
                    <span>Settings Saved!</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Save All Changes</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Main Settings Full-Width Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Column 1 & 2: Models & Router */}
            <div className="lg:col-span-2 space-y-6">
              {/* Model Priority & Fallback Waterfall (memoized: skipped on input keystrokes) */}
              <ModelWaterfall
                models={models}
                onMove={moveModel}
                onToggle={toggleModel}
                onReset={resetModels}
              />

              {/* Local AI Context Router Settings */}
              <div className="glass-panel p-6 rounded-2xl border border-white/[0.08] space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-bold text-white flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-sky-400" />
                    Local AI Context Router (In-Browser)
                  </label>
                  <span className="text-xs font-mono text-sky-400 bg-sky-500/10 px-2.5 py-1 rounded border border-sky-500/20">
                    0ms Re-Read
                  </span>
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-slate-300 block">Router Engine Preference</label>
                  <select
                    value={routerEngine}
                    onChange={(e) => setRouterEngine(e.target.value as RouterEngineType)}
                    className="w-full bg-slate-900 border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-xs font-mono text-slate-200 outline-none focus:border-sky-500"
                  >
                    <option value="auto">Auto (Gemini Nano ➔ Arctic / Qwen)</option>
                    <option value="gemini-nano-only">Gemini Nano Only (Chrome Built-in AI)</option>
                    <option value="arctic-embed-xs-only">Arctic Embed XS Only (Transformers.js)</option>
                    <option value="qwen-0.5b-coder-mlc">Qwen2.5-Coder-0.5B-Instruct (MLC WebGPU)</option>
                    <option value="qwen-1.5b-coder-mlc">Qwen2.5-Coder-1.5B-Instruct (MLC WebGPU)</option>
                  </select>
                </div>

                <div className="p-4 rounded-xl bg-slate-900/90 border border-white/[0.06] space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300 font-semibold">Chrome Gemini Nano (`window.LanguageModel`)</span>
                    <span className={`px-2.5 py-0.5 rounded text-xs font-mono ${nanoStatus === 'available' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-800 text-slate-400'}`}>
                      {nanoStatus.toUpperCase()}
                    </span>
                  </div>
                  <div className="pt-2 flex flex-col gap-2 border-t border-white/[0.08]">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-300">Pre-warm embedding pipeline &amp; session</span>
                      <button
                        type="button"
                        onClick={async () => {
                          setIsWarmingUp(true);
                          setWarmupNotice(null);
                          try {
                            await warmUpLocalContextRouter([], 'global-warmup', routerEngine, (status, pct) => {
                              setWarmupNotice(pct !== undefined ? `${status} (${pct}%)` : status);
                            });
                            setWarmupNotice('Local AI context router successfully warmed up!');
                          } catch (e) {
                            setWarmupNotice(`Warmup notice: ${e instanceof Error ? e.message : String(e)}`);
                          } finally {
                            setIsWarmingUp(false);
                          }
                        }}
                        disabled={isWarmingUp}
                        className="px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium text-xs transition flex items-center gap-1.5 disabled:opacity-50"
                      >
                        {isWarmingUp ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                        <span>{isWarmingUp ? 'Warming Up...' : 'Warm Up Local AI'}</span>
                      </button>
                    </div>
                    {warmupNotice && (
                      <p className="text-xs text-sky-300 font-mono bg-sky-950/40 p-2.5 rounded-lg border border-sky-500/20">
                        {warmupNotice}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Column 3: Credentials & Timeouts */}
            <div className="space-y-6">
              {/* GitHub PAT Section */}
              <div className="glass-panel p-6 rounded-2xl border border-white/[0.08] space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-bold text-white flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-indigo-400" />
                    GitHub PAT
                  </label>
                  <a
                    href="https://github.com/settings/tokens/new?scopes=repo&description=Casper+Context+Compiler"
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                  >
                    Generate <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <input
                  type="password"
                  value={pat}
                  onChange={(e) => setPat(e.target.value)}
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-white/[0.08] focus:border-indigo-500 text-xs font-mono text-slate-100 placeholder:text-slate-600 outline-none transition"
                />
                <div className="flex items-start gap-2 text-xs text-slate-400 leading-relaxed">
                  <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                  <span>Optional for public repos; recommended to bypass 60 req/hr rate limit and required for private repos.</span>
                </div>
              </div>

              {/* Custom API Key Override */}
              <div className="glass-panel p-6 rounded-2xl border border-white/[0.08] space-y-4">
                <label className="text-sm font-bold text-white block">Custom Gemini API Key</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="AIzaSy... (Leave empty for default)"
                  className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-white/[0.08] focus:border-indigo-500 text-xs font-mono text-slate-100 placeholder:text-slate-600 outline-none transition"
                />
                <p className="text-xs text-slate-500">Only required if using custom project quota.</p>
              </div>

              {/* Muse AI API Key */}
              <div className="glass-panel p-6 rounded-2xl border border-white/[0.08] space-y-4">
                <label className="text-sm font-bold text-white block">Muse AI API Key</label>
                <input
                  type="password"
                  value={museApiKey}
                  onChange={(e) => setMuseApiKey(e.target.value)}
                  placeholder="muse_live_xxxxxxxxxxxxxxxx"
                  className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-white/[0.08] focus:border-indigo-500 text-xs font-mono text-slate-100 placeholder:text-slate-600 outline-none transition"
                />
                <p className="text-xs text-slate-500">Required for routing requests to Muse Spark models.</p>
              </div>

              {/* Thinking Effort Configuration */}
              <div className="glass-panel p-6 rounded-2xl border border-white/[0.08] space-y-4">
                <label className="text-sm font-bold text-white block">Thinking Effort</label>
                <div className="space-y-2">
                  <label className="text-xs text-slate-300 block">Reasoning Level</label>
                  <select
                    value={thinkingLevel}
                    onChange={(e) => setThinkingLevel(normalizeThinkingLevel(e.target.value))}
                    className="w-full bg-slate-900 border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-xs font-mono text-slate-200 outline-none focus:border-indigo-500"
                  >
                    {MUSE_THINKING_LEVELS.map((level) => (
                      <option key={level} value={level}>
                        {level === 'xhigh' || level === 'max'
                          ? `${level} (Muse-only)`
                          : level}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-slate-300 block">Thinking Summaries</label>
                  <select
                    value={thinkingSummaries}
                    onChange={(e) => setThinkingSummaries(normalizeThinkingSummaries(e.target.value))}
                    className="w-full bg-slate-900 border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-xs font-mono text-slate-200 outline-none focus:border-indigo-500"
                  >
                    <option value="auto">auto</option>
                    <option value="enabled">enabled</option>
                    <option value="disabled">disabled</option>
                  </select>
                </div>
                <p className="text-xs text-slate-500">
                  xhigh and max apply to Muse Spark models; Gemini requests map them to high.
                </p>
              </div>

              {/* Exploration Rounds & Timeout */}
              <div className="glass-panel p-6 rounded-2xl border border-white/[0.08] space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
                    <span>Max Exploration Rounds</span>
                    <span className="font-mono text-indigo-400">{maxRounds} rounds</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="4"
                    value={maxRounds}
                    onChange={(e) => setMaxRounds(parseInt(e.target.value, 10))}
                    className="w-full accent-indigo-500 cursor-pointer"
                  />
                </div>

                <div className="space-y-2 pt-4 border-t border-white/[0.06]">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-sky-400" />
                      Request Timeout
                    </span>
                    <span className="font-mono text-sky-400">{requestTimeout}s</span>
                  </div>
                  <input
                    type="range"
                    min="15"
                    max="300"
                    step="15"
                    value={requestTimeout}
                    onChange={(e) => setRequestTimeout(parseInt(e.target.value, 10))}
                    className="w-full accent-sky-500 cursor-pointer"
                  />
                </div>
              </div>

              {/* Search Grounding */}
              <div className="glass-panel p-6 rounded-2xl border border-white/[0.08] space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <label className="text-sm font-bold text-white flex items-center gap-2">
                    <Globe className="w-4 h-4 text-emerald-400" />
                    Search Grounding
                  </label>
                  <button
                    type="button"
                    onClick={() => setSearchGrounding(!searchGrounding)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium font-mono border transition ${
                      searchGrounding
                        ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                        : 'bg-slate-800 border-slate-700 text-slate-500'
                    }`}
                  >
                    {searchGrounding ? 'ENABLED' : 'OFF'}
                  </button>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Real-time web lookups with cited sources. Muse Spark grounds via the Responses API (`web_search`) and Gemini via (`googleSearch`). Ungrounded Muse requests stay on Chat Completions.
                </p>
                <div className="space-y-2">
                  <label className="text-xs text-slate-300 block">Search Context Size</label>
                  <select
                    value={searchContextSize}
                    onChange={(e) => setSearchContextSize(normalizeSearchContextSize(e.target.value))}
                    disabled={!searchGrounding}
                    className="w-full bg-slate-900 border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-xs font-mono text-slate-200 outline-none focus:border-emerald-500 disabled:opacity-40"
                  >
                    {SEARCH_CONTEXT_SIZES.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
