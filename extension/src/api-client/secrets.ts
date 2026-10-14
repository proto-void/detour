/** Passphrase encryption for environment secret values (WebCrypto AES-GCM). */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function deriveKey(passphrase: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function b64(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(text: string): Uint8Array {
  const bin = atob(text);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export interface EncryptedSecret {
  v: 1;
  salt: string;
  iv: string;
  ciphertext: string;
}

export async function encryptSecret(plaintext: string, passphrase: string): Promise<EncryptedSecret> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(plaintext));
  return { v: 1, salt: b64(salt), iv: b64(iv), ciphertext: b64(ciphertext) };
}

export async function decryptSecret(payload: EncryptedSecret, passphrase: string): Promise<string> {
  const salt = fromB64(payload.salt) as Uint8Array<ArrayBuffer>;
  const iv = fromB64(payload.iv) as Uint8Array<ArrayBuffer>;
  const key = await deriveKey(passphrase, salt);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, fromB64(payload.ciphertext) as Uint8Array<ArrayBuffer>);
  return decoder.decode(plain);
}

/** Mask for UI display — never logs the real value. */
export function maskSecret(value: string): string {
  if (value === '') return '';
  return '•'.repeat(Math.min(12, Math.max(4, value.length)));
}
