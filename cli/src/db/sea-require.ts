/**
 * Inside a Node SEA, `require` only reaches builtins. Native addons (e.g. @napi-rs/keyring)
 * ship beside the binary under `node_modules/` and load via createRequire.
 */
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { isSea } from 'node:sea';

export function isRunningAsSea(): boolean {
  try {
    return isSea();
  } catch {
    return false;
  }
}

/** Directory that holds platform packages next to the SEA (or Node) binary. */
export function seaNodeModulesRoot(execPath: string = process.execPath): string {
  return join(dirname(execPath), 'node_modules');
}

/**
 * createRequire rooted at the package next to `execPath`.
 * Callers must ensure a `package.json` (even empty `{ }`) exists beside the binary when packing.
 */
export function requireBesideBinary(execPath: string = process.execPath): NodeJS.Require {
  const pkgJson = join(dirname(execPath), 'package.json');
  return createRequire(pkgJson);
}

/** Resolve a package name from beside the binary; returns undefined if missing. */
export function tryRequireBeside<T = unknown>(
  id: string,
  execPath: string = process.execPath,
): T | undefined {
  const root = seaNodeModulesRoot(execPath);
  if (!existsSync(root)) return undefined;
  try {
    return requireBesideBinary(execPath)(id) as T;
  } catch {
    return undefined;
  }
}
