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
}

export function createMuseStreamParser(): MuseStreamParser {
  return { buffer: '', finished: false, chunksProduced: 0, received: '' };
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
function parseFrameTexts(frame: string): { texts: string[]; done: boolean } {
  const texts: string[] = [];
  for (const line of frame.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    const payload = trimmed.slice(5).trim();
    if (payload === '[DONE]') return { texts, done: true };
    try {
      const json: unknown = JSON.parse(payload);
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
    const { texts, done } = parseFrameTexts(frame);
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
    const { texts } = parseFrameTexts(tail);
    for (const deltaText of texts) {
      parser.chunksProduced += 1;
      out.push(deltaText);
    }
  }
  if (parser.chunksProduced === 0) {
    const raw = parser.received.trim();
    if (raw.startsWith('{')) {
      try {
        const deltaText = extractMuseDeltaText(JSON.parse(raw) as unknown);
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

export interface MuseRequestInput {
  model: string;
  systemInstruction: string;
  prompt: string;
  historyMessages?: { role: string; content: string }[];
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
  // Web-search grounding is opt-in only: the tool key is omitted entirely
  // when disabled so ungrounded requests stay byte-identical to before.
  const tools =
    input.searchGrounding === true
      ? [{ type: 'web_search', search_context_size: input.searchContextSize ?? 'medium' }]
      : undefined;
  return {
    model: input.model,
    stream: true,
    temperature: input.temperature,
    max_tokens: MUSE_MAX_OUTPUT_TOKENS,
    ...(input.thinkingPayload ?? {}),
    ...(tools ? { tools } : {}),
    messages: [
      { role: 'system', content: input.systemInstruction },
      ...(Array.isArray(input.historyMessages) ? input.historyMessages : []),
      { role: 'user', content: input.prompt },
    ],
  };
}
