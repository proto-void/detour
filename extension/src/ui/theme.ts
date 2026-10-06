import type { StorageAreaLike } from '../rule-model/storage';

export const THEME_KEY = 'theme';
export type Theme = 'dark' | 'light';

/** Anything other than an explicit light choice stays on the dark default. */
export function parseTheme(value: unknown): Theme {
  return value === 'light' ? 'light' : 'dark';
}

export async function loadTheme(area: StorageAreaLike): Promise<Theme> {
  return parseTheme((await area.get(THEME_KEY))[THEME_KEY]);
}

export async function saveTheme(area: StorageAreaLike, theme: Theme): Promise<void> {
  await area.set({ [THEME_KEY]: theme });
}

export interface ThemeRoot {
  documentElement: { dataset: { theme?: string } };
  querySelector(selector: string): { setAttribute(name: string, value: string): void } | null;
}

/** Points the shared CSS variables at one palette. Call before painting a page. */
export function applyTheme(theme: Theme, root: ThemeRoot = document): void {
  root.documentElement.dataset.theme = theme;
  root.querySelector('meta[name="color-scheme"]')?.setAttribute('content', theme);
}
