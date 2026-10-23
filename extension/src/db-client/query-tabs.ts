import { createQueryTab, type DbQueryTab } from './model';

const SELECT_LIMIT = 100;

/**
 * Table ref for CQL/SQL: unqualified when active keyspace matches the table's
 * keyspace (session USE / search_path); otherwise `ks.table`.
 */
export function qualifyTableRef(
  tableKeyspace: string,
  table: string,
  activeKeyspace: string | null | undefined,
): string {
  const ks = tableKeyspace.trim();
  const t = table.trim();
  if (!t) return 'table';
  if (activeKeyspace && ks && activeKeyspace === ks) return t;
  if (!ks) return t;
  return `${ks}.${t}`;
}

/** Build the standard explorer SELECT for a table / MV. */
export function selectStarStatement(
  keyspace: string,
  table: string,
  limit = SELECT_LIMIT,
  activeKeyspace?: string | null,
): string {
  const ref = qualifyTableRef(keyspace, table, activeKeyspace);
  return `SELECT * FROM ${ref} LIMIT ${limit};`;
}

/** Normalize for compare: trim, collapse whitespace, strip trailing `;`. */
export function normalizeStatement(sql: string): string {
  return sql
    .replace(/;+\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Last non-empty statement in a buffer (split on `;`). */
export function lastStatement(body: string): string {
  const parts = body.split(';').map((p) => p.trim()).filter(Boolean);
  return parts[parts.length - 1] ?? '';
}

/**
 * Append SELECT to active tab body unless the last statement is already that SELECT.
 * Returns the new body (and whether anything changed).
 */
export function appendSelectIfNeeded(
  body: string,
  keyspace: string,
  table: string,
  activeKeyspace?: string | null,
): { body: string; appended: boolean; statement: string } {
  const statement = selectStarStatement(keyspace, table, SELECT_LIMIT, activeKeyspace);
  const last = lastStatement(body);
  if (last && normalizeStatement(last) === normalizeStatement(statement)) {
    return { body, appended: false, statement };
  }
  const trimmed = body.replace(/\s*$/, '');
  const next = trimmed.length === 0 ? statement : `${trimmed}\n${statement}`;
  return { body: next, appended: true, statement };
}

/** Create a new tab prefilled with SELECT (Shift+double-click). */
export function newTabWithSelect(
  keyspace: string,
  table: string,
  connectionId: string | null,
  name?: string,
  activeKeyspace?: string | null,
): DbQueryTab {
  const statement = selectStarStatement(keyspace, table, SELECT_LIMIT, activeKeyspace);
  const ref = qualifyTableRef(keyspace, table, activeKeyspace);
  return createQueryTab({
    name: name ?? ref,
    body: statement,
    connectionId,
  });
}

/** Insert text at a caret offset in the editor body. */
export function insertAtCaret(body: string, caret: number, text: string): { body: string; caret: number } {
  const at = Math.max(0, Math.min(caret, body.length));
  return {
    body: body.slice(0, at) + text + body.slice(at),
    caret: at + text.length,
  };
}
