import { emptyWorkspace, parseEnvelope, SCHEMA_VERSION, type ParseResult, type Workspace } from './schema';

export const WORKSPACE_KEY = 'workspace';
/** Global on/off switch; anything but `false` means on. */
export const ENABLED_KEY = 'enabled';
/** Options-page autosave; anything but `false` means on (missing defaults to on). */
export const AUTOSAVE_KEY = 'autosave';

/** The subset of `storage.StorageArea` Detour needs; `browser.storage.local` satisfies it. */
export interface StorageAreaLike {
  get(keys: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

/** Missing data is an empty workspace; invalid data is reported and left untouched for recovery. */
export async function loadWorkspace(area: StorageAreaLike): Promise<ParseResult<Workspace>> {
  const stored = (await area.get(WORKSPACE_KEY))[WORKSPACE_KEY];
  if (stored === undefined) return { ok: true, value: emptyWorkspace() };
  const result = parseEnvelope(stored);
  return result.ok
    ? { ok: true, value: result.value.data }
    : { ok: false, errors: result.errors.map((e) => `Stored workspace is invalid: ${e}`) };
}

export async function loadEnabled(area: StorageAreaLike): Promise<boolean> {
  return (await area.get(ENABLED_KEY))[ENABLED_KEY] !== false;
}

export async function saveEnabled(area: StorageAreaLike, enabled: boolean): Promise<void> {
  await area.set({ [ENABLED_KEY]: enabled });
}

export async function loadAutosave(area: StorageAreaLike): Promise<boolean> {
  return (await area.get(AUTOSAVE_KEY))[AUTOSAVE_KEY] !== false;
}

export async function saveAutosave(area: StorageAreaLike, autosave: boolean): Promise<void> {
  await area.set({ [AUTOSAVE_KEY]: autosave });
}

/** Validates before writing so storage never holds a workspace the engines can't read. */
export async function saveWorkspace(area: StorageAreaLike, workspace: Workspace): Promise<ParseResult<Workspace>> {
  const result = parseEnvelope({ v: SCHEMA_VERSION, data: workspace });
  if (!result.ok) return result;
  await area.set({ [WORKSPACE_KEY]: result.value });
  return { ok: true, value: result.value.data };
}
