<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import CodeEditor from '../../ui/CodeEditor.svelte';
  import {
    defaultAdvanced,
    defaultPort,
    defaultProxy,
    defaultReadOnly,
    defaultSsh,
    defaultStatement,
    defaultTls,
    emptyDbClientState,
    ENGINE_LABELS,
    migrateConnection,
    newId,
    type DbClientState,
    type DbConnection,
    type DbEngine,
    type DbEnvironment,
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

  let dbState: DbClientState = $state.raw(emptyDbClientState());
  let loadError = $state('');
  let helperStatus = $state<HelperStatus>('stopped');
  let helperVersion = $state('');
  let helperCapabilities: string[] = $state.raw([]);
  /** Pack slug for the current browser OS/arch (GitHub Releases). */
  let packSlug = $state('macos-arm64');
  let packOsLabel = $state('macOS');
  let helperOpen = $state(0);
  let helperError = $state('');
  let selectedId = $state<string | null>(null);
  let search = $state('');
  let cql = $state('SELECT release_version FROM system.local;');
  let consistency = $state('LOCAL_ONE');
  let pageSize = $state(500);
  let tracing = $state(false);
  let txMode = $state(false);
  let pendingEditsJson = $state('[]');
  let explainText = $state('');
  let erText = $state('');
  let designerDdl = $state('');
  let compareText = $state('');
  let proPanel = $state<'query' | 'pro'>('query');
  let running = $state(false);
  let resultColumns: string[] = $state.raw([]);
  let resultRows: unknown[][] = $state.raw([]);
  let pageToken: string | null = $state(null);
  let lastStatement = $state('');
  let messages: string[] = $state.raw([]);
  let warnings: string[] = $state.raw([]);
  let timingMs = $state<number | undefined>();
  let explorer: Array<{ id: string; label: string; kind: string; meta?: Record<string, unknown> }> = $state.raw([]);
  let ddlPreview = $state('');
  let formOpen = $state(false);
  let draft: DbConnection = $state.raw(blankConnection());
  let pasteUrl = $state('');
  let passwordDraft = $state('');
  /** Ephemeral TLS client-key passphrase → host `${secretAccount}:sslKeyPass`. */
  let sslKeyPassDraft = $state('');
  /** True after user confirms passphrase this session (or edit assumes keychain may have one). */
  let sslKeyPassMaybeStored = $state(false);
  /** Last inspectPemKey result for draft tls.keyPath (null = unknown). */
  let sslKeyEncrypted: boolean | null = $state(null);
  /** Java store passwords → `:trustStorePass` / `:keyStorePass` (never chrome.storage). */
  let trustStorePassDraft = $state('');
  let keyStorePassDraft = $state('');
  let trustStorePassMaybeStored = $state(false);
  let keyStorePassMaybeStored = $state(false);
  let sslKeyPassModalOpen = $state(false);
  let sslKeyPassModalInput = $state('');
  /** Resume Test/Connect after passphrase modal Confirm. */
  let pendingAfterKeyPass: (() => Promise<void>) | null = null;
  let testMsg = $state('');
  /** Test/Connect footer outcome — errors use alert styling; progress/ok stay muted. */
  let testMsgKind: 'idle' | 'progress' | 'ok' | 'error' = $state('idle');
  /** Browse / pickFile feedback (cancel, helper fail, picker error). */
  let browseMsg = $state('');
  let browseMsgIsError = $state(false);
  /** One in-flight pickFile at a time (all Browse buttons share this). */
  let browsing = $state(false);
  /** Bumps on each Browse / force-reset so late RPC results cannot re-lock the UI. */
  let browseGeneration = 0;
  /** Unlock all Browse buttons if the host never answers (dialog behind Chrome / hung picker). */
  const BROWSE_TIMEOUT_MS = 90_000;
  let showImportUrl = $state(false);
  let portTouched = $state(false);
  let advancedOpen: Record<string, boolean> = $state({
    auth: false,
    tls: false,
    ssh: false,
    proxy: false,
    driver: false,
    advanced: false,
  });
  let unlockUntil = $state(0);
  let confirmOpen = $state(false);
  let confirmTyped = $state('');
  let confirmExpected = $state('');
  let pendingRun: (() => Promise<void>) | null = null;
  let rpc: NativeRpcClient | null = null;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let side = $state<'connections' | 'collections' | 'history'>('connections');

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
      // Spring-style "a, b, c" contact lists → multiple CQL contact points
      const points = h
        .split(/[,;\s]+/)
        .map((p) => p.trim())
        .filter(Boolean);
      draft = { ...draft, contactPoints: points };
    }
    if (path === 'port') portTouched = true;
  }

  function resetBrowsingLock(message?: string) {
    browseGeneration += 1;
    browsing = false;
    if (message) {
      browseMsgIsError = true;
      browseMsg = message;
    }
  }

  async function browsePath(path: string) {
    if (browsing) {
      // Buttons stay enabled as "Cancel…" so a hung pickFile never locks the form forever.
      resetBrowsingLock(
        'Browse cancelled. If a file dialog is still open, close it or Alt+Tab to it. Or paste an absolute path.',
      );
      return;
    }
    const gen = ++browseGeneration;
    browsing = true;
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
      try {
        const result = (await rpc!.request('pickFile', { title: 'Select file' })) as {
          path?: string | null;
        };
        if (gen !== browseGeneration || timedOut) return;
        if (result.path) {
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
        browsing = false;
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

  function friendlyHelperError(msg: string): string {
    if (/connectNative missing/i.test(msg)) {
      return 'Chrome needs a one-time reload after enabling the database helper.';
    }
    return msg;
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
  /** Engines advertised by the helper; empty before handshake → show all labels (form still usable offline). */
  const availableEngines = $derived.by(() => {
    const fromCap = enginesFromCapabilities(helperCapabilities);
    if (fromCap.length === 0) return Object.entries(ENGINE_LABELS);
    return Object.entries(ENGINE_LABELS).filter(([id]) => fromCap.includes(id));
  });
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
  }

  async function restartHelper() {
    stopHelper();
    await startHelper();
  }

  async function persist() {
    await saveDbClientState(area, dbState);
  }

  /** Write connection password + optional keychain kinds (never into chrome.storage). */
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

  async function refreshExplorer() {
    if (!selected || !(await connectSelected())) return;
    bumpIdle();
    explorer = (await rpc!.request('listObjects', { connectionId: selected.id, path: { kind: 'root' } })) as typeof explorer;
  }

  async function openNode(node: { id: string; label: string; kind: string; meta?: Record<string, unknown> }) {
    if (!selected || !rpc) return;
    bumpIdle();
    if (node.kind === 'keyspace') {
      explorer = (await rpc.request('listObjects', {
        connectionId: selected.id,
        path: { kind: 'keyspace', keyspace: node.label },
      })) as typeof explorer;
      const desc = (await rpc.request('describe', {
        connectionId: selected.id,
        ref: { kind: 'keyspace', keyspace: node.label },
      })) as { ddl?: string };
      ddlPreview = desc.ddl ?? '';
      return;
    }
    if (node.kind === 'table' || node.kind === 'materialized_view') {
      const ks = String(node.meta?.keyspace ?? '');
      const desc = (await rpc.request('describe', {
        connectionId: selected.id,
        ref: { kind: node.kind, keyspace: ks, name: node.label },
      })) as { ddl?: string };
      ddlPreview = desc.ddl ?? '';
      cql = `SELECT * FROM ${ks}.${node.label} LIMIT 100;`;
    }
  }

  async function runCql(nextPage = false) {
    if (!selected) return;
    const statement = nextPage ? lastStatement : cql.trim();
    if (!statement) return;

    const env = selected.environment;
    const readOnly = defaultReadOnly(env, selected.readOnly);
    const unlocked = Date.now() < unlockUntil;
    if (isReadOnlyBlocked(statement, readOnly && !unlocked)) {
      messages = ['Connection is read-only. Unlock writes for production (timed) or change the connection.'];
      return;
    }

    const verdict = classifyCql(statement);
    if ((env === 'production' || verdict.level !== 'safe') && verdict.level !== 'safe' && !nextPage) {
      confirmExpected = verdict.objectName ?? selected.name;
      confirmTyped = '';
      confirmOpen = true;
      pendingRun = () => executeNow(statement, false);
      return;
    }
    await executeNow(statement, nextPage);
  }

  async function executeNow(statement: string, nextPage: boolean) {
    if (!(await connectSelected()) || !rpc || !selected) return;
    running = true;
    messages = [];
    warnings = [];
    bumpIdle();
    try {
      const result = (await rpc.request(nextPage ? 'fetchPage' : 'execute', {
        connectionId: selected.id,
        statement,
        params: [],
        pageToken: nextPage ? pageToken : null,
        options: { pageSize, consistency, tracing },
      })) as {
        columns: string[];
        rows: unknown[][];
        pageToken?: string | null;
        timingMs: number;
        messages?: string[];
        warnings?: string[];
      };
      resultColumns = result.columns;
      resultRows = nextPage ? [...resultRows, ...result.rows] : result.rows;
      pageToken = result.pageToken ?? null;
      lastStatement = statement;
      timingMs = result.timingMs;
      messages = result.messages ?? [];
      warnings = result.warnings ?? [];
      dbState = {
        ...dbState,
        history: [
          {
            id: newId('hist'),
            connectionId: selected.id,
            statement,
            at: Date.now(),
            ok: true,
            timingMs: result.timingMs,
          },
          ...dbState.history,
        ].slice(0, 200),
      };
      await persist();
    } catch (e) {
      messages = [e instanceof Error ? e.message : String(e)];
      dbState = {
        ...dbState,
        history: [
          {
            id: newId('hist'),
            connectionId: selected.id,
            statement,
            at: Date.now(),
            ok: false,
            error: messages[0],
          },
          ...dbState.history,
        ].slice(0, 200),
      };
      await persist();
    } finally {
      running = false;
    }
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

  function cellText(value: unknown): string {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  onMount(() => {
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
    })();
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
      <span
        class="pill"
        class:ready={helperStatus === 'ready'}
        class:missing={helperStatus === 'missing'}
        class:err={helperStatus === 'error' || helperStatus === 'needs_reload'}
      >
        Helper: {helperStatus === 'ready'
          ? 'Ready'
          : helperStatus === 'missing'
            ? 'Not installed'
            : helperStatus === 'connecting'
              ? 'Starting…'
              : helperStatus === 'needs_reload'
                ? 'Reload needed'
                : helperStatus === 'error'
                  ? 'Error'
                  : helperStatus === 'mismatch'
                    ? 'Update needed'
                    : 'Stopped'}
        {#if helperVersion}
          · v{helperVersion}
        {/if}
        {#if helperStatus === 'ready'}
          · {helperOpen} open
        {/if}
      </span>
      <button type="button" class="btn" onclick={() => startHelper()}>Start</button>
      <button type="button" class="btn" onclick={() => stopHelper()}>Stop helper</button>
      <button type="button" class="btn" onclick={() => restartHelper()}>Restart helper</button>
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
          <strong>Start</strong>. You should see Helper: Ready.
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

  <div class="layout">
    <aside class="side">
      <div class="side-tabs" role="tablist">
        <button type="button" class:active={side === 'connections'} onclick={() => (side = 'connections')}>Connections</button>
        <button type="button" class:active={side === 'collections'} onclick={() => (side = 'collections')}>Collections</button>
        <button type="button" class:active={side === 'history'} onclick={() => (side = 'history')}>History</button>
      </div>

      {#if side === 'connections'}
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
                onclick={() => (selectedId = conn.id)}
              >
                <span class="swatch" aria-hidden="true"></span>
                <span class="meta">
                  <span class="name">{conn.name}</span>
                  <span class="env">{conn.environment}{#if conn.group} · {conn.group}{/if}</span>
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
        <p class="muted pad">Query collections with folders. Export never includes passwords.</p>
        {#if dbState.collections.length === 0}
          <button
            type="button"
            class="btn"
            onclick={() => {
              dbState = {
                ...dbState,
                collections: [
                  {
                    id: newId('col'),
                    name: 'My queries',
                    folders: [{ id: newId('fold'), name: 'General', queries: [] }],
                  },
                ],
              };
              void persist();
            }}
          >
            Create collection
          </button>
        {:else}
          <ul class="conn-list">
            {#each dbState.collections as col (col.id)}
              <li class="pad">
                <strong>{col.name}</strong>
                {#each col.folders as folder (folder.id)}
                  <div class="muted">{folder.name}</div>
                  {#each folder.queries as q (q.id)}
                    <button type="button" class="btn text" onclick={() => (cql = q.body)}>{q.name}</button>
                  {/each}
                  <button
                    type="button"
                    class="btn text"
                    onclick={() => {
                      const q = {
                        id: newId('q'),
                        name: 'Saved query',
                        body: cql,
                        description: '',
                        tags: [] as string[],
                        defaultConnectionId: selectedId,
                      };
                      dbState = {
                        ...dbState,
                        collections: dbState.collections.map((c) =>
                          c.id === col.id
                            ? {
                                ...c,
                                folders: c.folders.map((f) =>
                                  f.id === folder.id ? { ...f, queries: [...f.queries, q] } : f,
                                ),
                              }
                            : c,
                        ),
                      };
                      void persist();
                    }}
                  >
                    Save current CQL here
                  </button>
                {/each}
              </li>
            {/each}
          </ul>
        {/if}
      {:else}
        <ul class="hist">
          {#each dbState.history.slice(0, 50) as h (h.id)}
            <li>
              <button type="button" class="btn text" onclick={() => (cql = h.statement)}>
                <span class:fail={!h.ok}>{h.ok ? 'OK' : 'ERR'}</span>
                {h.statement.slice(0, 80)}
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </aside>

    <div class="main">
      {#if selected}
        <div class="conn-bar" class:prod={selected.environment === 'production'} style={`--conn-color:${selected.color}`}>
          <strong>{selected.name}</strong>
          <span class="env-label">{selected.environment}</span>
          {#if defaultReadOnly(selected.environment, selected.readOnly)}
            <span class="ro">Read-only{#if Date.now() < unlockUntil} (unlocked){/if}</span>
            {#if Date.now() >= unlockUntil}
              <button type="button" class="btn" onclick={unlockWrites}>Unlock writes (10 min)</button>
            {/if}
          {/if}
          <button type="button" class="btn" onclick={() => refreshExplorer()}>Refresh explorer</button>
        </div>
      {:else}
        <p class="muted pad">Create a connection to browse keyspaces and run CQL.</p>
      {/if}

      <div class="split">
        <div class="explorer">
          <h3>Explorer</h3>
          <ul>
            {#each explorer as node (node.id)}
              <li>
                <button type="button" class="btn text" onclick={() => openNode(node)}>
                  {node.kind}: {node.label}
                </button>
              </li>
            {/each}
          </ul>
          {#if ddlPreview}
            <pre class="ddl">{ddlPreview}</pre>
          {/if}
        </div>

        <div class="editor-pane">
          <div class="side-tabs" role="tablist" style="margin-bottom:8px">
            <button type="button" class:active={proPanel === 'query'} onclick={() => (proPanel = 'query')}>Query</button>
            <button type="button" class:active={proPanel === 'pro'} onclick={() => (proPanel = 'pro')}>Pro tools</button>
          </div>
          <div class="run-bar">
            {#if selected?.engine === 'cassandra'}
              <label>
                Consistency
                <select bind:value={consistency}>
                  {#each ['ONE', 'LOCAL_ONE', 'QUORUM', 'LOCAL_QUORUM', 'ALL'] as c}
                    <option value={c}>{c}</option>
                  {/each}
                </select>
              </label>
              <label class="check"><input type="checkbox" bind:checked={tracing} /> Tracing</label>
            {/if}
            <label>
              Page size
              <input type="number" min="1" max="5000" bind:value={pageSize} />
            </label>
            <label class="check"><input type="checkbox" bind:checked={txMode} /> Transaction mode</label>
            <button type="button" class="btn primary" disabled={running || !selected} onclick={() => runCql(false)}>
              {running ? 'Running…' : 'Run'}
            </button>
            <button type="button" class="btn" disabled={!pageToken || running} onclick={() => runCql(true)}>
              Load next page
            </button>
            <button
              type="button"
              class="btn"
              disabled={!selected || running}
              onclick={async () => {
                if (!selected || !(await connectSelected()) || !rpc) return;
                try {
                  explainText = JSON.stringify(
                    await rpc.request('explain', { connectionId: selected.id, statement: cql }),
                    null,
                    2,
                  );
                } catch (e) {
                  explainText = e instanceof Error ? e.message : String(e);
                }
              }}
            >
              Explain
            </button>
            {#if txMode}
              <button type="button" class="btn" onclick={async () => { if (selected && (await connectSelected())) await rpc!.request('beginTransaction', { connectionId: selected.id }); }}>Begin</button>
              <button type="button" class="btn" onclick={async () => { if (selected && (await connectSelected())) await rpc!.request('commit', { connectionId: selected.id }); }}>Commit</button>
              <button type="button" class="btn" onclick={async () => { if (selected && (await connectSelected())) await rpc!.request('rollback', { connectionId: selected.id }); }}>Rollback</button>
            {/if}
            <button
              type="button"
              class="btn"
              disabled={!selected}
              onclick={async () => {
                if (!selected || !rpc) return;
                const exported = (await rpc.request('exportData', {
                  format: 'csv',
                  columns: resultColumns,
                  rows: resultRows,
                  table: 'export',
                })) as { text: string };
                const blob = new Blob([exported.text], { type: 'text/csv' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = 'detour-export.csv';
                a.click();
              }}
            >
              Export CSV
            </button>
          </div>
          <div class="cm">
            <CodeEditor id="db-cql" label="CQL editor" language="text" value={cql} onchange={(v) => (cql = v)} />
          </div>
          {#if proPanel === 'pro'}
            <div class="pro">
              <h3>Pro tools</h3>
              <button
                type="button"
                class="btn"
                disabled={!selected}
                onclick={async () => {
                  if (!selected || !(await connectSelected()) || !rpc) return;
                  const tables = explorer.filter((n) => n.kind === 'table').slice(0, 20).map((n) => ({
                    id: n.id,
                    label: n.label,
                    schema: String(n.meta?.schema ?? n.meta?.database ?? 'public'),
                    name: n.label,
                  }));
                  erText = JSON.stringify(await rpc.request('erDiagram', { connectionId: selected.id, tables }), null, 2);
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
                  messages = [JSON.stringify(await rpc.request('applyEdits', { connectionId: selected.id, edits }))];
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
                  }}
                />
              </label>
              <button
                type="button"
                class="btn"
                onclick={async () => {
                  if (!rpc) await startHelper();
                  const folder = dbState.syncFolder;
                  if (!folder) {
                    messages = ['Set a sync folder path first.'];
                    return;
                  }
                  await rpc!.request('syncCollections', {
                    folder,
                    direction: 'push',
                    collections: dbState.collections,
                  });
                  await persist();
                  messages = [`Pushed collections to ${folder}`];
                }}
              >
                Push collections to folder
              </button>
              <button
                type="button"
                class="btn"
                onclick={async () => {
                  if (!rpc) await startHelper();
                  const status = await rpc!.request('bridgeStatus', {});
                  messages = [`Local Bridge: ${JSON.stringify(status)}`];
                }}
              >
                Local Bridge status
              </button>
              {#if erText}<pre class="ddl">{erText}</pre>{/if}
              {#if designerDdl}<pre class="ddl">{designerDdl}</pre>{/if}
              {#if compareText}<pre class="ddl">{compareText}</pre>{/if}
            </div>
          {:else}
            {#if warnings.length}
              <ul class="warn-list">
                {#each warnings as w}
                  <li>{w}</li>
                {/each}
              </ul>
            {/if}
            {#if messages.length}
              <p class="muted">{messages.join(' · ')}{#if timingMs !== undefined} · {timingMs} ms{/if}</p>
            {/if}
            {#if explainText}
              <pre class="ddl">{explainText}</pre>
            {/if}
            <div class="grid-wrap">
              <table class="grid">
                <thead>
                  <tr>
                    {#each resultColumns as col}
                      <th>{col}</th>
                    {/each}
                  </tr>
                </thead>
                <tbody>
                  {#each resultRows.slice(0, 500) as row, i (i)}
                    <tr>
                      {#each row as cell}
                        <td><code>{cellText(cell)}</code></td>
                      {/each}
                    </tr>
                  {/each}
                </tbody>
              </table>
              {#if resultRows.length > 500}
                <p class="muted">Showing first 500 of {resultRows.length} loaded rows.</p>
              {/if}
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>
</section>

{#if formOpen}
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="conn-form-title">
    <div class="modal-card conn-form">
      <h3 id="conn-form-title">Connection</h3>
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

      <div class="form-grid">
        <label>Name <input bind:value={draft.name} /></label>
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
              cql = defaultStatement(engine);
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
        <label>Color <input type="color" bind:value={draft.color} /></label>
        <label>
          Environment
          <select bind:value={draft.environment}>
            <option value="local">Local</option>
            <option value="staging">Staging</option>
            <option value="production">Production</option>
          </select>
        </label>
      </div>

      <fieldset class="section">
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
                  {field.label}
                  <select
                    value={String(draftGet(field.path) ?? '')}
                    onchange={(e) => draftSet(field.path, e.currentTarget.value)}
                  >
                    {#each field.options ?? [] as opt}
                      <option value={opt.value} disabled={opt.disabled}>{opt.label}</option>
                    {/each}
                  </select>
                </label>
              {:else if field.kind === 'path'}
                <label class="path-field">
                  {field.label}
                  <span class="path-row">
                    <input
                      value={String(draftGet(field.path) ?? '')}
                      placeholder={field.placeholder}
                      oninput={(e) => draftSet(field.path, e.currentTarget.value)}
                    />
                    <button
                      type="button"
                      class="btn"
                      onclick={() => browsePath(field.path)}
                    >
                      {browsing ? 'Cancel…' : 'Browse'}
                    </button>
                    <button type="button" class="btn" onclick={() => draftSet(field.path, '')} aria-label="Clear"
                      >Clear</button
                    >
                  </span>
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
              {:else}
                <label>
                  {field.label}
                  <input
                    type="text"
                    value={String(draftGet(field.path) ?? '')}
                    placeholder={field.placeholder}
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
              Secure connect bundle
              <span class="path-row">
                <input bind:value={draft.secureConnectBundlePath} />
                <button
                  type="button"
                  class="btn"
                  onclick={() => browsePath('secureConnectBundlePath')}
                >
                  {browsing ? 'Cancel…' : 'Browse'}
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

      {#each ADVANCED_GROUPS as group}
        {@const groupAllowed =
          (group !== 'ssh' || hasSshCap) && (group !== 'proxy' || hasProxyCap)}
        {@const groupFields = groupAllowed
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
                    {field.label}
                    <span class="path-row">
                      <input
                        value={String(draftGet(field.path) ?? '')}
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
                        onclick={() => browsePath(field.path)}
                      >
                        {browsing ? 'Cancel…' : 'Browse'}
                      </button>
                      <button
                        type="button"
                        class="btn"
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
      <div class="modal-actions">
        <button type="button" class="btn" onclick={testDraft}>Test</button>
        <button type="button" class="btn" onclick={() => void connectDraft()}>Connect</button>
        <span class="spacer"></span>
        <button type="button" class="btn" onclick={() => (formOpen = false)}>Cancel</button>
        <button type="button" class="btn primary" onclick={saveDraft}>Save</button>
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

<style>
  .conn-form {
    max-width: 42rem;
    max-height: 90vh;
    overflow: auto;
  }
  .form-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px 12px;
  }
  .form-grid > label,
  .form-grid > .check,
  .form-grid > .path-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.85rem;
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
    padding: 8px 10px;
  }
  .section.adv {
    margin: 4px 0;
    padding: 4px 8px;
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
  .db {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: 60vh;
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
  .pill {
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 4px 10px;
    font-size: 0.85rem;
  }
  .pill.ready {
    border-color: var(--ok, #3d9a6a);
  }
  .pill.missing,
  .pill.err {
    border-color: var(--danger, #c44);
  }
  .setup {
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 12px 16px;
    background: var(--surface-2, var(--surface));
  }
  .layout {
    display: grid;
    grid-template-columns: minmax(220px, 280px) 1fr;
    gap: 12px;
    min-height: 480px;
  }
  .side {
    border: 1px solid var(--border);
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .side-tabs {
    display: flex;
    border-bottom: 1px solid var(--border);
  }
  .side-tabs button {
    flex: 1;
    background: transparent;
    border: 0;
    padding: 8px;
    color: var(--muted);
    cursor: pointer;
  }
  .side-tabs button.active {
    color: var(--fg);
    box-shadow: inset 0 -2px 0 var(--accent);
  }
  .side-tools {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px;
  }
  .conn-list {
    list-style: none;
    margin: 0;
    padding: 0;
    overflow: auto;
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
  }
  .conn-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    padding: 8px 12px;
    border-bottom: 1px solid var(--border);
    border-left: 4px solid var(--conn-color);
  }
  .conn-bar.prod {
    background: color-mix(in srgb, var(--danger, #c44) 12%, transparent);
  }
  .split {
    display: grid;
    grid-template-columns: minmax(160px, 220px) 1fr;
    min-height: 0;
    flex: 1;
  }
  .explorer {
    border-right: 1px solid var(--border);
    padding: 8px;
    overflow: auto;
  }
  .explorer ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .ddl {
    font-size: 0.75rem;
    white-space: pre-wrap;
    background: var(--surface-2, rgba(127, 127, 127, 0.08));
    padding: 8px;
    border-radius: 6px;
  }
  .editor-pane {
    display: flex;
    flex-direction: column;
    min-width: 0;
    padding: 8px;
    gap: 8px;
  }
  .run-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: end;
  }
  .run-bar label {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 0.8rem;
  }
  .cm {
    min-height: 140px;
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
  }
  .grid-wrap {
    overflow: auto;
    max-height: 320px;
    border: 1px solid var(--border);
    border-radius: 6px;
  }
  .grid {
    border-collapse: collapse;
    width: 100%;
    font-size: 0.8rem;
  }
  .grid th,
  .grid td {
    border-bottom: 1px solid var(--border);
    padding: 4px 8px;
    text-align: left;
    vertical-align: top;
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
  /* Above connection form modal so Update key passphrase is reachable while editing. */
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
  .warn {
    color: var(--danger, #e07070);
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
  .warn-list {
    color: var(--danger, #e07070);
    margin: 0;
    padding-left: 1.2rem;
  }
  .pad {
    padding: 8px;
  }
  .hist {
    list-style: none;
    margin: 0;
    padding: 8px;
    overflow: auto;
  }
  .fail {
    color: var(--danger, #e07070);
  }
  .check {
    flex-direction: row !important;
    align-items: center;
    gap: 8px !important;
  }
  @media (max-width: 900px) {
    .layout,
    .split {
      grid-template-columns: 1fr;
    }
  }
</style>
