import * as v from 'valibot';

export const DbEnvironmentSchema = v.picklist(['local', 'staging', 'production']);
export type DbEnvironment = v.InferOutput<typeof DbEnvironmentSchema>;

export const EngineSchema = v.picklist([
  'cassandra',
  'postgres',
  'mysql',
  'mariadb',
  'mssql',
  'sqlite',
  'oracle',
  'mongodb',
  'redis',
  'clickhouse',
  'elasticsearch',
  'opensearch',
  'dynamodb',
]);
export type DbEngine = v.InferOutput<typeof EngineSchema>;

export const CassandraTargetSchema = v.picklist([
  'apache',
  'dse',
  'scylla',
  'astra',
  'keyspaces',
  'cosmos',
]);
export type CassandraTarget = v.InferOutput<typeof CassandraTargetSchema>;

export const TlsModeSchema = v.picklist([
  'disable',
  'allow',
  'preferred',
  'required',
  'verify-ca',
  'verify-full',
]);
export type TlsMode = v.InferOutput<typeof TlsModeSchema>;

export const PasswordStorageSchema = v.picklist(['keychain', 'ask', 'none']);
export type PasswordStorage = v.InferOutput<typeof PasswordStorageSchema>;

export const SshAuthSchema = v.picklist(['password', 'privateKey', 'agent']);
export type SshAuth = v.InferOutput<typeof SshAuthSchema>;

export const ProxyTypeSchema = v.picklist(['none', 'socks5', 'http']);
export type ProxyType = v.InferOutput<typeof ProxyTypeSchema>;

export const DriverPropertySchema = v.object({
  key: v.string(),
  value: v.string(),
});
export type DriverProperty = v.InferOutput<typeof DriverPropertySchema>;

export const TlsConfigSchema = v.object({
  mode: v.optional(TlsModeSchema, 'disable'),
  caPath: v.optional(v.string(), ''),
  certPath: v.optional(v.string(), ''),
  keyPath: v.optional(v.string(), ''),
  keyPassphraseAccount: v.optional(v.string(), ''),
  /** Java truststore (JKS/PKCS12) — overrides caPath when set and mode ≠ disable. */
  trustStorePath: v.optional(v.string(), ''),
  /** Java keystore (JKS/PKCS12) — overrides certPath/keyPath when set and mode ≠ disable. */
  keyStorePath: v.optional(v.string(), ''),
  serverName: v.optional(v.string(), ''),
  minVersion: v.optional(v.string(), ''),
});
export type TlsConfig = v.InferOutput<typeof TlsConfigSchema>;

export const SshConfigSchema = v.object({
  enabled: v.optional(v.boolean(), false),
  host: v.optional(v.string(), ''),
  port: v.optional(v.number()),
  username: v.optional(v.string(), ''),
  auth: v.optional(SshAuthSchema, 'password'),
  keyPath: v.optional(v.string(), ''),
  keepaliveInterval: v.optional(v.number()),
  strictHostKey: v.optional(v.boolean(), true),
  /** Comma-separated or single jump host `user@host:port`. */
  jumpHosts: v.optional(v.string(), ''),
  /** @deprecated migrated into auth */
  usePassword: v.optional(v.boolean()),
  /** @deprecated migrated into auth */
  usePrivateKey: v.optional(v.boolean()),
});
export type SshConfig = v.InferOutput<typeof SshConfigSchema>;

export const ProxyConfigSchema = v.object({
  type: v.optional(ProxyTypeSchema, 'none'),
  host: v.optional(v.string(), ''),
  port: v.optional(v.number()),
  username: v.optional(v.string(), ''),
});
export type ProxyConfig = v.InferOutput<typeof ProxyConfigSchema>;

export const AdvancedConfigSchema = v.object({
  connectTimeoutMs: v.optional(v.number()),
  queryTimeoutMs: v.optional(v.number()),
  keepaliveMs: v.optional(v.number()),
  initStatements: v.optional(v.string(), ''),
  autoCommit: v.optional(v.boolean(), true),
});
export type AdvancedConfig = v.InferOutput<typeof AdvancedConfigSchema>;

/** Engine-specific options (loose record; mappers interpret per engine). */
export const EngineOptionsSchema = v.optional(v.record(v.string(), v.unknown()), {});
export type EngineOptions = Record<string, unknown>;

export const DbConnectionSchema = v.object({
  id: v.string(),
  name: v.string(),
  group: v.optional(v.string(), ''),
  color: v.optional(v.string(), '#5b8def'),
  environment: v.optional(DbEnvironmentSchema, 'local'),
  engine: v.optional(EngineSchema, 'cassandra'),
  target: v.optional(CassandraTargetSchema, 'apache'),
  host: v.optional(v.string(), ''),
  contactPoints: v.optional(v.array(v.string()), []),
  port: v.optional(v.number()),
  localDataCenter: v.optional(v.string(), ''),
  username: v.optional(v.string(), ''),
  database: v.optional(v.string(), ''),
  keyspace: v.optional(v.string(), ''),
  filename: v.optional(v.string(), ''),
  region: v.optional(v.string(), ''),
  endpoint: v.optional(v.string(), ''),
  uri: v.optional(v.string(), ''),
  service: v.optional(v.string(), ''),
  keyspacesAuth: v.optional(v.picklist(['password', 'sigv4']), 'password'),
  secureConnectBundlePath: v.optional(v.string(), ''),
  /** Nested TLS (v2). */
  tls: v.optional(TlsConfigSchema),
  ssh: v.optional(SshConfigSchema),
  proxy: v.optional(ProxyConfigSchema),
  advanced: v.optional(AdvancedConfigSchema),
  engineOptions: EngineOptionsSchema,
  passwordStorage: v.optional(PasswordStorageSchema, 'keychain'),
  driverProperties: v.optional(v.array(DriverPropertySchema), []),
  readOnly: v.optional(v.boolean()),
  secretAccount: v.optional(v.string(), ''),
  /** @deprecated flat TLS — migrated into tls.mode */
  tlsEnabled: v.optional(v.boolean()),
  /** @deprecated flat TLS — migrated into tls.mode */
  tlsRejectUnauthorized: v.optional(v.boolean()),
});
export type DbConnection = v.InferOutput<typeof DbConnectionSchema>;

export const DbQuerySchema = v.object({
  id: v.string(),
  name: v.string(),
  body: v.string(),
  description: v.optional(v.string(), ''),
  tags: v.optional(v.array(v.string()), []),
  defaultConnectionId: v.optional(v.nullable(v.string()), null),
});
export type DbQuery = v.InferOutput<typeof DbQuerySchema>;

export const DbFolderSchema = v.object({
  id: v.string(),
  name: v.string(),
  queries: v.optional(v.array(DbQuerySchema), []),
});
export type DbFolder = v.InferOutput<typeof DbFolderSchema>;

export const DbCollectionSchema = v.object({
  id: v.string(),
  name: v.string(),
  folders: v.optional(v.array(DbFolderSchema), []),
});
export type DbCollection = v.InferOutput<typeof DbCollectionSchema>;

export const DbHistoryEntrySchema = v.object({
  id: v.string(),
  connectionId: v.string(),
  statement: v.string(),
  at: v.number(),
  ok: v.boolean(),
  timingMs: v.optional(v.number()),
  error: v.optional(v.string()),
});
export type DbHistoryEntry = v.InferOutput<typeof DbHistoryEntrySchema>;

export const DbClientStateSchema = v.object({
  connections: v.optional(v.array(DbConnectionSchema), []),
  collections: v.optional(v.array(DbCollectionSchema), []),
  history: v.optional(v.array(DbHistoryEntrySchema), []),
  idleTimeoutMinutes: v.optional(v.number(), 15),
  syncFolder: v.optional(v.string(), ''),
});
export type DbClientState = v.InferOutput<typeof DbClientStateSchema>;

export function emptyDbClientState(): DbClientState {
  return { connections: [], collections: [], history: [], idleTimeoutMinutes: 15, syncFolder: '' };
}

export function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function defaultReadOnly(env: DbEnvironment, explicit?: boolean): boolean {
  if (explicit !== undefined) return explicit;
  return env === 'production';
}

export const ENGINE_LABELS: Record<DbEngine, string> = {
  cassandra: 'Cassandra',
  postgres: 'PostgreSQL',
  mysql: 'MySQL',
  mariadb: 'MariaDB',
  mssql: 'SQL Server',
  sqlite: 'SQLite',
  oracle: 'Oracle',
  mongodb: 'MongoDB',
  redis: 'Redis / Valkey',
  clickhouse: 'ClickHouse',
  elasticsearch: 'Elasticsearch',
  opensearch: 'OpenSearch',
  dynamodb: 'DynamoDB',
};

export function defaultPort(engine: DbEngine): number | undefined {
  switch (engine) {
    case 'cassandra':
      return 9042;
    case 'postgres':
      return 5432;
    case 'mysql':
    case 'mariadb':
      return 3306;
    case 'mssql':
      return 1433;
    case 'oracle':
      return 1521;
    case 'mongodb':
      return 27017;
    case 'redis':
      return 6379;
    case 'clickhouse':
      return 8123;
    case 'elasticsearch':
    case 'opensearch':
      return 9200;
    case 'dynamodb':
      return 8000;
    default:
      return undefined;
  }
}

export function defaultStatement(engine: DbEngine): string {
  switch (engine) {
    case 'cassandra':
      return 'SELECT release_version FROM system.local;';
    case 'mongodb':
      return '{"db":"test","collection":"docs","find":{}}';
    case 'redis':
      return 'PING';
    case 'elasticsearch':
    case 'opensearch':
      return '{"query":{"match_all":{}}}';
    case 'dynamodb':
      return '{"TableName":"MyTable","Limit":10}';
    default:
      return 'SELECT 1;';
  }
}

export function defaultTls(): TlsConfig {
  return {
    mode: 'disable',
    caPath: '',
    certPath: '',
    keyPath: '',
    keyPassphraseAccount: '',
    trustStorePath: '',
    keyStorePath: '',
    serverName: '',
    minVersion: '',
  };
}

export function defaultSsh(): SshConfig {
  return {
    enabled: false,
    host: '',
    port: 22,
    username: '',
    auth: 'password',
    keyPath: '',
    keepaliveInterval: undefined,
    strictHostKey: true,
    jumpHosts: '',
  };
}

export function defaultProxy(): ProxyConfig {
  return { type: 'none', host: '', port: undefined, username: '' };
}

export function defaultAdvanced(): AdvancedConfig {
  return {
    connectTimeoutMs: undefined,
    queryTimeoutMs: undefined,
    keepaliveMs: undefined,
    initStatements: '',
    autoCommit: true,
  };
}

/** Effective TLS mode for UI / host (prefers nested tls). */
export function effectiveTlsMode(conn: DbConnection): TlsMode {
  if (conn.tls?.mode) return conn.tls.mode;
  if (conn.tlsEnabled) {
    return conn.tlsRejectUnauthorized === false ? 'required' : 'verify-full';
  }
  return 'disable';
}

export function tlsEnabledFromMode(mode: TlsMode): boolean {
  return mode !== 'disable';
}

export function tlsRejectUnauthorizedFromMode(mode: TlsMode): boolean {
  return mode === 'verify-ca' || mode === 'verify-full';
}

/**
 * Migrate flat TLS/SSH fields into nested v2 shape. Idempotent.
 * Strips deprecated flat tlsEnabled / tlsRejectUnauthorized from the result.
 */
export function migrateConnection(raw: unknown): DbConnection {
  const parsed = v.safeParse(DbConnectionSchema, raw);
  const base = parsed.success
    ? parsed.output
    : (v.parse(DbConnectionSchema, {
        id: (raw as { id?: string })?.id ?? newId('conn'),
        name: (raw as { name?: string })?.name ?? 'New Connection',
      }) as DbConnection);

  const input = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;

  let tls = base.tls ? { ...defaultTls(), ...base.tls } : defaultTls();
  if (!base.tls?.mode && (input.tlsEnabled === true || base.tlsEnabled === true)) {
    tls = {
      ...tls,
      mode: base.tlsRejectUnauthorized === false || input.tlsRejectUnauthorized === false ? 'required' : 'verify-full',
    };
  }

  const flatSsh = (input.ssh ?? base.ssh) as Record<string, unknown> | undefined;
  let ssh = base.ssh ? { ...defaultSsh(), ...base.ssh } : defaultSsh();
  if (flatSsh) {
    const host = String(flatSsh.host ?? ssh.host ?? '');
    let auth = ssh.auth ?? 'password';
    if (flatSsh.auth === 'password' || flatSsh.auth === 'privateKey' || flatSsh.auth === 'agent') {
      auth = flatSsh.auth;
    } else if (flatSsh.usePrivateKey === true) {
      auth = 'privateKey';
    } else if (flatSsh.usePassword === true) {
      auth = 'password';
    }
    ssh = {
      ...ssh,
      enabled: flatSsh.enabled === true || Boolean(host),
      host,
      port: typeof flatSsh.port === 'number' ? flatSsh.port : (ssh.port ?? 22),
      username: String(flatSsh.username ?? ssh.username ?? ''),
      auth,
      keyPath: String(flatSsh.keyPath ?? ssh.keyPath ?? ''),
      jumpHosts: String(flatSsh.jumpHosts ?? ssh.jumpHosts ?? ''),
      strictHostKey: flatSsh.strictHostKey !== false,
      usePassword: undefined,
      usePrivateKey: undefined,
    };
  }

  const { tlsEnabled: _te, tlsRejectUnauthorized: _tr, ...rest } = base;
  return {
    ...rest,
    tls,
    ssh,
    proxy: base.proxy ? { ...defaultProxy(), ...base.proxy } : defaultProxy(),
    advanced: base.advanced ? { ...defaultAdvanced(), ...base.advanced } : defaultAdvanced(),
    engineOptions: base.engineOptions ?? {},
    passwordStorage: base.passwordStorage ?? 'keychain',
    driverProperties: base.driverProperties ?? [],
  };
}

export function migrateConnections(list: unknown[]): DbConnection[] {
  return list.map((c) => migrateConnection(c));
}
