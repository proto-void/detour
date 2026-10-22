import type { ExecuteResult, ObjectNode, PendingEdit } from './types.ts';

export function rowsToResult(
  columns: string[],
  rows: unknown[][],
  started: number,
  extra?: Partial<ExecuteResult>,
): ExecuteResult {
  return {
    columns,
    rows,
    rowCount: rows.length,
    timingMs: Date.now() - started,
    messages: [`${rows.length} row(s) in ${Date.now() - started} ms`],
    ...extra,
  };
}

export function parsePageToken(token: string | null | undefined): number {
  if (!token) return 0;
  const n = Number(token);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function nextPageToken(offset: number, pageSize: number, rowCount: number): string | null {
  if (rowCount < pageSize) return null;
  return String(offset + pageSize);
}

export function editsToSql(edits: PendingEdit[], quoteIdent: (s: string) => string): string[] {
  const out: string[] = [];
  for (const e of edits) {
    if (e.sql) {
      out.push(e.sql);
      continue;
    }
    const table = e.schema ? `${quoteIdent(e.schema)}.${quoteIdent(e.table)}` : quoteIdent(e.table);
    if (e.kind === 'delete' && e.primaryKey) {
      const where = Object.entries(e.primaryKey)
        .map(([k, v]) => `${quoteIdent(k)} = ${sqlLiteral(v)}`)
        .join(' AND ');
      out.push(`DELETE FROM ${table} WHERE ${where}`);
    } else if (e.kind === 'update' && e.primaryKey && e.values) {
      const set = Object.entries(e.values)
        .map(([k, v]) => `${quoteIdent(k)} = ${sqlLiteral(v)}`)
        .join(', ');
      const where = Object.entries(e.primaryKey)
        .map(([k, v]) => `${quoteIdent(k)} = ${sqlLiteral(v)}`)
        .join(' AND ');
      out.push(`UPDATE ${table} SET ${set} WHERE ${where}`);
    } else if (e.kind === 'insert' && e.values) {
      const cols = Object.keys(e.values).map(quoteIdent).join(', ');
      const vals = Object.values(e.values).map(sqlLiteral).join(', ');
      out.push(`INSERT INTO ${table} (${cols}) VALUES (${vals})`);
    }
  }
  return out;
}

export function sqlLiteral(v: unknown): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return `'${String(v).replace(/'/g, "''")}'`;
}

export function quoteDouble(ident: string): string {
  return `"${ident.replace(/"/g, '""')}"`;
}

export function quoteBacktick(ident: string): string {
  return `\`${ident.replace(/`/g, '``')}\``;
}

export function quoteBracket(ident: string): string {
  return `[${ident.replace(/]/g, ']]')}]`;
}

export function mapSchemas(
  schemas: string[],
  database?: string,
): ObjectNode[] {
  return schemas.map((s) => ({
    id: `schema:${database ?? ''}:${s}`,
    label: s,
    kind: 'schema',
    meta: { database, schema: s },
  }));
}

export function mapTables(
  tables: Array<{ name: string; kind?: string }>,
  schema: string,
  database?: string,
): ObjectNode[] {
  return tables.map((t) => ({
    id: `table:${database ?? ''}:${schema}.${t.name}`,
    label: t.name,
    kind: t.kind ?? 'table',
    meta: { database, schema, name: t.name },
  }));
}

/** Export helpers used by host RPC. */
export function toCsv(columns: string[], rows: unknown[][]): string {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  return [columns.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n') + '\n';
}

export function toInsertSql(table: string, columns: string[], rows: unknown[][], quote = quoteDouble): string {
  if (rows.length === 0) return '';
  const cols = columns.map(quote).join(', ');
  const values = rows
    .map((r) => `(${r.map(sqlLiteral).join(', ')})`)
    .join(',\n');
  return `INSERT INTO ${quote(table)} (${cols}) VALUES\n${values};\n`;
}

export function parseCsv(text: string): { columns: string[]; rows: string[][] } {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter((l) => l.length > 0);
  if (lines.length === 0) return { columns: [], rows: [] };
  const parseLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!;
      if (inQ) {
        if (ch === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (ch === '"') inQ = false;
        else cur += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === ',') {
        out.push(cur);
        cur = '';
      } else cur += ch;
    }
    out.push(cur);
    return out;
  };
  const columns = parseLine(lines[0]!);
  const rows = lines.slice(1).map(parseLine);
  return { columns, rows };
}
