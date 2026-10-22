import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret, maskSecret } from './secrets';

describe('secrets', () => {
  it('round-trips passphrase encryption', async () => {
    const payload = await encryptSecret('super-secret', 'passphrase');
    expect(payload.v).toBe(1);
    expect(await decryptSecret(payload, 'passphrase')).toBe('super-secret');
  });

  it('fails with the wrong passphrase', async () => {
    const payload = await encryptSecret('super-secret', 'passphrase');
    await expect(decryptSecret(payload, 'wrong')).rejects.toThrow();
  });

  it('masks values for UI', () => {
    expect(maskSecret('abcdef')).toMatch(/^•+$/);
    expect(maskSecret('')).toBe('');
  });
});
