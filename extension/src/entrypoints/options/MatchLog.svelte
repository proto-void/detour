<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from 'wxt/browser';
  import { queueCapture } from '../../api-client/capture';
  import { summarizeDataUrl } from '../../engine-core/body-data-url';
  import { clearMatches, loadMatches, matchSourceLabel, MATCH_LOG_KEY, type MatchEntry } from '../../observability/log';
  import type { Action, Workspace } from '../../rule-model/schema';
  import { loadWorkspace, type StorageAreaLike } from '../../rule-model/storage';

  type KindChip = 'all' | 'network' | 'body' | 'page';

  let { area }: { area: StorageAreaLike } = $props();
  let rows: MatchEntry[] = $state.raw([]);
  let actions = $state.raw(new Map<string, Action>());
  let filter = $state('');
  let kind = $state<KindChip>('all');
  let helpOpen = $state(false);

  const when = (at: string) => {
    const date = new Date(at);
    return Number.isNaN(date.getTime()) ? at : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const displayUrl = (url: string) => (url.startsWith('data:') ? summarizeDataUrl(url) : url);

  const actionFor = (row: MatchEntry): Action | undefined => actions.get(`${row.groupId}:${row.ruleId}`);

  const sourceText = (row: MatchEntry) => {
    const action = actionFor(row);
    return matchSourceLabel(row.source, action?.type, action?.type === 'overrideBody' ? action.delivery : undefined);
  };

  const kindOf = (row: MatchEntry): KindChip => {
    const label = sourceText(row).toLowerCase();
    if (label.includes('body')) return 'body';
    if (label.includes('mock') || label.includes('inject') || label.includes('page')) return 'page';
    return 'network';
  };

  const visible = $derived.by(() => {
    const q = filter.trim().toLowerCase();
    return rows.filter((row) => {
      if (kind !== 'all' && kindOf(row) !== kind) return false;
      if (!q) return true;
      return `${row.label} ${row.url} ${sourceText(row)}`.toLowerCase().includes(q);
    });
  });

  function indexActions(workspace: Workspace): Map<string, Action> {
    const map = new Map<string, Action>();
    for (const group of workspace.groups) {
      for (const rule of group.rules) map.set(`${group.id}:${rule.id}`, rule.action);
    }
    return map;
  }

  async function reload() {
    rows = await loadMatches(area);
    const loaded = await loadWorkspace(browser.storage.local);
    actions = loaded.ok ? indexActions(loaded.value) : new Map();
  }

  async function sendToApiTester(row: MatchEntry) {
    if (row.url.startsWith('data:')) return;
    await queueCapture(browser.storage.session, {
      method: 'GET',
      url: row.url,
      source: 'match-log',
    });
    location.hash = '#tester';
  }

  onMount(() => {
    void reload();
    const onChanged = (changes: Record<string, unknown>, areaName: string) => {
      if (areaName === 'session' && MATCH_LOG_KEY in changes) void reload();
      if (areaName === 'local' && 'workspace' in changes) void reload();
    };
    browser.storage.onChanged.addListener(onChanged);
    return () => browser.storage.onChanged.removeListener(onChanged);
  });
</script>

<section id="log" aria-labelledby="log-heading">
  <div class="head">
    <h2 id="log-heading">Recent matches</h2>
    <button type="button" class="btn" id="clear-match-log" onclick={() => clearMatches(area)} disabled={rows.length === 0}>Clear</button>
  </div>

  <div class="tools">
    <input type="search" placeholder="Filter log…" bind:value={filter} aria-label="Filter match log" />
    <div class="chips" role="group" aria-label="Match kind">
      {#each [{ id: 'all', label: 'All' }, { id: 'network', label: 'Network' }, { id: 'body', label: 'Body replaced' }, { id: 'page', label: 'Page' }] as chip (chip.id)}
        <button type="button" class="chip" class:active={kind === chip.id} onclick={() => (kind = chip.id as KindChip)}>{chip.label}</button>
      {/each}
    </div>
  </div>

  <details class="help" bind:open={helpOpen}>
    <summary>How to read this</summary>
    <p class="muted">
      Session-only list on this device. Mock = in-page (may not appear in Network). Body replaced (redirect) is a DNR data: redirect — Network shows 307 then a data: request. An in-place Body row means debugger/filter replace.
    </p>
  </details>

  {#if visible.length === 0}
    <p class="muted" role="status" data-testid="match-log">No matches yet. Load a page a rule affects.</p>
  {:else}
    <ul data-testid="match-log">
      {#each visible as row (row.key)}
        <li>
          <time datetime={row.at}>{when(row.at)}</time>
          <span class="kind">{sourceText(row)}</span>
          <span class="label">{row.label}</span>
          <code title={row.url}>{displayUrl(row.url)}</code>
          {#if !row.url.startsWith('data:')}
            <button type="button" class="btn text" onclick={() => void sendToApiTester(row)}>Send to API Tester</button>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  section {
    display: grid;
    gap: var(--space-3);
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }

  h2 {
    margin: 0;
    font-size: 1rem;
    font-weight: 650;
    text-transform: none;
    letter-spacing: normal;
    color: var(--text);
  }

  .tools {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    align-items: center;
  }

  .tools input {
    flex: 1 1 12rem;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
  }

  .chip {
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-pill);
    background: var(--bg);
    color: var(--text-muted);
    font: inherit;
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
  }

  .chip.active {
    background: var(--accent-tint);
    color: var(--text);
    border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
  }

  .help summary {
    font-size: 0.8rem;
  }

  ul {
    display: grid;
    gap: var(--space-1);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: grid;
    grid-template-columns: 4.5rem 7rem 1fr 1.5fr;
    gap: var(--space-2);
    align-items: baseline;
    padding: var(--space-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg);
    font-size: 0.8rem;
  }

  time,
  .kind {
    color: var(--text-muted);
    font-family: var(--mono);
    font-size: 0.72rem;
  }

  .label {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  code {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (max-width: 700px) {
    li {
      grid-template-columns: 1fr;
    }
  }
</style>
