import { describe, expect, it } from 'vitest';
import { brand, brandDefaultTheme, brandName, brandSlug, nativeHostName } from './brand-config';
import { parseTheme } from './theme';

describe('runtime brand', () => {
  it('exposes the Detour brand in the default unit-test build', () => {
    expect(brandName).toBe('Detour');
    expect(brandSlug).toBe('detour');
    expect(brandDefaultTheme).toBe('dark');
    expect(brand.shortName).toBe('Detour');
    expect(nativeHostName).toBe('com.detour.db');
  });

  it('uses the brand defaultTheme when no preference is stored', () => {
    expect(parseTheme(undefined)).toBe(brandDefaultTheme);
  });
});
