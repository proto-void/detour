import * as v from 'valibot';

const NonEmpty = v.pipe(v.string(), v.trim(), v.minLength(1, 'Must not be empty'));
const Id = v.pipe(v.string(), v.minLength(1), v.maxLength(64));

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

export const KvRowSchema = v.object({
  id: Id,
  enabled: v.optional(v.boolean(), true),
  key: v.string(),
  value: v.string(),
});
export type KvRow = v.InferOutput<typeof KvRowSchema>;

export const AuthSchema = v.variant('type', [
  v.object({ type: v.literal('none') }),
  v.object({ type: v.literal('basic'), username: v.string(), password: v.string() }),
  v.object({ type: v.literal('bearer'), token: v.string() }),
  v.object({
    type: v.literal('apikey'),
    key: v.string(),
    value: v.string(),
    in: v.optional(v.picklist(['header', 'query']), 'header'),
  }),
  v.object({
    type: v.literal('oauth2'),
    grant: v.optional(v.picklist(['authorization_code', 'client_credentials', 'password']), 'authorization_code'),
    authorizeUrl: v.optional(v.string(), ''),
    tokenUrl: v.string(),
    clientId: v.string(),
    clientSecret: v.optional(v.string(), ''),
    scope: v.optional(v.string(), ''),
    redirectUri: v.optional(v.string(), ''),
    username: v.optional(v.string(), ''),
    password: v.optional(v.string(), ''),
    accessToken: v.optional(v.string(), ''),
    refreshToken: v.optional(v.string(), ''),
    expiresAt: v.optional(v.number()),
  }),
  v.object({
    type: v.literal('sigv4'),
    accessKeyId: v.string(),
    secretAccessKey: v.string(),
    sessionToken: v.optional(v.string(), ''),
    region: v.string(),
    service: v.string(),
  }),
  v.object({
    type: v.literal('digest'),
    username: v.string(),
    password: v.string(),
  }),
]);
export type Auth = v.InferOutput<typeof AuthSchema>;

export const BodySchema = v.variant('mode', [
  v.object({ mode: v.literal('none') }),
  v.object({ mode: v.literal('raw'), text: v.string(), language: v.optional(v.picklist(['json', 'text']), 'json') }),
  v.object({ mode: v.literal('urlencoded'), rows: v.array(KvRowSchema) }),
  v.object({ mode: v.literal('formdata'), rows: v.array(KvRowSchema) }),
  v.object({
    mode: v.literal('graphql'),
    query: v.string(),
    variables: v.optional(v.string(), ''),
    operationName: v.optional(v.string(), ''),
  }),
]);
export type Body = v.InferOutput<typeof BodySchema>;

export const REQUEST_PROTOCOLS = ['http', 'websocket', 'sse'] as const;
export type RequestProtocol = (typeof REQUEST_PROTOCOLS)[number];

/** Per-request Apply Detour rules: inherit global default, or force on/off. */
export const APPLY_DETOUR_MODES = ['inherit', 'on', 'off'] as const;
export type ApplyDetourMode = (typeof APPLY_DETOUR_MODES)[number];

export const ApiRequestSchema = v.object({
  id: Id,
  name: NonEmpty,
  method: v.picklist(HTTP_METHODS),
  url: v.string(),
  /** http (default), websocket, or sse — Slice C. */
  protocol: v.optional(v.picklist(REQUEST_PROTOCOLS), 'http'),
  params: v.optional(v.array(KvRowSchema), []),
  headers: v.optional(v.array(KvRowSchema), []),
  auth: v.optional(AuthSchema, { type: 'none' }),
  body: v.optional(BodySchema, { mode: 'none' }),
  preRequestScript: v.optional(v.string(), ''),
  testScript: v.optional(v.string(), ''),
  /** `inherit` (default) uses API Tester global `applyDetourRules`. */
  applyDetourRules: v.optional(v.picklist(APPLY_DETOUR_MODES), 'inherit'),
});
export type ApiRequest = v.InferOutput<typeof ApiRequestSchema>;

export type CollectionNode =
  | { kind: 'folder'; id: string; name: string; children: CollectionNode[] }
  | { kind: 'request'; id: string; request: ApiRequest };

// Recursive; cast keeps InferOutput defaults from fighting the hand-written CollectionNode.
export const CollectionNodeSchema = v.lazy(() =>
  v.variant('kind', [
    v.object({
      kind: v.literal('folder'),
      id: Id,
      name: NonEmpty,
      children: v.array(CollectionNodeSchema),
    }),
    v.object({
      kind: v.literal('request'),
      id: Id,
      request: ApiRequestSchema,
    }),
  ]),
) as v.GenericSchema<CollectionNode>;

export const CollectionSchema = v.object({
  id: Id,
  name: NonEmpty,
  description: v.optional(v.string(), ''),
  variables: v.optional(v.array(KvRowSchema), []),
  children: v.optional(v.array(CollectionNodeSchema), []),
});
export type Collection = v.InferOutput<typeof CollectionSchema>;

export const EncryptedSecretSchema = v.object({
  v: v.literal(1),
  salt: v.string(),
  iv: v.string(),
  ciphertext: v.string(),
});

export const EnvVarSchema = v.object({
  id: Id,
  key: v.string(),
  initialValue: v.optional(v.string(), ''),
  currentValue: v.optional(v.string(), ''),
  secret: v.optional(v.boolean(), false),
  /** When set, plaintext currentValue is cleared from storage until unlocked with a passphrase. */
  encrypted: v.optional(v.nullable(EncryptedSecretSchema), null),
});
export type EnvVar = v.InferOutput<typeof EnvVarSchema>;
export type EncryptedSecretStored = v.InferOutput<typeof EncryptedSecretSchema>;

export const EnvironmentSchema = v.object({
  id: Id,
  name: NonEmpty,
  variables: v.optional(v.array(EnvVarSchema), []),
});
export type Environment = v.InferOutput<typeof EnvironmentSchema>;

export const HistoryEntrySchema = v.object({
  id: Id,
  at: v.number(),
  method: v.picklist(HTTP_METHODS),
  url: v.string(),
  status: v.optional(v.number()),
  timeMs: v.optional(v.number()),
  /** Truncated body preview stored with history. */
  bodyPreview: v.optional(v.string(), ''),
});
export type HistoryEntry = v.InferOutput<typeof HistoryEntrySchema>;

export const RunnerResultRowSchema = v.object({
  iteration: v.number(),
  requestId: v.string(),
  requestName: v.string(),
  method: v.string(),
  url: v.string(),
  status: v.number(),
  timeMs: v.number(),
  ok: v.boolean(),
  error: v.optional(v.string()),
  dataRowIndex: v.optional(v.number()),
});

export const RunnerReportSchema = v.object({
  id: Id,
  at: v.number(),
  collectionId: v.string(),
  collectionName: v.string(),
  folderId: v.optional(v.nullable(v.string()), null),
  iterations: v.number(),
  stopOnFail: v.boolean(),
  rows: v.array(RunnerResultRowSchema),
  summary: v.object({
    total: v.number(),
    passed: v.number(),
    failed: v.number(),
    durationMs: v.number(),
  }),
});
export type StoredRunnerReport = v.InferOutput<typeof RunnerReportSchema>;

export const ApiScheduleStoredSchema = v.object({
  id: Id,
  name: NonEmpty,
  collectionId: v.string(),
  folderId: v.optional(v.nullable(v.string()), null),
  periodMinutes: v.number(),
  enabled: v.optional(v.boolean(), true),
  notifyOnFail: v.optional(v.boolean(), false),
  createdAt: v.number(),
});
export type ApiScheduleStored = v.InferOutput<typeof ApiScheduleStoredSchema>;

export const ApiClientStateSchema = v.object({
  collections: v.optional(v.array(CollectionSchema), []),
  environments: v.optional(v.array(EnvironmentSchema), []),
  activeEnvironmentId: v.optional(v.nullable(v.string()), null),
  globals: v.optional(v.array(KvRowSchema), []),
  history: v.optional(v.array(HistoryEntrySchema), []),
  applyDetourRules: v.optional(v.boolean(), true),
  /** Past collection runs (Slice B), capped separately in storage. */
  runs: v.optional(v.array(RunnerReportSchema), []),
  schedules: v.optional(v.array(ApiScheduleStoredSchema), []),
});
export type ApiClientState = v.InferOutput<typeof ApiClientStateSchema>;

export const emptyApiClientState = (): ApiClientState => ({
  collections: [],
  environments: [],
  activeEnvironmentId: null,
  globals: [],
  history: [],
  applyDetourRules: true,
  runs: [],
  schedules: [],
});

export const emptyRequest = (id: string, name = 'New request'): ApiRequest => ({
  id,
  name,
  method: 'GET',
  url: '',
  protocol: 'http',
  params: [],
  headers: [],
  auth: { type: 'none' },
  body: { mode: 'none' },
  preRequestScript: '',
  testScript: '',
  applyDetourRules: 'inherit',
});

export const newKvRow = (id: string, key = '', value = ''): KvRow => ({
  id,
  enabled: true,
  key,
  value,
});
