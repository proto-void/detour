import type { Workspace } from '../rule-model/schema';
import { describeResolution, resolveProbe, type TesterView } from '../workspace-ui/tester';

export interface PreparedRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | null;
}

export type ApplyRulesOutcome =
  | {
      kind: 'network';
      request: PreparedRequest;
      view: TesterView;
      label: 'Detour rules applied (simulated)';
    }
  | {
      kind: 'blocked';
      view: TesterView;
      message: string;
      label: 'Detour rules applied (simulated)';
    }
  | {
      kind: 'mock';
      view: TesterView;
      status: number;
      body: string;
      headers: Record<string, string>;
      label: 'Detour rules applied (simulated)';
    }
  | {
      kind: 'passthrough';
      request: PreparedRequest;
      view: TesterView;
      label?: undefined;
    };

const LABEL = 'Detour rules applied (simulated)' as const;

/** Map resolveProbe into send preparation. Resource type is always xmlhttprequest. */
export function applyDetourRules(workspace: Workspace, prepared: PreparedRequest, options?: { userScripts?: boolean }): ApplyRulesOutcome {
  const resolved = resolveProbe(workspace, {
    url: prepared.url,
    method: prepared.method,
    resourceType: 'xmlhttprequest',
    userScripts: options?.userScripts ?? true,
  });
  const view = describeResolution(resolved);

  if (resolved.idle) {
    return { kind: 'passthrough', request: prepared, view };
  }

  if (resolved.request?.kind === 'block') {
    return {
      kind: 'blocked',
      view,
      message: `Blocked by rule ${resolved.request.ref.groupName}`,
      label: LABEL,
    };
  }

  if (resolved.request?.kind === 'mock') {
    return {
      kind: 'mock',
      view,
      status: resolved.request.status,
      body: resolved.request.body,
      headers: { 'content-type': 'application/json' },
      label: LABEL,
    };
  }

  let url = prepared.url;
  const headers = { ...prepared.headers };

  if (resolved.request?.kind === 'redirect') {
    url = resolved.request.to;
  }

  for (const hit of resolved.headers) {
    for (const item of hit.applied) {
      if (item.side !== 'request') continue;
      const name = item.op.name;
      if (item.op.op === 'set') headers[name] = item.op.value;
      else if (item.op.op === 'append') headers[name] = headers[name] ? `${headers[name]}, ${item.op.value}` : item.op.value;
      else if (item.op.op === 'remove') delete headers[name];
    }
  }

  const changed = url !== prepared.url || JSON.stringify(headers) !== JSON.stringify(prepared.headers);
  if (!changed && !resolved.request) {
    return { kind: 'passthrough', request: prepared, view };
  }

  return {
    kind: 'network',
    request: { ...prepared, url, headers },
    view,
    label: LABEL,
  };
}
