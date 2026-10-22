import { nextPageToken, parsePageToken, rowsToResult } from './sql-common.ts';
import type { DbAdapter, DescribeResult, ExecuteOptions, ObjectNode, ObjectPath } from './types.ts';

type ChClient = {
  query(opts: { query: string; format: string }): Promise<{ json(): Promise<unknown> }>;
  close(): Promise<void>;
};

export function createClickHouseAdapter(): DbAdapter {
  let client: ChClient | undefined;

  async function ensure(config: Record<string, unknown>): Promise<ChClient> {
    const { createClient } = (await import('@clickhouse/client')) as {
      createClient(opts: Record<string, unknown>): ChClient;
    };
    const c = createClient({
      host: `http://${config.host ?? '127.0.0.1'}:${config.port ?? 8123}`,
      username: String(config.username ?? 'default'),
      password: String(config.password ?? ''),
      database: String(config.database ?? config.keyspace ?? 'default'),
    });
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
        await c.query({ query: 'SELECT 1', format: 'JSONEachRow' });
        return { ok: true as const, latencyMs: Date.now() - started };
      } catch (e) {
        await this.close();
        return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
      }
    },
    async listObjects(path?: ObjectPath): Promise<ObjectNode[]> {
      if (!client) throw new Error('Not connected');
      if (!path || path.kind === 'root') {
        const rs = await client.query({ query: 'SHOW DATABASES', format: 'JSONEachRow' });
        const rows = (await rs.json()) as Array<{ name: string }>;
        return rows.map((r) => ({
          id: `db:${r.name}`,
          label: r.name,
          kind: 'database',
          meta: { database: r.name },
        }));
      }
      if (path.kind === 'database' && path.database) {
        const rs = await client.query({
          query: `SHOW TABLES FROM ${path.database}`,
          format: 'JSONEachRow',
        });
        const rows = (await rs.json()) as Array<{ name: string }>;
        return rows.map((r) => ({
          id: `table:${path.database}.${r.name}`,
          label: r.name,
          kind: 'table',
          meta: { database: path.database, name: r.name },
        }));
      }
      return [];
    },
    async describe(ref: ObjectPath): Promise<DescribeResult> {
      if (!client || !ref.database || !ref.name) return { meta: { ref } };
      const rs = await client.query({
        query: `DESCRIBE TABLE ${ref.database}.${ref.name}`,
        format: 'JSONEachRow',
      });
      const rows = (await rs.json()) as Array<{ name: string; type: string }>;
      return {
        columns: rows.map((r) => ({ name: r.name, type: r.type })),
        ddl: `DESCRIBE ${ref.database}.${ref.name}`,
      };
    },
    async execute(statement, _params, options: ExecuteOptions) {
      if (!client) throw new Error('Not connected');
      const started = Date.now();
      const pageSize = options.pageSize ?? 500;
      const offset = parsePageToken(options.pageToken);
      let sql = statement;
      if (/^\s*SELECT\b/i.test(statement) && !/\bLIMIT\b/i.test(statement)) {
        sql = `${statement.replace(/;\s*$/, '')} LIMIT ${pageSize} OFFSET ${offset}`;
      }
      const rs = await client.query({ query: sql, format: 'JSONEachRow' });
      const list = (await rs.json()) as Record<string, unknown>[];
      const columns = list[0] ? Object.keys(list[0]) : [];
      const rows = list.map((row) => columns.map((c) => row[c]));
      return rowsToResult(columns, rows, started, {
        pageToken: nextPageToken(offset, pageSize, rows.length),
      });
    },
    async close() {
      const c = client;
      client = undefined;
      if (c) await c.close();
    },
  };
}
