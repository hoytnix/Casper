/**
 * Search Grounding settings helpers (pure — no value imports by design,
 * type-only `@/` imports are erased before runtime, mirroring muse-stream).
 */
import type { SearchContextSize } from '@/types';

export const SEARCH_CONTEXT_SIZES: readonly SearchContextSize[] = ['low', 'medium', 'high'];

export function isSearchContextSize(value: unknown): value is SearchContextSize {
  return value === 'low' || value === 'medium' || value === 'high';
}

/** Coerces unknown input (stored settings, request bodies) to a valid size. */
export function normalizeSearchContextSize(
  value: unknown,
  fallback: SearchContextSize = 'medium'
): SearchContextSize {
  return isSearchContextSize(value) ? value : fallback;
}
