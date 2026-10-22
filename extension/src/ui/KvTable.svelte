<script lang="ts">
  import { newKvRow, type KvRow } from '../api-client/model';
  import { syncGrowFieldCollapsed } from './grow-field';

  let {
    title = '',
    rows,
    keyPlaceholder = 'Key',
    onchange,
  }: {
    title?: string;
    rows: KvRow[];
    keyPlaceholder?: string;
    onchange: (rows: KvRow[]) => void;
  } = $props();

  let bulk = $state(false);
  let bulkText = $state('');
  let phantomId = $state(crypto.randomUUID());

  const displayRows = $derived.by(() => {
    const list = rows ?? [];
    if (list.length === 0) return [{ id: phantomId, enabled: true, key: '', value: '' } satisfies KvRow];
    const last = list[list.length - 1]!;
    if (last.key === '' && last.value === '') return list;
    return [...list, { id: phantomId, enabled: true, key: '', value: '' } satisfies KvRow];
  });

  function isPhantom(id: string): boolean {
    return !(rows ?? []).some((r) => r.id === id);
  }

  function onGrowFocus(e: FocusEvent) {
    syncGrowFieldCollapsed(e.currentTarget as HTMLTextAreaElement, true);
  }

  function onGrowBlur(e: FocusEvent) {
    const el = e.currentTarget as HTMLTextAreaElement;
    syncGrowFieldCollapsed(el, false);
    el.scrollTop = 0;
  }

  function onGrowInput(e: Event) {
    const el = e.currentTarget as HTMLTextAreaElement;
    syncGrowFieldCollapsed(el, document.activeElement === el);
  }

  function commit(next: KvRow[]) {
    onchange(next);
  }

  function updateRow(id: string, patch: Partial<KvRow>) {
    const list = rows ?? [];
    if (isPhantom(id)) {
      const created = { ...newKvRow(id), ...patch };
      phantomId = crypto.randomUUID();
      commit([...list, created]);
      return;
    }
    commit(list.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function removeRow(id: string) {
    if (isPhantom(id)) return;
    commit((rows ?? []).filter((r) => r.id !== id));
  }

  function rowsToBulk(list: KvRow[]): string {
    return list
      .filter((r) => r.key !== '' || r.value !== '')
      .map((r) => `${r.key}: ${r.value}`)
      .join('\n');
  }

  function bulkToRows(text: string): KvRow[] {
    const out: KvRow[] = [];
    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (!line) continue;
      const colon = line.indexOf(':');
      const eq = line.indexOf('=');
      let key: string;
      let value: string;
      if (colon >= 0 && (eq < 0 || colon <= eq)) {
        key = line.slice(0, colon).trim();
        value = line.slice(colon + 1).trim();
      } else if (eq >= 0) {
        key = line.slice(0, eq).trim();
        value = line.slice(eq + 1).trim();
      } else {
        key = line;
        value = '';
      }
      out.push(newKvRow(crypto.randomUUID(), key, value));
    }
    return out;
  }

  function enterBulk() {
    bulkText = rowsToBulk(rows ?? []);
    bulk = true;
  }

  function leaveBulk() {
    commit(bulkToRows(bulkText));
    bulk = false;
  }

  function toggleBulk() {
    if (bulk) leaveBulk();
    else enterBulk();
  }
</script>

<div class="kv-table">
  <div class="kv-head">
    {#if title}<h3 class="kv-title">{title}</h3>{/if}
    <button type="button" class="btn text bulk-toggle" onclick={toggleBulk}>
      {bulk ? 'Key / Value' : 'Bulk Edit'}
    </button>
  </div>

  {#if bulk}
    <textarea
      class="bulk-editor"
      rows="6"
      spellcheck="false"
      placeholder={'key: value\nkey=value'}
      value={bulkText}
      oninput={(e) => (bulkText = (e.currentTarget as HTMLTextAreaElement).value)}
    ></textarea>
    <p class="muted bulk-hint">One per line — <code>key: value</code> or <code>key=value</code>.</p>
  {:else}
    <div class="kv-cols muted" aria-hidden="true">
      <span></span>
      <span>Key</span>
      <span>Value</span>
      <span></span>
    </div>
    {#each displayRows as row (row.id)}
      <div class="kv">
        <input
          type="checkbox"
          title="Enabled"
          aria-label="Enabled"
          checked={row.enabled !== false}
          onchange={(e) => updateRow(row.id, { enabled: (e.currentTarget as HTMLInputElement).checked })}
        />
        <input
          placeholder={keyPlaceholder}
          value={row.key}
          oninput={(e) => updateRow(row.id, { key: (e.currentTarget as HTMLInputElement).value })}
        />
        <textarea
          class="grow-field collapsed"
          rows="1"
          placeholder="Value"
          value={row.value}
          onfocus={onGrowFocus}
          onblur={onGrowBlur}
          oninput={(e) => {
            updateRow(row.id, { value: (e.currentTarget as HTMLTextAreaElement).value });
            onGrowInput(e);
          }}
        ></textarea>
        {#if isPhantom(row.id)}
          <span class="kv-spacer" aria-hidden="true"></span>
        {:else}
          <button type="button" class="btn text" aria-label="Remove row" onclick={() => removeRow(row.id)}>×</button>
        {/if}
      </div>
    {/each}
  {/if}
</div>

<style>
  .kv-table {
    display: grid;
    gap: var(--space-2);
    min-width: 0;
  }
  .kv-head {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    align-items: center;
    justify-content: space-between;
  }
  .kv-title {
    margin: 0;
    font-size: 0.85rem;
    font-weight: 650;
  }
  .bulk-toggle {
    margin-left: auto;
  }
  .kv-cols,
  .kv {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) minmax(0, 1fr) auto;
    gap: var(--space-2);
    align-items: start;
  }
  .kv-cols {
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 0 0.15rem;
  }
  .kv input,
  .kv textarea.grow-field {
    width: 100%;
    min-width: 0;
  }
  .kv-spacer {
    display: inline-block;
    width: 1.5rem;
  }
  .bulk-editor {
    width: 100%;
    min-height: 8rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.8125rem;
    resize: vertical;
  }
  .bulk-hint {
    margin: 0;
    font-size: 0.75rem;
  }
  .bulk-hint code {
    font-size: 0.7rem;
  }
</style>
