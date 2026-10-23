<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import CodeEditor from '../../ui/CodeEditor.svelte';
  import Drawer from '../../ui/Drawer.svelte';
  import Icon from '../../ui/icons/Icon.svelte';
  import DbSidebar from './db/DbSidebar.svelte';
  import DbExplorer from './db/DbExplorer.svelte';
  import DbQueryWorkbench from './db/DbQueryWorkbench.svelte';
  import DbResultsPane from './db/DbResultsPane.svelte';
  import DbCollectionsTree from './db/DbCollectionsTree.svelte';
  import {
    clearCollectionQueryIds,
    collectQueryIdsInCollection,
    collectQueryIdsInFolder,
    collectionIsNonEmpty,
    createQueryTab,
    defaultAdvanced,
    defaultDbUiPrefs,
    defaultPort,
    defaultProxy,
    defaultReadOnly,
    defaultSaveLocation,
    defaultSsh,
    defaultStatement,
    defaultTls,
    emptyDbClientState,
    emptyTabResult,
    ENGINE_LABELS,
    ENV_LABELS,
    ENV_OPTIONS,
    findQueryInCollections,
    folderIsNonEmpty,
    migrateConnection,
    moveQuery,
    newId,
    renameQueryInCollections,
    upsertQueryAt,
    type DbClientState,
    type DbConnection,
    type DbEngine,
    type DbEnvironment,
    type DbQueryTab,
    type DbQueryTabResult,
  } from '../../db-client/model';
  import {
    ADVANCED_GROUPS,
    fieldVisible,
    fieldsFor,
    getByPath,
    groupSummary,
    secretAccountKind,
    setByPath,
    variantsFor,
    type FieldDescriptor,
    type SecretKind,
  } from '../../db-client/fields';
  import { loadDbClientState, saveDbClientState } from '../../db-client/storage';
  import { classifyCql, isReadOnlyBlocked } from '../../db-client/safety';
  import { exportDbBundle } from '../../db-client/export';
  import { appendSelectIfNeeded, newTabWithSelect } from '../../db-client/query-tabs';
  import { resolveRunPlan, statementAtOffset } from '../../db-client/statement';
  import { formatDbCell } from '../../db-client/cell-format';
  import {
    connectNativePort,
    createNativeRpcClient,
    enginesFromCapabilities,
    hasCapability,
    isConnectNativeAvailable,
    protocolMismatchMessage,
    type HelloResult,
    type NativeRpcClient,
  } from '../../db-client/protocol';
  import { buildHostConfig, connectionFromUrl } from '../../db-client/url';
  import { nativeHostName } from '../../ui/brand';

  const area = browser.storage.local;
  const IDLE_DEFAULT_MS = 15 * 60 * 1000;
  const RELEASES_URL = 'https://github.com/proto-void/detour/releases';
  const HOST_NAME = nativeHostName;

  type HelperStatus =
    | 'stopped'
    | 'ready'
    | 'missing'
    | 'connecting'
    | 'error'
    | 'mismatch'
    | 'needs_reload';

  type ExplorerNode = { id: string; label: string; kind: string; meta?: Record<string, unknown> };
  type ColumnInfo = { name: string; type: string; kind?: string };
  type DrawerMode = null | { kind: 'row' | 'cell' | 'result' | 'pro'; title: string; payload: unknown };

  let dbState: DbClientState = $state.raw(emptyDbClientState());
  let loadError = $state('');
  let helperStatus = $state<HelperStatus>('stopped');
  let helperVersion = $state('');
  let helperCapabilities: string[] = $state.raw([]);
  let packSlug = $state('macos-arm64');
  let packOsLabel = $state('macOS');
  let helperOpen = $state(0);
  let helperError = $state('');
  let helperMenuOpen = $state(false);
  let selectedId = $state<string | null>(null);
  let search = $state('');
  let explorerSearch = $state('');
  let consistency = $state('LOCAL_ONE');
  let pageSize = $state(500);
  let tracing = $state(false);
  let txMode = $state(false);
  let pendingEditsJson = $state('[]');
  let explainText = $state('');
  let erText = $state('');
  let designerDdl = $state('');
  let compareText = $state('');
  let running = $state(false);
  let activeRequestId = $state<string | null>(null);
  let resultsPane: 'results' | 'messages' = $state('results');
  let rootKeyspaces: ExplorerNode[] = $state.raw([]);
  let childrenByParentId: Record<string, ExplorerNode[]> = $state.raw({});
  let columnsByTableId: Record<string, ColumnInfo[]> = $state.raw({});
  let selectedTableId = $state<string | null>(null);
  let ddlPreview = $state('');
  let showDdl = $state(false);
  let formOpen = $state(false);
  let dialogTab = $state<'main' | 'ssl' | 'ssh' | 'advanced'>('main');
  let draft: DbConnection = $state.raw(blankConnection());
  let pasteUrl = $state('');
  let passwordDraft = $state('');
  let sslKeyPassDraft = $state('');
  let sslKeyPassMaybeStored = $state(false);
  let sslKeyEncrypted: boolean | null = $state(null);
  let trustStorePassDraft = $state('');
  let keyStorePassDraft = $state('');
  let trustStorePassMaybeStored = $state(false);
  let keyStorePassMaybeStored = $state(false);
  let sslKeyPassModalOpen = $state(false);
  let sslKeyPassModalInput = $state('');
  let pendingAfterKeyPass: (() => Promise<void>) | null = null;
  let testMsg = $state('');
  let testMsgKind: 'idle' | 'progress' | 'ok' | 'error' = $state('idle');
  let browseMsg = $state('');
  let browseMsgIsError = $state(false);
  /** Path currently in pickFile, or null when idle. */
  let activeBrowsingPath = $state<string | null>(null);
  /** True from lock until pickFile RPC starts (button shows Opening…). */
  let browseOpening = $state(false);
  let browseGeneration = 0;
  const BROWSE_TIMEOUT_MS = 90_000;
  const CERT_PICK_FILTERS = [
    { name: 'Certificates', extensions: ['pem', 'crt', 'cer', 'key', 'jks', 'p12', 'pfx'] },
  ];
  const BUNDLE_PICK_FILTERS = [{ name: 'Secure connect bundle', extensions: ['zip'] }];
  let showImportUrl = $state(false);
  let portTouched = $state(false);
  let advancedOpen: Record<string, boolean> = $state({
    auth: false,
    tls: true,
    ssh: true,
    proxy: false,
    driver: false,
    advanced: false,
  });
  let unlockUntil = $state(0);
  let confirmOpen = $state(false);
  let confirmTyped = $state('');
  let confirmExpected = $state('');
  let pendingRun: (() => Promise<void>) | null = null;
  let deleteConfirm: null | { title: string; message: string; run: () => void } = $state(null);
  let rpc: NativeRpcClient | null = null;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let codeEditor: { getValue(): string; getSelection(): string; getCursor(): number; insertAtCursor(t: string): void } | undefined =
    $state.raw(undefined);
  let drawer: DrawerMode = $state.raw(null);

  const ui = $derived(dbState.ui ?? defaultDbUiPrefs());
  const side = $derived(ui.side);
  const sidebarCollapsed = $derived(ui.sidebarCollapsed);
  const explorerCollapsed = $derived(ui.explorerCollapsed);
  const queryTabs = $derived(dbState.queryTabs ?? []);
  const activeQueryTabId = $derived(dbState.activeQueryTabId);
  const activeTab = $derived(queryTabs.find((t) => t.id === activeQueryTabId) ?? null);
  const canCancel = $derived(helperCapabilities.length === 0 || hasCapability(helperCapabilities, 'cancel'));

  const resultSets = $derived(activeTab?.resultSets ?? []);
  const activeResultIndex = $derived(activeTab?.activeResultIndex ?? 0);
  const activeResult = $derived(resultSets[activeResultIndex] ?? null);
  const batchMessages = $derived(activeTab?.batchMessages ?? []);
  const pageToken = $derived(activeResult?.pageToken ?? null);
  const lastStatement = $derived(activeResult?.lastStatement ?? '');
  const collectionsExpandedIds = $derived(ui.collectionsExpandedIds ?? []);

  function blankConnection(engine: DbEngine = 'cassandra'): DbConnection {
    return migrateConnection({
      id: newId('conn'),
      name: 'New Connection',
      group: '',
      color: '#5b8def',
      environment: 'local',
      engine,
      target: 'apache',
      host: '127.0.0.1',
      contactPoints: ['127.0.0.1'],
      port: defaultPort(engine),
      localDataCenter: '',
      username: '',
      database: '',
      keyspace: '',
      filename: '',
      region: '',
      endpoint: '',
      uri: '',
      service: '',
      keyspacesAuth: 'password',
      secureConnectBundlePath: '',
      tls: defaultTls(),
      ssh: defaultSsh(),
      proxy: defaultProxy(),
      advanced: defaultAdvanced(),
      engineOptions: {},
      passwordStorage: 'keychain',
      driverProperties: [],
      secretAccount: '',
    });
  }

  function patchUi(partial: Partial<typeof ui>) {
    dbState = { ...dbState, ui: { ...defaultDbUiPrefs(), ...ui, ...partial } };
    void persist();
  }

  function setSide(s: typeof side) {
    patchUi({ side: s });
  }

  function activeKeyspaceFor(connId: string | null): string | null {
    if (!connId) return null;
    const map = ui.activeKeyspaceByConnectionId ?? {};
    if (Object.prototype.hasOwnProperty.call(map, connId)) {
      return map[connId] ?? null;
    }
    // Migrate legacy explorerScope drill-down once
    const legacy = ui.explorerScopeByConnectionId?.[connId];
    if (legacy?.kind === 'keyspace' && legacy.keyspace) return legacy.keyspace;
    return null;
  }

  function expandedIdsFor(connId: string | null): string[] {
    if (!connId) return [];
    return ui.expandedIdsByConnectionId?.[connId] ?? [];
  }

  function setActiveKeyspace(connId: string, keyspace: string | null) {
    patchUi({
      activeKeyspaceByConnectionId: {
        ...(ui.activeKeyspaceByConnectionId ?? {}),
        [connId]: keyspace,
      },
    });
  }

  function setExpandedIds(connId: string, ids: string[]) {
    patchUi({
      expandedIdsByConnectionId: {
        ...(ui.expandedIdsByConnectionId ?? {}),
        [connId]: ids,
      },
    });
  }

  const activeKeyspace = $derived(activeKeyspaceFor(selectedId));
  const expandedIds = $derived(expandedIdsFor(selectedId));

  function draftGet(path: string): unknown {
    return getByPath(draft as unknown as Record<string, unknown>, path);
  }

  function draftSet(path: string, value: unknown) {
    draft = setByPath(draft as unknown as Record<string, unknown>, path, value) as unknown as DbConnection;
    if (path === 'database') {
      draft = { ...draft, keyspace: String(value ?? '') };
    }
    if (path === 'host') {
      const h = String(value ?? '');
      const points = h
        .split(/[,;\s]+/)
        .map((p) => p.trim())
        .filter(Boolean);
      draft = { ...draft, contactPoints: points };
    }
    if (path === 'port') portTouched = true;
  }

  function ensureQueryTabs(engine: DbEngine = selected?.engine ?? 'cassandra') {
    if ((dbState.queryTabs?.length ?? 0) > 0) return;
    const tab = createQueryTab({
      name: 'Query 1',
      body: defaultStatement(engine),
      connectionId: selectedId,
    });
    dbState = { ...dbState, queryTabs: [tab], activeQueryTabId: tab.id };
  }

  function ensureActiveTabBody(body: string) {
    ensureQueryTabs();
    updateActiveTab({ body });
  }

  function updateActiveTab(partial: Partial<DbQueryTab>) {
    const id = dbState.activeQueryTabId;
    if (!id) return;
    dbState = {
      ...dbState,
      queryTabs: (dbState.queryTabs ?? []).map((t) => (t.id === id ? { ...t, ...partial } : t)),
    };
  }

  function patchTab(tabId: string, partial: Partial<DbQueryTab>) {
    dbState = {
      ...dbState,
      queryTabs: (dbState.queryTabs ?? []).map((t) => (t.id === tabId ? { ...t, ...partial } : t)),
    };
  }

  function setActiveResultIndex(index: number) {
    const id = dbState.activeQueryTabId;
    if (!id) return;
    patchTab(id, { activeResultIndex: index });
    void persist();
  }

  function toggleCollectionExpand(id: string) {
    const cur = new Set(ui.collectionsExpandedIds ?? []);
    if (cur.has(id)) cur.delete(id);
    else cur.add(id);
    patchUi({ collectionsExpandedIds: [...cur] });
  }

  function selectTab(id: string) {
    dbState = { ...dbState, activeQueryTabId: id };
    void persist();
  }

  function closeTab(id: string) {
    const tabs = (dbState.queryTabs ?? []).filter((t) => t.id !== id);
    let active = dbState.activeQueryTabId;
    if (active === id) active = tabs[0]?.id ?? null;
    dbState = { ...dbState, queryTabs: tabs, activeQueryTabId: active };
    if (tabs.length === 0) ensureQueryTabs();
    void persist();
  }

  function newTab(partial?: Partial<DbQueryTab>) {
    const n = (dbState.queryTabs?.length ?? 0) + 1;
    const tab = createQueryTab({
      name: partial?.name ?? `Query ${n}`,
      body: partial?.body ?? defaultStatement(selected?.engine ?? 'cassandra'),
      connectionId: partial?.connectionId ?? selectedId,
      ...partial,
    });
    const tabs = [...(dbState.queryTabs ?? []), tab].slice(0, 20);
    dbState = { ...dbState, queryTabs: tabs, activeQueryTabId: tab.id };
    void persist();
  }

  function resetBrowsingLock(message?: string) {
    browseGeneration += 1;
    activeBrowsingPath = null;
    browseOpening = false;
    if (message) {
      browseMsgIsError = true;
      browseMsg = message;
    }
  }

  function pickFileFiltersFor(path: string): Array<{ name: string; extensions: string[] }> | undefined {
    if (path === 'secureConnectBundlePath') return BUNDLE_PICK_FILTERS;
    if (
      path === 'tls.caPath' ||
      path === 'tls.certPath' ||
      path === 'tls.keyPath' ||
      path === 'tls.trustStorePath' ||
      path === 'tls.keyStorePath'
    ) {
      return CERT_PICK_FILTERS;
    }
    return undefined;
  }

  function browseButtonLabel(path: string): string {
    if (activeBrowsingPath !== path) return 'Browse';
    return browseOpening ? 'Opening…' : 'Cancel…';
  }

  function browseLockedOther(path: string): boolean {
    return activeBrowsingPath !== null && activeBrowsingPath !== path;
  }

  function isEmptyRequiredValue(value: unknown): boolean {
    if (value === undefined || value === null) return true;
    if (typeof value === 'number') return Number.isNaN(value);
    return String(value).trim() === '';
  }

  /** Soft-required Name + visible FieldDescriptor.required (+ Astra bundle). */
  function missingRequiredMessage(): string | null {
    if (isEmptyRequiredValue(draft.name)) return 'Name is required.';
    for (const field of draftFields) {
      if (!field.required || !renderField(field)) continue;
      if (isEmptyRequiredValue(draftGet(field.path))) {
        return `${field.label} is required.`;
      }
    }
    if (draft.engine === 'cassandra' && draft.target === 'astra') {
      if (isEmptyRequiredValue(draft.secureConnectBundlePath)) {
        return 'Secure connect bundle is required.';
      }
    }
    return null;
  }

  async function browsePath(path: string) {
    if (activeBrowsingPath !== null) {
      // Same-field second click cancels the lock (hung dialog behind Chrome).
      if (activeBrowsingPath === path) {
        resetBrowsingLock(
          'Browse cancelled. If a file dialog is still open, close it or Alt+Tab to it. Or paste an absolute path.',
        );
      }
      return;
    }
    const gen = ++browseGeneration;
    activeBrowsingPath = path;
    browseOpening = true;
    browseMsg = '';
    browseMsgIsError = false;
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      if (gen !== browseGeneration) return;
      timedOut = true;
      resetBrowsingLock(
        'File picker timed out (90s). Check for a dialog behind Chrome (Alt+Tab), Stop helper then Start, or paste an absolute path.',
      );
    }, BROWSE_TIMEOUT_MS);
    try {
      if (helperStatus !== 'ready' && !(await startHelper())) {
        if (gen !== browseGeneration) return;
        browseMsgIsError = true;
        browseMsg =
          friendlyHelperError(helperError) ||
          'Helper not ready for file picker. Start the helper, then try Browse again.';
        return;
      }
      if (helperCapabilities.length > 0 && !hasCapability(helperCapabilities, 'pickFile')) {
        if (gen !== browseGeneration) return;
        browseMsgIsError = true;
        browseMsg =
          'This helper build is missing Browse (no pickFile). Re-run Install Detour Helper from the OS pack root (Reload alone is not enough), then Start again. Or paste an absolute path.';
        return;
      }
      if (gen !== browseGeneration) return;
      browseOpening = false;
      try {
        const filters = pickFileFiltersFor(path);
        const result = (await rpc!.request('pickFile', {
          title: 'Select file',
          ...(filters ? { filters } : {}),
        })) as {
          path?: string | null;
        };
        if (gen !== browseGeneration || timedOut) return;
        if (result.path) {
          // Keep host path as returned (no slash normalization).
          draftSet(path, result.path);
          browseMsg = '';
          if (path === 'tls.keyPath') {
            sslKeyPassDraft = '';
            sslKeyPassMaybeStored = false;
            await maybePromptEncryptedKeyPass(false);
          }
          return;
        }
        browseMsg = 'No file selected.';
        browseMsgIsError = false;
      } catch (e) {
        if (gen !== browseGeneration || timedOut) return;
        const msg = e instanceof Error ? e.message : String(e);
        browseMsgIsError = true;
        if (/unknown method.*pickFile/i.test(msg)) {
          browseMsg =
            'Helper is outdated (no pickFile). Re-run Install Detour Helper from the pack root, Reload the extension, Start, then try Browse again. Or paste an absolute path.';
          return;
        }
        browseMsg = `${msg} You can also paste the absolute path into the text field.`;
      }
    } finally {
      clearTimeout(timeoutId);
      if (gen === browseGeneration) {
        activeBrowsingPath = null;
        browseOpening = false;
      }
    }
  }

  /**
   * Inspect client key PEM; open passphrase modal when encrypted (never for CA/cert).
   * With force=true (Update key passphrase…), always open the modal after best-effort inspect.
   */
  async function maybePromptEncryptedKeyPass(force: boolean): Promise<boolean> {
    const keyPath = String(draftGet('tls.keyPath') ?? '').trim();
    if (!keyPath) {
      sslKeyEncrypted = null;
      return true;
    }
    if (helperStatus !== 'ready' && !(await startHelper())) {
      browseMsgIsError = true;
      browseMsg = friendlyHelperError(helperError) || 'Helper not ready to inspect the client key.';
      if (force) {
        openSslKeyPassModal();
        return false;
      }
      return false;
    }
    if (helperCapabilities.length > 0 && !hasCapability(helperCapabilities, 'inspectPemKey')) {
      // Older helper: skip detection; host will error clearly if passphrase is needed.
      sslKeyEncrypted = null;
      if (force) {
        openSslKeyPassModal();
        return false;
      }
      return true;
    }
    try {
      const result = (await rpc!.request('inspectPemKey', { path: keyPath })) as {
        encrypted?: boolean;
      };
      const encrypted = Boolean(result.encrypted);
      sslKeyEncrypted = encrypted;
      if (!encrypted) {
        // Clear draft only when inspect proves plaintext and caller is not forcing Update.
        if (!force) {
          sslKeyPassDraft = '';
          sslKeyPassMaybeStored = false;
          return true;
        }
        openSslKeyPassModal();
        return false;
      }
      if (!force && (sslKeyPassDraft || sslKeyPassMaybeStored)) return true;
      openSslKeyPassModal();
      return false;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      browseMsgIsError = true;
      browseMsg = msg;
      sslKeyEncrypted = null;
      // Inspect failed (bad path, missing file, etc.): still open modal when forcing Update.
      if (force) {
        openSslKeyPassModal();
      }
      return false;
    }
  }

  function openSslKeyPassModal() {
    sslKeyPassModalInput = sslKeyPassDraft;
    sslKeyPassModalOpen = true;
  }

  function confirmSslKeyPassModal() {
    sslKeyPassDraft = sslKeyPassModalInput;
    sslKeyPassMaybeStored = Boolean(sslKeyPassDraft);
    sslKeyPassModalOpen = false;
    sslKeyPassModalInput = '';
    const next = pendingAfterKeyPass;
    pendingAfterKeyPass = null;
    if (next) void next();
  }

  function cancelSslKeyPassModal() {
    sslKeyPassModalOpen = false;
    sslKeyPassModalInput = '';
    pendingAfterKeyPass = null;
  }

  /** Ensure encrypted key has a passphrase before Test/Connect when TLS is applied. */
  async function ensureKeyPassBeforeConnect(then: () => Promise<void>): Promise<void> {
    const mode = String(draftGet('tls.mode') ?? 'disable');
    const keyPath = String(draftGet('tls.keyPath') ?? '').trim();
    if (!keyPath || mode === 'disable') {
      await then();
      return;
    }
    const ok = await maybePromptEncryptedKeyPass(false);
    if (!ok && sslKeyPassModalOpen) {
      pendingAfterKeyPass = then;
      return;
    }
    if (sslKeyEncrypted && !sslKeyPassDraft && !sslKeyPassMaybeStored) {
      pendingAfterKeyPass = then;
      openSslKeyPassModal();
      return;
    }
    await then();
  }


  const draftFields = $derived(fieldsFor(draft.engine));
  const draftVariants = $derived(variantsFor(draft.engine === 'mysql' || draft.engine === 'mariadb' ? 'mysql' : draft.engine === 'elasticsearch' || draft.engine === 'opensearch' ? 'elasticsearch' : draft.engine));

  const selected = $derived(dbState.connections.find((c) => c.id === selectedId) ?? null);
  const filtered = $derived(
    dbState.connections.filter((c) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.group.toLowerCase().includes(q) ||
        c.contactPoints.join(',').toLowerCase().includes(q)
      );
    }),
  );
  const availableEngines = $derived.by(() => {
    const fromCap = enginesFromCapabilities(helperCapabilities);
    const entries =
      fromCap.length === 0
        ? Object.entries(ENGINE_LABELS)
        : Object.entries(ENGINE_LABELS).filter(([id]) => fromCap.includes(id));
    return entries.sort((a, b) => a[1].localeCompare(b[1], undefined, { sensitivity: 'base' }));
  });
  const environmentOptions = ENV_OPTIONS;
  const hasSshCap = $derived(
    helperCapabilities.length === 0 || helperCapabilities.includes('ssh'),
  );
  const hasProxyCap = $derived(
    helperCapabilities.length === 0 || helperCapabilities.includes('proxy'),
  );

  function bumpIdle() {
    if (idleTimer) clearTimeout(idleTimer);
    const mins = dbState.idleTimeoutMinutes ?? 15;
    idleTimer = setTimeout(() => stopHelper(), mins * 60 * 1000 || IDLE_DEFAULT_MS);
  }

  async function ensurePermission(): Promise<boolean> {
    const query = { permissions: ['nativeMessaging' as never] };
    const has = await browser.permissions.contains(query).catch(() => false);
    if (has) return true;
    return browser.permissions.request(query).catch(() => false);
  }

  async function startHelper(): Promise<boolean> {
    helperStatus = 'connecting';
    helperError = '';
    helperMenuOpen = false;
    const ok = await ensurePermission();
    if (!ok) {
      helperStatus = 'error';
      helperError = 'nativeMessaging permission was not granted.';
      return false;
    }
    if (!isConnectNativeAvailable()) {
      helperStatus = 'needs_reload';
      helperError =
        'Chrome needs a one-time reload after enabling the database helper. Your helper install is OK.';
      return false;
    }
    try {
      rpc?.disconnect();
      rpc = createNativeRpcClient(connectNativePort, HOST_NAME);
      rpc.setOnDisconnect(() => {
        helperStatus = 'stopped';
        helperVersion = '';
        helperCapabilities = [];
        helperOpen = 0;
        rpc = null;
      });
      const hello = (await rpc.request('hello')) as HelloResult;
      const mismatch = protocolMismatchMessage(hello);
      if (mismatch) {
        helperStatus = 'mismatch';
        helperError = mismatch;
        helperVersion = hello.hostVersion ?? '';
        helperCapabilities = [];
        rpc.disconnect();
        rpc = null;
        return false;
      }
      helperCapabilities = Array.isArray(hello.capabilities) ? hello.capabilities : [];
      helperVersion = hello.hostVersion ?? '';
      const v = (await rpc.request('version')) as { version: string; openConnections?: number };
      if (v?.version) helperVersion = v.version;
      helperOpen = v.openConnections ?? 0;
      helperStatus = 'ready';
      bumpIdle();
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/connectNative missing/i.test(msg)) {
        helperStatus = 'needs_reload';
        helperError =
          'Chrome needs a one-time reload after enabling the database helper. Your helper install is OK.';
        helperCapabilities = [];
        rpc = null;
        return false;
      }
      helperStatus = msg.toLowerCase().includes('not found') || msg.toLowerCase().includes('specified native')
        ? 'missing'
        : 'error';
      helperError = friendlyHelperError(msg);
      helperCapabilities = [];
      rpc = null;
      return false;
    }
  }

  function reloadExtension() {
    browser.runtime.reload();
  }

  function stopHelper() {
    if (idleTimer) clearTimeout(idleTimer);
    rpc?.disconnect();
    rpc = null;
    helperStatus = 'stopped';
    helperVersion = '';
    helperCapabilities = [];
    helperOpen = 0;
    helperMenuOpen = false;
  }

  async function restartHelper() {
    stopHelper();
    await startHelper();
  }

  async function persist() {
    await saveDbClientState(area, dbState);
  }

  async function storeDraftSecrets(secretAccount: string) {
    if (!rpc) return;
    if (passwordDraft) {
      await rpc.request('setSecret', { account: secretAccount, value: passwordDraft });
    }
    if (sslKeyPassDraft) {
      await rpc.request('setSecret', {
        account: secretAccountKind(secretAccount, 'sslKeyPass'),
        value: sslKeyPassDraft,
      });
    }
    if (trustStorePassDraft) {
      await rpc.request('setSecret', {
        account: secretAccountKind(secretAccount, 'trustStorePass'),
        value: trustStorePassDraft,
      });
    }
    if (keyStorePassDraft) {
      await rpc.request('setSecret', {
        account: secretAccountKind(secretAccount, 'keyStorePass'),
        value: keyStorePassDraft,
      });
    }
  }


  function friendlyHelperError(msg: string): string {
    if (/connectNative missing/i.test(msg)) {
      return 'Chrome needs a one-time reload after enabling the database helper.';
    }
    return msg;
  }

  async function connectSelected(): Promise<boolean> {
    if (!selected) return false;
    if (helperStatus !== 'ready') {
      const started = await startHelper();
      if (!started) return false;
    }
    bumpIdle();
    const secretAccount = selected.secretAccount || `db-${selected.id}`;
    await storeDraftSecrets(secretAccount);
    await rpc!.request('connect', {
      connectionId: selected.id,
      engine: selected.engine,
      secretAccount,
      config: buildHostConfig(selected),
    });
    helperOpen = (await rpc!.request('version') as { openConnections?: number }).openConnections ?? helperOpen;
    return true;
  }

  async function applySessionKeyspace(connId: string, keyspace: string | null) {
    if (!rpc) return;
    try {
      await rpc.request('setKeyspace', { connectionId: connId, keyspace });
    } catch {
      /* older helpers without setKeyspace — unqualified SELECTs may fail until reconnect */
    }
  }

  function nodeKeyspace(node: ExplorerNode): string {
    return String(
      node.meta?.keyspace ?? node.meta?.database ?? node.meta?.schema ?? activeKeyspace ?? '',
    );
  }

  function listPathForContainer(node: ExplorerNode): Record<string, unknown> {
    if (node.kind === 'keyspace') return { kind: 'keyspace', keyspace: node.label };
    if (node.kind === 'database') return { kind: 'database', database: node.label };
    if (node.kind === 'schema') return { kind: 'schema', schema: node.label };
    const ks = nodeKeyspace(node);
    return {
      kind: node.kind === 'view' ? 'table' : node.kind,
      keyspace: ks,
      database: ks,
      schema: ks,
      name: node.label,
    };
  }

  async function ensureChildren(parent: ExplorerNode) {
    if (!selected || !rpc) return;
    if (childrenByParentId[parent.id]) return;
    bumpIdle();
    const kids = (await rpc.request('listObjects', {
      connectionId: selected.id,
      path: listPathForContainer(parent),
    })) as ExplorerNode[];
    childrenByParentId = { ...childrenByParentId, [parent.id]: kids };
  }

  async function ensureColumns(node: ExplorerNode) {
    if (!selected || !rpc) return;
    if (columnsByTableId[node.id]) return;
    bumpIdle();
    const ks = nodeKeyspace(node);
    const desc = (await rpc.request('describe', {
      connectionId: selected.id,
      ref: {
        kind: node.kind === 'view' ? 'table' : node.kind === 'materialized_view' ? 'table' : node.kind,
        keyspace: ks,
        database: ks,
        schema: ks,
        name: node.label,
      },
    })) as { ddl?: string; columns?: ColumnInfo[] };
    columnsByTableId = { ...columnsByTableId, [node.id]: desc.columns ?? [] };
    if (selectedTableId === node.id) {
      ddlPreview = desc.ddl ?? '';
    }
  }

  async function refreshExplorer() {
    if (!selected || !(await connectSelected())) return;
    bumpIdle();
    childrenByParentId = {};
    columnsByTableId = {};
    selectedTableId = null;
    ddlPreview = '';
    showDdl = false;

    rootKeyspaces = (await rpc!.request('listObjects', {
      connectionId: selected.id,
      path: { kind: 'root' },
    })) as ExplorerNode[];

    // Seed active keyspace from connection metadata when unset
    const map = ui.activeKeyspaceByConnectionId ?? {};
    const hasExplicit = Object.prototype.hasOwnProperty.call(map, selected.id);
    let ks = activeKeyspaceFor(selected.id);
    if (!hasExplicit) {
      const seed = (selected.keyspace || selected.database || '').trim();
      if (seed) {
        setActiveKeyspace(selected.id, seed);
        ks = seed;
      }
    }

    await applySessionKeyspace(selected.id, ks);

    if (ks) {
      const ksNode =
        rootKeyspaces.find((n) => n.label === ks) ??
        ({
          id: `ks:${ks}`,
          label: ks,
          kind: 'keyspace',
          meta: { keyspace: ks },
        } satisfies ExplorerNode);
      if (!rootKeyspaces.some((n) => n.label === ks)) {
        rootKeyspaces = [...rootKeyspaces, ksNode];
      }
      await ensureChildren(ksNode);
    }
  }

  async function onActiveKeyspaceChange(ks: string | null) {
    if (!selectedId) return;
    setActiveKeyspace(selectedId, ks);
    selectedTableId = null;
    ddlPreview = '';
    showDdl = false;
    if (!(await connectSelected())) return;
    await applySessionKeyspace(selectedId, ks);
    if (ks) {
      const ksNode =
        rootKeyspaces.find((n) => n.label === ks) ??
        ({ id: `ks:${ks}`, label: ks, kind: 'keyspace', meta: { keyspace: ks } } satisfies ExplorerNode);
      await ensureChildren(ksNode);
    }
  }

  async function onUseKeyspace(ks: string) {
    await onActiveKeyspaceChange(ks);
  }

  async function onToggleExpand(nodeId: string) {
    if (!selectedId || !selected || !rpc) return;
    const current = expandedIdsFor(selectedId);
    const open = current.includes(nodeId);
    if (open) {
      setExpandedIds(
        selectedId,
        current.filter((id) => id !== nodeId),
      );
      return;
    }
    setExpandedIds(selectedId, [...current, nodeId]);

    const ksNode = rootKeyspaces.find((n) => n.id === nodeId);
    if (ksNode) {
      await ensureChildren(ksNode);
      return;
    }
    // Table / MV under some parent
    for (const kids of Object.values(childrenByParentId)) {
      const node = kids.find((n) => n.id === nodeId);
      if (node && (node.kind === 'table' || node.kind === 'materialized_view' || node.kind === 'view')) {
        selectedTableId = node.id;
        await ensureColumns(node);
        const desc = columnsByTableId[node.id];
        if (desc) {
          /* columns cached */
        }
        const full = (await rpc.request('describe', {
          connectionId: selected.id,
          ref: {
            kind: node.kind === 'view' || node.kind === 'materialized_view' ? 'table' : node.kind,
            keyspace: nodeKeyspace(node),
            name: node.label,
          },
        })) as { ddl?: string; columns?: ColumnInfo[] };
        columnsByTableId = { ...columnsByTableId, [node.id]: full.columns ?? [] };
        ddlPreview = full.ddl ?? '';
        showDdl = false;
        return;
      }
    }
  }

  async function onExplorerNodeClick(node: ExplorerNode) {
    if (!selected || !rpc) return;
    bumpIdle();
    if (node.kind === 'keyspace' || node.kind === 'database' || node.kind === 'schema') {
      // Primary click on keyspace name activates context (plan); chevron still expands separately.
      await onActiveKeyspaceChange(node.label);
      return;
    }
    if (node.kind === 'table' || node.kind === 'materialized_view' || node.kind === 'view') {
      selectedTableId = node.id;
      await ensureColumns(node);
      const desc = (await rpc.request('describe', {
        connectionId: selected.id,
        ref: {
          kind: node.kind === 'view' || node.kind === 'materialized_view' ? 'table' : node.kind,
          keyspace: nodeKeyspace(node),
          name: node.label,
        },
      })) as { ddl?: string; columns?: ColumnInfo[] };
      columnsByTableId = { ...columnsByTableId, [node.id]: desc.columns ?? [] };
      ddlPreview = desc.ddl ?? '';
      showDdl = false;
      // Expand columns under the table
      const cur = expandedIdsFor(selected.id);
      if (!cur.includes(node.id)) setExpandedIds(selected.id, [...cur, node.id]);
    }
  }

  function onExplorerNodeDblClick(node: ExplorerNode, shiftKey: boolean) {
    if (node.kind !== 'table' && node.kind !== 'materialized_view' && node.kind !== 'view') return;
    const ks = nodeKeyspace(node);
    const activeKs = activeKeyspaceFor(selectedId);
    ensureQueryTabs();
    if (shiftKey) {
      const tab = newTabWithSelect(ks, node.label, selectedId, undefined, activeKs);
      const tabs = [...(dbState.queryTabs ?? []), tab].slice(0, 20);
      dbState = { ...dbState, queryTabs: tabs, activeQueryTabId: tab.id };
      void persist();
      return;
    }
    const active = dbState.queryTabs?.find((t) => t.id === dbState.activeQueryTabId);
    const body = active?.body ?? '';
    const { body: next } = appendSelectIfNeeded(body, ks, node.label, activeKs);
    updateActiveTab({ body: next, connectionId: active?.connectionId ?? selectedId });
    void persist();
  }

  function onColumnClick(name: string) {
    if (codeEditor) {
      codeEditor.insertAtCursor(name);
      return;
    }
    const active = dbState.queryTabs?.find((t) => t.id === dbState.activeQueryTabId);
    if (!active) return;
    updateActiveTab({ body: active.body + name });
  }

  let batchAbort = false;

  async function runQuery(nextPage = false) {
    if (!selected) return;
    ensureQueryTabs();
    const tabId = dbState.activeQueryTabId;
    if (!tabId) return;
    const tab = dbState.queryTabs?.find((t) => t.id === tabId);
    if (!tab) return;

    if (nextPage) {
      const statement = tab.resultSets?.[tab.activeResultIndex ?? 0]?.lastStatement ?? lastStatement;
      if (!statement) return;
      const runConnId = tab.connectionId || selected.id;
      const runConn = dbState.connections.find((c) => c.id === runConnId) ?? selected;
      await executeOne(statement, true, tabId, runConn, tab.activeResultIndex ?? 0);
      return;
    }

    const source = codeEditor?.getValue() ?? tab.body;
    const selection = codeEditor?.getSelection() ?? '';
    const plan = resolveRunPlan(source, selection);
    if (plan.statements.length === 0) return;
    if (!tab.connectionId) updateActiveTab({ connectionId: selectedId });
    await runStatements(plan.statements, tabId);
  }

  /** Gutter Run: one statement at character offset. */
  async function runAtOffset(offset: number) {
    if (!selected) return;
    ensureQueryTabs();
    const tabId = dbState.activeQueryTabId;
    if (!tabId) return;
    const tab = dbState.queryTabs?.find((t) => t.id === tabId);
    if (!tab) return;
    const source = codeEditor?.getValue() ?? tab.body;
    const span = statementAtOffset(source, offset);
    if (!span?.text) return;
    if (!tab.connectionId) updateActiveTab({ connectionId: selectedId });
    await runStatements([span.text], tabId);
  }

  async function runStatements(statements: string[], tabId: string) {
    if (!selected || statements.length === 0) return;
    const tab = dbState.queryTabs?.find((t) => t.id === tabId);
    if (!tab) return;
    const runConnId = tab.connectionId || selected.id;
    const runConn = dbState.connections.find((c) => c.id === runConnId) ?? selected;
    const env = runConn.environment;
    const readOnly = defaultReadOnly(env, runConn.readOnly);
    const unlocked = Date.now() < unlockUntil;

    for (const statement of statements) {
      if (isReadOnlyBlocked(statement, readOnly && !unlocked)) {
        patchTab(tabId, {
          resultSets: [],
          activeResultIndex: 0,
          batchMessages: [
            'Connection is read-only. Unlock writes for production (timed) or change the connection.',
          ],
        });
        resultsPane = 'messages';
        void persist();
        return;
      }
    }

    const needsConfirm = statements.some((statement) => {
      const verdict = classifyCql(statement);
      return verdict.level !== 'safe';
    });
    if (needsConfirm) {
      const firstUnsafe = statements.find((s) => classifyCql(s).level !== 'safe')!;
      const verdict = classifyCql(firstUnsafe);
      confirmExpected = verdict.objectName ?? runConn.name;
      confirmTyped = '';
      confirmOpen = true;
      pendingRun = () => executeBatch(statements, tabId, runConn);
      return;
    }
    await executeBatch(statements, tabId, runConn);
  }

  async function executeBatch(statements: string[], tabId: string, runConn: DbConnection) {
    selectedId = runConn.id;
    if (!(await connectSelected()) || !rpc) return;
    batchAbort = false;
    running = true;
    bumpIdle();
    patchTab(tabId, { resultSets: [], activeResultIndex: 0, batchMessages: [] });
    resultsPane = 'results';

    try {
      for (let i = 0; i < statements.length; i++) {
        if (batchAbort) break;
        const statement = statements[i]!;
        const ok = await executeOne(statement, false, tabId, runConn, -1);
        if (!ok) break;
      }
    } finally {
      running = false;
      activeRequestId = null;
      await persist();
    }
  }

  /** Returns false on error / abort (stops batch). nextPageIndex is resultSets index, or -1 to append. */
  async function executeOne(
    statement: string,
    nextPage: boolean,
    tabId: string,
    runConn: DbConnection,
    resultIndex: number,
  ): Promise<boolean> {
    selectedId = runConn.id;
    if (!(await connectSelected()) || !rpc) return false;
    const requestId = newId('req');
    activeRequestId = requestId;
    running = true;
    bumpIdle();
    const tabBefore = dbState.queryTabs?.find((t) => t.id === tabId);
    const pageTok =
      nextPage && resultIndex >= 0
        ? (tabBefore?.resultSets?.[resultIndex]?.pageToken ?? null)
        : null;
    try {
      const result = (await rpc.request(nextPage ? 'fetchPage' : 'execute', {
        connectionId: runConn.id,
        statement,
        params: [],
        pageToken: pageTok,
        requestId,
        options: { pageSize, consistency, tracing, requestId },
      })) as {
        columns: string[];
        rows: unknown[][];
        pageToken?: string | null;
        timingMs: number;
        messages?: string[];
        warnings?: string[];
      };
      if (batchAbort) return false;

      const tab = dbState.queryTabs?.find((t) => t.id === tabId);
      const sets = [...(tab?.resultSets ?? [])];
      const entry: DbQueryTabResult = emptyTabResult({
        columns: result.columns,
        rows: nextPage && resultIndex >= 0 ? [...(sets[resultIndex]?.rows ?? []), ...result.rows] : result.rows,
        pageToken: result.pageToken ?? null,
        timingMs: result.timingMs,
        messages: result.messages ?? [],
        warnings: result.warnings ?? [],
        lastStatement: statement,
      });
      let activeIdx: number;
      if (nextPage && resultIndex >= 0) {
        sets[resultIndex] = entry;
        activeIdx = resultIndex;
      } else {
        sets.push(entry);
        activeIdx = sets.length - 1;
      }
      patchTab(tabId, { resultSets: sets, activeResultIndex: activeIdx });
      if ((result.warnings?.length ?? 0) > 0) resultsPane = 'messages';
      else resultsPane = 'results';
      dbState = {
        ...dbState,
        history: [
          {
            id: newId('hist'),
            connectionId: runConn.id,
            statement,
            at: Date.now(),
            ok: true,
            timingMs: result.timingMs,
          },
          ...dbState.history,
        ].slice(0, 200),
      };
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const tab = dbState.queryTabs?.find((t) => t.id === tabId);
      const prior = tab?.batchMessages ?? [];
      patchTab(tabId, {
        batchMessages: [...prior, msg],
        resultSets: tab?.resultSets ?? [],
        activeResultIndex: tab?.activeResultIndex ?? 0,
      });
      resultsPane = 'messages';
      dbState = {
        ...dbState,
        history: [
          {
            id: newId('hist'),
            connectionId: runConn.id,
            statement,
            at: Date.now(),
            ok: false,
            error: msg,
          },
          ...dbState.history,
        ].slice(0, 200),
      };
      return false;
    } finally {
      if (!nextPage) {
        /* batch loop owns running flag */
      } else {
        running = false;
        activeRequestId = null;
        await persist();
      }
      activeRequestId = null;
    }
  }

  async function stopQuery() {
    batchAbort = true;
    const req = activeRequestId;
    running = false;
    if (!req || !rpc || !selected) {
      activeRequestId = null;
      return;
    }
    try {
      if (canCancel) {
        await rpc.request('cancel', { connectionId: selected.id, requestId: req });
      }
    } catch {
      /* local abort still clears running */
    }
    activeRequestId = null;
  }

  function saveActiveToCollection(collectionId?: string, folderId?: string | null) {
    ensureQueryTabs();
    const tab = activeTab;
    if (!tab) return;
    let collections = dbState.collections;
    if (collections.length === 0) {
      const colId = newId('col');
      collections = [
        {
          id: colId,
          name: 'My queries',
          queries: [],
          folders: [],
        },
      ];
      patchUi({ collectionsExpandedIds: [colId] });
    }
    const col = collections.find((c) => c.id === collectionId) ?? collections[0]!;
    const loc =
      collectionId !== undefined && folderId !== undefined
        ? { collectionId: col.id, folderId }
        : defaultSaveLocation(col);
    // If an existing saved query lives elsewhere, upsert there instead of duplicating.
    const existing = tab.collectionQueryId
      ? findQueryInCollections(collections, tab.collectionQueryId)
      : null;
    const target = existing
      ? { collectionId: existing.collection.id, folderId: existing.folderId }
      : loc;
    const q = {
      id: tab.collectionQueryId || newId('q'),
      name: tab.name,
      body: codeEditor?.getValue() ?? tab.body,
      description: '',
      tags: [] as string[],
      defaultConnectionId: tab.connectionId ?? selectedId,
    };
    collections = upsertQueryAt(collections, target, q);
    updateActiveTab({ collectionQueryId: q.id, name: q.name });
    dbState = { ...dbState, collections };
    void persist();
  }

  function openCollectionQuery(
    _collectionId: string,
    _folderId: string | null,
    queryId: string,
  ) {
    const found = findQueryInCollections(dbState.collections, queryId);
    if (!found) return;
    newTab({
      name: found.query.name,
      body: found.query.body,
      connectionId: found.query.defaultConnectionId ?? selectedId,
      collectionQueryId: found.query.id,
    });
  }

  function renameCollection(collectionId: string, name: string) {
    dbState = {
      ...dbState,
      collections: dbState.collections.map((c) => (c.id === collectionId ? { ...c, name } : c)),
    };
    void persist();
  }

  function renameFolder(collectionId: string, folderId: string, name: string) {
    dbState = {
      ...dbState,
      collections: dbState.collections.map((c) =>
        c.id === collectionId
          ? {
              ...c,
              folders: (c.folders ?? []).map((f) => (f.id === folderId ? { ...f, name } : f)),
            }
          : c,
      ),
    };
    void persist();
  }

  function renameQuery(
    _collectionId: string,
    _folderId: string | null,
    queryId: string,
    name: string,
  ) {
    dbState = {
      ...dbState,
      collections: renameQueryInCollections(dbState.collections, queryId, name),
      queryTabs: (dbState.queryTabs ?? []).map((t) =>
        t.collectionQueryId === queryId ? { ...t, name } : t,
      ),
    };
    void persist();
  }

  function applyDeleteCollection(collectionId: string) {
    const col = dbState.collections.find((c) => c.id === collectionId);
    if (!col) return;
    const deleted = new Set(collectQueryIdsInCollection(col));
    dbState = {
      ...dbState,
      collections: dbState.collections.filter((c) => c.id !== collectionId),
      queryTabs: clearCollectionQueryIds(dbState.queryTabs ?? [], deleted),
    };
    void persist();
  }

  function deleteCollection(collectionId: string) {
    const col = dbState.collections.find((c) => c.id === collectionId);
    if (!col) return;
    if (collectionIsNonEmpty(col)) {
      deleteConfirm = {
        title: 'Delete collection',
        message: `Delete collection “${col.name}” and all folders/queries inside?`,
        run: () => applyDeleteCollection(collectionId),
      };
      return;
    }
    applyDeleteCollection(collectionId);
  }

  function applyDeleteFolder(collectionId: string, folderId: string) {
    const col = dbState.collections.find((c) => c.id === collectionId);
    const folder = col?.folders?.find((f) => f.id === folderId);
    if (!col || !folder) return;
    const deleted = new Set(collectQueryIdsInFolder(folder));
    dbState = {
      ...dbState,
      collections: dbState.collections.map((c) =>
        c.id === collectionId
          ? { ...c, folders: (c.folders ?? []).filter((f) => f.id !== folderId) }
          : c,
      ),
      queryTabs: clearCollectionQueryIds(dbState.queryTabs ?? [], deleted),
    };
    void persist();
  }

  function deleteFolder(collectionId: string, folderId: string) {
    const col = dbState.collections.find((c) => c.id === collectionId);
    const folder = col?.folders?.find((f) => f.id === folderId);
    if (!col || !folder) return;
    if (folderIsNonEmpty(folder)) {
      deleteConfirm = {
        title: 'Delete folder',
        message: `Delete folder “${folder.name}” and its queries?`,
        run: () => applyDeleteFolder(collectionId, folderId),
      };
      return;
    }
    applyDeleteFolder(collectionId, folderId);
  }

  function applyDeleteQuery(queryId: string) {
    const deleted = new Set([queryId]);
    dbState = {
      ...dbState,
      collections: dbState.collections.map((c) => ({
        ...c,
        queries: (c.queries ?? []).filter((q) => q.id !== queryId),
        folders: (c.folders ?? []).map((f) => ({
          ...f,
          queries: (f.queries ?? []).filter((q) => q.id !== queryId),
        })),
      })),
      queryTabs: clearCollectionQueryIds(dbState.queryTabs ?? [], deleted),
    };
    void persist();
  }

  function deleteQuery(
    _collectionId: string,
    _folderId: string | null,
    queryId: string,
  ) {
    const found = findQueryInCollections(dbState.collections, queryId);
    if (!found) return;
    deleteConfirm = {
      title: 'Delete query',
      message: `Delete query “${found.query.name}”?`,
      run: () => applyDeleteQuery(queryId),
    };
  }

  function newFolderInCollection(collectionId: string) {
    const foldId = newId('fold');
    dbState = {
      ...dbState,
      collections: dbState.collections.map((c) =>
        c.id === collectionId
          ? {
              ...c,
              folders: [...(c.folders ?? []), { id: foldId, name: 'New folder', queries: [] }],
            }
          : c,
      ),
    };
    const expanded = new Set(collectionsExpandedIds);
    expanded.add(collectionId);
    expanded.add(foldId);
    patchUi({ collectionsExpandedIds: [...expanded] });
    void persist();
  }

  function newQueryInLocation(collectionId: string, folderId: string | null) {
    ensureQueryTabs();
    const tab = activeTab;
    const q = {
      id: newId('q'),
      name: tab?.name?.trim() || 'New query',
      body: codeEditor?.getValue() ?? tab?.body ?? '',
      description: '',
      tags: [] as string[],
      defaultConnectionId: tab?.connectionId ?? selectedId,
    };
    dbState = {
      ...dbState,
      collections: upsertQueryAt(
        dbState.collections,
        { collectionId, folderId },
        q,
      ),
    };
    const expanded = new Set(collectionsExpandedIds);
    expanded.add(collectionId);
    if (folderId) expanded.add(folderId);
    patchUi({ collectionsExpandedIds: [...expanded] });
    void persist();
  }

  function moveCollectionQuery(
    queryId: string,
    toCollectionId: string,
    toFolderId: string | null,
  ) {
    dbState = {
      ...dbState,
      collections: moveQuery(dbState.collections, queryId, {
        collectionId: toCollectionId,
        folderId: toFolderId,
      }),
    };
    void persist();
  }
  function openNew() {
    draft = blankConnection();
    passwordDraft = '';
    sslKeyPassDraft = '';
    sslKeyPassMaybeStored = false;
    sslKeyEncrypted = null;
    trustStorePassDraft = '';
    keyStorePassDraft = '';
    trustStorePassMaybeStored = false;
    keyStorePassMaybeStored = false;
    pasteUrl = '';
    testMsg = '';
    testMsgKind = 'idle';
    browseMsg = '';
    browseMsgIsError = false;
    showImportUrl = false;
    portTouched = false;
    dialogTab = 'main';
    formOpen = true;
  }

  function openEdit(conn: DbConnection) {
    draft = migrateConnection({ ...conn, contactPoints: [...(conn.contactPoints ?? [])] });
    passwordDraft = '';
    sslKeyPassDraft = '';
    // Editing: keychain may already hold :sslKeyPass for this connection.
    sslKeyPassMaybeStored = Boolean(conn.tls?.keyPath?.trim());
    sslKeyEncrypted = null;
    trustStorePassDraft = '';
    keyStorePassDraft = '';
    trustStorePassMaybeStored = Boolean(conn.tls?.trustStorePath?.trim());
    keyStorePassMaybeStored = Boolean(conn.tls?.keyStorePath?.trim());
    pasteUrl = '';
    testMsg = '';
    testMsgKind = 'idle';
    browseMsg = '';
    browseMsgIsError = false;
    showImportUrl = false;
    portTouched = true;
    dialogTab = 'main';
    formOpen = true;
  }

  function storeSecretDraftValue(kind: SecretKind): string {
    if (kind === 'trustStorePass') return trustStorePassDraft;
    if (kind === 'keyStorePass') return keyStorePassDraft;
    return '';
  }

  function setSecretDraftValue(kind: SecretKind, value: string) {
    if (kind === 'trustStorePass') trustStorePassDraft = value;
    else if (kind === 'keyStorePass') keyStorePassDraft = value;
  }

  function renderField(field: FieldDescriptor) {
    return fieldVisible(field, draftGet);
  }

  function applyPasteUrl() {
    try {
      draft = connectionFromUrl(pasteUrl, draft);
      testMsgKind = 'ok';
      testMsg = 'Filled from URL (password kept only in the Password field until Save).';
    } catch (e) {
      testMsgKind = 'error';
      testMsg = e instanceof Error ? e.message : String(e);
    }
  }

  async function testDraft() {
    const missing = missingRequiredMessage();
    if (missing) {
      testMsgKind = 'error';
      testMsg = missing;
      return;
    }
    await ensureKeyPassBeforeConnect(async () => {
      testMsgKind = 'progress';
      testMsg = 'Testing…';
      try {
        if (helperStatus !== 'ready' && !(await startHelper())) {
          testMsgKind = 'error';
          testMsg = helperError || 'Helper not ready';
          return;
        }
        const secretAccount = draft.secretAccount || `db-${draft.id}`;
        await storeDraftSecrets(secretAccount);
        const result = (await rpc!.request('testConnection', {
          connectionId: `test-${draft.id}`,
          engine: draft.engine,
          secretAccount,
          config: buildHostConfig(draft),
        })) as { ok: boolean; latencyMs?: number; error?: string };
        if (result.ok) {
          testMsgKind = 'ok';
          testMsg = `Connected in ${result.latencyMs} ms`;
        } else {
          testMsgKind = 'error';
          testMsg = result.error ?? 'Failed';
        }
      } catch (e) {
        testMsgKind = 'error';
        testMsg = e instanceof Error ? e.message : String(e);
      }
    });
  }

  /** Save draft then connect; keep the modal open and surface errors in the footer on failure. */
  async function connectDraft() {
    const missing = missingRequiredMessage();
    if (missing) {
      testMsgKind = 'error';
      testMsg = missing;
      return;
    }
    await ensureKeyPassBeforeConnect(async () => {
      testMsgKind = 'progress';
      testMsg = 'Connecting…';
      try {
        if (helperStatus !== 'ready' && !(await startHelper())) {
          testMsgKind = 'error';
          testMsg = helperError || 'Helper not ready';
          return;
        }
        const env = draft.environment as DbEnvironment;
        const saved: DbConnection = {
          ...draft,
          contactPoints: draft.contactPoints.map((p) => p.trim()).filter(Boolean),
          secretAccount: draft.secretAccount || `db-${draft.id}`,
          readOnly: defaultReadOnly(env, draft.readOnly),
        };
        await storeDraftSecrets(saved.secretAccount);
        const idx = dbState.connections.findIndex((c) => c.id === saved.id);
        const connections =
          idx >= 0
            ? dbState.connections.map((c, i) => (i === idx ? saved : c))
            : [...dbState.connections, saved];
        dbState = { ...dbState, connections };
        selectedId = saved.id;
        await persist();
        draft = saved;
        bumpIdle();
        await rpc!.request('connect', {
          connectionId: saved.id,
          engine: saved.engine,
          secretAccount: saved.secretAccount,
          config: buildHostConfig(saved),
        });
        helperOpen =
          ((await rpc!.request('version')) as { openConnections?: number }).openConnections ?? helperOpen;
        testMsg = '';
        testMsgKind = 'idle';
        formOpen = false;
      } catch (e) {
        testMsgKind = 'error';
        testMsg = e instanceof Error ? e.message : String(e);
      }
    });
  }

  async function saveDraft() {
    const missing = missingRequiredMessage();
    if (missing) {
      testMsgKind = 'error';
      testMsg = missing;
      return;
    }
    const env = draft.environment as DbEnvironment;
    const saved: DbConnection = {
      ...draft,
      contactPoints: draft.contactPoints.map((p) => p.trim()).filter(Boolean),
      secretAccount: draft.secretAccount || `db-${draft.id}`,
      readOnly: defaultReadOnly(env, draft.readOnly),
    };
    if ((passwordDraft || sslKeyPassDraft) && !(rpc && helperStatus === 'ready')) {
      await startHelper();
    }
    await storeDraftSecrets(saved.secretAccount);
    const idx = dbState.connections.findIndex((c) => c.id === saved.id);
    const connections =
      idx >= 0
        ? dbState.connections.map((c, i) => (i === idx ? saved : c))
        : [...dbState.connections, saved];
    dbState = { ...dbState, connections };
    selectedId = saved.id;
    formOpen = false;
    await persist();
  }

  function duplicateConn(conn: DbConnection) {
    const copy = { ...conn, id: newId('conn'), name: `${conn.name} copy`, secretAccount: '' };
    dbState = { ...dbState, connections: [...dbState.connections, copy] };
    void persist();
  }

  async function removeConn(id: string) {
    dbState = { ...dbState, connections: dbState.connections.filter((c) => c.id !== id) };
    if (selectedId === id) selectedId = null;
    await persist();
  }


  function unlockWrites() {
    unlockUntil = Date.now() + 10 * 60 * 1000;
  }

  function exportAll() {
    const blob = new Blob([exportDbBundle(dbState)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'detour-db-export.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function openDrawer(mode: DrawerMode) {
    drawer = mode;
  }

  function copyDrawerJson() {
    if (!drawer) return;
    void navigator.clipboard.writeText(JSON.stringify(drawer.payload, null, 2));
  }

  function onGlobalKey(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;
    if (deleteConfirm) {
      e.preventDefault();
      deleteConfirm = null;
      return;
    }
    if (!drawer && !formOpen && !confirmOpen && activeKeyspace) {
      e.preventDefault();
      void onActiveKeyspaceChange(null);
    }
  }

  onMount(() => {
    window.addEventListener('keydown', onGlobalKey);
    void (async () => {
      try {
        const info = await browser.runtime.getPlatformInfo();
        const os =
          info.os === 'mac'
            ? 'macos'
            : info.os === 'win'
              ? 'windows'
              : info.os === 'linux'
                ? 'linux'
                : 'macos';
        const arch = info.arch === 'arm64' ? 'arm64' : 'x64';
        packSlug = `${os}-${arch}`;
        packOsLabel = os === 'macos' ? 'macOS' : os === 'windows' ? 'Windows' : 'Linux';
      } catch {
        /* keep defaults */
      }
      const loaded = await loadDbClientState(area);
      if (!loaded.ok) {
        loadError = loaded.errors.join('; ');
        return;
      }
      dbState = loaded.value;
      if (dbState.connections[0]) selectedId = dbState.connections[0].id;
      ensureQueryTabs(dbState.connections[0]?.engine ?? 'cassandra');
      await persist();
    })();
    return () => window.removeEventListener('keydown', onGlobalKey);
  });

  onDestroy(() => stopHelper());
</script>


<section class="db" aria-labelledby="db-heading">
  <header class="head">
    <div>
      <h2 id="db-heading">Databases</h2>
      <p class="sub">Connect to local or production databases, run queries, and save them</p>
    </div>
    <div class="helper" role="status" aria-live="polite">
      {#if helperStatus === 'ready'}
        <div class="pill-menu">
          <button
            type="button"
            class="pill ready compact"
            aria-haspopup="menu"
            aria-expanded={helperMenuOpen}
            title="Database helper is running{helperVersion ? ` · v${helperVersion}` : ''} · {helperOpen} open"
            onclick={() => (helperMenuOpen = !helperMenuOpen)}
          >
            Ready
          </button>
          {#if helperMenuOpen}
            <div class="menu" role="menu">
              <button type="button" role="menuitem" onclick={() => stopHelper()}>Stop helper</button>
              <button type="button" role="menuitem" onclick={() => restartHelper()}>Restart helper</button>
            </div>
          {/if}
        </div>
      {:else if helperStatus === 'stopped' || helperStatus === 'connecting'}
        <div class="helper-start">
          <button
            type="button"
            class="btn primary"
            disabled={helperStatus === 'connecting'}
            title="Local process Detour uses to reach your databases."
            onclick={() => void startHelper()}
          >
            {helperStatus === 'connecting' ? 'Starting…' : 'Start database helper'}
          </button>
          <span class="helper-hint"
            >{helperStatus === 'connecting'
              ? 'Starting local helper…'
              : 'Local process Detour uses to reach your databases.'}</span
          >
        </div>
      {:else if helperStatus === 'missing'}
        <span class="pill missing muted-pill">Helper not installed</span>
      {:else}
        <span
          class="pill"
          class:err={helperStatus === 'error' || helperStatus === 'needs_reload' || helperStatus === 'mismatch'}
        >
          {helperStatus === 'needs_reload'
            ? 'Reload needed'
            : helperStatus === 'mismatch'
              ? 'Update needed'
              : helperStatus === 'error'
                ? 'Helper error'
                : helperStatus}
        </span>
      {/if}
    </div>
  </header>

  {#if loadError}
    <p class="warn" role="alert">{loadError}</p>
  {/if}

  {#if helperStatus === 'missing'}
    <div class="setup card-block" role="region" aria-label="Install database helper">
      <h3>Install the Detour database helper (one time)</h3>
      <p>
        Browsers can’t talk to databases directly, so a small program on your computer does it. Detour starts and stops it
        for you after this install. You do <strong>not</strong> need Node for the OS pack.
      </p>
      <ol>
        <li>
          Download the <strong>{packOsLabel}</strong> pack
          (<code>detour-*-{packSlug}.zip</code> or <code>.tar.gz</code>) from
          <a href={RELEASES_URL} target="_blank" rel="noopener noreferrer">GitHub Releases</a>.
        </li>
        <li>Unzip it. If you haven’t already, load the pack’s <code>extension/</code> folder unpacked (Developer mode).</li>
        <li>
          Double-click <strong>Install Detour Helper</strong> in the pack. On first run, allow Gatekeeper / SmartScreen if
          prompted ($0 unsigned builds).
        </li>
        <li>
          If Chrome asks for permission, allow it, then <strong>Reload</strong> the extension once, then click
          <strong>Start database helper</strong>. You should see Helper ready.
        </li>
      </ol>
      <p class="muted">Host name: <code>{HOST_NAME}</code>.</p>
      <details class="dev-install">
        <summary>Developers (Node / pnpm)</summary>
        <p>
          From a Detour repo checkout with Node 24+:
          <code>corepack pnpm --filter @detour/cli exec detour db install</code>
          Optional: <code>--extension-id=…</code> to add an extra Chromium id. Uninstall:
          <code>detour db uninstall</code>.
        </p>
      </details>
      {#if helperError}
        <p class="warn">{helperError}</p>
      {/if}
    </div>
  {:else if helperStatus === 'needs_reload'}
    <div class="setup card-block" role="region" aria-label="Reload extension for database helper">
      <h3>One more step: reload Detour</h3>
      <p>
        Chrome needs a one-time reload after enabling the database helper. Your helper install is OK — this is not a
        missing install.
      </p>
      <div class="helper">
        <button type="button" class="btn primary" onclick={() => reloadExtension()}>Reload extension</button>
        <button type="button" class="btn" onclick={() => startHelper()}>I’ve reloaded — Start again</button>
      </div>
    </div>
  {:else if helperStatus === 'mismatch'}
    <p class="warn" role="alert">{helperError}</p>
  {:else if helperError && helperStatus === 'error'}
    <p class="warn" role="alert">{helperError}</p>
  {/if}

  <div class="layout" class:nav-collapsed={sidebarCollapsed}>
    <DbSidebar
      side={side}
      collapsed={sidebarCollapsed}
      onSide={setSide}
      onToggleCollapse={() => patchUi({ sidebarCollapsed: !sidebarCollapsed })}
    >
      {#if side === 'connections'}
        <h2 class="panel-title">Connections</h2>
        <div class="side-tools">
          <input type="search" placeholder="Search connections…" bind:value={search} aria-label="Search connections" />
          <button type="button" class="btn primary" onclick={openNew}>New connection</button>
          <button type="button" class="btn" onclick={exportAll}>Export</button>
        </div>
        <ul class="conn-list">
          {#each filtered as conn (conn.id)}
            <li>
              <button
                type="button"
                class="conn"
                class:active={selectedId === conn.id}
                class:prod={conn.environment === 'production'}
                style={`--conn-color:${conn.color}`}
                onclick={() => {
                  selectedId = conn.id;
                  void refreshExplorer();
                }}
              >
                <span class="swatch" aria-hidden="true"></span>
                <span class="meta">
                  <span class="name">{conn.name}</span>
                  <span class="env">{ENV_LABELS[conn.environment] ?? conn.environment}{#if conn.group} · {conn.group}{/if}</span>
                </span>
              </button>
              <div class="row-actions">
                <button type="button" class="btn text" onclick={() => openEdit(conn)}>Edit</button>
                <button type="button" class="btn text" onclick={() => duplicateConn(conn)}>Duplicate</button>
                <button type="button" class="btn text" onclick={() => removeConn(conn.id)}>Delete</button>
              </div>
            </li>
          {/each}
        </ul>
      {:else if side === 'collections'}
        <h2 class="panel-title">Collections</h2>
        <p class="muted pad">Folder and file tree of saved queries. Export never includes passwords.</p>
        {#if dbState.collections.length === 0}
          <button
            type="button"
            class="btn"
            onclick={() => {
              const colId = newId('col');
              dbState = {
                ...dbState,
                collections: [
                  {
                    id: colId,
                    name: 'My queries',
                    queries: [],
                    folders: [],
                  },
                ],
              };
              patchUi({ collectionsExpandedIds: [colId] });
              void persist();
            }}
          >
            <Icon name="plus" size={14} /> Create collection
          </button>
        {:else}
          <div class="pad collections-tree-wrap">
            <DbCollectionsTree
              collections={dbState.collections}
              expandedIds={collectionsExpandedIds}
              onToggleExpand={toggleCollectionExpand}
              onOpenQuery={openCollectionQuery}
              onRenameCollection={renameCollection}
              onRenameFolder={renameFolder}
              onRenameQuery={renameQuery}
              onDeleteCollection={deleteCollection}
              onDeleteFolder={deleteFolder}
              onDeleteQuery={deleteQuery}
              onNewFolder={newFolderInCollection}
              onNewQuery={newQueryInLocation}
              onMoveQuery={moveCollectionQuery}
              onSaveHere={(cId, fId) => saveActiveToCollection(cId, fId)}
            />
          </div>
        {/if}
      {:else}
        <h2 class="panel-title">History</h2>
        {#if dbState.history.length === 0}
          <p class="muted pad empty-hint">Run a query to build history.</p>
        {:else}
          <ul class="hist">
            {#each dbState.history.slice(0, 50) as h (h.id)}
              <li>
                <button
                  type="button"
                  class="btn text"
                  onclick={() => {
                    newTab({ name: 'History', body: h.statement, connectionId: h.connectionId });
                  }}
                >
                  <span class:fail={!h.ok}>{h.ok ? 'OK' : 'ERR'}</span>
                  {h.statement.slice(0, 80)}
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      {/if}
    </DbSidebar>

    <div class="main">
      {#if selected}
        <div class="conn-bar" class:prod={selected.environment === 'production'} style={`--conn-color:${selected.color}`}>
          <strong>{selected.name}</strong>
          <span class="env-label">{ENV_LABELS[selected.environment] ?? selected.environment}</span>
          {#if defaultReadOnly(selected.environment, selected.readOnly)}
            <span class="ro">Read-only{#if Date.now() < unlockUntil} (unlocked){/if}</span>
            {#if Date.now() >= unlockUntil}
              <button type="button" class="btn" onclick={unlockWrites}>Unlock writes (10 min)</button>
            {/if}
          {/if}
        </div>
      {:else}
        <p class="muted pad">Create a connection to browse schema and run queries.</p>
      {/if}

      <div class="split" class:ex-collapsed={explorerCollapsed}>
        <DbExplorer
          collapsed={explorerCollapsed}
          bind:search={explorerSearch}
          keyspaces={rootKeyspaces}
          activeKeyspace={activeKeyspace}
          childrenByParentId={childrenByParentId}
          columnsByTableId={columnsByTableId}
          expandedIds={expandedIds}
          selectedTableId={selectedTableId}
          showDdl={showDdl}
          ddl={ddlPreview}
          onToggleCollapse={() => patchUi({ explorerCollapsed: !explorerCollapsed })}
          onRefresh={() => void refreshExplorer()}
          onActiveKeyspaceChange={(ks) => void onActiveKeyspaceChange(ks)}
          onToggleExpand={(id) => void onToggleExpand(id)}
          onUseKeyspace={(ks) => void onUseKeyspace(ks)}
          onNodeClick={(n) => void onExplorerNodeClick(n)}
          onNodeDblClick={onExplorerNodeDblClick}
          onColumnClick={onColumnClick}
          onToggleDdl={() => (showDdl = !showDdl)}
        />

        <div class="center">
          <DbQueryWorkbench
            tabs={queryTabs}
            activeTabId={activeQueryTabId}
            selectedConnectionId={selectedId}
            connectionLabel={selected?.name ?? ''}
            connectionColor={selected?.color ?? ''}
            canCancel={canCancel}
            running={running}
            bind:consistency
            bind:pageSize
            bind:tracing
            showCassandraOpts={selected?.engine === 'cassandra'}
            onSelectTab={selectTab}
            onCloseTab={closeTab}
            onNewTab={() => newTab()}
            onRun={() => void runQuery(false)}
            onStop={() => void stopQuery()}
            onSave={() => saveActiveToCollection()}
            onOpenPro={() =>
              openDrawer({
                kind: 'pro',
                title: 'Pro tools',
                payload: { erText, designerDdl, compareText, explainText, syncFolder: dbState.syncFolder },
              })}
          >
            {#snippet editor()}
              {#if activeTab}
                <CodeEditor
                  id="db-cql-{activeTab.id}"
                  label="Query editor"
                  language="text"
                  value={activeTab.body}
                  runGutter={true}
                  onRunAt={(offset) => void runAtOffset(offset)}
                  onchange={(v) => updateActiveTab({ body: v })}
                  bind:this={codeEditor}
                />
              {/if}
            {/snippet}
          </DbQueryWorkbench>

          <DbResultsPane
            resultSets={resultSets}
            activeResultIndex={activeResultIndex}
            batchMessages={batchMessages}
            running={running}
            bind:activePane={resultsPane}
            onSelectResult={setActiveResultIndex}
            onLoadMore={() => void runQuery(true)}
            onRowClick={(row, index) =>
              openDrawer({
                kind: 'row',
                title: `Row ${index + 1}`,
                payload: Object.fromEntries((activeResult?.columns ?? []).map((c, i) => [c, row[i]])),
              })}
            onCellClick={(column, value, row, index) =>
              openDrawer({
                kind: 'cell',
                title: `${column} · row ${index + 1}`,
                payload: {
                  column,
                  value,
                  preview: formatDbCell(value),
                  row: Object.fromEntries((activeResult?.columns ?? []).map((c, i) => [c, row[i]])),
                },
              })}
          />
        </div>
      </div>
    </div>
  </div>
</section>

<Drawer
  open={drawer !== null}
  title={drawer?.title ?? 'Details'}
  docked={true}
  onclose={() => (drawer = null)}
>
  {#snippet head()}
    <button type="button" class="btn" onclick={copyDrawerJson}>Copy JSON</button>
  {/snippet}
  {#if drawer?.kind === 'pro'}
    <div class="pro-drawer">
      <button
        type="button"
        class="btn"
        disabled={!selected}
        onclick={async () => {
          if (!selected || !(await connectSelected()) || !rpc) return;
          const loaded = Object.values(childrenByParentId).flat();
          const tables = loaded
            .filter((n) => n.kind === 'table')
            .slice(0, 20)
            .map((n) => ({
              id: n.id,
              label: n.label,
              schema: String(n.meta?.schema ?? n.meta?.database ?? n.meta?.keyspace ?? 'public'),
              name: n.label,
            }));
          erText = JSON.stringify(await rpc.request('erDiagram', { connectionId: selected.id, tables }), null, 2);
          openDrawer({ kind: 'pro', title: 'Pro tools', payload: { erText } });
        }}
      >
        ER diagram from explorer tables
      </button>
      <button
        type="button"
        class="btn"
        onclick={async () => {
          if (!rpc) await startHelper();
          designerDdl = String(
            (
              (await rpc!.request('tableDesigner', {
                action: 'create',
                schema: 'public',
                table: 'example',
                columns: [
                  { name: 'id', type: 'int', primaryKey: true, nullable: false },
                  { name: 'name', type: 'text' },
                ],
              })) as { ddl: string }
            ).ddl,
          );
        }}
      >
        Table designer preview
      </button>
      <label>
        Pending edits JSON
        <textarea rows="4" bind:value={pendingEditsJson}></textarea>
      </label>
      <button
        type="button"
        class="btn"
        disabled={!selected}
        onclick={async () => {
          if (!selected || !(await connectSelected()) || !rpc) return;
          const edits = JSON.parse(pendingEditsJson);
          openDrawer({
            kind: 'result',
            title: 'Apply edits',
            payload: await rpc.request('applyEdits', { connectionId: selected.id, edits }),
          });
        }}
      >
        Commit pending edits
      </button>
      <label>
        Git sync folder
        <input
          value={dbState.syncFolder ?? ''}
          oninput={(e) => {
            dbState = { ...dbState, syncFolder: e.currentTarget.value };
            void persist();
          }}
        />
      </label>
      <button
        type="button"
        class="btn"
        onclick={async () => {
          if (!rpc) await startHelper();
          const folder = dbState.syncFolder;
          if (!folder) return;
          await rpc!.request('syncCollections', {
            folder,
            direction: 'push',
            collections: dbState.collections,
          });
          await persist();
        }}
      >
        Push collections to folder
      </button>
      {#if erText}<pre class="ddl">{erText}</pre>{/if}
      {#if designerDdl}<pre class="ddl">{designerDdl}</pre>{/if}
      {#if explainText}<pre class="ddl">{explainText}</pre>{/if}
    </div>
  {:else if drawer}
    <pre class="ddl">{JSON.stringify(drawer.payload, null, 2)}</pre>
  {/if}
</Drawer>

{#if formOpen}
  <div class="modal modal-conn" role="dialog" aria-modal="true" aria-labelledby="conn-form-title">
    <div class="modal-card conn-form">
      <header class="conn-dialog-head">
        <h3 id="conn-form-title">Connection</h3>
        <span class="engine-badge">{ENGINE_LABELS[draft.engine] ?? draft.engine}</span>
      </header>
      <div class="dialog-tabs" role="tablist">
        <button type="button" class:active={dialogTab === 'main'} onclick={() => (dialogTab = 'main')}>Main</button>
        <button type="button" class:active={dialogTab === 'ssl'} onclick={() => (dialogTab = 'ssl')}>SSL</button>
        <button type="button" class:active={dialogTab === 'ssh'} onclick={() => (dialogTab = 'ssh')}>SSH</button>
        <button type="button" class:active={dialogTab === 'advanced'} onclick={() => (dialogTab = 'advanced')}>Advanced</button>
      </div>
      <div class="conn-form-body">
      <div class="dialog-panel" class:hidden={dialogTab !== 'main'}>
      <p class="muted">
        <button type="button" class="linkish" onclick={() => (showImportUrl = !showImportUrl)}>Import from URL</button>
      </p>
      {#if showImportUrl}
        <label>
          URL
          <input bind:value={pasteUrl} placeholder="postgres://user:pass@host:5432/db" />
        </label>
        <button type="button" class="btn" onclick={applyPasteUrl}>Fill from URL</button>
      {/if}

      {#if dialogTab === 'main'}
      <div class="form-grid">
        <label>
          <span class="field-label"
            >Name<span class="req" aria-hidden="true">*</span></span
          >
          <input bind:value={draft.name} aria-required="true" />
        </label>
        <label>
          Database type
          <select
            value={draft.engine}
            onchange={(e) => {
              const engine = e.currentTarget.value as DbEngine;
              const keepName = draft.name;
              const next = blankConnection(engine);
              draft = {
                ...next,
                id: draft.id,
                name: keepName,
                group: draft.group,
                color: draft.color,
                environment: draft.environment,
                port: portTouched ? draft.port : next.port,
              };
              ensureActiveTabBody(defaultStatement(engine));
            }}
          >
            {#each availableEngines as [id, label]}
              <option value={id}>{label}</option>
            {/each}
          </select>
        </label>
        {#if draftVariants.length}
          <label>
            Variant
            <select
              value={draft.engine === 'cassandra' ? draft.target : draft.engine}
              onchange={(e) => {
                const v = e.currentTarget.value;
                if (draft.engine === 'cassandra') {
                  draft = { ...draft, target: v as typeof draft.target };
                } else if (v === 'mysql' || v === 'mariadb') {
                  draft = {
                    ...blankConnection(v),
                    id: draft.id,
                    name: draft.name,
                    group: draft.group,
                    color: draft.color,
                    environment: draft.environment,
                    port: portTouched ? draft.port : defaultPort(v),
                  };
                } else if (v === 'elasticsearch' || v === 'opensearch') {
                  draft = {
                    ...blankConnection(v),
                    id: draft.id,
                    name: draft.name,
                    group: draft.group,
                    color: draft.color,
                    environment: draft.environment,
                    port: portTouched ? draft.port : defaultPort(v),
                  };
                }
              }}
            >
              {#each draftVariants as v}
                <option value={v.value}>{v.label}</option>
              {/each}
            </select>
          </label>
        {/if}
        <label>Group <input bind:value={draft.group} /></label>
        <div class="color-field">
          <span id="conn-color-label">Color</span>
          <input type="color" bind:value={draft.color} aria-labelledby="conn-color-label" />
        </div>
        <label>
          Environment
          <select bind:value={draft.environment}>
            {#each environmentOptions as opt}
              <option value={opt.value}>{opt.label}</option>
            {/each}
          </select>
        </label>
      </div>
      {/if}

      {#if dialogTab === 'main'}<fieldset class="section">
        <legend>Basic</legend>
        <div class="form-grid">
          {#each draftFields.filter((f) => f.group === 'basic') as field}
            {#if renderField(field)}
              {#if field.kind === 'checkbox'}
                <label class="check">
                  <input
                    type="checkbox"
                    checked={Boolean(draftGet(field.path))}
                    onchange={(e) => draftSet(field.path, e.currentTarget.checked)}
                  />
                  {field.label}
                </label>
              {:else if field.kind === 'select'}
                <label>
                  <span class="field-label"
                    >{field.label}{#if field.required}<span class="req" aria-hidden="true">*</span>{/if}</span
                  >
                  <select
                    value={String(draftGet(field.path) ?? '')}
                    aria-required={field.required ? 'true' : undefined}
                    onchange={(e) => draftSet(field.path, e.currentTarget.value)}
                  >
                    {#each field.options ?? [] as opt}
                      <option value={opt.value} disabled={opt.disabled}>{opt.label}</option>
                    {/each}
                  </select>
                </label>
              {:else if field.kind === 'path'}
                <label class="path-field">
                  <span class="field-label"
                    >{field.label}{#if field.required}<span class="req" aria-hidden="true">*</span>{/if}</span
                  >
                  <span class="path-row">
                    <input
                      value={String(draftGet(field.path) ?? '')}
                      placeholder={field.placeholder}
                      aria-required={field.required ? 'true' : undefined}
                      oninput={(e) => draftSet(field.path, e.currentTarget.value)}
                    />
                    <button
                      type="button"
                      class="btn"
                      disabled={browseLockedOther(field.path)}
                      onclick={() => browsePath(field.path)}
                    >
                      {browseButtonLabel(field.path)}
                    </button>
                    <button
                      type="button"
                      class="btn"
                      disabled={browseLockedOther(field.path)}
                      onclick={() => draftSet(field.path, '')}
                      aria-label="Clear">Clear</button
                    >
                  </span>
                </label>
              {:else if field.kind === 'number'}
                <label>
                  <span class="field-label"
                    >{field.label}{#if field.required}<span class="req" aria-hidden="true">*</span>{/if}</span
                  >
                  <input
                    type="number"
                    value={draftGet(field.path) ?? ''}
                    aria-required={field.required ? 'true' : undefined}
                    oninput={(e) => {
                      const n = e.currentTarget.value === '' ? undefined : Number(e.currentTarget.value);
                      draftSet(field.path, n);
                    }}
                  />
                </label>
              {:else}
                <label>
                  <span class="field-label"
                    >{field.label}{#if field.required}<span class="req" aria-hidden="true">*</span>{/if}</span
                  >
                  <input
                    type="text"
                    value={String(draftGet(field.path) ?? '')}
                    placeholder={field.placeholder}
                    aria-required={field.required ? 'true' : undefined}
                    oninput={(e) => draftSet(field.path, e.currentTarget.value)}
                  />
                </label>
              {/if}
            {/if}
          {/each}
          {#if draft.passwordStorage !== 'none'}
            <label>Password <input type="password" bind:value={passwordDraft} autocomplete="off" /></label>
          {/if}
          {#if draft.engine === 'cassandra' && draft.target === 'astra'}
            <label class="path-field">
              <span class="field-label"
                >Secure connect bundle<span class="req" aria-hidden="true">*</span></span
              >
              <span class="path-row">
                <input bind:value={draft.secureConnectBundlePath} aria-required="true" />
                <button
                  type="button"
                  class="btn"
                  disabled={browseLockedOther('secureConnectBundlePath')}
                  onclick={() => browsePath('secureConnectBundlePath')}
                >
                  {browseButtonLabel('secureConnectBundlePath')}
                </button>
              </span>
            </label>
          {/if}
          {#if draft.engine === 'cassandra' && draft.target === 'keyspaces'}
            <label>Region <input bind:value={draft.region} placeholder="us-east-1" /></label>
            <label>
              Keyspaces auth
              <select bind:value={draft.keyspacesAuth}>
                <option value="password">Service-specific password</option>
                <option value="sigv4">SigV4</option>
              </select>
            </label>
          {/if}
          <label class="check">
            <input
              type="checkbox"
              checked={defaultReadOnly(draft.environment, draft.readOnly)}
              onchange={(e) => {
                draft = { ...draft, readOnly: e.currentTarget.checked };
              }}
            />
            Read-only
          </label>
        </div>
      </fieldset>

      {/if}
</div>
{#each ADVANCED_GROUPS as group}
        {@const tabFor =
          group === 'tls' ? 'ssl' : group === 'ssh' ? 'ssh' : 'advanced'}
        {@const groupAllowed =
          (group !== 'ssh' || hasSshCap) && (group !== 'proxy' || hasProxyCap)}
        {@const groupFields =
          dialogTab === tabFor && groupAllowed
            ? draftFields.filter((f) => f.group === group && renderField(f))
            : []}
        {#if helperStatus === 'ready' && !groupAllowed && (group === 'ssh' || group === 'proxy')}
          <p class="muted cap-gate" role="note">
            {group === 'ssh' ? 'SSH tunnel' : 'Proxy'} options require a helper that advertises
            <code>{group}</code> capability.
          </p>
        {/if}
        {#if groupFields.length}
          <details
            class="section adv"
            open={advancedOpen[group]}
            ontoggle={(e) => {
              advancedOpen = { ...advancedOpen, [group]: (e.currentTarget as HTMLDetailsElement).open };
            }}
          >
            <summary>{groupSummary(group, draftGet)}</summary>
            <div class="form-grid">
              {#each groupFields as field}
                {#if field.kind === 'checkbox'}
                  <label class="check">
                    <input
                      type="checkbox"
                      checked={Boolean(draftGet(field.path))}
                      onchange={(e) => draftSet(field.path, e.currentTarget.checked)}
                    />
                    {field.label}
                    {#if field.hint}<span class="muted"> — {field.hint}</span>{/if}
                  </label>
                {:else if field.kind === 'select'}
                  <label>
                    {field.label}
                    <select
                      value={String(draftGet(field.path) ?? field.options?.[0]?.value ?? '')}
                      onchange={(e) => draftSet(field.path, e.currentTarget.value)}
                    >
                      {#each field.options ?? [] as opt}
                        <option value={opt.value} disabled={opt.disabled} title={opt.hint}>{opt.label}</option>
                      {/each}
                    </select>
                  </label>
                {:else if field.kind === 'path'}
                  <label class="path-field">
                    <span class="field-label"
                      >{field.label}{#if field.required}<span class="req" aria-hidden="true">*</span>{/if}</span
                    >
                    <span class="path-row">
                      <input
                        value={String(draftGet(field.path) ?? '')}
                        aria-required={field.required ? 'true' : undefined}
                        oninput={(e) => draftSet(field.path, e.currentTarget.value)}
                        onblur={() => {
                          if (field.path === 'tls.keyPath') {
                            void maybePromptEncryptedKeyPass(false);
                          }
                        }}
                      />
                      <button
                        type="button"
                        class="btn"
                        disabled={browseLockedOther(field.path)}
                        onclick={() => browsePath(field.path)}
                      >
                        {browseButtonLabel(field.path)}
                      </button>
                      <button
                        type="button"
                        class="btn"
                        disabled={browseLockedOther(field.path)}
                        onclick={() => {
                          draftSet(field.path, '');
                          if (field.path === 'tls.keyPath') {
                            sslKeyPassDraft = '';
                            sslKeyPassMaybeStored = false;
                            sslKeyEncrypted = null;
                          }
                        }}>Clear</button
                      >
                    </span>
                    {#if field.path === 'tls.keyPath' && String(draftGet('tls.keyPath') ?? '').trim()}
                      <button
                        type="button"
                        class="linkish"
                        onclick={() => void maybePromptEncryptedKeyPass(true)}
                      >
                        Update key passphrase…
                      </button>
                    {/if}
                  </label>
                {:else if field.kind === 'textarea'}
                  <label>
                    {field.label}
                    <textarea
                      rows="2"
                      value={String(draftGet(field.path) ?? '')}
                      oninput={(e) => draftSet(field.path, e.currentTarget.value)}
                    ></textarea>
                  </label>
                {:else if field.kind === 'number'}
                  <label>
                    {field.label}
                    <input
                      type="number"
                      value={draftGet(field.path) ?? ''}
                      oninput={(e) => {
                        const n = e.currentTarget.value === '' ? undefined : Number(e.currentTarget.value);
                        draftSet(field.path, n);
                      }}
                    />
                  </label>
                {:else if field.kind === 'password' && field.secretKind}
                  <label>
                    {field.label}
                    <input
                      type="password"
                      value={storeSecretDraftValue(field.secretKind)}
                      placeholder={field.secretKind === 'trustStorePass' && trustStorePassMaybeStored
                        ? 'Stored in keychain'
                        : field.secretKind === 'keyStorePass' && keyStorePassMaybeStored
                          ? 'Stored in keychain'
                          : ''}
                      autocomplete="off"
                      oninput={(e) => setSecretDraftValue(field.secretKind!, e.currentTarget.value)}
                    />
                    {#if field.hint}
                      <span class="muted field-hint">{field.hint}</span>
                    {/if}
                  </label>
                {:else}
                  <label>
                    {field.label}
                    <input
                      type="text"
                      value={String(draftGet(field.path) ?? '')}
                      placeholder={field.placeholder}
                      oninput={(e) => draftSet(field.path, e.currentTarget.value)}
                    />
                    {#if field.hint}
                      <span class="muted field-hint">{field.hint}</span>
                    {/if}
                  </label>
                {/if}
              {/each}
            </div>
          </details>
        {/if}
      {/each}

      {#if browseMsg}
        <p class={browseMsgIsError ? 'warn' : 'muted'} role="status">{browseMsg}</p>
      {/if}
      {#if testMsg}
        {#if testMsgKind === 'error'}
          <p class="warn test-result" role="alert">
            <strong>Connection failed</strong>
            {testMsg}
          </p>
        {:else}
          <p class="muted">{testMsg}</p>
        {/if}
      {/if}
      </div>
      <div class="modal-actions">
        <button type="button" class="btn" disabled={activeBrowsingPath !== null} onclick={testDraft}
          >Test connection</button
        >
        <span class="spacer"></span>
        <button type="button" class="btn" onclick={() => (formOpen = false)}>Cancel</button>
        <button type="button" class="btn" disabled={activeBrowsingPath !== null} onclick={saveDraft}
          >Save</button
        >
        <button
          type="button"
          class="btn primary"
          disabled={activeBrowsingPath !== null}
          onclick={() => void connectDraft()}>Save & connect</button
        >
      </div>
    </div>
  </div>
{/if}

{#if sslKeyPassModalOpen}
  <div class="modal modal-ssl-key-pass" role="dialog" aria-modal="true" aria-labelledby="ssl-key-pass-title">
    <div class="modal-card">
      <h3 id="ssl-key-pass-title">Private key password</h3>
      <p class="muted">Enter the password for the encrypted client key. Stored in the OS keychain on Save/Connect.</p>
      <label>
        Password
        <input
          type="password"
          bind:value={sslKeyPassModalInput}
          autocomplete="off"
          onkeydown={(e) => {
            if (e.key === 'Enter') confirmSslKeyPassModal();
          }}
        />
      </label>
      <div class="modal-actions">
        <button type="button" class="btn" onclick={cancelSslKeyPassModal}>Cancel</button>
        <button type="button" class="btn primary" onclick={confirmSslKeyPassModal}>Confirm</button>
      </div>
    </div>
  </div>
{/if}


{#if confirmOpen}
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
    <div class="modal-card">
      <h3 id="confirm-title">Confirm destructive statement</h3>
      <p>This statement may destroy or overwrite data. Type <strong>{confirmExpected}</strong> to continue.</p>
      <input bind:value={confirmTyped} aria-label="Type the name to confirm" />
      <div class="modal-actions">
        <button type="button" class="btn" onclick={() => (confirmOpen = false)}>Cancel</button>
        <button
          type="button"
          class="btn primary"
          disabled={confirmTyped !== confirmExpected}
          onclick={() => {
            confirmOpen = false;
            const run = pendingRun;
            pendingRun = null;
            void run?.();
          }}
        >
          Run anyway
        </button>
      </div>
    </div>
  </div>
{/if}

{#if deleteConfirm}
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="delete-confirm-title">
    <div class="modal-card">
      <h3 id="delete-confirm-title">{deleteConfirm.title}</h3>
      <p>{deleteConfirm.message}</p>
      <div class="modal-actions">
        <button type="button" class="btn" onclick={() => (deleteConfirm = null)}>Cancel</button>
        <button
          type="button"
          class="btn danger"
          onclick={() => {
            const run = deleteConfirm?.run;
            deleteConfirm = null;
            run?.();
          }}
        >
          Delete
        </button>
      </div>
    </div>
  </div>
{/if}



<style>
  .db {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: calc(100vh - 8rem);
  }
  .head {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    align-items: flex-start;
  }
  .sub {
    margin: 0;
    color: var(--muted);
    font-size: 0.9rem;
  }
  .helper {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
  .pill-menu {
    position: relative;
  }
  .pill {
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 4px 10px;
    font-size: 0.85rem;
    background: var(--surface-2, var(--surface));
    color: inherit;
    cursor: pointer;
  }
  .pill.ready {
    border-color: var(--ok, #3d9a6a);
  }
  .pill.missing,
  .pill.err {
    border-color: var(--danger, #c44);
  }
  .pill.muted-pill {
    cursor: default;
    opacity: 0.85;
  }
  .helper-start {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
    max-width: min(36rem, 85vw);
  }
  .helper-hint {
    font-size: 0.75rem;
    color: var(--muted);
    max-width: 100%;
    text-align: right;
    white-space: nowrap;
    overflow: visible;
  }
  @media (max-width: 28rem) {
    .helper-hint {
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }
  .pill.ready.compact {
    padding: 4px 10px;
    font-size: 0.8rem;
  }
  .collections-tree-wrap {
    overflow: auto;
    min-height: 0;
  }
  .menu {
    position: absolute;
    right: 0;
    top: calc(100% + 4px);
    z-index: 20;
    display: flex;
    flex-direction: column;
    min-width: 10rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
    overflow: hidden;
  }
  .menu button {
    border: 0;
    background: transparent;
    color: inherit;
    text-align: left;
    padding: 8px 12px;
    cursor: pointer;
    font: inherit;
  }
  .menu button:hover {
    background: color-mix(in srgb, var(--accent) 14%, transparent);
  }
  .setup {
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 12px 16px;
    background: var(--surface-2, var(--surface));
  }
  .layout {
    display: grid;
    grid-template-columns: minmax(240px, 300px) 1fr;
    gap: 12px;
    min-height: 0;
    flex: 1;
  }
  .layout.nav-collapsed {
    grid-template-columns: auto 1fr;
  }
  .panel-title {
    margin: 0;
    padding: 10px 12px 4px;
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .side-tools {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px;
  }
  .empty-hint {
    margin: 4px 0 8px;
  }
  .conn-list {
    list-style: none;
    margin: 0;
    padding: 0;
    overflow: auto;
    flex: 1;
    min-height: 0;
    scrollbar-width: thin;
    scrollbar-color: color-mix(in srgb, var(--text-muted, var(--muted)) 45%, transparent) transparent;
  }
  .conn-list::-webkit-scrollbar {
    width: 4px;
    height: 4px;
  }
  .conn-list::-webkit-scrollbar-track {
    background: transparent;
  }
  .conn-list::-webkit-scrollbar-thumb {
    background: color-mix(in srgb, var(--text-muted, var(--muted)) 45%, transparent);
    border-radius: 999px;
  }
  .conn-list li {
    border-bottom: 1px solid var(--border);
    padding: 4px 8px;
  }
  .conn {
    display: flex;
    gap: 8px;
    width: 100%;
    text-align: left;
    background: transparent;
    border: 0;
    color: inherit;
    cursor: pointer;
    padding: 6px 4px;
  }
  .conn.active {
    background: var(--surface-2, rgba(127, 127, 127, 0.12));
  }
  .conn.prod .name {
    color: var(--danger, #e07070);
  }
  .swatch {
    width: 8px;
    border-radius: 2px;
    background: var(--conn-color);
  }
  .meta {
    display: flex;
    flex-direction: column;
  }
  .env,
  .muted {
    color: var(--muted);
    font-size: 0.85rem;
  }
  .row-actions {
    display: flex;
    gap: 4px;
  }
  .main {
    border: 1px solid var(--border);
    border-radius: 8px;
    min-width: 0;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
    background: var(--surface);
  }
  .conn-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    padding: 8px 12px;
    border-bottom: 1px solid var(--border);
    border-left: 4px solid var(--conn-color);
    background: var(--surface-2, var(--surface));
  }
  .conn-bar.prod {
    background: color-mix(in srgb, var(--danger, #c44) 12%, transparent);
  }
  .split {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    min-height: 0;
    flex: 1;
  }
  .center {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    min-width: 0;
    min-height: 0;
  }
  .hist {
    list-style: none;
    margin: 0;
    padding: 8px;
    overflow: auto;
    flex: 1;
    min-height: 0;
    scrollbar-width: thin;
    scrollbar-color: color-mix(in srgb, var(--text-muted, var(--muted)) 45%, transparent) transparent;
  }
  .hist::-webkit-scrollbar {
    width: 4px;
    height: 4px;
  }
  .hist::-webkit-scrollbar-track {
    background: transparent;
  }
  .hist::-webkit-scrollbar-thumb {
    background: color-mix(in srgb, var(--text-muted, var(--muted)) 45%, transparent);
    border-radius: 999px;
  }
  .fail {
    color: var(--danger, #e07070);
  }
  .pad {
    padding: 8px;
  }
  .warn {
    color: var(--danger, #e07070);
  }
  .ddl {
    font-size: 0.75rem;
    white-space: pre-wrap;
    background: var(--surface-2, rgba(127, 127, 127, 0.08));
    padding: 8px;
    border-radius: 6px;
  }
  .pro-drawer {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .conn-form {
    max-width: 42rem;
  }
  /* Caption + * must be one flex child; bare text+span under flex-column stacks * alone. */
  .field-label {
    display: inline;
  }
  .req {
    color: var(--accent, #5b8def);
    font-weight: 600;
    margin-left: 0.15em;
  }
  .conn-dialog-head {
    display: flex;
    align-items: center;
    gap: 8px;
    justify-content: space-between;
  }
  .engine-badge {
    font-size: 0.75rem;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--accent-tint, color-mix(in srgb, var(--accent) 18%, transparent));
    color: var(--accent);
  }
  .dialog-tabs {
    display: flex;
    gap: 2px;
    border-bottom: 1px solid var(--border);
    margin: 8px 0;
  }
  .dialog-tabs button {
    background: transparent;
    border: 0;
    padding: 8px 12px;
    color: var(--muted);
    cursor: pointer;
    font: inherit;
  }
  .dialog-tabs button.active {
    color: var(--fg, var(--text));
    box-shadow: inset 0 -2px 0 var(--accent);
  }
  .dialog-panel.hidden {
    display: none;
  }
  .form-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px 12px;
  }
  .form-grid > label,
  .form-grid > .path-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.85rem;
  }
  .form-grid > .color-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.85rem;
    align-items: flex-start;
  }
  .path-row {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .path-row input {
    flex: 1;
  }
  .section {
    margin: 10px 0;
    border: 1px solid var(--border, #333);
    border-radius: 6px;
    /* Extra horizontal padding so focus rings clear the fieldset border. */
    padding: 8px 12px;
  }
  .section.adv {
    margin: 4px 0;
    padding: 4px 10px;
  }
  .section.adv summary {
    cursor: pointer;
    font-weight: 600;
    font-size: 0.9rem;
  }
  .linkish {
    background: none;
    border: none;
    color: var(--accent, #5b8def);
    cursor: pointer;
    padding: 0;
    text-decoration: underline;
    font: inherit;
  }
  .modal {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    display: grid;
    place-items: center;
    z-index: 80;
    padding: 16px;
  }
  .modal.modal-conn {
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    place-items: unset;
    padding: min(6vh, 3rem) 16px 16px;
    overflow: auto;
  }
  .modal.modal-ssl-key-pass {
    z-index: 90;
  }
  .modal-card {
    background: var(--surface);
    color: var(--fg);
    border-radius: 10px;
    padding: 16px;
    width: min(480px, 100%);
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 90vh;
    overflow: auto;
  }
  .conn-form.modal-card,
  .modal-card.conn-form {
    width: min(42rem, 100%);
    max-width: min(42rem, 100%);
    height: fit-content;
    max-height: min(90vh, 52rem);
    align-self: flex-start;
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--fg, #fff) 22%, var(--border, #333));
    box-shadow:
      0 12px 40px rgba(0, 0, 0, 0.55),
      0 0 0 1px color-mix(in srgb, var(--fg, #fff) 6%, transparent);
  }
  .conn-form .conn-dialog-head,
  .conn-form .dialog-tabs {
    flex: 0 0 auto;
  }
  .conn-form-body {
    flex: 0 1 auto;
    min-height: 0;
    /* Keep vertical scroll; pad so :focus-visible outline (2px) + offset (2px) is not clipped.
       overflow-x:visible cannot pair with overflow-y:auto (CSS forces both non-visible). */
    overflow-x: hidden;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 4px 6px;
  }
  .conn-form .modal-actions {
    flex: 0 0 auto;
    margin-top: 4px;
    padding-top: 8px;
    border-top: 1px solid var(--border);
  }
  .modal-card label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.9rem;
  }
  .modal-actions {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-top: 8px;
  }
  .spacer {
    flex: 1;
  }
  .test-result {
    margin: 8px 0 0;
    padding: 6px 8px;
    border-left: 3px solid var(--danger, #e07070);
    font-weight: 500;
    white-space: pre-wrap;
    word-break: break-word;
    user-select: text;
  }
  .test-result strong {
    display: block;
    margin-bottom: 2px;
  }
  .form-grid > .check {
    flex-direction: row;
    align-items: center;
    gap: 8px;
  }
  .check {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 8px;
  }
  .color-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.85rem;
    align-items: flex-start;
  }
  .color-field input[type='color'] {
    width: 2.5rem;
    height: 1.75rem;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: transparent;
    cursor: pointer;
  }
  @media (max-width: 900px) {
    .layout,
    .split {
      grid-template-columns: 1fr;
    }
  }
</style>
