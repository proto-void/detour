/**
 * Stable per-user install location for the Databases SEA helper (ADR-029).
 */
import { homedir, platform } from 'node:os';
import { join } from 'node:path';

export type HelperOs = NodeJS.Platform;

/** Windows %LOCALAPPDATA% (or fallback under homedir). */
function localAppData(): string {
  return process.env.LOCALAPPDATA?.trim() || join(homedir(), 'AppData', 'Local');
}

export function helperInstallDir(os: HelperOs = platform()): string {
  if (os === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'Detour', 'db-host');
  }
  if (os === 'win32') {
    return join(localAppData(), 'Detour', 'db-host');
  }
  const xdg = process.env.XDG_DATA_HOME?.trim();
  return join(xdg || join(homedir(), '.local', 'share'), 'detour', 'db-host');
}

export function helperBinaryName(os: HelperOs = platform()): string {
  return os === 'win32' ? 'detour-db-host.exe' : 'detour-db-host';
}

export function helperBinaryPath(os: HelperOs = platform()): string {
  return join(helperInstallDir(os), helperBinaryName(os));
}
