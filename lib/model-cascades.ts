import type { GoogleGenAI } from '@google/genai';
import type { ExplorationStep, SearchContextSize, SourceFile } from '@/types';
import type { GenAiHistoryTurn } from './chat-history.ts';
import {
  buildMuseRequestBody,
  buildMuseResponsesEndpoint,
  buildMuseResponsesRequestBody,
  buildMuseEndpoint,
  createMuseStreamParser,
  extractMuseResponsesDeltaText,
  flushMuseResponsesStreamParser,
  flushMuseStreamParser,
  pushMuseResponsesSseText,
  pushMuseSseText,
} from './muse-stream.ts';
import {
  buildMuseThinkingPayload,
  normalizeThinkingLevel,
  normalizeThinkingSummaries,
} from './thinking-levels.ts';
import type { CascadeAttemptFailure } from './cascade-failures.ts';
import { withTimeout } from './agentic-exploration.ts';
import {
  calculateModelCost,
  extractGeminiCachedTokens,
  extractSuggestedRefactors,
  isDuplicateDelta,
} from './utils.ts';

// Model cascading and streaming-fallback orchestration for POST /api/compile.
//
// Owns the Muse Spark streaming adapter, the multi-pass attempt ladder, and
// the SSE drain loop through the terminal `done` event. The route keeps HTTP
// boundary validation, phase sequencing, and the stream envelope.
//
// Import discipline: relative `.ts` imports only (plus type-only `@/`
// imports, erased before runtime) so this module stays importable under
// plain `node --test`. In particular the Muse generator lives here and NOT
// in lib/muse-stream.ts, whose test contract forbids runtime value imports.
//
// Server-side only: reads process.env for API-key gating and must never be
// imported by a client component (same boundary as the route itself).

export const MUSE_API_BASE_URL = (process.env.MUSE_API_BASE_URL || 'https://api.meta.ai/v1').replace(/\/+$/, '');

export function isMuseModelTag(tag: unknown): boolean {
  const norm = String(tag || '').toLowerCase().trim();
  return norm.startsWith('muse-') || norm === 'muse' || norm.includes('muse-spark') || norm.includes('muse');
}

async function* streamMuseCompletionChunks(args: {
  apiKey: string;
  model: string;
  systemInstruction: string;
  prompt: string;
  historyMessages?: { role: string; content: string }[];
  images?: { mimeType: string; data: string }[];
  /** Out-param: filled with the parser's observed cache-read tokens on settle. */
  usageCapture?: { cachedInputTokens: number };
  temperature: number;
  timeoutMs: number;
  thinkingLevel?: string;
  thinkingSummaries?: string;
  searchGrounding?: boolean;
  searchContextSize?: SearchContextSize;
}): AsyncGenerator<{ candidates: { content: { parts: { text: string }[] } }[] }> {
  const normalizedEffort = normalizeThinkingLevel(args.thinkingLevel);
  const normalizedSummaries = normalizeThinkingSummaries(args.thinkingSummaries);
  const thinkingPayload = buildMuseThinkingPayload(normalizedEffort, normalizedSummaries);
  // Declared outside `try` so `finally` can always read it, even when the
  // fetch itself throws before any byte is parsed.
  const parser = createMuseStreamParser();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs);
  if (typeof (timer as unknown as { unref?: unknown }).unref === 'function') {
    (timer as unknown as { unref: () => void }).unref();
  }
  try {
    const useResponsesApi = args.searchGrounding === true;
    const endpoint = useResponsesApi
      ? buildMuseResponsesEndpoint(MUSE_API_BASE_URL)
      : buildMuseEndpoint(MUSE_API_BASE_URL);
    const body = useResponsesApi
      ? buildMuseResponsesRequestBody({
        model: args.model,
        systemInstruction: args.systemInstruction,
        prompt: args.prompt,
        historyMessages: args.historyMessages,
        images: args.images,
        temperature: args.temperature,
        thinkingPayload,
        searchGrounding: true,
        searchContextSize: args.searchContextSize,
      })
      : buildMuseRequestBody({
        model: args.model,
        systemInstruction: args.systemInstruction,
        prompt: args.prompt,
        historyMessages: args.historyMessages,
        images: args.images,
        temperature: args.temperature,
        thinkingPayload,
      });
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${args.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok || !res.body) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Muse API error (${res.status}) at ${endpoint}: ${errText.slice(0, 300)}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    const emit = (text: string) => ({ candidates: [{ content: { parts: [{ text }] } }] });
    const pushChunk = useResponsesApi ? pushMuseResponsesSseText : pushMuseSseText;
    const flushParser = useResponsesApi ? flushMuseResponsesStreamParser : flushMuseStreamParser;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const text of pushChunk(parser, decoder.decode(value, { stream: true }))) {
        yield emit(text);
      }
      if (parser.finished) return;
    }
    for (const text of flushParser(parser)) {
      yield emit(text);
    }
  } finally {
    clearTimeout(timer);
    // Surface observed cache telemetry (0 when the provider sent none).
    // `finally` also covers the early `return` on parser finish above.
    if (args.usageCapture) {
      args.usageCapture.cachedInputTokens = parser.cachedInputTokens;
    }
  }
}

export interface SynthesisMessagePart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

export interface EstablishSynthesisInput {
  ai: GoogleGenAI;
  cascadingModels: readonly string[];
  systemInstructionToUse: string;
  finalPromptPayload: string;
  synthesisMessage: string | SynthesisMessagePart[];
  geminiHistory: GenAiHistoryTurn[];
  museHistory: { role: string; content: string }[];
  museImageParts: { mimeType: string; data: string }[];
  museKey: string | undefined;
  mode: string;
  timeoutMs: number;
  requestTimeout: number;
  useSearchGrounding: boolean;
  searchContextSize: SearchContextSize;
  thinkingLevel: string;
  thinkingSummaries: string;
  geminiThinkingConfig: Record<string, unknown>;
}

export interface EstablishedStream {
  streamResponse: {
    firstChunk: unknown;
    iterator: AsyncIterator<unknown>;
  };
  streamModel: string;
  streamPass: number;
  streamMuseUsage: { cachedInputTokens: number } | null;
}

export interface EstablishSynthesisResult {
  stream: EstablishedStream | null;
  cascadeFailures: CascadeAttemptFailure[];
}

/**
 * Walks the cascading model ladder (up to 2 passes) and returns the first
 * working stream. Never throws: per-attempt errors are collected and a
 * total failure resolves to `{ stream: null }` so the caller can emit the
 * terminal error event with `summarizeCascadeFailures` details.
 */
export async function establishSynthesisStream(
  input: EstablishSynthesisInput
): Promise<EstablishSynthesisResult> {
  const {
    ai,
    cascadingModels,
    systemInstructionToUse,
    finalPromptPayload,
    synthesisMessage,
    geminiHistory,
    museHistory,
    museImageParts,
    museKey,
    mode,
    timeoutMs,
    requestTimeout,
    useSearchGrounding,
    searchContextSize,
    thinkingLevel,
    thinkingSummaries,
    geminiThinkingConfig,
  } = input;

  let streamResponse: EstablishedStream['streamResponse'] | null = null;
  let streamModel = '';
  let streamPass = 1;
  let streamMuseUsage: { cachedInputTokens: number } | null = null;
  const cascadeFailures: CascadeAttemptFailure[] = [];

  for (let pass = 1; pass <= 2 && !streamResponse; pass++) {
    for (const model of cascadingModels) {
      // Muse Spark tags route to the Muse API with key authorization
      // headers; a missing key (or Muse failure) cascades onward.
      if (isMuseModelTag(model)) {
        if (pass > 1) continue;
        if (!museKey) {
          console.warn(
            `[Prompt Stream Cascade] ${model} skipped in Pass ${pass}: no Muse API key configured (Settings → Muse AI API Key or MUSE_API_KEY).`
          );
          continue;
        }
        try {
          const museUsageCapture = { cachedInputTokens: 0 };
          const museIterator = streamMuseCompletionChunks({
            apiKey: museKey,
            model,
            systemInstruction: systemInstructionToUse,
            prompt: finalPromptPayload,
            historyMessages: museHistory,
            images: museImageParts.length > 0 ? museImageParts : undefined,
            usageCapture: museUsageCapture,
            temperature: mode === 'idea' ? 0.4 : 0.2,
            timeoutMs,
            thinkingLevel,
            thinkingSummaries,
            searchGrounding: useSearchGrounding,
            searchContextSize,
          })[Symbol.asyncIterator]();
          const firstResult = await withTimeout(
            museIterator.next(),
            timeoutMs,
            `Model ${model} first chunk timed out after ${requestTimeout}s`
          );
          if (firstResult.done) {
            throw new Error(`Model ${model} returned an empty stream`);
          }
          streamResponse = {
            firstChunk: firstResult.value,
            iterator: museIterator,
          };
          streamModel = model;
          streamPass = pass;
          streamMuseUsage = museUsageCapture;
          break;
        } catch (err) {
          console.warn(`[Prompt Stream Cascade] ${model} failed in Pass ${pass}:`, err);
          cascadeFailures.push({ model, pass, error: err });
          continue;
        }
      }
      for (const useThinking of [true, false]) {
        try {
          const config: any = {
            systemInstruction: systemInstructionToUse,
            temperature: mode === 'idea' ? 0.4 : 0.2,
          };
          if (useThinking) {
            // Gemini accepts only low/medium/high — Muse-only
            // xhigh/max arrive here already mapped to high.
            config.thinkingConfig = geminiThinkingConfig;
          }
          if (useSearchGrounding) {
            // Google Search grounding: real-time web lookups with
            // url_citation annotations, no custom RAG index needed.
            config.tools = [{ googleSearch: {} }];
          }

          // Fresh stateful chat session per attempt: the normalized
          // history prefix plus the current repo context turn travel
          // together, so follow-ups hit the implicit context cache.
          // A new Chat per attempt keeps cascade retries from
          // polluting each other's conversation state.
          const chat = ai.chats.create({ model, history: geminiHistory });
          const candidateStream = await withTimeout(
            chat.sendMessageStream({
              message: synthesisMessage,
              config,
            }),
            timeoutMs,
            `Model ${model} stream initiation timed out after ${requestTimeout}s`
          );

          const iterator = candidateStream[Symbol.asyncIterator]();
          const firstResult = await withTimeout(
            iterator.next(),
            timeoutMs,
            `Model ${model} first chunk timed out after ${requestTimeout}s`
          );

          streamResponse = {
            firstChunk: firstResult.value,
            iterator,
          };
          streamModel = model;
          streamPass = pass;
          break;
        } catch (err) {
          console.warn(`[Prompt Stream Cascade] ${model} (thinking: ${useThinking}) failed in Pass ${pass}:`, err);
          cascadeFailures.push({ model, pass, thinking: useThinking, error: err });
        }
      }
      if (streamResponse) break;
    }
    if (streamResponse) break;
  }

  if (!streamResponse) {
    return { stream: null, cascadeFailures };
  }
  return {
    stream: { streamResponse, streamModel, streamPass, streamMuseUsage },
    cascadeFailures,
  };
}

export interface DrainSynthesisInput {
  streamResponse: EstablishedStream['streamResponse'];
  streamModel: string;
  streamPass: number;
  streamMuseUsage: { cachedInputTokens: number } | null;
  sendEvent: (eventData: Record<string, unknown>) => void;
  detectedFramework: string;
  exploredFilesList: SourceFile[];
  explorationTrail: ExplorationStep[];
  estimatedInputTokens: number;
  thinkingLevel: string;
}

/**
 * Drains an established stream to the terminal `done` event: first chunk,
 * thought/prompt deltas with resend guards, then suggested-refactors
 * extraction, measured-cost computation, and the final payload. The caller
 * closes the controller afterwards.
 */
export async function drainSynthesisStream(input: DrainSynthesisInput): Promise<void> {
  const {
    streamResponse,
    streamModel,
    streamPass,
    streamMuseUsage,
    sendEvent,
    detectedFramework,
    exploredFilesList,
    explorationTrail,
    estimatedInputTokens,
    thinkingLevel,
  } = input;

  let geminiCachedTokens = 0;
  sendEvent({
    type: 'thinking_start',
    message: `Model thinking initialized (level: ${thinkingLevel})...`,
    thinkingLevel,
  });

  let thinkingStarted = true;
  let thinkingEnded = false;
  let accumulatedPromptText = '';
  let refactorDelimiterSeen = false;

  const handlePromptText = (incomingText: string) => {
    // Delta-only emission: a resent slice is swallowed whole —
    // neither accumulated nor emitted — so downstream length
    // math and the client stay exactly as if it never arrived.
    if (isDuplicateDelta(accumulatedPromptText, incomingText)) {
      return;
    }
    accumulatedPromptText += incomingText;
    if (thinkingStarted && !thinkingEnded) {
      thinkingEnded = true;
      sendEvent({ type: 'thinking_end' });
    }

    if (refactorDelimiterSeen) {
      return;
    }

    const delimIndex = accumulatedPromptText.search(/---+[\s*]*SUGGESTED/i);
    if (delimIndex !== -1) {
      refactorDelimiterSeen = true;
      const prevLength = accumulatedPromptText.length - incomingText.length;
      if (delimIndex > prevLength) {
        const safeChunk = accumulatedPromptText.slice(prevLength, delimIndex);
        if (safeChunk) {
          sendEvent({ type: 'prompt_chunk', text: safeChunk });
        }
      }
      return;
    }

    sendEvent({ type: 'prompt_chunk', text: incomingText });
  };

  const processChunkValue = (val: any) => {
    if (!val) return;
    // Gemini usage telemetry: accumulate the max observed
    // `usageMetadata.cachedContentTokenCount` across chunks
    // (present on reporting chunks, absent elsewhere).
    // Muse-adapted chunks carry no usageMetadata — reads 0.
    const seenCached = extractGeminiCachedTokens(val);
    if (seenCached > geminiCachedTokens) {
      geminiCachedTokens = seenCached;
    }
    const candidate = val.candidates?.[0];
    const parts = candidate?.content?.parts || [];
    let foundPromptText = false;

    for (const part of parts) {
      if (
        part.thought === true ||
        (part.thought && typeof part.thought === 'object' && Object.keys(part.thought).length > 0)
      ) {
        if (part.text) {
          sendEvent({ type: 'thinking_chunk', text: part.text });
        }
      } else {
        if (part.text) {
          foundPromptText = true;
          handlePromptText(part.text);
        }
      }
    }

    if (!foundPromptText) {
      const directText = val.text || candidate?.text;
      if (typeof directText === 'string' && directText.length > 0) {
        foundPromptText = true;
        handlePromptText(directText);
      }
    }
  };

  // Consume-once: null out after processing so a repeated
  // reference from the iterator can never double-emit.
  let firstChunkConsumed = false;
  if (streamResponse.firstChunk && !firstChunkConsumed) {
    firstChunkConsumed = true;
    processChunkValue(streamResponse.firstChunk);
    streamResponse.firstChunk = null;
  }

  while (true) {
    const { done, value } = await streamResponse.iterator.next();
    if (done) break;
    processChunkValue(value);
  }

  if (thinkingStarted && !thinkingEnded) {
    sendEvent({ type: 'thinking_end' });
  }

  const { cleanPrompt: cleanText, refactors } = extractSuggestedRefactors(accumulatedPromptText);

  sendEvent({
    type: 'suggested_refactors',
    refactors,
    cleanPrompt: cleanText,
  });

  const estimatedOutputTokens = Math.max(1, Math.ceil(cleanText.length / 4));
  // Measured cache reads travel as the 4th arg (0 when the
  // provider sent no usage telemetry — honest zero, not a bug).
  // `calculateModelCost` clamps into [0, inputTokens] and bills
  // the cached slice at the tier's discounted cached rate.
  const measuredCachedTokens = isMuseModelTag(streamModel)
    ? streamMuseUsage?.cachedInputTokens ?? 0
    : geminiCachedTokens;
  const costCalculation = calculateModelCost(streamModel, estimatedInputTokens, estimatedOutputTokens, measuredCachedTokens);
  const costDetails = {
    inputTokens: estimatedInputTokens,
    outputTokens: estimatedOutputTokens,
    cachedInputTokens: costCalculation.cachedInputTokens,
    inputCostUsd: costCalculation.inputCostUsd,
    outputCostUsd: costCalculation.outputCostUsd,
    cachedInputCostUsd: costCalculation.cachedInputCostUsd,
    totalCostUsd: costCalculation.totalCostUsd,
    modelName: costCalculation.modelName,
  };

  sendEvent({
    type: 'done',
    model: streamModel,
    pass: streamPass,
    detectedFramework,
    totalInvestigated: exploredFilesList.length,
    investigatedFiles: exploredFilesList.map((f) => ({
      path: f.path,
      size: f.size,
      content: f.content,
    })),
    trail: explorationTrail,
    inputTokens: estimatedInputTokens,
    outputTokens: estimatedOutputTokens,
    costDetails,
    suggestedRefactors: refactors,
    cleanContent: cleanText,
  });
}
