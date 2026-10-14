import { RESOURCE_TYPES, type Rule, type Workspace } from '../rule-model/schema';
import { addGroup, addRule, newGroup } from '../workspace-ui/editor';
import type { ApiRequest } from './model';
import type { SendResponse } from './send';

export interface SaveAsMockInput {
  request: ApiRequest;
  response: SendResponse;
  /** Glob pattern; default from request URL. */
  pattern?: string;
  groupId?: string;
  groupName?: string;
  newId?: () => string;
}

export interface RedirectLocalhostInput {
  request: ApiRequest;
  /** Target localhost URL; default http://127.0.0.1:5173 + path. */
  to?: string;
  pattern?: string;
  groupId?: string;
  groupName?: string;
  newId?: () => string;
}

export interface SaveAsRuleResult {
  workspace: Workspace;
  groupId: string;
  ruleId: string;
}

/** Build a Detour mock rule from an API Tester response. */
export function buildMockRule(input: SaveAsMockInput): Rule {
  const id = input.newId?.() ?? crypto.randomUUID();
  const pattern = input.pattern ?? urlToGlob(input.request.url);
  const method = input.request.method === 'GET' || input.request.method === 'HEAD' ? input.request.method : 'ANY';
  const contentType = input.response.headers['content-type'] ?? input.response.headers['Content-Type'] ?? 'application/json';
  return {
    id,
    enabled: true,
    match: { kind: 'glob', pattern },
    resourceTypes: ['xmlhttprequest', 'other'],
    action: {
      type: 'mock',
      method: method as 'ANY' | 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS',
      status: input.response.status || 200,
      headers: [{ name: 'content-type', value: contentType.split(';')[0]!.trim() }],
      body: input.response.body,
      delayMs: 0,
    },
  };
}

/** Build a redirect-to-localhost rule from the current request URL. */
export function buildRedirectLocalhostRule(input: RedirectLocalhostInput): Rule {
  const id = input.newId?.() ?? crypto.randomUUID();
  const pattern = input.pattern ?? urlToGlob(input.request.url);
  let to = input.to;
  if (!to) {
    try {
      const u = new URL(input.request.url);
      to = `http://127.0.0.1:5173${u.pathname}${u.search}`;
    } catch {
      to = 'http://127.0.0.1:5173/';
    }
  }
  return {
    id,
    enabled: true,
    match: { kind: 'glob', pattern },
    resourceTypes: [...RESOURCE_TYPES],
    action: { type: 'redirect', to },
  };
}

export function insertRuleIntoWorkspace(
  workspace: Workspace,
  rule: Rule,
  options?: { groupId?: string; groupName?: string; newId?: () => string },
): SaveAsRuleResult {
  const newId = options?.newId ?? (() => crypto.randomUUID());
  let ws = workspace;
  let groupId = options?.groupId;
  if (!groupId || !ws.groups.some((g) => g.id === groupId)) {
    const g = newGroup(newId, options?.groupName ?? 'API Tester');
    ws = addGroup(ws, g);
    groupId = g.id;
  }
  ws = addRule(ws, groupId, rule);
  return { workspace: ws, groupId, ruleId: rule.id };
}

export function saveResponseAsMock(workspace: Workspace, input: SaveAsMockInput): SaveAsRuleResult {
  const rule = buildMockRule(input);
  return insertRuleIntoWorkspace(workspace, rule, {
    groupId: input.groupId,
    groupName: input.groupName ?? 'API Tester mocks',
    newId: input.newId,
  });
}

export function redirectRequestToLocalhost(workspace: Workspace, input: RedirectLocalhostInput): SaveAsRuleResult {
  const rule = buildRedirectLocalhostRule(input);
  return insertRuleIntoWorkspace(workspace, rule, {
    groupId: input.groupId,
    groupName: input.groupName ?? 'API Tester redirects',
    newId: input.newId,
  });
}

/** Turn an absolute URL into a useful glob (host+path, * query). */
export function urlToGlob(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`.replace(/\/$/, '') || `${u.origin}/*`;
  } catch {
    return url || '*';
  }
}
