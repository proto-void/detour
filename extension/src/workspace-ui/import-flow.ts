import type { ImportNotice } from '../rule-model/ro-import';
import { loadWorkspace, saveWorkspace, type StorageAreaLike } from '../rule-model/storage';
import { appendImported, importWorkspace, type ImportResult } from '../rule-model/transfer';

export type ImportSummary =
  | {
      ok: true;
      source: Extract<ImportResult, { ok: true }>['source'];
      groups: number;
      rules: number;
      skipped: ImportNotice[];
      warnings: ImportNotice[];
    }
  | { ok: false; errors: string[] };

/** Parses an export file, appends it to the stored workspace and saves; the background then applies it. */
export async function importIntoStorage(text: string, area: StorageAreaLike, newId: () => string = () => crypto.randomUUID()): Promise<ImportSummary> {
  const imported = importWorkspace(text, { newId });
  if (!imported.ok) return imported;

  const current = await loadWorkspace(area);
  if (!current.ok) {
    return { ok: false, errors: ['Your saved workspace is unreadable, so nothing was imported (to avoid overwriting it).', ...current.errors] };
  }
  const saved = await saveWorkspace(area, appendImported(current.value, imported.workspace, newId));
  if (!saved.ok) return saved;

  return {
    ok: true,
    source: imported.source,
    groups: imported.workspace.groups.length,
    rules: imported.workspace.groups.reduce((n, g) => n + g.rules.length, 0),
    skipped: imported.skipped,
    warnings: imported.warnings,
  };
}
