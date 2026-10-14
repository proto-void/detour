<script lang="ts">
  import { browser } from 'wxt/browser';
  import { applyDetourRules } from '../../api-client/apply-rules';
  import {
    addChild,
    createCollection,
    createFolder,
    createRequestNode,
    deleteNode,
    duplicateCollection,
    duplicateNode,
    renameCollection,
    renameNode,
    upsertRequest,
  } from '../../api-client/collections';
  import { clonePlain } from '../../api-client/clone-plain';
  import { looksLikeCurl, parseCurl, toCurl } from '../../api-client/curl';
  import {
    APPLY_DETOUR_MODES,
    emptyApiClientState,
    emptyRequest,
    HTTP_METHODS,
    newKvRow,
    type ApplyDetourMode,
    type ApiClientState,
    type ApiRequest,
    type Collection,
    type CollectionNode,
    type Environment,
    type KvRow,
  } from '../../api-client/model';
  import { buildDigestAuthorization, parseDigestChallenge } from '../../api-client/digest';
  import { prepareHttp, prepareHttpAsync } from '../../api-client/prepare';
  import { exportPostmanCollection, importPostmanCollection } from '../../api-client/postman';
  import { resolveApplyDetourRules } from '../../api-client/resolve-apply-rules';
  import { runSandboxedScript, scopesToMaps } from '../../api-client/run-scripts';
  import type { ScriptTestResult } from '../../api-client/scripts';
  import { decryptSecret, encryptSecret, maskSecret, type EncryptedSecret } from '../../api-client/secrets';
  import { sendRequest, type SendProgress, type SendResponse } from '../../api-client/send';
  import {
    estimateDownloadEtaMs,
    formatSendProgressLabel,
  } from '../../api-client/send-progress';
  import { loadApiClientState, pushHistory, saveApiClientState } from '../../api-client/storage';
  import { splitForbiddenHeaders, withForbiddenHeaderRule, type DnrSessionApi } from '../../api-client/forbidden-headers';
  import { highlightUrl } from '../../api-client/url-highlight';
  import type { Workspace } from '../../rule-model/schema';
  import CodeEditor from '../../ui/CodeEditor.svelte';
  import Field from '../../ui/Field.svelte';
  import { describeResolution, resolveProbe } from '../../workspace-ui/tester';
  import ApiTesterAdvanced from './ApiTesterAdvanced.svelte';
  import ApiTesterPower from './ApiTesterPower.svelte';
  import {
    authorizeCodeChrome,
    buildAuthorizeUrl,
    createPkcePair,
    exchangeAuthorizationCode,
    randomVerifier,
    type IdentityApi,
  } from '../../api-client/oauth';
  import { renderVisualizerHtml } from '../../api-client/visualizer';

  let {
    workspace,
    enabled,
    dirty,
    userScripts,
    onWorkspaceChange,
  }: {
    workspace: Workspace;
    enabled: boolean;
    dirty: boolean;
    userScripts: boolean;
    onWorkspaceChange?: (next: Workspace, focus: { groupId: string; ruleId: string }) => void;
  } = $props();

  type SubTab = 'params' | 'auth' | 'headers' | 'body' | 'scripts';
  type ResponseTab = 'body' | 'headers' | 'tests' | 'rules' | 'visualize';
  let lastVisualizer = $state<{ template: string; data: unknown } | null>(null);
  let pendingPkce = $state<{ verifier: string; challenge: string; method: string; state: string } | null>(null);
  type BodyView = 'pretty' | 'raw' | 'preview';
  type Sidebar = 'collections' | 'history' | 'environments';

  interface OpenTab {
    id: string;
    request: ApiRequest;
    savedSnapshot: string;
    response: SendResponse | null;
    testResults: ScriptTestResult[];
    rulesLabel?: string;
  }

  const area = browser.storage.local;
  const sandboxUrl = browser.runtime.getURL('/api-script-sandbox.html');
  const initialTabId = crypto.randomUUID();

  let apiState = $state<ApiClientState | null>(null);
  let tabs = $state<OpenTab[]>([
    { id: initialTabId, request: emptyRequest(crypto.randomUUID()), savedSnapshot: '', response: null, testResults: [] },
  ]);
  let activeTabId = $state<string>(initialTabId);
  let subTab = $state<SubTab>('params');
  let responseTab = $state<ResponseTab>('body');
  let bodyView = $state<BodyView>('pretty');
  let sidebar = $state<Sidebar>('collections');
  let sending = $state(false);
  let sendProgress = $state<SendProgress | null>(null);
  let statusMessage = $state('');

  const sendProgressLabel = $derived.by(() => {
    if (!sendProgress) return '';
    const eta = estimateDownloadEtaMs(
      sendProgress.bytesReceived,
      sendProgress.contentLength,
      sendProgress.elapsedMs,
    );
    return formatSendProgressLabel(sendProgress, eta);
  });
  let importOpen = $state(false);
  let importText = $state('');
  let passphrase = $state('');
  let selectedCollectionId = $state<string | null>(null);

  const activeTab = $derived(tabs.find((t) => t.id === activeTabId) ?? tabs[0]!);
  const request = $derived(activeTab.request);
  const dirtyRequest = $derived(JSON.stringify(activeTab.request) !== activeTab.savedSnapshot);
  const globalApply = $derived(apiState?.applyDetourRules !== false);
  const effectiveApply = $derived(resolveApplyDetourRules(globalApply, activeTab.request.applyDetourRules));

  const activeEnv = $derived.by(() => {
    const snap = apiState;
    if (!snap?.activeEnvironmentId) return null;
    return snap.environments.find((e) => e.id === snap.activeEnvironmentId) ?? null;
  });

  const activeCollection = $derived.by(() => {
    const snap = apiState;
    if (!snap) return null;
    if (selectedCollectionId) return snap.collections.find((c) => c.id === selectedCollectionId) ?? snap.collections[0] ?? null;
    return snap.collections[0] ?? null;
  });

  const varScopes = $derived({
    environment: activeEnv?.variables ?? [],
    collection: (activeCollection?.variables ?? []) as KvRow[],
    globals: apiState?.globals ?? [],
  });

  const urlSegments = $derived(highlightUrl(request.url, varScopes));

  const rulesView = $derived(
    describeResolution(
      resolveProbe(workspace, {
        url: request.url,
        method: request.method,
        resourceType: 'xmlhttprequest',
        userScripts,
      }),
    ),
  );
  const started = $derived(request.url.trim() !== '' && !looksLikeCurl(request.url));

  $effect(() => {
    void (async () => {
      const loaded = await loadApiClientState(area);
      if (loaded.ok) {
        apiState = loaded.value;
        selectedCollectionId = loaded.value.collections[0]?.id ?? null;
      } else {
        apiState = emptyApiClientState();
        statusMessage = loaded.errors.join(' ');
      }
      const first = tabs[0]!;
      first.savedSnapshot = JSON.stringify(first.request);
      tabs = [...tabs];
    })();
  });

  function patchActive(patch: Partial<OpenTab> | ((tab: OpenTab) => OpenTab)) {
    tabs = tabs.map((t) => {
      if (t.id !== activeTabId) return t;
      return typeof patch === 'function' ? patch(t) : { ...t, ...patch };
    });
  }

  function patchRequest(patch: Partial<ApiRequest> | ((r: ApiRequest) => ApiRequest)) {
    patchActive((t) => ({
      ...t,
      request: typeof patch === 'function' ? patch(t.request) : { ...t.request, ...patch },
    }));
  }

  async function persist(next: ApiClientState) {
    apiState = next;
    const saved = await saveApiClientState(area, next);
    if (!saved.ok) statusMessage = saved.errors.join(' ');
  }

  function setGlobalApply(next: boolean) {
    if (!apiState) return;
    void persist({ ...apiState, applyDetourRules: next });
  }

  function setPerRequestApply(mode: ApplyDetourMode) {
    patchRequest({ applyDetourRules: mode });
  }

  function setActiveEnv(id: string) {
    if (!apiState) return;
    void persist({ ...apiState, activeEnvironmentId: id || null });
  }

  function openNewTab(req?: ApiRequest) {
    const nextReq = req ?? emptyRequest(crypto.randomUUID());
    const tab: OpenTab = {
      id: crypto.randomUUID(),
      request: nextReq,
      savedSnapshot: JSON.stringify(nextReq),
      response: null,
      testResults: [],
    };
    tabs = [...tabs, tab];
    activeTabId = tab.id;
  }

  function closeTab(id: string) {
    if (tabs.length <= 1) {
      const blank = emptyRequest(crypto.randomUUID());
      tabs = [{ id: crypto.randomUUID(), request: blank, savedSnapshot: JSON.stringify(blank), response: null, testResults: [] }];
      activeTabId = tabs[0]!.id;
      return;
    }
    const idx = tabs.findIndex((t) => t.id === id);
    const next = tabs.filter((t) => t.id !== id);
    tabs = next;
    if (activeTabId === id) activeTabId = next[Math.max(0, idx - 1)]!.id;
  }

  function onUrlPaste(event: ClipboardEvent) {
    const text = event.clipboardData?.getData('text') ?? '';
    if (!looksLikeCurl(text)) return;
    event.preventDefault();
    const parsed = parseCurl(text);
    if (!parsed.ok) {
      statusMessage = parsed.error;
      return;
    }
    patchRequest({ ...parsed.request, id: request.id, name: request.name, applyDetourRules: request.applyDetourRules });
    statusMessage = 'Filled from cURL.';
  }

  function onUrlInput(value: string) {
    if (looksLikeCurl(value)) {
      const parsed = parseCurl(value);
      if (parsed.ok) {
        patchRequest({ ...parsed.request, id: request.id, name: request.name, applyDetourRules: request.applyDetourRules });
        statusMessage = 'Filled from cURL.';
        return;
      }
    }
    patchRequest({ url: value });
  }

  function addParam() {
    patchRequest({ params: [...(request.params ?? []), newKvRow(crypto.randomUUID())] });
  }
  function addHeader() {
    patchRequest({ headers: [...(request.headers ?? []), newKvRow(crypto.randomUUID())] });
  }

  function updateRow(kind: 'params' | 'headers', id: string, patch: Partial<KvRow>) {
    patchRequest({ [kind]: (request[kind] ?? []).map((r) => (r.id === id ? { ...r, ...patch } : r)) });
  }

  function removeRow(kind: 'params' | 'headers', id: string) {
    patchRequest({ [kind]: (request[kind] ?? []).filter((r) => r.id !== id) });
  }

  async function send() {
    if (!apiState || sending) return;
    sending = true;
    sendProgress = {
      phase: 'waiting',
      elapsedMs: 0,
      bytesReceived: 0,
      contentLength: null,
      fraction: null,
    };
    statusMessage = '';
    lastVisualizer = null;
    patchActive({ response: null, testResults: [], rulesLabel: undefined });
    try {
      const maps = scopesToMaps(varScopes);
      let working: ApiRequest = clonePlain(request);

      // Pre-request script
      if (working.preRequestScript?.trim()) {
        const preparedProbe = prepareHttp(working, varScopes);
        const pre = await runSandboxedScript({
          sandboxUrl,
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
        if (!pre.ok && pre.error) statusMessage = `Pre-request: ${pre.error}`;
        if (pre.mutated?.request) {
          working = {
            ...working,
            method: (pre.mutated.request.method as ApiRequest['method']) ?? working.method,
            url: pre.mutated.request.url ?? working.url,
          };
        }
        if (pre.mutated?.environment && activeEnv) {
          const environments = apiState.environments.map((env) =>
            env.id !== activeEnv.id
              ? env
              : {
                  ...env,
                  variables: env.variables.map((v) =>
                    pre.mutated!.environment![v.key] !== undefined ? { ...v, currentValue: pre.mutated!.environment![v.key]! } : v,
                  ),
                },
          );
          await persist({ ...apiState, environments });
        }
      }

      let prepared = await prepareHttpAsync(working, varScopes);
      if (prepared.authUpdate) {
        working = { ...working, auth: prepared.authUpdate };
        patchRequest({ auth: prepared.authUpdate });
      }
      let rulesLabel: string | undefined;

      if (effectiveApply) {
        const outcome = applyDetourRules(workspace, prepared, { userScripts });
        rulesLabel = outcome.label;
        if (outcome.kind === 'blocked') {
          patchActive({
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
            rulesLabel,
            testResults: [],
          });
          responseTab = 'rules';
          return;
        }
        if (outcome.kind === 'mock') {
          const mockRes: SendResponse = {
            ok: outcome.status >= 200 && outcome.status < 300,
            status: outcome.status,
            statusText: 'Mock',
            headers: outcome.headers,
            body: outcome.body,
            timeMs: 0,
            sizeBytes: new TextEncoder().encode(outcome.body).length,
          };
          const tests = await runTests(working, prepared, mockRes, maps);
          patchActive({ response: mockRes, rulesLabel, testResults: tests });
          if (!lastVisualizer) responseTab = tests.length ? 'tests' : 'body';
          const hist = await pushHistory(area, {
            id: crypto.randomUUID(),
            at: Date.now(),
            method: working.method,
            url: prepared.url,
            status: outcome.status,
            timeMs: 0,
            bodyPreview: outcome.body,
          });
          if (hist.ok) apiState = hist.value;
          return;
        }
        if (outcome.kind === 'network') prepared = { ...prepared, ...outcome.request };
      }

      const dnr = browser.declarativeNetRequest as unknown as DnrSessionApi | undefined;
      const onProgress = (p: SendProgress) => {
        sendProgress = p;
      };
      const runOnce = async (headers: Record<string, string>) => {
        const { allowed, forbidden } = splitForbiddenHeaders(headers);
        const run = () =>
          sendRequest({
            method: prepared.method,
            url: prepared.url,
            headers: allowed,
            body: prepared.body,
            onProgress,
          });
        return dnr && Object.keys(forbidden).length > 0
          ? await withForbiddenHeaderRule(dnr, prepared.url, forbidden, run)
          : await run();
      };

      let res = await runOnce(prepared.headers);

      // Digest: challenge-response on 401
      if (res.status === 401 && working.auth?.type === 'digest') {
        const www = res.headers['www-authenticate'] ?? res.headers['WWW-Authenticate'] ?? '';
        const challenge = parseDigestChallenge(www);
        if (challenge) {
          const uri = new URL(prepared.url).pathname + new URL(prepared.url).search;
          const authorization = await buildDigestAuthorization(
            challenge,
            { username: working.auth.username, password: working.auth.password },
            prepared.method,
            uri,
          );
          res = await runOnce({ ...prepared.headers, Authorization: authorization });
        }
      }

      const tests = await runTests(working, prepared, res, maps);
      patchActive({ response: res, rulesLabel, testResults: tests });
      if (!lastVisualizer) responseTab = tests.length ? 'tests' : 'body';
      const hist = await pushHistory(area, {
        id: crypto.randomUUID(),
        at: Date.now(),
        method: working.method,
        url: prepared.url,
        status: res.status,
        timeMs: res.timeMs,
        bodyPreview: res.body,
      });
      if (hist.ok) apiState = hist.value;
    } catch (err) {
      statusMessage = err instanceof Error ? err.message : String(err);
    } finally {
      sending = false;
      sendProgress = null;
    }
  }

  async function runTests(
    working: ApiRequest,
    prepared: ReturnType<typeof prepareHttp>,
    res: SendResponse,
    maps: ReturnType<typeof scopesToMaps>,
  ): Promise<ScriptTestResult[]> {
    if (!working.testScript?.trim()) return [];
    const result = await runSandboxedScript({
      sandboxUrl,
      phase: 'test',
      code: working.testScript,
      context: {
        ...maps,
        request: { method: prepared.method, url: prepared.url, headers: prepared.headers, body: prepared.body },
        response: {
          status: res.status,
          statusText: res.statusText,
          headers: res.headers,
          body: res.body,
          responseTime: res.timeMs,
        },
      },
    });
    if (!result.ok && result.error) statusMessage = `Tests: ${result.error}`;
    if (result.mutated?.visualizer) {
      lastVisualizer = result.mutated.visualizer;
      responseTab = 'visualize';
    }
    return result.tests;
  }

  function saveRequest() {
    if (!apiState) return;
    let collections = clonePlain(apiState.collections);
    if (collections.length === 0) {
      const col = createCollection('My collection');
      collections = [col];
      selectedCollectionId = col.id;
    }
    const idx = collections.findIndex((c) => c.id === (selectedCollectionId ?? collections[0]!.id));
    const col = collections[idx < 0 ? 0 : idx]!;
    collections[idx < 0 ? 0 : idx] = upsertRequest(col, clonePlain(request));
    void persist({ ...apiState, collections });
    patchActive({ savedSnapshot: JSON.stringify(request) });
    statusMessage = 'Saved to collection.';
  }

  function openHistory(id: string) {
    const entry = apiState?.history.find((h) => h.id === id);
    if (!entry) return;
    openNewTab({
      ...emptyRequest(crypto.randomUUID(), entry.url),
      method: entry.method,
      url: entry.url,
    });
  }

  function addEnvironment() {
    if (!apiState) return;
    const env: Environment = {
      id: crypto.randomUUID(),
      name: `Environment ${apiState.environments.length + 1}`,
      variables: [{ id: crypto.randomUUID(), key: 'host', initialValue: '', currentValue: '', secret: false, encrypted: null }],
    };
    void persist({ ...apiState, environments: [...apiState.environments, env], activeEnvironmentId: env.id });
  }

  function updateEnvVar(envId: string, varId: string, patch: Partial<Environment['variables'][0]>) {
    if (!apiState) return;
    const environments = apiState.environments.map((env) =>
      env.id !== envId ? env : { ...env, variables: env.variables.map((v) => (v.id === varId ? { ...v, ...patch } : v)) },
    );
    void persist({ ...apiState, environments });
  }

  async function encryptEnvVar(envId: string, varId: string) {
    if (!passphrase.trim()) {
      statusMessage = 'Enter a passphrase to encrypt.';
      return;
    }
    const env = apiState?.environments.find((e) => e.id === envId);
    const variable = env?.variables.find((v) => v.id === varId);
    if (!variable) return;
    const plain = variable.currentValue || variable.initialValue || '';
    const encrypted = await encryptSecret(plain, passphrase);
    updateEnvVar(envId, varId, { secret: true, encrypted: encrypted as EncryptedSecret, currentValue: '', initialValue: '' });
    statusMessage = 'Secret encrypted.';
  }

  async function unlockEnvVar(envId: string, varId: string) {
    if (!passphrase.trim()) {
      statusMessage = 'Enter a passphrase to unlock.';
      return;
    }
    const env = apiState?.environments.find((e) => e.id === envId);
    const variable = env?.variables.find((v) => v.id === varId);
    if (!variable?.encrypted) return;
    try {
      const plain = await decryptSecret(variable.encrypted, passphrase);
      updateEnvVar(envId, varId, { currentValue: plain, initialValue: plain, encrypted: null });
      statusMessage = 'Secret unlocked for this session (saved as plaintext until you encrypt again).';
    } catch {
      statusMessage = 'Wrong passphrase.';
    }
  }

  async function copyCurl() {
    try {
      await navigator.clipboard.writeText(toCurl(request));
      statusMessage = 'Copied as cURL.';
    } catch {
      statusMessage = 'Could not copy.';
    }
  }

  function runImport() {
    if (!apiState) return;
    const text = importText.trim();
    if (looksLikeCurl(text)) {
      const parsed = parseCurl(text);
      if (!parsed.ok) {
        statusMessage = parsed.error;
        return;
      }
      patchRequest({ ...parsed.request, id: request.id, applyDetourRules: request.applyDetourRules });
      importOpen = false;
      statusMessage = 'Imported cURL.';
      return;
    }
    try {
      const result = importPostmanCollection(JSON.parse(text) as unknown);
      if (!result.ok) {
        statusMessage = result.error;
        return;
      }
      void persist({ ...apiState, collections: [...apiState.collections, result.collection] });
      selectedCollectionId = result.collection.id;
      importOpen = false;
      statusMessage = `Imported collection “${result.collection.name}”.`;
    } catch {
      statusMessage = 'Import must be cURL or Postman Collection v2.1 JSON.';
    }
  }

  function exportActiveCollection() {
    const col = activeCollection;
    if (!col) {
      statusMessage = 'Save a request to a collection first.';
      return;
    }
    const blob = new Blob([JSON.stringify(exportPostmanCollection(col), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${col.name.replace(/\s+/g, '-').toLowerCase()}.postman_collection.json`;
    a.click();
    URL.revokeObjectURL(url);
    statusMessage = 'Exported Postman v2.1.';
  }

  function mutateCollection(fn: (c: Collection) => Collection) {
    if (!apiState || !activeCollection) return;
    const collections = apiState.collections.map((c) => (c.id === activeCollection.id ? fn(c) : c));
    void persist({ ...apiState, collections });
  }

  function addNewCollection() {
    if (!apiState) return;
    const col = createCollection(`Collection ${apiState.collections.length + 1}`);
    void persist({ ...apiState, collections: [...apiState.collections, col] });
    selectedCollectionId = col.id;
  }

  function onKeydown(event: KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      event.stopImmediatePropagation();
      saveRequest();
    }
  }

  function prettyBody(text: string): string {
    try {
      return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      return text;
    }
  }

  function openNode(node: CollectionNode) {
    if (node.kind === 'request') openNewTab(clonePlain(node.request));
  }
</script>

<svelte:window onkeydown={onKeydown} />

<section id="tester" class="api-tester" aria-labelledby="tester-heading">
  <header class="head">
    <div>
      <h2 id="tester-heading">API Tester</h2>
      <p class="sub">Send requests to any API, including localhost, and see which Detour rules apply.</p>
    </div>
    <div class="head-actions">
      <label class="env">
        <span class="muted">Environment</span>
        <select aria-label="Active environment" value={apiState?.activeEnvironmentId ?? ''} onchange={(e) => setActiveEnv((e.currentTarget as HTMLSelectElement).value)}>
          <option value="">None</option>
          {#each apiState?.environments ?? [] as env (env.id)}
            <option value={env.id}>{env.name}</option>
          {/each}
        </select>
      </label>
      <label class="apply" title="Default for new requests and those set to Use global">
        <input type="checkbox" checked={globalApply} onchange={(e) => setGlobalApply((e.currentTarget as HTMLInputElement).checked)} />
        Default: Apply Detour rules
      </label>
    </div>
  </header>

  <div class="layout">
    <aside class="sidebar" aria-label="Collections and history">
      <div class="side-tabs" role="tablist">
        <button type="button" class:active={sidebar === 'collections'} onclick={() => (sidebar = 'collections')}>Collections</button>
        <button type="button" class:active={sidebar === 'history'} onclick={() => (sidebar = 'history')}>History</button>
        <button type="button" class:active={sidebar === 'environments'} onclick={() => (sidebar = 'environments')}>Envs</button>
      </div>

      {#if sidebar === 'collections'}
        <div class="side-tools">
          <button type="button" class="btn" onclick={addNewCollection}>New collection</button>
          <button type="button" class="btn" onclick={() => openNewTab()}>New request</button>
          <button type="button" class="btn" onclick={() => (importOpen = !importOpen)}>Import</button>
          <button type="button" class="btn" onclick={exportActiveCollection}>Export</button>
        </div>
        {#if importOpen}
          <div class="import-box">
            <textarea rows="5" placeholder="Paste cURL or Postman Collection v2.1 JSON" bind:value={importText}></textarea>
            <button type="button" class="btn primary" onclick={runImport}>Import</button>
          </div>
        {/if}
        <ul class="tree">
          {#each apiState?.collections ?? [] as col (col.id)}
            <li class="col">
              <div class="row">
                <button type="button" class="link" class:active={selectedCollectionId === col.id} onclick={() => (selectedCollectionId = col.id)}>
                  <strong>{col.name}</strong>
                </button>
                <span class="ops">
                  <button type="button" class="btn text" title="Rename" onclick={() => {
                    const name = prompt('Collection name', col.name);
                    if (name == null) return;
                    if (!apiState) return;
                    void persist({ ...apiState, collections: apiState.collections.map((c) => (c.id === col.id ? renameCollection(c, name) : c)) });
                  }}>Rename</button>
                  <button type="button" class="btn text" title="Duplicate" onclick={() => {
                    if (!apiState) return;
                    const copy = duplicateCollection(col);
                    void persist({ ...apiState, collections: [...apiState.collections, copy] });
                    selectedCollectionId = copy.id;
                  }}>Dup</button>
                  <button type="button" class="btn text" title="Delete" onclick={() => {
                    if (!apiState || !confirm(`Delete collection “${col.name}”?`)) return;
                    const collections = apiState.collections.filter((c) => c.id !== col.id);
                    void persist({ ...apiState, collections });
                    if (selectedCollectionId === col.id) selectedCollectionId = collections[0]?.id ?? null;
                  }}>Del</button>
                  <button type="button" class="btn text" title="New folder" onclick={() => {
                    selectedCollectionId = col.id;
                    mutateCollection((c) => addChild(c, [], createFolder()));
                  }}>+Folder</button>
                  <button type="button" class="btn text" title="New request" onclick={() => {
                    selectedCollectionId = col.id;
                    const node = createRequestNode();
                    mutateCollection((c) => addChild(c, [], node));
                    openNewTab(node.request);
                  }}>+Req</button>
                </span>
              </div>
              <ul>
                {#each col.children ?? [] as node (node.id)}
                  {#if node.kind === 'request'}
                    <li class="row">
                      <button type="button" class="link" onclick={() => openNode(node)}>{node.request.method} {node.request.name}</button>
                      <span class="ops">
                        <button type="button" class="btn text" onclick={() => mutateCollection((c) => renameNode(c, [node.id], prompt('Request name', node.request.name) ?? node.request.name))}>Rename</button>
                        <button type="button" class="btn text" onclick={() => mutateCollection((c) => duplicateNode(c, [node.id]))}>Dup</button>
                        <button type="button" class="btn text" onclick={() => mutateCollection((c) => deleteNode(c, [node.id]))}>Del</button>
                      </span>
                    </li>
                  {:else}
                    <li>
                      <div class="row">
                        <span class="muted">{node.name}/</span>
                        <span class="ops">
                          <button type="button" class="btn text" onclick={() => mutateCollection((c) => renameNode(c, [node.id], prompt('Folder name', node.name) ?? node.name))}>Rename</button>
                          <button type="button" class="btn text" onclick={() => mutateCollection((c) => duplicateNode(c, [node.id]))}>Dup</button>
                          <button type="button" class="btn text" onclick={() => mutateCollection((c) => deleteNode(c, [node.id]))}>Del</button>
                          <button type="button" class="btn text" onclick={() => {
                            const child = createRequestNode();
                            mutateCollection((c) => addChild(c, [node.id], child));
                            openNewTab(child.request);
                          }}>+Req</button>
                        </span>
                      </div>
                      <ul>
                        {#each node.children as child (child.id)}
                          {#if child.kind === 'request'}
                            <li class="row">
                              <button type="button" class="link" onclick={() => openNode(child)}>{child.request.method} {child.request.name}</button>
                              <span class="ops">
                                <button type="button" class="btn text" onclick={() => mutateCollection((c) => renameNode(c, [node.id, child.id], prompt('Request name', child.request.name) ?? child.request.name))}>Rename</button>
                                <button type="button" class="btn text" onclick={() => mutateCollection((c) => duplicateNode(c, [node.id, child.id]))}>Dup</button>
                                <button type="button" class="btn text" onclick={() => mutateCollection((c) => deleteNode(c, [node.id, child.id]))}>Del</button>
                              </span>
                            </li>
                          {/if}
                        {/each}
                      </ul>
                    </li>
                  {/if}
                {/each}
              </ul>
            </li>
          {:else}
            <li class="muted">No collections yet.</li>
          {/each}
        </ul>
      {:else if sidebar === 'history'}
        <ul class="tree">
          {#each apiState?.history ?? [] as entry (entry.id)}
            <li>
              <button type="button" class="link" onclick={() => openHistory(entry.id)}>
                {entry.method} {entry.status ?? '—'} · {entry.url}
              </button>
            </li>
          {:else}
            <li class="muted">No history yet.</li>
          {/each}
        </ul>
      {:else}
        <div class="side-tools">
          <button type="button" class="btn" onclick={addEnvironment}>New environment</button>
          <label class="pass">
            Passphrase
            <input type="password" autocomplete="off" bind:value={passphrase} placeholder="For encrypt / unlock" />
          </label>
        </div>
        {#each apiState?.environments ?? [] as env (env.id)}
          <div class="env-card">
            <strong>{env.name}</strong>
            {#each env.variables as variable (variable.id)}
              <div class="kv env-kv">
                <input aria-label="Variable key" value={variable.key} oninput={(e) => updateEnvVar(env.id, variable.id, { key: (e.currentTarget as HTMLInputElement).value })} />
                {#if variable.encrypted}
                  <span class="muted" title="Encrypted">{maskSecret('encrypted-secret')}</span>
                  <button type="button" class="btn text" onclick={() => void unlockEnvVar(env.id, variable.id)}>Unlock</button>
                {:else}
                  <input
                    aria-label="Current value"
                    type={variable.secret ? 'password' : 'text'}
                    value={variable.currentValue}
                    oninput={(e) =>
                      updateEnvVar(env.id, variable.id, {
                        currentValue: (e.currentTarget as HTMLInputElement).value,
                        initialValue: (e.currentTarget as HTMLInputElement).value,
                      })}
                  />
                  <button type="button" class="btn text" onclick={() => void encryptEnvVar(env.id, variable.id)}>Encrypt</button>
                {/if}
                <label class="secret">
                  <input type="checkbox" checked={variable.secret} onchange={(e) => updateEnvVar(env.id, variable.id, { secret: (e.currentTarget as HTMLInputElement).checked })} />
                  Secret
                </label>
              </div>
            {/each}
            <button
              type="button"
              class="btn"
              onclick={() => {
                if (!apiState) return;
                void persist({
                  ...apiState,
                  environments: apiState.environments.map((e) =>
                    e.id === env.id
                      ? {
                          ...e,
                          variables: [
                            ...e.variables,
                            { id: crypto.randomUUID(), key: '', initialValue: '', currentValue: '', secret: false, encrypted: null },
                          ],
                        }
                      : e,
                  ),
                });
              }}
            >
              Add variable
            </button>
          </div>
        {:else}
          <p class="muted">No environments. Use {'{{host}}'} after adding one.</p>
        {/each}
      {/if}
    </aside>

    <div class="main">
      <div class="req-tabs" role="tablist" aria-label="Open requests">
        {#each tabs as tab (tab.id)}
          <button type="button" class="tab" class:active={tab.id === activeTabId} onclick={() => (activeTabId = tab.id)}>
            {tab.request.name}{#if JSON.stringify(tab.request) !== tab.savedSnapshot}<span class="dot" title="Unsaved">·</span>{/if}
            <span
              class="close"
              role="button"
              tabindex="0"
              onclick={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
              onkeydown={(e) => e.key === 'Enter' && closeTab(tab.id)}>×</span
            >
          </button>
        {/each}
        <button type="button" class="btn" onclick={() => openNewTab()}>+</button>
        <button type="button" class="btn" onclick={copyCurl}>Copy as cURL</button>
      </div>

      <div class="request-bar">
        <select aria-label="Method" value={request.method} onchange={(e) => patchRequest({ method: (e.currentTarget as HTMLSelectElement).value as ApiRequest['method'] })}>
          {#each HTTP_METHODS as method (method)}
            <option value={method}>{method}</option>
          {/each}
        </select>
        <div class="url-wrap">
          <input
            id="tester-url"
            type="text"
            spellcheck="false"
            autocomplete="off"
            placeholder="https://api.example.com/… or paste curl …"
            value={request.url}
            onpaste={onUrlPaste}
            oninput={(e) => onUrlInput((e.currentTarget as HTMLInputElement).value)}
          />
          {#if urlSegments.some((s) => s.kind === 'var')}
            <p class="url-preview muted" aria-hidden="true">
              {#each urlSegments as seg, i (i)}
                {#if seg.kind === 'text'}{seg.text}{:else}<span class:resolved={seg.resolved} class:unresolved={!seg.resolved} title={seg.resolved ? `${seg.key} = ${seg.value}` : `${seg.key} (unresolved)`}>{'{{' + seg.key + '}}'}</span>{/if}
              {/each}
            </p>
          {/if}
        </div>
        <label class="per-apply" title="Per-request override of the global default">
          <span class="muted">Rules</span>
          <select aria-label="Apply Detour rules for this request" value={request.applyDetourRules ?? 'inherit'} onchange={(e) => setPerRequestApply((e.currentTarget as HTMLSelectElement).value as ApplyDetourMode)}>
            {#each APPLY_DETOUR_MODES as mode (mode)}
              <option value={mode}>{mode === 'inherit' ? 'Use global' : mode === 'on' ? 'On' : 'Off'}</option>
            {/each}
          </select>
        </label>
        <button type="button" class="btn primary" disabled={sending} aria-busy={sending} onclick={() => void send()}>
          {sending ? 'Sending…' : 'Send'}
        </button>
        <button type="button" class="btn" onclick={saveRequest}>Save</button>
      </div>
      {#if sending && sendProgress}
        <div class="send-progress" role="status" aria-live="polite" aria-busy="true" data-testid="send-progress">
          <div class="send-progress-track" aria-hidden="true">
            <div
              class="send-progress-bar"
              class:indeterminate={sendProgress.fraction == null}
              style={sendProgress.fraction != null ? `width: ${Math.round(sendProgress.fraction * 100)}%` : undefined}
            ></div>
          </div>
          <p class="send-progress-label">{sendProgressLabel}</p>
        </div>
      {/if}
      <p class="muted apply-hint">
        Effective Apply Detour rules: <strong>{effectiveApply ? 'On' : 'Off'}</strong>
        ({request.applyDetourRules === 'inherit' || !request.applyDetourRules ? `using global default ${globalApply ? 'On' : 'Off'}` : 'per-request override'})
      </p>

      <div class="subtabs" role="tablist">
        <button type="button" class:active={subTab === 'params'} onclick={() => (subTab = 'params')}>Params</button>
        <button type="button" class:active={subTab === 'auth'} onclick={() => (subTab = 'auth')}>Auth</button>
        <button type="button" class:active={subTab === 'headers'} onclick={() => (subTab = 'headers')}>Headers</button>
        <button type="button" class:active={subTab === 'body'} onclick={() => (subTab = 'body')}>Body</button>
        <button type="button" class:active={subTab === 'scripts'} onclick={() => (subTab = 'scripts')}>Scripts</button>
      </div>

      <div class="subpanel">
        {#if subTab === 'params'}
          {#each request.params ?? [] as row (row.id)}
            <div class="kv">
              <input type="checkbox" checked={row.enabled !== false} onchange={(e) => updateRow('params', row.id, { enabled: (e.currentTarget as HTMLInputElement).checked })} />
              <input placeholder="Key" value={row.key} oninput={(e) => updateRow('params', row.id, { key: (e.currentTarget as HTMLInputElement).value })} />
              <input placeholder="Value" value={row.value} oninput={(e) => updateRow('params', row.id, { value: (e.currentTarget as HTMLInputElement).value })} />
              <button type="button" class="btn text" onclick={() => removeRow('params', row.id)}>Remove</button>
            </div>
          {/each}
          <button type="button" class="btn" onclick={addParam}>Add param</button>
        {:else if subTab === 'auth'}
          <Field id="auth-type" label="Auth">
            {#snippet children()}
              <select
                id="auth-type"
                value={request.auth?.type ?? 'none'}
                onchange={(e) => {
                  const type = (e.currentTarget as HTMLSelectElement).value;
                  if (type === 'none') patchRequest({ auth: { type: 'none' } });
                  else if (type === 'basic') patchRequest({ auth: { type: 'basic', username: '', password: '' } });
                  else if (type === 'bearer') patchRequest({ auth: { type: 'bearer', token: '' } });
                  else if (type === 'apikey') patchRequest({ auth: { type: 'apikey', key: '', value: '', in: 'header' } });
                  else if (type === 'oauth2')
                    patchRequest({
                      auth: {
                        type: 'oauth2',
                        grant: 'authorization_code',
                        authorizeUrl: '',
                        tokenUrl: '',
                        clientId: '',
                        clientSecret: '',
                        scope: '',
                        redirectUri: '',
                        username: '',
                        password: '',
                        accessToken: '',
                        refreshToken: '',
                      },
                    });
                  else if (type === 'sigv4')
                    patchRequest({ auth: { type: 'sigv4', accessKeyId: '', secretAccessKey: '', sessionToken: '', region: 'us-east-1', service: 'execute-api' } });
                  else if (type === 'digest') patchRequest({ auth: { type: 'digest', username: '', password: '' } });
                }}
              >
                <option value="none">None</option>
                <option value="basic">Basic</option>
                <option value="bearer">Bearer</option>
                <option value="apikey">API key</option>
                <option value="oauth2">OAuth 2.0</option>
                <option value="sigv4">AWS SigV4</option>
                <option value="digest">Digest</option>
              </select>
            {/snippet}
          </Field>
          {#if request.auth?.type === 'basic'}
            <input placeholder="Username" value={request.auth.username} oninput={(e) => patchRequest({ auth: { type: 'basic', username: (e.currentTarget as HTMLInputElement).value, password: request.auth?.type === 'basic' ? request.auth.password : '' } })} />
            <input type="password" placeholder="Password" value={request.auth.password} oninput={(e) => patchRequest({ auth: { type: 'basic', username: request.auth?.type === 'basic' ? request.auth.username : '', password: (e.currentTarget as HTMLInputElement).value } })} />
          {:else if request.auth?.type === 'bearer'}
            <input placeholder="Token" value={request.auth.token} oninput={(e) => patchRequest({ auth: { type: 'bearer', token: (e.currentTarget as HTMLInputElement).value } })} />
          {:else if request.auth?.type === 'apikey'}
            <input placeholder="Key" value={request.auth.key} oninput={(e) => request.auth?.type === 'apikey' && patchRequest({ auth: { ...request.auth, key: (e.currentTarget as HTMLInputElement).value } })} />
            <input placeholder="Value" value={request.auth.value} oninput={(e) => request.auth?.type === 'apikey' && patchRequest({ auth: { ...request.auth, value: (e.currentTarget as HTMLInputElement).value } })} />
            <select value={request.auth.in ?? 'header'} onchange={(e) => request.auth?.type === 'apikey' && patchRequest({ auth: { ...request.auth, in: (e.currentTarget as HTMLSelectElement).value as 'header' | 'query' } })}>
              <option value="header">Header</option>
              <option value="query">Query</option>
            </select>
          {:else if request.auth?.type === 'oauth2'}
            <select
              aria-label="OAuth grant"
              value={request.auth.grant ?? 'authorization_code'}
              onchange={(e) => request.auth?.type === 'oauth2' && patchRequest({ auth: { ...request.auth, grant: (e.currentTarget as HTMLSelectElement).value as 'authorization_code' | 'client_credentials' | 'password' } })}
            >
              <option value="authorization_code">Authorization code + PKCE</option>
              <option value="client_credentials">Client credentials</option>
              <option value="password">Password</option>
            </select>
            <input placeholder="Authorize URL" value={request.auth.authorizeUrl ?? ''} oninput={(e) => request.auth?.type === 'oauth2' && patchRequest({ auth: { ...request.auth, authorizeUrl: (e.currentTarget as HTMLInputElement).value } })} />
            <input placeholder="Token URL" value={request.auth.tokenUrl} oninput={(e) => request.auth?.type === 'oauth2' && patchRequest({ auth: { ...request.auth, tokenUrl: (e.currentTarget as HTMLInputElement).value } })} />
            <input placeholder="Client ID" value={request.auth.clientId} oninput={(e) => request.auth?.type === 'oauth2' && patchRequest({ auth: { ...request.auth, clientId: (e.currentTarget as HTMLInputElement).value } })} />
            <input type="password" placeholder="Client secret (optional)" value={request.auth.clientSecret ?? ''} oninput={(e) => request.auth?.type === 'oauth2' && patchRequest({ auth: { ...request.auth, clientSecret: (e.currentTarget as HTMLInputElement).value } })} />
            <input placeholder="Scope" value={request.auth.scope ?? ''} oninput={(e) => request.auth?.type === 'oauth2' && patchRequest({ auth: { ...request.auth, scope: (e.currentTarget as HTMLInputElement).value } })} />
            <input placeholder="Access token (or authorize)" value={request.auth.accessToken ?? ''} oninput={(e) => request.auth?.type === 'oauth2' && patchRequest({ auth: { ...request.auth, accessToken: (e.currentTarget as HTMLInputElement).value } })} />
            {#if request.auth.grant === 'password'}
              <input placeholder="Username" value={request.auth.username ?? ''} oninput={(e) => request.auth?.type === 'oauth2' && patchRequest({ auth: { ...request.auth, username: (e.currentTarget as HTMLInputElement).value } })} />
              <input type="password" placeholder="Password" value={request.auth.password ?? ''} oninput={(e) => request.auth?.type === 'oauth2' && patchRequest({ auth: { ...request.auth, password: (e.currentTarget as HTMLInputElement).value } })} />
            {/if}
            <input placeholder="Manual auth code (Firefox)" id="oauth-manual-code" />
            <button
              type="button"
              class="btn"
              onclick={() => {
                void (async () => {
                  if (request.auth?.type !== 'oauth2') return;
                  try {
                    await browser.permissions.request({ permissions: ['identity'] });
                  } catch {
                    /* optional */
                  }
                  const identity = (browser as unknown as { identity?: IdentityApi }).identity;
                  if (identity?.launchWebAuthFlow) {
                    try {
                      const { token } = await authorizeCodeChrome(
                        {
                          grant: 'authorization_code',
                          authorizeUrl: request.auth.authorizeUrl ?? '',
                          tokenUrl: request.auth.tokenUrl,
                          clientId: request.auth.clientId,
                          clientSecret: request.auth.clientSecret,
                          scope: request.auth.scope,
                          redirectUri: request.auth.redirectUri || identity.getRedirectURL(),
                        },
                        identity,
                      );
                      patchRequest({
                        auth: {
                          ...request.auth,
                          accessToken: token.accessToken,
                          refreshToken: token.refreshToken ?? request.auth.refreshToken,
                          expiresAt: token.expiresAt,
                        },
                      });
                      statusMessage = 'OAuth token acquired.';
                    } catch (err) {
                      statusMessage = err instanceof Error ? err.message : String(err);
                    }
                  } else {
                    try {
                      const pkce = await createPkcePair();
                      const state = randomVerifier(32);
                      pendingPkce = { ...pkce, state };
                      const redirectUri = request.auth.redirectUri || 'http://127.0.0.1/';
                      const url = buildAuthorizeUrl(
                        {
                          grant: 'authorization_code',
                          authorizeUrl: request.auth.authorizeUrl ?? '',
                          tokenUrl: request.auth.tokenUrl,
                          clientId: request.auth.clientId,
                          scope: request.auth.scope,
                          redirectUri,
                        },
                        pkce,
                        state,
                      );
                      window.open(url, '_blank', 'noopener,noreferrer');
                      statusMessage = 'Opened authorize URL — paste the code and click Exchange.';
                    } catch (err) {
                      statusMessage = err instanceof Error ? err.message : String(err);
                    }
                  }
                })();
              }}>Authorize (Chrome PKCE)</button
            >
            <button
              type="button"
              class="btn"
              onclick={() => {
                void (async () => {
                  if (request.auth?.type !== 'oauth2' || !pendingPkce) {
                    statusMessage = 'Click Authorize first to generate PKCE, then paste the code.';
                    return;
                  }
                  const codeEl = document.getElementById('oauth-manual-code') as HTMLInputElement | null;
                  const code = codeEl?.value?.trim() ?? '';
                  if (!code) {
                    statusMessage = 'Paste the authorization code first.';
                    return;
                  }
                  try {
                    const token = await exchangeAuthorizationCode(
                      {
                        grant: 'authorization_code',
                        authorizeUrl: request.auth.authorizeUrl ?? '',
                        tokenUrl: request.auth.tokenUrl,
                        clientId: request.auth.clientId,
                        clientSecret: request.auth.clientSecret,
                        scope: request.auth.scope,
                        redirectUri: request.auth.redirectUri || 'http://127.0.0.1/',
                      },
                      code,
                      pendingPkce.verifier,
                    );
                    patchRequest({
                      auth: {
                        ...request.auth,
                        accessToken: token.accessToken,
                        refreshToken: token.refreshToken ?? request.auth.refreshToken,
                        expiresAt: token.expiresAt,
                      },
                    });
                    pendingPkce = null;
                    statusMessage = 'OAuth token exchanged (manual code).';
                  } catch (err) {
                    statusMessage = err instanceof Error ? err.message : String(err);
                  }
                })();
              }}>Exchange manual code</button
            >
          {:else if request.auth?.type === 'sigv4'}
            <input placeholder="Access key ID" value={request.auth.accessKeyId} oninput={(e) => request.auth?.type === 'sigv4' && patchRequest({ auth: { ...request.auth, accessKeyId: (e.currentTarget as HTMLInputElement).value } })} />
            <input type="password" placeholder="Secret access key" value={request.auth.secretAccessKey} oninput={(e) => request.auth?.type === 'sigv4' && patchRequest({ auth: { ...request.auth, secretAccessKey: (e.currentTarget as HTMLInputElement).value } })} />
            <input placeholder="Session token" value={request.auth.sessionToken ?? ''} oninput={(e) => request.auth?.type === 'sigv4' && patchRequest({ auth: { ...request.auth, sessionToken: (e.currentTarget as HTMLInputElement).value } })} />
            <input placeholder="Region" value={request.auth.region} oninput={(e) => request.auth?.type === 'sigv4' && patchRequest({ auth: { ...request.auth, region: (e.currentTarget as HTMLInputElement).value } })} />
            <input placeholder="Service" value={request.auth.service} oninput={(e) => request.auth?.type === 'sigv4' && patchRequest({ auth: { ...request.auth, service: (e.currentTarget as HTMLInputElement).value } })} />
          {:else if request.auth?.type === 'digest'}
            <input placeholder="Username" value={request.auth.username} oninput={(e) => request.auth?.type === 'digest' && patchRequest({ auth: { ...request.auth, username: (e.currentTarget as HTMLInputElement).value } })} />
            <input type="password" placeholder="Password" value={request.auth.password} oninput={(e) => request.auth?.type === 'digest' && patchRequest({ auth: { ...request.auth, password: (e.currentTarget as HTMLInputElement).value } })} />
          {/if}
        {:else if subTab === 'headers'}
          {#each request.headers ?? [] as row (row.id)}
            <div class="kv">
              <input type="checkbox" checked={row.enabled !== false} onchange={(e) => updateRow('headers', row.id, { enabled: (e.currentTarget as HTMLInputElement).checked })} />
              <input placeholder="Header" value={row.key} oninput={(e) => updateRow('headers', row.id, { key: (e.currentTarget as HTMLInputElement).value })} />
              <input placeholder="Value" value={row.value} oninput={(e) => updateRow('headers', row.id, { value: (e.currentTarget as HTMLInputElement).value })} />
              <button type="button" class="btn text" onclick={() => removeRow('headers', row.id)}>Remove</button>
            </div>
          {/each}
          <button type="button" class="btn" onclick={addHeader}>Add header</button>
        {:else if subTab === 'body'}
          <select
            aria-label="Body mode"
            value={request.body?.mode ?? 'none'}
            onchange={(e) => {
              const mode = (e.currentTarget as HTMLSelectElement).value;
              if (mode === 'none') patchRequest({ body: { mode: 'none' } });
              else if (mode === 'raw') patchRequest({ body: { mode: 'raw', text: '', language: 'json' } });
              else if (mode === 'urlencoded') patchRequest({ body: { mode: 'urlencoded', rows: [] } });
              else if (mode === 'graphql')
                patchRequest({ body: { mode: 'graphql', query: '{\n  __typename\n}\n', variables: '{}', operationName: '' } });
              else patchRequest({ body: { mode: 'formdata', rows: [] } });
            }}
          >
            <option value="none">None</option>
            <option value="raw">Raw</option>
            <option value="urlencoded">x-www-form-urlencoded</option>
            <option value="formdata">form-data (text)</option>
            <option value="graphql">GraphQL</option>
          </select>
          {#if request.body?.mode === 'raw'}
            <select
              aria-label="Raw language"
              value={request.body.language ?? 'json'}
              onchange={(e) => {
                if (request.body?.mode !== 'raw') return;
                patchRequest({ body: { ...request.body, language: (e.currentTarget as HTMLSelectElement).value as 'json' | 'text' } });
              }}
            >
              <option value="json">JSON</option>
              <option value="text">Text</option>
            </select>
            <CodeEditor
              id="api-body"
              label="Body"
              value={request.body.text}
              language={(request.body.language ?? 'json') === 'json' ? 'json' : 'text'}
              onchange={(text) => {
                if (request.body?.mode !== 'raw') return;
                patchRequest({ body: { ...request.body, text } });
              }}
            />
          {:else if request.body?.mode === 'urlencoded' || request.body?.mode === 'formdata'}
            {#each request.body.rows as row (row.id)}
              <div class="kv">
                <input
                  placeholder="Key"
                  value={row.key}
                  oninput={(e) => {
                    if (request.body?.mode !== 'urlencoded' && request.body?.mode !== 'formdata') return;
                    const rows = request.body.rows.map((r) => (r.id === row.id ? { ...r, key: (e.currentTarget as HTMLInputElement).value } : r));
                    patchRequest({ body: { ...request.body, rows } });
                  }}
                />
                <input
                  placeholder="Value"
                  value={row.value}
                  oninput={(e) => {
                    if (request.body?.mode !== 'urlencoded' && request.body?.mode !== 'formdata') return;
                    const rows = request.body.rows.map((r) => (r.id === row.id ? { ...r, value: (e.currentTarget as HTMLInputElement).value } : r));
                    patchRequest({ body: { ...request.body, rows } });
                  }}
                />
                <button
                  type="button"
                  class="btn text"
                  onclick={() => {
                    if (request.body?.mode !== 'urlencoded' && request.body?.mode !== 'formdata') return;
                    patchRequest({ body: { ...request.body, rows: request.body.rows.filter((r) => r.id !== row.id) } });
                  }}>Remove</button
                >
              </div>
            {/each}
            <button
              type="button"
              class="btn"
              onclick={() => {
                if (request.body?.mode !== 'urlencoded' && request.body?.mode !== 'formdata') return;
                patchRequest({ body: { ...request.body, rows: [...request.body.rows, newKvRow(crypto.randomUUID())] } });
              }}
            >
              Add field
            </button>
          {:else if request.body?.mode === 'graphql'}
            <CodeEditor
              id="api-gql-query"
              label="GraphQL query"
              value={request.body.query}
              language="text"
              onchange={(query) => {
                if (request.body?.mode !== 'graphql') return;
                patchRequest({ body: { ...request.body, query } });
              }}
            />
            <CodeEditor
              id="api-gql-vars"
              label="Variables JSON"
              value={request.body.variables ?? '{}'}
              language="json"
              onchange={(variables) => {
                if (request.body?.mode !== 'graphql') return;
                patchRequest({ body: { ...request.body, variables } });
              }}
            />
            <input
              placeholder="Operation name (optional)"
              value={request.body.operationName ?? ''}
              oninput={(e) => {
                if (request.body?.mode !== 'graphql') return;
                patchRequest({ body: { ...request.body, operationName: (e.currentTarget as HTMLInputElement).value } });
              }}
            />
          {/if}
        {:else}
          <Field id="pre-script" label="Pre-request" hint="Runs in a sandboxed page (null origin). pm + chai-compatible expect.">
            {#snippet children({ describedby })}
              <CodeEditor
                id="pre-script"
                label="Pre-request script"
                value={request.preRequestScript ?? ''}
                language="javascript"
                describedby={describedby}
                onchange={(code) => patchRequest({ preRequestScript: code })}
              />
            {/snippet}
          </Field>
          <Field id="test-script" label="Tests">
            {#snippet children()}
              <CodeEditor
                id="test-script"
                label="Test script"
                value={request.testScript ?? ''}
                language="javascript"
                onchange={(code) => patchRequest({ testScript: code })}
              />
            {/snippet}
          </Field>
        {/if}
      </div>

      <div class="response">
        <div class="resp-meta">
          {#if activeTab.response}
            <span class:ok={activeTab.response.ok} class:bad={!activeTab.response.ok && activeTab.response.status === 0}>{activeTab.response.status || 'ERR'}</span>
            <span class="muted">{activeTab.response.timeMs} ms</span>
            <span class="muted">{activeTab.response.sizeBytes} B</span>
            {#if activeTab.rulesLabel}<span class="pill">{activeTab.rulesLabel}</span>{/if}
            {#if activeTab.response.error}<span class="bad">{activeTab.response.error}</span>{/if}
          {:else}
            <span class="muted">Response</span>
          {/if}
        </div>
        <div class="subtabs" role="tablist">
          <button type="button" class:active={responseTab === 'body'} onclick={() => (responseTab = 'body')}>Body</button>
          <button type="button" class:active={responseTab === 'headers'} onclick={() => (responseTab = 'headers')}>Headers</button>
          <button type="button" class:active={responseTab === 'tests'} onclick={() => (responseTab = 'tests')}>Test results</button>
          <button type="button" class:active={responseTab === 'visualize'} onclick={() => (responseTab = 'visualize')}>Visualize</button>
          <button type="button" class:active={responseTab === 'rules'} onclick={() => (responseTab = 'rules')}>Which rules apply</button>
        </div>

        {#if responseTab === 'body'}
          <div class="body-views">
            <button type="button" class:active={bodyView === 'pretty'} onclick={() => (bodyView = 'pretty')}>Pretty</button>
            <button type="button" class:active={bodyView === 'raw'} onclick={() => (bodyView = 'raw')}>Raw</button>
            <button type="button" class:active={bodyView === 'preview'} onclick={() => (bodyView = 'preview')}>Preview</button>
          </div>
          {#if activeTab.response}
            {#if bodyView === 'preview'}
              <iframe class="preview" title="Response preview" sandbox="" srcdoc={activeTab.response.body}></iframe>
            {:else}
              <pre class="mono">{bodyView === 'pretty' ? prettyBody(activeTab.response.body) : activeTab.response.body}</pre>
            {/if}
          {:else}
            <p class="muted">Send a request to see the body.</p>
          {/if}
        {:else if responseTab === 'headers'}
          {#if activeTab.response}
            <ul class="headers">
              {#each Object.entries(activeTab.response.headers) as [name, value] (name)}
                <li><code>{name}</code>: {value}</li>
              {/each}
            </ul>
          {:else}
            <p class="muted">No response headers yet.</p>
          {/if}
        {:else if responseTab === 'tests'}
          {#if activeTab.testResults.length === 0}
            <p class="muted">No test results yet. Add a test script and Send.</p>
          {:else}
            <ul class="tests" role="list">
              {#each activeTab.testResults as test, i (i)}
                <li class:pass={test.passed} class:fail={!test.passed}>
                  <strong>{test.passed ? 'Pass' : 'Fail'}</strong>
                  <span>{test.name}</span>
                  {#if test.error}<span class="muted">{test.error}</span>{/if}
                </li>
              {/each}
            </ul>
          {/if}
        {:else if responseTab === 'visualize'}
          {#if lastVisualizer}
            <iframe class="preview" title="Visualizer" sandbox="" srcdoc={renderVisualizerHtml(lastVisualizer)}></iframe>
          {:else}
            <p class="muted">Call <code>pm.visualizer.set(template, data)</code> in a test script, then Send.</p>
          {/if}
        {:else if started}
          <div class="result" role="status" data-testid="tester-result">
            <p class="headline">{rulesView.headline}</p>
            {#if rulesView.lines.length > 0}
              <ul>
                {#each rulesView.lines as line, i (i)}
                  <li>
                    <span class="who">{line.groupName}</span>
                    <span class="summary">{line.summary}</span>
                    <span class="outcome">{line.outcome}</span>
                  </li>
                {/each}
              </ul>
            {/if}
            {#each rulesView.notes as note, i (i)}
              <p class="note">{note}</p>
            {/each}
            {#if !enabled}<p class="note">Detour is off, so this is not live.</p>{/if}
            {#if dirty}<p class="note">Includes unsaved rule edits.</p>{/if}
            <p class="note">Effective Apply Detour rules: {effectiveApply ? 'On' : 'Off'}.</p>
          </div>
        {:else}
          <p class="muted" data-testid="tester-result">Enter a URL to see which rules apply.</p>
        {/if}
      </div>

      {#if statusMessage}<p class="status" role="status">{statusMessage}</p>{/if}

      {#if apiState}
        <ApiTesterPower
          {apiState}
          {request}
          response={activeTab.response}
          {workspace}
          {varScopes}
          {sandboxUrl}
          {globalApply}
          persist={(next) => void persist(next)}
          onWorkspaceChange={(next, focus) => onWorkspaceChange?.(next, focus)}
        />
        <ApiTesterAdvanced
          {apiState}
          {request}
          patchRequest={patchRequest}
          persist={(next) => void persist(next)}
          visualizer={lastVisualizer}
          onOpenCaptured={(req) => openNewTab(req)}
        />
      {/if}
    </div>
  </div>
</section>

<style>
  .api-tester {
    display: grid;
    gap: var(--space-3);
    padding: var(--space-3);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
  }
  .head {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    justify-content: space-between;
    align-items: flex-start;
  }
  .sub {
    margin: 0.25rem 0 0;
    color: var(--text-muted);
    max-width: 40rem;
  }
  .head-actions,
  .side-tools,
  .req-tabs,
  .subtabs,
  .body-views,
  .side-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    align-items: center;
  }
  .env,
  .apply,
  .per-apply,
  .pass,
  .secret {
    display: flex;
    gap: var(--space-2);
    align-items: center;
  }
  .layout {
    display: grid;
    gap: var(--space-3);
    grid-template-columns: minmax(14rem, 18rem) minmax(0, 1fr);
    align-items: start;
  }
  @media (max-width: 56rem) {
    .layout {
      grid-template-columns: 1fr;
    }
  }
  .sidebar {
    display: grid;
    gap: var(--space-2);
    padding: var(--space-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface-2, var(--surface));
    min-height: 20rem;
    max-height: 70vh;
    overflow: auto;
  }
  .side-tabs button,
  .subtabs button,
  .body-views button,
  .tab {
    appearance: none;
    border: 1px solid var(--border);
    background: transparent;
    color: inherit;
    border-radius: var(--radius);
    padding: 0.25rem 0.5rem;
    cursor: pointer;
  }
  .side-tabs button.active,
  .subtabs button.active,
  .body-views button.active,
  .tab.active {
    border-color: var(--accent, #3b82f6);
    background: color-mix(in srgb, var(--accent, #3b82f6) 12%, transparent);
  }
  .tree {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: var(--space-1);
  }
  .tree ul {
    list-style: none;
    margin: 0.25rem 0 0 0.75rem;
    padding: 0;
    display: grid;
    gap: var(--space-1);
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    align-items: center;
    justify-content: space-between;
  }
  .ops {
    display: flex;
    flex-wrap: wrap;
    gap: 0.15rem;
  }
  .link {
    appearance: none;
    border: 0;
    background: transparent;
    color: inherit;
    text-align: left;
    cursor: pointer;
    padding: 0;
    overflow-wrap: anywhere;
  }
  .link.active {
    font-weight: 650;
  }
  .main {
    display: grid;
    gap: var(--space-3);
    min-width: 0;
  }
  .request-bar {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto auto auto auto;
    gap: var(--space-2);
    align-items: start;
  }
  .send-progress {
    display: grid;
    gap: 0.35rem;
    padding: 0.5rem 0.65rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface-2, var(--surface));
  }
  .send-progress-track {
    height: 0.35rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--border) 70%, transparent);
    overflow: hidden;
  }
  .send-progress-bar {
    height: 100%;
    border-radius: 999px;
    background: var(--accent, #3b82f6);
    max-width: 100%;
    transition: width 0.15s ease-out;
  }
  .send-progress-bar.indeterminate {
    width: 35%;
    animation: send-progress-pulse 1.1s ease-in-out infinite;
  }
  .send-progress-label {
    margin: 0;
    font-size: 0.85rem;
    color: var(--text-muted);
  }
  @keyframes send-progress-pulse {
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
  .url-wrap {
    display: grid;
    gap: 0.25rem;
    min-width: 0;
  }
  .url-wrap input,
  .subpanel input,
  .subpanel select,
  .import-box textarea,
  .kv input,
  .pass input {
    width: 100%;
    min-width: 0;
  }
  .url-preview {
    margin: 0;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.75rem;
    overflow-wrap: anywhere;
  }
  .url-preview .resolved {
    color: var(--accent, #3b82f6);
    text-decoration: underline dotted;
    cursor: help;
  }
  .url-preview .unresolved {
    color: var(--danger, #dc2626);
    text-decoration: underline wavy;
    cursor: help;
  }
  .apply-hint {
    margin: 0;
    font-size: 0.8rem;
  }
  .subpanel,
  .response {
    display: grid;
    gap: var(--space-2);
    padding: var(--space-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  .kv {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) minmax(0, 1fr) auto;
    gap: var(--space-2);
    align-items: center;
  }
  .env-kv {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto auto;
  }
  .resp-meta {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    align-items: center;
  }
  .ok {
    color: var(--success, #16a34a);
    font-weight: 650;
  }
  .bad,
  .fail {
    color: var(--danger, #dc2626);
    font-weight: 650;
  }
  .pass {
    color: var(--success, #16a34a);
  }
  .pill {
    font-size: 0.75rem;
    padding: 0.1rem 0.4rem;
    border-radius: 999px;
    border: 1px solid var(--border);
  }
  .mono,
  pre.mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.8125rem;
  }
  pre.mono {
    margin: 0;
    max-height: 20rem;
    overflow: auto;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .preview {
    width: 100%;
    min-height: 12rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: #fff;
  }
  .result,
  .tests {
    display: grid;
    gap: var(--space-2);
  }
  .headline {
    font-weight: 650;
  }
  .result ul,
  .headers,
  .tests {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .result li,
  .tests li {
    display: grid;
    gap: var(--space-1);
    padding-top: var(--space-2);
    border-top: 1px solid var(--border);
  }
  .who {
    font-weight: 650;
  }
  .summary,
  .outcome {
    overflow-wrap: anywhere;
  }
  .outcome {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.75rem;
  }
  .note,
  .muted {
    color: var(--text-muted);
  }
  .dot {
    color: var(--accent, #3b82f6);
    margin-left: 0.15rem;
  }
  .close {
    margin-left: 0.35rem;
    opacity: 0.7;
  }
  .status {
    margin: 0;
  }
  .import-box,
  .env-card {
    display: grid;
    gap: var(--space-2);
  }
</style>
