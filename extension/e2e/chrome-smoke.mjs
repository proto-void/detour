// Real-browser check for Detour: load the unpacked build, import an RO export through the popup's
// file input, confirm DNR redirects fire, edit rules in the options page, and prove page-inject +
// api-mock rules run in real pages.
// Usage: pnpm build && CHROME=/path/to/chrome pnpm e2e:chrome
// Needs Chrome for Testing or Chromium; branded Chrome 137+ ignores unpacked-extension loading flags.
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
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
      res.writeHead(200, { 'content-type': body.type, 'access-control-allow-origin': '*', ...(body.headers ?? {}) }).end(body.text);
    });
    server.listen(port, '127.0.0.1', () => resolve(server));
  });

const js = (text) => ({ type: 'text/javascript', text });
const css = (text) => ({ type: 'text/css', text });
const html = (text) => ({ type: 'text/html', text });
const sha384 = (text) => `sha384-${createHash('sha384').update(text).digest('base64')}`;
const sriProd = 'window.SRI = "PROD";';
const sriKept = 'window.SRI_KEPT = "OK";';
const sriBad = 'window.SRI_BAD = "NO";';
const sriJsProd = 'window.SRI_JS = "PROD";';
const sriJsBad = 'window.SRI_JS_BAD = "NO";';
const sriHtmlProd = 'window.SRI_HTML = "PROD";';
const sriHtmlBad = 'window.SRI_HTML_BAD = "NO";';
const sriExecProd = 'window.SRI_EXEC = "PROD";';
const sriExecBad = 'window.SRI_EXEC_BAD = "NO";';
const sriUnsafeProd = 'window.SRI_UNSAFE = "PROD";';
const sriUnsafeBad = 'window.SRI_UNSAFE_BAD = "NO";';
const sriNsProd = 'window.SRI_NS = "PROD";';
const sriNsBad = 'window.SRI_NS_BAD = "NO";';
const sriOuterProd = 'html{--sri-outer:prod}';
const sriOuterBadCss = 'html{--sri-outer-bad:no}';
const sriShadowProd = 'span{--sri-shadow:prod}';
const sriShadowBadCss = 'span{--sri-shadow-bad:no}';
const sriUnsafeCssProd = 'html{--sri-unsafe-css:prod}';
const sriUnsafeCssBad = 'html{--sri-unsafe-css-bad:no}';
const sriUnsafeShadowProd = 'span{--sri-unsafe-shadow:prod}';
const sriUnsafeShadowBad = 'span{--sri-unsafe-shadow-bad:no}';
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
  '/body.html': html('<!doctype html><title>body</title><script src="/replaced.js"></script><script src="/kept.js"></script>'),
  '/replaced.js': js('window.BODY = "PROD";'),
  '/kept.js': js('window.KEPT = "PROD";'),
  '/bridge.html': html('<!doctype html><title>bridge</title><script src="/bridge.js"></script>'),
  '/bridge.js': js('window.BRIDGE = "PROD";'),
  // script-src 'self' allows this origin (port 8001) and blocks the bridge on another port.
  '/csp-bridge.html': {
    type: 'text/html',
    text: '<!doctype html><title>csp</title><script src="/csp-bridge.js"></script>',
    headers: { 'content-security-policy': "script-src 'self'" },
  },
  '/csp-bridge.js': js('window.CSP_BRIDGE = "PROD";'),
  '/sri.html': html(
    `<!doctype html><title>sri</title><script src="/sri.js" integrity="${sha384(sriProd)}" crossorigin="anonymous"></script><script src="/sri-kept.js" integrity="${sha384(sriKept)}" crossorigin="anonymous"></script><script src="/sri-bad.js" integrity="sha384-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" crossorigin="anonymous"></script>`,
  ),
  '/sri.js': js(sriProd),
  '/sri-kept.js': js(sriKept),
  '/sri-bad.js': js(sriBad),
  '/sri-disk.html': html(`<!doctype html><title>sri-disk</title><script src="/sri-disk.js" integrity="${sha384('window.SRI_DISK = "PROD";')}" crossorigin="anonymous"></script>`),
  '/sri-disk.js': js('window.SRI_DISK = "PROD";'),
  // Integrity is assigned after parse, the way a bundler sets script.integrity.
  '/sri-js.html': html(
    `<!doctype html><title>sri-js</title><script>var s=document.createElement('script');s.src='/sri-js.js';s.integrity='${sha384(sriJsProd)}';s.crossOrigin='anonymous';document.head.appendChild(s);var b=document.createElement('script');b.src='/sri-js-bad.js';b.integrity='sha384-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';b.crossOrigin='anonymous';document.head.appendChild(b);</script>`,
  ),
  '/sri-js.js': js(sriJsProd),
  '/sri-js-bad.js': js(sriJsBad),
  // The hash lives in a markup string. Fragment parsing does not run the scripts, so the page
  // copies the parsed attributes with setAttributeNS, which Detour does not hook.
  '/sri-html.html': html(`<!doctype html><title>sri-html</title><div id="slot"></div><script>
var slot = document.getElementById('slot');
var bad = 'sha384-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
slot.insertAdjacentHTML('beforeend', '<script src="/sri-html.js" integrity="${sha384(sriHtmlProd)}" crossorigin="anonymous"><' + '/script><script src="/sri-html-bad.js" integrity="' + bad + '" crossorigin="anonymous"><' + '/script>');
slot.querySelectorAll('script').forEach(function (old) {
  var next = document.createElement('script');
  for (var i = 0; i < old.attributes.length; i++) {
    var attr = old.attributes[i];
    next.setAttributeNS(null, attr.name, attr.value);
  }
  old.replaceWith(next);
});
</script>`),
  '/sri-html.js': js(sriHtmlProd),
  '/sri-html-bad.js': js(sriHtmlBad),
  // These two APIs execute scripts. The production hash is in the markup string.
  '/sri-exec.html': html(`<!doctype html><title>sri-exec</title><div id="unsafe"></div><script>
var bad = 'sha384-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
var range = document.createRange();
range.selectNode(document.documentElement);
document.body.append(range.createContextualFragment('<script src="/sri-exec.js" integrity="${sha384(sriExecProd)}" crossorigin="anonymous"><' + '/script><script src="/sri-exec-bad.js" integrity="' + bad + '" crossorigin="anonymous"><' + '/script>'));
document.getElementById('unsafe').setHTMLUnsafe('<script src="/sri-unsafe.js" integrity="${sha384(sriUnsafeProd)}" crossorigin="anonymous"><' + '/script><script src="/sri-unsafe-bad.js" integrity="' + bad + '" crossorigin="anonymous"><' + '/script>', { runScripts: true });
</script>`),
  '/sri-exec.js': js(sriExecProd),
  '/sri-exec-bad.js': js(sriExecBad),
  '/sri-unsafe.js': js(sriUnsafeProd),
  '/sri-unsafe-bad.js': js(sriUnsafeBad),
  // outerHTML and a shadow root's innerHTML do not run scripts. A stylesheet is still checked.
  // setAttributeNS copies a parser attribute and does not go through setAttribute. Integrity is set before src.
  '/sri-inert.html': html(`<!doctype html><title>sri-inert</title><div id="outer"></div><div id="shadow-host"></div><script>
var bad = 'sha384-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
document.getElementById('outer').outerHTML = '<link rel="stylesheet" href="/sri-outer.css" integrity="${sha384(sriOuterProd)}" crossorigin="anonymous"><link rel="stylesheet" href="/sri-outer-bad.css" integrity="' + bad + '" crossorigin="anonymous">';
var root = document.getElementById('shadow-host').attachShadow({ mode: 'open' });
root.innerHTML = '<link rel="stylesheet" href="/sri-shadow.css" integrity="${sha384(sriShadowProd)}" crossorigin="anonymous"><link rel="stylesheet" href="/sri-shadow-bad.css" integrity="' + bad + '" crossorigin="anonymous"><span id="probe">x</span>';
var matched = document.createElement('script');
matched.setAttributeNS(null, 'integrity', '${sha384(sriNsProd)}');
matched.setAttributeNS(null, 'src', '/sri-ns.js');
matched.setAttributeNS(null, 'crossorigin', 'anonymous');
document.head.appendChild(matched);
var sibling = document.createElement('script');
sibling.setAttributeNS(null, 'integrity', bad);
sibling.setAttributeNS(null, 'src', '/sri-ns-bad.js');
sibling.setAttributeNS(null, 'crossorigin', 'anonymous');
document.head.appendChild(sibling);
</script>`),
  '/sri-ns.js': js(sriNsProd),
  '/sri-ns-bad.js': js(sriNsBad),
  '/sri-outer.css': css(sriOuterProd),
  '/sri-outer-bad.css': css(sriOuterBadCss),
  '/sri-shadow.css': css(sriShadowProd),
  '/sri-shadow-bad.css': css(sriShadowBadCss),
  // setHTMLUnsafe with scripts off still fetches stylesheets and checks integrity.
  '/sri-unsafe-css.html': html(`<!doctype html><title>sri-unsafe-css</title><div id="host"></div><div id="shadow-host"></div><script>
var bad = 'sha384-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
document.getElementById('host').setHTMLUnsafe('<link rel="stylesheet" href="/sri-unsafe-css.css" integrity="${sha384(sriUnsafeCssProd)}" crossorigin="anonymous"><link rel="stylesheet" href="/sri-unsafe-css-bad.css" integrity="' + bad + '" crossorigin="anonymous">');
var root = document.getElementById('shadow-host').attachShadow({ mode: 'open' });
root.setHTMLUnsafe('<link rel="stylesheet" href="/sri-unsafe-shadow.css" integrity="${sha384(sriUnsafeShadowProd)}" crossorigin="anonymous"><link rel="stylesheet" href="/sri-unsafe-shadow-bad.css" integrity="' + bad + '" crossorigin="anonymous"><span id="probe">x</span>', { runScripts: false });
</script>`),
  '/sri-unsafe-css.css': css(sriUnsafeCssProd),
  '/sri-unsafe-css-bad.css': css(sriUnsafeCssBad),
  '/sri-unsafe-shadow.css': css(sriUnsafeShadowProd),
  '/sri-unsafe-shadow-bad.css': css(sriUnsafeShadowBad),
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

// While a body-override tab is open, Puppeteer must not attach to it: Chrome allows one debugger per tab.
const shieldPaths = [];
let bridgeProc;
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  pipe: true,
  enableExtensions: true,
  // Headless cannot click the debugging infobar. The permission itself is still requested from the page.
  // GitHub-hosted runners need the sandbox off. Local runs keep the default sandbox.
  args: [
    '--no-first-run',
    '--silent-debugger-extension-api',
    ...(process.env.CI ? ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] : []),
  ],
  targetFilter: (target) => {
    if (shieldPaths.length === 0) return true;
    const url = target.url();
    if (shieldPaths.some((part) => url.includes(part))) return false;
    if (url === 'about:blank' || url === '') return false;
    return true;
  },
});
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
  check('import summary', /Imported 5 rules in 2 groups/.test(text), true);
  check('file override is imported, not skipped', /rule skipped/.test(text), false);
  check('port-scope warning shown', /port part .* can't be enforced/.test(text), true);
  check('report counts', /3 applied/.test(text) && /2 refused/.test(text), true);
  check('file override waits for the debugger permission', /Replace body of \*\/x\.css/.test(text) && /Allow debugger/.test(text), true);
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

  const watched = await browser.newPage();
  await watched.goto('http://localhost:8001/page.html', { waitUntil: 'load' });
  const readBadge = () =>
    popup.evaluate(async () => {
      const tabs = await chrome.tabs.query({ url: 'http://localhost:8001/page.html' });
      const tabId = tabs.find((tab) => tab.url === 'http://localhost:8001/page.html')?.id;
      return tabId == null ? 'missing' : await chrome.action.getBadgeText({ tabId });
    });
  let badge = '';
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    badge = await readBadge();
    if (Number(badge) >= 2) break;
  }
  check('badge counts matches on the tab', Number(badge) >= 2, true);
  const logJson = await popup.evaluate(async () => JSON.stringify((await chrome.storage.session.get('matchLog')).matchLog ?? []));
  check('match log records the script url', logJson.includes('http://localhost:8001/a.js'), true);
  check('match log does not store an action body', logJson.includes('"body"'), false);
  await popup.$eval('#show-badge', (el) => el.click());
  await popup.waitForFunction(() => document.querySelector('#show-badge')?.getAttribute('aria-checked') === 'false', { timeout: 5000 });
  await new Promise((resolve) => setTimeout(resolve, 400));
  const cleared = await popup.evaluate(async () => {
    const tabs = await chrome.tabs.query({ url: 'http://localhost:8001/page.html' });
    const tabId = tabs.find((tab) => tab.url === 'http://localhost:8001/page.html')?.id;
    return tabId == null ? 'missing' : await chrome.action.getBadgeText({ tabId });
  });
  check('badge switch clears the count', cleared, '');
  await popup.$eval('#show-badge', (el) => el.click());
  await watched.close();

  const nav = await run('http://127.0.0.1:8001/old.html');
  check('main_frame page load redirected', [nav.title, nav.url], ['NEW', 'http://127.0.0.1:8002/new.html']);

  await popup.click('#detour-enabled');
  await popup.waitForFunction(() => document.body.innerText.includes('Detour is off'), { timeout: 10000 });
  check('switch reports off', await popup.$eval('#detour-enabled', (b) => b.getAttribute('aria-checked')), 'false');
  const off = await run('http://localhost:8001/page.html');
  check('switch off stops redirects', [off.A, off.B], ['PROD', 'PROD']);

  await popup.click('#detour-enabled');
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
  await editor.waitForFunction(() => /8001\/a\.js/.test(document.getElementById('log')?.textContent ?? ''), { timeout: 8000 });
  const logText = await editor.$eval('#log', (el) => el.textContent);
  check('match log is on the rules page', /Recent matches/.test(logText) && /8001\/a\.js/.test(logText), true);
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

  // Light theme persists, a popup group switch gates that group's rules, and a recipe redirects.
  await popup.bringToFront();
  await popup.click('#theme-light');
  await popup.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  check('light theme background', await popup.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(244, 246, 248)');
  await popup.reload();
  await popup.waitForFunction(() => document.documentElement.dataset.theme === 'light', { timeout: 10000 });
  check('light theme persists across reload', await popup.$eval('#theme-light', (b) => b.getAttribute('aria-checked')), 'true');
  await popup.click('#theme-light');
  await popup.waitForFunction(() => document.documentElement.dataset.theme === 'dark');

  const setPopupGroup = async (name, enabled) => {
    await popup.bringToFront();
    await popup.evaluate(
      (label, on) => {
        const button = [...document.querySelectorAll('button[role="switch"]')].find((el) => el.getAttribute('aria-label') === label);
        if (!button) throw new Error(`missing switch ${label}`);
        if ((button.getAttribute('aria-checked') === 'true') !== on) button.click();
      },
      `Enable ${name}`,
      enabled,
    );
    await popup.waitForFunction(
      (label, on) => {
        const button = [...document.querySelectorAll('button[role="switch"]')].find((el) => el.getAttribute('aria-label') === label);
        return button?.getAttribute('aria-checked') === String(on);
      },
      { timeout: 10000 },
      `Enable ${name}`,
      enabled,
    );
    // The switch flips before the background finishes applying.
    await new Promise((resolve) => setTimeout(resolve, 400));
  };

  await setPopupGroup('*', false);
  const grouped = await browser.newPage();
  await grouped.goto('http://127.0.0.1:8001/c.js', { waitUntil: 'load' });
  check('popup group off stops that group', grouped.url(), 'http://127.0.0.1:8001/c.js');
  await setPopupGroup('*', true);
  await grouped.goto('http://127.0.0.1:8001/c.js', { waitUntil: 'load' });
  check('popup group on restores that group', grouped.url(), 'http://127.0.0.1:8002/c.js');
  await grouped.close();

  await editor.bringToFront();
  await editor.reload();
  await editor.waitForSelector('#recipes');
  await (await editor.waitForSelector('#recipes button')).click();
  const host = await editor.waitForSelector('#recipe-host');
  await host.click();
  await host.type('127.0.0.1:9');
  const origin = await editor.waitForSelector('#recipe-origin');
  await origin.evaluate((el, value) => {
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, 'http://127.0.0.1:8002');
  await editor.click('#recipe-add');
  // The group name lives in an input and a clipped heading, so innerText misses it.
  await editor.waitForFunction(() => document.body.textContent.includes('127.0.0.1:9 → 127.0.0.1:8002'), { timeout: 5000 });
  await editor.click('button.primary');
  await editor.waitForFunction(() => document.querySelector('[data-testid=save-state]')?.textContent.includes('All changes saved'), { timeout: 10000 });
  const recipeHit = await browser.newPage();
  await recipeHit.goto('http://127.0.0.1:9/a.js', { waitUntil: 'load' });
  check('localhost recipe redirects the host', recipeHit.url(), 'http://127.0.0.1:8002/a.js');
  await recipeHit.close();

  const manifest = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
  check('devtools page declared', manifest.devtools_page, 'devtools.html');
  const panel = await browser.newPage();
  const panelErrors = [];
  panel.on('pageerror', (err) => panelErrors.push(String(err)));
  await panel.goto(`chrome-extension://${id}/devtools-panel.html`);
  await panel.waitForFunction(() => document.body.innerText.includes('Open this panel from the browser'), { timeout: 10000 });
  check('devtools panel explains itself outside DevTools', panelErrors, []);
  await panel.close();

  await editor.bringToFront();
  await editor.setViewport({ width: 1100, height: 900 });
  await editor.screenshot({ path: path.join(outDir, 'editor.png'), fullPage: true });
  console.log('screenshot', path.join(outDir, 'editor.png'));
  const pageShot = await editor.evaluateHandle(() => {
    const groups = [...document.querySelectorAll('section.group')];
    return groups.find((group) => group.querySelector('input')?.value === 'Page rules') ?? groups.at(-1);
  });
  await pageShot.asElement().screenshot({ path: path.join(outDir, 'page-rules.png') });
  console.log('screenshot', path.join(outDir, 'page-rules.png'));

  await popup.setViewport({ width: 400, height: 600 });
  await popup.screenshot({ path: path.join(outDir, 'popup.png'), fullPage: true });
  console.log('screenshot', path.join(outDir, 'popup.png'));

  // Body override. The imported file override already asked for the debugger; allow it, then replace one script.
  await editor.bringToFront();
  await editor.waitForSelector('#allow-body', { timeout: 10000 });
  await editor.click('#allow-body');
  await editor.waitForFunction(() => !document.querySelector('[data-testid=body-permission-banner]'), { timeout: 10000 }).catch(async (e) => {
    console.log('--- body banner still up ---\n' + (await editorText()));
    throw e;
  });
  check('debugger permission granted from the editor', true, true);

  await editor.click('#add-group');
  await editor.keyboard.type('Body override');
  const bodyGroup = (await editor.$$('section.group')).at(-1);
  const bodyRule = await addPageRule(bodyGroup, '*:8001/replaced.js', 'overrideBody');
  await typeCode(bodyRule, 'window.BODY = "LOCAL";');
  await saveAndSettle();
  await waitStatus(bodyRule, 'Applied');
  check('body rule shows applied', await statusOf(bodyRule), '✓ Applied');
  check('body editor says page JavaScript integrity is updated', (await editorText()).includes('page JavaScript'), true);
  check('body editor says markup integrity is updated', (await editorText()).includes('insertAdjacentHTML'), true);
  check('body editor says script-running markup integrity is updated', (await editorText()).includes('createContextualFragment'), true);
  check('body editor says inert markup integrity is updated', (await editorText()).includes('setAttributeNS'), true);

  shieldPaths.push('/body.html');
  const workerTarget = await browser.waitForTarget((t) => t.type() === 'service_worker' && t.url().includes(id), { timeout: 10000 });
  const worker = await workerTarget.worker();
  const replaced = await worker.evaluate(async (url) => {
    const tab = await chrome.tabs.create({ url, active: false });
    const waitComplete = async () => {
      const current = await chrome.tabs.get(tab.id);
      if (current.status === 'complete') return;
      await new Promise((resolve) => {
        const listener = (tabId, info) => {
          if (tabId === tab.id && info.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }
        };
        chrome.tabs.onUpdated.addListener(listener);
      });
    };
    await waitComplete();
    await chrome.tabs.reload(tab.id);
    await waitComplete();
    const [injected] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: () => ({ BODY: window.BODY, KEPT: window.KEPT }),
    });
    await chrome.tabs.remove(tab.id);
    return injected.result;
  }, 'http://127.0.0.1:8001/body.html');
  check('replaced script body runs', replaced.BODY, 'LOCAL');
  check('unmatched script is untouched', replaced.KEPT, 'PROD');
  shieldPaths.length = 0;

  // The published integrity hash is of the production file. Detour must swap in a hash of the override or the script never runs.
  shieldPaths.push('/sri.html');
  await editor.bringToFront();
  await editor.click('#add-group');
  await editor.keyboard.type('SRI');
  const sriGroup = (await editor.$$('section.group')).at(-1);
  const sriRule = await addPageRule(sriGroup, '*:8001/sri.js', 'overrideBody');
  await typeCode(sriRule, 'window.SRI = "LOCAL";');
  await saveAndSettle();
  await waitStatus(sriRule, 'Applied');
  const sriWorkerTarget = await browser.waitForTarget((t) => t.type() === 'service_worker' && t.url().includes(id), { timeout: 10000 });
  const sriWorker = await sriWorkerTarget.worker();
  const sriPage = await sriWorker.evaluate(async (url) => {
    const tab = await chrome.tabs.create({ url, active: false });
    const waitComplete = async () => {
      const current = await chrome.tabs.get(tab.id);
      if (current.status === 'complete') return;
      await new Promise((resolve) => {
        const listener = (tabId, info) => {
          if (tabId === tab.id && info.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }
        };
        chrome.tabs.onUpdated.addListener(listener);
      });
    };
    await waitComplete();
    await chrome.tabs.reload(tab.id);
    await waitComplete();
    const [injected] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: () => ({ SRI: window.SRI, SRI_KEPT: window.SRI_KEPT, SRI_BAD: window.SRI_BAD }),
    });
    await chrome.tabs.remove(tab.id);
    return injected.result;
  }, 'http://127.0.0.1:8001/sri.html');
  check('integrity-protected script runs the override', sriPage.SRI, 'LOCAL');
  check('sibling with a valid integrity hash still runs', sriPage.SRI_KEPT, 'OK');
  check('sibling with a bad integrity hash stays blocked', sriPage.SRI_BAD, undefined);

  const sriJsRule = await addPageRule(sriGroup, '*:8001/sri-js.js', 'overrideBody');
  await typeCode(sriJsRule, 'window.SRI_JS = "LOCAL";');
  await saveAndSettle();
  await waitStatus(sriJsRule, 'Applied');
  shieldPaths.push('/sri-js.html');
  const sriJsPage = await sriWorker.evaluate(async (url) => {
    const tab = await chrome.tabs.create({ url, active: false });
    const waitComplete = async () => {
      const current = await chrome.tabs.get(tab.id);
      if (current.status === 'complete') return;
      await new Promise((resolve) => {
        const listener = (tabId, info) => {
          if (tabId === tab.id && info.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }
        };
        chrome.tabs.onUpdated.addListener(listener);
      });
    };
    await waitComplete();
    await chrome.tabs.reload(tab.id);
    await waitComplete();
    const [injected] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: () => ({
        SRI_JS: window.SRI_JS,
        SRI_JS_BAD: window.SRI_JS_BAD,
        meta: document.querySelector('meta[name="detour-sri"]')?.getAttribute('content') ?? '',
      }),
    });
    await chrome.tabs.remove(tab.id);
    return injected.result;
  }, 'http://127.0.0.1:8001/sri-js.html');
  check('page script that sets integrity after parse runs the override', sriJsPage.SRI_JS, 'LOCAL');
  check('sibling whose JavaScript integrity does not match stays blocked', sriJsPage.SRI_JS_BAD, undefined);
  check('integrity list is on the page', sriJsPage.meta.length > 0, true);
  check('integrity list does not include the override source', sriJsPage.meta.includes('window.SRI_JS = "LOCAL"'), false);

  const sriHtmlRule = await addPageRule(sriGroup, '*:8001/sri-html.js', 'overrideBody');
  await typeCode(sriHtmlRule, 'window.SRI_HTML = "LOCAL";');
  await saveAndSettle();
  await waitStatus(sriHtmlRule, 'Applied');
  shieldPaths.push('/sri-html.html');
  const sriHtmlPage = await sriWorker.evaluate(async (url) => {
    const tab = await chrome.tabs.create({ url, active: false });
    const waitComplete = async () => {
      const current = await chrome.tabs.get(tab.id);
      if (current.status === 'complete') return;
      await new Promise((resolve) => {
        const listener = (tabId, info) => {
          if (tabId === tab.id && info.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }
        };
        chrome.tabs.onUpdated.addListener(listener);
      });
    };
    await waitComplete();
    await chrome.tabs.reload(tab.id);
    await waitComplete();
    const [injected] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: () =>
        new Promise((resolve) => {
          const started = Date.now();
          const tick = () => {
            const value = { SRI_HTML: window.SRI_HTML, SRI_HTML_BAD: window.SRI_HTML_BAD };
            if (value.SRI_HTML !== undefined || Date.now() - started > 3000) resolve(value);
            else setTimeout(tick, 50);
          };
          tick();
        }),
    });
    await chrome.tabs.remove(tab.id);
    return injected.result;
  }, 'http://127.0.0.1:8001/sri-html.html');
  check('insertAdjacentHTML with a production integrity hash runs the override', sriHtmlPage.SRI_HTML, 'LOCAL');
  check('sibling inserted in that markup stays blocked', sriHtmlPage.SRI_HTML_BAD, undefined);

  const sriExecRule = await addPageRule(sriGroup, '*:8001/sri-exec.js', 'overrideBody');
  await typeCode(sriExecRule, 'window.SRI_EXEC = "LOCAL";');
  const sriUnsafeRule = await addPageRule(sriGroup, '*:8001/sri-unsafe.js', 'overrideBody');
  await typeCode(sriUnsafeRule, 'window.SRI_UNSAFE = "LOCAL";');
  await saveAndSettle();
  await waitStatus(sriExecRule, 'Applied');
  await waitStatus(sriUnsafeRule, 'Applied');
  shieldPaths.push('/sri-exec.html');
  const sriExecPage = await sriWorker.evaluate(async (url) => {
    const tab = await chrome.tabs.create({ url, active: false });
    const waitComplete = async () => {
      const current = await chrome.tabs.get(tab.id);
      if (current.status === 'complete') return;
      await new Promise((resolve) => {
        const listener = (tabId, info) => {
          if (tabId === tab.id && info.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }
        };
        chrome.tabs.onUpdated.addListener(listener);
      });
    };
    await waitComplete();
    await chrome.tabs.reload(tab.id);
    await waitComplete();
    const [injected] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: () =>
        new Promise((resolve) => {
          const started = Date.now();
          const tick = () => {
            const value = {
              SRI_EXEC: window.SRI_EXEC,
              SRI_EXEC_BAD: window.SRI_EXEC_BAD,
              SRI_UNSAFE: window.SRI_UNSAFE,
              SRI_UNSAFE_BAD: window.SRI_UNSAFE_BAD,
            };
            if ((value.SRI_EXEC !== undefined && value.SRI_UNSAFE !== undefined) || Date.now() - started > 3000) resolve(value);
            else setTimeout(tick, 50);
          };
          tick();
        }),
    });
    await chrome.tabs.remove(tab.id);
    return injected.result;
  }, 'http://127.0.0.1:8001/sri-exec.html');
  check('createContextualFragment with a production integrity hash runs the override', sriExecPage.SRI_EXEC, 'LOCAL');
  check('sibling inserted by createContextualFragment stays blocked', sriExecPage.SRI_EXEC_BAD, undefined);
  check('setHTMLUnsafe with runScripts and a production integrity hash runs the override', sriExecPage.SRI_UNSAFE, 'LOCAL');
  check('sibling inserted by setHTMLUnsafe stays blocked', sriExecPage.SRI_UNSAFE_BAD, undefined);

  const sriNsRule = await addPageRule(sriGroup, '*:8001/sri-ns.js', 'overrideBody');
  await typeCode(sriNsRule, 'window.SRI_NS = "LOCAL";');
  const sriOuterRule = await addPageRule(sriGroup, '*:8001/sri-outer.css', 'overrideBody');
  await typeCode(sriOuterRule, 'html{--sri-outer:local}');
  const sriShadowRule = await addPageRule(sriGroup, '*:8001/sri-shadow.css', 'overrideBody');
  await typeCode(sriShadowRule, 'span{--sri-shadow:local}');
  await saveAndSettle();
  await waitStatus(sriNsRule, 'Applied');
  await waitStatus(sriOuterRule, 'Applied');
  await waitStatus(sriShadowRule, 'Applied');
  shieldPaths.push('/sri-inert.html');
  const sriInertPage = await sriWorker.evaluate(async (url) => {
    const tab = await chrome.tabs.create({ url, active: false });
    const waitComplete = async () => {
      const current = await chrome.tabs.get(tab.id);
      if (current.status === 'complete') return;
      await new Promise((resolve) => {
        const listener = (tabId, info) => {
          if (tabId === tab.id && info.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }
        };
        chrome.tabs.onUpdated.addListener(listener);
      });
    };
    await waitComplete();
    await chrome.tabs.reload(tab.id);
    await waitComplete();
    const [injected] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: () =>
        new Promise((resolve) => {
          const started = Date.now();
          const tick = () => {
            const probe = document.getElementById('shadow-host')?.shadowRoot?.querySelector('#probe');
            const value = {
              SRI_NS: window.SRI_NS,
              SRI_NS_BAD: window.SRI_NS_BAD,
              outer: getComputedStyle(document.documentElement).getPropertyValue('--sri-outer').trim(),
              outerBad: getComputedStyle(document.documentElement).getPropertyValue('--sri-outer-bad').trim(),
              shadow: probe ? getComputedStyle(probe).getPropertyValue('--sri-shadow').trim() : '',
              shadowBad: probe ? getComputedStyle(probe).getPropertyValue('--sri-shadow-bad').trim() : '',
            };
            const ready = value.SRI_NS !== undefined && value.outer === 'local' && value.shadow === 'local';
            if (ready || Date.now() - started > 3000) resolve(value);
            else setTimeout(tick, 50);
          };
          tick();
        }),
    });
    await chrome.tabs.remove(tab.id);
    return injected.result;
  }, 'http://127.0.0.1:8001/sri-inert.html');
  check('setAttributeNS with a production integrity hash runs the override', sriInertPage.SRI_NS, 'LOCAL');
  check('sibling whose setAttributeNS integrity does not match stays blocked', sriInertPage.SRI_NS_BAD, undefined);
  check('outerHTML stylesheet with a production integrity hash is accepted', sriInertPage.outer, 'local');
  check('sibling stylesheet in that outerHTML stays blocked', sriInertPage.outerBad, '');
  check('shadow innerHTML stylesheet with a production integrity hash is accepted', sriInertPage.shadow, 'local');
  check('sibling stylesheet in that shadow root stays blocked', sriInertPage.shadowBad, '');

  const sriUnsafeCssRule = await addPageRule(sriGroup, '*:8001/sri-unsafe-css.css', 'overrideBody');
  await typeCode(sriUnsafeCssRule, 'html{--sri-unsafe-css:local}');
  const sriUnsafeShadowRule = await addPageRule(sriGroup, '*:8001/sri-unsafe-shadow.css', 'overrideBody');
  await typeCode(sriUnsafeShadowRule, 'span{--sri-unsafe-shadow:local}');
  await saveAndSettle();
  await waitStatus(sriUnsafeCssRule, 'Applied');
  await waitStatus(sriUnsafeShadowRule, 'Applied');
  shieldPaths.length = 0;
  shieldPaths.push('/sri-unsafe-css.html');
  const sriUnsafeCssPage = await sriWorker.evaluate(async (url) => {
    const tab = await chrome.tabs.create({ url, active: false });
    const waitComplete = async () => {
      const current = await chrome.tabs.get(tab.id);
      if (current.status === 'complete') return;
      await new Promise((resolve) => {
        const listener = (tabId, info) => {
          if (tabId === tab.id && info.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }
        };
        chrome.tabs.onUpdated.addListener(listener);
      });
    };
    await waitComplete();
    await chrome.tabs.reload(tab.id);
    await waitComplete();
    const [injected] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: () =>
        new Promise((resolve) => {
          const started = Date.now();
          const tick = () => {
            const host = document.getElementById('host');
            const probe = document.getElementById('shadow-host')?.shadowRoot?.querySelector('#probe');
            const value = {
              css: getComputedStyle(document.documentElement).getPropertyValue('--sri-unsafe-css').trim(),
              cssBad: getComputedStyle(document.documentElement).getPropertyValue('--sri-unsafe-css-bad').trim(),
              sibling: host?.querySelector('link[href="/sri-unsafe-css-bad.css"]')?.getAttribute('integrity') ?? '',
              shadow: probe ? getComputedStyle(probe).getPropertyValue('--sri-unsafe-shadow').trim() : '',
              shadowBad: probe ? getComputedStyle(probe).getPropertyValue('--sri-unsafe-shadow-bad').trim() : '',
              shadowSibling: document.getElementById('shadow-host')?.shadowRoot?.querySelector('link[href="/sri-unsafe-shadow-bad.css"]')?.getAttribute('integrity') ?? '',
            };
            const ready = value.css === 'local' && value.shadow === 'local';
            if (ready || Date.now() - started > 3000) resolve(value);
            else setTimeout(tick, 50);
          };
          tick();
        }),
    });
    await chrome.tabs.remove(tab.id);
    return injected.result;
  }, 'http://127.0.0.1:8001/sri-unsafe-css.html');
  const badIntegrity = 'sha384-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
  check('setHTMLUnsafe without runScripts accepts a stylesheet with a production integrity hash', sriUnsafeCssPage.css, 'local');
  check('sibling stylesheet in that setHTMLUnsafe stays blocked', sriUnsafeCssPage.cssBad, '');
  check('sibling hash in that setHTMLUnsafe stays', sriUnsafeCssPage.sibling, badIntegrity);
  check('setHTMLUnsafe with runScripts false accepts a shadow stylesheet', sriUnsafeCssPage.shadow, 'local');
  check('sibling stylesheet in that shadow setHTMLUnsafe stays blocked', sriUnsafeCssPage.shadowBad, '');
  check('sibling hash in that shadow setHTMLUnsafe stays', sriUnsafeCssPage.shadowSibling, badIntegrity);
  shieldPaths.length = 0;

  // Local Bridge: consent is already on, so serveLocal is fulfilled in place (the URL stays on port 8001).
  shieldPaths.push('/bridge.html', '/csp-bridge.html');
  const bridgeDir = path.join(outDir, 'bridge-root');
  fs.mkdirSync(bridgeDir);
  fs.writeFileSync(path.join(bridgeDir, 'bridge.js'), 'window.BRIDGE = "DISK";\n');
  fs.writeFileSync(path.join(bridgeDir, 'csp-bridge.js'), 'window.CSP_BRIDGE = "DISK";\n');
  fs.writeFileSync(path.join(bridgeDir, 'sri-disk.js'), 'window.SRI_DISK = "DISK";\n');
  const cli = path.resolve(import.meta.dirname, '../../cli/src/cli.ts');
  bridgeProc = spawn(process.execPath, ['--experimental-strip-types', cli, 'bridge', bridgeDir, '--port', '8099'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let bridgeLog = '';
  bridgeProc.stdout.on('data', (chunk) => {
    bridgeLog += chunk;
  });
  bridgeProc.stderr.on('data', (chunk) => {
    bridgeLog += chunk;
  });
  const token = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`bridge did not print a token\n${bridgeLog}`)), 8000);
    const wait = () => {
      const match = /token: ([0-9a-f]{64})/.exec(bridgeLog);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
        return;
      }
      setTimeout(wait, 50);
    };
    wait();
  });
  await editor.bringToFront();
  await editor.$eval('#bridge-port', (el) => {
    el.value = '8099';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await editor.$eval('#bridge-token', (el, value) => {
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, token);
  await editor.click('#bridge-connect');
  await editor.waitForFunction(() => (document.querySelector('[data-testid=bridge-status]')?.textContent ?? '').includes('Connected to'), { timeout: 8000 }).catch(async (e) => {
    console.log('--- bridge connect failed ---\n' + bridgeLog + '\n' + (await editorText()));
    throw e;
  });
  check('local bridge connected from the rules page', true, true);

  await editor.click('#add-group');
  await editor.keyboard.type('Local bridge');
  const bridgeGroup = (await editor.$$('section.group')).at(-1);
  const bridgeRule = await addPageRule(bridgeGroup, '*:8001/bridge.js', 'serveLocal');
  await (await bridgeRule.$('input[id$="-path"]')).type('bridge.js');
  const cspRule = await addPageRule(bridgeGroup, '*:8001/csp-bridge.js', 'serveLocal');
  await (await cspRule.$('input[id$="-path"]')).type('csp-bridge.js');
  await saveAndSettle();
  await waitStatus(bridgeRule, 'Applied');
  await waitStatus(cspRule, 'Applied');
  check('serve-local rule applied', await statusOf(bridgeRule), '✓ Applied');

  const bridgeWorkerTarget = await browser.waitForTarget((t) => t.type() === 'service_worker' && t.url().includes(id), { timeout: 10000 });
  const bridgeWorker = await bridgeWorkerTarget.worker();
  const readBridgePage = (url) =>
    bridgeWorker.evaluate(async (pageUrl) => {
      const tab = await chrome.tabs.create({ url: pageUrl, active: false });
      const waitComplete = async () => {
        const current = await chrome.tabs.get(tab.id);
        if (current.status === 'complete') return;
        await new Promise((resolve) => {
          const listener = (tabId, info) => {
            if (tabId === tab.id && info.status === 'complete') {
              chrome.tabs.onUpdated.removeListener(listener);
              resolve();
            }
          };
          chrome.tabs.onUpdated.addListener(listener);
        });
      };
      await waitComplete();
      await chrome.tabs.reload(tab.id);
      await waitComplete();
      const [injected] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: 'MAIN',
        func: () => ({
          BRIDGE: window.BRIDGE,
          CSP_BRIDGE: window.CSP_BRIDGE,
          SRI_DISK: window.SRI_DISK,
          urls: performance.getEntriesByType('resource').map((entry) => entry.name),
        }),
      });
      await chrome.tabs.remove(tab.id);
      return injected.result;
    }, url);

  const fromDisk = await readBridgePage('http://127.0.0.1:8001/bridge.html');
  check('script is served from the bridge folder', fromDisk.BRIDGE, 'DISK');
  check('in-place serve keeps the original script URL', fromDisk.urls.includes('http://127.0.0.1:8001/bridge.js') && !fromDisk.urls.some((item) => item.includes(':8099')), true);

  const fromCsp = await readBridgePage('http://127.0.0.1:8001/csp-bridge.html');
  check('CSP that blocks the bridge port still runs the disk script', fromCsp.CSP_BRIDGE, 'DISK');
  check('CSP page never requested the bridge port', fromCsp.urls.some((item) => item.includes(':8099')), false);

  const sriDiskRule = await addPageRule(bridgeGroup, '*:8001/sri-disk.js', 'serveLocal');
  await (await sriDiskRule.$('input[id$="-path"]')).type('sri-disk.js');
  await saveAndSettle();
  await waitStatus(sriDiskRule, 'Applied');
  shieldPaths.push('/sri-disk.html');
  const fromSriDisk = await readBridgePage('http://127.0.0.1:8001/sri-disk.html');
  check('in-place file runs when the page integrity hash was for the production file', fromSriDisk.SRI_DISK, 'DISK');
  shieldPaths.length = 0;
} finally {
  bridgeProc?.kill('SIGTERM');
  await browser.close();
  prod.close();
  local.close();
}

const failed = results.filter((ok) => !ok).length;
console.log(`${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
