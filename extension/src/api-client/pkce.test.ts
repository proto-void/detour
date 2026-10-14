import { describe, expect, it } from 'vitest';
import { challengeS256, createPkcePair, randomVerifier } from './pkce';

describe('pkce', () => {
  it('creates S256 challenge for a verifier', async () => {
    const verifier = randomVerifier(43);
    expect(verifier.length).toBeGreaterThan(20);
    const challenge = await challengeS256(verifier);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(challenge).not.toContain('=');
  });

  it('createPkcePair returns method S256', async () => {
    const pair = await createPkcePair();
    expect(pair.method).toBe('S256');
    expect(pair.challenge).toBe(await challengeS256(pair.verifier));
  });
});
