import { buildRedisOptions } from './redis-config.ts';
import { rowsToResult } from './sql-common.ts';
import type { DbAdapter, DescribeResult, ExecuteOptions, ObjectNode, ObjectPath } from './types.ts';

type RedisLike = {
  connect(): Promise<void>;
  quit(): Promise<void>;
  ping(): Promise<string>;
  keys(pattern: string): Promise<string[]>;
  type(key: string): Promise<string>;
  get(key: string): Promise<string | null>;
  hgetall(key: string): Promise<Record<string, string>>;
  lrange(key: string, start: number, stop: number): Promise<string[]>;
  smembers(key: string): Promise<string[]>;
  zrange(key: string, start: number, stop: number, opts?: object): Promise<string[]>;
  call(cmd: string, ...args: string[]): Promise<unknown>;
};

export function createRedisAdapter(): DbAdapter {
  let redis: RedisLike | undefined;

  async function ensure(config: Record<string, unknown>): Promise<RedisLike> {
    const Redis = (await import('ioredis')).default as unknown as new (opts: Record<string, unknown>) => RedisLike;
    const built = buildRedisOptions({
      ...config,
      host: String(config.host ?? (config.contactPoints as string[] | undefined)?.[0] ?? '127.0.0.1'),
      port: Number(config.port ?? 6379),
      username: config.username ? String(config.username) : undefined,
      password: config.password ? String(config.password) : undefined,
      database: config.database as string | number | undefined,
      engineOptions: config.engineOptions as Record<string, unknown> | undefined,
      tls: config.tls as Record<string, unknown> | undefined,
      tlsEnabled: config.tlsEnabled as boolean | undefined,
      tlsRejectUnauthorized: config.tlsRejectUnauthorized as boolean | undefined,
      advanced: config.advanced as { connectTimeoutMs?: number } | undefined,
    });
    const opts: Record<string, unknown> = {
      host: built.host,
      port: built.port,
      username: built.username,
      password: built.password,
      db: built.db,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: built.connectTimeout,
    };
    if (built.tls) {
      opts.tls = {
        rejectUnauthorized: built.tls.rejectUnauthorized,
        ca: built.tls.ca,
        cert: built.tls.cert,
        key: built.tls.key,
        servername: built.tls.servername,
      };
    }
    const r = new Redis(opts);
    await r.connect();
    redis = r;
    return r;
  }

  return {
    async connect(config) {
      if (redis) await this.close();
      await ensure(config);
    },
    async testConnection(config) {
      const started = Date.now();
      try {
        const r = await ensure(config);
        await r.ping();
        return { ok: true as const, latencyMs: Date.now() - started };
      } catch (e) {
        await this.close();
        return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
      }
    },
    async listObjects(path?: ObjectPath): Promise<ObjectNode[]> {
      if (!redis) throw new Error('Not connected');
      const pattern = path?.name ? String(path.name) : '*';
      const keys = await redis.keys(pattern);
      return keys.slice(0, 500).map((k) => ({ id: `key:${k}`, label: k, kind: 'key' }));
    },
    async describe(ref: ObjectPath): Promise<DescribeResult> {
      if (!redis || !ref.name) return { meta: { ref } };
      const t = await redis.type(ref.name);
      let value: unknown;
      if (t === 'string') value = await redis.get(ref.name);
      else if (t === 'hash') value = await redis.hgetall(ref.name);
      else if (t === 'list') value = await redis.lrange(ref.name, 0, 99);
      else if (t === 'set') value = await redis.smembers(ref.name);
      else if (t === 'zset') value = await redis.zrange(ref.name, 0, 99);
      return { meta: { type: t, value }, columns: [{ name: 'value', type: t }] };
    },
    async execute(statement, _params, _options: ExecuteOptions) {
      if (!redis) throw new Error('Not connected');
      const started = Date.now();
      const parts = statement.trim().split(/\s+/);
      const cmd = parts[0]!.toUpperCase();
      const args = parts.slice(1);
      if (cmd === 'KEYS') {
        const keys = await redis.keys(args[0] ?? '*');
        return rowsToResult(['key'], keys.map((k) => [k]), started);
      }
      if (cmd === 'GET' && args[0]) {
        const v = await redis.get(args[0]);
        return rowsToResult(['value'], [[v]], started);
      }
      if (cmd === 'TYPE' && args[0]) {
        const t = await redis.type(args[0]);
        return rowsToResult(['type'], [[t]], started);
      }
      const result = await redis.call(cmd, ...args);
      return rowsToResult(['result'], [[result]], started);
    },
    async close() {
      const r = redis;
      redis = undefined;
      if (r) {
        try {
          await r.quit();
        } catch {
          /* ignore */
        }
      }
    },
  };
}
