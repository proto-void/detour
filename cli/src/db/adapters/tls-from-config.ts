/** Map host-hydrated config.tls into Node-style ssl options. */

export type NodeTlsOptions = {
  rejectUnauthorized: boolean;
  ca?: string | string[];
  cert?: string;
  key?: string;
  passphrase?: string;
  servername?: string;
  minVersion?: string;
};

export function sslFromConfig(config: Record<string, unknown>): NodeTlsOptions | undefined {
  const tls = config.tls as Record<string, unknown> | undefined;
  const enabled =
    (tls && tls.enabled !== false && String(tls.mode ?? 'disable') !== 'disable') ||
    config.tlsEnabled === true;
  if (!enabled) return undefined;

  const rejectUnauthorized =
    tls?.rejectUnauthorized !== false && config.tlsRejectUnauthorized !== false;

  const out: NodeTlsOptions = { rejectUnauthorized };
  if (tls?.ca) out.ca = Array.isArray(tls.ca) ? (tls.ca as string[]) : String(tls.ca);
  if (tls?.cert) out.cert = String(tls.cert);
  if (tls?.key) out.key = String(tls.key);
  if (tls?.keyPassphrase) out.passphrase = String(tls.keyPassphrase);
  if (tls?.servername) out.servername = String(tls.servername);
  if (tls?.minVersion) out.minVersion = String(tls.minVersion);
  return out;
}

export function driverPropertiesMap(config: Record<string, unknown>): Record<string, string> {
  const props = config.driverProperties;
  const out: Record<string, string> = {};
  if (Array.isArray(props)) {
    for (const p of props) {
      if (p && typeof p === 'object' && 'key' in p) {
        const row = p as { key: string; value: string };
        if (row.key) out[row.key] = String(row.value ?? '');
      }
    }
  }
  const eo = config.engineOptions;
  if (eo && typeof eo === 'object') {
    for (const [k, v] of Object.entries(eo as Record<string, unknown>)) {
      if (v !== undefined && v !== null && v !== '') out[k] = String(v);
    }
  }
  return out;
}
