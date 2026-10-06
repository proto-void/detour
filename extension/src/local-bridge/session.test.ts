import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { createFakeDnr } from '../test/fake-dnr';
import { saveWorkspace } from '../rule-model/storage';
import type { Workspace } from '../rule-model/schema';
import { syncRules } from '../engine-core/apply';
import { bridgeFileUrl } from './paths';
import { BRIDGE_SESSION_KEY, clearBridgeSession, establishBridge, loadBridgeSession, probeBridge, saveBridgeSession } from './session';

const TOKEN = 'cd'.repeat(32);
const fixedNow = () => new Date('2026-10-07T00:00:00Z');

const workspace = (): Workspace => ({
  groups: [
    {
      id: 'g',
      name: 'Disk',
      enabled: true,
      rules: [
        {
          id: 's',
          enabled: true,
          match: { kind: 'glob', pattern: 'https://cdn.example.com/*.js' },
          action: { type: 'serveLocal', path: 'assets/app.js' },
          resourceTypes: ['script'],
        },
      ],
    },
  ],
});

describe('bridge session', () => {
  beforeEach(() => fakeBrowser.reset());
  const area = fakeBrowser.storage.local;

  it('stores a session only as validated fields and clears it', async () => {
    await saveBridgeSession(area, { port: 47321, token: TOKEN, rootLabel: 'dist' });
    expect(await loadBridgeSession(area)).toEqual({ port: 47321, token: TOKEN, rootLabel: 'dist' });
    await area.set({ [BRIDGE_SESSION_KEY]: { port: 1, token: 'nope', rootLabel: '/Users/me/secret' } });
    expect(await loadBridgeSession(area)).toBeNull();
    await clearBridgeSession(area);
    expect(await loadBridgeSession(area)).toBeNull();
  });
});

describe('probeBridge', () => {
  it('accepts a healthy loopback response and ignores other hosts', async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(String(url));
      return new Response(JSON.stringify({ ok: true, rootLabel: 'dist\n/tmp/secret' }), { status: 200 });
    }) as typeof fetch;
    const ok = await probeBridge({ port: 47321, token: TOKEN }, fetchImpl);
    expect(ok).toEqual({ ok: true, rootLabel: 'dist/tmp/secret' });
    expect(calls).toEqual(['http://127.0.0.1:47321/health']);

    const down = await probeBridge(
      { port: 47321, token: TOKEN },
      (async () => new Response('no', { status: 404 })) as typeof fetch,
    );
    expect(down).toEqual({ ok: false });
  });

  it('connects only after health succeeds', async () => {
    const bad = await establishBridge({ port: '47321', token: 'zz' }, fetch);
    expect(bad.ok).toBe(false);
    const fetchImpl = (async () => new Response(JSON.stringify({ ok: true, rootLabel: 'dist' }), { status: 200 })) as typeof fetch;
    const good = await establishBridge({ port: ' 47321 ', token: TOKEN }, fetchImpl);
    expect(good).toEqual({ ok: true, session: { port: 47321, token: TOKEN, rootLabel: 'dist' } });
  });
});

describe('syncRules with serveLocal', () => {
  beforeEach(() => fakeBrowser.reset());
  const area = fakeBrowser.storage.local;

  it('refuses without connecting and does not install a redirect', async () => {
    const { dnr, rules } = createFakeDnr();
    await saveWorkspace(area, workspace());
    const report = await syncRules(dnr, area, fixedNow);
    expect(rules()).toEqual([]);
    expect(report.refused).toEqual([expect.objectContaining({ ruleId: 's', reason: 'bridge-not-connected' })]);
    expect(JSON.stringify(report)).not.toContain(TOKEN);
  });

  it('redirects when the bridge is up, and refuses when it is down, without logging the token', async () => {
    const { dnr, rules } = createFakeDnr();
    await saveWorkspace(area, workspace());
    await saveBridgeSession(area, { port: 47321, token: TOKEN, rootLabel: 'dist' });
    const up = await syncRules(dnr, area, fixedNow, undefined, undefined, async () => ({ ok: true, rootLabel: 'dist' }));
    expect(up.refused).toEqual([]);
    expect(up.applied.map((row) => row.ruleId)).toEqual(['s']);
    const redirect = rules()[0]?.action;
    expect(redirect).toEqual({ type: 'redirect', redirect: { url: bridgeFileUrl({ port: 47321, token: TOKEN }, 'assets/app.js') } });

    const down = await syncRules(dnr, area, fixedNow, undefined, undefined, async () => ({ ok: false }));
    expect(down.refused.map((row) => row.reason)).toEqual(['bridge-down']);
    expect(rules()).toEqual([]);
    expect(JSON.stringify(down)).not.toContain(TOKEN);
    expect(down.refused[0]?.message).toContain('127.0.0.1:47321');
  });
});
