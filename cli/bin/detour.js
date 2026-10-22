#!/usr/bin/env node
// Node 24 runs the TypeScript entry with type stripping. This file is the package bin.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
const child = spawn(process.execPath, ['--experimental-strip-types', cli, ...process.argv.slice(2)], {
  stdio: 'inherit',
});
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
