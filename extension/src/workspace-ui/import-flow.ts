import type { ImportNotice } from '../rule-model/ro-import';
import { loadWorkspace, saveWorkspace, type StorageAreaLike } from '../rule-model/storage';
import { findSourceMatch, importWorkspace, mergeImported, sha256Hex, type ImportResult } from '../rule-model/transfer';

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
  | { ok: false; errors: string[]; cancelled?: boolean };

/** Asked when only the file name matches an earlier import (different content). */
export type NameOnlyChoice = 'replace' | 'new' | 'cancel';

export interface ImportIntoStorageOptions {
  fileName: string;
  newId?: () => string;
  /** Defaults to importing as new groups, so nothing is overwritten without asking. */
  onNameOnlyMatch?: (info: { file: string; groups: number }) => Promise<NameOnlyChoice>;
}

/**
 * Parses an export file, merges it into the stored workspace and saves; the background then applies it.
 * Identical content replaces the earlier import silently; a same-named file with different content asks.
 */
export async function importIntoStorage(
  text: string,
  area: StorageAreaLike,
  { fileName, newId = () => crypto.randomUUID(), onNameOnlyMatch = async () => 'new' }: ImportIntoStorageOptions,
): Promise<ImportSummary> {
  const imported = importWorkspace(text, { newId });
  if (!imported.ok) return imported;

  const current = await loadWorkspace(area);
  if (!current.ok) {
    return { ok: false, errors: ['Your saved workspace is unreadable, so nothing was imported (to avoid overwriting it).', ...current.errors] };
  }
  const source = { file: fileName, sha256: await sha256Hex(text) };
  const match = findSourceMatch(current.value, source);
  let mode: 'replace' | 'append' = 'replace';
  if (match.kind === 'name') {
    const choice = await onNameOnlyMatch({ file: fileName, groups: match.groups });
    if (choice === 'cancel') return { ok: false, cancelled: true, errors: ['Import cancelled. Nothing was changed.'] };
    mode = choice === 'replace' ? 'replace' : 'append';
  }

  // Re-read: the user may have taken a while to answer, and another page may have saved meanwhile.
  const latest = match.kind === 'name' ? await loadWorkspace(area) : current;
  if (!latest.ok) return { ok: false, errors: latest.errors };
  const merged = mergeImported(latest.value, imported.workspace, source, newId, mode);
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
