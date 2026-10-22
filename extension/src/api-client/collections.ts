import { emptyRequest, type ApiRequest, type Collection, type CollectionNode } from './model';

export type TreePath = string[]; // node ids from collection root children down

const newId = () => crypto.randomUUID();

export function createCollection(name = 'New collection'): Collection {
  return { id: newId(), name, description: '', variables: [], children: [] };
}

export function createFolder(name = 'New folder'): Extract<CollectionNode, { kind: 'folder' }> {
  return { kind: 'folder', id: newId(), name, children: [] };
}

export function createRequestNode(name = 'New request'): Extract<CollectionNode, { kind: 'request' }> {
  const request = emptyRequest(newId(), name);
  return { kind: 'request', id: request.id, request };
}

function mapChildren(nodes: CollectionNode[], fn: (nodes: CollectionNode[]) => CollectionNode[]): CollectionNode[] {
  return fn(nodes);
}

function updateAt(
  nodes: CollectionNode[],
  path: TreePath,
  fn: (node: CollectionNode, siblings: CollectionNode[], index: number) => CollectionNode[],
): CollectionNode[] {
  if (path.length === 0) return nodes;
  const [head, ...rest] = path;
  const index = nodes.findIndex((n) => n.id === head);
  if (index < 0) return nodes;
  if (rest.length === 0) return fn(nodes[index]!, nodes, index);
  const node = nodes[index]!;
  if (node.kind !== 'folder') return nodes;
  const nextChildren = updateAt(node.children, rest, fn);
  const copy = [...nodes];
  copy[index] = { ...node, children: nextChildren };
  return copy;
}

export function renameNode(collection: Collection, path: TreePath, name: string): Collection {
  const trimmed = name.trim() || 'Untitled';
  return {
    ...collection,
    children: updateAt(collection.children ?? [], path, (node, siblings, index) => {
      const next = [...siblings];
      if (node.kind === 'folder') next[index] = { ...node, name: trimmed };
      else next[index] = { ...node, request: { ...node.request, name: trimmed } };
      return next;
    }),
  };
}

export function deleteNode(collection: Collection, path: TreePath): Collection {
  return {
    ...collection,
    children: updateAt(collection.children ?? [], path, (_node, siblings, index) => {
      const next = [...siblings];
      next.splice(index, 1);
      return next;
    }),
  };
}

function cloneNode(node: CollectionNode): CollectionNode {
  if (node.kind === 'folder') {
    return {
      kind: 'folder',
      id: newId(),
      name: `${node.name} copy`,
      children: node.children.map(cloneNode),
    };
  }
  const request: ApiRequest = { ...structuredClone(node.request), id: newId(), name: `${node.request.name} copy` };
  return { kind: 'request', id: request.id, request };
}

export function duplicateNode(collection: Collection, path: TreePath): Collection {
  return {
    ...collection,
    children: updateAt(collection.children ?? [], path, (node, siblings, index) => {
      const next = [...siblings];
      next.splice(index + 1, 0, cloneNode(node));
      return next;
    }),
  };
}

/** Insert a node into a folder path (empty path = collection root). */
export function addChild(collection: Collection, parentPath: TreePath, child: CollectionNode): Collection {
  if (parentPath.length === 0) {
    return { ...collection, children: [...(collection.children ?? []), child] };
  }
  return {
    ...collection,
    children: updateAt(collection.children ?? [], parentPath, (node, siblings, index) => {
      if (node.kind !== 'folder') return siblings;
      const next = [...siblings];
      next[index] = { ...node, children: [...node.children, child] };
      return next;
    }),
  };
}

export function renameCollection(collection: Collection, name: string): Collection {
  return { ...collection, name: name.trim() || 'Untitled' };
}

export function duplicateCollection(collection: Collection): Collection {
  return {
    id: newId(),
    name: `${collection.name} copy`,
    description: collection.description ?? '',
    variables: structuredClone(collection.variables ?? []),
    children: (collection.children ?? []).map(cloneNode),
  };
}

export function findRequest(collection: Collection, requestId: string): ApiRequest | null {
  const walk = (nodes: CollectionNode[]): ApiRequest | null => {
    for (const node of nodes) {
      if (node.kind === 'request' && node.request.id === requestId) return node.request;
      if (node.kind === 'folder') {
        const hit = walk(node.children);
        if (hit) return hit;
      }
    }
    return null;
  };
  return walk(collection.children ?? []);
}

export function upsertRequest(collection: Collection, request: ApiRequest): Collection {
  let found = false;
  const walk = (nodes: CollectionNode[]): CollectionNode[] =>
    mapChildren(nodes, (list) =>
      list.map((node) => {
        if (node.kind === 'request' && node.request.id === request.id) {
          found = true;
          return { ...node, id: request.id, request: structuredClone(request) };
        }
        if (node.kind === 'folder') return { ...node, children: walk(node.children) };
        return node;
      }),
    );
  const children = walk(collection.children ?? []);
  if (found) return { ...collection, children };
  return { ...collection, children: [...children, { kind: 'request', id: request.id, request: structuredClone(request) }] };
}

/**
 * Reorder a node among its siblings.
 * `parentPath` empty = collection root children; otherwise path to the parent folder.
 * `toIndex` is the destination index in the sibling list after removal.
 */
export function reorderNode(
  collection: Collection,
  parentPath: TreePath,
  fromId: string,
  toIndex: number,
): Collection {
  const reorder = (nodes: CollectionNode[]): CollectionNode[] => {
    const fromIndex = nodes.findIndex((n) => n.id === fromId);
    if (fromIndex < 0) return nodes;
    const next = [...nodes];
    const [item] = next.splice(fromIndex, 1);
    if (!item) return nodes;
    const clamped = Math.max(0, Math.min(toIndex, next.length));
    next.splice(clamped, 0, item);
    return next;
  };

  if (parentPath.length === 0) {
    return { ...collection, children: reorder(collection.children ?? []) };
  }

  return {
    ...collection,
    children: updateAt(collection.children ?? [], parentPath, (node, siblings, index) => {
      if (node.kind !== 'folder') return siblings;
      const next = [...siblings];
      next[index] = { ...node, children: reorder(node.children) };
      return next;
    }),
  };
}
