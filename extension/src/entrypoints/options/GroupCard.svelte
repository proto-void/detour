<script lang="ts">
  import { tick } from 'svelte';
  import type { Group, Workspace } from '../../rule-model/schema';
  import { announce } from '../../ui/announcer.svelte';
  import Icon from '../../ui/icons/Icon.svelte';
  import Switch from '../../ui/Switch.svelte';
  import {
    addRule,
    domainsText,
    moveGroup,
    moveRuleToIndex,
    newRule,
    normalizeDomains,
    removeGroup,
    ruleStatus,
    updateGroup,
    type FieldMessages,
    type StatusContext,
    type WorkspaceValidation,
  } from '../../workspace-ui/editor';
  import RuleEditor from './RuleEditor.svelte';

  let {
    group,
    index,
    count,
    errors,
    validation,
    statusContext,
    showAll,
    topDomainsSupported,
    bodyRewriteAllowed,
    saved,
    visibleRuleIds,
    filterActive,
    edit,
    onruleadded,
  }: {
    group: Group;
    index: number;
    count: number;
    errors: FieldMessages;
    validation: WorkspaceValidation;
    statusContext: StatusContext;
    showAll: boolean;
    topDomainsSupported: boolean;
    bodyRewriteAllowed: boolean;
    saved: Workspace | undefined;
    visibleRuleIds: string[];
    filterActive: boolean;
    edit: (fn: (ws: Workspace) => Workspace) => void;
    onruleadded?: (ruleId: string) => void;
  } = $props();

  const id = $derived(`group-${group.id}`);
  let collapsed = $state(false);
  let menuOpen = $state(false);
  let menuRoot: HTMLElement | undefined = $state();
  let editingSites = $state(false);
  let openSignals = $state<Record<string, number>>({});
  let dragRuleId = $state<string | null>(null);

  let sitesFocused = $state(false);
  let sitesText = $state('');
  $effect.pre(() => {
    const text = domainsText(group.pageDomains);
    if (!sitesFocused) sitesText = text;
  });

  const visibleRules = $derived(group.rules.filter((r) => visibleRuleIds.includes(r.id)));
  const hiddenCount = $derived(Math.max(0, visibleRules.length - 1));

  function setSites(text: string) {
    sitesText = text;
    edit((ws) => updateGroup(ws, group.id, { pageDomains: normalizeDomains(text) }));
  }

  async function moveBy(delta: number) {
    menuOpen = false;
    edit((ws) => moveGroup(ws, group.id, delta));
    announce(`Group moved to position ${index + 1 + delta} of ${count}. Save to apply.`);
  }

  async function remove() {
    menuOpen = false;
    edit((ws) => removeGroup(ws, group.id));
    announce(`Group "${group.name}" deleted. Save to apply, or discard changes to undo.`);
    await tick();
    document.getElementById('add-group')?.focus();
  }

  async function addNewRule() {
    const rule = newRule(() => crypto.randomUUID());
    edit((ws) => addRule(ws, group.id, rule));
    collapsed = false;
    openSignals = { ...openSignals, [rule.id]: (openSignals[rule.id] ?? 0) + 1 };
    onruleadded?.(rule.id);
    await tick();
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

  function onDragStart(e: DragEvent, ruleId: string) {
    dragRuleId = ruleId;
    e.dataTransfer?.setData('text/plain', ruleId);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  }

  function onDrop(e: DragEvent, targetId: string) {
    e.preventDefault();
    const fromId = dragRuleId ?? e.dataTransfer?.getData('text/plain');
    dragRuleId = null;
    if (!fromId || fromId === targetId) return;
    const toIndex = group.rules.findIndex((r) => r.id === targetId);
    if (toIndex < 0) return;
    edit((ws) => moveRuleToIndex(ws, group.id, fromId, toIndex));
  }
</script>

<section class="group" class:off={!group.enabled} class:collapsed aria-labelledby="{id}-heading">
  <header class="head">
    <button
      type="button"
      class="btn icon chevron"
      aria-expanded={!collapsed}
      aria-controls="{id}-body"
      aria-label="{collapsed ? 'Expand' : 'Collapse'} group {group.name || index + 1}"
      onclick={() => (collapsed = !collapsed)}
    >
      <Icon name="chevron" />
    </button>
    <Icon name="layers" />
    <h2 id="{id}-heading" class="visually-hidden">Group: {group.name || 'Untitled'}</h2>
    <label class="visually-hidden" for="{id}-name">Group name</label>
    <input
      id="{id}-name"
      class="name"
      type="text"
      placeholder="Group name"
      value={group.name}
      oninput={(e) => edit((ws) => updateGroup(ws, group.id, { name: e.currentTarget.value }))}
    />
    <span class="pill">{group.rules.length} rule{group.rules.length === 1 ? '' : 's'}</span>
    {#if group.importedFrom}
      <span class="pill" title="Importing {group.importedFrom.file} again replaces this group">Imported</span>
    {/if}
    <span class="spacer"></span>
    <Switch checked={group.enabled} label="Group {group.name || index + 1} on" onchange={(enabled) => edit((ws) => updateGroup(ws, group.id, { enabled }))} />
    <div class="menu-wrap" bind:this={menuRoot}>
      <button
        type="button"
        class="btn icon"
        aria-label="Group {group.name || index + 1} menu"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onclick={() => (menuOpen = !menuOpen)}
      >
        <Icon name="kebab" />
      </button>
      {#if menuOpen}
        <ul class="menu" role="menu">
          <li role="none">
            <button
              type="button"
              role="menuitem"
              onclick={() => {
                menuOpen = false;
                void tick().then(() => {
                  const input = document.getElementById(`${id}-name`) as HTMLInputElement | null;
                  input?.focus();
                  input?.select();
                });
              }}
            >
              Rename
            </button>
          </li>
          <li role="none">
            <button
              type="button"
              role="menuitem"
              onclick={() => {
                menuOpen = false;
                editingSites = true;
                collapsed = false;
              }}
            >
              Edit sites…
            </button>
          </li>
          <li role="none">
            <button type="button" role="menuitem" id="{id}-up" disabled={index === 0} onclick={() => moveBy(-1)}>Move up</button>
          </li>
          <li role="none">
            <button type="button" role="menuitem" id="{id}-down" disabled={index === count - 1} onclick={() => moveBy(1)}>Move down</button>
          </li>
          <li role="none">
            <button type="button" role="menuitem" class="danger" onclick={remove}>Delete group</button>
          </li>
        </ul>
      {/if}
    </div>
  </header>

  {#if group.pageDomains?.length && !editingSites}
    <p class="sites muted">Only on {group.pageDomains.join(', ')}</p>
  {/if}

  <div id="{id}-body">
    {#if editingSites}
      <div class="sites-edit">
        <label for="{id}-sites">Only on these sites</label>
        <input
          id="{id}-sites"
          type="text"
          spellcheck="false"
          autocomplete="off"
          placeholder="All sites"
          value={sitesText}
          aria-invalid={errors.pageDomains ? 'true' : undefined}
          onfocus={() => (sitesFocused = true)}
          onblur={() => {
            sitesFocused = false;
            sitesText = domainsText(group.pageDomains);
            editingSites = false;
          }}
          oninput={(e) => setSites(e.currentTarget.value)}
        />
        {#if errors.pageDomains}
          <p class="err">{errors.pageDomains}</p>
        {:else if group.pageDomains && !topDomainsSupported}
          <p class="warn">
            This browser can only check the frame that made a request, so requests from cross-site iframes on these sites aren't covered (Chrome 145+ covers them).
          </p>
        {/if}
      </div>
    {/if}

    {#if visibleRules.length > 0}
      <ol class="rules" aria-label="Rules in {group.name || 'this group'}, highest priority first">
        {#each (collapsed ? visibleRules.slice(0, 1) : visibleRules) as rule (rule.id)}
          {@const realIndex = group.rules.findIndex((r) => r.id === rule.id)}
          <li ondragover={(e) => e.preventDefault()} ondrop={(e) => onDrop(e, rule.id)}>
            <div role="presentation" ondragstart={(e) => onDragStart(e, rule.id)}>
              <RuleEditor
                {rule}
                groupId={group.id}
                index={realIndex}
                count={group.rules.length}
                validation={validation.rules[rule.id] ?? { errors: {}, warnings: {} }}
                status={ruleStatus(rule, statusContext)}
                userScriptsReady={statusContext.userScriptsReady ?? true}
                {bodyRewriteAllowed}
                {showAll}
                {saved}
                openSignal={openSignals[rule.id] ?? 0}
                {edit}
              />
            </div>
          </li>
        {/each}
      </ol>
      {#if collapsed && hiddenCount > 0}
        <button type="button" class="btn text more" onclick={() => (collapsed = false)}>
          +{hiddenCount} more rule{hiddenCount === 1 ? '' : 's'}, click to expand
        </button>
      {/if}
    {:else if filterActive}
      <p class="muted">No matches in this group.</p>
    {:else if !collapsed}
      <p class="muted">No rules in this group yet.</p>
    {/if}

    {#if !collapsed}
      <div class="add">
        <button type="button" class="btn" id="{id}-add-rule" onclick={addNewRule}>+ Add rule</button>
      </div>
    {/if}
  </div>
</section>

<style>
  .group {
    display: grid;
    gap: var(--space-2);
    padding: var(--space-3);
    border: 1px solid var(--border);
    border-radius: calc(var(--radius) * 1.5);
    background: var(--surface);
    box-shadow: var(--shadow-1);
  }

  .group.off {
    border-style: dashed;
  }

  .head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
  }

  .chevron :global(.icon) {
    transform: rotate(90deg);
  }

  .group.collapsed .chevron :global(.icon) {
    transform: rotate(0deg);
  }

  .name {
    flex: 1;
    min-width: 0;
    margin: 0;
    padding: var(--space-1) var(--space-2);
    border: 1px solid transparent;
    border-radius: var(--radius);
    background: transparent;
    font-size: 1rem;
    font-weight: 650;
    color: var(--text);
  }

  .name:hover,
  .name:focus {
    border-color: var(--border);
    background: var(--bg);
  }

  .spacer {
    flex: 0 0 auto;
  }

  .sites {
    margin: 0;
    padding-left: 2.25rem;
    font-size: 0.8rem;
  }

  .sites-edit {
    display: grid;
    gap: var(--space-1);
    padding-left: 2.25rem;
  }

  .sites-edit label {
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .err {
    margin: 0;
    color: var(--danger);
    font-size: 0.8rem;
  }

  .warn {
    margin: 0;
    color: var(--warning);
    font-size: 0.8rem;
  }

  .menu-wrap {
    position: relative;
  }

  .menu {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    z-index: 20;
    display: grid;
    min-width: 9rem;
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

  .rules {
    display: grid;
    gap: 0;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .rules > li {
    border-top: 1px solid var(--border);
  }

  .rules > li:first-child {
    border-top: 0;
  }

  .more,
  .add {
    margin-top: var(--space-1);
  }
</style>
