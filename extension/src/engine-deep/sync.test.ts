import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { syncRules } from '../engine-core/apply';
import { createFakeDnr } from '../test/fake-dnr';
import { saveEnabled, saveWorkspace } from '../rule-model/storage';
import type { Workspace } from '../rule-model/schema';
import type { DebuggerApi, TabsApi } from './chrome-session';
import { createBodyEngine } from './sync';

const fixedNow = () => new Date('2026-10-06T12:00:00.000Z');

function quietDebugger(): { api: DebuggerApi; tabs: TabsApi; attaches: number } {
  let attaches = 0;
  const api: DebuggerApi = {
    async attach() {
      attaches += 1;
    },
    async detach() {},
    async sendCommand(_target, method) {
      if (method === 'Page.getFrameTree') return { frameTree: { frame: { id: 'main' } } };
      return {};
    },
    onEvent: { addListener() {}, removeListener() {} },
    onDetach: { addListener() {}, removeListener() {} },
  };
  const tabs: TabsApi = {
    async query() {
      return [{ id: 7, url: 'https://app.example.com/' }];
    },
    onUpdated: { addListener() {}, removeListener() {} },
    onRemoved: { addListener() {}, removeListener() {} },
  };
  return {
    api,
    tabs,
    get attaches() {
      return attaches;
    },
  };
}

const secret = 'SECRET-BODY-DO-NOT-LEAK';

const workspace: Workspace = {
  groups: [
    {
      id: 'g',
      name: 'g',
      enabled: true,
      rules: [
        { id: 'r', enabled: true, match: { kind: 'glob', pattern: 'https://cdn.example.com/a.js' }, action: { type: 'redirect', to: 'http://127.0.0.1:9/a.js' }, resourceTypes: ['script'] },
        { id: 'b', enabled: true, match: { kind: 'glob', pattern: 'https://cdn.example.com/b.js' }, action: { type: 'overrideBody', body: secret }, resourceTypes: ['script'] },
      ],
    },
  ],
};

describe('createBodyEngine', () => {
  beforeEach(() => fakeBrowser.reset());

  it('refuses body rules until the debugger permission is granted and never puts the body in the report', async () => {
    const dbg = quietDebugger();
    let granted = false;
    let consented = false;
    const engine = createBodyEngine({
      browser: 'chrome',
      permissions: { async contains() { return granted; } },
      consent: async () => consented,
      chrome: () => ({ debugger: dbg.api, tabs: dbg.tabs }),
    });
    const area = fakeBrowser.storage.local;
    const { dnr } = createFakeDnr();
    await saveEnabled(area, true);
    await saveWorkspace(area, workspace);

    const refused = await syncRules(dnr, area, fixedNow, undefined, engine);
    expect(refused.bodies).toEqual([]);
    expect(refused.applied.map((rule) => rule.ruleId)).toEqual(['r']);
    expect(refused.refused).toEqual([expect.objectContaining({ ruleId: 'b', reason: 'body-permission-denied' })]);
    expect(JSON.stringify(refused)).not.toContain(secret);
    expect(dbg.attaches).toBe(0);

    granted = true;
    const waiting = await syncRules(dnr, area, fixedNow, undefined, engine);
    expect(waiting.bodies).toEqual([]);
    expect(waiting.refused).toEqual([expect.objectContaining({ ruleId: 'b', reason: 'body-permission-denied' })]);
    expect(dbg.attaches).toBe(0);

    consented = true;
    const armed = await syncRules(dnr, area, fixedNow, undefined, engine);
    expect(armed.bodies).toEqual([{ groupId: 'g', ruleId: 'b' }]);
    expect(armed.refused).toEqual([]);
    expect(JSON.stringify(armed)).not.toContain(secret);
    expect(dbg.attaches).toBe(1);
  });

  it('detaches when Detour is off', async () => {
    const dbg = quietDebugger();
    const engine = createBodyEngine({
      browser: 'chrome',
      permissions: { async contains() { return true; } },
      consent: async () => true,
      chrome: () => ({ debugger: dbg.api, tabs: dbg.tabs }),
    });
    const area = fakeBrowser.storage.local;
    const { dnr } = createFakeDnr();
    await saveEnabled(area, false);
    await saveWorkspace(area, workspace);
    const report = await syncRules(dnr, area, fixedNow, undefined, engine);
    expect(report.disabled).toBe(true);
    expect(report.bodies).toEqual([]);
    expect(dbg.attaches).toBe(0);
  });
});
