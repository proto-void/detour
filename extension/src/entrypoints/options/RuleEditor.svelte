<script lang="ts">
  import { tick } from 'svelte';
  import { RESOURCE_TYPES, type Action, type Match, type Rule, type Workspace } from '../../rule-model/schema';
  import Drawer from '../../ui/Drawer.svelte';
  import Field from '../../ui/Field.svelte';
  import {
    actionInfo,
    defaultAction,
    describeMatch,
    describeRedirect,
    effectiveTypes,
    findRule,
    isPageAction,
    matchSubject,
    previewMatch,
    requestScope,
    RESOURCE_TYPE_LABELS,
    setResourceType,
    updateRule,
    withRequestScope,
    type RequestScope,
    type RuleStatus,
    type RuleValidation,
  } from '../../workspace-ui/editor';
  import ActionChip from './ActionChip.svelte';
  import BodyFields from './BodyFields.svelte';
  import HeaderOps from './HeaderOps.svelte';
  import PageActionFields from './PageActionFields.svelte';
  import RuleRow from './RuleRow.svelte';

  type DrawerTab = 'match' | 'action' | 'test';

  let {
    rule,
    groupId,
    index,
    count,
    validation,
    status,
    showAll,
    userScriptsReady,
    bodyRewriteAllowed,
    saved,
    openSignal = 0,
    edit,
    onclose,
  }: {
    rule: Rule;
    groupId: string;
    index: number;
    count: number;
    validation: RuleValidation;
    status: RuleStatus;
    showAll: boolean;
    userScriptsReady: boolean;
    bodyRewriteAllowed: boolean;
    saved: Workspace | undefined;
    /** Incremented by parent to force-open the drawer (new rule). */
    openSignal?: number;
    edit: (fn: (ws: Workspace) => Workspace) => void;
    onclose?: () => void;
  } = $props();

  const id = $derived(`rule-${rule.id}`);
  const hasErrors = $derived(Object.keys(validation.errors).length > 0);
  let detailOpen = $state(false);
  let drawerOpen = $state(false);
  let drawerTab = $state<DrawerTab>('match');
  let sampleUrl = $state('');
  let advancedOpen = $state(false);
  let lastOpenSignal = $state(0);
  const typesError = $derived(validation.errors.resourceTypes ?? '');
  const pageRule = $derived(isPageAction(rule.action));
  const subject = $derived(matchSubject(rule.action));
  const info = $derived(actionInfo(rule.action.type));

  const docked = $derived(typeof window === 'undefined' ? true : window.matchMedia('(min-width: 1000px)').matches);

  $effect.pre(() => {
    if (rule.match.pattern === '' || (showAll && hasErrors)) detailOpen = true;
    if (typesError) advancedOpen = true;
  });

  /** Save / showAll: surface the tab that holds the invalid field so focus can land. */
  $effect(() => {
    if (!showAll || !drawerOpen || !hasErrors) return;
    const errs = validation.errors;
    if (errs['match.pattern'] || errs.resourceTypes) {
      drawerTab = 'match';
      return;
    }
    if (Object.keys(errs).some((key) => key.startsWith('action'))) {
      drawerTab = 'action';
    }
  });

  $effect(() => {
    if (openSignal > lastOpenSignal) {
      lastOpenSignal = openSignal;
      drawerOpen = true;
      drawerTab = 'match';
      void tick().then(() => document.getElementById(`${id}-pattern`)?.focus());
    }
  });

  const set = (patch: Partial<Rule>) => edit((ws) => updateRule(ws, groupId, { ...rule, ...patch }));
  const setMatch = (patch: Partial<Match>) => set({ match: { ...rule.match, ...patch } as Match });
  const setActionType = (type: Action['type']) => {
    set({ action: type === rule.action.type ? rule.action : defaultAction(type) });
    drawerTab = 'action';
  };

  const preview = $derived(previewMatch(rule, sampleUrl));

  function openDrawer() {
    drawerOpen = true;
  }

  function closeDrawer() {
    drawerOpen = false;
    onclose?.();
  }

  function revertRule() {
    const stored = findRule(saved, rule.id);
    if (!stored) return;
    edit((ws) => updateRule(ws, groupId, structuredClone(stored.rule)));
  }

  const patternError = $derived(
    validation.errors['match.pattern'] && (showAll || rule.match.pattern !== '') ? validation.errors['match.pattern'] : '',
  );
  const toError = $derived(
    rule.action.type === 'redirect' && validation.errors['action.to'] && (showAll || rule.action.to !== '')
      ? validation.errors['action.to']
      : '',
  );
  const pathError = $derived(
    rule.action.type === 'serveLocal' && validation.errors['action.path'] && (showAll || rule.action.path !== '')
      ? validation.errors['action.path']
      : '',
  );
</script>

<article class="rule" class:off={!rule.enabled} aria-labelledby="{id}-summary" data-rule-id={rule.id}>
  <RuleRow
    {rule}
    {groupId}
    {index}
    {count}
    {validation}
    {status}
    {showAll}
    {detailOpen}
    selected={drawerOpen}
    {edit}
    {set}
    onopen={openDrawer}
    ontoggledetail={() => (detailOpen = !detailOpen)}
  />

  {#if status.kind === 'refused'}
    <p class="refusal">{status.message}</p>
  {:else if status.kind === 'failing'}
    <p class="refusal" data-testid="rule-failure">{status.message}{#if status.page} (on {status.page}){/if}</p>
  {/if}

  {#if detailOpen}
    <div class="detail" id="{id}-detail">
      <p class="muted">
        Priority: {index + 1} (position)
        {#if rule.note} · {rule.note}{/if}
      </p>
    </div>
  {/if}
</article>

<Drawer open={drawerOpen} title={info.label} {docked} onclose={closeDrawer}>
  {#snippet head()}
    <div class="drawer-head">
      <div class="drawer-head-row">
        <ActionChip type={rule.action.type} ruleId={rule.id} onchange={setActionType} />
        <code class="mono pattern-title">{rule.match.pattern || 'Empty pattern'}</code>
      </div>
      <div class="subtabs" role="tablist" aria-label="Rule sections">
        <button
          type="button"
          role="tab"
          class:active={drawerTab === 'match'}
          aria-selected={drawerTab === 'match'}
          onclick={() => (drawerTab = 'match')}
        >Match</button>
        <button
          type="button"
          role="tab"
          class:active={drawerTab === 'action'}
          aria-selected={drawerTab === 'action'}
          aria-label="Action ({info.label})"
          onclick={() => (drawerTab = 'action')}
        >Action</button>
        <button
          type="button"
          role="tab"
          class:active={drawerTab === 'test'}
          aria-selected={drawerTab === 'test'}
          onclick={() => (drawerTab = 'test')}
        >Test</button>
      </div>
    </div>
  {/snippet}

  {#if drawerTab === 'match'}
    <Field id="{id}-pattern" label="Pattern" error={patternError} hint={describeMatch(rule.match, rule.caseSensitive)}>
      {#snippet children({ describedby, invalid })}
        <input
          id="{id}-pattern"
          class="mono"
          type="text"
          spellcheck="false"
          autocomplete="off"
          placeholder={subject === 'page'
            ? rule.match.kind === 'glob'
              ? 'https://app.example.com/*'
              : '^https://app\\.example\\.com/'
            : rule.match.kind === 'glob'
              ? 'https://cdn.example.com/*.js'
              : '^https://cdn\\.example\\.com/(.*)$'}
          value={rule.match.pattern}
          aria-invalid={invalid}
          aria-describedby={describedby}
          oninput={(e) => setMatch({ pattern: e.currentTarget.value })}
        />
      {/snippet}
    </Field>

    <Field id="{id}-kind" label="Pattern type">
      {#snippet children()}
        <select id="{id}-kind" value={rule.match.kind} onchange={(e) => setMatch({ kind: e.currentTarget.value as Match['kind'] })}>
          <option value="glob">Wildcard (*)</option>
          <option value="regex">Regular expression</option>
        </select>
      {/snippet}
    </Field>

    <label class="check">
      <input type="checkbox" checked={rule.caseSensitive ?? false} onchange={(e) => set({ caseSensitive: e.currentTarget.checked || undefined })} />
      Match upper/lower case exactly
    </label>

    {#if !pageRule}
      <Field id="{id}-scope" label="Applies to" hint={requestScope(rule) === 'custom' ? 'Pick the request types under Advanced.' : ''}>
        {#snippet children({ describedby })}
          <select
            id="{id}-scope"
            value={requestScope(rule)}
            aria-describedby={describedby}
            onchange={(e) => {
              const scope = e.currentTarget.value as RequestScope;
              set(withRequestScope(rule, scope));
              if (scope === 'custom') advancedOpen = true;
            }}
          >
            <option value="all">All requests, including page loads</option>
            <option value="subresources">Everything except page loads</option>
            <option value="custom">Custom…</option>
          </select>
        {/snippet}
      </Field>

      <details class="advanced" bind:open={advancedOpen}>
        <summary>Request types</summary>
        <fieldset class="types" aria-describedby={typesError ? `${id}-types-error` : undefined}>
          <legend class="visually-hidden">Request types</legend>
          {#each RESOURCE_TYPES as type (type)}
            <label class="check">
              <input
                type="checkbox"
                checked={effectiveTypes(rule).includes(type)}
                onchange={(e) => set({ resourceTypes: setResourceType(rule, type, e.currentTarget.checked).resourceTypes })}
              />
              {RESOURCE_TYPE_LABELS[type]}
            </label>
          {/each}
        </fieldset>
        {#if typesError}<p id="{id}-types-error" class="type-error"><strong>Error:</strong> {typesError}</p>{/if}
      </details>
    {/if}

    {#if validation.warnings['match.pattern']}
      <p class="warn" role="note">{validation.warnings['match.pattern']}</p>
    {/if}
  {:else if drawerTab === 'action'}
    <p class="muted">{info.description}</p>

    {#if rule.action.type === 'redirect'}
      {@const to = rule.action.to}
      <Field id="{id}-to" label="Redirect to" error={toError} hint={describeRedirect(rule)}>
        {#snippet children({ describedby, invalid })}
          <input
            id="{id}-to"
            class="mono"
            type="text"
            spellcheck="false"
            autocomplete="off"
            placeholder="http://localhost:5173/*.js"
            value={to}
            aria-invalid={invalid}
            aria-describedby={describedby}
            oninput={(e) => set({ action: { type: 'redirect', to: e.currentTarget.value } })}
          />
        {/snippet}
      </Field>
    {:else if rule.action.type === 'modifyHeaders'}
      <HeaderOps action={rule.action} ruleId={rule.id} {validation} {showAll} onchange={(action) => set({ action })} />
    {:else if rule.action.type === 'overrideBody'}
      <div data-testid="edit-body">
        <BodyFields
          action={rule.action}
          ruleId={rule.id}
          pattern={rule.match.pattern}
          {validation}
          {showAll}
          {bodyRewriteAllowed}
          onchange={(action) => set({ action })}
        />
      </div>
    {:else if rule.action.type === 'injectJs' || rule.action.type === 'injectCss' || rule.action.type === 'mock'}
      <div data-testid={rule.action.type === 'mock' ? 'edit-body' : 'edit-code'}>
        <PageActionFields action={rule.action} ruleId={rule.id} {validation} {showAll} {userScriptsReady} onchange={(action) => set({ action })} />
      </div>
    {:else if rule.action.type === 'serveLocal'}
      {@const filePath = rule.action.path}
      <Field id="{id}-path" label="File in the bridge folder" error={pathError}>
        {#snippet children({ describedby, invalid })}
          <input
            id="{id}-path"
            class="mono"
            type="text"
            spellcheck="false"
            autocomplete="off"
            placeholder="assets/app.js"
            value={filePath}
            aria-invalid={invalid}
            aria-describedby={describedby}
            oninput={(e) => set({ action: { type: 'serveLocal', path: e.currentTarget.value } })}
          />
        {/snippet}
      </Field>
      <p class="muted">
        Relative to the folder you passed to <code>detour bridge</code>. Connect Local Bridge, then save. After Allow debugger (Chrome) or Allow response rewriting (Firefox), Detour replaces the response and the address stays the same.
      </p>
    {/if}
  {:else}
    <Field id="{id}-sample" label="Try a URL (not saved)">
      {#snippet children()}
        <input id="{id}-sample" type="url" spellcheck="false" placeholder="Paste a URL to test this rule" bind:value={sampleUrl} />
      {/snippet}
    </Field>
    <output for="{id}-sample {id}-pattern" class="result" aria-live="polite" data-testid="preview">
      {#if preview.kind === 'match'}
        <strong>✓ Matches.</strong>
        {#if preview.outcome === 'redirect'}
          {#if rule.action.type === 'overrideBody'}
            It would get your body via a data: redirect (shows as 307 in Network).
          {:else}
            It would go to <code>{preview.to}</code>
          {/if}
        {:else if preview.outcome === 'block'}It would be blocked.{:else if preview.outcome === 'modifyHeaders'}Its headers would change.{:else if preview.outcome === 'mock'}It would get the mocked response.{:else if preview.outcome === 'overrideBody'}Its response body would be replaced.{:else if preview.outcome === 'serveLocal'}It would be served from Local Bridge. The URL stays the same after you allow response rewriting; otherwise the browser redirects to 127.0.0.1.{:else}The code would be injected into this page.{/if}
      {:else if preview.kind === 'no-match'}
        <strong>✕ Doesn't match.</strong>
      {:else if preview.kind === 'invalid'}
        <strong>Can't test:</strong> {preview.message}
      {/if}
    </output>

    <Field id="{id}-note" label="Note (optional)">
      {#snippet children()}
        <input id="{id}-note" type="text" value={rule.note ?? ''} oninput={(e) => set({ note: e.currentTarget.value || undefined })} />
      {/snippet}
    </Field>
  {/if}

  {#snippet footer()}
    <span class="save-hint muted">
      {#if status.kind === 'unsaved'}Unsaved changes{:else}Saved{/if}
      · Cmd/Ctrl+S to save
    </span>
    <span class="foot-spacer"></span>
    <button type="button" class="btn text" onclick={revertRule} disabled={!findRule(saved, rule.id)}>Revert rule</button>
    <button type="button" class="btn" data-testid="drawer-done" onclick={closeDrawer}>Done</button>
  {/snippet}
</Drawer>

<style>
  .rule {
    display: grid;
    gap: var(--space-1);
    min-width: 0;
  }

  .rule.off {
    opacity: 0.95;
  }

  .refusal {
    margin: 0;
    padding: 0 var(--space-2);
    font-size: 0.8rem;
    color: var(--danger);
  }

  .detail {
    padding: 0 var(--space-2) var(--space-2);
    font-size: 0.8rem;
  }

  .drawer-head {
    display: grid;
    gap: var(--space-2);
    flex: 1;
    min-width: 0;
  }

  .drawer-head-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
  }

  .pattern-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text);
    min-width: 0;
  }

  /* Compact pills in the drawer chrome — never stretch with body grid height. */
  .subtabs {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1);
  }

  .subtabs button {
    flex: 0 0 auto;
    align-self: center;
    padding: var(--space-1) var(--space-3);
    border: 0;
    border-radius: var(--radius-pill);
    background: transparent;
    color: var(--text-muted);
    font: inherit;
    font-weight: 600;
    font-size: 0.8rem;
    line-height: 1.25;
    height: auto;
    min-height: 0;
    cursor: pointer;
  }

  .subtabs button.active {
    background: var(--accent-tint);
    color: var(--text);
  }

  .check {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .types {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-1);
    margin: var(--space-2) 0 0;
    padding: var(--space-3);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }

  .type-error,
  .warn {
    margin: 0;
    font-size: 0.8rem;
  }

  .type-error {
    color: var(--danger);
  }

  .warn {
    color: var(--warning);
  }

  .result {
    display: block;
    padding: var(--space-3);
    border: 1px dashed var(--border);
    border-radius: var(--radius);
    font-size: 0.85rem;
  }

  .result:empty {
    display: none;
  }

  .result code {
    color: var(--accent);
  }

  .save-hint {
    font-size: 0.75rem;
  }

  .foot-spacer {
    flex: 1;
  }
</style>
