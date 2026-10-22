<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from 'wxt/browser';
  import { queueCapture } from '../../api-client/capture';
  import type { Workspace } from '../../rule-model/schema';
  import { loadEnabled, loadWorkspace } from '../../rule-model/storage';
  import ThemeToggle from '../../ui/ThemeToggle.svelte';
  import { inspectPage } from '../../workspace-ui/devtools';

  interface Inspected {
    inspectedWindow: { tabId: number };
    network: {
      onNavigated: {
        addListener(callback: (url: string) => void): void;
        removeListener(callback: (url: string) => void): void;
      };
    };
  }

  const devtools = (browser as unknown as { devtools?: Inspected }).devtools;
  const area = browser.storage.local;

  let workspace = $state<Workspace>({ groups: [] });
  let enabled = $state(true);
  let userScripts = $state(true);
  let pageUrl = $state('');

  const view = $derived(inspectPage(workspace, pageUrl, { enabled, userScripts }));

  async function load() {
    enabled = await loadEnabled(area);
    const loaded = await loadWorkspace(area);
    if (loaded.ok) workspace = loaded.value;
    try {
      await (browser as unknown as { userScripts: { getScripts(): Promise<unknown> } }).userScripts.getScripts();
      userScripts = true;
    } catch {
      userScripts = false;
    }
  }

  async function readUrl() {
    if (!devtools) return;
    try {
      const tab = await browser.tabs.get(devtools.inspectedWindow.tabId);
      pageUrl = tab.url ?? '';
    } catch {
      pageUrl = '';
    }
  }

  async function sendPageToApiTester() {
    if (!pageUrl) return;
    await queueCapture(browser.storage.session, {
      method: 'GET',
      url: pageUrl,
      source: 'devtools',
    });
    const url = browser.runtime.getURL('/options.html#tester');
    await browser.tabs.create({ url });
  }

  onMount(() => {
    if (!devtools) return;
    void load();
    void readUrl();
    const onNav = (url: string) => (pageUrl = url);
    devtools.network.onNavigated.addListener(onNav);
    const onChanged = (_changes: unknown, areaName: string) => {
      if (areaName === 'local') void load();
    };
    browser.storage.onChanged.addListener(onChanged);
    return () => {
      devtools.network.onNavigated.removeListener(onNav);
      browser.storage.onChanged.removeListener(onChanged);
    };
  });
</script>

<main>
  <header>
    <h1>Detour</h1>
    {#if devtools}<ThemeToggle {area} />{/if}
  </header>

  {#if !devtools}
    <p>Open this panel from the browser's DevTools.</p>
  {:else}
    <p class="muted">Page load of the inspected page. For a script or a fetch, use API Tester on the rules page.</p>
    {#if pageUrl}<p><code>{pageUrl}</code></p>{/if}
    <p data-testid="inspect-result" aria-live="polite"><strong>{view.headline}</strong></p>
    {#if view.lines.length > 0}
      <ul>
        {#each view.lines as line, i (`${line.groupName}-${i}`)}
          <li>{line.groupName}. {line.summary} {line.outcome}</li>
        {/each}
      </ul>
    {/if}
    {#each view.notes as note, i (i)}
      <p>{note}</p>
    {/each}
    <p class="actions">
      <button type="button" class="btn" onclick={() => browser.runtime.openOptionsPage()}>Open rules…</button>
      {#if pageUrl}
        <button type="button" class="btn primary" onclick={() => void sendPageToApiTester()}>Send to API Tester</button>
      {/if}
    </p>
  {/if}
</main>

<style>
  main {
    display: grid;
    gap: var(--space-3);
    max-width: 40rem;
    padding: var(--space-4);
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding-bottom: var(--space-3);
    border-bottom: 1px solid var(--border);
  }

  h1 {
    font-size: 1rem;
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
    padding: var(--space-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
</style>
