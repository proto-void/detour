import { browser } from 'wxt/browser';
import { syncRules } from '../engine-core/apply';
import { createCoalescer } from '../engine-core/coalesce';
import type { DnrApi } from '../engine-core/dnr';
import type { DebuggerApi, TabsApi } from '../engine-deep/chrome-session';
import type { WebRequestApi } from '../engine-deep/firefox-filter';
import { BODY_CONSENT_KEY } from '../engine-deep/permissions';
import { createBodyEngine, type PermissionQuery } from '../engine-deep/sync';
import { fetchText, handleBridgeMessage, type Sender } from '../page-inject/background-handlers';
import { RESYNC_MESSAGE, type PageApi } from '../page-inject/sync';
import { ENABLED_KEY, WORKSPACE_KEY } from '../rule-model/storage';

export default defineBackground(() => {
  const dnr = browser.declarativeNetRequest as unknown as DnrApi;
  const area = browser.storage.local;
  const page: PageApi = {
    scripting: browser.scripting as unknown as PageApi['scripting'],
    // Read live: it appears/disappears as the user flips the toggle or grants the permission, and can throw.
    get userScripts() {
      try {
        return (browser as unknown as { userScripts?: PageApi['userScripts'] }).userScripts;
      } catch {
        return undefined;
      }
    },
  };

  const firefox = import.meta.env.FIREFOX;
  const bodyEngine = createBodyEngine({
    browser: firefox ? 'firefox' : 'chrome',
    permissions: browser.permissions as unknown as PermissionQuery,
    consent: async () => (await area.get(BODY_CONSENT_KEY))[BODY_CONSENT_KEY] === true,
    ...(firefox
      ? { firefox: { webRequest: browser.webRequest as unknown as WebRequestApi } }
      : {
          chrome: () => {
            try {
              const dbg = (browser as unknown as { debugger?: DebuggerApi }).debugger;
              if (!dbg?.onEvent || !dbg.attach) return undefined;
              return { debugger: dbg, tabs: browser.tabs as unknown as TabsApi };
            } catch {
              return undefined;
            }
          },
        }),
  });

  const refresh = createCoalescer(async () => {
    const report = await syncRules(dnr, area, undefined, page, bodyEngine);
    if (report.refused.length > 0 || report.errors.length > 0) {
      console.warn(`Detour: ${report.applied.length} network and ${report.injected?.length ?? 0} page rule(s) applied, ${report.refused.length} refused`, report);
    }
  });
  const refreshSafely = () => refresh().catch((e) => console.error('Detour: failed to apply rules', e));

  // Dynamic rules persist across restarts but user scripts are cleared on update, so re-apply on both.
  browser.runtime.onInstalled.addListener(refreshSafely);
  browser.runtime.onStartup.addListener(refreshSafely);
  browser.runtime.onSuspend?.addListener(() => {
    void bodyEngine.stop();
  });
  browser.permissions.onAdded.addListener(refreshSafely);
  browser.permissions.onRemoved.addListener(refreshSafely);
  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && (WORKSPACE_KEY in changes || ENABLED_KEY in changes)) void refreshSafely();
  });

  browser.runtime.onMessage.addListener((message: unknown, sender) => {
    if (sender.id !== browser.runtime.id) return;
    if ((message as { type?: unknown } | null)?.type === RESYNC_MESSAGE) {
      if (sender.tab === undefined || sender.url?.startsWith(browser.runtime.getURL('/'))) void refreshSafely();
      return;
    }
    void handleBridgeMessage(message, sender as Sender, {
      local: area,
      session: browser.storage.session,
      insertCSS: (details) => browser.scripting.insertCSS(details),
      fetchText,
    }).catch((e) => console.error('Detour: page message failed', e));
  });
});
