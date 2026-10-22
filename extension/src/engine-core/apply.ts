import { syncSriRuntime } from '../engine-deep/sri-runtime';
import type { BodyEngine, BridgeInPlaceSession } from '../engine-deep/sync';
import { loadBridgeSession, probeBridge, workspaceNeedsBridge, type BridgeSession } from '../local-bridge/session';
import { planPage, type InjectedKind } from '../page-inject/plan';
import { syncPage, userScriptsAvailable, type PageApi } from '../page-inject/sync';
import { emptyWorkspace, type Workspace } from '../rule-model/schema';
import { loadEnabled, loadWorkspace, type StorageAreaLike } from '../rule-model/storage';
import { compileWorkspace, type Candidate, type CompileOptions, type Refusal } from './compile';
import { supportsTopDomains, type DnrApi, type DnrRule } from './dnr';
import { enforceLimits, readLimits } from './limits';

export const APPLY_REPORT_KEY = 'applyReport';

/** Written to storage.local after every refresh; holds ids and reasons only, never rule bodies. */
export interface ApplyReport {
  appliedAt: string;
  applied: { dnrId: number; groupId: string; ruleId: string }[];
  /** Inject/mock rules registered with the browser (absent in reports from before page-inject). */
  injected?: { groupId: string; ruleId: string; kind: InjectedKind }[];
  /** Body-override rules armed in the debugger or Firefox filter. Ids only. */
  bodies?: { groupId: string; ruleId: string }[];
  refused: Refusal[];
  /** True when the batch was rejected without naming a rule and rules were added one by one. */
  fallback: boolean;
  /** Global switch was off, so no rules were installed. */
  disabled: boolean;
  errors: string[];
}

type RegexCheck = { isSupported: boolean; reason?: string };

async function refuseUnsupportedRegex(dnr: DnrApi, candidates: Candidate[]): Promise<{ supported: Candidate[]; refused: Refusal[] }> {
  if (!dnr.isRegexSupported) return { supported: candidates, refused: [] };
  const checks = await Promise.all(
    candidates.map((c): RegexCheck | Promise<RegexCheck> =>
      c.condition.regexFilter === undefined
        ? { isSupported: true }
        : dnr.isRegexSupported!({
            regex: c.condition.regexFilter,
            isCaseSensitive: c.condition.isUrlFilterCaseSensitive ?? false,
            requireCapturing: c.action.type === 'redirect' && 'regexSubstitution' in c.action.redirect,
          }),
    ),
  );
  const supported: Candidate[] = [];
  const refused: Refusal[] = [];
  candidates.forEach((c, i) => {
    const check = checks[i]!;
    if (check.isSupported) supported.push(c);
    else refused.push({ groupId: c.groupId, ruleId: c.ruleId, reason: 'unsupported-regex', message: `The browser rejected this regex (${check.reason ?? 'unsupported'}); DNR uses RE2 syntax` });
  });
  return { supported, refused };
}

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Replaces all dynamic rules with the compiled workspace in one atomic `updateDynamicRules` call.
 * Priority is positional: the first enabled rule of the first enabled group gets the highest value.
 */
export type BridgeProbe = (session: BridgeSession) => Promise<{ ok: boolean }>;

export async function applyWorkspace(dnr: DnrApi, workspace: Workspace, now = () => new Date(), options: CompileOptions = {}): Promise<ApplyReport> {
  const compiled = compileWorkspace(workspace, { topDomains: supportsTopDomains(dnr), ...options });
  const regexChecked = await refuseUnsupportedRegex(dnr, compiled.candidates);
  const { kept, refused: overLimit } = enforceLimits(regexChecked.supported, readLimits(dnr));
  const refused = [...compiled.refused, ...regexChecked.refused, ...overLimit];

  const owners = new Map<number, Candidate>();
  let addRules: DnrRule[] = kept.map((c, i) => {
    owners.set(i + 1, c);
    return { id: i + 1, priority: kept.length - i, action: c.action, condition: c.condition };
  });
  const removeRuleIds = (await dnr.getDynamicRules()).map((r) => r.id);
  const reject = (rule: DnrRule, message: string) => {
    const owner = owners.get(rule.id)!;
    refused.push({ groupId: owner.groupId, ruleId: owner.ruleId, reason: 'browser-rejected', message });
  };

  let fallback = false;
  for (;;) {
    try {
      await dnr.updateDynamicRules({ removeRuleIds, addRules });
      break;
    } catch (e) {
      const message = errorMessage(e);
      const badId = Number(/Rule with id (\d+)/.exec(message)?.[1]);
      const bad = addRules.find((r) => r.id === badId);
      if (bad) {
        reject(bad, message);
        addRules = addRules.filter((r) => r !== bad);
        continue;
      }
      // Rejected without naming a rule (e.g. a quota we mis-estimated): add one by one so what fits still applies.
      fallback = true;
      await dnr.updateDynamicRules({ removeRuleIds });
      const added: DnrRule[] = [];
      for (const rule of addRules) {
        try {
          await dnr.updateDynamicRules({ addRules: [rule] });
          added.push(rule);
        } catch (err) {
          reject(rule, errorMessage(err));
        }
      }
      addRules = added;
      break;
    }
  }

  return {
    appliedAt: now().toISOString(),
    applied: addRules.map((r) => ({ dnrId: r.id, groupId: owners.get(r.id)!.groupId, ruleId: owners.get(r.id)!.ruleId })),
    refused,
    fallback,
    disabled: false,
    errors: [],
  };
}

/**
 * Loads the stored workspace and applies it (network rules, and page rules when `page` is given).
 * When the global switch is off, installs nothing but keeps the workspace. An unreadable workspace
 * leaves the current rules and registrations in place.
 */
export async function syncRules(
  dnr: DnrApi,
  area: StorageAreaLike,
  now = () => new Date(),
  page?: PageApi,
  body?: BodyEngine,
  probe: BridgeProbe = probeBridge,
): Promise<ApplyReport> {
  const enabled = await loadEnabled(area);
  const loaded = enabled ? await loadWorkspace(area) : { ok: true as const, value: emptyWorkspace() };
  let report: ApplyReport;
  if (!loaded.ok) {
    report = { appliedAt: now().toISOString(), applied: [], refused: [], fallback: false, disabled: false, errors: loaded.errors };
  } else {
    let bridge: CompileOptions['bridge'];
    let inPlace: BridgeInPlaceSession | undefined;
    if (workspaceNeedsBridge(loaded.value)) {
      const session = await loadBridgeSession(area);
      const up = session !== null && (await probe(session)).ok;
      const canRewrite = up && session !== null && body !== undefined && (await body.ready());
      bridge = { session, up, inPlace: canRewrite };
      if (canRewrite && session) inPlace = { port: session.port, token: session.token };
    }
    report = { ...(await applyWorkspace(dnr, loaded.value, now, bridge ? { bridge } : {})), disabled: !enabled };
    if (page) {
      const plan = planPage(loaded.value, { userScripts: await userScriptsAvailable(page) });
      const result = await syncPage(page, area, plan);
      report = { ...report, injected: result.injected, refused: [...report.refused, ...result.refused], errors: [...report.errors, ...result.errors] };
    }
    if (body) {
      const result = await body.sync(loaded.value, enabled, inPlace ? { bridge: inPlace, allowed: true } : undefined);
      report = { ...report, bodies: result.bodies, refused: [...report.refused, ...result.refused], errors: [...report.errors, ...result.errors] };
      if (page) {
        const hookError = await syncSriRuntime(page.scripting, result.bodies.length > 0);
        if (hookError) report = { ...report, errors: [...report.errors, `Couldn't register the integrity hook: ${hookError}`] };
      }
    }
  }
  await area.set({ [APPLY_REPORT_KEY]: report });
  return report;
}
