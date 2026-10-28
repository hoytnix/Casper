'use client';

import React from 'react';
import { Check } from 'lucide-react';
import { THEME_LIST } from '@/lib/themes';
import { setTheme, useThemeStore } from '@/lib/theme-store';
import type { ThemeId, ThemeSpec } from '@/types/theme';

export interface ThemeSwitcherProps {
  variant?: 'compact' | 'gallery';
  selectedId?: ThemeId;
  onSelect?: (id: ThemeId) => void;
}

// Single theme row: 3-dot preview + name + mode badge. Memoized like
// InspectorFileRow so gallery re-renders skip unchanged rows.
const ThemeRow: React.FC<{
  spec: ThemeSpec;
  selected: boolean;
  onPick: (id: ThemeId) => void;
}> = React.memo(function ThemeRow({ spec, selected, onPick }) {
  return (
    <button
      type="button"
      onClick={() => onPick(spec.id)}
      aria-pressed={selected}
      title={`${spec.displayName} — ${spec.description}`}
      className={`flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl border text-left transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)] ${
        selected
          ? 'bg-[var(--theme-elevated)] border-[var(--theme-accent)]'
          : 'bg-[var(--theme-panel)] border-[var(--theme-border)] hover:border-[var(--theme-accent)]'
      }`}
    >
      <span className="flex items-center -space-x-1 flex-shrink-0" aria-hidden="true">
        <span
          className="w-4 h-4 rounded-full border border-black/20"
          style={{ background: spec.tokens.bg }}
        />
        <span
          className="w-4 h-4 rounded-full border border-black/20"
          style={{ background: spec.tokens.surface }}
        />
        <span
          className="w-4 h-4 rounded-full border border-black/20"
          style={{ background: spec.tokens.accent }}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold text-[var(--theme-text)] truncate">
          {spec.displayName}
        </span>
        <span className="block text-[10px] font-mono text-[var(--theme-muted)]">
          {spec.mode === 'light' ? 'light' : 'dark'}
        </span>
      </span>
      {selected && (
        <Check className="w-4 h-4 flex-shrink-0 text-[var(--theme-accent2)]" aria-hidden="true" />
      )}
    </button>
  );
});

export const ThemeSwitcher: React.FC<ThemeSwitcherProps> = ({
  variant = 'gallery',
  selectedId,
  onSelect,
}) => {
  const storedId = useThemeStore();
  const activeId = selectedId ?? storedId;
  const handlePick = React.useCallback(
    (id: ThemeId) => {
      if (onSelect) onSelect(id);
      else setTheme(id);
    },
    [onSelect]
  );

  if (variant === 'compact') {
    return (
      <select
        value={activeId}
        onChange={(e) => handlePick(e.target.value as ThemeId)}
        aria-label="Color theme"
        title="Color theme"
        className="bg-[var(--theme-panel)] border border-[var(--theme-border)] text-[var(--theme-text)] text-xs font-mono rounded-lg px-2 py-1.5 outline-none focus:border-[var(--theme-accent)] transition cursor-pointer max-w-[132px]"
      >
        {THEME_LIST.map((spec) => (
          <option key={spec.id} value={spec.id}>
            {spec.displayName}
          </option>
        ))}
      </select>
    );
  }

  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5"
      role="group"
      aria-label="Color theme gallery"
    >
      {THEME_LIST.map((spec) => (
        <ThemeRow key={spec.id} spec={spec} selected={activeId === spec.id} onPick={handlePick} />
      ))}
    </div>
  );
};
