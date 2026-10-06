import { browser } from 'wxt/browser';
import { runBridge } from '../page-inject/bridge';
import { PAGE_CONFIG_KEY, type PageConfig } from '../page-inject/plan';

/** Registered by the background (scripting.registerContentScripts) only while page rules exist. */
export default defineContentScript({
  matches: ['<all_urls>'],
  registration: 'runtime',
  runAt: 'document_start',
  allFrames: true,
  noScriptStartedPostMessage: true,
  main() {
    runBridge({
      document,
      location,
      isTop: window === window.top,
      loadConfig: async () => (await browser.storage.local.get(PAGE_CONFIG_KEY))[PAGE_CONFIG_KEY] as PageConfig | undefined,
      onConfigChange: (listener) =>
        browser.storage.onChanged.addListener((changes, area) => {
          if (area === 'local' && PAGE_CONFIG_KEY in changes) listener(changes[PAGE_CONFIG_KEY]!.newValue as PageConfig | undefined);
        }),
      send: (message) => browser.runtime.sendMessage(message),
    });
  },
});
