import { describe, expect, it } from 'vitest';
import type { BodyRule } from './plan';
import { DOCUMENT_BYTE_CAP, integrityMetadata, isRewritableHtml, loadRuleBytes, rewriteDocumentIntegrity } from './sri';

const encoder = new TextEncoder();

const rule = (over: Partial<BodyRule> = {}): BodyRule => ({
  groupId: 'g',
  ruleId: 'b',
  match: { kind: 'glob', pattern: 'https://cdn.example.com/app.js' },
  caseSensitive: false,
  resourceTypes: ['script'],
  body: 'window.A = "LOCAL"',
  ...over,
});

const load = (rules: readonly BodyRule[]) => async (candidate: BodyRule) => {
  const found = rules.find((item) => item.ruleId === candidate.ruleId);
  if (!found || found.body === 'FAIL') return undefined;
  return encoder.encode(found.bridgePath ? `file:${found.bridgePath}` : found.body);
};

describe('integrityMetadata', () => {
  it('uses standard base64 SHA-384, the form SRI compares', async () => {
    const empty = Buffer.from('38b060a751ac96384cd9327eb1b1e36a21fdb71114be07434c0cc7bf63f6e1da274edebfe76f65fbd51ad2f14898b95b', 'hex').toString('base64');
    expect(await integrityMetadata(new Uint8Array())).toBe(`sha384-${empty}`);
  });
});

describe('isRewritableHtml', () => {
  it('accepts UTF-8 HTML and rejects other types and charsets', () => {
    expect(isRewritableHtml('text/html')).toBe(true);
    expect(isRewritableHtml('text/html; charset=UTF-8')).toBe(true);
    expect(isRewritableHtml('application/xhtml+xml')).toBe(true);
    expect(isRewritableHtml('text/html; charset=windows-1252')).toBe(false);
    expect(isRewritableHtml('text/plain')).toBe(false);
    expect(isRewritableHtml(undefined)).toBe(false);
  });
});

describe('rewriteDocumentIntegrity', () => {
  const page = 'https://app.example.com/dir/page.html';

  it('updates a matching script and leaves the sibling hash', async () => {
    const html = [
      '<!doctype html><title>t</title>',
      '<script src="https://cdn.example.com/app.js" integrity="sha384-old" crossorigin="anonymous"></script>',
      '<script src="https://cdn.example.com/other.js" integrity="sha384-keep"></script>',
      '<p>after</p>',
    ].join('');
    const armed = rule();
    const next = await rewriteDocumentIntegrity(html, page, 'app.example.com', [armed], load([armed]));
    const hash = await integrityMetadata(encoder.encode(armed.body));
    expect(next).toContain(`integrity="${hash}"`);
    expect(next).toContain('integrity="sha384-keep"');
    expect(next).toContain('crossorigin="anonymous"');
    expect(next).toContain('<p>after</p>');
    expect(next).not.toContain('sha384-old');
  });

  it('resolves a relative URL and a stylesheet, and ignores an icon', async () => {
    const script = rule({ ruleId: 'js', match: { kind: 'glob', pattern: 'https://app.example.com/dir/app.js' } });
    const style = rule({
      ruleId: 'css',
      match: { kind: 'glob', pattern: 'https://app.example.com/app.css' },
      resourceTypes: ['stylesheet'],
      body: 'body{}',
    });
    const html = [
      '<script integrity="sha384-old" src="app.js"></script>',
      '<link rel="stylesheet" href="/app.css" integrity="sha384-css">',
      '<link rel="icon" href="/app.css" integrity="sha384-icon">',
      '<link rel="preload" as="script" href="app.js" integrity="sha384-pre">',
    ].join('');
    const next = await rewriteDocumentIntegrity(html, page, 'app.example.com', [script, style], load([script, style]));
    expect(next).toContain(`integrity="${await integrityMetadata(encoder.encode(script.body))}"`);
    expect(next).toContain(`integrity="${await integrityMetadata(encoder.encode(style.body))}"`);
    expect(next).toContain('integrity="sha384-icon"');
    expect(next).not.toContain('sha384-old');
    expect(next).not.toContain('sha384-css');
    expect(next).not.toContain('sha384-pre');
  });

  it('does not touch integrity inside comments or script text', async () => {
    const armed = rule();
    const html = '<!-- <script src="https://cdn.example.com/app.js" integrity="sha384-old"></script> --><script>var x = "integrity=sha384-old"</script><p>ok</p>';
    const next = await rewriteDocumentIntegrity(html, page, 'app.example.com', [armed], load([armed]));
    expect(next).toBe(html);
  });

  it('leaves the published hash when the file cannot be read', async () => {
    const armed = rule({ body: 'FAIL', bridgePath: 'assets/app.js' });
    const html = '<script src="https://cdn.example.com/app.js" integrity="sha384-old"></script>';
    const next = await rewriteDocumentIntegrity(html, page, 'app.example.com', [armed], load([armed]));
    expect(next).toBe(html);
  });

  it('hashes the bridge file bytes, not the empty inline body', async () => {
    const armed = rule({ body: '', bridgePath: 'assets/app.js' });
    const html = '<script src="https://cdn.example.com/app.js" integrity="sha384-old"></script>';
    const next = await rewriteDocumentIntegrity(html, page, 'app.example.com', [armed], load([armed]));
    expect(next).toContain(`integrity="${await integrityMetadata(encoder.encode('file:assets/app.js'))}"`);
  });

  it('skips a tag outside the rule site or resource type', async () => {
    const scoped = rule({ pageDomains: ['app.example.com'] });
    const scriptsOnly = rule({ ruleId: 'js' });
    const html = '<link rel="stylesheet" href="https://cdn.example.com/app.js" integrity="sha384-css"><script src="https://cdn.example.com/app.js" integrity="sha384-js"></script>';
    const offSite = await rewriteDocumentIntegrity(html, page, 'other.example.com', [scoped], load([scoped]));
    expect(offSite).toBe(html);
    const cssUntouched = await rewriteDocumentIntegrity(html, page, 'app.example.com', [scriptsOnly], load([scriptsOnly]));
    expect(cssUntouched).toContain('integrity="sha384-css"');
    expect(cssUntouched).not.toContain('integrity="sha384-js"');
  });

  it('returns a document above the cap unchanged', async () => {
    const armed = rule();
    const html = `${'x'.repeat(DOCUMENT_BYTE_CAP)}<script src="https://cdn.example.com/app.js" integrity="sha384-old"></script>`;
    const next = await rewriteDocumentIntegrity(html, page, 'app.example.com', [armed], load([armed]));
    expect(next).toBe(html);
  });
});

describe('loadRuleBytes', () => {
  it('reads a bridge file once and does not cache a failure', async () => {
    const cache = new Map<string, Uint8Array>();
    let calls = 0;
    const read = async () => {
      calls += 1;
      return calls === 1 ? { ok: false as const } : { ok: true as const, bytes: encoder.encode('disk'), contentType: 'text/javascript' };
    };
    const armed = rule({ body: '', bridgePath: 'assets/app.js' });
    expect(await loadRuleBytes(armed, read, cache)).toBeUndefined();
    expect(await loadRuleBytes(armed, read, cache)).toEqual(encoder.encode('disk'));
    expect(await loadRuleBytes(armed, read, cache)).toEqual(encoder.encode('disk'));
    expect(calls).toBe(2);
  });
});
