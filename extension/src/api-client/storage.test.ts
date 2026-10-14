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
});
