import { sslFromConfig, driverPropertiesMap } from './tls-from-config.ts';

export type EsAuthMethod = 'none' | 'basic' | 'apiKey' | 'bearer' | 'aws-sigv4';

export type ElasticsearchConnectionInput = {
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  cloudId?: string;
  authMethod?: EsAuthMethod;
  apiKey?: string;
  bearer?: string;
  region?: string;
  tls?: Record<string, unknown>;
  tlsEnabled?: boolean;
  tlsRejectUnauthorized?: boolean;
  engineOptions?: Record<string, unknown>;
  driverProperties?: Array<{ key: string; value: string }>;
  /** elasticsearch | opensearch */
  flavor?: 'elasticsearch' | 'opensearch';
};

export type BuiltElasticsearchOptions = {
  node?: string;
  cloud?: { id: string };
  auth?: Record<string, unknown>;
  tls?: ReturnType<typeof sslFromConfig>;
  authMethod: EsAuthMethod;
  awsSigV4?: { region: string };
  extra: Record<string, string>;
};

export function buildElasticsearchOptions(
  input: ElasticsearchConnectionInput,
): BuiltElasticsearchOptions {
  const eo = input.engineOptions ?? {};
  const auth = (input.authMethod ?? eo.authMethod ?? (input.username ? 'basic' : 'none')) as EsAuthMethod;
  const extra = driverPropertiesMap({
    driverProperties: input.driverProperties,
    engineOptions: eo,
  });
  const out: BuiltElasticsearchOptions = {
    authMethod: auth,
    tls: sslFromConfig(input as Record<string, unknown>),
    extra,
  };

  const cloudId = input.cloudId ?? eo.cloudId;
  if (cloudId) {
    out.cloud = { id: String(cloudId) };
  } else {
    const host = input.host ?? '127.0.0.1';
    const port = input.port ?? 9200;
    const proto = input.tlsEnabled || input.tls ? 'https' : 'http';
    out.node = `${proto}://${host}:${port}`;
  }

  if (auth === 'basic' && input.username) {
    out.auth = { username: input.username, password: input.password ?? '' };
  } else if (auth === 'apiKey') {
    out.auth = { apiKey: input.apiKey ?? eo.apiKey ?? input.password };
  } else if (auth === 'bearer') {
    out.auth = { bearer: input.bearer ?? eo.bearer ?? input.password };
  } else if (auth === 'aws-sigv4') {
    const region = String(input.region ?? eo.region ?? '');
    if (!region) throw new Error('OpenSearch AWS SigV4 requires a region.');
    out.awsSigV4 = { region };
  }

  return out;
}
