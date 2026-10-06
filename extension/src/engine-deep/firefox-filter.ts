import { hostnameOf, pickBodyRule, replacementHeaders, type HeaderEntry } from './decide';
import type { BodyRule } from './plan';

/**
 * Firefox-only stream filter. MDN: call filter.close() or disconnect(), or the
 * response stays open forever. https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/webRequest/filterResponseData
 */
export interface StreamFilter {
  ondata: ((event: { data: ArrayBuffer }) => void) | null;
  onstop: (() => void) | null;
  onerror: (() => void) | null;
  write(data: Uint8Array): void;
  close(): void;
  disconnect(): void;
}

export interface WebRequestDetails {
  requestId: string;
  url: string;
  type: string;
  tabId?: number;
  documentUrl?: string;
  originUrl?: string;
}

export interface WebRequestApi {
  onBeforeRequest: WebRequestEvent<(details: WebRequestDetails) => void>;
  onHeadersReceived: WebRequestEvent<(details: WebRequestDetails & { responseHeaders?: HeaderEntry[] }) => { responseHeaders?: HeaderEntry[] } | void>;
  filterResponseData(requestId: string): StreamFilter;
}

interface WebRequestEvent<T> {
  addListener(cb: T, filter: { urls: string[] }, extra: string[]): void;
  removeListener(cb: T): void;
  hasListener(cb: T): boolean;
}

const URLS = { urls: ['<all_urls>'] };

function pageHost(details: WebRequestDetails): string {
  if (details.type === 'main_frame') return hostnameOf(details.url);
  return hostnameOf(details.documentUrl || details.originUrl) || hostnameOf(details.url);
}

/** Replace the stream. Original chunks are dropped, not logged. */
export function pipeReplacement(filter: StreamFilter, body: string): void {
  const bytes = new TextEncoder().encode(body);
  filter.ondata = () => {
    // Discard the server's bytes. Writing them would append them to ours.
  };
  filter.onstop = () => {
    try {
      filter.write(bytes);
      filter.close();
    } catch {
      try {
        filter.disconnect();
      } catch {
        /* already closed */
      }
    }
  };
  filter.onerror = () => {
    try {
      filter.disconnect();
    } catch {
      /* already closed */
    }
  };
}

/**
 * Installs blocking listeners only while rules are armed. Unmatched requests
 * never get a stream filter, so Firefox serves them unchanged.
 */
export function createFirefoxBodyFilter(webRequest: WebRequestApi, onMatch?: (note: { groupId: string; ruleId: string; url: string; tabId: number }) => void) {
  let rules: readonly BodyRule[] = [];

  const onBeforeRequest = (details: WebRequestDetails) => {
    if (!/^https?:/i.test(details.url)) return;
    const isMainFrame = details.type === 'main_frame' ? true : details.type === 'sub_frame' ? false : undefined;
    const rule = pickBodyRule(rules, { url: details.url, resourceType: details.type, isMainFrame, pageHost: pageHost(details) });
    if (!rule) return;
    try {
      pipeReplacement(webRequest.filterResponseData(details.requestId), rule.body);
      onMatch?.({ groupId: rule.groupId, ruleId: rule.ruleId, url: details.url, tabId: details.tabId ?? -1 });
    } catch (e) {
      console.error('Detour: could not filter a response', e instanceof Error ? e.message : e);
    }
  };

  const onHeadersReceived = (details: WebRequestDetails & { responseHeaders?: HeaderEntry[] }) => {
    const rule = pickBodyRule(rules, {
      url: details.url,
      resourceType: details.type,
      isMainFrame: details.type === 'main_frame' ? true : details.type === 'sub_frame' ? false : undefined,
      pageHost: pageHost(details),
    });
    if (!rule?.contentType) return;
    return { responseHeaders: replacementHeaders(details.responseHeaders, rule.contentType) };
  };

  const listening = () => webRequest.onBeforeRequest.hasListener(onBeforeRequest);

  return {
    install(next: readonly BodyRule[]): void {
      rules = next;
      if (next.length === 0) {
        this.clear();
        return;
      }
      if (!listening()) {
        webRequest.onBeforeRequest.addListener(onBeforeRequest, URLS, ['blocking']);
        webRequest.onHeadersReceived.addListener(onHeadersReceived, URLS, ['blocking', 'responseHeaders']);
      }
    },
    clear(): void {
      rules = [];
      if (webRequest.onBeforeRequest.hasListener(onBeforeRequest)) webRequest.onBeforeRequest.removeListener(onBeforeRequest);
      if (webRequest.onHeadersReceived.hasListener(onHeadersReceived)) webRequest.onHeadersReceived.removeListener(onHeadersReceived);
    },
  };
}

export type FirefoxBodyFilter = ReturnType<typeof createFirefoxBodyFilter>;
