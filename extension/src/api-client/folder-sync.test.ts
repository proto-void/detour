import { describe, expect, it } from 'vitest';
import { emptyApiClientState } from './model';
import { exportForFolderSync, mergeFolderSyncIntoState } from './folder-sync';

describe('folder-sync', () => {
  it('strips secrets from environments', () => {
    const state = emptyApiClientState();
    state.environments = [
      {
        id: 'e1',
        name: 'Local',
        variables: [{ id: 'v1', key: 'token', initialValue: 'secret', currentValue: 'secret', secret: true, encrypted: null }],
      },
    ];
    const files = exportForFolderSync(state);
    expect(files['environments.json'][0]!.variables[0]!.currentValue).toBe('');
  });

  it('merges files into state', () => {
    const state = emptyApiClientState();
    const next = mergeFolderSyncIntoState(state, {
      'collections.json': [{ id: 'c1', name: 'Imported', description: '', variables: [], children: [] }],
    });
    expect(next.collections[0]?.name).toBe('Imported');
  });
});
