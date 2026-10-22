<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    id,
    label,
    hint = '',
    error = '',
    warning = '',
    children,
  }: {
    id: string;
    label: string;
    hint?: string;
    error?: string;
    warning?: string;
    children: Snippet<[{ describedby: string | undefined; invalid: boolean }]>;
  } = $props();

  const describedby = $derived([hint && `${id}-hint`, error && `${id}-error`, warning && `${id}-warning`].filter(Boolean).join(' ') || undefined);
</script>

<div class="field">
  <label for={id}>{label}</label>
  {@render children({ describedby, invalid: error !== '' })}
  {#if error}<p id="{id}-error" class="message error"><strong>Error:</strong> {error}</p>{/if}
  {#if warning}<p id="{id}-warning" class="message warning"><strong>Warning:</strong> {warning}</p>{/if}
  {#if hint}<p id="{id}-hint" class="message hint">{hint}</p>{/if}
</div>

<style>
  .field {
    display: grid;
    gap: var(--space-1);
    min-width: 0;
    /* Keep label/control top-aligned when a sibling field is taller (hints/errors). */
    align-self: start;
    align-content: start;
  }

  label {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-muted);
  }

  .message {
    font-size: 0.8rem;
  }

  .hint {
    color: var(--text-muted);
  }

  .error {
    color: var(--danger);
  }

  .warning {
    color: var(--warning);
  }
</style>
