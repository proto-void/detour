import { describe, expect, it } from 'vitest';
import { decodePatchList, encodePatchList, injectPatchMeta, installIntegrityPatch, MARKUP_BYTE_CAP, resolveAssignedIntegrity, rewriteMarkupIntegrity, type IntegrityPatch, type PatchRoot } from './integrity-patch';
import { integrityMetadata } from './sri';

const BAD = 'sha384-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const encoder = new TextEncoder();

const patch = (over: Partial<IntegrityPatch> = {}): IntegrityPatch => ({
  match: { kind: 'glob', pattern: '*:8001/sri-js.js' },
  caseSensitive: false,
  resourceTypes: ['script'],
  integrity: 'sha384-BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
  ...over,
});

describe('encodePatchList', () => {
  it('round-trips the hash list and leaves out the rule body', () => {
    const encoded = encodePatchList([patch({ pageDomains: ['app.example.com'] })]);
    const decoded = decodePatchList(encoded);
    expect(decoded).toEqual([patch({ pageDomains: ['app.example.com'] })]);
    expect(encoded).not.toContain('window.A');
    expect(JSON.stringify(decoded)).not.toContain('body');
  });

  it('drops a forged entry that is not a SHA-384 hash', () => {
    const payload = btoa(JSON.stringify([{ match: { kind: 'glob', pattern: '*' }, integrity: '' }]));
    expect(decodePatchList(payload)).toEqual([]);
    expect(decodePatchList('not base64')).toEqual([]);
  });
});

describe('resolveAssignedIntegrity', () => {
  const page = 'http://127.0.0.1:8001/sri-js.html';

  it('returns the override hash for a matching script and the page value otherwise', () => {
    const list = [patch()];
    expect(resolveAssignedIntegrity(list, BAD, page, '127.0.0.1', 'script', { src: 'http://127.0.0.1:8001/sri-js.js' })).toBe(patch().integrity);
    expect(resolveAssignedIntegrity(list, BAD, page, '127.0.0.1', 'script', { src: '/sri-js.js' })).toBe(patch().integrity);
    expect(resolveAssignedIntegrity(list, BAD, page, '127.0.0.1', 'script', { src: 'http://127.0.0.1:8001/sri-js-bad.js' })).toBe(BAD);
    expect(resolveAssignedIntegrity(list, BAD, page, '127.0.0.1', 'link', { href: 'http://127.0.0.1:8001/sri-js.js', rel: 'stylesheet' })).toBe(BAD);
  });

  it('keeps the page value when the list has no publishable hash', () => {
    const list = [patch({ integrity: 'sha256-nope' })];
    expect(resolveAssignedIntegrity(list, BAD, page, '127.0.0.1', 'script', { src: 'http://127.0.0.1:8001/sri-js.js' })).toBe(BAD);
  });
});

describe('rewriteMarkupIntegrity', () => {
  const page = 'http://127.0.0.1:8001/sri-html.html';

  it('rewrites a matching script and leaves the sibling hash', async () => {
    const hash = await integrityMetadata(encoder.encode('window.SRI_HTML = "LOCAL";'));
    const markup = `<script src="/sri-html.js" integrity="${BAD}"></script><script src="/sri-html-bad.js" integrity="${BAD}"></script>`;
    const next = rewriteMarkupIntegrity(markup, page, '127.0.0.1', [patch({ integrity: hash, match: { kind: 'glob', pattern: '*:8001/sri-html.js' } })]);
    expect(next).toContain(`src="/sri-html.js" integrity="${hash}"`);
    expect(next).toContain(`src="/sri-html-bad.js" integrity="${BAD}"`);
  });

  it('leaves comments, script text, and an empty list unchanged', async () => {
    const hash = await integrityMetadata(encoder.encode('kept'));
    const list = [patch({ integrity: hash, match: { kind: 'glob', pattern: '*:8001/sri-html.js' } })];
    const comment = `<!-- <script src="/sri-html.js" integrity="${BAD}"></script> -->`;
    expect(rewriteMarkupIntegrity(comment, page, '127.0.0.1', list)).toBe(comment);
    const text = `<script>var x = "integrity=${BAD}"</script>`;
    expect(rewriteMarkupIntegrity(text, page, '127.0.0.1', list)).toBe(text);
    const markup = `<script src="/sri-html.js" integrity="${BAD}"></script>`;
    expect(rewriteMarkupIntegrity(markup, page, '127.0.0.1', [])).toBe(markup);
  });

  it('does not scan markup over the document ceiling', () => {
    const markup = `${'x'.repeat(MARKUP_BYTE_CAP)}<script src="/sri-html.js" integrity="${BAD}"></script>`;
    expect(rewriteMarkupIntegrity(markup, page, '127.0.0.1', [patch()])).toBe(markup);
  });
});

describe('injectPatchMeta', () => {
  it('places the list after the doctype and replaces an older copy', () => {
    const once = injectPatchMeta('<!doctype html><title>t</title><script src="/a.js"></script>', 'abc');
    expect(once.startsWith('<!doctype html><meta name="detour-sri" content="abc">')).toBe(true);
    const twice = injectPatchMeta(once, 'def');
    expect(twice.match(/detour-sri/g)).toHaveLength(1);
    expect(twice).toContain('content="def"');
  });
});

function createRealm(initial: string | null) {
  class Node {
    parent: Node | null = null;
    _nodeValue: string | null = null;
    _text = '';
    appendChild<T extends Node>(child: T): T {
      child.parent = this;
      return child;
    }
    insertBefore<T extends Node>(child: T): T {
      child.parent = this;
      return child;
    }
    get nodeValue() {
      const read = (this as { readStored?: () => string }).readStored;
      return read ? read.call(this) : this._nodeValue;
    }
    set nodeValue(value: string | null) {
      const write = (this as { assignStored?: (value: unknown) => void }).assignStored;
      if (write) write.call(this, value);
      else this._nodeValue = value;
    }
    get textContent() {
      const read = (this as { readStored?: () => string }).readStored;
      return read ? read.call(this) : this._text;
    }
    set textContent(value: string | null) {
      const write = (this as { assignStored?: (value: unknown) => void }).assignStored;
      if (write) write.call(this, value);
      else this._text = value == null ? '' : String(value);
    }
  }
  class Element extends Node {
    attrs: Record<string, string> = {};
    failAdopt = false;
    html = '';
    adjacent = '';
    attrNodes: Record<string, { value?: string }> = {};
    map: NamedNodeMap | undefined;
    setAttribute(name: string, value: string) {
      const local = String(name).toLowerCase();
      this.attrs[local] = String(value);
      this.syncAttr(local, String(value));
    }
    setAttributeNS(_namespace: string | null, name: string, value: string) {
      const local = String(name).toLowerCase();
      this.attrs[local] = String(value);
      this.syncAttr(local, String(value));
    }
    syncAttr(local: string, value: string) {
      const node = this.attrNodes[local];
      if (!node || node.value === value) return;
      node.value = value;
    }
    get attributes() {
      this.map ??= new NamedNodeMap(this);
      return this.map;
    }
    setAttributeNode(attr: { namespaceURI?: string | null; localName?: string; name?: string; value?: string } | null) {
      return this.adoptAttr(attr);
    }
    setAttributeNodeNS(attr: { namespaceURI?: string | null; localName?: string; name?: string; value?: string } | null) {
      return this.adoptAttr(attr);
    }
    adoptAttr(attr: { namespaceURI?: string | null; localName?: string; name?: string; value?: string } | null) {
      if (this.failAdopt) throw new Error('InUseAttributeError');
      if (!attr) return null;
      const raw = attr.localName ?? attr.name ?? '';
      const local = String(raw).toLowerCase().split(':').pop() ?? '';
      this.attrs[local] = String(attr.value ?? '');
      (attr as { ownerElement?: Element }).ownerElement = this;
      this.attrNodes[local] = attr;
      return null;
    }
    getAttribute(name: string) {
      return this.attrs[name.toLowerCase()] ?? null;
    }
    append(...nodes: Node[]) {
      for (const node of nodes) this.appendChild(node);
    }
    prepend(...nodes: Node[]) {
      for (const node of nodes) this.appendChild(node);
    }
    unsafe: unknown = undefined;
    unsafeOptions: unknown = undefined;
    get innerHTML() {
      return this.html;
    }
    set innerHTML(value: string) {
      this.html = value;
    }
    outer = '';
    get outerHTML() {
      return this.outer;
    }
    set outerHTML(value: string) {
      this.outer = value;
    }
    insertAdjacentHTML(_position: string, html: string) {
      this.adjacent = html;
    }
    setHTMLUnsafe(html: unknown, options?: unknown) {
      this.unsafe = html;
      this.unsafeOptions = options;
    }
  }
  class Range {
    fragment: unknown = undefined;
    createContextualFragment(html: unknown) {
      this.fragment = html;
      return {};
    }
  }
  class Document {
    static html: unknown = undefined;
    static options: unknown = undefined;
    parts: unknown[] = [];
    newline = false;
    static parseHTMLUnsafe(html: unknown, options?: unknown) {
      Document.html = html;
      Document.options = options;
      return { html, options };
    }
    write(...text: unknown[]) {
      this.parts = text;
      this.newline = false;
    }
    writeln(...text: unknown[]) {
      this.parts = text;
      this.newline = true;
    }
  }
  class Attr extends Node {
    namespaceURI: string | null;
    localName: string;
    name: string;
    ownerElement: Element | null = null;
    private stored: string;
    constructor(namespace: string | null, localName: string, value = '') {
      super();
      this.namespaceURI = namespace;
      this.localName = localName;
      this.name = localName;
      this.stored = value;
    }
    readStored() {
      return this.stored;
    }
    assignStored(next: unknown) {
      this.stored = next == null ? '' : String(next);
      this.writeOwner();
    }
    get value() {
      return this.stored;
    }
    set value(next: string) {
      this.assignStored(next);
    }
    writeOwner() {
      const local = this.localName.toLowerCase().split(':').pop() ?? '';
      if (!this.ownerElement || !local) return;
      this.ownerElement.attrs[local] = this.stored;
    }
  }
  class NamedNodeMap {
    constructor(private owner: Element) {}
    setNamedItem(attr: { namespaceURI?: string | null; localName?: string; name?: string; value?: string } | null) {
      return this.owner.adoptAttr(attr);
    }
    setNamedItemNS(attr: { namespaceURI?: string | null; localName?: string; name?: string; value?: string } | null) {
      return this.owner.adoptAttr(attr);
    }
  }
  class DOMParser {
    html: unknown = undefined;
    type: unknown = undefined;
    parseFromString(source: unknown, type: unknown) {
      this.html = source;
      this.type = type;
      return { html: source, type };
    }
  }
  class ShadowRoot {
    html: unknown = undefined;
    markup = '';
    get innerHTML() {
      return this.markup;
    }
    set innerHTML(value: string) {
      this.markup = value;
    }
    options: unknown = undefined;
    setHTMLUnsafe(html: unknown, options?: unknown) {
      this.html = html;
      this.options = options;
    }
  }
  class HTMLIFrameElement extends Element {
    assigned: unknown = undefined;
    get srcdoc() {
      return this.getAttribute('srcdoc') ?? '';
    }
    set srcdoc(value: unknown) {
      this.assigned = value;
      if (typeof value === 'string') this.setAttribute('srcdoc', value);
    }
  }
  class HTMLScriptElement extends Element {
    get integrity() {
      return this.getAttribute('integrity') ?? '';
    }
    set integrity(value: string) {
      this.setAttribute('integrity', value);
    }
    get src() {
      return this.getAttribute('src') ?? '';
    }
    set src(value: string) {
      this.setAttribute('src', value);
    }
  }
  class HTMLLinkElement extends Element {
    get integrity() {
      return this.getAttribute('integrity') ?? '';
    }
    set integrity(value: string) {
      this.setAttribute('integrity', value);
    }
    get href() {
      return this.getAttribute('href') ?? '';
    }
    set href(value: string) {
      this.setAttribute('href', value);
    }
    get rel() {
      return this.getAttribute('rel') ?? '';
    }
    set rel(value: string) {
      this.setAttribute('rel', value);
    }
  }
  let content = initial;
  let observer: (() => void) | undefined;
  class MutationObserver {
    constructor(callback: () => void) {
      observer = callback;
    }
    observe() {}
    disconnect() {
      observer = undefined;
    }
  }
  const root = {
    document: {
      documentElement: new Element(),
      readyState: 'loading',
      querySelector(selector: string) {
        if (selector !== 'meta[name="detour-sri"]' || content === null) return null;
        return { getAttribute: () => content };
      },
      addEventListener() {},
    },
    location: { href: 'http://127.0.0.1:8001/sri-js.html', hostname: '127.0.0.1' },
    MutationObserver,
    HTMLScriptElement,
    HTMLLinkElement,
    Element,
    Node,
    Range,
    ShadowRoot,
    Document,
    DOMParser,
    NamedNodeMap,
    Attr,
    HTMLIFrameElement,
  };
  return {
    root: root as unknown as PatchRoot,
    HTMLScriptElement,
    HTMLLinkElement,
    Element,
    Node,
    Range,
    ShadowRoot,
    Document,
    DOMParser,
    NamedNodeMap,
    Attr,
    HTMLIFrameElement,
    fireObserver() {
      observer?.();
    },
    setMeta(next: string | null) {
      content = next;
    },
  };
}

describe('installIntegrityPatch', () => {
  it('substitutes the hash when the page sets integrity, and leaves a sibling alone', async () => {
    const hash = await integrityMetadata(encoder.encode('window.SRI_JS = "LOCAL";'));
    const encoded = encodePatchList([patch({ integrity: hash })]);
    const realm = createRealm(encoded);
    installIntegrityPatch(realm.root);
    const parent = new realm.Node();
    const matched = new realm.HTMLScriptElement();
    matched.src = 'http://127.0.0.1:8001/sri-js.js';
    matched.integrity = BAD;
    parent.appendChild(matched);
    const sibling = new realm.HTMLScriptElement();
    sibling.src = 'http://127.0.0.1:8001/sri-js-bad.js';
    sibling.integrity = BAD;
    parent.appendChild(sibling);

    expect(matched.getAttribute('integrity')).toBe(hash);
    expect(sibling.getAttribute('integrity')).toBe(BAD);
  });

  it('substitutes when integrity is assigned before src, and when setAttribute is used', async () => {
    const hash = await integrityMetadata(encoder.encode('later'));
    const realm = createRealm(encodePatchList([patch({ integrity: hash })]));
    installIntegrityPatch(realm.root);
    const early = new realm.HTMLScriptElement();
    early.integrity = BAD;
    early.src = '/sri-js.js';
    expect(early.getAttribute('integrity')).toBe(hash);

    const viaAttr = new realm.HTMLScriptElement();
    viaAttr.setAttribute('src', 'http://127.0.0.1:8001/sri-js.js');
    viaAttr.setAttribute('integrity', BAD);
    expect(viaAttr.getAttribute('integrity')).toBe(hash);
  });

  it('keeps the page value when no list is published, and ignores a later edit of the meta', async () => {
    const hash = await integrityMetadata(encoder.encode('frozen'));
    const realm = createRealm(null);
    installIntegrityPatch(realm.root);
    const early = new realm.HTMLScriptElement();
    early.src = 'http://127.0.0.1:8001/sri-js.js';
    early.integrity = BAD;
    expect(early.getAttribute('integrity')).toBe(BAD);

    realm.setMeta(encodePatchList([patch({ integrity: hash })]));
    realm.fireObserver();
    const after = new realm.HTMLScriptElement();
    after.src = 'http://127.0.0.1:8001/sri-js.js';
    after.integrity = BAD;
    expect(after.getAttribute('integrity')).toBe(hash);

    realm.setMeta(encodePatchList([patch({ integrity: BAD })]));
    const stuck = new realm.HTMLScriptElement();
    stuck.src = 'http://127.0.0.1:8001/sri-js.js';
    stuck.integrity = 'sha384-CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC';
    expect(stuck.getAttribute('integrity')).toBe(hash);
  });

  it('updates a stylesheet link and does not clear integrity', async () => {
    const hash = await integrityMetadata(encoder.encode('css'));
    const realm = createRealm(encodePatchList([patch({ integrity: hash, resourceTypes: ['stylesheet'], match: { kind: 'glob', pattern: '*:8001/app.css' } })]));
    installIntegrityPatch(realm.root);
    const link = new realm.HTMLLinkElement();
    link.rel = 'stylesheet';
    link.href = 'http://127.0.0.1:8001/app.css';
    link.integrity = BAD;
    new realm.Node().appendChild(link);
    expect(link.getAttribute('integrity')).toBe(hash);

    const script = new realm.HTMLScriptElement();
    script.src = 'http://127.0.0.1:8001/app.css';
    script.integrity = BAD;
    expect(script.getAttribute('integrity')).toBe(BAD);
  });

  it('rewrites integrity in innerHTML and insertAdjacentHTML, and leaves a sibling hash', async () => {
    const hash = await integrityMetadata(encoder.encode('window.SRI_HTML = "LOCAL";'));
    const realm = createRealm(encodePatchList([patch({ integrity: hash, match: { kind: 'glob', pattern: '*:8001/sri-html.js' } })]));
    installIntegrityPatch(realm.root);
    const markup = `<script src="/sri-html.js" integrity="${BAD}"></script><script src="/sri-html-bad.js" integrity="${BAD}"></script>`;
    const host = new realm.Element();
    host.innerHTML = markup;
    expect(host.innerHTML).toContain(`integrity="${hash}"`);
    expect(host.innerHTML).toContain(`sri-html-bad.js" integrity="${BAD}"`);

    const adjacent = new realm.Element();
    adjacent.insertAdjacentHTML('beforeend', markup);
    expect(adjacent.adjacent).toContain(`integrity="${hash}"`);
    expect(adjacent.adjacent).toContain(`sri-html-bad.js" integrity="${BAD}"`);
  });

  it('passes a non-string through and keeps the page hash when no list is published', () => {
    const realm = createRealm(null);
    installIntegrityPatch(realm.root);
    const host = new realm.Element();
    const trusted = { toString: () => `<script src="/sri-html.js" integrity="${BAD}"></script>` };
    host.innerHTML = trusted as unknown as string;
    expect(host.innerHTML).toBe(trusted as unknown as string);

    const plain = new realm.Element();
    plain.insertAdjacentHTML('beforeend', `<script src="/sri-html.js" integrity="${BAD}"></script>`);
    expect(plain.adjacent).toContain(`integrity="${BAD}"`);
  });

  it('rewrites integrity in createContextualFragment and leaves a sibling hash', async () => {
    const hash = await integrityMetadata(encoder.encode('window.SRI_EXEC = "LOCAL";'));
    const realm = createRealm(encodePatchList([patch({ integrity: hash, match: { kind: 'glob', pattern: '*:8001/sri-exec.js' } })]));
    installIntegrityPatch(realm.root);
    const markup = `<script src="/sri-exec.js" integrity="${BAD}"></script><script src="/sri-exec-bad.js" integrity="${BAD}"></script>`;
    const range = new realm.Range();
    range.createContextualFragment(markup);
    expect(range.fragment).toContain(`src="/sri-exec.js" integrity="${hash}"`);
    expect(range.fragment).toContain(`src="/sri-exec-bad.js" integrity="${BAD}"`);
  });

  it('passes a non-string to createContextualFragment and keeps the page hash when no list is published', () => {
    const realm = createRealm(null);
    installIntegrityPatch(realm.root);
    const range = new realm.Range();
    const trusted = { toString: () => `<script src="/sri-exec.js" integrity="${BAD}"></script>` };
    range.createContextualFragment(trusted);
    expect(range.fragment).toBe(trusted);
    const plain = new realm.Range();
    plain.createContextualFragment(`<script src="/sri-exec.js" integrity="${BAD}"></script>`);
    expect(String(plain.fragment)).toContain(`integrity="${BAD}"`);

    const listed = createRealm(encodePatchList([patch({ match: { kind: 'glob', pattern: '*:8001/sri-exec.js' } })]));
    installIntegrityPatch(listed.root);
    const huge = new listed.Range();
    const markup = `${'x'.repeat(MARKUP_BYTE_CAP)}<script src="/sri-exec.js" integrity="${BAD}"></script>`;
    huge.createContextualFragment(markup);
    expect(huge.fragment).toBe(markup);
  });

  it('rewrites setHTMLUnsafe for every runScripts value and leaves a sibling hash', async () => {
    const hash = await integrityMetadata(encoder.encode('window.SRI_UNSAFE = "LOCAL";'));
    const realm = createRealm(encodePatchList([patch({ integrity: hash, match: { kind: 'glob', pattern: '*:8001/sri-unsafe.js' } })]));
    installIntegrityPatch(realm.root);
    const markup = `<script src="/sri-unsafe.js" integrity="${BAD}"></script><script src="/sri-unsafe-bad.js" integrity="${BAD}"></script>`;

    const host = new realm.Element();
    const running = { runScripts: true };
    host.setHTMLUnsafe(markup, running);
    expect(host.unsafe).toContain(`src="/sri-unsafe.js" integrity="${hash}"`);
    expect(host.unsafe).toContain(`src="/sri-unsafe-bad.js" integrity="${BAD}"`);
    expect(host.unsafeOptions).toBe(running);

    const shadow = new realm.ShadowRoot();
    shadow.setHTMLUnsafe(markup, running);
    expect(shadow.html).toContain(`src="/sri-unsafe.js" integrity="${hash}"`);
    expect(shadow.html).toContain(`src="/sri-unsafe-bad.js" integrity="${BAD}"`);
    expect(shadow.options).toBe(running);

    const omitted = new realm.Element();
    omitted.setHTMLUnsafe(markup);
    expect(omitted.unsafe).toContain(`src="/sri-unsafe.js" integrity="${hash}"`);
    expect(omitted.unsafe).toContain(`src="/sri-unsafe-bad.js" integrity="${BAD}"`);
    expect(omitted.unsafeOptions).toBeUndefined();

    const off = new realm.Element();
    const inert = { runScripts: false };
    off.setHTMLUnsafe(markup, inert);
    expect(off.unsafe).toContain(`src="/sri-unsafe.js" integrity="${hash}"`);
    expect(off.unsafe).toContain(`src="/sri-unsafe-bad.js" integrity="${BAD}"`);
    expect(off.unsafeOptions).toBe(inert);

    const truthy = new realm.Element();
    const stringFlag = { runScripts: 'true' };
    truthy.setHTMLUnsafe(markup, stringFlag);
    expect(truthy.unsafe).toContain(`src="/sri-unsafe.js" integrity="${hash}"`);
    expect(truthy.unsafe).toContain(`src="/sri-unsafe-bad.js" integrity="${BAD}"`);
    expect(truthy.unsafeOptions).toBe(stringFlag);

    const trusted = { toString: () => markup };
    const typed = new realm.Element();
    typed.setHTMLUnsafe(trusted, running);
    expect(typed.unsafe).toBe(trusted);
    expect(typed.unsafeOptions).toBe(running);
  });

  it('rewrites a stylesheet in setHTMLUnsafe when scripts are off and leaves a sibling hash', async () => {
    const hash = await integrityMetadata(encoder.encode('html{--sri-unsafe-css:local}'));
    const realm = createRealm(encodePatchList([patch({ integrity: hash, resourceTypes: ['stylesheet'], match: { kind: 'glob', pattern: '*:8001/sri-unsafe-css.css' } })]));
    installIntegrityPatch(realm.root);
    const markup = `<link rel="stylesheet" href="/sri-unsafe-css.css" integrity="${BAD}"><link rel="stylesheet" href="/sri-unsafe-css-bad.css" integrity="${BAD}">`;

    const omitted = new realm.Element();
    omitted.setHTMLUnsafe(markup);
    expect(omitted.unsafe).toContain(`href="/sri-unsafe-css.css" integrity="${hash}"`);
    expect(omitted.unsafe).toContain(`href="/sri-unsafe-css-bad.css" integrity="${BAD}"`);

    const shadow = new realm.ShadowRoot();
    const inert = { runScripts: false };
    shadow.setHTMLUnsafe(markup, inert);
    expect(shadow.html).toContain(`href="/sri-unsafe-css.css" integrity="${hash}"`);
    expect(shadow.html).toContain(`href="/sri-unsafe-css-bad.css" integrity="${BAD}"`);
    expect(shadow.options).toBe(inert);

    const unlisted = createRealm(null);
    installIntegrityPatch(unlisted.root);
    const plain = new unlisted.Element();
    plain.setHTMLUnsafe(markup);
    expect(plain.unsafe).toBe(markup);
  });

  it('rewrites integrity in outerHTML and ShadowRoot.innerHTML, and leaves a sibling hash', async () => {
    const hash = await integrityMetadata(encoder.encode('html{--sri-outer:local}'));
    const realm = createRealm(encodePatchList([patch({ integrity: hash, resourceTypes: ['stylesheet'], match: { kind: 'glob', pattern: '*:8001/sri-outer.css' } })]));
    installIntegrityPatch(realm.root);
    const markup = `<link rel="stylesheet" href="/sri-outer.css" integrity="${BAD}"><link rel="stylesheet" href="/sri-outer-bad.css" integrity="${BAD}">`;
    const host = new realm.Element();
    host.outerHTML = markup;
    expect(host.outerHTML).toContain(`href="/sri-outer.css" integrity="${hash}"`);
    expect(host.outerHTML).toContain(`href="/sri-outer-bad.css" integrity="${BAD}"`);

    const shadow = new realm.ShadowRoot();
    shadow.innerHTML = markup;
    expect(shadow.innerHTML).toContain(`href="/sri-outer.css" integrity="${hash}"`);
    expect(shadow.innerHTML).toContain(`href="/sri-outer-bad.css" integrity="${BAD}"`);
  });

  it('passes a non-string through outerHTML and shadow innerHTML, and keeps the page hash without a list', () => {
    const realm = createRealm(null);
    installIntegrityPatch(realm.root);
    const host = new realm.Element();
    const trusted = { toString: () => `<link rel="stylesheet" href="/sri-outer.css" integrity="${BAD}">` };
    host.outerHTML = trusted as unknown as string;
    expect(host.outerHTML).toBe(trusted as unknown as string);

    const shadow = new realm.ShadowRoot();
    shadow.innerHTML = trusted as unknown as string;
    expect(shadow.innerHTML).toBe(trusted as unknown as string);

    const plain = new realm.Element();
    plain.outerHTML = `<link rel="stylesheet" href="/sri-outer.css" integrity="${BAD}">`;
    expect(plain.outerHTML).toContain(`integrity="${BAD}"`);

    const listed = createRealm(encodePatchList([patch({ resourceTypes: ['stylesheet'], match: { kind: 'glob', pattern: '*:8001/sri-outer.css' } })]));
    installIntegrityPatch(listed.root);
    const huge = new listed.Element();
    const markup = `${'x'.repeat(MARKUP_BYTE_CAP)}<link rel="stylesheet" href="/sri-outer.css" integrity="${BAD}">`;
    huge.outerHTML = markup;
    expect(huge.outerHTML).toBe(markup);
  });

  it('substitutes integrity set with setAttributeNS and leaves a foreign namespace and a sibling', async () => {
    const hash = await integrityMetadata(encoder.encode('window.SRI_NS = "LOCAL";'));
    const realm = createRealm(encodePatchList([patch({ integrity: hash, match: { kind: 'glob', pattern: '*:8001/sri-ns.js' } })]));
    installIntegrityPatch(realm.root);
    const matched = new realm.HTMLScriptElement();
    matched.setAttributeNS(null, 'integrity', BAD);
    matched.setAttributeNS(null, 'src', '/sri-ns.js');
    expect(matched.getAttribute('integrity')).toBe(hash);

    const copied = new realm.HTMLScriptElement();
    copied.setAttributeNS(null, 'src', 'http://127.0.0.1:8001/sri-ns.js');
    copied.setAttributeNS(null, 'integrity', BAD);
    expect(copied.getAttribute('integrity')).toBe(hash);

    const xhtml = new realm.HTMLScriptElement();
    xhtml.setAttributeNS('http://www.w3.org/1999/xhtml', 'html:integrity', BAD);
    xhtml.setAttributeNS(null, 'src', '/sri-ns.js');
    expect(xhtml.getAttribute('integrity')).toBe(hash);

    const sibling = new realm.HTMLScriptElement();
    sibling.setAttributeNS(null, 'src', '/sri-ns-bad.js');
    sibling.setAttributeNS(null, 'integrity', BAD);
    expect(sibling.getAttribute('integrity')).toBe(BAD);

    const foreign = new realm.HTMLScriptElement();
    foreign.setAttributeNS(null, 'src', '/sri-ns.js');
    foreign.setAttributeNS('http://www.w3.org/2000/svg', 'integrity', BAD);
    expect(foreign.getAttribute('integrity')).toBe(BAD);

    const label = new realm.HTMLScriptElement();
    label.setAttributeNS(null, 'id', 'kept');
    expect(label.getAttribute('id')).toBe('kept');

    const css = await integrityMetadata(encoder.encode('css'));
    const styles = createRealm(encodePatchList([patch({ integrity: css, resourceTypes: ['stylesheet'], match: { kind: 'glob', pattern: '*:8001/app.css' } })]));
    installIntegrityPatch(styles.root);
    const link = new styles.HTMLLinkElement();
    link.setAttributeNS('', 'rel', 'stylesheet');
    link.setAttributeNS(null, 'href', 'http://127.0.0.1:8001/app.css');
    link.setAttributeNS(null, 'integrity', BAD);
    expect(link.getAttribute('integrity')).toBe(css);

    const bare = createRealm(null);
    installIntegrityPatch(bare.root);
    const pageHash = new bare.HTMLScriptElement();
    pageHash.setAttributeNS(null, 'src', '/sri-ns.js');
    pageHash.setAttributeNS(null, 'integrity', BAD);
    expect(pageHash.getAttribute('integrity')).toBe(BAD);
  });

  it('substitutes integrity moved with setAttributeNode and setAttributeNodeNS, and leaves a foreign namespace and a sibling', async () => {
    const hash = await integrityMetadata(encoder.encode('window.SRI_NODE = "LOCAL";'));
    const realm = createRealm(encodePatchList([patch({ integrity: hash, match: { kind: 'glob', pattern: '*:8001/sri-node.js' } })]));
    installIntegrityPatch(realm.root);
    const moved = { namespaceURI: null as string | null, localName: 'integrity', value: BAD };
    const matched = new realm.HTMLScriptElement();
    matched.setAttributeNode(moved);
    matched.setAttributeNode({ namespaceURI: null, localName: 'src', value: '/sri-node.js' });
    expect(matched.getAttribute('integrity')).toBe(hash);

    const copiedAttr = { namespaceURI: null as string | null, localName: 'integrity', value: BAD };
    const copied = new realm.HTMLScriptElement();
    copied.setAttributeNode({ namespaceURI: null, localName: 'src', value: 'http://127.0.0.1:8001/sri-node.js' });
    copied.setAttributeNode(copiedAttr);
    expect(copied.getAttribute('integrity')).toBe(hash);
    expect(copiedAttr.value).toBe(hash);

    const xhtmlAttr = { namespaceURI: 'http://www.w3.org/1999/xhtml', localName: 'integrity', name: 'html:integrity', value: BAD };
    const xhtml = new realm.HTMLScriptElement();
    xhtml.setAttributeNodeNS(xhtmlAttr);
    xhtml.setAttributeNodeNS({ namespaceURI: null, localName: 'src', value: '/sri-node.js' });
    expect(xhtml.getAttribute('integrity')).toBe(hash);

    const emptyAttr = { namespaceURI: '', localName: 'integrity', value: BAD };
    const empty = new realm.HTMLScriptElement();
    empty.setAttributeNode({ namespaceURI: '', localName: 'src', value: '/sri-node.js' });
    empty.setAttributeNodeNS(emptyAttr);
    expect(empty.getAttribute('integrity')).toBe(hash);
    expect(emptyAttr.value).toBe(hash);

    const siblingAttr = { namespaceURI: null as string | null, localName: 'integrity', value: BAD };
    const sibling = new realm.HTMLScriptElement();
    sibling.setAttributeNodeNS({ namespaceURI: null, localName: 'src', value: '/sri-node-bad.js' });
    sibling.setAttributeNodeNS(siblingAttr);
    expect(sibling.getAttribute('integrity')).toBe(BAD);
    expect(siblingAttr.value).toBe(BAD);

    const foreignAttr = { namespaceURI: 'http://www.w3.org/2000/svg', localName: 'integrity', value: BAD };
    const foreign = new realm.HTMLScriptElement();
    foreign.setAttributeNode({ namespaceURI: null, localName: 'src', value: '/sri-node.js' });
    foreign.setAttributeNode(foreignAttr);
    expect(foreign.getAttribute('integrity')).toBe(BAD);
    expect(foreignAttr.value).toBe(BAD);

    const label = new realm.HTMLScriptElement();
    label.setAttributeNode({ namespaceURI: null, localName: 'id', value: 'kept' });
    expect(label.getAttribute('id')).toBe('kept');

    const css = await integrityMetadata(encoder.encode('css'));
    const styles = createRealm(encodePatchList([patch({ integrity: css, resourceTypes: ['stylesheet'], match: { kind: 'glob', pattern: '*:8001/app.css' } })]));
    installIntegrityPatch(styles.root);
    const link = new styles.HTMLLinkElement();
    link.setAttributeNode({ namespaceURI: '', localName: 'rel', value: 'stylesheet' });
    link.setAttributeNodeNS({ namespaceURI: null, localName: 'integrity', value: BAD });
    link.setAttributeNodeNS({ namespaceURI: null, localName: 'href', value: 'http://127.0.0.1:8001/app.css' });
    expect(link.getAttribute('integrity')).toBe(css);

    const bare = createRealm(null);
    installIntegrityPatch(bare.root);
    const pageAttr = { namespaceURI: null as string | null, localName: 'integrity', value: BAD };
    const pageHash = new bare.HTMLScriptElement();
    pageHash.setAttributeNode({ namespaceURI: null, localName: 'src', value: '/sri-node.js' });
    pageHash.setAttributeNode(pageAttr);
    expect(pageHash.getAttribute('integrity')).toBe(BAD);
    expect(pageAttr.value).toBe(BAD);

    const rejected = { namespaceURI: null as string | null, localName: 'integrity', value: BAD };
    const busy = new realm.HTMLScriptElement();
    busy.setAttribute('src', 'http://127.0.0.1:8001/sri-node.js');
    busy.failAdopt = true;
    expect(() => busy.setAttributeNode(rejected)).toThrow('InUseAttributeError');
    expect(rejected.value).toBe(BAD);
  });

  it('substitutes integrity adopted with setNamedItem and rewrites Attr.value, nodeValue, and textContent once it is attached', async () => {
    const hash = await integrityMetadata(encoder.encode('window.SRI_NAMED = "LOCAL";'));
    const realm = createRealm(encodePatchList([patch({ integrity: hash, match: { kind: 'glob', pattern: '*:8001/sri-named.js' } })]));
    installIntegrityPatch(realm.root);

    const matched = new realm.HTMLScriptElement();
    const integrity = new realm.Attr(null, 'integrity', BAD);
    matched.attributes.setNamedItem(integrity);
    matched.attributes.setNamedItem(new realm.Attr(null, 'src', '/sri-named.js'));
    expect(matched.getAttribute('integrity')).toBe(hash);
    expect(integrity.value).toBe(hash);

    integrity.value = BAD;
    expect(integrity.value).toBe(hash);
    expect(matched.getAttribute('integrity')).toBe(hash);
    integrity.nodeValue = BAD;
    expect(matched.getAttribute('integrity')).toBe(hash);
    integrity.textContent = BAD;
    expect(integrity.textContent).toBe(hash);

    const copied = new realm.HTMLScriptElement();
    copied.attributes.setNamedItemNS(new realm.Attr(null, 'src', 'http://127.0.0.1:8001/sri-named.js'));
    const copiedAttr = new realm.Attr(null, 'integrity', BAD);
    copied.attributes.setNamedItemNS(copiedAttr);
    expect(copiedAttr.value).toBe(hash);

    const xhtml = new realm.HTMLScriptElement();
    xhtml.attributes.setNamedItem(new realm.Attr('http://www.w3.org/1999/xhtml', 'src', '/sri-named.js'));
    const xhtmlAttr = new realm.Attr('http://www.w3.org/1999/xhtml', 'integrity', BAD);
    xhtml.attributes.setNamedItemNS(xhtmlAttr);
    expect(xhtmlAttr.value).toBe(hash);

    const empty = new realm.HTMLScriptElement();
    empty.attributes.setNamedItem(new realm.Attr('', 'src', '/sri-named.js'));
    const emptyAttr = new realm.Attr('', 'integrity', BAD);
    empty.attributes.setNamedItemNS(emptyAttr);
    expect(emptyAttr.value).toBe(hash);

    const sibling = new realm.HTMLScriptElement();
    sibling.attributes.setNamedItemNS(new realm.Attr(null, 'src', '/sri-named-bad.js'));
    const siblingAttr = new realm.Attr(null, 'integrity', BAD);
    sibling.attributes.setNamedItemNS(siblingAttr);
    expect(siblingAttr.value).toBe(BAD);
    siblingAttr.value = BAD;
    siblingAttr.textContent = BAD;
    expect(sibling.getAttribute('integrity')).toBe(BAD);

    const foreignHost = new realm.HTMLScriptElement();
    foreignHost.attributes.setNamedItem(new realm.Attr(null, 'src', '/sri-named.js'));
    const foreign = new realm.Attr('http://www.w3.org/2000/svg', 'integrity', BAD);
    foreignHost.attributes.setNamedItem(foreign);
    expect(foreign.value).toBe(BAD);
    foreign.value = 'svg-hash';
    expect(foreign.value).toBe('svg-hash');

    const label = new realm.HTMLScriptElement();
    label.attributes.setNamedItem(new realm.Attr(null, 'id', 'kept'));
    expect(label.getAttribute('id')).toBe('kept');

    const loose = new realm.Attr(null, 'integrity', BAD);
    loose.value = BAD;
    loose.nodeValue = 'page-hash';
    loose.textContent = 'still-page';
    expect(loose.value).toBe('still-page');
    expect(loose.ownerElement).toBeNull();

    const moved = new realm.HTMLScriptElement();
    const movedSrc = new realm.Attr(null, 'src', '/other.js');
    moved.attributes.setNamedItem(movedSrc);
    const movedIntegrity = new realm.Attr(null, 'integrity', BAD);
    moved.attributes.setNamedItem(movedIntegrity);
    expect(movedIntegrity.value).toBe(BAD);
    movedSrc.value = '/sri-named.js';
    expect(moved.getAttribute('integrity')).toBe(hash);

    const css = await integrityMetadata(encoder.encode('css'));
    const styles = createRealm(encodePatchList([patch({ integrity: css, resourceTypes: ['stylesheet'], match: { kind: 'glob', pattern: '*:8001/app.css' } })]));
    installIntegrityPatch(styles.root);
    const link = new styles.HTMLLinkElement();
    link.attributes.setNamedItem(new styles.Attr(null, 'rel', 'stylesheet'));
    link.attributes.setNamedItemNS(new styles.Attr(null, 'href', 'http://127.0.0.1:8001/app.css'));
    const linkAttr = new styles.Attr(null, 'integrity', BAD);
    link.attributes.setNamedItem(linkAttr);
    expect(linkAttr.value).toBe(css);
    linkAttr.nodeValue = BAD;
    expect(link.getAttribute('integrity')).toBe(css);

    const bare = createRealm(null);
    installIntegrityPatch(bare.root);
    const pageHash = new bare.HTMLScriptElement();
    pageHash.attributes.setNamedItem(new bare.Attr(null, 'src', '/sri-named.js'));
    const pageAttr = new bare.Attr(null, 'integrity', BAD);
    pageHash.attributes.setNamedItem(pageAttr);
    expect(pageAttr.value).toBe(BAD);
    pageAttr.value = BAD;
    pageAttr.textContent = BAD;
    expect(pageHash.getAttribute('integrity')).toBe(BAD);

    const rejected = new realm.Attr(null, 'integrity', BAD);
    const busy = new realm.HTMLScriptElement();
    busy.attributes.setNamedItem(new realm.Attr(null, 'src', 'http://127.0.0.1:8001/sri-named.js'));
    busy.failAdopt = true;
    expect(() => busy.attributes.setNamedItem(rejected)).toThrow('InUseAttributeError');
    expect(rejected.value).toBe(BAD);
    expect(rejected.ownerElement).toBeNull();

    const host = new realm.Element();
    host.textContent = `<script src="/sri-named.js" integrity="${BAD}"></script>`;
    expect(host.textContent).toBe(`<script src="/sri-named.js" integrity="${BAD}"></script>`);
  });

  it('rewrites integrity in parseHTMLUnsafe and leaves a sibling hash', async () => {
    const hash = await integrityMetadata(encoder.encode('html{--sri-parse:local}'));
    const realm = createRealm(encodePatchList([patch({ integrity: hash, resourceTypes: ['stylesheet'], match: { kind: 'glob', pattern: '*:8001/sri-parse.css' } })]));
    installIntegrityPatch(realm.root);
    const markup = `<link rel="stylesheet" href="/sri-parse.css" integrity="${BAD}"><link rel="stylesheet" href="/sri-parse-bad.css" integrity="${BAD}">`;
    const options = { sanitizer: {} };
    const parsed = realm.Document.parseHTMLUnsafe(markup, options);
    expect(parsed.html).toContain(`href="/sri-parse.css" integrity="${hash}"`);
    expect(parsed.html).toContain(`href="/sri-parse-bad.css" integrity="${BAD}"`);
    expect(parsed.options).toBe(options);
  });

  it('passes a non-string to parseHTMLUnsafe and keeps the page hash without a list', () => {
    const realm = createRealm(null);
    installIntegrityPatch(realm.root);
    const trusted = { toString: () => `<link rel="stylesheet" href="/sri-parse.css" integrity="${BAD}">` };
    const parsed = realm.Document.parseHTMLUnsafe(trusted);
    expect(parsed.html).toBe(trusted);
    const plain = realm.Document.parseHTMLUnsafe(`<link rel="stylesheet" href="/sri-parse.css" integrity="${BAD}">`);
    expect(String(plain.html)).toContain(`integrity="${BAD}"`);

    const listed = createRealm(encodePatchList([patch({ resourceTypes: ['stylesheet'], match: { kind: 'glob', pattern: '*:8001/sri-parse.css' } })]));
    installIntegrityPatch(listed.root);
    const huge = listed.Document.parseHTMLUnsafe(`${'x'.repeat(MARKUP_BYTE_CAP)}<link rel="stylesheet" href="/sri-parse.css" integrity="${BAD}">`);
    expect(String(huge.html)).toContain(`integrity="${BAD}"`);
    expect(String(huge.html).startsWith('x'.repeat(32))).toBe(true);
  });

  it('rewrites DOMParser text/html and leaves an XML type unchanged', async () => {
    const hash = await integrityMetadata(encoder.encode('html{--sri-parse:local}'));
    const realm = createRealm(encodePatchList([patch({ integrity: hash, resourceTypes: ['stylesheet'], match: { kind: 'glob', pattern: '*:8001/sri-parse.css' } })]));
    installIntegrityPatch(realm.root);
    const markup = `<link rel="stylesheet" href="/sri-parse.css" integrity="${BAD}"><link rel="stylesheet" href="/sri-parse-bad.css" integrity="${BAD}">`;
    const html = new realm.DOMParser().parseFromString(markup, 'text/html');
    expect(html.html).toContain(`href="/sri-parse.css" integrity="${hash}"`);
    expect(html.html).toContain(`href="/sri-parse-bad.css" integrity="${BAD}"`);

    const xml = new realm.DOMParser().parseFromString(markup, 'application/xhtml+xml');
    expect(xml.html).toBe(markup);
    const svg = new realm.DOMParser().parseFromString(markup, 'image/svg+xml');
    expect(svg.html).toBe(markup);

    const trusted = { toString: () => markup };
    const typed = new realm.DOMParser().parseFromString(trusted, 'text/html');
    expect(typed.html).toBe(trusted);
  });

  it('rewrites integrity in document.write and document.writeln after concatenating string arguments, and leaves a sibling hash', async () => {
    const hash = await integrityMetadata(encoder.encode('window.SRI_WRITE = "LOCAL";'));
    const realm = createRealm(encodePatchList([patch({ integrity: hash, match: { kind: 'glob', pattern: '*:8001/sri-write.js' } })]));
    installIntegrityPatch(realm.root);
    const doc = new realm.Document();
    doc.write('<script src="/sri-write.js" integrity="', BAD, `"></script><script src="/sri-write-bad.js" integrity="${BAD}"></script>`);
    expect(doc.parts).toHaveLength(1);
    expect(String(doc.parts[0])).toContain(`src="/sri-write.js" integrity="${hash}"`);
    expect(String(doc.parts[0])).toContain(`src="/sri-write-bad.js" integrity="${BAD}"`);
    expect(doc.newline).toBe(false);

    const line = new realm.Document();
    line.writeln(`<script src="/sri-write.js" integrity="${BAD}"></script>`);
    expect(line.newline).toBe(true);
    expect(line.parts).toHaveLength(1);
    expect(String(line.parts[0])).toContain(`integrity="${hash}"`);
    expect(String(line.parts[0]).endsWith('\n')).toBe(false);
  });

  it('passes a non-string through document.write and keeps the page hash without a list', () => {
    const realm = createRealm(null);
    installIntegrityPatch(realm.root);
    const trusted = { toString: () => `<script src="/sri-write.js" integrity="${BAD}"></script>` };
    const mixed = new realm.Document();
    mixed.write(trusted, `<script src="/sri-write.js" integrity="${BAD}"></script>`);
    expect(mixed.parts[0]).toBe(trusted);
    expect(String(mixed.parts[1])).toContain(`integrity="${BAD}"`);

    const plain = new realm.Document();
    plain.write(`<script src="/sri-write.js" integrity="${BAD}"></script>`);
    expect(String(plain.parts[0])).toContain(`integrity="${BAD}"`);

    const listed = createRealm(encodePatchList([patch({ match: { kind: 'glob', pattern: '*:8001/sri-write.js' } })]));
    installIntegrityPatch(listed.root);
    const huge = new listed.Document();
    huge.writeln(`${'x'.repeat(MARKUP_BYTE_CAP)}<script src="/sri-write.js" integrity="${BAD}"></script>`);
    expect(huge.newline).toBe(true);
    expect(String(huge.parts[0])).toContain(`integrity="${BAD}"`);
    expect(String(huge.parts[0]).startsWith('x'.repeat(32))).toBe(true);
  });

  it('rewrites integrity in iframe srcdoc and leaves a sibling hash', async () => {
    const hash = await integrityMetadata(encoder.encode('window.SRI_SRCDOC = "LOCAL";'));
    const realm = createRealm(encodePatchList([patch({ integrity: hash, match: { kind: 'glob', pattern: '*:8001/sri-srcdoc.js' } })]));
    installIntegrityPatch(realm.root);
    const markup = `<script src="/sri-srcdoc.js" integrity="${BAD}"></script><script src="/sri-srcdoc-bad.js" integrity="${BAD}"></script>`;
    const frame = new realm.HTMLIFrameElement();
    frame.srcdoc = markup;
    expect(frame.getAttribute('srcdoc')).toContain(`src="/sri-srcdoc.js" integrity="${hash}"`);
    expect(frame.getAttribute('srcdoc')).toContain(`src="/sri-srcdoc-bad.js" integrity="${BAD}"`);

    const viaAttr = new realm.HTMLIFrameElement();
    viaAttr.setAttribute('srcdoc', markup);
    expect(viaAttr.getAttribute('srcdoc')).toContain(`integrity="${hash}"`);
    expect(viaAttr.getAttribute('srcdoc')).toContain(`src="/sri-srcdoc-bad.js" integrity="${BAD}"`);

    const viaNs = new realm.HTMLIFrameElement();
    viaNs.setAttributeNS(null, 'srcdoc', markup);
    expect(viaNs.getAttribute('srcdoc')).toContain(`integrity="${hash}"`);
    const prefixed = new realm.HTMLIFrameElement();
    prefixed.setAttributeNS('http://www.w3.org/1999/xhtml', 'x:srcdoc', markup);
    expect(prefixed.getAttribute('x:srcdoc')).toContain(`integrity="${hash}"`);

    const foreign = new realm.HTMLIFrameElement();
    foreign.setAttributeNS('http://www.w3.org/2000/svg', 'srcdoc', markup);
    expect(foreign.getAttribute('srcdoc')).toBe(markup);

    const div = new realm.Element();
    div.setAttribute('srcdoc', markup);
    expect(div.getAttribute('srcdoc')).toBe(markup);
  });

  it('passes a non-string through iframe srcdoc and keeps the page hash without a list', () => {
    const realm = createRealm(null);
    installIntegrityPatch(realm.root);
    const trusted = { toString: () => `<script src="/sri-srcdoc.js" integrity="${BAD}"></script>` };
    const frame = new realm.HTMLIFrameElement();
    frame.srcdoc = trusted;
    expect(frame.assigned).toBe(trusted);
    expect(frame.getAttribute('srcdoc')).toBeNull();

    const plain = new realm.HTMLIFrameElement();
    plain.setAttribute('srcdoc', `<script src="/sri-srcdoc.js" integrity="${BAD}"></script>`);
    expect(plain.getAttribute('srcdoc')).toContain(`integrity="${BAD}"`);

    const listed = createRealm(encodePatchList([patch({ match: { kind: 'glob', pattern: '*:8001/sri-srcdoc.js' } })]));
    installIntegrityPatch(listed.root);
    const huge = new listed.HTMLIFrameElement();
    huge.srcdoc = `${'x'.repeat(MARKUP_BYTE_CAP)}<script src="/sri-srcdoc.js" integrity="${BAD}"></script>`;
    expect(String(huge.getAttribute('srcdoc'))).toContain(`integrity="${BAD}"`);
    expect(String(huge.getAttribute('srcdoc')).startsWith('x'.repeat(32))).toBe(true);
  });
});
