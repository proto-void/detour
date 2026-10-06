import { describe, expect, it } from 'vitest';
import { APPLY_REPORT_KEY } from '../engine-core/apply';
import { SCHEMA_VERSION } from '../rule-model/schema';
import { ENABLED_KEY, WORKSPACE_KEY, type StorageAreaLike } from '../rule-model/storage';
import { DYNAMIC_RULESET_ID, MATCH_LOG_KEY, SHOW_BADGE_KEY } from './log';
import { startMatchLog, type MatchLogDeps } from './install';

const memory = (initial: Record<string, unknown> = {}): StorageAreaLike & { data: Record<string, unknown> } => {
  const data: Record<string, unknown> = { ...initial };
  return {
    data,
    get: async (key) => ({ [key]: data[key] }),
    set: async (items) => void Object.assign(data, items),
  };
};

const workspace = {
  v: SCHEMA_VERSION,
  data: {
    groups: [
      {
        id: 'g',
        name: 'CDN',
        enabled: true,
        rules: [
          {
            id: 'a',
            enabled: true,
            match: { kind: 'glob' as const, pattern: '*:8001/a.js' },
            action: { type: 'redirect' as const, to: 'http://127.0.0.1:8002/a.js' },
          },
        ],
      },
    ],
  },
};

const report = {
  appliedAt: '2026-10-06T00:00:00.000Z',
  applied: [{ dnrId: 1, groupId: 'g', ruleId: 'a' }],
  refused: [],
  fallback: false,
  disabled: false,
  errors: [],
};

function harness(over: { showBadge?: boolean; enabled?: boolean; debug?: boolean } = {}) {
  const local = memory({
    [WORKSPACE_KEY]: workspace,
    [ENABLED_KEY]: over.enabled !== false,
    [SHOW_BADGE_KEY]: over.showBadge !== false,
    [APPLY_REPORT_KEY]: report,
  });
  const session = memory();
  const badges: { text: string; tabId?: number }[] = [];
  let onDebug: ((info: unknown) => void) | undefined;
  let onUpdated: ((tabId: number, info: { url?: string; status?: string }) => void) | undefined;
  const polls: { tabId: number; minTimeStamp?: number }[] = [];
  let clock = 1_000;
  const deps: MatchLogDeps = {
    dnr: {
      DYNAMIC_RULESET_ID,
      ...(over.debug === false
        ? {}
        : { onRuleMatchedDebug: { addListener(cb: (info: unknown) => void) { onDebug = cb; } } }),
      getMatchedRules: async (filter) => {
        polls.push(filter);
        return {
          rulesMatchedInfo: [
            { rule: { ruleId: 1, rulesetId: DYNAMIC_RULESET_ID }, tabId: filter.tabId, timeStamp: 2_000 },
            { rule: { ruleId: 1, rulesetId: '_session' }, tabId: filter.tabId, timeStamp: 2_000 },
          ],
        };
      },
    },
    action: {
      setBadgeText: async (details) => {
        badges.push(details);
      },
      setBadgeBackgroundColor: async () => {},
    },
    local,
    session,
    tabs: {
      query: async () => [{ id: 3, url: 'http://localhost:8001/page.html' }],
      get: async (tabId) => ({ id: tabId, url: 'http://localhost:8001/page.html' }),
      onUpdated: { addListener(cb) { onUpdated = cb; } },
      onRemoved: { addListener() {} },
    },
    storageEvents: { addListener() {} },
    now: () => new Date(clock),
  };
  const api = startMatchLog(deps);
  return {
    api,
    badges,
    session,
    polls,
    fireDebug: (info: unknown) => onDebug?.(info),
    fireUpdated: (tabId: number, info: { url?: string; status?: string }) => onUpdated?.(tabId, info),
    setClock: (ms: number) => {
      clock = ms;
    },
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const debugInfo = (over: { rulesetId?: string; requestId?: string } = {}) => ({
  request: { url: 'http://localhost:8001/a.js', tabId: 3, requestId: over.requestId ?? 'req-1' },
  rule: { ruleId: 1, rulesetId: over.rulesetId ?? DYNAMIC_RULESET_ID },
});

describe('match log wiring', () => {
  it('logs a DNR debug match with the request URL and sets the badge', async () => {
    const h = harness();
    h.fireDebug(debugInfo());
    await flush();
    const log = h.session.data[MATCH_LOG_KEY] as { url: string; label: string }[];
    expect(log.map((row) => row.url)).toEqual(['http://localhost:8001/a.js']);
    expect(log[0]?.label).toBe('CDN: *:8001/a.js');
    expect(JSON.stringify(log)).not.toContain('8002');
    expect(h.badges.at(-1)).toEqual({ text: '1', tabId: 3 });
  });

  it('ignores a second event for the same request and a session ruleset', async () => {
    const h = harness();
    h.fireDebug(debugInfo());
    h.fireDebug(debugInfo());
    h.fireDebug(debugInfo({ rulesetId: '_session', requestId: 'req-2' }));
    await flush();
    expect(h.session.data[MATCH_LOG_KEY]).toHaveLength(1);
    expect(h.badges.at(-1)?.text).toBe('1');
  });

  it('keeps the log when the badge is off and clears the toolbar text', async () => {
    const h = harness({ showBadge: false });
    h.fireDebug(debugInfo());
    await flush();
    expect(h.session.data[MATCH_LOG_KEY]).toHaveLength(1);
    expect(h.badges.at(-1)).toEqual({ text: '', tabId: 3 });
  });

  it('clears the badge while Detour is off', async () => {
    const h = harness({ enabled: false });
    h.fireDebug(debugInfo());
    await flush();
    expect(h.badges.at(-1)?.text).toBe('');
  });

  it('polls matched rules when a tab finishes loading and stores the tab URL', async () => {
    const h = harness({ debug: false });
    h.fireUpdated(3, { status: 'complete' });
    await flush();
    expect(h.polls.some((call) => call.tabId === 3)).toBe(true);
    const log = h.session.data[MATCH_LOG_KEY] as { url: string; label: string }[];
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ url: 'http://localhost:8001/page.html', label: 'CDN: *:8001/a.js' });
    expect(h.badges.at(-1)?.text).toBe('1');
  });

  it('keeps the request URL when a later poll sees the same rule', async () => {
    const h = harness();
    h.fireDebug(debugInfo());
    await flush();
    h.fireUpdated(3, { status: 'complete' });
    await flush();
    const log = h.session.data[MATCH_LOG_KEY] as { url: string }[];
    expect(log.map((row) => row.url)).toEqual(['http://localhost:8001/a.js']);
  });

  it('keeps the badge when the same document finishes loading', async () => {
    const h = harness();
    h.fireUpdated(3, { url: 'http://localhost:8001/page.html', status: 'loading' });
    h.fireDebug(debugInfo());
    await flush();
    h.setClock(5_000);
    h.fireUpdated(3, { status: 'complete' });
    await flush();
    expect(h.session.data[MATCH_LOG_KEY]).toHaveLength(1);
    expect(h.badges.at(-1)).toEqual({ text: '1', tabId: 3 });
  });

  it('resets the badge count on navigation and keeps the older row', async () => {
    const h = harness();
    h.fireDebug(debugInfo());
    await flush();
    h.setClock(5_000);
    h.fireUpdated(3, { url: 'http://localhost:8001/next.html' });
    await flush();
    expect(h.session.data[MATCH_LOG_KEY]).toHaveLength(1);
    expect(h.badges.at(-1)).toEqual({ text: '', tabId: 3 });
  });

  it('records a body match by rule id and URL, not by the replacement text', async () => {
    const h = harness();
    await h.api.note({ groupId: 'g', ruleId: 'a', url: 'https://cdn.example.com/app.js', tabId: 3, source: 'body' });
    const log = h.session.data[MATCH_LOG_KEY] as { source: string; url: string; label: string }[];
    expect(log[0]).toMatchObject({ source: 'body', url: 'https://cdn.example.com/app.js', label: 'CDN: *:8001/a.js' });
    expect(JSON.stringify(log)).not.toContain('LOCAL');
  });
});
