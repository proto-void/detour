import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import roV1 from '../rule-model/__fixtures__/ro-v1.json';
import { loadWorkspace, WORKSPACE_KEY } from '../rule-model/storage';
import { serializeExport } from '../rule-model/transfer';
import { importIntoStorage } from './import-flow';

const area = fakeBrowser.storage.local;
const ids = () => {
  let n = 0;
  return () => `n${++n}`;
};

describe('importIntoStorage', () => {
  beforeEach(() => fakeBrowser.reset());

  it('imports an RO export into an empty workspace and reports what happened', async () => {
    const summary = await importIntoStorage(JSON.stringify(roV1), area, ids());
    expect(summary).toMatchObject({ ok: true, source: 'resource-override-v1', groups: 2, rules: 3 });
    if (!summary.ok) return;
    expect(summary.skipped.map((s) => s.code)).toEqual(['file-override-unsupported', 'file-inject-unsupported', 'empty-header-rule']);
    const stored = await loadWorkspace(area);
    expect(stored.ok && stored.value.groups.map((g) => g.name)).toEqual(['*', 'https://app.example.com/*']);
  });

  it('appends on repeat imports with fresh ids instead of colliding', async () => {
    await importIntoStorage(JSON.stringify(roV1), area);
    const first = await loadWorkspace(area);
    if (!first.ok) throw new Error('load failed');
    // Re-importing a Detour export of the same workspace would collide without re-identifying.
    const again = await importIntoStorage(serializeExport(first.value), area);
    expect(again).toMatchObject({ ok: true, source: 'detour', groups: 2 });
    const second = await loadWorkspace(area);
    expect(second.ok && second.value.groups).toHaveLength(4);
  });

  it('returns errors and leaves storage untouched for invalid files', async () => {
    const summary = await importIntoStorage('{}', area);
    expect(summary.ok).toBe(false);
    expect(await area.get(WORKSPACE_KEY)).toEqual({});
  });

  it('refuses to import over an unreadable workspace', async () => {
    await area.set({ [WORKSPACE_KEY]: { v: 1, data: 'broken' } });
    const summary = await importIntoStorage(JSON.stringify(roV1), area);
    expect(summary.ok).toBe(false);
    if (!summary.ok) expect(summary.errors[0]).toMatch(/unreadable/);
    expect((await area.get(WORKSPACE_KEY))[WORKSPACE_KEY]).toEqual({ v: 1, data: 'broken' });
  });
});
