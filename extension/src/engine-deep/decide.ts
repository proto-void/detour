import { hostOnDomains } from '../page-inject/page-match';
import { matchesUrl } from '../rule-model/match';
import { RESOURCE_TYPES, type ResourceType } from '../rule-model/schema';
import type { BodyRule } from './plan';

/** Headers the browser would mis-apply to a body we just wrote. */
const STRIP_ON_REPLACE = new Set(['content-encoding', 'content-length', 'transfer-encoding']);

const CDP_OR_ALIAS: Record<string, ResourceType> = {
  Stylesheet: 'stylesheet',
  Script: 'script',
  Image: 'image',
  Font: 'font',
  Media: 'media',
  XHR: 'xmlhttprequest',
  Fetch: 'xmlhttprequest',
  Ping: 'ping',
  CSPViolationReport: 'csp_report',
  WebSocket: 'websocket',
  Other: 'other',
  Manifest: 'other',
  TextTrack: 'other',
  Prefetch: 'other',
  EventSource: 'other',
  SignedExchange: 'other',
  Preflight: 'other',
  FedCM: 'other',
  beacon: 'ping',
  object_subrequest: 'object',
  imageset: 'image',
  web_manifest: 'other',
  speculative: 'other',
  xslt: 'other',
};

export interface HeaderEntry {
  name: string;
  value: string;
}

export interface BodyRequest {
  url: string;
  /** CDP resource type (Script, Document, …) or a webRequest type (script, main_frame, …). */
  resourceType: string;
  /** Set for documents when the frame id is known. Undefined = don't guess. */
  isMainFrame?: boolean;
  /** Host of the page the request belongs to. Main-frame navigations use the request URL. */
  pageHost: string;
}

export interface FulfillBody {
  requestId: string;
  responseCode: number;
  responsePhrase?: string;
  responseHeaders: HeaderEntry[];
  /** Base64, as CDP Fetch.fulfillRequest requires. */
  body: string;
}

/** Base64 of raw bytes. Chunked so a large body doesn't blow the argument stack. */
export function bytesBase64(bytes: Uint8Array): string {
  let binary = '';
  const size = 0x8000;
  for (let i = 0; i < bytes.length; i += size) {
    binary += String.fromCharCode(...bytes.subarray(i, i + size));
  }
  return btoa(binary);
}

/** UTF-8 then base64. */
export function utf8Base64(text: string): string {
  return bytesBase64(new TextEncoder().encode(text));
}

export function hostnameOf(url: string | undefined): string {
  if (!url) return '';
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

const allows = (rule: BodyRule, type: ResourceType): boolean => (rule.resourceTypes ? rule.resourceTypes.includes(type) : type !== 'main_frame');

/** Whether this CDP or webRequest type is in the rule's resource list. */
export function resourceAllowed(rule: BodyRule, type: string, isMainFrame: boolean | undefined): boolean {
  if (type === 'Document') {
    if (isMainFrame === true) return allows(rule, 'main_frame');
    if (isMainFrame === false) return allows(rule, 'sub_frame');
    // Don't replace a page when we can't tell frame from iframe.
    return Boolean(rule.resourceTypes?.includes('main_frame') && rule.resourceTypes.includes('sub_frame'));
  }
  const mapped = (RESOURCE_TYPES as readonly string[]).includes(type) ? (type as ResourceType) : (CDP_OR_ALIAS[type] ?? 'other');
  return allows(rule, mapped);
}

/** First armed rule in workspace order. */
export function pickBodyRule(rules: readonly BodyRule[], request: BodyRequest): BodyRule | undefined {
  for (const rule of rules) {
    if (rule.pageDomains && !hostOnDomains(request.pageHost, rule.pageDomains)) continue;
    if (!resourceAllowed(rule, request.resourceType, request.isMainFrame)) continue;
    try {
      if (!matchesUrl(rule.match, request.url, rule.caseSensitive)) continue;
    } catch {
      continue;
    }
    return rule;
  }
  return undefined;
}

/**
 * Drop encoding headers so the new bytes aren't gunzipped, and optionally
 * replace Content-Type. Other headers (including CSP) stay.
 */
export function replacementHeaders(original: readonly HeaderEntry[] | undefined, contentType?: string, options?: { noStore?: boolean }): HeaderEntry[] {
  const headers = (original ?? []).filter((header) => !STRIP_ON_REPLACE.has(header.name.toLowerCase())).map((header) => ({ ...header }));
  const type = contentType?.trim();
  if (type) {
    const index = headers.findIndex((header) => header.name.toLowerCase() === 'content-type');
    if (index >= 0) headers[index] = { name: headers[index]!.name, value: type };
    else headers.push({ name: 'content-type', value: type });
  }
  if (options?.noStore) {
    const index = headers.findIndex((header) => header.name.toLowerCase() === 'cache-control');
    if (index >= 0) headers[index] = { name: headers[index]!.name, value: 'no-store' };
    else headers.push({ name: 'cache-control', value: 'no-store' });
  }
  return headers;
}

/** Fulfill with raw bytes. `noStore` is for bridge files, which change on disk between reloads. */
export function fulfillRaw(
  requestId: string,
  bytes: Uint8Array,
  status: number | undefined,
  statusText: string | undefined,
  headers: readonly HeaderEntry[] | undefined,
  contentType?: string,
  noStore = false,
): FulfillBody {
  const responseCode = status && status >= 100 && status <= 599 ? status : 200;
  const phrase = statusText?.trim();
  return {
    requestId,
    responseCode,
    ...(phrase && { responsePhrase: phrase }),
    responseHeaders: replacementHeaders(headers, contentType, noStore ? { noStore: true } : undefined),
    body: bytesBase64(bytes),
  };
}

export function fulfillParams(requestId: string, rule: BodyRule, status: number | undefined, statusText: string | undefined, headers: readonly HeaderEntry[] | undefined): FulfillBody {
  return fulfillRaw(requestId, new TextEncoder().encode(rule.body), status, statusText, headers, rule.contentType, false);
}
