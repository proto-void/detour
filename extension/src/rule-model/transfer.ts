import { importResourceOverride, type ImportNotice, type RoImport } from './ro-import';
import { parseEnvelope, SCHEMA_VERSION, type Envelope, type Group, type ImportSource, type Workspace } from './schema';

export type ImportResult =
  | { ok: true; source: 'detour' | RoImport['source']; workspace: Workspace; skipped: ImportNotice[]; warnings: ImportNotice[] }
  | { ok: false; errors: string[] };

export interface ImportOptions {
  newId?: () => string;
}

export const exportWorkspace = (workspace: Workspace): Envelope => ({ v: SCHEMA_VERSION, data: workspace });

export const serializeExport = (workspace: Workspace): string => `${JSON.stringify(exportWorkspace(workspace), null, 2)}\n`;

/** Groups from an earlier import of the same file: same file name or identical content. */
export const isFromSource = (group: Group, source: ImportSource): boolean =>
  group.importedFrom !== undefined && (group.importedFrom.file === source.file || group.importedFrom.sha256 === source.sha256);

/** How `source` relates to what's already imported: identical content, same file name only, or new. */
export function findSourceMatch(base: Workspace, source: ImportSource): { kind: 'hash' | 'name' | 'none'; groups: number } {
  const matching = base.groups.filter((g) => isFromSource(g, source));
  if (matching.length === 0) return { kind: 'none', groups: 0 };
  return { kind: matching.some((g) => g.importedFrom?.sha256 === source.sha256) ? 'hash' : 'name', groups: matching.length };
}

/**
 * Carries the user's on/off choices from the groups being replaced to their re-imported versions.
 * Groups and rules are paired by `importKey`; entries imported before keys existed fall back to
 * position (rules: position + match pattern).
 */
function keepSwitches(fresh: Group[], previous: Group[]): Group[] {
  const groupsByKey = new Map(previous.filter((g) => g.importKey).map((g) => [g.importKey!, g]));
  return fresh.map((group, gi) => {
    const old = groupsByKey.get(group.importKey!) ?? (previous[gi]?.importKey === undefined ? previous[gi] : undefined);
    if (!old) return group;
    const rulesByKey = new Map(old.rules.filter((r) => r.importKey).map((r) => [r.importKey!, r]));
    return {
      ...group,
      enabled: old.enabled,
      rules: group.rules.map((rule, ri) => {
        const positional = old.rules[ri];
        const oldRule =
          rulesByKey.get(rule.importKey!) ??
          (positional && positional.importKey === undefined && positional.match.pattern === rule.match.pattern ? positional : undefined);
        return oldRule ? { ...rule, enabled: oldRule.enabled } : rule;
      }),
    };
  });
}

/**
 * Merges imported groups into `base`, re-identified and stamped with `source`. With `replace`, groups
 * from an earlier import of the same source are replaced in place (at the first one's position) and
 * keep their on/off switches; otherwise the new groups are appended. Groups without `importedFrom`
 * (created by hand) are never touched.
 */
export function mergeImported(
  base: Workspace,
  incoming: Workspace,
  source: ImportSource,
  newId: () => string,
  mode: 'replace' | 'append' = 'replace',
): { workspace: Workspace; replaced: number } {
  let fresh: Group[] = incoming.groups.map((g) => ({
    ...g,
    id: newId(),
    importedFrom: source,
    importKey: g.importKey ?? g.id,
    rules: g.rules.map((r) => ({ ...r, id: newId(), importKey: r.importKey ?? r.id })),
  }));
  const first = mode === 'replace' ? base.groups.findIndex((g) => isFromSource(g, source)) : -1;
  if (first === -1) return { workspace: { groups: [...base.groups, ...fresh] }, replaced: 0 };
  const previous = base.groups.filter((g) => isFromSource(g, source));
  fresh = keepSwitches(fresh, previous);
  const kept = base.groups.filter((g) => !isFromSource(g, source));
  kept.splice(first, 0, ...fresh);
  return { workspace: { groups: kept }, replaced: previous.length };
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
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
