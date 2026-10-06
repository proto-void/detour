<script lang="ts">
  import { MOCK_METHODS, RESOURCE_TYPES, type ResourceType, type Workspace } from '../../rule-model/schema';
  import Field from '../../ui/Field.svelte';
  import { describeResolution, resolveProbe } from '../../workspace-ui/tester';

  let {
    workspace,
    enabled,
    dirty,
    userScripts,
  }: {
    workspace: Workspace;
    enabled: boolean;
    dirty: boolean;
    userScripts: boolean;
  } = $props();

  const METHODS = MOCK_METHODS.filter((name) => name !== 'ANY');

  const RESOURCE_LABELS: Record<ResourceType, string> = {
    main_frame: 'Page load',
    sub_frame: 'Frame',
    stylesheet: 'Stylesheet',
    script: 'Script',
    image: 'Image',
    font: 'Font',
    object: 'Plugin',
    xmlhttprequest: 'Fetch / XHR',
    ping: 'Ping',
    csp_report: 'CSP report',
    media: 'Media',
    websocket: 'WebSocket',
    other: 'Other',
  };

  let url = $state('');
  let method = $state('GET');
  let resourceType = $state<ResourceType>('main_frame');
  let pageUrl = $state('');
  let subframe = $state(false);

  const view = $derived(
    describeResolution(
      resolveProbe(workspace, {
        url,
        method,
        resourceType,
        pageUrl: pageUrl.trim() || undefined,
        subframe,
        userScripts,
      }),
    ),
  );
  const started = $derived(url.trim() !== '');
</script>

<section id="tester" aria-labelledby="tester-heading">
  <h2 id="tester-heading">Test a URL</h2>
  <Field id="tester-url" label="URL" hint="Paste a URL to see which rule wins. Rules higher in the list win.">
    {#snippet children({ describedby })}
      <input id="tester-url" type="url" spellcheck="false" autocomplete="off" placeholder="https://cdn.example.com/app.js" bind:value={url} aria-describedby={describedby} />
    {/snippet}
  </Field>

  <details>
    <summary>Request context</summary>
    <div class="context">
      <Field id="tester-kind" label="This URL is a">
        {#snippet children()}
          <select id="tester-kind" bind:value={resourceType}>
            {#each RESOURCE_TYPES as type (type)}
              <option value={type}>{RESOURCE_LABELS[type]}</option>
            {/each}
          </select>
        {/snippet}
      </Field>
      <Field id="tester-method" label="Method" hint="Mocks match GET unless you pick another method.">
        {#snippet children({ describedby })}
          <select id="tester-method" bind:value={method} aria-describedby={describedby}>
            {#each METHODS as name (name)}
              <option value={name}>{name}</option>
            {/each}
          </select>
        {/snippet}
      </Field>
      {#if resourceType !== 'main_frame'}
        <Field id="tester-page" label="From page" hint="Site rules and inject rules use this page. Leave blank to use the URL above.">
          {#snippet children({ describedby })}
            <input id="tester-page" type="url" spellcheck="false" autocomplete="off" placeholder="https://app.example.com/" bind:value={pageUrl} aria-describedby={describedby} />
          {/snippet}
        </Field>
      {/if}
      {#if resourceType !== 'main_frame' && resourceType !== 'sub_frame'}
        <label class="check" for="tester-frame">
          <input id="tester-frame" type="checkbox" bind:checked={subframe} />
          Page is inside a frame
        </label>
      {/if}
    </div>
  </details>

  {#if started}
    <div class="result" role="status" data-testid="tester-result">
      <p class="headline">{view.headline}</p>
      {#if view.lines.length > 0}
        <ul>
          {#each view.lines as line, i (i)}
            <li>
              <span class="who">{line.groupName}</span>
              <span class="summary">{line.summary}</span>
              <span class="outcome">{line.outcome}</span>
            </li>
          {/each}
        </ul>
      {/if}
      {#each view.notes as note, i (i)}
        <p class="note">{note}</p>
      {/each}
      {#if !enabled}<p class="note">Detour is off, so this is not live.</p>{/if}
      {#if dirty}<p class="note">Includes unsaved edits.</p>{/if}
    </div>
  {/if}
</section>

<style>
  section {
    display: grid;
    gap: var(--space-3);
    padding: var(--space-3);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
  }

  .context {
    display: grid;
    gap: var(--space-3);
    margin-top: var(--space-3);
  }

  @media (min-width: 40rem) {
    .context {
      grid-template-columns: 1fr 1fr;
    }
  }

  .check {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-height: 2rem;
  }

  .result {
    display: grid;
    gap: var(--space-2);
  }

  .headline {
    font-weight: 650;
  }

  ul {
    display: grid;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: grid;
    gap: var(--space-1);
    padding-top: var(--space-2);
    border-top: 1px solid var(--border);
  }

  .who {
    font-weight: 650;
  }

  .summary,
  .outcome {
    overflow-wrap: anywhere;
  }

  .outcome {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.75rem;
  }

  .note {
    color: var(--text-muted);
  }
</style>
