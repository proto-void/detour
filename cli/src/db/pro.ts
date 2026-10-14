import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { DescribeResult } from './adapters/types.ts';
import type { QueryCollectionFile } from './collections.ts';
import { collectionsDir, readCollections, saveCollection } from './collections.ts';

export type ErNode = { id: string; label: string; columns: string[] };
export type ErEdge = { from: string; to: string; fromCol: string; toCol: string };

export function buildErDiagram(
  tables: Array<{ id: string; label: string; describe: DescribeResult }>,
): { nodes: ErNode[]; edges: ErEdge[] } {
  const nodes: ErNode[] = tables.map((t) => ({
    id: t.id,
    label: t.label,
    columns: (t.describe.columns ?? []).map((c) => `${c.name} ${c.type}`),
  }));
  const edges: ErEdge[] = [];
  for (const t of tables) {
    for (const fk of t.describe.foreignKeys ?? []) {
      const to = tables.find((x) => x.label === fk.toTable || x.id.endsWith(`.${fk.toTable}`));
      if (to) {
        edges.push({ from: t.id, to: to.id, fromCol: fk.from, toCol: fk.toColumn });
      }
    }
  }
  return { nodes, edges };
}

export function tableDesignerDdl(input: {
  action: 'create' | 'alter';
  schema?: string;
  table: string;
  columns: Array<{ name: string; type: string; nullable?: boolean; primaryKey?: boolean }>;
  alterClauses?: string[];
}): string {
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const table = input.schema ? `${q(input.schema)}.${q(input.table)}` : q(input.table);
  if (input.action === 'alter') {
    const clauses = input.alterClauses?.length
      ? input.alterClauses
      : input.columns.map((c) => `ADD COLUMN ${q(c.name)} ${c.type}${c.nullable === false ? ' NOT NULL' : ''}`);
    return `ALTER TABLE ${table}\n  ${clauses.join(',\n  ')};`;
  }
  const pk = input.columns.filter((c) => c.primaryKey).map((c) => q(c.name));
  const body = [
    ...input.columns.map(
      (c) => `  ${q(c.name)} ${c.type}${c.nullable === false ? ' NOT NULL' : ''}`,
    ),
    ...(pk.length ? [`  PRIMARY KEY (${pk.join(', ')})`] : []),
  ];
  return `CREATE TABLE ${table} (\n${body.join(',\n')}\n);`;
}

export function schemaCompare(
  left: Array<{ name: string; ddl?: string; columns?: Array<{ name: string; type: string }> }>,
  right: Array<{ name: string; ddl?: string; columns?: Array<{ name: string; type: string }> }>,
): { onlyLeft: string[]; onlyRight: string[]; changed: Array<{ name: string; left?: string; right?: string }> } {
  const lMap = new Map(left.map((t) => [t.name, t]));
  const rMap = new Map(right.map((t) => [t.name, t]));
  const onlyLeft = [...lMap.keys()].filter((k) => !rMap.has(k));
  const onlyRight = [...rMap.keys()].filter((k) => !lMap.has(k));
  const changed: Array<{ name: string; left?: string; right?: string }> = [];
  for (const [name, l] of lMap) {
    const r = rMap.get(name);
    if (!r) continue;
    const lSig = JSON.stringify(l.columns ?? l.ddl);
    const rSig = JSON.stringify(r.columns ?? r.ddl);
    if (lSig !== rSig) changed.push({ name, left: l.ddl ?? lSig, right: r.ddl ?? rSig });
  }
  return { onlyLeft, onlyRight, changed };
}

export function dataCompare(
  leftRows: unknown[][],
  rightRows: unknown[][],
  keyIndex = 0,
): { onlyLeft: number; onlyRight: number; differing: number } {
  const lKeys = new Map(leftRows.map((r, i) => [String(r[keyIndex]), i]));
  const rKeys = new Map(rightRows.map((r, i) => [String(r[keyIndex]), i]));
  let onlyLeft = 0;
  let onlyRight = 0;
  let differing = 0;
  for (const [k, i] of lKeys) {
    if (!rKeys.has(k)) onlyLeft++;
    else if (JSON.stringify(leftRows[i]) !== JSON.stringify(rightRows[rKeys.get(k)!])) differing++;
  }
  for (const k of rKeys.keys()) if (!lKeys.has(k)) onlyRight++;
  return { onlyLeft, onlyRight, differing };
}

/** Sync collections to/from a git-friendly folder (pretty JSON, no secrets). */
export function syncCollectionsToFolder(
  folder: string,
  direction: 'push' | 'pull',
  collections?: QueryCollectionFile[],
): QueryCollectionFile[] {
  mkdirSync(folder, { recursive: true });
  if (direction === 'pull') {
    return readdirSync(folder)
      .filter((f) => f.endsWith('.json'))
      .map((f) => JSON.parse(readFileSync(join(folder, f), 'utf8')) as QueryCollectionFile)
      .filter((c) => c?.v === 1 && c.id);
  }
  const list = collections ?? readCollections();
  for (const c of list) {
    const safe = c.id.replace(/[^a-zA-Z0-9_-]/g, '_');
    writeFileSync(join(folder, `${safe}.json`), `${JSON.stringify(c, null, 2)}\n`, 'utf8');
  }
  return list;
}

export function defaultCollectionsPath(): string {
  return collectionsDir();
}

export function folderExists(path: string): boolean {
  return existsSync(path);
}

/** Re-export save for host. */
export { saveCollection, readCollections };
