<script lang="ts">
  import type { Action } from '../../rule-model/schema';
  import { ACTION_INFO } from '../../workspace-ui/editor';
  import { actionIconName } from '../../ui/icons/actionIcon';
  import Icon from '../../ui/icons/Icon.svelte';

  let {
    type,
    ruleId,
    onchange,
  }: {
    type: Action['type'];
    ruleId: string;
    onchange: (type: Action['type']) => void;
  } = $props();
</script>

<div
  class="chip-wrap"
  data-testid="action-chip"
  role="radiogroup"
  aria-labelledby="rule-{ruleId}-action-label"
>
  {#each ACTION_INFO as option (option.type)}
    <button
      type="button"
      role="radio"
      class="chip type-{option.type}"
      class:current={option.type === type}
      id={option.type === type ? `rule-${ruleId}-action` : undefined}
      data-action-type={option.type}
      aria-checked={option.type === type}
      title={option.description}
      onclick={() => onchange(option.type)}
    >
      <Icon name={actionIconName(option.type)} size={14} />
      <span>{option.label}</span>
    </button>
  {/each}
</div>

<style>
  .chip-wrap {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    min-height: 1.75rem;
    padding: 0 var(--space-2);
    border: 1px solid color-mix(in srgb, var(--chip) 40%, var(--border));
    border-radius: var(--radius-pill);
    background: color-mix(in srgb, var(--chip) 12%, var(--surface));
    color: var(--text-muted);
    font: inherit;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.02em;
    white-space: nowrap;
    cursor: pointer;
  }

  .chip.current {
    border-color: color-mix(in srgb, var(--chip) 70%, var(--border));
    background: color-mix(in srgb, var(--chip) 28%, var(--surface));
    color: var(--text);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--chip) 35%, transparent);
  }

  .chip:hover {
    color: var(--text);
    background: color-mix(in srgb, var(--chip) 22%, var(--surface));
  }

  .type-redirect {
    --chip: #3b82f6;
  }
  .type-block {
    --chip: #ef4444;
  }
  .type-modifyHeaders {
    --chip: #a855f7;
  }
  .type-injectJs {
    --chip: #eab308;
  }
  .type-injectCss {
    --chip: #14b8a6;
  }
  .type-mock {
    --chip: #f97316;
  }
  .type-overrideBody {
    --chip: var(--accent);
  }
  .type-serveLocal {
    --chip: #64748b;
  }
</style>
