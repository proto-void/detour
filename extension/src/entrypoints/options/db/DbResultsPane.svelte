<script lang="ts">
  import { formatDbCell } from '../../../db-client/cell-format';
  import type { DbQueryTabResult } from '../../../db-client/model';

  let {
    resultSets = [],
    activeResultIndex = 0,
    batchMessages = [],
    running = false,
    activePane = $bindable<'results' | 'messages'>('results'),
    onSelectResult,
    onLoadMore,
    onRowClick,
    onCellClick,
  }: {
    resultSets?: DbQueryTabResult[];
    activeResultIndex?: number;
    batchMessages?: string[];
    running?: boolean;
    activePane?: 'results' | 'messages';
    onSelectResult: (index: number) => void;
    onLoadMore: () => void;
    onRowClick: (row: unknown[], index: number) => void;
    onCellClick: (column: string, value: unknown, row: unknown[], index: number) => void;
  } = $props();

  const RENDER_CAP = 500;
  const active = $derived(resultSets[activeResultIndex] ?? null);
  const columns = $derived(active?.columns ?? []);
  const rows = $derived(active?.rows ?? []);
  const timingMs = $derived(active?.timingMs);
  const pageToken = $derived(active?.pageToken ?? null);
  const visible = $derived(rows.slice(0, RENDER_CAP));

  const allMessages = $derived.by(() => {
    const out: string[] = [...batchMessages];
    for (let i = 0; i < resultSets.length; i++) {
      const r = resultSets[i]!;
      for (const w of r.warnings ?? []) out.push(`Result ${i + 1}: ${w}`);
      for (const m of r.messages ?? []) out.push(`Result ${i + 1}: ${m}`);
    }
    return out;
  });
</script>

<div class="results">
  <div class="tabs" role="tablist">
    {#each resultSets as _rs, i (i)}
      <button
        type="button"
        class:active={activePane === 'results' && activeResultIndex === i}
        role="tab"
        aria-selected={activePane === 'results' && activeResultIndex === i}
        onclick={() => {
          onSelectResult(i);
          activePane = 'results';
        }}
      >
        Result {i + 1}{#if resultSets[i]?.rows?.length} ({resultSets[i]!.rows.length}){/if}
      </button>
    {/each}
    <button
      type="button"
      class:active={activePane === 'messages'}
      role="tab"
      aria-selected={activePane === 'messages'}
      onclick={() => (activePane = 'messages')}
    >
      Messages{#if allMessages.length} ({allMessages.length}){/if}
    </button>
    <span class="meta">
      {#if timingMs !== undefined}{timingMs} ms{/if}
      {#if rows.length} · {rows.length} row{rows.length === 1 ? '' : 's'}{/if}
    </span>
  </div>
  {#if activePane === 'results'}
    <div class="grid-wrap">
      {#if resultSets.length === 0 || columns.length === 0}
        <p class="empty">Run a query to see results here.</p>
      {:else}
        <table class="grid">
          <thead>
            <tr>
              {#each columns as col}
                <th>{col}</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each visible as row, i (i)}
              <tr onclick={() => onRowClick(row, i)}>
                {#each row as cell, ci}
                  <td>
                    <button
                      type="button"
                      class="cell"
                      title={formatDbCell(cell)}
                      onclick={(e) => {
                        e.stopPropagation();
                        onCellClick(columns[ci] ?? String(ci), cell, row, i);
                      }}
                    >
                      {formatDbCell(cell)}
                    </button>
                  </td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
        {#if rows.length > RENDER_CAP}
          <p class="muted">Showing first {RENDER_CAP} of {rows.length} loaded rows.</p>
        {/if}
      {/if}
    </div>
    <div class="foot">
      <button type="button" class="btn" disabled={!pageToken || running} onclick={onLoadMore}>Load next page</button>
    </div>
  {:else}
    <div class="msgs">
      {#if allMessages.length}
        <ul>
          {#each allMessages as m}
            <li>{m}</li>
          {/each}
        </ul>
      {:else}
        <p class="empty">No messages yet.</p>
      {/if}
    </div>
  {/if}
</div>

<style>
  .results {
    display: flex;
    flex-direction: column;
    min-height: 0;
    flex: 1;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
    overflow: hidden;
  }
  .tabs {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0 8px;
    border-bottom: 1px solid var(--border);
    background: var(--surface-2, var(--surface));
    flex-wrap: wrap;
  }
  .tabs button {
    background: transparent;
    border: 0;
    padding: 8px 10px;
    color: var(--muted);
    cursor: pointer;
    font: inherit;
  }
  .tabs button.active {
    color: var(--fg, var(--text));
    box-shadow: inset 0 -2px 0 var(--accent);
  }
  .meta {
    margin-left: auto;
    font-size: 0.75rem;
    color: var(--muted);
  }
  .grid-wrap {
    flex: 1;
    min-height: 0;
    overflow: auto;
  }
  .grid {
    border-collapse: collapse;
    width: 100%;
    font-size: 0.78rem;
  }
  .grid th {
    position: sticky;
    top: 0;
    background: var(--surface-2, var(--surface));
    z-index: 1;
    text-align: left;
    padding: 4px 8px;
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
  }
  .grid td {
    padding: 0;
    border-bottom: 1px solid var(--border);
    height: 1.7rem;
    max-width: 16rem;
  }
  .cell {
    display: block;
    width: 100%;
    height: 1.7rem;
    padding: 0 8px;
    border: 0;
    background: transparent;
    color: inherit;
    text-align: left;
    font: inherit;
    cursor: pointer;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .foot {
    padding: 6px 8px;
    border-top: 1px solid var(--border);
  }
  .msgs {
    padding: 8px 12px;
    overflow: auto;
    flex: 1;
    font-size: 0.85rem;
  }
  .empty,
  .muted {
    color: var(--muted);
    padding: 12px;
    margin: 0;
  }
</style>
