/**
 * Muse Spark chat-completions transport helpers (edge-safe: no Node APIs).
 *
 * Pure SSE parsing + request building extracted from the /api/compile route
 * so the Muse streaming path is unit-testable under plain `node --test`.
 * This module has no value imports by design (type-only `@/` imports are
 * erased before runtime, relative value imports would break the node runner).
 */
import type { SearchContextSize } from '@/types';

/**
 * Explicit output cap for Muse chat completions. Long-form compiled prompts
 * need thousands of output tokens; without a pinned cap a provider-side
 * degenerate default can truncate the completion to a single token.
 */
export const MUSE_MAX_OUTPUT_TOKENS = 16384;

export interface MuseStreamParser {
  buffer: string;
  finished: boolean;
  chunksProduced: number;
  /** All text received, retained for the non-SSE fallback in flush. */
  received: string;
  /** Max cache-read input tokens observed in usage payloads (0 when absent). */
  cachedInputTokens: number;
  /** Max provider-measured input tokens observed in usage payloads (0 when absent). */
  measuredInputTokens: number;
}

export function createMuseStreamParser(): MuseStreamParser {
  return { buffer: '', finished: false, chunksProduced: 0, received: '', cachedInputTokens: 0, measuredInputTokens: 0 };
}

/**
 * Reads cache-read input tokens from an OpenAI-compatible usage payload.
 * Chat path: `usage.prompt_tokens_details.cached_tokens`. Responses path:
 * `response.usage.input_tokens_details.cached_tokens` (top-level `usage`
 * tolerated too). Returns 0 when no usage block is present — providers only
 * send usage when they have cache telemetry, so absence stays honest zero.
 * Anthropic `cache_read_input_tokens` is deliberately NOT read: this
 * transport speaks OpenAI-compatible chat/completions + Responses only.
 */
export function extractMuseUsageCachedTokens(payload: unknown): number {
  if (!payload || typeof payload !== 'object') return 0;
  const root = payload as Record<string, unknown>;
  const candidates: unknown[] = [root['usage']];
  const response = root['response'];
  if (response && typeof response === 'object') {
    candidates.push((response as Record<string, unknown>)['usage']);
  }
  let best = 0;
  for (const usage of candidates) {
    if (!usage || typeof usage !== 'object') continue;
    const u = usage as Record<string, unknown>;
    const details = (u['prompt_tokens_details'] ?? u['input_tokens_details']) as Record<string, unknown> | undefined;
    if (details && typeof details === 'object') {
      for (const key of ['cached_tokens', 'prompt_cache_hit_tokens', 'cached_input_tokens']) {
        const cached = details[key];
        if (typeof cached === 'number' && Number.isFinite(cached) && cached > best) {
          best = Math.floor(cached);
        }
      }
    }
    for (const key of ['cached_tokens', 'prompt_cache_hit_tokens', 'cached_input_tokens']) {
      const flat = u[key];
      if (typeof flat === 'number' && Number.isFinite(flat) && flat > best) {
        best = Math.floor(flat);
      }
    }
  }
  return best;
}

/**
 * Reads provider-measured input tokens from an OpenAI-compatible usage
 * payload. Chat path: `usage.prompt_tokens`. Responses path:
 * `response.usage.input_tokens` (top-level `usage.input_tokens` tolerated).
 * Returns the max observed value, 0 when no usage telemetry is present.
 */
export function extractMuseUsagePromptTokens(payload: unknown): number {
  if (!payload || typeof payload !== 'object') return 0;
  const root = payload as Record<string, unknown>;
  const candidates: unknown[] = [root['usage']];
  const response = root['response'];
  if (response && typeof response === 'object') {
    candidates.push((response as Record<string, unknown>)['usage']);
  }
  let best = 0;
  for (const usage of candidates) {
    if (!usage || typeof usage !== 'object') continue;
    const u = usage as Record<string, unknown>;
    for (const key of ['prompt_tokens', 'input_tokens']) {
      const v = u[key];
      if (typeof v === 'number' && Number.isFinite(v) && v > best) {
        best = Math.floor(v);
      }
    }
  }
  return best;
}

function noteParserUsage(parser: MuseStreamParser, payload: unknown): void {
  const found = extractMuseUsageCachedTokens(payload);
  if (found > (parser.cachedInputTokens ?? 0)) {
    parser.cachedInputTokens = found;
  }
  const measured = extractMuseUsagePromptTokens(payload);
  if (measured > (parser.measuredInputTokens ?? 0)) {
    parser.measuredInputTokens = measured;
  }
}

interface MuseChoiceLike {
  delta?: { content?: unknown };
  message?: { content?: unknown };
}

interface MusePayloadLike {
  choices?: MuseChoiceLike[];
}

function blockText(block: unknown): string {
  if (typeof block === 'string') return block;
  if (block && typeof block === 'object' && typeof (block as { text?: unknown }).text === 'string') {
    return (block as { text: string }).text;
  }
  return '';
}

/** Extracts displayable text from one parsed SSE data payload. */
export function extractMuseDeltaText(payload: unknown): string {
  const choice = (payload as MusePayloadLike | null | undefined)?.choices?.[0];
  const delta = choice?.delta?.content ?? choice?.message?.content ?? '';
  if (typeof delta === 'string') return delta;
  // Content-block arrays: [{ type: 'text', text: '...' }, ...].
  if (Array.isArray(delta)) return delta.map(blockText).join('');
  return '';
}

/** Parses one frame's `data:` lines into delta texts, stopping at `[DONE]`. */
function parseFrameTexts(frame: string, parser: MuseStreamParser): { texts: string[]; done: boolean } {
  const texts: string[] = [];
  for (const line of frame.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    const payload = trimmed.slice(5).trim();
    if (payload === '[DONE]') return { texts, done: true };
    try {
      const json: unknown = JSON.parse(payload);
      noteParserUsage(parser, json);
      const deltaText = extractMuseDeltaText(json);
      if (deltaText.length > 0) texts.push(deltaText);
    } catch {
      // Partial JSON frame mid-stream — ignore and keep buffering.
    }
  }
  return { texts, done: false };
}

/**
 * Feeds decoded stream text through the parser, returning completed delta
 * texts. Splits on blank lines (LF or CRLF), keeps the tail buffered, and
 * stops at `[DONE]`.
 */
export function pushMuseSseText(parser: MuseStreamParser, text: string): string[] {
  const out: string[] = [];
  if (parser.finished) return out;
  parser.received += text;
  parser.buffer += text;
  const frames = parser.buffer.split(/\r?\n\r?\n/);
  parser.buffer = frames.pop() ?? '';
  for (const frame of frames) {
    const { texts, done } = parseFrameTexts(frame, parser);
    for (const deltaText of texts) {
      parser.chunksProduced += 1;
      out.push(deltaText);
    }
    if (done) {
      parser.finished = true;
      return out;
    }
  }
  return out;
}

/**
 * Drains the parser at EOF: parses a trailing event that never received its
 * terminating blank line, and — when nothing was produced at all — falls back
 * to parsing the whole body as a single non-SSE JSON completion.
 */
export function flushMuseStreamParser(parser: MuseStreamParser): string[] {
  if (parser.finished) return [];
  parser.finished = true;
  const out: string[] = [];
  const tail = parser.buffer.trim();
  parser.buffer = '';
  if (tail.length > 0) {
    const { texts } = parseFrameTexts(tail, parser);
    for (const deltaText of texts) {
      parser.chunksProduced += 1;
      out.push(deltaText);
    }
  }
  if (parser.chunksProduced === 0) {
    const raw = parser.received.trim();
    if (raw.startsWith('{')) {
      try {
        const body = JSON.parse(raw) as unknown;
        noteParserUsage(parser, body);
        const deltaText = extractMuseDeltaText(body);
        if (deltaText.length > 0) {
          parser.chunksProduced += 1;
          out.push(deltaText);
        }
      } catch {
        // Not a JSON completion body — nothing to recover.
      }
    }
  }
  return out;
}

export interface MuseImagePart {
  mimeType: string;
  data: string;
}

export interface MuseRequestInput {
  model: string;
  systemInstruction: string;
  prompt: string;
  historyMessages?: { role: string; content: string }[];
  images?: MuseImagePart[];
  temperature: number;
  thinkingPayload?: Record<string, unknown>;
  searchGrounding?: boolean;
  searchContextSize?: SearchContextSize;
}

/**
 * Joins an operator-configured base URL with the chat-completions suffix.
 * The base path passes through verbatim (trailing slashes stripped) so a
 * misconfigured env value surfaces in errors instead of being rewritten.
 */
export function buildMuseEndpoint(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
}

/** Builds the JSON body POSTed to the Muse chat-completions endpoint. */
export function buildMuseRequestBody(input: MuseRequestInput): Record<string, unknown> {
  // Chat Completions never carries search tools: Meta rejects `tools[0]`
  // (`did not match any supported type` 400) there. Grounded Muse requests
  // travel via buildMuseResponsesRequestBody below instead.
  void input.searchGrounding;
  void input.searchContextSize;
  // Defensive strip: the Muse endpoint 400s on Gemini-style `thinkingConfig`.
  // Only `reasoning_effort` (plus future allowlisted keys) may travel.
  const { thinkingConfig: _dropped, ...safeThinking } = input.thinkingPayload ?? {};
  void _dropped;
  // Multimodal user turn: OpenAI-style content parts. Text-only callers
  // (no images) produce byte-identical bodies to the legacy path.
  const chatImages = Array.isArray(input.images) ? input.images : [];
  const userContent: unknown =
    chatImages.length > 0
      ? [
          { type: 'text', text: input.prompt },
          ...chatImages.map((img) => ({
            type: 'image_url',
            image_url: { url: `data:${img.mimeType};base64,${img.data}` },
          })),
        ]
      : input.prompt;
  return {
    model: input.model,
    stream: true,
    // Usage telemetry rides the stream only when requested: without
    // `stream_options.include_usage` the provider omits `usage` chunks and
    // cache-read capture degrades to honest zero.
    stream_options: { include_usage: true },
    temperature: input.temperature,
    max_tokens: MUSE_MAX_OUTPUT_TOKENS,
    ...safeThinking,
    messages: [
      { role: 'system', content: input.systemInstruction },
      ...(Array.isArray(input.historyMessages) ? input.historyMessages : []),
      { role: 'user', content: userContent },
    ],
  };
}

/**
 * Joins an operator-configured base URL with the Responses suffix — Meta's
 * only endpoint with built-in web-search grounding.
 */
export function buildMuseResponsesEndpoint(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/responses`;
}

/** Maps the five-level effort scale onto the Responses-documented enum. */
export function normalizeMuseResponsesEffort(level: unknown): string {
  const norm = typeof level === 'string' ? level.toLowerCase().trim() : '';
  if (norm === 'max') return 'xhigh';
  if (norm === 'low' || norm === 'medium' || norm === 'high' || norm === 'xhigh' || norm === 'minimal') return norm;
  return 'high';
}

/** Builds the JSON body POSTed to the Muse Responses endpoint. */
export function buildMuseResponsesRequestBody(input: MuseRequestInput): Record<string, unknown> {
  const { thinkingConfig: _dropped, reasoning_effort, ...restThinking } = input.thinkingPayload ?? {};
  void _dropped;
  const effort =
    typeof reasoning_effort === 'string'
      ? normalizeMuseResponsesEffort(reasoning_effort)
      : normalizeMuseResponsesEffort('high');
  void restThinking;
  const responsesImages = Array.isArray(input.images) ? input.images : [];
  const responsesUserContent: unknown =
    responsesImages.length > 0
      ? [
          { type: 'input_text', text: input.prompt },
          ...responsesImages.map((img) => ({
            type: 'input_image',
            image_url: `data:${img.mimeType};base64,${img.data}`,
            detail: 'auto',
          })),
        ]
      : input.prompt;
  return {
    model: input.model,
    stream: true,
    temperature: input.temperature,
    max_output_tokens: MUSE_MAX_OUTPUT_TOKENS,
    reasoning: { effort },
    ...(input.searchGrounding === true
      ? { tools: [{ type: 'web_search', search_context_size: input.searchContextSize ?? 'medium' }] }
      : {}),
    input: [
      { role: 'system', content: input.systemInstruction },
      ...(Array.isArray(input.historyMessages) ? input.historyMessages : []),
      { role: 'user', content: responsesUserContent },
    ],
  };
}

/** Extracts displayable text from one parsed Responses SSE data payload. */
export function extractMuseResponsesDeltaText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const p = payload as Record<string, unknown>;
  // Canonical Responses streaming event: {"type":"response.output_text.delta","delta":"..."}.
  if (typeof p['delta'] === 'string') return p['delta'] as string;
  if (typeof p['text'] === 'string') return p['text'] as string;
  if (typeof p['output_text'] === 'string') return p['output_text'] as string;
  const response = p['response'];
  if (response && typeof response === 'object') {
    const inner = extractMuseResponsesDeltaText(response);
    if (inner) return inner;
  }
  const output = p['output'];
  if (Array.isArray(output)) {
    let text = '';
    for (const item of output) {
      if (!item || typeof item !== 'object') continue;
      const rec = item as Record<string, unknown>;
      const content = rec['content'];
      if (typeof content === 'string') text += content;
      else if (Array.isArray(content)) {
        for (const block of content) {
          if (typeof block === 'string') text += block;
          else if (block && typeof block === 'object') {
            const b = block as Record<string, unknown>;
            if (typeof b['text'] === 'string') text += b['text'] as string;
          }
        }
      }
      if (typeof rec['text'] === 'string') text += rec['text'] as string;
    }
    if (text) return text;
  }
  // Tolerate chat-shaped payloads on this path too.
  return extractMuseDeltaText(payload);
}

/** Parses one Responses frame's `data:` lines into delta texts. */
function parseResponsesFrameTexts(frame: string, parser: MuseStreamParser): { texts: string[]; done: boolean } {
  const texts: string[] = [];
  for (const line of frame.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    const data = trimmed.slice(5).trim();
    if (data === '[DONE]') return { texts, done: true };
    try {
      const json: unknown = JSON.parse(data);
      // Terminal events (notably response.completed) carry the authoritative
      // `response.usage` block — capture before returning done.
      noteParserUsage(parser, json);
      if (json && typeof json === 'object') {
        const type = (json as Record<string, unknown>)['type'];
        if (typeof type === 'string' && /^(response\.(completed|failed|incomplete|cancelled))$/.test(type)) {
          return { texts, done: true };
        }
      }
      const deltaText = extractMuseResponsesDeltaText(json);
      if (deltaText.length > 0) texts.push(deltaText);
    } catch {
      // Partial JSON frame mid-stream — ignore and keep buffering.
    }
  }
  return { texts, done: false };
}

/**
 * Feeds decoded Responses stream text through the parser. Same CRLF-aware
 * framing as the chat path; stops at `[DONE]` or a terminal response event.
 */
export function pushMuseResponsesSseText(parser: MuseStreamParser, text: string): string[] {
  const out: string[] = [];
  if (parser.finished) return out;
  parser.received += text;
  parser.buffer += text;
  const frames = parser.buffer.split(/\r?\n\r?\n/);
  parser.buffer = frames.pop() ?? '';
  for (const frame of frames) {
    const { texts, done } = parseResponsesFrameTexts(frame, parser);
    for (const deltaText of texts) {
      parser.chunksProduced += 1;
      out.push(deltaText);
    }
    if (done) {
      parser.finished = true;
      return out;
    }
  }
  return out;
}

/**
 * Drains the Responses parser at EOF, including single-JSON fallbacks.
 */
export function flushMuseResponsesStreamParser(parser: MuseStreamParser): string[] {
  if (parser.finished) return [];
  parser.finished = true;
  const out: string[] = [];
  const tail = parser.buffer.trim();
  parser.buffer = '';
  if (tail.length > 0) {
    const { texts } = parseResponsesFrameTexts(tail, parser);
    for (const deltaText of texts) {
      parser.chunksProduced += 1;
      out.push(deltaText);
    }
  }
  if (parser.chunksProduced === 0) {
    const raw = parser.received.trim();
    if (raw.startsWith('{')) {
      try {
        const body = JSON.parse(raw) as unknown;
        noteParserUsage(parser, body);
        const deltaText = extractMuseResponsesDeltaText(body);
        if (deltaText.length > 0) {
          parser.chunksProduced += 1;
          out.push(deltaText);
        }
      } catch {
        // Not a JSON completion body — nothing to recover.
      }
    }
  }
  return out;
}
