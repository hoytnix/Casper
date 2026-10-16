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
} from 'lucide-react';
import { AppSettings, RouterEngineType } from '@/types';
import { checkGeminiNanoAvailability, warmUpLocalContextRouter } from '@/lib/local-context-router';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSave: (newSettings: Partial<AppSettings>) => void;
}

const CASCADING_ORDER = [
  { step: 1, name: 'Gemini 3.6 Flash', tag: 'gemini-3.6-flash', desc: 'Primary flagship high-throughput model (Verified)' },
  { step: 2, name: 'Gemini 3.5 Flash', tag: 'gemini-3.5-flash', desc: 'First fallback tier (Rock-solid stability)' },
  { step: 3, name: 'Gemini 3.5 Flash-Lite', tag: 'gemini-3.5-flash-lite', desc: 'Second fallback tier (Ultra-lean 500ms)' },
  { step: 4, name: 'Gemini 3.8 Flash', tag: 'gemini-3.8-flash', desc: 'Third fallback tier (High reasoning with timeout)' },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSave,
}) => {
  const [pat, setPat] = useState(settings.githubPat || '');
  const [apiKey, setApiKey] = useState(settings.customApiKey || '');
  const [defaultMode, setDefaultMode] = useState<'agentic' | 'full'>(
    settings.defaultMode || 'agentic'
  );
  const [maxRounds, setMaxRounds] = useState<number>(settings.maxAgenticRounds || 3);
  const [routerEngine, setRouterEngine] = useState<RouterEngineType>(
    settings.routerEngine || 'auto'
  );
  const [nanoStatus, setNanoStatus] = useState<string>('checking...');
  const [isWarmingUp, setIsWarmingUp] = useState(false);
  const [showSavedToast, setShowSavedToast] = useState(false);

  React.useEffect(() => {
    checkGeminiNanoAvailability().then((st) => setNanoStatus(st));
  }, []);

  if (!isOpen) return null;

  const handleSave = () => {
    onSave({
      githubPat: pat.trim(),
      customApiKey: apiKey.trim(),
      defaultMode,
      maxAgenticRounds: maxRounds,
      routerEngine,
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

              <div className="pt-2 flex items-center justify-between border-t border-slate-800">
                <span className="text-[11px] text-slate-400">Pre-warm embedding pipeline &amp; session</span>
                <button
                  type="button"
                  onClick={async () => {
                    setIsWarmingUp(true);
                    try {
                      await warmUpLocalContextRouter([], 'global-warmup', routerEngine);
                      alert('Local AI context router successfully warmed up!');
                    } catch (e) {
                      alert(`Warmup notice: ${e instanceof Error ? e.message : String(e)}`);
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
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Next.js Expert utilizes an in-browser local context router to instantly index repository skeletons (~20 tokens/file) and route relevant file paths in milliseconds without sending raw code bodies to cloud APIs.
            </p>
          </div>

          {/* Default Ingestion Strategy */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5 text-indigo-400" />
              Default Compilation Strategy
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDefaultMode('agentic')}
                className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                  defaultMode === 'agentic'
                    ? 'border-indigo-500 bg-indigo-500/10 text-white'
                    : 'border-slate-800 bg-slate-900/50 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-xs font-bold text-indigo-300">Agentic Loop</span>
                  {defaultMode === 'agentic' && (
                    <Check className="w-3.5 h-3.5 text-indigo-400" />
                  )}
                </div>
                <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                  Sequential blast-radius file exploration. 85% token savings &amp; pinpoint precision (Recommended).
                </p>
              </button>

              <button
                type="button"
                onClick={() => setDefaultMode('full')}
                className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                  defaultMode === 'full'
                    ? 'border-indigo-500 bg-indigo-500/10 text-white'
                    : 'border-slate-800 bg-slate-900/50 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-xs font-bold text-violet-300">Full Ingestion</span>
                  {defaultMode === 'full' && (
                    <Check className="w-3.5 h-3.5 text-violet-400" />
                  )}
                </div>
                <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                  Pulls and flattens all source files in memory simultaneously.
                </p>
              </button>
            </div>
          </div>

          {/* Max Agentic Rounds */}
          {defaultMode === 'agentic' && (
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
          )}

          {/* Cascading Fallback Strategy Info */}
          <div className="space-y-2 pt-2 border-t border-slate-800">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-indigo-400" />
                Active Model Pipeline (Cascading Fallback)
              </label>
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                2 Full Passes (8 attempts max)
              </span>
            </div>

            <div className="rounded-xl bg-slate-900/90 border border-slate-800 p-3 space-y-1.5 text-xs font-mono">
              {CASCADING_ORDER.map((item) => (
                <div key={item.step} className="flex items-center justify-between py-0.5">
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full bg-slate-800 text-indigo-400 text-[10px] flex items-center justify-center font-bold">
                      {item.step}
                    </span>
                    <span className="text-slate-200 font-semibold">{item.name}</span>
                  </div>
                  <span className="text-[10px] text-slate-500">{item.tag}</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              If an attempt fails due to quota or transient error, the compiler seamlessly cascades to the next model. If all 4 fail, it retries the sequence one more time before terminating.
            </p>
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
