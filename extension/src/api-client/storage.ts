import * as v from 'valibot';
import {
  ApiClientStateSchema,
  emptyApiClientState,
  type ApiClientState,
  type HistoryEntry,
} from './model';
import type { StorageAreaLike } from '../rule-model/storage';

/** Separate from rules `workspace` — never reuse that key. */
export const API_COLLECTIONS_KEY = 'apiCollections';
export const API_ENVIRONMENTS_KEY = 'apiEnvironments';
export const API_HISTORY_KEY = 'apiHistory';
export const API_SETTINGS_KEY = 'apiSettings';
export const API_RUNS_KEY = 'apiRuns';

export const HISTORY_CAP = 100;
export const RUNS_CAP = 50;
export const BODY_PREVIEW_CAP = 256 * 1024;

type ParseOk<T> = { ok: true; value: T };
type ParseErr = { ok: false; errors: string[] };
export type ParseResult<T> = ParseOk<T> | ParseErr;

const SettingsSchema = v.object({
  activeEnvironmentId: v.optional(v.nullable(v.string()), null),
  globals: v.optional(v.array(v.any()), []),
  applyDetourRules: v.optional(v.boolean(), true),
  schedules: v.optional(v.array(v.any()), []),
});

export function truncateBody(text: string, cap = BODY_PREVIEW_CAP): string {
  if (text.length <= cap) return text;
  return `${text.slice(0, cap)}\n…[truncated]`;
}

export function capHistory(entries: HistoryEntry[], cap = HISTORY_CAP): HistoryEntry[] {
  return entries.slice(0, cap);
}

export async function loadApiClientState(area: StorageAreaLike): Promise<ParseResult<ApiClientState>> {
  const bag = await area.get(API_COLLECTIONS_KEY);
  // storage.local.get with one key still returns an object; load siblings too.
  const all = {
    ...(await area.get(API_COLLECTIONS_KEY)),
    ...(await area.get(API_ENVIRONMENTS_KEY)),
    ...(await area.get(API_HISTORY_KEY)),
    ...(await area.get(API_SETTINGS_KEY)),
    ...(await area.get(API_RUNS_KEY)),
  };
  void bag;

  const collections = all[API_COLLECTIONS_KEY];
  const environments = all[API_ENVIRONMENTS_KEY];
  const history = all[API_HISTORY_KEY];
  const settings = all[API_SETTINGS_KEY];
  const runs = all[API_RUNS_KEY];

  if (
    collections === undefined &&
    environments === undefined &&
    history === undefined &&
    settings === undefined &&
    runs === undefined
  ) {
    return { ok: true, value: emptyApiClientState() };
  }

  const settingsParsed =
    settings === undefined
      ? { success: true as const, output: { activeEnvironmentId: null, globals: [], applyDetourRules: true, schedules: [] } }
      : v.safeParse(SettingsSchema, settings);

  const candidate = {
    collections: collections ?? [],
    environments: environments ?? [],
    history: history ?? [],
    runs: runs ?? [],
    activeEnvironmentId: settingsParsed.success ? settingsParsed.output.activeEnvironmentId : null,
    globals: settingsParsed.success ? settingsParsed.output.globals : [],
    applyDetourRules: settingsParsed.success ? settingsParsed.output.applyDetourRules : true,
    schedules: settingsParsed.success ? (settingsParsed.output.schedules ?? []) : [],
  };

  const parsed = v.safeParse(ApiClientStateSchema, candidate);
  if (!parsed.success) {
    return { ok: false, errors: parsed.issues.map((i) => i.message) };
  }
  return {
    ok: true,
    value: {
      ...parsed.output,
      history: capHistory(parsed.output.history.map((h) => ({ ...h, bodyPreview: truncateBody(h.bodyPreview ?? '') }))),
      runs: (parsed.output.runs ?? []).slice(0, RUNS_CAP),
      schedules: parsed.output.schedules ?? [],
    },
  };
}

export async function saveApiClientState(area: StorageAreaLike, state: ApiClientState): Promise<ParseResult<ApiClientState>> {
  const parsed = v.safeParse(ApiClientStateSchema, state);
  if (!parsed.success) {
    return { ok: false, errors: parsed.issues.map((i) => i.message) };
  }
  const value = {
    ...parsed.output,
    history: capHistory(
      parsed.output.history.map((h) => ({
        ...h,
        bodyPreview: truncateBody(h.bodyPreview ?? ''),
      })),
    ),
    runs: (parsed.output.runs ?? []).slice(0, RUNS_CAP),
    schedules: parsed.output.schedules ?? [],
  };
  await area.set({
    [API_COLLECTIONS_KEY]: value.collections,
    [API_ENVIRONMENTS_KEY]: value.environments,
    [API_HISTORY_KEY]: value.history,
    [API_RUNS_KEY]: value.runs,
    [API_SETTINGS_KEY]: {
      activeEnvironmentId: value.activeEnvironmentId,
      globals: value.globals,
      applyDetourRules: value.applyDetourRules,
      schedules: value.schedules,
    },
  });
  return { ok: true, value };
}

export async function pushHistory(area: StorageAreaLike, entry: HistoryEntry): Promise<ParseResult<ApiClientState>> {
  const loaded = await loadApiClientState(area);
  if (!loaded.ok) return loaded;
  const next: ApiClientState = {
    ...loaded.value,
    history: capHistory([{ ...entry, bodyPreview: truncateBody(entry.bodyPreview ?? '') }, ...loaded.value.history]),
  };
  return saveApiClientState(area, next);
}
