<script lang="ts">
  import type { DbCollection } from '../../../db-client/model';
  import Icon from '../../../ui/icons/Icon.svelte';

  let {
    collections = [],
    expandedIds = [],
    onToggleExpand,
    onOpenQuery,
    onRenameCollection,
    onRenameFolder,
    onRenameQuery,
    onDeleteCollection,
    onDeleteFolder,
    onDeleteQuery,
    onNewFolder,
    onNewQuery,
    onMoveQuery,
    onSaveHere,
  }: {
    collections?: DbCollection[];
    expandedIds?: string[];
    onToggleExpand: (id: string) => void;
    onOpenQuery: (collectionId: string, folderId: string | null, queryId: string) => void;
    onRenameCollection: (collectionId: string, name: string) => void;
    onRenameFolder: (collectionId: string, folderId: string, name: string) => void;
    onRenameQuery: (
      collectionId: string,
      folderId: string | null,
      queryId: string,
      name: string,
    ) => void;
    onDeleteCollection: (collectionId: string) => void;
    onDeleteFolder: (collectionId: string, folderId: string) => void;
    onDeleteQuery: (collectionId: string, folderId: string | null, queryId: string) => void;
    onNewFolder: (collectionId: string) => void;
    onNewQuery: (collectionId: string, folderId: string | null) => void;
    onMoveQuery: (
      queryId: string,
      toCollectionId: string,
      toFolderId: string | null,
    ) => void;
    onSaveHere: (collectionId: string, folderId: string | null) => void;
  } = $props();

  let editingId = $state<string | null>(null);
  let editValue = $state('');
  let dropTarget = $state<string | null>(null);

  function startEdit(id: string, current: string) {
    editingId = id;
    editValue = current;
  }

  function commitEdit(apply: (name: string) => void) {
    const name = editValue.trim();
    editingId = null;
    if (!name) return;
    apply(name);
  }

  function isExpanded(id: string) {
    return expandedIds.includes(id);
  }

  function dropKey(collectionId: string, folderId: string | null) {
    return folderId ? `${collectionId}:${folderId}` : `${collectionId}:root`;
  }

  function onDragStart(e: DragEvent, queryId: string) {
    e.dataTransfer?.setData('text/detour-query-id', queryId);
    e.dataTransfer?.setData('text/plain', queryId);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  }

  function onDragOver(e: DragEvent, key: string) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    dropTarget = key;
  }

  function onDragLeave(key: string) {
    if (dropTarget === key) dropTarget = null;
  }

  function onDrop(e: DragEvent, collectionId: string, folderId: string | null) {
    e.preventDefault();
    dropTarget = null;
    const queryId =
      e.dataTransfer?.getData('text/detour-query-id') ||
      e.dataTransfer?.getData('text/plain');
    if (!queryId) return;
    onMoveQuery(queryId, collectionId, folderId);
  }
</script>

<ul class="tree" role="tree">
  {#each collections as col (col.id)}
    <li class="node col" role="treeitem" aria-selected="false" aria-expanded={isExpanded(col.id)}>
      <div class="row">
        <button
          type="button"
          class="chev"
          class:open={isExpanded(col.id)}
          aria-label={isExpanded(col.id) ? 'Collapse collection' : 'Expand collection'}
          onclick={() => onToggleExpand(col.id)}
        >
          <Icon name="chevron" size={14} />
        </button>
        <span class="icon" aria-hidden="true"><Icon name="folder" size={14} /></span>
        {#if editingId === col.id}
          <input
            class="rename"
            bind:value={editValue}
            aria-label="Rename collection"
            onkeydown={(e) => {
              if (e.key === 'Enter') commitEdit((n) => onRenameCollection(col.id, n));
              if (e.key === 'Escape') editingId = null;
            }}
            onblur={() => commitEdit((n) => onRenameCollection(col.id, n))}
          />
        {:else}
          <button type="button" class="label" onclick={() => onToggleExpand(col.id)}>{col.name}</button>
          <span class="row-actions">
            <button
              type="button"
              class="icon-btn"
              title="New folder"
              aria-label="New folder"
              onclick={() => onNewFolder(col.id)}
            >
              <Icon name="plus" size={14} />
            </button>
            <button
              type="button"
              class="icon-btn"
              title="New query"
              aria-label="New query in collection"
              onclick={() => onNewQuery(col.id, null)}
            >
              <Icon name="query" size={14} />
            </button>
            <button
              type="button"
              class="icon-btn"
              title="Rename"
              aria-label="Rename collection"
              onclick={() => startEdit(col.id, col.name)}
            >
              <Icon name="pencil" size={14} />
            </button>
            <button
              type="button"
              class="icon-btn danger"
              title="Delete"
              aria-label="Delete collection"
              onclick={() => onDeleteCollection(col.id)}
            >
              <Icon name="trash" size={14} />
            </button>
          </span>
        {/if}
      </div>
      {#if isExpanded(col.id)}
        <ul
          class="children drop-zone"
          class:active={dropTarget === dropKey(col.id, null)}
          role="group"
          ondragover={(e) => onDragOver(e, dropKey(col.id, null))}
          ondragleave={() => onDragLeave(dropKey(col.id, null))}
          ondrop={(e) => onDrop(e, col.id, null)}
        >
          {#each col.queries ?? [] as q (q.id)}
            <li class="node query" role="treeitem" aria-selected="false">
              <div
                class="row indent-1"
                role="group"
                draggable="true"
                ondragstart={(e) => onDragStart(e, q.id)}
              >
                <span class="chev spacer" aria-hidden="true"></span>
                <span class="icon" aria-hidden="true"><Icon name="query" size={14} /></span>
                {#if editingId === q.id}
                  <input
                    class="rename"
                    bind:value={editValue}
                    aria-label="Rename query"
                    onkeydown={(e) => {
                      if (e.key === 'Enter')
                        commitEdit((n) => onRenameQuery(col.id, null, q.id, n));
                      if (e.key === 'Escape') editingId = null;
                    }}
                    onblur={() => commitEdit((n) => onRenameQuery(col.id, null, q.id, n))}
                  />
                {:else}
                  <button
                    type="button"
                    class="label file"
                    onclick={() => onOpenQuery(col.id, null, q.id)}>{q.name}</button
                  >
                  <span class="row-actions">
                    <button
                      type="button"
                      class="icon-btn"
                      title="Rename"
                      aria-label="Rename query"
                      onclick={() => startEdit(q.id, q.name)}
                    >
                      <Icon name="pencil" size={14} />
                    </button>
                    <button
                      type="button"
                      class="icon-btn danger"
                      title="Delete"
                      aria-label="Delete query"
                      onclick={() => onDeleteQuery(col.id, null, q.id)}
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  </span>
                {/if}
              </div>
            </li>
          {/each}

          {#each col.folders ?? [] as folder (folder.id)}
            <li class="node folder" role="treeitem" aria-selected="false" aria-expanded={isExpanded(folder.id)}>
              <div
                class="row indent-1 drop-zone"
                role="group"
                class:active={dropTarget === dropKey(col.id, folder.id)}
                ondragover={(e) => onDragOver(e, dropKey(col.id, folder.id))}
                ondragleave={() => onDragLeave(dropKey(col.id, folder.id))}
                ondrop={(e) => onDrop(e, col.id, folder.id)}
              >
                <button
                  type="button"
                  class="chev"
                  class:open={isExpanded(folder.id)}
                  aria-label={isExpanded(folder.id) ? 'Collapse folder' : 'Expand folder'}
                  onclick={() => onToggleExpand(folder.id)}
                >
                  <Icon name="chevron" size={14} />
                </button>
                <span class="icon" aria-hidden="true"><Icon name="folder" size={14} /></span>
                {#if editingId === folder.id}
                  <input
                    class="rename"
                    bind:value={editValue}
                    aria-label="Rename folder"
                    onkeydown={(e) => {
                      if (e.key === 'Enter') commitEdit((n) => onRenameFolder(col.id, folder.id, n));
                      if (e.key === 'Escape') editingId = null;
                    }}
                    onblur={() => commitEdit((n) => onRenameFolder(col.id, folder.id, n))}
                  />
                {:else}
                  <button type="button" class="label" onclick={() => onToggleExpand(folder.id)}
                    >{folder.name}</button
                  >
                  <span class="row-actions">
                    <button
                      type="button"
                      class="icon-btn"
                      title="New query"
                      aria-label="New query in folder"
                      onclick={() => onNewQuery(col.id, folder.id)}
                    >
                      <Icon name="query" size={14} />
                    </button>
                    <button
                      type="button"
                      class="icon-btn"
                      title="Rename"
                      aria-label="Rename folder"
                      onclick={() => startEdit(folder.id, folder.name)}
                    >
                      <Icon name="pencil" size={14} />
                    </button>
                    <button
                      type="button"
                      class="icon-btn danger"
                      title="Delete"
                      aria-label="Delete folder"
                      onclick={() => onDeleteFolder(col.id, folder.id)}
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  </span>
                {/if}
              </div>
              {#if isExpanded(folder.id)}
                <ul class="children" role="group">
                  {#if (folder.queries ?? []).length === 0}
                    <li class="empty indent-2">
                      <p class="muted empty-hint">No saved queries yet.</p>
                      <button type="button" class="btn" onclick={() => onSaveHere(col.id, folder.id)}
                        >Save current query here</button
                      >
                    </li>
                  {:else}
                    {#each folder.queries ?? [] as q (q.id)}
                      <li class="node query" role="treeitem" aria-selected="false">
                        <div
                          class="row indent-2"
                          role="group"
                          draggable="true"
                          ondragstart={(e) => onDragStart(e, q.id)}
                        >
                          <span class="chev spacer" aria-hidden="true"></span>
                          <span class="icon" aria-hidden="true"><Icon name="query" size={14} /></span>
                          {#if editingId === q.id}
                            <input
                              class="rename"
                              bind:value={editValue}
                              aria-label="Rename query"
                              onkeydown={(e) => {
                                if (e.key === 'Enter')
                                  commitEdit((n) => onRenameQuery(col.id, folder.id, q.id, n));
                                if (e.key === 'Escape') editingId = null;
                              }}
                              onblur={() =>
                                commitEdit((n) => onRenameQuery(col.id, folder.id, q.id, n))}
                            />
                          {:else}
                            <button
                              type="button"
                              class="label file"
                              onclick={() => onOpenQuery(col.id, folder.id, q.id)}>{q.name}</button
                            >
                            <span class="row-actions">
                              <button
                                type="button"
                                class="icon-btn"
                                title="Rename"
                                aria-label="Rename query"
                                onclick={() => startEdit(q.id, q.name)}
                              >
                                <Icon name="pencil" size={14} />
                              </button>
                              <button
                                type="button"
                                class="icon-btn danger"
                                title="Delete"
                                aria-label="Delete query"
                                onclick={() => onDeleteQuery(col.id, folder.id, q.id)}
                              >
                                <Icon name="trash" size={14} />
                              </button>
                            </span>
                          {/if}
                        </div>
                      </li>
                    {/each}
                  {/if}
                </ul>
              {/if}
            </li>
          {/each}

          {#if (col.queries ?? []).length === 0 && (col.folders ?? []).length === 0}
            <li class="empty indent-1">
              <p class="muted empty-hint">No folders or queries yet.</p>
              <button type="button" class="btn" onclick={() => onSaveHere(col.id, null)}
                >Save current query here</button
              >
            </li>
          {/if}
        </ul>
      {/if}
    </li>
  {/each}
</ul>

<style>
  .tree,
  .children {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
    width: 100%;
  }
  .indent-1 {
    padding-left: 0.75rem;
  }
  .indent-2 {
    padding-left: 1.5rem;
  }
  .chev {
    flex: 0 0 1.35rem;
    width: 1.35rem;
    height: 1.35rem;
    border: 0;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transform: rotate(0deg);
    transition: transform 0.12s ease;
  }
  .chev.open {
    transform: rotate(90deg);
  }
  .chev.spacer {
    visibility: hidden;
    pointer-events: none;
  }
  .icon {
    flex: 0 0 auto;
    display: inline-flex;
    color: var(--muted);
    line-height: 1;
  }
  .label {
    flex: 1 1 auto;
    min-width: 0;
    text-align: left;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
    padding: 4px 2px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .label.file:hover {
    color: var(--accent);
  }
  .rename {
    flex: 1 1 auto;
    min-width: 0;
    font: inherit;
    padding: 2px 4px;
  }
  .row-actions {
    display: none;
    flex: 0 0 auto;
    align-items: center;
    gap: 2px;
  }
  .row:hover .row-actions,
  .row:focus-within .row-actions {
    display: inline-flex;
  }
  .icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.4rem;
    height: 1.4rem;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
  }
  .icon-btn:hover {
    color: var(--fg, var(--text));
    background: color-mix(in srgb, var(--accent) 14%, transparent);
  }
  .icon-btn.danger:hover {
    color: var(--danger, #c44);
  }
  .drop-zone.active {
    outline: 1px dashed var(--accent);
    outline-offset: 1px;
    border-radius: 4px;
    background: color-mix(in srgb, var(--accent) 8%, transparent);
  }
  .empty {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
    padding: 4px 0 8px;
  }
  .muted,
  .empty-hint {
    color: var(--muted);
    margin: 0;
    font-size: 0.8rem;
  }
</style>
