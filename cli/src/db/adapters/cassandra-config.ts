/**
 * Pure Cassandra / Scylla / Astra / Keyspaces / Cosmos connection option builders.
 * Unit-tested without a live cluster ("configuration-tested" for cloud targets).
 */

export type CassandraTarget =
  | 'apache'
  | 'dse'
  | 'scylla'
  | 'astra'
  | 'keyspaces'
  | 'cosmos';

export type CassandraConnectionInput = {
  target?: CassandraTarget;
  contactPoints?: string[];
  localDataCenter?: string;
  port?: number;
  username?: string;
  password?: string;
  keyspace?: string;
  /** Absolute path to Astra secure connect bundle zip. */
  secureConnectBundle?: string;
  /** Application token for Astra. */
  astraToken?: string;
  /** AWS region for Keyspaces (e.g. us-east-1). */
  region?: string;
  /** Use SigV4 for Keyspaces instead of service-specific password. */
  keyspacesAuth?: 'password' | 'sigv4';
  tls?: {
    enabled?: boolean;
    ca?: string;
    cert?: string;
    key?: string;
    /** Passphrase for an encrypted client private key (Node TLS `passphrase`). */
    keyPassphrase?: string;
    rejectUnauthorized?: boolean;
  };
};

export type BuiltCassandraOptions = {
  target: CassandraTarget;
  contactPoints?: string[];
  localDataCenter?: string;
  protocolOptions?: { port: number };
  credentials?: { username: string; password: string };
  keyspace?: string;
  cloud?: { secureConnectBundle: string };
  sslOptions?: {
    rejectUnauthorized: boolean;
    ca?: string[];
    cert?: string;
    key?: string;
    passphrase?: string;
  };
  /** Bundled Starfield CA path marker for Keyspaces. */
  keyspacesTls?: { useStarfieldCa: true; port: number };
  /** SigV4 auth marker — host wires aws-sigv4-auth-cassandra-plugin when present. */
  keyspacesSigV4?: { region: string };
  astraToken?: string;
};

/** Default Cosmos Cassandra API port. */
export const COSMOS_CASSANDRA_PORT = 10350;
/** Default AWS Keyspaces CQL port. */
export const KEYSPACES_PORT = 9142;
/** Default Cassandra/Scylla port. */
export const CASSANDRA_PORT = 9042;

export function normalizeTarget(raw: string | undefined): CassandraTarget {
  const t = (raw ?? 'apache').toLowerCase();
  if (t === 'dse' || t === 'scylla' || t === 'astra' || t === 'keyspaces' || t === 'cosmos') return t;
  return 'apache';
}

/**
 * Build driver-oriented options from connection metadata + secrets.
 * Does not open a socket.
 */
export function buildCassandraOptions(input: CassandraConnectionInput): BuiltCassandraOptions {
  const target = normalizeTarget(input.target);
  const out: BuiltCassandraOptions = { target };

  if (target === 'astra') {
    if (!input.secureConnectBundle) {
      throw new Error('Astra requires a secure connect bundle path.');
    }
    out.cloud = { secureConnectBundle: input.secureConnectBundle };
    if (input.astraToken) out.astraToken = input.astraToken;
    else if (input.username && input.password) {
      out.credentials = { username: input.username, password: input.password };
    }
    if (input.keyspace) out.keyspace = input.keyspace;
    return out;
  }

  const contacts = (input.contactPoints ?? [])
    .flatMap((c) => c.split(/[,;\s]+/))
    .map((c) => c.trim())
    .filter(Boolean);
  if (contacts.length === 0) throw new Error('At least one contact point is required.');
  out.contactPoints = contacts;
  // Do not invent "datacenter1" — clusters often use "DC1" / region names; a wrong default
  // misconfigures DC-aware policies. Leave unset when blank (driver may require an explicit DC).
  const localDc = input.localDataCenter?.trim();
  if (localDc) out.localDataCenter = localDc;
  if (input.keyspace) out.keyspace = input.keyspace;

  if (target === 'cosmos') {
    const port = input.port ?? COSMOS_CASSANDRA_PORT;
    out.protocolOptions = { port };
    out.sslOptions = {
      rejectUnauthorized: input.tls?.rejectUnauthorized !== false,
      ...(input.tls?.ca ? { ca: [input.tls.ca] } : {}),
      ...(input.tls?.cert ? { cert: input.tls.cert } : {}),
      ...(input.tls?.key ? { key: input.tls.key } : {}),
      ...(input.tls?.keyPassphrase ? { passphrase: input.tls.keyPassphrase } : {}),
    };
    if (!input.username || !input.password) {
      throw new Error('Cosmos Cassandra API requires username and password (account key).');
    }
    out.credentials = { username: input.username, password: input.password };
    return out;
  }

  if (target === 'keyspaces') {
    const port = input.port ?? KEYSPACES_PORT;
    out.protocolOptions = { port };
    out.keyspacesTls = { useStarfieldCa: true, port };
    out.sslOptions = {
      rejectUnauthorized: true,
      ...(input.tls?.ca ? { ca: [input.tls.ca] } : {}),
    };
    const auth = input.keyspacesAuth ?? (input.password ? 'password' : 'sigv4');
    if (auth === 'sigv4') {
      const region = input.region?.trim();
      if (!region) throw new Error('Keyspaces SigV4 requires an AWS region.');
      out.keyspacesSigV4 = { region };
    } else {
      if (!input.username || !input.password) {
        throw new Error('Keyspaces password auth requires username and password.');
      }
      out.credentials = { username: input.username, password: input.password };
    }
    return out;
  }

  // apache / dse / scylla
  const port = input.port ?? CASSANDRA_PORT;
  if (port !== CASSANDRA_PORT) out.protocolOptions = { port };
  if (input.username && input.password) {
    out.credentials = { username: input.username, password: input.password };
  }
  if (input.tls?.enabled) {
    // Pass cert and/or key as present; no IncompletePair gate (TablePlus-style).
    out.sslOptions = {
      rejectUnauthorized: input.tls.rejectUnauthorized !== false,
      ...(input.tls.ca ? { ca: [input.tls.ca] } : {}),
      ...(input.tls.cert ? { cert: input.tls.cert } : {}),
      ...(input.tls.key ? { key: input.tls.key } : {}),
      ...(input.tls.keyPassphrase ? { passphrase: input.tls.keyPassphrase } : {}),
    };
  }
  return out;
}

/** Parse a cassandra:// or scylla:// style URL into form fields. */
export function parseCassandraUrl(url: string): Partial<CassandraConnectionInput> {
  const trimmed = url.trim();
  if (!trimmed) return {};
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Invalid connection URL.');
  }
  const protocol = parsed.protocol.replace(':', '').toLowerCase();
  let target: CassandraTarget = 'apache';
  if (protocol === 'scylla' || protocol === 'scylladb') target = 'scylla';
  else if (protocol === 'astra') target = 'astra';
  else if (protocol === 'keyspaces' || protocol === 'aws-keyspaces') target = 'keyspaces';
  else if (protocol === 'cosmos' || protocol === 'cosmosdb') target = 'cosmos';

  const contacts = parsed.hostname ? [parsed.hostname] : [];
  const port = parsed.port ? Number(parsed.port) : undefined;
  const keyspace = parsed.pathname.replace(/^\//, '') || undefined;
  const localDataCenter = parsed.searchParams.get('localDc') ?? parsed.searchParams.get('dc') ?? undefined;
  const region = parsed.searchParams.get('region') ?? undefined;

  return {
    target,
    contactPoints: contacts,
    ...(port !== undefined ? { port } : {}),
    ...(keyspace ? { keyspace } : {}),
    ...(localDataCenter ? { localDataCenter } : {}),
    ...(region ? { region } : {}),
    ...(parsed.username ? { username: decodeURIComponent(parsed.username) } : {}),
    ...(parsed.password ? { password: decodeURIComponent(parsed.password) } : {}),
  };
}
