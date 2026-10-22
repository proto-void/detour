import { describe, expect, it } from 'vitest';
import { bridgeDownMessage, bridgeFileUrl, encodeBridgePath, isSafeRelative, serveLocalCompileMessage } from './paths';

const TOKEN = 'ab'.repeat(32);

describe('isSafeRelative', () => {
  it('accepts a nested file and rejects escapes', () => {
    expect(isSafeRelative('assets/app.js')).toBe(true);
    for (const bad of ['', '/etc/passwd', '../secret', 'foo/../../secret', 'foo//bar', './app.js', 'a\\b', 'C:/windows']) {
      expect(isSafeRelative(bad)).toBe(false);
    }
  });
});

describe('encodeBridgePath', () => {
  it('matches the CLI vector for assets/app.js', () => {
    expect(encodeBridgePath('assets/app.js')).toBe('YXNzZXRzL2FwcC5qcw');
  });
});

describe('bridgeFileUrl', () => {
  it('builds an opaque loopback URL and refuses a bad token or path', () => {
    expect(bridgeFileUrl({ port: 47321, token: TOKEN }, 'assets/app.js')).toBe(`http://127.0.0.1:47321/d/${TOKEN}/YXNzZXRzL2FwcC5qcw`);
    expect(bridgeFileUrl({ port: 47321, token: 'short' }, 'assets/app.js')).toBeUndefined();
    expect(bridgeFileUrl({ port: 47321, token: TOKEN }, '../secret')).toBeUndefined();
    expect(bridgeFileUrl({ port: 0, token: TOKEN }, 'app.js')).toBeUndefined();
  });
});

describe('refusal text', () => {
  it('does not repeat the token', () => {
    const url = bridgeFileUrl({ port: 47321, token: TOKEN }, 'app.js')!;
    expect(serveLocalCompileMessage('redirect-loop', `Redirect target "${url}" matches`)).not.toContain(TOKEN);
    expect(serveLocalCompileMessage('invalid-redirect', `Redirect target "${url}" must be an absolute URL`)).not.toContain(TOKEN);
    expect(bridgeDownMessage(47321)).not.toContain(TOKEN);
  });
});
