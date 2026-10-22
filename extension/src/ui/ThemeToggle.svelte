<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from 'wxt/browser';
  import type { StorageAreaLike } from '../rule-model/storage';
  import Icon from './icons/Icon.svelte';
  import Switch from './Switch.svelte';
  import { applyTheme, loadTheme, parseTheme, saveTheme, THEME_KEY, type Theme } from './theme';

  let {
    area,
    variant = 'icon',
  }: {
    area: StorageAreaLike;
    variant?: 'icon' | 'switch';
  } = $props();
  let theme = $state<Theme>('dark');

  async function toggle() {
    theme = theme === 'light' ? 'dark' : 'light';
    applyTheme(theme);
    await saveTheme(area, theme);
  }

  async function setLight(light: boolean) {
    theme = light ? 'light' : 'dark';
    applyTheme(theme);
    await saveTheme(area, theme);
  }

  onMount(() => {
    void loadTheme(area).then((value) => {
      theme = value;
      applyTheme(value);
    });
    const onChanged = (changes: Record<string, { newValue?: unknown }>, areaName: string) => {
      if (areaName !== 'local' || !(THEME_KEY in changes)) return;
      theme = parseTheme(changes[THEME_KEY]?.newValue);
      applyTheme(theme);
    };
    browser.storage.onChanged.addListener(onChanged);
    return () => browser.storage.onChanged.removeListener(onChanged);
  });
</script>

{#if variant === 'icon'}
  <button
    type="button"
    class="btn icon"
    id="theme-toggle"
    aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
    title={theme === 'light' ? 'Dark theme' : 'Light theme'}
    onclick={toggle}
  >
    <Icon name={theme === 'light' ? 'moon' : 'sun'} />
  </button>
{:else}
  <Switch id="theme-light" checked={theme === 'light'} label="Light theme" labelVisible onchange={setLight} />
{/if}
