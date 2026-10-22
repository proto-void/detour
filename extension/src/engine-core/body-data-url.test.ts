import { describe, expect, it } from 'vitest';
import { bodyDataUrl, summarizeDataUrl } from './body-data-url';

describe('summarizeDataUrl', () => {
  it('shortens a body-redirect data: URL to mime and byte count', () => {
    const url = bodyDataUrl('{"ok":true}', 'https://cdn.example.com/switch.json');
    expect(summarizeDataUrl(url)).toBe('data:application/json (11 bytes)');
  });

  it('leaves non-data URLs alone', () => {
    expect(summarizeDataUrl('http://localhost/a.js')).toBe('http://localhost/a.js');
  });
});
