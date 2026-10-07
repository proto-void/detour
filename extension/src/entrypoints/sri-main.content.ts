import { installIntegrityPatch } from '../engine-deep/integrity-patch';

const INSTALLED = Symbol.for('detour.sri');

/**
 * MAIN world, registered only while a body rule is armed.
 * Runs before page scripts so a bundler that sets `integrity`, copies it with
 * `setAttributeNS`, moves that Attr with `setAttributeNode` or `setAttributeNodeNS`,
 * adopts it with `setNamedItem` or `setNamedItemNS`, or writes `Attr.value`,
 * `nodeValue`, or `textContent` after that attribute is already on the element,
 * inserts a tag with `innerHTML` / `outerHTML` / a shadow
 * root's `innerHTML` / `insertAdjacentHTML`, or inserts markup that can run
 * scripts (`createContextualFragment`, `setHTMLUnsafe`), or parses a string with
 * `Document.parseHTMLUnsafe` or `DOMParser` (`text/html`), or passes markup to
 * `document.write` or `document.writeln`, hits the hook. A stylesheet
 * in `setHTMLUnsafe` is rewritten even when that call does not run scripts. Nodes
 * moved out of a `parseHTMLUnsafe` document carry Detour's hash. Scripting there stays off.
 */
export default defineContentScript({
  matches: ['<all_urls>'],
  registration: 'runtime',
  world: 'MAIN',
  runAt: 'document_start',
  allFrames: true,
  main() {
    const marked = window as unknown as Record<symbol, boolean>;
    if (marked[INSTALLED]) return;
    marked[INSTALLED] = true;
    installIntegrityPatch({
      document,
      location,
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
    });
  },
});
