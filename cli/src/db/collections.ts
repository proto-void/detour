import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

export type QueryCollectionFile = {
  v: 1;
  id: string;
  name: string;
  folders: Array<{
    id: string;
    name: string;
    queries: Array<{
      id: string;
      name: string;
      body: string;
      description?: string;
      tags?: string[];
      defaultConnectionId?: string;
    }>;
  }>;
};

function defaultDir(): string {
  return join(homedir(), '.detour', 'db-collections');
}

export function collectionsDir(override?: string): string {
  return override ?? defaultDir();
}

export function readCollections(dir?: string): QueryCollectionFile[] {
  const root = collectionsDir(dir);
  if (!existsSync(root)) return [];
  const files = readdirSync(root).filter((f) => f.endsWith('.json'));
  const out: QueryCollectionFile[] = [];
  for (const file of files) {
    try {
      const raw = JSON.parse(readFileSync(join(root, file), 'utf8')) as QueryCollectionFile;
      if (raw?.v === 1 && raw.id && raw.name) out.push(raw);
    } catch {
      /* skip corrupt */
    }
  }
  return out;
}

export function saveCollection(collection: QueryCollectionFile, dir?: string): void {
  const root = collectionsDir(dir);
  mkdirSync(root, { recursive: true });
  const safe = collection.id.replace(/[^a-zA-Z0-9_-]/g, '_');
  const path = join(root, `${safe}.json`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(collection, null, 2)}\n`, 'utf8');
}
