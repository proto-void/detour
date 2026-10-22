import { APPLY_REPORT_KEY, type ApplyReport } from '../engine-core/apply';
import { ENABLED_KEY, loadEnabled, loadWorkspace, type StorageAreaLike } from '../rule-model/storage';
import {
  appendMatch,
  attributeDnr,
  clipUrl,
  countForTab,
  DYNAMIC_RULESET_ID,
  POLL_KEY_PREFIX,
  formatBadge,
  isLoggableUrl,
  labelsFromWorkspace,
  loadMatches,
  MATCH_LOG_KEY,
  SHOW_BADGE_KEY,
  type MatchEntry,
  type ObservedMatch,
} from './log';

/** Matches can be timestamped slightly before `tabs.onUpdated` reports the new URL. */
const NAV_SLACK_MS = 2000;
/** Packed-build polling must not stall badge updates if the feedback API is slow. */
const POLL_MS = 4000;

export const BADGE_BG = '#0d6e4e';
export const BADGE_FG = '#ffffff';

export interface ActionBadgeApi {
  setBadgeText(details: { text: string; tabId?: number }): Promise<void> | void;
  setBadgeBackgroundColor(details: { color: string; tabId?: number }): Promise<void> | void;
  setBadgeTextColor?(details: { color: string; tabId?: number }): Promise<void> | void;
}

interface PolledRule {
  rule?: { ruleId?: unknown; rulesetId?: unknown };
  tabId?: unknown;
  timeStamp?: unknown;
}

export interface MatchLogDeps {
  dnr: {
    DYNAMIC_RULESET_ID?: string;
    onRuleMatchedDebug?: { addListener(cb: (info: unknown) => void): void };
    getMatchedRules?(filter: { tabId: number; minTimeStamp?: number }): Promise<{ rulesMatchedInfo?: PolledRule[] }>;
  };
  action: ActionBadgeApi;
  local: StorageAreaLike;
  session: StorageAreaLike;
  tabs: {
    query(query: Record<string, unknown>): Promise<{ id?: number; url?: string }[]>;
    get(tabId: number): Promise<{ id?: number; url?: string }>;
    onUpdated: { addListener(cb: (tabId: number, info: { url?: string; status?: string }) => void): void };
    onRemoved: { addListener(cb: (tabId: number) => void): void };
  };
  storageEvents: { addListener(cb: (changes: Record<string, { oldValue?: unknown; newValue?: unknown }>, areaName: string) => void): void };
  now?: () => Date;
}

function parseDebug(info: unknown): { url: string; tabId: number; requestId: string; ruleId: number; rulesetId: string } | undefined {
  const row = info as { request?: { url?: unknown; tabId?: unknown; requestId?: unknown }; rule?: { ruleId?: unknown; rulesetId?: unknown } } | null;
  const url = row?.request?.url;
  const tabId = row?.request?.tabId;
  const requestId = row?.request?.requestId;
  const ruleId = row?.rule?.ruleId;
  const rulesetId = row?.rule?.rulesetId;
  if (typeof url !== 'string' || typeof tabId !== 'number' || typeof requestId !== 'string') return undefined;
  if (typeof ruleId !== 'number' || typeof rulesetId !== 'string') return undefined;
  return { url, tabId, requestId, ruleId, rulesetId };
}

/**
 * Records matches and paints the toolbar badge. Listeners are registered synchronously so a
 * service worker still wakes for them. The log stays in session storage.
 */
export function startMatchLog(deps: MatchLogDeps): { note(match: ObservedMatch): Promise<void> } {
  const rulesetId = deps.dnr.DYNAMIC_RULESET_ID ?? DYNAMIC_RULESET_ID;
  const since = new Map<number, number>();
  const urls = new Map<number, string>();
  const now = () => deps.now?.() ?? new Date();
  let tail = Promise.resolve();
  const run = (job: () => Promise<void>) => {
    tail = tail.then(job, job);
    return tail;
  };

  const navigationFloor = (tabId: number) => Math.max(0, (since.get(tabId) ?? 0) - NAV_SLACK_MS);

  const readContext = async () => {
    const report = (await deps.local.get(APPLY_REPORT_KEY))[APPLY_REPORT_KEY] as ApplyReport | undefined;
    const loaded = await loadWorkspace(deps.local);
    const show = (await deps.local.get(SHOW_BADGE_KEY))[SHOW_BADGE_KEY] !== false;
    const enabled = await loadEnabled(deps.local);
    return {
      owners: report?.applied ?? [],
      labels: labelsFromWorkspace(loaded.ok ? loaded.value : { groups: [] }),
      active: show && enabled,
    };
  };

  const paint = async (tabId: number) => {
    if (tabId < 0) return;
    try {
      const { active } = await readContext();
      if (!active) {
        await deps.action.setBadgeText({ text: '', tabId });
        return;
      }
      const text = formatBadge(true, countForTab(await loadMatches(deps.session), tabId, navigationFloor(tabId)));
      await deps.action.setBadgeText({ text, tabId });
      if (text) {
        await deps.action.setBadgeBackgroundColor({ color: BADGE_BG, tabId });
        await deps.action.setBadgeTextColor?.({ color: BADGE_FG, tabId });
      }
    } catch (e) {
      console.error('Detour: badge update failed', e instanceof Error ? e.message : e);
    }
  };

  const commit = async (entry: MatchEntry | undefined) => {
    if (!entry) return;
    const log = await loadMatches(deps.session);
    const next = appendMatch(log, entry);
    if (next === log) return;
    await deps.session.set({ [MATCH_LOG_KEY]: next });
    await paint(entry.tabId);
  };

  const note = (match: ObservedMatch) =>
    run(async () => {
      if (match.tabId < 0 || !isLoggableUrl(match.url)) return;
      const { labels } = await readContext();
      const at = now();
      await commit({
        at: at.toISOString(),
        atMs: at.getTime(),
        key: `${match.source}:${match.tabId}:${match.groupId}:${match.ruleId}:${match.url}:${at.getTime()}`,
        ruleId: match.ruleId,
        groupId: match.groupId,
        label: labels.get(`${match.groupId}:${match.ruleId}`) ?? match.ruleId,
        url: clipUrl(match.url),
        tabId: match.tabId,
        source: match.source,
      });
    });

  const onDebug = (info: unknown) => {
    const parsed = parseDebug(info);
    if (!parsed) return;
    void run(async () => {
      const ctx = await readContext();
      await commit(
        attributeDnr({
          dnrId: parsed.ruleId,
          rulesetId: parsed.rulesetId,
          expectedRuleset: rulesetId,
          tabId: parsed.tabId,
          url: parsed.url,
          key: `dnr:${parsed.requestId}:${parsed.ruleId}`,
          at: now(),
          owners: ctx.owners,
          labels: ctx.labels,
        }),
      );
    });
  };

  if (typeof deps.dnr.onRuleMatchedDebug?.addListener === 'function') {
    try {
      deps.dnr.onRuleMatchedDebug!.addListener(onDebug);
    } catch (e) {
      console.error('Detour: match listener failed', e instanceof Error ? e.message : e);
    }
  }

  const poll = async (tabId: number) => {
    if (!deps.dnr.getMatchedRules) return;
    let details: { rulesMatchedInfo?: PolledRule[] };
    try {
      details = await Promise.race([
        deps.dnr.getMatchedRules({ tabId, minTimeStamp: navigationFloor(tabId) }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), POLL_MS)),
      ]);
    } catch {
      return;
    }
    let tabUrl = '';
    try {
      tabUrl = (await deps.tabs.get(tabId)).url ?? '';
    } catch {
      return;
    }
    const ctx = await readContext();
    const sinceMs = navigationFloor(tabId);
    const log = await loadMatches(deps.session);
    for (const row of details.rulesMatchedInfo ?? []) {
      const ruleId = row.rule?.ruleId;
      const rowRuleset = row.rule?.rulesetId;
      const stamp = row.timeStamp;
      if (typeof ruleId !== 'number' || typeof rowRuleset !== 'string' || typeof stamp !== 'number') continue;
      const entry = attributeDnr({
        dnrId: ruleId,
        rulesetId: rowRuleset,
        expectedRuleset: rulesetId,
        tabId,
        url: tabUrl,
        key: `${POLL_KEY_PREFIX}${tabId}:${ruleId}:${stamp}`,
        at: new Date(stamp),
        owners: ctx.owners,
        labels: ctx.labels,
      });
      if (!entry) continue;
      const seen = log.some((logged) => logged.tabId === tabId && logged.ruleId === entry.ruleId && logged.groupId === entry.groupId && logged.atMs >= sinceMs - 1000);
      if (seen) continue;
      log.unshift(entry);
      await commit(entry);
    }
  };

  deps.tabs.onUpdated.addListener((tabId, info) => {
    void run(async () => {
      const urlChanged = info.url !== undefined && info.url !== urls.get(tabId);
      if (info.url) urls.set(tabId, info.url);
      if (info.status === 'loading' || (urlChanged && info.status !== 'complete')) since.set(tabId, now().getTime());
      if (info.status === 'complete') {
        const floor = navigationFloor(tabId);
        const logged = await loadMatches(deps.session);
        const hasRequest = logged.some((row) => row.tabId === tabId && row.source === 'dnr' && row.atMs >= floor && !row.key.startsWith(POLL_KEY_PREFIX));
        if (!hasRequest) await poll(tabId);
      }
      if (info.url || info.status === 'complete') await paint(tabId);
    });
  });
  deps.tabs.onRemoved.addListener((tabId) => {
    since.delete(tabId);
    urls.delete(tabId);
  });
  deps.storageEvents.addListener((changes, areaName) => {
    if (areaName === 'local' && (SHOW_BADGE_KEY in changes || ENABLED_KEY in changes)) {
      const badgeOff = SHOW_BADGE_KEY in changes && changes[SHOW_BADGE_KEY]?.newValue === false;
      const disabled = ENABLED_KEY in changes && changes[ENABLED_KEY]?.newValue === false;
      if (badgeOff || disabled) {
        void deps.tabs
          .query({})
          .then((tabs) =>
            Promise.all(
              tabs.map((tab) => (tab.id === undefined ? undefined : Promise.resolve(deps.action.setBadgeText({ text: '', tabId: tab.id })))),
            ),
          )
          .catch(() => {});
        return;
      }
      void run(() => paintAll());
    }
    if (areaName !== 'session' || !(MATCH_LOG_KEY in changes)) return;
    const change = changes[MATCH_LOG_KEY];
    const nextLen = Array.isArray(change?.newValue) ? change.newValue.length : 0;
    const prevLen = Array.isArray(change?.oldValue) ? change.oldValue.length : 0;
    if (nextLen < prevLen) void run(() => paintAll());
  });

  const paintAll = async () => {
    const { active } = await readContext();
    const tabs = await deps.tabs.query({}).catch(() => []);
    for (const tab of tabs) {
      if (tab.id === undefined) continue;
      if (!active || (tab.url !== undefined && !isLoggableUrl(tab.url))) {
        await Promise.resolve(deps.action.setBadgeText({ text: '', tabId: tab.id })).catch(() => {});
        continue;
      }
      await paint(tab.id);
    }
  };
  void run(paintAll);

  return { note };
}
