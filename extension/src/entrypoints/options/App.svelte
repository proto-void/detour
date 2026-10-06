<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { browser } from 'wxt/browser';
  import { APPLY_REPORT_KEY, type ApplyReport } from '../../engine-core/apply';
  import { supportsTopDomains, type DnrApi } from '../../engine-core/dnr';
  import type { Workspace } from '../../rule-model/schema';
  import { ENABLED_KEY, loadEnabled, loadWorkspace, saveEnabled, saveWorkspace, WORKSPACE_KEY } from '../../rule-model/storage';
  import { serializeExport } from '../../rule-model/transfer';
  import { announce, live } from '../../ui/announcer.svelte';
  import { addGroup, exportFileName, isAwaitingApply, isDirty, newGroup, validateWorkspace } from '../../workspace-ui/editor';
  import GroupCard from './GroupCard.svelte';

  const area = browser.storage.local;
  const topDomainsSupported = supportsTopDomains(browser.declarativeNetRequest as unknown as DnrApi);

  let saved: Workspace | undefined = $state.raw();
  let draft: Workspace = $state.raw({ groups: [] });
  let loadErrors: string[] = $state.raw([]);
  let report: ApplyReport | undefined = $state.raw();
  let enabled = $state(true);
  let savedAt: number | undefined = $state();
  let saveErrors: string[] = $state.raw([]);
  let showAll = $state(false);
  let saving = $state(false);
  let changedElsewhere = $state(false);

  const validation = $derived(validateWorkspace(draft));
  const dirty = $derived(saved !== undefined && isDirty(draft, saved));
  const awaitingApply = $derived(isAwaitingApply(report, savedAt));
  const statusContext = $derived({ report, saved: saved ?? { groups: [] }, awaitingApply });
  const ruleCount = $derived(draft.groups.reduce((n, g) => n + g.rules.length, 0));

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
  }

  async function loadReport() {
    report = (await area.get(APPLY_REPORT_KEY))[APPLY_REPORT_KEY] as ApplyReport | undefined;
  }

  async function save() {
    if (validation.errorCount > 0) {
      showAll = true;
      announce(`Can't save yet: ${validation.errorCount} field${validation.errorCount === 1 ? '' : 's'} need fixing.`);
      await tick();
      (document.querySelector('[aria-invalid="true"]') as HTMLElement | null)?.focus();
      return;
    }
    saving = true;
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
      announce('Saved. Applying rules…');
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
    await tick();
    const input = document.getElementById(`group-${group.id}-name`) as HTMLInputElement | null;
    input?.focus();
    input?.select();
  }

  $effect(() => {
    if (!awaitingApply && savedAt !== undefined && report) {
      const refused = report.refused.length;
      announce(refused > 0 ? `Rules applied. ${refused} refused; see the rules marked Refused.` : 'Rules applied.');
      savedAt = undefined;
    }
  });

  onMount(() => {
    void loadSaved();
    void loadReport();
    void loadEnabled(area).then((value) => (enabled = value));

    const onChanged = (changes: Record<string, unknown>, areaName: string) => {
      if (areaName !== 'local') return;
      if (APPLY_REPORT_KEY in changes) void loadReport();
      if (ENABLED_KEY in changes) void loadEnabled(area).then((value) => (enabled = value));
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
      if (dirty) event.preventDefault();
    };
    window.addEventListener('beforeunload', beforeUnload);

    return () => {
      browser.storage.onChanged.removeListener(onChanged);
      window.removeEventListener('beforeunload', beforeUnload);
    };
  });
</script>

<header class="bar">
  <div class="title">
    <h1>Detour <span class="muted">Rules</span></h1>
    <p class="muted" data-testid="save-state">
      {#if dirty}● Unsaved changes{:else if awaitingApply}… Applying{:else if saved}✓ All changes saved{/if}
    </p>
  </div>
  <div class="actions">
    <button type="button" class="btn" onclick={exportSaved} disabled={!saved || saved.groups.length === 0} title="Downloads the saved workspace">Export</button>
    <button type="button" class="btn" onclick={discard} disabled={!dirty}>Discard changes</button>
    <button type="button" class="btn primary" onclick={save} disabled={!dirty || saving} aria-busy={saving}>{saving ? 'Saving…' : 'Save'}</button>
  </div>
</header>

<main>
  <div class="visually-hidden" aria-live="polite">{live.message}</div>

  {#if !enabled}
    <div class="banner" role="status">
      <p><strong>Detour is off,</strong> so no rules are applied. Your edits are still saved.</p>
      <button type="button" class="btn" onclick={() => saveEnabled(area, true)}>Turn Detour on</button>
    </div>
  {/if}

  {#if changedElsewhere}
    <div class="banner warning" role="alert">
      <p><strong>Warning:</strong> the rules were changed somewhere else (for example an import from the popup). Saving now would overwrite that change.</p>
      <button type="button" class="btn" onclick={loadSaved}>Load latest (discard my edits)</button>
    </div>
  {/if}

  {#if loadErrors.length > 0}
    <div class="banner error" role="alert">
      <p><strong>Error:</strong> your saved rules can't be read, so the editor won't overwrite them. Rules already installed are left as they were.</p>
      <ul>
        {#each loadErrors as error, i (i)}<li><code>{error}</code></li>{/each}
      </ul>
    </div>
  {:else if saveErrors.length > 0}
    <div class="banner error" role="alert">
      <p><strong>Error:</strong> saving failed.</p>
      <ul>
        {#each saveErrors as error, i (i)}<li><code>{error}</code></li>{/each}
      </ul>
    </div>
  {/if}

  {#if saved}
    <p class="muted intro">
      {draft.groups.length} group{draft.groups.length === 1 ? '' : 's'}, {ruleCount} rule{ruleCount === 1 ? '' : 's'}. Rules higher in the list win when several match the same request.
    </p>

    {#if draft.groups.length === 0}
      <div class="empty">
        <p><strong>Point production at your code.</strong></p>
        <p class="muted">Add a group, then a rule such as “redirect https://cdn.example.com/*.js to http://localhost:5173/*.js”.</p>
      </div>
    {/if}

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
        {edit}
      />
    {/each}

    <div>
      <button type="button" class="btn" id="add-group" onclick={addNewGroup}>+ Add group</button>
    </div>
  {/if}
</main>

<style>
  .bar {
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--border);
    background: var(--bg);
  }

  .title {
    display: flex;
    align-items: baseline;
    gap: var(--space-3);
  }

  h1 {
    font-size: 1.1rem;
    font-weight: 650;
  }

  .actions {
    display: flex;
    gap: var(--space-2);
  }

  main {
    display: grid;
    gap: var(--space-4);
    max-width: 60rem;
    margin: 0 auto;
    padding: var(--space-4);
  }

  .banner {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-3);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
  }

  .banner.warning {
    border-color: var(--warning);
  }

  .banner.error {
    border-color: var(--danger);
  }

  .banner ul {
    width: 100%;
    padding-left: var(--space-4);
  }

  .empty {
    display: grid;
    gap: var(--space-1);
    padding: var(--space-4);
    border: 1px dashed var(--border);
    border-radius: var(--radius);
  }
</style>
