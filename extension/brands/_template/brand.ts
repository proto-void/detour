import type { BrandConfig } from '../detour/brand';

/**
 * Partner flavors keep display name **Detour** (theme/tokens/icons carry partner identity).
 * Override name at build time with DETOUR_BRAND_NAME only when you truly need a different title.
 */
const brand: BrandConfig = {
  name: process.env.DETOUR_BRAND_NAME?.trim() || 'Detour',
  shortName: 'Detour',
  description: 'Point production at your code.',
  slug: 'example-partner',
  defaultTheme: 'light',
  // Optional: nativeHostName (default com.detour.db) so a partner helper can coexist with Detour.
  // Optional: set chromiumManifestKey (public base64 DER only) + chromiumExtensionIds for stable unpacked id / NM allowed_origins.
};

export default brand;
