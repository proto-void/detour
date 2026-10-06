// Real-browser check for Detour slice 1: load the unpacked build, import an RO export
// through the popup's file input, then confirm DNR redirects actually fire.
// Usage: pnpm build && CHROME=/path/to/chrome pnpm e2e:chrome
// Needs Chrome for Testing or Chromium; branded Chrome 137+ ignores unpacked-extension loading flags.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const EXT = path.resolve(import.meta.dirname, '../.output/chrome-mv3');
const CHROME = process.env.CHROME;
if (!CHROME) {
  console.error('Set CHROME to a Chrome for Testing binary (npx @puppeteer/browsers install chrome@stable).');
  process.exit(2);
}
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'detour-e2e-'));

const serve = (port, routes) =>
  new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const body = routes[new URL(req.url, 'http://x').pathname];
      if (!body) return res.writeHead(404).end('nope');
      res.writeHead(200, { 'content-type': body.type, 'access-control-allow-origin': '*' }).end(body.text);
    });
    server.listen(port, '127.0.0.1', () => resolve(server));
  });

const js = (text) => ({ type: 'text/javascript', text });
const html = (text) => ({ type: 'text/html', text });
const page = html('<!doctype html><title>t</title><script src="/a.js"></script><script src="/b.js"></script><script src="/c.js"></script>');

const prod = await serve(8001, {
  '/page.html': page,
  '/a.js': js('window.A = "PROD";'),
  '/b.js': js('window.B = "PROD";'),
  '/c.js': js('window.C = "PROD";'),
  '/old.html': html('<title>OLD</title>'),
});
const local = await serve(8002, {
  '/a.js': js('window.A = "LOCAL";'),
  '/b.js': js('window.B = "LOCAL";'),
  '/c.js': js('window.C = "LOCAL";'),
  '/new.html': html('<title>NEW</title>'),
});

const roExport = {
  v: 1,
  data: [
    {
      id: 'global',
      matchUrl: '*',
      on: true,
      rules: [
        { id: 'a', type: 'normalOverride', match: '*:8001/a.js', replace: 'http://127.0.0.1:8002/a.js', on: true },
        { id: 'nav', type: 'normalOverride', match: '*/old.html', replace: 'http://127.0.0.1:8002/new.html', on: true },
        { id: 'loop', type: 'normalOverride', match: '*/loop.js', replace: 'http://127.0.0.1:8002/loop.js', on: true },
        { id: 'f', type: 'fileOverride', match: '*/x.css', file: 'x', fileId: 'f', on: true },
      ],
    },
    {
      id: 'scoped',
      matchUrl: 'http://localhost:8001/*',
      on: true,
      rules: [{ id: 'b', type: 'normalOverride', match: '*:8001/b.js', replace: 'http://127.0.0.1:8002/b.js', on: true }],
    },
  ],
};
const exportPath = path.join(outDir, 'ro-export.json');
fs.writeFileSync(exportPath, JSON.stringify(roExport));

const results = [];
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${JSON.stringify(actual)}${ok ? '' : ` (expected ${JSON.stringify(expected)})`}`);
};

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, pipe: true, enableExtensions: true, args: ['--no-first-run'] });
try {
  const id = await browser.installExtension(EXT);
  console.log('extension id', id);

  const popup = await browser.newPage();
  await popup.goto(`chrome-extension://${id}/popup.html`);
  await popup.waitForFunction(() => document.body.innerText.includes('Point production at your code.'), { timeout: 10000 });
  check('empty state shown before import', true, true);

  const input = await popup.$('input[type=file]');
  await input.uploadFile(exportPath);
  await popup.waitForFunction(() => document.body.innerText.includes('Imported'), { timeout: 10000 });
  await popup.waitForFunction(() => /\d+ applied/.test(document.body.innerText), { timeout: 10000 });
  const text = await popup.evaluate(() => document.body.innerText);
  console.log('--- popup after import ---\n' + text + '\n---');
  check('import summary', /Imported 4 rules in 2 groups/.test(text), true);
  check('skipped file override listed', /1 rule skipped/.test(text), true);
  check('port-scope warning shown', /port part .* can't be enforced/.test(text), true);
  check('report counts', /3 applied/.test(text) && /1 refused/.test(text), true);
  check('loop refusal has a reason', /loop\.js[\s\S]*Redirect loop/.test(text), true);

  const run = async (url) => {
    const p = await browser.newPage();
    await p.goto(url, { waitUntil: 'load' });
    const r = await p.evaluate(() => ({ A: window.A, B: window.B, C: window.C, title: document.title, url: location.href }));
    await p.close();
    return r;
  };

  const onLocalhost = await run('http://localhost:8001/page.html');
  check('global rule redirects script', onLocalhost.A, 'LOCAL');
  check('scoped rule fires on its site', onLocalhost.B, 'LOCAL');

  const onIp = await run('http://127.0.0.1:8001/page.html');
  check('global rule fires on other site', onIp.A, 'LOCAL');
  check('scoped rule stays off other sites', onIp.B, 'PROD');

  const nav = await run('http://127.0.0.1:8001/old.html');
  check('main_frame page load redirected', [nav.title, nav.url], ['NEW', 'http://127.0.0.1:8002/new.html']);

  await popup.click('button[role=switch]');
  await popup.waitForFunction(() => document.body.innerText.includes('Detour is off'), { timeout: 10000 });
  check('switch reports off', await popup.$eval('button[role=switch]', (b) => b.getAttribute('aria-checked')), 'false');
  const off = await run('http://localhost:8001/page.html');
  check('switch off stops redirects', [off.A, off.B], ['PROD', 'PROD']);

  await popup.click('button[role=switch]');
  await popup.waitForFunction(() => /\d+ applied/.test(document.body.innerText), { timeout: 10000 });
  const on = await run('http://localhost:8001/page.html');
  check('switch on restores redirects', [on.A, on.B], ['LOCAL', 'LOCAL']);

  // Re-importing the same file replaces its groups instead of duplicating them.
  await (await popup.$('input[type=file]')).uploadFile(exportPath);
  await popup.waitForFunction(() => document.body.innerText.includes('Replaced 2 groups'), { timeout: 10000 }).catch(async (e) => {
    console.log('--- popup at re-import ---\n' + (await popup.evaluate(() => document.body.innerText)));
    throw e;
  });
  check('re-import reports replacement', true, true);

  const editor = await browser.newPage();
  await editor.goto(`chrome-extension://${id}/options.html`);
  await editor.waitForSelector('.group');
  const editorText = () => editor.evaluate(() => document.body.innerText);
  check('re-import kept 2 groups (no duplicates)', (await editor.$$('section.group')).length, 2);
  check('no iframe warning where topDomains is supported', /cross-site iframes/.test(await editorText()), false);

  // Create a group and a rule through the editor, then confirm the rule fires.
  await editor.click('#add-group');
  await editor.keyboard.type('E2E group');
  const groups = await editor.$$('section.group');
  const mine = groups[groups.length - 1];
  await (await mine.$('button[id$="-add-rule"]')).click();
  const pattern = await mine.$('input[id$="-pattern"]');
  await pattern.type('*:8001/c.js');
  await editor.click('button.primary');
  await editor.waitForFunction(() => document.body.innerText.includes('Enter where matching requests should go'), { timeout: 5000 });
  check('save blocked with a field error for the empty target', await editor.evaluate(() => document.activeElement?.id.endsWith('-to')), true);

  await (await mine.$('input[id$="-to"]')).type('http://127.0.0.1:8002/c.js');
  await (await mine.$('input[id$="-sample"]')).type('http://localhost:8001/c.js');
  const preview = await mine.$eval('[data-testid=preview]', (el) => el.textContent.replace(/\s+/g, ' ').trim());
  check('live preview shows the redirect target', preview, 'Matches. It would go to http://127.0.0.1:8002/c.js'.replace(/^/, '✓ '));

  await editor.click('button.primary');
  const lastStatus = () => mine.$$eval('[data-testid=rule-status]', (els) => els[els.length - 1].textContent.trim());
  await editor.waitForFunction(
    () => [...document.querySelectorAll('[data-testid=rule-status]')].at(-1)?.textContent.includes('Applied'),
    { timeout: 10000 },
  );
  check('editor shows the new rule as applied', await lastStatus(), '✓ Applied');
  check('save state settles', (await editor.$eval('[data-testid=save-state]', (el) => el.textContent.trim())), '✓ All changes saved');
  check('rule created in the editor fires', (await run('http://localhost:8001/page.html')).C, 'LOCAL');

  // Per-rule switch: off + save stops the redirect.
  await (await mine.$('article.rule button[role=switch]')).click();
  await editor.click('button.primary');
  await editor.waitForFunction(() => [...document.querySelectorAll('[data-testid=rule-status]')].at(-1)?.textContent.includes('Off'), { timeout: 10000 });
  await editor.waitForFunction(() => document.querySelector('[data-testid=save-state]')?.textContent.includes('All changes saved'), { timeout: 10000 });
  check('rule switched off in the editor stops firing', (await run('http://localhost:8001/page.html')).C, 'PROD');

  await editor.setViewport({ width: 1100, height: 900 });
  await editor.screenshot({ path: path.join(outDir, 'editor.png'), fullPage: true });
  console.log('screenshot', path.join(outDir, 'editor.png'));

  await popup.setViewport({ width: 400, height: 600 });
  await popup.screenshot({ path: path.join(outDir, 'popup.png'), fullPage: true });
  console.log('screenshot', path.join(outDir, 'popup.png'));
} finally {
  await browser.close();
  prod.close();
  local.close();
}

const failed = results.filter((ok) => !ok).length;
console.log(`${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
