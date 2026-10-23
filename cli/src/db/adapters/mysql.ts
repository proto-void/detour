import { buildMysqlOptions } from './mysql-config.ts';
import {
  editsToSql,
  mapSchemas,
  mapTables,
  nextPageToken,
  parsePageToken,
  quoteBacktick,
  rowsToResult,
} from './sql-common.ts';
import type { DbAdapter, DescribeResult, ExecuteOptions, ExplainResult, ObjectNode, ObjectPath, PendingEdit } from './types.ts';

type MysqlConn = {
  query(sql: string, params?: unknown[]): Promise<[Record<string, unknown>[], Array<{ name: string }>]>;
  beginTransaction(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  end(): Promise<void>;
};

export function createMysqlAdapter(kind: 'mysql' | 'mariadb' = 'mysql'): DbAdapter {
  let conn: MysqlConn | undefined;

  async function ensure(config: Record<string, unknown>): Promise<MysqlConn> {
    const mysql = (await import('mysql2/promise')) as {
      createConnection(opts: Record<string, unknown>): Promise<MysqlConn>;
    };
    const built = buildMysqlOptions({
      ...config,
      host: String(config.host ?? (config.contactPoints as string[] | undefined)?.[0] ?? '127.0.0.1'),
      port: Number(config.port ?? 3306),
      username: config.username ? String(config.username) : undefined,
      password: config.password ? String(config.password) : undefined,
      database: config.database
        ? String(config.database)
        : config.keyspace
          ? String(config.keyspace)
          : undefined,
      advanced: config.advanced as { connectTimeoutMs?: number } | undefined,
      engineOptions: config.engineOptions as Record<string, unknown> | undefined,
      driverProperties: config.driverProperties as Array<{ key: string; value: string }> | undefined,
      tls: config.tls as Record<string, unknown> | undefined,
      tlsEnabled: config.tlsEnabled as boolean | undefined,
      tlsRejectUnauthorized: config.tlsRejectUnauthorized as boolean | undefined,
    });
    if (built.unsupportedAuth) {
      throw new Error(
        `MySQL/MariaDB auth "${built.unsupportedAuth}" is not supported by mysql2 (no Kerberos plugin).`,
      );
    }
    const c = await mysql.createConnection({
      host: built.socketPath ? undefined : built.host,
      port: built.socketPath ? undefined : built.port,
      socketPath: built.socketPath,
      user: built.user,
      password: built.password,
      database: built.database,
      charset: built.charset,
      timezone: built.timezone,
      multipleStatements: built.multipleStatements,
      allowPublicKeyRetrieval: built.allowPublicKeyRetrieval,
      connectTimeout: built.connectTimeout,
      ssl: built.ssl,
    });
    conn = c;
    return c;
  }

  return {
    async connect(config) {
      if (conn) await this.close();
      await ensure(config);
    },
    async testConnection(config) {
      const started = Date.now();
      try {
        const c = await ensure(config);
        await c.query('SELECT 1');
        return { ok: true as const, latencyMs: Date.now() - started };
      } catch (e) {
        await this.close();
        return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
      }
    },
    async listObjects(path?: ObjectPath): Promise<ObjectNode[]> {
      if (!conn) throw new Error('Not connected');
      if (!path || path.kind === 'root') {
        const [rows] = await conn.query('SHOW DATABASES');
        return (rows as Array<Record<string, unknown>>).map((r) => {
          const name = String(Object.values(r)[0]);
          return { id: `db:${name}`, label: name, kind: 'database', meta: { database: name } };
        });
      }
      if (path.kind === 'database' && path.database) {
        const [rows] = await conn.query(
          `SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = ? ORDER BY 1`,
          [path.database],
        );
        return mapTables(
          (rows as Array<Record<string, unknown>>).map((r) => ({
            name: String(r.TABLE_NAME ?? r.table_name),
            kind: String(r.TABLE_TYPE ?? r.table_type).includes('VIEW') ? 'view' : 'table',
          })),
          path.database,
          path.database,
        ).map((n) => ({ ...n, meta: { ...n.meta, schema: path.database } }));
      }
      if ((path.kind === 'schema' || path.kind === 'table') && path.schema) {
        const db = path.database ?? path.schema;
        if (path.kind === 'schema') {
          return this.listObjects({ kind: 'database', database: db });
        }
      }
      return [];
    },
    async describe(ref: ObjectPath): Promise<DescribeResult> {
      if (!conn) throw new Error('Not connected');
      const db = String(ref.database ?? ref.schema ?? '');
      const name = String(ref.name ?? '');
      if (!db || !name) return { meta: { ref } };
      const [cols] = await conn.query(
        `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE FROM information_schema.columns
         WHERE table_schema = ? AND table_name = ? ORDER BY ORDINAL_POSITION`,
        [db, name],
      );
      const columns = (cols as Array<Record<string, unknown>>).map((r) => ({
        name: String(r.COLUMN_NAME ?? r.column_name),
        type: String(r.DATA_TYPE ?? r.data_type),
        nullable: String(r.IS_NULLABLE ?? r.is_nullable) === 'YES',
      }));
      const [fks] = await conn.query(
        `SELECT COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
         FROM information_schema.key_column_usage
         WHERE table_schema = ? AND table_name = ? AND REFERENCED_TABLE_NAME IS NOT NULL`,
        [db, name],
      );
      return {
        ddl: `CREATE TABLE ${quoteBacktick(db)}.${quoteBacktick(name)} (\n${columns
          .map((c) => `  ${quoteBacktick(c.name)} ${c.type}${c.nullable ? '' : ' NOT NULL'}`)
          .join(',\n')}\n);`,
        columns,
        foreignKeys: (fks as Array<Record<string, unknown>>).map((r) => ({
          from: String(r.COLUMN_NAME ?? r.column_name),
          toTable: String(r.REFERENCED_TABLE_NAME ?? r.referenced_table_name),
          toColumn: String(r.REFERENCED_COLUMN_NAME ?? r.referenced_column_name),
        })),
      };
    },
    async execute(statement, params, options: ExecuteOptions) {
      if (!conn) throw new Error('Not connected');
      const started = Date.now();
      const pageSize = options.pageSize ?? 500;
      const offset = parsePageToken(options.pageToken);
      let sql = statement;
      if (/^\s*SELECT\b/i.test(statement) && !/\bLIMIT\b/i.test(statement)) {
        sql = `${statement.replace(/;\s*$/, '')} LIMIT ${pageSize} OFFSET ${offset}`;
      }
      const [rows, fields] = await conn.query(sql, params ?? []);
      const list = Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
      const columns =
        fields?.map((f) => f.name) ?? (list[0] ? Object.keys(list[0]) : []);
      const data = list.map((row) => columns.map((c) => row[c]));
      return rowsToResult(columns, data, started, {
        pageToken: nextPageToken(offset, pageSize, data.length),
        messages: [`${kind}: ${data.length} row(s)`],
      });
    },
    async explain(statement: string): Promise<ExplainResult> {
      if (!conn) throw new Error('Not connected');
      const [rows] = await conn.query(`EXPLAIN FORMAT=JSON ${statement.replace(/;\s*$/, '')}`);
      return { format: 'tree', plan: rows, raw: JSON.stringify(rows, null, 2) };
    },
    async beginTransaction() {
      if (!conn) throw new Error('Not connected');
      await conn.beginTransaction();
    },
    async commit() {
      if (!conn) throw new Error('Not connected');
      await conn.commit();
    },
    async rollback() {
      if (!conn) throw new Error('Not connected');
      await conn.rollback();
    },
    async applyEdits(edits: PendingEdit[]) {
      if (!conn) throw new Error('Not connected');
      const statements = editsToSql(edits, quoteBacktick);
      for (const s of statements) await conn.query(s);
      return { applied: statements.length, statements };
    },
    async setKeyspace(keyspace: string | null) {
      if (!conn) throw new Error('Not connected');
      if (keyspace == null || keyspace.trim() === '') return;
      const name = keyspace.trim().replace(/`/g, '``');
      await conn.query(`USE \`${name}\``);
    },
    async close() {
      const c = conn;
      conn = undefined;
      if (c) {
        try {
          await c.end();
        } catch {
          /* ignore */
        }
      }
    },
  };
}
