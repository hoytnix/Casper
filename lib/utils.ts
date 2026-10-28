import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { ChatMessage, ModelPricingTier } from "@/types"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Robustly parses and extracts suggested refactor directives from compiled prompt text.
 * Splices out the delimiter `---SUGGESTED_REFACTORS---` (and any trailing variant / JSON array / fences)
 * returning cleanPrompt without any plaintext leakage, and an array of up to 4 refactor prompt strings.
 */
export function extractSuggestedRefactors(text: string): { cleanPrompt: string; refactors: string[] } {
  if (!text) return { cleanPrompt: '', refactors: [] };

  // Match delimiter like ---SUGGESTED_REFACTORS--- or --- SUGGESTED_REFACTORS --- with any suffix
  const delimiterRegex = /(?:[\r\n\s]+)?---+[\s*]*SUGGESTED_REFACTORS[\s*]*---+([\s\S]*)$/i;
  const match = text.match(delimiterRegex);

  let cleanPrompt = text;
  let refactors: string[] = [];

  if (match && match.index !== undefined) {
    cleanPrompt = text.slice(0, match.index).trim();
    const rawSuffix = (match[1] || '').trim();

    if (rawSuffix) {
      // 1. Try finding complete JSON array [ ... ]
      const startBracket = rawSuffix.indexOf('[');
      const endBracket = rawSuffix.lastIndexOf(']');
      if (startBracket !== -1 && endBracket !== -1 && endBracket > startBracket) {
        const jsonBlock = rawSuffix.slice(startBracket, endBracket + 1);
        try {
          const parsed = JSON.parse(jsonBlock);
          if (Array.isArray(parsed)) {
            refactors = parsed
              .filter((r) => typeof r === 'string' && r.trim().length > 0)
              .map((r) => r.trim())
              .slice(0, 4);
          }
        } catch {
          // If JSON.parse fails (e.g. unescaped quotes or trailing commas), fallback to regex string extraction
          const matches = Array.from(jsonBlock.matchAll(/"([^"\\]*(?:\\.[^"\\]*)*)"/g))
            .map((m) => m[1].replace(/\\"/g, '"').trim())
            .filter((s) => s.length > 5);
          if (matches.length > 0) {
            refactors = matches.slice(0, 4);
          }
        }
      } else {
        // Fallback: check if quotes exist in rawSuffix
        const matches = Array.from(rawSuffix.matchAll(/"([^"\\]*(?:\\.[^"\\]*)*)"/g))
          .map((m) => m[1].replace(/\\"/g, '"').trim())
          .filter((s) => s.length > 5);
        if (matches.length > 0) {
          refactors = matches.slice(0, 4);
        }
      }
    }
  } else {
    // Check if in-flight streaming has started outputting the delimiter at the very end
    const partialMatch = text.match(/(?:[\r\n\s]+)?---+[\s*]*SUGGESTED[A-Z_0-9-]*[\s*-]*$/i);
    if (partialMatch && partialMatch.index !== undefined) {
      cleanPrompt = text.slice(0, partialMatch.index).trim();
    }
  }

  return { cleanPrompt, refactors };
}

/**
 * Sanitizes and formats the compiled execution prompt.
 * Strips SUGGESTED_REFACTORS delimiter and trailing JSON/plaintext completely.
 * Strips outer enclosing code fences (e.g. ````markdown ... ````, ```markdown ... ```, or ``markdown ... ``)
 * and stray leading/trailing backticks while preserving all internal code blocks, @[/paths], and formatting.
 */
export function formatCompiledPrompt(content: string): string {
  if (!content) return '';

  // Step 1: Splice out any SUGGESTED_REFACTORS delimiter and trailing metadata
  const { cleanPrompt } = extractSuggestedRefactors(content);
  let cleaned = cleanPrompt.trim();

  // Step 2: Pattern 1: Exact outer code block with 2, 3, 4, or 5 backticks or tildes with optional markdown/md tag
  const fullBlockRegex = /^(`{2,5}|~{2,5})(?:markdown|md)?\s*[\r\n]+([\s\S]*?)[\r\n]+\s*\1\s*$/i;
  const match = cleaned.match(fullBlockRegex);
  if (match && match[2]) {
    cleaned = match[2].trim();
  } else {
    // Pattern 2: Strip leading fence (2-5 backticks/tildes with optional markdown/md tag)
    // Handles in-flight streams or mismatched backticks (e.g. 4 at start, 2 at end)
    cleaned = cleaned.replace(/^(`{2,5}|~{2,5})(?:markdown|md)?(?:\s*[\r\n]|\s+|$)/i, '');

    // Pattern 3: Strip trailing fence on its own line
    cleaned = cleaned.replace(/[\r\n]+\s*(`{2,5}|~{2,5})\s*$/i, '');

    // Pattern 4: Strip trailing stray backticks attached to or following text on the final line
    cleaned = cleaned.replace(/(?:\s+|(?<=[^\s]))(`{2,5}|~{2,5})\s*$/i, '');
  }

  // Step 3: Final check to remove any trailing partial delimiter that might have been inside code fences
  cleaned = cleaned.replace(/(?:[\r\n\s]+)?---+[\s*]*SUGGESTED(?:_REFACTORS)?[\s\S]*$/i, '').trim();

  return cleaned.trim();
}

/**
 * Dynamic Model Pricing Tiers ($ per 1 Million Tokens)
 * - Muse Spark 1.3 Contributor: $0.10/M input, $0.20/M output
 * - Muse Spark 1.3: $1.25/M input, $4.25/M output
 * - Gemini 4 Argon: $2.00/M input, $10.00/M output ($4/M & $20/M after Nov 30, 2026)
 * - Gemini 3.8 Flash: $0.75/M input, $3.75/M output
 * - Gemini 3.5 Flash: $1.50/M input, $9.00/M output
 * - Gemini 3.5 Flash-Lite: $0.30/M input, $2.50/M output
 * - Gemini 3.6 Flash: $1.35/M input, $6.75/M output
 *
 * Cached input reads bill at `cachedInputCostPerMillion`. Repo convention: 10%
 * of the standard input rate per tier (mirrors the provider cached-read ratio).
 */
const isAfterNov30_2026 = typeof window !== 'undefined' || typeof process !== 'undefined'
  ? new Date() > new Date('2026-11-30T23:59:59Z')
  : false;

export const MODEL_PRICING_TIERS: Record<string, ModelPricingTier> = {
  'muse-spark-1.3-contributor': {
    name: 'Muse Spark 1.3 Contributor',
    inputCostPerMillion: 0.10,
    cachedInputCostPerMillion: 0.01,
    outputCostPerMillion: 0.20,
  },
  'muse-spark-1.3': {
    name: 'Muse Spark 1.3',
    inputCostPerMillion: 1.25,
    cachedInputCostPerMillion: 0.125,
    outputCostPerMillion: 4.25,
  },
  'gemini-4-argon': {
    name: 'Gemini 4 Argon',
    inputCostPerMillion: isAfterNov30_2026 ? 4.00 : 2.00,
    cachedInputCostPerMillion: isAfterNov30_2026 ? 0.40 : 0.20,
    outputCostPerMillion: isAfterNov30_2026 ? 20.00 : 10.00,
  },
  'gemini-3.8-flash': {
    name: 'Gemini 3.8 Flash',
    inputCostPerMillion: 0.75,
    cachedInputCostPerMillion: 0.075,
    outputCostPerMillion: 3.75,
  },
  'gemini-3.5-flash': {
    name: 'Gemini 3.5 Flash',
    inputCostPerMillion: 1.50,
    cachedInputCostPerMillion: 0.15,
    outputCostPerMillion: 9.00,
  },
  'gemini-3.5-flash-lite': {
    name: 'Gemini 3.5 Flash-Lite',
    inputCostPerMillion: 0.30,
    cachedInputCostPerMillion: 0.03,
    outputCostPerMillion: 2.50,
  },
  'gemini-3.6-flash': {
    name: 'Gemini 3.6 Flash',
    inputCostPerMillion: 1.35,
    cachedInputCostPerMillion: 0.135,
    outputCostPerMillion: 6.75,
  },
};

/**
 * Normalizes and resolves a given model string to its corresponding pricing tier.
 */
export function resolveModelPricing(modelName: string): ModelPricingTier {
  const norm = (modelName || '').toLowerCase().replace(/^(models\/)/, '').replace(/[\s_]+/g, '-');
  // Exact or prefix precedence for Muse Spark models before general Gemini checks
  if (norm.includes('muse-spark-1.3-contributor') || norm.includes('contributor')) {
    return MODEL_PRICING_TIERS['muse-spark-1.3-contributor'];
  }
  if (norm.includes('muse-spark-1.3') || norm.startsWith('muse-') || norm === 'muse' || norm.includes('muse')) {
    return MODEL_PRICING_TIERS['muse-spark-1.3'];
  }
  if (norm.includes('argon') || norm.includes('gemini-4') || norm.includes('gemini-4-argon')) {
    return MODEL_PRICING_TIERS['gemini-4-argon'];
  }
  if (norm.includes('3.5-flash-lite') || norm.includes('lite')) {
    return MODEL_PRICING_TIERS['gemini-3.5-flash-lite'];
  }
  if (norm.includes('3.8-flash') || norm.includes('3.8')) {
    return MODEL_PRICING_TIERS['gemini-3.8-flash'];
  }
  if (norm.includes('3.6-flash') || norm.includes('3.6')) {
    return MODEL_PRICING_TIERS['gemini-3.6-flash'];
  }
  if (norm.includes('3.5-flash') || norm.includes('3.5')) {
    return MODEL_PRICING_TIERS['gemini-3.5-flash'];
  }
  // Default to Gemini 4 Argon or Gemini 3.8 Flash
  return MODEL_PRICING_TIERS['gemini-4-argon'];
}

/**
 * Computes dynamic API costs based on model pricing tiers and token counts.
 * `cachedInputTokens` (clamped to [0, inputTokens]) bill at the tier's
 * `cachedInputCostPerMillion` instead of the standard input rate. Defaults to
 * 0, which preserves the legacy uncached calculation exactly.
 */
export function calculateModelCost(
  modelName: string,
  inputTokens: number,
  outputTokens: number,
  cachedInputTokens = 0
): {
  inputCost: number;
  outputCost: number;
  cachedInputCost: number;
  totalCost: number;
  inputCostUsd: number;
  outputCostUsd: number;
  cachedInputCostUsd: number;
  totalCostUsd: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  modelName: string;
} {
  const pricing = resolveModelPricing(modelName);
  const safeInput = Math.max(0, Math.round(inputTokens || 0));
  const safeOutput = Math.max(0, Math.round(outputTokens || 0));
  const safeCached = Math.min(safeInput, Math.max(0, Math.round(cachedInputTokens || 0)));
  const cachedRate = pricing.cachedInputCostPerMillion ?? pricing.inputCostPerMillion;

  const freshInputCost = ((safeInput - safeCached) / 1_000_000) * pricing.inputCostPerMillion;
  const cachedCost = (safeCached / 1_000_000) * cachedRate;
  const inputCost = freshInputCost + cachedCost;
  const outputCost = (safeOutput / 1_000_000) * pricing.outputCostPerMillion;
  const totalCost = inputCost + outputCost;

  return {
    inputCost,
    outputCost,
    cachedInputCost: cachedCost,
    totalCost,
    inputCostUsd: inputCost,
    outputCostUsd: outputCost,
    cachedInputCostUsd: cachedCost,
    totalCostUsd: totalCost,
    inputTokens: safeInput,
    outputTokens: safeOutput,
    cachedInputTokens: safeCached,
    modelName: pricing.name,
  };
}

/**
 * Reads cache-read input tokens from a Gemini `GenerateContentResponse`
 * chunk (`usageMetadata.cachedContentTokenCount`). Returns 0 when the chunk
 * carries no usage telemetry — the SDK only populates `usageMetadata` on
 * chunks where the backend reports it, so absence stays honest zero.
 */
export function extractGeminiCachedTokens(chunk: unknown): number {
  if (!chunk || typeof chunk !== 'object') return 0;
  const usage = (chunk as Record<string, unknown>)['usageMetadata'];
  if (!usage || typeof usage !== 'object') return 0;
  const cached = (usage as Record<string, unknown>)['cachedContentTokenCount'];
  if (typeof cached !== 'number' || !Number.isFinite(cached) || cached <= 0) return 0;
  return Math.floor(cached);
}

/**
 * Duplicate-delta guard for streamed text. Returns true when `incoming`
 * must NOT be appended to `accumulated`: empty payloads, or an incoming
 * slice the accumulation already ends with (provider resend). The length
 * check keeps the equal-length case covered too — identical strings can
 * only be a full resend. Deterministic and side-effect free.
 */
export function isDuplicateDelta(accumulated: string, incoming: string): boolean {
  if (!incoming) return true;
  if (accumulated.length === 0) return false;
  return incoming.length <= accumulated.length && accumulated.endsWith(incoming);
}

/**
 * Drops a later assistant message when it duplicates the previous
 * assistant message's content within a short window — the persisted
 * footprint of a double-fired compile. Text is never altered, only
 * exact consecutive duplicates are removed.
 */
export function dedupeConsecutiveAssistantMessages(messages: ChatMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  let lastAssistant: ChatMessage | null = null;
  for (const m of messages) {
    if (m.role === 'assistant') {
      if (
        lastAssistant &&
        m.content === lastAssistant.content &&
        Math.abs(m.timestamp - lastAssistant.timestamp) <= 5000
      ) {
        continue;
      }
      lastAssistant = m;
    }
    out.push(m);
  }
  return out;
}

/**
 * Pure content replacer for one message by id. Used for functional
 * `setMessages` finalization so late stream events always operate on
 * latest state instead of a stale render closure.
 */
export function replaceAssistantContent(
  messages: ChatMessage[],
  id: string,
  content: string
): ChatMessage[] {
  return messages.map((m) => (m.id === id ? { ...m, content } : m));
}

/**
 * Formats a USD cost value with clean precision (e.g. '$0.0014 USD').
 */
export function formatCostUsd(cost: number): string {
  if (typeof cost !== 'number' || isNaN(cost) || cost <= 0) {
    return '$0.0000 USD';
  }
  if (cost < 0.0001) {
    return `$${cost.toFixed(6)} USD`;
  }
  return `$${cost.toFixed(4)} USD`;
}

