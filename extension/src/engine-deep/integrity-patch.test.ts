import { describe, expect, it } from 'vitest';
import { decodePatchList, encodePatchList, injectPatchMeta, installIntegrityPatch, resolveAssignedIntegrity, type IntegrityPatch, type PatchRoot } from './integrity-patch';
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
    appendChild<T extends Node>(child: T): T {
      child.parent = this;
      return child;
    }
    insertBefore<T extends Node>(child: T): T {
      child.parent = this;
      return child;
    }
  }
  class Element extends Node {
    attrs: Record<string, string> = {};
    setAttribute(name: string, value: string) {
      this.attrs[name.toLowerCase()] = String(value);
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
  };
  return {
    root: root as unknown as PatchRoot,
    HTMLScriptElement,
    HTMLLinkElement,
    Node,
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
});
