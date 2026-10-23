import * as v from 'valibot';

export const DbEnvironmentSchema = v.picklist([
  'local',
  'development',
  'qa',
  'staging',
  'production',
]);
export type DbEnvironment = v.InferOutput<typeof DbEnvironmentSchema>;

/** Display labels for connection environment tags. */
export const ENV_LABELS: Record<DbEnvironment, string> = {
  local: 'Local',
  development: 'Development',
  qa: 'QA',
  staging: 'Staging',
  production: 'Production',
};

/**
 * Environment select options in fixed lifecycle order (not A–Z):
 * Local → Development → QA → Staging → Production.
 */
export const ENV_OPTIONS: Array<{ value: DbEnvironment; label: string }> = [
  { value: 'local', label: ENV_LABELS.local },
  { value: 'development', label: ENV_LABELS.development },
  { value: 'qa', label: ENV_LABELS.qa },
  { value: 'staging', label: ENV_LABELS.staging },
  { value: 'production', label: ENV_LABELS.production },
];

/** Alias for ENV_OPTIONS (lifecycle order). Do not A–Z sort environments. */
export function environmentsSorted(): Array<{ value: DbEnvironment; label: string }> {
  return ENV_OPTIONS;
}

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
  /** Queries at collection root (plan 037). */
  queries: v.optional(v.array(DbQuerySchema), []),
  folders: v.optional(v.array(DbFolderSchema), []),
});
export type DbCollection = v.InferOutput<typeof DbCollectionSchema>;

/** Target for save / DnD: collection root (`folderId` null) or a folder. */
export type CollectionQueryLocation = {
  collectionId: string;
  folderId: string | null;
};

/** Ensure collection/folder query arrays exist (migrate missing `queries`). */
export function migrateCollection(raw: unknown): DbCollection {
  const c =
    typeof raw === 'object' && raw !== null
      ? (raw as Record<string, unknown>)
      : {};
  const folders = Array.isArray(c.folders)
    ? (c.folders as unknown[]).map((f) => {
        const folder =
          typeof f === 'object' && f !== null
            ? (f as Record<string, unknown>)
            : {};
        return {
          id: typeof folder.id === 'string' ? folder.id : newId('fold'),
          name: typeof folder.name === 'string' ? folder.name : 'Folder',
          queries: Array.isArray(folder.queries)
            ? (folder.queries as DbQuery[])
            : [],
        } satisfies DbFolder;
      })
    : [];
  return {
    id: typeof c.id === 'string' ? c.id : newId('col'),
    name: typeof c.name === 'string' ? c.name : 'Collection',
    queries: Array.isArray(c.queries) ? (c.queries as DbQuery[]) : [],
    folders,
  };
}

export function migrateCollections(list: unknown[]): DbCollection[] {
  return list.map((c) => migrateCollection(c));
}

/** Default Save location: first folder if any, else collection root. */
export function defaultSaveLocation(
  collection: DbCollection,
): CollectionQueryLocation {
  const firstFolder = (collection.folders ?? [])[0];
  return {
    collectionId: collection.id,
    folderId: firstFolder ? firstFolder.id : null,
  };
}

export function findQueryInCollections(
  collections: DbCollection[],
  queryId: string,
): { collection: DbCollection; folderId: string | null; query: DbQuery } | null {
  for (const col of collections) {
    const root = (col.queries ?? []).find((q) => q.id === queryId);
    if (root) return { collection: col, folderId: null, query: root };
    for (const folder of col.folders ?? []) {
      const q = (folder.queries ?? []).find((x) => x.id === queryId);
      if (q) return { collection: col, folderId: folder.id, query: q };
    }
  }
  return null;
}

function queriesAt(
  col: DbCollection,
  folderId: string | null,
): DbQuery[] {
  if (folderId === null) return col.queries ?? [];
  const folder = (col.folders ?? []).find((f) => f.id === folderId);
  return folder?.queries ?? [];
}

function setQueriesAt(
  col: DbCollection,
  folderId: string | null,
  queries: DbQuery[],
): DbCollection {
  if (folderId === null) return { ...col, queries };
  return {
    ...col,
    folders: (col.folders ?? []).map((f) =>
      f.id === folderId ? { ...f, queries } : f,
    ),
  };
}

/** Move a query to another collection root or folder (append). No-op if missing. */
export function moveQuery(
  collections: DbCollection[],
  queryId: string,
  to: CollectionQueryLocation,
): DbCollection[] {
  const found = findQueryInCollections(collections, queryId);
  if (!found) return collections;
  if (
    found.collection.id === to.collectionId &&
    found.folderId === to.folderId
  ) {
    return collections;
  }
  const query = found.query;
  const without = deleteQueryFromCollections(collections, queryId);
  return without.map((c) => {
    if (c.id !== to.collectionId) return c;
    const list = queriesAt(c, to.folderId).filter((q) => q.id !== queryId);
    return setQueriesAt(c, to.folderId, [...list, query]);
  });
}

export function upsertQueryAt(
  collections: DbCollection[],
  location: CollectionQueryLocation,
  query: DbQuery,
): DbCollection[] {
  return collections.map((c) => {
    if (c.id !== location.collectionId) return c;
    const list = queriesAt(c, location.folderId);
    const next = list.some((q) => q.id === query.id)
      ? list.map((q) => (q.id === query.id ? query : q))
      : [...list, query];
    return setQueriesAt(c, location.folderId, next);
  });
}

export function renameQueryInCollections(
  collections: DbCollection[],
  queryId: string,
  name: string,
): DbCollection[] {
  return collections.map((c) => ({
    ...c,
    queries: (c.queries ?? []).map((q) => (q.id === queryId ? { ...q, name } : q)),
    folders: (c.folders ?? []).map((f) => ({
      ...f,
      queries: (f.queries ?? []).map((q) => (q.id === queryId ? { ...q, name } : q)),
    })),
  }));
}

export function deleteQueryFromCollections(
  collections: DbCollection[],
  queryId: string,
): DbCollection[] {
  return collections.map((c) => ({
    ...c,
    queries: (c.queries ?? []).filter((q) => q.id !== queryId),
    folders: (c.folders ?? []).map((f) => ({
      ...f,
      queries: (f.queries ?? []).filter((q) => q.id !== queryId),
    })),
  }));
}

/** Non-empty for confirm: has any queries (root or in folders) or any folders. */
export function collectionIsNonEmpty(col: DbCollection): boolean {
  return (col.queries ?? []).length > 0 || (col.folders ?? []).length > 0;
}

export function folderIsNonEmpty(folder: DbFolder): boolean {
  return (folder.queries ?? []).length > 0;
}

/** Clear collectionQueryId on tabs that pointed at deleted query ids. */
export function clearCollectionQueryIds(
  tabs: DbQueryTab[],
  deletedQueryIds: Set<string>,
): DbQueryTab[] {
  if (deletedQueryIds.size === 0) return tabs;
  return tabs.map((t) =>
    t.collectionQueryId && deletedQueryIds.has(t.collectionQueryId)
      ? { ...t, collectionQueryId: null }
      : t,
  );
}

export function collectQueryIdsInCollection(col: DbCollection): string[] {
  const ids = (col.queries ?? []).map((q) => q.id);
  for (const f of col.folders ?? []) {
    for (const q of f.queries ?? []) ids.push(q.id);
  }
  return ids;
}

export function collectQueryIdsInFolder(folder: DbFolder): string[] {
  return (folder.queries ?? []).map((q) => q.id);
}

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

export const DbSideSchema = v.picklist(['connections', 'collections', 'history']);
export type DbSide = v.InferOutput<typeof DbSideSchema>;

/** Explorer scope per connection (keyspace / schema / database drill-down). */
export const ExplorerScopeSchema = v.object({
  kind: v.optional(v.string(), 'root'),
  keyspace: v.optional(v.string(), ''),
  schema: v.optional(v.string(), ''),
  database: v.optional(v.string(), ''),
  label: v.optional(v.string(), ''),
});
export type ExplorerScope = v.InferOutput<typeof ExplorerScopeSchema>;

export const DbQueryTabResultSchema = v.object({
  columns: v.array(v.string()),
  rows: v.array(v.array(v.unknown())),
  timingMs: v.optional(v.number()),
  messages: v.optional(v.array(v.string()), []),
  warnings: v.optional(v.array(v.string()), []),
  pageToken: v.optional(v.nullable(v.string()), null),
  lastStatement: v.optional(v.string(), ''),
});
export type DbQueryTabResult = v.InferOutput<typeof DbQueryTabResultSchema>;

export const DbQueryTabSchema = v.object({
  id: v.string(),
  name: v.string(),
  body: v.string(),
  connectionId: v.optional(v.nullable(v.string()), null),
  collectionQueryId: v.optional(v.nullable(v.string()), null),
  /** Per-statement result grids for the last run (plan 036). */
  resultSets: v.optional(v.array(DbQueryTabResultSchema), []),
  activeResultIndex: v.optional(v.number(), 0),
  /** Batch-level messages (mid-run errors, notes) shown in Messages. */
  batchMessages: v.optional(v.array(v.string()), []),
  /** @deprecated plan 036 — migrated into resultSets[0] */
  lastResult: v.optional(v.nullable(DbQueryTabResultSchema), null),
});
export type DbQueryTab = v.InferOutput<typeof DbQueryTabSchema>;

export const DbUiPrefsSchema = v.object({
  side: v.optional(DbSideSchema, 'connections'),
  sidebarCollapsed: v.optional(v.boolean(), false),
  explorerCollapsed: v.optional(v.boolean(), false),
  /** @deprecated plan 034 drill-down — prefer activeKeyspaceByConnectionId */
  explorerScopeByConnectionId: v.optional(v.record(v.string(), ExplorerScopeSchema), {}),
  /** Active keyspace / schema / database per connection (`null` = All). */
  activeKeyspaceByConnectionId: v.optional(v.record(v.string(), v.nullable(v.string())), {}),
  /** Expanded explorer node ids per connection. */
  expandedIdsByConnectionId: v.optional(v.record(v.string(), v.array(v.string())), {}),
  /** Expanded Collections tree ids (collection + folder). */
  collectionsExpandedIds: v.optional(v.array(v.string()), []),
});
export type DbUiPrefs = v.InferOutput<typeof DbUiPrefsSchema>;

export const QUERY_TABS_CAP = 20;

export const DbClientStateSchema = v.object({
  connections: v.optional(v.array(DbConnectionSchema), []),
  collections: v.optional(v.array(DbCollectionSchema), []),
  history: v.optional(v.array(DbHistoryEntrySchema), []),
  idleTimeoutMinutes: v.optional(v.number(), 15),
  syncFolder: v.optional(v.string(), ''),
  ui: v.optional(DbUiPrefsSchema),
  queryTabs: v.optional(v.array(DbQueryTabSchema), []),
  activeQueryTabId: v.optional(v.nullable(v.string()), null),
});
export type DbClientState = v.InferOutput<typeof DbClientStateSchema>;

export function defaultDbUiPrefs(): DbUiPrefs {
  return {
    side: 'connections',
    sidebarCollapsed: false,
    explorerCollapsed: false,
    explorerScopeByConnectionId: {},
    activeKeyspaceByConnectionId: {},
    expandedIdsByConnectionId: {},
    collectionsExpandedIds: [],
  };
}

/** Migrate legacy lastResult → resultSets; drop lastResult from the tab. */
export function migrateQueryTab(raw: unknown): DbQueryTab {
  const t =
    typeof raw === 'object' && raw !== null
      ? (raw as Record<string, unknown>)
      : {};
  const legacy = t.lastResult as DbQueryTabResult | null | undefined;
  let resultSets = Array.isArray(t.resultSets)
    ? (t.resultSets as DbQueryTabResult[])
    : [];
  if (resultSets.length === 0 && legacy && typeof legacy === 'object') {
    resultSets = [legacy];
  }
  const activeResultIndex =
    typeof t.activeResultIndex === 'number' && t.activeResultIndex >= 0
      ? Math.min(t.activeResultIndex, Math.max(0, resultSets.length - 1))
      : 0;
  const batchMessages = Array.isArray(t.batchMessages)
    ? (t.batchMessages as string[])
    : [];
  return {
    id: typeof t.id === 'string' ? t.id : newId('qtab'),
    name: typeof t.name === 'string' ? t.name : 'Query',
    body: typeof t.body === 'string' ? t.body : '',
    connectionId: (t.connectionId as string | null | undefined) ?? null,
    collectionQueryId: (t.collectionQueryId as string | null | undefined) ?? null,
    resultSets,
    activeResultIndex: resultSets.length === 0 ? 0 : activeResultIndex,
    batchMessages,
    lastResult: null,
  };
}

export function emptyDbClientState(): DbClientState {
  return {
    connections: [],
    collections: [],
    history: [],
    idleTimeoutMinutes: 15,
    syncFolder: '',
    ui: defaultDbUiPrefs(),
    queryTabs: [],
    activeQueryTabId: null,
  };
}

/** Cap query tabs and ensure active id points at a real tab (or null). */
export function migrateDbClientState(raw: unknown): DbClientState {
  const base =
    typeof raw === 'object' && raw !== null
      ? (raw as Record<string, unknown>)
      : {};
  const collections = migrateCollections(
    Array.isArray(base.collections) ? (base.collections as unknown[]) : [],
  );
  const parsed = v.safeParse(DbClientStateSchema, {
    ...emptyDbClientState(),
    ...base,
    connections: migrateConnections(
      Array.isArray(base.connections) ? (base.connections as unknown[]) : [],
    ),
    collections,
  });
  const state = parsed.success ? parsed.output : emptyDbClientState();
  const ui = { ...defaultDbUiPrefs(), ...(state.ui ?? {}) };
  let queryTabs = (state.queryTabs ?? [])
    .map((t) => migrateQueryTab(t))
    .slice(0, QUERY_TABS_CAP);
  // Default Collections expand: first collection + its folders when unset
  if (
    (ui.collectionsExpandedIds?.length ?? 0) === 0 &&
    (state.collections?.length ?? 0) > 0
  ) {
    const col = state.collections![0]!;
    ui.collectionsExpandedIds = [
      col.id,
      ...(col.folders ?? []).map((f) => f.id),
    ];
  }
  let activeQueryTabId = state.activeQueryTabId ?? null;
  if (activeQueryTabId && !queryTabs.some((t) => t.id === activeQueryTabId)) {
    activeQueryTabId = queryTabs[0]?.id ?? null;
  }
  if (!activeQueryTabId && queryTabs[0]) activeQueryTabId = queryTabs[0].id;
  return {
    ...state,
    syncFolder: state.syncFolder ?? '',
    ui,
    queryTabs,
    activeQueryTabId,
  };
}

export function createQueryTab(partial?: Partial<DbQueryTab>): DbQueryTab {
  const fromLegacy =
    partial?.lastResult && (!partial.resultSets || partial.resultSets.length === 0)
      ? [partial.lastResult]
      : undefined;
  return {
    id: partial?.id ?? newId('qtab'),
    name: partial?.name ?? 'Query',
    body: partial?.body ?? '',
    connectionId: partial?.connectionId ?? null,
    collectionQueryId: partial?.collectionQueryId ?? null,
    resultSets: partial?.resultSets ?? fromLegacy ?? [],
    activeResultIndex: partial?.activeResultIndex ?? 0,
    batchMessages: partial?.batchMessages ?? [],
    lastResult: null,
  };
}

export function emptyTabResult(
  partial?: Partial<DbQueryTabResult>,
): DbQueryTabResult {
  return {
    columns: partial?.columns ?? [],
    rows: partial?.rows ?? [],
    timingMs: partial?.timingMs,
    messages: partial?.messages ?? [],
    warnings: partial?.warnings ?? [],
    pageToken: partial?.pageToken ?? null,
    lastStatement: partial?.lastStatement ?? '',
  };
}

export function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Production-only default: development / local / QA / staging stay writable unless explicitly read-only. */
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
