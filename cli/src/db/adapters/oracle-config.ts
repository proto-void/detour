import { driverPropertiesMap } from './tls-from-config.ts';

export type OracleConnectionType = 'basic' | 'tns' | 'easy' | 'wallet';
export type OracleRole = 'default' | 'SYSDBA' | 'SYSOPER' | 'SYSBACKUP' | 'SYSDG' | 'SYSKM';

export type OracleConnectionInput = {
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  service?: string;
  sid?: string;
  connectionType?: OracleConnectionType;
  tnsAdmin?: string;
  tnsAlias?: string;
  walletPath?: string;
  walletPassword?: string;
  role?: OracleRole;
  thick?: boolean;
  instantClientPath?: string;
  engineOptions?: Record<string, unknown>;
  driverProperties?: Array<{ key: string; value: string }>;
};

export type BuiltOracleOptions = {
  user?: string;
  password?: string;
  connectString: string;
  privilege?: number | string;
  thick: boolean;
  instantClientPath?: string;
  /** Kerberos needs thick + Instant Client. */
  needsThickForKerberos?: boolean;
  extra: Record<string, string>;
};

export function buildOracleOptions(input: OracleConnectionInput): BuiltOracleOptions {
  const eo = input.engineOptions ?? {};
  const extra = driverPropertiesMap({
    driverProperties: input.driverProperties,
    engineOptions: eo,
  });
  const ctype = (input.connectionType ?? eo.connectionType ?? 'basic') as OracleConnectionType;
  const thick = input.thick === true || eo.thick === true;
  const role = (input.role ?? eo.role ?? 'default') as OracleRole;

  let connectString = '';
  if (ctype === 'tns') {
    connectString = String(input.tnsAlias ?? eo.tnsAlias ?? '');
    if (input.tnsAdmin || eo.tnsAdmin) {
      extra.TNS_ADMIN = String(input.tnsAdmin ?? eo.tnsAdmin);
    }
  } else if (ctype === 'wallet') {
    connectString = String(eo.connectString ?? input.service ?? '');
    extra.walletPath = String(input.walletPath ?? eo.walletPath ?? '');
    if (input.walletPassword) extra.walletPassword = input.walletPassword;
  } else if (ctype === 'easy') {
    connectString = String(eo.connectString ?? `${input.host}:${input.port ?? 1521}/${input.service ?? ''}`);
  } else {
    const host = input.host ?? '127.0.0.1';
    const port = input.port ?? 1521;
    const svc = input.service ?? eo.service ?? 'FREEPDB1';
    const sid = input.sid ?? eo.sid;
    connectString = sid
      ? `${host}:${port}/${sid}`
      : `${host}:${port}/${svc}`;
  }

  return {
    user: input.username,
    password: input.password,
    connectString,
    privilege: role === 'default' ? undefined : role,
    thick,
    instantClientPath: input.instantClientPath
      ? String(input.instantClientPath)
      : eo.instantClientPath
        ? String(eo.instantClientPath)
        : undefined,
    needsThickForKerberos: true,
    extra,
  };
}
