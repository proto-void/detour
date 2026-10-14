import { describe, expect, it } from 'vitest';
import { emptyRequest, newKvRow } from './model';
import { prepareHttp } from './prepare';

describe('prepareHttp', () => {
  it('resolves URL params headers and bearer auth', () => {
    const req = emptyRequest('1');
    req.method = 'GET';
    req.url = 'https://{{host}}/items';
    req.params = [newKvRow('p', 'q', '{{q}}')];
    req.headers = [newKvRow('h', 'X-Trace', '{{trace}}')];
    req.auth = { type: 'bearer', token: '{{token}}' };
    const prepared = prepareHttp(req, {
      environment: [
        { id: '1', key: 'host', initialValue: 'api.example.com', currentValue: 'api.example.com', secret: false, encrypted: null },
        { id: '2', key: 'q', initialValue: '1', currentValue: '1', secret: false, encrypted: null },
        { id: '3', key: 'trace', initialValue: 'abc', currentValue: 'abc', secret: false, encrypted: null },
        { id: '4', key: 'token', initialValue: 'tok', currentValue: 'tok', secret: false, encrypted: null },
      ],
    });
    expect(prepared.url).toBe('https://api.example.com/items?q=1');
    expect(prepared.headers['X-Trace']).toBe('abc');
    expect(prepared.headers.Authorization).toBe('Bearer tok');
    expect(prepared.body).toBeNull();
  });

  it('encodes raw JSON body', () => {
    const req = emptyRequest('1');
    req.method = 'POST';
    req.url = 'https://api.example.com/a';
    req.body = { mode: 'raw', text: '{"a":{{n}}}', language: 'json' };
    const prepared = prepareHttp(req, {
      environment: [{ id: '1', key: 'n', initialValue: '2', currentValue: '2', secret: false, encrypted: null }],
    });
    expect(prepared.body).toBe('{"a":2}');
    expect(prepared.headers['Content-Type']).toBe('application/json');
  });
});
