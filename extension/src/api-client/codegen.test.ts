import { describe, expect, it } from 'vitest';
import { emptyRequest } from './model';
import { CODEGEN_TARGETS, generateCode } from './codegen';

describe('codegen', () => {
  const req = emptyRequest('1', 'List');
  req.method = 'POST';
  req.url = 'https://api.example.com/items';
  req.headers = [{ id: '1', key: 'X-Trace', value: '1', enabled: true }];
  req.body = { mode: 'raw', text: '{"a":1}', language: 'json' };

  it('emits every target with the URL', () => {
    for (const target of CODEGEN_TARGETS) {
      const code = generateCode(req, target);
      expect(code).toContain('api.example.com');
      expect(code.length).toBeGreaterThan(10);
    }
  });

  it('fetch snippet includes method and body', () => {
    const code = generateCode(req, 'fetch');
    expect(code).toContain("method: 'POST'");
    expect(code).toContain('\\"a\\":1');
  });
});
