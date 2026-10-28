/**
 * Summarizes per-model cascade attempt failures for the `/api/compile`
 * SSE `error` event, so the browser can show WHY every model failed
 * instead of only the generic "all models failed" verdict.
 * Pure (no value imports) so `node --test` resolves it directly.
 */

export interface CascadeAttemptFailure {
  model: string;
  pass: number;
  thinking?: boolean;
  error: unknown;
}

function messageOf(error: unknown): string {
  if (error === undefined || error === null) return 'Unknown error';
  if (error instanceof Error && error.message.length > 0) return error.message;
  if (typeof error === 'string' && error.length > 0) return error;
  try {
    const text = String(error);
    return text.length > 0 && text !== '[object Object]' ? text : 'Unknown error';
  } catch {
    return 'Unknown error';
  }
}

export function summarizeCascadeFailures(
  attempts: CascadeAttemptFailure[],
  maxChars = 1200
): string {
  if (attempts.length === 0) return 'No provider attempts were recorded.';

  const seen = new Set<string>();
  const lines: string[] = [];
  for (const attempt of attempts) {
    const thinkingSuffix =
      attempt.thinking === undefined ? '' : `, thinking ${attempt.thinking ? 'on' : 'off'}`;
    const line = `${attempt.model} (pass ${attempt.pass}${thinkingSuffix}): ${messageOf(attempt.error)}`;
    if (seen.has(line)) continue;
    seen.add(line);
    lines.push(line);
  }

  const joined = lines.join('\n');
  if (joined.length <= maxChars) return joined;
  return `${joined.slice(0, maxChars - 1)}…`;
}
