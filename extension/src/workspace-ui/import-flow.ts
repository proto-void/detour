import type { ImportNotice } from '../rule-model/ro-import';
import { loadWorkspace, saveWorkspace, type StorageAreaLike } from '../rule-model/storage';
import { importWorkspace, mergeImported, sha256Hex, type ImportResult } from '../rule-model/transfer';

export type ImportSummary =
  | {
      ok: true;
      source: Extract<ImportResult, { ok: true }>['source'];
      groups: number;
      rules: number;
      /** Groups from an earlier import of the same file that this import replaced. */
      replaced: number;
      skipped: ImportNotice[];
      warnings: ImportNotice[];
    }
  | { ok: false; errors: string[] };

export interface ImportIntoStorageOptions {
  fileName: string;
  newId?: () => string;
}

/** Parses an export file, merges it into the stored workspace and saves; the background then applies it. */
export async function importIntoStorage(
  text: string,
  area: StorageAreaLike,
  { fileName, newId = () => crypto.randomUUID() }: ImportIntoStorageOptions,
): Promise<ImportSummary> {
  const imported = importWorkspace(text, { newId });
  if (!imported.ok) return imported;

  const current = await loadWorkspace(area);
  if (!current.ok) {
    return { ok: false, errors: ['Your saved workspace is unreadable, so nothing was imported (to avoid overwriting it).', ...current.errors] };
  }
  const merged = mergeImported(current.value, imported.workspace, { file: fileName, sha256: await sha256Hex(text) }, newId);
  const saved = await saveWorkspace(area, merged.workspace);
  if (!saved.ok) return saved;

  return {
    ok: true,
    source: imported.source,
    groups: imported.workspace.groups.length,
    rules: imported.workspace.groups.reduce((n, g) => n + g.rules.length, 0),
    replaced: merged.replaced,
    skipped: imported.skipped,
    warnings: imported.warnings,
  };
}
