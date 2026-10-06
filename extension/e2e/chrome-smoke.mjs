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
const page = html('<!doctype html><title>t</title><script src="/a.js"></script><script src="/b.js"></script>');

const prod = await serve(8001, {
  '/page.html': page,
  '/a.js': js('window.A = "PROD";'),
  '/b.js': js('window.B = "PROD";'),
  '/old.html': html('<title>OLD</title>'),
});
const local = await serve(8002, {
  '/a.js': js('window.A = "LOCAL";'),
  '/b.js': js('window.B = "LOCAL";'),
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
    const r = await p.evaluate(() => ({ A: window.A, B: window.B, title: document.title, url: location.href }));
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
