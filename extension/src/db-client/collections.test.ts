import { describe, expect, it } from 'vitest';
import {
  clearCollectionQueryIds,
  collectQueryIdsInCollection,
  defaultSaveLocation,
  deleteQueryFromCollections,
  findQueryInCollections,
  folderIsNonEmpty,
  migrateCollection,
  migrateCollections,
  migrateDbClientState,
  moveQuery,
  renameQueryInCollections,
  upsertQueryAt,
  type DbCollection,
  type DbQueryTab,
} from './model';

const q = (id: string, name = id) => ({
  id,
  name,
  body: 'SELECT 1;',
  description: '',
  tags: [] as string[],
  defaultConnectionId: null as string | null,
});

function sample(): DbCollection[] {
  return [
    {
      id: 'col1',
      name: 'Mine',
      queries: [q('root1', 'Root Q')],
      folders: [
        { id: 'fold1', name: 'General', queries: [q('f1q1', 'In folder')] },
        { id: 'fold2', name: 'Empty', queries: [] },
      ],
    },
  ];
}

describe('migrateCollection', () => {
  it('adds empty queries arrays when missing', () => {
    const col = migrateCollection({
      id: 'c',
      name: 'Old',
      folders: [{ id: 'f', name: 'G', queries: [q('a')] }],
    });
    expect(col.queries).toEqual([]);
    expect(col.folders[0]?.queries).toHaveLength(1);
  });

  it('preserves root queries', () => {
    const col = migrateCollection({
      id: 'c',
      name: 'N',
      queries: [q('r')],
      folders: [],
    });
    expect(col.queries[0]?.id).toBe('r');
  });

  it('migrateDbClientState runs collection migrate', () => {
    const state = migrateDbClientState({
      collections: [{ id: 'c', name: 'X', folders: [{ id: 'f', name: 'F' }] }],
    });
    expect(state.collections[0]?.queries).toEqual([]);
    expect(state.collections[0]?.folders[0]?.queries).toEqual([]);
  });
});

describe('defaultSaveLocation', () => {
  it('prefers first folder when present', () => {
    expect(defaultSaveLocation(sample()[0]!)).toEqual({
      collectionId: 'col1',
      folderId: 'fold1',
    });
  });

  it('uses collection root when no folders', () => {
    const col = migrateCollection({ id: 'c', name: 'N', queries: [], folders: [] });
    expect(defaultSaveLocation(col)).toEqual({ collectionId: 'c', folderId: null });
  });
});

describe('moveQuery / delete / rename', () => {
  it('moves root query into a folder', () => {
    const next = moveQuery(sample(), 'root1', { collectionId: 'col1', folderId: 'fold1' });
    expect(findQueryInCollections(next, 'root1')?.folderId).toBe('fold1');
    expect(next[0]?.queries).toHaveLength(0);
    expect(next[0]?.folders[0]?.queries.map((x) => x.id)).toEqual(['f1q1', 'root1']);
  });

  it('moves folder query to collection root', () => {
    const next = moveQuery(sample(), 'f1q1', { collectionId: 'col1', folderId: null });
    expect(findQueryInCollections(next, 'f1q1')?.folderId).toBeNull();
    expect(next[0]?.queries.map((x) => x.id)).toEqual(['root1', 'f1q1']);
    expect(next[0]?.folders[0]?.queries).toHaveLength(0);
  });

  it('no-ops when target is current location', () => {
    const before = sample();
    const next = moveQuery(before, 'root1', { collectionId: 'col1', folderId: null });
    expect(next).toEqual(before);
  });

  it('deletes a query from root or folder', () => {
    let next = deleteQueryFromCollections(sample(), 'root1');
    expect(findQueryInCollections(next, 'root1')).toBeNull();
    next = deleteQueryFromCollections(sample(), 'f1q1');
    expect(findQueryInCollections(next, 'f1q1')).toBeNull();
  });

  it('renames a query anywhere', () => {
    const next = renameQueryInCollections(sample(), 'f1q1', 'Renamed');
    expect(findQueryInCollections(next, 'f1q1')?.query.name).toBe('Renamed');
  });

  it('upserts at root and folder', () => {
    let next = upsertQueryAt(sample(), { collectionId: 'col1', folderId: null }, q('new'));
    expect(next[0]?.queries.map((x) => x.id)).toContain('new');
    next = upsertQueryAt(next, { collectionId: 'col1', folderId: 'fold2' }, q('new2'));
    expect(next[0]?.folders[1]?.queries[0]?.id).toBe('new2');
  });
});

describe('clearCollectionQueryIds', () => {
  it('nulls tabs that pointed at deleted queries', () => {
    const tabs: DbQueryTab[] = [
      {
        id: 't1',
        name: 'A',
        body: '',
        connectionId: null,
        collectionQueryId: 'f1q1',
        resultSets: [],
        activeResultIndex: 0,
        batchMessages: [],
        lastResult: null,
      },
      {
        id: 't2',
        name: 'B',
        body: '',
        connectionId: null,
        collectionQueryId: 'keep',
        resultSets: [],
        activeResultIndex: 0,
        batchMessages: [],
        lastResult: null,
      },
    ];
    const cleared = clearCollectionQueryIds(tabs, new Set(['f1q1']));
    expect(cleared[0]?.collectionQueryId).toBeNull();
    expect(cleared[1]?.collectionQueryId).toBe('keep');
  });

  it('collectQueryIdsInCollection includes root + folders', () => {
    expect(collectQueryIdsInCollection(sample()[0]!)).toEqual(['root1', 'f1q1']);
  });

  it('folderIsNonEmpty', () => {
    expect(folderIsNonEmpty({ id: 'f', name: 'F', queries: [q('a')] })).toBe(true);
    expect(folderIsNonEmpty({ id: 'f', name: 'F', queries: [] })).toBe(false);
  });
});

describe('migrateCollections', () => {
  it('maps a list', () => {
    expect(migrateCollections([{ id: 'a', name: 'A' }])[0]?.queries).toEqual([]);
  });
});
