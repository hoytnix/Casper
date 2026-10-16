'use client';

import { useState, useSyncExternalStore } from 'react';
import { Repo, AppSettings, ChatMessage, IngestionSnapshot } from '@/types';
import { formatCompiledPrompt } from '@/lib/utils';

const STORAGE_KEYS = {
  REPOS: 'antigravity_repos_v1',
  SETTINGS: 'antigravity_settings_v1',
  ACTIVE_REPO_ID: 'antigravity_active_repo_id',
  CHATS_PREFIX: 'antigravity_chats_',
};

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

const DEFAULT_SETTINGS: AppSettings = {
  githubPat: '',
  customApiKey: '',
  preferredModel: 'gemini-3.6-flash',
  defaultMode: 'agentic',
  maxAgenticRounds: 3,
  routerEngine: 'auto',
};

const emptySubscribe = () => () => {};

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
      if (storedSettings) return JSON.parse(storedSettings);
    } catch {
      // fallback
    }
    return DEFAULT_SETTINGS;
  });

  const [chatHistory, setChatHistory] = useState<Record<string, ChatMessage[]>>({});
  const [snapshots, setSnapshots] = useState<Record<string, IngestionSnapshot>>({});

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
            };
          }
          if (m.role === 'assistant') {
            content = formatCompiledPrompt(content);
          }
          return {
            ...m,
            content,
          };
        });
        setChatHistory((prev) => ({ ...prev, [repoId]: sanitized }));
        return sanitized;
      }
    } catch (e) {
      console.warn('Failed to load chat history for repo:', e);
    }
    return [];
  };

  const saveMessages = (repoId: string, messages: ChatMessage[]) => {
    const formatted = messages.map((m) =>
      m.role === 'assistant' ? { ...m, content: formatCompiledPrompt(m.content) } : m
    );
    setChatHistory((prev) => ({ ...prev, [repoId]: formatted }));
    try {
      localStorage.setItem(STORAGE_KEYS.CHATS_PREFIX + repoId, JSON.stringify(formatted));
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
