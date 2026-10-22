<script lang="ts">
  import { tick } from 'svelte';
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
    reorderNode,
    upsertRequest,
  } from '../../api-client/collections';
  import { clonePlain } from '../../api-client/clone-plain';
  import { looksLikeCurl, parseCurl, toCurl } from '../../api-client/curl';
  import { groupHistoryEntries, historyRowLabel } from '../../api-client/history-list';
  import {
    APPLY_DETOUR_MODES,
    emptyApiClientState,
    emptyRequest,
    HTTP_METHODS,
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
    formatBytes,
    formatSendProgressLabel,
  } from '../../api-client/send-progress';
  import { loadApiClientState, pushHistory, saveApiClientState } from '../../api-client/storage';
  import { splitForbiddenHeaders, withForbiddenHeaderRule, type DnrSessionApi } from '../../api-client/forbidden-headers';
  import { highlightUrl } from '../../api-client/url-highlight';
  import type { Workspace } from '../../rule-model/schema';
  import CodeEditor from '../../ui/CodeEditor.svelte';
  import Drawer from '../../ui/Drawer.svelte';
  import Field from '../../ui/Field.svelte';
  import { syncGrowFieldCollapsed } from '../../ui/grow-field';
  import Icon from '../../ui/icons/Icon.svelte';
  import KvTable from '../../ui/KvTable.svelte';
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
  let toolsOpen = $state(false);
  let treeMenuId = $state<string | null>(null);
  let historyQuery = $state('');
  /** Session-only: env id → expanded. Missing key = active env expanded, others collapsed. */
  let envExpanded = $state<Record<string, boolean>>({});
  let renamingTabId = $state<string | null>(null);
  let renameTabValue = $state('');
  let renameTabInput: HTMLInputElement | undefined = $state();
  let reqTabsStrip: HTMLDivElement | undefined = $state();
  let dragTabId = $state<string | null>(null);
  let dragTree = $state<{ collectionId: string; parentPath: string[]; nodeId: string } | null>(null);
  let dropTree = $state<{ collectionId: string; parentPath: string[]; nodeId: string; edge: 'before' | 'after' } | null>(null);
  let dialog = $state<
    | null
    | {
        kind: 'rename';
        target: 'collection' | 'folder' | 'request' | 'environment';
        collectionId: string;
        path: string[];
        title: string;
        value: string;
        environmentId?: string;
      }
    | {
        kind: 'delete';
        target: 'collection' | 'folder' | 'request' | 'environment';
        collectionId: string;
        path: string[];
        name: string;
        environmentId?: string;
      }
    | { kind: 'clear-history' }
  >(null);
  let dialogInput: HTMLInputElement | undefined = $state();
  const toolsDocked = $derived(typeof window === 'undefined' ? true : window.matchMedia('(min-width: 56rem)').matches);

  const activeTab = $derived(tabs.find((t) => t.id === activeTabId) ?? tabs[0]!);
  const request = $derived(activeTab.request);
  const dirtyRequest = $derived(JSON.stringify(activeTab.request) !== activeTab.savedSnapshot);
  const globalApply = $derived(apiState?.applyDetourRules !== false);
  const autosaveOn = $derived(apiState?.autosaveRequests !== false);
  const effectiveApply = $derived(resolveApplyDetourRules(globalApply, activeTab.request.applyDetourRules));
  const historyGroups = $derived(groupHistoryEntries(apiState?.history ?? [], historyQuery));

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
  const paramCount = $derived((request.params ?? []).filter((r) => r.key.trim() !== '').length);
  const headerCount = $derived((request.headers ?? []).filter((r) => r.key.trim() !== '').length);
  const authActive = $derived((request.auth?.type ?? 'none') !== 'none');
  const bodyActive = $derived((request.body?.mode ?? 'none') !== 'none');

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

  function setAutosaveRequests(next: boolean) {
    if (!apiState) return;
    void persist({ ...apiState, autosaveRequests: next });
  }

  function setPerRequestApply(mode: ApplyDetourMode) {
    patchRequest({ applyDetourRules: mode });
  }

  function setActiveEnv(id: string) {
    if (!apiState) return;
    void persist({ ...apiState, activeEnvironmentId: id || null });
    if (id) envExpanded = { ...envExpanded, [id]: true };
  }

  function isEnvExpanded(envId: string): boolean {
    if (envId in envExpanded) return envExpanded[envId]!;
    return envId === apiState?.activeEnvironmentId;
  }

  function toggleEnvExpanded(envId: string) {
    envExpanded = { ...envExpanded, [envId]: !isEnvExpanded(envId) };
  }

  function isUnsetRequestName(name: string): boolean {
    const trimmed = name.trim();
    return trimmed === '' || trimmed === 'New request';
  }

  function deriveRequestName(url: string): string {
    const raw = url.trim();
    if (!raw) return 'New request';
    try {
      const u = new URL(raw);
      const path = u.pathname === '/' ? '' : u.pathname;
      const name = `${u.host}${path}` || u.host;
      return name.slice(0, 80) || 'New request';
    } catch {
      return raw.split(/[?#]/)[0]?.slice(0, 80) || 'New request';
    }
  }

  function ensureRequestName(req: ApiRequest, url: string): ApiRequest {
    if (!isUnsetRequestName(req.name)) return req;
    return { ...req, name: deriveRequestName(url) };
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
    void tick().then(() => scrollActiveTabIntoView());
  }

  function scrollActiveTabIntoView() {
    const el = reqTabsStrip?.querySelector<HTMLElement>(`.tab.active`);
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function startTabRename(tabId: string, currentName: string) {
    renamingTabId = tabId;
    renameTabValue = currentName;
    void tick().then(() => {
      renameTabInput?.focus();
      renameTabInput?.select();
    });
  }

  function commitTabRename() {
    if (!renamingTabId) return;
    const id = renamingTabId;
    const name = renameTabValue.trim() || 'New request';
    renamingTabId = null;
    tabs = tabs.map((t) => (t.id === id ? { ...t, request: { ...t.request, name } } : t));
  }

  function cancelTabRename() {
    renamingTabId = null;
  }

  function onTabDragStart(e: DragEvent, tabId: string) {
    if (renamingTabId) {
      e.preventDefault();
      return;
    }
    dragTabId = tabId;
    e.dataTransfer?.setData('text/plain', tabId);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  }

  function onTabDragOver(e: DragEvent, targetId: string) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    if (!dragTabId || dragTabId === targetId) return;
  }

  function onTabDrop(e: DragEvent, targetId: string) {
    e.preventDefault();
    const fromId = dragTabId ?? e.dataTransfer?.getData('text/plain');
    dragTabId = null;
    if (!fromId || fromId === targetId) return;
    const fromIndex = tabs.findIndex((t) => t.id === fromId);
    const toIndex = tabs.findIndex((t) => t.id === targetId);
    if (fromIndex < 0 || toIndex < 0) return;
    const next = [...tabs];
    const [item] = next.splice(fromIndex, 1);
    if (!item) return;
    next.splice(toIndex, 0, item);
    tabs = next;
  }

  function onTabDragEnd() {
    dragTabId = null;
  }

  function onTreeDragStart(e: DragEvent, collectionId: string, parentPath: string[], nodeId: string) {
    dragTree = { collectionId, parentPath, nodeId };
    dropTree = null;
    e.dataTransfer?.setData('text/plain', nodeId);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  }

  function onTreeDragOver(e: DragEvent, collectionId: string, parentPath: string[], nodeId: string) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    if (!dragTree || dragTree.collectionId !== collectionId) {
      dropTree = null;
      return;
    }
    if (dragTree.parentPath.join('/') !== parentPath.join('/') || dragTree.nodeId === nodeId) {
      dropTree = null;
      return;
    }
    const li = e.currentTarget as HTMLElement;
    const rect = li.getBoundingClientRect();
    const edge = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
    dropTree = { collectionId, parentPath, nodeId, edge };
  }

  function onTreeDrop(e: DragEvent, collectionId: string, parentPath: string[], nodeId: string) {
    e.preventDefault();
    const from = dragTree;
    const edge = dropTree?.collectionId === collectionId && dropTree.nodeId === nodeId ? dropTree.edge : 'before';
    dragTree = null;
    dropTree = null;
    if (!from || from.collectionId !== collectionId) return;
    if (from.parentPath.join('/') !== parentPath.join('/') || from.nodeId === nodeId) return;
    const col = apiState?.collections.find((c) => c.id === collectionId);
    if (!col) return;
    const siblings =
      parentPath.length === 0
        ? (col.children ?? [])
        : (() => {
            let nodes = col.children ?? [];
            for (const id of parentPath) {
              const folder = nodes.find((n) => n.id === id);
              if (!folder || folder.kind !== 'folder') return [] as CollectionNode[];
              nodes = folder.children;
            }
            return nodes;
          })();
    const fromIndex = siblings.findIndex((n) => n.id === from.nodeId);
    const anchorIndex = siblings.findIndex((n) => n.id === nodeId);
    if (fromIndex < 0 || anchorIndex < 0) return;
    let toIndex = edge === 'after' ? anchorIndex + 1 : anchorIndex;
    if (fromIndex < toIndex) toIndex -= 1;
    if (toIndex === fromIndex) return;
    mutateCollectionById(collectionId, (c) => reorderNode(c, parentPath, from.nodeId, toIndex));
  }

  function onTreeDragEnd() {
    dragTree = null;
    dropTree = null;
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

  function beautifyBodyJson() {
    if (request.body?.mode !== 'raw' || (request.body.language ?? 'json') !== 'json') return;
    try {
      const pretty = JSON.stringify(JSON.parse(request.body.text), null, 2);
      patchRequest({ body: { ...request.body, text: pretty } });
      statusMessage = 'Beautified JSON body.';
    } catch {
      statusMessage = 'Body is not valid JSON.';
    }
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
      // Auto-name from URL once we know the request URL (before scripts may rewrite it).
      if (isUnsetRequestName(working.name) && working.url.trim()) {
        working = ensureRequestName(working, working.url);
        patchRequest({ name: working.name });
      }

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
          const named = ensureRequestName(working, prepared.url);
          if (named.name !== working.name) {
            working = named;
            patchRequest({ name: named.name });
          }
          const hist = await pushHistory(area, {
            id: crypto.randomUUID(),
            at: Date.now(),
            method: working.method,
            url: prepared.url,
            status: outcome.status,
            timeMs: 0,
            bodyPreview: outcome.body,
            ...(isUnsetRequestName(working.name) ? {} : { name: working.name }),
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
      const named = ensureRequestName(working, prepared.url);
      if (named.name !== working.name) {
        working = named;
        patchRequest({ name: named.name });
      }
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
        ...(isUnsetRequestName(working.name) ? {} : { name: working.name }),
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
      ...emptyRequest(crypto.randomUUID(), entry.name?.trim() || entry.url),
      method: entry.method,
      url: entry.url,
    });
  }

  function deleteHistoryEntry(id: string) {
    if (!apiState) return;
    void persist({ ...apiState, history: apiState.history.filter((h) => h.id !== id) });
  }

  function clearHistory() {
    dialog = { kind: 'clear-history' };
  }

  function addEnvironment() {
    if (!apiState) return;
    const env: Environment = {
      id: crypto.randomUUID(),
      name: `Environment ${apiState.environments.length + 1}`,
      variables: [{ id: crypto.randomUUID(), key: 'host', initialValue: '', currentValue: '', secret: false, encrypted: null }],
    };
    envExpanded = { ...envExpanded, [env.id]: true };
    void persist({ ...apiState, environments: [...apiState.environments, env], activeEnvironmentId: env.id });
  }

  function updateEnvVar(envId: string, varId: string, patch: Partial<Environment['variables'][0]>) {
    if (!apiState) return;
    const environments = apiState.environments.map((env) =>
      env.id !== envId ? env : { ...env, variables: env.variables.map((v) => (v.id === varId ? { ...v, ...patch } : v)) },
    );
    void persist({ ...apiState, environments });
  }

  function removeEnvVar(envId: string, varId: string) {
    if (!apiState) return;
    const environments = apiState.environments.map((env) =>
      env.id !== envId ? env : { ...env, variables: env.variables.filter((v) => v.id !== varId) },
    );
    void persist({ ...apiState, environments });
  }

  function openRenameEnvironment(env: Environment) {
    dialog = {
      kind: 'rename',
      target: 'environment',
      collectionId: '',
      path: [],
      title: 'Rename environment',
      value: env.name,
      environmentId: env.id,
    };
    void tick().then(() => {
      dialogInput?.focus();
      dialogInput?.select();
    });
  }

  function openDeleteEnvironment(env: Environment) {
    dialog = {
      kind: 'delete',
      target: 'environment',
      collectionId: '',
      path: [],
      name: env.name,
      environmentId: env.id,
    };
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
      statusMessage = 'Import must be cURL or Collection v2.1 JSON.';
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
    a.download = `${col.name.replace(/\s+/g, '-').toLowerCase()}-collection.json`;
    a.click();
    URL.revokeObjectURL(url);
    statusMessage = 'Exported Collection v2.1.';
  }

  function mutateCollection(fn: (c: Collection) => Collection) {
    if (!apiState || !activeCollection) return;
    mutateCollectionById(activeCollection.id, fn);
  }

  function mutateCollectionById(collectionId: string, fn: (c: Collection) => Collection) {
    if (!apiState) return;
    const collections = apiState.collections.map((c) => (c.id === collectionId ? fn(c) : c));
    void persist({ ...apiState, collections });
  }

  function addNewCollection() {
    if (!apiState) return;
    const col = createCollection(`Collection ${apiState.collections.length + 1}`);
    void persist({ ...apiState, collections: [...apiState.collections, col] });
    selectedCollectionId = col.id;
  }

  function onKeydown(event: KeyboardEvent) {
    if (dialog) {
      if (event.key === 'Escape') {
        event.preventDefault();
        dialog = null;
        return;
      }
      if (event.key === 'Enter' && dialog.kind === 'rename') {
        event.preventDefault();
        confirmDialog();
        return;
      }
    }
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

  function closeTreeMenu() {
    treeMenuId = null;
  }

  function onTreeMenuPointer(e: PointerEvent) {
    if (!treeMenuId) return;
    const target = e.target;
    if (target instanceof Element && target.closest('.tree .menu-wrap')) return;
    closeTreeMenu();
  }

  $effect(() => {
    if (!treeMenuId) return;
    document.addEventListener('pointerdown', onTreeMenuPointer, true);
    return () => document.removeEventListener('pointerdown', onTreeMenuPointer, true);
  });

  function openRename(target: 'collection' | 'folder' | 'request', collectionId: string, path: string[], name: string) {
    closeTreeMenu();
    const title = target === 'collection' ? 'Rename collection' : target === 'folder' ? 'Rename folder' : 'Rename request';
    dialog = { kind: 'rename', target, collectionId, path, title, value: name };
    // Focus/select once on open (not on every value change).
    void tick().then(() => {
      dialogInput?.focus();
      dialogInput?.select();
    });
  }

  function openDelete(target: 'collection' | 'folder' | 'request', collectionId: string, path: string[], name: string) {
    closeTreeMenu();
    dialog = { kind: 'delete', target, collectionId, path, name };
  }

  function confirmDialog() {
    if (!dialog || !apiState) return;
    const current = dialog;
    dialog = null;
    if (current.kind === 'clear-history') {
      void persist({ ...apiState, history: [] });
      statusMessage = 'History cleared.';
      return;
    }
    if (current.kind === 'rename') {
      const name = current.value.trim() || current.value;
      if (current.target === 'environment' && current.environmentId) {
        void persist({
          ...apiState,
          environments: apiState.environments.map((e) =>
            e.id === current.environmentId ? { ...e, name: name.trim() || 'Untitled' } : e,
          ),
        });
        return;
      }
      if (current.target === 'collection') {
        void persist({
          ...apiState,
          collections: apiState.collections.map((c) => (c.id === current.collectionId ? renameCollection(c, name) : c)),
        });
      } else if (current.target === 'folder' || current.target === 'request') {
        mutateCollectionById(current.collectionId, (c) => renameNode(c, current.path, name));
      }
      return;
    }
    if (current.target === 'environment' && current.environmentId) {
      const environments = apiState.environments.filter((e) => e.id !== current.environmentId);
      const activeEnvironmentId =
        apiState.activeEnvironmentId === current.environmentId
          ? (environments[0]?.id ?? null)
          : apiState.activeEnvironmentId;
      void persist({ ...apiState, environments, activeEnvironmentId });
      return;
    }
    if (current.target === 'collection') {
      const collections = apiState.collections.filter((c) => c.id !== current.collectionId);
      void persist({ ...apiState, collections });
      if (selectedCollectionId === current.collectionId) selectedCollectionId = collections[0]?.id ?? null;
      return;
    }
    mutateCollectionById(current.collectionId, (c) => deleteNode(c, current.path));
  }

  // Autosave: active dirty tab only, 1s idle → saveRequest (separate from rules AUTOSAVE_KEY).
  $effect(() => {
    if (!apiState || !autosaveOn || !dirtyRequest) return;
    const tabId = activeTabId;
    const snapshot = JSON.stringify(activeTab.request);
    const timer = setTimeout(() => {
      if (activeTabId !== tabId) return;
      if (JSON.stringify(activeTab.request) !== snapshot) return;
      if (JSON.stringify(activeTab.request) === activeTab.savedSnapshot) return;
      saveRequest();
    }, 1000);
    return () => clearTimeout(timer);
  });

  $effect(() => {
    void activeTabId;
    void tick().then(() => scrollActiveTabIntoView());
  });

  const URL_GROW_MAX_LINES = 8;

  function urlGrowMax(el: HTMLTextAreaElement): number | undefined {
    return el.id === 'tester-url' ? URL_GROW_MAX_LINES : undefined;
  }

  function onGrowFocus(e: FocusEvent) {
    const el = e.currentTarget as HTMLTextAreaElement;
    syncGrowFieldCollapsed(el, true, urlGrowMax(el));
  }

  function onGrowBlur(e: FocusEvent) {
    const el = e.currentTarget as HTMLTextAreaElement;
    syncGrowFieldCollapsed(el, false, urlGrowMax(el));
  }

  function onGrowInput(e: Event) {
    const el = e.currentTarget as HTMLTextAreaElement;
    syncGrowFieldCollapsed(el, document.activeElement === el, urlGrowMax(el));
  }

  /** Re-collapse URL when tab/url changes while the field is not focused. */
  $effect(() => {
    void activeTabId;
    void request.url;
    void tick().then(() => {
      const el = document.getElementById('tester-url') as HTMLTextAreaElement | null;
      if (!el) return;
      syncGrowFieldCollapsed(el, document.activeElement === el, URL_GROW_MAX_LINES);
    });
  });
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
      <label class="apply" title="Automatically save the active dirty request after 1 second idle">
        <input type="checkbox" checked={autosaveOn} onchange={(e) => setAutosaveRequests((e.currentTarget as HTMLInputElement).checked)} />
        Autosave requests
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
          <button
            type="button"
            class="btn"
            class:active={importOpen}
            aria-pressed={importOpen}
            onclick={() => (importOpen = !importOpen)}
          >Import</button>
          <button type="button" class="btn" onclick={exportActiveCollection}>Export</button>
        </div>
        {#if importOpen}
          <div class="import-box">
            <textarea rows="5" placeholder="Paste cURL or Collection v2.1 JSON" bind:value={importText}></textarea>
            <button type="button" class="btn primary" onclick={runImport}>Import</button>
          </div>
        {/if}
        <ul class="tree">
          {#each apiState?.collections ?? [] as col (col.id)}
            {@const colMenu = `col:${col.id}`}
            <li class="col">
              <div class="tree-row level-0" class:menu-open={treeMenuId === colMenu}>
                <button type="button" class="link col-name" class:active={selectedCollectionId === col.id} onclick={() => (selectedCollectionId = col.id)}>
                  {col.name}
                </button>
                <div class="menu-wrap">
                  <button
                    type="button"
                    class="btn icon tree-kebab"
                    aria-label="Collection {col.name} menu"
                    title="Collection menu"
                    aria-haspopup="menu"
                    aria-expanded={treeMenuId === colMenu}
                    onclick={() => (treeMenuId = treeMenuId === colMenu ? null : colMenu)}
                  >
                    <Icon name="kebab" />
                  </button>
                  {#if treeMenuId === colMenu}
                    <ul class="menu" role="menu">
                      <li role="none">
                        <button type="button" role="menuitem" onclick={() => openRename('collection', col.id, [], col.name)}>Rename</button>
                      </li>
                      <li role="none">
                        <button
                          type="button"
                          role="menuitem"
                          onclick={() => {
                            closeTreeMenu();
                            if (!apiState) return;
                            const copy = duplicateCollection(col);
                            void persist({ ...apiState, collections: [...apiState.collections, copy] });
                            selectedCollectionId = copy.id;
                          }}>Duplicate</button
                        >
                      </li>
                      <li role="none">
                        <button
                          type="button"
                          role="menuitem"
                          onclick={() => {
                            closeTreeMenu();
                            selectedCollectionId = col.id;
                            mutateCollectionById(col.id, (c) => addChild(c, [], createFolder()));
                          }}>New folder</button
                        >
                      </li>
                      <li role="none">
                        <button
                          type="button"
                          role="menuitem"
                          onclick={() => {
                            closeTreeMenu();
                            selectedCollectionId = col.id;
                            const node = createRequestNode();
                            mutateCollectionById(col.id, (c) => addChild(c, [], node));
                            openNewTab(node.request);
                          }}>New request</button
                        >
                      </li>
                      <li role="none">
                        <button type="button" role="menuitem" class="danger" onclick={() => openDelete('collection', col.id, [], col.name)}>Delete</button>
                      </li>
                    </ul>
                  {/if}
                </div>
              </div>
              <ul class="tree-children">
                {#each col.children ?? [] as node (node.id)}
                  {#if node.kind === 'request'}
                    {@const reqMenu = `req:${col.id}:${node.id}`}
                    <li
                      class="tree-row level-1"
                      class:menu-open={treeMenuId === reqMenu}
                      class:dragging={dragTree?.nodeId === node.id}
                      class:drop-before={dropTree?.nodeId === node.id && dropTree.edge === 'before'}
                      class:drop-after={dropTree?.nodeId === node.id && dropTree.edge === 'after'}
                      ondragover={(e) => onTreeDragOver(e, col.id, [], node.id)}
                      ondrop={(e) => onTreeDrop(e, col.id, [], node.id)}
                      ondragend={onTreeDragEnd}
                    >
                      <span
                        class="tree-grip"
                        role="img"
                        aria-label="Drag to reorder"
                        title="Drag to reorder"
                        draggable="true"
                        ondragstart={(e) => onTreeDragStart(e, col.id, [], node.id)}
                      >
                        <Icon name="grip" />
                      </span>
                      <button type="button" class="link req-link" onclick={() => openNode(node)}>
                        <span class="method-chip">{node.request.method}</span>
                        <span class="req-name">{node.request.name}</span>
                      </button>
                      <div class="menu-wrap">
                        <button
                          type="button"
                          class="btn icon tree-kebab"
                          aria-label="Request {node.request.name} menu"
                          title="Request menu"
                          aria-haspopup="menu"
                          aria-expanded={treeMenuId === reqMenu}
                          onclick={() => (treeMenuId = treeMenuId === reqMenu ? null : reqMenu)}
                        >
                          <Icon name="kebab" />
                        </button>
                        {#if treeMenuId === reqMenu}
                          <ul class="menu" role="menu">
                            <li role="none">
                              <button type="button" role="menuitem" onclick={() => openRename('request', col.id, [node.id], node.request.name)}>Rename</button>
                            </li>
                            <li role="none">
                              <button
                                type="button"
                                role="menuitem"
                                onclick={() => {
                                  closeTreeMenu();
                                  mutateCollectionById(col.id, (c) => duplicateNode(c, [node.id]));
                                }}>Duplicate</button
                              >
                            </li>
                            <li role="none">
                              <button type="button" role="menuitem" class="danger" onclick={() => openDelete('request', col.id, [node.id], node.request.name)}>Delete</button>
                            </li>
                          </ul>
                        {/if}
                      </div>
                    </li>
                  {:else}
                    {@const folderMenu = `folder:${col.id}:${node.id}`}
                    <li>
                      <div
                        class="tree-row level-1"
                        class:menu-open={treeMenuId === folderMenu}
                        class:dragging={dragTree?.nodeId === node.id}
                        class:drop-before={dropTree?.nodeId === node.id && dropTree.edge === 'before'}
                        class:drop-after={dropTree?.nodeId === node.id && dropTree.edge === 'after'}
                        role="group"
                        aria-label="Folder {node.name}"
                        ondragover={(e) => onTreeDragOver(e, col.id, [], node.id)}
                        ondrop={(e) => onTreeDrop(e, col.id, [], node.id)}
                        ondragend={onTreeDragEnd}
                      >
                        <span
                          class="tree-grip"
                          role="img"
                          aria-label="Drag to reorder"
                          title="Drag to reorder"
                          draggable="true"
                          ondragstart={(e) => onTreeDragStart(e, col.id, [], node.id)}
                        >
                          <Icon name="grip" />
                        </span>
                        <span class="folder-label">{node.name}</span>
                        <div class="menu-wrap">
                          <button
                            type="button"
                            class="btn icon tree-kebab"
                            aria-label="Folder {node.name} menu"
                            title="Folder menu"
                            aria-haspopup="menu"
                            aria-expanded={treeMenuId === folderMenu}
                            onclick={() => (treeMenuId = treeMenuId === folderMenu ? null : folderMenu)}
                          >
                            <Icon name="kebab" />
                          </button>
                          {#if treeMenuId === folderMenu}
                            <ul class="menu" role="menu">
                              <li role="none">
                                <button type="button" role="menuitem" onclick={() => openRename('folder', col.id, [node.id], node.name)}>Rename</button>
                              </li>
                              <li role="none">
                                <button
                                  type="button"
                                  role="menuitem"
                                  onclick={() => {
                                    closeTreeMenu();
                                    mutateCollectionById(col.id, (c) => duplicateNode(c, [node.id]));
                                  }}>Duplicate</button
                                >
                              </li>
                              <li role="none">
                                <button
                                  type="button"
                                  role="menuitem"
                                  onclick={() => {
                                    closeTreeMenu();
                                    const child = createRequestNode();
                                    mutateCollectionById(col.id, (c) => addChild(c, [node.id], child));
                                    openNewTab(child.request);
                                  }}>New request</button
                                >
                              </li>
                              <li role="none">
                                <button type="button" role="menuitem" class="danger" onclick={() => openDelete('folder', col.id, [node.id], node.name)}>Delete</button>
                              </li>
                            </ul>
                          {/if}
                        </div>
                      </div>
                      <ul class="tree-children">
                        {#each node.children as child (child.id)}
                          {#if child.kind === 'request'}
                            {@const childMenu = `req:${col.id}:${node.id}:${child.id}`}
                            <li
                              class="tree-row level-2"
                              class:menu-open={treeMenuId === childMenu}
                              class:dragging={dragTree?.nodeId === child.id}
                              class:drop-before={dropTree?.nodeId === child.id && dropTree.edge === 'before'}
                              class:drop-after={dropTree?.nodeId === child.id && dropTree.edge === 'after'}
                              ondragover={(e) => onTreeDragOver(e, col.id, [node.id], child.id)}
                              ondrop={(e) => onTreeDrop(e, col.id, [node.id], child.id)}
                              ondragend={onTreeDragEnd}
                            >
                              <span
                                class="tree-grip"
                                role="img"
                                aria-label="Drag to reorder"
                                title="Drag to reorder"
                                draggable="true"
                                ondragstart={(e) => onTreeDragStart(e, col.id, [node.id], child.id)}
                              >
                                <Icon name="grip" />
                              </span>
                              <button type="button" class="link req-link" onclick={() => openNode(child)}>
                                <span class="method-chip">{child.request.method}</span>
                                <span class="req-name">{child.request.name}</span>
                              </button>
                              <div class="menu-wrap">
                                <button
                                  type="button"
                                  class="btn icon tree-kebab"
                                  aria-label="Request {child.request.name} menu"
                                  title="Request menu"
                                  aria-haspopup="menu"
                                  aria-expanded={treeMenuId === childMenu}
                                  onclick={() => (treeMenuId = treeMenuId === childMenu ? null : childMenu)}
                                >
                                  <Icon name="kebab" />
                                </button>
                                {#if treeMenuId === childMenu}
                                  <ul class="menu" role="menu">
                                    <li role="none">
                                      <button type="button" role="menuitem" onclick={() => openRename('request', col.id, [node.id, child.id], child.request.name)}>Rename</button>
                                    </li>
                                    <li role="none">
                                      <button
                                        type="button"
                                        role="menuitem"
                                        onclick={() => {
                                          closeTreeMenu();
                                          mutateCollectionById(col.id, (c) => duplicateNode(c, [node.id, child.id]));
                                        }}>Duplicate</button
                                      >
                                    </li>
                                    <li role="none">
                                      <button type="button" role="menuitem" class="danger" onclick={() => openDelete('request', col.id, [node.id, child.id], child.request.name)}>Delete</button>
                                    </li>
                                  </ul>
                                {/if}
                              </div>
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
        <div class="history-tools">
          <input
            type="search"
            class="history-search"
            placeholder="Search history…"
            aria-label="Search history"
            bind:value={historyQuery}
          />
          <button
            type="button"
            class="btn"
            disabled={(apiState?.history.length ?? 0) === 0}
            onclick={clearHistory}
          >Clear</button>
        </div>
        {#if historyGroups.length === 0}
          <p class="muted">{(apiState?.history.length ?? 0) === 0 ? 'No history yet.' : 'No matching history.'}</p>
        {:else}
          {#each historyGroups as group (group.key)}
            <div class="history-group">
              <h3 class="history-group-label">{group.label}</h3>
              <ul class="history-list">
                {#each group.entries as entry (entry.id)}
                  <li class="history-row">
                    <button
                      type="button"
                      class="history-open"
                      title={entry.url}
                      onclick={() => openHistory(entry.id)}
                    >
                      <span class="method-chip">{entry.method}</span>
                      <span
                        class="history-status"
                        class:ok={entry.status != null && entry.status >= 200 && entry.status < 400}
                        class:bad={entry.status != null && (entry.status >= 400 || entry.status === 0)}
                      >{entry.status ?? '—'}</span>
                      <span class="history-label">{historyRowLabel(entry)}</span>
                    </button>
                    <button
                      type="button"
                      class="btn icon history-delete"
                      aria-label="Delete history entry"
                      title="Delete history entry"
                      onclick={() => deleteHistoryEntry(entry.id)}
                    >×</button>
                  </li>
                {/each}
              </ul>
            </div>
          {/each}
        {/if}
      {:else}
        <div class="side-tools env-tools">
          <button type="button" class="btn" onclick={addEnvironment}>New environment</button>
          <div class="passphrase-field">
            <label for="api-env-passphrase">Passphrase</label>
            <input
              id="api-env-passphrase"
              type="password"
              autocomplete="off"
              bind:value={passphrase}
              placeholder="For encrypt / unlock"
            />
            <p class="muted passphrase-hint">Used only to encrypt or unlock secret variables.</p>
          </div>
        </div>
        <p class="muted env-hint">Use {'{{key}}'} in URL, headers, and body.</p>
        {#each apiState?.environments ?? [] as env (env.id)}
          {@const expanded = isEnvExpanded(env.id)}
          <div class="env-card" class:active-env={env.id === apiState?.activeEnvironmentId}>
            <div class="env-header">
              <button
                type="button"
                class="env-toggle"
                aria-expanded={expanded}
                onclick={() => toggleEnvExpanded(env.id)}
              >
                <span class="env-caret" aria-hidden="true">{expanded ? '▾' : '▸'}</span>
                <span class="env-title">{env.name}</span>
                {#if !expanded}
                  <span class="muted env-count">{env.variables.length}</span>
                {/if}
              </button>
              <div class="env-header-actions">
                <button
                  type="button"
                  class="btn icon env-action"
                  class:active={env.id === apiState?.activeEnvironmentId}
                  aria-label={env.id === apiState?.activeEnvironmentId ? 'Active environment' : 'Set active'}
                  title={env.id === apiState?.activeEnvironmentId ? 'Active environment' : 'Set active'}
                  onclick={() => setActiveEnv(env.id)}
                ><Icon name="star" size={14} /></button>
                <button
                  type="button"
                  class="btn icon env-action"
                  aria-label="Rename"
                  title="Rename"
                  onclick={() => openRenameEnvironment(env)}
                ><Icon name="pencil" size={14} /></button>
                <button
                  type="button"
                  class="btn icon env-action danger-text"
                  aria-label="Delete environment"
                  title="Delete environment"
                  onclick={() => openDeleteEnvironment(env)}
                ><Icon name="x" size={14} /></button>
              </div>
            </div>
            {#if expanded}
              {#each env.variables as variable (variable.id)}
                <div class="env-kv">
                  <input
                    class="env-kv-key"
                    aria-label="Variable key"
                    placeholder="Key"
                    value={variable.key}
                    oninput={(e) => updateEnvVar(env.id, variable.id, { key: (e.currentTarget as HTMLInputElement).value })}
                  />
                  {#if variable.encrypted}
                    <div class="env-kv-value-row">
                      <span class="muted env-kv-masked" title="Encrypted">{maskSecret('encrypted-secret')}</span>
                    </div>
                  {:else}
                    <input
                      class="env-kv-value"
                      aria-label="Variable value"
                      placeholder="Value"
                      type={variable.secret ? 'password' : 'text'}
                      value={variable.currentValue}
                      oninput={(e) =>
                        updateEnvVar(env.id, variable.id, {
                          currentValue: (e.currentTarget as HTMLInputElement).value,
                          initialValue: (e.currentTarget as HTMLInputElement).value,
                        })}
                    />
                  {/if}
                  <div class="env-kv-actions">
                    {#if variable.encrypted}
                      <button
                        type="button"
                        class="btn text"
                        aria-label="Unlock"
                        title="Unlock"
                        onclick={() => void unlockEnvVar(env.id, variable.id)}
                      >Unlock</button>
                    {:else}
                      <button
                        type="button"
                        class="btn text"
                        aria-label="Encrypt"
                        title="Encrypt"
                        onclick={() => void encryptEnvVar(env.id, variable.id)}
                      >Encrypt</button>
                    {/if}
                    <label class="secret">
                      <input type="checkbox" checked={variable.secret} onchange={(e) => updateEnvVar(env.id, variable.id, { secret: (e.currentTarget as HTMLInputElement).checked })} />
                      Secret
                    </label>
                    <button
                      type="button"
                      class="btn icon env-action"
                      aria-label="Remove variable"
                      title="Remove variable"
                      onclick={() => removeEnvVar(env.id, variable.id)}
                    ><Icon name="x" size={14} /></button>
                  </div>
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
            {/if}
          </div>
        {:else}
          <p class="muted">No environments. Use {'{{host}}'} after adding one.</p>
        {/each}
      {/if}
    </aside>

    <div class="main">
      <div class="req-tabs-bar">
        <div class="req-tabs" role="tablist" aria-label="Open requests" bind:this={reqTabsStrip}>
          {#each tabs as tab (tab.id)}
            {@const dirtyTab = JSON.stringify(tab.request) !== tab.savedSnapshot}
            <div
              class="tab"
              class:active={tab.id === activeTabId}
              class:dragging={dragTabId === tab.id}
              role="presentation"
              draggable={renamingTabId !== tab.id}
              ondragstart={(e) => onTabDragStart(e, tab.id)}
              ondragover={(e) => onTabDragOver(e, tab.id)}
              ondrop={(e) => onTabDrop(e, tab.id)}
              ondragend={onTabDragEnd}
            >
              {#if renamingTabId === tab.id}
                <input
                  class="tab-rename"
                  bind:this={renameTabInput}
                  bind:value={renameTabValue}
                  aria-label="Rename request"
                  onkeydown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitTabRename();
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      cancelTabRename();
                    }
                  }}
                  onblur={commitTabRename}
                />
              {:else}
                <button
                  type="button"
                  class="tab-main"
                  role="tab"
                  aria-selected={tab.id === activeTabId}
                  onclick={() => (activeTabId = tab.id)}
                  ondblclick={(e) => {
                    e.preventDefault();
                    startTabRename(tab.id, tab.request.name);
                  }}
                >
                  <span class="method-chip">{tab.request.method}</span>
                  <span class="tab-name">{tab.request.name}</span>
                  {#if dirtyTab}<span class="dirty-dot" title="Unsaved" aria-label="Unsaved"></span>{/if}
                </button>
                <button type="button" class="tab-close" aria-label="Close tab" title="Close tab" onclick={() => closeTab(tab.id)}>×</button>
              {/if}
            </div>
          {/each}
        </div>
        <button type="button" class="btn tab-add" onclick={() => openNewTab()} aria-label="New request tab" title="New request tab">+</button>
        <button type="button" class="btn tools-btn" onclick={() => (toolsOpen = true)}>Tools</button>
      </div>

      <div class="request-bar">
        <div class="request-actions">
          <label class="per-apply" title="Per-request override of the global default">
            <span class="muted">Rules</span>
            <select aria-label="Apply Detour rules for this request" value={request.applyDetourRules ?? 'inherit'} onchange={(e) => setPerRequestApply((e.currentTarget as HTMLSelectElement).value as ApplyDetourMode)}>
              {#each APPLY_DETOUR_MODES as mode (mode)}
                <option value={mode}>{mode === 'inherit' ? 'Use global' : mode === 'on' ? 'On' : 'Off'}</option>
              {/each}
            </select>
          </label>
          <button type="button" class="btn" onclick={saveRequest}>Save</button>
        </div>
        <div class="request-send-row">
          <select class="method-select" aria-label="Method" value={request.method} onchange={(e) => patchRequest({ method: (e.currentTarget as HTMLSelectElement).value as ApiRequest['method'] })}>
            {#each HTTP_METHODS as method (method)}
              <option value={method}>{method}</option>
            {/each}
          </select>
          <div class="url-wrap">
            <textarea
              id="tester-url"
              class="grow-field collapsed"
              rows="1"
              spellcheck="false"
              autocomplete="off"
              placeholder="https://api.example.com/… or paste curl …"
              value={request.url}
              onpaste={onUrlPaste}
              onfocus={onGrowFocus}
              onblur={onGrowBlur}
              oninput={(e) => {
                onUrlInput((e.currentTarget as HTMLTextAreaElement).value);
                onGrowInput(e);
              }}
            ></textarea>
            {#if urlSegments.some((s) => s.kind === 'var')}
              <p class="url-preview muted" aria-hidden="true">
                {#each urlSegments as seg, i (i)}
                  {#if seg.kind === 'text'}{seg.text}{:else}<span class:resolved={seg.resolved} class:unresolved={!seg.resolved} title={seg.resolved ? `${seg.key} = ${seg.value}` : `${seg.key} (unresolved)`}>{'{{' + seg.key + '}}'}</span>{/if}
                {/each}
              </p>
            {/if}
          </div>
          <button type="button" class="btn primary send-btn" disabled={sending} aria-busy={sending} onclick={() => void send()}>
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
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
      <p class="muted apply-hint" title="Effective Apply Detour rules for this request">
        Rules: <strong>{effectiveApply ? 'On' : 'Off'}</strong>
      </p>

      <div class="subtabs" role="tablist">
        <button type="button" class:active={subTab === 'params'} onclick={() => (subTab = 'params')}>
          Params{#if paramCount > 0}<span class="tab-count"> ({paramCount})</span>{/if}
        </button>
        <button type="button" class:active={subTab === 'auth'} onclick={() => (subTab = 'auth')}>
          Auth{#if authActive}<span class="tab-dot" title="Auth configured" aria-label="Auth configured"></span>{/if}
        </button>
        <button type="button" class:active={subTab === 'headers'} onclick={() => (subTab = 'headers')}>
          Headers{#if headerCount > 0}<span class="tab-count"> ({headerCount})</span>{/if}
        </button>
        <button type="button" class:active={subTab === 'body'} onclick={() => (subTab = 'body')}>
          Body{#if bodyActive}<span class="tab-dot" title="Body set" aria-label="Body set"></span>{/if}
        </button>
        <button type="button" class:active={subTab === 'scripts'} onclick={() => (subTab = 'scripts')}>Scripts</button>
      </div>

      <div class="subpanel">
        {#if subTab === 'params'}
          <KvTable
            title="Query Params"
            rows={request.params ?? []}
            onchange={(rows) => patchRequest({ params: rows })}
          />
        {:else if subTab === 'auth'}
          <div class="auth-form">
            <div class="auth-row">
              <label for="auth-type">Type</label>
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
            </div>
            {#if (request.auth?.type ?? 'none') === 'none'}
              <p class="muted auth-hint">No authentication for this request.</p>
            {:else if request.auth?.type === 'basic'}
              <div class="auth-row">
                <label for="auth-basic-user">Username</label>
                <input id="auth-basic-user" placeholder="Username" value={request.auth.username} oninput={(e) => patchRequest({ auth: { type: 'basic', username: (e.currentTarget as HTMLInputElement).value, password: request.auth?.type === 'basic' ? request.auth.password : '' } })} />
              </div>
              <div class="auth-row">
                <label for="auth-basic-pass">Password</label>
                <input id="auth-basic-pass" type="password" placeholder="Password" value={request.auth.password} oninput={(e) => patchRequest({ auth: { type: 'basic', username: request.auth?.type === 'basic' ? request.auth.username : '', password: (e.currentTarget as HTMLInputElement).value } })} />
              </div>
            {:else if request.auth?.type === 'bearer'}
              <div class="auth-row">
                <label for="auth-bearer-token">Token</label>
                <textarea
                  id="auth-bearer-token"
                  class="grow-field collapsed"
                  rows="1"
                  placeholder="Token"
                  value={request.auth.token}
                  onfocus={onGrowFocus}
                  onblur={onGrowBlur}
                  oninput={(e) => {
                    patchRequest({ auth: { type: 'bearer', token: (e.currentTarget as HTMLTextAreaElement).value } });
                    onGrowInput(e);
                  }}
                ></textarea>
              </div>
              <p class="muted auth-hint">Sent as <code>Authorization: Bearer …</code>.</p>
            {:else if request.auth?.type === 'apikey'}
              <div class="auth-row">
                <label for="auth-apikey-key">Key</label>
                <input id="auth-apikey-key" placeholder="Key" value={request.auth.key} oninput={(e) => request.auth?.type === 'apikey' && patchRequest({ auth: { ...request.auth, key: (e.currentTarget as HTMLInputElement).value } })} />
              </div>
              <div class="auth-row">
                <label for="auth-apikey-value">Value</label>
                <textarea
                  id="auth-apikey-value"
                  class="grow-field collapsed"
                  rows="1"
                  placeholder="Value"
                  value={request.auth.value}
                  onfocus={onGrowFocus}
                  onblur={onGrowBlur}
                  oninput={(e) => {
                    if (request.auth?.type !== 'apikey') return;
                    patchRequest({ auth: { ...request.auth, value: (e.currentTarget as HTMLTextAreaElement).value } });
                    onGrowInput(e);
                  }}
                ></textarea>
              </div>
              <div class="auth-row">
                <label for="auth-apikey-in">Add to</label>
                <select id="auth-apikey-in" value={request.auth.in ?? 'header'} onchange={(e) => request.auth?.type === 'apikey' && patchRequest({ auth: { ...request.auth, in: (e.currentTarget as HTMLSelectElement).value as 'header' | 'query' } })}>
                  <option value="header">Header</option>
                  <option value="query">Query</option>
                </select>
              </div>
            {:else if request.auth?.type === 'oauth2'}
              <div class="auth-row">
                <label for="auth-oauth-grant">Grant</label>
                <select
                  id="auth-oauth-grant"
                  aria-label="OAuth grant"
                  value={request.auth.grant ?? 'authorization_code'}
                  onchange={(e) => request.auth?.type === 'oauth2' && patchRequest({ auth: { ...request.auth, grant: (e.currentTarget as HTMLSelectElement).value as 'authorization_code' | 'client_credentials' | 'password' } })}
                >
                  <option value="authorization_code">Authorization code + PKCE</option>
                  <option value="client_credentials">Client credentials</option>
                  <option value="password">Password</option>
                </select>
              </div>
              <div class="auth-row">
                <label for="auth-oauth-authorize">Authorize URL</label>
                <input id="auth-oauth-authorize" placeholder="Authorize URL" value={request.auth.authorizeUrl ?? ''} oninput={(e) => request.auth?.type === 'oauth2' && patchRequest({ auth: { ...request.auth, authorizeUrl: (e.currentTarget as HTMLInputElement).value } })} />
              </div>
              <div class="auth-row">
                <label for="auth-oauth-token-url">Token URL</label>
                <input id="auth-oauth-token-url" placeholder="Token URL" value={request.auth.tokenUrl} oninput={(e) => request.auth?.type === 'oauth2' && patchRequest({ auth: { ...request.auth, tokenUrl: (e.currentTarget as HTMLInputElement).value } })} />
              </div>
              <div class="auth-row">
                <label for="auth-oauth-client">Client ID</label>
                <input id="auth-oauth-client" placeholder="Client ID" value={request.auth.clientId} oninput={(e) => request.auth?.type === 'oauth2' && patchRequest({ auth: { ...request.auth, clientId: (e.currentTarget as HTMLInputElement).value } })} />
              </div>
              <div class="auth-row">
                <label for="auth-oauth-secret">Client secret</label>
                <input id="auth-oauth-secret" type="password" placeholder="Optional" value={request.auth.clientSecret ?? ''} oninput={(e) => request.auth?.type === 'oauth2' && patchRequest({ auth: { ...request.auth, clientSecret: (e.currentTarget as HTMLInputElement).value } })} />
              </div>
              <div class="auth-row">
                <label for="auth-oauth-scope">Scope</label>
                <input id="auth-oauth-scope" placeholder="Scope" value={request.auth.scope ?? ''} oninput={(e) => request.auth?.type === 'oauth2' && patchRequest({ auth: { ...request.auth, scope: (e.currentTarget as HTMLInputElement).value } })} />
              </div>
              <div class="auth-row">
                <label for="auth-oauth-access">Access token</label>
                <textarea
                  id="auth-oauth-access"
                  class="grow-field collapsed"
                  rows="1"
                  placeholder="Or authorize below"
                  value={request.auth.accessToken ?? ''}
                  onfocus={onGrowFocus}
                  onblur={onGrowBlur}
                  oninput={(e) => {
                    if (request.auth?.type !== 'oauth2') return;
                    patchRequest({ auth: { ...request.auth, accessToken: (e.currentTarget as HTMLTextAreaElement).value } });
                    onGrowInput(e);
                  }}
                ></textarea>
              </div>
              {#if request.auth.grant === 'password'}
                <div class="auth-row">
                  <label for="auth-oauth-user">Username</label>
                  <input id="auth-oauth-user" placeholder="Username" value={request.auth.username ?? ''} oninput={(e) => request.auth?.type === 'oauth2' && patchRequest({ auth: { ...request.auth, username: (e.currentTarget as HTMLInputElement).value } })} />
                </div>
                <div class="auth-row">
                  <label for="auth-oauth-pass">Password</label>
                  <input id="auth-oauth-pass" type="password" placeholder="Password" value={request.auth.password ?? ''} oninput={(e) => request.auth?.type === 'oauth2' && patchRequest({ auth: { ...request.auth, password: (e.currentTarget as HTMLInputElement).value } })} />
                </div>
              {/if}
              <div class="auth-row">
                <label for="oauth-manual-code">Manual code</label>
                <input id="oauth-manual-code" placeholder="Firefox / paste code" />
              </div>
              <div class="auth-actions">
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
              </div>
            {:else if request.auth?.type === 'sigv4'}
              <div class="auth-row">
                <label for="auth-sigv4-key">Access key</label>
                <input id="auth-sigv4-key" placeholder="Access key ID" value={request.auth.accessKeyId} oninput={(e) => request.auth?.type === 'sigv4' && patchRequest({ auth: { ...request.auth, accessKeyId: (e.currentTarget as HTMLInputElement).value } })} />
              </div>
              <div class="auth-row">
                <label for="auth-sigv4-secret">Secret</label>
                <input id="auth-sigv4-secret" type="password" placeholder="Secret access key" value={request.auth.secretAccessKey} oninput={(e) => request.auth?.type === 'sigv4' && patchRequest({ auth: { ...request.auth, secretAccessKey: (e.currentTarget as HTMLInputElement).value } })} />
              </div>
              <div class="auth-row">
                <label for="auth-sigv4-session">Session</label>
                <input id="auth-sigv4-session" placeholder="Session token" value={request.auth.sessionToken ?? ''} oninput={(e) => request.auth?.type === 'sigv4' && patchRequest({ auth: { ...request.auth, sessionToken: (e.currentTarget as HTMLInputElement).value } })} />
              </div>
              <div class="auth-row">
                <label for="auth-sigv4-region">Region</label>
                <input id="auth-sigv4-region" placeholder="Region" value={request.auth.region} oninput={(e) => request.auth?.type === 'sigv4' && patchRequest({ auth: { ...request.auth, region: (e.currentTarget as HTMLInputElement).value } })} />
              </div>
              <div class="auth-row">
                <label for="auth-sigv4-service">Service</label>
                <input id="auth-sigv4-service" placeholder="Service" value={request.auth.service} oninput={(e) => request.auth?.type === 'sigv4' && patchRequest({ auth: { ...request.auth, service: (e.currentTarget as HTMLInputElement).value } })} />
              </div>
            {:else if request.auth?.type === 'digest'}
              <div class="auth-row">
                <label for="auth-digest-user">Username</label>
                <input id="auth-digest-user" placeholder="Username" value={request.auth.username} oninput={(e) => request.auth?.type === 'digest' && patchRequest({ auth: { ...request.auth, username: (e.currentTarget as HTMLInputElement).value } })} />
              </div>
              <div class="auth-row">
                <label for="auth-digest-pass">Password</label>
                <input id="auth-digest-pass" type="password" placeholder="Password" value={request.auth.password} oninput={(e) => request.auth?.type === 'digest' && patchRequest({ auth: { ...request.auth, password: (e.currentTarget as HTMLInputElement).value } })} />
              </div>
            {/if}
          </div>
        {:else if subTab === 'headers'}
          <KvTable
            title="Headers"
            keyPlaceholder="Header"
            rows={request.headers ?? []}
            onchange={(rows) => patchRequest({ headers: rows })}
          />
        {:else if subTab === 'body'}
          <div class="body-toolbar">
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
              <button
                type="button"
                class="btn text beautify"
                disabled={(request.body.language ?? 'json') !== 'json'}
                onclick={beautifyBodyJson}
              >
                Beautify
              </button>
            {/if}
          </div>
          {#if (request.body?.mode ?? 'none') === 'none'}
            <p class="muted body-empty">This request has no body.</p>
          {:else if request.body?.mode === 'raw'}
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
            <KvTable
              rows={request.body.rows}
              onchange={(rows) => {
                if (request.body?.mode !== 'urlencoded' && request.body?.mode !== 'formdata') return;
                patchRequest({ body: { ...request.body, rows } });
              }}
            />
          {:else if request.body?.mode === 'graphql'}
            <div class="graphql-body">
              <div class="auth-row">
                <label for="api-gql-op">Operation</label>
                <input
                  id="api-gql-op"
                  placeholder="Operation name (optional)"
                  value={request.body.operationName ?? ''}
                  oninput={(e) => {
                    if (request.body?.mode !== 'graphql') return;
                    patchRequest({ body: { ...request.body, operationName: (e.currentTarget as HTMLInputElement).value } });
                  }}
                />
              </div>
              <CodeEditor
                id="api-gql-query"
                label="Query"
                value={request.body.query}
                language="text"
                onchange={(query) => {
                  if (request.body?.mode !== 'graphql') return;
                  patchRequest({ body: { ...request.body, query } });
                }}
              />
              <CodeEditor
                id="api-gql-vars"
                label="Variables"
                value={request.body.variables ?? '{}'}
                language="json"
                onchange={(variables) => {
                  if (request.body?.mode !== 'graphql') return;
                  patchRequest({ body: { ...request.body, variables } });
                }}
              />
            </div>
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
          <span class="resp-title">Response</span>
          {#if activeTab.response}
            <div class="resp-meta-right">
              <span class:ok={activeTab.response.ok} class:bad={!activeTab.response.ok && activeTab.response.status === 0}>{activeTab.response.status || 'ERR'}</span>
              <span class="muted">{activeTab.response.timeMs} ms</span>
              <span class="muted">{formatBytes(activeTab.response.sizeBytes)}</span>
              {#if activeTab.rulesLabel}<span class="pill">{activeTab.rulesLabel}</span>{/if}
              {#if activeTab.response.error}<span class="bad">{activeTab.response.error}</span>{/if}
            </div>
          {/if}
        </div>
        <div class="resp-tabs" role="tablist">
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
            <div class="resp-empty">
              <p>Enter a URL and click Send to see the response.</p>
            </div>
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
    </div>
  </div>

  <Drawer open={toolsOpen} title="Tools" docked={toolsDocked} onclose={() => (toolsOpen = false)}>
    <div class="tools-body">
      <div class="tools-actions">
        <button type="button" class="btn" onclick={() => void copyCurl()}>Copy as cURL</button>
      </div>
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
          onOpenCaptured={(req) => openNewTab(req)}
        />
      {/if}
    </div>
  </Drawer>

  {#if dialog}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      class="modal"
      role="presentation"
      onclick={(e) => e.target === e.currentTarget && (dialog = null)}
      onkeydown={(e) => e.key === 'Escape' && (dialog = null)}
    >
      <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="api-dialog-title" tabindex="-1">
        {#if dialog.kind === 'rename'}
          <h3 id="api-dialog-title">{dialog.title}</h3>
          <label>
            Name
            <input
              bind:this={dialogInput}
              value={dialog.value}
              oninput={(e) => {
                if (dialog?.kind === 'rename') dialog = { ...dialog, value: e.currentTarget.value };
              }}
            />
          </label>
          <div class="modal-actions">
            <button type="button" class="btn" onclick={() => (dialog = null)}>Cancel</button>
            <button type="button" class="btn primary" onclick={confirmDialog}>Save</button>
          </div>
        {:else if dialog.kind === 'clear-history'}
          <h3 id="api-dialog-title">Clear history?</h3>
          <p>Remove all history entries? This cannot be undone.</p>
          <div class="modal-actions">
            <button type="button" class="btn" onclick={() => (dialog = null)}>Cancel</button>
            <button type="button" class="btn danger" onclick={confirmDialog}>Clear</button>
          </div>
        {:else}
          <h3 id="api-dialog-title">Delete {dialog.target}?</h3>
          <p>Delete “{dialog.name}”? This cannot be undone.</p>
          <div class="modal-actions">
            <button type="button" class="btn" onclick={() => (dialog = null)}>Cancel</button>
            <button type="button" class="btn danger" onclick={confirmDialog}>Delete</button>
          </div>
        {/if}
      </div>
    </div>
  {/if}
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
  .subtabs,
  .body-views {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    align-items: center;
  }
  .env,
  .apply,
  .per-apply,
  .secret {
    display: flex;
    gap: var(--space-2);
    align-items: center;
  }
  .side-tabs {
    display: flex;
    border-bottom: 1px solid var(--border);
    gap: 0;
  }
  .side-tabs button {
    flex: 1;
    appearance: none;
    background: transparent;
    border: 0;
    padding: 0.5rem;
    color: var(--text-muted);
    cursor: pointer;
    border-radius: 0;
  }
  .side-tabs button.active {
    color: var(--text);
    box-shadow: inset 0 -2px 0 var(--accent, #3b82f6);
    border-color: transparent;
    background: transparent;
  }
  .side-tools .btn.active {
    border-color: var(--accent, #3b82f6);
    background: color-mix(in srgb, var(--accent, #3b82f6) 12%, transparent);
  }
  .layout {
    display: grid;
    gap: var(--space-3);
    grid-template-columns: minmax(14rem, 18rem) minmax(0, 1fr);
    align-items: stretch;
    min-height: min(70vh, 48rem);
  }
  @media (max-width: 56rem) {
    .layout {
      grid-template-columns: 1fr;
      min-height: 0;
    }
  }
  .sidebar {
    display: grid;
    gap: var(--space-2);
    align-content: start;
    padding: var(--space-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface-2, var(--surface));
    min-height: 12rem;
    max-height: min(70vh, 48rem);
    overflow: auto;
  }
  .subtabs button,
  .body-views button {
    appearance: none;
    border: 1px solid var(--border);
    background: transparent;
    color: inherit;
    border-radius: var(--radius);
    padding: 0.25rem 0.5rem;
    cursor: pointer;
  }
  .subtabs button.active,
  .body-views button.active {
    border-color: var(--accent, #3b82f6);
    background: color-mix(in srgb, var(--accent, #3b82f6) 12%, transparent);
  }
  .resp-tabs {
    display: flex;
    border-bottom: 1px solid var(--border);
    gap: 0;
    flex-wrap: wrap;
  }
  .resp-tabs button {
    appearance: none;
    background: transparent;
    border: 0;
    padding: 0.45rem 0.65rem;
    color: var(--text-muted);
    cursor: pointer;
    border-radius: 0;
  }
  .resp-tabs button.active {
    color: var(--text);
    box-shadow: inset 0 -2px 0 var(--accent, #3b82f6);
  }
  .tree-grip {
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
    opacity: 0.4;
    cursor: grab;
    color: var(--text-muted);
  }
  .tree-row:hover .tree-grip,
  .tree-row.dragging .tree-grip {
    opacity: 0.9;
  }
  .tree-row.dragging {
    opacity: 0.55;
  }
  .tree-row.drop-before {
    box-shadow: inset 0 2px 0 var(--accent, #3b82f6);
  }
  .tree-row.drop-after {
    box-shadow: inset 0 -2px 0 var(--accent, #3b82f6);
  }
  .history-tools {
    display: flex;
    gap: var(--space-2);
    align-items: center;
  }
  .history-search {
    flex: 1;
    min-width: 0;
  }
  .history-group {
    display: grid;
    gap: 0.25rem;
  }
  .history-group-label {
    margin: 0.35rem 0 0;
    font-size: 0.75rem;
    font-weight: 650;
    color: var(--text-muted);
    text-transform: none;
    letter-spacing: normal;
  }
  .history-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.15rem;
  }
  .history-row {
    display: flex;
    gap: var(--space-1);
    align-items: center;
    min-width: 0;
  }
  .history-open {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    flex: 1;
    min-width: 0;
    appearance: none;
    border: 0;
    background: transparent;
    color: inherit;
    text-align: left;
    cursor: pointer;
    padding: 0.2rem 0;
    font: inherit;
  }
  .history-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }
  .history-status {
    flex-shrink: 0;
    font: 0.7rem/1.2 var(--mono, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-variant-numeric: tabular-nums;
    color: var(--text-muted);
  }
  .history-delete {
    opacity: 0.55;
    flex-shrink: 0;
  }
  .history-row:hover .history-delete {
    opacity: 1;
  }
  .passphrase-field {
    display: grid;
    gap: var(--space-1);
    width: 100%;
  }
  .passphrase-field label {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-muted);
  }
  .passphrase-field input {
    width: 100%;
    min-width: 0;
  }
  .passphrase-hint,
  .env-hint {
    margin: 0;
    font-size: 0.75rem;
  }
  .env-tools {
    flex-direction: column;
    align-items: stretch;
  }
  .env-header {
    display: flex;
    flex-wrap: nowrap;
    gap: var(--space-1);
    align-items: center;
    min-width: 0;
  }
  .env-toggle {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    flex: 1;
    min-width: 0;
    appearance: none;
    border: 0;
    background: transparent;
    color: inherit;
    text-align: left;
    cursor: pointer;
    padding: 0;
    font: inherit;
  }
  .env-caret {
    flex-shrink: 0;
  }
  .env-title {
    flex: 1;
    min-width: 0;
    font-weight: 650;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .env-count {
    flex-shrink: 0;
    font-size: 0.75rem;
  }
  .env-header-actions {
    display: flex;
    flex-shrink: 0;
    gap: 0.1rem;
    align-items: center;
  }
  .env-action {
    min-width: 1.6rem;
    width: 1.6rem;
    height: 1.6rem;
    padding: 0;
    border-color: transparent;
    background: transparent;
    color: var(--text-muted);
  }
  .env-action:hover:not(:disabled) {
    color: var(--text);
    border-color: transparent;
    background: color-mix(in srgb, var(--text) 8%, transparent);
  }
  .env-action.active {
    color: var(--accent, #3b82f6);
  }
  .env-action.danger-text:hover:not(:disabled) {
    color: var(--danger, #dc2626);
  }
  .env-card.active-env {
    border-left: 2px solid var(--accent, #3b82f6);
    padding-left: var(--space-2);
  }
  .danger-text {
    color: var(--danger, #dc2626);
  }
  .tree {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.15rem;
  }
  .tree-children {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.1rem;
  }
  .tree-row {
    display: flex;
    gap: var(--space-1);
    align-items: center;
    justify-content: space-between;
    min-width: 0;
    padding: 0.15rem 0.2rem;
    border-radius: var(--radius);
  }
  .tree-row.menu-open {
    position: relative;
    z-index: 40;
    background: var(--surface);
  }
  .tree-row.level-0 {
    padding-left: 0.2rem;
    border-left: 2px solid transparent;
  }
  .tree-row.level-1 {
    padding-left: 0.85rem;
    border-left: 2px solid color-mix(in srgb, var(--border) 80%, transparent);
  }
  .tree-row.level-2 {
    padding-left: 1.6rem;
    border-left: 2px solid color-mix(in srgb, var(--accent, #3b82f6) 35%, transparent);
  }
  .col-name {
    font-weight: 650;
    font-size: 0.9rem;
  }
  .folder-label {
    flex: 1;
    min-width: 0;
    color: var(--text-muted);
    font-size: 0.85rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .req-link {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    flex: 1;
    min-width: 0;
  }
  .req-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .method-chip {
    flex-shrink: 0;
    font: 0.65rem/1.2 var(--mono, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-weight: 700;
    letter-spacing: 0.02em;
    padding: 0.1rem 0.3rem;
    border-radius: 3px;
    background: color-mix(in srgb, var(--border) 55%, transparent);
    color: var(--text-muted);
  }
  .menu-wrap {
    position: relative;
    flex-shrink: 0;
  }
  .tree-kebab {
    opacity: 0.55;
  }
  .tree-row:hover .tree-kebab,
  .tree-row.menu-open .tree-kebab {
    opacity: 1;
  }
  .menu {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    z-index: 20;
    display: grid;
    gap: 0.1rem;
    min-width: 9rem;
    margin: 0;
    padding: var(--space-1);
    list-style: none;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: var(--shadow-2, 0 4px 16px color-mix(in srgb, var(--text) 12%, transparent));
  }
  .menu button {
    display: block;
    width: 100%;
    padding: var(--space-1) var(--space-2);
    border: 0;
    border-radius: calc(var(--radius) - 2px);
    background: transparent;
    color: inherit;
    text-align: left;
    cursor: pointer;
    font: inherit;
  }
  .menu button:hover {
    background: var(--accent-tint, color-mix(in srgb, var(--accent, #3b82f6) 12%, transparent));
  }
  .menu button.danger:hover {
    color: var(--danger, #dc2626);
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
    min-width: 0;
  }
  .link.active {
    font-weight: 650;
  }
  .main {
    display: grid;
    grid-template-rows: auto auto auto auto minmax(0, 1fr) auto;
    gap: var(--space-2);
    min-width: 0;
    min-height: 0;
  }
  .req-tabs-bar {
    display: flex;
    align-items: stretch;
    gap: var(--space-2);
    border-bottom: 1px solid var(--border);
    min-width: 0;
  }
  .req-tabs {
    display: flex;
    flex-wrap: nowrap;
    gap: 0;
    align-items: stretch;
    overflow-x: auto;
    flex: 1;
    min-width: 0;
    padding: 0;
    scrollbar-width: thin;
    scrollbar-color: color-mix(in srgb, var(--text-muted) 45%, transparent) transparent;
  }
  .req-tabs::-webkit-scrollbar {
    height: 4px;
  }
  .req-tabs::-webkit-scrollbar-track {
    background: transparent;
  }
  .req-tabs::-webkit-scrollbar-thumb {
    background: color-mix(in srgb, var(--text-muted) 45%, transparent);
    border-radius: 999px;
  }
  .req-tabs-bar .tab-add,
  .req-tabs-bar .tools-btn {
    flex-shrink: 0;
    align-self: center;
  }
  .req-tabs .tab {
    display: flex;
    align-items: stretch;
    flex: 0 0 auto;
    min-width: 8rem;
    max-width: 14rem;
    border: 0;
    border-bottom: 2px solid transparent;
    background: transparent;
    margin-bottom: -1px;
  }
  .req-tabs .tab.dragging {
    opacity: 0.55;
  }
  .req-tabs .tab-rename {
    width: 100%;
    min-width: 0;
    margin: 0.25rem;
    font: inherit;
  }
  .req-tabs .tab.active {
    background: var(--surface-2, var(--surface));
    border-bottom-color: var(--accent, #3b82f6);
  }
  .req-tabs .tab-main {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    min-width: 0;
    flex: 1;
    padding: 0.4rem 0.35rem 0.4rem 0.55rem;
    border: 0;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    font: inherit;
  }
  .req-tabs .tab.active .tab-main {
    color: var(--text);
    font-weight: 600;
  }
  .req-tabs .tab-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .req-tabs .dirty-dot {
    width: 0.4rem;
    height: 0.4rem;
    border-radius: 50%;
    background: var(--accent, #3b82f6);
    flex-shrink: 0;
  }
  .req-tabs .tab-close {
    appearance: none;
    border: 0;
    background: transparent;
    color: var(--text-muted);
    padding: 0 0.45rem;
    cursor: pointer;
    opacity: 0;
    font-size: 1rem;
    line-height: 1;
  }
  .req-tabs .tab:hover .tab-close,
  .req-tabs .tab.active .tab-close,
  .req-tabs .tab-close:focus-visible {
    opacity: 0.85;
  }
  .req-tabs .tab-close:hover {
    color: var(--text);
    opacity: 1;
  }
  .req-tabs-bar .tab-add {
    margin-left: 0;
  }
  .request-bar {
    display: grid;
    gap: var(--space-2);
  }
  .request-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    align-items: center;
  }
  .request-actions .per-apply select {
    width: auto;
  }
  .request-send-row {
    display: flex;
    flex-wrap: nowrap;
    gap: var(--space-2);
    align-items: start;
    min-width: 0;
  }
  .request-send-row .method-select {
    flex: 0 0 auto;
    width: auto;
  }
  .request-send-row .url-wrap {
    flex: 1 1 auto;
    min-width: 0;
  }
  .request-send-row .send-btn {
    flex: 0 0 auto;
  }
  .url-wrap textarea.grow-field {
    width: 100%;
    min-width: 0;
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
  .subpanel input,
  .subpanel select,
  .subpanel textarea.grow-field,
  .import-box textarea {
    width: 100%;
    min-width: 0;
  }
  .subtabs button {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }
  .tab-count {
    font-variant-numeric: tabular-nums;
    opacity: 0.85;
  }
  .tab-dot {
    width: 0.4rem;
    height: 0.4rem;
    border-radius: 50%;
    background: var(--accent, #3b82f6);
    flex-shrink: 0;
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
    font-size: 0.75rem;
    opacity: 0.75;
  }
  .subpanel,
  .response {
    display: grid;
    gap: var(--space-2);
    padding: var(--space-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    align-content: start;
  }
  .response {
    min-height: 12rem;
  }
  .auth-form {
    display: grid;
    gap: var(--space-2);
    max-width: 32rem;
    min-width: 0;
  }
  .auth-row {
    display: grid;
    grid-template-columns: 7.5rem minmax(0, 1fr);
    gap: var(--space-2);
    align-items: start;
  }
  .auth-row label {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-muted);
    padding-top: 0.4rem;
  }
  .auth-form select,
  .auth-row select {
    width: auto;
    max-width: 100%;
  }
  .auth-hint {
    margin: 0;
    font-size: 0.75rem;
  }
  .auth-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    align-items: center;
  }
  .body-toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    align-items: center;
    align-content: start;
  }
  .body-toolbar select {
    width: auto;
  }
  .body-toolbar .beautify {
    margin-left: auto;
  }
  .body-empty {
    margin: 0;
    font-size: 0.85rem;
  }
  .graphql-body {
    display: grid;
    gap: var(--space-2);
    min-width: 0;
  }
  .env-kv {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-1);
    min-width: 0;
  }
  .env-kv-key,
  .env-kv-value {
    width: 100%;
    min-width: 0;
  }
  .env-kv-value-row {
    min-width: 0;
  }
  .env-kv-masked {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .env-kv-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    align-items: center;
  }
  .env-kv-actions .secret {
    gap: 0.35rem;
    font-size: 0.8rem;
  }
  .resp-meta {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    align-items: center;
    justify-content: space-between;
  }
  .resp-title {
    font-weight: 650;
  }
  .resp-meta-right {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    align-items: center;
  }
  .resp-empty {
    display: grid;
    place-items: center;
    min-height: 10rem;
    text-align: center;
    color: var(--text-muted);
  }
  .resp-empty p {
    margin: 0;
    max-width: 22rem;
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
  /* Test-result pass only — do not use .pass on passphrase fields (green collision). */
  .tests li.pass {
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
  .status {
    margin: 0;
  }
  .import-box,
  .env-card {
    display: grid;
    gap: var(--space-2);
    padding-top: var(--space-1);
  }
  .tools-body {
    display: grid;
    gap: var(--space-3);
  }
  .tools-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .modal {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-4);
    background: color-mix(in srgb, var(--text) 28%, transparent);
  }
  .modal-card {
    width: min(22rem, 100%);
    display: grid;
    gap: var(--space-3);
    padding: var(--space-4);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: var(--shadow-2, 0 8px 24px color-mix(in srgb, var(--text) 18%, transparent));
  }
  .modal-card h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 650;
    text-transform: none;
    letter-spacing: normal;
    color: var(--text);
  }
  .modal-card p {
    margin: 0;
  }
  .modal-card label {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    font-size: 0.85rem;
  }
  .modal-actions {
    display: flex;
    gap: var(--space-2);
    justify-content: flex-end;
  }
</style>
