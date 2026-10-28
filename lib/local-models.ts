import type { LocalModelFit, LocalModelSpec, RouterEngineType } from '@/types';

// Single source of truth for the Settings local-judge registry.
// Pure data + helpers: no fetch, no window, importable from client
// Settings and routers. All sizes/RAM are approximate short-context
// estimates, not vendor minimums; see SHORT_CONTEXT_NOTE.

export const DEFAULT_LOCAL_CONTEXT_TOKENS = 1536;
export const MIN_LOCAL_CONTEXT_TOKENS = 1024;
export const MAX_LOCAL_CONTEXT_TOKENS = 2048;
export const DEFAULT_LOCAL_MODEL_ID: RouterEngineType = 'qwen3-0.6b-int4';

export const SHORT_CONTEXT_NOTE =
  'Assumes short context at 1536 tokens; long context increases RAM use.';

export const LOCAL_ENGINE_VALUES: RouterEngineType[] = [
  'auto',
  'gemini-nano-only',
  'arctic-embed-xs-only',
  'qwen-0.5b-coder-mlc',
  'qwen-1.5b-coder-mlc',
  'qwen3-0.6b-int4',
  'llama-3.2-1b-int4',
  'smollm2-1.7b-int4',
  'smollm2-360m-int4',
  'gemma-3-270m-int4',
];

const GENERATION_ENGINE_VALUES: RouterEngineType[] = [
  'qwen-0.5b-coder-mlc',
  'qwen-1.5b-coder-mlc',
  'qwen3-0.6b-int4',
  'llama-3.2-1b-int4',
  'smollm2-1.7b-int4',
  'smollm2-360m-int4',
  'gemma-3-270m-int4',
];

export const LOCAL_MODELS: LocalModelSpec[] = [
  {
    id: 'auto',
    displayName: 'Auto (default judge cascade)',
    paramsLabel: 'selector',
    quantizationLabel: 'int4',
    downloadSizeApprox: 'varies by resolved engine',
    ramTotalApproxShortContext: 'varies by resolved engine',
    ramNote: SHORT_CONTEXT_NOTE,
    minDeviceGuidance: '4GB system RAM, integrated graphics OK',
    fitBadge: 'FITS',
    runtimeLabel: 'Automatic (resolves to Qwen3 0.6B int4)',
    bestFor: 'Hands-off default; resolves to the default local judge.',
    verified: true,
  },
  {
    id: 'qwen3-0.6b-int4',
    displayName: 'Qwen3 0.6B',
    paramsLabel: '0.6B',
    quantizationLabel: 'int4',
    downloadSizeApprox: 'approx. 0.5GB',
    ramTotalApproxShortContext: 'approx. 0.8-1.0GB total short prompt',
    ramNote: SHORT_CONTEXT_NOTE,
    minDeviceGuidance: '4GB system RAM, integrated graphics OK',
    fitBadge: 'FITS',
    runtimeLabel: 'MLC WebGPU',
    bestFor: 'Main relevance judge (default). Non-thinking mode, JSON only.',
    warning: 'int4 only; keep context at 1536; close other tabs on 4GB devices.',
    verified: true,
    mlcModelId: 'Qwen3-0.6B-q4f16_1-MLC',
  },
  {
    id: 'llama-3.2-1b-int4',
    displayName: 'Llama 3.2 1B Instruct',
    paramsLabel: '1B',
    quantizationLabel: 'int4',
    downloadSizeApprox: 'approx. 0.75GB weights',
    ramTotalApproxShortContext: 'approx. 1.2GB total short prompt',
    ramNote: SHORT_CONTEXT_NOTE,
    minDeviceGuidance: '4GB system RAM, integrated graphics OK',
    fitBadge: 'FITS',
    runtimeLabel: 'MLC WebGPU',
    bestFor: 'Next step up from Qwen3 0.6B when it under-selects.',
    warning: 'FITS under 2GB only with short context; int4 only; keep context at 1536.',
    verified: true,
    mlcModelId: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
  },
  {
    id: 'smollm2-360m-int4',
    displayName: 'SmolLM2 360M Instruct',
    paramsLabel: '360M',
    quantizationLabel: 'int4',
    downloadSizeApprox: 'approx. 0.26GB',
    ramTotalApproxShortContext: 'approx. 0.4-0.5GB total short prompt',
    ramNote: SHORT_CONTEXT_NOTE,
    minDeviceGuidance: '4GB system RAM, integrated graphics OK',
    fitBadge: 'TINY_FILTER',
    runtimeLabel: 'MLC WebGPU',
    bestFor: 'Fastest tiny filter; discard obviously irrelevant files before a larger model.',
    warning: 'Weakest judge; int4 only; keep context at 1536.',
    verified: true,
    mlcModelId: 'SmolLM2-360M-Instruct-q4f16_1-MLC',
  },
  {
    id: 'smollm2-1.7b-int4',
    displayName: 'SmolLM2 1.7B Instruct',
    paramsLabel: '1.7B',
    quantizationLabel: 'int4',
    downloadSizeApprox: 'approx. 1.0-1.1GB weights',
    ramTotalApproxShortContext: 'approx. 1.5-1.8GB total short prompt',
    ramNote: SHORT_CONTEXT_NOTE,
    minDeviceGuidance: '6GB+ system RAM recommended; 4GB devices stay at 1536 tokens',
    fitBadge: 'CEILING',
    runtimeLabel: 'MLC WebGPU',
    bestFor: 'Strongest local judge; can exceed 2GB with long context or other tabs open.',
    warning: 'CEILING: long context or a second resident tab can push it over 2GB; keep context at 1536.',
    verified: true,
    mlcModelId: 'SmolLM2-1.7B-Instruct-q4f16_1-MLC',
  },
  {
    id: 'gemma-3-270m-int4',
    displayName: 'Gemma 3 270M IT',
    paramsLabel: '270M',
    quantizationLabel: 'int4',
    downloadSizeApprox: 'approx. 0.25-0.3GB',
    ramTotalApproxShortContext: 'unmeasured (load blocked)',
    ramNote: SHORT_CONTEXT_NOTE,
    minDeviceGuidance: '4GB system RAM, integrated graphics OK (once unblocked)',
    fitBadge: 'BLOCKED',
    runtimeLabel: 'transformers.js (ONNX, blocked)',
    bestFor: 'Tiny filter class; currently unavailable behind Gemma license gating.',
    warning: 'Gated: Gemma license acceptance required; anonymous browser download is blocked.',
    gated: true,
    verified: false,
    onnxModelId: 'onnx-community/gemma-3-270m-it-ONNX',
  },
  {
    id: 'qwen-0.5b-coder-mlc',
    displayName: 'Qwen2.5-Coder 0.5B',
    paramsLabel: '0.5B',
    quantizationLabel: 'int4',
    downloadSizeApprox: 'approx. 0.4GB',
    ramTotalApproxShortContext: 'approx. 0.6-0.8GB total short prompt',
    ramNote: SHORT_CONTEXT_NOTE,
    minDeviceGuidance: '4GB system RAM, integrated graphics OK',
    fitBadge: 'FITS',
    runtimeLabel: 'MLC WebGPU',
    bestFor: 'Legacy tiny coder judge.',
    warning: 'int4 only; keep context at 1536.',
    verified: true,
    mlcModelId: 'Qwen2.5-Coder-0.5B-Instruct-q4f16_1-MLC',
  },
  {
    id: 'qwen-1.5b-coder-mlc',
    displayName: 'Qwen2.5-Coder 1.5B',
    paramsLabel: '1.5B',
    quantizationLabel: 'int4',
    downloadSizeApprox: 'approx. 1.0GB weights',
    ramTotalApproxShortContext: 'approx. 1.4-1.6GB total short prompt (borderline)',
    ramNote: SHORT_CONTEXT_NOTE,
    minDeviceGuidance: '4GB system RAM minimum; close other tabs',
    fitBadge: 'FITS',
    runtimeLabel: 'MLC WebGPU',
    bestFor: 'Legacy stronger coder judge.',
    warning: 'Borderline under 2GB: q8 or fp16, long context, or a second resident model can push it over 2GB.',
    verified: true,
    mlcModelId: 'Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC',
  },
  {
    id: 'arctic-embed-xs-only',
    displayName: 'Arctic Embed XS',
    paramsLabel: 'XS',
    quantizationLabel: 'int4',
    downloadSizeApprox: 'approx. 0.09GB embedding weights',
    ramTotalApproxShortContext: 'approx. 0.2GB total',
    ramNote: SHORT_CONTEXT_NOTE,
    minDeviceGuidance: '4GB system RAM, integrated graphics OK',
    fitBadge: 'EMBEDDING_ONLY',
    runtimeLabel: 'transformers.js (WebGPU / WASM fallback)',
    bestFor: 'Retrieval / first-pass scoring only, not a relevance judge.',
    verified: true,
  },
  {
    id: 'gemini-nano-only',
    displayName: 'Gemini Nano',
    paramsLabel: 'built-in',
    quantizationLabel: 'int4',
    downloadSizeApprox: 'no separate download (Chrome built-in)',
    ramTotalApproxShortContext: 'browser-managed',
    ramNote: SHORT_CONTEXT_NOTE,
    minDeviceGuidance: 'Chrome with built-in AI enabled; rarely available',
    fitBadge: 'CHROME_BUILTIN',
    runtimeLabel: 'Chrome built-in',
    bestFor: 'On-device prompting when Chrome exposes it; never the default.',
    warning: 'Availability varies; never default.',
    verified: true,
  },
];

export function getLocalModelSpec(id: string | undefined | null): LocalModelSpec | undefined {
  if (!id) return undefined;
  return LOCAL_MODELS.find((m) => m.id === id);
}

export function getFittingModelsUnder2GB(): LocalModelSpec[] {
  return LOCAL_MODELS.filter((m) => m.fitBadge === 'FITS' || m.fitBadge === 'TINY_FILTER');
}

export function isTinyFilter(id: string | undefined | null): boolean {
  return getLocalModelSpec(id)?.fitBadge === 'TINY_FILTER';
}

export function requiresGatingNotice(id: string | undefined | null): boolean {
  return getLocalModelSpec(id)?.gated === true;
}

export function isLocalGenerationEngine(id: string | undefined | null): id is RouterEngineType {
  return !!id && (GENERATION_ENGINE_VALUES as string[]).includes(id);
}

export function isKnownRouterEngine(id: unknown): id is RouterEngineType {
  return typeof id === 'string' && (LOCAL_ENGINE_VALUES as string[]).includes(id);
}

export function validateLocalContextTokens(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_LOCAL_CONTEXT_TOKENS;
  return Math.min(MAX_LOCAL_CONTEXT_TOKENS, Math.max(MIN_LOCAL_CONTEXT_TOKENS, Math.round(n)));
}

const FORBIDDEN_QUANTIZATIONS = ['q8', 'fp16', 'q4f32'];

export function assertAllowedQuantization(quant: string, source: string): void {
  if ((FORBIDDEN_QUANTIZATIONS as string[]).includes(quant)) {
    throw new Error(`Forbidden browser-path quantization "${quant}" in ${source}: int4 only.`);
  }
}

export function validateRegistryQuantizations(): void {
  for (const spec of LOCAL_MODELS) {
    assertAllowedQuantization(spec.quantizationLabel, `LocalModelSpec ${spec.id}`);
  }
}

validateRegistryQuantizations();
