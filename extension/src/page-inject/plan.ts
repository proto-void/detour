import type { Refusal } from '../engine-core/compile';
import { globToRegexSource } from '../rule-model/match';
import type { Group, InjectSource, Rule, Workspace } from '../rule-model/schema';
import type { UrlTest } from './page-match';

export const PAGE_CONFIG_KEY = 'pageConfig';
export const USER_SCRIPT_PREFIX = 'detour-';

/** Shown when an inline JS rule matches but the user-scripts API can't run it. */
export const USER_SCRIPTS_UNAVAILABLE_MESSAGE =
  'Inline JavaScript needs user scripts: turn on "Allow User Scripts" for Detour (Chrome) or grant the permission (Firefox 136+)';

type RunAt = 'document_start' | 'document_end' | 'document_idle';
type Ids = { groupId: string; ruleId: string };

export interface MockEntry extends Ids {
  /** Tested against the absolute request URL; `domains` against the page's site. */
  request: UrlTest;
  method: string;
  status: number;
  headers: { name: string; value: string }[];
  body: string;
  delayMs: number;
}

export interface StyleEntry extends Ids {
  page: UrlTest;
  runAt: RunAt;
  allFrames: boolean;
  source: InjectSource;
}

export interface ScriptUrlEntry extends Ids {
  page: UrlTest;
  runAt: RunAt;
  allFrames: boolean;
  url: string;
}

/** Read by the bridge on every page load; regexes are pre-compiled sources, never re-parsed globs. */
export interface PageConfig {
  mocks: MockEntry[];
  styles: StyleEntry[];
  scripts: ScriptUrlEntry[];
}

export interface UserScriptSpec extends Ids {
  id: string;
  matches: string[];
  js: { code: string }[];
  runAt: RunAt;
  allFrames: boolean;
  world: 'MAIN' | 'USER_SCRIPT';
}

export type InjectedKind = 'js' | 'css' | 'mock';

export interface PagePlan {
  userScripts: UserScriptSpec[];
  config: PageConfig;
  /** Injection order and kinds of rules that will run, for the apply report. */
  injected: (Ids & { kind: InjectedKind })[];
  refused: Refusal[];
  needsBridge: boolean;
  needsMockRuntime: boolean;
}

export interface PlanOptions {
  /** `userScripts` API is usable (Chrome toggle on / Firefox permission granted). */
  userScripts: boolean;
}

export const emptyPageConfig = (): PageConfig => ({ mocks: [], styles: [], scripts: [] });

export function urlTest(rule: Rule, group: Group): UrlTest {
  const { match } = rule;
  return {
    source: match.kind === 'glob' ? globToRegexSource(match.pattern) : match.pattern,
    flags: rule.caseSensitive ? '' : 'i',
    ...(group.pageDomains && { domains: group.pageDomains }),
  };
}

/**
 * Wraps inline code so it only runs where the rule matches. User scripts register on `<all_urls>`
 * because match patterns can't express globs/regexes or top-frame site scoping.
 * Side effect: the code runs in a block, so top-level `let`/`const`/`class` aren't page globals.
 */
export function guardCode(code: string, test: UrlTest, ruleId: string): string {
  return `if ((${GUARD})(${JSON.stringify(test)})) {\n${code}\n}\n//# sourceURL=detour-${encodeURIComponent(ruleId)}.js`;
}

/** Literal source (not Function#toString, which minification can break); mirrors `testUrl` + `siteHost`. */
const GUARD = `(t) => {
  try {
    const l = location, a = l.ancestorOrigins;
    let h = l.hostname;
    if (a && a.length) { try { h = new URL(a[a.length - 1]).hostname; } catch {} }
    if (t.domains && !t.domains.some((d) => h === d || h.endsWith('.' + d))) return false;
    return new RegExp(t.source, t.flags).test(l.href);
  } catch { return false; }
}`;

/** Enabled groups → enabled inject/mock rules, in workspace order. Pass an empty workspace when Detour is off. */
export function planPage(workspace: Workspace, { userScripts }: PlanOptions): PagePlan {
  const plan: PagePlan = { userScripts: [], config: emptyPageConfig(), injected: [], refused: [], needsBridge: false, needsMockRuntime: false };
  for (const group of workspace.groups) {
    if (!group.enabled) continue;
    for (const rule of group.rules) {
      if (!rule.enabled) continue;
      const ids = { groupId: group.id, ruleId: rule.id };
      const { action } = rule;
      if (action.type !== 'injectJs' && action.type !== 'injectCss' && action.type !== 'mock') continue;
      switch (action.type) {
        case 'injectJs':
          if (action.source.kind === 'url') {
            plan.config.scripts.push({ ...ids, page: urlTest(rule, group), runAt: action.runAt, allFrames: action.allFrames, url: action.source.url });
          } else if (!userScripts) {
            plan.refused.push({
              ...ids,
              reason: 'user-scripts-unavailable',
              message: USER_SCRIPTS_UNAVAILABLE_MESSAGE,
            });
            continue;
          } else {
            plan.userScripts.push({
              ...ids,
              id: `${USER_SCRIPT_PREFIX}${rule.id}`,
              matches: ['<all_urls>'],
              js: [{ code: guardCode(action.source.code, urlTest(rule, group), rule.id) }],
              runAt: action.runAt,
              allFrames: action.allFrames,
              world: action.world,
            });
          }
          plan.injected.push({ ...ids, kind: 'js' });
          break;
        case 'injectCss':
          plan.config.styles.push({ ...ids, page: urlTest(rule, group), runAt: action.runAt, allFrames: action.allFrames, source: action.source });
          plan.injected.push({ ...ids, kind: 'css' });
          break;
        case 'mock':
          plan.config.mocks.push({
            ...ids,
            request: urlTest(rule, group),
            method: action.method,
            status: action.status,
            headers: action.headers,
            body: action.body,
            delayMs: action.delayMs,
          });
          plan.injected.push({ ...ids, kind: 'mock' });
          break;
      }
    }
  }
  const { mocks, styles, scripts } = plan.config;
  plan.needsMockRuntime = mocks.length > 0;
  plan.needsBridge = mocks.length + styles.length + scripts.length > 0;
  return plan;
}
