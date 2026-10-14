<script lang="ts">
  import { MOCK_METHODS, RUN_AT, type Action, type InjectSource } from '../../rule-model/schema';
  import CodeEditor from '../../ui/CodeEditor.svelte';
  import Field from '../../ui/Field.svelte';
  import { codeLanguage, type RuleValidation } from '../../workspace-ui/editor';

  type InjectAction = Extract<Action, { type: 'injectJs' | 'injectCss' }>;
  type MockAction = Extract<Action, { type: 'mock' }>;

  let {
    action,
    ruleId,
    validation,
    showAll,
    userScriptsReady,
    onchange,
  }: {
    action: InjectAction | MockAction;
    ruleId: string;
    validation: RuleValidation;
    showAll: boolean;
    /** False when inline JS can't run yet (user scripts off). */
    userScriptsReady: boolean;
    onchange: (action: Action) => void;
  } = $props();

  const id = $derived(`rule-${ruleId}`);
  const language = $derived(codeLanguage(action));
  const errorFor = (key: string, value: string) => {
    const message = validation.errors[key];
    return message && (showAll || value !== '') ? message : '';
  };
  /** Number fields: an empty box is an error worth showing straight away. */
  const numberError = (key: string) => validation.errors[key] ?? '';

  const RUN_AT_LABELS: Record<(typeof RUN_AT)[number], string> = {
    document_start: 'Before the page’s scripts (document_start)',
    document_end: 'When the HTML is parsed (document_end)',
    document_idle: 'After the page loads (document_idle)',
  };

  const setInject = (patch: Partial<InjectAction>) => onchange({ ...(action as InjectAction), ...patch } as Action);
  const setMock = (patch: Partial<MockAction>) => onchange({ ...(action as MockAction), ...patch });
  const setSourceKind = (kind: InjectSource['kind']) => {
    const current = (action as InjectAction).source;
    if (current.kind !== kind) setInject({ source: kind === 'inline' ? { kind, code: '' } : { kind, url: '' } });
  };
  const setHeader = (index: number, patch: Partial<MockAction['headers'][number]>) =>
    setMock({ headers: (action as MockAction).headers.map((h, i) => (i === index ? { ...h, ...patch } : h)) });
  const toNumber = (text: string) => (text.trim() === '' ? Number.NaN : Number(text));
</script>

{#if action.type === 'injectJs' || action.type === 'injectCss'}
  {@const source = action.source}
  {@const what = action.type === 'injectJs' ? 'JavaScript' : 'CSS'}
  <div class="grid two">
    <Field id="{id}-source" label="Source">
      {#snippet children()}
        <select id="{id}-source" value={source.kind} onchange={(e) => setSourceKind(e.currentTarget.value as InjectSource['kind'])}>
          <option value="inline">Code written here</option>
          <option value="url">Load from a URL</option>
        </select>
      {/snippet}
    </Field>
    {#if source.kind === 'url'}
      <Field
        id="{id}-url"
        label="{what} URL"
        hint={action.type === 'injectJs' ? 'Added as a <script> tag, so the page’s Content-Security-Policy decides whether it loads.' : 'Fetched by Detour and inserted as a stylesheet.'}
        error={errorFor('action.source.url', source.url)}
      >
        {#snippet children({ describedby, invalid })}
          <input
            id="{id}-url"
            type="url"
            spellcheck="false"
            autocomplete="off"
            placeholder={action.type === 'injectJs' ? 'http://localhost:5173/dev.js' : 'http://localhost:5173/debug.css'}
            value={source.url}
            aria-invalid={invalid}
            aria-describedby={describedby}
            oninput={(e) => setInject({ source: { kind: 'url', url: e.currentTarget.value } })}
          />
        {/snippet}
      </Field>
    {/if}
  </div>

  {#if source.kind === 'inline'}
    <Field
      id="{id}-code"
      label="{what} to inject"
      hint={action.type === 'injectJs' ? 'Runs inside a block: use window.name = … for globals the page should see.' : ''}
      error={errorFor('action.source.code', source.code)}
    >
      {#snippet children({ describedby, invalid })}
        <CodeEditor
          id="{id}-code"
          label="{what} to inject"
          value={source.code}
          {language}
          {describedby}
          {invalid}
          onchange={(code) => setInject({ source: { kind: 'inline', code } })}
        />
      {/snippet}
    </Field>
    {#if action.type === 'injectJs' && !userScriptsReady}
      <p class="note warning" role="note">Inline JavaScript needs user scripts turned on for Detour — see the notice at the top of the page.</p>
    {/if}
  {/if}

  <div class="grid two">
    <Field id="{id}-run-at" label="When">
      {#snippet children()}
        <select id="{id}-run-at" value={action.runAt} onchange={(e) => setInject({ runAt: e.currentTarget.value as InjectAction['runAt'] })}>
          {#each RUN_AT as when (when)}
            <option value={when}>{RUN_AT_LABELS[when]}</option>
          {/each}
        </select>
      {/snippet}
    </Field>
    {#if action.type === 'injectJs' && source.kind === 'inline'}
      <Field
        id="{id}-world"
        label="Run in"
        hint={action.world === 'MAIN'
          ? 'The page can see and change your code and anything it defines. Only inject on sites you trust.'
          : 'Isolated from the page’s variables and its Content-Security-Policy; shares the DOM.'}
      >
        {#snippet children({ describedby })}
          <select id="{id}-world" value={action.world} aria-describedby={describedby} onchange={(e) => setInject({ world: e.currentTarget.value as 'MAIN' | 'USER_SCRIPT' })}>
            <option value="MAIN">The page’s own JavaScript (shares globals)</option>
            <option value="USER_SCRIPT">An isolated script world</option>
          </select>
        {/snippet}
      </Field>
    {/if}
  </div>
  <label class="check">
    <input type="checkbox" checked={action.allFrames} onchange={(e) => setInject({ allFrames: e.currentTarget.checked })} />
    Also inject into iframes (otherwise the top page only)
  </label>
{:else}
  <div class="grid mock">
    <Field id="{id}-method" label="Method">
      {#snippet children()}
        <select id="{id}-method" value={action.method} onchange={(e) => setMock({ method: e.currentTarget.value as MockAction['method'] })}>
          {#each MOCK_METHODS as method (method)}
            <option value={method}>{method === 'ANY' ? 'Any method' : method}</option>
          {/each}
        </select>
      {/snippet}
    </Field>
    <Field id="{id}-status" label="Status" error={numberError('action.status')}>
      {#snippet children({ describedby, invalid })}
        <input
          id="{id}-status"
          type="number"
          min="200"
          max="599"
          value={Number.isNaN(action.status) ? '' : action.status}
          aria-invalid={invalid}
          aria-describedby={describedby}
          oninput={(e) => setMock({ status: toNumber(e.currentTarget.value) })}
        />
      {/snippet}
    </Field>
    <Field id="{id}-delay" label="Delay (ms)" error={numberError('action.delayMs')}>
      {#snippet children({ describedby, invalid })}
        <input
          id="{id}-delay"
          type="number"
          min="0"
          max="30000"
          step="100"
          value={Number.isNaN(action.delayMs) ? '' : action.delayMs}
          aria-invalid={invalid}
          aria-describedby={describedby}
          oninput={(e) => setMock({ delayMs: toNumber(e.currentTarget.value) })}
        />
      {/snippet}
    </Field>
  </div>

  <fieldset class="headers">
    <legend>Response headers</legend>
    {#each action.headers as header, i (i)}
      <div class="header-row">
        <Field id="{id}-header-{i}-name" label="Name" error={errorFor(`action.headers.${i}.name`, header.name)}>
          {#snippet children({ describedby, invalid })}
            <input
              id="{id}-header-{i}-name"
              type="text"
              spellcheck="false"
              autocomplete="off"
              placeholder="content-type"
              value={header.name}
              aria-invalid={invalid}
              aria-describedby={describedby}
              oninput={(e) => setHeader(i, { name: e.currentTarget.value })}
            />
          {/snippet}
        </Field>
        <Field id="{id}-header-{i}-value" label="Value">
          {#snippet children()}
            <input id="{id}-header-{i}-value" type="text" spellcheck="false" autocomplete="off" value={header.value} oninput={(e) => setHeader(i, { value: e.currentTarget.value })} />
          {/snippet}
        </Field>
        <button type="button" class="btn icon danger" aria-label="Remove header {i + 1}" onclick={() => setMock({ headers: action.headers.filter((_, j) => j !== i) })}>✕</button>
      </div>
    {/each}
    <button type="button" class="btn" onclick={() => setMock({ headers: [...action.headers, { name: '', value: '' }] })}>Add header</button>
  </fieldset>

  <Field id="{id}-body" label="Response body" hint={[204, 205, 304].includes(action.status) ? `A ${action.status} response has no body; this text is ignored.` : ''}>
    {#snippet children({ describedby })}
      <CodeEditor id="{id}-body" label="Response body" value={action.body} {language} {describedby} onchange={(body) => setMock({ body })} />
    {/snippet}
  </Field>
  <p class="note">Answered inside the page for <code>fetch</code> and <code>XMLHttpRequest</code>; the request never reaches the network, so redirect and header rules don’t apply to it. Service workers and <code>sendBeacon</code> aren’t mocked. Chrome’s Network tab often omits the mocked call — use Recent matches and what the page received to confirm.</p>
{/if}

<style>
  .grid {
    display: grid;
    gap: var(--space-3);
    align-items: start;
  }

  .two {
    grid-template-columns: 16rem 1fr;
  }

  .mock {
    grid-template-columns: 12rem 8rem 8rem;
  }

  .check {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .headers {
    display: grid;
    gap: var(--space-2);
    margin: 0;
    padding: var(--space-3);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    justify-items: start;
  }

  .headers legend {
    padding: 0 var(--space-1);
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-muted);
  }

  .header-row {
    display: grid;
    grid-template-columns: 14rem 1fr auto;
    gap: var(--space-2);
    align-items: end;
    width: 100%;
  }

  .note {
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .note.warning {
    color: var(--warning);
  }
</style>
