<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from 'wxt/browser';
  import { APPLY_REPORT_KEY, type ApplyReport } from '../../engine-core/apply';
  import { countForTab, loadMatches, SHOW_BADGE_KEY } from '../../observability/log';
  import type { Workspace } from '../../rule-model/schema';
  import { loadEnabled, loadWorkspace, saveEnabled, saveWorkspace } from '../../rule-model/storage';
  import { statusCounts } from '../../workspace-ui/editor';
  import { popupGroupList, withGroupEnabled } from '../../workspace-ui/popup';
  import { describeReport } from '../../workspace-ui/report-view';
  import { brandName } from '../../ui/brand';
  import BrandLockup from '../../ui/BrandLockup.svelte';
  import Icon from '../../ui/icons/Icon.svelte';
  import Switch from '../../ui/Switch.svelte';
  import ThemeToggle from '../../ui/ThemeToggle.svelte';
  import ImportPanel from './ImportPanel.svelte';
  import ReportView from './ReportView.svelte';

  const area = browser.storage.local;
  const inTab = new URLSearchParams(location.search).get('view') === 'tab';
  const version = browser.runtime.getManifest().version;

  let enabled = $state(true);
  let showBadge = $state(true);
  let workspace: Workspace | undefined = $state();
  let report: ApplyReport | undefined = $state();
  let tabMatches = $state(0);
  let importOpen = $state(false);
  const view = $derived(describeReport(report, workspace));
  const groups = $derived(workspace ? popupGroupList(workspace) : { shown: [], more: 0 });
  const counts = $derived(
    statusCounts(workspace ?? { groups: [] }, {
      report,
      saved: workspace ?? { groups: [] },
      awaitingApply: false,
    }),
  );
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
    showBadge = (await area.get(SHOW_BADGE_KEY))[SHOW_BADGE_KEY] !== false;
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      const log = await loadMatches(browser.storage.session);
      tabMatches = tab?.id !== undefined ? countForTab(log, tab.id) : 0;
    } catch {
      tabMatches = 0;
    }
  }

  async function setShowBadge(next: boolean) {
    showBadge = next;
    await area.set({ [SHOW_BADGE_KEY]: next });
  }

  async function setEnabled(next: boolean) {
    enabled = next;
    await saveEnabled(area, next);
  }

  async function openHash(hash: string) {
    const url = browser.runtime.getURL(hash ? `/options.html${hash}` : '/options.html');
    if (hash === '') await browser.runtime.openOptionsPage();
    else await browser.tabs.create({ url });
    if (!inTab) window.close();
  }

  onMount(() => {
    void refresh();
    const onChanged = (_: unknown, areaName: string) => {
      if (areaName === 'local' || areaName === 'session') void refresh();
    };
    browser.storage.onChanged.addListener(onChanged);
    return () => browser.storage.onChanged.removeListener(onChanged);
  });
</script>

<main class:tab={inTab}>
  <header>
    <div class="brand">
      <h1><BrandLockup size={18} /></h1>
      <span class="pill">v{version}</span>
    </div>
    <Switch id="detour-enabled" checked={enabled} label="{brandName} enabled" labelVisible onchange={setEnabled} />
  </header>

  <div class="strip">
    <span><span class="dot ok"></span> {counts.applied} Applied</span>
    <span><span class="dot bad"></span> {counts.refused} Refused</span>
    <span><span class="dot muted"></span> {counts.off} Off</span>
  </div>
  <p class="tab-matches muted">{tabMatches} rule{tabMatches === 1 ? '' : 's'} matched on this tab</p>

  {#if groups.shown.length > 0}
    <section class="groups" aria-labelledby="groups-heading">
      <h2 id="groups-heading">Groups</h2>
      <ul>
        {#each groups.shown as group (group.id)}
          <li>
            <div class="group-meta">
              <span class="group-name" title={group.name}>{group.name}</span>
              <span class="pill">{group.ruleCount} rules</span>
            </div>
            <Switch checked={group.enabled} label={`Enable ${group.name}`} onchange={(next) => toggleGroup(group.id, next)} />
          </li>
        {/each}
      </ul>
      {#if groups.more > 0}<p class="muted">{groups.more} more in Rules.</p>{/if}
      <p class="visually-hidden" aria-live="polite">{groupStatus}</p>
    </section>
  {/if}

  <div class="quick" role="navigation" aria-label="Quick actions">
    <button type="button" class="tile" onclick={() => openHash('')}>
      <Icon name="rules" />
      <span>Rules</span>
    </button>
    <button type="button" class="tile" onclick={() => openHash('#tester')}>
      <Icon name="tester" />
      <span>API Tester</span>
    </button>
    <button type="button" class="tile" onclick={() => openHash('#db')}>
      <Icon name="db" />
      <span>DB</span>
    </button>
    <button type="button" class="tile" onclick={() => openHash('#log')}>
      <Icon name="log" />
      <span>Log</span>
    </button>
  </div>

  <details class="import" bind:open={importOpen}>
    <summary>Import rules</summary>
    <ImportPanel {area} {inTab} />
  </details>

  <ReportView {view} />

  <footer>
    <ThemeToggle {area} variant="switch" />
    <Switch id="show-badge" checked={showBadge} label="Match count" labelVisible onchange={setShowBadge} />
  </footer>
</main>

<style>
  /* Chrome sizes the popup to scrollWidth; overflowing header/footer switches
     used to expand the window and eat the right padding. Keep content inside. */
  :global(html),
  :global(body) {
    width: 22.5rem;
    max-width: 22.5rem;
    overflow-x: hidden;
  }

  main {
    display: grid;
    gap: var(--space-3);
    width: 100%;
    max-width: 100%;
    min-width: 0;
    padding: var(--space-3);
    box-sizing: border-box;
  }

  main.tab {
    width: auto;
    max-width: 40rem;
    margin: 0 auto;
    padding-top: calc(var(--space-4) * 2);
  }

  :global(html):has(main.tab),
  :global(body):has(main.tab) {
    width: auto;
    max-width: none;
    overflow-x: visible;
  }

  header,
  footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    min-width: 0;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
    flex: 1 1 auto;
  }

  h1 {
    margin: 0;
    min-width: 0;
    font-size: 1rem;
    font-weight: 700;
  }

  header :global(.switch-wrap),
  footer :global(.switch-wrap) {
    flex: 0 1 auto;
  }

  .strip {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    font-size: 0.75rem;
  }

  .strip span {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
  }

  .dot {
    width: 0.45rem;
    height: 0.45rem;
    border-radius: 50%;
    background: var(--text-muted);
  }

  .dot.ok {
    background: var(--status-applied);
  }
  .dot.bad {
    background: var(--status-refused);
  }
  .dot.muted {
    background: var(--status-off);
  }

  .tab-matches {
    margin: 0;
    font-size: 0.8rem;
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
    padding: var(--space-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
  }

  .group-meta {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .group-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
  }

  .quick {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-2);
  }

  .tile {
    display: grid;
    gap: var(--space-1);
    justify-items: center;
    padding: var(--space-3);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--text);
    font: inherit;
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
  }

  .tile:hover {
    border-color: var(--text-muted);
    background: var(--surface-2);
  }

  .import {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: var(--space-2) var(--space-3);
    background: var(--surface);
  }

  .import summary {
    cursor: pointer;
    font-weight: 600;
    color: var(--text);
  }

  footer {
    flex-wrap: wrap;
    padding-top: var(--space-2);
    border-top: 1px solid var(--border);
  }
</style>
