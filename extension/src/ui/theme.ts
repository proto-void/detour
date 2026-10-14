import type { StorageAreaLike } from '../rule-model/storage';
import { brandDefaultTheme } from './brand-config';

export const THEME_KEY = 'theme';
export type Theme = 'dark' | 'light';

/** Missing preference uses the active brand's defaultTheme. */
export function parseTheme(value: unknown, fallback: Theme = brandDefaultTheme): Theme {
  if (value === 'light' || value === 'dark') return value;
  return fallback;
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
