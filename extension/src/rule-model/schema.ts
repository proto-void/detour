import * as v from 'valibot';

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

export const ActionSchema = v.variant('type', [
  v.object({ type: v.literal('redirect'), to: NonEmpty }),
  v.object({ type: v.literal('block') }),
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
  /** Omitted = every type except main_frame (DNR default). */
  resourceTypes: v.optional(v.pipe(v.array(v.picklist(RESOURCE_TYPES)), v.minLength(1, 'Use at least one resource type or omit the field'))),
  caseSensitive: v.optional(v.boolean()),
  note: v.optional(v.string()),
});

export const GroupSchema = v.object({
  id: Id,
  name: v.string(),
  enabled: v.boolean(),
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
export type ResourceType = (typeof RESOURCE_TYPES)[number];
export type Rule = v.InferOutput<typeof RuleSchema>;
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
