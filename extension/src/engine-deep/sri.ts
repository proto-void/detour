import type { ReadBridgeFile } from '../local-bridge/read';
import { hostOnDomains } from '../page-inject/page-match';
import { encodePatchList, injectPatchMeta, rewriteMarkupIntegrity, type IntegrityPatch } from './integrity-patch';
import type { BodyRule } from './plan';

/**
 * HTML documents Detour will rewrite while a body rule is armed.
 * Larger pages keep the published integrity hashes.
 */
export const DOCUMENT_BYTE_CAP = 2_000_000;

/**
 * SRI metadata for the bytes Detour will serve.
 * SHA-384 is the algorithm the integrity attribute accepts alongside SHA-256 and SHA-512.
 * https://w3c.github.io/webappsec-subresource-integrity/#hash-functions
 */
export async function integrityMetadata(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-384', bytes as BufferSource));
  let binary = '';
  for (const byte of digest) binary += String.fromCharCode(byte);
  return `sha384-${btoa(binary)}`;
}

/** `text/html` or XHTML with UTF-8 or an omitted charset. Anything else is left alone. */
export function isRewritableHtml(contentType: string | undefined): boolean {
  if (!contentType) return false;
  const media = contentType.split(';', 1)[0]?.trim().toLowerCase();
  if (media !== 'text/html' && media !== 'application/xhtml+xml') return false;
  const charset = /charset\s*=\s*["']?([^"';\s]+)/i.exec(contentType)?.[1]?.toLowerCase();
  return charset === undefined || charset === 'utf-8' || charset === 'utf8';
}

/**
 * One read per rule for the life of this map. The document hash and the later
 * fulfill must be the same bytes. A failed read is not cached.
 */
export async function loadRuleBytes(rule: BodyRule, readFile: ReadBridgeFile | undefined, cache: Map<string, Uint8Array>): Promise<Uint8Array | undefined> {
  const hit = cache.get(rule.ruleId);
  if (hit) return hit;
  let bytes: Uint8Array | undefined;
  if (!rule.bridgePath) bytes = new TextEncoder().encode(rule.body);
  else if (readFile) {
    try {
      const read = await readFile(rule.bridgePath);
      if (read.ok) bytes = read.bytes;
    } catch {
      bytes = undefined;
    }
  }
  if (bytes) cache.set(rule.ruleId, bytes);
  return bytes;
}

/**
 * Bytes to fulfill in place of this HTML, or undefined when the document should
 * pass through unchanged (not HTML, too big, not valid UTF-8, or nothing to publish).
 */
export async function tryRewriteHtmlBytes(
  bytes: Uint8Array,
  contentType: string | undefined,
  pageUrl: string,
  pageHost: string,
  rules: readonly BodyRule[],
  load: (rule: BodyRule) => Promise<Uint8Array | undefined>,
): Promise<Uint8Array | undefined> {
  if (!isRewritableHtml(contentType) || bytes.byteLength > DOCUMENT_BYTE_CAP) return undefined;
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return undefined;
  }
  const next = await rewriteDocumentIntegrity(text, pageUrl, pageHost, rules, load);
  if (next === text) return undefined;
  return new TextEncoder().encode(next);
}

/**
 * Hashes for rules whose bytes could be read. A failed read is omitted so the page's hash stays.
 * The same `load` result is what the body engine fulfills.
 */
export async function integrityPatches(rules: readonly BodyRule[], load: (rule: BodyRule) => Promise<Uint8Array | undefined>): Promise<IntegrityPatch[]> {
  const patches: IntegrityPatch[] = [];
  for (const rule of rules) {
    const bytes = await load(rule);
    if (!bytes) continue;
    patches.push({
      match: rule.match,
      caseSensitive: rule.caseSensitive,
      ...(rule.resourceTypes && { resourceTypes: rule.resourceTypes }),
      ...(rule.pageDomains && { pageDomains: rule.pageDomains }),
      integrity: await integrityMetadata(bytes),
    });
  }
  return patches;
}

/**
 * Replace `integrity` on script and stylesheet tags whose URL matches an armed
 * rule, and embed that hash list for assignments page JavaScript makes later.
 * The parser snapshots the attribute when it prepares the element, so a tag's
 * hash has to be in the document bytes.
 * https://html.spec.whatwg.org/multipage/scripting.html#prepare-the-script-element
 */
export async function rewriteDocumentIntegrity(
  html: string,
  pageUrl: string,
  pageHost: string,
  rules: readonly BodyRule[],
  load: (rule: BodyRule) => Promise<Uint8Array | undefined>,
): Promise<string> {
  if (html.length > DOCUMENT_BYTE_CAP) return html;
  const patches = (await integrityPatches(rules, load)).filter((patch) => !patch.pageDomains || hostOnDomains(pageHost, patch.pageDomains));
  const next = /integrity/i.test(html) ? rewriteMarkupIntegrity(html, pageUrl, pageHost, patches) : html;
  if (patches.length === 0) return next;
  return injectPatchMeta(next, encodePatchList(patches));
}
