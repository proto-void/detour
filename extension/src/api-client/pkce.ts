/** OAuth 2.0 PKCE helpers (S256) — Web Crypto, no backend. */

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function randomVerifier(length = 64): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return b64url(bytes);
}

export async function challengeS256(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return b64url(digest);
}

export async function createPkcePair(): Promise<{ verifier: string; challenge: string; method: 'S256' }> {
  const verifier = randomVerifier();
  const challenge = await challengeS256(verifier);
  return { verifier, challenge, method: 'S256' };
}
