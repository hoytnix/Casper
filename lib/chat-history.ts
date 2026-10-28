/**
 * Multi-turn conversation history normalizer for the /api/compile pipeline.
 *
 * The compile route is stateless HTTP: every request re-sends the stable
 * prompt prefix (system instruction + repository snapshot + prior turns), so
 * Gemini's implicit context caching can discount the repeated prefix. This
 * module bounds and normalizes client-supplied chat turns so that prefix
 * stays well-formed: alternating user/assistant roles, no empty turns, and
 * hard character budgets (assistant turns carry full compiled prompts and
 * would otherwise explode input tokens on every follow-up).
 */

export interface PlainHistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface GenAiHistoryTurn {
  role: 'user' | 'model';
  parts: { text: string }[];
}

export interface HistoryBudget {
  /** Keep at most this many of the most recent turns. */
  maxTurns?: number;
  /** Truncate any single turn beyond this many characters. */
  maxCharsPerTurn?: number;
  /** Drop oldest turns until the total fits this many characters. */
  maxTotalChars?: number;
}

const DEFAULT_BUDGET: Required<HistoryBudget> = {
  maxTurns: 10,
  maxCharsPerTurn: 6000,
  maxTotalChars: 24000,
};

/**
 * Normalizes raw client chat messages into bounded plain turns.
 * Never throws on malformed input — returns [] instead.
 */
export function normalizeConversationHistory(
  messages: unknown,
  budget: HistoryBudget = {}
): PlainHistoryTurn[] {
  const { maxTurns, maxCharsPerTurn, maxTotalChars } = {
    ...DEFAULT_BUDGET,
    ...budget,
  };
  if (!Array.isArray(messages)) return [];

  const cleaned: PlainHistoryTurn[] = [];
  for (const msg of messages) {
    if (!msg || typeof msg !== 'object') continue;
    const { role, content } = msg as { role?: unknown; content?: unknown };
    if (role !== 'user' && role !== 'assistant') continue;
    if (typeof content !== 'string') continue;
    const text = content.trim();
    if (!text) continue;
    cleaned.push({
      role,
      content: text.length > maxCharsPerTurn ? text.slice(0, maxCharsPerTurn) : text,
    });
  }

  // Merge consecutive same-role turns so history strictly alternates.
  const merged: PlainHistoryTurn[] = [];
  for (const turn of cleaned) {
    const prev = merged[merged.length - 1];
    if (prev && prev.role === turn.role) {
      prev.content = `${prev.content}\n\n${turn.content}`;
    } else {
      merged.push({ ...turn });
    }
  }

  // History must open with a user turn; drop orphaned leading assistant turns.
  while (merged.length > 0 && merged[0].role !== 'user') {
    merged.shift();
  }

  // Keep the most recent turns, then enforce the total character budget
  // oldest-first so the newest turn always survives.
  const recent = merged.slice(-Math.max(1, maxTurns));
  let total = recent.reduce((acc, t) => acc + t.content.length, 0);
  while (recent.length > 1 && total > maxTotalChars) {
    const dropped = recent.shift();
    total -= dropped ? dropped.content.length : 0;
  }
  if (recent.length === 1 && recent[0].content.length > maxTotalChars) {
    recent[0] = { ...recent[0], content: recent[0].content.slice(0, maxTotalChars) };
  }
  return recent;
}

/** Maps normalized turns to Google GenAI `history` contents. */
export function toGenAiHistory(history: PlainHistoryTurn[]): GenAiHistoryTurn[] {
  return history.map((turn) => ({
    role: turn.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: turn.content }],
  }));
}

/** Maps normalized turns to Muse-style chat messages. */
export function toMuseMessages(
  history: PlainHistoryTurn[]
): { role: 'user' | 'assistant'; content: string }[] {
  return history.map((turn) => ({ role: turn.role, content: turn.content }));
}
