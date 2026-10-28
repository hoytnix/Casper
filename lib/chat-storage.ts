import type { ChatMessage, ImageAttachment } from '@/types';
import { imageAttachmentSchema } from './image-attachments.ts';
import { formatCompiledPrompt, extractSuggestedRefactors, dedupeConsecutiveAssistantMessages } from './utils.ts';

// Chat-history persistence helpers, extracted verbatim from useRepoStore:
// load-time sanitizing, save-time formatting, and the image-quota budget.
// All localStorage writes are best-effort and never throw; text is always
// preserved even when blobs must be stripped.

// Storage quota guard: image blobs are large, so chat persistence budgets
// ~4.5MB for dataUrls. Strips oldest message images first, keeps all text.
export const CHAT_IMAGE_BYTES_BUDGET = 4.5 * 1024 * 1024;

export function chatImageBytes(messages: ChatMessage[]): number {
  let total = 0;
  for (const m of messages) {
    if (Array.isArray(m.images)) {
      for (const img of m.images) total += img.sizeBytes || 0;
    }
  }
  return total;
}

function stripOldestMessageImages(messages: ChatMessage[]): ChatMessage[] {
  let stripped = false;
  const next = messages.map((m) => {
    if (!stripped && Array.isArray(m.images) && m.images.length > 0) {
      stripped = true;
      const { images: _dropped, imageTokensCount: _droppedTokens, ...rest } = m;
      void _dropped;
      void _droppedTokens;
      return rest;
    }
    return m;
  });
  return next;
}

// Validates persisted image entries: drops malformed dataUrls, caps at 4
// per message. Returns a spreadable patch ({} when no valid images).
function sanitizeMessageImages(m: ChatMessage): { images?: ImageAttachment[] } {
  if (!Array.isArray(m.images) || m.images.length === 0) return {};
  const valid = m.images.filter((img) => imageAttachmentSchema.safeParse(img).success);
  if (valid.length === 0) return {};
  return { images: valid.slice(0, 4) };
}

// Load pipeline: sanitizes corrupted proxy warmup HTML, formats compiled
// prompts, then collapses double-fired twin assistant bubbles so reloads
// never show doubles.
export function sanitizeLoadedMessages(parsed: ChatMessage[]): ChatMessage[] {
  // Automatically sanitize any corrupted proxy warmup HTML and format compiled prompts
  const sanitized = parsed.map((m) => {
    let content = m.content || '';
    const trimmed = content.trim().toLowerCase();
    if (
      trimmed.startsWith('<!doctype') ||
      trimmed.startsWith('<html') ||
      trimmed.includes('starting server...') ||
      trimmed.includes('please wait while your application starts')
    ) {
      return {
        ...m,
        content:
          '> ⚠️ **Upstream Gateway Interrupted (Warmup HTML Detected)**\n> The compilation request timed out upstream and returned the server startup page instead of Markdown.\n\nPlease click **Recompile Prompt** to execute with the optimized cascading pipeline.',
        ...sanitizeMessageImages(m),
      };
    }
    let suggestedRefactors = m.suggestedRefactors;
    if (m.role === 'assistant') {
      const { cleanPrompt, refactors } = extractSuggestedRefactors(content);
      content = formatCompiledPrompt(cleanPrompt);
      if ((!suggestedRefactors || suggestedRefactors.length === 0) && refactors.length > 0) {
        suggestedRefactors = refactors;
      }
    }
    return {
      ...m,
      content,
      suggestedRefactors,
      ...sanitizeMessageImages(m),
    };
  });
  // Backstop: a double-fired compile persists twin assistant bubbles;
  // collapse them on hydrate so reloads never show doubles.
  return dedupeConsecutiveAssistantMessages(sanitized);
}

// Fast-path probe for the save pipeline below: the full formatter runs
// several regexes (plus JSON.parse attempts) over the whole prompt. When
// the content carries none of the marker sequences (`---` for the
// SUGGESTED_REFACTORS delimiter, 2+ backticks/tildes for code fences),
// every one of those patterns provably cannot match, so the formatted
// output is exactly `content.trim()` with no extracted refactors. Skipping
// the regex suite keeps submit keydowns (which save synchronously) fast.
export function needsPromptFormatting(content: string): boolean {
  return /(`{2,}|~{2,}|---)/.test(content);
}

// Save pipeline: formats assistant prompts, then collapses twin assistant
// bubbles before state or storage sees them.
export function formatMessagesForSave(messages: ChatMessage[]): ChatMessage[] {
  const formatted = messages.map((m) => {
    if (m.role === 'assistant') {
      if (!needsPromptFormatting(m.content || '')) {
        return {
          ...m,
          content: (m.content || '').trim(),
          suggestedRefactors:
            m.suggestedRefactors && m.suggestedRefactors.length > 0
              ? m.suggestedRefactors
              : undefined,
        };
      }
      const { cleanPrompt, refactors } = extractSuggestedRefactors(m.content);
      const content = formatCompiledPrompt(cleanPrompt);
      const suggestedRefactors =
        m.suggestedRefactors && m.suggestedRefactors.length > 0
          ? m.suggestedRefactors
          : refactors.length > 0
          ? refactors
          : undefined;
      return {
        ...m,
        content,
        suggestedRefactors,
      };
    }
    return m;
  });
  // Collapse twin assistant bubbles before state or storage sees them.
  return dedupeConsecutiveAssistantMessages(formatted);
}

// Quota-guarded persist: image blobs can exceed localStorage limits.
// Strip oldest message images (text always preserved) and retry until
// the payload fits or no images remain. Never throws.
export function persistChatMessages(storageKey: string, messages: ChatMessage[]): void {
  try {
    let persistable = messages;
    while (chatImageBytes(persistable) > CHAT_IMAGE_BYTES_BUDGET) {
      const stripped = stripOldestMessageImages(persistable);
      if (stripped === persistable) break;
      persistable = stripped;
      if (!persistable.some((m) => Array.isArray(m.images) && m.images.length > 0)) break;
    }
    try {
      localStorage.setItem(storageKey, JSON.stringify(persistable));
    } catch {
      const textOnly = persistable.map((m) => {
        if (!Array.isArray(m.images) || m.images.length === 0) return m;
        const { images: _dropped, imageTokensCount: _droppedTokens, ...rest } = m;
        void _dropped;
        void _droppedTokens;
        return rest;
      });
      try {
        localStorage.setItem(storageKey, JSON.stringify(textOnly));
      } catch (e) {
        console.warn('Failed to persist chat messages to localStorage:', e);
      }
    }
  } catch (e) {
    console.warn('Failed to persist chat messages to localStorage:', e);
  }
}

type PersistWriter = (storageKey: string, messages: ChatMessage[]) => void;

// Coalesced pending writes, keyed by storage key: a newer save for the
// same repo supersedes the older one, so rapid successive saves (submit
// echo, error notice, stream finalization) perform a single write of the
// latest messages.
const pendingPersists = new Map<string, { cancel: () => void }>();

// Idle-deferred persist: JSON.stringify of image-carrying histories plus
// the localStorage write runs synchronously in submit keydowns today,
// blocking the next paint for hundreds of ms (the keydown INP trace).
// Scheduling after paint keeps state updates instant while the write
// still lands via idle callback (2s timeout backstop) or a macrotask
// fallback. Never throws; falls back to a synchronous write only when
// scheduling itself fails, so the write is never lost.
export function schedulePersistChatMessages(
  storageKey: string,
  messages: ChatMessage[],
  writer: PersistWriter = persistChatMessages
): void {
  try {
    pendingPersists.get(storageKey)?.cancel();
    pendingPersists.delete(storageKey);
    const fire = () => {
      pendingPersists.delete(storageKey);
      writer(storageKey, messages);
    };
    const w =
      typeof window !== 'undefined'
        ? (window as Window & {
            requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
            cancelIdleCallback?: (handle: number) => void;
          })
        : undefined;
    if (w && typeof w.requestIdleCallback === 'function') {
      const id = w.requestIdleCallback(fire, { timeout: 2000 });
      pendingPersists.set(storageKey, {
        cancel: () => {
          if (typeof w.cancelIdleCallback === 'function') w.cancelIdleCallback(id);
        },
      });
    } else {
      const id = setTimeout(fire, 0);
      pendingPersists.set(storageKey, { cancel: () => clearTimeout(id) });
    }
  } catch {
    persistChatMessages(storageKey, messages);
  }
}

// Drops a scheduled write without firing it. Callers that synchronously
// overwrite or remove the same key (message delete, history clear) must
// cancel first, or the stale deferred write would resurrect old messages.
export function cancelScheduledPersist(storageKey: string): void {
  try {
    pendingPersists.get(storageKey)?.cancel();
  } finally {
    pendingPersists.delete(storageKey);
  }
}
