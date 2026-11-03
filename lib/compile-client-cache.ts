import type { ModelCostDetails, SourceFile, ExplorationStep } from '@/types';

export interface CachedCompilationPayload {
  events: Array<Record<string, unknown>>;
  finalPrompt: string;
  cleanPrompt: string;
  refactors: string[];
  exploredFiles: SourceFile[];
  explorationTrail: ExplorationStep[];
  modelUsed: string;
  detectedFramework: string | null;
  serverThinkingLevel: string;
  calculatedCost: ModelCostDetails;
  timestamp: number;
}

const STORAGE_CACHE_KEY_PREFIX = 'casper_compile_cache:';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_CACHED_ENTRIES = 50;

// In-flight compile promise deduplication map
const inFlightPromises = new Map<string, Promise<void>>();

export function buildClientCacheKey(params: {
  owner: string;
  repo: string;
  branch: string;
  commitSha?: string;
  mode: string;
  prompt: string;
}): string {
  const owner = params.owner.toLowerCase().trim();
  const repo = params.repo.toLowerCase().trim();
  const branch = params.branch.trim();
  const sha = (params.commitSha || 'head').trim();
  const mode = params.mode.trim();
  const prompt = params.prompt.trim();
  return `${STORAGE_CACHE_KEY_PREFIX}${owner}/${repo}:${branch}:${sha}:${mode}:${prompt}`;
}

export function getCachedCompilation(cacheKey: string): CachedCompilationPayload | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(cacheKey);
    if (!raw) return null;
    const entry: CachedCompilationPayload = JSON.parse(raw);
    if (!entry || !entry.timestamp) return null;
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
      localStorage.removeItem(cacheKey);
      return null;
    }
    return entry;
  } catch (err) {
    console.warn('[Casper Cache] Read error:', err);
    return null;
  }
}

export function setCachedCompilation(cacheKey: string, payload: Omit<CachedCompilationPayload, 'timestamp'>): void {
  if (typeof window === 'undefined') return;
  try {
    const entry: CachedCompilationPayload = {
      ...payload,
      timestamp: Date.now(),
    };
    localStorage.setItem(cacheKey, JSON.stringify(entry));
    pruneOldCacheEntries();
  } catch (err) {
    console.warn('[Casper Cache] Write error (possibly quota):', err);
  }
}

function pruneOldCacheEntries(): void {
  if (typeof window === 'undefined') return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(STORAGE_CACHE_KEY_PREFIX)) {
        keys.push(k);
      }
    }
    if (keys.length > MAX_CACHED_ENTRIES) {
      // Sort oldest first and delete excess
      const entries: Array<{ key: string; timestamp: number }> = [];
      for (const k of keys) {
        try {
          const item = localStorage.getItem(k);
          if (item) {
            const parsed = JSON.parse(item);
            entries.push({ key: k, timestamp: parsed.timestamp || 0 });
          }
        } catch {
          localStorage.removeItem(k);
        }
      }
      entries.sort((a, b) => a.timestamp - b.timestamp);
      const toRemove = entries.slice(0, entries.length - MAX_CACHED_ENTRIES);
      for (const item of toRemove) {
        localStorage.removeItem(item.key);
      }
    }
  } catch {
    // ignore
  }
}

export function getInFlightCompilePromise(dedupeKey: string): Promise<void> | undefined {
  return inFlightPromises.get(dedupeKey);
}

export function registerInFlightCompilePromise(dedupeKey: string, promise: Promise<void>): void {
  inFlightPromises.set(dedupeKey, promise);
  promise.finally(() => {
    if (inFlightPromises.get(dedupeKey) === promise) {
      inFlightPromises.delete(dedupeKey);
    }
  });
}
