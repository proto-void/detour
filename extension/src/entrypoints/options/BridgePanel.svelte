<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from 'wxt/browser';
  import {
    BRIDGE_SESSION_KEY,
    clearBridgeSession,
    establishBridge,
    loadBridgeSession,
    saveBridgeSession,
    DEFAULT_BRIDGE_PORT,
    type BridgeSession,
  } from '../../local-bridge/session';
  import type { StorageAreaLike } from '../../rule-model/storage';
  import { announce } from '../../ui/announcer.svelte';
  import Field from '../../ui/Field.svelte';

  let { area }: { area: StorageAreaLike } = $props();

  let port = $state(String(DEFAULT_BRIDGE_PORT));
  let token = $state('');
  let session = $state<BridgeSession | null>(null);
  let error = $state('');
  let busy = $state(false);

  async function refresh() {
    session = await loadBridgeSession(area);
  }

  onMount(() => {
    void refresh();
    const onChanged = (changes: Record<string, unknown>, areaName: string) => {
      if (areaName === 'local' && BRIDGE_SESSION_KEY in changes) void refresh();
    };
    browser.storage.onChanged.addListener(onChanged);
    return () => browser.storage.onChanged.removeListener(onChanged);
  });

  async function connect() {
    busy = true;
    error = '';
    const result = await establishBridge({ port, token });
    busy = false;
    if (!result.ok) {
      error = result.message;
      announce(result.message);
      return;
    }
    await saveBridgeSession(area, result.session);
    token = '';
    announce(`Connected to ${result.session.rootLabel}.`);
  }

  async function disconnect() {
    await clearBridgeSession(area);
    announce('Local Bridge disconnected.');
  }
</script>

<section class="bridge" aria-labelledby="bridge-heading">
  <h2 id="bridge-heading">Local Bridge</h2>
  {#if session}
    <p data-testid="bridge-status">Connected to {session.rootLabel} on 127.0.0.1:{session.port}.</p>
    <p class="muted">Listens on this computer only. If a rule says the bridge is not running, start <code>detour bridge &lt;folder&gt;</code> again and connect the new token.</p>
    <button type="button" class="btn" id="bridge-disconnect" onclick={disconnect}>Disconnect</button>
  {:else}
    <p class="muted">
      Optional. <code>detour bridge &lt;folder&gt;</code> serves that folder on 127.0.0.1. Paste the token it prints. It changes every start.
    </p>
    <form
      onsubmit={(event) => {
        event.preventDefault();
        void connect();
      }}
    >
      <Field id="bridge-port" label="Port">
        {#snippet children({ describedby })}
          <input id="bridge-port" type="text" inputmode="numeric" autocomplete="off" bind:value={port} aria-describedby={describedby} />
        {/snippet}
      </Field>
      <Field id="bridge-token" label="Token" error={error}>
        {#snippet children({ describedby, invalid })}
          <input id="bridge-token" type="password" autocomplete="off" spellcheck="false" bind:value={token} aria-invalid={invalid} aria-describedby={describedby} />
        {/snippet}
      </Field>
      <button type="submit" class="btn" id="bridge-connect" disabled={busy} aria-busy={busy}>{busy ? 'Connecting…' : 'Connect'}</button>
    </form>
    <p class="muted" data-testid="bridge-status">{error === '' ? 'Not connected.' : error}</p>
  {/if}
</section>

<style>
  .bridge {
    display: grid;
    gap: var(--space-2);
    padding: var(--space-3);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
  }

  h2 {
    font-size: 1rem;
    font-weight: 650;
  }

  form {
    display: grid;
    gap: var(--space-2);
    max-width: 28rem;
  }
</style>
