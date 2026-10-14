import { describe, expect, it } from 'vitest';
import { highlightUrl } from './url-highlight';

describe('highlightUrl', () => {
  it('splits text and resolved vars', () => {
    const segments = highlightUrl('https://{{host}}/v1/{{path}}', {
      environment: [{ id: '1', key: 'host', initialValue: 'api.test', currentValue: 'api.test', secret: false, encrypted: null }],
    });
    expect(segments).toEqual([
      { kind: 'text', text: 'https://' },
      { kind: 'var', text: '{{host}}', key: 'host', value: 'api.test', resolved: true },
      { kind: 'text', text: '/v1/' },
      { kind: 'var', text: '{{path}}', key: 'path', value: undefined, resolved: false },
    ]);
  });

  it('returns plain text when there are no vars', () => {
    expect(highlightUrl('https://example.com', {})).toEqual([{ kind: 'text', text: 'https://example.com' }]);
  });
});
