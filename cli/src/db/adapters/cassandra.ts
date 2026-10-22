import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildCassandraOptions,
  type CassandraConnectionInput,
  type BuiltCassandraOptions,
} from './cassandra-config.ts';
import type { DbAdapter, DescribeResult, ExecuteOptions, ExecuteResult, ObjectNode, ObjectPath } from './types.ts';

const STARFIELD_CA = join(dirname(fileURLToPath(import.meta.url)), '..', 'certs', 'starfield-keyspaces.pem');

type ClientLike = {
  connect(): Promise<void>;
  shutdown(): Promise<void>;
  execute(
    query: string,
    params?: unknown[],
    options?: Record<string, unknown>,
  ): Promise<{
    rows: Array<Record<string, unknown>>;
    columns?: Array<{ name: string }>;
    pageState?: string | null;
    info?: { warnings?: string[]; traced?: unknown; trace?: unknown };
  }>;
};

type DriverModule = {
  Client: new (opts: Record<string, unknown>) => ClientLike;
  auth?: { PlainTextAuthProvider: new (u: string, p: string) => unknown };
  types?: { consistencies?: Record<string, number> };
};

async function loadDriver(): Promise<DriverModule> {
  try {
    return (await import('cassandra-driver')) as unknown as DriverModule;
  } catch {
    throw new Error(
      'cassandra-driver is not installed. From the repo root run: corepack pnpm --filter @detour/cli add cassandra-driver',
    );
  }
}

function toDriverOptions(built: BuiltCassandraOptions, driver: DriverModule): Record<string, unknown> {
  const opts: Record<string, unknown> = {};
  if (built.cloud) {
    opts.cloud = built.cloud;
    if (built.astraToken) {
      opts.credentials = { username: 'token', password: built.astraToken };
    } else if (built.credentials) {
      opts.credentials = built.credentials;
    }
  } else {
    opts.contactPoints = built.contactPoints;
    opts.localDataCenter = built.localDataCenter;
    if (built.protocolOptions) opts.protocolOptions = built.protocolOptions;
    if (built.credentials) {
      if (driver.auth?.PlainTextAuthProvider) {
        opts.authProvider = new driver.auth.PlainTextAuthProvider(
          built.credentials.username,
          built.credentials.password,
        );
      } else {
        opts.credentials = built.credentials;
      }
    }
  }
  if (built.keyspace) opts.keyspace = built.keyspace;

  if (built.keyspacesTls) {
    let ca: string | undefined;
    try {
      ca = readFileSync(STARFIELD_CA, 'utf8');
    } catch {
      ca = built.sslOptions?.ca?.[0];
    }
    opts.sslOptions = {
      rejectUnauthorized: true,
      ...(ca ? { ca: [ca] } : {}),
    };
    opts.protocolOptions = { port: built.keyspacesTls.port };
  } else if (built.sslOptions) {
    opts.sslOptions = built.sslOptions;
  }

  if (built.keyspacesSigV4) {
    opts._detourKeyspacesSigV4 = built.keyspacesSigV4;
  }

  return opts;
}

function consistencyValue(driver: DriverModule, name: string | undefined): number | undefined {
  if (!name || !driver.types?.consistencies) return undefined;
  const key = name.toUpperCase().replace(/-/g, '_');
  return driver.types.consistencies[key] ?? driver.types.consistencies[name];
}

export function createCassandraAdapter(): DbAdapter {
  let client: ClientLike | undefined;
  let driver: DriverModule | undefined;
  const inflight = new Map<string, AbortController>();

  async function ensureClient(config: CassandraConnectionInput): Promise<ClientLike> {
    driver = await loadDriver();
    const built = buildCassandraOptions(config);
    if (built.keyspacesSigV4) {
      // SigV4 wiring is configuration-tested; live plugin load is optional when the package is present.
      try {
        // Optional peer dependency — configuration-tested without requiring install.
        const mod = (await import(
          /* webpackIgnore: true */ 'aws-sigv4-auth-cassandra-plugin' as string
        )) as {
          SigV4AuthProvider?: new (opts: { region: string }) => unknown;
        };
        const opts = toDriverOptions(built, driver);
        if (mod.SigV4AuthProvider) {
          opts.authProvider = new mod.SigV4AuthProvider({ region: built.keyspacesSigV4.region });
          delete opts._detourKeyspacesSigV4;
        }
        client = new driver.Client(opts);
      } catch {
        const opts = toDriverOptions(built, driver);
        client = new driver.Client(opts);
      }
    } else {
      client = new driver.Client(toDriverOptions(built, driver));
    }
    await client.connect();
    return client;
  }

  return {
    async connect(config) {
      if (client) await this.close();
      await ensureClient(config as CassandraConnectionInput);
    },

    async testConnection(config) {
      const started = Date.now();
      try {
        const c = await ensureClient(config as CassandraConnectionInput);
        await c.execute('SELECT release_version FROM system.local');
        return { ok: true as const, latencyMs: Date.now() - started };
      } catch (e) {
        await this.close();
        return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
      }
    },

    async listObjects(path?: ObjectPath): Promise<ObjectNode[]> {
      if (!client) throw new Error('Not connected');
      if (!path || path.kind === 'root') {
        const rs = await client.execute(
          'SELECT keyspace_name, replication FROM system_schema.keyspaces',
        );
        return rs.rows.map((row) => ({
          id: `ks:${row.keyspace_name}`,
          label: String(row.keyspace_name),
          kind: 'keyspace',
          meta: { replication: row.replication },
        }));
      }
      if (path.kind === 'keyspace' && path.keyspace) {
        const ks = path.keyspace;
        const tables = await client.execute(
          'SELECT table_name FROM system_schema.tables WHERE keyspace_name = ?',
          [ks],
          { prepare: true },
        );
        const mvs = await client.execute(
          'SELECT view_name FROM system_schema.views WHERE keyspace_name = ?',
          [ks],
          { prepare: true },
        );
        const udts = await client.execute(
          'SELECT type_name FROM system_schema.types WHERE keyspace_name = ?',
          [ks],
          { prepare: true },
        );
        const nodes: ObjectNode[] = [
          ...tables.rows.map((r) => ({
            id: `table:${ks}.${r.table_name}`,
            label: String(r.table_name),
            kind: 'table',
            meta: { keyspace: ks },
          })),
          ...mvs.rows.map((r) => ({
            id: `mv:${ks}.${r.view_name}`,
            label: String(r.view_name),
            kind: 'materialized_view',
            meta: { keyspace: ks },
          })),
          ...udts.rows.map((r) => ({
            id: `udt:${ks}.${r.type_name}`,
            label: String(r.type_name),
            kind: 'udt',
            meta: { keyspace: ks },
          })),
        ];
        return nodes;
      }
      if ((path.kind === 'table' || path.kind === 'materialized_view') && path.keyspace && path.name) {
        const indexes = await client.execute(
          'SELECT index_name, kind, options FROM system_schema.indexes WHERE keyspace_name = ? AND table_name = ?',
          [path.keyspace, path.name],
          { prepare: true },
        );
        return indexes.rows.map((r) => ({
          id: `index:${path.keyspace}.${path.name}.${r.index_name}`,
          label: String(r.index_name),
          kind: 'index',
          meta: { kind: r.kind, options: r.options },
        }));
      }
      return [];
    },

    async describe(ref: ObjectPath): Promise<DescribeResult> {
      if (!client) throw new Error('Not connected');
      if (ref.kind === 'table' && ref.keyspace && ref.name) {
        const cols = await client.execute(
          'SELECT column_name, type, kind, position FROM system_schema.columns WHERE keyspace_name = ? AND table_name = ?',
          [ref.keyspace, ref.name],
          { prepare: true },
        );
        const columns = cols.rows
          .map((r) => ({
            name: String(r.column_name),
            type: String(r.type),
            kind: String(r.kind),
            position: Number(r.position ?? 0),
          }))
          .sort((a, b) => a.position - b.position);
        const partition = columns.filter((c) => c.kind === 'partition_key').map((c) => c.name);
        const clustering = columns.filter((c) => c.kind === 'clustering').map((c) => c.name);
        const regular = columns.filter((c) => c.kind === 'regular' || c.kind === 'static');
        const lines = [
          `CREATE TABLE ${ref.keyspace}.${ref.name} (`,
          ...columns.map((c) => `  ${c.name} ${c.type},`),
          `  PRIMARY KEY ((${partition.join(', ')})${clustering.length ? `, ${clustering.join(', ')}` : ''})`,
          ');',
        ];
        return {
          ddl: lines.join('\n'),
          columns: columns.map(({ name, type, kind }) => ({ name, type, kind })),
          meta: { partitionKeys: partition, clusteringKeys: clustering, regular: regular.map((c) => c.name) },
        };
      }
      if (ref.kind === 'keyspace' && ref.keyspace) {
        const ks = await client.execute(
          'SELECT replication FROM system_schema.keyspaces WHERE keyspace_name = ?',
          [ref.keyspace],
          { prepare: true },
        );
        const replication = ks.rows[0]?.replication;
        return {
          ddl: `CREATE KEYSPACE ${ref.keyspace} WITH replication = ${JSON.stringify(replication)};`,
          meta: { replication },
        };
      }
      return { meta: { ref } };
    },

    async execute(statement: string, params: unknown[] | undefined, options: ExecuteOptions): Promise<ExecuteResult> {
      if (!client || !driver) throw new Error('Not connected');
      const warnings: string[] = [];
      const upper = statement.toUpperCase();
      if (upper.includes('ALLOW FILTERING')) warnings.push('ALLOW FILTERING can cause expensive cluster-wide scans.');
      if (/^\s*SELECT\b/i.test(statement) && !/\bWHERE\b/i.test(statement) && !/\bLIMIT\b/i.test(statement)) {
        warnings.push('Unbounded SELECT without WHERE may scan the whole table.');
      }

      const started = Date.now();
      const execOpts: Record<string, unknown> = {
        prepare: false,
        fetchSize: options.pageSize ?? 500,
        ...(options.pageToken ? { pageState: options.pageToken } : {}),
        ...(options.tracing ? { isIdempotent: true, readTimeout: options.timeoutMs ?? 120_000 } : {}),
      };
      const consistency = consistencyValue(driver, options.consistency);
      if (consistency !== undefined) execOpts.consistency = consistency;
      const serial = consistencyValue(driver, options.serialConsistency);
      if (serial !== undefined) execOpts.serialConsistency = serial;
      if (options.timeoutMs) execOpts.readTimeout = options.timeoutMs;

      const rs = await client.execute(statement, params ?? [], execOpts);
      const columns =
        rs.columns?.map((c) => c.name) ??
        (rs.rows[0] ? Object.keys(rs.rows[0]) : []);
      const rows = rs.rows.map((row) => columns.map((name) => row[name]));
      return {
        columns,
        rows,
        pageToken: rs.pageState ?? null,
        rowCount: rows.length,
        timingMs: Date.now() - started,
        warnings,
        tracing: rs.info?.trace ?? rs.info?.traced,
        messages: [`${rows.length} row(s) in ${Date.now() - started} ms`],
      };
    },

    async cancel(requestId: string) {
      inflight.get(requestId)?.abort();
      inflight.delete(requestId);
    },

    async close() {
      const c = client;
      client = undefined;
      if (c) {
        try {
          await c.shutdown();
        } catch {
          /* ignore */
        }
      }
    },
  };
}

export { STARFIELD_CA };
