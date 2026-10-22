import {
  editsToSql,
  mapTables,
  nextPageToken,
  parsePageToken,
  quoteDouble,
  rowsToResult,
} from './sql-common.ts';
import type { DbAdapter, DescribeResult, ExecuteOptions, ExplainResult, ObjectNode, ObjectPath, PendingEdit } from './types.ts';

type SqliteDb = {
  prepare(sql: string): {
    all(...params: unknown[]): Record<string, unknown>[];
    run(...params: unknown[]): { changes: number };
  };
  exec(sql: string): void;
  close(): void;
};

export function createSqliteAdapter(): DbAdapter {
  let db: SqliteDb | undefined;

  async function open(config: Record<string, unknown>): Promise<SqliteDb> {
    const path = String(config.filename ?? config.path ?? config.database ?? ':memory:');
    // Node 22+ node:sqlite
    const mod = (await import('node:sqlite')) as {
      DatabaseSync: new (path: string) => SqliteDb;
    };
    const database = new mod.DatabaseSync(path);
    db = database;
    return database;
  }

  return {
    async connect(config) {
      if (db) await this.close();
      await open(config);
    },
    async testConnection(config) {
      const started = Date.now();
      try {
        const d = await open(config);
        d.prepare('SELECT 1').all();
        return { ok: true as const, latencyMs: Date.now() - started };
      } catch (e) {
        await this.close();
        return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
      }
    },
    async listObjects(path?: ObjectPath): Promise<ObjectNode[]> {
      if (!db) throw new Error('Not connected');
      if (!path || path.kind === 'root' || path.kind === 'schema') {
        const rows = db.prepare(
          `SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name`,
        ).all();
        return mapTables(
          rows.map((r) => ({ name: String(r.name), kind: String(r.type) === 'view' ? 'view' : 'table' })),
          'main',
        );
      }
      return [];
    },
    async describe(ref: ObjectPath): Promise<DescribeResult> {
      if (!db) throw new Error('Not connected');
      const name = String(ref.name ?? '');
      const rows = db.prepare(`PRAGMA table_info(${quoteDouble(name)})`).all();
      const columns = rows.map((r) => ({
        name: String(r.name),
        type: String(r.type ?? ''),
        nullable: !r.notnull,
        kind: r.pk ? 'pk' : 'regular',
      }));
      const ddlRow = db.prepare(`SELECT sql FROM sqlite_master WHERE name = ?`).all(name)[0];
      return { ddl: ddlRow ? String(ddlRow.sql) : undefined, columns };
    },
    async execute(statement, params, options: ExecuteOptions) {
      if (!db) throw new Error('Not connected');
      const started = Date.now();
      const pageSize = options.pageSize ?? 500;
      const offset = parsePageToken(options.pageToken);
      let sql = statement;
      if (/^\s*SELECT\b/i.test(statement) && !/\bLIMIT\b/i.test(statement)) {
        sql = `${statement.replace(/;\s*$/, '')} LIMIT ${pageSize} OFFSET ${offset}`;
      }
      if (/^\s*(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|REPLACE)\b/i.test(sql)) {
        const info = db.prepare(sql).run(...(params ?? []));
        return rowsToResult([], [], started, { messages: [`changes: ${info.changes}`] });
      }
      const list = db.prepare(sql).all(...(params ?? []));
      const columns = list[0] ? Object.keys(list[0]) : [];
      const rows = list.map((row) => columns.map((c) => row[c]));
      return rowsToResult(columns, rows, started, {
        pageToken: nextPageToken(offset, pageSize, rows.length),
      });
    },
    async explain(statement: string): Promise<ExplainResult> {
      if (!db) throw new Error('Not connected');
      const rows = db.prepare(`EXPLAIN QUERY PLAN ${statement.replace(/;\s*$/, '')}`).all();
      return { format: 'text', plan: rows, raw: JSON.stringify(rows, null, 2) };
    },
    async beginTransaction() {
      db?.exec('BEGIN');
    },
    async commit() {
      db?.exec('COMMIT');
    },
    async rollback() {
      db?.exec('ROLLBACK');
    },
    async applyEdits(edits: PendingEdit[]) {
      if (!db) throw new Error('Not connected');
      const statements = editsToSql(edits, quoteDouble);
      db.exec('BEGIN');
      try {
        for (const s of statements) db.prepare(s).run();
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
      return { applied: statements.length, statements };
    },
    async close() {
      const d = db;
      db = undefined;
      d?.close();
    },
  };
}
