<script lang="ts">
  import { tick } from 'svelte';
  import type { Group, Workspace } from '../../rule-model/schema';
  import { announce } from '../../ui/announcer.svelte';
  import Field from '../../ui/Field.svelte';
  import Switch from '../../ui/Switch.svelte';
  import {
    addRule,
    domainsText,
    moveGroup,
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
    edit,
  }: {
    group: Group;
    index: number;
    count: number;
    errors: FieldMessages;
    validation: WorkspaceValidation;
    statusContext: StatusContext;
    showAll: boolean;
    topDomainsSupported: boolean;
    edit: (fn: (ws: Workspace) => Workspace) => void;
  } = $props();

  const id = $derived(`group-${group.id}`);

  // Keep the raw text while typing so separators aren't normalized away mid-word.
  let sitesFocused = $state(false);
  let sitesText = $state('');
  $effect.pre(() => {
    const text = domainsText(group.pageDomains);
    if (!sitesFocused) sitesText = text;
  });

  function setSites(text: string) {
    sitesText = text;
    edit((ws) => updateGroup(ws, group.id, { pageDomains: normalizeDomains(text) }));
  }

  async function moveBy(delta: number) {
    edit((ws) => moveGroup(ws, group.id, delta));
    announce(`Group moved to position ${index + 1 + delta} of ${count}. Save to apply.`);
    await tick();
    const same = document.getElementById(`${id}-${delta < 0 ? 'up' : 'down'}`) as HTMLButtonElement | null;
    const other = document.getElementById(`${id}-${delta < 0 ? 'down' : 'up'}`) as HTMLButtonElement | null;
    (same && !same.disabled ? same : other)?.focus();
  }

  async function remove() {
    edit((ws) => removeGroup(ws, group.id));
    announce(`Group "${group.name}" deleted. Save to apply, or discard changes to undo.`);
    await tick();
    document.getElementById('add-group')?.focus();
  }

  async function addNewRule() {
    const rule = newRule(() => crypto.randomUUID());
    edit((ws) => addRule(ws, group.id, rule));
    await tick();
    document.getElementById(`rule-${rule.id}-pattern`)?.focus();
  }
</script>

<section class="group" class:off={!group.enabled} aria-labelledby="{id}-heading">
  <h2 id="{id}-heading" class="visually-hidden">Group: {group.name || 'Untitled'}</h2>
  <div class="head">
    <Switch checked={group.enabled} label="Group {group.name || index + 1} on" onchange={(enabled) => edit((ws) => updateGroup(ws, group.id, { enabled }))} />
    <label class="visually-hidden" for="{id}-name">Group name</label>
    <input
      id="{id}-name"
      class="name"
      type="text"
      placeholder="Group name"
      value={group.name}
      oninput={(e) => edit((ws) => updateGroup(ws, group.id, { name: e.currentTarget.value }))}
    />
    {#if group.importedFrom}
      <span class="badge" title="Importing {group.importedFrom.file} again replaces this group">Imported from {group.importedFrom.file}</span>
    {/if}
    <div class="tools">
      <button type="button" class="btn icon" id="{id}-up" aria-label="Move group {group.name} up" disabled={index === 0} onclick={() => moveBy(-1)}>↑</button>
      <button type="button" class="btn icon" id="{id}-down" aria-label="Move group {group.name} down" disabled={index === count - 1} onclick={() => moveBy(1)}>↓</button>
      <button type="button" class="btn danger" aria-label="Delete group {group.name}" onclick={remove}>Delete group</button>
    </div>
  </div>

  <Field
    id="{id}-sites"
    label="Only on these sites"
    hint="Hosts separated by commas, e.g. example.com, localhost. Subdomains are included. Leave empty for every site."
    error={errors.pageDomains ?? ''}
    warning={group.pageDomains && !topDomainsSupported
      ? "This browser can only check the frame that made a request, so requests from cross-site iframes on these sites aren't covered (Chrome 145+ covers them)."
      : ''}
  >
    {#snippet children({ describedby, invalid })}
      <input
        id="{id}-sites"
        type="text"
        spellcheck="false"
        autocomplete="off"
        placeholder="All sites"
        value={sitesText}
        aria-invalid={invalid}
        aria-describedby={describedby}
        onfocus={() => (sitesFocused = true)}
        onblur={() => {
          sitesFocused = false;
          sitesText = domainsText(group.pageDomains);
        }}
        oninput={(e) => setSites(e.currentTarget.value)}
      />
    {/snippet}
  </Field>

  {#if group.rules.length > 0}
    <ol class="rules" aria-label="Rules in {group.name || 'this group'}, highest priority first">
      {#each group.rules as rule, i (rule.id)}
        <li>
          <RuleEditor
            {rule}
            groupId={group.id}
            index={i}
            count={group.rules.length}
            validation={validation.rules[rule.id] ?? { errors: {}, warnings: {} }}
            status={ruleStatus(rule, statusContext)}
            userScriptsReady={statusContext.userScriptsReady ?? true}
            {showAll}
            {edit}
          />
        </li>
      {/each}
    </ol>
  {:else}
    <p class="muted">No rules in this group yet.</p>
  {/if}
  <div>
    <button type="button" class="btn" id="{id}-add-rule" onclick={addNewRule}>+ Add rule</button>
  </div>
</section>

<style>
  .group {
    display: grid;
    gap: var(--space-3);
    padding: var(--space-4);
    border: 1px solid var(--border);
    border-radius: calc(var(--radius) * 1.5);
    background: var(--surface);
  }

  .group.off {
    border-style: dashed;
  }

  .head {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .name {
    flex: 1;
    font-size: 1rem;
    font-weight: 600;
  }

  .badge {
    flex-shrink: 1;
    overflow: hidden;
    padding: 2px var(--space-2);
    border: 1px solid var(--border);
    border-radius: 999px;
    font-size: 0.75rem;
    color: var(--text-muted);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tools {
    display: flex;
    gap: var(--space-1);
  }

  .rules {
    display: grid;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }
</style>
