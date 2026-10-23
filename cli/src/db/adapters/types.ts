export type ObjectPath = {
  kind: string;
  keyspace?: string;
  schema?: string;
  database?: string;
  name?: string;
  [key: string]: unknown;
};

export type ObjectNode = {
  id: string;
  label: string;
  kind: string;
  children?: ObjectNode[];
  meta?: Record<string, unknown>;
};

export type DescribeResult = {
  ddl?: string;
  columns?: Array<{ name: string; type: string; kind?: string; nullable?: boolean }>;
  foreignKeys?: Array<{ from: string; toTable: string; toColumn: string }>;
  meta?: Record<string, unknown>;
};

export type ExecuteOptions = {
  pageSize?: number;
  pageToken?: string | null;
  consistency?: string;
  serialConsistency?: string;
  timeoutMs?: number;
  tracing?: boolean;
  /** Client-supplied id for cancel RPC (Promise.race abort; not server kill). */
  requestId?: string;
};

export type ExecuteResult = {
  columns: string[];
  rows: unknown[][];
  pageToken?: string | null;
  rowCount: number;
  timingMs: number;
  messages?: string[];
  tracing?: unknown;
  warnings?: string[];
  explain?: unknown;
};

export type ExplainResult = {
  format: 'tree' | 'text' | 'json';
  plan: unknown;
  raw?: string;
};

export type PendingEdit = {
  kind: 'update' | 'insert' | 'delete';
  table: string;
  schema?: string;
  primaryKey?: Record<string, unknown>;
  values?: Record<string, unknown>;
  sql?: string;
};

export type DbAdapter = {
  connect(config: Record<string, unknown>): Promise<void>;
  testConnection?(
    config: Record<string, unknown>,
  ): Promise<{ ok: true; latencyMs: number } | { ok: false; error: string }>;
  listObjects(path?: ObjectPath): Promise<ObjectNode[]>;
  describe(ref: ObjectPath): Promise<DescribeResult>;
  execute(statement: string, params: unknown[] | undefined, options: ExecuteOptions): Promise<ExecuteResult>;
  explain?(statement: string): Promise<ExplainResult>;
  beginTransaction?(): Promise<void>;
  commit?(): Promise<void>;
  rollback?(): Promise<void>;
  applyEdits?(edits: PendingEdit[]): Promise<{ applied: number; statements: string[] }>;
  cancel?(requestId: string): Promise<void>;
  /**
   * Set session default keyspace / database / schema so unqualified table names resolve.
   * Pass `null` to clear when the engine supports it; otherwise All-mode clients should use qualified names.
   */
  setKeyspace?(keyspace: string | null): Promise<void>;
  close(): Promise<void>;
};

export type EngineId =
  | 'cassandra'
  | 'postgres'
  | 'mysql'
  | 'mariadb'
  | 'mssql'
  | 'sqlite'
  | 'oracle'
  | 'mongodb'
  | 'redis'
  | 'clickhouse'
  | 'elasticsearch'
  | 'opensearch'
  | 'dynamodb';

export type AdapterFactory = {
  id: EngineId;
  create(): DbAdapter;
};
