/**
 * Stable Chromium extension ids for native-messaging allowed_origins.
 * Derived from the public manifest key in extension/brands/detour/brand.ts (public key only).
 * Store listing ids are appended when published.
 */

/** Detour unpacked id (manifest key in brands/detour). */
export const DETOUR_UNPACKED_CHROMIUM_ID = 'hegphfgboahkhkpiglcccnkbdpddpemj';

/** Known Detour Chrome/Edge store ids. */
export const DETOUR_STORE_CHROMIUM_IDS: readonly string[] = [
  'jfgbokgdgpjhkciooicmbdgablgkklmn',
];

export function defaultChromiumExtensionIds(_brand: 'detour' = 'detour'): string[] {
  return [DETOUR_UNPACKED_CHROMIUM_ID, ...DETOUR_STORE_CHROMIUM_IDS];
}

/** 32-char Chrome extension id (a–p). */
export function isChromiumExtensionId(id: string): boolean {
  return /^[a-p]{32}$/.test(id);
}
