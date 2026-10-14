import type { ApiClientState, Collection, Environment, KvRow } from './model';

export const FOLDER_SYNC_COPY =
  'Sync writes pretty JSON into a local folder so your team can share collections and environments via git. Secrets are excluded. On Firefox, use Export / Import instead (File System Access is limited).';

export interface SyncFiles {
  'collections.json': Collection[];
  'environments.json': Environment[];
  'globals.json': KvRow[];
}

/** Strip encrypted/secret values before writing to disk. */
export function exportForFolderSync(state: ApiClientState): SyncFiles {
  return {
    'collections.json': state.collections,
    'environments.json': state.environments.map((env) => ({
      ...env,
      variables: env.variables.map((v) => ({
        ...v,
        currentValue: v.secret || v.encrypted ? '' : v.currentValue,
        initialValue: v.secret || v.encrypted ? '' : v.initialValue,
        encrypted: null,
      })),
    })),
    'globals.json': state.globals,
  };
}

export function mergeFolderSyncIntoState(state: ApiClientState, files: Partial<SyncFiles>): ApiClientState {
  return {
    ...state,
    collections: files['collections.json'] ?? state.collections,
    environments: files['environments.json'] ?? state.environments,
    globals: files['globals.json'] ?? state.globals,
  };
}

export type DirectoryHandleLike = {
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<{
    createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
    getFile(): Promise<Blob>;
  }>;
};

export async function writeSyncFolder(dir: DirectoryHandleLike, state: ApiClientState): Promise<void> {
  const files = exportForFolderSync(state);
  for (const [name, value] of Object.entries(files)) {
    const handle = await dir.getFileHandle(name, { create: true });
    const writable = await handle.createWritable();
    await writable.write(JSON.stringify(value, null, 2) + '\n');
    await writable.close();
  }
}

export async function readSyncFolder(dir: DirectoryHandleLike): Promise<Partial<SyncFiles>> {
  const out: Partial<SyncFiles> = {};
  for (const name of ['collections.json', 'environments.json', 'globals.json'] as const) {
    try {
      const handle = await dir.getFileHandle(name);
      const text = await (await handle.getFile()).text();
      out[name] = JSON.parse(text) as never;
    } catch {
      /* missing file ok */
    }
  }
  return out;
}

export function supportsFileSystemAccess(): boolean {
  return typeof globalThis !== 'undefined' && 'showDirectoryPicker' in globalThis;
}
