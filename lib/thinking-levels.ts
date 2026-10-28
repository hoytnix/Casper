import type {
  GeminiThinkingLevel,
  MuseThinkingLevel,
  ThinkingLevel,
  ThinkingSummaryMode,
} from '@/types';

/**
 * Thinking effort levels by provider.
 *
 * Gemini's `thinkingConfig.thinkingLevel` only accepts low/medium/high.
 * Muse Spark extends the scale with `xhigh` and `max` for deeper reasoning.
 * The shared `ThinkingLevel` union covers all five so one setting can drive
 * both providers; the Gemini path maps the Muse-only tiers down to `high`.
 */
export const MUSE_THINKING_LEVELS: readonly MuseThinkingLevel[] = [
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
];

export const GEMINI_THINKING_LEVELS: readonly GeminiThinkingLevel[] = [
  'low',
  'medium',
  'high',
];

export const MUSE_ONLY_THINKING_LEVELS: readonly MuseThinkingLevel[] = ['xhigh', 'max'];

export const THINKING_SUMMARY_MODES: readonly ThinkingSummaryMode[] = [
  'auto',
  'enabled',
  'disabled',
];

export function isThinkingLevel(value: unknown): value is ThinkingLevel {
  return (
    typeof value === 'string' &&
    (MUSE_THINKING_LEVELS as readonly string[]).includes(value.toLowerCase().trim())
  );
}

export function isMuseOnlyThinkingLevel(level: ThinkingLevel): boolean {
  return level === 'xhigh' || level === 'max';
}

/**
 * Accepts all five levels (`low` → `max`); anything else falls back.
 * Case/whitespace-insensitive. Stored settings validated through here keep
 * `xhigh`/`max` intact instead of being clamped to `high`.
 */
export function normalizeThinkingLevel(value: unknown, fallback: ThinkingLevel = 'high'): ThinkingLevel {
  if (typeof value === 'string') {
    const norm = value.toLowerCase().trim() as ThinkingLevel;
    if (isThinkingLevel(norm)) return norm;
  }
  return fallback;
}

export function normalizeThinkingSummaries(
  value: unknown,
  fallback: ThinkingSummaryMode = 'auto'
): ThinkingSummaryMode {
  if (typeof value === 'string') {
    const norm = value.toLowerCase().trim() as ThinkingSummaryMode;
    if ((THINKING_SUMMARY_MODES as readonly string[]).includes(norm)) return norm;
  }
  return fallback;
}

/**
 * Gemini supports only low/medium/high — Muse-only `xhigh`/`max` map to
 * `high` so the same setting never breaks the Gemini cascade.
 */
export function resolveGeminiThinkingLevel(level: ThinkingLevel): GeminiThinkingLevel {
  if (level === 'xhigh' || level === 'max') return 'high';
  return level;
}

export function buildGeminiThinkingConfig(
  level: ThinkingLevel,
  summaries: ThinkingSummaryMode
): { thinkingLevel: GeminiThinkingLevel; thinkingSummaries: ThinkingSummaryMode } {
  return {
    thinkingLevel: resolveGeminiThinkingLevel(level),
    thinkingSummaries: summaries,
  };
}

/**
 * Muse Spark generation-config fragment carrying the full five-level scale.
 * `reasoning_effort` matches the OpenAI-style chat-completions convention
 * while `thinkingConfig` preserves the explicit level + summaries pairing.
 */
export function buildMuseThinkingPayload(
  level: ThinkingLevel,
  summaries: ThinkingSummaryMode
): { reasoning_effort: MuseThinkingLevel; thinkingConfig: { thinkingLevel: MuseThinkingLevel; thinkingSummaries: ThinkingSummaryMode } } {
  return {
    reasoning_effort: level,
    thinkingConfig: { thinkingLevel: level, thinkingSummaries: summaries },
  };
}
