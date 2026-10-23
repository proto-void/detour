<script lang="ts">
  import Icon from '../../../ui/icons/Icon.svelte';
  import type { DbQueryTab } from '../../../db-client/model';

  let {
    tabs = [],
    activeTabId = null,
    selectedConnectionId = null,
    connectionLabel = '',
    connectionColor = '',
    canCancel = false,
    running = false,
    consistency = $bindable('LOCAL_ONE'),
    pageSize = $bindable(500),
    tracing = $bindable(false),
    showCassandraOpts = false,
    editor,
    onSelectTab,
    onCloseTab,
    onNewTab,
    onRun,
    onStop,
    onSave,
    onOpenPro,
  }: {
    tabs?: DbQueryTab[];
    activeTabId?: string | null;
    selectedConnectionId?: string | null;
    connectionLabel?: string;
    connectionColor?: string;
    canCancel?: boolean;
    running?: boolean;
    consistency?: string;
    pageSize?: number;
    tracing?: boolean;
    showCassandraOpts?: boolean;
    editor?: import('svelte').Snippet;
    onSelectTab: (id: string) => void;
    onCloseTab: (id: string) => void;
    onNewTab: () => void;
    onRun: () => void;
    onStop: () => void;
    onSave: () => void;
    onOpenPro: () => void;
  } = $props();

  const active = $derived(tabs.find((t) => t.id === activeTabId) ?? null);

  function onKeydown(e: KeyboardEvent) {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key === 'Enter') {
      e.preventDefault();
      onRun();
    }
    if (mod && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      onSave();
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions a11y_no_noninteractive_element_interactions -->
<div class="workbench" onkeydown={onKeydown}>
  <div class="tab-strip-bar">
    <div class="tab-strip" role="tablist" aria-label="Query tabs">
      {#each tabs as tab (tab.id)}
        {@const otherConn = tab.connectionId && selectedConnectionId && tab.connectionId !== selectedConnectionId}
        <div class="tab" class:active={tab.id === activeTabId} class:other={otherConn} role="presentation">
          <button
            type="button"
            class="tab-main"
            role="tab"
            aria-selected={tab.id === activeTabId}
            onclick={() => onSelectTab(tab.id)}
            title={otherConn ? 'Bound to another connection' : tab.name}
          >
            <span class="tab-name">{tab.name}</span>
            {#if tab.connectionId}
              <span class="dot" style={`background:${connectionColor || 'var(--accent)'}`} aria-hidden="true"></span>
            {/if}
          </button>
          <button type="button" class="tab-close" title="Close tab" aria-label="Close tab" onclick={() => onCloseTab(tab.id)}>×</button>
        </div>
      {/each}
    </div>
    <button type="button" class="btn icon tab-add" title="New query tab" aria-label="New query tab" onclick={onNewTab}>
      <Icon name="plus" />
    </button>
  </div>

  <div class="run-bar">
    {#if connectionLabel}
      <span class="conn-chip" style={`--conn-color:${connectionColor || 'var(--accent)'}`}>{connectionLabel}</span>
    {/if}
    {#if showCassandraOpts}
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
    <button type="button" class="btn primary" disabled={running || !selectedConnectionId} onclick={onRun} title="Run (Mod+Enter)">
      <Icon name="play" />
      {running ? 'Running…' : 'Run'}
    </button>
    <button
      type="button"
      class="btn danger"
      disabled={!running || !canCancel}
      onclick={onStop}
      title={canCancel ? 'Stop query' : 'Stop requires a helper with cancel'}
    >
      <Icon name="stop" />
      Stop
    </button>
    <button type="button" class="btn" disabled={!active} onclick={onSave} title="Save to collection (Mod+S)">Save</button>
    <button type="button" class="btn" onclick={onOpenPro}>Tools</button>
  </div>

  <div class="cm">
    {#if active && editor}
      {@render editor()}
    {:else}
      <p class="muted">Open or create a query tab.</p>
    {/if}
  </div>
</div>

<style>
  .workbench {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    gap: 0;
  }
  .tab-strip-bar {
    display: flex;
    align-items: stretch;
    gap: 4px;
    padding: 4px 6px 0;
    border-bottom: 1px solid var(--border);
    background: var(--surface-2, var(--surface));
  }
  .tab-strip {
    display: flex;
    flex-wrap: nowrap;
    align-items: stretch;
    gap: 2px;
    flex: 1;
    min-width: 0;
    overflow-x: auto;
    scrollbar-width: thin;
    scrollbar-color: color-mix(in srgb, var(--text-muted, var(--muted)) 45%, transparent) transparent;
  }
  .tab-strip::-webkit-scrollbar {
    height: 4px;
  }
  .tab-strip::-webkit-scrollbar-track {
    background: transparent;
  }
  .tab-strip::-webkit-scrollbar-thumb {
    background: color-mix(in srgb, var(--text-muted, var(--muted)) 45%, transparent);
    border-radius: 999px;
  }
  .tab-add {
    flex-shrink: 0;
    align-self: center;
  }
  .tab {
    display: inline-flex;
    align-items: stretch;
    max-width: 10rem;
    flex-shrink: 0;
    border: 1px solid transparent;
    border-bottom: 0;
    border-radius: 6px 6px 0 0;
    background: transparent;
    color: var(--muted);
    font-size: 0.8rem;
  }
  .tab.active {
    color: var(--fg, var(--text));
    background: var(--surface);
    border-color: var(--border);
    box-shadow: inset 0 -2px 0 var(--accent);
  }
  .tab.other {
    opacity: 0.7;
  }
  .tab-main {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
    padding: 6px 4px 6px 8px;
    border: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
    font: inherit;
  }
  .tab-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .tab-close {
    opacity: 0;
    border: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
    padding: 0 6px;
    font: inherit;
    font-size: 0.9rem;
    line-height: 1;
  }
  .tab:hover .tab-close,
  .tab.active .tab-close,
  .tab-close:focus-visible {
    opacity: 0.7;
  }
  .tab-close:hover {
    opacity: 1;
  }
  .run-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: end;
    padding: 8px;
    background: var(--surface-2, var(--surface));
    border-bottom: 1px solid var(--border);
  }
  .run-bar label {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 0.75rem;
  }
  .run-bar .check {
    flex-direction: row;
    align-items: center;
    gap: 6px;
  }
  .conn-chip {
    font-size: 0.75rem;
    font-weight: 600;
    padding: 4px 8px;
    border-radius: 999px;
    border-left: 3px solid var(--conn-color);
    background: var(--surface);
  }
  .cm {
    min-height: 8rem;
    max-height: 14rem;
    overflow: hidden;
    border-bottom: 1px solid var(--border);
  }
  .muted {
    color: var(--muted);
    padding: 12px;
  }
</style>
