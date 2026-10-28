import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MUSE_MAX_OUTPUT_TOKENS,
  buildMuseEndpoint,
  buildMuseRequestBody,
  buildMuseResponsesEndpoint,
  buildMuseResponsesRequestBody,
  createMuseStreamParser,
  extractMuseDeltaText,
  extractMuseResponsesDeltaText,
  extractMuseUsageCachedTokens,
  flushMuseResponsesStreamParser,
  flushMuseStreamParser,
  normalizeMuseResponsesEffort,
  pushMuseResponsesSseText,
  pushMuseSseText,
  type MuseStreamParser,
} from './muse-stream.ts';

const deltaEvent = (content: unknown): string =>
  `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;

const doneEvent = 'data: [DONE]\n\n';

/** Drives the parser the way the route's reader loop does. */
function runStream(reads: string[]): { text: string; parser: MuseStreamParser } {
  const parser = createMuseStreamParser();
  const out: string[] = [];
  for (const read of reads) {
    out.push(...pushMuseSseText(parser, read));
    if (parser.finished) break;
  }
  if (!parser.finished) out.push(...flushMuseStreamParser(parser));
  return { text: out.join(''), parser };
}

/** Splits a payload into awkward network-sized reads, mid-JSON included. */
function chunked(payload: string, size: number): string[] {
  const reads: string[] = [];
  for (let i = 0; i < payload.length; i += size) reads.push(payload.slice(i, i + size));
  return reads;
}

test('multi-chunk LF stream reassembles fully across split network reads', () => {
  const payload =
    'data: {"choices":[{"delta":{"role":"assistant"}}]}\n\n' +
    deltaEvent('Hello') +
    deltaEvent(' world') +
    deltaEvent('!') +
    doneEvent;
  const { text, parser } = runStream(chunked(payload, 13));
  assert.equal(text, 'Hello world!');
  assert.equal(parser.finished, true);
  assert.equal(parser.chunksProduced, 3);
});

test('CRLF-framed stream yields every chunk', () => {
  const payload =
    `data: ${JSON.stringify({ choices: [{ delta: { content: 'Hello' } }] })}\r\n\r\n` +
    `data: ${JSON.stringify({ choices: [{ delta: { content: ' world' } }] })}\r\n\r\n` +
    'data: [DONE]\r\n\r\n';
  const { text } = runStream(chunked(payload, 17));
  assert.equal(text, 'Hello world');
});

test('trailing event without a terminating blank line is flushed at EOF', () => {
  const payload = deltaEvent('Hello') + `data: ${JSON.stringify({ choices: [{ delta: { content: '!' } }] })}`;
  const { text } = runStream([payload]);
  assert.equal(text, 'Hello!');
});

test('content-block arrays are extracted as text', () => {
  const payload =
    deltaEvent([
      { type: 'text', text: 'Hello' },
      { type: 'text', text: ' world' },
    ]) + doneEvent;
  const { text } = runStream([payload]);
  assert.equal(text, 'Hello world');
});

test('non-SSE single JSON body still yields its full text', () => {
  const payload = JSON.stringify({ choices: [{ message: { content: 'Full response here' } }] });
  const { text } = runStream(chunked(payload, 11));
  assert.equal(text, 'Full response here');
});

test('role-only and empty deltas are skipped without ending the stream', () => {
  const payload =
    'data: {"choices":[{"delta":{"role":"assistant"}}]}\n\n' +
    deltaEvent('') +
    deltaEvent('Hi') +
    doneEvent;
  const { text, parser } = runStream([payload]);
  assert.equal(text, 'Hi');
  assert.equal(parser.chunksProduced, 1);
});

test('extractMuseDeltaText prefers delta content, falls back to message content', () => {
  assert.equal(extractMuseDeltaText({ choices: [{ delta: { content: 'a' } }] }), 'a');
  assert.equal(extractMuseDeltaText({ choices: [{ message: { content: 'b' } }] }), 'b');
  assert.equal(extractMuseDeltaText({ choices: [{ delta: {} }] }), '');
  assert.equal(extractMuseDeltaText({ choices: [] }), '');
  assert.equal(extractMuseDeltaText(null), '');
});

test('request body keeps stream, messages order, and thinking payload', () => {
  const body = buildMuseRequestBody({
    model: 'muse-spark-1.3',
    systemInstruction: 'sys',
    prompt: 'user-goal',
    historyMessages: [{ role: 'user', content: 'prior' }],
    temperature: 0.2,
    thinkingPayload: { reasoning_effort: 'max' },
  });
  assert.equal(body['model'], 'muse-spark-1.3');
  assert.equal(body['stream'], true);
  assert.equal(body['temperature'], 0.2);
  assert.equal((body['reasoning_effort'] as string), 'max');
  const messages = body['messages'] as { role: string; content: string }[];
  assert.deepEqual(
    messages.map((m) => m.role),
    ['system', 'user', 'user']
  );
  assert.equal(messages[0].content, 'sys');
  assert.equal(messages[2].content, 'user-goal');
});

test('request body pins an explicit output cap so completions are never single-token', () => {
  const body = buildMuseRequestBody({
    model: 'muse-spark-1.3',
    systemInstruction: 'sys',
    prompt: 'user-goal',
    temperature: 0.2,
  });
  assert.equal(body['max_tokens'], MUSE_MAX_OUTPUT_TOKENS);
  assert.ok(
    (MUSE_MAX_OUTPUT_TOKENS as number) >= 8192,
    'cap must fit long compiled prompts'
  );
});

test('request body never emits web_search tools (Chat Completions 400 regression)', () => {
  // Meta's Chat Completions endpoint rejects `tools[0]` with
  // "`tools[0]` did not match any supported type" — search grounding is
  // Responses-API-only. The Muse body must omit `tools` even when grounding
  // is enabled; Gemini `googleSearch` remains the grounded path.
  const grounded = buildMuseRequestBody({
    model: 'muse-spark-1.3',
    systemInstruction: 'sys',
    prompt: 'user-goal',
    temperature: 0.2,
    searchGrounding: true,
    searchContextSize: 'high',
  });
  assert.ok(!('tools' in grounded), 'web_search triggers Muse 400 on chat/completions');
  // Truncation-fix fields survive grounding.
  assert.equal(grounded['stream'], true);
  assert.equal(grounded['max_tokens'], MUSE_MAX_OUTPUT_TOKENS);

  const defaultSize = buildMuseRequestBody({
    model: 'muse-spark-1.3',
    systemInstruction: 'sys',
    prompt: 'user-goal',
    temperature: 0.2,
    searchGrounding: true,
  });
  assert.ok(!('tools' in defaultSize));

  const ungrounded = buildMuseRequestBody({
    model: 'muse-spark-1.3',
    systemInstruction: 'sys',
    prompt: 'user-goal',
    temperature: 0.2,
  });
  assert.ok(!('tools' in ungrounded));
});

test('endpoint builder appends the completions suffix to the operator base URL', () => {
  assert.equal(
    buildMuseEndpoint('https://api.muse.ai/v1'),
    'https://api.muse.ai/v1/chat/completions'
  );
  assert.equal(
    buildMuseEndpoint('https://api.muse.ai/v1/'),
    'https://api.muse.ai/v1/chat/completions'
  );
  // Operator-owned path prefixes pass through verbatim so a wrong env
  // value (e.g. a /hatch/v1 prefix that 404s) is echoed back, not hidden.
  assert.equal(
    buildMuseEndpoint('https://example.com/hatch/v1'),
    'https://example.com/hatch/v1/chat/completions'
  );
});

test('request body never emits thinkingConfig (Muse 400 regression)', () => {
  const body = buildMuseRequestBody({
    model: 'muse-spark-1.3-contributor',
    systemInstruction: 'sys',
    prompt: 'user-goal',
    temperature: 0.2,
    // A stale caller passing the old Gemini-style fragment must not leak it.
    thinkingPayload: {
      reasoning_effort: 'max',
      thinkingConfig: { thinkingLevel: 'max', thinkingSummaries: 'auto' },
    },
  });
  assert.equal(body['reasoning_effort'], 'max');
  assert.ok(!('thinkingConfig' in body), 'thinkingConfig triggers Muse 400');
});

test('responses endpoint appends the responses suffix', () => {
  assert.equal(
    buildMuseResponsesEndpoint('https://api.meta.ai/v1'),
    'https://api.meta.ai/v1/responses'
  );
  assert.equal(
    buildMuseResponsesEndpoint('https://api.meta.ai/v1/'),
    'https://api.meta.ai/v1/responses'
  );
});

test('responses body carries web_search grounding with input array', () => {
  const grounded = buildMuseResponsesRequestBody({
    model: 'muse-spark-1.3',
    systemInstruction: 'sys',
    prompt: 'user-goal',
    historyMessages: [{ role: 'user', content: 'prior' }],
    temperature: 0.2,
    thinkingPayload: { reasoning_effort: 'high' },
    searchGrounding: true,
    searchContextSize: 'high',
  });
  assert.deepEqual(grounded['tools'], [{ type: 'web_search', search_context_size: 'high' }]);
  assert.equal(grounded['max_output_tokens'], MUSE_MAX_OUTPUT_TOKENS);
  assert.ok(!('max_tokens' in grounded));
  assert.deepEqual(grounded['reasoning'], { effort: 'high' });
  assert.ok(!('reasoning_effort' in grounded), 'top-level reasoning_effort 400s on /responses');
  const input = grounded['input'] as { role: string; content: string }[];
  assert.deepEqual(
    input.map((m) => m.role),
    ['system', 'user', 'user']
  );

  const ungrounded = buildMuseResponsesRequestBody({
    model: 'muse-spark-1.3',
    systemInstruction: 'sys',
    prompt: 'user-goal',
    temperature: 0.2,
  });
  assert.ok(!('tools' in ungrounded));
});

test('responses effort maps max onto the documented xhigh ceiling', () => {
  assert.equal(normalizeMuseResponsesEffort('max'), 'xhigh');
  assert.equal(normalizeMuseResponsesEffort('xhigh'), 'xhigh');
  assert.equal(normalizeMuseResponsesEffort('bogus'), 'high');
});

test('responses stream reassembles output_text deltas and stops at completed', () => {
  const parser = createMuseStreamParser();
  const out: string[] = [];
  const payload =
    `data: ${JSON.stringify({ type: 'response.output_text.delta', delta: 'Hello' })}\n\n` +
    `data: ${JSON.stringify({ type: 'response.output_text.delta', delta: ' world' })}\n\n` +
    `data: ${JSON.stringify({ type: 'response.completed' })}\n\n`;
  for (const chunk of [payload.slice(0, 29), payload.slice(29)]) {
    out.push(...pushMuseResponsesSseText(parser, chunk));
    if (parser.finished) break;
  }
  if (!parser.finished) out.push(...flushMuseResponsesStreamParser(parser));
  assert.equal(out.join(''), 'Hello world');
  assert.equal(parser.finished, true);
  assert.equal(extractMuseResponsesDeltaText({ type: 'response.output_text.delta', delta: 'x' }), 'x');
});

test('chat usage chunk records cached tokens without emitting text', () => {
  const parser = createMuseStreamParser();
  const out: string[] = [];
  const payload =
    deltaEvent('Hello') +
    `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 1000, completion_tokens: 10, total_tokens: 1010, prompt_tokens_details: { cached_tokens: 400 } } })}\n\n` +
    doneEvent;
  out.push(...pushMuseSseText(parser, payload));
  assert.equal(out.join(''), 'Hello');
  assert.equal(parser.finished, true);
  assert.equal(parser.cachedInputTokens, 400);
});

test('responses completed event records nested usage cached tokens', () => {
  const parser = createMuseStreamParser();
  const out: string[] = [];
  const payload =
    `data: ${JSON.stringify({ type: 'response.output_text.delta', delta: 'Hi' })}\n\n` +
    `data: ${JSON.stringify({ type: 'response.completed', response: { usage: { input_tokens: 800, output_tokens: 20, input_tokens_details: { cached_tokens: 250 } } } })}\n\n`;
  out.push(...pushMuseResponsesSseText(parser, payload));
  assert.equal(out.join(''), 'Hi');
  assert.equal(parser.finished, true);
  assert.equal(parser.cachedInputTokens, 250);
});

test('extractMuseUsageCachedTokens stays zero without usage telemetry', () => {
  assert.equal(extractMuseUsageCachedTokens({ choices: [{ delta: { content: 'x' } }] }), 0);
  assert.equal(extractMuseUsageCachedTokens(null), 0);
  assert.equal(extractMuseUsageCachedTokens('garbage'), 0);
  assert.equal(
    extractMuseUsageCachedTokens({ usage: { prompt_tokens_details: { cached_tokens: 12.9 } } }),
    12
  );
});
