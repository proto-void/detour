import type { Workspace } from '../rule-model/schema';
import { applyDetourRules } from './apply-rules';
import { clonePlain } from './clone-plain';
import { splitForbiddenHeaders, withForbiddenHeaderRule, type DnrSessionApi } from './forbidden-headers';
import type { ApiRequest } from './model';
import { prepareHttp, prepareHttpAsync } from './prepare';
import { resolveApplyDetourRules } from './resolve-apply-rules';
import { runSandboxedScript, scopesToMaps } from './run-scripts';
import type { ScriptTestResult } from './scripts';
import { sendRequest, type SendProgress, type SendResponse } from './send';
import type { VariableScopes } from './variables';

export interface ExecuteRequestOptions {
  request: ApiRequest;
  scopes: VariableScopes;
  workspace: Workspace;
  /** Global Apply Detour default. */
  globalApplyDetour: boolean;
  userScripts?: boolean;
  sandboxUrl?: string;
  /** Skip scripts (scheduled background runs). */
  skipScripts?: boolean;
  dnr?: DnrSessionApi;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  onProgress?: (progress: SendProgress) => void;
}

export interface ExecuteRequestResult {
  response: SendResponse;
  tests: ScriptTestResult[];
  rulesLabel?: string;
  /** From pm.execution.setNextRequest after test (or pre) script. */
  nextRequest?: string | null;
  visualizer?: { template: string; data: unknown } | null;
  scopes: VariableScopes;
  authUpdate?: import('./model').Auth;
}

/**
 * Shared send path for API Tester, runner, load test, and scheduled runs.
 * Honors dual-scope Apply Detour via `resolveApplyDetourRules`.
 */
export async function executeApiRequest(options: ExecuteRequestOptions): Promise<ExecuteRequestResult> {
  const maps = scopesToMaps(options.scopes);
  let working: ApiRequest = clonePlain(options.request);
  let nextRequest: string | null | undefined;
  let tests: ScriptTestResult[] = [];
  let scopes = options.scopes;

  const applyEnvMutations = (env?: Record<string, string>) => {
    if (!env || !scopes.environment) return;
    scopes = {
      ...scopes,
      environment: scopes.environment.map((v) => (env[v.key] !== undefined ? { ...v, currentValue: env[v.key]! } : v)),
    };
  };

  if (!options.skipScripts && working.preRequestScript?.trim() && options.sandboxUrl) {
    const preparedProbe = prepareHttp(working, scopes);
    const pre = await runSandboxedScript({
      sandboxUrl: options.sandboxUrl,
      phase: 'prerequest',
      code: working.preRequestScript,
      context: {
        ...maps,
        request: {
          method: preparedProbe.method,
          url: preparedProbe.url,
          headers: preparedProbe.headers,
          body: preparedProbe.body,
        },
      },
    });
    applyEnvMutations(pre.mutated?.environment);
    if (pre.mutated?.request) {
      working = {
        ...working,
        method: (pre.mutated.request.method as ApiRequest['method']) ?? working.method,
        url: pre.mutated.request.url ?? working.url,
      };
    }
    if (pre.mutated && 'nextRequest' in pre.mutated) nextRequest = pre.mutated.nextRequest;
  }

  let prepared = await prepareHttpAsync(working, scopes);
  const authUpdate = prepared.authUpdate;
  let rulesLabel: string | undefined;
  let visualizer: { template: string; data: unknown } | null | undefined;
  const effectiveApply = resolveApplyDetourRules(options.globalApplyDetour, working.applyDetourRules);

  if (effectiveApply) {
    const outcome = applyDetourRules(options.workspace, prepared, { userScripts: options.userScripts });
    rulesLabel = outcome.label;
    if (outcome.kind === 'blocked') {
      return {
        response: {
          ok: false,
          status: 0,
          statusText: 'Blocked',
          headers: {},
          body: outcome.message,
          timeMs: 0,
          sizeBytes: 0,
          error: outcome.message,
        },
        tests,
        rulesLabel,
        nextRequest,
        scopes,
      };
    }
    if (outcome.kind === 'mock') {
      const mockBody = outcome.body;
      const mockRes: SendResponse = {
        ok: outcome.status >= 200 && outcome.status < 400,
        status: outcome.status,
        statusText: 'Mock',
        headers: outcome.headers,
        body: mockBody,
        timeMs: 0,
        sizeBytes: new TextEncoder().encode(mockBody).length,
      };
      if (!options.skipScripts && working.testScript?.trim() && options.sandboxUrl) {
        const test = await runSandboxedScript({
          sandboxUrl: options.sandboxUrl,
          phase: 'test',
          code: working.testScript,
          context: {
            ...scopesToMaps(scopes),
            request: { method: prepared.method, url: prepared.url, headers: prepared.headers, body: prepared.body },
            response: {
              status: mockRes.status,
              statusText: mockRes.statusText,
              headers: mockRes.headers,
              body: mockRes.body,
              responseTime: mockRes.timeMs,
            },
          },
        });
        tests = test.tests;
        applyEnvMutations(test.mutated?.environment);
        if (test.mutated && 'nextRequest' in test.mutated) nextRequest = test.mutated.nextRequest;
        if (test.mutated?.visualizer) visualizer = test.mutated.visualizer;
      }
      return { response: mockRes, tests, rulesLabel, nextRequest, visualizer, scopes, authUpdate };
    }
    if (outcome.kind === 'network') prepared = { ...prepared, ...outcome.request };
  }

  const { allowed, forbidden } = splitForbiddenHeaders(prepared.headers);
  const sendOnce = async (): Promise<SendResponse> =>
    sendRequest({
      method: prepared.method,
      url: prepared.url,
      headers: { ...allowed, ...forbidden },
      body: prepared.body,
      signal: options.signal,
      fetchImpl: options.fetchImpl,
      onProgress: options.onProgress,
    });

  const response =
    Object.keys(forbidden).length > 0 && options.dnr
      ? await withForbiddenHeaderRule(options.dnr, prepared.url, forbidden, sendOnce)
      : await sendRequest({
          method: prepared.method,
          url: prepared.url,
          headers: allowed,
          body: prepared.body,
          signal: options.signal,
          fetchImpl: options.fetchImpl,
          onProgress: options.onProgress,
        });

  if (!options.skipScripts && working.testScript?.trim() && options.sandboxUrl) {
    const test = await runSandboxedScript({
      sandboxUrl: options.sandboxUrl,
      phase: 'test',
      code: working.testScript,
      context: {
        ...scopesToMaps(scopes),
        request: { method: prepared.method, url: prepared.url, headers: prepared.headers, body: prepared.body },
        response: {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
          body: response.body,
          responseTime: response.timeMs,
        },
      },
    });
    tests = test.tests;
    applyEnvMutations(test.mutated?.environment);
    if (test.mutated && 'nextRequest' in test.mutated) nextRequest = test.mutated.nextRequest;
    if (test.mutated?.visualizer) visualizer = test.mutated.visualizer;
  }

  return { response, tests, rulesLabel, nextRequest, visualizer, scopes, authUpdate };
}
