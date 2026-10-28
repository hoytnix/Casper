import test from 'node:test';
import assert from 'node:assert/strict';
import { THEME_IDS } from '../types/theme.ts';
import { ThemeIdSchema, isThemeId, parseThemeId, THEME_STORAGE_KEY, DEFAULT_THEME_ID } from './theme-schema.ts';
import { THEMES, THEME_LIST, getTheme, isLightTheme } from './themes.ts';

test('registry covers all 9 IDs exactly once, Deepsea first in UI order', () => {
  assert.equal(THEME_IDS.length, 9);
  assert.equal(new Set(THEME_IDS).size, 9);
  assert.equal(THEME_LIST.length, 9);
  assert.equal(THEME_LIST[0].id, 'deepsea');
  assert.deepEqual(
    THEME_LIST.map((t) => t.id).sort(),
    [...THEME_IDS].sort()
  );
});

test('every spec carries all 13 tokens and a valid mode', () => {
  for (const id of THEME_IDS) {
    const spec = getTheme(id);
    assert.equal(spec.id, id);
    assert.ok(spec.mode === 'light' || spec.mode === 'dark');
    for (const key of ['bg', 'surface', 'panel', 'elevated', 'text', 'muted', 'accent', 'accent2', 'border', 'codeBg', 'success', 'warning', 'danger'] as const) {
      assert.match(spec.tokens[key], /^(#|rgba?\()/, `${id}.${key}`);
    }
  }
});

test('light/dark partition matches the plan', () => {
  assert.deepEqual(
    THEME_IDS.filter(isLightTheme).sort(),
    ['apple', 'microsoft', 'solarized-light']
  );
});

test('parseThemeId accepts all 9 IDs and rejects corrupt storage', () => {
  for (const id of THEME_IDS) {
    assert.equal(parseThemeId(id), id);
    assert.equal(parseThemeId(JSON.stringify(id)), null);
  }
  assert.equal(parseThemeId('"bogus"'), null);
  assert.equal(parseThemeId('deepsea '), null);
  assert.equal(parseThemeId(undefined), null);
  assert.equal(parseThemeId(null), null);
  assert.equal(parseThemeId(42), null);
  assert.equal(isThemeId('monokai'), true);
  assert.equal(isThemeId('bogus'), false);
});

test('schema options match THEME_IDS and defaults hold', () => {
  assert.deepEqual([...ThemeIdSchema.options].sort(), [...THEME_IDS].sort());
  assert.equal(DEFAULT_THEME_ID, 'deepsea');
  assert.equal(THEME_STORAGE_KEY, 'casper-theme-v1');
});
