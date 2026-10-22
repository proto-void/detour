import { describe, expect, it, vi } from 'vitest';
import type { Action, Workspace } from '../rule-model/schema';
import { planPage, type PagePlan } from './plan';
import { BRIDGE_ID, MOCK_RUNTIME_ID, syncPage, userScriptsAvailable, type PageApi } from './sync';

const memoryArea = () => {
  const data: Record<string, unknown> = {};
  return { data, get: async (k: string) => ({ [k]: data[k] }), set: async (items: Record<string, unknown>) => void Object.assign(data, items) };
};

function fakeApi({ userScripts = true }: { userScripts?: boolean } = {}) {
  const content = new Map<string, unknown>();
  const user = new Map<string, unknown>();
  const api = {
    scripting: {
      getRegisteredContentScripts: vi.fn(async ({ ids }: { ids?: string[] } = {}) => [...content.keys()].filter((id) => !ids || ids.includes(id)).map((id) => ({ id }))),
      registerContentScripts: vi.fn(async (scripts: { id: string }[]) => scripts.forEach((s) => content.set(s.id, s))),
      unregisterContentScripts: vi.fn(async ({ ids }: { ids?: string[] } = {}) => (ids ?? [...content.keys()]).forEach((id) => content.delete(id))),
    },
    userScripts: {
      getScripts: vi.fn(async () => {
        if (!userScripts) throw new Error('Not allowed');
        return [...user.keys()].map((id) => ({ id }));
      }),
      register: vi.fn(async (scripts: { id: string; js: { code: string }[] }[]) => {
        if (scripts.some((s) => s.js[0]!.code.includes('REJECT'))) throw new Error('bad script');
        scripts.forEach((s) => user.set(s.id, s));
      }),
      unregister: vi.fn(async ({ ids }: { ids?: string[] } = {}) => (ids ?? [...user.keys()]).forEach((id) => user.delete(id))),
    },
  };
  return { api: api as unknown as PageApi & typeof api, content, user };
}

const js = (code: string): Action => ({ type: 'injectJs', source: { kind: 'inline', code }, runAt: 'document_start', allFrames: false, world: 'MAIN' });
const css: Action = { type: 'injectCss', source: { kind: 'inline', code: 'a{}' }, runAt: 'document_start', allFrames: false };
const mock: Action = { type: 'mock', method: 'ANY', status: 200, headers: [], body: '', delayMs: 0 };
const ws = (...actions: Action[]): Workspace => ({
  groups: [{ id: 'g', name: 'g', enabled: true, rules: actions.map((action, i) => ({ id: `r${i}`, enabled: true, match: { kind: 'glob', pattern: '*' }, action })) }],
});
const plan = (w: Workspace, userScripts = true): PagePlan => planPage(w, { userScripts });

describe('syncPage', () => {
  it('writes pageConfig and registers only the scripts that are needed', async () => {
    const { api, content, user } = fakeApi();
    const area = memoryArea();
    const result = await syncPage(api, area, plan(ws(js('x'), css, mock)));
    expect([...content.keys()].sort()).toEqual([BRIDGE_ID, MOCK_RUNTIME_ID]);
    expect(content.get(MOCK_RUNTIME_ID)).toMatchObject({ world: 'MAIN', runAt: 'document_start', allFrames: true, js: ['content-scripts/mock-main.js'] });
    expect(content.get(BRIDGE_ID)).toMatchObject({ world: 'ISOLATED', js: ['content-scripts/bridge.js'] });
    expect([...user.keys()]).toEqual(['detour-r0']);
    expect(user.get('detour-r0')).not.toHaveProperty('groupId');
    expect(area.data.pageConfig).toMatchObject({ styles: [{ ruleId: 'r1' }], mocks: [{ ruleId: 'r2' }] });
    expect(result).toEqual({ injected: expect.any(Array), refused: [], errors: [] });
    expect(result.injected).toHaveLength(3);

    await syncPage(api, area, plan(ws(css)));
    expect([...content.keys()]).toEqual([BRIDGE_ID]);
    expect([...user.keys()]).toEqual([]);

    await syncPage(api, area, plan(ws()));
    expect(content.size).toBe(0);
    expect(area.data.pageConfig).toEqual({ mocks: [], styles: [], scripts: [] });
  });

  it("doesn't re-register scripts that are already in place", async () => {
    const { api } = fakeApi();
    await syncPage(api, memoryArea(), plan(ws(mock)));
    await syncPage(api, memoryArea(), plan(ws(mock)));
    expect(api.scripting.registerContentScripts).toHaveBeenCalledTimes(1);
    expect(api.scripting.unregisterContentScripts).not.toHaveBeenCalled();
  });

  it("leaves other extensions' user scripts alone", async () => {
    const { api, user } = fakeApi();
    user.set('someone-else', {});
    await syncPage(api, memoryArea(), plan(ws(js('x'))));
    expect([...user.keys()].sort()).toEqual(['detour-r0', 'someone-else']);
  });

  it('refuses only the scripts the browser rejects', async () => {
    const { api, user } = fakeApi();
    const result = await syncPage(api, memoryArea(), plan(ws(js('ok'), js('REJECT'))));
    expect([...user.keys()]).toEqual(['detour-r0']);
    expect(result.refused).toEqual([expect.objectContaining({ ruleId: 'r1', reason: 'inject-failed' })]);
    expect(result.injected.map((i) => i.ruleId)).toEqual(['r0']);
  });

  it('reports a registration failure against the rules that depend on it', async () => {
    const { api } = fakeApi();
    api.scripting.registerContentScripts.mockRejectedValueOnce(new Error('boom'));
    const result = await syncPage(api, memoryArea(), plan(ws(js('x'), css)));
    expect(result.errors).toEqual(["Couldn't register Detour's page scripts: boom"]);
    expect(result.refused).toEqual([expect.objectContaining({ ruleId: 'r1', reason: 'inject-failed' })]);
    expect(result.injected.map((i) => i.ruleId)).toEqual(['r0']);
  });

  it('detects user-script availability by calling the API', async () => {
    expect(await userScriptsAvailable(fakeApi().api)).toBe(true);
    expect(await userScriptsAvailable(fakeApi({ userScripts: false }).api)).toBe(false);
    expect(await userScriptsAvailable({ scripting: fakeApi().api.scripting })).toBe(false);
  });
});
