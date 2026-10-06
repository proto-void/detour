import { contentTypeForRelative } from '../local-bridge/paths';
import type { ReadBridgeFile } from '../local-bridge/read';
import { hostnameOf, pickBodyRule, replacementHeaders, type HeaderEntry } from './decide';
import type { BodyRule } from './plan';
import { DOCUMENT_BYTE_CAP, isRewritableHtml, loadRuleBytes, tryRewriteHtmlBytes } from './sri';

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
 * Wait for bridge bytes, then replace the stream. Until they arrive, original chunks are held.
 * `undefined` means the read failed: write the original chunks back. Do not log them.
 */
export function pipeReplacementBytes(filter: StreamFilter, pending: Promise<Uint8Array | undefined>): void {
  const original: Uint8Array[] = [];
  let stopped = false;
  let settled: Uint8Array | undefined;
  let failed = false;

  const finish = () => {
    try {
      if (settled !== undefined) filter.write(settled);
      else for (const chunk of original) filter.write(chunk);
      filter.close();
    } catch {
      try {
        filter.disconnect();
      } catch {
        /* already closed */
      }
    }
  };

  filter.ondata = (event) => {
    if (settled !== undefined) return;
    original.push(new Uint8Array(event.data));
  };
  filter.onstop = () => {
    stopped = true;
    if (settled !== undefined || failed) finish();
  };
  filter.onerror = () => {
    try {
      filter.disconnect();
    } catch {
      /* already closed */
    }
  };

  pending.then(
    (bytes) => {
      if (bytes === undefined) failed = true;
      else {
        settled = bytes;
        original.length = 0;
      }
      if (stopped) finish();
    },
    () => {
      failed = true;
      if (stopped) finish();
    },
  );
}

/**
 * Installs blocking listeners only while rules are armed. Unmatched requests
 * never get a stream filter, so Firefox serves them unchanged.
 */
type DocMode = 'unknown' | 'html' | 'raw';

/**
 * Buffer a document until we know whether it is HTML. HTML may have matching
 * integrity hashes rewritten. Other documents are written back as received.
 * Call from onBeforeRequest so the filter exists before the body arrives.
 * https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/webRequest/filterResponseData
 */
export function pipeDocument(filter: StreamFilter, mode: () => DocMode, rewrite: (bytes: Uint8Array) => Promise<Uint8Array | undefined>): void {
  const chunks: Uint8Array[] = [];
  let total = 0;
  let passthrough = false;

  const fail = () => {
    try {
      filter.disconnect();
    } catch {
      /* already closed */
    }
  };

  const writeChunks = (extra?: Uint8Array) => {
    for (const chunk of chunks) filter.write(chunk);
    chunks.length = 0;
    if (extra) filter.write(extra);
  };

  filter.ondata = (event) => {
    const chunk = new Uint8Array(event.data);
    if (passthrough) {
      filter.write(chunk);
      return;
    }
    const current = mode();
    if (current === 'raw') {
      passthrough = true;
      writeChunks(chunk);
      return;
    }
    total += chunk.byteLength;
    if (total > DOCUMENT_BYTE_CAP) {
      passthrough = true;
      writeChunks(chunk);
      return;
    }
    chunks.push(chunk);
  };
  filter.onstop = () => {
    if (passthrough) {
      try {
        filter.close();
      } catch {
        fail();
      }
      return;
    }
    const merged = concatBytes(chunks);
    if (mode() !== 'html') {
      try {
        if (merged.byteLength > 0) filter.write(merged);
        filter.close();
      } catch {
        fail();
      }
      return;
    }
    void rewrite(merged).then(
      (next) => {
        try {
          filter.write(next ?? merged);
          filter.close();
        } catch {
          fail();
        }
      },
      () => {
        try {
          if (merged.byteLength > 0) filter.write(merged);
          filter.close();
        } catch {
          fail();
        }
      },
    );
  };
  filter.onerror = fail;
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export function createFirefoxBodyFilter(webRequest: WebRequestApi, onMatch?: (note: { groupId: string; ruleId: string; url: string; tabId: number }) => void) {
  let rules: readonly BodyRule[] = [];
  let readFile: ReadBridgeFile | undefined;
  const prepared = new Map<string, Uint8Array>();
  const docTypes = new Map<string, string | undefined>();

  const onBeforeRequest = (details: WebRequestDetails) => {
    if (!/^https?:/i.test(details.url)) return;
    const isMainFrame = details.type === 'main_frame' ? true : details.type === 'sub_frame' ? false : undefined;
    const isDocument = details.type === 'main_frame' || details.type === 'sub_frame';
    const rule = pickBodyRule(rules, { url: details.url, resourceType: details.type, isMainFrame, pageHost: pageHost(details) });
    if (!rule) {
      if (!isDocument) return;
      try {
        const requestId = details.requestId;
        pipeDocument(
          webRequest.filterResponseData(requestId),
          () => {
            if (!docTypes.has(requestId)) return 'unknown';
            return isRewritableHtml(docTypes.get(requestId)) ? 'html' : 'raw';
          },
          (bytes) => tryRewriteHtmlBytes(bytes, docTypes.get(requestId), details.url, pageHost(details), rules, (candidate) => loadRuleBytes(candidate, readFile, prepared)),
        );
      } catch (e) {
        console.error('Detour: could not filter a document', e instanceof Error ? e.message : e);
      }
      return;
    }
    try {
      if (rule.bridgePath) {
        if (!readFile) return;
        const pending = loadRuleBytes(rule, readFile, prepared);
        pipeReplacementBytes(webRequest.filterResponseData(details.requestId), pending);
        void pending.then((bytes) => {
          if (bytes) onMatch?.({ groupId: rule.groupId, ruleId: rule.ruleId, url: details.url, tabId: details.tabId ?? -1 });
        });
        return;
      }
      pipeReplacement(webRequest.filterResponseData(details.requestId), rule.body);
      onMatch?.({ groupId: rule.groupId, ruleId: rule.ruleId, url: details.url, tabId: details.tabId ?? -1 });
    } catch (e) {
      console.error('Detour: could not filter a response', e instanceof Error ? e.message : e);
    }
  };

  const onHeadersReceived = (details: WebRequestDetails & { responseHeaders?: HeaderEntry[] }) => {
    const contentTypeHeader = details.responseHeaders?.find((header) => header.name.toLowerCase() === 'content-type')?.value;
    const isDocument = details.type === 'main_frame' || details.type === 'sub_frame';
    if (isDocument) docTypes.set(details.requestId, contentTypeHeader);
    const rule = pickBodyRule(rules, {
      url: details.url,
      resourceType: details.type,
      isMainFrame: details.type === 'main_frame' ? true : details.type === 'sub_frame' ? false : undefined,
      pageHost: pageHost(details),
    });
    if (!rule) {
      if (!isDocument) return;
      // filterResponseData yields decoded bytes. Drop content-encoding so Firefox does not inflate them again.
      return { responseHeaders: replacementHeaders(details.responseHeaders, undefined, isRewritableHtml(contentTypeHeader) ? { noStore: true } : undefined) };
    }
    const contentType = rule.contentType ?? (rule.bridgePath ? contentTypeForRelative(rule.bridgePath) : undefined);
    if (!rule.bridgePath && !contentType) return;
    return { responseHeaders: replacementHeaders(details.responseHeaders, contentType, rule.bridgePath ? { noStore: true } : undefined) };
  };

  const listening = () => webRequest.onBeforeRequest.hasListener(onBeforeRequest);

  return {
    install(next: readonly BodyRule[], read?: ReadBridgeFile): void {
      rules = next;
      readFile = read;
      prepared.clear();
      docTypes.clear();
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
      readFile = undefined;
      prepared.clear();
      docTypes.clear();
      if (webRequest.onBeforeRequest.hasListener(onBeforeRequest)) webRequest.onBeforeRequest.removeListener(onBeforeRequest);
      if (webRequest.onHeadersReceived.hasListener(onHeadersReceived)) webRequest.onHeadersReceived.removeListener(onHeadersReceived);
    },
  };
}

export type FirefoxBodyFilter = ReturnType<typeof createFirefoxBodyFilter>;
