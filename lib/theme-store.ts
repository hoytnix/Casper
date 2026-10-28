import { useSyncExternalStore } from 'react';
import type { ThemeId } from '@/types/theme';
import { DEFAULT_THEME_ID, THEME_STORAGE_KEY, parseThemeId } from './theme-schema.ts';

// Client-only theme state. No zustand in this repo: plain external store
// with useSyncExternalStore, same persistence discipline as settings-store
// (localStorage, never throws) but an isolated key to avoid migration
// coupling. Never import into a Server Component; consume via
// ThemeProvider / ThemeSwitcher only.

let currentTheme: ThemeId = DEFAULT_THEME_ID;
let hydrated = false;
const listeners = new Set<() => void>();

function loadStoredTheme(): ThemeId {
  if (typeof window === 'undefined') return DEFAULT_THEME_ID;
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (!raw) return DEFAULT_THEME_ID;
    return parseThemeId(JSON.parse(raw)) ?? DEFAULT_THEME_ID;
  } catch {
    return DEFAULT_THEME_ID;
  }
}

function ensureHydrated(): void {
  if (!hydrated) {
    hydrated = true;
    currentTheme = loadStoredTheme();
  }
}

function emit(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // A broken subscriber must never break theme switching.
    }
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): ThemeId {
  ensureHydrated();
  return currentTheme;
}

function getServerSnapshot(): ThemeId {
  return DEFAULT_THEME_ID;
}

export function setTheme(id: ThemeId): void {
  // Zod-guarded setter: invalid IDs are ignored, never persisted.
  const parsed = parseThemeId(id);
  if (!parsed) return;
  ensureHydrated();
  if (parsed === currentTheme) return;
  currentTheme = parsed;
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(parsed));
    } catch {
      // Quota or privacy mode: theme still applies for this session.
    }
  }
  emit();
}

export function resetTheme(): void {
  setTheme(DEFAULT_THEME_ID);
}

export function getStoredTheme(): ThemeId {
  return getSnapshot();
}

export function useThemeStore(): ThemeId;
export function useThemeStore<T>(selector: (id: ThemeId) => T): T;
export function useThemeStore<T>(selector?: (id: ThemeId) => T): ThemeId | T {
  const id = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return selector ? selector(id) : id;
}
