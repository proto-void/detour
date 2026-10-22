import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import roV1 from '../rule-model/__fixtures__/ro-v1.json';
import { loadWorkspace, saveWorkspace, WORKSPACE_KEY } from '../rule-model/storage';
import { serializeExport } from '../rule-model/transfer';
import { importIntoStorage } from './import-flow';

const area = fakeBrowser.storage.local;
const ids = () => {
  let n = 0;
  return () => `n${++n}`;
};
const roText = JSON.stringify(roV1);
const groupNames = async () => {
  const stored = await loadWorkspace(area);
  if (!stored.ok) throw new Error(stored.errors.join());
  return stored.value.groups.map((g) => g.name);
};

describe('importIntoStorage', () => {
  beforeEach(() => fakeBrowser.reset());

  it('imports an RO export into an empty workspace and reports what happened', async () => {
    const summary = await importIntoStorage(roText, area, { fileName: 'ro.json', newId: ids() });
    expect(summary).toMatchObject({ ok: true, source: 'resource-override-v1', groups: 2, rules: 4, replaced: 0 });
    if (!summary.ok) return;
    expect(summary.skipped.map((s) => s.code)).toEqual(['file-inject-unsupported', 'empty-header-rule']);
    expect(await groupNames()).toEqual(['*', 'https://app.example.com/*']);
  });

  it('replaces the groups from a repeat import of the same file instead of duplicating them', async () => {
    await saveWorkspace(area, { groups: [{ id: 'mine', name: 'Mine', enabled: true, rules: [] }] });
    await importIntoStorage(roText, area, { fileName: 'ro.json' });
    const again = await importIntoStorage(roText, area, { fileName: 'ro.json' });
    expect(again).toMatchObject({ ok: true, groups: 2, replaced: 2 });
    expect(await groupNames()).toEqual(['Mine', '*', 'https://app.example.com/*']);
  });

  it('asks before replacing when only the file name matches, and honours each answer', async () => {
    await importIntoStorage(roText, area, { fileName: 'ro.json' });
    const edited = JSON.stringify({ ...roV1, data: roV1.data.slice(0, 1) });
    const asked: unknown[] = [];

    const cancelled = await importIntoStorage(edited, area, { fileName: 'ro.json', onNameOnlyMatch: async (info) => (asked.push(info), 'cancel') });
    expect(asked).toEqual([{ file: 'ro.json', groups: 2 }]);
    expect(cancelled).toMatchObject({ ok: false, cancelled: true });
    expect(await groupNames()).toHaveLength(2);

    const asNew = await importIntoStorage(edited, area, { fileName: 'ro.json', onNameOnlyMatch: async () => 'new' });
    expect(asNew).toMatchObject({ ok: true, replaced: 0 });
    expect(await groupNames()).toHaveLength(3);

    const replaced = await importIntoStorage(edited, area, { fileName: 'ro.json', onNameOnlyMatch: async () => 'replace' });
    expect(replaced).toMatchObject({ ok: true, replaced: 3 });
    expect(await groupNames()).toEqual(['*']);
  });

  it('defaults to importing as new when nobody is asked', async () => {
    await importIntoStorage(roText, area, { fileName: 'ro.json' });
    await importIntoStorage(JSON.stringify({ ...roV1, data: roV1.data.slice(0, 1) }), area, { fileName: 'ro.json' });
    expect(await groupNames()).toHaveLength(3);
  });

  it("keeps the user's group and rule switches across a re-import", async () => {
    await importIntoStorage(roText, area, { fileName: 'ro.json' });
    const before = await loadWorkspace(area);
    if (!before.ok) throw new Error('load failed');
    const [first, second] = before.value.groups;
    await saveWorkspace(area, {
      groups: [
        { ...first!, enabled: false, rules: first!.rules.map((r, i) => (i === 0 ? { ...r, enabled: false } : r)) },
        { ...second!, enabled: true },
      ],
    });

    const changed = JSON.parse(roText);
    changed.data[0].rules[0].replace = 'http://localhost:9999/*.js';
    await importIntoStorage(JSON.stringify(changed), area, { fileName: 'ro.json', onNameOnlyMatch: async () => 'replace' });

    const after = await loadWorkspace(area);
    if (!after.ok) throw new Error('load failed');
    expect(after.value.groups.map((g) => g.enabled)).toEqual([false, true]);
    expect(after.value.groups[0]!.rules[0]).toMatchObject({ enabled: false, action: { to: 'http://localhost:9999/*.js' } });
  });

  it('appends a different file with fresh ids so ids never collide', async () => {
    await importIntoStorage(roText, area, { fileName: 'ro.json' });
    const first = await loadWorkspace(area);
    if (!first.ok) throw new Error('load failed');
    // A Detour export of the same groups reuses their ids; merging must re-identify them.
    const detourText = serializeExport({ groups: first.value.groups.map(({ importedFrom: _, ...g }) => g) });
    const again = await importIntoStorage(detourText, area, { fileName: 'detour-export.json' });
    expect(again).toMatchObject({ ok: true, source: 'detour', groups: 2, replaced: 0 });
    expect(await groupNames()).toHaveLength(4);
  });

  it('returns errors and leaves storage untouched for invalid files', async () => {
    const summary = await importIntoStorage('{}', area, { fileName: 'x.json' });
    expect(summary.ok).toBe(false);
    expect(await area.get(WORKSPACE_KEY)).toEqual({});
  });

  it('refuses to import over an unreadable workspace', async () => {
    await area.set({ [WORKSPACE_KEY]: { v: 1, data: 'broken' } });
    const summary = await importIntoStorage(roText, area, { fileName: 'ro.json' });
    expect(summary.ok).toBe(false);
    if (!summary.ok) expect(summary.errors[0]).toMatch(/unreadable/);
    expect((await area.get(WORKSPACE_KEY))[WORKSPACE_KEY]).toEqual({ v: 1, data: 'broken' });
  });
});
