/**
 * Build a DNR redirect target for overrideBody delivery: redirect (RO 2.0 parity).
 * Format: data:<mime>;charset=UTF-8;base64,<utf8-base64>
 */

/** Base64 of raw bytes. Chunked so a large body doesn't blow the argument stack. */
export function bytesBase64(bytes: Uint8Array): string {
  let binary = '';
  const size = 0x8000;
  for (let i = 0; i < bytes.length; i += size) {
    binary += String.fromCharCode(...bytes.subarray(i, i + size));
  }
  return btoa(binary);
}

/** UTF-8 then base64. */
export function utf8Base64(text: string): string {
  return bytesBase64(new TextEncoder().encode(text));
}

const EXT_MIME: Record<string, string> = {
  json: 'application/json',
  js: 'text/javascript',
  mjs: 'text/javascript',
  css: 'text/css',
  html: 'text/html',
  htm: 'text/html',
  svg: 'image/svg+xml',
};

/** MIME from optional contentType, else the match pattern's file extension, else text/plain. */
export function inferBodyMime(pattern: string, contentType?: string): string {
  const explicit = contentType?.trim();
  if (explicit) return explicit;
  const path = pattern.split(/[?#]/)[0] ?? pattern;
  const ext = path.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  return (ext && EXT_MIME[ext]) || 'text/plain';
}

/** Full data: URL for a body override redirect. */
export function bodyDataUrl(body: string, pattern: string, contentType?: string): string {
  const mime = inferBodyMime(pattern, contentType);
  return `data:${mime};charset=UTF-8;base64,${utf8Base64(body)}`;
}

/**
 * Short label for a data: URL in logs and the tester.
 * `data:application/json;charset=UTF-8;base64,…` → `data:application/json (12 bytes)`.
 */
export function summarizeDataUrl(url: string): string {
  if (!url.startsWith('data:')) return url;
  const comma = url.indexOf(',');
  const meta = comma >= 0 ? url.slice(5, comma) : url.slice(5);
  const payload = comma >= 0 ? url.slice(comma + 1) : '';
  const mime = meta.split(';')[0] || 'text/plain';
  const isBase64 = /;base64/i.test(meta);
  let bytes = 0;
  if (isBase64 && payload) {
    const padded = payload.replace(/\s/g, '');
    bytes = Math.floor((padded.length * 3) / 4) - (padded.endsWith('==') ? 2 : padded.endsWith('=') ? 1 : 0);
  } else {
    try {
      bytes = new TextEncoder().encode(decodeURIComponent(payload)).length;
    } catch {
      bytes = payload.length;
    }
  }
  return `data:${mime} (${bytes} byte${bytes === 1 ? '' : 's'})`;
}

/** True when `url` is a data: URL (body-redirect delivery target). */
export const isDataUrl = (url: string): boolean => url.startsWith('data:');
