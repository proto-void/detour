import { driverPropertiesMap } from './tls-from-config.ts';

export type MssqlAuthMethod =
  | 'sql'
  | 'ntlm'
  | 'kerberos'
  | 'entra-password'
  | 'entra-interactive'
  | 'entra-device-code'
  | 'entra-service-principal'
  | 'entra-managed-identity'
  | 'entra-default';

export type MssqlConnectionInput = {
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  database?: string;
  encrypt?: 'mandatory' | 'optional' | 'strict' | boolean;
  trustServerCertificate?: boolean;
  hostNameInCertificate?: string;
  applicationIntent?: string;
  multiSubnetFailover?: boolean;
  packetSize?: number;
  appName?: string;
  workstationId?: string;
  alwaysEncrypted?: boolean;
  domain?: string;
  authMethod?: MssqlAuthMethod;
  tls?: Record<string, unknown>;
  tlsEnabled?: boolean;
  engineOptions?: Record<string, unknown>;
  driverProperties?: Array<{ key: string; value: string }>;
};

export type BuiltMssqlOptions = {
  server: string;
  options: Record<string, unknown>;
  authentication?: Record<string, unknown>;
  authMethod: MssqlAuthMethod;
  /** Entra interactive needs @azure/identity at connect time. */
  needsEntraInteractive?: boolean;
  extra: Record<string, string>;
};

export function buildMssqlOptions(input: MssqlConnectionInput): BuiltMssqlOptions {
  const eo = input.engineOptions ?? {};
  const auth = input.authMethod ?? (eo.authMethod as MssqlAuthMethod) ?? 'sql';
  const extra = driverPropertiesMap({
    driverProperties: input.driverProperties,
    engineOptions: eo,
  });

  const host = input.host ?? '127.0.0.1';
  const port = input.port ?? 1433;
  const encryptRaw = input.encrypt ?? eo.encrypt ?? (input.tlsEnabled || input.tls ? 'mandatory' : false);
  const encrypt =
    encryptRaw === 'mandatory' || encryptRaw === true
      ? true
      : encryptRaw === 'strict'
        ? true
        : encryptRaw === 'optional'
          ? false
          : Boolean(encryptRaw);

  const options: Record<string, unknown> = {
    port,
    database: input.database ?? 'master',
    encrypt,
    trustServerCertificate:
      input.trustServerCertificate === true ||
      eo.trustServerCertificate === true ||
      (input.tls as { rejectUnauthorized?: boolean } | undefined)?.rejectUnauthorized === false,
    appName: input.appName ?? eo.appName ?? 'detour',
    connectTimeout: 15_000,
  };
  if (input.hostNameInCertificate || eo.hostNameInCertificate) {
    options.hostNameInCertificate = input.hostNameInCertificate ?? eo.hostNameInCertificate;
  }
  if (input.applicationIntent || eo.applicationIntent) {
    options.readOnlyIntent = String(input.applicationIntent ?? eo.applicationIntent).toLowerCase() === 'readonly';
  }
  if (input.multiSubnetFailover || eo.multiSubnetFailover) options.multiSubnetFailover = true;
  if (input.packetSize || eo.packetSize) options.packetSize = Number(input.packetSize ?? eo.packetSize);
  if (input.workstationId || eo.workstationId) options.workstationId = input.workstationId ?? eo.workstationId;
  if (input.alwaysEncrypted || eo.alwaysEncrypted) options.useColumnEncryption = true;

  const out: BuiltMssqlOptions = {
    server: host.includes('\\') ? host : host,
    options,
    authMethod: auth,
    extra,
  };

  if (auth === 'sql') {
    out.authentication = {
      type: 'default',
      options: { userName: input.username, password: input.password },
    };
  } else if (auth === 'ntlm') {
    out.authentication = {
      type: 'ntlm',
      options: {
        domain: input.domain ?? eo.domain ?? '',
        userName: input.username,
        password: input.password,
      },
    };
  } else if (auth.startsWith('entra-')) {
    out.needsEntraInteractive = auth === 'entra-interactive';
    out.authentication = {
      type: 'azure-active-directory-default',
      options: {},
    };
    out.extra['detour.entra'] = auth;
  } else if (auth === 'kerberos') {
    out.extra['detour.auth'] = 'kerberos';
  }

  return out;
}
