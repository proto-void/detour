<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from 'wxt/browser';
  import { clearMatches, loadMatches, MATCH_LOG_KEY, sourceLabel, type MatchEntry } from '../../observability/log';
  import type { StorageAreaLike } from '../../rule-model/storage';

  let { area }: { area: StorageAreaLike } = $props();
  let rows: MatchEntry[] = $state.raw([]);

  const when = (at: string) => {
    const date = new Date(at);
    return Number.isNaN(date.getTime()) ? at : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  async function reload() {
    rows = await loadMatches(area);
  }

  onMount(() => {
    void reload();
    const onChanged = (changes: Record<string, unknown>, areaName: string) => {
      if (areaName === 'session' && MATCH_LOG_KEY in changes) void reload();
    };
    browser.storage.onChanged.addListener(onChanged);
    if (location.hash === '#log') document.getElementById('log')?.scrollIntoView();
    return () => browser.storage.onChanged.removeListener(onChanged);
  });
</script>

<section id="log" aria-labelledby="log-heading">
  <div class="head">
    <h2 id="log-heading">Recent matches</h2>
    <button type="button" class="btn" id="clear-match-log" onclick={() => clearMatches(area)} disabled={rows.length === 0}>Clear</button>
  </div>
  <p class="muted">Which rules matched in this browser session. This list stays on this device and is dropped when the session ends.</p>
  {#if rows.length === 0}
    <p class="muted" role="status" data-testid="match-log">No matches yet. Load a page a rule affects.</p>
  {:else}
    <ul data-testid="match-log">
      {#each rows as row (row.key)}
        <li>
          <time datetime={row.at}>{when(row.at)}</time>
          <span class="label">{row.label}</span>
          <span class="source">{sourceLabel(row.source)}</span>
          <code title={row.url}>{row.url}</code>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  section {
    display: grid;
    gap: var(--space-2);
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }

  ul {
    display: grid;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: grid;
    grid-template-columns: auto auto 1fr;
    gap: var(--space-1) var(--space-2);
    align-items: baseline;
  }

  time,
  .source {
    color: var(--text-muted);
    font-size: 0.75rem;
  }

  .label {
    font-weight: 600;
  }

  code {
    grid-column: 1 / -1;
  }
</style>
