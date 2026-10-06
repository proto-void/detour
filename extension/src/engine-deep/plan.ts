import type { Refusal } from '../engine-core/compile';
import { BRIDGE_PATH_REFUSED, isSafeRelative } from '../local-bridge/paths';
import { compileMatcher } from '../rule-model/match';
import type { Match, ResourceType, Rule, Workspace } from '../rule-model/schema';

const PRINTABLE_ASCII = /^[\x20-\x7e]*$/;

/** One armed body rule, in workspace order (first match wins). */
export interface BodyRule {
  groupId: string;
  ruleId: string;
  match: Match;
  caseSensitive: boolean;
  /** Omitted = every type except main_frame, same as DNR. */
  resourceTypes?: ResourceType[];
  pageDomains?: string[];
  /** Inline replacement. Empty when `bridgePath` is set. */
  body: string;
  /** Relative path inside the bridge folder. The handler reads it when the request arrives. */
  bridgePath?: string;
  contentType?: string;
}

/** CDP Fetch.RequestPattern. `urlPattern` uses `*` / `?` wildcards. */
export interface FetchPattern {
  urlPattern: string;
  requestStage: 'Response';
}

export interface BodyPlan {
  rules: BodyRule[];
  /** Empty when nothing is armed. A single `*` when any rule cannot be narrowed. */
  patterns: FetchPattern[];
  /** True when Fetch must pause every response and the handler filters. */
  broad: boolean;
  refused: Refusal[];
}

/** Escape CDP wildcards that a Detour glob treats as literal. `*` stays a wildcard. */
export function globToFetchUrlPattern(pattern: string): string {
  return pattern.replace(/[\\?]/g, (ch) => `\\${ch}`);
}

const isBroadGlob = (pattern: string) => /^\*+$/.test(pattern);

interface ArmedBody {
  body: string;
  bridgePath?: string;
  contentType?: string;
}

/**
 * Enabled overrideBody rules, in workspace order. When `bridgeInPlace` is set, enabled
 * serveLocal rules are armed here too (the compiler must not also redirect them).
 * Patterns are hints for Chrome's Fetch.enable; the handler still matches with the rule's own glob or regex.
 * Pass an empty workspace when Detour is off.
 */
export function planBody(workspace: Workspace, options: { bridgeInPlace?: boolean } = {}): BodyPlan {
  const rules: BodyRule[] = [];
  const refused: Refusal[] = [];
  const narrowed: string[] = [];
  let broad = false;

  const arm = (groupId: string, rule: Rule, pageDomains: string[] | undefined, fields: ArmedBody) => {
    const ids = { groupId, ruleId: rule.id };
    if (!PRINTABLE_ASCII.test(rule.match.pattern)) {
      refused.push({
        ...ids,
        reason: 'non-ascii-pattern',
        message: 'Patterns must be ASCII: percent-encode paths and use punycode for hostnames',
      });
      return;
    }
    try {
      compileMatcher(rule.match, rule.caseSensitive ?? false);
    } catch (e) {
      refused.push({ ...ids, reason: 'unsupported-regex', message: e instanceof Error ? e.message : String(e) });
      return;
    }
    rules.push({
      ...ids,
      match: rule.match,
      caseSensitive: rule.caseSensitive ?? false,
      ...(rule.resourceTypes && { resourceTypes: rule.resourceTypes }),
      ...(pageDomains && { pageDomains }),
      body: fields.body,
      ...(fields.bridgePath && { bridgePath: fields.bridgePath }),
      ...(fields.contentType && { contentType: fields.contentType }),
    });
    if (rule.match.kind === 'regex' || isBroadGlob(rule.match.pattern)) broad = true;
    else narrowed.push(globToFetchUrlPattern(rule.match.pattern));
  };

  for (const group of workspace.groups) {
    if (!group.enabled) continue;
    for (const rule of group.rules) {
      if (!rule.enabled) continue;
      if (rule.action.type === 'overrideBody') {
        arm(group.id, rule, group.pageDomains, {
          body: rule.action.body,
          ...(rule.action.contentType && { contentType: rule.action.contentType }),
        });
      } else if (options.bridgeInPlace && rule.action.type === 'serveLocal') {
        if (!isSafeRelative(rule.action.path)) {
          refused.push({ groupId: group.id, ruleId: rule.id, reason: 'invalid-bridge-path', message: BRIDGE_PATH_REFUSED });
          continue;
        }
        arm(group.id, rule, group.pageDomains, { body: '', bridgePath: rule.action.path });
      }
    }
  }

  const patterns: FetchPattern[] = rules.length === 0 ? [] : broad ? [{ urlPattern: '*', requestStage: 'Response' }] : [...new Set(narrowed)].map((urlPattern) => ({ urlPattern, requestStage: 'Response' as const }));
  return { rules, patterns, broad: rules.length > 0 && broad, refused };
}
