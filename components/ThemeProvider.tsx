'use client';

import React from 'react';
import { setTheme, useThemeStore } from '@/lib/theme-store';
// Note: setTheme no-ops when the ID is unchanged, so hydration
// correction below needs no equality check of its own.
import { THEME_STORAGE_KEY, parseThemeId } from '@/lib/theme-schema';
import { isLightTheme } from '@/lib/themes';
import type { ThemeId } from '@/types/theme';

// Client-only leaf provider: owns the html[data-theme] contract.
// Layout stays a Server Component and only mounts this around children.
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const themeId: ThemeId = useThemeStore();

  // Apply the DOM contract on every theme change.
  React.useEffect(() => {
    document.documentElement.dataset.theme = themeId;
    document.documentElement.style.colorScheme = isLightTheme(themeId) ? 'light' : 'dark';
  }, [themeId]);

  // Initial hydration correction + cross-tab sync, both Zod-guarded.
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(THEME_STORAGE_KEY);
      if (raw) {
        const parsed = parseThemeId(JSON.parse(raw));
        if (parsed) setTheme(parsed);
      }
    } catch {
      // Corrupt storage falls back to Deepsea; never throws.
    }
    const onStorage = (e: StorageEvent) => {
      if (e.key !== THEME_STORAGE_KEY) return;
      try {
        const parsed = e.newValue ? parseThemeId(JSON.parse(e.newValue)) : null;
        if (parsed) setTheme(parsed);
      } catch {
        // Ignore corrupt cross-tab payloads.
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return <>{children}</>;
}
