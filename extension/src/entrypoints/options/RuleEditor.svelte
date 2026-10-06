<script lang="ts">
  import { tick } from 'svelte';
  import { RESOURCE_TYPES, type Action, type Match, type Rule, type Workspace } from '../../rule-model/schema';
  import BodyFields from './BodyFields.svelte';
  import { announce } from '../../ui/announcer.svelte';
  import Field from '../../ui/Field.svelte';
  import Switch from '../../ui/Switch.svelte';
  import {
    defaultAction,
    describeMatch,
    effectiveTypes,
    RESOURCE_TYPE_LABELS,
    setResourceType,
    describeRedirect,
    isPageAction,
    matchSubject,
    moveRule,
    previewMatch,
    removeRule,
    requestScope,
    updateRule,
    withRequestScope,
    type RequestScope,
    type RuleStatus,
    type RuleValidation,
  } from '../../workspace-ui/editor';
  import { summarizeRule } from '../../workspace-ui/report-view';
  import HeaderOps from './HeaderOps.svelte';
  import PageActionFields from './PageActionFields.svelte';

  let {
    rule,
    groupId,
    index,
    count,
    validation,
    status,
    showAll,
    userScriptsReady,
    edit,
  }: {
    rule: Rule;
    groupId: string;
    index: number;
    count: number;
    validation: RuleValidation;
    status: RuleStatus;
    showAll: boolean;
    userScriptsReady: boolean;
    edit: (fn: (ws: Workspace) => Workspace) => void;
  } = $props();

  const id = $derived(`rule-${rule.id}`);
  const hasErrors = $derived(Object.keys(validation.errors).length > 0);
  let expanded = $state(false);
  let sampleUrl = $state('');
  let advancedOpen = $state(false);
  const typesError = $derived(validation.errors.resourceTypes ?? '');
  const pageRule = $derived(isPageAction(rule.action));
  const subject = $derived(matchSubject(rule.action));

  $effect.pre(() => {
    if (rule.match.pattern === '' || (showAll && hasErrors)) expanded = true;
    if (typesError) advancedOpen = true;
  });

  const set = (patch: Partial<Rule>) => edit((ws) => updateRule(ws, groupId, { ...rule, ...patch }));
  const setMatch = (patch: Partial<Match>) => set({ match: { ...rule.match, ...patch } as Match });
  const setActionType = (type: Action['type']) => set({ action: type === rule.action.type ? rule.action : defaultAction(type) });

  const errorFor = (key: string, value: string) => {
    const message = validation.errors[key];
    return message && (showAll || value !== '') ? message : '';
  };

  const preview = $derived(previewMatch(rule, sampleUrl));
  const summary = $derived(rule.match.pattern ? summarizeRule(rule) : 'New rule');

  async function moveBy(delta: number) {
    edit((ws) => moveRule(ws, groupId, rule.id, delta));
    announce(`Rule moved to position ${index + 1 + delta} of ${count}. Save to apply.`);
    await tick();
    const same = document.getElementById(`${id}-${delta < 0 ? 'up' : 'down'}`) as HTMLButtonElement | null;
    const other = document.getElementById(`${id}-${delta < 0 ? 'down' : 'up'}`) as HTMLButtonElement | null;
    (same && !same.disabled ? same : other)?.focus();
  }

  async function remove() {
    edit((ws) => removeRule(ws, groupId, rule.id));
    announce('Rule deleted. Save to apply, or discard changes to undo.');
    await tick();
    document.getElementById(`group-${groupId}-add-rule`)?.focus();
  }

  const STATUS_TEXT: Record<RuleStatus['kind'], string> = {
    unsaved: '● Unsaved',
    off: '○ Off',
    pending: '… Applying',
    'detour-off': '○ Detour is off',
    applied: '✓ Applied',
    refused: '✕ Refused',
    failing: '⚠ Failing',
    'not-applied': '○ Not applied',
  };
</script>

<article class="rule" class:off={!rule.enabled} aria-labelledby="{id}-summary">
  <div class="head">
    <Switch checked={rule.enabled} label="Rule {index + 1} on" onchange={(enabled) => set({ enabled })} />
    <button type="button" class="summary" id="{id}-summary" aria-expanded={expanded} aria-controls="{id}-body" onclick={() => (expanded = !expanded)}>
      <span class="chevron" aria-hidden="true">{expanded ? '▾' : '▸'}</span>
      <code>{summary}</code>
    </button>
    <span class="status status-{status.kind}" data-testid="rule-status">
      {STATUS_TEXT[status.kind]}{#if status.kind === 'refused'}: {status.label}{/if}{#if status.kind === 'off' && status.because === 'group'} (group){/if}
    </span>
    <div class="tools">
      <button type="button" class="btn icon" id="{id}-up" aria-label="Move rule {index + 1} up" disabled={index === 0} onclick={() => moveBy(-1)}>↑</button>
      <button type="button" class="btn icon" id="{id}-down" aria-label="Move rule {index + 1} down" disabled={index === count - 1} onclick={() => moveBy(1)}>↓</button>
      <button type="button" class="btn icon danger" aria-label="Delete rule {index + 1}" onclick={remove}>✕</button>
    </div>
  </div>
  {#if status.kind === 'refused'}
    <p class="refusal">{status.message}</p>
  {:else if status.kind === 'failing'}
    <p class="refusal" data-testid="rule-failure">{status.message}{#if status.page} (on {status.page}){/if}</p>
  {/if}

  <div class="body" id="{id}-body" hidden={!expanded}>
    <div class="grid match">
      <Field id="{id}-kind" label="Pattern type">
        {#snippet children()}
          <select id="{id}-kind" value={rule.match.kind} onchange={(e) => setMatch({ kind: e.currentTarget.value as Match['kind'] })}>
            <option value="glob">Wildcard (*)</option>
            <option value="regex">Regular expression</option>
          </select>
        {/snippet}
      </Field>
      <Field
        id="{id}-pattern"
        label={subject === 'page' ? 'On pages whose URL matches' : 'When the URL matches'}
        hint={describeMatch(rule.match, rule.caseSensitive)}
        error={errorFor('match.pattern', rule.match.pattern)}
        warning={validation.warnings['match.pattern'] ?? ''}
      >
        {#snippet children({ describedby, invalid })}
          <input
            id="{id}-pattern"
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
    </div>

    <div class="grid action">
      <Field id="{id}-action" label="Then">
        {#snippet children()}
          <select id="{id}-action" value={rule.action.type} onchange={(e) => setActionType(e.currentTarget.value as Action['type'])}>
            <option value="redirect">Redirect to</option>
            <option value="block">Block the request</option>
            <option value="modifyHeaders">Change headers</option>
            <option value="injectJs">Inject JavaScript</option>
            <option value="injectCss">Inject CSS</option>
            <option value="mock">Mock the response</option>
            <option value="overrideBody">Replace response body</option>
          </select>
        {/snippet}
      </Field>
      {#if rule.action.type === 'redirect'}
        {@const to = rule.action.to}
        <Field id="{id}-to" label="Redirect to" hint={describeRedirect(rule)} error={errorFor('action.to', to)} warning={validation.warnings['action.to'] ?? ''}>
          {#snippet children({ describedby, invalid })}
            <input
              id="{id}-to"
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
      {/if}
    </div>

    {#if rule.action.type === 'modifyHeaders'}
      <HeaderOps action={rule.action} ruleId={rule.id} {validation} {showAll} onchange={(action) => set({ action })} />
    {:else if rule.action.type === 'injectJs' || rule.action.type === 'injectCss' || rule.action.type === 'mock'}
      <PageActionFields action={rule.action} ruleId={rule.id} {validation} {showAll} {userScriptsReady} onchange={(action) => set({ action })} />
    {:else if rule.action.type === 'overrideBody'}
      <BodyFields action={rule.action} ruleId={rule.id} {validation} {showAll} onchange={(action) => set({ action })} />
    {/if}

    <div class="grid options" class:single={pageRule}>
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
      {/if}
      <Field id="{id}-note" label="Note (optional)">
        {#snippet children()}
          <input id="{id}-note" type="text" value={rule.note ?? ''} oninput={(e) => set({ note: e.currentTarget.value || undefined })} />
        {/snippet}
      </Field>
      <label class="check">
        <input type="checkbox" checked={rule.caseSensitive ?? false} onchange={(e) => set({ caseSensitive: e.currentTarget.checked || undefined })} />
        Match upper/lower case exactly
      </label>
    </div>

    {#if !pageRule}
    <details class="advanced" bind:open={advancedOpen}>
      <summary>Advanced</summary>
      <fieldset class="types" aria-describedby={typesError ? `${id}-types-error` : undefined}>
        <legend>Request types</legend>
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

    <div class="preview">
      <Field id="{id}-sample" label="Try a URL (not saved)">
        {#snippet children()}
          <input id="{id}-sample" type="url" spellcheck="false" placeholder="Paste a URL to test this rule" bind:value={sampleUrl} />
        {/snippet}
      </Field>
      <output for="{id}-sample {id}-pattern" class="result" aria-live="polite" data-testid="preview">
        {#if preview.kind === 'match'}
          <strong>✓ Matches.</strong>
          {#if preview.outcome === 'redirect'}It would go to <code>{preview.to}</code>{:else if preview.outcome === 'block'}It would be blocked.{:else if preview.outcome === 'modifyHeaders'}Its headers would change.{:else if preview.outcome === 'mock'}It would get the mocked response.{:else if preview.outcome === 'overrideBody'}Its response body would be replaced.{:else}The code would be injected into this page.{/if}
        {:else if preview.kind === 'no-match'}
          <strong>✕ Doesn't match.</strong>
        {:else if preview.kind === 'invalid'}
          <strong>Can't test:</strong> {preview.message}
        {/if}
      </output>
    </div>
  </div>
</article>

<style>
  .rule {
    display: grid;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg);
  }

  .rule.off .summary code {
    color: var(--text-muted);
    text-decoration: line-through;
  }

  .head {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .summary {
    display: flex;
    flex: 1;
    min-width: 0;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1);
    border: 0;
    background: none;
    text-align: left;
    cursor: pointer;
  }

  .summary code {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chevron {
    color: var(--text-muted);
  }

  .status {
    flex-shrink: 0;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-muted);
  }

  .status-applied {
    color: var(--accent);
  }

  .status-refused {
    color: var(--danger);
  }

  .status-unsaved,
  .status-pending {
    color: var(--warning);
  }

  .tools {
    display: flex;
    gap: var(--space-1);
  }

  .refusal {
    font-size: 0.8rem;
    color: var(--danger);
  }

  .body {
    display: grid;
    gap: var(--space-3);
    padding: var(--space-2) 0 var(--space-2);
  }

  .body[hidden] {
    display: none;
  }

  .grid {
    display: grid;
    gap: var(--space-3);
    align-items: start;
  }

  .match,
  .action {
    grid-template-columns: 12rem 1fr;
  }

  .options {
    grid-template-columns: 16rem 1fr;
  }

  .options.single {
    grid-template-columns: 1fr;
  }

  .check {
    display: flex;
    grid-column: 1 / -1;
    align-items: center;
    gap: var(--space-2);
  }

  .advanced > summary {
    font-size: 0.8rem;
    font-weight: 600;
  }

  .types {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
    gap: var(--space-1) var(--space-3);
    margin: var(--space-2) 0 0;
    padding: var(--space-3);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }

  .types legend {
    padding: 0 var(--space-1);
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-muted);
  }

  .types .check {
    grid-column: auto;
  }

  .type-error {
    margin-top: var(--space-1);
    font-size: 0.8rem;
    color: var(--danger);
  }

  .preview {
    display: grid;
    gap: var(--space-2);
    padding: var(--space-3);
    border: 1px dashed var(--border);
    border-radius: var(--radius);
  }

  .result:empty {
    display: none;
  }

  .result code {
    color: var(--accent);
  }
</style>
