import { sslFromConfig, driverPropertiesMap } from './tls-from-config.ts';

export type PostgresAuthMethod =
  | 'password'
  | 'pgpass'
  | 'aws-iam'
  | 'gssapi';

/** Driver-gated: node-postgres has no GSSAPI. */
export const POSTGRES_UNSUPPORTED_AUTH: PostgresAuthMethod[] = ['gssapi'];

export type PostgresConnectionInput = {
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  database?: string;
  application_name?: string;
  search_path?: string;
  statement_timeout?: number;
  target_session_attrs?: string;
  socketPath?: string;
  authMethod?: PostgresAuthMethod;
  tlsEnabled?: boolean;
  tlsRejectUnauthorized?: boolean;
  tls?: Record<string, unknown>;
  engineOptions?: Record<string, unknown>;
  driverProperties?: Array<{ key: string; value: string }>;
  advanced?: { connectTimeoutMs?: number };
};

export type BuiltPostgresOptions = {
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  application_name?: string;
  connectionTimeoutMillis?: number;
  ssl?: ReturnType<typeof sslFromConfig>;
  options?: string;
  /** Marker when auth is unsupported by driver. */
  unsupportedAuth?: PostgresAuthMethod;
  authMethod: PostgresAuthMethod;
  extra: Record<string, string>;
};

export function buildPostgresOptions(input: PostgresConnectionInput): BuiltPostgresOptions {
  const auth = input.authMethod ?? (input.engineOptions?.authMethod as PostgresAuthMethod) ?? 'password';
  if (POSTGRES_UNSUPPORTED_AUTH.includes(auth)) {
    return {
      authMethod: auth,
      unsupportedAuth: auth,
      extra: {},
    };
  }

  const eo = input.engineOptions ?? {};
  const extra = driverPropertiesMap({
    driverProperties: input.driverProperties,
    engineOptions: eo,
  });

  const ssl = sslFromConfig(input as Record<string, unknown>);
  const out: BuiltPostgresOptions = {
    authMethod: auth,
    host: input.socketPath ? undefined : (input.host ?? '127.0.0.1'),
    port: input.port ?? 5432,
    user: input.username,
    password: input.password,
    database: input.database ?? 'postgres',
    application_name: String(eo.application_name ?? extra.application_name ?? 'detour'),
    connectionTimeoutMillis: input.advanced?.connectTimeoutMs,
    ssl: ssl ?? undefined,
    extra,
  };

  if (input.socketPath || eo.socketPath) {
    out.host = String(input.socketPath ?? eo.socketPath);
  }

  const opts: string[] = [];
  if (eo.search_path || extra.search_path) opts.push(`-c search_path=${eo.search_path ?? extra.search_path}`);
  if (eo.statement_timeout || extra.statement_timeout) {
    opts.push(`-c statement_timeout=${eo.statement_timeout ?? extra.statement_timeout}`);
  }
  if (opts.length) out.options = opts.join(' ');

  if (auth === 'aws-iam') {
    out.extra['detour.auth'] = 'aws-iam';
  }
  if (auth === 'pgpass') {
    out.extra['detour.auth'] = 'pgpass';
  }

  return out;
}
