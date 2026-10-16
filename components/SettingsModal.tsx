'use client';

import React, { useState } from 'react';
import {
  X,
  Key,
  ShieldCheck,
  Cpu,
  ExternalLink,
  Check,
  AlertCircle,
  Compass,
  Layers,
  Loader2,
  ChevronUp,
  ChevronDown,
  Sparkles,
  RotateCcw,
  Clock,
} from 'lucide-react';
import { AppSettings, RouterEngineType, ModelConfig, IngestionMode } from '@/types';
import { checkGeminiNanoAvailability, warmUpLocalContextRouter } from '@/lib/local-context-router';
import { DEFAULT_MODELS } from '@/hooks/useRepoStore';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSave: (newSettings: Partial<AppSettings>) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSave,
}) => {
  const [pat, setPat] = useState(settings.githubPat || '');
  const [apiKey, setApiKey] = useState(settings.customApiKey || '');

  const [maxRounds, setMaxRounds] = useState<number>(settings.maxAgenticRounds || 3);
  const [requestTimeout, setRequestTimeout] = useState<number>(settings.requestTimeout || 60);
  const [routerEngine, setRouterEngine] = useState<RouterEngineType>(
    settings.routerEngine || 'auto'
  );
  const [nanoStatus, setNanoStatus] = useState<string>('checking...');
  const [isWarmingUp, setIsWarmingUp] = useState(false);
  const [showSavedToast, setShowSavedToast] = useState(false);
  const [warmupNotice, setWarmupNotice] = useState<string | null>(null);

  const [models, setModels] = useState<ModelConfig[]>(() => {
    if (settings.models && settings.models.length > 0) {
      let list = [...settings.models];
      if (!list.some((m) => m.id === 'gemini-4-argon' || m.tag === 'gemini-4-argon')) {
        list = [DEFAULT_MODELS[0], ...list];
      }
      return list.sort((a, b) => a.priority - b.priority);
    }
    return DEFAULT_MODELS;
  });

  const moveModel = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= models.length) return;
    const next = [...models];
    const [moved] = next.splice(index, 1);
    next.splice(targetIndex, 0, moved);
    const updated = next.map((m, idx) => ({ ...m, priority: idx + 1 }));
    setModels(updated);
  };

  const toggleModel = (id: string) => {
    const enabledCount = models.filter((m) => m.enabled).length;
    setModels((prev) =>
      prev.map((m) => {
        if (m.id === id) {
          if (m.enabled && enabledCount <= 1) {
            return m; // Keep at least one enabled model
          }
          return { ...m, enabled: !m.enabled };
        }
        return m;
      })
    );
  };

  const handleResetModels = () => {
    setModels(DEFAULT_MODELS);
  };

  React.useEffect(() => {
    checkGeminiNanoAvailability().then((st) => setNanoStatus(st));
  }, []);

  if (!isOpen) return null;

  const handleSave = () => {
    onSave({
      githubPat: pat.trim(),
      customApiKey: apiKey.trim(),

      maxAgenticRounds: maxRounds,
      routerEngine,
      models,
      preferredModel: models.find((m) => m.enabled)?.tag || 'gemini-4-argon',
      requestTimeout,
    });
    setShowSavedToast(true);
    setTimeout(() => {
      setShowSavedToast(false);
      onClose();
    }, 700);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl glass-panel shadow-2xl border border-slate-700/80 p-6 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
              <Key className="w-4 h-4" />
            </div>
            <h2 className="text-base font-semibold text-white">Compiler Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800/80 transition"
            aria-label="Close Settings"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-5 space-y-5">
          {/* Local AI Context Router Settings */}
          <div className="space-y-3 pt-2 border-t border-slate-800">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-sky-400" />
                Local AI Context Router (In-Browser)
              </label>
              <span className="text-[10px] font-mono text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded border border-sky-500/20">
                0ms Re-Read
              </span>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] text-slate-400 block">Router Engine Preference</label>
              <select
                value={routerEngine}
                onChange={(e) => setRouterEngine(e.target.value as RouterEngineType)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-slate-200 outline-none focus:border-sky-500"
              >
                <option value="auto">Auto (Gemini Nano ➔ Arctic / Qwen)</option>
                <option value="gemini-nano-only">Gemini Nano Only (Chrome Built-in AI)</option>
                <option value="arctic-embed-xs-only">Arctic Embed XS Only (Transformers.js)</option>
                <option value="qwen-0.5b-coder-mlc">Qwen2.5-Coder-0.5B-Instruct (MLC WebGPU)</option>
                <option value="qwen-1.5b-coder-mlc">Qwen2.5-Coder-1.5B-Instruct (MLC WebGPU)</option>
              </select>
            </div>

            <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-300 font-semibold">Chrome Gemini Nano (`window.LanguageModel`)</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-mono ${nanoStatus === 'available' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-800 text-slate-400'}`}>
                  {nanoStatus.toUpperCase()}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-300 font-semibold">Snowflake Arctic-Embed-XS</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-sky-500/10 text-sky-400 border border-sky-500/20">
                  READY (WASM / FP32)
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-300 font-semibold">Qwen2.5-Coder (WebGPU MLC)</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  READY (WebGPU)
                </span>
              </div>

              <div className="pt-2 flex flex-col gap-2 border-t border-white/[0.08]">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-400">Pre-warm embedding pipeline &amp; session</span>
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
                    className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium text-[11px] transition flex items-center gap-1 disabled:opacity-50"
                  >
                    {isWarmingUp ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>Warming Up...</span>
                      </>
                    ) : (
                      <span>Warm Up Local AI</span>
                    )}
                  </button>
                </div>
                {warmupNotice && (
                  <p className="text-[11px] text-sky-300 font-mono bg-sky-950/40 p-2 rounded-lg border border-sky-500/20">
                    {warmupNotice}
                  </p>
                )}
              </div>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Next.js Expert utilizes an in-browser local context router to instantly index repository skeletons (~20 tokens/file) and route relevant file paths in milliseconds without sending raw code bodies to cloud APIs.
            </p>
          </div>

          {/* Max Agentic Rounds */}
          <div className="space-y-1.5 p-3 rounded-xl bg-slate-900/70 border border-slate-800">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-300">Max Exploration Rounds</span>
              <span className="font-mono text-indigo-400 font-bold">{maxRounds} rounds</span>
            </div>
            <input
              type="range"
              min="1"
              max="4"
              value={maxRounds}
              onChange={(e) => setMaxRounds(parseInt(e.target.value, 10))}
              className="w-full accent-indigo-500 cursor-pointer"
            />
            <p className="text-[10px] text-slate-500">
              Number of sequential investigation turns the agent can take to examine deep dependencies.
            </p>
          </div>

          {/* Request Timeout Setting */}
          <div className="space-y-1.5 p-3 rounded-xl bg-slate-900/70 border border-slate-800">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-sky-400" />
                Request &amp; Stream Timeout
              </span>
              <span className="font-mono text-sky-400 font-bold">{requestTimeout} seconds</span>
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
            <div className="flex items-center justify-between text-[10px] text-slate-500">
              <span>15s</span>
              <span>60s (Default)</span>
              <span>300s (5m)</span>
            </div>
            <p className="text-[10px] text-slate-400 leading-relaxed">
              Maximum wait time for AI model responses and stream chunks before timing out. Increase this if compilation requests timeout.
            </p>
          </div>

          {/* Model Priority & Fallback Waterfall */}
          <div className="space-y-3 pt-2 border-t border-slate-800">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-indigo-400" />
                Model Priority &amp; Fallback Waterfall
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleResetModels}
                  className="text-[10px] text-slate-400 hover:text-indigo-300 flex items-center gap-1 transition"
                  title="Reset to default priority sequence"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset</span>
                </button>
                <span className="text-[10px] font-mono text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                  Includes Gemini 4 Argon
                </span>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed">
              Use arrows to adjust priority ordering or toggle models on/off. If a model encounters quota or transient errors, the compiler cascades to the next active model in sequence.
            </p>

            <div className="space-y-2">
              {models.map((model, idx) => (
                <div
                  key={model.id}
                  className={`p-3 rounded-xl border transition-all ${
                    model.enabled
                      ? model.id === 'gemini-4-argon'
                        ? 'bg-indigo-950/40 border-indigo-500/40'
                        : 'bg-slate-900/90 border-slate-800'
                      : 'bg-slate-950/60 border-slate-900 opacity-60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {/* Priority Badge */}
                      <span
                        className={`w-6 h-6 rounded-lg text-xs font-mono font-bold flex items-center justify-center flex-shrink-0 ${
                          model.enabled
                            ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/40'
                            : 'bg-slate-800 text-slate-500 border border-slate-700/50'
                        }`}
                      >
                        #{idx + 1}
                      </span>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`text-xs font-semibold ${
                              model.enabled ? 'text-white' : 'text-slate-400 line-through'
                            }`}
                          >
                            {model.name}
                          </span>
                          <span className="font-mono text-[10px] text-indigo-400 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                            {model.tag}
                          </span>
                          {model.id === 'gemini-4-argon' && (
                            <span className="text-[9px] font-semibold bg-gradient-to-r from-amber-500/20 to-indigo-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded flex items-center gap-1">
                              <Sparkles className="w-2.5 h-2.5 text-amber-400" />
                              <span>Argon Tier</span>
                            </span>
                          )}
                        </div>

                        {/* Pricing details */}
                        {model.id === 'gemini-4-argon' ? (
                          <div className="mt-1 text-[10px] font-mono text-emerald-400 bg-emerald-950/40 border border-emerald-500/20 px-2 py-0.5 rounded-md inline-block">
                            $2/M input, $10/M output ($4/M &amp; $20/M after Nov 30, 2026)
                          </div>
                        ) : model.inputPricing && model.outputPricing ? (
                          <div className="mt-1 text-[10px] font-mono text-slate-400">
                            {model.inputPricing} in &bull; {model.outputPricing} out
                          </div>
                        ) : null}

                        {model.description && model.id !== 'gemini-4-argon' && (
                          <p className="text-[11px] text-slate-400 mt-0.5">{model.description}</p>
                        )}
                      </div>
                    </div>

                    {/* Controls: Reorder buttons & Enable toggle */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <div className="flex flex-col gap-0.5">
                        <button
                          type="button"
                          onClick={() => moveModel(idx, 'up')}
                          disabled={idx === 0}
                          className="p-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300 disabled:hover:bg-slate-800 transition"
                          title="Move Up in Priority"
                        >
                          <ChevronUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveModel(idx, 'down')}
                          disabled={idx === models.length - 1}
                          className="p-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300 disabled:hover:bg-slate-800 transition"
                          title="Move Down in Priority"
                        >
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => toggleModel(model.id)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium font-mono border transition ${
                          model.enabled
                            ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25'
                            : 'bg-slate-800/80 border-slate-700 text-slate-500 hover:text-slate-400'
                        }`}
                        title={model.enabled ? 'Model Active in Cascade' : 'Model Disabled'}
                      >
                        {model.enabled ? 'ENABLED' : 'OFF'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* GitHub PAT Section */}
          <div className="space-y-2 pt-2 border-t border-slate-800">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
                GitHub Personal Access Token (PAT)
              </label>
              <a
                href="https://github.com/settings/tokens/new?scopes=repo&description=Antigravity+Prompt+Compiler"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
              >
                Generate Token <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <input
              type="password"
              value={pat}
              onChange={(e) => setPat(e.target.value)}
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-slate-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-xs font-mono text-slate-100 placeholder:text-slate-600 outline-none transition"
            />
            <div className="flex items-start gap-1.5 text-[11px] text-slate-400 leading-relaxed">
              <AlertCircle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
              <span>
                Optional for public repos. Highly recommended to bypass GitHub&apos;s 60 req/hr anonymous rate limit and required for private repos. Stored securely in your browser&apos;s local storage.
              </span>
            </div>
          </div>

          {/* Custom API Key Override */}
          <div className="space-y-1.5 pt-2 border-t border-slate-800">
            <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
              <span>Custom Gemini API Key Override</span>
              <span className="text-[10px] text-slate-500 font-normal">Optional</span>
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="AIzaSy... (Leave empty to use AI Studio environment key)"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-slate-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-xs font-mono text-slate-100 placeholder:text-slate-600 outline-none transition"
            />
            <p className="text-[10px] text-slate-500">
              Only required if running outside AI Studio or using a custom Google Cloud project quota.
            </p>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2.5 pt-4 border-t border-slate-800">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800/60 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={showSavedToast}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium shadow-md shadow-indigo-600/30 transition disabled:opacity-50"
          >
            {showSavedToast ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-300" />
                <span>Saved!</span>
              </>
            ) : (
              <span>Save Settings</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
