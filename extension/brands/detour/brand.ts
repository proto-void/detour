export interface BrandConfig {
  name: string;
  shortName: string;
  description: string;
  /** Zip / output slug (kebab-case). */
  slug: string;
  defaultTheme: 'dark' | 'light';
  /**
   * Chrome MV3 public key (base64 DER SubjectPublicKeyInfo).
   * Stabilizes the unpacked extension id. Public only — never commit the private .pem.
   */
  chromiumManifestKey?: string;
  /**
   * Chromium extension ids for native-messaging allowed_origins
   * (stable unpacked id from the key, plus known store ids when published).
   */
  chromiumExtensionIds?: string[];
  /**
   * Native-messaging application name (`connectNative`).
   * Default Detour host is `com.detour.db`. Partners may set a distinct name
   * so helpers can install side by side (ADR-030).
   */
  nativeHostName?: string;
}

export const DEFAULT_NATIVE_HOST_NAME = 'com.detour.db';

const brand: BrandConfig = {
  name: 'Detour',
  shortName: 'Detour',
  description: 'Point production at your code.',
  slug: 'detour',
  defaultTheme: 'dark',
  nativeHostName: DEFAULT_NATIVE_HOST_NAME,
  // Public key only (ADR-029). Unpacked id: hegphfgboahkhkpiglcccnkbdpddpemj
  chromiumManifestKey:
    'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAzVeG7r63pOvRcZZYFuV5y9yyHMiP0SfsDEHfeJd1l4GifOE0BA4GrwA3zIG4mXG6Vo2q+5eSZjt92j1t8FtJ00qcIgE4TaGV+g/aGOKL/ZbVOU5FANySELgbeWul048OyBZJK7ApRZ1dDHEKstAaSkjDSDAKfEVxrr5lkPPfuv24YHNZ/vm2WquyX6FbFskHEKijL22MYEy7uNFK9zjgJag9K3NnKntrR54jzHVCqxKiMIY4eomxnhvx+6d6JeRwuux6BJgoe4xk6JJWGzbnyi9WKL3HkEwgMA5XmT4UYCNsnZ6N/IWq2Se7X914Ub4Q/kVRYm26YE9F8kCbiBYH8QIDAQAB',
  chromiumExtensionIds: [
    'hegphfgboahkhkpiglcccnkbdpddpemj',
    'jfgbokgdgpjhkciooicmbdgablgkklmn',
  ],
};

export default brand;
