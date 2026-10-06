import type { PageApi } from '../page-inject/sync';

export const SRI_RUNTIME_ID = 'detour-sri';
/** WXT output of `entrypoints/sri-main.content.ts`. */
export const SRI_RUNTIME_FILE = 'content-scripts/sri-main.js';

/**
 * MAIN-world hook, present only while a body rule is armed.
 * Open pages keep the previous hook until the next load.
 */
export async function syncSriRuntime(scripting: PageApi['scripting'], armed: boolean): Promise<string | undefined> {
  try {
    const present = (await scripting.getRegisteredContentScripts({ ids: [SRI_RUNTIME_ID] })).some((script) => script.id === SRI_RUNTIME_ID);
    if (!armed) {
      if (present) await scripting.unregisterContentScripts({ ids: [SRI_RUNTIME_ID] });
      return;
    }
    if (present) return;
    await scripting.registerContentScripts([
      {
        id: SRI_RUNTIME_ID,
        js: [SRI_RUNTIME_FILE],
        matches: ['<all_urls>'],
        runAt: 'document_start',
        allFrames: true,
        world: 'MAIN',
        persistAcrossSessions: true,
      },
    ]);
    return;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}
