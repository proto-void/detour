import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { applyTheme, loadTheme, parseTheme, saveTheme, THEME_KEY } from './theme';

const area = fakeBrowser.storage.local;

function page() {
  const meta = { content: 'dark', setAttribute: (_name: string, value: string) => (meta.content = value) };
  return { documentElement: { dataset: {} as { theme?: string } }, querySelector: () => meta, meta };
}

describe('theme preference', () => {
  beforeEach(() => fakeBrowser.reset());

  it('treats a missing or unknown value as the brand default (Detour: dark)', () => {
    expect(parseTheme(undefined)).toBe('dark');
    expect(parseTheme('sepia')).toBe('dark');
    expect(parseTheme('light')).toBe('light');
    expect(parseTheme(undefined, 'light')).toBe('light');
  });

  it('loads the brand default when nothing is stored', async () => {
    expect(await loadTheme(area)).toBe('dark');
  });

  it('round-trips a light preference', async () => {
    await saveTheme(area, 'light');
    expect(await area.get(THEME_KEY)).toEqual({ [THEME_KEY]: 'light' });
    expect(await loadTheme(area)).toBe('light');
  });

  it('applies light tokens without dropping the stored dark default', () => {
    const root = page();
    applyTheme('light', root);
    expect(root.documentElement.dataset.theme).toBe('light');
    expect(root.meta.content).toBe('light');
    applyTheme('dark', root);
    expect(root.documentElement.dataset.theme).toBe('dark');
    expect(root.meta.content).toBe('dark');
  });
});
