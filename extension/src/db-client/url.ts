import type { CassandraTarget, DbConnection, DbEngine } from './model';
import {
  defaultAdvanced,
  defaultPort,
  defaultProxy,
  defaultSsh,
  defaultTls,
  effectiveTlsMode,
  newId,
  tlsEnabledFromMode,
  tlsRejectUnauthorizedFromMode,
} from './model';

/** Paste connection URLs into a connection draft. */
export function connectionFromUrl(url: string, base?: Partial<DbConnection>): DbConnection {
  const trimmed = url.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Invalid connection URL.');
  }
  const protocol = parsed.protocol.replace(':', '').toLowerCase();
  let engine: DbEngine = 'cassandra';
  let target: CassandraTarget = 'apache';

  if (protocol === 'postgres' || protocol === 'postgresql') engine = 'postgres';
  else if (protocol === 'mysql') engine = 'mysql';
  else if (protocol === 'mariadb') engine = 'mariadb';
  else if (protocol === 'mssql' || protocol === 'sqlserver') engine = 'mssql';
  else if (protocol === 'sqlite') engine = 'sqlite';
  else if (protocol === 'oracle' || protocol === 'oracledb') engine = 'oracle';
  else if (protocol === 'mongodb' || protocol === 'mongodb+srv') engine = 'mongodb';
  else if (protocol === 'redis' || protocol === 'rediss') engine = 'redis';
  else if (protocol === 'clickhouse') engine = 'clickhouse';
  else if (protocol === 'elasticsearch' || protocol === 'es') engine = 'elasticsearch';
  else if (protocol === 'opensearch') engine = 'opensearch';
  else if (protocol === 'dynamodb') engine = 'dynamodb';
  else if (protocol === 'scylla' || protocol === 'scylladb') {
    engine = 'cassandra';
    target = 'scylla';
  } else if (protocol === 'astra') {
    engine = 'cassandra';
    target = 'astra';
  } else if (protocol === 'keyspaces' || protocol === 'aws-keyspaces') {
    engine = 'cassandra';
    target = 'keyspaces';
  } else if (protocol === 'cosmos' || protocol === 'cosmosdb') {
    engine = 'cassandra';
    target = 'cosmos';
  } else if (protocol === 'cassandra') {
    engine = 'cassandra';
    target = 'apache';
  }

  const host = parsed.hostname || '';
  const port = parsed.port ? Number(parsed.port) : defaultPort(engine);
  const database = parsed.pathname.replace(/^\//, '') || '';
  const tlsOn =
    protocol.endsWith('s') ||
    target === 'cosmos' ||
    target === 'keyspaces' ||
    target === 'astra';

  return {
    id: base?.id ?? newId('conn'),
    name: base?.name ?? (host || 'New Connection'),
    group: base?.group ?? '',
    color: base?.color ?? '#5b8def',
    environment: base?.environment ?? 'local',
    engine,
    target,
    host,
    contactPoints: host ? [host] : [],
    port,
    localDataCenter: parsed.searchParams.get('localDc') ?? parsed.searchParams.get('dc') ?? '',
    username: parsed.username ? decodeURIComponent(parsed.username) : '',
    database,
    keyspace: database,
    filename: engine === 'sqlite' ? database : '',
    region: parsed.searchParams.get('region') ?? '',
    endpoint: '',
    uri: engine === 'mongodb' ? trimmed : '',
    service: parsed.searchParams.get('service') ?? '',
    keyspacesAuth: 'password',
    secureConnectBundlePath: '',
    tls: {
      ...defaultTls(),
      mode: tlsOn ? 'verify-full' : 'disable',
    },
    ssh: base?.ssh ?? defaultSsh(),
    proxy: base?.proxy ?? defaultProxy(),
    advanced: base?.advanced ?? defaultAdvanced(),
    engineOptions: base?.engineOptions ?? {},
    passwordStorage: base?.passwordStorage ?? 'keychain',
    driverProperties: base?.driverProperties ?? [],
    readOnly: base?.readOnly,
    secretAccount: base?.secretAccount ?? '',
  };
}

/** Flatten connection metadata for the native host (includes nested + legacy flat TLS flags). */
export function buildHostConfig(conn: DbConnection): Record<string, unknown> {
  const mode = effectiveTlsMode(conn);
  const tlsOn = tlsEnabledFromMode(mode);
  const rejectUnauthorized = tlsRejectUnauthorizedFromMode(mode);

  const config: Record<string, unknown> = {
    target: conn.target,
    host: conn.host || conn.contactPoints[0],
    contactPoints: conn.contactPoints.length ? conn.contactPoints : conn.host ? [conn.host] : [],
    port: conn.port,
    localDataCenter: conn.localDataCenter || undefined,
    username: conn.username || undefined,
    database: conn.database || conn.keyspace || undefined,
    keyspace: conn.keyspace || conn.database || undefined,
    filename: conn.filename || undefined,
    path: conn.filename || undefined,
    region: conn.region || undefined,
    endpoint: conn.endpoint || undefined,
    uri: conn.uri || undefined,
    service: conn.service || undefined,
    keyspacesAuth: conn.keyspacesAuth,
    secureConnectBundle: conn.secureConnectBundlePath || undefined,
    tlsEnabled: tlsOn,
    tlsRejectUnauthorized: rejectUnauthorized,
    tls: {
      enabled: tlsOn,
      mode,
      caPath: conn.tls?.caPath || undefined,
      certPath: conn.tls?.certPath || undefined,
      keyPath: conn.tls?.keyPath || undefined,
      trustStorePath: conn.tls?.trustStorePath || undefined,
      keyStorePath: conn.tls?.keyStorePath || undefined,
      serverName: conn.tls?.serverName || undefined,
      minVersion: conn.tls?.minVersion || undefined,
      rejectUnauthorized,
    },
    advanced: conn.advanced ?? undefined,
    engineOptions: conn.engineOptions ?? {},
    driverProperties: conn.driverProperties ?? [],
    passwordStorage: conn.passwordStorage ?? 'keychain',
  };

  if (conn.proxy && conn.proxy.type && conn.proxy.type !== 'none' && conn.proxy.host) {
    config.proxy = {
      type: conn.proxy.type,
      host: conn.proxy.host,
      port: conn.proxy.port,
      username: conn.proxy.username || undefined,
    };
  }

  if (conn.ssh?.enabled || conn.ssh?.host) {
    config.ssh = {
      enabled: true,
      host: conn.ssh.host,
      port: conn.ssh.port ?? 22,
      username: conn.ssh.username,
      auth: conn.ssh.auth ?? 'password',
      keyPath: conn.ssh.keyPath || undefined,
      keepaliveInterval: conn.ssh.keepaliveInterval,
      strictHostKey: conn.ssh.strictHostKey !== false,
      jumpHosts: conn.ssh.jumpHosts || undefined,
    };
  }
  return config;
}
