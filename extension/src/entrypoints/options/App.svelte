<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { browser } from 'wxt/browser';
  import { APPLY_REPORT_KEY, type ApplyReport } from '../../engine-core/apply';
  import { supportsTopDomains, type DnrApi } from '../../engine-core/dnr';
  import { loadFailures, PAGE_FAILURES_KEY, type PageFailure } from '../../page-inject/failures';
  import { RESYNC_MESSAGE } from '../../page-inject/sync';
  import type { Workspace } from '../../rule-model/schema';
  import {
    AUTOSAVE_KEY,
    ENABLED_KEY,
    loadAutosave,
    loadEnabled,
    loadWorkspace,
    saveAutosave,
    saveEnabled,
    saveWorkspace,
    WORKSPACE_KEY,
  } from '../../rule-model/storage';
  import { serializeExport } from '../../rule-model/transfer';
  import { announce, live } from '../../ui/announcer.svelte';
  import { brandName, markUrl } from '../../ui/brand';
  import BrandLockup from '../../ui/BrandLockup.svelte';
  import Drawer from '../../ui/Drawer.svelte';
  import Icon from '../../ui/icons/Icon.svelte';
  import Switch from '../../ui/Switch.svelte';
  import ThemeToggle from '../../ui/ThemeToggle.svelte';
  import Toast from '../../ui/Toast.svelte';
  import { BODY_CONSENT_KEY, bodyPermissions, workspaceHasBodyRules, workspaceHasServeLocal } from '../../engine-deep/permissions';
  import {
    ACTION_INFO,
    addGroup,
    addRule,
    autosaveDecision,
    exportFileName,
    filterRules,
    formatRelativeTime,
    isAwaitingApply,
    isDirty,
    newGroup,
    newRule,
    statusCounts,
    tabFromHash,
    validateWorkspace,
    type ActionFilter,
    type OptionsTab,
    type StatusFilter,
  } from '../../workspace-ui/editor';
  import { BRIDGE_SESSION_KEY, loadBridgeSession } from '../../local-bridge/session';
  import { loadMatches, MATCH_LOG_KEY } from '../../observability/log';
  import BridgePanel from './BridgePanel.svelte';
  import GroupCard from './GroupCard.svelte';
  import MatchLog from './MatchLog.svelte';
  import RecipePicker from './RecipePicker.svelte';
  import ApiTester from './ApiTester.svelte';
  import Databases from './Databases.svelte';
  import ImportPanel from '../popup/ImportPanel.svelte';

  const area = browser.storage.local;
  const topDomainsSupported = supportsTopDomains(browser.declarativeNetRequest as unknown as DnrApi);
  const AUTOSAVE_MS = 1000;
  const version = browser.runtime.getManifest().version;

  let saved: Workspace | undefined = $state.raw();
  let draft: Workspace = $state.raw({ groups: [] });
  let loadErrors: string[] = $state.raw([]);
  let report: ApplyReport | undefined = $state.raw();
  let enabled = $state(true);
  let autosave = $state(true);
  let savedAt: number | undefined = $state();
  let lastAutosavedAt: number | undefined = $state();
  let saveErrors: string[] = $state.raw([]);
  let showAll = $state(false);
  let saving = $state(false);
  let changedElsewhere = $state(false);
  let failures: PageFailure[] = $state.raw([]);
  let userScriptsReady = $state(true);
  let bodyPermission = $state(true);
  let bodyRewriteAllowed = $state(false);
  let testerFocused = $state(false);
  let toastMessage = $state('');
  let toastOpen = $state(false);
  let toastCanUndo = $state(false);
  let undoSnapshot: Workspace | undefined = $state.raw();
  let tab = $state<OptionsTab>(tabFromHash(typeof location !== 'undefined' ? location.hash : ''));
  let filterQuery = $state('');
  let actionFilter = $state<ActionFilter>('all');
  let statusFilter = $state<StatusFilter>('all');
  let savePopover = $state(false);
  let bridgeDrawer = $state(false);
  let importDrawer = $state(false);
  /** Only one rule drawer open at a time across all groups. */
  let activeRuleId = $state<string | null>(null);
  let bridgeConnected = $state(false);
  let dismissed = $state<Record<string, boolean>>({});
  let matchLogCount = $state(0);
  let headerEl: HTMLElement | undefined = $state();

  const validation = $derived(validateWorkspace(draft));
  const dirty = $derived(saved !== undefined && isDirty(draft, saved));
  const awaitingApply = $derived(isAwaitingApply(report, savedAt));
  const statusContext = $derived({ report, saved: saved ?? { groups: [] }, awaitingApply, failures, userScriptsReady });
  const counts = $derived(statusCounts(draft, statusContext));
  const visibleByGroup = $derived(filterRules(draft, filterQuery, actionFilter, statusFilter, statusContext));
  const filterActive = $derived(filterQuery.trim() !== '' || actionFilter !== 'all' || statusFilter !== 'all');
  const needsUserScripts = $derived(
    (saved?.groups ?? []).some((g) => g.enabled && g.rules.some((r) => r.enabled && r.action.type === 'injectJs' && r.action.source.kind === 'inline')),
  );
  const isFirefox = import.meta.env.FIREFOX;
  const bodyPermissionNames = bodyPermissions(isFirefox ? 'firefox' : 'chrome');
  const needsBodyPermission = $derived(workspaceHasBodyRules(saved ?? { groups: [] }) && !bodyPermission);
  const needsInPlaceConsent = $derived(workspaceHasServeLocal(saved ?? { groups: [] }) && !bodyRewriteAllowed && bodyPermission);
  const lastScan = $derived.by(() => {
    if (!report?.appliedAt) return 'No scans yet';
    const t = Date.parse(report.appliedAt);
    if (Number.isNaN(t)) return 'No scans yet';
    return new Date(t).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  });
  const saveStateText = $derived.by(() => {
    if (dirty && autosave && validation.errorCount > 0) return `Not saved: ${validation.errorCount} field${validation.errorCount === 1 ? '' : 's'} need fixing`;
    if (dirty) return 'Unsaved changes';
    if (awaitingApply) return 'Applying';
    if (autosave && lastAutosavedAt !== undefined) return `Autosave · ${formatRelativeTime(lastAutosavedAt)}`;
    if (saved) return 'Autosave';
    return '';
  });
  const saveStateDot = $derived(
    dirty && validation.errorCount > 0 ? 'err' : dirty ? 'warn' : awaitingApply ? 'pending' : 'ok',
  );

  async function checkBodyPermission() {
    const stored = await area.get(BODY_CONSENT_KEY);
    const consented = stored[BODY_CONSENT_KEY] === true;
    const granted = await browser.permissions.contains({ permissions: bodyPermissionNames as never }).catch(() => false);
    bodyRewriteAllowed = consented && granted;
    if (!workspaceHasBodyRules(saved ?? { groups: [] })) {
      bodyPermission = true;
      return true;
    }
    bodyPermission = bodyRewriteAllowed;
    return bodyPermission;
  }

  async function allowBodyOverride() {
    // Firefox's webRequest permission is optional, so the click must request it first.
    // Chrome's debugger permission is install-time; this click is the attach consent.
    if (isFirefox) {
      const granted = await browser.permissions.request({ permissions: bodyPermissionNames as never }).catch(() => false);
      if (!granted) return announce('WebRequest permission was not allowed.');
    }
    await area.set({ [BODY_CONSENT_KEY]: true });
    bodyPermission = true;
    bodyRewriteAllowed = true;
    await browser.runtime.sendMessage({ type: RESYNC_MESSAGE }).catch(() => {});
    announce('Body overrides allowed. Applying rules…');
  }

  /** Chrome exposes the API before the toggle is on, but calls throw until it is. */
  async function checkUserScripts() {
    let ready = false;
    try {
      await (browser as unknown as { userScripts: { getScripts(): Promise<unknown> } }).userScripts.getScripts();
      ready = true;
    } catch {
      ready = false;
    }
    if (ready && !userScriptsReady) await browser.runtime.sendMessage({ type: RESYNC_MESSAGE }).catch(() => {});
    userScriptsReady = ready;
    return ready;
  }

  async function allowUserScripts() {
    if (isFirefox) {
      // Must run straight from the click: permissions.request needs the user gesture.
      const granted = await browser.permissions.request({ permissions: ['userScripts' as never] }).catch(() => false);
      if (!granted) return announce('User scripts were not allowed.');
    } else {
      await browser.tabs.create({ url: `chrome://extensions/?id=${browser.runtime.id}` });
      return;
    }
    announce((await checkUserScripts()) ? 'User scripts allowed. Applying rules…' : 'User scripts are still off.');
  }

  async function loadPageFailures() {
    failures = await loadFailures(browser.storage.session);
  }
  const edit = (fn: (ws: Workspace) => Workspace) => {
    draft = fn(draft);
  };

  async function loadSaved() {
    const loaded = await loadWorkspace(area);
    if (loaded.ok) {
      saved = loaded.value;
      draft = loaded.value;
      loadErrors = [];
    } else {
      loadErrors = loaded.errors;
    }
    changedElsewhere = false;
    await checkBodyPermission();
  }

  async function loadReport() {
    report = (await area.get(APPLY_REPORT_KEY))[APPLY_REPORT_KEY] as ApplyReport | undefined;
  }

  function showToast(message: string, canUndo: boolean) {
    toastMessage = message;
    toastCanUndo = canUndo;
    toastOpen = true;
  }

  function dismissToast() {
    toastOpen = false;
    toastCanUndo = false;
  }

  async function persist({ manual }: { manual: boolean }) {
    if (validation.errorCount > 0) {
      if (manual) {
        showAll = true;
        announce(`Can't save yet: ${validation.errorCount} field${validation.errorCount === 1 ? '' : 's'} need fixing.`);
        // Second tick: RuleEditor may switch Match → Action before the invalid field mounts.
        await tick();
        await tick();
        (document.querySelector('[aria-invalid="true"]') as HTMLElement | null)?.focus();
      }
      return;
    }
    if (!manual && changedElsewhere) return;
    if (saving) return;

    saving = true;
    const previous = saved;
    // Taken before writing: the background may apply and report before the write promise resolves.
    const startedAt = Date.now();
    try {
      const result = await saveWorkspace(area, draft);
      if (!result.ok) {
        saveErrors = result.errors;
        return;
      }
      saveErrors = [];
      showAll = false;
      savedAt = startedAt;
      saved = result.value;
      draft = result.value;
      changedElsewhere = false;
      // Re-check after save so the Allow debugger banner appears when the first body rule lands.
      await checkBodyPermission();
      announce('Saved. Applying rules…');
      if (!manual) {
        lastAutosavedAt = startedAt;
        if (previous) undoSnapshot = previous;
        showToast('Saved. Applying rules…', Boolean(previous));
      }
    } finally {
      saving = false;
    }
  }

  function save() {
    void persist({ manual: true });
  }

  async function undoAutosave() {
    if (!undoSnapshot) return;
    const previous = undoSnapshot;
    undoSnapshot = undefined;
    dismissToast();
    saving = true;
    const startedAt = Date.now();
    try {
      const result = await saveWorkspace(area, previous);
      if (!result.ok) {
        saveErrors = result.errors;
        return;
      }
      saveErrors = [];
      showAll = false;
      savedAt = startedAt;
      saved = result.value;
      draft = result.value;
      changedElsewhere = false;
      lastAutosavedAt = startedAt;
      await checkBodyPermission();
      announce('Undone. Applying rules…');
      showToast('Undone. Applying rules…', false);
    } finally {
      saving = false;
    }
  }

  function discard() {
    if (!saved) return;
    draft = saved;
    showAll = false;
    announce('Changes discarded.');
  }

  async function setAutosave(next: boolean) {
    autosave = next;
    await saveAutosave(area, next);
  }

  function flushPendingAutosave() {
    const decision = autosaveDecision({
      dirty,
      errorCount: validation.errorCount,
      changedElsewhere,
      saving,
      autosave,
    });
    if (decision === 'save') void persist({ manual: false });
  }

  function shouldPromptUnload(): boolean {
    if (!dirty) return false;
    if (!autosave) return true;
    return validation.errorCount > 0 || changedElsewhere;
  }

  function exportSaved() {
    if (!saved) return;
    const url = URL.createObjectURL(new Blob([serializeExport(saved)], { type: 'application/json' }));
    const link = Object.assign(document.createElement('a'), { href: url, download: exportFileName(new Date()) });
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function addNewGroup() {
    const group = newGroup(() => crypto.randomUUID());
    edit((ws) => addGroup(ws, group));
    setTab('rules');
    await tick();
    const input = document.getElementById(`group-${group.id}-name`) as HTMLInputElement | null;
    input?.focus();
    input?.select();
  }

  async function addNewRule() {
    let groupId = draft.groups[0]?.id;
    if (!groupId) {
      const group = newGroup(() => crypto.randomUUID());
      edit((ws) => addGroup(ws, group));
      groupId = group.id;
      await tick();
    }
    // Prefer the group's Add rule so its openSignal opens the drawer.
    const btn = document.getElementById(`group-${groupId}-add-rule`) as HTMLButtonElement | null;
    if (btn) {
      setTab('rules');
      btn.click();
      return;
    }
    const rule = newRule(() => crypto.randomUUID());
    edit((ws) => addRule(ws, groupId!, rule));
    activeRuleId = rule.id;
    setTab('rules');
    await tick();
    (document.querySelector(`[data-rule-id="${rule.id}"] [data-testid=rule-row]`) as HTMLElement | null)?.click();
  }

  $effect(() => {
    if (!activeRuleId) return;
    const exists = draft.groups.some((g) => g.rules.some((r) => r.id === activeRuleId));
    if (!exists) activeRuleId = null;
  });

  function setTab(next: OptionsTab) {
    tab = next;
    const hash = next === 'rules' ? '' : `#${next}`;
    if (location.hash !== hash) history.replaceState(null, '', `${location.pathname}${location.search}${hash}`);
    if (next === 'tester') {
      testerFocused = false;
      void tick().then(() => document.getElementById('tester-url')?.focus());
    }
  }

  function dismissBanner(key: string) {
    dismissed = { ...dismissed, [key]: true };
  }

  function clickStatus(kind: StatusFilter) {
    statusFilter = statusFilter === kind ? 'all' : kind;
    setTab('rules');
  }

  async function refreshBridge() {
    bridgeConnected = (await loadBridgeSession(area)) !== null;
  }

  async function refreshMatchCount() {
    matchLogCount = (await loadMatches(browser.storage.session)).length;
  }

  $effect(() => {
    if (testerFocused || tab !== 'tester') return;
    const input = document.getElementById('tester-url');
    if (!input) return;
    testerFocused = true;
    input.focus();
  });

  $effect(() => {
    if (!awaitingApply && savedAt !== undefined && report) {
      const refused = report.refused.length;
      const applied =
        refused > 0 ? `Rules applied, ${refused} refused` : 'Rules applied';
      announce(refused > 0 ? `Rules applied. ${refused} refused; see the rules marked Refused.` : 'Rules applied.');
      if (toastOpen) showToast(applied, toastCanUndo);
      savedAt = undefined;
    }
  });

  $effect(() => {
    draft;
    const decision = autosaveDecision({
      dirty,
      errorCount: validation.errorCount,
      changedElsewhere,
      saving,
      autosave,
    });
    if (decision !== 'save') return;
    const timer = setTimeout(() => void persist({ manual: false }), AUTOSAVE_MS);
    return () => clearTimeout(timer);
  });

  $effect(() => {
    const el = headerEl;
    if (!el) return;
    const sync = () => {
      document.documentElement.style.setProperty('--options-sticky-offset', `${el.offsetHeight}px`);
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty('--options-sticky-offset');
    };
  });

  onMount(() => {
    tab = tabFromHash(location.hash);
    void loadSaved();
    void loadReport();
    void loadEnabled(area).then((value) => (enabled = value));
    void loadAutosave(area).then((value) => (autosave = value));
    void loadPageFailures();
    void checkUserScripts();
    void checkBodyPermission();
    void refreshBridge();
    void refreshMatchCount();

    const onChanged = (changes: Record<string, unknown>, areaName: string) => {
      if (areaName === 'session') {
        if (PAGE_FAILURES_KEY in changes) void loadPageFailures();
        if (MATCH_LOG_KEY in changes) void refreshMatchCount();
      }
      if (areaName !== 'local') return;
      if (APPLY_REPORT_KEY in changes) void loadReport();
      if (ENABLED_KEY in changes) void loadEnabled(area).then((value) => (enabled = value));
      if (AUTOSAVE_KEY in changes) void loadAutosave(area).then((value) => (autosave = value));
      if (BRIDGE_SESSION_KEY in changes) void refreshBridge();
      if (WORKSPACE_KEY in changes) {
        void loadWorkspace(area).then((loaded) => {
          if (loaded.ok && saved && !isDirty(loaded.value, saved)) return;
          if (dirty) changedElsewhere = true;
          else void loadSaved();
        });
      }
    };
    browser.storage.onChanged.addListener(onChanged);

    const beforeUnload = (event: BeforeUnloadEvent) => {
      flushPendingAutosave();
      if (shouldPromptUnload()) event.preventDefault();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flushPendingAutosave();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void persist({ manual: true });
      }
    };
    const onHash = () => {
      tab = tabFromHash(location.hash);
      testerFocused = false;
    };
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('hashchange', onHash);
    // Back from chrome://extensions after flipping the toggle.
    const onFocus = () => {
      void checkUserScripts();
      void checkBodyPermission();
    };
    window.addEventListener('focus', onFocus);

    return () => {
      browser.storage.onChanged.removeListener(onChanged);
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('focus', onFocus);
    };
  });
</script>
<header class="bar" bind:this={headerEl}>
  <div class="brand">
    <h1><BrandLockup size={22} /></h1>
    <span class="pill version">v{version}</span>
  </div>
  <div class="actions">
    <div class="save-wrap">
      <button
        type="button"
        class="save-state"
        data-testid="save-state"
        aria-expanded={savePopover}
        onclick={() => (savePopover = !savePopover)}
      >
        <span class="dot {saveStateDot}" aria-hidden="true"></span>
        {saveStateText}
      </button>
      <div class="save-pop" class:open={savePopover} role="dialog" aria-label="Autosave settings">
        <p class="muted save-pop-hint">Autosave writes valid drafts after a short idle.</p>
      </div>
      <Switch id="autosave" checked={autosave} label="Autosave" onchange={setAutosave} />
    </div>
    <button type="button" class="btn text" onclick={exportSaved} disabled={!saved || saved.groups.length === 0}>Export</button>
    <button type="button" class="btn text" onclick={discard} disabled={!dirty}>Discard</button>
    <button type="button" class="btn primary" data-testid="save-now" onclick={save} disabled={!dirty || saving} aria-busy={saving} title="Ctrl/Cmd+S">
      {saving ? 'Saving…' : 'Save now'}
    </button>
    <ThemeToggle {area} />
    <div class="enabled">
      <span class="muted">{brandName}</span>
      <Switch id="detour-enabled" checked={enabled} label="{brandName} on" onchange={(next) => saveEnabled(area, next)} />
    </div>
  </div>
</header>

<div class="visually-hidden" aria-live="polite">{live.message}</div>
{#if toastOpen}
  <Toast message={toastMessage} ondismiss={dismissToast} onundo={toastCanUndo ? undoAutosave : undefined} />
{/if}

{#if !enabled && !dismissed.off}
  <div class="banner" role="status">
    <Icon name="shield" />
    <p><strong>{brandName} is off</strong> — edits still save; nothing is applied.</p>
    <button type="button" class="btn" onclick={() => saveEnabled(area, true)}>Turn on</button>
    <button type="button" class="btn icon" aria-label="Dismiss" onclick={() => dismissBanner('off')}><Icon name="x" /></button>
  </div>
{/if}

{#if needsBodyPermission && !dismissed.body}
  <div class="banner warning" role="status" data-testid="body-permission-banner">
    <Icon name="shield" />
    <p title={isFirefox ? 'Firefox needs permission to rewrite responses.' : `Allow debugger before ${brandName} attaches. Chrome shows a debugging banner; DevTools on that tab disconnects.`}>
      <strong>Response body rules are paused.</strong>
      {isFirefox ? ' Grant response rewriting.' : ' Allow debugger to attach.'}
    </p>
    <button type="button" class="btn" id="allow-body" onclick={allowBodyOverride}>{isFirefox ? 'Grant' : 'Allow debugger'}</button>
    <button type="button" class="btn icon" aria-label="Dismiss" onclick={() => dismissBanner('body')}><Icon name="x" /></button>
  </div>
{:else if needsInPlaceConsent && !dismissed.inplace}
  <div class="banner warning" role="status" data-testid="bridge-inplace-banner">
    <Icon name="bridge" />
    <p title="Allow rewriting to keep the original URL and update matching integrity hashes.">
      <strong>Local files redirect to 127.0.0.1.</strong> Allow rewriting to serve in place.
    </p>
    <button type="button" class="btn" id="allow-body" onclick={allowBodyOverride}>{isFirefox ? 'Allow rewriting' : 'Allow debugger'}</button>
    <button type="button" class="btn icon" aria-label="Dismiss" onclick={() => dismissBanner('inplace')}><Icon name="x" /></button>
  </div>
{/if}

{#if needsUserScripts && !userScriptsReady && !dismissed.userscripts}
  <div class="banner warning" role="status" data-testid="user-scripts-banner">
    <Icon name="shield" />
    <p title="Chrome needs Allow User Scripts in extension details (138+) or Developer mode on older versions.">
      <strong>Inline JavaScript rules are paused.</strong>
      {isFirefox ? ' Grant user scripts.' : ' Turn on Allow User Scripts.'}
    </p>
    {#if isFirefox}
      <button type="button" class="btn" onclick={allowUserScripts}>Grant</button>
    {:else}
      <button type="button" class="btn" onclick={allowUserScripts}>Open {brandName}’s settings</button>
      <button type="button" class="btn text" onclick={async () => announce((await checkUserScripts()) ? 'User scripts allowed. Applying rules…' : 'User scripts are still off.')}>Check again</button>
    {/if}
    <button type="button" class="btn icon" aria-label="Dismiss" onclick={() => dismissBanner('userscripts')}><Icon name="x" /></button>
  </div>
{/if}

{#if changedElsewhere && !dismissed.elsewhere}
  <div class="banner warning" role="alert">
    <Icon name="shield" />
    <p><strong>Rules changed elsewhere.</strong> Saving now would overwrite that change.</p>
    <button type="button" class="btn" onclick={loadSaved}>Load latest</button>
    <button type="button" class="btn icon" aria-label="Dismiss" onclick={() => dismissBanner('elsewhere')}><Icon name="x" /></button>
  </div>
{/if}

{#if loadErrors.length > 0}
  <div class="banner error" role="alert">
    <Icon name="shield" />
    <div>
      <p><strong>Error:</strong> saved rules can't be read.</p>
      <ul>{#each loadErrors as error, i (i)}<li><code>{error}</code></li>{/each}</ul>
    </div>
  </div>
{:else if saveErrors.length > 0}
  <div class="banner error" role="alert">
    <Icon name="shield" />
    <div>
      <p><strong>Error:</strong> saving failed.</p>
      <ul>{#each saveErrors as error, i (i)}<li><code>{error}</code></li>{/each}</ul>
    </div>
  </div>
{/if}

{#if saved}
  <div class="strip" role="status">
    <button type="button" class="count" class:active={statusFilter === 'applied'} onclick={() => clickStatus('applied')}>
      <span class="dot ok"></span> {counts.applied} Applied
    </button>
    <button type="button" class="count" class:active={statusFilter === 'refused'} onclick={() => clickStatus('refused')}>
      <span class="dot bad"></span> {counts.refused} Refused
    </button>
    <button type="button" class="count" class:active={statusFilter === 'unsaved'} onclick={() => clickStatus('unsaved')}>
      <span class="dot warn"></span> {counts.unsaved} Unsaved
    </button>
    <button type="button" class="count" class:active={statusFilter === 'off'} onclick={() => clickStatus('off')}>
      <span class="dot muted"></span> {counts.off} Off
    </button>
    <span class="spacer"></span>
    <button type="button" class="bridge-btn" onclick={() => (bridgeDrawer = true)}>
      <Icon name="bridge" size={14} />
      {bridgeConnected ? 'Bridge connected' : 'Bridge not connected'}
    </button>
    <span class="muted scan">Last scan {lastScan}</span>
  </div>

  <nav class="tabs" aria-label="Workspace">
    <button type="button" class:active={tab === 'rules'} onclick={() => setTab('rules')}>Rules</button>
    <button type="button" class:active={tab === 'tester'} onclick={() => setTab('tester')}>API Tester</button>
    <button type="button" class:active={tab === 'databases'} onclick={() => setTab('databases')}>Databases</button>
    <button type="button" class:active={tab === 'recipes'} onclick={() => setTab('recipes')}>Recipes</button>
    <button type="button" class:active={tab === 'log'} onclick={() => setTab('log')}>Log{#if matchLogCount > 0} <span class="pill">{matchLogCount}</span>{/if}</button>
  </nav>

  <main class="panel" class:drawer-open={false}>
    {#if tab === 'rules'}
      <div class="toolbar">
        <label class="filter">
          <Icon name="search" size={14} />
          <input type="search" placeholder="Filter rules by pattern, group, or action…" bind:value={filterQuery} />
        </label>
        <select aria-label="Action filter" bind:value={actionFilter}>
          <option value="all">Action: All</option>
          {#each ACTION_INFO as info (info.type)}
            <option value={info.type}>{info.label}</option>
          {/each}
        </select>
        <button type="button" class="btn" id="add-group" onclick={addNewGroup}>New Group</button>
        <button type="button" class="btn accent-tint" onclick={addNewRule}><Icon name="plus" size={14} /> New Rule</button>
      </div>

      {#if draft.groups.length === 0}
        <div class="empty" data-testid="empty-state">
          <img class="empty-logo" src={markUrl} width="40" height="40" alt="" />
          <h2 class="empty-title">Point your first URL at your code</h2>
          <p class="muted">Override a production request with a local file, mock, or redirect — without a proxy.</p>
          <div class="empty-actions">
            <button type="button" class="btn primary" onclick={addNewGroup}>Add your first group</button>
            <button type="button" class="btn" onclick={() => setTab('recipes')}>Start from a recipe</button>
          </div>
          <div class="preview-row muted mono">Redirect · example.com/api/* → localhost:3000 — Your first rule will look like this</div>
          <p class="muted">
            Import existing rules from a legacy or {brandName} export:
            <button type="button" class="btn text" onclick={() => (importDrawer = true)}>Import rules</button>
          </p>
        </div>
      {:else}
        {#each draft.groups as group, i (group.id)}
          <GroupCard
            {group}
            index={i}
            count={draft.groups.length}
            errors={validation.groups[group.id] ?? {}}
            {validation}
            {statusContext}
            {showAll}
            {topDomainsSupported}
            {bodyRewriteAllowed}
            {saved}
            visibleRuleIds={visibleByGroup.get(group.id) ?? []}
            {filterActive}
            {activeRuleId}
            onOpenRule={(id) => (activeRuleId = id)}
            onCloseRule={() => (activeRuleId = null)}
            {edit}
          />
        {/each}
        <p class="muted hint">+ Click New Rule or New Group to add</p>
      {/if}
    {:else if tab === 'tester'}
      <div class="card">
        <ApiTester
          workspace={draft}
          {enabled}
          {dirty}
          userScripts={userScriptsReady}
          onWorkspaceChange={(next, focus) => {
            draft = next;
            activeRuleId = focus.ruleId;
            announce('Rule added from API Tester. Save to apply.');
            setTab('rules');
            void tick().then(() => {
              document.querySelector(`[data-rule-id="${focus.ruleId}"]`)?.scrollIntoView({ block: 'nearest' });
            });
          }}
        />
      </div>
    {:else if tab === 'databases'}
      <div class="card"><Databases /></div>
    {:else if tab === 'recipes'}
      <div class="card">
        <RecipePicker
          workspace={draft}
          onadd={(next, groupId) => {
            draft = next;
            announce('Added to your rules. Save to apply it.');
            setTab('rules');
            void tick().then(() => {
              const input = document.getElementById(`group-${groupId}-name`) as HTMLInputElement | null;
              input?.focus();
              input?.select();
            });
          }}
        />
      </div>
    {:else}
      <div class="card"><MatchLog area={browser.storage.session} /></div>
    {/if}
  </main>
{/if}

<Drawer open={bridgeDrawer} title="Local Bridge" docked={false} onclose={() => (bridgeDrawer = false)}>
  <BridgePanel {area} />
  {#snippet footer()}
    <span class="spacer"></span>
    <button type="button" class="btn primary" data-testid="drawer-done" onclick={() => (bridgeDrawer = false)}>Done</button>
  {/snippet}
</Drawer>

<Drawer open={importDrawer} title="Import rules" docked={false} onclose={() => (importDrawer = false)}>
  <ImportPanel {area} inTab={true} />
  {#snippet footer()}
    <span class="spacer"></span>
    <button type="button" class="btn primary" data-testid="drawer-done" onclick={() => (importDrawer = false)}>Done</button>
  {/snippet}
</Drawer>

<style>
  .bar {
    position: sticky;
    top: 0;
    z-index: 50;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    padding: var(--space-3) var(--space-4);
    padding-inline-end: var(--space-5);
    border-bottom: 1px solid var(--border);
    background: color-mix(in srgb, var(--bg) 92%, transparent);
    backdrop-filter: blur(8px);
    box-sizing: border-box;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  h1 {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 700;
  }

  .version {
    font-family: var(--mono);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-2);
  }

  .save-wrap {
    position: relative;
  }

  .save-state {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-2);
    border: 1px solid transparent;
    border-radius: var(--radius);
    background: transparent;
    color: var(--text-muted);
    font: inherit;
    font-size: 0.85rem;
    cursor: pointer;
  }

  .save-state:hover {
    border-color: var(--border);
    background: var(--surface);
  }

  .save-state .dot,
  .count .dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    background: var(--text-muted);
  }

  .dot.ok { background: var(--status-applied); }
  .dot.warn { background: var(--status-unsaved); }
  .dot.err { background: var(--status-refused); }
  .dot.bad { background: var(--status-refused); }
  .dot.pending { background: var(--status-unsaved); }
  .dot.muted { background: var(--status-off); }

  .save-pop {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    z-index: 20;
    display: none;
    padding: var(--space-3);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: var(--shadow-2);
  }

  .save-pop.open {
    display: block;
  }

  .enabled {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding-left: var(--space-2);
    padding-right: var(--space-1);
    border-left: 1px solid var(--border);
    flex-shrink: 0;
  }

  .actions :global(.switch-wrap) {
    flex-shrink: 0;
  }

  .banner {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    margin: var(--space-2) var(--space-4) 0;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    font-size: 0.85rem;
  }

  .banner p { flex: 1; min-width: 12rem; }
  .banner.warning { border-color: color-mix(in srgb, var(--warning) 50%, var(--border)); }
  .banner.error { border-color: var(--danger); }
  .banner ul { width: 100%; margin: 0; padding-left: var(--space-4); }

  .strip {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    margin: var(--space-3) var(--space-4) 0;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    font-size: 0.8rem;
  }

  .count {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-2);
    border: 1px solid transparent;
    border-radius: var(--radius-pill);
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }

  .count.active { background: var(--surface-2); border-color: var(--border); }
  .spacer { flex: 1; }
  .bridge-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    border: 0;
    background: transparent;
    color: var(--text-muted);
    font: inherit;
    cursor: pointer;
  }
  .scan { font-family: var(--mono); font-size: 0.75rem; }

  .tabs {
    display: flex;
    gap: var(--space-1);
    margin: var(--space-3) var(--space-4) 0;
    border-bottom: 1px solid var(--border);
  }

  .tabs button {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-2) var(--space-3);
    border: 0;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    background: transparent;
    color: var(--text-muted);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }

  .tabs button.active {
    color: var(--text);
    border-bottom-color: var(--accent);
  }

  .panel {
    display: grid;
    gap: var(--space-3);
    max-width: 72rem;
    margin: 0 auto;
    padding: var(--space-4);
  }

  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }

  .filter {
    display: flex;
    flex: 1 1 16rem;
    align-items: center;
    gap: var(--space-2);
    min-width: 12rem;
    padding: 0 var(--space-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--text-muted);
  }

  .filter input {
    border: 0;
    background: transparent;
    min-height: 2.1rem;
  }

  .toolbar select {
    width: auto;
    min-width: 10rem;
  }

  .card {
    padding: var(--space-4);
    border: 1px solid var(--border);
    border-radius: calc(var(--radius) * 1.5);
    background: var(--surface);
  }

  .empty {
    display: grid;
    justify-items: center;
    gap: var(--space-3);
    padding: var(--space-5) var(--space-4);
    border: 1px dashed var(--border);
    border-radius: calc(var(--radius) * 1.5);
    background: var(--surface);
    text-align: center;
  }

  .empty-logo { display: block; }
  .empty-title {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 700;
    text-transform: none;
    letter-spacing: normal;
    color: var(--text);
  }

  .empty-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); justify-content: center; }

  .preview-row {
    width: min(100%, 36rem);
    padding: var(--space-3);
    border: 1px dashed var(--border);
    border-radius: var(--radius);
    text-align: left;
  }

  .hint { margin: 0; }
</style>
