import { pickBodyRule } from './decide';
import type { BodyRule } from './plan';
import { siteHost } from '../page-inject/page-match';
import { RESOURCE_TYPES, type Match, type ResourceType } from '../rule-model/schema';

/**
 * Hash list embedded in a rewritten document. No rule body and no bridge token.
 * The page can read it; the hook copies it once. See ADR-015.
 */
export interface IntegrityPatch {
  match: Match;
  caseSensitive: boolean;
  resourceTypes?: ResourceType[];
  pageDomains?: string[];
  /** `sha384-` of the bytes the body engine will serve. */
  integrity: string;
}

/** SHA-384 is 48 bytes, which is 64 standard-base64 characters and no padding. */
const SHA384 = /^sha384-[A-Za-z0-9+/]{64}$/;
const MAX_PATCHES = 100;
const MAX_PATTERN = 2000;
const MAX_META = 100_000;

export const SRI_META_NAME = 'detour-sri';

export function isPublishableHash(value: string): boolean {
  return SHA384.test(value);
}

export function subresourceKind(tag: 'script' | 'link', attrs: { rel?: string; as?: string; hasUrl: boolean }): 'script' | 'stylesheet' | undefined {
  if (!attrs.hasUrl) return undefined;
  if (tag === 'script') return 'script';
  const rel = (attrs.rel ?? '').toLowerCase().split(/\s+/);
  const as = (attrs.as ?? '').toLowerCase();
  if (rel.includes('stylesheet')) return 'stylesheet';
  if (rel.includes('modulepreload')) return 'script';
  if (rel.includes('preload') && as === 'script') return 'script';
  if (rel.includes('preload') && (as === 'style' || as === 'stylesheet')) return 'stylesheet';
  return undefined;
}

export function absoluteUrl(ref: string, pageUrl: string): string | undefined {
  try {
    return new URL(ref, pageUrl).href;
  } catch {
    return undefined;
  }
}

/**
 * Hash to write for this assignment, or undefined when the page's value must stay.
 * Never returns an empty string in place of a hash the page set.
 */
export function hashForAssignment(patches: readonly IntegrityPatch[], url: string, kind: 'script' | 'stylesheet', pageHost: string): string | undefined {
  const rules: BodyRule[] = [];
  const hashes: string[] = [];
  for (const patch of patches) {
    if (!isPublishableHash(patch.integrity) || !usableMatch(patch.match)) continue;
    rules.push({
      groupId: 'p',
      ruleId: String(rules.length),
      match: patch.match,
      caseSensitive: patch.caseSensitive,
      ...(patch.resourceTypes && patch.resourceTypes.length > 0 && { resourceTypes: patch.resourceTypes }),
      ...(patch.pageDomains && patch.pageDomains.length > 0 && { pageDomains: patch.pageDomains }),
      body: '',
    });
    hashes.push(patch.integrity);
  }
  const rule = pickBodyRule(rules, { url, resourceType: kind, pageHost });
  return rule ? hashes[Number(rule.ruleId)] : undefined;
}

export function resolveAssignedIntegrity(
  patches: readonly IntegrityPatch[],
  assigned: string,
  pageUrl: string,
  pageHost: string,
  tag: 'script' | 'link',
  attrs: { src?: string; href?: string; rel?: string; as?: string },
): string {
  const ref = tag === 'script' ? attrs.src : attrs.href;
  if (!ref) return assigned;
  const kind = subresourceKind(tag, { rel: attrs.rel, as: attrs.as, hasUrl: true });
  if (!kind) return assigned;
  const url = absoluteUrl(ref, pageUrl);
  if (!url) return assigned;
  return hashForAssignment(patches, url, kind, pageHost) ?? assigned;
}

export function encodePatchList(patches: readonly IntegrityPatch[]): string {
  const clean = patches.slice(0, MAX_PATCHES).map((patch) => ({
    match: { kind: patch.match.kind, pattern: patch.match.pattern },
    caseSensitive: patch.caseSensitive,
    ...(patch.resourceTypes && { resourceTypes: patch.resourceTypes }),
    ...(patch.pageDomains && { pageDomains: patch.pageDomains }),
    integrity: patch.integrity,
  }));
  const bytes = new TextEncoder().encode(JSON.stringify(clean));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Drop anything that is not a usable patch. A bad list becomes empty, and the page's hash stays. */
export function decodePatchList(content: string): IntegrityPatch[] {
  if (content.length === 0 || content.length > MAX_META) return [];
  let parsed: unknown;
  try {
    const binary = atob(content);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const patches: IntegrityPatch[] = [];
  for (const entry of parsed) {
    if (patches.length >= MAX_PATCHES) break;
    const patch = readPatch(entry);
    if (patch) patches.push(patch);
  }
  return patches;
}

/** Insert the list where the parser will see it before any page script. */
export function injectPatchMeta(html: string, encoded: string): string {
  const meta = `<meta name="${SRI_META_NAME}" content="${encoded}">`;
  const without = html.replace(/<meta\b[^>]*\bname\s*=\s*(?:"detour-sri"|'detour-sri')[^>]*>/gi, '');
  const doctype = /<!doctype\b[^>]*>/i.exec(without);
  if (doctype && doctype.index < 1000) {
    const end = doctype.index + doctype[0].length;
    return `${without.slice(0, end)}${meta}${without.slice(end)}`;
  }
  return `${meta}${without}`;
}

interface AttrNode {
  getAttribute?(name: string): string | null;
}

export interface PatchRoot {
  document: {
    documentElement: object | null;
    readyState?: string;
    querySelector(selector: string): { getAttribute(name: string): string | null } | null;
    addEventListener?(type: string, listener: () => void, options?: { once?: boolean }): void;
  };
  location: { href: string; hostname: string; ancestorOrigins?: { length: number; [index: number]: string } };
  MutationObserver: new (callback: () => void) => { observe(target: object, options: { childList: boolean; subtree: boolean }): void; disconnect(): void };
  HTMLScriptElement: new (...args: never[]) => object;
  HTMLLinkElement: new (...args: never[]) => object;
  Element: { prototype: object };
  Node: { prototype: object };
}

const INSTALLED = Symbol.for('detour.sri.installed');

/**
 * MAIN-world hook. Substitutes a published hash when the page assigns `integrity`
 * to a matching script or stylesheet. Other assignments are written through.
 */
export function installIntegrityPatch(root: PatchRoot): void {
  const marked = root as unknown as Record<symbol, boolean>;
  if (marked[INSTALLED]) return;
  marked[INSTALLED] = true;

  let frozen = false;
  let list: IntegrityPatch[] = [];
  const remembered = new WeakMap<object, string>();
  let applying = false;

  const selector = `meta[name="${SRI_META_NAME}"]`;
  const snapshot = (): boolean => {
    if (frozen) return true;
    const meta = root.document.querySelector(selector);
    if (!meta) return false;
    frozen = true;
    const content = meta.getAttribute('content') ?? '';
    list = decodePatchList(content);
    return true;
  };
  const patches = (): readonly IntegrityPatch[] => {
    if (!frozen) snapshot();
    return list;
  };

  const tagOf = (node: object): 'script' | 'link' | undefined => {
    if (node instanceof root.HTMLScriptElement) return 'script';
    if (node instanceof root.HTMLLinkElement) return 'link';
    return undefined;
  };
  const readAttr = (node: object, name: string, override?: string): string => {
    if (override !== undefined) return override;
    const value = (node as AttrNode).getAttribute?.(name);
    return value ?? '';
  };
  const scriptIntegrity = Object.getOwnPropertyDescriptor(root.HTMLScriptElement.prototype, 'integrity')?.set;
  const linkIntegrity = Object.getOwnPropertyDescriptor(root.HTMLLinkElement.prototype, 'integrity')?.set;
  const writeIntegrity = (node: object, tag: 'script' | 'link', value: string) => {
    const native = tag === 'script' ? scriptIntegrity : linkIntegrity;
    if (native) native.call(node, value);
    else nativeSetAttribute?.call(node, 'integrity', value);
  };
  const apply = (node: object, overrides?: { src?: string; href?: string }) => {
    if (applying) return;
    const tag = tagOf(node);
    if (!tag || !remembered.has(node)) return;
    const assigned = remembered.get(node) ?? '';
    const next = resolveAssignedIntegrity(patches(), assigned, root.location.href, siteHost(root.location), tag, {
      src: readAttr(node, 'src', overrides?.src),
      href: readAttr(node, 'href', overrides?.href),
      rel: readAttr(node, 'rel'),
      as: readAttr(node, 'as'),
    });
    applying = true;
    try {
      writeIntegrity(node, tag, next);
    } finally {
      applying = false;
    }
  };

  const setAttrDesc = Object.getOwnPropertyDescriptor(root.Element.prototype, 'setAttribute');
  const nativeSetAttribute = setAttrDesc?.value as ((this: object, name: string, value: string) => void) | undefined;
  if (typeof nativeSetAttribute === 'function') {
    (root.Element.prototype as { setAttribute: (name: string, value: string) => void }).setAttribute = function (this: object, name: string, value: string) {
      const tag = tagOf(this);
      const lower = String(name).toLowerCase();
      if (!applying && tag && lower === 'integrity') {
        remembered.set(this, String(value));
        apply(this);
        return;
      }
      if (!applying && tag && (lower === 'src' || lower === 'href')) {
        apply(this, lower === 'src' ? { src: String(value) } : { href: String(value) });
      }
      return nativeSetAttribute.call(this, name, value);
    } as (name: string, value: string) => void;
  }

  // The integrity setter writes the chosen hash itself. Calling the native setter afterwards would put the page's hash back.
  hookAssign(root.HTMLScriptElement.prototype, 'integrity', (node, value) => {
    remembered.set(node, String(value));
    apply(node);
  });
  hookAssign(root.HTMLLinkElement.prototype, 'integrity', (node, value) => {
    remembered.set(node, String(value));
    apply(node);
  });
  hookAccessor(root.HTMLScriptElement.prototype, 'src', (node, value) => {
    apply(node, { src: String(value) });
  });
  hookAccessor(root.HTMLLinkElement.prototype, 'href', (node, value) => {
    apply(node, { href: String(value) });
  });

  hookInsert(root.Node.prototype, 'appendChild', (node) => apply(node));
  hookInsert(root.Node.prototype, 'insertBefore', (node) => apply(node));
  hookNodes(root.Element.prototype, 'append', (node) => apply(node));
  hookNodes(root.Element.prototype, 'prepend', (node) => apply(node));

  if (root.document.readyState && root.document.readyState !== 'loading') {
    snapshot();
    return;
  }
  let observer: { observe(target: object, options: { childList: boolean; subtree: boolean }): void; disconnect(): void } | undefined;
  try {
    observer = new root.MutationObserver(() => {
      if (snapshot()) observer?.disconnect();
    });
    const target = root.document.documentElement;
    if (target) observer.observe(target, { childList: true, subtree: true });
  } catch {
    observer = undefined;
  }
  root.document.addEventListener?.('DOMContentLoaded', () => observer?.disconnect(), { once: true });
}

function usableMatch(match: Match | undefined): match is Match {
  if (!match || (match.kind !== 'glob' && match.kind !== 'regex')) return false;
  if (typeof match.pattern !== 'string' || match.pattern.length === 0 || match.pattern.length > MAX_PATTERN) return false;
  if (match.kind === 'regex') {
    try {
      new RegExp(match.pattern);
    } catch {
      return false;
    }
  }
  return true;
}

function readPatch(entry: unknown): IntegrityPatch | undefined {
  if (!entry || typeof entry !== 'object') return undefined;
  const row = entry as Partial<IntegrityPatch>;
  if (!usableMatch(row.match) || typeof row.integrity !== 'string' || !isPublishableHash(row.integrity)) return undefined;
  const resourceTypes = Array.isArray(row.resourceTypes)
    ? row.resourceTypes.filter((type): type is ResourceType => (RESOURCE_TYPES as readonly string[]).includes(type))
    : undefined;
  const pageDomains = Array.isArray(row.pageDomains)
    ? row.pageDomains.filter((domain): domain is string => typeof domain === 'string' && domain.length > 0 && domain.length <= 253).slice(0, 50)
    : undefined;
  return {
    match: { kind: row.match.kind, pattern: row.match.pattern },
    caseSensitive: row.caseSensitive === true,
    ...(resourceTypes && resourceTypes.length > 0 && { resourceTypes }),
    ...(pageDomains && pageDomains.length > 0 && { pageDomains }),
    integrity: row.integrity,
  };
}

/** Replace a setter and do not call the native one. `before` writes the attribute. */
function hookAssign(proto: object, name: 'integrity', before: (node: object, value: unknown) => void) {
  const desc = Object.getOwnPropertyDescriptor(proto, name);
  if (!desc?.set || !desc.get) return;
  try {
    Object.defineProperty(proto, name, {
      configurable: true,
      enumerable: desc.enumerable ?? true,
      get() {
        return desc.get!.call(this);
      },
      set(value: unknown) {
        before(this, value);
      },
    });
  } catch {
    /* setAttribute still covers pages that assign the attribute by name. */
  }
}

function hookAccessor(proto: object, name: 'src' | 'href', before: (node: object, value: unknown) => void) {
  const desc = Object.getOwnPropertyDescriptor(proto, name);
  if (!desc?.set || !desc.get) return;
  const nativeSet = desc.set;
  try {
    Object.defineProperty(proto, name, {
      configurable: true,
      enumerable: desc.enumerable ?? true,
      get() {
        return desc.get!.call(this);
      },
      set(value: unknown) {
        before(this, value);
        nativeSet.call(this, value);
      },
    });
  } catch {
    /* A non-configurable accessor leaves setAttribute as the remaining path. */
  }
}

function hookInsert(proto: object, name: 'appendChild' | 'insertBefore', prepare: (node: object) => void) {
  const desc = Object.getOwnPropertyDescriptor(proto, name);
  const native = desc?.value as ((this: object, node: unknown, ...rest: unknown[]) => unknown) | undefined;
  if (typeof native !== 'function') return;
  (proto as Record<string, unknown>)[name] = function (this: object, node: unknown, ...rest: unknown[]) {
    if (node && typeof node === 'object') prepare(node);
    return native.call(this, node, ...rest);
  };
}

function hookNodes(proto: object, name: 'append' | 'prepend', prepare: (node: object) => void) {
  const desc = Object.getOwnPropertyDescriptor(proto, name);
  const native = desc?.value as ((this: object, ...nodes: unknown[]) => unknown) | undefined;
  if (typeof native !== 'function') return;
  (proto as Record<string, unknown>)[name] = function (this: object, ...nodes: unknown[]) {
    for (const node of nodes) if (node && typeof node === 'object') prepare(node);
    return native.call(this, ...nodes);
  };
}
