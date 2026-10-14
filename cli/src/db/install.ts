import { execFileSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  writeFileSync,
  unlinkSync,
  existsSync,
  readFileSync,
  realpathSync,
  chmodSync,
  rmSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir, platform } from 'node:os';
import { defaultChromiumExtensionIds, isChromiumExtensionId } from './extension-ids.ts';
import { helperBinaryName, helperInstallDir } from './helper-paths.ts';
import {
  COMPILED_NSOPEN_SCRIPT,
  DARWIN_NSOPEN_OBJC_SOURCE,
  DARWIN_NSOPEN_SCRIPT_SOURCE,
  pickfileBinaryName,
} from './pick-file.ts';
import { HOST_NAME, HOST_VERSION } from './protocol.ts';

export type OsPlatform = NodeJS.Platform;

const REPLACE_ATTEMPTS = 6;

/** True when fs copy/rename failed because the destination binary is still running. */
export function isBusyFsError(err: unknown): boolean {
  const code =
    err && typeof err === 'object' && 'code' in err ? String((err as NodeJS.ErrnoException).code) : '';
  if (code === 'EPERM' || code === 'EBUSY' || code === 'EACCES' || code === 'ETXTBSY') return true;
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes('access is denied') ||
    msg.includes('sharing violation') ||
    msg.includes('being used by another process') ||
    msg.includes('text file busy') ||
    msg.includes('resource busy')
  );
}

function sleepMs(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** Best-effort stop of Chrome-held helper binaries before Windows replace. */
export function stopHelperProcesses(os: OsPlatform = platform()): void {
  if (os === 'win32') {
    for (const image of ['detour-db-host.exe', 'detour-pickfile.exe']) {
      try {
        execFileSync('taskkill', ['/IM', image, '/T'], { stdio: 'ignore' });
      } catch {
        /* not running */
      }
      try {
        execFileSync('taskkill', ['/IM', image, '/F', '/T'], { stdio: 'ignore' });
      } catch {
        /* not running */
      }
    }
    sleepMs(200);
    return;
  }
  for (const name of ['detour-db-host', 'detour-pickfile']) {
    try {
      execFileSync('pkill', ['-x', name], { stdio: 'ignore' });
    } catch {
      /* not running */
    }
  }
  sleepMs(150);
  for (const name of ['detour-db-host', 'detour-pickfile']) {
    try {
      execFileSync('pkill', ['-9', '-x', name], { stdio: 'ignore' });
    } catch {
      /* not running */
    }
  }
}

/**
 * Copy a helper binary over an existing install path, stopping locked processes
 * and retrying on Access denied / EBUSY (Windows Chrome native host).
 */
export function copyReplaceBinary(src: string, dst: string, os: OsPlatform = platform()): void {
  stopHelperProcesses(os);
  let last: unknown;
  for (let i = 0; i < REPLACE_ATTEMPTS; i++) {
    if (i > 0) {
      stopHelperProcesses(os);
      sleepMs(Math.min(200 * 2 ** (i - 1), 1600));
    }
    try {
      cpSync(src, dst);
      return;
    } catch (e) {
      last = e;
      if (!isBusyFsError(e)) throw e;
    }
  }
  throw new Error(
    `Cannot replace ${dst}: file is locked (${last instanceof Error ? last.message : String(last)}). ` +
      'Stop the helper in Detour → Databases (or close Chrome so the native host exits), then retry.',
  );
}

/**
 * Well-known Node locations to prefer when they resolve to the same binary as
 * `process.execPath`. Probes only — never the sole install strategy. Primary
 * durable approach is embedding the absolute execPath of the Node that ran
 * `db install` (works when GUI browsers spawn the host with a minimal PATH).
 */
export function nodeSymlinkProbes(os: OsPlatform = platform()): string[] {
  if (os === 'darwin') {
    return [
      '/opt/homebrew/opt/node@24/bin/node',
      '/opt/homebrew/opt/node/bin/node',
      '/usr/local/opt/node@24/bin/node',
      '/usr/local/opt/node/bin/node',
      '/opt/homebrew/bin/node',
      '/usr/local/bin/node',
    ];
  }
  if (os === 'linux') {
    return ['/usr/bin/node', '/usr/local/bin/node'];
  }
  if (os === 'win32') {
    const pf = process.env['ProgramFiles'] ?? 'C:\\Program Files';
    const pf86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)';
    return [join(pf, 'nodejs', 'node.exe'), join(pf86, 'nodejs', 'node.exe')];
  }
  return [];
}

/**
 * Absolute Node binary for the native-host launcher.
 * 1. Prefer a probe path that realpath-equals `execPath` (stable symlinks over
 *    versioned Cellar / nvm dirs).
 * 2. Otherwise return `execPath` as-is (the Node that ran install).
 */
export function resolveNodePath(
  execPath: string = process.execPath,
  os: OsPlatform = platform(),
): string {
  let resolvedExec: string;
  try {
    resolvedExec = realpathSync(execPath);
  } catch {
    return execPath;
  }
  for (const candidate of nodeSymlinkProbes(os)) {
    try {
      if (existsSync(candidate) && realpathSync(candidate) === resolvedExec) return candidate;
    } catch {
      /* skip */
    }
  }
  return execPath;
}

/** @deprecated Prefer {@link resolveNodePath}. */
export const stableNodePath = resolveNodePath;

/** Manifest `path` / on-disk launcher basename for this OS. */
export function hostLauncherFileName(os: OsPlatform = platform()): string {
  return os === 'win32' ? 'detour-db-host.cmd' : 'detour-db-host';
}

export type InstallOptions = {
  /**
   * Chrome / Chromium extension id(s) (32 lowercase a–p letters).
   * When omitted, uses the brand’s stable unpacked id (+ known store ids).
   */
  extensionId?: string;
  /** Extra / full list of Chromium ids (merged with extensionId and defaults). */
  extensionIds?: string[];
  /** Brand defaults for allowed_origins when no ids passed. */
  brand?: 'detour' | 'rogers';
  /** Absolute path to the host launcher script or SEA binary. */
  hostPath: string;
  /** Also register Firefox with gecko id. */
  firefox?: boolean;
  /** Override platform (tests). */
  os?: OsPlatform;
  /** Skip writing files (CI smoke). */
  dryRun?: boolean;
};

/** Resolve Chromium ids for native-messaging allowed_origins (brand defaults + optional extras). */
export function resolveChromiumExtensionIds(options: {
  extensionId?: string;
  extensionIds?: string[];
  brand?: 'detour' | 'rogers';
}): string[] {
  const out: string[] = [];
  const push = (id: string | undefined) => {
    const t = id?.trim();
    if (!t || !isChromiumExtensionId(t) || out.includes(t)) return;
    out.push(t);
  };
  for (const id of defaultChromiumExtensionIds(options.brand ?? 'detour')) push(id);
  for (const id of options.extensionIds ?? []) push(id);
  push(options.extensionId);
  return out;
}

const FIREFOX_GECKO_ID = 'detour@protovoid.com';

/** Windows %LOCALAPPDATA% (or fallback under homedir). Relocated AppData must use the env var. */
export function windowsLocalAppData(): string {
  return process.env.LOCALAPPDATA?.trim() || join(homedir(), 'AppData', 'Local');
}

/** Windows %APPDATA% (Roaming). */
export function windowsRoamingAppData(): string {
  return process.env.APPDATA?.trim() || join(homedir(), 'AppData', 'Roaming');
}

/** Linux XDG config root (Chromium native-messaging dirs). */
export function linuxConfigHome(): string {
  const xdg = process.env.XDG_CONFIG_HOME?.trim();
  return xdg || join(homedir(), '.config');
}

/**
 * Directories where Chromium-family browsers look for native-messaging JSON
 * (darwin/linux). On Windows Chromium uses HKCU registry → JSON under LOCALAPPDATA.
 */
export function chromeManifestDirs(os: OsPlatform = platform()): string[] {
  const home = homedir();
  if (os === 'darwin') {
    return [
      join(home, 'Library', 'Application Support', 'Google', 'Chrome', 'NativeMessagingHosts'),
      join(home, 'Library', 'Application Support', 'Google', 'Chrome Beta', 'NativeMessagingHosts'),
      join(home, 'Library', 'Application Support', 'Chromium', 'NativeMessagingHosts'),
      join(home, 'Library', 'Application Support', 'Microsoft Edge', 'NativeMessagingHosts'),
      join(home, 'Library', 'Application Support', 'BraveSoftware', 'Brave-Browser', 'NativeMessagingHosts'),
    ];
  }
  if (os === 'linux') {
    const cfg = linuxConfigHome();
    return [
      join(cfg, 'google-chrome', 'NativeMessagingHosts'),
      join(cfg, 'chromium', 'NativeMessagingHosts'),
      join(cfg, 'microsoft-edge', 'NativeMessagingHosts'),
      join(cfg, 'BraveSoftware', 'Brave-Browser', 'NativeMessagingHosts'),
    ];
  }
  if (os === 'win32') {
    // Registry default value points at this JSON; path must be absolute and exist.
    return [join(windowsLocalAppData(), 'Detour', 'NativeMessagingHosts')];
  }
  return [];
}

/** Firefox native-messaging manifest directory for this OS. */
export function firefoxManifestDir(os: OsPlatform = platform()): string {
  const home = homedir();
  if (os === 'darwin') {
    return join(home, 'Library', 'Application Support', 'Mozilla', 'NativeMessagingHosts');
  }
  if (os === 'linux') {
    return join(home, '.mozilla', 'native-messaging-hosts');
  }
  if (os === 'win32') {
    // Standard Firefox location; also registered under HKCU\Software\Mozilla\…
    return join(windowsRoamingAppData(), 'Mozilla', 'NativeMessagingHosts');
  }
  return join(home, '.mozilla', 'native-messaging-hosts');
}

export function chromeAllowedOrigins(extensionIds: string[]): string[] {
  return extensionIds.map((id) => `chrome-extension://${id}/`);
}

function chromeManifest(hostPath: string, extensionIds: string[]): string {
  return `${JSON.stringify(
    {
      name: HOST_NAME,
      description: `Detour database helper v${HOST_VERSION}`,
      path: hostPath,
      type: 'stdio',
      allowed_origins: chromeAllowedOrigins(extensionIds),
    },
    null,
    2,
  )}\n`;
}

function firefoxManifest(hostPath: string): string {
  return `${JSON.stringify(
    {
      name: HOST_NAME,
      description: `Detour database helper v${HOST_VERSION}`,
      path: hostPath,
      type: 'stdio',
      allowed_extensions: [FIREFOX_GECKO_ID],
    },
    null,
    2,
  )}\n`;
}

/** POSIX shell double-quote escape. */
export function shellQuote(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** cmd.exe SET "VAR=value" — escape embedded quotes; double `%` for literals. */
export function cmdSetQuote(value: string): string {
  return value.replace(/%/g, '%%').replace(/"/g, '""');
}

export type WriteLauncherOptions = {
  nodePath?: string;
  platform?: OsPlatform;
};

/**
 * Write the stdio host launcher browsers exec when Databases connects.
 * Embeds an absolute Node path so GUI Chrome/Edge/Firefox (minimal PATH) still find Node.
 * - darwin / linux: bash script (`detour-db-host`)
 * - win32: `.cmd` batch (`detour-db-host.cmd`) — Chrome requires .exe or .bat/.cmd, not a shebang
 */
export function writeHostLauncher(
  outPath: string,
  entryTs: string,
  nodePathOrOptions?: string | WriteLauncherOptions,
): void {
  const opts: WriteLauncherOptions =
    typeof nodePathOrOptions === 'string'
      ? { nodePath: nodePathOrOptions }
      : (nodePathOrOptions ?? {});
  const os = opts.platform ?? platform();
  const nodePath = opts.nodePath ?? resolveNodePath(process.execPath, os);

  mkdirSync(dirname(outPath), { recursive: true });

  if (os === 'win32') {
    const body = `@echo off
REM Detour DB native messaging host launcher (dev / npx install)
REM Absolute node path — GUI browsers inherit a minimal PATH without Node.
set "NODE=${cmdSetQuote(nodePath)}"
set "ENTRY=${cmdSetQuote(entryTs)}"
if not exist "%NODE%" (
  echo detour-db-host: node not found: %NODE% 1>&2
  exit /b 127
)
"%NODE%" --experimental-strip-types "%ENTRY%" db-host-stdio
`;
    writeFileSync(outPath, body, { encoding: 'utf8' });
    return;
  }

  const body = `#!/usr/bin/env bash
# Detour DB native messaging host launcher (dev / npx install)
# Absolute node path — GUI browsers inherit a minimal PATH without Node.
NODE=${shellQuote(nodePath)}
ENTRY=${shellQuote(entryTs)}
if [ ! -x "$NODE" ]; then
  echo "detour-db-host: node not executable: $NODE" >&2
  exit 127
fi
exec "$NODE" --experimental-strip-types "$ENTRY" db-host-stdio
`;
  writeFileSync(outPath, body, { mode: 0o755 });
}

/** Windows HKCU keys Chromium-family browsers read for native hosts. */
export function windowsChromiumNativeMessagingRegKeys(): string[] {
  return [
    `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${HOST_NAME}`,
    `HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\${HOST_NAME}`,
    `HKCU\\Software\\BraveSoftware\\Brave\\NativeMessagingHosts\\${HOST_NAME}`,
    `HKCU\\Software\\Chromium\\NativeMessagingHosts\\${HOST_NAME}`,
  ];
}

/** Windows HKCU key Firefox reads for native hosts (JSON must use allowed_extensions). */
export function windowsFirefoxNativeMessagingRegKey(): string {
  return `HKCU\\Software\\Mozilla\\NativeMessagingHosts\\${HOST_NAME}`;
}

/** All Windows native-messaging registry keys (Chromium + Firefox) for uninstall. */
export function windowsNativeMessagingRegKeys(): string[] {
  return [...windowsChromiumNativeMessagingRegKeys(), windowsFirefoxNativeMessagingRegKey()];
}

function registerWindowsRegistryKey(key: string, manifestPath: string): string | undefined {
  try {
    execFileSync('reg', ['add', key, '/ve', '/t', 'REG_SZ', '/d', manifestPath, '/f'], {
      stdio: 'pipe',
    });
    return undefined;
  } catch (e) {
    return `Registry ${key}: ${e instanceof Error ? e.message : String(e)}`;
  }
}

function registerWindowsChromiumRegistry(manifestPath: string): string[] {
  const notes: string[] = [];
  for (const key of windowsChromiumNativeMessagingRegKeys()) {
    const err = registerWindowsRegistryKey(key, manifestPath);
    if (err) notes.push(err);
  }
  return notes;
}

function unregisterWindowsRegistry(): string[] {
  const notes: string[] = [];
  for (const key of windowsNativeMessagingRegKeys()) {
    try {
      execFileSync('reg', ['delete', key, '/f'], { stdio: 'pipe' });
    } catch {
      /* key may not exist */
    }
  }
  return notes;
}

export function installHost(options: InstallOptions): { written: string[]; notes: string[] } {
  const written: string[] = [];
  const notes: string[] = [];
  const os = options.os ?? platform();
  const extensionIds = resolveChromiumExtensionIds(options);
  if (extensionIds.length === 0) {
    notes.push(
      'No Chromium extension ids. Pass --extension-id=<id> from chrome://extensions (Developer mode).',
    );
  }

  let primaryChromeManifest: string | undefined;
  let firefoxManifestPath: string | undefined;

  if (options.dryRun) {
    notes.push(
      `dry-run: would register host path ${options.hostPath} for ids: ${extensionIds.join(', ') || '(none)'}`,
    );
    return { written, notes };
  }

  if (extensionIds.length > 0) {
    for (const dir of chromeManifestDirs(os)) {
      try {
        mkdirSync(dir, { recursive: true });
        const file = join(dir, `${HOST_NAME}.json`);
        writeFileSync(file, chromeManifest(options.hostPath, extensionIds));
        written.push(file);
        primaryChromeManifest ??= file;
      } catch (e) {
        notes.push(`Skipped ${dir}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  if (options.firefox !== false) {
    try {
      const dir = firefoxManifestDir(os);
      mkdirSync(dir, { recursive: true });
      const file = join(dir, `${HOST_NAME}.json`);
      writeFileSync(file, firefoxManifest(options.hostPath));
      written.push(file);
      firefoxManifestPath = file;
    } catch (e) {
      notes.push(`Firefox manifest: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (os === 'win32') {
    if (primaryChromeManifest) {
      notes.push(...registerWindowsChromiumRegistry(primaryChromeManifest));
      notes.push(
        `Windows Chromium registry keys for ${HOST_NAME} point at ${primaryChromeManifest}.`,
      );
    } else {
      notes.push(
        'On Windows, Chromium browsers need HKCU\\…\\NativeMessagingHosts\\com.detour.db → JSON path.',
      );
    }
    if (firefoxManifestPath) {
      const ffErr = registerWindowsRegistryKey(
        windowsFirefoxNativeMessagingRegKey(),
        firefoxManifestPath,
      );
      if (ffErr) notes.push(ffErr);
      else {
        notes.push(
          `Windows Firefox registry key for ${HOST_NAME} points at ${firefoxManifestPath}.`,
        );
      }
    }
  }

  return { written, notes };
}

/** Clear Gatekeeper quarantine on a copied helper tree (macOS, best-effort). */
export function clearQuarantine(targetDir: string, os: OsPlatform = platform()): string[] {
  const notes: string[] = [];
  if (os !== 'darwin') return notes;
  try {
    execFileSync('xattr', ['-dr', 'com.apple.quarantine', targetDir], { stdio: 'pipe' });
    notes.push(`Cleared quarantine on ${targetDir}`);
  } catch (e) {
    notes.push(
      `Could not clear quarantine (you may need to right-click → Open): ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  return notes;
}

export type SeaInstallOptions = {
  /** Directory containing the SEA binary + node_modules (usually dirname(execPath)). */
  sourceDir: string;
  extensionId?: string;
  extensionIds?: string[];
  brand?: 'detour' | 'rogers';
  firefox?: boolean;
  os?: OsPlatform;
  dryRun?: boolean;
};

/**
 * Copy the pack helper/ tree into the stable per-user dir and register native-messaging manifests.
 * Manifest `path` points at the installed SEA binary (no Node launcher).
 */
export function installSeaHelper(options: SeaInstallOptions): {
  installDir: string;
  hostPath: string;
  written: string[];
  notes: string[];
} {
  const os = options.os ?? platform();
  const installDir = helperInstallDir(os);
  const binName = helperBinaryName(os);
  const hostPath = join(installDir, binName);
  const notes: string[] = [];

  if (options.dryRun) {
    const { notes: n } = installHost({
      hostPath,
      extensionId: options.extensionId,
      extensionIds: options.extensionIds,
      brand: options.brand,
      firefox: options.firefox,
      os,
      dryRun: true,
    });
    return { installDir, hostPath, written: [], notes: [`dry-run: would copy ${options.sourceDir} → ${installDir}`, ...n] };
  }

  mkdirSync(installDir, { recursive: true });
  const srcBin = join(options.sourceDir, binName);
  if (!existsSync(srcBin)) {
    // Allow running install from an already-named binary path (sourceDir = dirname(execPath)).
    const alt = join(options.sourceDir, os === 'win32' ? 'detour-db-host.exe' : 'detour-db-host');
    if (!existsSync(alt) && existsSync(join(options.sourceDir, '..'))) {
      notes.push(`SEA binary not found at ${srcBin}`);
    }
  }
  const fromBin = existsSync(srcBin) ? srcBin : join(options.sourceDir, binName);
  if (!existsSync(fromBin)) {
    // When execPath itself is the binary, copy process.execPath
    const execCandidate = process.execPath;
    if (dirname(execCandidate) === options.sourceDir || execCandidate.endsWith(binName)) {
      copyReplaceBinary(execCandidate, hostPath, os);
    } else {
      throw new Error(`SEA binary not found in ${options.sourceDir} (expected ${binName})`);
    }
  } else {
    copyReplaceBinary(fromBin, hostPath, os);
  }
  if (os !== 'win32') {
    try {
      chmodSync(hostPath, 0o755);
    } catch {
      /* ignore */
    }
  }

  const srcNm = join(options.sourceDir, 'node_modules');
  const destNm = join(installDir, 'node_modules');
  if (existsSync(srcNm)) {
    rmSync(destNm, { recursive: true, force: true });
    cpSync(srcNm, destNm, { recursive: true });
  }
  const pkgJson = join(options.sourceDir, 'package.json');
  if (existsSync(pkgJson)) {
    cpSync(pkgJson, join(installDir, 'package.json'));
  } else {
    writeFileSync(join(installDir, 'package.json'), `${JSON.stringify({ name: 'detour-db-host', private: true }, null, 2)}\n`);
  }

  // Sibling native picker (Windows Go / macOS Cocoa). Optional — dialog fallbacks if absent.
  const pickName = pickfileBinaryName(os);
  const srcPick = join(options.sourceDir, pickName);
  if (existsSync(srcPick)) {
    const destPick = join(installDir, pickName);
    copyReplaceBinary(srcPick, destPick, os);
    if (os !== 'win32') {
      try {
        chmodSync(destPick, 0o755);
      } catch {
        /* ignore */
      }
    }
    notes.push(`Installed ${pickName} beside helper for fast Browse`);
  }

  if (os === 'darwin') {
    // Prefer clang-built Cocoa sibling even when SEA did not ship one.
    if (!existsSync(join(installDir, pickName))) {
      notes.push(...compileNativePickfileBinary(installDir));
    }
    notes.push(...compileNSOpenPickScript(installDir));
  }

  notes.push(...clearQuarantine(installDir, os));

  const { written, notes: regNotes } = installHost({
    hostPath,
    extensionId: options.extensionId,
    extensionIds: options.extensionIds,
    brand: options.brand,
    firefox: options.firefox,
    os,
  });
  notes.push(...regNotes);
  return { installDir, hostPath, written, notes };
}

/** clang-build Cocoa detour-pickfile into installDir (macOS Browse modal path). */
export function compileNativePickfileBinary(installDir: string): string[] {
  const notes: string[] = [];
  const srcPath = join(installDir, 'pickfile-nsopen.m');
  const dstPath = join(installDir, pickfileBinaryName('darwin'));
  try {
    mkdirSync(installDir, { recursive: true });
    writeFileSync(srcPath, DARWIN_NSOPEN_OBJC_SOURCE, 'utf8');
    execFileSync(
      'clang',
      ['-O2', '-framework', 'AppKit', '-framework', 'Foundation', '-o', dstPath, srcPath],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    try {
      chmodSync(dstPath, 0o755);
    } catch {
      /* ignore */
    }
    notes.push(`Compiled native pickFile → ${dstPath}`);
  } catch (e) {
    notes.push(
      `Could not compile native pickFile binary (Browse will use AppleScript fallback): ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
  }
  return notes;
}

/** osacompile NSOpenPanel script into installDir (macOS Browse AppleScript fallback). */
export function compileNSOpenPickScript(installDir: string): string[] {
  const notes: string[] = [];
  const srcPath = join(installDir, 'pickfile-nsopen.applescript');
  const dstPath = join(installDir, COMPILED_NSOPEN_SCRIPT);
  try {
    mkdirSync(installDir, { recursive: true });
    writeFileSync(srcPath, DARWIN_NSOPEN_SCRIPT_SOURCE, 'utf8');
    execFileSync('osacompile', ['-o', dstPath, srcPath], { stdio: ['ignore', 'pipe', 'pipe'] });
    notes.push(`Compiled pickFile script → ${dstPath}`);
  } catch (e) {
    notes.push(
      `Could not compile pickFile NSOpenPanel script (Browse will use slower -e fallback): ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
  }
  return notes;
}

/** Remove per-user helper files (binary + node_modules). Manifests via uninstallHost. */
export function removeSeaHelperFiles(os: OsPlatform = platform()): { removed: string[]; notes: string[] } {
  const removed: string[] = [];
  const notes: string[] = [];
  const dir = helperInstallDir(os);
  if (existsSync(dir)) {
    try {
      rmSync(dir, { recursive: true, force: true });
      removed.push(dir);
    } catch (e) {
      notes.push(`Could not remove ${dir}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { removed, notes };
}

export type DoctorReport = {
  version: string;
  hostName: string;
  installDir: string;
  hostPath: string;
  hostExists: boolean;
  manifestPaths: { path: string; exists: boolean }[];
  ok: boolean;
  notes: string[];
};

export function doctorHost(os: OsPlatform = platform()): DoctorReport {
  const installDir = helperInstallDir(os);
  const hostPath = join(installDir, helperBinaryName(os));
  const notes: string[] = [];
  const manifestPaths = [...chromeManifestDirs(os), firefoxManifestDir(os)].map((d) => {
    const path = join(d, `${HOST_NAME}.json`);
    return { path, exists: existsSync(path) };
  });
  const hostExists = existsSync(hostPath);
  if (!hostExists) notes.push(`Helper binary missing at ${hostPath}. Run install from your Detour pack.`);
  const anyManifest = manifestPaths.some((m) => m.exists);
  if (!anyManifest) notes.push('No native-messaging manifests found. Run install.');
  return {
    version: HOST_VERSION,
    hostName: HOST_NAME,
    installDir,
    hostPath,
    hostExists,
    manifestPaths,
    ok: hostExists && anyManifest,
    notes,
  };
}

export function uninstallHost(os: OsPlatform = platform()): { removed: string[]; notes: string[] } {
  const removed: string[] = [];
  const notes: string[] = [];
  const candidates = [...chromeManifestDirs(os), firefoxManifestDir(os)].map((d) =>
    join(d, `${HOST_NAME}.json`),
  );
  for (const file of candidates) {
    if (existsSync(file)) {
      try {
        unlinkSync(file);
        removed.push(file);
      } catch (e) {
        notes.push(`Could not remove ${file}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
  if (os === 'win32') {
    notes.push(...unregisterWindowsRegistry());
  }
  return { removed, notes };
}

export function readInstalledManifest(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}
