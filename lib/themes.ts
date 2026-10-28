import type { ThemeId, ThemeSpec, ThemeTokens } from '@/types/theme';
import { THEME_IDS } from '../types/theme.ts';

// Theme registry: pure data + pure helpers. No window, no hooks.
// Side-effect free for RSC import.

function tokens(
  bg: string,
  surface: string,
  panel: string,
  elevated: string,
  text: string,
  muted: string,
  accent: string,
  accent2: string,
  border: string,
  codeBg: string,
  success: string,
  warning: string,
  danger: string
): ThemeTokens {
  return { bg, surface, panel, elevated, text, muted, accent, accent2, border, codeBg, success, warning, danger };
}

export const THEMES: Record<ThemeId, ThemeSpec> = {
  deepsea: {
    id: 'deepsea',
    displayName: 'Deepsea',
    mode: 'dark',
    description: 'Current default dark style. Indigo depths with cyan highlights.',
    tokens: tokens(
      '#07090e', '#0b0f17', '#0f1522', '#141c2e', '#e2e8f0', '#94a3b8',
      '#6366f1', '#22d3ee', 'rgba(255,255,255,0.08)', '#0b0f17',
      '#34d399', '#fbbf24', '#f87171'
    ),
  },
  'solarized-dark': {
    id: 'solarized-dark',
    displayName: 'Solarized Dark',
    mode: 'dark',
    description: 'Ethan Schoonover teal-tinted dark. Easy on the eyes.',
    tokens: tokens(
      '#002b36', '#073642', '#0a3a46', '#0e4652', '#eee8d5', '#93a1a1',
      '#268bd2', '#2aa198', 'rgba(238,232,213,0.12)', '#073642',
      '#859900', '#b58900', '#dc322f'
    ),
  },
  'solarized-light': {
    id: 'solarized-light',
    displayName: 'Solarized Light',
    mode: 'light',
    description: 'Cream paper light theme with slate text.',
    tokens: tokens(
      '#fdf6e3', '#eee8d5', '#ffffff', '#f7efda', '#657b83', '#93a1a1',
      '#268bd2', '#2aa198', 'rgba(101,123,131,0.18)', '#eee8d5',
      '#728c00', '#b58900', '#dc322f'
    ),
  },
  monokai: {
    id: 'monokai',
    displayName: 'Monokai',
    mode: 'dark',
    description: 'Pink and green neon on warm charcoal.',
    tokens: tokens(
      '#272822', '#1e1f1c', '#2e2f28', '#383a30', '#f8f8f2', '#a59f85',
      '#f92672', '#a6e22e', 'rgba(248,248,242,0.10)', '#1e1f1c',
      '#a6e22e', '#e6db74', '#f92672'
    ),
  },
  seahorse: {
    id: 'seahorse',
    displayName: 'Seahorse',
    mode: 'dark',
    description: 'Deep teal waters with amber accents.',
    tokens: tokens(
      '#062a2e', '#0a3a3f', '#0e4a51', '#125862', '#e0f7f5', '#8ec8c0',
      '#2dd4bf', '#f59e0b', 'rgba(224,247,245,0.10)', '#0a3a3f',
      '#34d399', '#fbbf24', '#fb7185'
    ),
  },
  forest: {
    id: 'forest',
    displayName: 'Forest',
    mode: 'dark',
    description: 'Mossy greens on near-black canopy.',
    tokens: tokens(
      '#0a1a0f', '#0f2416', '#14301d', '#1a3d25', '#e8f5e9', '#a5c4a8',
      '#4caf50', '#8bc34a', 'rgba(232,245,233,0.10)', '#0f2416',
      '#4caf50', '#ffb300', '#e57373'
    ),
  },
  hacker: {
    id: 'hacker',
    displayName: 'Hacker',
    mode: 'dark',
    description: 'Pure black with neon green phosphor text.',
    tokens: tokens(
      '#000000', '#0a0a0a', '#0f0f0f', '#161616', '#00ff00', '#00aa00',
      '#00ff00', '#33ff33', 'rgba(0,255,0,0.18)', '#050505',
      '#00ff00', '#ffff00', '#ff3333'
    ),
  },
  microsoft: {
    id: 'microsoft',
    displayName: 'Microsoft',
    mode: 'light',
    description: 'Fluent-inspired light gray with blue accents.',
    tokens: tokens(
      '#f3f3f3', '#ffffff', '#ffffff', '#ececec', '#1b1a19', '#605e5c',
      '#0078d4', '#00b7c3', 'rgba(27,26,25,0.12)', '#f3f3f3',
      '#107c10', '#b45309', '#d13438'
    ),
  },
  apple: {
    id: 'apple',
    displayName: 'Apple',
    mode: 'light',
    description: 'Clean Cupertino whites with blue and purple.',
    tokens: tokens(
      '#f5f5f7', '#ffffff', '#ffffff', '#ececf0', '#1d1d1f', '#6e6e73',
      '#0071e3', '#a259ff', 'rgba(29,29,31,0.10)', '#f5f5f7',
      '#15803d', '#b45309', '#d70015'
    ),
  },
};

// Fail loudly on registry drift: keys must exactly cover THEME_IDS.
const REGISTRY_IDS = Object.keys(THEMES);
if (
  REGISTRY_IDS.length !== THEME_IDS.length ||
  !THEME_IDS.every((id) => REGISTRY_IDS.includes(id))
) {
  throw new Error('THEMES registry diverged from THEME_IDS');
}

// UI order: Deepsea (current default style) first, then the rest.
export const THEME_LIST: ThemeSpec[] = [
  THEMES.deepsea,
  THEMES['solarized-dark'],
  THEMES['solarized-light'],
  THEMES.monokai,
  THEMES.seahorse,
  THEMES.forest,
  THEMES.hacker,
  THEMES.microsoft,
  THEMES.apple,
];

export function getTheme(id: ThemeId): ThemeSpec {
  return THEMES[id];
}

export function isLightTheme(id: ThemeId): boolean {
  return THEMES[id].mode === 'light';
}
