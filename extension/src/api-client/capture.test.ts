import { describe, expect, it } from 'vitest';
import { capturedToApiRequest } from './capture';

describe('capture', () => {
  it('maps captured HTTP into ApiRequest', () => {
    const req = capturedToApiRequest({
      method: 'POST',
      url: 'https://api.example.com/x',
      headers: [{ name: 'Content-Type', value: 'application/json' }],
      body: '{"a":1}',
    });
    expect(req.method).toBe('POST');
    expect(req.url).toContain('api.example.com');
    expect(req.body?.mode === 'raw' && req.body.text).toBe('{"a":1}');
  });
});
