import type { Refusal } from '../engine-core/compile';
import type { Workspace } from '../rule-model/schema';
import { createChromeBodySession, type ChromeBodySession, type DebuggerApi, type TabsApi } from './chrome-session';
import { createFirefoxBodyFilter, type FirefoxBodyFilter, type WebRequestApi } from './firefox-filter';
import { BODY_PERMISSION_MESSAGE, bodyPermissions } from './permissions';
import { planBody } from './plan';

export interface BodyEngineResult {
  /** Armed rules. Ids only — bodies stay in the workspace. */
  bodies: { groupId: string; ruleId: string }[];
  refused: Refusal[];
  errors: string[];
}

export interface BodyEngine {
  sync(workspace: Workspace, enabled: boolean): Promise<BodyEngineResult>;
  stop(): Promise<void>;
}

export interface PermissionQuery {
  contains(query: { permissions: string[] }): Promise<boolean>;
}

/**
 * Routes overrideBody rules to the browser that can apply them.
 * Does nothing (and detaches) until the optional permission is granted.
 */
export function createBodyEngine(options: {
  browser: 'chrome' | 'firefox';
  permissions: PermissionQuery;
  /** Explicit Allow click. Independent of the install-time debugger permission. */
  consent: () => Promise<boolean>;
  /**
   * Called when a body rule is allowed to run. Optional `debugger` is missing until the
   * user grants it, and reading it earlier crashes the service worker.
   */
  chrome?: () => { debugger: DebuggerApi; tabs: TabsApi } | undefined;
  firefox?: { webRequest: WebRequestApi };
}): BodyEngine {
  let chrome: ChromeBodySession | undefined;
  const firefox: FirefoxBodyFilter | undefined = options.firefox ? createFirefoxBodyFilter(options.firefox.webRequest) : undefined;
  const names = bodyPermissions(options.browser);

  const chromeSession = (): ChromeBodySession | undefined => {
    if (chrome) return chrome;
    const api = options.chrome?.();
    if (!api?.debugger.onEvent) return undefined;
    chrome = createChromeBodySession(api.debugger, api.tabs);
    return chrome;
  };

  return {
    async sync(workspace, enabled) {
      const planned = planBody(enabled ? workspace : { groups: [] });
      if (planned.rules.length === 0) {
        await chrome?.apply(planned);
        firefox?.clear();
        return { bodies: [], refused: planned.refused, errors: [] };
      }
      let granted = false;
      let consented = false;
      try {
        granted = await options.permissions.contains({ permissions: names });
        consented = await options.consent();
      } catch {
        granted = false;
        consented = false;
      }
      const session = options.browser === 'chrome' && granted && consented ? chromeSession() : undefined;
      if (!granted || !consented || (options.browser === 'chrome' && !session) || (options.browser === 'firefox' && !firefox)) {
        await chrome?.apply({ rules: [], patterns: [], broad: false, refused: [] });
        firefox?.clear();
        const message = options.browser === 'firefox' ? BODY_PERMISSION_MESSAGE.firefox : BODY_PERMISSION_MESSAGE.chrome;
        return {
          bodies: [],
          refused: [
            ...planned.refused,
            ...planned.rules.map((rule) => ({ groupId: rule.groupId, ruleId: rule.ruleId, reason: 'body-permission-denied' as const, message })),
          ],
          errors: [],
        };
      }
      const errors = session ? await session.apply(planned) : [];
      firefox?.install(planned.rules);
      return {
        bodies: planned.rules.map((rule) => ({ groupId: rule.groupId, ruleId: rule.ruleId })),
        refused: planned.refused,
        errors,
      };
    },
    async stop() {
      await chrome?.stop();
      firefox?.clear();
    },
  };
}
