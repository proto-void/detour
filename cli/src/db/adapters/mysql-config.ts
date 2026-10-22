import { sslFromConfig, driverPropertiesMap } from './tls-from-config.ts';

export type MysqlAuthMethod = 'password' | 'caching_sha2' | 'native' | 'cleartext' | 'aws-iam' | 'kerberos';

/** Driver-gated: mysql2 has no Kerberos plugin. */
export const MYSQL_UNSUPPORTED_AUTH: MysqlAuthMethod[] = ['kerberos'];

export type MysqlConnectionInput = {
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  database?: string;
  socketPath?: string;
  charset?: string;
  timezone?: string;
  multipleStatements?: boolean;
  allowPublicKeyRetrieval?: boolean;
  authMethod?: MysqlAuthMethod;
  tlsEnabled?: boolean;
  tlsRejectUnauthorized?: boolean;
  tls?: Record<string, unknown>;
  engineOptions?: Record<string, unknown>;
  driverProperties?: Array<{ key: string; value: string }>;
  advanced?: { connectTimeoutMs?: number };
};

export type BuiltMysqlOptions = {
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  socketPath?: string;
  charset?: string;
  timezone?: string;
  multipleStatements?: boolean;
  allowPublicKeyRetrieval?: boolean;
  connectTimeout?: number;
  ssl?: ReturnType<typeof sslFromConfig>;
  authMethod: MysqlAuthMethod;
  unsupportedAuth?: MysqlAuthMethod;
  extra: Record<string, string>;
};

export function buildMysqlOptions(input: MysqlConnectionInput): BuiltMysqlOptions {
  const eo = input.engineOptions ?? {};
  const auth =
    input.authMethod ?? (eo.authMethod as MysqlAuthMethod) ?? 'password';
  if (MYSQL_UNSUPPORTED_AUTH.includes(auth)) {
    return { authMethod: auth, unsupportedAuth: auth, extra: {} };
  }

  const extra = driverPropertiesMap({
    driverProperties: input.driverProperties,
    engineOptions: eo,
  });

  return {
    authMethod: auth,
    host: input.host ?? '127.0.0.1',
    port: input.port ?? 3306,
    user: input.username,
    password: input.password,
    database: input.database,
    socketPath: input.socketPath ? String(input.socketPath) : eo.socketPath ? String(eo.socketPath) : undefined,
    charset: input.charset ?? (eo.charset as string | undefined),
    timezone: input.timezone ?? (eo.timezone as string | undefined),
    multipleStatements: input.multipleStatements ?? eo.multipleStatements === true,
    allowPublicKeyRetrieval:
      input.allowPublicKeyRetrieval ?? eo.allowPublicKeyRetrieval === true,
    connectTimeout: input.advanced?.connectTimeoutMs,
    ssl: sslFromConfig(input as Record<string, unknown>),
    extra,
  };
}
