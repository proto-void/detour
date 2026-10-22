import type { Workspace } from '../rule-model/schema';
import { executeApiRequest } from './execute-request';
import type { DnrSessionApi } from './forbidden-headers';
import type { ApiRequest } from './model';
import type { VariableScopes } from './variables';

/** Soft safety cap — UI must warn when requesting more. */
export const LOAD_TEST_SAFE_CAP = 200;
export const LOAD_TEST_HARD_CAP = 1_000;

export interface LoadTestOptions {
  request: ApiRequest;
  count: number;
  concurrency: number;
  globalApplyDetour: boolean;
  workspace: Workspace;
  scopes: VariableScopes;
  sandboxUrl?: string;
  dnr?: DnrSessionApi;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
}

export interface LoadTestStats {
  count: number;
  concurrency: number;
  capped: boolean;
  warned: boolean;
  ok: number;
  failed: number;
  errorRate: number;
  rps: number;
  durationMs: number;
  p50: number;
  p95: number;
  p99: number;
  latenciesMs: number[];
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)]!;
}

/**
 * Fire one request N times with limited concurrency.
 * Scripts are skipped for load tests (timing noise); Detour apply still runs.
 */
export async function runLoadTest(options: LoadTestOptions): Promise<LoadTestStats> {
  const warned = options.count > LOAD_TEST_SAFE_CAP;
  const count = Math.max(1, Math.min(options.count, LOAD_TEST_HARD_CAP));
  const concurrency = Math.max(1, Math.min(options.concurrency, count, 50));
  const capped = count < options.count;
  const latencies: number[] = [];
  let ok = 0;
  let failed = 0;
  let done = 0;
  const started = performance.now();

  let next = 0;
  const worker = async () => {
    while (true) {
      const i = next++;
      if (i >= count) return;
      options.signal?.throwIfAborted?.();
      const result = await executeApiRequest({
        request: options.request,
        scopes: options.scopes,
        workspace: options.workspace,
        globalApplyDetour: options.globalApplyDetour,
        skipScripts: true,
        dnr: options.dnr,
        fetchImpl: options.fetchImpl,
        signal: options.signal,
        userScripts: true,
      });
      latencies.push(result.response.timeMs);
      if (result.response.ok) ok += 1;
      else failed += 1;
      done += 1;
      options.onProgress?.(done, count);
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  const durationMs = Math.max(1, Math.round(performance.now() - started));
  const sorted = [...latencies].sort((a, b) => a - b);

  return {
    count,
    concurrency,
    capped,
    warned,
    ok,
    failed,
    errorRate: count === 0 ? 0 : failed / count,
    rps: (count / durationMs) * 1000,
    durationMs,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    latenciesMs: latencies,
  };
}
