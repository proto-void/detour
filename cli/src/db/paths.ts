import { homedir } from 'node:os';
import { readFile, access, constants } from 'node:fs/promises';
import { resolve, normalize } from 'node:path';
import { loadJavaKeyStore, loadJavaTrustStore } from './java-store.ts';

/** Expand leading `~` / `~/` to the user home directory. */
export function expandHome(path: string): string {
  const trimmed = path.trim();
  if (trimmed === '~') return homedir();
  if (trimmed.startsWith('~/') || trimmed.startsWith('~\\')) {
    return resolve(homedir(), trimmed.slice(2));
  }
  return trimmed;
}

/** Resolve to an absolute path after expanding `~`. */
export function resolvePath(path: string): string {
  return normalize(resolve(expandHome(path)));
}

export async function assertReadable(path: string, label = 'File'): Promise<string> {
  const abs = resolvePath(path);
  try {
    await access(abs, constants.R_OK);
  } catch {
    throw new Error(`${label} not found or unreadable: ${abs}`);
  }
  return abs;
}

/** Read a file as UTF-8 after expanding `~`. Clear error if missing. */
export async function readPathText(path: string, label = 'File'): Promise<string> {
  const abs = await assertReadable(path, label);
  return readFile(abs, 'utf8');
}

/** Read a file as Buffer after expanding `~`. */
export async function readPathBuffer(path: string, label = 'File'): Promise<Buffer> {
  const abs = await assertReadable(path, label);
  return readFile(abs);
}

/**
 * Resolve optional TLS file paths from a config.tls object into ca/cert/key strings
 * for Node TLS options. Mutates nothing; returns a new object.
 */
export async function resolveTlsFiles(tls: Record<string, unknown> | undefined): Promise<{
  ca?: string;
  cert?: string;
  key?: string;
  rejectUnauthorized: boolean;
  servername?: string;
  minVersion?: string;
  enabled: boolean;
}> {
  if (!tls) return { enabled: false, rejectUnauthorized: true };
  const mode = String(tls.mode ?? (tls.enabled ? 'required' : 'disable'));
  const enabled = mode !== 'disable' && tls.enabled !== false;
  if (!enabled && mode === 'disable') {
    return { enabled: false, rejectUnauthorized: true };
  }
  const rejectUnauthorized =
    tls.rejectUnauthorized !== false && (mode === 'verify-ca' || mode === 'verify-full' || mode === 'required'
      ? mode !== 'required' || tls.rejectUnauthorized !== false
      : tls.rejectUnauthorized !== false);

  const out: {
    ca?: string;
    cert?: string;
    key?: string;
    rejectUnauthorized: boolean;
    servername?: string;
    minVersion?: string;
    enabled: boolean;
  } = {
    enabled: mode !== 'disable',
    rejectUnauthorized:
      mode === 'verify-ca' || mode === 'verify-full'
        ? true
        : mode === 'required' || mode === 'preferred' || mode === 'allow'
          ? tls.rejectUnauthorized !== false
          : true,
  };

  // Precedence: Java truststore overrides caPath; Java keystore overrides certPath/keyPath.
  const trustStorePath = typeof tls.trustStorePath === 'string' ? tls.trustStorePath.trim() : '';
  const keyStorePath = typeof tls.keyStorePath === 'string' ? tls.keyStorePath.trim() : '';
  const trustPass = String(tls.trustStorePassword ?? tls.trustStorePass ?? '');
  const keyPass = String(tls.keyStorePassword ?? tls.keyStorePass ?? '');

  if (trustStorePath) {
    out.ca = await loadJavaTrustStore(trustStorePath, trustPass);
  } else if (tls.caPath) {
    out.ca = await readPathText(String(tls.caPath), 'CA certificate');
  } else if (typeof tls.ca === 'string') {
    out.ca = tls.ca;
  }

  if (keyStorePath) {
    const id = await loadJavaKeyStore(keyStorePath, keyPass);
    out.cert = id.cert;
    out.key = id.key;
  } else {
    if (tls.certPath) out.cert = await readPathText(String(tls.certPath), 'Client certificate');
    else if (typeof tls.cert === 'string') out.cert = tls.cert;
    if (tls.keyPath) out.key = await readPathText(String(tls.keyPath), 'Client key');
    else if (typeof tls.key === 'string') out.key = tls.key;
  }

  if (tls.serverName) out.servername = String(tls.serverName);
  if (tls.minVersion) out.minVersion = String(tls.minVersion);
  if (tls.rejectUnauthorized === false) out.rejectUnauthorized = false;

  // TablePlus-style: do not IncompletePair-gate cert-only / key-only. Pass
  // whatever material is present; the driver/server errors if a full pair is required.
  return out;
}
