import * as v from 'valibot';
import {
  emptyDbClientState,
  migrateDbClientState,
  QUERY_TABS_CAP,
  type DbClientState,
  type DbHistoryEntry,
  type DbQueryTab,
  type DbUiPrefs,
} from './model';
import type { StorageAreaLike } from '../rule-model/storage';

/** Separate from rules `workspace` and API Tester keys. */
export const DB_CONNECTIONS_KEY = 'dbConnections';
export const DB_COLLECTIONS_KEY = 'dbCollections';
export const DB_HISTORY_KEY = 'dbHistory';
export const DB_SETTINGS_KEY = 'dbSettings';

export const HISTORY_CAP = 200;

type ParseOk<T> = { ok: true; value: T };
type ParseErr = { ok: false; errors: string[] };
export type ParseResult<T> = ParseOk<T> | ParseErr;

const SettingsSchema = v.object({
  idleTimeoutMinutes: v.optional(v.number(), 15),
  syncFolder: v.optional(v.string(), ''),
  ui: v.optional(v.unknown()),
  queryTabs: v.optional(v.unknown()),
  activeQueryTabId: v.optional(v.nullable(v.string()), null),
});

export function capHistory(entries: DbHistoryEntry[], cap = HISTORY_CAP): DbHistoryEntry[] {
  return entries.slice(0, cap);
}

export function capQueryTabs(tabs: DbQueryTab[], cap = QUERY_TABS_CAP): DbQueryTab[] {
  return tabs.slice(0, cap);
}

export async function loadDbClientState(area: StorageAreaLike): Promise<ParseResult<DbClientState>> {
  const all = {
    ...(await area.get(DB_CONNECTIONS_KEY)),
    ...(await area.get(DB_COLLECTIONS_KEY)),
    ...(await area.get(DB_HISTORY_KEY)),
    ...(await area.get(DB_SETTINGS_KEY)),
  };

  const connections = all[DB_CONNECTIONS_KEY];
  const collections = all[DB_COLLECTIONS_KEY];
  const history = all[DB_HISTORY_KEY];
  const settings = all[DB_SETTINGS_KEY];

  if (
    connections === undefined &&
    collections === undefined &&
    history === undefined &&
    settings === undefined
  ) {
    return { ok: true, value: emptyDbClientState() };
  }

  const settingsParsed =
    settings === undefined
      ? {
          success: true as const,
          output: {
            idleTimeoutMinutes: 15,
            syncFolder: '',
            ui: undefined,
            queryTabs: undefined,
            activeQueryTabId: null,
          },
        }
      : v.safeParse(SettingsSchema, settings);

  const settingsOut = settingsParsed.success
    ? settingsParsed.output
    : { idleTimeoutMinutes: 15, syncFolder: '', ui: undefined, queryTabs: undefined, activeQueryTabId: null };

  const candidate = {
    connections: connections ?? [],
    collections: collections ?? [],
    history: history ?? [],
    idleTimeoutMinutes: settingsOut.idleTimeoutMinutes ?? 15,
    syncFolder: settingsOut.syncFolder ?? '',
    ui: settingsOut.ui,
    queryTabs: settingsOut.queryTabs,
    activeQueryTabId: settingsOut.activeQueryTabId ?? null,
  };

  try {
    const migrated = migrateDbClientState(candidate);
    return {
      ok: true,
      value: {
        ...migrated,
        history: capHistory(migrated.history),
        queryTabs: capQueryTabs(migrated.queryTabs ?? []),
      },
    };
  } catch (e) {
    return { ok: false, errors: [e instanceof Error ? e.message : String(e)] };
  }
}

export async function saveDbClientState(area: StorageAreaLike, state: DbClientState): Promise<void> {
  const ui: DbUiPrefs | undefined = state.ui;
  await area.set({
    [DB_CONNECTIONS_KEY]: state.connections,
    [DB_COLLECTIONS_KEY]: state.collections,
    [DB_HISTORY_KEY]: capHistory(state.history),
    [DB_SETTINGS_KEY]: {
      idleTimeoutMinutes: state.idleTimeoutMinutes ?? 15,
      syncFolder: state.syncFolder ?? '',
      ui: ui ?? undefined,
      queryTabs: capQueryTabs(state.queryTabs ?? []),
      activeQueryTabId: state.activeQueryTabId ?? null,
    },
  });
}
