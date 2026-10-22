import { describe, expect, it } from 'vitest';
import { cookieHeaderForUrl } from './cookie-jar';

describe('cookie-jar', () => {
  it('builds Cookie header for matching domain', () => {
    const header = cookieHeaderForUrl(
      [
        { domain: 'example.com', name: 'a', value: '1', path: '/' },
        { domain: 'other.test', name: 'b', value: '2', path: '/' },
      ],
      'https://www.example.com/path',
    );
    expect(header).toBe('a=1');
  });
});
