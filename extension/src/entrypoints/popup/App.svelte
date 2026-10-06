<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from 'wxt/browser';
  import { APPLY_REPORT_KEY, type ApplyReport } from '../../engine-core/apply';
  import type { Workspace } from '../../rule-model/schema';
  import { loadEnabled, loadWorkspace, saveEnabled } from '../../rule-model/storage';
  import { describeReport } from '../../workspace-ui/report-view';
  import Switch from '../../ui/Switch.svelte';
  import ImportPanel from './ImportPanel.svelte';
  import ReportView from './ReportView.svelte';

  const area = browser.storage.local;
  const inTab = new URLSearchParams(location.search).get('view') === 'tab';

  let enabled = $state(true);
  let workspace: Workspace | undefined = $state();
  let report: ApplyReport | undefined = $state();
  const view = $derived(describeReport(report, workspace));

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
    <Switch checked={enabled} label="Enabled" labelVisible onchange={setEnabled} />
  </header>
  <ImportPanel {area} {inTab} />
  <ReportView {view} />
  <footer>
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

  footer {
    display: flex;
    justify-content: flex-end;
    padding-top: var(--space-3);
    border-top: 1px solid var(--border);
  }
</style>
