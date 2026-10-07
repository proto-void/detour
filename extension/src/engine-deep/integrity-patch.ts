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
  Range?: { prototype: object };
  ShadowRoot?: { prototype: object };
  /** Static `parseHTMLUnsafe`. Absent in a realm that does not implement it. */
  Document?: object;
  DOMParser?: { prototype: object };
}

const INSTALLED = Symbol.for('detour.sri.installed');

/**
 * MAIN-world hook. Substitutes a published hash when the page assigns `integrity`
 * to a matching script or stylesheet, and when that hash is carried in a string
 * passed to `innerHTML`, `outerHTML`, `ShadowRoot.innerHTML`, `insertAdjacentHTML`,
 * `createContextualFragment`, `setHTMLUnsafe` (scripts on or off), or
 * `Document.parseHTMLUnsafe`, and when `DOMParser.parseFromString` is `text/html`,
 * and when `setAttributeNS`, `setAttributeNode`, or `setAttributeNodeNS` sets HTML
 * `integrity`. Other assignments are written through.
 * A node moved out of the parsed document carries that hash. Scripting on that document stays off.
 */
export function installIntegrityPatch(root: PatchRoot): void {
  const marked = root as unknown as Record<symbol, boolean>;
  if (marked[INSTALLED]) return;
  marked[INSTALLED] = true;

  let frozen = false;
  let list: IntegrityPatch[] = [];
  const remembered = new WeakMap<object, string>();
  let applying = false;
  let adopting = false;

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
      if (!applying && !adopting && tag && lower === 'integrity') {
        remembered.set(this, String(value));
        apply(this);
        return;
      }
      if (!applying && !adopting && tag && (lower === 'src' || lower === 'href')) {
        apply(this, lower === 'src' ? { src: String(value) } : { href: String(value) });
      }
      return nativeSetAttribute.call(this, name, value);
    } as (name: string, value: string) => void;
  }

  // setAttributeNS does not call setAttribute. Copying a parser attribute uses it.
  const setAttrNsDesc = Object.getOwnPropertyDescriptor(root.Element.prototype, 'setAttributeNS');
  const nativeSetAttributeNS = setAttrNsDesc?.value as ((this: object, namespace: string | null, name: string, value: string) => void) | undefined;
  if (typeof nativeSetAttributeNS === 'function') {
    (root.Element.prototype as { setAttributeNS: (namespace: string | null, name: string, value: string) => void }).setAttributeNS = function (
      this: object,
      namespace: string | null,
      name: string,
      value: string,
    ) {
      const tag = tagOf(this);
      const local = htmlUrlAttribute(name);
      if (!applying && !adopting && tag && isHtmlNamespace(namespace) && local === 'integrity') {
        remembered.set(this, String(value));
        apply(this);
        return;
      }
      if (!applying && !adopting && tag && isHtmlNamespace(namespace) && (local === 'src' || local === 'href')) {
        apply(this, local === 'src' ? { src: String(value) } : { href: String(value) });
      }
      return nativeSetAttributeNS.call(this, namespace, name, value);
    };
  }

  // setAttributeNode does not call setAttribute or setAttributeNS. Moving an Attr uses it.
  const adoptMovedAttr = function (this: object, attr: unknown, native: (this: object, node: unknown) => unknown) {
    if (applying || adopting) return native.call(this, attr);
    adopting = true;
    try {
      const tag = tagOf(this);
      const described = tag ? describeMovedAttr(attr) : undefined;
      const local = described && isHtmlNamespace(described.namespace) ? htmlUrlAttribute(described.local) : undefined;
      if (!tag || !described || !local) return native.call(this, attr);
      if (local === 'integrity') {
        const assigned = described.value;
        remembered.set(this, assigned);
        const next = resolveAssignedIntegrity(patches(), assigned, root.location.href, siteHost(root.location), tag, {
          src: readAttr(this, 'src'),
          href: readAttr(this, 'href'),
          rel: readAttr(this, 'rel'),
          as: readAttr(this, 'as'),
        });
        let changed = false;
        if (next !== assigned && isPublishableHash(next)) {
          try {
            described.setValue(next);
            changed = true;
          } catch {
            /* A sealed Attr keeps the page hash. The hook does not clear it. */
          }
        }
        try {
          return native.call(this, attr);
        } catch (error) {
          if (changed) {
            try {
              described.setValue(assigned);
            } catch {
              /* The original method rejected the node. Leave the value it already holds. */
            }
          }
          throw error;
        }
      }
      apply(this, local === 'src' ? { src: described.value } : { href: described.value });
      return native.call(this, attr);
    } finally {
      adopting = false;
    }
  };
  for (const name of ['setAttributeNode', 'setAttributeNodeNS'] as const) {
    const desc = Object.getOwnPropertyDescriptor(root.Element.prototype, name);
    const native = desc?.value as ((this: object, attr: unknown) => unknown) | undefined;
    if (typeof native !== 'function') continue;
    (root.Element.prototype as Record<string, (this: object, attr: unknown) => unknown>)[name] = function (this: object, attr: unknown) {
      return adoptMovedAttr.call(this, attr, native);
    };
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

  // A non-string (TrustedHTML) is passed through. Stringifying it would bypass Trusted Types.
  const rewriteMarkupValue = (value: unknown): unknown => {
    if (applying || typeof value !== 'string') return value;
    if (value.length > MARKUP_BYTE_CAP || !/integrity/i.test(value)) return value;
    const list = patches();
    if (list.length === 0) return value;
    return rewriteMarkupIntegrity(value, root.location.href, siteHost(root.location), list);
  };
  hookMarkupSetter(root.Element.prototype, 'innerHTML', rewriteMarkupValue);
  hookMarkupSetter(root.Element.prototype, 'outerHTML', rewriteMarkupValue);
  hookMarkupSetter(root.ShadowRoot?.prototype, 'innerHTML', rewriteMarkupValue);
  hookMarkupMethod(root.Element.prototype, 'insertAdjacentHTML', rewriteMarkupValue);
  // createContextualFragment parses with scripting mode Fragment, so inserted scripts run.
  hookMarkupArgument(root.Range?.prototype, 'createContextualFragment', rewriteMarkupValue);
  // setHTMLUnsafe fetches stylesheets even when scripts stay off. Options are forwarded unchanged.
  hookUnsafeHtml(root.Element.prototype, rewriteMarkupValue);
  hookUnsafeHtml(root.ShadowRoot?.prototype, rewriteMarkupValue);
  // parseHTMLUnsafe creates a document with no browsing context, so scripting stays disabled.
  // Options, including a sanitizer, are forwarded. Adoptees carry the rewritten attribute.
  hookStaticMarkup(root.Document, 'parseHTMLUnsafe', rewriteMarkupValue);
  // text/html is the same parse. XML types keep the page's hashes.
  hookDomParserHtml(root.DOMParser?.prototype, rewriteMarkupValue);

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

/** Same ceiling as document rewrite. Longer markup keeps the page's hashes. */
export const MARKUP_BYTE_CAP = 2_000_000;

/**
 * Replace `integrity` on script and stylesheet tags in a markup fragment.
 * Does not embed the hash list. An empty list or an oversized string is returned unchanged.
 */
export function rewriteMarkupIntegrity(markup: string, pageUrl: string, pageHost: string, patches: readonly IntegrityPatch[]): string {
  if (patches.length === 0 || markup.length > MARKUP_BYTE_CAP || !/integrity/i.test(markup)) return markup;
  return rewriteTags(markup, pageUrl, pageHost, patches);
}

const HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';

/** Null, omitted, or empty is no namespace. The HTML namespace is the same attribute. */
function isHtmlNamespace(namespace: unknown): boolean {
  return namespace == null || namespace === '' || namespace === HTML_NAMESPACE;
}

/**
 * An Attr moved with setAttributeNode. A throw while reading it means the page's
 * value stays: the caller passes the node to the original method.
 */
function describeMovedAttr(attr: unknown): { namespace: unknown; local: string; value: string; setValue: (next: string) => void } | undefined {
  if (!attr || typeof attr !== 'object') return undefined;
  const node = attr as { namespaceURI?: unknown; localName?: unknown; name?: unknown; value?: unknown };
  try {
    const local = typeof node.localName === 'string' ? node.localName : typeof node.name === 'string' ? node.name : undefined;
    if (!local) return undefined;
    const value = node.value == null ? '' : String(node.value);
    return {
      namespace: node.namespaceURI,
      local,
      value,
      setValue(next: string) {
        node.value = next;
      },
    };
  } catch {
    return undefined;
  }
}

/** `integrity`, `src`, or `href`, with an optional prefix. Other names stay with the browser. */
function htmlUrlAttribute(qualifiedName: unknown): 'integrity' | 'src' | 'href' | undefined {
  if (typeof qualifiedName !== 'string') return undefined;
  const match = /^(?:[A-Za-z_][\w.-]*:)?(integrity|src|href)$/i.exec(qualifiedName);
  const local = match?.[1]?.toLowerCase();
  if (local === 'integrity' || local === 'src' || local === 'href') return local;
  return undefined;
}

function hookMarkupSetter(proto: object | undefined, name: 'innerHTML' | 'outerHTML', rewrite: (value: unknown) => unknown) {
  if (!proto) return;
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
        nativeSet.call(this, rewrite(value));
      },
    });
  } catch {
    /* A non-configurable setter leaves the page's markup unchanged. */
  }
}

function hookMarkupArgument(proto: object | undefined, name: 'createContextualFragment', rewrite: (value: unknown) => unknown) {
  if (!proto) return;
  const desc = Object.getOwnPropertyDescriptor(proto, name);
  const native = desc?.value as ((this: object, html: unknown) => unknown) | undefined;
  if (typeof native !== 'function') return;
  try {
    (proto as Record<string, unknown>)[name] = function (this: object, html: unknown) {
      return native.call(this, rewrite(html));
    };
  } catch {
    /* A non-configurable method leaves the page's markup unchanged. */
  }
}

function hookStaticMarkup(ctor: object | undefined, name: 'parseHTMLUnsafe', rewrite: (value: unknown) => unknown) {
  if (!ctor) return;
  const desc = Object.getOwnPropertyDescriptor(ctor, name);
  const native = desc?.value as ((this: unknown, html: unknown, ...rest: unknown[]) => unknown) | undefined;
  if (typeof native !== 'function') return;
  try {
    (ctor as Record<string, unknown>)[name] = function (this: unknown, html: unknown, ...rest: unknown[]) {
      return native.call(this, rewrite(html), ...rest);
    };
  } catch {
    /* A non-configurable method leaves the page's markup unchanged. */
  }
}

/** Only `text/html` shares the parseHTMLUnsafe adoption gap. Other types use the XML parser. */
function hookDomParserHtml(proto: object | undefined, rewrite: (value: unknown) => unknown) {
  if (!proto) return;
  const desc = Object.getOwnPropertyDescriptor(proto, 'parseFromString');
  const native = desc?.value as ((this: object, source: unknown, type: unknown) => unknown) | undefined;
  if (typeof native !== 'function') return;
  try {
    (proto as { parseFromString: (source: unknown, type: unknown) => unknown }).parseFromString = function (this: object, source: unknown, type: unknown) {
      return native.call(this, type === 'text/html' ? rewrite(source) : source, type);
    };
  } catch {
    /* A non-configurable method leaves the page's markup unchanged. */
  }
}

function hookUnsafeHtml(proto: object | undefined, rewrite: (html: unknown) => unknown) {
  if (!proto) return;
  const desc = Object.getOwnPropertyDescriptor(proto, 'setHTMLUnsafe');
  const native = desc?.value as ((this: object, html: unknown, options?: unknown) => unknown) | undefined;
  if (typeof native !== 'function') return;
  try {
    (proto as { setHTMLUnsafe: (html: unknown, options?: unknown) => unknown }).setHTMLUnsafe = function (this: object, html: unknown, options?: unknown) {
      return native.call(this, rewrite(html), options);
    };
  } catch {
    /* A non-configurable method leaves the page's markup unchanged. */
  }
}

function hookMarkupMethod(proto: object, name: 'insertAdjacentHTML', rewrite: (value: unknown) => unknown) {
  const desc = Object.getOwnPropertyDescriptor(proto, name);
  const native = desc?.value as ((this: object, position: unknown, text: unknown) => unknown) | undefined;
  if (typeof native !== 'function') return;
  try {
    (proto as Record<string, unknown>)[name] = function (this: object, position: unknown, text: unknown) {
      return native.call(this, position, rewrite(text));
    };
  } catch {
    /* A non-configurable method leaves the page's markup unchanged. */
  }
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
    parts.push(hash ? replaceAttribute(raw, hash) : raw);
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

/** Writes only a publishable SHA-384, so the replacement cannot break out of the attribute. */
function replaceAttribute(tag: string, nextValue: string): string {
  if (!isPublishableHash(nextValue)) return tag;
  const found = readAttribute(tag, 'integrity');
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
