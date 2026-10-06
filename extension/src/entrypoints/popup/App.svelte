<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from 'wxt/browser';
  import { APPLY_REPORT_KEY, type ApplyReport } from '../../engine-core/apply';
  import type { Workspace } from '../../rule-model/schema';
  import { loadEnabled, loadWorkspace, saveEnabled, saveWorkspace } from '../../rule-model/storage';
  import { popupGroupList, withGroupEnabled } from '../../workspace-ui/popup';
  import { describeReport } from '../../workspace-ui/report-view';
  import Switch from '../../ui/Switch.svelte';
  import ThemeToggle from '../../ui/ThemeToggle.svelte';
  import ImportPanel from './ImportPanel.svelte';
  import ReportView from './ReportView.svelte';

  const area = browser.storage.local;
  const inTab = new URLSearchParams(location.search).get('view') === 'tab';

  let enabled = $state(true);
  let workspace: Workspace | undefined = $state();
  let report: ApplyReport | undefined = $state();
  const view = $derived(describeReport(report, workspace));
  const groups = $derived(workspace ? popupGroupList(workspace) : { shown: [], more: 0 });
  let groupStatus = $state('');

  async function toggleGroup(id: string, next: boolean) {
    if (!workspace) return;
    const name = workspace.groups.find((group) => group.id === id)?.name ?? 'Group';
    const updated = withGroupEnabled(workspace, id, next);
    workspace = updated;
    const result = await saveWorkspace(area, updated);
    const message = result.ok ? `${name} ${next ? 'on' : 'off'}.` : 'Could not update that group.';
    groupStatus = '';
    setTimeout(() => (groupStatus = message), 50);
    if (!result.ok) await refresh();
  }

  async function refresh() {
    enabled = await loadEnabled(area);
    const loaded = await loadWorkspace(area);
    workspace = loaded.ok ? loaded.value : undefined;
    report = (await area.get(APPLY_REPORT_KEY))[APPLY_REPORT_KEY] as ApplyReport | undefined;
  }

  async function setEnabled(next: boolean) {
    enabled = next;
    await saveEnabled(area, next);
  }

  async function openEditor() {
    await browser.runtime.openOptionsPage();
    if (!inTab) window.close();
  }

  async function openTester() {
    await browser.tabs.create({ url: browser.runtime.getURL('/options.html#tester') });
    if (!inTab) window.close();
  }

  async function openRecipes() {
    await browser.tabs.create({ url: browser.runtime.getURL('/options.html#recipes') });
    if (!inTab) window.close();
  }

  onMount(() => {
    void refresh();
    const onChanged = (_: unknown, areaName: string) => {
      if (areaName === 'local') void refresh();
    };
    browser.storage.onChanged.addListener(onChanged);
    return () => browser.storage.onChanged.removeListener(onChanged);
  });
</script>

<main class:tab={inTab}>
  <header>
    <h1>Detour</h1>
    <Switch id="detour-enabled" checked={enabled} label="Enabled" labelVisible onchange={setEnabled} />
  </header>
  {#if groups.shown.length > 0}
    <section class="groups" aria-labelledby="groups-heading">
      <h2 id="groups-heading">Groups</h2>
      <ul>
        {#each groups.shown as group (group.id)}
          <li>
            <span class="group-name" title={group.name}>{group.name}</span>
            <Switch checked={group.enabled} label={`Enable ${group.name}`} onchange={(next) => toggleGroup(group.id, next)} />
          </li>
        {/each}
      </ul>
      {#if groups.more > 0}<p class="muted">{groups.more} more in Edit rules.</p>{/if}
      <p class="visually-hidden" aria-live="polite">{groupStatus}</p>
    </section>
  {/if}
  <ImportPanel {area} {inTab} />
  <ReportView {view} />
  <footer>
    <ThemeToggle {area} />
    <button type="button" class="btn" onclick={openRecipes}>Recipes…</button>
    <button type="button" class="btn" onclick={openTester}>Test a URL…</button>
    <button type="button" class="btn" onclick={openEditor}>Edit rules…</button>
  </footer>
</main>

<style>
  main {
    display: grid;
    gap: var(--space-4);
    width: 22.5rem;
    padding: var(--space-4);
  }

  main.tab {
    width: auto;
    max-width: 40rem;
    margin: 0 auto;
    padding-top: calc(var(--space-4) * 2);
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: var(--space-3);
    border-bottom: 1px solid var(--border);
  }

  h1 {
    font-size: 1rem;
    font-weight: 650;
  }

  .groups {
    display: grid;
    gap: var(--space-2);
  }

  .groups ul {
    display: grid;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .groups li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    min-width: 0;
  }

  .group-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-2);
    padding-top: var(--space-3);
    border-top: 1px solid var(--border);
  }

  footer :global(.switch-wrap) {
    margin-right: auto;
  }
</style>
