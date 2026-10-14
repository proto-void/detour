/**
 * Capture real Detour extension UI screenshots for detour.protovoid.com.
 *
 * Prefers Chrome for Testing + puppeteer-core --load-extension (same path as extension e2e).
 * Seeds demo-safe rules (example.com / localhost only). Dark theme.
 *
 * Usage:
 *   CHROME=$(node "../Resource Override/extension/scripts/install-chrome.mjs") \
 *     node scripts/capture-screenshots.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXT_ROOT = path.resolve(__dirname, '..');
const EXT =
  process.env.DETOUR_EXT ??
  path.resolve(EXT_ROOT, '.output/detour/chrome-mv3');
const OUT =
  process.env.DETOUR_WEB_SHOTS ??
  path.resolve(EXT_ROOT, '../../Project/detour-web/public/screenshots');
const STORE =
  process.env.DETOUR_STORE_ASSETS ??
  path.resolve(EXT_ROOT, '../docs/distribution/store-assets');

const CHROME = process.env.CHROME;
if (!CHROME) {
  console.error('Set CHROME to a Chrome for Testing binary.');
  process.exit(2);
}
if (!fs.existsSync(EXT)) {
  console.error('Extension build missing:', EXT);
  process.exit(2);
}

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(STORE, { recursive: true });

const ALL_TYPES = [
  'main_frame',
  'sub_frame',
  'stylesheet',
  'script',
  'image',
  'font',
  'object',
  'xmlhttprequest',
  'ping',
  'csp_report',
  'media',
  'websocket',
  'other',
];

const demoWorkspace = {
  groups: [
    {
      id: 'g-local',
      name: 'Local overrides',
      enabled: true,
      pageDomains: ['example.com'],
      rules: [
        {
          id: 'r-redirect',
          enabled: true,
          match: { kind: 'glob', pattern: 'https://cdn.example.com/app.*.js' },
          action: { type: 'redirect', to: 'http://localhost:5173/app.*.js' },
          resourceTypes: ['script'],
          note: 'Point production CDN at Vite',
        },
        {
          id: 'r-headers',
          enabled: true,
          match: { kind: 'glob', pattern: 'https://api.example.com/*' },
          action: {
            type: 'modifyHeaders',
            request: [
              { op: 'set', name: 'X-Detour-Debug', value: '1' },
              { op: 'remove', name: 'Cookie' },
            ],
            response: [{ op: 'set', name: 'Access-Control-Allow-Origin', value: '*' }],
          },
          resourceTypes: ['xmlhttprequest', 'other'],
          note: 'Debug headers for local API work',
        },
        {
          id: 'r-inject',
          enabled: true,
          match: { kind: 'glob', pattern: 'https://example.com/*' },
          action: {
            type: 'injectJs',
            source: {
              kind: 'inline',
              code: 'console.log("[detour] local inject");\nwindow.__DETOUR_DEMO__ = true;',
            },
            runAt: 'document_start',
            allFrames: false,
            world: 'MAIN',
          },
          note: 'Inject debug helpers on the page',
        },
        {
          id: 'r-mock',
          enabled: true,
          match: { kind: 'glob', pattern: 'https://api.example.com/v1/me' },
          action: {
            type: 'mock',
            method: 'GET',
            status: 200,
            headers: [{ name: 'Content-Type', value: 'application/json' }],
            body: '{\n  "id": "demo",\n  "name": "Local user"\n}',
            delayMs: 0,
          },
          note: 'Stub /v1/me without a mock server',
        },
        {
          id: 'r-body',
          enabled: true,
          match: { kind: 'glob', pattern: 'https://cdn.example.com/config.json' },
          action: {
            type: 'overrideBody',
            body: '{\n  "featureFlags": { "newCheckout": true },\n  "env": "local"\n}',
            delivery: 'redirect',
            contentType: 'application/json',
          },
          resourceTypes: ['xmlhttprequest', 'other'],
          note: 'Swap config.json for local flags',
        },
      ],
    },
  ],
};

const now = Date.now();
const demoMatchLog = [
  {
    at: new Date(now - 12_000).toISOString(),
    atMs: now - 12_000,
    key: 'demo-1',
    ruleId: 'r-redirect',
    groupId: 'g-local',
    label: 'Local overrides · https://cdn.example.com/app.*.js',
    url: 'https://cdn.example.com/app.a1b2c3.js',
    tabId: 1,
    source: 'dnr',
  },
  {
    at: new Date(now - 8_000).toISOString(),
    atMs: now - 8_000,
    key: 'demo-2',
    ruleId: 'r-headers',
    groupId: 'g-local',
    label: 'Local overrides · https://api.example.com/*',
    url: 'https://api.example.com/v1/orders',
    tabId: 1,
    source: 'dnr',
  },
  {
    at: new Date(now - 4_000).toISOString(),
    atMs: now - 4_000,
    key: 'demo-3',
    ruleId: 'r-mock',
    groupId: 'g-local',
    label: 'Local overrides · https://api.example.com/v1/me',
    url: 'https://api.example.com/v1/me',
    tabId: 1,
    source: 'mock',
  },
  {
    at: new Date(now - 1_000).toISOString(),
    atMs: now - 1_000,
    key: 'demo-4',
    ruleId: 'r-body',
    groupId: 'g-local',
    label: 'Local overrides · https://cdn.example.com/config.json',
    url: 'https://cdn.example.com/config.json',
    tabId: 1,
    source: 'body',
  },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function toWebp(pngPath, webpPath) {
  const result = spawnSync('cwebp', ['-q', '86', pngPath, '-o', webpPath], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`cwebp failed for ${pngPath}: ${result.stderr || result.stdout}`);
  }
}

async function shot(page, name, opts = {}) {
  const png = path.join(OUT, `${name}.png`);
  const webp = path.join(OUT, `${name}.webp`);
  await page.screenshot({ path: png, type: 'png', ...opts });
  await toWebp(png, webp);
  fs.copyFileSync(png, path.join(STORE, `${name}.png`));
  console.log('wrote', name, '→', png, webp);
}

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'detour-shots-'));
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  pipe: true,
  enableExtensions: true,
  args: ['--no-first-run', '--silent-debugger-extension-api', `--user-data-dir=${userData}`],
});

try {
  const id = await browser.installExtension(EXT);
  console.log('extension id', id);

  const seed = await browser.newPage();
  await seed.goto(`chrome-extension://${id}/popup.html`);
  await seed.waitForFunction(() => document.body?.innerText?.length > 20, { timeout: 15000 });
  await seed.evaluate(
    async (workspace, matchLog) => {
      await chrome.storage.local.set({
        workspace: { v: 1, data: workspace },
        enabled: true,
        theme: 'dark',
        showBadge: true,
        autosave: true,
      });
      await chrome.storage.session.set({ matchLog });
    },
    demoWorkspace,
    demoMatchLog,
  );
  await seed.close();

  // Allow background apply to settle.
  await sleep(800);

  // 1) Popup
  const popup = await browser.newPage();
  await popup.setViewport({ width: 400, height: 640, deviceScaleFactor: 2 });
  await popup.goto(`chrome-extension://${id}/popup.html`);
  await popup.waitForFunction(
    () => document.documentElement.dataset.theme === 'dark' && /Applied|Rules|Detour/i.test(document.body.innerText),
    { timeout: 15000 },
  );
  await sleep(400);
  await shot(popup, 'popup', { fullPage: true });

  // Options editor
  const editor = await browser.newPage();
  await editor.setViewport({ width: 1280, height: 900, deviceScaleFactor: 2 });
  await editor.goto(`chrome-extension://${id}/options.html`);
  await editor.waitForSelector('section.group, .group', { timeout: 15000 });
  await editor.waitForFunction(() => document.documentElement.dataset.theme === 'dark', { timeout: 10000 });
  await sleep(500);

  const clickTab = async (name) => {
    await editor.$$eval(
      'nav.tabs button',
      (tabs, label) => tabs.find((el) => el.textContent.includes(label))?.click(),
      name,
    );
  };

  const openRule = async (ruleId) => {
    await clickTab('Rules');
    await sleep(200);
    // Prefer data attributes if present; else click the rule row that contains the id in DOM.
    const opened = await editor.evaluate((id) => {
      const byTest = document.querySelector(`[data-rule-id="${id}"] [data-testid=rule-row]`);
      if (byTest) {
        byTest.click();
        return true;
      }
      const articles = [...document.querySelectorAll('article.rule')];
      for (const article of articles) {
        const html = article.outerHTML;
        if (html.includes(id)) {
          const row = article.querySelector('[data-testid=rule-row]') || article;
          row.click();
          return true;
        }
      }
      // Fallback: click by note / pattern text
      const patterns = {
        'r-redirect': 'cdn.example.com/app',
        'r-headers': 'api.example.com/*',
        'r-inject': 'example.com/*',
        'r-mock': 'v1/me',
        'r-body': 'config.json',
      };
      const needle = patterns[id];
      if (!needle) return false;
      for (const article of articles) {
        if (article.innerText.includes(needle)) {
          const row = article.querySelector('[data-testid=rule-row]') || article;
          row.click();
          return true;
        }
      }
      return false;
    }, ruleId);
    if (!opened) throw new Error(`Could not open rule ${ruleId}`);
    await editor.waitForSelector('[data-testid=drawer]', { timeout: 8000 });
    await sleep(300);
  };

  const openDrawerTab = async (label) => {
    await editor.$$eval(
      '[data-testid=drawer] [role=tab]',
      (tabs, name) => {
        const tab = tabs.find((el) => el.textContent.trim() === name);
        if (tab) tab.click();
      },
      label,
    );
    await sleep(250);
  };

  const closeDrawer = async () => {
    const done = await editor.$('[data-testid=drawer-done]');
    if (done) {
      await done.click();
      await editor.waitForFunction(() => !document.querySelector('[data-testid=drawer]'), { timeout: 5000 });
    }
  };

  // 2) Rules + redirect drawer
  await openRule('r-redirect');
  await openDrawerTab('Action');
  await sleep(200);
  await shot(editor, 'redirect');
  await closeDrawer();

  // 3) Headers
  await openRule('r-headers');
  await openDrawerTab('Action');
  await sleep(200);
  await shot(editor, 'headers');
  await closeDrawer();

  // 4) Inject (JS)
  await openRule('r-inject');
  // Action tab label may vary; try second tab or "Inject"
  await editor.$$eval('[data-testid=drawer] [role=tab]', (tabs) => {
    const inject = tabs.find((el) => /Inject|Script|Code|Action/i.test(el.textContent ?? ''));
    (inject || tabs[1])?.click();
  });
  await sleep(400);
  await shot(editor, 'inject');
  await closeDrawer();

  // Also capture mock as alternate if inject failed visually — still take mock shot named for site use
  await openRule('r-mock');
  await editor.$$eval('[data-testid=drawer] [role=tab]', (tabs) => {
    const mock = tabs.find((el) => /Mock|Action|Body/i.test(el.textContent ?? ''));
    (mock || tabs[1])?.click();
  });
  await sleep(400);
  await shot(editor, 'mock');
  await closeDrawer();

  // 5) Body replace
  await openRule('r-body');
  await editor.$$eval('[data-testid=drawer] [role=tab]', (tabs) => {
    const body = tabs.find((el) => /Body|Action|Override/i.test(el.textContent ?? ''));
    (body || tabs[1])?.click();
  });
  await sleep(400);
  await shot(editor, 'body');
  await closeDrawer();

  // Match log
  await clickTab('Log');
  await editor.waitForFunction(
    () => /cdn\.example\.com|Recent matches|Match/i.test(document.body.innerText),
    { timeout: 8000 },
  );
  await sleep(300);
  await shot(editor, 'log');

  // Capture notes for the site repo
  fs.writeFileSync(
    path.join(OUT, 'CAPTURE.md'),
    `# Screenshot capture

- **Method:** Real Detour UI via Chrome for Testing + \`puppeteer-core\` (\`browser.installExtension\`), dark theme.
- **Build:** \`${EXT}\`
- **Demo data:** example.com / localhost only (no customer hosts).
- **Shots:** popup, redirect, headers, inject, mock, body, log (PNG + WebP).
- **Also copied PNG** to \`${STORE}\` for Chrome Web Store reuse.
- Captured: ${new Date().toISOString()}
`,
  );

  console.log('done →', OUT);
} finally {
  await browser.close();
}
