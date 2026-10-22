import { describe, expect, it } from 'vitest';
import {
  addChild,
  createCollection,
  createFolder,
  createRequestNode,
  deleteNode,
  duplicateCollection,
  duplicateNode,
  renameCollection,
  renameNode,
  reorderNode,
  upsertRequest,
} from './collections';

describe('collections tree', () => {
  it('creates rename duplicates and deletes folders and requests', () => {
    let col = createCollection('API');
    const folder = createFolder('Users');
    col = addChild(col, [], folder);
    const req = createRequestNode('List');
    col = addChild(col, [folder.id], req);
    col = renameNode(col, [folder.id], 'Accounts');
    col = renameNode(col, [folder.id, req.id], 'List users');
    expect(col.children[0]).toMatchObject({ kind: 'folder', name: 'Accounts' });
    col = duplicateNode(col, [folder.id, req.id]);
    const folderNode = col.children[0]!;
    expect(folderNode.kind).toBe('folder');
    if (folderNode.kind !== 'folder') return;
    expect(folderNode.children).toHaveLength(2);
    col = deleteNode(col, [folder.id, req.id]);
    const after = col.children[0]!;
    expect(after.kind).toBe('folder');
    if (after.kind !== 'folder') return;
    expect(after.children).toHaveLength(1);
    expect(after.children[0]?.kind === 'request' && after.children[0].request.name).toBe('List users copy');
  });

  it('renames and duplicates collections and upserts requests', () => {
    let col = createCollection('A');
    col = renameCollection(col, 'Beta');
    const copy = duplicateCollection(col);
    expect(copy.name).toBe('Beta copy');
    expect(copy.id).not.toBe(col.id);
    const req = createRequestNode('Ping').request;
    col = upsertRequest(col, req);
    expect(col.children).toHaveLength(1);
    col = upsertRequest(col, { ...req, name: 'Ping 2' });
    expect(col.children).toHaveLength(1);
    expect(col.children[0]?.kind === 'request' && col.children[0].request.name).toBe('Ping 2');
  });

  it('reorders sibling nodes at root and inside folders', () => {
    let col = createCollection('API');
    const a = createRequestNode('A');
    const b = createRequestNode('B');
    const c = createRequestNode('C');
    col = addChild(col, [], a);
    col = addChild(col, [], b);
    col = addChild(col, [], c);
    col = reorderNode(col, [], c.id, 0);
    expect(col.children.map((n) => n.id)).toEqual([c.id, a.id, b.id]);

    const folder = createFolder('F');
    const x = createRequestNode('X');
    const y = createRequestNode('Y');
    col = createCollection('API');
    col = addChild(col, [], folder);
    col = addChild(col, [folder.id], x);
    col = addChild(col, [folder.id], y);
    col = reorderNode(col, [folder.id], y.id, 0);
    const folderNode = col.children[0]!;
    expect(folderNode.kind).toBe('folder');
    if (folderNode.kind !== 'folder') return;
    expect(folderNode.children.map((n) => n.id)).toEqual([y.id, x.id]);
  });
});
