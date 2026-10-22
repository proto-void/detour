import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { Workspace } from './schema';
import { AUTOSAVE_KEY, loadAutosave, loadWorkspace, saveAutosave, saveWorkspace, WORKSPACE_KEY } from './storage';

const area = fakeBrowser.storage.local;

const workspace: Workspace = {
  groups: [
    {
      id: 'g1',
      name: 'Local dev',
      enabled: true,
      rules: [
        {
          id: 'r1',
          enabled: true,
          match: { kind: 'glob', pattern: 'https://cdn.example.com/*' },
          action: { type: 'redirect', to: 'http://localhost:5173/*' },
        },
      ],
    },
  ],
};

describe('workspace storage', () => {
  beforeEach(() => fakeBrowser.reset());

  it('loads an empty workspace when nothing is stored', async () => {
    expect(await loadWorkspace(area)).toEqual({ ok: true, value: { groups: [] } });
  });

  it('round-trips through storage.local inside a versioned envelope', async () => {
    expect((await saveWorkspace(area, workspace)).ok).toBe(true);
    expect(await area.get(WORKSPACE_KEY)).toEqual({ [WORKSPACE_KEY]: { v: 1, data: workspace } });
    expect(await loadWorkspace(area)).toEqual({ ok: true, value: workspace });
  });

  it('refuses to save an invalid workspace and keeps the previous one', async () => {
    await saveWorkspace(area, workspace);
    const bad = { groups: [{ ...workspace.groups[0]!, id: '' }] } as Workspace;
    const result = await saveWorkspace(area, bad);
    expect(result.ok).toBe(false);
    expect(await loadWorkspace(area)).toEqual({ ok: true, value: workspace });
  });

  it('reports corrupt stored data without overwriting it', async () => {
    await area.set({ [WORKSPACE_KEY]: { v: 1, data: { groups: 'nope' } } });
    const result = await loadWorkspace(area);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toMatch(/^Stored workspace is invalid: data\.groups/);
    expect(await area.get(WORKSPACE_KEY)).toEqual({ [WORKSPACE_KEY]: { v: 1, data: { groups: 'nope' } } });
  });
});

describe('autosave preference', () => {
  beforeEach(() => fakeBrowser.reset());

  it('defaults to on when missing', async () => {
    expect(await loadAutosave(area)).toBe(true);
  });

  it('round-trips false and treats only false as off', async () => {
    await saveAutosave(area, false);
    expect(await area.get(AUTOSAVE_KEY)).toEqual({ [AUTOSAVE_KEY]: false });
    expect(await loadAutosave(area)).toBe(false);
    await saveAutosave(area, true);
    expect(await loadAutosave(area)).toBe(true);
  });
});
