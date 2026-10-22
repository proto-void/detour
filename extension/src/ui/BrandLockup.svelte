<script lang="ts">
  import { brandName, markUrl, partnerLogoUrl } from './brand';

  let {
    size = 22,
    showName = true,
  }: {
    size?: number;
    showName?: boolean;
  } = $props();
</script>

<div class="lockup">
  <img class="mark" src={markUrl} width={size} height={size} alt="" />
  {#if showName}
    <span class="name">{brandName}</span>
  {/if}
  {#if partnerLogoUrl}
    <span class="sep" aria-hidden="true">|</span>
    <img class="partner" src={partnerLogoUrl} height={size} alt="" />
  {/if}
</div>

<style>
  .lockup {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
    max-width: 100%;
  }

  .mark,
  .partner {
    display: block;
    flex-shrink: 0;
    object-fit: contain;
  }

  .name {
    font-weight: 700;
    font-size: 1.05em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sep {
    color: var(--text-muted);
    font-weight: 400;
  }
</style>
