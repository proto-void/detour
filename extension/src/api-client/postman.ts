import {
  emptyRequest,
  newKvRow,
  type ApiRequest,
  type Auth,
  type Body,
  type Collection,
  type CollectionNode,
  type HttpMethod,
  HTTP_METHODS,
} from './model';

interface PmHeader {
  key?: string;
  value?: string;
  disabled?: boolean;
}

interface PmUrl {
  raw?: string;
  query?: { key?: string; value?: string; disabled?: boolean }[];
}

interface PmBody {
  mode?: string;
  raw?: string;
  urlencoded?: { key?: string; value?: string; disabled?: boolean }[];
  formdata?: { key?: string; value?: string; disabled?: boolean; type?: string }[];
  options?: { raw?: { language?: string } };
}

interface PmAuth {
  type?: string;
  basic?: { key: string; value: string }[];
  bearer?: { key: string; value: string }[];
  apikey?: { key: string; value: string }[];
}

interface PmRequest {
  method?: string;
  header?: PmHeader[];
  url?: string | PmUrl;
  body?: PmBody;
  auth?: PmAuth;
}

interface PmItem {
  name?: string;
  request?: PmRequest;
  item?: PmItem[];
  event?: { listen?: string; script?: { exec?: string[] | string } }[];
}

interface PmCollection {
  info?: { name?: string; description?: string; schema?: string };
  item?: PmItem[];
  variable?: { key?: string; value?: string }[];
}

const isMethod = (m: string): m is HttpMethod => (HTTP_METHODS as readonly string[]).includes(m.toUpperCase());

function pmAuth(auth: PmAuth | undefined): Auth {
  if (!auth?.type || auth.type === 'noauth') return { type: 'none' };
  if (auth.type === 'basic') {
    const rows = Object.fromEntries((auth.basic ?? []).map((r) => [r.key, r.value]));
    return { type: 'basic', username: rows.username ?? '', password: rows.password ?? '' };
  }
  if (auth.type === 'bearer') {
    const rows = Object.fromEntries((auth.bearer ?? []).map((r) => [r.key, r.value]));
    return { type: 'bearer', token: rows.token ?? '' };
  }
  if (auth.type === 'apikey') {
    const rows = Object.fromEntries((auth.apikey ?? []).map((r) => [r.key, r.value]));
    return {
      type: 'apikey',
      key: rows.key ?? '',
      value: rows.value ?? '',
      in: rows.in === 'query' ? 'query' : 'header',
    };
  }
  return { type: 'none' };
}

function pmBody(body: PmBody | undefined, newId: () => string): Body {
  if (!body?.mode || body.mode === 'none') return { mode: 'none' };
  if (body.mode === 'raw') {
    const language = body.options?.raw?.language === 'text' ? 'text' : 'json';
    return { mode: 'raw', text: body.raw ?? '', language };
  }
  if (body.mode === 'urlencoded') {
    return {
      mode: 'urlencoded',
      rows: (body.urlencoded ?? []).map((r) => ({ ...newKvRow(newId(), r.key ?? '', r.value ?? ''), enabled: !r.disabled })),
    };
  }
  if (body.mode === 'formdata') {
    return {
      mode: 'formdata',
      rows: (body.formdata ?? [])
        .filter((r) => r.type !== 'file')
        .map((r) => ({ ...newKvRow(newId(), r.key ?? '', r.value ?? ''), enabled: !r.disabled })),
    };
  }
  return { mode: 'none' };
}

function scriptFromEvents(events: PmItem['event'], listen: string): string {
  const ev = events?.find((e) => e.listen === listen);
  if (!ev?.script?.exec) return '';
  return Array.isArray(ev.script.exec) ? ev.script.exec.join('\n') : ev.script.exec;
}

function urlRaw(url: string | PmUrl | undefined): string {
  if (!url) return '';
  if (typeof url === 'string') return url;
  return url.raw ?? '';
}

function mapRequest(item: PmItem, newId: () => string): ApiRequest {
  const req = item.request ?? {};
  const methodRaw = (req.method ?? 'GET').toUpperCase();
  const method = isMethod(methodRaw) ? methodRaw : 'GET';
  const rawUrl = urlRaw(req.url);
  const params =
    typeof req.url === 'object' && req.url.query
      ? req.url.query.map((q) => ({ ...newKvRow(newId(), q.key ?? '', q.value ?? ''), enabled: !q.disabled }))
      : [];

  const request = emptyRequest(newId(), item.name?.trim() || 'Request');
  request.method = method;
  request.url = rawUrl;
  request.params = params;
  request.headers = (req.header ?? []).map((h) => ({
    ...newKvRow(newId(), h.key ?? '', h.value ?? ''),
    enabled: !h.disabled,
  }));
  request.auth = pmAuth(req.auth);
  request.body = pmBody(req.body, newId);
  request.preRequestScript = scriptFromEvents(item.event, 'prerequest');
  request.testScript = scriptFromEvents(item.event, 'test');
  return request;
}

function mapItems(items: PmItem[] | undefined, newId: () => string): CollectionNode[] {
  if (!items) return [];
  return items.map((item) => {
    if (item.item) {
      return {
        kind: 'folder' as const,
        id: newId(),
        name: item.name?.trim() || 'Folder',
        children: mapItems(item.item, newId),
      };
    }
    const request = mapRequest(item, newId);
    return { kind: 'request' as const, id: request.id, request };
  });
}

export function importPostmanCollection(raw: unknown, newId: () => string = () => crypto.randomUUID()): { ok: true; collection: Collection } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Not a JSON object' };
  const doc = raw as PmCollection;
  const schema = doc.info?.schema ?? '';
  if (schema && !/v2\.1\.0/i.test(schema) && !/collection/i.test(schema)) {
    return { ok: false, error: 'Expected a Postman Collection v2.1 document' };
  }
  const collection: Collection = {
    id: newId(),
    name: doc.info?.name?.trim() || 'Imported collection',
    description: typeof doc.info?.description === 'string' ? doc.info.description : '',
    variables: (doc.variable ?? []).map((v) => newKvRow(newId(), v.key ?? '', v.value ?? '')),
    children: mapItems(doc.item, newId),
  };
  return { ok: true, collection };
}

function exportAuth(auth: Auth): PmAuth | undefined {
  if (auth.type === 'none') return undefined;
  if (auth.type === 'basic') {
    return {
      type: 'basic',
      basic: [
        { key: 'username', value: auth.username },
        { key: 'password', value: auth.password },
      ],
    };
  }
  if (auth.type === 'bearer') {
    return { type: 'bearer', bearer: [{ key: 'token', value: auth.token }] };
  }
  if (auth.type === 'apikey') {
    return {
      type: 'apikey',
      apikey: [
        { key: 'key', value: auth.key },
        { key: 'value', value: auth.value },
        { key: 'in', value: auth.in ?? 'header' },
      ],
    };
  }
  // oauth2 / sigv4 / digest — store as bearer token when present, else omit
  if (auth.type === 'oauth2' && auth.accessToken) {
    return { type: 'bearer', bearer: [{ key: 'token', value: auth.accessToken }] };
  }
  return undefined;
}

function exportBody(body: Body): PmBody | undefined {
  if (body.mode === 'none') return undefined;
  if (body.mode === 'raw') {
    return { mode: 'raw', raw: body.text, options: { raw: { language: body.language ?? 'json' } } };
  }
  if (body.mode === 'urlencoded') {
    return {
      mode: 'urlencoded',
      urlencoded: body.rows.map((r) => ({ key: r.key, value: r.value, disabled: r.enabled === false })),
    };
  }
  if (body.mode === 'graphql') {
    let variables: unknown;
    try {
      variables = body.variables?.trim() ? JSON.parse(body.variables) : undefined;
    } catch {
      variables = body.variables;
    }
    return {
      mode: 'raw',
      raw: JSON.stringify({
        query: body.query,
        ...(variables !== undefined ? { variables } : {}),
        ...(body.operationName ? { operationName: body.operationName } : {}),
      }),
      options: { raw: { language: 'json' } },
    };
  }
  return {
    mode: 'formdata',
    formdata: body.rows.map((r) => ({ key: r.key, value: r.value, type: 'text', disabled: r.enabled === false })),
  };
}

function exportNode(node: CollectionNode): PmItem {
  if (node.kind === 'folder') {
    return { name: node.name, item: node.children.map(exportNode) };
  }
  const r = node.request;
  const events = [];
  if (r.preRequestScript?.trim()) {
    events.push({ listen: 'prerequest', script: { exec: r.preRequestScript.split('\n') } });
  }
  if (r.testScript?.trim()) {
    events.push({ listen: 'test', script: { exec: r.testScript.split('\n') } });
  }
  return {
    name: r.name,
    request: {
      method: r.method,
      header: (r.headers ?? []).map((h) => ({ key: h.key, value: h.value, disabled: h.enabled === false })),
      url: {
        raw: r.url,
        query: (r.params ?? []).map((p) => ({ key: p.key, value: p.value, disabled: p.enabled === false })),
      },
      body: exportBody(r.body ?? { mode: 'none' }),
      auth: exportAuth(r.auth ?? { type: 'none' }),
    },
    event: events.length ? events : undefined,
  };
}

export function exportPostmanCollection(collection: Collection): object {
  return {
    info: {
      name: collection.name,
      description: collection.description ?? '',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    variable: (collection.variables ?? []).map((v) => ({ key: v.key, value: v.value })),
    item: (collection.children ?? []).map(exportNode),
  };
}
