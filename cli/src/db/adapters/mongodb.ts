import { rowsToResult } from './sql-common.ts';
import type { DbAdapter, DescribeResult, ExecuteOptions, ObjectNode, ObjectPath } from './types.ts';

type MongoClientLike = {
  connect(): Promise<MongoClientLike>;
  db(name?: string): {
    admin(): { listDatabases(): Promise<{ databases: Array<{ name: string }> }> };
    listCollections(): { toArray(): Promise<Array<{ name: string; type?: string }>> };
    collection(name: string): {
      find(filter: object, opts?: object): { toArray(): Promise<unknown[]>; skip(n: number): { limit(n: number): { toArray(): Promise<unknown[]> } } };
      indexes(): Promise<unknown[]>;
      aggregate(pipeline: object[]): { toArray(): Promise<unknown[]> };
    };
  };
  close(): Promise<void>;
};

export function createMongoAdapter(): DbAdapter {
  let client: MongoClientLike | undefined;
  let defaultDb = 'test';

  async function ensure(config: Record<string, unknown>): Promise<MongoClientLike> {
    const { MongoClient } = (await import('mongodb')) as { MongoClient: new (uri: string) => MongoClientLike };
    const uri =
      config.uri
        ? String(config.uri)
        : `mongodb://${config.username ? `${config.username}:${config.password}@` : ''}${config.host ?? '127.0.0.1'}:${config.port ?? 27017}/${config.database ?? ''}`;
    defaultDb = String(config.database ?? config.keyspace ?? 'test');
    const c = new MongoClient(uri);
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
        await c.db().admin().listDatabases();
        return { ok: true as const, latencyMs: Date.now() - started };
      } catch (e) {
        await this.close();
        return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
      }
    },
    async listObjects(path?: ObjectPath): Promise<ObjectNode[]> {
      if (!client) throw new Error('Not connected');
      if (!path || path.kind === 'root') {
        const { databases } = await client.db().admin().listDatabases();
        return databases.map((d) => ({
          id: `db:${d.name}`,
          label: d.name,
          kind: 'database',
          meta: { database: d.name },
        }));
      }
      if (path.kind === 'database' && path.database) {
        const cols = await client.db(path.database).listCollections().toArray();
        return cols.map((c) => ({
          id: `collection:${path.database}.${c.name}`,
          label: c.name,
          kind: 'collection',
          meta: { database: path.database, name: c.name },
        }));
      }
      if (path.kind === 'collection' && path.database && path.name) {
        const indexes = await client.db(path.database).collection(path.name).indexes();
        return (indexes as Array<{ name?: string }>).map((ix, i) => ({
          id: `index:${path.database}.${path.name}.${ix.name ?? i}`,
          label: String(ix.name ?? i),
          kind: 'index',
        }));
      }
      return [];
    },
    async describe(ref: ObjectPath): Promise<DescribeResult> {
      if (!client || !ref.database || !ref.name) return { meta: { ref } };
      const sample = await client.db(ref.database).collection(ref.name).find({}, { limit: 1 }).toArray();
      const doc = sample[0] as Record<string, unknown> | undefined;
      const columns = doc
        ? Object.entries(doc).map(([name, v]) => ({ name, type: v === null ? 'null' : typeof v }))
        : [];
      return { columns, meta: { sample: doc } };
    },
    async execute(statement, _params, options: ExecuteOptions) {
      if (!client) throw new Error('Not connected');
      const started = Date.now();
      const pageSize = options.pageSize ?? 500;
      const trimmed = statement.trim();
      // JSON command: { "db":"x", "collection":"y", "find":{...} } or aggregation { aggregate:[...] }
      if (trimmed.startsWith('{')) {
        const cmd = JSON.parse(trimmed) as {
          db?: string;
          collection?: string;
          find?: object;
          aggregate?: object[];
        };
        const dbName = cmd.db ?? defaultDb;
        const col = cmd.collection ?? 'test';
        if (cmd.aggregate) {
          const docs = await client.db(dbName).collection(col).aggregate(cmd.aggregate).toArray();
          return docsToResult(docs, started);
        }
        const filter = cmd.find ?? {};
        const docs = await client
          .db(dbName)
          .collection(col)
          .find(filter)
          .skip(0)
          .limit(pageSize)
          .toArray();
        return docsToResult(docs, started);
      }
      // Convenience: db.collection.find({})
      const m = trimmed.match(/^([\w-]+)\.([\w-]+)\.find\((.*)\)\s*$/s);
      if (m) {
        const filter = m[3]!.trim() ? JSON.parse(m[3]!) : {};
        const docs = await client.db(m[1]!).collection(m[2]!).find(filter).skip(0).limit(pageSize).toArray();
        return docsToResult(docs, started);
      }
      throw new Error('Mongo execute expects JSON {db,collection,find|aggregate} or db.col.find({})');
    },
    async close() {
      const c = client;
      client = undefined;
      if (c) await c.close();
    },
  };
}

function docsToResult(docs: unknown[], started: number) {
  const columns = ['_doc'];
  const rows = docs.map((d) => [d]);
  return rowsToResult(columns, rows, started);
}
