import * as v from 'valibot';
import {
  DbClientStateSchema,
  emptyDbClientState,
  migrateConnections,
  type DbClientState,
  type DbHistoryEntry,
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
});

export function capHistory(entries: DbHistoryEntry[], cap = HISTORY_CAP): DbHistoryEntry[] {
  return entries.slice(0, cap);
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
      ? { success: true as const, output: { idleTimeoutMinutes: 15 } }
      : v.safeParse(SettingsSchema, settings);

  const candidate = {
    connections: connections ?? [],
    collections: collections ?? [],
    history: history ?? [],
    idleTimeoutMinutes: settingsParsed.success ? settingsParsed.output.idleTimeoutMinutes : 15,
  };

  const migratedCandidate = {
    ...candidate,
    connections: migrateConnections(
      Array.isArray(candidate.connections) ? (candidate.connections as unknown[]) : [],
    ),
  };

  const parsed = v.safeParse(DbClientStateSchema, migratedCandidate);
  if (!parsed.success) {
    return { ok: false, errors: parsed.issues.map((i) => i.message) };
  }
  return {
    ok: true,
    value: {
      ...parsed.output,
      connections: migrateConnections(parsed.output.connections),
      history: capHistory(parsed.output.history),
    },
  };
}

export async function saveDbClientState(area: StorageAreaLike, state: DbClientState): Promise<void> {
  await area.set({
    [DB_CONNECTIONS_KEY]: state.connections,
    [DB_COLLECTIONS_KEY]: state.collections,
    [DB_HISTORY_KEY]: capHistory(state.history),
    [DB_SETTINGS_KEY]: { idleTimeoutMinutes: state.idleTimeoutMinutes ?? 15 },
  });
}
