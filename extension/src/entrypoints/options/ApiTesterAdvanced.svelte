<script lang="ts">
  import { browser } from 'wxt/browser';
  import {
    API_CAPTURE_KEY,
    takeCapture,
  } from '../../api-client/capture';
  import {
    cookieHeaderForUrl,
    deleteCookie,
    ensureCookiesPermission,
    listCookiesForDomain,
    upsertCookie,
    type CookieEntry,
  } from '../../api-client/cookie-jar';
  import {
    FOLDER_SYNC_COPY,
    mergeFolderSyncIntoState,
    readSyncFolder,
    supportsFileSystemAccess,
    writeSyncFolder,
  } from '../../api-client/folder-sync';
  import { fieldCompletions, INTROSPECTION_QUERY, parseIntrospection, type GqlTypeDoc } from '../../api-client/graphql';
  import type { ApiClientState, ApiRequest } from '../../api-client/model';
  import { connectSse, type SseLogEntry } from '../../api-client/sse-client';
  import { renderVisualizerHtml } from '../../api-client/visualizer';
  import { connectWebSocket, type WsLogEntry } from '../../api-client/websocket-client';
  import CodeEditor from '../../ui/CodeEditor.svelte';

  let {
    apiState,
    request,
    patchRequest,
    persist,
    visualizer,
    onOpenCaptured,
  }: {
    apiState: ApiClientState;
    request: ApiRequest;
    patchRequest: (patch: Partial<ApiRequest>) => void;
    persist: (next: ApiClientState) => void | Promise<void>;
    visualizer?: { template: string; data: unknown } | null;
    onOpenCaptured: (req: ApiRequest) => void;
  } = $props();

  let panel = $state<'cookies' | 'sync' | 'live' | 'gql'>('live');
  let status = $state('');
  let cookieDomain = $state('example.com');
  let cookies = $state<CookieEntry[]>([]);
  let wsLog = $state<WsLogEntry[]>([]);
  let sseLog = $state<SseLogEntry[]>([]);
  let wsSession: { send(d: string): void; close(): void } | null = null;
  let sseSession: { close(): void } | null = null;
  let wsOut = $state('hello');
  let gqlDocs = $state<GqlTypeDoc[]>([]);

  const vizHtml = $derived(visualizer ? renderVisualizerHtml(visualizer) : '');

  async function loadCookies() {
    const perms = browser.permissions as unknown as import('../../api-client/cookie-jar').PermissionsApi;
    if (!(await ensureCookiesPermission(perms))) {
      status = 'Cookies permission was not granted.';
      return;
    }
    const api = browser.cookies as unknown as import('../../api-client/cookie-jar').CookiesApi;
    cookies = await listCookiesForDomain(api, cookieDomain);
    status = `${cookies.length} cookie(s) for ${cookieDomain}`;
  }

  async function addCookie() {
    const perms = browser.permissions as unknown as import('../../api-client/cookie-jar').PermissionsApi;
    if (!(await ensureCookiesPermission(perms))) return;
    const api = browser.cookies as unknown as import('../../api-client/cookie-jar').CookiesApi;
    await upsertCookie(api, { domain: cookieDomain, name: 'detour', value: '1', path: '/', secure: true });
    await loadCookies();
  }

  async function removeCookie(c: CookieEntry) {
    const api = browser.cookies as unknown as import('../../api-client/cookie-jar').CookiesApi;
    await deleteCookie(api, c);
    await loadCookies();
  }

  function applyCookieHeader() {
    const header = cookieHeaderForUrl(cookies, request.url);
    if (!header) {
      status = 'No matching cookies for this URL.';
      return;
    }
    const headers = [...(request.headers ?? []).filter((h) => h.key.toLowerCase() !== 'cookie'), { id: crypto.randomUUID(), key: 'Cookie', value: header, enabled: true }];
    patchRequest({ headers });
    status = 'Cookie header applied to request.';
  }

  async function syncOut() {
    if (!supportsFileSystemAccess()) {
      status = 'File System Access unavailable — use Export / Import (Firefox fallback).';
      return;
    }
    try {
      const dir = await (globalThis as unknown as { showDirectoryPicker: () => Promise<import('../../api-client/folder-sync').DirectoryHandleLike> }).showDirectoryPicker();
      await writeSyncFolder(dir, apiState);
      status = 'Wrote collections.json, environments.json, globals.json (secrets excluded).';
    } catch (err) {
      status = err instanceof Error ? err.message : String(err);
    }
  }

  async function syncIn() {
    if (!supportsFileSystemAccess()) {
      status = 'File System Access unavailable — use Import.';
      return;
    }
    try {
      const dir = await (globalThis as unknown as { showDirectoryPicker: () => Promise<import('../../api-client/folder-sync').DirectoryHandleLike> }).showDirectoryPicker();
      const files = await readSyncFolder(dir);
      await persist(mergeFolderSyncIntoState(apiState, files));
      status = 'Merged folder sync into API Tester storage.';
    } catch (err) {
      status = err instanceof Error ? err.message : String(err);
    }
  }

  async function startWs() {
    wsLog = [];
    try {
      wsSession = await connectWebSocket(request.url, { onLog: (e) => (wsLog = [...wsLog, e]) });
      status = 'WebSocket connected.';
    } catch (err) {
      status = err instanceof Error ? err.message : String(err);
    }
  }

  function sendWs() {
    wsSession?.send(wsOut);
  }

  function stopWs() {
    wsSession?.close();
    wsSession = null;
  }

  function startSse() {
    sseLog = [];
    sseSession = connectSse(request.url, { onLog: (e) => (sseLog = [...sseLog, e]) });
    status = 'SSE listening.';
  }

  function stopSse() {
    sseSession?.close();
    sseSession = null;
  }

  async function introspect() {
    try {
      const res = await fetch(request.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: INTROSPECTION_QUERY }),
      });
      const json = await res.json();
      gqlDocs = parseIntrospection(json);
      status = `Introspected ${gqlDocs.length} types.`;
    } catch (err) {
      status = err instanceof Error ? err.message : String(err);
    }
  }

  // Pick up DevTools / Log captures when opening API Tester.
  $effect(() => {
    void (async () => {
      const captured = await takeCapture(browser.storage.session);
      if (!captured) return;
      const { capturedToApiRequest } = await import('../../api-client/capture');
      onOpenCaptured(capturedToApiRequest(captured));
      status = `Opened captured request from ${captured.source ?? 'browser'}.`;
    })();
    void API_CAPTURE_KEY;
  });
</script>

<section class="adv" aria-label="API Tester advanced">
  <div class="tabs">
    <button type="button" class:active={panel === 'live'} onclick={() => (panel = 'live')}>WS / SSE</button>
    <button type="button" class:active={panel === 'gql'} onclick={() => (panel = 'gql')}>GraphQL docs</button>
    <button type="button" class:active={panel === 'cookies'} onclick={() => (panel = 'cookies')}>Cookies</button>
    <button type="button" class:active={panel === 'sync'} onclick={() => (panel = 'sync')}>Folder sync</button>
  </div>

  {#if panel === 'live'}
    <div class="row">
      <label>
        Protocol
        <select
          value={request.protocol ?? 'http'}
          onchange={(e) => patchRequest({ protocol: (e.currentTarget as HTMLSelectElement).value as ApiRequest['protocol'] })}
        >
          <option value="http">HTTP</option>
          <option value="websocket">WebSocket</option>
          <option value="sse">SSE</option>
        </select>
      </label>
      {#if (request.protocol ?? 'http') === 'websocket'}
        <button type="button" class="btn primary" onclick={() => void startWs()}>Connect</button>
        <input bind:value={wsOut} />
        <button type="button" class="btn" onclick={sendWs}>Send</button>
        <button type="button" class="btn" onclick={stopWs}>Close</button>
      {:else if request.protocol === 'sse'}
        <button type="button" class="btn primary" onclick={startSse}>Listen</button>
        <button type="button" class="btn" onclick={stopSse}>Stop</button>
      {/if}
    </div>
    <ul class="log">
      {#each wsLog as e, i (i)}
        <li class={e.direction}><time>{new Date(e.at).toLocaleTimeString()}</time> {e.direction}: {e.text}</li>
      {/each}
      {#each sseLog as e, i (i)}
        <li><time>{new Date(e.at).toLocaleTimeString()}</time> {e.event}: {e.data}</li>
      {/each}
    </ul>
  {:else if panel === 'gql'}
    <button type="button" class="btn" onclick={() => void introspect()}>Introspect schema</button>
    {#if gqlDocs.length}
      <p class="muted">Completions: {fieldCompletions(gqlDocs).slice(0, 12).join(', ')}…</p>
      <ul class="docs">
        {#each gqlDocs.slice(0, 40) as t (t.name)}
          <li><strong>{t.name}</strong> <span class="muted">{t.kind}</span> {t.description ?? ''}</li>
        {/each}
      </ul>
    {/if}
    {#if request.body?.mode === 'graphql'}
      <CodeEditor
        id="gql-query"
        label="GraphQL query"
        language="text"
        value={request.body.query}
        onchange={(query) => request.body?.mode === 'graphql' && patchRequest({ body: { ...request.body, query } })}
      />
      <CodeEditor
        id="gql-vars"
        label="Variables JSON"
        language="json"
        value={request.body.variables ?? ''}
        onchange={(variables) => request.body?.mode === 'graphql' && patchRequest({ body: { ...request.body, variables } })}
      />
    {:else}
      <button type="button" class="btn" onclick={() => patchRequest({ body: { mode: 'graphql', query: '{\n  __typename\n}\n', variables: '{}', operationName: '' } })}>Switch body to GraphQL</button>
    {/if}
  {:else if panel === 'cookies'}
    <div class="row">
      <input bind:value={cookieDomain} placeholder="domain" />
      <button type="button" class="btn" onclick={() => void loadCookies()}>Load</button>
      <button type="button" class="btn" onclick={() => void addCookie()}>Add sample</button>
      <button type="button" class="btn" onclick={applyCookieHeader}>Apply Cookie header</button>
    </div>
    <ul>
      {#each cookies as c (c.name + c.domain)}
        <li>{c.name}={c.value} <button type="button" class="btn text" onclick={() => void removeCookie(c)}>Del</button></li>
      {:else}
        <li class="muted">No cookies loaded.</li>
      {/each}
    </ul>
  {:else}
    <p class="muted">{FOLDER_SYNC_COPY}</p>
    <div class="row">
      <button type="button" class="btn primary" onclick={() => void syncOut()}>Write folder…</button>
      <button type="button" class="btn" onclick={() => void syncIn()}>Read folder…</button>
    </div>
  {/if}

  {#if vizHtml}
    <h3>Visualize</h3>
    <iframe class="viz" title="Visualizer" sandbox="" srcdoc={vizHtml}></iframe>
  {/if}
  {#if status}<p class="status" role="status">{status}</p>{/if}
</section>

<style>
  .adv {
    display: grid;
    gap: var(--space-3);
    margin-top: var(--space-3);
    padding-top: var(--space-3);
    border-top: 1px solid var(--border);
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
  .log,
  .docs {
    max-height: 12rem;
    overflow: auto;
    font-family: ui-monospace, Menlo, monospace;
    font-size: 0.8rem;
  }
  .muted {
    color: var(--muted);
  }
  .viz {
    width: 100%;
    min-height: 12rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  .status {
    margin: 0;
  }
</style>
