import path from 'node:path';
import { realpathSync, statSync } from 'node:fs';

/** Keep in sync with `extension/src/local-bridge/paths.ts` (the extension cannot import this package). */
export const DEFAULT_PORT = 47321;
export const MAX_RELATIVE_PATH = 512;

/**
 * A path the user typed in a rule: relative, no empty / `.` / `..` segments, no absolute form.
 * This is the jail check. The server still `realpath`s before reading.
 */
export function isSafeRelative(rel: string): boolean {
  if (rel.length === 0 || rel.length > MAX_RELATIVE_PATH) return false;
  if (rel.includes('\0') || rel.includes('\\') || rel.includes('\r') || rel.includes('\n')) return false;
  if (path.isAbsolute(rel) || /^[a-zA-Z]:/.test(rel)) return false;
  const parts = rel.split('/');
  return parts.every((part) => part !== '' && part !== '.' && part !== '..');
}

/** Single URL segment. Matches the extension's `encodeBridgePath` for the vector in tests. */
export function decodeBridgePath(segment: string): string | undefined {
  if (segment.length === 0 || segment.length > 1024) return undefined;
  if (!/^[A-Za-z0-9_-]+$/.test(segment)) return undefined;
  const pad = segment.length % 4 === 0 ? '' : '='.repeat(4 - (segment.length % 4));
  let text: string;
  try {
    text = Buffer.from(segment.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64').toString('utf8');
  } catch {
    return undefined;
  }
  if (text.includes('\uFFFD')) return undefined;
  const again = Buffer.from(text, 'utf8').toString('base64url');
  if (again !== segment) return undefined;
  return isSafeRelative(text) ? text : undefined;
}

export interface PreparedRoot {
  /** Real path of the folder. Symlinks are resolved. */
  root: string;
  /** Basename only. Never a full path. */
  rootLabel: string;
}

/** Refuse the filesystem root so `detour bridge /` cannot serve the disk. */
export function prepareRoot(dir: string): PreparedRoot {
  let root: string;
  try {
    root = realpathSync(dir);
  } catch {
    throw new Error(`Folder not found: ${dir}`);
  }
  let info;
  try {
    info = statSync(root);
  } catch {
    throw new Error(`Folder not found: ${dir}`);
  }
  if (!info.isDirectory()) throw new Error(`Not a folder: ${dir}`);
  if (path.dirname(root) === root) throw new Error('Refusing to serve the filesystem root. Pass a project folder such as ./dist');
  const rootLabel = path.basename(root).replace(/[\r\n\0]/g, '').slice(0, 80) || 'folder';
  return { root, rootLabel };
}

/**
 * Resolved regular file inside `root`, or undefined.
 * `realpath` on the file rejects a symlink that leaves the folder.
 */
export function resolveInside(root: string, rel: string): string | undefined {
  if (!isSafeRelative(rel)) return undefined;
  const abs = path.resolve(root, rel);
  let realFile: string;
  let realRoot: string;
  try {
    realRoot = realpathSync(root);
    realFile = realpathSync(abs);
  } catch {
    return undefined;
  }
  const fromRoot = path.relative(realRoot, realFile);
  if (fromRoot === '' || fromRoot.startsWith(`..${path.sep}`) || fromRoot === '..' || path.isAbsolute(fromRoot)) return undefined;
  try {
    if (!statSync(realFile).isFile()) return undefined;
  } catch {
    return undefined;
  }
  return realFile;
}
