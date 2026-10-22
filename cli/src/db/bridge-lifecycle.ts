import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

let bridgeProc: ChildProcess | undefined;

/**
 * Optionally start/stop the existing Local Bridge (loopback HTTP) from the DB host.
 * Does not change the HTTP protocol — only process lifecycle.
 */
export function startLocalBridge(folder: string, port = 47321): { pid: number; port: number } {
  if (bridgeProc && !bridgeProc.killed) {
    throw new Error('Local Bridge already running under this DB host.');
  }
  const cli = join(dirname(fileURLToPath(import.meta.url)), '..', 'cli.ts');
  bridgeProc = spawn(process.execPath, ['--experimental-strip-types', cli, 'bridge', folder, '--port', String(port)], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });
  return { pid: bridgeProc.pid ?? 0, port };
}

export async function stopLocalBridge(): Promise<{ stopped: boolean }> {
  if (!bridgeProc || bridgeProc.killed) return { stopped: false };
  const proc = bridgeProc;
  bridgeProc = undefined;
  proc.kill('SIGTERM');
  await new Promise<void>((resolve) => {
    const t = setTimeout(() => {
      try {
        proc.kill('SIGKILL');
      } catch {
        /* ignore */
      }
      resolve();
    }, 3000);
    proc.on('exit', () => {
      clearTimeout(t);
      resolve();
    });
  });
  return { stopped: true };
}

export function bridgeStatus(): { running: boolean; pid?: number } {
  if (bridgeProc && !bridgeProc.killed) return { running: true, pid: bridgeProc.pid };
  return { running: false };
}
