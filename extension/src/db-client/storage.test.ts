import { describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { loadDbClientState, saveDbClientState } from './storage';
import { defaultDbUiPrefs, emptyDbClientState, migrateConnection, newId } from './model';

describe('db client storage', () => {
  it('round-trips connections without colliding with workspace', async () => {
    const area = fakeBrowser.storage.local;
    await area.clear();
    const state = emptyDbClientState();
    state.connections = [
      migrateConnection({
        id: newId('conn'),
        name: 'Local C*',
        group: 'dev',
        color: '#5b8def',
        environment: 'local',
        engine: 'cassandra',
        target: 'apache',
        host: '127.0.0.1',
        contactPoints: ['127.0.0.1'],
        localDataCenter: 'datacenter1',
        secretAccount: 'db-x',
      }),
    ];
    await saveDbClientState(area, state);
    const bag = await area.get(null);
    expect(bag.workspace).toBeUndefined();
    expect(bag.dbConnections).toHaveLength(1);
    const loaded = await loadDbClientState(area);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(loaded.value.connections[0]?.name).toBe('Local C*');
  });

  it('migrates flat tls on load', async () => {
    const area = fakeBrowser.storage.local;
    await area.clear();
    await area.set({
      dbConnections: [
        {
          id: 'old',
          name: 'Legacy',
          tlsEnabled: true,
          tlsRejectUnauthorized: true,
          ssh: { host: 'bastion', username: 'u', usePassword: true },
        },
      ],
    });
    const loaded = await loadDbClientState(area);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.value.connections[0]?.tls?.mode).toBe('verify-full');
      expect(loaded.value.connections[0]?.ssh?.enabled).toBe(true);
      expect(loaded.value.connections[0]?.ssh?.auth).toBe('password');
    }
  });

  it('persists syncFolder and migrates ui / queryTabs', async () => {
    const area = fakeBrowser.storage.local;
    await area.clear();
    const state = emptyDbClientState();
    state.syncFolder = '/tmp/detour-db-sync';
    state.ui = {
      ...defaultDbUiPrefs(),
      side: 'history',
      sidebarCollapsed: true,
      explorerCollapsed: false,
      explorerScopeByConnectionId: {
        c1: { kind: 'keyspace', keyspace: 'ks', schema: '', database: '', label: 'ks' },
      },
      activeKeyspaceByConnectionId: { c1: 'ks' },
      expandedIdsByConnectionId: { c1: ['ks:ks'] },
    };
    state.queryTabs = [
      {
        id: 'qtab_1',
        name: 'Q1',
        body: 'SELECT 1;',
        connectionId: null,
        collectionQueryId: null,
        resultSets: [],
        activeResultIndex: 0,
        batchMessages: [],
        // Legacy shape — migrateDbClientState should fold into resultSets
        lastResult: {
          columns: ['n'],
          rows: [[1]],
          messages: [],
          warnings: [],
          pageToken: null,
          lastStatement: 'SELECT 1',
        },
      },
    ];
    state.activeQueryTabId = 'qtab_1';
    await saveDbClientState(area, state);
    const bag = (await area.get('dbSettings')) as {
      dbSettings: { syncFolder?: string; queryTabs?: unknown[] };
    };
    expect(bag.dbSettings.syncFolder).toBe('/tmp/detour-db-sync');
    expect(bag.dbSettings.queryTabs).toHaveLength(1);
    const loaded = await loadDbClientState(area);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.value.syncFolder).toBe('/tmp/detour-db-sync');
      expect(loaded.value.ui?.side).toBe('history');
      expect(loaded.value.ui?.sidebarCollapsed).toBe(true);
      expect(loaded.value.ui?.activeKeyspaceByConnectionId?.c1).toBe('ks');
      expect(loaded.value.ui?.expandedIdsByConnectionId?.c1).toEqual(['ks:ks']);
      expect(loaded.value.queryTabs?.[0]?.resultSets?.[0]?.columns).toEqual(['n']);
      expect(loaded.value.queryTabs?.[0]?.lastResult).toBeNull();
      expect(loaded.value.activeQueryTabId).toBe('qtab_1');
    }
  });

  it('migrates missing ui/queryTabs on empty settings', async () => {
    const area = fakeBrowser.storage.local;
    await area.clear();
    await area.set({ dbConnections: [], dbSettings: { idleTimeoutMinutes: 20 } });
    const loaded = await loadDbClientState(area);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.value.idleTimeoutMinutes).toBe(20);
      expect(loaded.value.ui?.side).toBe('connections');
      expect(loaded.value.queryTabs).toEqual([]);
      expect(loaded.value.syncFolder).toBe('');
    }
  });
});
