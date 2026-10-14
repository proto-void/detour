/** Sandboxed script runner protocol (null-origin iframe ↔ host via postMessage). */

export const SCRIPT_TIMEOUT_MS = 5_000;

export type ScriptPhase = 'prerequest' | 'test';

export interface ScriptRunRequest {
  type: 'detour-api-script-run';
  id: string;
  phase: ScriptPhase;
  code: string;
  /** Serializable pm context snapshot. */
  context: {
    environment: Record<string, string>;
    collectionVariables: Record<string, string>;
    globals: Record<string, string>;
    request: {
      method: string;
      url: string;
      headers: Record<string, string>;
      body: string | null;
    };
    response?: {
      status: number;
      statusText: string;
      headers: Record<string, string>;
      body: string;
      responseTime: number;
    };
  };
}

export interface ScriptTestResult {
  name: string;
  passed: boolean;
  error?: string;
}

export interface ScriptRunResult {
  type: 'detour-api-script-result';
  id: string;
  ok: boolean;
  error?: string;
  tests: ScriptTestResult[];
  /** Mutations from pre-request / test scripts. */
  mutated?: {
    environment?: Record<string, string>;
    collectionVariables?: Record<string, string>;
    globals?: Record<string, string>;
    request?: {
      method?: string;
      url?: string;
      headers?: Record<string, string>;
      body?: string | null;
    };
    /** From `pm.execution.setNextRequest` — null means stop the runner. */
    nextRequest?: string | null;
    /** From `pm.visualizer.set(template, data)`. */
    visualizer?: { template: string; data: unknown } | null;
  };
}

export function isScriptRunResult(data: unknown): data is ScriptRunResult {
  return !!data && typeof data === 'object' && (data as ScriptRunResult).type === 'detour-api-script-result';
}

/**
 * Race a script result against a hard timeout. The host must still tear down the iframe.
 * Does not grant the sandbox any extension APIs.
 */
export function withScriptTimeout<T>(promise: Promise<T>, timeoutMs = SCRIPT_TIMEOUT_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Script timed out after ${timeoutMs} ms`)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
