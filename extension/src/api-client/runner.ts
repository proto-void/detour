import type { Workspace } from '../rule-model/schema';
import type { Collection, CollectionNode, ApiRequest, EnvVar, KvRow } from './model';
import { parseDataFile, type DataRow } from './data-file';
import { executeApiRequest } from './execute-request';
import type { DnrSessionApi } from './forbidden-headers';
import type { ScriptTestResult } from './scripts';
import type { SendResponse } from './send';
import type { VariableScopes } from './variables';

export const RUNS_CAP = 50;

export interface RunnerOptions {
  collection: Collection;
  /** Empty = whole collection; otherwise folder id path filter (folder id to run). */
  folderId?: string | null;
  iterations?: number;
  /** Raw CSV or JSON data file text. */
  dataFileText?: string;
  dataFileHint?: 'csv' | 'json';
  delayMs?: number;
  stopOnFail?: boolean;
  globalApplyDetour: boolean;
  workspace: Workspace;
  scopes: VariableScopes;
  sandboxUrl?: string;
  skipScripts?: boolean;
  dnr?: DnrSessionApi;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  onResult?: (row: RunnerResultRow) => void;
  /** Fired before each request with planned total (iterations × data rows × requests). */
  onProgress?: (progress: { completed: number; total: number; elapsedMs: number }) => void;
}

export interface RunnerResultRow {
  iteration: number;
  requestId: string;
  requestName: string;
  method: string;
  url: string;
  status: number;
  timeMs: number;
  ok: boolean;
  error?: string;
  tests: ScriptTestResult[];
  rulesLabel?: string;
  dataRowIndex?: number;
}

export interface RunnerReport {
  id: string;
  at: number;
  collectionId: string;
  collectionName: string;
  folderId: string | null;
  iterations: number;
  stopOnFail: boolean;
  rows: RunnerResultRow[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    durationMs: number;
  };
}

export function listRunnableRequests(collection: Collection, folderId?: string | null): ApiRequest[] {
  const root = folderId ? findFolder(collection.children ?? [], folderId) : collection.children ?? [];
  if (!root) return [];
  const out: ApiRequest[] = [];
  const walk = (nodes: CollectionNode[]) => {
    for (const node of nodes) {
      if (node.kind === 'request') out.push(node.request);
      else walk(node.children);
    }
  };
  walk(root);
  return out;
}

function findFolder(nodes: CollectionNode[], id: string): CollectionNode[] | null {
  for (const node of nodes) {
    if (node.kind === 'folder' && node.id === id) return node.children;
    if (node.kind === 'folder') {
      const hit = findFolder(node.children, id);
      if (hit) return hit;
    }
  }
  return null;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

function withDataRow(scopes: VariableScopes, row: DataRow): VariableScopes {
  const extras: EnvVar[] = Object.entries(row).map(([key, currentValue], i) => ({
    id: `data-${i}-${key}`,
    key,
    initialValue: currentValue,
    currentValue,
    secret: false,
    encrypted: null,
  }));
  return {
    ...scopes,
    environment: [...extras, ...(scopes.environment ?? [])],
  };
}

/**
 * Run collection/folder requests for N iterations (× data rows).
 * Honors stop-on-fail and `pm.execution.setNextRequest` (by request name; null stops).
 */
export async function runCollection(options: RunnerOptions): Promise<RunnerReport> {
  const started = performance.now();
  const iterations = Math.max(1, Math.min(options.iterations ?? 1, 10_000));
  const delayMs = Math.max(0, options.delayMs ?? 0);
  const dataParsed = parseDataFile(options.dataFileText ?? '', options.dataFileHint);
  if (!dataParsed.ok) throw new Error(dataParsed.error);
  const dataRows = dataParsed.rows.length > 0 ? dataParsed.rows : [{}];

  const requests = listRunnableRequests(options.collection, options.folderId);
  const byName = new Map(requests.map((r) => [r.name, r]));
  const rows: RunnerResultRow[] = [];
  let scopes = options.scopes;
  const plannedTotal = Math.max(1, iterations * dataRows.length * Math.max(1, requests.length));
  options.onProgress?.({ completed: 0, total: plannedTotal, elapsedMs: 0 });

  for (let iter = 1; iter <= iterations; iter++) {
    for (let di = 0; di < dataRows.length; di++) {
      const dataRow = dataRows[di]!;
      let i = 0;
      const visited = new Set<string>();
      while (i < requests.length) {
        options.signal?.throwIfAborted?.();
        const req = requests[i]!;
        const visitKey = `${iter}:${di}:${req.id}:${i}`;
        if (visited.has(visitKey)) break;
        visited.add(visitKey);

        const result = await executeApiRequest({
          request: req,
          scopes: withDataRow(scopes, dataRow),
          workspace: options.workspace,
          globalApplyDetour: options.globalApplyDetour,
          sandboxUrl: options.sandboxUrl,
          skipScripts: options.skipScripts,
          dnr: options.dnr,
          fetchImpl: options.fetchImpl,
          signal: options.signal,
          userScripts: true,
        });
        scopes = result.scopes;

        const row: RunnerResultRow = {
          iteration: iter,
          requestId: req.id,
          requestName: req.name,
          method: req.method,
          url: result.response.error ? req.url : summarizeUrl(result.response, req),
          status: result.response.status,
          timeMs: result.response.timeMs,
          ok: result.response.ok && result.tests.every((t) => t.passed),
          error: result.response.error,
          tests: result.tests,
          rulesLabel: result.rulesLabel,
          dataRowIndex: dataRows.length > 1 ? di : undefined,
        };
        rows.push(row);
        options.onResult?.(row);
        options.onProgress?.({
          completed: rows.length,
          total: Math.max(plannedTotal, rows.length),
          elapsedMs: Math.round(performance.now() - started),
        });

        if (options.stopOnFail && !row.ok) {
          return finish(options, rows, started, iterations);
        }

        if (result.nextRequest === null) {
          // Explicit stop
          i = requests.length;
          break;
        }
        if (typeof result.nextRequest === 'string' && result.nextRequest) {
          const target = byName.get(result.nextRequest);
          if (!target) {
            i = requests.length;
            break;
          }
          i = requests.findIndex((r) => r.id === target.id);
          if (i < 0) break;
          if (delayMs) await sleep(delayMs, options.signal);
          continue;
        }

        i += 1;
        if (delayMs && i < requests.length) await sleep(delayMs, options.signal);
      }
      if (delayMs && di < dataRows.length - 1) await sleep(delayMs, options.signal);
    }
    if (delayMs && iter < iterations) await sleep(delayMs, options.signal);
  }

  return finish(options, rows, started, iterations);
}

function summarizeUrl(response: SendResponse, req: ApiRequest): string {
  void response;
  return req.url;
}

function finish(options: RunnerOptions, rows: RunnerResultRow[], started: number, iterations: number): RunnerReport {
  const passed = rows.filter((r) => r.ok).length;
  const report: RunnerReport = {
    id: crypto.randomUUID(),
    at: Date.now(),
    collectionId: options.collection.id,
    collectionName: options.collection.name,
    folderId: options.folderId ?? null,
    iterations,
    stopOnFail: options.stopOnFail ?? false,
    rows,
    summary: {
      total: rows.length,
      passed,
      failed: rows.length - passed,
      durationMs: Math.round(performance.now() - started),
    },
  };
  return report;
}

/** Strip live-only fields for `apiRuns` storage (valibot schema). */
export function toStoredReport(report: RunnerReport): {
  id: string;
  at: number;
  collectionId: string;
  collectionName: string;
  folderId: string | null;
  iterations: number;
  stopOnFail: boolean;
  rows: Omit<RunnerResultRow, 'tests' | 'rulesLabel'>[];
  summary: RunnerReport['summary'];
} {
  return {
    id: report.id,
    at: report.at,
    collectionId: report.collectionId,
    collectionName: report.collectionName,
    folderId: report.folderId ?? null,
    iterations: report.iterations,
    stopOnFail: report.stopOnFail,
    rows: report.rows.map(({ tests: _t, rulesLabel: _r, ...row }) => row),
    summary: report.summary,
  };
}

export function exportReportJson(report: RunnerReport): string {
  return JSON.stringify(report, null, 2);
}

export function exportReportHtml(report: RunnerReport): string {
  const rows = report.rows
    .map(
      (r) =>
        `<tr class="${r.ok ? 'ok' : 'fail'}"><td>${r.iteration}</td><td>${escapeHtml(r.requestName)}</td><td>${escapeHtml(r.method)}</td><td>${r.status}</td><td>${r.timeMs}</td><td>${r.ok ? 'pass' : 'fail'}</td></tr>`,
    )
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Run ${escapeHtml(report.collectionName)}</title>
<style>body{font-family:system-ui;padding:1rem}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:.35rem}.fail{background:#fee}.ok{background:#efe}</style>
</head><body>
<h1>${escapeHtml(report.collectionName)}</h1>
<p>${report.summary.passed}/${report.summary.total} passed · ${report.summary.durationMs} ms · ${new Date(report.at).toISOString()}</p>
<table><thead><tr><th>Iter</th><th>Request</th><th>Method</th><th>Status</th><th>ms</th><th>Result</th></tr></thead><tbody>${rows}</tbody></table>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function capRuns<T>(runs: T[], cap = RUNS_CAP): T[] {
  return runs.slice(0, cap);
}

/** @internal re-export for tests */
export type { KvRow };
