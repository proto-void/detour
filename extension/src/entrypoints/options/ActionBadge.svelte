<script lang="ts">
  import type { Action } from '../../rule-model/schema';
  import { actionInfo } from '../../workspace-ui/editor';
  import { actionIconName } from '../../ui/icons/actionIcon';
  import Icon from '../../ui/icons/Icon.svelte';

  let { type }: { type: Action['type'] } = $props();
  const info = $derived(actionInfo(type));
</script>

<span class="badge type-{type}" title={info.description} data-testid="action-badge">
  <Icon name={actionIconName(type)} size={14} />
  <span>{info.label}</span>
</span>

<style>
  .badge {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    flex-shrink: 0;
    min-height: 1.75rem;
    padding: 0 var(--space-2);
    border: 1px solid color-mix(in srgb, var(--chip) 55%, var(--border));
    border-radius: var(--radius-pill);
    background: color-mix(in srgb, var(--chip) 22%, var(--surface));
    color: var(--text);
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.02em;
    white-space: nowrap;
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
