<script lang="ts">
  import Icon from '../../../ui/icons/Icon.svelte';
  import type { DbSide } from '../../../db-client/model';

  let {
    side,
    collapsed = false,
    onSide,
    onToggleCollapse,
    children,
  }: {
    side: DbSide;
    collapsed?: boolean;
    onSide: (s: DbSide) => void;
    onToggleCollapse: () => void;
    children: import('svelte').Snippet;
  } = $props();

  const items: Array<{ id: DbSide; icon: 'db' | 'layers' | 'log'; label: string }> = [
    { id: 'connections', icon: 'db', label: 'Connections' },
    { id: 'collections', icon: 'layers', label: 'Collections' },
    { id: 'history', icon: 'log', label: 'History' },
  ];
</script>

<div class="shell" class:collapsed>
  <nav class="rail" aria-label="Databases panels">
    {#each items as item}
      <button
        type="button"
        class="rail-btn"
        class:active={side === item.id}
        title={item.label}
        aria-label={item.label}
        aria-pressed={side === item.id}
        onclick={() => {
          if (collapsed) onToggleCollapse();
          onSide(item.id);
        }}
      >
        <Icon name={item.icon} />
      </button>
    {/each}
    <button
      type="button"
      class="rail-btn collapse"
      title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      onclick={onToggleCollapse}
    >
      <Icon name="panel" />
    </button>
  </nav>
  {#if !collapsed}
    <div class="panel">
      {@render children()}
    </div>
  {/if}
</div>

<style>
  .shell {
    display: flex;
    min-width: 0;
    min-height: 0;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
    overflow: hidden;
  }
  .shell.collapsed {
    width: auto;
  }
  .rail {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 6px 4px;
    border-right: 1px solid var(--border);
    background: var(--surface-2, var(--surface));
  }
  .rail-btn {
    display: grid;
    place-items: center;
    width: 2rem;
    height: 2rem;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--text-muted, var(--muted));
    cursor: pointer;
  }
  .rail-btn:hover {
    color: var(--text, var(--fg));
    background: color-mix(in srgb, var(--accent) 12%, transparent);
  }
  .rail-btn.active {
    color: var(--accent);
    background: var(--accent-tint, color-mix(in srgb, var(--accent) 18%, transparent));
  }
  .rail-btn.collapse {
    margin-top: auto;
  }
  .panel {
    flex: 1;
    min-width: 200px;
    max-width: 280px;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: auto;
    scrollbar-width: thin;
    scrollbar-color: color-mix(in srgb, var(--text-muted, var(--muted)) 45%, transparent) transparent;
  }
  .panel::-webkit-scrollbar {
    width: 4px;
    height: 4px;
  }
  .panel::-webkit-scrollbar-track {
    background: transparent;
  }
  .panel::-webkit-scrollbar-thumb {
    background: color-mix(in srgb, var(--text-muted, var(--muted)) 45%, transparent);
    border-radius: 999px;
  }
</style>
