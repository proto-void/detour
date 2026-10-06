#!/usr/bin/env node
import { randomBytes } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { DEFAULT_PORT, prepareRoot } from './paths.ts';
import { startBridge } from './server.ts';

export interface BridgeArgs {
  dir: string;
  port: number;
}

/**
 * `detour bridge <folder> [--port 47321]`.
 * `--host` is rejected: the server always binds 127.0.0.1.
 */
export function parseArgs(argv: string[]): BridgeArgs | { error: string } {
  if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
    return { error: usage() };
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
  return { dir, port };
}

export function usage(): string {
  return 'Usage: detour bridge <folder> [--port 47321]\nServes that folder on 127.0.0.1 for Detour serve-local rules. Not a remote server.';
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

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  if ('error' in parsed) {
    console.error(parsed.error);
    process.exitCode = 1;
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
  try {
    return import.meta.url === pathToFileURL(realpathSync(entry)).href;
  } catch {
    return false;
  }
}

if (isEntryPoint()) void main();
