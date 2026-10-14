import { driverPropertiesMap } from './tls-from-config.ts';

export type DynamoAuthMethod =
  | 'default'
  | 'profile'
  | 'sso'
  | 'accessKey'
  | 'assumeRole';

export type DynamoConnectionInput = {
  region?: string;
  endpoint?: string;
  authMethod?: DynamoAuthMethod;
  profile?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
  roleArn?: string;
  externalId?: string;
  engineOptions?: Record<string, unknown>;
  driverProperties?: Array<{ key: string; value: string }>;
};

export type BuiltDynamoOptions = {
  region: string;
  endpoint?: string;
  credentials?: Record<string, string>;
  profile?: string;
  authMethod: DynamoAuthMethod;
  assumeRole?: { roleArn: string; externalId?: string };
  extra: Record<string, string>;
};

export function buildDynamoOptions(input: DynamoConnectionInput): BuiltDynamoOptions {
  const eo = input.engineOptions ?? {};
  const auth = (input.authMethod ?? eo.authMethod ?? 'default') as DynamoAuthMethod;
  const region = String(input.region ?? eo.region ?? 'us-east-1');
  const extra = driverPropertiesMap({
    driverProperties: input.driverProperties,
    engineOptions: eo,
  });

  const out: BuiltDynamoOptions = {
    region,
    endpoint: input.endpoint || (eo.endpoint as string | undefined),
    authMethod: auth,
    extra,
  };

  if (auth === 'profile' || auth === 'sso') {
    out.profile = String(input.profile ?? eo.profile ?? 'default');
  } else if (auth === 'accessKey') {
    out.credentials = {
      accessKeyId: String(input.accessKeyId ?? eo.accessKeyId ?? ''),
      secretAccessKey: String(input.secretAccessKey ?? eo.secretAccessKey ?? ''),
      ...(input.sessionToken || eo.sessionToken
        ? { sessionToken: String(input.sessionToken ?? eo.sessionToken) }
        : {}),
    };
  } else if (auth === 'assumeRole') {
    const roleArn = String(input.roleArn ?? eo.roleArn ?? '');
    if (!roleArn) throw new Error('DynamoDB assume-role requires roleArn.');
    out.assumeRole = {
      roleArn,
      externalId: input.externalId
        ? String(input.externalId)
        : eo.externalId
          ? String(eo.externalId)
          : undefined,
    };
  }

  return out;
}