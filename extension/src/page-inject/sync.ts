import type { Refusal } from '../engine-core/compile';
import type { StorageAreaLike } from '../rule-model/storage';
import { PAGE_CONFIG_KEY, USER_SCRIPT_PREFIX, type InjectedKind, type PagePlan, type UserScriptSpec } from './plan';

export const BRIDGE_ID = 'detour-bridge';
export const MOCK_RUNTIME_ID = 'detour-mock';
/** WXT output paths of `entrypoints/bridge.content.ts` and `entrypoints/mock-main.content.ts`. */
export const BRIDGE_FILE = 'content-scripts/bridge.js';
export const MOCK_RUNTIME_FILE = 'content-scripts/mock-main.js';

/** Sent by extension pages after the user allows user scripts (Chrome toggle / Firefox permission). */
export const RESYNC_MESSAGE = 'detour:resync';

type RunAt = 'document_start' | 'document_end' | 'document_idle';

export interface ContentScriptRegistration {
  id: string;
  js: string[];
  matches: string[];
  runAt: RunAt;
  allFrames: boolean;
  world: 'ISOLATED' | 'MAIN';
  persistAcrossSessions: boolean;
}

/** The slices of `scripting` and `userScripts` Detour uses; browser objects satisfy them at runtime. */
export interface PageApi {
  scripting: {
    getRegisteredContentScripts(filter?: { ids?: string[] }): Promise<{ id: string }[]>;
    registerContentScripts(scripts: ContentScriptRegistration[]): Promise<void>;
    unregisterContentScripts(filter?: { ids?: string[] }): Promise<void>;
  };
  /** Absent (or throwing) when the user hasn't allowed user scripts. */
  userScripts?: {
    getScripts(filter?: { ids?: string[] }): Promise<{ id: string }[]>;
    register(scripts: Omit<UserScriptSpec, 'groupId' | 'ruleId'>[]): Promise<void>;
    unregister(filter?: { ids?: string[] }): Promise<void>;
  };
}

/** Chrome exposes `userScripts` before the toggle is on but its calls throw, so probe with a call. */
export async function userScriptsAvailable(api: PageApi): Promise<boolean> {
  try {
    await api.userScripts!.getScripts();
    return true;
  } catch {
    return false;
  }
}

export interface PageSyncResult {
  injected: { groupId: string; ruleId: string; kind: InjectedKind }[];
  refused: Refusal[];
  errors: string[];
}

const registration = (id: string, file: string, world: 'ISOLATED' | 'MAIN'): ContentScriptRegistration => ({
  id,
  js: [file],
  matches: ['<all_urls>'],
  runAt: 'document_start',
  // The bridge filters top-only rules itself; mocks apply in every frame.
  allFrames: true,
  world,
  persistAcrossSessions: true,
});

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Makes the browser match `plan`: writes `pageConfig` first (so new pages read it), keeps the
 * bridge/mock content scripts registered only while needed, and replaces Detour's user scripts.
 */
export async function syncPage(api: PageApi, area: StorageAreaLike, plan: PagePlan): Promise<PageSyncResult> {
  const errors: string[] = [];
  const refused = [...plan.refused];
  let injected = plan.injected;
  await area.set({ [PAGE_CONFIG_KEY]: plan.config });

  try {
    const wanted = [
      ...(plan.needsBridge ? [registration(BRIDGE_ID, BRIDGE_FILE, 'ISOLATED')] : []),
      ...(plan.needsMockRuntime ? [registration(MOCK_RUNTIME_ID, MOCK_RUNTIME_FILE, 'MAIN')] : []),
    ];
    const present = new Set((await api.scripting.getRegisteredContentScripts({ ids: [BRIDGE_ID, MOCK_RUNTIME_ID] })).map((s) => s.id));
    const stale = [...present].filter((id) => !wanted.some((w) => w.id === id));
    const missing = wanted.filter((w) => !present.has(w.id));
    if (stale.length > 0) await api.scripting.unregisterContentScripts({ ids: stale });
    if (missing.length > 0) await api.scripting.registerContentScripts(missing);
  } catch (e) {
    // Everything except inline JS (user scripts) depends on these registrations.
    const error = `Couldn't register Detour's page scripts: ${message(e)}`;
    errors.push(error);
    const inline = new Set(plan.userScripts.map((u) => u.ruleId));
    for (const i of injected) if (!inline.has(i.ruleId)) refused.push({ groupId: i.groupId, ruleId: i.ruleId, reason: 'inject-failed', message: error });
    injected = injected.filter((i) => inline.has(i.ruleId));
  }

  if (api.userScripts && (await userScriptsAvailable(api))) {
    const failed = await replaceUserScripts(api.userScripts, plan.userScripts);
    for (const { spec, error } of failed) {
      refused.push({ groupId: spec.groupId, ruleId: spec.ruleId, reason: 'inject-failed', message: error });
      injected = injected.filter((i) => i.ruleId !== spec.ruleId);
    }
  }
  return { injected, refused, errors };
}

async function replaceUserScripts(userScripts: NonNullable<PageApi['userScripts']>, specs: UserScriptSpec[]) {
  const ours = (await userScripts.getScripts()).filter((s) => s.id.startsWith(USER_SCRIPT_PREFIX)).map((s) => s.id);
  if (ours.length > 0) await userScripts.unregister({ ids: ours });
  const strip = ({ groupId: _g, ruleId: _r, ...script }: UserScriptSpec) => script;
  try {
    if (specs.length > 0) await userScripts.register(specs.map(strip));
    return [];
  } catch {
    // One bad script fails the batch; register individually so the rest still run.
    const failed: { spec: UserScriptSpec; error: string }[] = [];
    for (const spec of specs) {
      try {
        await userScripts.register([strip(spec)]);
      } catch (e) {
        failed.push({ spec, error: `The browser rejected this script: ${message(e)}` });
      }
    }
    return failed;
  }
}
