<script lang="ts">
  import { tick } from 'svelte';
  import Icon from './icons/Icon.svelte';

  let {
    open,
    title,
    docked = true,
    onclose,
    head,
    footer,
    children,
  }: {
    open: boolean;
    title: string;
    /** Wide screens: dock beside the list. Narrow: overlay. */
    docked?: boolean;
    onclose: () => void;
    head?: import('svelte').Snippet;
    footer?: import('svelte').Snippet;
    children: import('svelte').Snippet;
  } = $props();

  let panel: HTMLElement | undefined = $state();
  let previouslyFocused: HTMLElement | null = null;

  const FOCUSABLE =
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"]), .cm-content';

  function focusables(): HTMLElement[] {
    if (!panel) return [];
    return [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !el.hasAttribute('disabled') && el.tabIndex !== -1);
  }

  $effect(() => {
    if (!open) return;
    previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    void tick().then(() => {
      const first = focusables()[0];
      (first ?? panel)?.focus();
    });
    return () => {
      previouslyFocused?.focus?.();
      previouslyFocused = null;
    };
  });

  function onKeydown(e: KeyboardEvent) {
    if (!open) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      onclose();
      return;
    }
    if (e.key !== 'Tab' || !panel) return;
    const items = focusables();
    if (items.length === 0) {
      e.preventDefault();
      panel.focus();
      return;
    }
    const first = items[0]!;
    const last = items[items.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="shell"
    class:docked
    class:overlay={!docked}
    data-testid="drawer"
    role="presentation"
    onclick={(e) => !docked && e.target === e.currentTarget && onclose()}
    onkeydown={onKeydown}
  >
    <div
      class="panel"
      role="dialog"
      aria-modal={!docked}
      aria-label={title}
      tabindex="-1"
      bind:this={panel}
      onkeydown={onKeydown}
    >
      <header class="head">
        {#if head}
          {@render head()}
        {:else}
          <h2 class="title">{title}</h2>
        {/if}
        <button type="button" class="btn icon" aria-label="Close" onclick={onclose}>
          <Icon name="x" />
        </button>
      </header>
      <div class="body">
        {@render children()}
      </div>
      {#if footer}
        <footer class="foot">
          {@render footer()}
        </footer>
      {/if}
    </div>
  </div>
{/if}

<style>
  /* Above options sticky header (50); below toast (60). */
  .shell.overlay {
    position: fixed;
    inset: 0;
    z-index: 55;
    display: flex;
    justify-content: flex-end;
    background: color-mix(in srgb, var(--text) 28%, transparent);
  }

  /* Sit below the sticky options bar (App sets --options-sticky-offset). Fallback ≈ one-line bar. */
  .shell.docked {
    position: fixed;
    top: var(--options-sticky-offset, 3.5rem);
    right: 0;
    bottom: 0;
    z-index: 30;
    width: min(26.25rem, 100%);
    pointer-events: none;
  }

  .shell.docked .panel {
    pointer-events: auto;
  }

  .panel {
    display: flex;
    flex-direction: column;
    width: 100%;
    max-width: 100%;
    height: 100%;
    background: var(--surface);
    border-left: 1px solid var(--border);
    box-shadow: var(--shadow-2);
    outline: none;
  }

  .shell.overlay .panel {
    width: min(26.25rem, 100%);
  }

  .head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-3);
    flex-shrink: 0;
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--border);
  }

  .head > :global(:first-child) {
    flex: 1;
    min-width: 0;
  }

  .title {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
  }

  .body {
    display: grid;
    gap: var(--space-3);
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: var(--space-4);
    /* Auto rows must not stretch to fill the tall panel (tab pills grew full-height). */
    align-content: start;
  }

  .foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
    border-top: 1px solid var(--border);
    background: var(--surface-2);
  }
</style>
