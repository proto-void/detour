/** Keep in sync with `cli/src/paths.ts`. The extension cannot import the CLI package. */

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

/** Refusal text must not carry the session token or the file URL. */
export function serveLocalCompileMessage(reason: string, message: string): string {
  if (reason === 'redirect-loop') {
    return 'This pattern also matches 127.0.0.1, so the browser would loop. Narrow it so it does not match the bridge.';
  }
  return message.replace(/http:\/\/127\.0\.0\.1:\d+\/d\/[0-9a-f]{64}\/[A-Za-z0-9_-]+/g, 'the Local Bridge');
}
