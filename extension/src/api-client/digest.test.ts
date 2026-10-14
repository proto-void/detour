import { describe, expect, it } from 'vitest';
import { _md5ForTests, buildDigestAuthorization, parseDigestChallenge } from './digest';

describe('digest', () => {
  it('parses WWW-Authenticate', () => {
    const c = parseDigestChallenge('Digest realm="me@ken", nonce="abc", algorithm=MD5, qop="auth"');
    expect(c).toMatchObject({ realm: 'me@ken', nonce: 'abc', algorithm: 'MD5', qop: 'auth' });
  });

  it('md5 matches known vector', () => {
    expect(_md5ForTests('')).toBe('d41d8cd98f00b204e9800998ecf8427e');
  });

  it('builds Authorization header', async () => {
    const c = parseDigestChallenge('Digest realm="test", nonce="n", qop="auth", algorithm=MD5')!;
    const header = await buildDigestAuthorization(c, { username: 'user', password: 'pass' }, 'GET', '/dir');
    expect(header).toMatch(/^Digest /);
    expect(header).toContain('username="user"');
    expect(header).toContain('response="');
  });
});
