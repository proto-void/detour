// Real-browser check for Detour: load the unpacked build, import an RO export through the popup's
// file input, confirm DNR redirects fire, edit rules in the options page, and prove page-inject +
// api-mock rules run in real pages.
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
  // The page script records whether injected JS ran first (document_start).
  '/inject.html': html('<!doctype html><title>inject</title><h1>hi</h1><script>window.SEEN = window.EARLY ?? "none";</script>'),
  '/other.html': html('<!doctype html><title>other</title><h1>hi</h1><script>window.SEEN = window.EARLY ?? "none";</script>'),
  '/api/real': { type: 'text/plain', text: 'REAL' },
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
  check('popup links to the rule tester', /Test a URL/.test(await popup.evaluate(() => document.body.innerText)), true);

  // Rule tester: the imported redirect for a.js should win; a loop must not.
  const testerInput = await editor.waitForSelector('#tester-url');
  await testerInput.click({ clickCount: 3 });
  await testerInput.type('http://127.0.0.1:8001/a.js');
  await editor.waitForFunction(() => document.querySelector('[data-testid=tester-result]')?.textContent.includes('http://127.0.0.1:8002/a.js'), { timeout: 5000 });
  const testerText = () => editor.$eval('[data-testid=tester-result]', (el) => el.textContent.replace(/\s+/g, ' ').trim());
  check('rule tester shows the winning redirect', /This rule wins/.test(await testerText()) && (await testerText()).includes('http://127.0.0.1:8002/a.js'), true);

  await testerInput.click({ clickCount: 3 });
  await testerInput.type('http://127.0.0.1:9/none');
  await editor.waitForFunction(() => document.querySelector('[data-testid=tester-result]')?.textContent.includes('No rule matches'), { timeout: 5000 });
  check('rule tester says when nothing matches', /No rule matches/.test(await testerText()), true);

  await testerInput.click({ clickCount: 3 });
  await testerInput.type('http://127.0.0.1:8001/loop.js');
  await editor.waitForFunction(() => /not applied/i.test(document.querySelector('[data-testid=tester-result]')?.textContent ?? ''), { timeout: 5000 });
  const loopText = await testerText();
  check('rule tester does not let a redirect loop win', /No rule is applied/.test(loopText) && /not applied/i.test(loopText) && !/Redirects to/.test(loopText), true);

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

  // ---- page-inject + api-mock ----------------------------------------------------------------
  const ruleIn = async (group) => (await group.$$('article.rule')).at(-1);
  const statusOf = (article) => article.$eval('[data-testid=rule-status]', (el) => el.textContent.trim());
  const waitStatus = (article, text) =>
    editor.waitForFunction((el, t) => el.querySelector('[data-testid=rule-status]')?.textContent.includes(t), { timeout: 10000 }, article, text).catch(async (e) => {
      console.log(`--- waiting for "${text}", status is "${await statusOf(article)}" ---`);
      throw e;
    });
  const typeCode = async (article, code) => {
    const content = await article.waitForSelector('.cm-content', { timeout: 10000 }).catch(async (e) => {
      console.log('--- rule without a code editor ---\n' + (await article.evaluate((el) => el.innerHTML.slice(0, 2000))));
      throw e;
    });
    await content.click();
    await editor.keyboard.type(code);
  };
  const addPageRule = async (group, pattern, actionType) => {
    await (await group.$('button[id$="-add-rule"]')).click();
    const article = await ruleIn(group);
    await (await article.$('input[id$="-pattern"]')).type(pattern);
    await article.$eval('select[id$="-action"]', (el, value) => {
      el.value = value;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, actionType);
    return article;
  };
  const saveAndSettle = async () => {
    await editor.bringToFront();
    await editor.click('button.primary');
    await editor.waitForFunction(() => document.querySelector('[data-testid=save-state]')?.textContent.includes('All changes saved'), { timeout: 10000 }).catch(async (e) => {
      console.log('--- editor when save did not settle ---\n' + (await editorText()));
      throw e;
    });
  };
  const inPage = async (url, fn) => {
    const p = await browser.newPage();
    await p.goto(url, { waitUntil: 'load' });
    const value = await p.evaluate(fn);
    return { page: p, value };
  };
  const pageState = () => ({ seen: window.SEEN, color: getComputedStyle(document.querySelector('h1')).color });
  // insertCSS goes bridge → background → tab, so it can land just after `load`.
  const cssColor = (p, expected) =>
    p.waitForFunction((c) => getComputedStyle(document.querySelector('h1')).color === c, { timeout: 3000, polling: 100 }, expected).then(
      () => expected,
      () => p.evaluate(() => getComputedStyle(document.querySelector('h1')).color),
    );
  const callApis = async () => {
    const f = await fetch('/api/mocked');
    const xhr = await new Promise((resolve) => {
      const x = new XMLHttpRequest();
      x.open('GET', '/api/mocked');
      x.onload = () => resolve([x.status, x.responseText, x.getResponseHeader('content-type')]);
      x.send();
    });
    const post = await fetch('/api/mocked', { method: 'POST' });
    const real = await fetch('/api/real');
    return { fetch: [f.status, await f.text()], xhr, post: post.status, real: [real.status, await real.text()] };
  };

  await editor.click('#add-group');
  await editor.keyboard.type('Page rules');
  const pageGroup = (await editor.$$('section.group')).at(-1);
  const jsRule = await addPageRule(pageGroup, 'http://localhost:8001/inject.html', 'injectJs');
  await typeCode(jsRule, 'window.EARLY = "injected";');
  const cssRule = await addPageRule(pageGroup, 'http://localhost:8001/*', 'injectCss');
  await typeCode(cssRule, 'h1 { color: rgb(1, 2, 3) }');
  const mockRule = await addPageRule(pageGroup, '*/api/mocked', 'mock');
  await mockRule.$eval('input[id$="-status"]', (el) => {
    el.value = '201';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await saveAndSettle();

  await waitStatus(cssRule, 'Applied');
  await waitStatus(mockRule, 'Applied');
  await waitStatus(jsRule, 'Refused');
  check('inline JS refused while user scripts are off', await statusOf(jsRule), '✕ Refused: User scripts off');
  check('user-scripts banner explains the toggle', /Allow User Scripts/.test(await editorText()) && (await editor.$('[data-testid=user-scripts-banner]')) !== null, true);

  // What a user does on chrome://extensions/?id=…: flip "Allow User Scripts".
  const manager = await browser.newPage();
  await manager.goto(`chrome://extensions/?id=${id}`);
  await manager.evaluate((extensionId) => chrome.developerPrivate.updateExtensionConfiguration({ extensionId, userScriptsAccess: true }), id);
  await manager.close();
  await editor.bringToFront();
  await editor.evaluate(() => window.dispatchEvent(new Event('focus')));
  await waitStatus(jsRule, 'Applied');
  check('inline JS applies once user scripts are allowed', await statusOf(jsRule), '✓ Applied');
  check('banner gone after allowing', (await editor.$('[data-testid=user-scripts-banner]')) === null, true);

  const matching = await inPage('http://localhost:8001/inject.html', pageState);
  check('inline JS ran at document_start, before page scripts', matching.value.seen, 'injected');
  check('inline CSS applies (computed style)', await cssColor(matching.page, 'rgb(1, 2, 3)'), 'rgb(1, 2, 3)');
  const apis = await matching.page.evaluate(callApis);
  check('fetch mock returns mocked status + body', apis.fetch, [201, '{}']);
  check('XHR mock returns mocked status, body + headers', apis.xhr, [201, '{}', 'application/json']);
  check('method mismatch passes through to the server', apis.post, 404);
  check('non-matching fetch passes through', apis.real, [200, 'REAL']);

  const other = await inPage('http://localhost:8001/other.html', pageState);
  check('inline JS not injected on a non-matching page', other.value.seen, 'none');
  await other.page.close();

  // Mock switched off: the open page passes through without a reload.
  await editor.bringToFront();
  await (await mockRule.$('button[role=switch]')).click();
  await saveAndSettle();
  await waitStatus(mockRule, 'Off');
  await matching.page.bringToFront();
  await matching.page.waitForFunction(async () => (await fetch('/api/mocked')).status === 404, { timeout: 5000, polling: 200 }).catch(() => {});
  check('mock off takes effect without reload', await matching.page.evaluate(async () => (await fetch('/api/mocked')).status), 404);
  await matching.page.close();

  // Group switched off: nothing injected on the next load.
  await editor.bringToFront();
  await (await pageGroup.$('button[role=switch]')).click();
  await saveAndSettle();
  await waitStatus(jsRule, 'Off');
  const groupOff = await inPage('http://localhost:8001/inject.html', pageState);
  await new Promise((r) => setTimeout(r, 500));
  const offColor = await groupOff.page.evaluate(() => getComputedStyle(document.querySelector('h1')).color);
  check('group off stops JS + CSS injection', [groupOff.value.seen, offColor === 'rgb(1, 2, 3)'], ['none', false]);
  await groupOff.page.close();

  // ---- re-import keeps switches; name-only match asks first ------------------------------------
  await editor.bringToFront();
  const firstGroup = (await editor.$$('section.group'))[0];
  await (await firstGroup.$('article.rule button[role=switch]')).click();
  await saveAndSettle();
  check('imported rule a switched off before re-import', (await run('http://localhost:8001/page.html')).A, 'PROD');

  const changedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'detour-e2e-changed-'));
  const changedPath = path.join(changedDir, 'ro-export.json');
  const changed = structuredClone(roExport);
  changed.data[0].rules.push({ id: 'c', type: 'normalOverride', match: '*:8001/c.js', replace: 'http://127.0.0.1:8002/c.js', on: true });
  fs.writeFileSync(changedPath, JSON.stringify(changed));
  await popup.bringToFront();
  await (await popup.$('input[type=file]')).uploadFile(changedPath);
  const confirm = await popup.waitForSelector('[role=alertdialog]', { timeout: 10000 });
  check('name-only match asks before replacing', /Replace the earlier import of ro-export\.json\?/.test(await confirm.evaluate((el) => el.textContent)), true);
  await popup.click('#confirm-replace');
  await popup.waitForFunction(() => document.body.innerText.includes('Replaced 2 groups'), { timeout: 10000 });
  const stored = await popup.evaluate(async () => (await chrome.storage.local.get('workspace')).workspace.data);
  const global = stored.groups.find((g) => g.importKey === 'global');
  check(
    're-import keeps the off switch, adds the new rule',
    [global.rules.find((r) => r.importKey === 'a')?.enabled, global.rules.some((r) => r.importKey === 'c'), stored.groups.filter((g) => g.importKey === 'global').length],
    [false, true, 1],
  );
  check('page-rule group untouched by re-import', stored.groups.some((g) => g.name === 'Page rules'), true);
  const afterReimport = await run('http://localhost:8001/page.html');
  check('kept-off rule stays off; new rule fires', [afterReimport.A, afterReimport.C], ['PROD', 'LOCAL']);

  await editor.bringToFront();

  await editor.setViewport({ width: 1100, height: 900 });
  await editor.screenshot({ path: path.join(outDir, 'editor.png'), fullPage: true });
  console.log('screenshot', path.join(outDir, 'editor.png'));
  await pageGroup.screenshot({ path: path.join(outDir, 'page-rules.png') });
  console.log('screenshot', path.join(outDir, 'page-rules.png'));

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
