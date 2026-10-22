import { sslFromConfig, driverPropertiesMap } from './tls-from-config.ts';

export type MongoAuthMechanism =
  | 'SCRAM-SHA-256'
  | 'SCRAM-SHA-1'
  | 'MONGODB-X509'
  | 'PLAIN'
  | 'GSSAPI'
  | 'MONGODB-AWS'
  | 'MONGODB-OIDC';

export type MongoConnectionInput = {
  uri?: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  database?: string;
  authSource?: string;
  authMechanism?: MongoAuthMechanism;
  replicaSet?: string;
  directConnection?: boolean;
  tlsEnabled?: boolean;
  tlsRejectUnauthorized?: boolean;
  tls?: Record<string, unknown>;
  engineOptions?: Record<string, unknown>;
  driverProperties?: Array<{ key: string; value: string }>;
};

export type BuiltMongoOptions = {
  uri?: string;
  options: Record<string, unknown>;
  authMechanism: MongoAuthMechanism;
  /** GSSAPI needs native kerberos module. */
  needsKerberos?: boolean;
  extra: Record<string, string>;
};

export function buildMongoOptions(input: MongoConnectionInput): BuiltMongoOptions {
  const eo = input.engineOptions ?? {};
  const auth =
    (input.authMechanism as MongoAuthMechanism) ??
    (eo.authMechanism as MongoAuthMechanism) ??
    'SCRAM-SHA-256';
  const extra = driverPropertiesMap({
    driverProperties: input.driverProperties,
    engineOptions: eo,
  });
  const ssl = sslFromConfig(input as Record<string, unknown>);

  const options: Record<string, unknown> = {
    authSource: input.authSource ?? eo.authSource ?? input.database ?? 'admin',
  };
  if (input.username) {
    options.auth = { username: input.username, password: input.password };
  }
  if (auth) options.authMechanism = auth;
  if (input.replicaSet || eo.replicaSet) options.replicaSet = input.replicaSet ?? eo.replicaSet;
  if (input.directConnection || eo.directConnection) options.directConnection = true;
  if (ssl) {
    options.tls = true;
    options.tlsAllowInvalidCertificates = !ssl.rejectUnauthorized;
    if (ssl.ca) options.tlsCAFile = undefined; // content injected via secureContext when host sets buffers
    options.ca = ssl.ca;
    options.cert = ssl.cert;
    options.key = ssl.key;
  }
  if (eo.appName || extra.appName) options.appName = eo.appName ?? extra.appName;
  if (eo.compressors) options.compressors = eo.compressors;
  if (eo.retryWrites !== undefined) options.retryWrites = eo.retryWrites !== false;

  let uri = input.uri;
  if (!uri) {
    const host = input.host ?? '127.0.0.1';
    const port = input.port ?? 27017;
    uri = `mongodb://${host}:${port}`;
  }

  return {
    uri,
    options,
    authMechanism: auth,
    needsKerberos: auth === 'GSSAPI',
    extra,
  };
}
