/**
 * Stable Chromium extension ids for native-messaging allowed_origins.
 * Derived from the public manifest key in extension/brands/<slug>/brand.ts (public key only).
 * Store listing ids are appended when published.
 */

/** Detour unpacked id (manifest key in brands/detour). */
export const DETOUR_UNPACKED_CHROMIUM_ID = 'hegphfgboahkhkpiglcccnkbdpddpemj';

/** Known Detour Chrome/Edge store ids (empty until published). */
export const DETOUR_STORE_CHROMIUM_IDS: readonly string[] = [];

/** Rogers unpacked id (manifest key in gitignored brands/rogers). */
export const ROGERS_UNPACKED_CHROMIUM_ID = 'mgemcepjhfdnnoocgejgfahmieololca';

export const ROGERS_STORE_CHROMIUM_IDS: readonly string[] = [];

export function defaultChromiumExtensionIds(brand: 'detour' | 'rogers' = 'detour'): string[] {
  if (brand === 'rogers') {
    return [ROGERS_UNPACKED_CHROMIUM_ID, ...ROGERS_STORE_CHROMIUM_IDS];
  }
  return [DETOUR_UNPACKED_CHROMIUM_ID, ...DETOUR_STORE_CHROMIUM_IDS];
}

/** 32-char Chrome extension id (a–p). */
export function isChromiumExtensionId(id: string): boolean {
  return /^[a-p]{32}$/.test(id);
}
