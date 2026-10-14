import { challengeS256, createPkcePair, randomVerifier } from './pkce';

export type OAuthGrant = 'authorization_code' | 'client_credentials' | 'password';

export interface OAuthConfig {
  grant: OAuthGrant;
  authorizeUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret?: string;
  scope?: string;
  /** Auth-code redirect; Chrome uses identity.getRedirectURL(). */
  redirectUri?: string;
  username?: string;
  password?: string;
}

export interface OAuthToken {
  accessToken: string;
  refreshToken?: string;
  tokenType: string;
  expiresAt?: number;
  raw: Record<string, unknown>;
}

export interface IdentityApi {
  getRedirectURL(): string;
  launchWebAuthFlow(details: { url: string; interactive: boolean }): Promise<string>;
}

export function buildAuthorizeUrl(config: OAuthConfig, pkce: { challenge: string; method: string }, state: string): string {
  const u = new URL(config.authorizeUrl);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('client_id', config.clientId);
  u.searchParams.set('redirect_uri', config.redirectUri ?? '');
  u.searchParams.set('state', state);
  u.searchParams.set('code_challenge', pkce.challenge);
  u.searchParams.set('code_challenge_method', pkce.method);
  if (config.scope) u.searchParams.set('scope', config.scope);
  return u.toString();
}

export function parseCodeFromRedirect(redirectUrl: string): { code?: string; state?: string; error?: string } {
  try {
    const u = new URL(redirectUrl);
    return {
      code: u.searchParams.get('code') ?? undefined,
      state: u.searchParams.get('state') ?? undefined,
      error: u.searchParams.get('error') ?? undefined,
    };
  } catch {
    return { error: 'Invalid redirect URL' };
  }
}

async function tokenRequest(tokenUrl: string, body: Record<string, string>, clientId: string, clientSecret?: string): Promise<OAuthToken> {
  const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' };
  if (clientSecret) {
    headers.Authorization = `Basic ${btoa(`${clientId}:${clientSecret}`)}`;
  }
  const res = await fetch(tokenUrl, { method: 'POST', headers, body: new URLSearchParams(body).toString() });
  const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(typeof raw.error_description === 'string' ? raw.error_description : `Token error ${res.status}`);
  const accessToken = String(raw.access_token ?? '');
  if (!accessToken) throw new Error('Token response missing access_token');
  const expiresIn = typeof raw.expires_in === 'number' ? raw.expires_in : Number(raw.expires_in);
  return {
    accessToken,
    refreshToken: raw.refresh_token ? String(raw.refresh_token) : undefined,
    tokenType: String(raw.token_type ?? 'Bearer'),
    expiresAt: Number.isFinite(expiresIn) ? Date.now() + expiresIn * 1000 : undefined,
    raw,
  };
}

/** Chrome: interactive auth-code + PKCE via identity.launchWebAuthFlow. */
export async function authorizeCodeChrome(config: OAuthConfig, identity: IdentityApi): Promise<{ token: OAuthToken; verifier: string }> {
  const redirectUri = config.redirectUri || identity.getRedirectURL();
  const pkce = await createPkcePair();
  const state = randomVerifier(32);
  const url = buildAuthorizeUrl({ ...config, redirectUri }, pkce, state);
  const redirect = await identity.launchWebAuthFlow({ url, interactive: true });
  const parsed = parseCodeFromRedirect(redirect);
  if (parsed.error) throw new Error(parsed.error);
  if (!parsed.code) throw new Error('No authorization code in redirect');
  if (parsed.state !== state) throw new Error('OAuth state mismatch');
  const token = await exchangeAuthorizationCode({ ...config, redirectUri }, parsed.code, pkce.verifier);
  return { token, verifier: pkce.verifier };
}

/** Firefox / manual: exchange a pasted authorization code with PKCE verifier. */
export async function exchangeAuthorizationCode(config: OAuthConfig, code: string, verifier: string): Promise<OAuthToken> {
  const body: Record<string, string> = {
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.redirectUri ?? '',
    client_id: config.clientId,
    code_verifier: verifier,
  };
  if (config.clientSecret && !body.client_id) body.client_id = config.clientId;
  return tokenRequest(config.tokenUrl, body, config.clientId, config.clientSecret);
}

export async function clientCredentials(config: OAuthConfig): Promise<OAuthToken> {
  const body: Record<string, string> = {
    grant_type: 'client_credentials',
    client_id: config.clientId,
  };
  if (config.scope) body.scope = config.scope;
  return tokenRequest(config.tokenUrl, body, config.clientId, config.clientSecret);
}

export async function passwordGrant(config: OAuthConfig): Promise<OAuthToken> {
  const body: Record<string, string> = {
    grant_type: 'password',
    username: config.username ?? '',
    password: config.password ?? '',
    client_id: config.clientId,
  };
  if (config.scope) body.scope = config.scope;
  return tokenRequest(config.tokenUrl, body, config.clientId, config.clientSecret);
}

export async function refreshAccessToken(config: OAuthConfig, refreshToken: string): Promise<OAuthToken> {
  const body: Record<string, string> = {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: config.clientId,
  };
  return tokenRequest(config.tokenUrl, body, config.clientId, config.clientSecret);
}

export function needsRefresh(token: OAuthToken, skewMs = 60_000): boolean {
  if (!token.expiresAt) return false;
  return Date.now() >= token.expiresAt - skewMs;
}

export { createPkcePair, challengeS256, randomVerifier };
