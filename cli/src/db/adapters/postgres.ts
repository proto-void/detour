import { buildPostgresOptions } from './postgres-config.ts';
import {
  editsToSql,
  mapSchemas,
  mapTables,
  nextPageToken,
  parsePageToken,
  quoteDouble,
  rowsToResult,
} from './sql-common.ts';
import type { DbAdapter, DescribeResult, ExecuteOptions, ExplainResult, ObjectNode, ObjectPath, PendingEdit } from './types.ts';

type PgClient = {
  connect(): Promise<void>;
  end(): Promise<void>;
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[]; fields: Array<{ name: string }> }>;
};

export function createPostgresAdapter(): DbAdapter {
  let client: PgClient | undefined;
  let inTx = false;

  async function loadPg(): Promise<{ Client: new (cfg: Record<string, unknown>) => PgClient }> {
    return (await import('pg')) as unknown as { Client: new (cfg: Record<string, unknown>) => PgClient };
  }

  async function ensure(config: Record<string, unknown>): Promise<PgClient> {
    const { Client } = await loadPg();
    const contacts = config.contactPoints as string[] | undefined;
    const built = buildPostgresOptions({
      ...config,
      host: String(config.host ?? contacts?.[0] ?? '127.0.0.1'),
      port: Number(config.port ?? 5432),
      username: config.username ? String(config.username) : undefined,
      password: config.password ? String(config.password) : undefined,
      database: config.database
        ? String(config.database)
        : config.keyspace
          ? String(config.keyspace)
          : 'postgres',
      advanced: config.advanced as { connectTimeoutMs?: number } | undefined,
      engineOptions: config.engineOptions as Record<string, unknown> | undefined,
      driverProperties: config.driverProperties as Array<{ key: string; value: string }> | undefined,
      tls: config.tls as Record<string, unknown> | undefined,
      tlsEnabled: config.tlsEnabled as boolean | undefined,
      tlsRejectUnauthorized: config.tlsRejectUnauthorized as boolean | undefined,
    });
    if (built.unsupportedAuth) {
      throw new Error(
        `PostgreSQL auth "${built.unsupportedAuth}" is not supported by node-postgres (no GSSAPI). Use password, .pgpass, or AWS IAM.`,
      );
    }
    const c = new Client({
      host: built.host,
      port: built.port,
      user: built.user,
      password: built.password,
      database: built.database,
      application_name: built.application_name,
      connectionTimeoutMillis: built.connectionTimeoutMillis,
      options: built.options,
      ssl: built.ssl,
    });
    await c.connect();
    client = c;
    return c;
  }

  return {
    async connect(config) {
      if (client) await this.close();
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
      if (!client) throw new Error('Not connected');
      if (!path || path.kind === 'root') {
        const rs = await client.query(
          `SELECT schema_name FROM information_schema.schemata
           WHERE schema_name NOT IN ('pg_catalog','information_schema','pg_toast')
           ORDER BY 1`,
        );
        return mapSchemas(rs.rows.map((r) => String(r.schema_name)));
      }
      if (path.kind === 'schema' && path.schema) {
        const rs = await client.query(
          `SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = $1 ORDER BY 1`,
          [path.schema],
        );
        return mapTables(
          rs.rows.map((r) => ({
            name: String(r.table_name),
            kind: String(r.table_type).includes('VIEW') ? 'view' : 'table',
          })),
          path.schema,
        );
      }
      if (path.kind === 'table' && path.schema && path.name) {
        const idx = await client.query(
          `SELECT indexname FROM pg_indexes WHERE schemaname = $1 AND tablename = $2`,
          [path.schema, path.name],
        );
        return idx.rows.map((r) => ({
          id: `index:${path.schema}.${path.name}.${r.indexname}`,
          label: String(r.indexname),
          kind: 'index',
        }));
      }
      return [];
    },
    async describe(ref: ObjectPath): Promise<DescribeResult> {
      if (!client) throw new Error('Not connected');
      if (ref.kind !== 'table' || !ref.schema || !ref.name) return { meta: { ref } };
      const cols = await client.query(
        `SELECT column_name, data_type, is_nullable, column_default
         FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position`,
        [ref.schema, ref.name],
      );
      const fks = await client.query(
        `SELECT kcu.column_name, ccu.table_name AS foreign_table, ccu.column_name AS foreign_column
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
         JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
         WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = $1 AND tc.table_name = $2`,
        [ref.schema, ref.name],
      );
      const columns = cols.rows.map((r) => ({
        name: String(r.column_name),
        type: String(r.data_type),
        nullable: r.is_nullable === 'YES',
      }));
      const ddl = `CREATE TABLE ${quoteDouble(ref.schema)}.${quoteDouble(ref.name)} (\n${columns
        .map((c) => `  ${quoteDouble(c.name)} ${c.type}${c.nullable ? '' : ' NOT NULL'}`)
        .join(',\n')}\n);`;
      return {
        ddl,
        columns,
        foreignKeys: fks.rows.map((r) => ({
          from: String(r.column_name),
          toTable: String(r.foreign_table),
          toColumn: String(r.foreign_column),
        })),
      };
    },
    async execute(statement, params, options: ExecuteOptions) {
      if (!client) throw new Error('Not connected');
      const started = Date.now();
      const pageSize = options.pageSize ?? 500;
      const offset = parsePageToken(options.pageToken);
      let sql = statement;
      if (/^\s*SELECT\b/i.test(statement) && !/\bLIMIT\b/i.test(statement)) {
        sql = `${statement.replace(/;\s*$/, '')} LIMIT ${pageSize} OFFSET ${offset}`;
      }
      const rs = await client.query(sql, params ?? []);
      const columns = rs.fields?.map((f) => f.name) ?? (rs.rows[0] ? Object.keys(rs.rows[0]) : []);
      const rows = rs.rows.map((row) => columns.map((c) => row[c]));
      return rowsToResult(columns, rows, started, {
        pageToken: nextPageToken(offset, pageSize, rows.length),
      });
    },
    async explain(statement: string): Promise<ExplainResult> {
      if (!client) throw new Error('Not connected');
      const rs = await client.query(`EXPLAIN (FORMAT JSON) ${statement.replace(/;\s*$/, '')}`);
      const plan = rs.rows[0]?.['QUERY PLAN'] ?? rs.rows;
      return { format: 'tree', plan, raw: JSON.stringify(plan, null, 2) };
    },
    async beginTransaction() {
      if (!client) throw new Error('Not connected');
      await client.query('BEGIN');
      inTx = true;
    },
    async commit() {
      if (!client) throw new Error('Not connected');
      await client.query('COMMIT');
      inTx = false;
    },
    async rollback() {
      if (!client) throw new Error('Not connected');
      await client.query('ROLLBACK');
      inTx = false;
    },
    async applyEdits(edits: PendingEdit[]) {
      if (!client) throw new Error('Not connected');
      const statements = editsToSql(edits, quoteDouble);
      for (const s of statements) await client.query(s);
      return { applied: statements.length, statements };
    },
    async setKeyspace(keyspace: string | null) {
      if (!client) throw new Error('Not connected');
      if (keyspace == null || keyspace.trim() === '') {
        await client.query('RESET search_path');
        return;
      }
      const name = keyspace.trim().replace(/"/g, '""');
      await client.query(`SET search_path TO "${name}"`);
    },
    async close() {
      const c = client;
      client = undefined;
      inTx = false;
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
