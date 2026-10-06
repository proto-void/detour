import { importResourceOverride, type ImportNotice, type RoImport } from './ro-import';
import { parseEnvelope, SCHEMA_VERSION, type Envelope, type Workspace } from './schema';

export type ImportResult =
  | { ok: true; source: 'detour' | RoImport['source']; workspace: Workspace; skipped: ImportNotice[]; warnings: ImportNotice[] }
  | { ok: false; errors: string[] };

export interface ImportOptions {
  newId?: () => string;
}

export const exportWorkspace = (workspace: Workspace): Envelope => ({ v: SCHEMA_VERSION, data: workspace });

export const serializeExport = (workspace: Workspace): string => `${JSON.stringify(exportWorkspace(workspace), null, 2)}\n`;

/** Appends imported groups after the existing ones, re-identifying them so repeat imports never collide. */
export function appendImported(base: Workspace, incoming: Workspace, newId: () => string): Workspace {
  return {
    groups: [...base.groups, ...incoming.groups.map((g) => ({ ...g, id: newId(), rules: g.rules.map((r) => ({ ...r, id: newId() })) }))],
  };
}

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/**
 * Imports a Detour export or a Resource Override export (detected by its array-shaped `data` /
 * `ruleGroups`). Never returns an empty workspace silently: malformed input yields errors.
 */
export function importWorkspace(input: unknown, { newId = () => crypto.randomUUID() }: ImportOptions = {}): ImportResult {
  let value = input;
  if (typeof input === 'string') {
    try {
      value = JSON.parse(input);
    } catch (e) {
      return { ok: false, errors: [`Not valid JSON: ${(e as Error).message}`] };
    }
  }
  if (!isRecord(value)) return { ok: false, errors: ['Expected a JSON object shaped like { "v": 1, "data": … }'] };
  if (Object.keys(value).length === 0) {
    return {
      ok: false,
      errors: ['The file is an empty object ({}). Resource Override MV3 builds before PR #73 exported empty files; re-export from a fixed build.'],
    };
  }

  if (Array.isArray(value.data) || Array.isArray(value.ruleGroups)) {
    const ro = importResourceOverride(value, newId);
    return ro.ok ? { ok: true, ...ro.value } : ro;
  }

  const detour = parseEnvelope(value);
  return detour.ok ? { ok: true, source: 'detour', workspace: detour.value.data, skipped: [], warnings: [] } : detour;
}
