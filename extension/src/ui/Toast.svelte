<script lang="ts">
  import { onDestroy } from 'svelte';

  let {
    message,
    onundo,
    ondismiss,
    durationMs = 4000,
  }: {
    message: string;
    onundo?: () => void;
    ondismiss: () => void;
    durationMs?: number;
  } = $props();

  let timer: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    message;
    clearTimeout(timer);
    timer = setTimeout(ondismiss, durationMs);
    return () => clearTimeout(timer);
  });

  onDestroy(() => clearTimeout(timer));
</script>

<div class="toast" role="status" data-testid="toast">
  <p>{message}</p>
  {#if onundo}
    <button type="button" class="btn" data-testid="toast-undo" onclick={onundo}>Undo</button>
  {/if}
</div>

<style>
  .toast {
    position: fixed;
    right: var(--space-4);
    bottom: var(--space-4);
    z-index: 60;
    display: flex;
    align-items: center;
    gap: var(--space-3);
    max-width: min(24rem, calc(100vw - 2 * var(--space-4)));
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: 0 8px 24px color-mix(in srgb, var(--text) 18%, transparent);
  }

  p {
    margin: 0;
    font-size: 0.9rem;
  }
</style>
