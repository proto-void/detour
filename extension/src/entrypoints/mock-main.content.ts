import { CONFIG_EVENT, installMocks, MATCH_EVENT, READY_EVENT, type MockWindow } from '../page-inject/mock-runtime';

const INSTALLED = Symbol.for('detour.mocks');

/** MAIN world: shares the page's globals, so it must patch synchronously before page scripts run. */
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
    const runtime = installMocks(window as unknown as MockWindow, {
      onMatch(ruleId, url) {
        document.dispatchEvent(new CustomEvent(MATCH_EVENT, { detail: JSON.stringify({ ruleId, url: url.slice(0, 2000) }) }));
      },
    });
    document.addEventListener(CONFIG_EVENT, (event) => {
      try {
        runtime.setConfig(JSON.parse(String((event as CustomEvent).detail)));
      } catch {
        /* malformed config: keep the previous one */
      }
    });
    document.dispatchEvent(new CustomEvent(READY_EVENT));
  },
});
