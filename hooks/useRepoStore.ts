'use client';

import { useState, useEffect, useSyncExternalStore } from 'react';
import { Repo, AppSettings, ChatMessage, ImageAttachment, IngestionSnapshot, ModelConfig, SuggestedDirective } from '@/types';
import { suggestedDirectiveListSchema } from '@/lib/suggestion-schemas';
import { imageAttachmentSchema } from '@/lib/image-attachments';
import { normalizeThinkingLevel, normalizeThinkingSummaries } from '@/lib/thinking-levels';
import { normalizeSearchContextSize } from '@/lib/search-grounding';
import { formatCompiledPrompt, extractSuggestedRefactors, dedupeConsecutiveAssistantMessages } from '@/lib/utils';
import {
  saveSnapshotToDB,
  loadAllSnapshotsFromDB,
  deleteSnapshotFromDB,
} from '@/lib/snapshot-db';

const STORAGE_KEYS = {
  REPOS: 'antigravity_repos_v1',
  SETTINGS: 'antigravity_settings_v1',
  ACTIVE_REPO_ID: 'antigravity_active_repo_id',
  CHATS_PREFIX: 'antigravity_chats_',
  COMMIT_SHAS: 'antigravity_commit_shas_v1',
  DIRECTIVES_PREFIX: 'antigravity_directives_',
  DISMISSED_PREFIX: 'antigravity_dismissed_',
};

function directivesKey(repoId: string): string {
  return STORAGE_KEYS.DIRECTIVES_PREFIX + repoId;
}

function dismissedKey(repoId: string): string {
  return STORAGE_KEYS.DISMISSED_PREFIX + repoId;
}

// Per-repo last-good suggestion cache (localStorage only, best-effort).
// Re-validated on load; invalid entries are dropped.
export function loadCachedDirectives(repoId: string): SuggestedDirective[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(directivesKey(repoId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : (parsed as { directives?: unknown }).directives;
    const checked = suggestedDirectiveListSchema.safeParse(list);
    if (checked.success) return checked.data.slice(0, 4);
    return [];
  } catch {
    return [];
  }
}

export function saveCachedDirectives(repoId: string, directives: SuggestedDirective[]): void {
  if (typeof window === 'undefined') return;
  try {
    const checked = suggestedDirectiveListSchema.safeParse(directives.slice(0, 4));
    if (!checked.success) return;
    localStorage.setItem(
      directivesKey(repoId),
      JSON.stringify({ directives: checked.data, timestamp: Date.now() })
    );
  } catch {
    // Best-effort: quota errors are caught and ignored; never break chat save/load.
  }
}

export function loadDismissedPrompts(repoId: string): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(dismissedKey(repoId));
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((p): p is string => typeof p === 'string'));
  } catch {
    return new Set();
  }
}

export function saveDismissedPrompt(repoId: string, prompt: string): void {
  if (typeof window === 'undefined') return;
  try {
    const current = loadDismissedPrompts(repoId);
    current.add(prompt.toLowerCase().trim());
    localStorage.setItem(dismissedKey(repoId), JSON.stringify(Array.from(current).slice(-50)));
  } catch {
    // Best-effort: quota errors are caught and ignored.
  }
}

const DEFAULT_REPOS: Repo[] = [
  {
    id: 'vercel-swr',
    owner: 'vercel',
    repo: 'swr',
    branch: 'main',
    defaultBranch: 'main',
    description: 'React Hooks for Data Fetching: lightweight, fast, and reactive.',
    stars: 30500,
    lastSyncedAt: null,
    isPrivate: false,
    excludedPatterns: ['examples/', 'test/', '*.spec.ts'],
  },
  {
    id: 'colinhacks-zod',
    owner: 'colinhacks',
    repo: 'zod',
    branch: 'master',
    defaultBranch: 'master',
    description: 'TypeScript-first schema validation with static type inference.',
    stars: 35000,
    lastSyncedAt: null,
    isPrivate: false,
    excludedPatterns: ['deno/', 'playground/'],
  },
  {
    id: 'tailwindlabs-heroicons',
    owner: 'tailwindlabs',
    repo: 'heroicons',
    branch: 'master',
    defaultBranch: 'master',
    description: 'A set of free, MIT-licensed high-quality SVG icons by Tailwind CSS.',
    stars: 21800,
    lastSyncedAt: null,
    isPrivate: false,
    excludedPatterns: [],
  },
];

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

const DEFAULT_SETTINGS: AppSettings = {
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

const emptySubscribe = () => () => {};

// Storage quota guard: image blobs are large, so chat persistence budgets
// ~4.5MB for dataUrls. Strips oldest message images first, keeps all text.
const CHAT_IMAGE_BYTES_BUDGET = 4.5 * 1024 * 1024;

function chatImageBytes(messages: ChatMessage[]): number {
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

export function useRepoStore() {
  const isLoaded = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  const [repos, setRepos] = useState<Repo[]>(() => {
    if (typeof window === 'undefined') return DEFAULT_REPOS;
    try {
      const storedRepos = localStorage.getItem(STORAGE_KEYS.REPOS);
      if (storedRepos) return JSON.parse(storedRepos);
      localStorage.setItem(STORAGE_KEYS.REPOS, JSON.stringify(DEFAULT_REPOS));
    } catch {
      // fallback
    }
    return DEFAULT_REPOS;
  });

  const [activeRepoId, setActiveRepoId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      return localStorage.getItem(STORAGE_KEYS.ACTIVE_REPO_ID);
    } catch {
      return null;
    }
  });

  const [settings, setSettings] = useState<AppSettings>(() => {
    if (typeof window === 'undefined') return DEFAULT_SETTINGS;
    try {
      const storedSettings = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (storedSettings) {
        const parsed = JSON.parse(storedSettings);
        let models: ModelConfig[] = parsed.models && Array.isArray(parsed.models) && parsed.models.length > 0
          ? parsed.models
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
    } catch {
      // fallback
    }
    return DEFAULT_SETTINGS;
  });

  const [chatHistory, setChatHistory] = useState<Record<string, ChatMessage[]>>({});
  const [snapshots, setSnapshots] = useState<Record<string, IngestionSnapshot>>({});

  // Hydrate repository snapshots from IndexedDB on initial mount
  useEffect(() => {
    let isMounted = true;
    loadAllSnapshotsFromDB()
      .then((storedSnapshots) => {
        if (!isMounted) return;
        if (storedSnapshots && Object.keys(storedSnapshots).length > 0) {
          setSnapshots((prev) => ({ ...storedSnapshots, ...prev }));
        }
      })
      .catch((err) => console.warn('Failed to load snapshots from IndexedDB:', err));

    return () => {
      isMounted = false;
    };
  }, []);

  // Save repos
  const saveRepos = (newRepos: Repo[]) => {
    setRepos(newRepos);
    try {
      localStorage.setItem(STORAGE_KEYS.REPOS, JSON.stringify(newRepos));
    } catch (e) {
      console.error('Failed to save repos to localStorage:', e);
    }
  };

  // Add repo
  const addRepo = (repo: Repo) => {
    const updated = [repo, ...repos.filter((r) => r.id !== repo.id)];
    saveRepos(updated);
    setActiveRepoId(repo.id);
  };

  // Update repo
  const updateRepo = (id: string, updates: Partial<Repo>) => {
    const updated = repos.map((r) => (r.id === id ? { ...r, ...updates } : r));
    saveRepos(updated);
  };

  // Delete repo
  const deleteRepo = (id: string) => {
    const updated = repos.filter((r) => r.id !== id);
    saveRepos(updated);
    if (activeRepoId === id) {
      setActiveRepoId(null);
    }
    // Clean up snapshot from in-memory state and IndexedDB
    setSnapshots((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    deleteSnapshotFromDB(id).catch((e) =>
      console.warn('Failed to delete snapshot from IndexedDB:', e)
    );
    try {
      const storedShas = localStorage.getItem(STORAGE_KEYS.COMMIT_SHAS);
      if (storedShas) {
        const shaMap = JSON.parse(storedShas);
        delete shaMap[id];
        localStorage.setItem(STORAGE_KEYS.COMMIT_SHAS, JSON.stringify(shaMap));
      }
    } catch {
      // fallback
    }
  };

  // Switch active repo
  const selectRepo = (id: string | null) => {
    setActiveRepoId(id);
    if (id) {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_REPO_ID, id);
    } else {
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_REPO_ID);
    }
  };

  // Save settings
  const updateSettings = (newSettings: Partial<AppSettings>) => {
    setSettings((prev) => {
      const merged = { ...prev, ...newSettings };
      try {
        localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(merged));
      } catch (e) {
        console.error('Failed to save settings:', e);
      }
      return merged;
    });
  };

  // Chat message management for active repo
  const loadMessages = (repoId: string): ChatMessage[] => {
    if (chatHistory[repoId]) return chatHistory[repoId];
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.CHATS_PREFIX + repoId);
      if (stored) {
        const parsed: ChatMessage[] = JSON.parse(stored);
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
        const deduped = dedupeConsecutiveAssistantMessages(sanitized);
        setChatHistory((prev) => ({ ...prev, [repoId]: deduped }));
        return deduped;
      }
    } catch (e) {
      console.warn('Failed to load chat history for repo:', e);
    }
    return [];
  };

  const saveMessages = (repoId: string, messages: ChatMessage[]) => {
    const formatted = messages.map((m) => {
      if (m.role === 'assistant') {
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
    const deduped = dedupeConsecutiveAssistantMessages(formatted);
    setChatHistory((prev) => ({ ...prev, [repoId]: deduped }));
    // Quota-guarded persist: image blobs can exceed localStorage limits.
    // Strip oldest message images (text always preserved) and retry until
    // the payload fits or no images remain. Never throws.
    try {
      let persistable = deduped;
      while (chatImageBytes(persistable) > CHAT_IMAGE_BYTES_BUDGET) {
        const stripped = stripOldestMessageImages(persistable);
        if (stripped === persistable) break;
        persistable = stripped;
        if (!persistable.some((m) => Array.isArray(m.images) && m.images.length > 0)) break;
      }
      try {
        localStorage.setItem(STORAGE_KEYS.CHATS_PREFIX + repoId, JSON.stringify(persistable));
      } catch {
        const textOnly = persistable.map((m) => {
          if (!Array.isArray(m.images) || m.images.length === 0) return m;
          const { images: _dropped, imageTokensCount: _droppedTokens, ...rest } = m;
          void _dropped;
          void _droppedTokens;
          return rest;
        });
        try {
          localStorage.setItem(STORAGE_KEYS.CHATS_PREFIX + repoId, JSON.stringify(textOnly));
        } catch (e) {
          console.warn('Failed to persist chat messages to localStorage:', e);
        }
      }
    } catch (e) {
      console.warn('Failed to persist chat messages to localStorage:', e);
    }
  };

  const deleteMessage = (repoId: string, messageId: string) => {
    setChatHistory((prev) => {
      const current = prev[repoId] || [];
      const updated = current.filter((m) => m.id !== messageId);
      try {
        localStorage.setItem(STORAGE_KEYS.CHATS_PREFIX + repoId, JSON.stringify(updated));
      } catch (e) {
        console.warn('Failed to persist deletion to localStorage:', e);
      }
      return { ...prev, [repoId]: updated };
    });
  };

  const clearMessages = (repoId: string) => {
    setChatHistory((prev) => ({ ...prev, [repoId]: [] }));
    try {
      localStorage.removeItem(STORAGE_KEYS.CHATS_PREFIX + repoId);
    } catch (e) {
      console.warn('Failed to clear messages:', e);
    }
  };

  const saveSnapshot = (repoId: string, snapshot: IngestionSnapshot) => {
    setSnapshots((prev) => ({ ...prev, [repoId]: snapshot }));
    // Persist full snapshot with cached files to IndexedDB
    saveSnapshotToDB(repoId, snapshot).catch((e) =>
      console.warn('Failed to persist snapshot to IndexedDB:', e)
    );
    // Persist commit SHA to localStorage for fast delta checks
    try {
      const storedShas = localStorage.getItem(STORAGE_KEYS.COMMIT_SHAS);
      const shaMap = storedShas ? JSON.parse(storedShas) : {};
      shaMap[repoId] = snapshot.commitSha;
      localStorage.setItem(STORAGE_KEYS.COMMIT_SHAS, JSON.stringify(shaMap));
    } catch {
      // fallback
    }
  };

  const activeRepo = repos.find((r) => r.id === activeRepoId) || null;

  return {
    isLoaded,
    repos,
    activeRepo,
    activeRepoId,
    settings,
    addRepo,
    updateRepo,
    deleteRepo,
    selectRepo,
    updateSettings,
    loadMessages,
    saveMessages,
    deleteMessage,
    clearMessages,
    saveSnapshot,
    snapshots,
  };
}
