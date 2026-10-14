import * as v from 'valibot';
import { isSafeRelative } from '../local-bridge/paths';

export const SCHEMA_VERSION = 1;

const NonEmpty = v.pipe(v.string(), v.trim(), v.minLength(1, 'Must not be empty'));

const Id = v.pipe(v.string(), v.minLength(1, 'Id must not be empty'), v.maxLength(64, 'Id is too long'));

const HeaderName = v.pipe(
  v.string(),
  v.regex(/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/, 'Header name must be a valid HTTP token (e.g. "X-Frame-Options")'),
);

export const HeaderOpSchema = v.variant('op', [
  v.object({ op: v.literal('set'), name: HeaderName, value: v.string() }),
  v.object({ op: v.literal('append'), name: HeaderName, value: v.string() }),
  v.object({ op: v.literal('remove'), name: HeaderName }),
]);

function isJsRegex(pattern: string): boolean {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

export const MatchSchema = v.variant('kind', [
  v.object({ kind: v.literal('glob'), pattern: NonEmpty }),
  v.object({
    kind: v.literal('regex'),
    pattern: v.pipe(NonEmpty, v.check(isJsRegex, 'Not a valid regular expression')),
  }),
]);

const isHttpUrl = (text: string) => {
  try {
    return ['http:', 'https:'].includes(new URL(text).protocol);
  } catch {
    return false;
  }
};

/** Code is kept byte-for-byte (no trimming); it only has to contain something. */
const Code = v.pipe(
  v.string(),
  v.check((s) => s.trim() !== '', 'Enter some code'),
  v.maxLength(1_000_000, 'Code is too large (1 MB max); serve it from a URL instead'),
);

export const InjectSourceSchema = v.variant('kind', [
  v.object({ kind: v.literal('inline'), code: Code }),
  v.object({ kind: v.literal('url'), url: v.pipe(NonEmpty, v.check(isHttpUrl, 'Must be an http:// or https:// URL')) }),
]);

export const RUN_AT = ['document_start', 'document_end', 'document_idle'] as const;
export const MOCK_METHODS = ['ANY', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;

const Integer = (min: number, max: number, label: string) =>
  v.pipe(v.number('Enter a number'), v.integer(`${label} must be a whole number`), v.minValue(min, `${label} must be at least ${min}`), v.maxValue(max, `${label} must be at most ${max}`));

export const ActionSchema = v.variant('type', [
  v.object({ type: v.literal('redirect'), to: NonEmpty }),
  v.object({ type: v.literal('block') }),
  v.object({
    type: v.literal('injectJs'),
    source: InjectSourceSchema,
    runAt: v.optional(v.picklist(RUN_AT), 'document_start'),
    /** false = top frame only. */
    allFrames: v.optional(v.boolean(), false),
    /** Inline code only: MAIN shares the page's globals; USER_SCRIPT is isolated and exempt from page CSP. */
    world: v.optional(v.picklist(['MAIN', 'USER_SCRIPT']), 'MAIN'),
  }),
  v.object({
    type: v.literal('injectCss'),
    source: InjectSourceSchema,
    runAt: v.optional(v.picklist(RUN_AT), 'document_start'),
    allFrames: v.optional(v.boolean(), false),
  }),
  v.object({
    type: v.literal('overrideBody'),
    /** UTF-8 text swapped in for the response body. */
    body: v.pipe(
      v.string(),
      v.check((s) => s.trim() !== '', 'Enter the replacement body'),
      v.maxLength(1_000_000, 'Body is too large (1 MB max)'),
    ),
    /**
     * `redirect` (default): DNR redirect to a data: URL (works with DevTools; RO 2.0 parity).
     * `inPlace`: keep the URL via debugger / filterResponseData (CSP/SRI-safe).
     */
    delivery: v.optional(v.picklist(['redirect', 'inPlace']), 'redirect'),
    /** Replaces the response Content-Type. Omitted = keep the server's (inPlace) or infer MIME (redirect). */
    contentType: v.optional(
      v.pipe(v.string(), v.trim(), v.minLength(1, 'Content-Type is empty'), v.maxLength(200, 'Content-Type is too long'), v.check((s) => !/[\r\n]/.test(s), 'Content-Type must be a single line')),
    ),
  }),
  v.object({
    type: v.literal('serveLocal'),
    /** Relative to the folder passed to `detour bridge`. Not a full disk path. */
    path: v.pipe(
      v.string(),
      v.trim(),
      v.minLength(1, 'Enter a path inside the bridge folder, like assets/app.js'),
      v.maxLength(512, 'Path is too long'),
      v.check(isSafeRelative, 'That path leaves the bridge folder. Use a relative path without ..'),
    ),
  }),
  v.object({
    type: v.literal('mock'),
    method: v.optional(v.picklist(MOCK_METHODS), 'ANY'),
    /** Fetch's Response accepts 200–599. */
    status: v.optional(Integer(200, 599, 'Status'), 200),
    headers: v.optional(v.array(v.object({ name: HeaderName, value: v.string() })), []),
    body: v.optional(v.string(), ''),
    delayMs: v.optional(Integer(0, 30_000, 'Delay'), 0),
  }),
  v.pipe(
    v.object({
      type: v.literal('modifyHeaders'),
      request: v.optional(v.array(HeaderOpSchema), []),
      response: v.optional(v.array(HeaderOpSchema), []),
    }),
    v.check(
      (a) => a.request.length + a.response.length > 0,
      'modifyHeaders needs at least one request or response header operation',
    ),
  ),
]);

/** Values accepted by declarativeNetRequest `resourceTypes` on Chrome 120+ and Firefox 128+. */
export const RESOURCE_TYPES = [
  'main_frame',
  'sub_frame',
  'stylesheet',
  'script',
  'image',
  'font',
  'object',
  'xmlhttprequest',
  'ping',
  'csp_report',
  'media',
  'websocket',
  'other',
] as const;

export const RuleSchema = v.object({
  id: Id,
  enabled: v.boolean(),
  match: MatchSchema,
  action: ActionSchema,
  /** Omitted = every type except main_frame (DNR default). Ignored by inject/mock actions. */
  resourceTypes: v.optional(v.pipe(v.array(v.picklist(RESOURCE_TYPES)), v.minLength(1, 'Use at least one resource type or omit the field'))),
  caseSensitive: v.optional(v.boolean()),
  note: v.optional(v.string()),
  /** Stable identity within its import source (RO rule id, or position + match); keeps on/off state across re-imports. */
  importKey: v.optional(v.string()),
});

const Domain = v.pipe(
  v.string(),
  v.regex(/^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)*$/, 'Domain must be a lowercase ASCII hostname without scheme, port or path (punycode for IDNs)'),
);

/** Where an imported group came from; a later import of the same file replaces it. */
export const ImportSourceSchema = v.object({
  file: v.string(),
  sha256: v.pipe(v.string(), v.regex(/^[0-9a-f]{64}$/, 'Must be a lowercase hex SHA-256')),
});

export const GroupSchema = v.object({
  id: Id,
  name: v.string(),
  enabled: v.boolean(),
  /** Only run on pages whose host is (a subdomain of) one of these. Omitted = every page. */
  pageDomains: v.optional(v.pipe(v.array(Domain), v.minLength(1, 'Use at least one domain or omit the field'))),
  importedFrom: v.optional(ImportSourceSchema),
  /** Stable identity within its import source (RO group id, or position). */
  importKey: v.optional(v.string()),
  rules: v.array(RuleSchema),
});

function duplicateId(groups: { id: string; rules: { id: string }[] }[]): string | undefined {
  const seen = new Set<string>();
  for (const id of groups.flatMap((g) => [g.id, ...g.rules.map((r) => r.id)])) {
    if (seen.has(id)) return id;
    seen.add(id);
  }
  return undefined;
}

export const WorkspaceSchema = v.pipe(
  v.object({ groups: v.array(GroupSchema) }),
  v.check((ws) => duplicateId(ws.groups) === undefined, (issue) => `Duplicate group/rule id "${duplicateId((issue.input as { groups: Group[] }).groups)}"`),
);

/** Envelope shared by export files and the stored workspace. */
export const EnvelopeSchema = v.object({
  v: v.literal(SCHEMA_VERSION, `Unsupported Detour schema version (expected ${SCHEMA_VERSION})`),
  data: WorkspaceSchema,
});

export type HeaderOp = v.InferOutput<typeof HeaderOpSchema>;
export type Match = v.InferOutput<typeof MatchSchema>;
export type Action = v.InferOutput<typeof ActionSchema>;
export type InjectSource = v.InferOutput<typeof InjectSourceSchema>;
export type DnrActionType = 'redirect' | 'block' | 'modifyHeaders';
export type PageActionType = 'injectJs' | 'injectCss' | 'mock';

/** Redirect/block/headers run in declarativeNetRequest; inject and mock run in the page. */
export const isDnrAction = (action: Action): action is Extract<Action, { type: DnrActionType }> =>
  action.type === 'redirect' || action.type === 'block' || action.type === 'modifyHeaders';

type OverrideBodyAction = Extract<Action, { type: 'overrideBody' }>;

/** True when overrideBody uses the debugger / filter path (not a DNR data: redirect). */
export const isInPlaceBody = (action: Action): action is OverrideBodyAction =>
  action.type === 'overrideBody' && action.delivery === 'inPlace';

/** True when overrideBody compiles to a DNR data: redirect (default). */
export const isRedirectBody = (action: Action): action is OverrideBodyAction =>
  action.type === 'overrideBody' && action.delivery === 'redirect';

export type ResourceType = (typeof RESOURCE_TYPES)[number];
export type Rule = v.InferOutput<typeof RuleSchema>;
export type ImportSource = v.InferOutput<typeof ImportSourceSchema>;
export type Group = v.InferOutput<typeof GroupSchema>;
export type Workspace = v.InferOutput<typeof WorkspaceSchema>;
export type Envelope = v.InferOutput<typeof EnvelopeSchema>;

export type ParseResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

/** Formats valibot issues as `path: message` lines a user can act on. */
export function formatIssues(issues: readonly v.BaseIssue<unknown>[]): string[] {
  return issues.map((issue) => {
    const path = v.getDotPath(issue);
    return path ? `${path}: ${issue.message}` : issue.message;
  });
}

function parseWith<T>(schema: v.GenericSchema<unknown, T>, input: unknown): ParseResult<T> {
  const result = v.safeParse(schema, input);
  return result.success ? { ok: true, value: result.output } : { ok: false, errors: formatIssues(result.issues) };
}

export const parseWorkspace = (input: unknown) => parseWith(WorkspaceSchema, input);
export const parseEnvelope = (input: unknown) => parseWith(EnvelopeSchema, input);
export const parseRule = (input: unknown) => parseWith(RuleSchema, input);

export const emptyWorkspace = (): Workspace => ({ groups: [] });
