export type SqliteConnectionInput = {
  filename?: string;
  path?: string;
  readOnly?: boolean;
  createIfMissing?: boolean;
  busyTimeoutMs?: number;
  journalMode?: string;
  engineOptions?: Record<string, unknown>;
};

export type BuiltSqliteOptions = {
  filename: string;
  readOnly: boolean;
  createIfMissing: boolean;
  busyTimeoutMs: number;
  journalMode?: string;
};

export function buildSqliteOptions(input: SqliteConnectionInput): BuiltSqliteOptions {
  const eo = input.engineOptions ?? {};
  const filename = String(input.filename ?? input.path ?? eo.filename ?? '');
  if (!filename) throw new Error('SQLite requires a database file path.');
  return {
    filename,
    readOnly: input.readOnly === true || eo.readOnly === true,
    createIfMissing: input.createIfMissing !== false && eo.createIfMissing !== false,
    busyTimeoutMs: Number(input.busyTimeoutMs ?? eo.busyTimeoutMs ?? 5000),
    journalMode: input.journalMode
      ? String(input.journalMode)
      : eo.journalMode
        ? String(eo.journalMode)
        : undefined,
  };
}
