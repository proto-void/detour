import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-svelte'],
  // WXT defaults Firefox/Safari to MV2; Detour targets MV3 everywhere.
  manifestVersion: 3,
  manifest: ({ browser }) => ({
    name: 'Detour',
    description: 'Point production at your code.',
    // scripting: page-inject bridge + mock runtime and insertCSS. userScripts: inline JS rules; Chrome
    // still requires the user's "Allow User Scripts" toggle, Firefox only allows it as optional.
    permissions: ['declarativeNetRequest', 'storage', 'unlimitedStorage', 'scripting', ...(browser === 'firefox' ? [] : ['userScripts'])],
    // redirect and modifyHeaders need host access to the request URL and initiator; injection needs the page.
    host_permissions: ['<all_urls>'],
    ...(browser === 'firefox'
      ? {
          optional_permissions: ['userScripts'],
          browser_specific_settings: {
            gecko: {
              id: 'detour@protovoid.com',
              strict_min_version: '128.0',
              data_collection_permissions: { required: ['none'] },
            },
          },
        }
      : { minimum_chrome_version: '120' }),
  }),
});
