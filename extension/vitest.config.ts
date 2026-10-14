import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

const root = path.dirname(fileURLToPath(import.meta.url));
const detourBrand = path.join(root, 'brands/detour');

export default defineConfig({
  plugins: [WxtVitest()],
  resolve: {
    alias: {
      '@brand': detourBrand,
      'virtual:brand-tokens': path.join(detourBrand, 'tokens.css'),
    },
  },
  define: {
    'import.meta.env.BRAND': JSON.stringify({
      name: 'Detour',
      shortName: 'Detour',
      slug: 'detour',
      defaultTheme: 'dark',
    }),
    'import.meta.env.PARTNER_LOGO_URL': JSON.stringify(''),
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
