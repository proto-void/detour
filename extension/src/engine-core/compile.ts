import { bridgeDownMessage, bridgeFileUrl, BRIDGE_NOT_CONNECTED, serveLocalCompileMessage } from '../local-bridge/paths';
import { countWildcards, globToRegexSource, matchesUrl } from '../rule-model/match';
import { isDnrAction, type HeaderOp, type Rule, type Workspace } from '../rule-model/schema';
import type { DnrAction, DnrCondition, DnrHeaderInfo } from './dnr';

export type RefusalReason =
  | 'non-ascii-pattern'
  | 'invalid-redirect'
  | 'redirect-loop'
  | 'too-many-captures'
  | 'unsupported-regex'
  | 'regex-limit'
  | 'rule-limit'
  | 'browser-rejected'
  | 'user-scripts-unavailable'
  | 'inject-failed'
  | 'body-permission-denied'
  | 'bridge-not-connected'
  | 'bridge-down';

export interface Refusal {
  groupId: string;
  ruleId: string;
  reason: RefusalReason;
  message: string;
}

/** A compiled rule before ids/priorities are assigned; `regex` and `unsafe` feed the quota checks. */
export interface Candidate {
  groupId: string;
  ruleId: string;
  regex: boolean;
  unsafe: boolean;
  action: DnrAction;
  condition: DnrCondition;
}

export type CompiledRule = Omit<Candidate, 'groupId' | 'ruleId'>;
type RuleResult = { ok: true; value: CompiledRule } | { ok: false; reason: RefusalReason; message: string };

const PRINTABLE_ASCII = /^[\x20-\x7e]*$/;
const MAX_SUBSTITUTIONS = 9;

/**
 * `urlFilter` equivalent of a glob, or `undefined` when the glob can't be expressed that way
 * (it contains urlFilter's `|` / `^` operators). An empty condition means "match every URL".
 */
export function globToUrlFilter(pattern: string): { urlFilter?: string } | undefined {
  if (/[|^]/.test(pattern)) return undefined;
  const collapsed = pattern.replace(/\*+/g, '*');
  if (collapsed === '*') return {};
  return { urlFilter: `${collapsed.startsWith('*') ? '' : '|'}${collapsed}${collapsed.endsWith('*') ? '' : '|'}` };
}

/** Glob redirect target → DNR regexSubstitution: wildcards become \1…\n, literal backslashes are doubled. */
export function toRegexSubstitution(target: string): string {
  let n = 0;
  return target.replace(/\\/g, '\\\\').replace(/\*+/g, () => `\\${++n}`);
}

/** `new URL('localhost:5173/x')` parses with scheme "localhost:", so require `scheme://` (or `data:`). */
function isAbsoluteRedirect(target: string): boolean {
  if (!/^([a-z][a-z0-9+.-]*:\/\/|data:)/i.test(target)) return false;
  try {
    new URL(target.replace(/\*+/g, 'x').replace(/\\[0-9]/g, 'x'));
    return true;
  } catch {
    return false;
  }
}

const headerInfos = (ops: HeaderOp[]): DnrHeaderInfo[] =>
  ops.map((op) => (op.op === 'remove' ? { header: op.name, operation: 'remove' } : { header: op.name, operation: op.op, value: op.value }));

/** Network (DNR) rules only; inject/mock rules are compiled by page-inject. */
export function compileRule(rule: Rule): RuleResult {
  const { match, action } = rule;
  if (!isDnrAction(action)) throw new Error(`compileRule: "${action.type}" is not a network rule`);
  const caseSensitive = rule.caseSensitive ?? false;

  if (!PRINTABLE_ASCII.test(match.pattern)) {
    return { ok: false, reason: 'non-ascii-pattern', message: 'Patterns must be ASCII: percent-encode paths and use punycode for hostnames' };
  }

  let captures = 0;
  if (action.type === 'redirect') {
    if (!isAbsoluteRedirect(action.to)) {
      return { ok: false, reason: 'invalid-redirect', message: `Redirect target "${action.to}" must be an absolute URL such as http://localhost:5173/app.js` };
    }
    if (match.kind === 'glob') {
      captures = countWildcards(action.to);
      const available = countWildcards(match.pattern);
      if (captures > available) {
        return { ok: false, reason: 'too-many-captures', message: `Redirect target uses ${captures} wildcard(s) but the pattern only has ${available}` };
      }
      if (captures > MAX_SUBSTITUTIONS) {
        return { ok: false, reason: 'too-many-captures', message: `Redirect targets can reuse at most ${MAX_SUBSTITUTIONS} wildcards` };
      }
    }
    if (captures === 0 && !/\\[0-9]/.test(action.to) && matchesUrl(match, action.to, caseSensitive)) {
      return { ok: false, reason: 'redirect-loop', message: `Redirect target "${action.to}" matches the rule's own pattern, so the browser would loop` };
    }
  }

  let filter: Pick<DnrCondition, 'urlFilter' | 'regexFilter'> | undefined;
  if (match.kind === 'glob') {
    filter = captures === 0 ? globToUrlFilter(match.pattern) : undefined;
    filter ??= { regexFilter: globToRegexSource(match.pattern, captures) };
  } else {
    filter = { regexFilter: match.pattern };
  }

  let dnrAction: DnrAction;
  switch (action.type) {
    case 'block':
      dnrAction = { type: 'block' };
      break;
    case 'redirect':
      dnrAction = {
        type: 'redirect',
        redirect:
          captures > 0
            ? { regexSubstitution: toRegexSubstitution(action.to) }
            : match.kind === 'regex' && /\\[0-9]/.test(action.to)
              ? { regexSubstitution: action.to }
              : { url: action.to },
      };
      break;
    case 'modifyHeaders':
      dnrAction = {
        type: 'modifyHeaders',
        ...(action.request.length > 0 && { requestHeaders: headerInfos(action.request) }),
        ...(action.response.length > 0 && { responseHeaders: headerInfos(action.response) }),
      };
      break;
  }

  return {
    ok: true,
    value: {
      regex: filter.regexFilter !== undefined,
      unsafe: action.type !== 'block',
      action: dnrAction,
      condition: { ...filter, isUrlFilterCaseSensitive: caseSensitive, ...(rule.resourceTypes && { resourceTypes: rule.resourceTypes }) },
    },
  };
}

export interface BridgeCompileState {
  /** Null when the user has not connected. */
  session: { port: number; token: string } | null;
  /** False when /health failed. Ignored when `session` is null. */
  up: boolean;
}

export interface CompileOptions {
  /** Browser accepts the `topDomains` condition (Chrome 145+). */
  topDomains?: boolean;
  /** How `serveLocal` rules compile. Omitted = not connected. */
  bridge?: BridgeCompileState;
}

/**
 * Restricts a compiled rule to pages on `domains`. A page load's own URL is the page, so main_frame
 * is matched by `requestDomains` (as RO compared the tab URL); everything else by the top-level
 * frame where supported, else by initiator. Can split one rule into two DNR rules.
 */
export function scopeToPages(compiled: CompiledRule, domains: string[], { topDomains = false }: CompileOptions = {}): CompiledRule[] {
  const types = compiled.condition.resourceTypes;
  const subresourceTypes = types?.filter((t) => t !== 'main_frame');
  const scoped: CompiledRule[] = [];
  if (types?.includes('main_frame')) {
    scoped.push({ ...compiled, condition: { ...compiled.condition, resourceTypes: ['main_frame'], requestDomains: domains } });
  }
  // Omitted resourceTypes already means "everything except main_frame".
  if (subresourceTypes === undefined || subresourceTypes.length > 0) {
    const { resourceTypes: _, ...rest } = compiled.condition;
    scoped.push({
      ...compiled,
      condition: { ...rest, ...(subresourceTypes && { resourceTypes: subresourceTypes }), [topDomains ? 'topDomains' : 'initiatorDomains']: domains },
    });
  }
  return scoped;
}

/** Enabled groups → enabled rules, in workspace order (which is priority order). */
export function compileWorkspace(workspace: Workspace, options: CompileOptions = {}): { candidates: Candidate[]; refused: Refusal[] } {
  const candidates: Candidate[] = [];
  const refused: Refusal[] = [];
  for (const group of workspace.groups) {
    if (!group.enabled) continue;
    for (const rule of group.rules) {
      if (!rule.enabled) continue;
      const ids = { groupId: group.id, ruleId: rule.id };
      let network = rule;
      if (rule.action.type === 'serveLocal') {
        const session = options.bridge?.session ?? null;
        if (!session) {
          refused.push({ ...ids, reason: 'bridge-not-connected', message: BRIDGE_NOT_CONNECTED });
          continue;
        }
        if (!options.bridge?.up) {
          refused.push({ ...ids, reason: 'bridge-down', message: bridgeDownMessage(session.port) });
          continue;
        }
        const to = bridgeFileUrl(session, rule.action.path);
        if (!to) {
          refused.push({ ...ids, reason: 'bridge-not-connected', message: BRIDGE_NOT_CONNECTED });
          continue;
        }
        network = { ...rule, action: { type: 'redirect', to } };
      } else if (!isDnrAction(rule.action)) {
        continue;
      }
      const result = compileRule(network);
      if (!result.ok) {
        const message = rule.action.type === 'serveLocal' ? serveLocalCompileMessage(result.reason, result.message) : result.message;
        refused.push({ ...ids, reason: result.reason, message });
        continue;
      }
      const compiled = group.pageDomains ? scopeToPages(result.value, group.pageDomains, options) : [result.value];
      for (const c of compiled) candidates.push({ ...ids, ...c });
    }
  }
  return { candidates, refused };
}
