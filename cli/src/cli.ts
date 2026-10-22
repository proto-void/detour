#!/usr/bin/env node
import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { platform } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  doctorHost,
  hostLauncherFileName,
  installHost,
  installSeaHelper,
  removeSeaHelperFiles,
  resolveNodePath,
  uninstallHost,
  writeHostLauncher,
} from './db/install.ts';
import { isRunningAsSea } from './db/sea-require.ts';
import { runNativeHostStdio } from './db/host.ts';
import { HOST_NAME, HOST_VERSION } from './db/protocol.ts';
import { DEFAULT_PORT, prepareRoot } from './paths.ts';
import { startBridge } from './server.ts';

export interface BridgeArgs {
  command: 'bridge';
  dir: string;
  port: number;
}

export type DbInstallArgs = {
  command: 'db-install';
  extensionId?: string;
  firefox: boolean;
  dryRun: boolean;
  brand: 'detour';
  /** Prefer SEA self-install when running as SEA (or --sea). */
  sea: boolean;
};

export type DbUninstallArgs = { command: 'db-uninstall'; sea: boolean };
export type DbHostArgs = { command: 'db-host' };
export type DbDoctorArgs = { command: 'db-doctor' };
export type VersionArgs = { command: 'version' };

export type ParsedArgs =
  | BridgeArgs
  | DbInstallArgs
  | DbUninstallArgs
  | DbHostArgs
  | DbDoctorArgs
  | VersionArgs
  | { error: string };

/**
 * `detour bridge <folder> [--port 47321]`
 * `detour db install [--extension-id=…] [--no-firefox] [--dry-run] [--brand=detour]`
 * `detour db uninstall`
 * `detour db doctor`
 * `detour db-host-stdio` (native messaging entry; also via launcher)
 *
 * SEA binary also accepts top-level: install | uninstall | doctor | --version
 */
export function parseArgs(argv: string[]): ParsedArgs {
  if (argv.length === 0) {
    // SEA with no args → native host stdio (browser spawn).
    if (isRunningAsSea()) return { command: 'db-host' };
    return { error: usage() };
  }

  if (argv[0] === '--help' || argv[0] === '-h') {
    return { error: usage() };
  }

  if (argv[0] === '--version' || argv[0] === '-V' || argv[0] === 'version') {
    return { command: 'version' };
  }

  if (argv[0] === 'install' || argv[0] === 'uninstall' || argv[0] === 'doctor') {
    return parseSeaStyle(argv);
  }

  if (argv[0] === 'db-host-stdio') return { command: 'db-host' };

  if (argv[0] === 'db') {
    const sub = argv[1];
    if (sub === 'install') return parseDbInstall(argv.slice(2));
    if (sub === 'uninstall') {
      let sea = isRunningAsSea();
      for (const arg of argv.slice(2)) {
        if (arg === '--sea') sea = true;
        else if (arg === '--help' || arg === '-h') return { error: usage() };
        else return { error: `Unknown option "${arg}".\n${usage()}` };
      }
      return { command: 'db-uninstall', sea };
    }
    if (sub === 'doctor') return { command: 'db-doctor' };
    if (sub === 'host') return { command: 'db-host' };
    return { error: `Unknown db command "${sub ?? ''}".\n${usage()}` };
  }

  if (argv[0] !== 'bridge') return { error: `Unknown command "${argv[0] ?? ''}".\n${usage()}` };
  const rest = argv.slice(1);
  let dir: string | undefined;
  let port = DEFAULT_PORT;
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!;
    if (arg === '--host' || arg.startsWith('--host=')) {
      return { error: 'Local Bridge listens on 127.0.0.1 only. There is no --host flag.' };
    }
    if (arg === '--port' || arg.startsWith('--port=')) {
      const value = arg.startsWith('--port=') ? arg.slice('--port='.length) : rest[++i];
      if (value === undefined || !/^[0-9]+$/.test(value)) return { error: 'Usage: detour bridge <folder> [--port 47321]' };
      port = Number(value);
      if (port < 1 || port > 65535) return { error: 'Port must be between 1 and 65535.' };
      continue;
    }
    if (arg.startsWith('-')) return { error: `Unknown option "${arg}".\n${usage()}` };
    if (dir !== undefined) return { error: usage() };
    dir = arg;
  }
  if (dir === undefined) return { error: usage() };
  return { command: 'bridge', dir, port };
}

function parseSeaStyle(argv: string[]): ParsedArgs {
  const cmd = argv[0];
  if (cmd === 'uninstall') return { command: 'db-uninstall', sea: true };
  if (cmd === 'doctor') return { command: 'db-doctor' };
  return parseDbInstall(argv.slice(1), { seaDefault: true });
}

function parseDbInstall(
  args: string[],
  opts?: { seaDefault?: boolean },
): DbInstallArgs | { error: string } {
  let extensionId: string | undefined;
  let firefox = true;
  let dryRun = false;
  let brand: 'detour' = 'detour';
  let sea = opts?.seaDefault === true || isRunningAsSea();
  for (const arg of args) {
    if (arg.startsWith('--extension-id=')) extensionId = arg.slice('--extension-id='.length);
    else if (arg === '--no-firefox') firefox = false;
    else if (arg === '--dry-run') dryRun = true;
    else if (arg === '--sea') sea = true;
    else if (arg.startsWith('--brand=')) {
      const b = arg.slice('--brand='.length);
      if (b !== 'detour') return { error: `Unknown brand "${b}". Use detour.` };
      brand = b;
    } else if (arg === '--help' || arg === '-h') return { error: usage() };
    else return { error: `Unknown option "${arg}".\n${usage()}` };
  }
  return { command: 'db-install', extensionId, firefox, dryRun, brand, sea };
}

export function usage(): string {
  return [
    'Usage:',
    '  detour bridge <folder> [--port 47321]',
    '  detour db install [--extension-id=<id>] [--no-firefox] [--dry-run] [--brand=detour]',
    '  detour db uninstall',
    '  detour db doctor',
    '  detour-db-host install | uninstall | doctor | --version   (SEA pack helper)',
    '',
    'Local Bridge serves a folder on 127.0.0.1 for serve-local rules.',
    `db install registers the ${HOST_NAME} native messaging host for the Databases tab.`,
    'OS packs: run Install Detour Helper (no Node required). Developers may still use db install from the repo.',
  ].join('\n');
}

export function banner(port: number, rootLabel: string, token: string): string {
  return [
    'Detour bridge',
    `  http://127.0.0.1:${port}`,
    `  folder: ${rootLabel}`,
    `  token: ${token}`,
    'Connect this token on the Detour rules page. It changes every time you start the bridge.',
  ].join('\n');
}

function packageRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..');
}

async function runDbInstall(args: DbInstallArgs): Promise<void> {
  const os = platform();

  if (args.sea || isRunningAsSea()) {
    const sourceDir = dirname(process.execPath);
    try {
      const result = installSeaHelper({
        sourceDir,
        extensionId: args.extensionId,
        brand: args.brand,
        firefox: args.firefox,
        os,
        dryRun: args.dryRun,
      });
      console.log(`Detour DB helper install dir: ${result.installDir}`);
      console.log(`Host binary: ${result.hostPath}`);
      if (result.written.length === 0 && !args.dryRun) {
        console.log('No manifests written.');
      } else {
        console.log('Wrote:');
        for (const w of result.written) console.log(`  ${w}`);
      }
      for (const n of result.notes) console.log(`Note: ${n}`);
      if (!args.dryRun) {
        console.log('Open Detour → Databases. Click Start — you should see Helper: Ready.');
      }
    } catch (e) {
      console.error(e instanceof Error ? e.message : String(e));
      process.exitCode = 1;
    }
    return;
  }

  const root = packageRoot();
  const nodePath = resolveNodePath();
  if (!existsSync(nodePath)) {
    console.error(
      `detour db install: Node binary not found at ${nodePath}. Install Node, then re-run db install with that Node on PATH (or via the absolute path you use day-to-day).`,
    );
    process.exitCode = 1;
    return;
  }
  const launcher = join(root, 'bin', hostLauncherFileName(os));
  const entry = join(root, 'src', 'cli.ts');
  if (!args.dryRun) {
    writeHostLauncher(launcher, entry, { nodePath, platform: os });
    if (os !== 'win32') {
      try {
        chmodSync(launcher, 0o755);
      } catch {
        /* ignore */
      }
    }
  }
  const { written, notes } = installHost({
    hostPath: launcher,
    extensionId: args.extensionId,
    brand: args.brand,
    firefox: args.firefox,
    os,
    dryRun: args.dryRun,
  });
  console.log(`Detour DB host launcher: ${launcher}`);
  console.log(`Node (embedded): ${nodePath}`);
  if (written.length === 0 && !args.dryRun) {
    console.log('No manifests written.');
  } else {
    console.log('Wrote:');
    for (const w of written) console.log(`  ${w}`);
  }
  for (const n of notes) console.log(`Note: ${n}`);
  if (!args.dryRun) {
    console.log('Open Detour → Databases. The tab should show Helper: Ready after reload.');
  }
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  if ('error' in parsed) {
    console.error(parsed.error);
    process.exitCode = 1;
    return;
  }

  if (parsed.command === 'version') {
    console.log(`detour-db-host ${HOST_VERSION}`);
    return;
  }

  if (parsed.command === 'db-doctor') {
    const report = doctorHost();
    console.log(`Detour DB helper doctor v${report.version}`);
    console.log(`  host: ${report.hostName}`);
    console.log(`  installDir: ${report.installDir}`);
    console.log(`  binary: ${report.hostPath} (${report.hostExists ? 'present' : 'MISSING'})`);
    for (const m of report.manifestPaths) {
      console.log(`  manifest: ${m.path} (${m.exists ? 'ok' : 'missing'})`);
    }
    for (const n of report.notes) console.log(`  note: ${n}`);
    process.exitCode = report.ok ? 0 : 1;
    return;
  }

  if (parsed.command === 'db-host') {
    await runNativeHostStdio();
    return;
  }

  if (parsed.command === 'db-install') {
    await runDbInstall(parsed);
    return;
  }

  if (parsed.command === 'db-uninstall') {
    if (parsed.sea || isRunningAsSea()) {
      const files = removeSeaHelperFiles();
      const { removed, notes } = uninstallHost();
      const all = [...files.removed, ...removed];
      if (all.length === 0) console.log('No helper install or manifests found to remove.');
      else {
        console.log('Removed:');
        for (const r of all) console.log(`  ${r}`);
      }
      for (const n of [...files.notes, ...notes]) console.log(`Note: ${n}`);
      return;
    }
    const { removed, notes } = uninstallHost();
    if (removed.length === 0) console.log('No host manifests found to remove.');
    else {
      console.log('Removed:');
      for (const r of removed) console.log(`  ${r}`);
    }
    for (const n of notes) console.log(`Note: ${n}`);
    return;
  }

  let prepared;
  try {
    prepared = prepareRoot(parsed.dir);
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
    return;
  }
  const token = randomBytes(32).toString('hex');
  let bridge;
  try {
    bridge = await startBridge(prepared, token, parsed.port);
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
    return;
  }
  console.log(banner(bridge.port, prepared.rootLabel, token));
  const stop = () => {
    void bridge.close().then(() => process.exit(0));
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

function isEntryPoint(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  // SEA: no import.meta.url file entry — always run main when injected.
  if (isRunningAsSea()) return true;
  try {
    return import.meta.url === pathToFileURL(realpathSync(entry)).href;
  } catch {
    return false;
  }
}

if (isEntryPoint()) void main();
