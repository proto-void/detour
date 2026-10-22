import * as v from 'valibot';
import type { ApplyReport } from '../engine-core/apply';
import { bodyDataUrl } from '../engine-core/body-data-url';
import { compileRule, type RefusalReason } from '../engine-core/compile';
import { compileMatcher, countWildcards } from '../rule-model/match';
import {
  GroupSchema,
  isDnrAction,
  RESOURCE_TYPES,
  RuleSchema,
  type Action,
  type Group,
  type HeaderOp,
  type Match,
  type ResourceType,
  type Rule,
  type Workspace,
} from '../rule-model/schema';
import type { PageFailure } from '../page-inject/failures';
import type { CodeLanguage } from '../ui/codemirror';
import { REASON_LABELS } from './report-view';

type NewId = () => string;

// ---------------------------------------------------------------------------------------------
// Workspace operations (immutable)

export const newGroup = (newId: NewId, name = 'New group'): Group => ({ id: newId(), name, enabled: true, rules: [] });

/** New rules cover every request type, page loads included, like imported RO rules. */
export const newRule = (newId: NewId): Rule => ({
  id: newId(),
  enabled: true,
  match: { kind: 'glob', pattern: '' },
  action: { type: 'redirect', to: '' },
  resourceTypes: [...RESOURCE_TYPES],
});

function move<T>(items: T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (index < 0 || target < 0 || target >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item!);
  return next;
}

/** Drops keys explicitly set to `undefined` so optional fields really disappear. */
function clean<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, x]) => x !== undefined)) as T;
}

const mapGroup = (ws: Workspace, groupId: string, fn: (g: Group) => Group): Workspace => ({
  groups: ws.groups.map((g) => (g.id === groupId ? fn(g) : g)),
});

export const addGroup = (ws: Workspace, group: Group): Workspace => ({ groups: [...ws.groups, group] });
export const removeGroup = (ws: Workspace, groupId: string): Workspace => ({ groups: ws.groups.filter((g) => g.id !== groupId) });
export const moveGroup = (ws: Workspace, groupId: string, delta: number): Workspace => ({
  groups: move(ws.groups, ws.groups.findIndex((g) => g.id === groupId), delta),
});
export const updateGroup = (ws: Workspace, groupId: string, patch: Partial<Omit<Group, 'id' | 'rules'>>): Workspace =>
  mapGroup(ws, groupId, (g) => clean({ ...g, ...patch }));

export const addRule = (ws: Workspace, groupId: string, rule: Rule): Workspace => mapGroup(ws, groupId, (g) => ({ ...g, rules: [...g.rules, rule] }));
export const removeRule = (ws: Workspace, groupId: string, ruleId: string): Workspace =>
  mapGroup(ws, groupId, (g) => ({ ...g, rules: g.rules.filter((r) => r.id !== ruleId) }));
export const moveRule = (ws: Workspace, groupId: string, ruleId: string, delta: number): Workspace =>
  mapGroup(ws, groupId, (g) => ({ ...g, rules: move(g.rules, g.rules.findIndex((r) => r.id === ruleId), delta) }));
export const updateRule = (ws: Workspace, groupId: string, rule: Rule): Workspace =>
  mapGroup(ws, groupId, (g) => ({ ...g, rules: g.rules.map((r) => (r.id === rule.id ? clean(rule) : r)) }));

export function findRule(ws: Workspace | undefined, ruleId: string): { group: Group; rule: Rule } | undefined {
  for (const group of ws?.groups ?? []) {
    const rule = group.rules.find((r) => r.id === ruleId);
    if (rule) return { group, rule };
  }
  return undefined;
}

export const isDirty = (draft: Workspace, saved: Workspace): boolean => JSON.stringify(draft) !== JSON.stringify(saved);

/** Pure gate for the options-page autosave timer. */
export type AutosaveDecision = 'save' | 'invalid' | 'paused' | 'idle';

export function autosaveDecision(input: {
  dirty: boolean;
  errorCount: number;
  changedElsewhere: boolean;
  saving: boolean;
  autosave: boolean;
}): AutosaveDecision {
  if (!input.autosave || !input.dirty) return 'idle';
  if (input.changedElsewhere || input.saving) return 'paused';
  if (input.errorCount > 0) return 'invalid';
  return 'save';
}

// ---------------------------------------------------------------------------------------------
// Rule fields

export function defaultAction(type: Action['type']): Action {
  switch (type) {
    case 'redirect':
      return { type, to: '' };
    case 'block':
      return { type };
    case 'modifyHeaders':
      return { type, request: [{ op: 'set', name: '', value: '' }], response: [] };
    case 'injectJs':
      return { type, source: { kind: 'inline', code: '' }, runAt: 'document_start', allFrames: false, world: 'MAIN' };
    case 'injectCss':
      return { type, source: { kind: 'inline', code: '' }, runAt: 'document_start', allFrames: false };
    case 'mock':
      return { type, method: 'GET', status: 200, headers: [{ name: 'content-type', value: 'application/json' }], body: '{}', delayMs: 0 };
    case 'overrideBody':
      return { type, body: '', delivery: 'redirect' };
    case 'serveLocal':
      return { type, path: '' };
  }
}

export type HeaderPhase = 'request' | 'response';

export function headerOpWith(op: HeaderOp, kind: HeaderOp['op']): HeaderOp {
  if (kind === 'remove') return { op: kind, name: op.name };
  return { op: kind, name: op.name, value: op.op === 'remove' ? '' : op.value };
}

export type RequestScope = 'all' | 'subresources' | 'custom';

export function requestScope(rule: Rule): RequestScope {
  if (!rule.resourceTypes) return 'subresources';
  const types = new Set(rule.resourceTypes);
  return types.size === RESOURCE_TYPES.length && RESOURCE_TYPES.every((t) => types.has(t)) ? 'all' : 'custom';
}

/** `custom` turns the current effective set into an explicit, editable list. */
export function withRequestScope(rule: Rule, scope: RequestScope): Rule {
  if (scope === 'custom') return { ...rule, resourceTypes: effectiveTypes(rule) };
  return clean({ ...rule, resourceTypes: scope === 'all' ? [...RESOURCE_TYPES] : undefined });
}

/** What the rule actually applies to; omitted `resourceTypes` is DNR's "everything but page loads". */
export const effectiveTypes = (rule: Rule): ResourceType[] => rule.resourceTypes ?? RESOURCE_TYPES.filter((t) => t !== 'main_frame');

/** Toggles one request type, keeping the canonical order. May leave the list empty (a validation error). */
export function setResourceType(rule: Rule, type: ResourceType, on: boolean): Rule {
  const current = new Set(effectiveTypes(rule));
  if (on) current.add(type);
  else current.delete(type);
  return { ...rule, resourceTypes: RESOURCE_TYPES.filter((t) => current.has(t)) };
}

export const RESOURCE_TYPE_LABELS: Record<ResourceType, string> = {
  main_frame: 'Page loads (main_frame)',
  sub_frame: 'Iframes (sub_frame)',
  stylesheet: 'Stylesheets',
  script: 'Scripts',
  image: 'Images',
  font: 'Fonts',
  object: 'Plugins (object)',
  xmlhttprequest: 'fetch / XHR',
  ping: 'Pings & beacons',
  csp_report: 'CSP reports',
  media: 'Audio & video',
  websocket: 'WebSockets',
  other: 'Other',
};

/** Comma/space separated hosts → `pageDomains`. Forgiving: pasted URLs and `*.` prefixes are reduced to hosts. */
export function normalizeDomains(text: string): string[] | undefined {
  const domains = text
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((token) => {
      let host = token.toLowerCase();
      if (host.includes('://')) {
        try {
          host = new URL(host).hostname;
        } catch {
          return host;
        }
      }
      return host.replace(/^\*\./, '').replace(/\.$/, '');
    });
  return domains.length > 0 ? [...new Set(domains)] : undefined;
}

export const domainsText = (domains: string[] | undefined): string => (domains ?? []).join(', ');

// ---------------------------------------------------------------------------------------------
// Validation: `errors` block saving (storage would reject them); `warnings` are what the engine
// would refuse or the browser may reject, shown at the field without blocking the rest of the save.

export type FieldMessages = Record<string, string>;
export interface RuleValidation {
  errors: FieldMessages;
  warnings: FieldMessages;
}

const REASON_FIELD: Partial<Record<RefusalReason, string>> = {
  'non-ascii-pattern': 'match.pattern',
  'invalid-redirect': 'action.to',
  'redirect-loop': 'action.to',
  'too-many-captures': 'action.to',
};

/** Chrome's case-sensitive allowlist for `append` on request headers (DNR reference, 2026-10-06). */
export const REQUEST_APPEND_HEADERS = new Set([
  'accept',
  'accept-encoding',
  'accept-language',
  'access-control-request-headers',
  'cache-control',
  'connection',
  'content-language',
  'cookie',
  'forwarded',
  'if-match',
  'if-none-match',
  'keep-alive',
  'range',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'user-agent',
  'via',
  'want-digest',
  'x-forwarded-for',
]);

function issuesByField(issues: readonly v.BaseIssue<unknown>[], prefix = ''): FieldMessages {
  const fields: FieldMessages = {};
  for (const issue of issues) {
    const path = v.getDotPath(issue) ?? '';
    const key = prefix && path.startsWith(prefix) ? path.slice(prefix.length) : path;
    fields[key] ??= issue.message;
  }
  return fields;
}

export function validateRule(rule: Rule): RuleValidation {
  const parsed = v.safeParse(RuleSchema, rule);
  if (!parsed.success) {
    const errors = issuesByField(parsed.issues);
    if (rule.match.pattern.trim() === '') errors['match.pattern'] = 'Enter a URL pattern, e.g. https://cdn.example.com/*.js';
    if (rule.action.type === 'redirect' && rule.action.to.trim() === '') errors['action.to'] = 'Enter where matching requests should go';
    if (rule.action.type === 'overrideBody' && rule.action.body.trim() === '') errors['action.body'] = 'Enter the replacement body';
    if (rule.action.type === 'serveLocal' && rule.action.path.trim() === '') errors['action.path'] = 'Enter a path inside the bridge folder, like assets/app.js';
    if ((rule.action.type === 'injectJs' || rule.action.type === 'injectCss') && rule.action.source.kind === 'url' && rule.action.source.url.trim() === '') {
      errors['action.source.url'] = 'Enter the URL to load, e.g. http://localhost:5173/dev.js';
    }
    if (rule.resourceTypes?.length === 0) errors.resourceTypes = 'Pick at least one request type';
    return { errors, warnings: {} };
  }

  const warnings: FieldMessages = {};
  if (isDnrAction(parsed.output.action)) {
    const compiled = compileRule(parsed.output);
    if (!compiled.ok) warnings[REASON_FIELD[compiled.reason] ?? 'match.pattern'] = `${REASON_LABELS[compiled.reason]}: ${compiled.message}`;
  }
  if (parsed.output.action.type === 'overrideBody' && (parsed.output.action.delivery ?? 'redirect') === 'redirect') {
    const asRedirect = {
      ...parsed.output,
      action: {
        type: 'redirect' as const,
        to: bodyDataUrl(parsed.output.action.body, parsed.output.match.pattern, parsed.output.action.contentType),
      },
    };
    const compiled = compileRule(asRedirect);
    if (!compiled.ok) warnings[REASON_FIELD[compiled.reason] ?? 'match.pattern'] = `${REASON_LABELS[compiled.reason]}: ${compiled.message}`;
  }
  if (
    rule.action.type === 'overrideBody' &&
    (rule.action.delivery ?? 'redirect') === 'inPlace' &&
    (rule.match.kind === 'regex' || /^\*+$/.test(rule.match.pattern))
  ) {
    warnings['match.pattern'] =
      'This pattern pauses every response while the rule is on, then lets non-matches continue. A more specific URL avoids that.';
  }
  if (rule.action.type === 'serveLocal' && (rule.match.kind === 'regex' || /^\*+$/.test(rule.match.pattern))) {
    warnings['match.pattern'] =
      'This pattern is very broad. After you allow response rewriting, Detour pauses every response in the tab. Without that, a pattern that also matches 127.0.0.1 is refused so the redirect cannot loop.';
  }
  if (rule.action.type === 'modifyHeaders') {
    rule.action.request.forEach((op, i) => {
      if (op.op === 'append' && !REQUEST_APPEND_HEADERS.has(op.name)) {
        warnings[`action.request.${i}.op`] = 'Chrome only allows "append" on certain lowercase request headers (e.g. accept, cookie, user-agent); use "set" instead';
      }
    });
  }
  return { errors: {}, warnings };
}

export function validateGroup(group: Group): FieldMessages {
  const parsed = v.safeParse(GroupSchema, { ...group, rules: [] });
  if (parsed.success) return {};
  const fields = issuesByField(parsed.issues);
  const domainKey = Object.keys(fields).find((k) => k.startsWith('pageDomains'));
  if (domainKey !== undefined) {
    const bad = group.pageDomains?.[Number(domainKey.split('.')[1])];
    const message = bad === undefined ? fields[domainKey]! : `"${bad}" isn't a hostname. Use e.g. example.com (no scheme, port or path)`;
    for (const key of Object.keys(fields)) if (key.startsWith('pageDomains')) delete fields[key];
    fields.pageDomains = message;
  }
  return fields;
}

export interface WorkspaceValidation {
  groups: Record<string, FieldMessages>;
  rules: Record<string, RuleValidation>;
  /** Number of fields with blocking errors. */
  errorCount: number;
}

export function validateWorkspace(ws: Workspace): WorkspaceValidation {
  const result: WorkspaceValidation = { groups: {}, rules: {}, errorCount: 0 };
  for (const group of ws.groups) {
    result.groups[group.id] = validateGroup(group);
    result.errorCount += Object.keys(result.groups[group.id]!).length;
    for (const rule of group.rules) {
      result.rules[rule.id] = validateRule(rule);
      result.errorCount += Object.keys(result.rules[rule.id]!.errors).length;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------------------------
// Plain language + preview

const quote = (s: string) => `“${s}”`;

export function describeMatch(match: Match, caseSensitive = false): string {
  const pattern = match.pattern;
  if (pattern.trim() === '') return '';
  const casing = caseSensitive ? 'Upper/lower case must match.' : 'Upper/lower case is ignored.';
  if (match.kind === 'regex') {
    return `URLs where this regular expression matches anywhere (add ^ and $ to match the whole URL). ${casing}`;
  }
  const parts = pattern.split(/\*+/);
  if (parts.length === 1) return `Exactly this URL. ${casing}`;
  if (parts.every((p) => p === '')) return 'Every URL.';
  const first = parts[0]!;
  const last = parts[parts.length - 1]!;
  const middle = parts.slice(1, -1).filter(Boolean);
  const clauses = [
    first && `start with ${quote(first)}`,
    middle.length > 0 && `contain ${middle.map(quote).join(', then ')}`,
    last && `end with ${quote(last)}`,
  ].filter((c): c is string => typeof c === 'string' && c !== '');
  const joined = clauses.length > 1 ? `${clauses.slice(0, -1).join(', ')} and ${clauses[clauses.length - 1]}` : clauses[0];
  const head = joined ? `URLs that ${joined}.` : 'Every URL.';
  return `${head} Each * matches any text, including slashes. ${casing}`;
}

export function describeRedirect(rule: Rule): string {
  if (rule.action.type !== 'redirect' || rule.match.kind !== 'glob') return '';
  const used = countWildcards(rule.action.to);
  return used > 0 ? `Each * in the target is filled with what the * in the same position in the pattern matched (1st with 1st, and so on).` : '';
}

export type Preview =
  | { kind: 'empty' }
  | { kind: 'invalid'; message: string }
  | { kind: 'no-match' }
  | { kind: 'match'; outcome: 'redirect'; to: string }
  | { kind: 'match'; outcome: 'block' | 'modifyHeaders' | 'injectJs' | 'injectCss' | 'mock' | 'overrideBody' | 'serveLocal' };

/** Expands `\0`–`\9` and `\\` like DNR `regexSubstitution`. */
function expandSubstitution(template: string, groups: RegExpExecArray): string {
  return template.replace(/\\(\\|[0-9])/g, (_, token: string) => (token === '\\' ? '\\' : (groups[Number(token)] ?? '')));
}

/** Does `url` match, and where would it go? Mirrors the compiler's capture and substitution semantics. */
export function previewMatch(rule: Rule, url: string): Preview {
  if (url.trim() === '' || rule.match.pattern.trim() === '') return { kind: 'empty' };
  let matcher: RegExp;
  try {
    matcher = compileMatcher(rule.match, rule.caseSensitive ?? false);
  } catch (e) {
    return { kind: 'invalid', message: (e as Error).message };
  }
  const hit = matcher.exec(url);
  if (!hit) return { kind: 'no-match' };
  const { action } = rule;
  if (action.type === 'overrideBody' && (action.delivery ?? 'redirect') === 'redirect') {
    return { kind: 'match', outcome: 'redirect', to: bodyDataUrl(action.body, rule.match.pattern, action.contentType) };
  }
  if (action.type !== 'redirect') return { kind: 'match', outcome: action.type };

  if (rule.match.kind === 'glob') {
    let n = 0;
    return { kind: 'match', outcome: 'redirect', to: action.to.replace(/\*+/g, () => hit[++n] ?? '') };
  }
  // DNR: a target with \N replaces only the first match within the URL; a plain URL replaces it all.
  if (!/\\[0-9]/.test(action.to)) return { kind: 'match', outcome: 'redirect', to: action.to };
  const replaced = url.slice(0, hit.index) + expandSubstitution(action.to, hit) + url.slice(hit.index + hit[0].length);
  return { kind: 'match', outcome: 'redirect', to: replaced };
}

// ---------------------------------------------------------------------------------------------
// Inline status from the apply report

export type RuleStatus =
  | { kind: 'unsaved' }
  | { kind: 'off'; because: 'rule' | 'group' }
  | { kind: 'pending' }
  | { kind: 'detour-off' }
  | { kind: 'applied' }
  | { kind: 'refused'; label: string; message: string }
  /** Registered, but a page reported a failure since the last apply. */
  | { kind: 'failing'; message: string; page: string }
  | { kind: 'not-applied' };

export interface StatusContext {
  report: ApplyReport | undefined;
  saved: Workspace;
  /** A save happened and the background hasn't reported on it yet. */
  awaitingApply: boolean;
  /** storage.session page failures, newest first. */
  failures?: PageFailure[];
  /** Inline JS can run (user scripts allowed). */
  userScriptsReady?: boolean;
}

export const isPageAction = (action: Action): boolean => action.type === 'injectJs' || action.type === 'injectCss' || action.type === 'mock';

/** What the rule's pattern is tested against. */
export const matchSubject = (action: Action): 'page' | 'request' => (action.type === 'injectJs' || action.type === 'injectCss' ? 'page' : 'request');

export function codeLanguage(action: Action): CodeLanguage {
  if (action.type === 'overrideBody') {
    const type = action.contentType ?? '';
    if (/json/i.test(type)) return 'json';
    if (/css/i.test(type)) return 'css';
    if (/javascript|ecmascript/i.test(type)) return 'javascript';
    return 'text';
  }
  if (action.type === 'injectJs') return 'javascript';
  if (action.type === 'injectCss') return 'css';
  if (action.type === 'mock') {
    const type = action.headers.find((h) => h.name.toLowerCase() === 'content-type')?.value ?? '';
    return /json/i.test(type) ? 'json' : 'text';
  }
  return 'text';
}

/** Short chip label for the compact rule row. */
export function actionLabel(type: Action['type']): string {
  switch (type) {
    case 'redirect':
      return 'Redirect';
    case 'block':
      return 'Block';
    case 'modifyHeaders':
      return 'Headers';
    case 'injectJs':
      return 'JS';
    case 'injectCss':
      return 'CSS';
    case 'mock':
      return 'Mock';
    case 'overrideBody':
      return 'Body';
    case 'serveLocal':
      return 'Local';
  }
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const kb = n / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

/** Size hint for body/code actions on the compact row (e.g. `1.2 KB JSON`). */
export function bodySizeHint(action: Action): string {
  let text = '';
  let kind = '';
  if (action.type === 'overrideBody') {
    text = action.body;
    const lang = codeLanguage(action);
    kind = lang === 'text' ? '' : lang.toUpperCase();
  } else if (action.type === 'mock') {
    text = action.body;
    kind = codeLanguage(action) === 'json' ? 'JSON' : '';
  } else if (action.type === 'injectJs' || action.type === 'injectCss') {
    if (action.source.kind === 'url') return 'URL';
    text = action.source.code;
    kind = action.type === 'injectJs' ? 'JS' : 'CSS';
  } else {
    return '';
  }
  if (text === '') return kind ? `empty ${kind}` : 'empty';
  const size = formatBytes(new TextEncoder().encode(text).length);
  return kind ? `${size} ${kind}` : size;
}

/** Insert a deep copy of a rule after the original. */
export function duplicateRule(ws: Workspace, groupId: string, ruleId: string, newId: NewId): Workspace {
  return mapGroup(ws, groupId, (g) => {
    const index = g.rules.findIndex((r) => r.id === ruleId);
    if (index < 0) return g;
    const original = g.rules[index]!;
    const copy = structuredClone(original) as Rule;
    copy.id = newId();
    const rules = [...g.rules];
    rules.splice(index + 1, 0, copy);
    return { ...g, rules };
  });
}

export function ruleStatus(draftRule: Rule, { report, saved, awaitingApply, failures }: StatusContext): RuleStatus {
  const stored = findRule(saved, draftRule.id);
  if (!stored || JSON.stringify(stored.rule) !== JSON.stringify(draftRule)) return { kind: 'unsaved' };
  if (!stored.group.enabled) return { kind: 'off', because: 'group' };
  if (!stored.rule.enabled) return { kind: 'off', because: 'rule' };
  if (awaitingApply || !report) return { kind: 'pending' };
  if (report.disabled) return { kind: 'detour-off' };
  const refused = report.refused.find((r) => r.ruleId === draftRule.id);
  if (refused) return { kind: 'refused', label: REASON_LABELS[refused.reason], message: refused.message };
  if (report.applied.some((a) => a.ruleId === draftRule.id)) return { kind: 'applied' };
  if (report.bodies?.some((a) => a.ruleId === draftRule.id)) return { kind: 'applied' };
  if (report.injected?.some((a) => a.ruleId === draftRule.id)) {
    const failure = failures?.find((f) => f.ruleId === draftRule.id && f.at >= report.appliedAt);
    return failure ? { kind: 'failing', message: failure.message, page: failure.page } : { kind: 'applied' };
  }
  return { kind: 'not-applied' };
}

/** True while the latest report predates the last save. */
export const isAwaitingApply = (report: ApplyReport | undefined, savedAt: number | undefined): boolean =>
  savedAt !== undefined && (!report || Date.parse(report.appliedAt) < savedAt);

export const exportFileName = (date: Date): string => `detour-${date.toISOString().slice(0, 10)}.json`;

/** Move a rule to an absolute index within its group (for drag-and-drop). */
export function moveRuleToIndex(ws: Workspace, groupId: string, ruleId: string, toIndex: number): Workspace {
  return mapGroup(ws, groupId, (g) => {
    const from = g.rules.findIndex((r) => r.id === ruleId);
    if (from < 0 || toIndex < 0 || toIndex >= g.rules.length || from === toIndex) return g;
    const next = [...g.rules];
    const [item] = next.splice(from, 1);
    next.splice(toIndex, 0, item!);
    return { ...g, rules: next };
  });
}

// ---------------------------------------------------------------------------------------------
// Options workspace helpers (filter, tabs, status strip, ACTION_INFO)

export type OptionsTab = 'rules' | 'tester' | 'databases' | 'recipes' | 'log';

/** Map location.hash to a workspace tab. Empty / #rules → Rules. */
export function tabFromHash(hash: string): OptionsTab {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (raw === 'tester') return 'tester';
  if (raw === 'databases' || raw === 'db') return 'databases';
  if (raw === 'recipes') return 'recipes';
  if (raw === 'log') return 'log';
  return 'rules';
}

export interface ActionInfo {
  type: Action['type'];
  label: string;
  description: string;
}

export const ACTION_INFO: readonly ActionInfo[] = [
  { type: 'redirect', label: 'Redirect', description: 'Send matching requests to another URL.' },
  { type: 'block', label: 'Block', description: 'Cancel matching requests.' },
  { type: 'modifyHeaders', label: 'Modify Headers', description: 'Add, set, or remove request and response headers.' },
  { type: 'injectJs', label: 'Inject JS', description: 'Run JavaScript on matching pages.' },
  { type: 'injectCss', label: 'Inject CSS', description: 'Insert a stylesheet on matching pages.' },
  { type: 'mock', label: 'Mock Fetch', description: 'Answer fetch/XHR with a fixed response.' },
  { type: 'overrideBody', label: 'Replace Body', description: 'Replace the response body (redirect or in place).' },
  { type: 'serveLocal', label: 'Serve Local', description: 'Serve a file from Local Bridge.' },
];

export function actionInfo(type: Action['type']): ActionInfo {
  return ACTION_INFO.find((a) => a.type === type) ?? ACTION_INFO[0]!;
}

/** Relative time for save-state and match log (“2m ago”, “just now”). */
export function formatRelativeTime(at: number, now = Date.now()): string {
  const sec = Math.round((now - at) / 1000);
  if (sec < 45) return 'just now';
  if (sec < 3600) return `${Math.max(1, Math.round(sec / 60))}m ago`;
  if (sec < 86400) return `${Math.max(1, Math.round(sec / 3600))}h ago`;
  return `${Math.max(1, Math.round(sec / 86400))}d ago`;
}

export type StatusFilter = 'all' | RuleStatus['kind'];
export type ActionFilter = 'all' | Action['type'];

export interface StatusCounts {
  applied: number;
  refused: number;
  unsaved: number;
  off: number;
}

/** Counts for the status strip from draft rules + ruleStatus. */
export function statusCounts(
  draft: Workspace,
  ctx: StatusContext,
): StatusCounts {
  const counts: StatusCounts = { applied: 0, refused: 0, unsaved: 0, off: 0 };
  for (const group of draft.groups) {
    for (const rule of group.rules) {
      const status = ruleStatus(rule, ctx);
      if (status.kind === 'applied') counts.applied += 1;
      else if (status.kind === 'refused' || status.kind === 'failing') counts.refused += 1;
      else if (status.kind === 'unsaved' || status.kind === 'pending') counts.unsaved += 1;
      else if (status.kind === 'off' || status.kind === 'detour-off' || status.kind === 'not-applied') counts.off += 1;
    }
  }
  return counts;
}

/** Visible rule ids per group for the Rules toolbar filters. */
export function filterRules(
  workspace: Workspace,
  query: string,
  actionFilter: ActionFilter,
  statusFilter: StatusFilter,
  ctx: StatusContext,
): Map<string, string[]> {
  const q = query.trim().toLowerCase();
  const result = new Map<string, string[]>();
  for (const group of workspace.groups) {
    const ids: string[] = [];
    for (const rule of group.rules) {
      if (actionFilter !== 'all' && rule.action.type !== actionFilter) continue;
      if (statusFilter !== 'all') {
        const kind = ruleStatus(rule, ctx).kind;
        if (statusFilter === 'refused') {
          if (kind !== 'refused' && kind !== 'failing') continue;
        } else if (statusFilter === 'unsaved') {
          if (kind !== 'unsaved' && kind !== 'pending') continue;
        } else if (statusFilter === 'off') {
          if (kind !== 'off' && kind !== 'detour-off' && kind !== 'not-applied') continue;
        } else if (kind !== statusFilter) continue;
      }
      if (q) {
        const hay = [
          rule.match.pattern,
          group.name,
          actionLabel(rule.action.type),
          actionInfo(rule.action.type).label,
          ruleTargetSummary(rule),
          rule.note ?? '',
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) continue;
      }
      ids.push(rule.id);
    }
    result.set(group.id, ids);
  }
  return result;
}

/** Muted mono target shown on a read-only rule row. */
export function ruleTargetSummary(rule: Rule): string {
  const { action } = rule;
  switch (action.type) {
    case 'redirect':
      return action.to || '…';
    case 'block':
      return 'blocked';
    case 'modifyHeaders': {
      const n = action.request.length + action.response.length;
      return `${n} header${n === 1 ? '' : 's'}`;
    }
    case 'injectJs':
    case 'injectCss':
      return action.source.kind === 'url' ? action.source.url || 'URL' : bodySizeHint(action) || 'code';
    case 'mock':
      return `${action.method} · ${bodySizeHint(action) || 'body'}`;
    case 'overrideBody':
      return bodySizeHint(action) || 'body';
    case 'serveLocal':
      return action.path || '…';
  }
}
