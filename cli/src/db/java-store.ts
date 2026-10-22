/**
 * Load Java truststore / keystore (JKS or PKCS12) into PEM material for Node TLS.
 * Passwords stay in caller (keychain); never log them.
 */
import { createRequire } from 'node:module';
import { readPathBuffer } from './paths.ts';

const require = createRequire(import.meta.url);

type JksPemEntry =
  | { ca: string }
  | { cert: string; key: string };

type Pkcs12Bag = {
  type?: string;
  attributes?: { friendlyName?: string[]; localKeyId?: unknown };
  cert?: { /* forge cert */ };
  key?: { /* forge key */ };
  asn1?: unknown;
};

type JksJs = {
  toPem: (buf: Buffer, password: string, pemPassword?: string) => Record<string, JksPemEntry>;
  parsePkcs12?: (buf: Buffer, password: string) => Pkcs12Bag[];
};

function loadJksJs(): JksJs {
  try {
    return require('jks-js') as JksJs;
  } catch {
    throw new Error(
      'jks-js is required to read Java truststore/keystore files. From the repo root run: corepack pnpm --filter @detour/cli add jks-js',
    );
  }
}

function friendlyStoreError(kind: 'truststore' | 'keystore', password: string, e: unknown): Error {
  const raw = e instanceof Error ? e.message : String(e);
  const lower = raw.toLowerCase();
  const emptyHint =
    !password ? ' (no store password provided — re-enter the Java store password)' : '';
  if (
    lower.includes('password') ||
    lower.includes('mac') ||
    lower.includes('digest') ||
    lower.includes('decrypt')
  ) {
    return new Error(`${kind}: wrong password or unsupported store encryption${emptyHint}: ${raw}`);
  }
  if (lower.includes('magic') || lower.includes('format') || lower.includes('parse')) {
    return new Error(
      `${kind}: unsupported or unreadable format (need JKS or PKCS12)${emptyHint}: ${raw}`,
    );
  }
  return new Error(`${kind}: ${raw}${emptyHint}`);
}

/** Detect PKCS12 by ASN.1 SEQUENCE tag (same hint jks-js probe uses). */
function looksLikePkcs12(buf: Buffer): boolean {
  return buf.length > 0 && buf[0] === 0x30;
}

/**
 * jks-js toPem crashes when PKCS12 bags lack friendlyName (common for openssl/keytool exports).
 * Rebuild PEM entries from parsePkcs12 bags when needed.
 */
function pemFromPkcs12Bags(bags: Pkcs12Bag[]): Record<string, JksPemEntry> {
  // Resolve node-forge via jks-js (transitive); avoid relying on a direct dep.
  const forgeReq = createRequire(require.resolve('jks-js'));
  const forge = forgeReq('node-forge') as {
    pki: {
      oids: { certBag: string };
      certificateToPem: (c: unknown) => string;
      privateKeyToPem: (k: unknown) => string;
    };
  };
  const certBagOid = forge.pki.oids.certBag;
  let cert = '';
  let key = '';
  const cas: string[] = [];
  let i = 0;
  for (const bag of bags) {
    const alias = bag.attributes?.friendlyName?.[0] ?? `entry-${i++}`;
    const hasLocalKeyId = Boolean(bag.attributes?.localKeyId);
    if (bag.type === certBagOid && bag.cert) {
      const pem = forge.pki.certificateToPem(bag.cert).replace(/\r\n/g, '\n');
      if (hasLocalKeyId) cert = cert ? `${cert}\n${pem}` : pem;
      else cas.push(pem);
    }
    if (bag.key) {
      key = forge.pki.privateKeyToPem(bag.key).replace(/\r\n/g, '\n');
    }
    void alias;
  }
  const out: Record<string, JksPemEntry> = {};
  if (cert && key) out.client = { cert, key };
  cas.forEach((ca, idx) => {
    out[`ca-${idx}`] = { ca };
  });
  return out;
}

function toPemEntries(buf: Buffer, password: string): Record<string, JksPemEntry> {
  const jks = loadJksJs();
  try {
    return jks.toPem(buf, password, password);
  } catch (e) {
    if (looksLikePkcs12(buf) && typeof jks.parsePkcs12 === 'function') {
      try {
        const bags = jks.parsePkcs12(buf, password);
        return pemFromPkcs12Bags(bags);
      } catch (e2) {
        throw e2 instanceof Error ? e2 : e;
      }
    }
    throw e;
  }
}

/** Extract CA PEM bundle from a truststore (and trusted certs from any key entries). */
export async function loadJavaTrustStore(path: string, password: string): Promise<string> {
  const buf = await readPathBuffer(path, 'Truststore');
  let entries: Record<string, JksPemEntry>;
  try {
    entries = toPemEntries(buf, password ?? '');
  } catch (e) {
    throw friendlyStoreError('truststore', password ?? '', e);
  }
  const cas: string[] = [];
  for (const entry of Object.values(entries)) {
    if ('ca' in entry && entry.ca) cas.push(entry.ca);
    else if ('cert' in entry && entry.cert) cas.push(entry.cert);
  }
  if (cas.length === 0) throw new Error('truststore contains no certificates');
  return cas.join('\n');
}

/** Extract first private-key entry as PEM cert + key from a keystore. */
export async function loadJavaKeyStore(
  path: string,
  password: string,
): Promise<{ cert: string; key: string }> {
  const buf = await readPathBuffer(path, 'Keystore');
  let entries: Record<string, JksPemEntry>;
  try {
    entries = toPemEntries(buf, password ?? '');
  } catch (e) {
    throw friendlyStoreError('keystore', password ?? '', e);
  }
  for (const entry of Object.values(entries)) {
    if ('key' in entry && entry.key && 'cert' in entry && entry.cert) {
      return { cert: entry.cert, key: entry.key };
    }
  }
  throw new Error('keystore contains no private-key entry');
}
