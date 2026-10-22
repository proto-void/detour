import type { EnvVar, KvRow } from './model';

export interface VariableScopes {
  environment?: EnvVar[];
  collection?: KvRow[];
  globals?: KvRow[];
}

const DYNAMIC = {
  $guid: () => crypto.randomUUID(),
  $timestamp: () => String(Math.floor(Date.now() / 1000)),
  $randomInt: () => String(Math.floor(Math.random() * 1000)),
} as const;

const lookup = (key: string, scopes: VariableScopes): string | undefined => {
  if (key.startsWith('$')) {
    const fn = DYNAMIC[key as keyof typeof DYNAMIC];
    return fn ? fn() : undefined;
  }
  const fromEnv = scopes.environment?.find((v) => v.key === key);
  if (fromEnv) {
    const cur = (fromEnv.currentValue ?? '').trim();
    if (cur !== '') return fromEnv.currentValue ?? '';
    const initial = (fromEnv.initialValue ?? '').trim();
    if (initial !== '') return fromEnv.initialValue ?? '';
    // Empty env values fall through to collection / globals.
  }
  const fromCol = scopes.collection?.find((r) => r.enabled !== false && r.key === key);
  if (fromCol) return fromCol.value;
  const fromGlobal = scopes.globals?.find((r) => r.enabled !== false && r.key === key);
  if (fromGlobal) return fromGlobal.value;
  return undefined;
};

/** Replace `{{var}}` left-to-right. Unresolved tokens stay as written. */
export function resolveVariables(input: string, scopes: VariableScopes): string {
  return input.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (full, raw: string) => {
    const key = raw.trim();
    if (key === '') return full;
    const value = lookup(key, scopes);
    return value === undefined ? full : value;
  });
}

export function listVariableRefs(input: string): string[] {
  const keys: string[] = [];
  const re = /\{\{\s*([^{}]+?)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input))) {
    const key = m[1]!.trim();
    if (key && !keys.includes(key)) keys.push(key);
  }
  return keys;
}
