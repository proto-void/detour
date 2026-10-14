import { describe, expect, it } from 'vitest';
import { assertNoSecretsInExport, exportDbBundle, toConnectionTemplate } from './export';
import { migrateConnection, type DbConnection } from './model';

const sample: DbConnection = migrateConnection({
  id: 'c1',
  name: 'Local',
  group: '',
  color: '#fff',
  environment: 'local',
  engine: 'cassandra',
  target: 'apache',
  host: '127.0.0.1',
  contactPoints: ['127.0.0.1'],
  localDataCenter: 'datacenter1',
  username: 'cassandra',
  secretAccount: 'db-c1',
});

describe('export without secrets', () => {
  it('strips secretAccount from templates', () => {
    const t = toConnectionTemplate(sample);
    expect(t.secretAccount).toBeUndefined();
    expect(t.username).toBe('cassandra');
  });

  it('bundle JSON has no password keys', () => {
    const json = exportDbBundle({
      connections: [sample],
      collections: [{ id: 'col1', name: 'Demo', folders: [] }],
      history: [],
      idleTimeoutMinutes: 15,
      syncFolder: '',
    });
    expect(assertNoSecretsInExport(json)).toEqual({ ok: true });
    expect(json.includes('secretAccount')).toBe(false);
  });
});
