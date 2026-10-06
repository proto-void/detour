import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-svelte'],
  // WXT defaults Firefox/Safari to MV2; Detour targets MV3 everywhere.
  manifestVersion: 3,
  manifest: ({ browser }) => ({
    name: 'Detour',
    description: 'Point production at your code.',
    permissions: ['declarativeNetRequest', 'storage', 'unlimitedStorage'],
    // redirect and modifyHeaders need host access to the request URL and initiator.
    host_permissions: ['<all_urls>'],
    ...(browser === 'firefox'
      ? {
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
