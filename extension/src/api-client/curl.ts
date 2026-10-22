import { emptyRequest, newKvRow, type ApiRequest, type Auth, type Body, type HttpMethod, HTTP_METHODS } from './model';

export interface CurlParseResult {
  ok: true;
  request: ApiRequest;
}

export interface CurlParseError {
  ok: false;
  error: string;
}

/** Tokenize a curl command: handles quotes, escapes, and `\` line continuations. */
export function tokenizeCurl(input: string): string[] {
  const normalized = input.replace(/\\\r?\n/g, ' ').trim();
  const tokens: string[] = [];
  let i = 0;
  while (i < normalized.length) {
    while (i < normalized.length && /\s/.test(normalized[i]!)) i++;
    if (i >= normalized.length) break;
    const ch = normalized[i]!;
    if (ch === "'" || ch === '"') {
      const quote = ch;
      i++;
      let buf = '';
      while (i < normalized.length && normalized[i] !== quote) {
        if (quote === '"' && normalized[i] === '\\' && i + 1 < normalized.length) {
          buf += normalized[i + 1]!;
          i += 2;
          continue;
        }
        buf += normalized[i]!;
        i++;
      }
      if (i < normalized.length) i++;
      tokens.push(buf);
      continue;
    }
    let buf = '';
    while (i < normalized.length && !/\s/.test(normalized[i]!)) {
      if (normalized[i] === '\\' && i + 1 < normalized.length) {
        buf += normalized[i + 1]!;
        i += 2;
        continue;
      }
      buf += normalized[i]!;
      i++;
    }
    tokens.push(buf);
  }
  return tokens;
}

const isMethod = (m: string): m is HttpMethod => (HTTP_METHODS as readonly string[]).includes(m.toUpperCase());

const IGNORED = new Set([
  '--compressed',
  '-k',
  '--insecure',
  '-L',
  '--location',
  '-s',
  '--silent',
  '-S',
  '--show-error',
  '-v',
  '--verbose',
  '-i',
  '--include',
]);

function takeValue(tokens: string[], i: number): { value: string; next: number } | null {
  const next = tokens[i + 1];
  if (next === undefined || next.startsWith('-')) return null;
  return { value: next, next: i + 2 };
}

function parseHeader(raw: string): { key: string; value: string } {
  const idx = raw.indexOf(':');
  if (idx === -1) return { key: raw.trim(), value: '' };
  return { key: raw.slice(0, idx).trim(), value: raw.slice(idx + 1).trim() };
}

function applyAuthFromUser(user: string): Auth {
  const colon = user.indexOf(':');
  if (colon === -1) return { type: 'basic', username: user, password: '' };
  return { type: 'basic', username: user.slice(0, colon), password: user.slice(colon + 1) };
}

function authFromHeaders(headers: { key: string; value: string }[]): Auth | null {
  const auth = headers.find((h) => h.key.toLowerCase() === 'authorization');
  if (!auth) return null;
  const m = /^Bearer\s+(.+)$/i.exec(auth.value);
  if (m) return { type: 'bearer', token: m[1]! };
  const b = /^Basic\s+(.+)$/i.exec(auth.value);
  if (b) {
    try {
      const decoded = atob(b[1]!);
      const colon = decoded.indexOf(':');
      if (colon === -1) return { type: 'basic', username: decoded, password: '' };
      return { type: 'basic', username: decoded.slice(0, colon), password: decoded.slice(colon + 1) };
    } catch {
      return null;
    }
  }
  return null;
}

/** Parse a curl command into an ApiRequest. Ignores browser-irrelevant flags. */
export function parseCurl(input: string, newId: () => string = () => crypto.randomUUID()): CurlParseResult | CurlParseError {
  const trimmed = input.trim();
  if (!/^curl(\s|$)/i.test(trimmed)) return { ok: false, error: 'Expected a command starting with curl' };

  const tokens = tokenizeCurl(trimmed);
  if (tokens.length === 0 || !/^curl$/i.test(tokens[0]!)) return { ok: false, error: 'Expected a command starting with curl' };

  let method: HttpMethod = 'GET';
  let url = '';
  const headers: { key: string; value: string }[] = [];
  let bodyText: string | null = null;
  let bodyMode: 'raw' | 'urlencoded' | 'formdata' | null = null;
  const formRows: { key: string; value: string }[] = [];
  let auth: Auth = { type: 'none' };
  let methodForced = false;

  let i = 1;
  while (i < tokens.length) {
    const t = tokens[i]!;
    if (IGNORED.has(t)) {
      i++;
      continue;
    }
    if (t === '-X' || t === '--request') {
      const v = takeValue(tokens, i);
      if (!v || !isMethod(v.value)) return { ok: false, error: 'Invalid -X method' };
      method = v.value.toUpperCase() as HttpMethod;
      methodForced = true;
      i = v.next;
      continue;
    }
    if (t.startsWith('-X') && t.length > 2) {
      const m = t.slice(2);
      if (!isMethod(m)) return { ok: false, error: 'Invalid -X method' };
      method = m.toUpperCase() as HttpMethod;
      methodForced = true;
      i++;
      continue;
    }
    if (t === '-H' || t === '--header') {
      const v = takeValue(tokens, i);
      if (!v) return { ok: false, error: 'Missing header value' };
      headers.push(parseHeader(v.value));
      i = v.next;
      continue;
    }
    if (t === '-d' || t === '--data' || t === '--data-raw' || t === '--data-binary' || t === '--data-urlencode') {
      const v = takeValue(tokens, i);
      if (!v) return { ok: false, error: 'Missing data value' };
      bodyText = bodyText === null ? v.value : `${bodyText}&${v.value}`;
      bodyMode = t === '--data-urlencode' ? 'urlencoded' : 'raw';
      if (!methodForced) method = 'POST';
      i = v.next;
      continue;
    }
    if (t === '-F' || t === '--form') {
      const v = takeValue(tokens, i);
      if (!v) return { ok: false, error: 'Missing form value' };
      const eq = v.value.indexOf('=');
      formRows.push(eq === -1 ? { key: v.value, value: '' } : { key: v.value.slice(0, eq), value: v.value.slice(eq + 1) });
      bodyMode = 'formdata';
      if (!methodForced) method = 'POST';
      i = v.next;
      continue;
    }
    if (t === '-u' || t === '--user') {
      const v = takeValue(tokens, i);
      if (!v) return { ok: false, error: 'Missing user value' };
      auth = applyAuthFromUser(v.value);
      i = v.next;
      continue;
    }
    if (t === '-A' || t === '--user-agent') {
      const v = takeValue(tokens, i);
      if (!v) return { ok: false, error: 'Missing user-agent' };
      headers.push({ key: 'User-Agent', value: v.value });
      i = v.next;
      continue;
    }
    if (t === '-e' || t === '--referer') {
      const v = takeValue(tokens, i);
      if (!v) return { ok: false, error: 'Missing referer' };
      headers.push({ key: 'Referer', value: v.value });
      i = v.next;
      continue;
    }
    if (t === '-b' || t === '--cookie') {
      const v = takeValue(tokens, i);
      if (!v) return { ok: false, error: 'Missing cookie' };
      headers.push({ key: 'Cookie', value: v.value });
      i = v.next;
      continue;
    }
    if (t === '--url') {
      const v = takeValue(tokens, i);
      if (!v) return { ok: false, error: 'Missing --url value' };
      url = v.value;
      i = v.next;
      continue;
    }
    if (t === '-G' || t === '--get') {
      method = 'GET';
      methodForced = true;
      i++;
      continue;
    }
    if (t.startsWith('-')) {
      // Unknown flag: skip optional value if present.
      const v = takeValue(tokens, i);
      i = v ? v.next : i + 1;
      continue;
    }
    if (!url) url = t;
    i++;
  }

  if (!url) return { ok: false, error: 'Missing URL' };

  const headerAuth = authFromHeaders(headers);
  if (auth.type === 'none' && headerAuth) auth = headerAuth;

  const filteredHeaders = headers.filter((h) => {
    const lower = h.key.toLowerCase();
    if (auth.type === 'bearer' || auth.type === 'basic') return lower !== 'authorization';
    return true;
  });

  let body: Body = { mode: 'none' };
  if (bodyMode === 'formdata') {
    body = { mode: 'formdata', rows: formRows.map((r) => newKvRow(newId(), r.key, r.value)) };
  } else if (bodyMode === 'urlencoded' && bodyText !== null) {
    const rows = bodyText.split('&').map((part) => {
      const eq = part.indexOf('=');
      return eq === -1
        ? newKvRow(newId(), decodeURIComponent(part), '')
        : newKvRow(newId(), decodeURIComponent(part.slice(0, eq)), decodeURIComponent(part.slice(eq + 1)));
    });
    body = { mode: 'urlencoded', rows };
  } else if (bodyText !== null) {
    const ct = filteredHeaders.find((h) => h.key.toLowerCase() === 'content-type')?.value ?? '';
    const language = /json/i.test(ct) || /^\s*[\[{]/.test(bodyText) ? 'json' : 'text';
    body = { mode: 'raw', text: bodyText, language };
  }

  const params: ApiRequest['params'] = [];
  try {
    const u = new URL(url);
    u.searchParams.forEach((value, key) => {
      params.push(newKvRow(newId(), key, value));
    });
    u.search = '';
    url = u.toString();
  } catch {
    // leave url as-is if not absolute
  }

  const request = emptyRequest(newId(), 'Imported cURL');
  request.method = method;
  request.url = url;
  request.params = params;
  request.headers = filteredHeaders.map((h) => newKvRow(newId(), h.key, h.value));
  request.auth = auth;
  request.body = body;
  return { ok: true, request };
}

function shellQuote(value: string): string {
  if (value === '') return "''";
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Build a bash-friendly curl command from a request. */
export function toCurl(request: ApiRequest): string {
  const parts = ['curl'];
  if (request.method !== 'GET') {
    parts.push('-X', request.method);
  }

  let url = request.url;
  const enabledParams = (request.params ?? []).filter((p) => p.enabled !== false && p.key);
  if (enabledParams.length > 0) {
    try {
      const u = new URL(url);
      for (const p of enabledParams) u.searchParams.append(p.key, p.value);
      url = u.toString();
    } catch {
      const qs = enabledParams.map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`).join('&');
      url += (url.includes('?') ? '&' : '?') + qs;
    }
  }
  parts.push(shellQuote(url));

  for (const h of request.headers ?? []) {
    if (h.enabled === false || !h.key) continue;
    parts.push('-H', shellQuote(`${h.key}: ${h.value}`));
  }

  const auth = request.auth ?? { type: 'none' };
  if (auth.type === 'basic') {
    parts.push('-u', shellQuote(`${auth.username}:${auth.password}`));
  } else if (auth.type === 'bearer') {
    parts.push('-H', shellQuote(`Authorization: Bearer ${auth.token}`));
  } else if (auth.type === 'apikey') {
    if ((auth.in ?? 'header') === 'header') {
      parts.push('-H', shellQuote(`${auth.key}: ${auth.value}`));
    }
  }

  const body = request.body ?? { mode: 'none' };
  if (body.mode === 'raw' && body.text) {
    parts.push('--data-raw', shellQuote(body.text));
  } else if (body.mode === 'urlencoded') {
    const data = body.rows
      .filter((r) => r.enabled !== false && r.key)
      .map((r) => `${encodeURIComponent(r.key)}=${encodeURIComponent(r.value)}`)
      .join('&');
    if (data) parts.push('--data-urlencode', shellQuote(data));
  } else if (body.mode === 'formdata') {
    for (const r of body.rows.filter((row) => row.enabled !== false && row.key)) {
      parts.push('-F', shellQuote(`${r.key}=${r.value}`));
    }
  }

  return parts.join(' ');
}

/** True when pasted text should populate the request from cURL. */
export function looksLikeCurl(text: string): boolean {
  return /^\s*curl(\s|$)/i.test(text);
}
