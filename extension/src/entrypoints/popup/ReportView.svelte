<script lang="ts">
  import { brandName } from '../../ui/brand';
  import type { ReportView } from '../../workspace-ui/report-view';

  let { view }: { view: ReportView } = $props();
</script>

<section aria-labelledby="rules-heading">
  <h2 id="rules-heading">Rules</h2>

  <div aria-live="polite">
    {#if view.state === 'pending'}
      <p class="muted">Applying rules…</p>
    {:else if view.state === 'disabled'}
      <p>{brandName} is off. No requests are being changed.</p>
    {:else if view.state === 'error'}
      <div role="alert" class="error">
        <p><strong>Rules could not be loaded.</strong> The rules already installed are left as they were.</p>
        <ul>
          {#each view.errors as error, i (i)}
            <li><code>{error}</code></li>
          {/each}
        </ul>
      </div>
    {:else if view.state === 'empty'}
      <div class="empty">
        <p><strong>Point production at your code.</strong></p>
        <p class="muted">No active rules yet. Import an export, or add a recipe.</p>
      </div>
    {:else}
      <p class="counts">
        <span><span class="dot ok" aria-hidden="true"></span>{view.applied.length} applied</span>
        <span><span class="dot bad" aria-hidden="true"></span>{view.refused.length} refused</span>
      </p>
    {/if}
  </div>

  {#if view.state === 'active'}
    {#if view.refused.length > 0}
      <h3>Refused</h3>
      <ul class="rules" aria-label="Refused rules">
        {#each view.refused as row, i (`${row.ruleId}-${i}`)}
          <li>
            <code>{row.summary}</code>
            <span class="reason">{row.reasonLabel}</span>
            <span class="muted">{row.message}</span>
          </li>
        {/each}
      </ul>
    {/if}
    {#if view.applied.length > 0}
      <details open={view.refused.length === 0}>
        <summary>Applied ({view.applied.length})</summary>
        <ul class="rules" aria-label="Applied rules">
          {#each view.applied as row (row.ruleId)}
            <li>
              <code>{row.summary}</code>
              {#if row.groupName}<span class="muted">{row.groupName}</span>{/if}
            </li>
          {/each}
        </ul>
      </details>
    {/if}
  {/if}
</section>

<style>
  section {
    display: grid;
    gap: var(--space-2);
  }

  h3 {
    margin: 0;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--danger);
  }

  .counts {
    display: flex;
    gap: var(--space-4);
  }

  .dot {
    display: inline-block;
    width: 0.5rem;
    height: 0.5rem;
    margin-right: var(--space-1);
    border-radius: 50%;
  }

  .dot.ok {
    background: var(--accent);
  }

  .dot.bad {
    background: var(--danger);
  }

  .rules {
    display: grid;
    gap: var(--space-2);
    padding: 0;
    list-style: none;
    max-height: 14rem;
    overflow-y: auto;
  }

  .rules li {
    display: grid;
    gap: 2px;
    padding: var(--space-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
  }

  .reason {
    font-weight: 600;
    color: var(--danger);
  }

  .empty {
    display: grid;
    gap: var(--space-1);
    padding: var(--space-3);
    border: 1px dashed var(--border);
    border-radius: var(--radius);
  }

  .error {
    color: var(--danger);
  }

  .error ul {
    padding-left: var(--space-4);
  }
</style>
