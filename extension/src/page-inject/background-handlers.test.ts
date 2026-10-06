import { describe, expect, it, vi } from 'vitest';
import { handleBridgeMessage, type HandlerDeps } from './background-handlers';
import { loadFailures, MAX_PAGE_FAILURES, recordFailure } from './failures';
import type { PageConfig } from './plan';

const memoryArea = (initial: Record<string, unknown> = {}) => {
  const data: Record<string, unknown> = { ...initial };
  return { data, get: async (k: string) => ({ [k]: data[k] }), set: async (items: Record<string, unknown>) => void Object.assign(data, items) };
};

const page = { source: '.*', flags: '' };
const config: PageConfig = {
  mocks: [],
  styles: [
    { groupId: 'g', ruleId: 'inline', page, runAt: 'document_start', allFrames: false, source: { kind: 'inline', code: 'body{color:red}' } },
    { groupId: 'g', ruleId: 'remote', page, runAt: 'document_start', allFrames: false, source: { kind: 'url', url: 'http://localhost/x.css' } },
  ],
  scripts: [{ groupId: 'g', ruleId: 'script', page, runAt: 'document_start', allFrames: false, url: 'http://localhost/x.js' }],
};
const sender = { tab: { id: 7 }, frameId: 3, url: 'https://app.test/secret/path?q=1' };

function deps(over: Partial<HandlerDeps> = {}) {
  return {
    local: memoryArea({ pageConfig: config }),
    session: memoryArea(),
    insertCSS: vi.fn(async () => {}),
    fetchText: vi.fn(async () => 'h1{}'),
    now: () => new Date('2026-10-06T00:00:00Z'),
    ...over,
  };
}

describe('handleBridgeMessage', () => {
  it('inserts inline CSS into the sending frame, looked up by rule id', async () => {
    const d = deps();
    expect(await handleBridgeMessage({ type: 'detour:insertCss', ruleId: 'inline' }, sender, d)).toBe(true);
    expect(d.insertCSS).toHaveBeenCalledWith({ target: { tabId: 7, frameIds: [3] }, css: 'body{color:red}' });
  });

  it('fetches URL CSS in the background', async () => {
    const d = deps();
    await handleBridgeMessage({ type: 'detour:insertCss', ruleId: 'remote' }, sender, d);
    expect(d.fetchText).toHaveBeenCalledWith('http://localhost/x.css');
    expect(d.insertCSS).toHaveBeenCalledWith(expect.objectContaining({ css: 'h1{}' }));
  });

  it('records fetch and insert failures with the page origin only', async () => {
    const d = deps({ fetchText: vi.fn(async () => Promise.reject(new Error('HTTP 404'))) });
    await handleBridgeMessage({ type: 'detour:insertCss', ruleId: 'remote' }, sender, d);
    expect(await loadFailures(d.session)).toEqual([
      { at: '2026-10-06T00:00:00.000Z', groupId: 'g', ruleId: 'remote', page: 'https://app.test', message: "Couldn't fetch http://localhost/x.css: HTTP 404" },
    ]);
  });

  it('records failures reported by the bridge for known rules only', async () => {
    const d = deps();
    await handleBridgeMessage({ type: 'detour:failure', ruleId: 'script', message: 'blocked by CSP' }, sender, d);
    await handleBridgeMessage({ type: 'detour:failure', ruleId: 'unknown', message: 'x' }, sender, d);
    expect((await loadFailures(d.session)).map((f) => f.ruleId)).toEqual(['script']);
  });

  it('ignores messages that are not from the bridge', async () => {
    const d = deps();
    expect(await handleBridgeMessage({ type: 'other' }, sender, d)).toBe(false);
    expect(await handleBridgeMessage(null, sender, d)).toBe(false);
    expect(await handleBridgeMessage({ type: 'detour:failure', ruleId: 'script' }, sender, d)).toBe(false);
  });

  it('reports a CSS match without the stylesheet text', async () => {
    const notes: unknown[] = [];
    const d = deps({ onMatch: (match) => notes.push(match) });
    await handleBridgeMessage({ type: 'detour:insertCss', ruleId: 'inline' }, sender, d);
    expect(notes).toEqual([{ groupId: 'g', ruleId: 'inline', url: 'https://app.test/secret/path?q=1', tabId: 7, source: 'page' }]);
    expect(JSON.stringify(notes)).not.toContain('color:red');
  });

  it('reports a mock match from the rule id and request URL', async () => {
    const notes: unknown[] = [];
    const local = memoryArea({
      pageConfig: {
        ...config,
        mocks: [{ groupId: 'g', ruleId: 'm', request: page, method: 'GET', status: 200, headers: [], body: '{"nope":true}', delayMs: 0 }],
      },
    });
    const d = deps({ local, onMatch: (match) => notes.push(match) });
    await handleBridgeMessage({ type: 'detour:matched', source: 'mock', ruleId: 'm', url: 'https://app.test/api' }, sender, d);
    expect(notes).toEqual([{ groupId: 'g', ruleId: 'm', url: 'https://app.test/api', tabId: 7, source: 'mock' }]);
    expect(JSON.stringify(notes)).not.toContain('nope');
  });
});

describe('recordFailure', () => {
  it('keeps the newest entries first, capped', async () => {
    const area = memoryArea();
    for (let i = 0; i < MAX_PAGE_FAILURES + 5; i++) await recordFailure(area, { at: String(i), groupId: 'g', ruleId: 'r', page: '', message: '' });
    const list = await loadFailures(area);
    expect(list).toHaveLength(MAX_PAGE_FAILURES);
    expect(list[0]!.at).toBe(String(MAX_PAGE_FAILURES + 4));
  });
});
