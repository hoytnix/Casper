import { z } from 'zod';
// Relative value import: the @/ alias does not resolve under plain
// node --test (repo convention: explicit .ts specifiers for runtime imports).
import { THEME_IDS } from '../types/theme.ts';
import type { ThemeId } from '@/types/theme';

// Storage-hardened theme validation. Pure validator, no browser APIs.
// Every localStorage read and every setter MUST go through parseThemeId;
// direct `as ThemeId` casts are forbidden. Never throws on corrupt input.

export const ThemeIdSchema = z.enum([
  'solarized-light',
  'solarized-dark',
  'monokai',
  'deepsea',
  'seahorse',
  'forest',
  'hacker',
  'microsoft',
  'apple',
]);

export type ThemeIdInput = z.infer<typeof ThemeIdSchema>;

export function parseThemeId(raw: unknown): ThemeIdInput | null {
  const r = ThemeIdSchema.safeParse(raw);
  return r.success ? r.data : null;
}

export function isThemeId(value: unknown): value is ThemeIdInput {
  return ThemeIdSchema.safeParse(value).success;
}

export const THEME_STORAGE_KEY = 'casper-theme-v1';
export const DEFAULT_THEME_ID: ThemeId = 'deepsea';

// Fail loudly if the Zod schema diverges from the canonical ID list:
// any new theme ID must land in ThemeId, THEME_IDS, and the schema.
const SCHEMA_IDS = ThemeIdSchema.options as readonly string[];
if (
  SCHEMA_IDS.length !== THEME_IDS.length ||
  !THEME_IDS.every((id) => SCHEMA_IDS.includes(id))
) {
  throw new Error('ThemeIdSchema diverged from THEME_IDS');
}
