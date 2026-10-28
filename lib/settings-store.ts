import type { AppSettings, ModelConfig } from '@/types';
import { normalizeThinkingLevel, normalizeThinkingSummaries } from './thinking-levels';
import { normalizeSearchContextSize } from './search-grounding';

// Settings persistence, extracted verbatim from useRepoStore: model
// defaults, settings defaults, and stored-settings normalization
// (model backfill, grounding opt-in coercion, thinking-level survival).

export const DEFAULT_MODELS: ModelConfig[] = [
  {
    id: 'muse-spark-1.3-contributor',
    name: 'Muse Spark 1.3 Contributor',
    tag: 'muse-spark-1.3-contributor',
    description: 'Used to improve products ($0.10/M input, $0.20/M output)',
    enabled: true,
    priority: 1,
    inputPricing: '$0.10 per million tokens',
    outputPricing: '$0.20 per million tokens',
  },
  {
    id: 'muse-spark-1.3',
    name: 'Muse Spark 1.3',
    tag: 'muse-spark-1.3',
    description: 'Not used to improve products ($1.25/M input, $4.25/M output)',
    enabled: true,
    priority: 2,
    inputPricing: '$1.25 per million tokens',
    outputPricing: '$4.25 per million tokens',
  },
  {
    id: 'gemini-4-argon',
    name: 'Gemini 4 Argon',
    tag: 'gemini-4-argon',
    description: '$2/M input, $10/M output ($4/M & $20/M after Nov 30, 2026)',
    enabled: true,
    priority: 3,
    inputPricing: '$2 per million tokens ($4 after Nov 30, 2026)',
    outputPricing: '$10 per million tokens ($20 after Nov 30, 2026)',
  },
  {
    id: 'gemini-3.6-flash',
    name: 'Gemini 3.6 Flash',
    tag: 'gemini-3.6-flash',
    description: 'Primary flagship high-throughput model',
    enabled: true,
    priority: 4,
    inputPricing: '$1.35 per million tokens',
    outputPricing: '$6.75 per million tokens',
  },
  {
    id: 'gemini-3.5-flash',
    name: 'Gemini 3.5 Flash',
    tag: 'gemini-3.5-flash',
    description: 'First fallback tier (Rock-solid stability)',
    enabled: true,
    priority: 5,
    inputPricing: '$1.50 per million tokens',
    outputPricing: '$9.00 per million tokens',
  },
  {
    id: 'gemini-3.8-flash',
    name: 'Gemini 3.8 Flash',
    tag: 'gemini-3.8-flash',
    description: 'High reasoning fallback tier',
    enabled: true,
    priority: 6,
    inputPricing: '$0.75 per million tokens',
    outputPricing: '$3.75 per million tokens',
  },
  {
    id: 'gemini-3.5-flash-lite',
    name: 'Gemini 3.5 Flash-Lite',
    tag: 'gemini-3.5-flash-lite',
    description: 'Ultra-lean 500ms fallback tier',
    enabled: true,
    priority: 7,
    inputPricing: '$0.30 per million tokens',
    outputPricing: '$2.50 per million tokens',
  },
];

export const DEFAULT_SETTINGS: AppSettings = {
  githubPat: '',
  customApiKey: '',
  museApiKey: '',
  searchGrounding: false,
  searchContextSize: 'medium',
  thinkingLevel: 'high',
  thinkingSummaries: 'auto',
  preferredModel: 'gemini-4-argon',
  defaultMode: 'agentic',
  maxAgenticRounds: 3,
  routerEngine: 'auto',
  models: DEFAULT_MODELS,
  requestTimeout: 60,
};

// Merges raw stored settings over the defaults: backfills missing Muse /
// Argon models, migrates legacy modes, and coerces grounding + thinking
// levels so opt-ins and Muse-only tiers survive reloads.
export function normalizeStoredSettings(parsed: Record<string, unknown>): AppSettings {
  let models: ModelConfig[] = parsed.models && Array.isArray(parsed.models) && parsed.models.length > 0
    ? (parsed.models as ModelConfig[])
    : DEFAULT_MODELS;

  // Ensure Muse Spark models are present in existing stored settings
  const museDefaults = DEFAULT_MODELS.filter((m) => m.id.startsWith('muse-'));
  for (let i = museDefaults.length - 1; i >= 0; i--) {
    const museDefault = museDefaults[i];
    if (!models.some((m) => m.id === museDefault.id || m.tag === museDefault.tag)) {
      models = [museDefault, ...models];
    }
  }

  // Ensure gemini-4-argon is present in existing stored settings
  const argonDefault = DEFAULT_MODELS.find((m) => m.id === 'gemini-4-argon');
  if (argonDefault && !models.some((m) => m.id === 'gemini-4-argon' || m.tag === 'gemini-4-argon')) {
    models = [argonDefault, ...models];
  }

  if (parsed.defaultMode === 'full') {
    parsed.defaultMode = 'agentic';
  }

  return {
    ...DEFAULT_SETTINGS,
    ...parsed,
    // Grounding is opt-in: only an explicit true survives reloads,
    // and the size is coerced to the low/medium/high union.
    searchGrounding: parsed.searchGrounding === true,
    searchContextSize: normalizeSearchContextSize(
      parsed.searchContextSize,
      DEFAULT_SETTINGS.searchContextSize ?? 'medium'
    ),
    // Accept the full five-level scale (xhigh/max included) —
    // normalize rather than clamp so Muse-only tiers survive reloads.
    thinkingLevel: normalizeThinkingLevel(parsed.thinkingLevel, DEFAULT_SETTINGS.thinkingLevel ?? 'high'),
    thinkingSummaries: normalizeThinkingSummaries(
      parsed.thinkingSummaries,
      DEFAULT_SETTINGS.thinkingSummaries ?? 'auto'
    ),
    models,
  };
}
