import { fulfillParams, hostnameOf, pickBodyRule, type HeaderEntry } from './decide';
import type { BodyPlan } from './plan';

/** chrome.debugger, shaped so tests can pass a fake. Protocol 1.3. */
export interface Debuggee {
  tabId?: number;
}

export interface DebuggerApi {
  attach(target: Debuggee, requiredVersion: string): Promise<void>;
  detach(target: Debuggee): Promise<void>;
  sendCommand(target: Debuggee, method: string, commandParams?: object): Promise<unknown>;
  onEvent: {
    addListener(cb: (source: Debuggee, method: string, params?: object) => void): void;
    removeListener(cb: (source: Debuggee, method: string, params?: object) => void): void;
  };
  onDetach: {
    addListener(cb: (source: Debuggee, reason: string) => void): void;
    removeListener(cb: (source: Debuggee, reason: string) => void): void;
  };
}

export interface TabInfo {
  id?: number;
  url?: string;
}

export interface TabsApi {
  query(query: { url?: string | string[] }): Promise<TabInfo[]>;
  onUpdated: {
    addListener(cb: (tabId: number, info: { url?: string; status?: string }, tab: TabInfo) => void): void;
    removeListener(cb: (tabId: number, info: { url?: string; status?: string }, tab: TabInfo) => void): void;
  };
  onRemoved: {
    addListener(cb: (tabId: number) => void): void;
    removeListener(cb: (tabId: number) => void): void;
  };
}

interface PausedEvent {
  requestId?: string;
  request?: { url?: string };
  frameId?: string;
  resourceType?: string;
  responseStatusCode?: number;
  responseStatusText?: string;
  responseHeaders?: HeaderEntry[];
  responseErrorReason?: string;
}

const PROTOCOL = '1.3';
const HTTP_TABS = ['http://*/*', 'https://*/*'];

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

const isHttp = (url: string | undefined) => url !== undefined && /^https?:/i.test(url);

/**
 * Attaches the debugger only while `apply` is given body rules. Listeners are
 * registered immediately so a service-worker restart still receives Fetch events.
 * https://developer.chrome.com/docs/extensions/reference/api/debugger
 */
export interface BodyMatchNote {
  groupId: string;
  ruleId: string;
  url: string;
  tabId: number;
}

export function createChromeBodySession(dbg: DebuggerApi, tabs: TabsApi, onMatch?: (note: BodyMatchNote) => void) {
  let plan: BodyPlan = { rules: [], patterns: [], broad: false, refused: [] };
  let planKey = '';
  const attached = new Set<number>();
  const cancelled = new Set<number>();
  const mainFrame = new Map<number, string>();
  const tabUrls = new Map<number, string>();

  const onEvent = (source: Debuggee, method: string, params?: object) => {
    if (method !== 'Fetch.requestPaused' || source.tabId === undefined) return;
    void handlePaused(source.tabId, (params ?? {}) as PausedEvent);
  };

  const onDetach = (source: Debuggee, reason: string) => {
    const tabId = source.tabId;
    if (tabId === undefined) return;
    attached.delete(tabId);
    mainFrame.delete(tabId);
    // Cancel is the user dismissing the infobar. DevTools also detaches (onDetach docs).
    if (reason === 'canceled_by_user') cancelled.add(tabId);
  };

  const onUpdated = (tabId: number, info: { url?: string; status?: string }, tab: TabInfo) => {
    const url = info.url ?? tab.url;
    if (url) tabUrls.set(tabId, url);
    if (!isHttp(url) && !isHttp(tab.url)) return;
    if (plan.rules.length === 0 || cancelled.has(tabId)) return;
    void attachTab(tabId);
  };

  const onRemoved = (tabId: number) => {
    attached.delete(tabId);
    cancelled.delete(tabId);
    mainFrame.delete(tabId);
    tabUrls.delete(tabId);
  };

  dbg.onEvent.addListener(onEvent);
  dbg.onDetach.addListener(onDetach);
  tabs.onUpdated.addListener(onUpdated);
  tabs.onRemoved.addListener(onRemoved);

  async function enableFetch(tabId: number): Promise<void> {
    await dbg.sendCommand({ tabId }, 'Fetch.enable', { patterns: plan.patterns, handleAuthRequests: false });
    try {
      const tree = (await dbg.sendCommand({ tabId }, 'Page.getFrameTree')) as { frameTree?: { frame?: { id?: string } } };
      const id = tree?.frameTree?.frame?.id;
      if (id) mainFrame.set(tabId, id);
    } catch {
      // Frame id is only needed to tell page loads from iframes. Subresources still match.
    }
  }

  async function attachTab(tabId: number): Promise<string | undefined> {
    if (cancelled.has(tabId) || plan.rules.length === 0) return;
    if (attached.has(tabId)) {
      try {
        await enableFetch(tabId);
      } catch (e) {
        return messageOf(e);
      }
      return;
    }
    try {
      await dbg.attach({ tabId }, PROTOCOL);
    } catch (e) {
      const message = messageOf(e);
      if (!/already attached/i.test(message)) return message;
      // Either we already own it (worker restarted) or DevTools does. Try Fetch; if it fails, leave it.
      try {
        await enableFetch(tabId);
        attached.add(tabId);
      } catch {
        return;
      }
      return;
    }
    attached.add(tabId);
    try {
      await enableFetch(tabId);
    } catch (e) {
      attached.delete(tabId);
      await dbg.detach({ tabId }).catch(() => {});
      return messageOf(e);
    }
    return;
  }

  async function detachAll(): Promise<void> {
    const ids = [...attached];
    attached.clear();
    mainFrame.clear();
    await Promise.all(ids.map((tabId) => dbg.detach({ tabId }).catch(() => {})));
  }

  async function handlePaused(tabId: number, event: PausedEvent): Promise<void> {
    const requestId = event.requestId;
    if (!requestId) return;
    const url = event.request?.url ?? '';
    const finish = async (method: 'Fetch.continueResponse' | 'Fetch.fulfillRequest', params: object): Promise<boolean> => {
      try {
        await dbg.sendCommand({ tabId }, method, params);
        return true;
      } catch (e) {
        if (method === 'Fetch.fulfillRequest') await dbg.sendCommand({ tabId }, 'Fetch.continueResponse', { requestId }).catch(() => {});
        else console.error('Detour: could not continue a paused response', messageOf(e));
        return false;
      }
    };

    if (!isHttp(url)) {
      await finish('Fetch.continueResponse', { requestId });
      return;
    }
    const frameId = event.frameId;
    const mainId = mainFrame.get(tabId);
    const isDocument = event.resourceType === 'Document';
    const isMainFrame = isDocument ? (mainId ? frameId === mainId : undefined) : undefined;
    const pageHost = isDocument && isMainFrame !== false ? hostnameOf(url) : hostnameOf(tabUrls.get(tabId)) || hostnameOf(url);
    const rule = pickBodyRule(plan.rules, { url, resourceType: event.resourceType ?? 'Other', isMainFrame, pageHost });
    if (!rule) {
      await finish('Fetch.continueResponse', { requestId });
      return;
    }
    const replaced = await finish('Fetch.fulfillRequest', fulfillParams(requestId, rule, event.responseStatusCode, event.responseStatusText, event.responseHeaders));
    if (replaced) onMatch?.({ groupId: rule.groupId, ruleId: rule.ruleId, url, tabId });
  }

  return {
    /** Install `plan` (empty detaches). Returns short errors, never rule bodies. */
    async apply(next: BodyPlan): Promise<string[]> {
      const key = JSON.stringify(next.rules.map((rule) => [rule.ruleId, rule.body, rule.contentType, rule.match, rule.resourceTypes, rule.pageDomains, rule.caseSensitive]));
      if (key !== planKey) cancelled.clear();
      planKey = key;
      plan = next;
      if (next.rules.length === 0) {
        await detachAll();
        return [];
      }
      const open = await tabs.query({ url: HTTP_TABS });
      const errors: string[] = [];
      for (const tab of open) {
        if (tab.id === undefined) continue;
        if (tab.url) tabUrls.set(tab.id, tab.url);
        const error = await attachTab(tab.id);
        if (error && errors.length < 3) errors.push(error);
      }
      return errors;
    },
    async stop(): Promise<void> {
      plan = { rules: [], patterns: [], broad: false, refused: [] };
      planKey = '';
      await detachAll();
    },
  };
}

export type ChromeBodySession = ReturnType<typeof createChromeBodySession>;
