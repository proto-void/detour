import {
  editsToSql,
  mapSchemas,
  mapTables,
  nextPageToken,
  parsePageToken,
  quoteBracket,
  rowsToResult,
} from './sql-common.ts';
import type { DbAdapter, DescribeResult, ExecuteOptions, ExplainResult, ObjectNode, ObjectPath, PendingEdit } from './types.ts';

type TediousConnection = {
  connect(cb: (err?: Error) => void): void;
  close(): void;
  execSql(request: unknown): void;
  beginTransaction(cb: (err?: Error) => void): void;
  commitTransaction(cb: (err?: Error) => void): void;
  rollbackTransaction(cb: (err?: Error) => void): void;
};

export function createMssqlAdapter(): DbAdapter {
  let connection: TediousConnection | undefined;
  let RequestCtor: new (sql: string, cb: (err: Error | null, rowCount?: number) => void) => {
    on(event: string, cb: (...args: unknown[]) => void): void;
    addParameter?(name: string, type: unknown, value: unknown): void;
  };
  let TYPES: Record<string, unknown>;

  async function load(): Promise<void> {
    const tedious = (await import('tedious')) as unknown as {
      Connection: new (cfg: unknown) => TediousConnection;
      Request: typeof RequestCtor;
      TYPES: Record<string, unknown>;
    };
    RequestCtor = tedious.Request;
    TYPES = tedious.TYPES;
    (load as unknown as { Connection: typeof tedious.Connection }).Connection = tedious.Connection;
  }

  function query(sql: string): Promise<{ columns: string[]; rows: unknown[][] }> {
    return new Promise((resolve, reject) => {
      if (!connection) return reject(new Error('Not connected'));
      const columns: string[] = [];
      const rows: unknown[][] = [];
      const request = new RequestCtor(sql, (err) => {
        if (err) reject(err);
        else resolve({ columns, rows });
      });
      request.on('columnMetadata', (columnsMeta: unknown) => {
        const meta = columnsMeta as Array<{ colName: string }>;
        for (const c of meta) columns.push(c.colName);
      });
      request.on('row', (columnsData: unknown) => {
        const cols = columnsData as Array<{ value: unknown }>;
        rows.push(cols.map((c) => c.value));
      });
      connection.execSql(request);
    });
  }

  async function ensure(config: Record<string, unknown>): Promise<void> {
    await load();
    const Connection = (load as unknown as { Connection: new (cfg: unknown) => TediousConnection }).Connection;
    const cfg = {
      server: String(config.host ?? (config.contactPoints as string[] | undefined)?.[0] ?? '127.0.0.1'),
      options: {
        port: Number(config.port ?? 1433),
        database: String(config.database ?? config.keyspace ?? 'master'),
        encrypt: Boolean(config.tlsEnabled ?? true),
        trustServerCertificate: config.tlsRejectUnauthorized === false,
        rowCollectionOnRequestCompletion: true,
      },
      authentication: {
        type: 'default',
        options: {
          userName: String(config.username ?? 'sa'),
          password: String(config.password ?? ''),
        },
      },
    };
    await new Promise<void>((resolve, reject) => {
      const c = new Connection(cfg);
      c.connect((err) => {
        if (err) reject(err);
        else {
          connection = c;
          resolve();
        }
      });
    });
  }

  return {
    async connect(config) {
      if (connection) await this.close();
      await ensure(config);
    },
    async testConnection(config) {
      const started = Date.now();
      try {
        await ensure(config);
        await query('SELECT 1 AS ok');
        return { ok: true as const, latencyMs: Date.now() - started };
      } catch (e) {
        await this.close();
        return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
      }
    },
    async listObjects(path?: ObjectPath): Promise<ObjectNode[]> {
      if (!path || path.kind === 'root') {
        const rs = await query(
          `SELECT name FROM sys.schemas WHERE name NOT IN ('sys','INFORMATION_SCHEMA','guest') ORDER BY 1`,
        );
        return mapSchemas(rs.rows.map((r) => String(r[0])));
      }
      if (path.kind === 'schema' && path.schema) {
        const rs = await query(
          `SELECT t.name, CASE WHEN t.type = 'V' THEN 'view' ELSE 'table' END
           FROM sys.tables t JOIN sys.schemas s ON t.schema_id = s.schema_id WHERE s.name = N'${path.schema.replace(/'/g, "''")}'
           UNION ALL
           SELECT v.name, 'view' FROM sys.views v JOIN sys.schemas s ON v.schema_id = s.schema_id WHERE s.name = N'${path.schema.replace(/'/g, "''")}'
           ORDER BY 1`,
        );
        return mapTables(
          rs.rows.map((r) => ({ name: String(r[0]), kind: String(r[1]) })),
          path.schema,
        );
      }
      return [];
    },
    async describe(ref: ObjectPath): Promise<DescribeResult> {
      if (ref.kind !== 'table' || !ref.schema || !ref.name) return { meta: { ref } };
      const rs = await query(
        `SELECT c.name, ty.name, c.is_nullable
         FROM sys.columns c
         JOIN sys.types ty ON c.user_type_id = ty.user_type_id
         JOIN sys.tables t ON c.object_id = t.object_id
         JOIN sys.schemas s ON t.schema_id = s.schema_id
         WHERE s.name = N'${ref.schema.replace(/'/g, "''")}' AND t.name = N'${ref.name.replace(/'/g, "''")}'
         ORDER BY c.column_id`,
      );
      const columns = rs.rows.map((r) => ({
        name: String(r[0]),
        type: String(r[1]),
        nullable: Boolean(r[2]),
      }));
      return {
        ddl: `CREATE TABLE ${quoteBracket(ref.schema)}.${quoteBracket(ref.name)} (\n${columns
          .map((c) => `  ${quoteBracket(c.name)} ${c.type}${c.nullable ? '' : ' NOT NULL'}`)
          .join(',\n')}\n);`,
        columns,
      };
    },
    async execute(statement, _params, options: ExecuteOptions) {
      const started = Date.now();
      const pageSize = options.pageSize ?? 500;
      const offset = parsePageToken(options.pageToken);
      let sql = statement;
      if (/^\s*SELECT\b/i.test(statement) && !/\bOFFSET\b/i.test(statement) && !/\bTOP\b/i.test(statement)) {
        sql = `${statement.replace(/;\s*$/, '')} OFFSET ${offset} ROWS FETCH NEXT ${pageSize} ROWS ONLY`;
      }
      const rs = await query(sql);
      return rowsToResult(rs.columns, rs.rows, started, {
        pageToken: nextPageToken(offset, pageSize, rs.rows.length),
      });
    },
    async explain(statement: string): Promise<ExplainResult> {
      await query('SET SHOWPLAN_TEXT ON');
      try {
        const rs = await query(statement.replace(/;\s*$/, ''));
        const raw = rs.rows.map((r) => r.join(' ')).join('\n');
        return { format: 'text', plan: rs.rows, raw };
      } finally {
        try {
          await query('SET SHOWPLAN_TEXT OFF');
        } catch {
          /* ignore */
        }
      }
    },
    async beginTransaction() {
      await new Promise<void>((resolve, reject) => {
        connection?.beginTransaction((err) => (err ? reject(err) : resolve()));
      });
    },
    async commit() {
      await new Promise<void>((resolve, reject) => {
        connection?.commitTransaction((err) => (err ? reject(err) : resolve()));
      });
    },
    async rollback() {
      await new Promise<void>((resolve, reject) => {
        connection?.rollbackTransaction((err) => (err ? reject(err) : resolve()));
      });
    },
    async applyEdits(edits: PendingEdit[]) {
      const statements = editsToSql(edits, quoteBracket);
      for (const s of statements) await query(s);
      return { applied: statements.length, statements };
    },
    async close() {
      const c = connection;
      connection = undefined;
      c?.close();
    },
  };
}
