'use client';

import { useState, useEffect, useSyncExternalStore } from 'react';
import { Repo, AppSettings, ChatMessage, IngestionSnapshot, SuggestedDirective } from '@/types';
import { suggestedDirectiveListSchema } from '@/lib/suggestion-schemas';
import {
  saveSnapshotToDB,
  loadAllSnapshotsFromDB,
  deleteSnapshotFromDB,
} from '@/lib/snapshot-db';
import {
  sanitizeLoadedMessages,
  formatMessagesForSave,
  schedulePersistChatMessages,
  cancelScheduledPersist,
} from '@/lib/chat-storage';
import {
  DEFAULT_SETTINGS,
  normalizeStoredSettings,
} from '@/lib/settings-store';

export { DEFAULT_MODELS } from '@/lib/settings-store';
export {
  DEFAULT_LOCAL_CONTEXT_TOKENS,
  DEFAULT_LOCAL_MODEL_ID,
  LOCAL_ENGINE_VALUES,
  LOCAL_MODELS,
  SHORT_CONTEXT_NOTE,
  getFittingModelsUnder2GB,
  getLocalModelSpec,
  isKnownRouterEngine,
  isLocalGenerationEngine,
  isTinyFilter,
  requiresGatingNotice,
  validateLocalContextTokens,
} from '@/lib/settings-store';

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

const emptySubscribe = () => () => {};

// Storage quota guard: image blobs are large, so chat persistence budgets
// ~4.5MB for dataUrls. Strips oldest message images first, keeps all text.

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
        const parsed: Record<string, unknown> = JSON.parse(storedSettings);
        return normalizeStoredSettings(parsed);
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
        const deduped = sanitizeLoadedMessages(parsed);
        setChatHistory((prev) => ({ ...prev, [repoId]: deduped }));
        return deduped;
      }
    } catch (e) {
      console.warn('Failed to load chat history for repo:', e);
    }
    return [];
  };

  const saveMessages = (repoId: string, messages: ChatMessage[]) => {
    const deduped = formatMessagesForSave(messages);
    setChatHistory((prev) => ({ ...prev, [repoId]: deduped }));
    // Storage write leaves the keydown path: state (above) stays
    // synchronous so the UI and cache are instant; the multi-MB stringify
    // + disk write lands idle (see schedulePersistChatMessages).
    schedulePersistChatMessages(STORAGE_KEYS.CHATS_PREFIX + repoId, deduped);
  };

  const deleteMessage = (repoId: string, messageId: string) => {
    // Cancel first: a still-pending deferred save would otherwise resurrect
    // the pre-delete history after this synchronous removal.
    cancelScheduledPersist(STORAGE_KEYS.CHATS_PREFIX + repoId);
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
    // Same resurrection guard as deleteMessage above.
    cancelScheduledPersist(STORAGE_KEYS.CHATS_PREFIX + repoId);
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
