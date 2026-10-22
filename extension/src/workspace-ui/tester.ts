import { compileRule } from '../engine-core/compile';
import { hostOnDomains, testUrl } from '../page-inject/page-match';
import { USER_SCRIPTS_UNAVAILABLE_MESSAGE, urlTest } from '../page-inject/plan';
import { matchesUrl } from '../rule-model/match';
import { bodyDataUrl } from '../engine-core/body-data-url';
import { isDnrAction, type Group, type HeaderOp, type ResourceType, type Rule, type Workspace } from '../rule-model/schema';
import { isDataUrl, summarizeDataUrl } from '../engine-core/body-data-url';
import { previewMatch } from './editor';

export interface Probe {
  /** Request URL. Blank → idle. */
  url: string;
  /** HTTP method. Default GET. Mocks compare this to their method. */
  method?: string;
  /** Default page load (`main_frame`). Mocks only win for `xmlhttprequest`. */
  resourceType?: ResourceType;
  /** Page the request comes from. Blank = `url`. Ignored for a page load (that URL is the page). */
  pageUrl?: string;
  /** The page is a subframe. Top-frame-only injects do not run. A frame navigation implies this. */
  subframe?: boolean;
  /** Inline JS can run. Default true. */
  userScripts?: boolean;
}

export interface TesterLine {
  groupName: string;
  summary: string;
  outcome: string;
}

export interface TesterView {
  headline: string;
  lines: TesterLine[];
  notes: string[];
}

interface Ctx {
  url: string;
  method: string;
  resourceType: ResourceType;
  pageUrl: string;
  inFrame: boolean;
  userScripts: boolean;
}

interface Ref {
  groupName: string;
  summary: string;
}

interface HeaderHit {
  ref: Ref;
  applied: { side: 'request' | 'response'; op: HeaderOp }[];
}

type RequestHit =
  | { kind: 'redirect'; ref: Ref; to: string }
  | { kind: 'block'; ref: Ref }
  | { kind: 'mock'; ref: Ref; status: number; body: string; method: string }
  | { kind: 'overrideBody'; ref: Ref; contentType?: string }
  | { kind: 'serveLocal'; ref: Ref; path: string };

interface Resolved {
  idle: boolean;
  request: RequestHit | null;
  headers: HeaderHit[];
  page: { ref: Ref; outcome: string }[];
  suppressed: 'redirected' | 'blocked' | null;
  notApplied: { groupName: string; summary: string; message: string }[];
  /** A redirect or block and a body replacement both matched this URL. */
  overlap: boolean;
}

const NULL_BODY = new Set([204, 205, 304]);

const hostnameOf = (url: string): string => {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
};

const summaryOf = (rule: Rule): string => {
  const pattern = rule.match.pattern;
  switch (rule.action.type) {
    case 'redirect':
      return `Redirect ${pattern}`;
    case 'block':
      return `Block ${pattern}`;
    case 'modifyHeaders':
      return `Change headers ${pattern}`;
    case 'injectJs':
      return `Inject JavaScript ${pattern}`;
    case 'injectCss':
      return `Inject CSS ${pattern}`;
    case 'mock':
      return `Mock ${rule.action.method ?? 'ANY'} ${pattern}`;
    case 'overrideBody':
      return (rule.action.delivery ?? 'redirect') === 'inPlace' ? `Replace body ${pattern}` : `Redirect body ${pattern}`;
    case 'serveLocal':
      return `Serve local file ${rule.action.path} for ${pattern}`;
  }
};

/** Omitted `resourceTypes` is DNR's "everything except page loads". */
const resourceMatches = (rule: Rule, type: ResourceType): boolean => (rule.resourceTypes ? rule.resourceTypes.includes(type) : type !== 'main_frame');

const siteMatches = (group: Group, host: string): boolean => !group.pageDomains || (host !== '' && hostOnDomains(host, group.pageDomains));

const urlMatches = (rule: Rule, url: string): boolean => {
  try {
    return matchesUrl(rule.match, url, rule.caseSensitive ?? false);
  } catch {
    return false;
  }
};

const contextOf = (probe: Probe): Ctx | null => {
  const url = probe.url.trim();
  if (url === '') return null;
  const resourceType = probe.resourceType ?? 'main_frame';
  return {
    url,
    method: (probe.method ?? 'GET').toUpperCase(),
    resourceType,
    pageUrl: resourceType === 'main_frame' ? url : probe.pageUrl?.trim() || url,
    inFrame: resourceType !== 'main_frame' && (resourceType === 'sub_frame' || probe.subframe === true),
    userScripts: probe.userScripts ?? true,
  };
};

const describeOp = (op: HeaderOp, side: 'request' | 'response'): string => {
  if (op.op === 'remove') return `removes ${side} ${op.name}`;
  if (op.op === 'append') return `appends ${side} ${op.name}: ${op.value}`;
  return `sets ${side} ${op.name}: ${op.value}`;
};

const sentence = (parts: string[]): string => {
  if (parts.length === 0) return 'Matched, but an earlier rule already changed these headers.';
  const text = parts.join('; ');
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
};

/**
 * Header rules all apply. On one header, the earlier set or remove wins; a later append still applies.
 * `rules` is already in workspace order (earlier = higher priority).
 */
function mergeHeaders(rules: { ref: Ref; request: HeaderOp[]; response: HeaderOp[] }[]): HeaderHit[] {
  const blocked = { request: new Set<string>(), response: new Set<string>() };
  return rules.map((rule) => {
    const applied: HeaderHit['applied'] = [];
    for (const side of ['request', 'response'] as const) {
      for (const op of rule[side]) {
        const key = op.name.toLowerCase();
        if (op.op !== 'append' && blocked[side].has(key)) continue;
        applied.push({ side, op });
        if (op.op !== 'append') blocked[side].add(key);
      }
    }
    return { ref: rule.ref, applied };
  });
}

const mockOutcome = (status: number, body: string, method: string): string => {
  if (method === 'HEAD' || NULL_BODY.has(status)) return `Returns ${status} with no body.`;
  if (body === '') return `Returns ${status} with an empty body.`;
  const shown = body.length > 500 ? `${body.slice(0, 500)}…` : body;
  return `Returns ${status} with body ${JSON.stringify(shown)}.`;
};

const injectOutcome = (rule: Rule): string => {
  const { action } = rule;
  if (action.type === 'injectJs') return action.source.kind === 'url' ? `Injects JavaScript from ${action.source.url}.` : 'Injects JavaScript.';
  if (action.type === 'injectCss') return action.source.kind === 'url' ? `Injects CSS from ${action.source.url}.` : 'Injects CSS.';
  return '';
};

/** Which rule wins for `probe`, using the engines' order, switches, site scope, and action lanes. */
export function resolveProbe(workspace: Workspace, probe: Probe): Resolved {
  const ctx = contextOf(probe);
  if (!ctx) return { idle: true, request: null, headers: [], page: [], suppressed: null, notApplied: [], overlap: false };

  let request: RequestHit | null = null;
  let mock: RequestHit | null = null;
  let overlap = false;
  const headerRules: { ref: Ref; request: HeaderOp[]; response: HeaderOp[] }[] = [];
  const page: Resolved['page'] = [];
  const notApplied: Resolved['notApplied'] = [];

  for (const group of workspace.groups) {
    if (!group.enabled) continue;
    for (const rule of group.rules) {
      if (!rule.enabled) continue;
      const ref: Ref = { groupName: group.name, summary: summaryOf(rule) };
      const { action } = rule;

      if (action.type === 'serveLocal') {
        if (!resourceMatches(rule, ctx.resourceType) || !urlMatches(rule, ctx.url)) continue;
        const host = ctx.resourceType === 'main_frame' ? hostnameOf(ctx.url) : hostnameOf(ctx.pageUrl);
        if (!siteMatches(group, host)) continue;
        if (request?.kind === 'overrideBody') overlap = true;
        if (request) continue;
        request = { kind: 'serveLocal', ref, path: action.path };
        continue;
      }

      if (isDnrAction(action)) {
        if (!resourceMatches(rule, ctx.resourceType) || !urlMatches(rule, ctx.url)) continue;
        const host = ctx.resourceType === 'main_frame' ? hostnameOf(ctx.url) : hostnameOf(ctx.pageUrl);
        if (!siteMatches(group, host)) continue;
        const compiled = compileRule(rule);
        if (!compiled.ok) {
          notApplied.push({ groupName: group.name, summary: ref.summary, message: compiled.message });
          continue;
        }
        if (action.type === 'modifyHeaders') {
          headerRules.push({ ref, request: action.request ?? [], response: action.response ?? [] });
          continue;
        }
        if (request?.kind === 'overrideBody') overlap = true;
        if (request) continue;
        if (action.type === 'block') {
          request = { kind: 'block', ref };
          continue;
        }
        const preview = previewMatch(rule, ctx.url);
        if (preview.kind !== 'match' || preview.outcome !== 'redirect') {
          notApplied.push({ groupName: group.name, summary: ref.summary, message: preview.kind === 'invalid' ? preview.message : "Can't show where this redirect would go." });
          continue;
        }
        request = { kind: 'redirect', ref, to: preview.to };
        continue;
      }

      if (action.type === 'overrideBody') {
        if (!resourceMatches(rule, ctx.resourceType) || !urlMatches(rule, ctx.url)) continue;
        const host = ctx.resourceType === 'main_frame' ? hostnameOf(ctx.url) : hostnameOf(ctx.pageUrl);
        if (!siteMatches(group, host)) continue;
        if (action.delivery === 'redirect') {
          if (request?.kind === 'overrideBody') overlap = true;
          if (request) continue;
          request = {
            kind: 'redirect',
            ref,
            to: bodyDataUrl(action.body, rule.match.pattern, action.contentType),
          };
          continue;
        }
        if (request?.kind === 'redirect' || request?.kind === 'block' || request?.kind === 'serveLocal') {
          overlap = true;
          continue;
        }
        if (request) continue;
        request = { kind: 'overrideBody', ref, ...(action.contentType && { contentType: action.contentType }) };
        continue;
      }

      if (action.type === 'mock') {
        if (mock || ctx.resourceType !== 'xmlhttprequest') continue;
        const wanted = action.method ?? 'ANY';
        if (wanted !== 'ANY' && wanted !== ctx.method) continue;
        if (!testUrl(urlTest(rule, group), ctx.url, hostnameOf(ctx.pageUrl))) continue;
        mock = { kind: 'mock', ref, status: action.status ?? 200, body: action.body ?? '', method: ctx.method };
        continue;
      }

      if (action.type !== 'injectJs' && action.type !== 'injectCss') continue;
      if (ctx.inFrame && !(action.allFrames ?? false)) continue;
      if (!testUrl(urlTest(rule, group), ctx.pageUrl, hostnameOf(ctx.pageUrl))) continue;
      if (action.type === 'injectJs' && action.source.kind === 'inline' && !ctx.userScripts) {
        notApplied.push({ groupName: group.name, summary: ref.summary, message: USER_SCRIPTS_UNAVAILABLE_MESSAGE });
        continue;
      }
      page.push({ ref, outcome: injectOutcome(rule) });
    }
  }

  // A mock answers in the page, so DNR never sees the request.
  if (mock && ctx.resourceType === 'xmlhttprequest') {
    return { idle: false, request: mock, headers: [], page, suppressed: null, notApplied, overlap: false };
  }

  const navigationStopped = ctx.resourceType === 'main_frame' && (request?.kind === 'redirect' || request?.kind === 'block' || request?.kind === 'serveLocal');
  return {
    idle: false,
    request,
    headers: mergeHeaders(headerRules),
    page: navigationStopped ? [] : page,
    // Only mention injects that actually matched and were dropped.
    suppressed: navigationStopped && page.length > 0 ? (request?.kind === 'block' ? 'blocked' : 'redirected') : null,
    notApplied,
    overlap,
  };
}

/** Words for the tester. Group name and outcome are text, not color. */
export function describeResolution(result: Resolved): TesterView {
  if (result.idle) return { headline: 'Paste a URL to see which rule wins.', lines: [], notes: [] };

  const lines: TesterLine[] = [];
  if (result.request?.kind === 'redirect') {
    if (isDataUrl(result.request.to)) {
      lines.push({
        ...result.request.ref,
        outcome: `Body replaced (redirect) → ${summarizeDataUrl(result.request.to)}.`,
      });
    } else {
      lines.push({ ...result.request.ref, outcome: `Redirects to ${result.request.to}.` });
    }
  } else if (result.request?.kind === 'block') {
    lines.push({ ...result.request.ref, outcome: 'Blocks the request.' });
  } else if (result.request?.kind === 'mock') {
    lines.push({ ...result.request.ref, outcome: mockOutcome(result.request.status, result.request.body, result.request.method) });
  } else if (result.request?.kind === 'overrideBody') {
    const type = result.request.contentType ? ` and sets Content-Type to ${result.request.contentType}` : '';
    lines.push({ ...result.request.ref, outcome: `Replaces the response body${type}.` });
  } else if (result.request?.kind === 'serveLocal') {
    lines.push({
      ...result.request.ref,
      outcome: `Serves ${result.request.path} from Local Bridge and keeps this URL when response rewriting is allowed; otherwise it redirects to 127.0.0.1. Connect the bridge or this rule is refused.`,
    });
  }
  for (const header of result.headers) {
    lines.push({ ...header.ref, outcome: sentence(header.applied.map((item) => describeOp(item.op, item.side))) });
  }
  for (const inject of result.page) lines.push({ ...inject.ref, outcome: inject.outcome });

  const notes = result.notApplied.map((item) => `${item.groupName} matches, but is not applied: ${item.message}`);
  if (result.suppressed) notes.push(`Inject rules do not run, because this page is ${result.suppressed}.`);
  if (result.overlap) {
    notes.push('This URL matches both a redirect or block and a body replacement. The earlier rule is shown. On Chrome a redirect can still change the address before the body is replaced.');
  }

  if (lines.length === 0) {
    return { headline: result.notApplied.length > 0 ? 'No rule is applied.' : 'No rule matches.', lines, notes };
  }

  const decisive = result.request?.kind === 'redirect' || result.request?.kind === 'block' || result.request?.kind === 'mock' || result.request?.kind === 'overrideBody' || result.request?.kind === 'serveLocal';
  const onlyHeaders = !result.request && result.page.length === 0;
  const onlyInjects = !result.request && result.headers.length === 0;
  const headline = decisive || lines.length === 1
    ? 'This rule wins.'
    : onlyHeaders
      ? 'These header rules apply.'
      : onlyInjects
        ? 'These rules run on this page.'
        : 'These rules apply.';
  return { headline, lines, notes };
}
