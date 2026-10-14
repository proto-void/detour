<script lang="ts">
  import { tick } from 'svelte';
  import type { Rule, Workspace } from '../../rule-model/schema';
  import { announce } from '../../ui/announcer.svelte';
  import Icon from '../../ui/icons/Icon.svelte';
  import Switch from '../../ui/Switch.svelte';
  import {
    duplicateRule,
    moveRule,
    removeRule,
    ruleTargetSummary,
    type RuleStatus,
    type RuleValidation,
  } from '../../workspace-ui/editor';
  import ActionBadge from './ActionBadge.svelte';

  let {
    rule,
    groupId,
    index,
    count,
    validation,
    status,
    showAll,
    detailOpen,
    selected,
    onopen,
    ontoggledetail,
    edit,
    set,
  }: {
    rule: Rule;
    groupId: string;
    index: number;
    count: number;
    validation: RuleValidation;
    status: RuleStatus;
    showAll: boolean;
    detailOpen: boolean;
    selected: boolean;
    onopen: () => void;
    ontoggledetail: () => void;
    edit: (fn: (ws: Workspace) => Workspace) => void;
    set: (patch: Partial<Rule>) => void;
  } = $props();

  const id = $derived(`rule-${rule.id}`);
  let menuOpen = $state(false);
  let menuRoot: HTMLElement | undefined = $state();

  const STATUS_LABEL: Record<RuleStatus['kind'], string> = {
    unsaved: 'Unsaved',
    off: 'Off',
    pending: 'Applying',
    'detour-off': 'Detour is off',
    applied: 'Applied',
    refused: 'Refused',
    failing: 'Failing',
    'not-applied': 'Not applied',
  };

  const statusTitle = $derived.by(() => {
    const base = STATUS_LABEL[status.kind];
    if (status.kind === 'refused') return `${base}: ${status.label}`;
    if (status.kind === 'off' && status.because === 'group') return `${base} (group)`;
    if (status.kind === 'failing') return `${base}: ${status.message}`;
    return base;
  });

  const statusClass = $derived(
    status.kind === 'refused' || status.kind === 'failing'
      ? status.kind === 'failing'
        ? 'failing'
        : 'refused'
      : status.kind === 'unsaved' || status.kind === 'pending'
        ? status.kind === 'pending'
          ? 'pending'
          : 'unsaved'
        : status.kind === 'applied'
          ? 'applied'
          : status.kind === 'off' || status.kind === 'detour-off' || status.kind === 'not-applied'
            ? status.kind === 'off'
              ? 'off'
              : status.kind
            : 'off',
  );

  const rowError = $derived(
    (showAll || rule.match.pattern !== '' ? validation.errors['match.pattern'] : '') ||
      (rule.action.type === 'redirect' && (showAll || rule.action.to !== '') ? validation.errors['action.to'] : '') ||
      (rule.action.type === 'serveLocal' && (showAll || rule.action.path !== '') ? validation.errors['action.path'] : '') ||
      validation.errors['action.body'] ||
      validation.errors['action.source.code'] ||
      '',
  );

  async function moveBy(delta: number) {
    menuOpen = false;
    edit((ws) => moveRule(ws, groupId, rule.id, delta));
    announce(`Rule moved to position ${index + 1 + delta} of ${count}. Save to apply.`);
  }

  function duplicate() {
    menuOpen = false;
    edit((ws) => duplicateRule(ws, groupId, rule.id, () => crypto.randomUUID()));
    announce('Rule duplicated. Save to apply.');
  }

  async function remove() {
    menuOpen = false;
    edit((ws) => removeRule(ws, groupId, rule.id));
    announce('Rule deleted. Save to apply, or discard changes to undo.');
    await tick();
    document.getElementById(`group-${groupId}-add-rule`)?.focus();
  }

  function onDocPointer(e: PointerEvent) {
    if (!menuOpen || !menuRoot) return;
    if (e.target instanceof Node && !menuRoot.contains(e.target)) menuOpen = false;
  }

  $effect(() => {
    if (!menuOpen) return;
    document.addEventListener('pointerdown', onDocPointer, true);
    return () => document.removeEventListener('pointerdown', onDocPointer, true);
  });

  function onRowKey(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onopen();
    }
  }

  function onContext(e: MouseEvent) {
    e.preventDefault();
    menuOpen = true;
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
  class="row"
  class:off={!rule.enabled}
  class:unsaved={status.kind === 'unsaved'}
  class:selected
  role="button"
  tabindex="0"
  data-testid="rule-row"
  aria-label="Edit rule {index + 1}: {rule.match.pattern || 'empty pattern'}"
  onclick={(e) => {
    const t = e.target as HTMLElement;
    if (t.closest('button, [role=switch], a, input, .menu-wrap')) return;
    onopen();
  }}
  onkeydown={onRowKey}
  oncontextmenu={onContext}
>
  <span class="grip" aria-hidden="true" data-testid="rule-grip" draggable="true" title="Drag to reorder">
    <Icon name="grip" />
  </span>

  <ActionBadge type={rule.action.type} />

  <div class="path mono">
    <strong class="pattern">{rule.match.pattern || 'Empty pattern'}</strong>
    {#if rule.action.type !== 'block'}
      <span class="arrow" aria-hidden="true">→</span>
      <span class="target muted">{ruleTargetSummary(rule)}</span>
    {:else}
      <span class="arrow" aria-hidden="true">→</span>
      <span class="target muted">blocked</span>
    {/if}
  </div>

  <span
    class="status-pill {statusClass}"
    data-testid="rule-status"
    data-status={status.kind}
    title={statusTitle}
  >
    <span class="dot" aria-hidden="true"></span>
    {status.kind === 'refused' ? `Refused: ${status.label}` : status.kind === 'failing' ? 'Failing' : STATUS_LABEL[status.kind]}
  </span>

  <Switch checked={rule.enabled} label="Rule {index + 1} on" onchange={(enabled) => set({ enabled })} />

  <div class="menu-wrap" bind:this={menuRoot}>
    <button
      type="button"
      class="btn icon"
      id="{id}-menu"
      aria-label="Rule {index + 1} menu"
      aria-haspopup="menu"
      aria-expanded={menuOpen}
      data-testid="rule-menu"
      onclick={() => (menuOpen = !menuOpen)}
    >
      <Icon name="kebab" />
    </button>
    {#if menuOpen}
      <ul class="menu" role="menu">
        <li role="none">
          <button type="button" role="menuitem" id="{id}-up" disabled={index === 0} onclick={() => moveBy(-1)}>Move up</button>
        </li>
        <li role="none">
          <button type="button" role="menuitem" id="{id}-down" disabled={index === count - 1} onclick={() => moveBy(1)}>Move down</button>
        </li>
        <li role="none">
          <button type="button" role="menuitem" onclick={duplicate}>Duplicate</button>
        </li>
        <li role="none">
          <button type="button" role="menuitem" class="danger" onclick={remove}>Delete</button>
        </li>
      </ul>
    {/if}
  </div>

  <button
    type="button"
    class="btn icon chevron"
    id="{id}-summary"
    aria-expanded={detailOpen}
    aria-controls="{id}-detail"
    aria-label="{detailOpen ? 'Hide' : 'Show'} rule {index + 1} detail"
    onclick={ontoggledetail}
  >
    <Icon name="chevron" />
  </button>
</div>

{#if rowError}
  <p id="{id}-row-error" class="row-error"><strong>Error:</strong> {rowError}</p>
{/if}

<style>
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
    padding: var(--space-2) var(--space-2) var(--space-2) var(--space-1);
    border: 1px solid transparent;
    border-radius: var(--radius);
    cursor: pointer;
  }

  .row:hover,
  .row.selected {
    background: var(--surface-2);
    border-color: var(--border);
  }

  .row.unsaved {
    border-left: 3px solid var(--status-unsaved);
    background: var(--status-unsaved-bg);
  }

  .row.off {
    opacity: 0.72;
  }

  .grip {
    display: inline-flex;
    color: var(--text-muted);
    cursor: grab;
  }

  .path {
    display: flex;
    flex: 1 1 12rem;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--space-1);
    min-width: 0;
  }

  .pattern {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 650;
  }

  .arrow {
    color: var(--text-muted);
  }

  .target {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .menu-wrap {
    position: relative;
    flex-shrink: 0;
  }

  .menu {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    z-index: 20;
    display: grid;
    min-width: 8rem;
    margin: 0;
    padding: var(--space-1);
    list-style: none;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: var(--shadow-2);
  }

  .menu button {
    display: block;
    width: 100%;
    padding: var(--space-1) var(--space-2);
    border: 0;
    border-radius: calc(var(--radius) - 2px);
    background: transparent;
    color: var(--text);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .menu button:hover:not(:disabled) {
    background: var(--accent-tint);
  }

  .menu button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .menu button.danger:hover:not(:disabled) {
    color: var(--danger);
  }

  .chevron {
    flex-shrink: 0;
    color: var(--text-muted);
  }

  .chevron :global(.icon) {
    transform: rotate(90deg);
  }

  .row-error {
    margin: var(--space-1) 0 0;
    font-size: 0.8rem;
    color: var(--danger);
  }
</style>
