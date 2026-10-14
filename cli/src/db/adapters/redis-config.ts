import { sslFromConfig, driverPropertiesMap } from './tls-from-config.ts';

export type RedisMode = 'standalone' | 'cluster' | 'sentinel';

export type RedisConnectionInput = {
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  database?: string | number;
  mode?: RedisMode;
  sentinelMaster?: string;
  sentinelNodes?: string;
  sentinelPassword?: string;
  keySeparator?: string;
  tlsEnabled?: boolean;
  tlsRejectUnauthorized?: boolean;
  tls?: Record<string, unknown>;
  engineOptions?: Record<string, unknown>;
  driverProperties?: Array<{ key: string; value: string }>;
  advanced?: { connectTimeoutMs?: number };
};

export type BuiltRedisOptions = {
  host: string;
  port: number;
  username?: string;
  password?: string;
  db: number;
  connectTimeout?: number;
  tls?: ReturnType<typeof sslFromConfig>;
  mode: RedisMode;
  sentinel?: { name: string; sentinels: Array<{ host: string; port: number }>; password?: string };
  keySeparator: string;
  extra: Record<string, string>;
};

export function buildRedisOptions(input: RedisConnectionInput): BuiltRedisOptions {
  const eo = input.engineOptions ?? {};
  const mode = (input.mode ?? eo.mode ?? 'standalone') as RedisMode;
  const extra = driverPropertiesMap({
    driverProperties: input.driverProperties,
    engineOptions: eo,
  });
  const db = Number(input.database ?? eo.db ?? 0) || 0;

  const out: BuiltRedisOptions = {
    host: input.host ?? '127.0.0.1',
    port: input.port ?? 6379,
    username: input.username || undefined,
    password: input.password || undefined,
    db,
    connectTimeout: input.advanced?.connectTimeoutMs,
    tls: sslFromConfig(input as Record<string, unknown>),
    mode,
    keySeparator: String(input.keySeparator ?? eo.keySeparator ?? ':'),
    extra,
  };

  if (mode === 'sentinel') {
    const name = String(input.sentinelMaster ?? eo.sentinelMaster ?? 'mymaster');
    const raw = String(input.sentinelNodes ?? eo.sentinelNodes ?? '');
    const sentinels = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((entry) => {
        const [h, p] = entry.split(':');
        return { host: h || '127.0.0.1', port: p ? Number(p) : 26379 };
      });
    out.sentinel = {
      name,
      sentinels,
      password: input.sentinelPassword
        ? String(input.sentinelPassword)
        : eo.sentinelPassword
          ? String(eo.sentinelPassword)
          : undefined,
    };
  }

  return out;
}
