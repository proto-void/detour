/** Keep in sync with `cli/src/paths.ts` and the content-type map in `cli/src/server.ts`. The extension cannot import the CLI package. */

export const DEFAULT_BRIDGE_PORT = 47321;
export const MAX_RELATIVE_PATH = 512;

/** Relative file path: no absolute form, no empty / `.` / `..` segments. */
export function isSafeRelative(rel: string): boolean {
  if (rel.length === 0 || rel.length > MAX_RELATIVE_PATH) return false;
  if (rel.includes('\0') || rel.includes('\\') || rel.includes('\r') || rel.includes('\n')) return false;
  if (rel.startsWith('/') || /^[a-zA-Z]:/.test(rel)) return false;
  const parts = rel.split('/');
  return parts.every((part) => part !== '' && part !== '.' && part !== '..');
}

/** One URL segment. The CLI's `decodeBridgePath` accepts this encoding. */
export function encodeBridgePath(rel: string): string {
  const bytes = new TextEncoder().encode(rel);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export interface BridgeEndpoint {
  port: number;
  token: string;
}

/**
 * Opaque loopback URL. The filename is not in the path, so a pattern like `*.js`
 * does not also match the bridge and loop.
 */
export function bridgeFileUrl(session: BridgeEndpoint, filePath: string): string | undefined {
  if (!Number.isInteger(session.port) || session.port < 1 || session.port > 65535) return undefined;
  if (!/^[0-9a-f]{64}$/.test(session.token)) return undefined;
  if (!isSafeRelative(filePath)) return undefined;
  return `http://127.0.0.1:${session.port}/d/${session.token}/${encodeBridgePath(filePath)}`;
}

export const BRIDGE_NOT_CONNECTED =
  'Connect Local Bridge on the rules page using the token from detour bridge <folder>. Until then this rule does nothing.';

export function bridgeDownMessage(port: number): string {
  return `Local Bridge is not responding on 127.0.0.1:${port}. Start it with detour bridge <folder> and connect the new token.`;
}

/** Shown when a stored path escapes the bridge folder. Does not echo the path. */
export const BRIDGE_PATH_REFUSED =
  'The file path has to stay inside the bridge folder, like assets/app.js. Absolute paths and .. are not allowed.';

/** Same map as `contentTypeFor` in the CLI. Used when the extension fulfills a response itself. */
const CONTENT_TYPES: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
};

export function contentTypeForRelative(rel: string): string {
  const dot = rel.lastIndexOf('.');
  const ext = dot >= 0 ? rel.slice(dot).toLowerCase() : '';
  return CONTENT_TYPES[ext] ?? 'application/octet-stream';
}

/** Refusal text must not carry the session token or the file URL. */
export function serveLocalCompileMessage(reason: string, message: string): string {
  if (reason === 'redirect-loop') {
    return 'This pattern also matches 127.0.0.1, so the browser would loop. Narrow it so it does not match the bridge.';
  }
  return message.replace(/http:\/\/127\.0\.0\.1:\d+\/d\/[0-9a-f]{64}\/[A-Za-z0-9_-]+/g, 'the Local Bridge');
}
