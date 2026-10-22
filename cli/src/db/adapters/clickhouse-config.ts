import { sslFromConfig, driverPropertiesMap } from './tls-from-config.ts';

export type ClickHouseConnectionInput = {
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  database?: string;
  protocol?: 'http' | 'https';
  compression?: boolean;
  tls?: Record<string, unknown>;
  tlsEnabled?: boolean;
  engineOptions?: Record<string, unknown>;
  driverProperties?: Array<{ key: string; value: string }>;
};

export type BuiltClickHouseOptions = {
  url: string;
  username?: string;
  password?: string;
  database?: string;
  compression?: boolean;
  tls?: ReturnType<typeof sslFromConfig>;
  sessionSettings: Record<string, string>;
  extra: Record<string, string>;
};

export function buildClickHouseOptions(input: ClickHouseConnectionInput): BuiltClickHouseOptions {
  const eo = input.engineOptions ?? {};
  const extra = driverPropertiesMap({
    driverProperties: input.driverProperties,
    engineOptions: eo,
  });
  const protocol =
    (input.protocol as 'http' | 'https') ??
    (eo.protocol as 'http' | 'https') ??
    (input.tlsEnabled || input.tls ? 'https' : 'http');
  const host = input.host ?? '127.0.0.1';
  const port = input.port ?? (protocol === 'https' ? 8443 : 8123);
  const sessionSettings: Record<string, string> = {};
  if (eo.sessionSettings && typeof eo.sessionSettings === 'object') {
    for (const [k, v] of Object.entries(eo.sessionSettings as Record<string, unknown>)) {
      sessionSettings[k] = String(v);
    }
  }

  return {
    url: `${protocol}://${host}:${port}`,
    username: input.username,
    password: input.password,
    database: input.database,
    compression: input.compression ?? eo.compression === true,
    tls: sslFromConfig(input as Record<string, unknown>),
    sessionSettings,
    extra,
  };
}
