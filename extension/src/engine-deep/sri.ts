import type { ReadBridgeFile } from '../local-bridge/read';
import { hostOnDomains } from '../page-inject/page-match';
import { encodePatchList, hashForAssignment, injectPatchMeta, subresourceKind, type IntegrityPatch } from './integrity-patch';
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
  const next = /integrity/i.test(html) ? rewriteTags(html, pageUrl, pageHost, patches) : html;
  if (patches.length === 0) return next;
  return injectPatchMeta(next, encodePatchList(patches));
}

function rewriteTags(html: string, pageUrl: string, pageHost: string, patches: readonly IntegrityPatch[]): string {
  const parts: string[] = [];
  let i = 0;
  while (i < html.length) {
    if (html.startsWith('<!--', i)) {
      const end = html.indexOf('-->', i + 4);
      const stop = end === -1 ? html.length : end + 3;
      parts.push(html.slice(i, stop));
      i = stop;
      continue;
    }
    const name = tagAt(html, i, 'script') ? 'script' : tagAt(html, i, 'link') ? 'link' : undefined;
    if (!name) {
      const next = html.indexOf('<', i + (html[i] === '<' ? 1 : 0));
      if (html[i] !== '<') {
        if (next === -1) {
          parts.push(html.slice(i));
          break;
        }
        parts.push(html.slice(i, next));
        i = next;
        continue;
      }
      parts.push('<');
      i += 1;
      continue;
    }
    const end = tagEnd(html, i);
    if (end === -1) {
      parts.push(html.slice(i));
      break;
    }
    const raw = html.slice(i, end);
    const hash = hashForTag(name, raw, pageUrl, pageHost, patches);
    parts.push(hash ? replaceAttribute(raw, 'integrity', hash) : raw);
    i = end;
    if (name === 'script') {
      const close = closeTag(html, i, 'script');
      parts.push(html.slice(i, close));
      i = close;
    }
  }
  return parts.join('');
}

function hashForTag(name: 'script' | 'link', raw: string, pageUrl: string, pageHost: string, patches: readonly IntegrityPatch[]): string | undefined {
  if (attributeValue(raw, 'integrity') === undefined) return undefined;
  const ref = name === 'link' ? attributeValue(raw, 'href') : attributeValue(raw, 'src');
  const kind = subresourceKind(name, { rel: attributeValue(raw, 'rel'), as: attributeValue(raw, 'as'), hasUrl: Boolean(ref) });
  if (!kind || !ref) return undefined;
  let absolute: string;
  try {
    absolute = new URL(ref, pageUrl).href;
  } catch {
    return undefined;
  }
  return hashForAssignment(patches, absolute, kind, pageHost);
}

function tagAt(html: string, index: number, name: string): boolean {
  if (html[index] !== '<') return false;
  const slice = html.slice(index + 1, index + 1 + name.length);
  if (slice.toLowerCase() !== name) return false;
  const boundary = html[index + 1 + name.length];
  return boundary === undefined || /[\s>/]/.test(boundary);
}

function tagEnd(html: string, index: number): number {
  let quote = '';
  for (let i = index; i < html.length; i++) {
    const ch = html[i]!;
    if (quote) {
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '>') return i + 1;
  }
  return -1;
}

function closeTag(html: string, index: number, name: string): number {
  const token = `</${name}`;
  const lower = html.toLowerCase();
  let from = index;
  while (from < html.length) {
    const at = lower.indexOf(token, from);
    if (at === -1) return html.length;
    const boundary = html[at + token.length];
    if (boundary === undefined || /[\s>]/.test(boundary)) {
      const end = html.indexOf('>', at);
      return end === -1 ? html.length : end + 1;
    }
    from = at + token.length;
  }
  return html.length;
}

function decodeAttr(value: string): string {
  return value.replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#0*39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>');
}

function attributeValue(tag: string, wanted: string): string | undefined {
  const found = readAttribute(tag, wanted);
  return found ? decodeAttr(found.value) : undefined;
}

function replaceAttribute(tag: string, wanted: string, nextValue: string): string {
  const found = readAttribute(tag, wanted);
  if (!found) return tag;
  return `${tag.slice(0, found.nameStart)}integrity="${nextValue}"${tag.slice(found.valueEnd)}`;
}

function readAttribute(tag: string, wanted: string): { value: string; nameStart: number; valueEnd: number } | undefined {
  const lowerWanted = wanted.toLowerCase();
  let i = 0;
  while (i < tag.length && !/[\s>/]/.test(tag[i]!)) i++;
  while (i < tag.length) {
    while (i < tag.length && /\s/.test(tag[i]!)) i++;
    if (i >= tag.length || tag[i] === '>' || tag[i] === '/') break;
    const nameStart = i;
    while (i < tag.length && !/[\s=/>]/.test(tag[i]!)) i++;
    const name = tag.slice(nameStart, i).toLowerCase();
    while (i < tag.length && /\s/.test(tag[i]!)) i++;
    let value = '';
    let valueEnd = i;
    if (tag[i] === '=') {
      i++;
      while (i < tag.length && /\s/.test(tag[i]!)) i++;
      const quote = tag[i];
      if (quote === '"' || quote === "'") {
        const end = tag.indexOf(quote, i + 1);
        value = end === -1 ? tag.slice(i + 1) : tag.slice(i + 1, end);
        valueEnd = end === -1 ? tag.length : end + 1;
        i = valueEnd;
      } else {
        const start = i;
        while (i < tag.length && !/[\s>]/.test(tag[i]!)) i++;
        value = tag.slice(start, i);
        valueEnd = i;
      }
    }
    if (name === lowerWanted) return { value, nameStart, valueEnd };
  }
  return undefined;
}
