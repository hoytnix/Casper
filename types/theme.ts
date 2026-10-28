// Canonical theme contracts. Pure types, importable by Server and
// Client Components. No 'use client', no runtime code.

export type ThemeId =
  | 'solarized-light'
  | 'solarized-dark'
  | 'monokai'
  | 'deepsea'
  | 'seahorse'
  | 'forest'
  | 'hacker'
  | 'microsoft'
  | 'apple';

export type ThemeMode = 'light' | 'dark';

export interface ThemeTokens {
  bg: string;
  surface: string;
  panel: string;
  elevated: string;
  text: string;
  muted: string;
  accent: string;
  accent2: string;
  border: string;
  codeBg: string;
  success: string;
  warning: string;
  danger: string;
}

export interface ThemeSpec {
  id: ThemeId;
  displayName: string;
  mode: ThemeMode;
  description: string;
  tokens: ThemeTokens;
}

export const THEME_IDS: readonly ThemeId[] = [
  'solarized-light',
  'solarized-dark',
  'monokai',
  'deepsea',
  'seahorse',
  'forest',
  'hacker',
  'microsoft',
  'apple',
];
