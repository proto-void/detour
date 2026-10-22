import { describe, expect, it } from 'vitest';
import { exportPostmanCollection, importPostmanCollection } from './postman';

const id = (() => {
  let n = 0;
  return () => `id${++n}`;
})();

describe('postman v2.1', () => {
  it('imports a collection with folder and request', () => {
    const raw = {
      info: {
        name: 'Demo',
        schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
      },
      item: [
        {
          name: 'Users',
          item: [
            {
              name: 'List',
              request: {
                method: 'GET',
                header: [{ key: 'Accept', value: 'application/json' }],
                url: { raw: 'https://api.example.com/users', query: [{ key: 'limit', value: '10' }] },
              },
            },
          ],
        },
      ],
      variable: [{ key: 'base', value: 'https://api.example.com' }],
    };
    const result = importPostmanCollection(raw, id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.collection.name).toBe('Demo');
    expect(result.collection.children[0]?.kind).toBe('folder');
    const folder = result.collection.children[0]!;
    if (folder.kind !== 'folder') return;
    expect(folder.children[0]?.kind).toBe('request');
    if (folder.children[0]?.kind !== 'request') return;
    expect(folder.children[0].request.method).toBe('GET');
    expect(folder.children[0].request.params[0]?.key).toBe('limit');
  });

  it('round-trips export → import', () => {
    const imported = importPostmanCollection(
      {
        info: { name: 'Round', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
        item: [
          {
            name: 'Create',
            request: {
              method: 'POST',
              header: [{ key: 'Content-Type', value: 'application/json' }],
              url: 'https://api.example.com/items',
              body: { mode: 'raw', raw: '{"a":1}', options: { raw: { language: 'json' } } },
              auth: { type: 'bearer', bearer: [{ key: 'token', value: 'abc' }] },
            },
            event: [{ listen: 'test', script: { exec: ['pm.test("ok", function(){});'] } }],
          },
        ],
      },
      id,
    );
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    const exported = exportPostmanCollection(imported.collection);
    const again = importPostmanCollection(exported, id);
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    const reqNode = again.collection.children[0];
    expect(reqNode?.kind).toBe('request');
    if (reqNode?.kind !== 'request') return;
    expect(reqNode.request.method).toBe('POST');
    expect(reqNode.request.auth).toEqual({ type: 'bearer', token: 'abc' });
    expect(reqNode.request.testScript).toContain('pm.test');
  });
});
