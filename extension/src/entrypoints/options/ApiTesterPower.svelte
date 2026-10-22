<script lang="ts">
  import { browser } from 'wxt/browser';
  import { CODEGEN_TARGETS, generateCode, type CodegenTarget } from '../../api-client/codegen';
  import { diffResponses } from '../../api-client/diff';
  import { exportDocsHtml, exportDocsMarkdown } from '../../api-client/docs-export';
  import { importHar } from '../../api-client/har';
  import { LOAD_TEST_SAFE_CAP, runLoadTest, type LoadTestStats } from '../../api-client/load-test';
  import type { ApiClientState, ApiRequest, Collection } from '../../api-client/model';
  import { importOpenApi } from '../../api-client/openapi';
  import {
    exportReportHtml,
    exportReportJson,
    runCollection,
    toStoredReport,
    type RunnerReport,
    type RunnerResultRow,
  } from '../../api-client/runner';
  import {
    alarmNameFor,
    MIN_INTERVAL_MINUTES,
    normalizePeriodMinutes,
    SCHEDULE_BROWSER_OPEN_COPY,
    type ApiSchedule,
  } from '../../api-client/schedule';
  import { redirectRequestToLocalhost, saveResponseAsMock } from '../../api-client/save-as-rule';
  import type { SendResponse } from '../../api-client/send';
  import {
    estimateIterationEtaMs,
    formatRunnerProgressLabel,
    type IterationProgress,
  } from '../../api-client/send-progress';
  import type { VariableScopes } from '../../api-client/variables';
  import type { Workspace } from '../../rule-model/schema';
  import Field from '../../ui/Field.svelte';

  let {
    apiState,
    request,
    response,
    workspace,
    varScopes,
    sandboxUrl,
    globalApply,
    persist,
    onWorkspaceChange,
  }: {
    apiState: ApiClientState;
    request: ApiRequest;
    response: SendResponse | null;
    workspace: Workspace;
    varScopes: VariableScopes;
    sandboxUrl: string;
    globalApply: boolean;
    persist: (next: ApiClientState) => Promise<void> | void;
    onWorkspaceChange: (next: Workspace, focus: { groupId: string; ruleId: string }) => void;
  } = $props();

  type Panel = 'runner' | 'load' | 'schedule' | 'code' | 'diff' | 'import' | 'docs';
  let panel = $state<Panel>('runner');
  let iterations = $state(1);
  let delayMs = $state(0);
  let stopOnFail = $state(true);
  let dataFileText = $state('');
  let running = $state(false);
  let runnerProgress = $state<IterationProgress | null>(null);
  let liveRows = $state<RunnerResultRow[]>([]);
  let lastReport = $state<RunnerReport | null>(null);
  let statusMessage = $state('');

  const runnerProgressLabel = $derived.by(() => {
    if (!runnerProgress) return '';
    return formatRunnerProgressLabel(runnerProgress, estimateIterationEtaMs(runnerProgress));
  });
  const runnerFraction = $derived(
    runnerProgress && runnerProgress.total > 0
      ? Math.min(1, runnerProgress.completed / runnerProgress.total)
      : null,
  );

  let loadCount = $state(20);
  let loadConcurrency = $state(5);
  let loadStats = $state<LoadTestStats | null>(null);

  let codegenTarget = $state<CodegenTarget>('fetch');
  let diffLeft = $state('');
  let diffRight = $state('');
  let importText = $state('');
  let scheduleName = $state('Hourly collection');
  let scheduleMinutes = $state(60);
  let scheduleNotify = $state(false);

  const activeCollection = $derived(apiState.collections[0] ?? null);
  const codegen = $derived(generateCode(request, codegenTarget, varScopes));
  const diffResult = $derived(diffLeft || diffRight ? diffResponses(diffLeft, diffRight) : null);

  async function startRunner() {
    if (!activeCollection || running) return;
    running = true;
    liveRows = [];
    runnerProgress = { completed: 0, total: 1, elapsedMs: 0 };
    statusMessage = '';
    try {
      const dnr = browser.declarativeNetRequest as unknown as import('../../api-client/forbidden-headers').DnrSessionApi;
      const report = await runCollection({
        collection: activeCollection,
        iterations,
        delayMs,
        stopOnFail,
        dataFileText: dataFileText.trim() || undefined,
        globalApplyDetour: globalApply,
        workspace,
        scopes: varScopes,
        sandboxUrl,
        dnr,
        onResult: (row) => {
          liveRows = [...liveRows, row];
        },
        onProgress: (p) => {
          runnerProgress = p;
        },
      });
      lastReport = report;
      await persist({ ...apiState, runs: [toStoredReport(report), ...(apiState.runs ?? [])].slice(0, 50) });
      statusMessage = `${report.summary.passed}/${report.summary.total} passed in ${report.summary.durationMs} ms`;
    } catch (err) {
      statusMessage = err instanceof Error ? err.message : String(err);
    } finally {
      running = false;
      runnerProgress = null;
    }
  }

  function download(filename: string, text: string, type: string) {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function startLoad() {
    if (running) return;
    running = true;
    loadStats = null;
    try {
      if (loadCount > LOAD_TEST_SAFE_CAP) {
        statusMessage = `Warning: ${loadCount} exceeds the safe cap of ${LOAD_TEST_SAFE_CAP}. Continuing with a hard ceiling.`;
      }
      const dnr = browser.declarativeNetRequest as unknown as import('../../api-client/forbidden-headers').DnrSessionApi;
      loadStats = await runLoadTest({
        request,
        count: loadCount,
        concurrency: loadConcurrency,
        globalApplyDetour: globalApply,
        workspace,
        scopes: varScopes,
        dnr,
      });
      statusMessage = `Load: p50 ${loadStats.p50} ms · p95 ${loadStats.p95} · p99 ${loadStats.p99} · error ${(loadStats.errorRate * 100).toFixed(1)}% · ${loadStats.rps.toFixed(1)} RPS`;
    } catch (err) {
      statusMessage = err instanceof Error ? err.message : String(err);
    } finally {
      running = false;
    }
  }

  async function addSchedule() {
    if (!activeCollection) {
      statusMessage = 'Create a collection first.';
      return;
    }
    const schedule: ApiSchedule = {
      id: crypto.randomUUID(),
      name: scheduleName.trim() || 'Scheduled run',
      collectionId: activeCollection.id,
      folderId: null,
      periodMinutes: normalizePeriodMinutes(scheduleMinutes),
      enabled: true,
      notifyOnFail: scheduleNotify,
      createdAt: Date.now(),
    };
    if (scheduleNotify) {
      try {
        await browser.permissions.request({ permissions: ['notifications'] });
      } catch {
        /* optional */
      }
    }
    try {
      await browser.alarms.create(alarmNameFor(schedule.id), { periodInMinutes: schedule.periodMinutes });
    } catch (err) {
      statusMessage = err instanceof Error ? err.message : String(err);
      return;
    }
    await persist({ ...apiState, schedules: [...(apiState.schedules ?? []), schedule] });
    statusMessage = 'Schedule saved. ' + SCHEDULE_BROWSER_OPEN_COPY;
  }

  async function removeSchedule(id: string) {
    try {
      await browser.alarms.clear(alarmNameFor(id));
    } catch {
      /* ignore */
    }
    await persist({ ...apiState, schedules: (apiState.schedules ?? []).filter((s) => s.id !== id) });
  }

  function saveAsMock() {
    if (!response) {
      statusMessage = 'Send a request first.';
      return;
    }
    const result = saveResponseAsMock(workspace, { request, response });
    onWorkspaceChange(result.workspace, { groupId: result.groupId, ruleId: result.ruleId });
    statusMessage = 'Mock rule added — opening Rules.';
  }

  function saveAsRedirect() {
    const result = redirectRequestToLocalhost(workspace, { request });
    onWorkspaceChange(result.workspace, { groupId: result.groupId, ruleId: result.ruleId });
    statusMessage = 'Redirect rule added — opening Rules.';
  }

  function runImportPower() {
    const text = importText.trim();
    if (!text) return;
    const oas = importOpenApi(text);
    if (oas.ok) {
      void persist({ ...apiState, collections: [...apiState.collections, oas.collection] });
      statusMessage = `Imported OpenAPI collection “${oas.collection.name}”.`;
      importText = '';
      return;
    }
    const har = importHar(text);
    if (har.ok) {
      void persist({ ...apiState, collections: [...apiState.collections, har.collection] });
      statusMessage = `Imported HAR collection “${har.collection.name}”.`;
      importText = '';
      return;
    }
    statusMessage = `Import failed. OpenAPI: ${oas.error}. HAR: ${har.error}`;
  }

  function exportDocs(kind: 'md' | 'html') {
    const col = activeCollection;
    if (!col) {
      statusMessage = 'No collection to export.';
      return;
    }
    if (kind === 'md') download(`${col.name || 'api'}.md`, exportDocsMarkdown(col), 'text/markdown');
    else download(`${col.name || 'api'}.html`, exportDocsHtml(col), 'text/html');
  }

  function fillDiffFromResponse() {
    if (!response) return;
    diffRight = response.body;
  }

  function fillDiffFromHistory() {
    const entry = apiState.history[0];
    if (entry?.bodyPreview) diffLeft = entry.bodyPreview;
  }
</script>

<section class="power" aria-label="API Tester power tools">
  <div class="tabs" role="tablist">
    <button type="button" class:active={panel === 'runner'} onclick={() => (panel = 'runner')}>Runner</button>
    <button type="button" class:active={panel === 'load'} onclick={() => (panel = 'load')}>Load</button>
    <button type="button" class:active={panel === 'schedule'} onclick={() => (panel = 'schedule')}>Schedule</button>
    <button type="button" class:active={panel === 'code'} onclick={() => (panel = 'code')}>Code</button>
    <button type="button" class:active={panel === 'diff'} onclick={() => (panel = 'diff')}>Diff</button>
    <button type="button" class:active={panel === 'import'} onclick={() => (panel = 'import')}>OpenAPI / HAR</button>
    <button type="button" class:active={panel === 'docs'} onclick={() => (panel = 'docs')}>Docs</button>
  </div>

  {#if panel === 'runner'}
    <div class="row">
      <label>Iterations <input type="number" min="1" max="1000" bind:value={iterations} /></label>
      <label>Delay ms <input type="number" min="0" bind:value={delayMs} /></label>
      <label><input type="checkbox" bind:checked={stopOnFail} /> Stop on fail</label>
      <button
        type="button"
        class="btn primary"
        disabled={running || !activeCollection}
        aria-busy={running}
        onclick={() => void startRunner()}
      >
        {running ? 'Running…' : 'Run collection'}
      </button>
      {#if lastReport}
        <button type="button" class="btn" onclick={() => download('run-report.json', exportReportJson(lastReport!), 'application/json')}>Export JSON</button>
        <button type="button" class="btn" onclick={() => download('run-report.html', exportReportHtml(lastReport!), 'text/html')}>Export HTML</button>
      {/if}
    </div>
    {#if running && runnerProgress}
      <div class="run-progress" role="status" aria-live="polite" aria-busy="true" data-testid="runner-progress">
        <div class="run-progress-track" aria-hidden="true">
          <div
            class="run-progress-bar"
            class:indeterminate={runnerFraction == null || runnerProgress.completed === 0}
            style={runnerFraction != null && runnerProgress.completed > 0
              ? `width: ${Math.round(runnerFraction * 100)}%`
              : undefined}
          ></div>
        </div>
        <p class="run-progress-label">{runnerProgressLabel}</p>
      </div>
    {/if}
    <Field id="data-file" label="Data file (CSV or JSON array)" hint="Optional. Each row becomes environment vars for that iteration.">
      {#snippet children()}
        <textarea id="data-file" rows="3" bind:value={dataFileText} placeholder={'name,id\nalice,1'}></textarea>
      {/snippet}
    </Field>
    <p class="muted">Uses dual-scope Apply Detour rules per request. Active collection: {activeCollection?.name ?? 'none'}.</p>
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>Iter</th><th>Name</th><th>Status</th><th>ms</th><th>Result</th></tr>
        </thead>
        <tbody>
          {#each liveRows as row, i (i)}
            <tr class:fail={!row.ok}>
              <td>{row.iteration}</td>
              <td>{row.requestName}</td>
              <td>{row.status}</td>
              <td>{row.timeMs}</td>
              <td>{row.ok ? 'pass' : 'fail'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    {#if (apiState.runs ?? []).length}
      <h3>Past runs</h3>
      <ul>
        {#each apiState.runs ?? [] as run (run.id)}
          <li>
            {new Date(run.at).toLocaleString()} — {run.collectionName}: {run.summary.passed}/{run.summary.total}
            <button type="button" class="btn text" onclick={() => download(`run-${run.id}.json`, exportReportJson(run as RunnerReport), 'application/json')}>JSON</button>
          </li>
        {/each}
      </ul>
    {/if}
  {:else if panel === 'load'}
    <div class="row">
      <label>Count <input type="number" min="1" max="1000" bind:value={loadCount} /></label>
      <label>Concurrency <input type="number" min="1" max="50" bind:value={loadConcurrency} /></label>
      <button type="button" class="btn primary" disabled={running} onclick={() => void startLoad()}>Run load test</button>
    </div>
    {#if loadCount > LOAD_TEST_SAFE_CAP}
      <p class="warn">Safe cap is {LOAD_TEST_SAFE_CAP}. Higher counts may freeze the UI.</p>
    {/if}
    {#if loadStats}
      <ul class="stats">
        <li>p50: {loadStats.p50} ms</li>
        <li>p95: {loadStats.p95} ms</li>
        <li>p99: {loadStats.p99} ms</li>
        <li>Errors: {(loadStats.errorRate * 100).toFixed(1)}%</li>
        <li>RPS: {loadStats.rps.toFixed(2)}</li>
      </ul>
    {/if}
  {:else if panel === 'schedule'}
    <p class="warn">{SCHEDULE_BROWSER_OPEN_COPY}</p>
    <div class="row">
      <input bind:value={scheduleName} placeholder="Name" />
      <label>Every <input type="number" min={MIN_INTERVAL_MINUTES} bind:value={scheduleMinutes} /> min</label>
      <label><input type="checkbox" bind:checked={scheduleNotify} /> Notify on failure</label>
      <button type="button" class="btn primary" onclick={() => void addSchedule()}>Add schedule</button>
    </div>
    <ul>
      {#each apiState.schedules ?? [] as s (s.id)}
        <li>
          {s.name} — every {s.periodMinutes} min {s.notifyOnFail ? '(notify)' : ''}
          <button type="button" class="btn text" onclick={() => void removeSchedule(s.id)}>Remove</button>
        </li>
      {:else}
        <li class="muted">No schedules yet.</li>
      {/each}
    </ul>
  {:else if panel === 'code'}
    <div class="row">
      <select aria-label="Code target" bind:value={codegenTarget}>
        {#each CODEGEN_TARGETS as t (t)}
          <option value={t}>{t}</option>
        {/each}
      </select>
      <button type="button" class="btn" onclick={() => void navigator.clipboard.writeText(codegen)}>Copy</button>
    </div>
    <pre class="code">{codegen}</pre>
  {:else if panel === 'diff'}
    <div class="row">
      <button type="button" class="btn" onclick={fillDiffFromHistory}>Left = latest history body</button>
      <button type="button" class="btn" onclick={fillDiffFromResponse}>Right = current response</button>
    </div>
    <div class="diff-grid">
      <textarea rows="8" bind:value={diffLeft} placeholder="Left response"></textarea>
      <textarea rows="8" bind:value={diffRight} placeholder="Right response"></textarea>
    </div>
    {#if diffResult}
      <p class="muted">{diffResult.mode} · {diffResult.equal ? 'identical' : 'differences'}</p>
      <ul class="diff">
        {#each diffResult.lines.filter((l) => l.kind !== 'equal') as line, i (i)}
          <li class={line.kind}>
            <code>{line.path}</code>
            {#if line.left !== undefined}<span class="left">{line.left}</span>{/if}
            {#if line.right !== undefined}<span class="right">{line.right}</span>{/if}
          </li>
        {/each}
      </ul>
    {/if}
  {:else if panel === 'import'}
    <textarea rows="8" bind:value={importText} placeholder="Paste OpenAPI 3 / Swagger 2 (JSON or YAML) or HAR JSON"></textarea>
    <button type="button" class="btn primary" onclick={runImportPower}>Import</button>
  {:else}
    <div class="row">
      <button type="button" class="btn" onclick={() => exportDocs('md')}>Export Markdown</button>
      <button type="button" class="btn" onclick={() => exportDocs('html')}>Export HTML</button>
    </div>
  {/if}

  <div class="synergy row">
    <button type="button" class="btn" onclick={saveAsMock}>Save response as Detour mock</button>
    <button type="button" class="btn" onclick={saveAsRedirect}>Redirect this to localhost</button>
  </div>
  {#if statusMessage}<p class="status" role="status">{statusMessage}</p>{/if}
</section>

<style>
  .power {
    display: grid;
    gap: var(--space-3);
    margin-top: var(--space-3);
    padding-top: var(--space-3);
    border-top: 1px solid var(--border);
  }
  .run-progress {
    display: grid;
    gap: 0.35rem;
    padding: 0.5rem 0.65rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface-2, var(--surface));
  }
  .run-progress-track {
    height: 0.35rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--border) 70%, transparent);
    overflow: hidden;
  }
  .run-progress-bar {
    height: 100%;
    border-radius: 999px;
    background: var(--accent, #3b82f6);
    max-width: 100%;
    transition: width 0.15s ease-out;
  }
  .run-progress-bar.indeterminate {
    width: 35%;
    animation: run-progress-pulse 1.1s ease-in-out infinite;
  }
  .run-progress-label {
    margin: 0;
    font-size: 0.85rem;
    color: var(--text-muted);
  }
  @keyframes run-progress-pulse {
    0% {
      transform: translateX(0);
      opacity: 0.55;
    }
    50% {
      transform: translateX(180%);
      opacity: 1;
    }
    100% {
      transform: translateX(0);
      opacity: 0.55;
    }
  }
  .tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }
  .tabs button {
    border: 1px solid var(--border);
    background: var(--surface);
    padding: 0.25rem 0.5rem;
    border-radius: var(--radius);
    cursor: pointer;
  }
  .tabs button.active {
    border-color: var(--accent, #3b82f6);
    font-weight: 600;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    align-items: center;
  }
  .table-wrap {
    overflow: auto;
    max-height: 16rem;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
  }
  th,
  td {
    border: 1px solid var(--border);
    padding: 0.25rem 0.4rem;
    text-align: left;
  }
  tr.fail {
    background: color-mix(in srgb, #ef4444 12%, transparent);
  }
  .muted {
    color: var(--muted);
    margin: 0;
  }
  .warn {
    color: #b45309;
    margin: 0;
  }
  .code {
    margin: 0;
    padding: var(--space-2);
    overflow: auto;
    max-height: 18rem;
    background: var(--code-bg, #111);
    color: var(--code-fg, #eee);
    border-radius: var(--radius);
    font-size: 0.8rem;
  }
  .diff-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-2);
  }
  textarea {
    width: 100%;
    font-family: ui-monospace, Menlo, monospace;
    font-size: 0.8rem;
  }
  .diff .added .right {
    color: #15803d;
  }
  .diff .removed .left {
    color: #b91c1c;
  }
  .diff .changed .left {
    color: #b91c1c;
  }
  .diff .changed .right {
    color: #15803d;
  }
  .stats {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    list-style: none;
    padding: 0;
  }
  .status {
    margin: 0;
  }
  .synergy {
    padding-top: var(--space-2);
    border-top: 1px dashed var(--border);
  }
</style>
