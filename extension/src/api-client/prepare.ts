import { encodeGraphQLBody } from './graphql';
import type { ApiRequest, Auth, Body, KvRow } from './model';
import { clientCredentials, needsRefresh, passwordGrant, refreshAccessToken, type OAuthConfig, type OAuthToken } from './oauth';
import { signAwsV4 } from './sigv4';
import { resolveVariables, type VariableScopes } from './variables';

function enabledRows(rows: KvRow[] | undefined): KvRow[] {
  return (rows ?? []).filter((r) => r.enabled !== false && r.key);
}

function resolveRows(rows: KvRow[], scopes: VariableScopes): KvRow[] {
  return rows.map((r) => ({
    ...r,
    key: resolveVariables(r.key, scopes),
    value: resolveVariables(r.value, scopes),
  }));
}

function applyAuthSync(headers: Record<string, string>, url: URL, auth: Auth, scopes: VariableScopes): void {
  if (auth.type === 'none') return;
  if (auth.type === 'basic') {
    const user = resolveVariables(auth.username, scopes);
    const pass = resolveVariables(auth.password, scopes);
    headers.Authorization = `Basic ${btoa(`${user}:${pass}`)}`;
    return;
  }
  if (auth.type === 'bearer') {
    headers.Authorization = `Bearer ${resolveVariables(auth.token, scopes)}`;
    return;
  }
  if (auth.type === 'oauth2') {
    if (auth.accessToken) headers.Authorization = `Bearer ${auth.accessToken}`;
    return;
  }
  if (auth.type === 'sigv4' || auth.type === 'digest') return;
  const key = resolveVariables(auth.key, scopes);
  const value = resolveVariables(auth.value, scopes);
  if ((auth.in ?? 'header') === 'query') url.searchParams.set(key, value);
  else headers[key] = value;
}

function encodeBody(body: Body, scopes: VariableScopes): { body: string | null; contentType?: string } {
  if (body.mode === 'none') return { body: null };
  if (body.mode === 'raw') {
    const text = resolveVariables(body.text, scopes);
    const contentType = (body.language ?? 'json') === 'json' ? 'application/json' : 'text/plain';
    return { body: text, contentType };
  }
  if (body.mode === 'graphql') {
    const query = resolveVariables(body.query, scopes);
    const variables = body.variables ? resolveVariables(body.variables, scopes) : '';
    const operationName = body.operationName ? resolveVariables(body.operationName, scopes) : '';
    return {
      body: encodeGraphQLBody({ query, variables, operationName }),
      contentType: 'application/json',
    };
  }
  if (body.mode === 'urlencoded') {
    const params = new URLSearchParams();
    for (const row of resolveRows(enabledRows(body.rows), scopes)) params.append(row.key, row.value);
    return { body: params.toString(), contentType: 'application/x-www-form-urlencoded' };
  }
  const boundary = `----DetourForm${Date.now()}`;
  const chunks: string[] = [];
  for (const row of resolveRows(enabledRows(body.rows), scopes)) {
    chunks.push(`--${boundary}\r\nContent-Disposition: form-data; name="${row.key}"\r\n\r\n${row.value}\r\n`);
  }
  chunks.push(`--${boundary}--\r\n`);
  return { body: chunks.join(''), contentType: `multipart/form-data; boundary=${boundary}` };
}

export interface PreparedHttp {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | null;
  /** Updated oauth tokens after refresh (caller may persist). */
  authUpdate?: Auth;
}

/** Resolve variables and sync auth into a concrete HTTP request. */
export function prepareHttp(request: ApiRequest, scopes: VariableScopes): PreparedHttp {
  const method = request.method;
  const urlText = resolveVariables(request.url, scopes);
  const headers: Record<string, string> = {};

  for (const row of resolveRows(enabledRows(request.headers), scopes)) {
    headers[row.key] = row.value;
  }

  let url: URL;
  try {
    url = new URL(urlText);
  } catch {
    throw new Error('Enter a valid absolute URL');
  }

  for (const row of resolveRows(enabledRows(request.params), scopes)) {
    url.searchParams.append(row.key, row.value);
  }

  applyAuthSync(headers, url, request.auth ?? { type: 'none' }, scopes);

  const encoded = encodeBody(request.body ?? { mode: 'none' }, scopes);
  if (encoded.body !== null && encoded.contentType && !Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')) {
    headers['Content-Type'] = encoded.contentType;
  }

  return {
    method,
    url: url.toString(),
    headers,
    body: method === 'GET' || method === 'HEAD' ? null : encoded.body,
  };
}

function oauthConfigFromAuth(auth: Extract<Auth, { type: 'oauth2' }>, scopes: VariableScopes): OAuthConfig {
  return {
    grant: auth.grant ?? 'authorization_code',
    authorizeUrl: resolveVariables(auth.authorizeUrl ?? '', scopes),
    tokenUrl: resolveVariables(auth.tokenUrl, scopes),
    clientId: resolveVariables(auth.clientId, scopes),
    clientSecret: auth.clientSecret ? resolveVariables(auth.clientSecret, scopes) : undefined,
    scope: auth.scope ? resolveVariables(auth.scope, scopes) : undefined,
    redirectUri: auth.redirectUri ? resolveVariables(auth.redirectUri, scopes) : undefined,
    username: auth.username ? resolveVariables(auth.username, scopes) : undefined,
    password: auth.password ? resolveVariables(auth.password, scopes) : undefined,
  };
}

function applyToken(auth: Extract<Auth, { type: 'oauth2' }>, token: OAuthToken): Auth {
  return {
    ...auth,
    accessToken: token.accessToken,
    refreshToken: token.refreshToken ?? auth.refreshToken,
    expiresAt: token.expiresAt,
  };
}

/**
 * Async prepare: OAuth refresh / client-credentials / password, SigV4 signing.
 * Digest is applied by the send path on 401 (challenge-response).
 */
export async function prepareHttpAsync(request: ApiRequest, scopes: VariableScopes): Promise<PreparedHttp> {
  let auth = request.auth ?? { type: 'none' as const };
  let authUpdate: Auth | undefined;

  if (auth.type === 'oauth2') {
    const cfg = oauthConfigFromAuth(auth, scopes);
    const tokenLike: OAuthToken = {
      accessToken: auth.accessToken ?? '',
      refreshToken: auth.refreshToken,
      tokenType: 'Bearer',
      expiresAt: auth.expiresAt,
      raw: {},
    };
    if (auth.grant === 'client_credentials' && !auth.accessToken) {
      const token = await clientCredentials(cfg);
      auth = applyToken(auth, token);
      authUpdate = auth;
    } else if (auth.grant === 'password' && !auth.accessToken) {
      const token = await passwordGrant(cfg);
      auth = applyToken(auth, token);
      authUpdate = auth;
    } else if (auth.refreshToken && needsRefresh(tokenLike)) {
      const token = await refreshAccessToken(cfg, auth.refreshToken);
      auth = applyToken(auth, token);
      authUpdate = auth;
    }
  }

  const prepared = prepareHttp({ ...request, auth }, scopes);

  if (auth.type === 'sigv4') {
    const signed = await signAwsV4(
      { method: prepared.method, url: prepared.url, headers: prepared.headers, body: prepared.body },
      {
        accessKeyId: resolveVariables(auth.accessKeyId, scopes),
        secretAccessKey: resolveVariables(auth.secretAccessKey, scopes),
        sessionToken: auth.sessionToken ? resolveVariables(auth.sessionToken, scopes) : undefined,
        region: resolveVariables(auth.region, scopes),
        service: resolveVariables(auth.service, scopes),
      },
    );
    return { ...prepared, headers: signed, authUpdate };
  }

  return { ...prepared, authUpdate };
}
