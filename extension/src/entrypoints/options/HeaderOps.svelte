<script lang="ts">
  import type { Action, HeaderOp } from '../../rule-model/schema';
  import { headerOpWith, type HeaderPhase, type RuleValidation } from '../../workspace-ui/editor';

  type HeadersAction = Extract<Action, { type: 'modifyHeaders' }>;

  let {
    action,
    ruleId,
    validation,
    showAll,
    onchange,
  }: { action: HeadersAction; ruleId: string; validation: RuleValidation; showAll: boolean; onchange: (next: HeadersAction) => void } = $props();

  const PHASES: { phase: HeaderPhase; title: string }[] = [
    { phase: 'request', title: 'Request headers (sent to the server)' },
    { phase: 'response', title: 'Response headers (received by the page)' },
  ];

  const setOps = (phase: HeaderPhase, ops: HeaderOp[]) => onchange({ ...action, [phase]: ops });
  const replace = (phase: HeaderPhase, index: number, op: HeaderOp) => setOps(phase, action[phase].map((o, i) => (i === index ? op : o)));
  const remove = (phase: HeaderPhase, index: number) => setOps(phase, action[phase].filter((_, i) => i !== index));
  const add = (phase: HeaderPhase) => setOps(phase, [...action[phase], { op: 'set', name: '', value: '' }]);

  const errorFor = (key: string, value: string) => {
    const message = validation.errors[key];
    return message && (showAll || value !== '') ? message : '';
  };
</script>

<div class="headers">
  {#if validation.errors.action}
    <p class="error"><strong>Error:</strong> {validation.errors.action}</p>
  {/if}
  {#each PHASES as { phase, title } (phase)}
    <fieldset>
      <legend>{title}</legend>
      {#each action[phase] as op, i (i)}
        {@const base = `${ruleId}-${phase}-${i}`}
        {@const nameError = errorFor(`action.${phase}.${i}.name`, op.name)}
        {@const opWarning = validation.warnings[`action.${phase}.${i}.op`] ?? ''}
        <div class="row">
          <label class="visually-hidden" for="{base}-op">{phase} header {i + 1} operation</label>
          <select id="{base}-op" value={op.op} aria-describedby={opWarning ? `${base}-warning` : undefined} onchange={(e) => replace(phase, i, headerOpWith(op, e.currentTarget.value as HeaderOp['op']))}>
            <option value="set">Set</option>
            <option value="append">Append</option>
            <option value="remove">Remove</option>
          </select>
          <label class="visually-hidden" for="{base}-name">{phase} header {i + 1} name</label>
          <input
            id="{base}-name"
            type="text"
            placeholder="Header name, e.g. x-debug"
            value={op.name}
            aria-invalid={nameError !== ''}
            aria-describedby={nameError ? `${base}-error` : undefined}
            oninput={(e) => replace(phase, i, { ...op, name: e.currentTarget.value })}
          />
          {#if op.op !== 'remove'}
            <label class="visually-hidden" for="{base}-value">{phase} header {i + 1} value</label>
            <input id="{base}-value" type="text" placeholder="Value" value={op.value} oninput={(e) => replace(phase, i, { ...op, value: e.currentTarget.value })} />
          {:else}
            <span class="muted placeholder">(no value)</span>
          {/if}
          <button type="button" class="btn icon danger" aria-label="Remove {phase} header {i + 1}" onclick={() => remove(phase, i)}>✕</button>
        </div>
        {#if nameError}<p id="{base}-error" class="error"><strong>Error:</strong> {nameError}</p>{/if}
        {#if opWarning}<p id="{base}-warning" class="warning"><strong>Warning:</strong> {opWarning}</p>{/if}
      {/each}
      <button type="button" class="btn" onclick={() => add(phase)}>Add {phase} header</button>
    </fieldset>
  {/each}
</div>

<style>
  .headers {
    display: grid;
    gap: var(--space-3);
  }

  fieldset {
    display: grid;
    gap: var(--space-2);
    margin: 0;
    padding: var(--space-3);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }

  legend {
    padding: 0 var(--space-1);
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-muted);
  }

  .row {
    display: grid;
    grid-template-columns: 7rem 1fr 1fr auto;
    gap: var(--space-2);
    align-items: center;
  }

  .placeholder {
    font-size: 0.8rem;
  }

  fieldset > .btn {
    justify-self: start;
  }

  .error,
  .warning {
    font-size: 0.8rem;
  }

  .error {
    color: var(--danger);
  }

  .warning {
    color: var(--warning);
  }
</style>
