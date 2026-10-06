<script lang="ts">
  import { browser } from 'wxt/browser';
  import type { StorageAreaLike } from '../../rule-model/storage';
  import { importIntoStorage, type ImportSummary } from '../../workspace-ui/import-flow';

  let { area, inTab }: { area: StorageAreaLike; inTab: boolean } = $props();

  let input: HTMLInputElement | undefined = $state();
  let busy = $state(false);
  let summary: ImportSummary | undefined = $state();

  // Firefox closes the popup as soon as a file picker opens, so pick the file from a tab instead.
  const pickInTab = $derived(import.meta.env.FIREFOX && !inTab);

  async function choose() {
    if (pickInTab) {
      await browser.tabs.create({ url: `${browser.runtime.getURL('/popup.html')}?view=tab` });
      window.close();
      return;
    }
    input?.click();
  }

  async function onFile(event: Event & { currentTarget: HTMLInputElement }) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    busy = true;
    summary = undefined;
    try {
      summary = await importIntoStorage(await file.text(), area);
    } catch (e) {
      summary = { ok: false, errors: [`Could not read ${file.name}: ${(e as Error).message}`] };
    } finally {
      busy = false;
      event.currentTarget.value = '';
    }
  }

  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
</script>

<section aria-labelledby="import-heading">
  <div class="row">
    <div>
      <h2 id="import-heading">Import</h2>
      <p class="muted">Resource Override or Detour export (.json)</p>
    </div>
    <button type="button" class="secondary" onclick={choose} disabled={busy} aria-busy={busy}>
      {busy ? 'Importing…' : pickInTab ? 'Open importer…' : 'Choose file…'}
    </button>
  </div>
  <input bind:this={input} type="file" accept=".json,application/json" hidden onchange={onFile} data-testid="import-file" />

  <div aria-live="polite" class="result">
    {#if summary?.ok}
      <p>
        Imported {plural(summary.rules, 'rule')} in {plural(summary.groups, 'group')}
        <span class="muted">({summary.source === 'detour' ? 'Detour' : 'Resource Override'})</span>.
      </p>
      {#if summary.skipped.length > 0}
        <details>
          <summary>{plural(summary.skipped.length, 'rule')} skipped</summary>
          <ul>
            {#each summary.skipped as notice, i (i)}
              <li><strong>Group {notice.group + 1}{notice.rule === undefined ? '' : `, rule ${notice.rule + 1}`}:</strong> {notice.message}</li>
            {/each}
          </ul>
        </details>
      {/if}
      {#if summary.warnings.length > 0}
        <details open>
          <summary class="warning">{plural(summary.warnings.length, 'warning')}</summary>
          <ul>
            {#each summary.warnings as notice, i (i)}
              <li>{notice.message}</li>
            {/each}
          </ul>
        </details>
      {/if}
    {:else if summary}
      <div role="alert" class="error">
        <p><strong>Import failed.</strong> Nothing was changed.</p>
        <ul>
          {#each summary.errors as error, i (i)}
            <li><code>{error}</code></li>
          {/each}
        </ul>
      </div>
    {/if}
  </div>
</section>

<style>
  section {
    display: grid;
    gap: var(--space-2);
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .secondary {
    flex-shrink: 0;
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    cursor: pointer;
  }

  .secondary:hover:not(:disabled) {
    border-color: var(--text-muted);
  }

  .secondary:disabled {
    cursor: progress;
    opacity: 0.7;
  }

  .result:empty {
    display: none;
  }

  .result {
    display: grid;
    gap: var(--space-2);
  }

  ul {
    padding-left: var(--space-4);
  }

  li + li {
    margin-top: var(--space-1);
  }

  .warning {
    color: var(--warning);
  }

  .error {
    color: var(--danger);
  }
</style>
