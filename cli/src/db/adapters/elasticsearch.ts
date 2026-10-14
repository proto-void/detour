import { rowsToResult } from './sql-common.ts';
import type { DbAdapter, DescribeResult, ExecuteOptions, ObjectNode, ObjectPath } from './types.ts';

type EsClient = {
  cat: { indices(opts: { format: string }): Promise<Array<{ index: string }>> };
  indices: { getMapping(opts: { index: string }): Promise<Record<string, unknown>> };
  search(opts: Record<string, unknown>): Promise<{ hits: { hits: Array<{ _id: string; _source: unknown }> } }>;
  close(): Promise<void>;
};

export function createElasticsearchAdapter(flavor: 'elasticsearch' | 'opensearch' = 'elasticsearch'): DbAdapter {
  let client: EsClient | undefined;

  async function ensure(config: Record<string, unknown>): Promise<EsClient> {
    const node = String(
      config.url ??
        `http://${config.host ?? '127.0.0.1'}:${config.port ?? (flavor === 'opensearch' ? 9200 : 9200)}`,
    );
    if (flavor === 'opensearch') {
      const mod = (await import('@opensearch-project/opensearch')) as unknown as {
        Client: new (opts: Record<string, unknown>) => EsClient;
      };
      client = new mod.Client({ node });
    } else {
      const mod = (await import('@elastic/elasticsearch')) as unknown as {
        Client: new (opts: Record<string, unknown>) => EsClient;
      };
      client = new mod.Client({ node });
    }
    return client;
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
        await c.cat.indices({ format: 'json' });
        return { ok: true as const, latencyMs: Date.now() - started };
      } catch (e) {
        await this.close();
        return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
      }
    },
    async listObjects(path?: ObjectPath): Promise<ObjectNode[]> {
      if (!client) throw new Error('Not connected');
      if (!path || path.kind === 'root') {
        const indices = await client.cat.indices({ format: 'json' });
        return indices.map((i) => ({
          id: `index:${i.index}`,
          label: i.index,
          kind: 'index',
          meta: { name: i.index },
        }));
      }
      return [];
    },
    async describe(ref: ObjectPath): Promise<DescribeResult> {
      if (!client || !ref.name) return { meta: { ref } };
      const mapping = await client.indices.getMapping({ index: ref.name });
      return { meta: { mapping }, ddl: JSON.stringify(mapping, null, 2) };
    },
    async execute(statement, _params, options: ExecuteOptions) {
      if (!client) throw new Error('Not connected');
      const started = Date.now();
      const trimmed = statement.trim();
      const body = trimmed.startsWith('{') ? JSON.parse(trimmed) : { query: { query_string: { query: trimmed } } };
      const index = body.index ?? '*';
      const queryBody = { ...body };
      delete queryBody.index;
      const rs = await client.search({
        index,
        size: options.pageSize ?? 100,
        ...queryBody,
      });
      const hits = rs.hits.hits;
      return rowsToResult(
        ['_id', '_source'],
        hits.map((h) => [h._id, h._source]),
        started,
      );
    },
    async close() {
      const c = client;
      client = undefined;
      if (c) await c.close();
    },
  };
}
