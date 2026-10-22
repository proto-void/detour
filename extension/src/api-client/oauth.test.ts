import { describe, expect, it } from 'vitest';
import { buildAuthorizeUrl, needsRefresh, parseCodeFromRedirect } from './oauth';

describe('oauth helpers', () => {
  it('builds authorize URL with PKCE', () => {
    const url = buildAuthorizeUrl(
      {
        grant: 'authorization_code',
        authorizeUrl: 'https://auth.example/authorize',
        tokenUrl: 'https://auth.example/token',
        clientId: 'cid',
        redirectUri: 'https://ext/cb',
        scope: 'openid',
      },
      { challenge: 'chal', method: 'S256' },
      'st',
    );
    expect(url).toContain('code_challenge=chal');
    expect(url).toContain('state=st');
    expect(url).toContain('client_id=cid');
  });

  it('parses code from redirect', () => {
    expect(parseCodeFromRedirect('https://ext/cb?code=abc&state=s')).toEqual({ code: 'abc', state: 's', error: undefined });
  });

  it('needsRefresh respects skew', () => {
    expect(needsRefresh({ accessToken: 'a', tokenType: 'Bearer', raw: {}, expiresAt: Date.now() + 120_000 })).toBe(false);
    expect(needsRefresh({ accessToken: 'a', tokenType: 'Bearer', raw: {}, expiresAt: Date.now() + 10_000 })).toBe(true);
  });
});
