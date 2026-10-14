/** Optional cookie jar — requires `cookies` permission on first use. */

export interface CookieEntry {
  domain: string;
  name: string;
  value: string;
  path: string;
  secure?: boolean;
  httpOnly?: boolean;
  expirationDate?: number;
}

export interface CookiesApi {
  getAll(details: { domain?: string; url?: string }): Promise<CookieEntry[]>;
  set(details: {
    url: string;
    name: string;
    value: string;
    domain?: string;
    path?: string;
    secure?: boolean;
    httpOnly?: boolean;
    expirationDate?: number;
  }): Promise<CookieEntry | null>;
  remove(details: { url: string; name: string }): Promise<CookieEntry | null>;
}

export interface PermissionsApi {
  contains(perm: { permissions: string[] }): Promise<boolean>;
  request(perm: { permissions: string[] }): Promise<boolean>;
}

export async function ensureCookiesPermission(permissions: PermissionsApi): Promise<boolean> {
  if (await permissions.contains({ permissions: ['cookies'] })) return true;
  return permissions.request({ permissions: ['cookies'] });
}

export async function listCookiesForDomain(api: CookiesApi, domain: string): Promise<CookieEntry[]> {
  const host = domain.replace(/^\./, '');
  return api.getAll({ domain: host });
}

export async function upsertCookie(api: CookiesApi, entry: CookieEntry): Promise<void> {
  const scheme = entry.secure ? 'https' : 'http';
  const url = `${scheme}://${entry.domain.replace(/^\./, '')}${entry.path || '/'}`;
  await api.set({
    url,
    name: entry.name,
    value: entry.value,
    domain: entry.domain,
    path: entry.path || '/',
    secure: entry.secure,
    httpOnly: entry.httpOnly,
    expirationDate: entry.expirationDate,
  });
}

export async function deleteCookie(api: CookiesApi, entry: Pick<CookieEntry, 'domain' | 'name' | 'path' | 'secure'>): Promise<void> {
  const scheme = entry.secure ? 'https' : 'http';
  const url = `${scheme}://${entry.domain.replace(/^\./, '')}${entry.path || '/'}`;
  await api.remove({ url, name: entry.name });
}

/** Build Cookie header from jar entries for a URL (simple name=value join). */
export function cookieHeaderForUrl(entries: CookieEntry[], url: string): string {
  let host = '';
  let path = '/';
  try {
    const u = new URL(url);
    host = u.hostname;
    path = u.pathname || '/';
  } catch {
    return '';
  }
  const matched = entries.filter((c) => {
    const d = c.domain.replace(/^\./, '');
    if (!(host === d || host.endsWith(`.${d}`))) return false;
    const p = c.path || '/';
    return path === p || path.startsWith(p.endsWith('/') ? p : `${p}/`) || path.startsWith(p);
  });
  return matched.map((c) => `${c.name}=${c.value}`).join('; ');
}
