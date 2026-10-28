import { z } from 'zod';
import type { SuggestedDirective } from '@/types';

// Edge-safe Zod-first validation for Suggested Architectural Directives.
// This is the `hono/zod-validator` equivalent for this repo: validation
// before handler. Pure functions only — no fetch, no window, no MLC imports,
// no Node APIs.

export const suggestedDirectiveSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().trim().min(8).max(90),
  prompt: z.string().trim().min(20).max(500),
  rationale: z.string().trim().max(280).default(''),
  anchorPaths: z.array(z.string().min(1)).min(1).max(3),
  engine: z.string().min(1).max(64),
});

export const suggestedDirectiveListSchema = z.array(suggestedDirectiveSchema).min(1).max(4);

export function sanitizeDirectives(
  input: unknown,
  _fallbackPaths: string[]
): { directives: SuggestedDirective[]; isFallback: boolean } {
  void _fallbackPaths;
  const parsed = suggestedDirectiveListSchema.safeParse(input);
  if (parsed.success) {
    const seen = new Set<string>();
    const deduped = parsed.data.filter((d) => {
      const key = d.prompt.toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (deduped.length > 0) return { directives: deduped.slice(0, 4), isFallback: false };
  }
  return { directives: [], isFallback: true };
}

export function buildFallbackDirectives(
  repoLabel: string,
  relatedPaths: string[]
): SuggestedDirective[] {
  const anchors = relatedPaths.slice(0, 3);
  const safeAnchors = anchors.length > 0 ? anchors : ['app/page.tsx'];
  return [0, 1, 2, 3].map((i) => ({
    id: `fallback-${Date.now()}-${i}`,
    title: `Graph-grounded refactor ${i + 1} for ${repoLabel}`,
    prompt: `Refactor ${safeAnchors[i % safeAnchors.length]} to isolate types, validators, and handlers with strict TypeScript and @[/path/to/file.ext] anchors.`,
    rationale: 'Deterministic graph fallback when local AI unavailable.',
    anchorPaths: safeAnchors,
    engine: 'Fallback Keyword',
  }));
}
