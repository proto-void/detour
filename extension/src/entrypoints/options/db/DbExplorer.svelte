<script lang="ts">
  import Icon from '../../../ui/icons/Icon.svelte';

  export type ExplorerNode = {
    id: string;
    label: string;
    kind: string;
    meta?: Record<string, unknown>;
  };

  export type ColumnInfo = { name: string; type: string; kind?: string };

  let {
    collapsed = false,
    search = $bindable(''),
    keyspaces = [],
    activeKeyspace = null,
    childrenByParentId = {},
    columnsByTableId = {},
    expandedIds = [],
    selectedTableId = null,
    showDdl = false,
    ddl = '',
    onToggleCollapse,
    onRefresh,
    onActiveKeyspaceChange,
    onToggleExpand,
    onUseKeyspace,
    onNodeClick,
    onNodeDblClick,
    onColumnClick,
    onToggleDdl,
  }: {
    collapsed?: boolean;
    search?: string;
    keyspaces?: ExplorerNode[];
    activeKeyspace?: string | null;
    childrenByParentId?: Record<string, ExplorerNode[]>;
    columnsByTableId?: Record<string, ColumnInfo[]>;
    expandedIds?: string[];
    selectedTableId?: string | null;
    showDdl?: boolean;
    ddl?: string;
    onToggleCollapse: () => void;
    onRefresh: () => void;
    onActiveKeyspaceChange: (ks: string | null) => void;
    onToggleExpand: (nodeId: string) => void;
    onUseKeyspace: (ks: string) => void;
    onNodeClick: (node: ExplorerNode) => void;
    onNodeDblClick: (node: ExplorerNode, shiftKey: boolean) => void;
    onColumnClick: (name: string) => void;
    onToggleDdl: () => void;
  } = $props();

  const q = $derived(search.trim().toLowerCase());
  const expanded = $derived(new Set(expandedIds));

  const scoped = $derived(Boolean(activeKeyspace));

  /** In All mode: keyspaces at root. In active mode: tables under that KS. */
  const rootNodes = $derived.by(() => {
    if (activeKeyspace) {
      const ksNode = keyspaces.find((k) => k.label === activeKeyspace);
      if (!ksNode) return [] as ExplorerNode[];
      return childrenByParentId[ksNode.id] ?? [];
    }
    return keyspaces;
  });

  function matchesFilter(node: ExplorerNode): boolean {
    if (!q) return true;
    return node.label.toLowerCase().includes(q) || node.kind.toLowerCase().includes(q);
  }

  function filteredChildren(parentId: string): ExplorerNode[] {
    const kids = childrenByParentId[parentId] ?? [];
    if (!q) return kids;
    return kids.filter(matchesFilter);
  }

  function filteredRoot(): ExplorerNode[] {
    if (!q) return rootNodes;
    if (scoped) return rootNodes.filter(matchesFilter);
    // All mode: keep keyspace if it or any loaded child matches
    return rootNodes.filter((ks) => {
      if (matchesFilter(ks)) return true;
      const kids = childrenByParentId[ks.id] ?? [];
      return kids.some(matchesFilter);
    });
  }

  function isExpandable(node: ExplorerNode): boolean {
    return (
      node.kind === 'keyspace' ||
      node.kind === 'database' ||
      node.kind === 'schema' ||
      node.kind === 'table' ||
      node.kind === 'materialized_view' ||
      node.kind === 'view'
    );
  }

  function tableColumns(node: ExplorerNode): ColumnInfo[] {
    return columnsByTableId[node.id] ?? [];
  }

  function groupTables(nodes: ExplorerNode[]): Array<{ title: string; list: ExplorerNode[] }> {
    const tables = nodes.filter((n) => n.kind === 'table' || n.kind === 'view');
    const mvs = nodes.filter((n) => n.kind === 'materialized_view');
    const udts = nodes.filter((n) => n.kind === 'udt');
    const other = nodes.filter(
      (n) =>
        n.kind !== 'table' &&
        n.kind !== 'view' &&
        n.kind !== 'materialized_view' &&
        n.kind !== 'udt',
    );
    return [
      { title: 'Tables', list: tables },
      { title: 'Materialized views', list: mvs },
      { title: 'UDTs', list: udts },
      { title: 'Objects', list: other },
    ].filter((g) => g.list.length > 0);
  }
</script>

<aside class="explorer" class:collapsed aria-label="Object explorer">
  <div class="ex-head">
    <button
      type="button"
      class="btn icon"
      title={collapsed ? 'Expand explorer' : 'Collapse explorer'}
      aria-label={collapsed ? 'Expand explorer' : 'Collapse explorer'}
      onclick={onToggleCollapse}
    >
      <Icon name="panel" />
    </button>
    {#if !collapsed}
      <label class="ks-label">
        <span class="sr-only">Keyspace</span>
        <select
          class="ks-select"
          aria-label="Keyspace"
          value={activeKeyspace ?? ''}
          onchange={(e) => {
            const v = (e.currentTarget as HTMLSelectElement).value;
            onActiveKeyspaceChange(v === '' ? null : v);
          }}
        >
          <option value="">All keyspaces</option>
          {#each keyspaces as ks (ks.id)}
            <option value={ks.label}>{ks.label}</option>
          {/each}
        </select>
      </label>
      <button type="button" class="btn icon" title="Refresh explorer" aria-label="Refresh explorer" onclick={onRefresh}>
        <Icon name="refresh" />
      </button>
    {/if}
  </div>
  {#if !collapsed}
    {#if activeKeyspace}
      <div class="chip-row">
        <span class="chip" title="Session default keyspace">Using keyspace: {activeKeyspace}</span>
        <button type="button" class="btn text" onclick={() => onActiveKeyspaceChange(null)}>Clear</button>
      </div>
    {/if}
    <input type="search" class="ex-search" placeholder="Filter objects…" bind:value={search} aria-label="Filter explorer" />
    <div class="ex-body">
      {#if scoped}
        {#each groupTables(filteredRoot()) as group}
          <div class="group">
            <div class="group-title">{group.title}</div>
            <ul>
              {#each group.list as node (node.id)}
                {@const open = expanded.has(node.id)}
                <li>
                  <div class="row">
                    {#if isExpandable(node)}
                      <button
                        type="button"
                        class="chev"
                        aria-expanded={open}
                        title={open ? 'Collapse' : 'Expand'}
                        onclick={() => onToggleExpand(node.id)}
                      >{open ? '▾' : '▸'}</button>
                    {:else}
                      <span class="chev spacer" aria-hidden="true"></span>
                    {/if}
                    <button
                      type="button"
                      class="obj"
                      class:active={selectedTableId === node.id}
                      onclick={() => onNodeClick(node)}
                      ondblclick={(e) => onNodeDblClick(node, e.shiftKey)}
                    >
                      <span class="kind">{node.kind}</span>
                      <span class="label">{node.label}</span>
                    </button>
                  </div>
                  {#if open}
                    <ul class="nest">
                      {#each tableColumns(node) as col}
                        <li>
                          <button
                            type="button"
                            class="obj col"
                            title="{col.type}{col.kind ? ` · ${col.kind}` : ''}"
                            onclick={() => onColumnClick(col.name)}
                          >
                            <span class="label">{col.name}</span>
                            <span class="kind">{col.type}</span>
                          </button>
                        </li>
                      {/each}
                    </ul>
                  {/if}
                </li>
              {/each}
            </ul>
          </div>
        {/each}
      {:else}
        <ul class="tree">
          {#each filteredRoot() as ks (ks.id)}
            {@const open = expanded.has(ks.id)}
            <li>
              <div class="row">
                <button
                  type="button"
                  class="chev"
                  aria-expanded={open}
                  title={open ? 'Collapse' : 'Expand'}
                  onclick={() => onToggleExpand(ks.id)}
                >{open ? '▾' : '▸'}</button>
                <button
                  type="button"
                  class="obj"
                  onclick={() => onNodeClick(ks)}
                  ondblclick={() => onUseKeyspace(ks.label)}
                >
                  <span class="kind">{ks.kind}</span>
                  <span class="label">{ks.label}</span>
                </button>
                <button type="button" class="btn text use" title="Use this keyspace" onclick={() => onUseKeyspace(ks.label)}>
                  Use
                </button>
              </div>
              {#if open}
                {#each groupTables(filteredChildren(ks.id)) as group}
                  <div class="group nest-group">
                    <div class="group-title">{group.title}</div>
                    <ul class="nest">
                      {#each group.list as node (node.id)}
                        {@const tOpen = expanded.has(node.id)}
                        <li>
                          <div class="row">
                            {#if isExpandable(node)}
                              <button
                                type="button"
                                class="chev"
                                aria-expanded={tOpen}
                                title={tOpen ? 'Collapse' : 'Expand'}
                                onclick={() => onToggleExpand(node.id)}
                              >{tOpen ? '▾' : '▸'}</button>
                            {:else}
                              <span class="chev spacer" aria-hidden="true"></span>
                            {/if}
                            <button
                              type="button"
                              class="obj"
                              class:active={selectedTableId === node.id}
                              onclick={() => onNodeClick(node)}
                              ondblclick={(e) => onNodeDblClick(node, e.shiftKey)}
                            >
                              <span class="kind">{node.kind}</span>
                              <span class="label">{node.label}</span>
                            </button>
                          </div>
                          {#if tOpen}
                            <ul class="nest deep">
                              {#each tableColumns(node) as col}
                                <li>
                                  <button
                                    type="button"
                                    class="obj col"
                                    title="{col.type}{col.kind ? ` · ${col.kind}` : ''}"
                                    onclick={() => onColumnClick(col.name)}
                                  >
                                    <span class="label">{col.name}</span>
                                    <span class="kind">{col.type}</span>
                                  </button>
                                </li>
                              {/each}
                            </ul>
                          {/if}
                        </li>
                      {/each}
                    </ul>
                  </div>
                {/each}
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
      {#if ddl}
        <details
          class="ddl-wrap"
          open={showDdl}
          ontoggle={(e) => {
            if ((e.currentTarget as HTMLDetailsElement).open !== showDdl) onToggleDdl();
          }}
        >
          <summary>Show DDL</summary>
          <pre class="ddl">{ddl}</pre>
        </details>
      {/if}
    </div>
  {/if}
</aside>

<style>
  .explorer {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    border-right: 1px solid var(--border);
    background: var(--surface);
    width: 260px;
  }
  .explorer.collapsed {
    width: auto;
  }
  .ex-head {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px;
    border-bottom: 1px solid var(--border);
    background: var(--surface-2, var(--surface));
  }
  .ks-label {
    flex: 1;
    min-width: 0;
  }
  .ks-select {
    width: 100%;
    font-size: 0.8rem;
  }
  .chip-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px 0;
  }
  .chip {
    flex: 1;
    min-width: 0;
    font-size: 0.7rem;
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ex-search {
    margin: 6px;
    width: calc(100% - 12px);
  }
  .ex-body {
    overflow: auto;
    flex: 1;
    padding: 0 6px 8px;
    scrollbar-width: thin;
    scrollbar-color: color-mix(in srgb, var(--text-muted, var(--muted)) 45%, transparent) transparent;
  }
  .ex-body::-webkit-scrollbar {
    width: 4px;
    height: 4px;
  }
  .ex-body::-webkit-scrollbar-track {
    background: transparent;
  }
  .ex-body::-webkit-scrollbar-thumb {
    background: color-mix(in srgb, var(--text-muted, var(--muted)) 45%, transparent);
    border-radius: 999px;
  }
  .group {
    margin-top: 8px;
  }
  .nest-group {
    margin-left: 1rem;
  }
  .group-title {
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted);
    padding: 2px 4px;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .tree {
    margin-top: 4px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 2px;
    min-width: 0;
  }
  .chev {
    flex-shrink: 0;
    width: 1.25rem;
    border: 0;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    padding: 0;
    font: inherit;
    font-size: 0.7rem;
    line-height: 1;
  }
  .chev.spacer {
    visibility: hidden;
  }
  .use {
    flex-shrink: 0;
    font-size: 0.7rem;
    opacity: 0;
  }
  .row:hover .use,
  .row:focus-within .use {
    opacity: 1;
  }
  .obj {
    display: flex;
    gap: 6px;
    flex: 1;
    min-width: 0;
    text-align: left;
    border: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
    padding: 4px 6px;
    border-radius: 4px;
    font-size: 0.8rem;
  }
  .obj:hover,
  .obj.active {
    background: color-mix(in srgb, var(--accent) 14%, transparent);
  }
  .obj .kind {
    color: var(--muted);
    font-size: 0.7rem;
    flex-shrink: 0;
  }
  .obj.col .kind {
    margin-left: auto;
  }
  .label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .nest {
    margin-left: 0.75rem;
  }
  .nest.deep {
    margin-left: 1.25rem;
  }
  .ddl-wrap {
    margin-top: 8px;
    font-size: 0.8rem;
  }
  .ddl {
    font-size: 0.7rem;
    white-space: pre-wrap;
    background: var(--surface-2);
    padding: 6px;
    border-radius: 6px;
    max-height: 10rem;
    overflow: auto;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
