<script lang="ts">
  /** Shared 16×16 stroke icons for the options/popup chrome. */
  let {
    name,
    size = 16,
  }: {
    name:
      | 'chevron'
      | 'grip'
      | 'kebab'
      | 'moon'
      | 'sun'
      | 'shield'
      | 'plus'
      | 'layers'
      | 'wand'
      | 'search'
      | 'x'
      | 'mark'
      | 'rules'
      | 'tester'
      | 'recipes'
      | 'db'
      | 'log'
      | 'bridge'
      | 'redirect'
      | 'block'
      | 'headers'
      | 'inject-js'
      | 'inject-css'
      | 'mock'
      | 'body'
      | 'local';
    size?: number;
  } = $props();
</script>

<svg class="icon" width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
  {#if name === 'chevron'}
    <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
  {:else if name === 'grip'}
    <path d="M6 4h.01M10 4h.01M6 8h.01M10 8h.01M6 12h.01M10 12h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
  {:else if name === 'kebab'}
    <path d="M8 3.5h.01M8 8h.01M8 12.5h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
  {:else if name === 'moon'}
    <path d="M13 9.5A5.5 5.5 0 1 1 6.5 3 4.2 4.2 0 0 0 13 9.5z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" />
  {:else if name === 'sun'}
    <circle cx="8" cy="8" r="2.5" fill="none" stroke="currentColor" stroke-width="1.4" />
    <path d="M8 2v1.5M8 12.5V14M2 8h1.5M12.5 8H14M3.8 3.8l1 1M11.2 11.2l1 1M3.8 12.2l1-1M11.2 4.8l1-1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
  {:else if name === 'shield'}
    <path d="M8 2.5 13 4.5v4c0 3.2-2.1 5.2-5 6.5-2.9-1.3-5-3.3-5-6.5v-4L8 2.5z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" />
  {:else if name === 'plus'}
    <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
  {:else if name === 'layers'}
    <path d="M8 2.5 13.5 5.5 8 8.5 2.5 5.5 8 2.5zM2.5 8.5 8 11.5l5.5-3M2.5 11 8 14l5.5-3" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" />
  {:else if name === 'wand'}
    <path d="M3 13 10.5 5.5M9 4l1.5-1.5L14 6 12.5 7.5M5.5 2.5v2M2.5 5.5h2M12 11v2M10 13h2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" />
  {:else if name === 'search'}
    <circle cx="7" cy="7" r="3.5" fill="none" stroke="currentColor" stroke-width="1.4" />
    <path d="M10 10.5 13.5 14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
  {:else if name === 'x'}
    <path d="M4.5 4.5 11.5 11.5M11.5 4.5 4.5 11.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
  {:else if name === 'mark'}
    <rect x="1.5" y="1.5" width="13" height="13" rx="3" fill="none" stroke="currentColor" stroke-width="1.3" />
    <path d="M4 8h3.2c1.4 0 1.4-3.5 2.8-3.5H12M10.5 3.5 12 4.5l-1.5 1" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" />
  {:else if name === 'rules'}
    <path d="M3.5 4.5h9M3.5 8h9M3.5 11.5h6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
  {:else if name === 'tester'}
    <circle cx="7" cy="7" r="3.5" fill="none" stroke="currentColor" stroke-width="1.4" />
    <path d="M10 10.5 13.5 14M5.5 7h3M7 5.5v3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
  {:else if name === 'recipes'}
    <path d="M4 13V4.5h5.5L12 7v6H4zM9.5 4.5V7H12" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" />
  {:else if name === 'db'}
    <ellipse cx="8" cy="4" rx="5" ry="1.8" fill="none" stroke="currentColor" stroke-width="1.3" />
    <path d="M3 4v8c0 1 2.2 1.8 5 1.8s5-.8 5-1.8V4M3 8c0 1 2.2 1.8 5 1.8s5-.8 5-1.8" fill="none" stroke="currentColor" stroke-width="1.3" />
  {:else if name === 'log'}
    <path d="M3.5 3.5h9v9h-9zM6 6.5h4M6 9.5h3" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" />
  {:else if name === 'bridge'}
    <path d="M2.5 10c1.5-3 3-4.5 5.5-4.5S12 7 13.5 10M5 10.5h6" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
  {:else if name === 'redirect'}
    <path d="M3 8h8M8.5 4.5 12 8l-3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
  {:else if name === 'block'}
    <circle cx="8" cy="8" r="5" fill="none" stroke="currentColor" stroke-width="1.4" />
    <path d="M4.5 4.5 11.5 11.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
  {:else if name === 'headers'}
    <path d="M3.5 4.5h9M3.5 8h9M3.5 11.5h5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
  {:else if name === 'inject-js'}
    <path d="M5 4.5 2.5 8 5 11.5M11 4.5 13.5 8 11 11.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
  {:else if name === 'inject-css'}
    <path d="M4 3.5h8l-1 9-3 1.5-3-1.5-1-9zM6 6.5h4M6.5 9.5h3" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" />
  {:else if name === 'mock'}
    <path d="M3 5.5h10v5H3zM5.5 8h5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" />
  {:else if name === 'body'}
    <path d="M4 3.5h8v9H4zM6 6.5h4M6 9h3" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" />
  {:else if name === 'local'}
    <path d="M3 7.5 8 3.5l5 4V13H9.5V9.5h-3V13H3V7.5z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" />
  {/if}
</svg>

<style>
  .icon {
    display: block;
    flex-shrink: 0;
  }
</style>
