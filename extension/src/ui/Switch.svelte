<script lang="ts">
  let {
    checked,
    label,
    onchange,
    labelVisible = false,
    id,
  }: { checked: boolean; label: string; onchange: (next: boolean) => void; labelVisible?: boolean; id?: string } = $props();

  const uid = $props.id();
</script>

<div class="switch-wrap">
  {#if labelVisible}<span id="{uid}-label">{label}</span>{/if}
  <button
    {id}
    type="button"
    role="switch"
    class="switch"
    aria-checked={checked}
    aria-label={labelVisible ? undefined : label}
    aria-labelledby={labelVisible ? `${uid}-label` : undefined}
    onclick={() => onchange(!checked)}
  >
    <span class="thumb" aria-hidden="true"></span>
    <span class="state" aria-hidden="true">{checked ? 'On' : 'Off'}</span>
  </button>
</div>

<style>
  .switch-wrap {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
  }

  .switch {
    position: relative;
    display: flex;
    flex-shrink: 0;
    align-items: center;
    width: 3.25rem;
    height: 1.5rem;
    padding: 0 var(--space-2);
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--surface);
    cursor: pointer;
  }

  .thumb {
    position: absolute;
    left: 3px;
    width: 1.1rem;
    height: 1.1rem;
    border-radius: 50%;
    background: var(--text-muted);
    transition: transform 120ms ease;
  }

  .state {
    margin-left: auto;
    font-size: 0.7rem;
    font-weight: 600;
  }

  [aria-checked='true'] {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--accent-text);
  }

  [aria-checked='true'] .thumb {
    transform: translateX(1.75rem);
    background: var(--accent-text);
  }

  [aria-checked='true'] .state {
    margin-left: 0;
  }
</style>
