import type { DbEngine, TlsMode } from './model';
import { ENGINE_LABELS } from './model';

export type FieldKind =
  | 'text'
  | 'password'
  | 'number'
  | 'checkbox'
  | 'select'
  | 'path'
  | 'textarea';

/** Extra keychain kinds appended to secretAccount (must match host SECRET_KINDS). */
export type SecretKind =
  | 'sslKeyPass'
  | 'trustStorePass'
  | 'keyStorePass'
  | 'sshKeyPass'
  | 'sshPass'
  | 'proxyPass'
  | 'walletPass'
  | 'token';

export type FieldDescriptor = {
  id: string;
  label: string;
  kind: FieldKind;
  /** Dot path into draft / engineOptions / tls / ssh / proxy / advanced */
  path: string;
  group: 'basic' | 'auth' | 'tls' | 'ssh' | 'proxy' | 'driver' | 'advanced';
  options?: Array<{ value: string; label: string; disabled?: boolean; hint?: string }>;
  placeholder?: string;
  hint?: string;
  /** Soft-required for Test/Save/Connect (UI asterisk + empty guard). */
  required?: boolean;
  /** Show when this select path equals value */
  when?: { path: string; equals: string | boolean };
  /**
   * Ephemeral password field stored via host setSecret as `${secretAccount}:${secretKind}`.
   * Never persisted in chrome.storage / connection JSON.
   */
  secretKind?: SecretKind;
};

/** Keychain account for an extra secret kind (e.g. `db-x:sslKeyPass`). */
export function secretAccountKind(secretAccount: string, kind: SecretKind): string {
  return `${secretAccount}:${kind}`;
}

export type EngineVariant = { value: string; label: string };

function sortByLabel<T extends { label: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
}

export function variantsFor(engine: DbEngine): EngineVariant[] {
  if (engine === 'cassandra') {
    return sortByLabel([
      { value: 'apache', label: 'Apache Cassandra' },
      { value: 'dse', label: 'DataStax Enterprise' },
      { value: 'scylla', label: 'ScyllaDB' },
      { value: 'astra', label: 'DataStax Astra' },
      { value: 'keyspaces', label: 'AWS Keyspaces' },
      { value: 'cosmos', label: 'Azure Cosmos DB (Cassandra)' },
    ]);
  }
  if (engine === 'mysql' || engine === 'mariadb') {
    return sortByLabel([
      { value: 'mysql', label: 'MySQL' },
      { value: 'mariadb', label: 'MariaDB' },
    ]);
  }
  if (engine === 'elasticsearch' || engine === 'opensearch') {
    return sortByLabel([
      { value: 'elasticsearch', label: 'Elasticsearch' },
      { value: 'opensearch', label: 'OpenSearch' },
    ]);
  }
  return [];
}

const TLS_MODES: Array<{ value: TlsMode; label: string }> = [
  { value: 'disable', label: 'Disable' },
  { value: 'allow', label: 'Allow' },
  { value: 'preferred', label: 'Preferred' },
  { value: 'required', label: 'Required' },
  { value: 'verify-ca', label: 'Verify CA' },
  { value: 'verify-full', label: 'Verify Full' },
];

const SHARED_TLS: FieldDescriptor[] = [
  {
    id: 'tls.mode',
    label: 'SSL mode',
    kind: 'select',
    path: 'tls.mode',
    group: 'tls',
    options: TLS_MODES,
  },
  {
    id: 'tls.caPath',
    label: 'CA certificate',
    kind: 'path',
    path: 'tls.caPath',
    group: 'tls',
  },
  {
    id: 'tls.certPath',
    label: 'Client certificate',
    kind: 'path',
    path: 'tls.certPath',
    group: 'tls',
  },
  {
    id: 'tls.keyPath',
    label: 'Client key',
    kind: 'path',
    path: 'tls.keyPath',
    group: 'tls',
  },
  {
    id: 'tls.trustStorePath',
    label: 'Java truststore',
    kind: 'path',
    path: 'tls.trustStorePath',
    group: 'tls',
    hint: 'JKS or PKCS12 — overrides CA certificate when set',
  },
  {
    id: 'tls.trustStorePass',
    label: 'Truststore password',
    kind: 'password',
    path: '_draft.trustStorePass',
    group: 'tls',
    secretKind: 'trustStorePass',
  },
  {
    id: 'tls.keyStorePath',
    label: 'Java keystore',
    kind: 'path',
    path: 'tls.keyStorePath',
    group: 'tls',
    hint: 'JKS or PKCS12 — overrides client cert/key when set',
  },
  {
    id: 'tls.keyStorePass',
    label: 'Keystore password',
    kind: 'password',
    path: '_draft.keyStorePass',
    group: 'tls',
    secretKind: 'keyStorePass',
  },
  {
    id: 'tls.serverName',
    label: 'Server name (SNI)',
    kind: 'text',
    path: 'tls.serverName',
    group: 'tls',
  },
];

const SHARED_SSH: FieldDescriptor[] = [
  { id: 'ssh.enabled', label: 'Enable SSH tunnel', kind: 'checkbox', path: 'ssh.enabled', group: 'ssh' },
  {
    id: 'ssh.host',
    label: 'Bastion host',
    kind: 'text',
    path: 'ssh.host',
    group: 'ssh',
    when: { path: 'ssh.enabled', equals: true },
  },
  {
    id: 'ssh.port',
    label: 'Bastion port',
    kind: 'number',
    path: 'ssh.port',
    group: 'ssh',
    when: { path: 'ssh.enabled', equals: true },
  },
  {
    id: 'ssh.username',
    label: 'Bastion user',
    kind: 'text',
    path: 'ssh.username',
    group: 'ssh',
    when: { path: 'ssh.enabled', equals: true },
  },
  {
    id: 'ssh.auth',
    label: 'SSH auth',
    kind: 'select',
    path: 'ssh.auth',
    group: 'ssh',
    when: { path: 'ssh.enabled', equals: true },
    options: [
      { value: 'password', label: 'Password' },
      { value: 'privateKey', label: 'Private key' },
      { value: 'agent', label: 'SSH agent' },
    ],
  },
  {
    id: 'ssh.keyPath',
    label: 'Private key path',
    kind: 'path',
    path: 'ssh.keyPath',
    group: 'ssh',
    when: { path: 'ssh.auth', equals: 'privateKey' },
  },
  {
    id: 'ssh.jumpHosts',
    label: 'Jump hosts (ProxyJump)',
    kind: 'text',
    path: 'ssh.jumpHosts',
    group: 'ssh',
    when: { path: 'ssh.enabled', equals: true },
    placeholder: 'user@host:22',
  },
  {
    id: 'ssh.strictHostKey',
    label: 'Strict host key checking',
    kind: 'checkbox',
    path: 'ssh.strictHostKey',
    group: 'ssh',
    when: { path: 'ssh.enabled', equals: true },
  },
];

const SHARED_PROXY: FieldDescriptor[] = [
  {
    id: 'proxy.type',
    label: 'Proxy',
    kind: 'select',
    path: 'proxy.type',
    group: 'proxy',
    options: [
      { value: 'none', label: 'None' },
      { value: 'socks5', label: 'SOCKS5' },
      { value: 'http', label: 'HTTP CONNECT' },
    ],
  },
  {
    id: 'proxy.host',
    label: 'Proxy host',
    kind: 'text',
    path: 'proxy.host',
    group: 'proxy',
    when: { path: 'proxy.type', equals: 'socks5' },
  },
  {
    id: 'proxy.host2',
    label: 'Proxy host',
    kind: 'text',
    path: 'proxy.host',
    group: 'proxy',
    when: { path: 'proxy.type', equals: 'http' },
  },
  {
    id: 'proxy.port',
    label: 'Proxy port',
    kind: 'number',
    path: 'proxy.port',
    group: 'proxy',
    when: { path: 'proxy.type', equals: 'socks5' },
  },
  {
    id: 'proxy.port2',
    label: 'Proxy port',
    kind: 'number',
    path: 'proxy.port',
    group: 'proxy',
    when: { path: 'proxy.type', equals: 'http' },
  },
  {
    id: 'proxy.username',
    label: 'Proxy user',
    kind: 'text',
    path: 'proxy.username',
    group: 'proxy',
    when: { path: 'proxy.type', equals: 'socks5' },
  },
];

const SHARED_ADVANCED: FieldDescriptor[] = [
  {
    id: 'advanced.connectTimeoutMs',
    label: 'Connect timeout (ms)',
    kind: 'number',
    path: 'advanced.connectTimeoutMs',
    group: 'advanced',
  },
  {
    id: 'advanced.queryTimeoutMs',
    label: 'Query timeout (ms)',
    kind: 'number',
    path: 'advanced.queryTimeoutMs',
    group: 'advanced',
  },
  {
    id: 'advanced.initStatements',
    label: 'Init statements',
    kind: 'textarea',
    path: 'advanced.initStatements',
    group: 'advanced',
  },
  {
    id: 'advanced.autoCommit',
    label: 'Auto-commit',
    kind: 'checkbox',
    path: 'advanced.autoCommit',
    group: 'advanced',
  },
];

function networkBasics(engine: DbEngine): FieldDescriptor[] {
  if (engine === 'sqlite') {
    return [
      {
        id: 'filename',
        label: 'Database file',
        kind: 'path',
        path: 'filename',
        group: 'basic',
        required: true,
      },
    ];
  }
  if (engine === 'mongodb') {
    return [
      {
        id: 'uri',
        label: 'URI',
        kind: 'text',
        path: 'uri',
        group: 'basic',
        placeholder: 'mongodb://127.0.0.1:27017',
        required: true,
      },
      { id: 'database', label: 'Database', kind: 'text', path: 'database', group: 'basic' },
    ];
  }
  if (engine === 'dynamodb') {
    return [
      {
        id: 'region',
        label: 'Region',
        kind: 'text',
        path: 'region',
        group: 'basic',
        placeholder: 'us-east-1',
        required: true,
      },
      {
        id: 'endpoint',
        label: 'Endpoint override',
        kind: 'text',
        path: 'endpoint',
        group: 'basic',
        placeholder: 'http://127.0.0.1:8000',
      },
    ];
  }
  const fields: FieldDescriptor[] = [
    { id: 'host', label: 'Host', kind: 'text', path: 'host', group: 'basic', required: true },
    { id: 'port', label: 'Port', kind: 'number', path: 'port', group: 'basic', required: true },
    { id: 'username', label: 'User', kind: 'text', path: 'username', group: 'basic' },
    {
      id: 'passwordStorage',
      label: 'Password storage',
      kind: 'select',
      path: 'passwordStorage',
      group: 'basic',
      options: [
        { value: 'keychain', label: 'Keychain' },
        { value: 'ask', label: 'Ask every time' },
        { value: 'none', label: "Don't store" },
      ],
    },
    { id: 'database', label: 'Database / keyspace', kind: 'text', path: 'database', group: 'basic' },
  ];
  if (engine === 'cassandra') {
    fields.push({
      id: 'localDataCenter',
      label: 'Local datacenter',
      kind: 'text',
      path: 'localDataCenter',
      group: 'basic',
    });
  }
  if (engine === 'oracle') {
    fields.push({
      id: 'service',
      label: 'Service name',
      kind: 'text',
      path: 'service',
      group: 'basic',
      placeholder: 'FREEPDB1',
      required: true,
    });
  }
  return fields;
}

function authFields(engine: DbEngine): FieldDescriptor[] {
  if (engine === 'postgres') {
    return [
      {
        id: 'eo.authMethod',
        label: 'Authentication',
        kind: 'select',
        path: 'engineOptions.authMethod',
        group: 'auth',
        options: [
          { value: 'password', label: 'Password' },
          { value: 'pgpass', label: '.pgpass' },
          { value: 'aws-iam', label: 'AWS RDS/Aurora IAM' },
          {
            value: 'gssapi',
            label: 'GSSAPI / Kerberos (not supported by driver)',
            disabled: true,
            hint: 'node-postgres has no GSSAPI support',
          },
        ],
      },
    ];
  }
  if (engine === 'mysql' || engine === 'mariadb') {
    return [
      {
        id: 'eo.authMethod',
        label: 'Authentication',
        kind: 'select',
        path: 'engineOptions.authMethod',
        group: 'auth',
        options: [
          { value: 'password', label: 'Password' },
          { value: 'caching_sha2', label: 'caching_sha2' },
          { value: 'native', label: 'mysql_native_password' },
          { value: 'cleartext', label: 'Cleartext' },
          { value: 'aws-iam', label: 'AWS IAM' },
          {
            value: 'kerberos',
            label: 'Kerberos (not supported by driver)',
            disabled: true,
            hint: 'mysql2 has no Kerberos plugin',
          },
        ],
      },
    ];
  }
  if (engine === 'mssql') {
    return [
      {
        id: 'eo.authMethod',
        label: 'Authentication',
        kind: 'select',
        path: 'engineOptions.authMethod',
        group: 'auth',
        options: [
          { value: 'sql', label: 'SQL Server' },
          { value: 'ntlm', label: 'Windows / NTLM' },
          { value: 'kerberos', label: 'Kerberos' },
          { value: 'entra-password', label: 'Entra Password' },
          { value: 'entra-interactive', label: 'Entra MFA (interactive)' },
          { value: 'entra-device-code', label: 'Entra Device Code' },
          { value: 'entra-service-principal', label: 'Entra Service Principal' },
          { value: 'entra-managed-identity', label: 'Entra Managed Identity' },
          { value: 'entra-default', label: 'Entra Default' },
        ],
      },
    ];
  }
  if (engine === 'mongodb') {
    return [
      {
        id: 'eo.authMechanism',
        label: 'Auth mechanism',
        kind: 'select',
        path: 'engineOptions.authMechanism',
        group: 'auth',
        options: [
          { value: 'SCRAM-SHA-256', label: 'SCRAM-SHA-256' },
          { value: 'SCRAM-SHA-1', label: 'SCRAM-SHA-1' },
          { value: 'MONGODB-X509', label: 'X.509' },
          { value: 'PLAIN', label: 'LDAP PLAIN' },
          { value: 'GSSAPI', label: 'Kerberos GSSAPI' },
          { value: 'MONGODB-AWS', label: 'AWS IAM' },
          { value: 'MONGODB-OIDC', label: 'OIDC' },
        ],
      },
    ];
  }
  if (engine === 'cassandra') {
    return [
      {
        id: 'eo.authProvider',
        label: 'Auth provider',
        kind: 'select',
        path: 'engineOptions.authProvider',
        group: 'auth',
        options: [
          { value: 'PlainText', label: 'PlainText' },
          { value: 'DsePlainText', label: 'DSE PlainText' },
          { value: 'DseGssapi', label: 'DSE GSSAPI / Kerberos' },
        ],
      },
    ];
  }
  return [];
}

function driverFields(engine: DbEngine): FieldDescriptor[] {
  if (engine === 'redis') {
    return [
      {
        id: 'eo.mode',
        label: 'Mode',
        kind: 'select',
        path: 'engineOptions.mode',
        group: 'driver',
        options: [
          { value: 'standalone', label: 'Standalone' },
          { value: 'cluster', label: 'Cluster' },
          { value: 'sentinel', label: 'Sentinel' },
        ],
      },
      {
        id: 'eo.sentinelMaster',
        label: 'Sentinel master name',
        kind: 'text',
        path: 'engineOptions.sentinelMaster',
        group: 'driver',
        when: { path: 'engineOptions.mode', equals: 'sentinel' },
      },
    ];
  }
  if (engine === 'oracle') {
    return [
      {
        id: 'eo.connectionType',
        label: 'Connection type',
        kind: 'select',
        path: 'engineOptions.connectionType',
        group: 'driver',
        options: [
          { value: 'basic', label: 'Basic' },
          { value: 'tns', label: 'TNS alias' },
          { value: 'easy', label: 'Easy Connect' },
          { value: 'wallet', label: 'Cloud wallet' },
        ],
      },
      {
        id: 'eo.thick',
        label: 'Thick mode (Instant Client)',
        kind: 'checkbox',
        path: 'engineOptions.thick',
        group: 'driver',
        hint: 'Required for Kerberos',
      },
    ];
  }
  return [];
}

/** All field descriptors for an engine (basic + advanced groups). */
export function fieldsFor(engine: DbEngine): FieldDescriptor[] {
  const network = engine !== 'sqlite' && engine !== 'dynamodb';
  return [
    ...networkBasics(engine),
    ...authFields(engine),
    ...(network ? SHARED_TLS : []),
    ...(network ? SHARED_SSH : []),
    ...(network ? SHARED_PROXY : []),
    ...driverFields(engine),
    ...SHARED_ADVANCED,
  ];
}

export function fieldVisible(
  field: FieldDescriptor,
  get: (path: string) => unknown,
): boolean {
  if (!field.when) return true;
  const v = get(field.when.path);
  return v === field.when.equals;
}

export function groupSummary(
  group: FieldDescriptor['group'],
  get: (path: string) => unknown,
): string {
  switch (group) {
    case 'tls':
      return `SSL: ${String(get('tls.mode') || 'disable')}`;
    case 'ssh':
      return get('ssh.enabled') ? `SSH: ${String(get('ssh.host') || 'on')}` : 'SSH: off';
    case 'proxy': {
      const t = String(get('proxy.type') || 'none');
      return t === 'none' ? 'Proxy: off' : `Proxy: ${t}`;
    }
    case 'auth':
      return `Auth: ${String(get('engineOptions.authMethod') || get('engineOptions.authMechanism') || get('engineOptions.authProvider') || 'default')}`;
    case 'driver':
      return 'Driver options';
    case 'advanced':
      return 'Advanced';
    default:
      return ENGINE_LABELS[(get('engine') as DbEngine) || 'cassandra'] ?? 'Basic';
  }
}

export function getByPath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

export function setByPath(obj: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const parts = path.split('.');
  const next = { ...obj };
  let cur: Record<string, unknown> = next;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i]!;
    const child = cur[p];
    const copy =
      child && typeof child === 'object' && !Array.isArray(child)
        ? { ...(child as Record<string, unknown>) }
        : {};
    cur[p] = copy;
    cur = copy;
  }
  cur[parts[parts.length - 1]!] = value;
  return next;
}

export const ADVANCED_GROUPS: Array<FieldDescriptor['group']> = [
  'auth',
  'tls',
  'ssh',
  'proxy',
  'driver',
  'advanced',
];
