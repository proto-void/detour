export type DiffKind = 'equal' | 'added' | 'removed' | 'changed';

export interface DiffLine {
  kind: DiffKind;
  path: string;
  left?: string;
  right?: string;
}

export interface DiffResult {
  mode: 'json' | 'text';
  lines: DiffLine[];
  equal: boolean;
}

/** Compare two response bodies — structural JSON when both parse, else line text diff. */
export function diffResponses(left: string, right: string): DiffResult {
  const a = tryJson(left);
  const b = tryJson(right);
  if (a !== undefined && b !== undefined) {
    const lines: DiffLine[] = [];
    walk('', a, b, lines);
    return { mode: 'json', lines, equal: lines.every((l) => l.kind === 'equal') };
  }
  return textDiff(left, right);
}

function tryJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function walk(path: string, left: unknown, right: unknown, out: DiffLine[]): void {
  if (Object.is(left, right)) {
    out.push({ kind: 'equal', path: path || '$', left: fmt(left), right: fmt(right) });
    return;
  }
  if (isObject(left) && isObject(right)) {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    for (const key of [...keys].sort()) {
      const p = path ? `${path}.${key}` : key;
      if (!(key in left)) out.push({ kind: 'added', path: p, right: fmt(right[key]) });
      else if (!(key in right)) out.push({ kind: 'removed', path: p, left: fmt(left[key]) });
      else walk(p, left[key], right[key], out);
    }
    return;
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    const n = Math.max(left.length, right.length);
    for (let i = 0; i < n; i++) {
      const p = `${path || '$'}[${i}]`;
      if (i >= left.length) out.push({ kind: 'added', path: p, right: fmt(right[i]) });
      else if (i >= right.length) out.push({ kind: 'removed', path: p, left: fmt(left[i]) });
      else walk(p, left[i], right[i], out);
    }
    return;
  }
  out.push({ kind: 'changed', path: path || '$', left: fmt(left), right: fmt(right) });
}

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function fmt(v: unknown): string {
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function textDiff(left: string, right: string): DiffResult {
  const a = left.split(/\r?\n/);
  const b = right.split(/\r?\n/);
  const lines: DiffLine[] = [];
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const L = a[i];
    const R = b[i];
    if (L === R) lines.push({ kind: 'equal', path: `L${i + 1}`, left: L, right: R });
    else if (L === undefined) lines.push({ kind: 'added', path: `L${i + 1}`, right: R });
    else if (R === undefined) lines.push({ kind: 'removed', path: `L${i + 1}`, left: L });
    else lines.push({ kind: 'changed', path: `L${i + 1}`, left: L, right: R });
  }
  return { mode: 'text', lines, equal: lines.every((l) => l.kind === 'equal') };
}
