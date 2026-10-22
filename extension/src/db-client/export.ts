import type { DbClientState, DbCollection, DbConnection } from './model';

/** Connection template for sharing — never includes secrets or secretAccount values that hold passwords. */
export type ConnectionTemplate = Omit<DbConnection, 'secretAccount'> & {
  secretAccount?: undefined;
};

export function toConnectionTemplate(conn: DbConnection): ConnectionTemplate {
  const { secretAccount: _s, ...rest } = conn;
  void _s;
  return { ...rest, secretAccount: undefined };
}

export function exportCollections(collections: DbCollection[]): string {
  return `${JSON.stringify({ v: 1, collections }, null, 2)}\n`;
}

export function exportConnectionTemplates(connections: DbConnection[]): string {
  return `${JSON.stringify(
    { v: 1, connections: connections.map(toConnectionTemplate) },
    null,
    2,
  )}\n`;
}

/** Guard: exported JSON must not contain password-like *keys* (values like keyspacesAuth "password" are OK). */
export function assertNoSecretsInExport(json: string): { ok: true } | { ok: false; found: string[] } {
  const found: string[] = [];
  const lower = json.toLowerCase();
  for (const key of ['"password":', '"astratoken":', '"secretaccount":', '"privatekey":', '"accountkey":']) {
    if (lower.includes(key)) found.push(key);
  }
  return found.length ? { ok: false, found } : { ok: true };
}

export function exportDbBundle(state: DbClientState): string {
  return `${JSON.stringify(
    {
      v: 1,
      connections: state.connections.map(toConnectionTemplate),
      collections: state.collections,
    },
    null,
    2,
  )}\n`;
}
