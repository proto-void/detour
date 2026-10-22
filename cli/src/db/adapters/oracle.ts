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

type OracleConn = {
  execute(sql: string, binds?: unknown, opts?: Record<string, unknown>): Promise<{
    metaData?: Array<{ name: string }>;
    rows?: unknown[][];
  }>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  close(): Promise<void>;
};

/** Thin mode — no Instant Client. */
export function createOracleAdapter(): DbAdapter {
  let conn: OracleConn | undefined;
  let oracledb: { getConnection(cfg: Record<string, unknown>): Promise<OracleConn>; OUT_FORMAT_ARRAY: number };

  async function ensure(config: Record<string, unknown>): Promise<OracleConn> {
    oracledb = (await import('oracledb')) as unknown as typeof oracledb;
    const connectString =
      config.connectString
        ? String(config.connectString)
        : `${config.host ?? '127.0.0.1'}:${config.port ?? 1521}/${config.service ?? config.database ?? 'FREEPDB1'}`;
    const c = await oracledb.getConnection({
      user: String(config.username ?? ''),
      password: String(config.password ?? ''),
      connectString,
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
        await c.execute('SELECT 1 FROM DUAL');
        return { ok: true as const, latencyMs: Date.now() - started };
      } catch (e) {
        await this.close();
        return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
      }
    },
    async listObjects(path?: ObjectPath): Promise<ObjectNode[]> {
      if (!conn) throw new Error('Not connected');
      if (!path || path.kind === 'root') {
        const rs = await conn.execute(
          `SELECT username FROM all_users WHERE oracle_maintained = 'N' ORDER BY 1`,
          [],
          { outFormat: oracledb.OUT_FORMAT_ARRAY },
        );
        return mapSchemas((rs.rows ?? []).map((r) => String((r as unknown[])[0])));
      }
      if (path.kind === 'schema' && path.schema) {
        const rs = await conn.execute(
          `SELECT table_name FROM all_tables WHERE owner = :o ORDER BY 1`,
          [path.schema],
          { outFormat: oracledb.OUT_FORMAT_ARRAY },
        );
        return mapTables(
          (rs.rows ?? []).map((r) => ({ name: String((r as unknown[])[0]) })),
          path.schema,
        );
      }
      return [];
    },
    async describe(ref: ObjectPath): Promise<DescribeResult> {
      if (!conn || !ref.schema || !ref.name) return { meta: { ref } };
      const rs = await conn.execute(
        `SELECT column_name, data_type, nullable FROM all_tab_columns WHERE owner = :o AND table_name = :t ORDER BY column_id`,
        [ref.schema, ref.name],
        { outFormat: oracledb.OUT_FORMAT_ARRAY },
      );
      const columns = (rs.rows ?? []).map((r) => {
        const row = r as unknown[];
        return { name: String(row[0]), type: String(row[1]), nullable: row[2] === 'Y' };
      });
      return {
        ddl: `CREATE TABLE ${quoteDouble(ref.schema)}.${quoteDouble(ref.name)} (\n${columns
          .map((c) => `  ${quoteDouble(c.name)} ${c.type}`)
          .join(',\n')}\n);`,
        columns,
      };
    },
    async execute(statement, params, options: ExecuteOptions) {
      if (!conn) throw new Error('Not connected');
      const started = Date.now();
      const pageSize = options.pageSize ?? 500;
      const offset = parsePageToken(options.pageToken);
      let sql = statement;
      if (/^\s*SELECT\b/i.test(statement) && !/\bOFFSET\b/i.test(statement) && !/\bFETCH\b/i.test(statement)) {
        sql = `${statement.replace(/;\s*$/, '')} OFFSET ${offset} ROWS FETCH NEXT ${pageSize} ROWS ONLY`;
      }
      const rs = await conn.execute(sql, params ?? [], { outFormat: oracledb.OUT_FORMAT_ARRAY });
      const columns = rs.metaData?.map((m) => m.name) ?? [];
      const rows = (rs.rows as unknown[][] | undefined) ?? [];
      return rowsToResult(columns, rows, started, {
        pageToken: nextPageToken(offset, pageSize, rows.length),
      });
    },
    async explain(statement: string): Promise<ExplainResult> {
      if (!conn) throw new Error('Not connected');
      await conn.execute(`EXPLAIN PLAN FOR ${statement.replace(/;\s*$/, '')}`);
      const rs = await conn.execute(
        `SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY())`,
        [],
        { outFormat: oracledb.OUT_FORMAT_ARRAY },
      );
      const raw = (rs.rows ?? []).map((r) => (r as unknown[]).join(' ')).join('\n');
      return { format: 'text', plan: rs.rows, raw };
    },
    async beginTransaction() {
      /* Oracle auto-starts; no-op */
    },
    async commit() {
      await conn?.commit();
    },
    async rollback() {
      await conn?.rollback();
    },
    async applyEdits(edits: PendingEdit[]) {
      if (!conn) throw new Error('Not connected');
      const statements = editsToSql(edits, quoteDouble);
      for (const s of statements) await conn.execute(s);
      await conn.commit();
      return { applied: statements.length, statements };
    },
    async close() {
      const c = conn;
      conn = undefined;
      if (c) {
        try {
          await c.close();
        } catch {
          /* ignore */
        }
      }
    },
  };
}
