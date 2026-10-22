import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { emptyApiClientState } from './model';
import {
  API_COLLECTIONS_KEY,
  BODY_PREVIEW_CAP,
  HISTORY_CAP,
  loadApiClientState,
  pushHistory,
  saveApiClientState,
  truncateBody,
} from './storage';
import { WORKSPACE_KEY } from '../rule-model/storage';

const area = fakeBrowser.storage.local;

describe('api-client storage', () => {
  beforeEach(() => fakeBrowser.reset());

  it('loads empty state when nothing is stored', async () => {
    expect(await loadApiClientState(area)).toEqual({ ok: true, value: emptyApiClientState() });
  });

  it('round-trips collections environments and settings without touching workspace', async () => {
    await area.set({ [WORKSPACE_KEY]: { v: 1, data: { groups: [] } } });
    const state = emptyApiClientState();
    state.collections = [{ id: 'c1', name: 'Demo', description: '', variables: [], children: [] }];
    state.applyDetourRules = true;
    expect((await saveApiClientState(area, state)).ok).toBe(true);
    const loaded = await loadApiClientState(area);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.value.collections[0]?.name).toBe('Demo');
    expect((await area.get(WORKSPACE_KEY))[WORKSPACE_KEY]).toEqual({ v: 1, data: { groups: [] } });
    expect((await area.get(API_COLLECTIONS_KEY))[API_COLLECTIONS_KEY]).toBeTruthy();
  });

  it('caps history and truncates bodies', async () => {
    expect(truncateBody('x'.repeat(BODY_PREVIEW_CAP + 10)).endsWith('…[truncated]')).toBe(true);
    for (let i = 0; i < HISTORY_CAP + 5; i++) {
      const result = await pushHistory(area, {
        id: `h${i}`,
        at: i,
        method: 'GET',
        url: `https://example.com/${i}`,
        status: 200,
        timeMs: 1,
        bodyPreview: 'ok',
      });
      expect(result.ok).toBe(true);
    }
    const loaded = await loadApiClientState(area);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.value.history).toHaveLength(HISTORY_CAP);
    expect(loaded.value.history[0]?.url).toBe(`https://example.com/${HISTORY_CAP + 4}`);
  });

  it('defaults applyDetourRules to on', async () => {
    const loaded = await loadApiClientState(area);
    expect(loaded.ok && loaded.value.applyDetourRules).toBe(true);
  });

  it('round-trips autosaveRequests and defaults missing to on', async () => {
    const empty = await loadApiClientState(area);
    expect(empty.ok && empty.value.autosaveRequests).toBe(true);

    const state = emptyApiClientState();
    state.autosaveRequests = false;
    expect((await saveApiClientState(area, state)).ok).toBe(true);
    const loaded = await loadApiClientState(area);
    expect(loaded.ok && loaded.value.autosaveRequests).toBe(false);

    await area.set({
      apiSettings: {
        activeEnvironmentId: null,
        globals: [],
        applyDetourRules: true,
        schedules: [],
      },
    });
    const missing = await loadApiClientState(area);
    expect(missing.ok && missing.value.autosaveRequests).toBe(true);
  });

  it('round-trips optional history name', async () => {
    const result = await pushHistory(area, {
      id: 'h-named',
      at: 1,
      method: 'GET',
      url: 'https://example.com',
      status: 200,
      timeMs: 10,
      bodyPreview: 'ok',
      name: 'Ping',
    });
    expect(result.ok).toBe(true);
    const loaded = await loadApiClientState(area);
    expect(loaded.ok && loaded.value.history[0]?.name).toBe('Ping');
  });
});
