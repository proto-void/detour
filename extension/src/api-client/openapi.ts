import { createCollection, createFolder, createRequestNode, addChild } from './collections';
import { emptyRequest, type Collection, type CollectionNode, type HttpMethod, HTTP_METHODS } from './model';
import { parseJsonOrYaml } from './yaml-lite';

type FolderNode = Extract<CollectionNode, { kind: 'folder' }>;

export type OpenApiImportResult = { ok: true; collection: Collection } | { ok: false; error: string };

/**
 * Import OpenAPI 3 / Swagger 2 (JSON or YAML) into an API Tester collection.
 */
export function importOpenApi(text: string): OpenApiImportResult {
  let doc: Record<string, unknown>;
  try {
    doc = parseJsonOrYaml(text) as Record<string, unknown>;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  if (!doc || typeof doc !== 'object') return { ok: false, error: 'Not an OpenAPI/Swagger document.' };

  const isOas3 = typeof doc.openapi === 'string';
  const isSwagger2 = doc.swagger === '2.0' || doc.swagger === '2.0.0';
  if (!isOas3 && !isSwagger2) return { ok: false, error: 'Expected openapi 3.x or swagger 2.0.' };

  const info = (doc.info as { title?: string; description?: string } | undefined) ?? {};
  let collection = createCollection(info.title?.trim() || 'OpenAPI import');
  collection = { ...collection, description: info.description ?? '' };

  const base = baseUrl(doc, isOas3);
  const paths = (doc.paths as Record<string, Record<string, unknown>> | undefined) ?? {};

  for (const [pathKey, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== 'object') continue;
    const folderName = pathKey;
    let folder: FolderNode = createFolder(folderName);
    for (const [method, op] of Object.entries(pathItem)) {
      if (!HTTP_METHODS.includes(method.toUpperCase() as HttpMethod)) continue;
      if (!op || typeof op !== 'object') continue;
      const operation = op as Record<string, unknown>;
      const name =
        (typeof operation.operationId === 'string' && operation.operationId) ||
        (typeof operation.summary === 'string' && operation.summary) ||
        `${method.toUpperCase()} ${pathKey}`;
      const node = createRequestNode(name);
      const req = emptyRequest(node.request.id, name);
      req.method = method.toUpperCase() as HttpMethod;
      req.url = joinUrl(base, pathKey);
      const example = exampleBody(operation, doc);
      if (example != null) {
        req.body = { mode: 'raw', text: typeof example === 'string' ? example : JSON.stringify(example, null, 2), language: 'json' };
      }
      folder = { ...folder, children: [...folder.children, { kind: 'request', id: req.id, request: req }] };
    }
    if (folder.children.length > 0) collection = addChild(collection, [], folder);
  }

  if ((collection.children ?? []).length === 0) return { ok: false, error: 'No operations found in paths.' };
  return { ok: true, collection };
}

function baseUrl(doc: Record<string, unknown>, isOas3: boolean): string {
  if (isOas3) {
    const servers = doc.servers as { url?: string }[] | undefined;
    const url = servers?.[0]?.url;
    if (url) return url.replace(/\/$/, '');
  } else {
    const host = typeof doc.host === 'string' ? doc.host : 'localhost';
    const basePath = typeof doc.basePath === 'string' ? doc.basePath : '';
    const schemes = doc.schemes as string[] | undefined;
    const scheme = schemes?.[0] ?? 'https';
    return `${scheme}://${host}${basePath}`.replace(/\/$/, '');
  }
  return 'https://api.example.com';
}

function joinUrl(base: string, path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const b = base.replace(/\/$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${b}${p}`;
}

function exampleBody(operation: Record<string, unknown>, doc: Record<string, unknown>): unknown {
  const rb = operation.requestBody as { content?: Record<string, { example?: unknown; schema?: unknown }> } | undefined;
  if (rb?.content) {
    const json = rb.content['application/json'] ?? Object.values(rb.content)[0];
    if (json?.example !== undefined) return json.example;
    if (json?.schema) return schemaExample(json.schema, doc);
  }
  const params = operation.parameters as { in?: string; schema?: unknown; example?: unknown }[] | undefined;
  void params;
  const responses = operation.responses as Record<string, { schema?: unknown; examples?: unknown; content?: Record<string, { example?: unknown }> }> | undefined;
  const ok = responses?.['200'] ?? responses?.['201'] ?? responses?.default;
  if (ok?.content?.['application/json']?.example !== undefined) return ok.content['application/json'].example;
  if (ok?.schema) return schemaExample(ok.schema, doc);
  return undefined;
}

function schemaExample(schema: unknown, doc: Record<string, unknown>, depth = 0): unknown {
  if (!schema || typeof schema !== 'object' || depth > 6) return {};
  const s = schema as Record<string, unknown>;
  if (typeof s.$ref === 'string') {
    const ref = resolveRef(s.$ref, doc);
    return ref ? schemaExample(ref, doc, depth + 1) : {};
  }
  if (s.example !== undefined) return s.example;
  if (s.type === 'object' || s.properties) {
    const props = (s.properties as Record<string, unknown>) ?? {};
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(props)) out[k] = schemaExample(v, doc, depth + 1);
    return out;
  }
  if (s.type === 'array') return [schemaExample(s.items, doc, depth + 1)];
  if (s.type === 'string') return 'string';
  if (s.type === 'integer' || s.type === 'number') return 0;
  if (s.type === 'boolean') return true;
  return null;
}

function resolveRef(ref: string, doc: Record<string, unknown>): unknown {
  if (!ref.startsWith('#/')) return undefined;
  const parts = ref.slice(2).split('/');
  let cur: unknown = doc;
  for (const p of parts) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}
