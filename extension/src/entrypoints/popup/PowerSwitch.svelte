<script lang="ts">
  let { checked, onchange }: { checked: boolean; onchange: (next: boolean) => void } = $props();
</script>

<div class="power">
  <span id="power-label">Enabled</span>
  <button type="button" role="switch" aria-checked={checked} aria-labelledby="power-label" onclick={() => onchange(!checked)}>
    <span class="thumb" aria-hidden="true"></span>
    <span class="state" aria-hidden="true">{checked ? 'On' : 'Off'}</span>
  </button>
</div>

<style>
  .power {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  button {
    position: relative;
    display: flex;
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
