import { installIntegrityPatch } from '../engine-deep/integrity-patch';

const INSTALLED = Symbol.for('detour.sri');

/**
 * MAIN world, registered only while a body rule is armed.
 * Runs before page scripts so a bundler that sets `integrity` hits the hook.
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
    });
  },
});
