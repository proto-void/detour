import { describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { loadDbClientState, saveDbClientState } from './storage';
import { emptyDbClientState, migrateConnection, newId } from './model';

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
});
