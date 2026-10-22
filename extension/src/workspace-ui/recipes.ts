import { compileRule } from '../engine-core/compile';
import { isDnrAction, parseWorkspace, RESOURCE_TYPES, type Group, type Rule, type Workspace } from '../rule-model/schema';
import { addGroup } from './editor';

export interface RecipeField {
  id: string;
  label: string;
  hint: string;
  defaultValue: string;
}

export interface Recipe {
  id: string;
  name: string;
  summary: string;
  fields: RecipeField[];
}

export const RECIPES: Recipe[] = [
  {
    id: 'localhost',
    name: 'Point a site at localhost',
    summary: 'Redirect every request on a production host to your dev server. The local origin defaults to the Vite port, 5173.',
    fields: [
      { id: 'host', label: 'Production host', hint: 'A host, optionally with a port. No scheme or path.', defaultValue: '' },
      { id: 'origin', label: 'Local origin', hint: 'Where matching requests should go, without a path.', defaultValue: 'http://localhost:5173' },
    ],
  },
  {
    id: 'cors',
    name: 'Allow CORS',
    summary: 'Add Access-Control-Allow-Origin, methods, and headers to responses. This does not answer an OPTIONS preflight by itself.',
    fields: [{ id: 'pattern', label: 'Request pattern', hint: 'A glob. * matches every URL.', defaultValue: '*' }],
  },
  {
    id: 'spa',
    name: 'SPA fallback',
    summary: 'Send page loads whose path has no file extension to /index.html. Paths with a dot, such as assets, stay put.',
    fields: [{ id: 'origin', label: 'Site origin', hint: 'The site that should fall back, without a path.', defaultValue: 'https://app.example.com' }],
  },
];

type Built = { ok: true; group: Group } | { ok: false; errors: Record<string, string> };
type Installed = { ok: true; workspace: Workspace; group: Group } | { ok: false; errors: Record<string, string> };

const HOST = /^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)*$/;
const PRINTABLE_ASCII = /^[\x20-\x7e]+$/;

const fail = (errors: Record<string, string>): Built => ({ ok: false, errors });

function validPort(port: string): boolean {
  return /^[1-9]\d{0,4}$/.test(port) && Number(port) <= 65535;
}

function productionHost(raw: string): { host: string } | { error: string } {
  const text = raw.trim().toLowerCase().replace(/\.$/, '');
  const colon = text.lastIndexOf(':');
  const name = colon === -1 ? text : text.slice(0, colon);
  const port = colon === -1 ? undefined : text.slice(colon + 1);
  if (!HOST.test(name) || (port !== undefined && !validPort(port))) {
    return { error: 'Enter a host such as cdn.example.com or localhost:5173, without a scheme or path.' };
  }
  return { host: port ? `${name}:${port}` : name };
}

function originOf(raw: string): { origin: string } | { error: string } {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { error: 'Enter an origin such as http://localhost:5173.' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { error: 'Use http:// or https://.' };
  if (url.username || url.password) return { error: 'Leave out the username and password.' };
  if (url.pathname !== '/' || url.search || url.hash) return { error: 'Leave off the path. Use an origin such as http://localhost:5173.' };
  return { origin: url.origin };
}

function makeRule(newId: () => string, partial: Pick<Rule, 'match' | 'action' | 'resourceTypes' | 'note'>): Rule {
  return { id: newId(), enabled: true, ...partial };
}

function checked(group: Group): Built {
  const parsed = parseWorkspace({ groups: [group] });
  if (!parsed.ok) return fail({ form: parsed.errors[0] ?? 'This recipe is not a valid group.' });
  for (const item of group.rules) {
    if (!isDnrAction(item.action)) continue;
    const compiled = compileRule(item);
    if (!compiled.ok) return fail({ form: compiled.message });
  }
  return { ok: true, group };
}

function localhost(values: Record<string, string>, newId: () => string): Built {
  const host = productionHost(values.host ?? '');
  if ('error' in host) return fail({ host: host.error });
  const origin = originOf(values.origin ?? '');
  if ('error' in origin) return fail({ origin: origin.error });
  if (['http', 'https'].some((scheme) => `${scheme}://${host.host}` === origin.origin)) {
    return fail({ origin: 'That would redirect the local server to itself.' });
  }
  const note = 'Recipe: point this host at a local server.';
  return checked({
    id: newId(),
    name: `${host.host} → ${new URL(origin.origin).host}`,
    enabled: true,
    rules: (['https', 'http'] as const).map((scheme) =>
      makeRule(newId, {
        match: { kind: 'glob', pattern: `${scheme}://${host.host}/*` },
        action: { type: 'redirect', to: `${origin.origin}/*` },
        resourceTypes: [...RESOURCE_TYPES],
        note,
      }),
    ),
  });
}

function cors(values: Record<string, string>, newId: () => string): Built {
  const pattern = (values.pattern ?? '').trim();
  if (pattern === '') return fail({ pattern: 'Enter a pattern. Use * for every URL.' });
  if (!PRINTABLE_ASCII.test(pattern)) return fail({ pattern: 'Patterns must be ASCII.' });
  const shown = pattern.length > 48 ? `${pattern.slice(0, 48)}…` : pattern;
  return checked({
    id: newId(),
    name: pattern === '*' ? 'Allow CORS' : `Allow CORS for ${shown}`,
    enabled: true,
    rules: [
      makeRule(newId, {
        match: { kind: 'glob', pattern },
        action: {
          type: 'modifyHeaders',
          request: [],
          response: [
            { op: 'set', name: 'access-control-allow-origin', value: '*' },
            { op: 'set', name: 'access-control-allow-methods', value: 'GET, POST, PUT, PATCH, DELETE, OPTIONS' },
            { op: 'set', name: 'access-control-allow-headers', value: '*' },
          ],
        },
        resourceTypes: [...RESOURCE_TYPES],
        note: 'Recipe: allow CORS on responses. Does not answer OPTIONS by itself.',
      }),
    ],
  });
}

function spa(values: Record<string, string>, newId: () => string): Built {
  const origin = originOf(values.origin ?? '');
  if ('error' in origin) return fail({ origin: origin.error });
  const literal = origin.origin.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  return checked({
    id: newId(),
    name: `SPA fallback for ${new URL(origin.origin).host}`,
    enabled: true,
    rules: [
      makeRule(newId, {
        match: { kind: 'regex', pattern: `^${literal}/[^.]*$` },
        action: { type: 'redirect', to: `${origin.origin}/index.html` },
        resourceTypes: ['main_frame'],
        note: 'Recipe: page loads without a file extension go to index.html.',
      }),
    ],
  });
}

export function buildRecipe(recipeId: string, values: Record<string, string>, newId: () => string): Built {
  switch (recipeId) {
    case 'localhost':
      return localhost(values, newId);
    case 'cors':
      return cors(values, newId);
    case 'spa':
      return spa(values, newId);
    default:
      return fail({ form: 'Unknown recipe.' });
  }
}

/** Appends a recipe group. The caller saves; this does not write storage. */
export function installRecipe(workspace: Workspace, recipeId: string, values: Record<string, string>, newId: () => string): Installed {
  const built = buildRecipe(recipeId, values, newId);
  if (!built.ok) return built;
  return { ok: true, workspace: addGroup(workspace, built.group), group: built.group };
}
