<script lang="ts">
  import { tick } from 'svelte';
  import { browser } from 'wxt/browser';
  import type { StorageAreaLike } from '../../rule-model/storage';
  import { importIntoStorage, type ImportSummary, type NameOnlyChoice } from '../../workspace-ui/import-flow';

  let { area, inTab }: { area: StorageAreaLike; inTab: boolean } = $props();

  let input: HTMLInputElement | undefined = $state();
  let busy = $state(false);
  let summary: ImportSummary | undefined = $state();
  let confirm: { file: string; groups: number; answer: (choice: NameOnlyChoice) => void } | undefined = $state();

  async function askNameOnly(info: { file: string; groups: number }): Promise<NameOnlyChoice> {
    const choice = new Promise<NameOnlyChoice>((resolve) => (confirm = { ...info, answer: resolve }));
    await tick();
    document.getElementById('confirm-replace')?.focus();
    const answer = await choice;
    confirm = undefined;
    return answer;
  }

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
    // currentTarget is null once the handler awaits; keep the element to reset it.
    const picker = event.currentTarget;
    const file = picker.files?.[0];
    if (!file) return;
    busy = true;
    summary = undefined;
    try {
      summary = await importIntoStorage(await file.text(), area, { fileName: file.name, onNameOnlyMatch: askNameOnly });
    } catch (e) {
      summary = { ok: false, errors: [`Could not read ${file.name}: ${(e as Error).message}`] };
    } finally {
      busy = false;
      // Clearing lets the same file be picked again (a repeat import).
      picker.value = '';
    }
  }

  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
</script>

<section aria-labelledby="import-heading">
  <div class="row">
    <div>
      <h2 id="import-heading">Import</h2>
      <p class="muted">Detour or legacy export (.json)</p>
    </div>
    <button type="button" class="secondary" onclick={choose} disabled={busy} aria-busy={busy}>
      {busy ? 'Importing…' : pickInTab ? 'Open importer…' : 'Choose file…'}
    </button>
  </div>
  <input bind:this={input} type="file" accept=".json,application/json" hidden onchange={onFile} data-testid="import-file" />

  {#if confirm}
    {@const answer = confirm.answer}
    <div
      class="confirm"
      role="alertdialog"
      aria-modal="false"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-desc"
      tabindex="-1"
      onkeydown={(e) => e.key === 'Escape' && answer('cancel')}
    >
      <p id="confirm-title"><strong>Replace the earlier import of {confirm.file}?</strong></p>
      <p id="confirm-desc" class="muted">
        A different file with this name was imported before ({plural(confirm.groups, 'group')}). Replacing keeps your on/off switches; importing as new keeps both.
      </p>
      <div class="choices">
        <button type="button" class="btn primary" id="confirm-replace" onclick={() => answer('replace')}>Replace</button>
        <button type="button" class="btn" onclick={() => answer('new')}>Import as new</button>
        <button type="button" class="btn" onclick={() => answer('cancel')}>Cancel</button>
      </div>
    </div>
  {/if}

  <div aria-live="polite" class="result">
    {#if summary?.ok}
      <p>
        Imported {plural(summary.rules, 'rule')} in {plural(summary.groups, 'group')}
        <span class="muted">({summary.source === 'detour' ? 'Detour' : 'legacy'})</span>.
        {#if summary.replaced > 0}
          Replaced {plural(summary.replaced, 'group')} from an earlier import of this file.
        {/if}
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
    {:else if summary && !summary.ok && summary.cancelled}
      <p class="muted">Import cancelled. Nothing was changed.</p>
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

  .confirm {
    display: grid;
    gap: var(--space-2);
    padding: var(--space-3);
    border: 1px solid var(--warning);
    border-radius: var(--radius);
    background: var(--surface);
  }

  .choices {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
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
