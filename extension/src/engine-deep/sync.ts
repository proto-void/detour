import type { Refusal } from '../engine-core/compile';
import { readBridgeFile } from '../local-bridge/read';
import type { Workspace } from '../rule-model/schema';
import { createChromeBodySession, type BodyMatchNote, type ChromeBodySession, type DebuggerApi, type TabsApi } from './chrome-session';
import { createFirefoxBodyFilter, type FirefoxBodyFilter, type WebRequestApi } from './firefox-filter';
import { BODY_PERMISSION_MESSAGE, bodyPermissions } from './permissions';
import { planBody } from './plan';

/** Loopback session used to read a file. Never put this on the apply report. */
export interface BridgeInPlaceSession {
  port: number;
  token: string;
}

export interface BodySyncOptions {
  /** When set, serveLocal rules are fulfilled from this bridge instead of a redirect. */
  bridge?: BridgeInPlaceSession;
  /** Caller already checked consent and the browser permission. */
  allowed?: boolean;
}

export interface BodyEngineResult {
  /** Armed rules. Ids only — bodies stay in the workspace. */
  bodies: { groupId: string; ruleId: string }[];
  refused: Refusal[];
  errors: string[];
}

export interface BodyEngine {
  sync(workspace: Workspace, enabled: boolean, options?: BodySyncOptions): Promise<BodyEngineResult>;
  /** True when consent and the browser permission are both present. */
  ready(): Promise<boolean>;
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
  /** A body was replaced. Ids and the request URL only — never the new body. */
  onMatch?: (note: BodyMatchNote) => void;
  /** Test hook. Production uses global fetch. The bridge URL contains the token; do not log it. */
  fetchImpl?: typeof fetch;
}): BodyEngine {
  let chrome: ChromeBodySession | undefined;
  const firefox: FirefoxBodyFilter | undefined = options.firefox ? createFirefoxBodyFilter(options.firefox.webRequest, options.onMatch) : undefined;
  const names = bodyPermissions(options.browser);
  const fetchImpl = options.fetchImpl ?? fetch;

  const allowed = async (): Promise<boolean> => {
    try {
      const granted = await options.permissions.contains({ permissions: names });
      const consented = await options.consent();
      if (!granted || !consented) return false;
      if (options.browser === 'firefox') return Boolean(firefox);
      return Boolean(chromeSession());
    } catch {
      return false;
    }
  };

  const chromeSession = (): ChromeBodySession | undefined => {
    if (chrome) return chrome;
    const api = options.chrome?.();
    if (!api?.debugger.onEvent) return undefined;
    chrome = createChromeBodySession(api.debugger, api.tabs, options.onMatch);
    return chrome;
  };

  return {
    ready: allowed,
    async sync(workspace, enabled, syncOptions) {
      const inPlace = Boolean(syncOptions?.bridge);
      const planned = planBody(enabled ? workspace : { groups: [] }, { bridgeInPlace: inPlace });
      if (planned.rules.length === 0) {
        await chrome?.apply(planned);
        firefox?.clear();
        return { bodies: [], refused: planned.refused, errors: [] };
      }
      const granted = syncOptions?.allowed ?? (await allowed());
      const session = options.browser === 'chrome' && granted ? chromeSession() : undefined;
      if (!granted || (options.browser === 'chrome' && !session) || (options.browser === 'firefox' && !firefox)) {
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
      const bridge = syncOptions?.bridge;
      const read = bridge ? (filePath: string) => readBridgeFile(bridge, filePath, fetchImpl) : undefined;
      const errors = session ? await session.apply(planned, read) : [];
      firefox?.install(planned.rules, read);
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
