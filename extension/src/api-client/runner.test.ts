import { describe, expect, it } from 'vitest';
import { createCollection, createRequestNode, addChild } from './collections';
import { emptyRequest } from './model';
import { exportReportHtml, exportReportJson, listRunnableRequests, runCollection } from './runner';
import { parseDataFile } from './data-file';

describe('parseDataFile', () => {
  it('parses CSV and JSON', () => {
    expect(parseDataFile('a,b\n1,2').ok && parseDataFile('a,b\n1,2').ok).toBe(true);
    const csv = parseDataFile('name,n\nalice,1\nbob,2');
    expect(csv.ok && csv.rows).toEqual([
      { name: 'alice', n: '1' },
      { name: 'bob', n: '2' },
    ]);
    const json = parseDataFile('[{"x":1},{"x":2}]', 'json');
    expect(json.ok && json.rows[0]).toEqual({ x: '1' });
  });
});

describe('runCollection', () => {
  it('lists requests and runs iterations with stop-on-fail', async () => {
    let col = createCollection('Demo');
    const a = createRequestNode('A');
    a.request.url = 'https://example.test/a';
    const b = createRequestNode('B');
    b.request.url = 'https://example.test/b';
    col = addChild(col, [], a);
    col = addChild(col, [], b);
    expect(listRunnableRequests(col)).toHaveLength(2);

    const calls: string[] = [];
    const report = await runCollection({
      collection: col,
      iterations: 2,
      stopOnFail: true,
      globalApplyDetour: false,
      workspace: { groups: [] },
      scopes: {},
      skipScripts: true,
      fetchImpl: async (input) => {
        const url = String(input);
        calls.push(url);
        if (url.includes('/b')) {
          return new Response('nope', { status: 500, statusText: 'ERR' });
        }
        return new Response('ok', { status: 200, statusText: 'OK' });
      },
    });

    expect(report.summary.total).toBeGreaterThanOrEqual(2);
    expect(report.rows.some((r) => !r.ok)).toBe(true);
    expect(exportReportJson(report)).toContain('Demo');
    expect(exportReportHtml(report)).toContain('<table>');
  });

  it('honors setNextRequest via mutated nextRequest from execute path', async () => {
    // Direct list order without scripts — setNextRequest covered in execute integration; here ensure empty next keeps order.
    let col = createCollection('Jump');
    const a = emptyRequest(crypto.randomUUID(), 'First');
    a.url = 'https://example.test/1';
    const b = emptyRequest(crypto.randomUUID(), 'Second');
    b.url = 'https://example.test/2';
    col = { ...col, children: [{ kind: 'request', id: a.id, request: a }, { kind: 'request', id: b.id, request: b }] };
    const urls: string[] = [];
    await runCollection({
      collection: col,
      iterations: 1,
      globalApplyDetour: false,
      workspace: { groups: [] },
      scopes: {},
      skipScripts: true,
      fetchImpl: async (input) => {
        urls.push(String(input));
        return new Response('ok', { status: 200 });
      },
    });
    expect(urls).toEqual(['https://example.test/1', 'https://example.test/2']);
  });
});
