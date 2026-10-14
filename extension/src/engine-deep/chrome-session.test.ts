import { describe, expect, it } from 'vitest';
import { utf8Base64 } from './decide';
import { integrityMetadata } from './sri';
import { createChromeBodySession, type DebuggerApi, type Debuggee, type TabInfo, type TabsApi } from './chrome-session';
import { planBody } from './plan';
import type { Workspace } from '../rule-model/schema';

function fakeDebugger() {
  const attached: number[] = [];
  const attachCalls: number[] = [];
  const detachCalls: number[] = [];
  const commands: { tabId?: number; method: string; params?: object }[] = [];
  let failAttach = false;
  const responseBodies: Record<string, { body: string; base64Encoded: boolean }> = {};
  const eventListeners: ((source: Debuggee, method: string, params?: object) => void)[] = [];
  const detachListeners: ((source: Debuggee, reason: string) => void)[] = [];
  const api: DebuggerApi = {
    async attach(target) {
      attachCalls.push(target.tabId!);
      if (failAttach) throw new Error('Another debugger is already attached');
      attached.push(target.tabId!);
    },
    async detach(target) {
      detachCalls.push(target.tabId!);
      const index = attached.indexOf(target.tabId!);
      if (index >= 0) attached.splice(index, 1);
    },
    async sendCommand(target, method, params) {
      if (failAttach) throw new Error('Not attached');
      commands.push({ tabId: target.tabId, method, params });
      if (method === 'Page.getFrameTree') return { frameTree: { frame: { id: 'main' } } };
      if (method === 'Fetch.getResponseBody') {
        const id = (params as { requestId?: string } | undefined)?.requestId ?? '';
        return responseBodies[id] ?? { body: '', base64Encoded: false };
      }
      return {};
    },
    onEvent: {
      addListener(cb) {
        eventListeners.push(cb);
      },
      removeListener(cb) {
        const index = eventListeners.indexOf(cb);
        if (index >= 0) eventListeners.splice(index, 1);
      },
    },
    onDetach: {
      addListener(cb) {
        detachListeners.push(cb);
      },
      removeListener(cb) {
        const index = detachListeners.indexOf(cb);
        if (index >= 0) detachListeners.splice(index, 1);
      },
    },
  };
  return {
    api,
    attached,
    attachCalls,
    detachCalls,
    commands,
    eventListeners,
    detachListeners,
    setFailAttach(value: boolean) {
      failAttach = value;
    },
    setBody(requestId: string, body: string, base64Encoded = false) {
      responseBodies[requestId] = { body, base64Encoded };
    },
  };
}

function fakeTabs(initial: TabInfo[]) {
  let open = initial;
  const updated: ((tabId: number, info: { url?: string; status?: string }, tab: TabInfo) => void)[] = [];
  const removed: ((tabId: number) => void)[] = [];
  const api: TabsApi = {
    async query() {
      return open.filter((tab) => tab.url?.startsWith('http://') || tab.url?.startsWith('https://'));
    },
    onUpdated: {
      addListener(cb) {
        updated.push(cb);
      },
      removeListener() {},
    },
    onRemoved: {
      addListener(cb) {
        removed.push(cb);
      },
      removeListener() {},
    },
  };
  return {
    api,
    updated,
    removed,
    setOpen(next: TabInfo[]) {
      open = next;
    },
  };
}

const workspace = (body: string): Workspace => ({
  groups: [
    {
      id: 'g',
      name: 'g',
      enabled: true,
      rules: [{ id: 'b', enabled: true, match: { kind: 'glob', pattern: 'https://cdn.example.com/app.js' }, action: { type: 'overrideBody', body, delivery: 'inPlace' }, resourceTypes: ['script'] }],
    },
  ],
});

const pause = (url: string, resourceType: string, extra: object = {}) => ({
  requestId: 'req-1',
  request: { url },
  resourceType,
  frameId: 'main',
  responseStatusCode: 200,
  responseStatusText: 'OK',
  responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }, { name: 'Content-Encoding', value: 'gzip' }],
  ...extra,
});

describe('chrome body session', () => {
  it('does not attach when there are no body rules', async () => {
    const dbg = fakeDebugger();
    const tabs = fakeTabs([{ id: 1, url: 'https://app.example.com/' }]);
    const session = createChromeBodySession(dbg.api, tabs.api);
    await session.apply(planBody({ groups: [] }));
    expect(dbg.attached).toEqual([]);
    expect(dbg.commands).toEqual([]);
  });

  it('attaches to http tabs, fulfills a match, and continues the rest', async () => {
    const dbg = fakeDebugger();
    const tabs = fakeTabs([
      { id: 1, url: 'https://app.example.com/' },
      { id: 2, url: 'chrome://extensions' },
    ]);
    const notes: { groupId: string; ruleId: string; url: string; tabId: number }[] = [];
    const session = createChromeBodySession(dbg.api, tabs.api, (note) => notes.push(note));
    const errors = await session.apply(planBody(workspace('window.A = "LOCAL"')));
    expect(errors).toEqual([]);
    expect(dbg.attached).toEqual([1]);
    expect(dbg.commands.some((command) => command.method === 'Fetch.enable' && JSON.stringify(command.params).includes('"resourceType":"Document"'))).toBe(true);

    dbg.eventListeners[0]?.({ tabId: 1 }, 'Fetch.requestPaused', pause('https://cdn.example.com/app.js', 'Script'));
    dbg.eventListeners[0]?.({ tabId: 1 }, 'Fetch.requestPaused', pause('https://cdn.example.com/other.css', 'Stylesheet', { requestId: 'req-2' }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const fulfill = dbg.commands.find((command) => command.method === 'Fetch.fulfillRequest');
    const continued = dbg.commands.filter((command) => command.method === 'Fetch.continueResponse');
    expect(fulfill?.params).toMatchObject({ requestId: 'req-1', responseCode: 200, body: utf8Base64('window.A = "LOCAL"') });
    expect(JSON.stringify((fulfill?.params as { responseHeaders: { name: string }[] }).responseHeaders).toLowerCase()).not.toContain('content-encoding');
    expect(continued.map((command) => (command.params as { requestId: string }).requestId)).toEqual(['req-2']);
    expect(notes).toEqual([{ groupId: 'g', ruleId: 'b', url: 'https://cdn.example.com/app.js', tabId: 1 }]);
    expect(JSON.stringify(notes)).not.toContain('LOCAL');
  });

  it('detaches when the plan is cleared and stays off a tab the user cancelled', async () => {
    const dbg = fakeDebugger();
    const tabs = fakeTabs([{ id: 1, url: 'https://app.example.com/' }]);
    const session = createChromeBodySession(dbg.api, tabs.api);
    const plan = planBody(workspace('one'));
    await session.apply(plan);
    dbg.detachListeners[0]?.({ tabId: 1 }, 'canceled_by_user');
    await session.apply(plan);
    expect(dbg.attachCalls).toEqual([1]);

    await session.apply(planBody(workspace('two')));
    expect(dbg.attachCalls).toEqual([1, 1]);
    await session.apply(planBody({ groups: [] }));
    expect(dbg.detachCalls).toEqual([1]);
  });

  it('fulfills a local file in place and continues when the bridge read fails', async () => {
    const dbg = fakeDebugger();
    const tabs = fakeTabs([{ id: 1, url: 'https://app.example.com/' }]);
    const notes: { groupId: string; ruleId: string; url: string; tabId: number }[] = [];
    const session = createChromeBodySession(dbg.api, tabs.api, (note) => notes.push(note));
    const token = 'ab'.repeat(32);
    const plan = planBody(
      {
        groups: [
          {
            id: 'g',
            name: 'g',
            enabled: true,
            rules: [{ id: 's', enabled: true, match: { kind: 'glob', pattern: 'https://cdn.example.com/app.js' }, action: { type: 'serveLocal', path: 'assets/app.js' }, resourceTypes: ['script'] }],
          },
        ],
      },
      { bridgeInPlace: true },
    );
    const disk = new Uint8Array([0xff, 0x00]);
    await session.apply(plan, async (filePath) => {
      expect(filePath).toBe('assets/app.js');
      return { ok: true, bytes: disk, contentType: 'application/octet-stream' };
    });
    dbg.eventListeners[0]?.({ tabId: 1 }, 'Fetch.requestPaused', pause('https://cdn.example.com/app.js', 'Script', { responseStatusCode: 404, responseStatusText: 'Not Found' }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    const fulfill = dbg.commands.find((command) => command.method === 'Fetch.fulfillRequest');
    expect(fulfill?.params).toMatchObject({ requestId: 'req-1', responseCode: 200, responsePhrase: 'OK', body: '/wA=' });
    const headers = (fulfill?.params as { responseHeaders: { name: string; value: string }[] }).responseHeaders;
    expect(headers).toContainEqual({ name: 'Content-Type', value: 'application/octet-stream' });
    expect(headers).toContainEqual({ name: 'cache-control', value: 'no-store' });
    expect(JSON.stringify(dbg.commands)).not.toContain(token);
    expect(notes).toEqual([{ groupId: 'g', ruleId: 's', url: 'https://cdn.example.com/app.js', tabId: 1 }]);

    dbg.commands.length = 0;
    await session.apply(plan, async () => ({ ok: false }));
    dbg.eventListeners[0]?.({ tabId: 1 }, 'Fetch.requestPaused', pause('https://cdn.example.com/app.js', 'Script'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(dbg.commands.some((command) => command.method === 'Fetch.fulfillRequest')).toBe(false);
    expect(dbg.commands.map((command) => command.method)).toContain('Fetch.continueResponse');
  });

  it('rewrites integrity on a matching script tag and leaves the sibling hash', async () => {
    const dbg = fakeDebugger();
    const tabs = fakeTabs([{ id: 1, url: 'https://app.example.com/' }]);
    const notes: unknown[] = [];
    const session = createChromeBodySession(dbg.api, tabs.api, (note) => notes.push(note));
    const body = 'window.A = "LOCAL"';
    await session.apply(planBody(workspace(body)));
    const html = '<script src="https://cdn.example.com/app.js" integrity="sha384-old"></script><script src="https://cdn.example.com/other.js" integrity="sha384-keep"></script>';
    dbg.setBody('doc', utf8Base64(html), true);
    dbg.eventListeners[0]?.(
      { tabId: 1 },
      'Fetch.requestPaused',
      pause('https://app.example.com/', 'Document', {
        requestId: 'doc',
        responseHeaders: [
          { name: 'Content-Type', value: 'text/html; charset=utf-8' },
          { name: 'Content-Encoding', value: 'gzip' },
        ],
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 30));
    const fulfill = dbg.commands.find((command) => command.method === 'Fetch.fulfillRequest' && (command.params as { requestId: string }).requestId === 'doc');
    const decoded = Buffer.from((fulfill?.params as { body: string }).body, 'base64').toString('utf8');
    expect(decoded).toContain(`integrity="${await integrityMetadata(new TextEncoder().encode(body))}"`);
    expect(decoded).toContain('integrity="sha384-keep"');
    expect(decoded).toContain('name="detour-sri"');
    expect(decoded).not.toContain(body);
    const headers = (fulfill?.params as { responseHeaders: { name: string; value: string }[] }).responseHeaders;
    expect(headers.map((header) => header.name.toLowerCase())).not.toContain('content-encoding');
    expect(headers).toContainEqual({ name: 'cache-control', value: 'no-store' });
    expect(notes).toEqual([]);

    dbg.commands.length = 0;
    dbg.eventListeners[0]?.(
      { tabId: 1 },
      'Fetch.requestPaused',
      pause('https://app.example.com/plain', 'Document', {
        requestId: 'latin',
        responseHeaders: [{ name: 'Content-Type', value: 'text/html; charset=windows-1252' }],
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(dbg.commands.some((command) => command.method === 'Fetch.getResponseBody')).toBe(false);
    expect(dbg.commands.map((command) => command.method)).toContain('Fetch.continueResponse');
  });

  it('does not steal a tab DevTools already owns', async () => {
    const dbg = fakeDebugger();
    dbg.setFailAttach(true);
    const tabs = fakeTabs([{ id: 1, url: 'https://app.example.com/' }]);
    const session = createChromeBodySession(dbg.api, tabs.api);
    const errors = await session.apply(planBody(workspace('x')));
    expect(errors).toEqual([]);
    expect(dbg.commands.some((command) => command.method === 'Fetch.enable')).toBe(false);
  });
});
