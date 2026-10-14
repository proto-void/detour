import { describe, expect, it } from 'vitest';
import { importHar } from './har';

describe('importHar', () => {
  it('imports entries', () => {
    const har = {
      log: {
        entries: [
          {
            request: {
              method: 'GET',
              url: 'https://example.com/a',
              headers: [{ name: 'Accept', value: 'application/json' }],
              queryString: [],
            },
          },
          {
            request: {
              method: 'POST',
              url: 'https://example.com/b',
              headers: [],
              postData: { mimeType: 'application/json', text: '{"x":1}' },
            },
          },
        ],
      },
    };
    const result = importHar(JSON.stringify(har));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.collection.children).toHaveLength(2);
  });
});
