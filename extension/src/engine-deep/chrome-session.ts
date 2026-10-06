import type { ReadBridgeFile } from '../local-bridge/read';
import { contentTypeForRelative } from '../local-bridge/paths';
import { fulfillRaw, hostnameOf, pickBodyRule, type HeaderEntry } from './decide';
import type { BodyPlan, BodyRule } from './plan';
import { DOCUMENT_BYTE_CAP, isRewritableHtml, tryRewriteHtmlBytes } from './sri';

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

function headerValue(headers: readonly HeaderEntry[] | undefined, name: string): string | undefined {
  return headers?.find((header) => header.name.toLowerCase() === name)?.value;
}

/** CDP returns the response body as a string, base64 when it isn't already text. */
function decodeCdpBody(body: string, base64Encoded: boolean | undefined): Uint8Array {
  if (!base64Encoded) return new TextEncoder().encode(body);
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

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
  let readFile: ReadBridgeFile | undefined;
  /** Bytes already hashed into a document, reused for the script or stylesheet fulfill. */
  const prepared = new Map<string, { bytes: Uint8Array; status?: number; phrase?: string; contentType?: string; noStore: boolean }>();
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

  async function rewriteDocument(
    tabId: number,
    requestId: string,
    event: PausedEvent,
    pageUrl: string,
    pageHost: string,
    finish: (method: 'Fetch.continueResponse' | 'Fetch.fulfillRequest', params: object) => Promise<boolean>,
  ): Promise<void> {
    let payload: { body?: string; base64Encoded?: boolean } | undefined;
    try {
      payload = (await dbg.sendCommand({ tabId }, 'Fetch.getResponseBody', { requestId })) as { body?: string; base64Encoded?: boolean };
    } catch {
      await finish('Fetch.continueResponse', { requestId });
      return;
    }
    const body = payload?.body;
    if (body === undefined || body.length > DOCUMENT_BYTE_CAP * 2) {
      await finish('Fetch.continueResponse', { requestId });
      return;
    }
    const original = decodeCdpBody(body, payload?.base64Encoded);
    if (original.byteLength > DOCUMENT_BYTE_CAP) {
      await finish('Fetch.continueResponse', { requestId });
      return;
    }
    let rewritten: Uint8Array | undefined;
    try {
      rewritten = await tryRewriteHtmlBytes(original, headerValue(event.responseHeaders, 'content-type'), pageUrl, pageHost, plan.rules, async (rule) => (await bytesFor(rule))?.bytes);
    } catch {
      rewritten = undefined;
    }
    await finish(
      'Fetch.fulfillRequest',
      fulfillRaw(requestId, rewritten ?? original, event.responseStatusCode, event.responseStatusText, event.responseHeaders, headerValue(event.responseHeaders, 'content-type'), rewritten !== undefined),
    );
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
      if (isDocument && isRewritableHtml(headerValue(event.responseHeaders, 'content-type'))) await rewriteDocument(tabId, requestId, event, url, pageHost, finish);
      else await finish('Fetch.continueResponse', { requestId });
      return;
    }
    const replacement = await bytesFor(rule);
    if (!replacement) {
      await finish('Fetch.continueResponse', { requestId });
      return;
    }
    const replaced = await finish(
      'Fetch.fulfillRequest',
      fulfillRaw(
        requestId,
        replacement.bytes,
        replacement.status ?? event.responseStatusCode,
        replacement.phrase ?? event.responseStatusText,
        event.responseHeaders,
        replacement.contentType,
        replacement.noStore,
      ),
    );
    if (replaced) onMatch?.({ groupId: rule.groupId, ruleId: rule.ruleId, url, tabId });
  }

  async function bytesFor(rule: BodyRule): Promise<{ bytes: Uint8Array; status?: number; phrase?: string; contentType?: string; noStore: boolean } | undefined> {
    const hit = prepared.get(rule.ruleId);
    if (hit) return hit;
    const store = (result: { bytes: Uint8Array; status?: number; phrase?: string; contentType?: string; noStore: boolean } | undefined) => {
      if (result) prepared.set(rule.ruleId, result);
      return result;
    };
    if (!rule.bridgePath) {
      return store({ bytes: new TextEncoder().encode(rule.body), status: undefined, phrase: undefined, contentType: rule.contentType, noStore: false });
    }
    if (!readFile) return undefined;
    try {
      const read = await readFile(rule.bridgePath);
      if (!read.ok) return undefined;
      return store({ bytes: read.bytes, status: 200, phrase: 'OK', contentType: rule.contentType ?? read.contentType ?? contentTypeForRelative(rule.bridgePath), noStore: true });
    } catch {
      return undefined;
    }
  }

  return {
    /** Install `plan` (empty detaches). Returns short errors, never rule bodies. `read` is used for bridge paths and is not logged. */
    async apply(next: BodyPlan, read?: ReadBridgeFile): Promise<string[]> {
      readFile = read;
      prepared.clear();
      const key = JSON.stringify(next.rules.map((rule) => [rule.ruleId, rule.body, rule.bridgePath, rule.contentType, rule.match, rule.resourceTypes, rule.pageDomains, rule.caseSensitive]));
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
      prepared.clear();
      await detachAll();
    },
  };
}

export type ChromeBodySession = ReturnType<typeof createChromeBodySession>;
