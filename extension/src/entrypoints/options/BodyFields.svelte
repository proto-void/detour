<script lang="ts">
  import { bodyDataUrl } from '../../engine-core/body-data-url';
  import type { Action } from '../../rule-model/schema';
  import CodeEditor from '../../ui/CodeEditor.svelte';
  import Field from '../../ui/Field.svelte';
  import { codeLanguage, type RuleValidation } from '../../workspace-ui/editor';

  type BodyAction = Extract<Action, { type: 'overrideBody' }>;

  let {
    action,
    ruleId,
    pattern,
    validation,
    showAll,
    bodyRewriteAllowed,
    onchange,
  }: {
    action: BodyAction;
    ruleId: string;
    pattern: string;
    validation: RuleValidation;
    showAll: boolean;
    bodyRewriteAllowed: boolean;
    onchange: (action: Action) => void;
  } = $props();

  const id = $derived(`rule-${ruleId}`);
  const language = $derived(codeLanguage(action));
  const isFirefox = import.meta.env.FIREFOX;
  const delivery = $derived(action.delivery ?? 'redirect');
  const inPlace = $derived(delivery === 'inPlace');
  const errorFor = (key: string, value: string) => {
    const message = validation.errors[key];
    return message && (showAll || value !== '') ? message : '';
  };

  const set = (patch: Partial<BodyAction>) => onchange({ ...action, ...patch });

  function previewDataUrl() {
    const url = bodyDataUrl(action.body, pattern, action.contentType);
    window.open(url, '_blank', 'noopener,noreferrer');
  }
</script>

<Field
  id="{id}-delivery"
  label="Delivery"
  hint="Redirect works with DevTools open (no debugger). In place keeps the URL for CSP or Subresource Integrity pages."
>
  {#snippet children()}
    <select
      id="{id}-delivery"
      value={delivery}
      onchange={(e) => set({ delivery: e.currentTarget.value as BodyAction['delivery'] })}
    >
      <option value="redirect">Redirect to data: URL (works with DevTools open; no debugger)</option>
      <option value="inPlace">Replace in place (keeps URL; for CSP/SRI pages; uses debugger)</option>
    </select>
  {/snippet}
</Field>

<Field
  id="{id}-body"
  label="Replacement body"
  hint={inPlace
    ? 'The address of the file stays the same, so the page’s Content-Security-Policy still allows it. Files on disk use Serve local file. After you allow response rewriting, those keep the original URL too.'
    : 'The browser redirects the request to a data: URL with this text. Files on disk use Serve local file.'}
  error={errorFor('action.body', action.body)}
>
  {#snippet children({ describedby, invalid })}
    <CodeEditor id="{id}-body" label="Replacement body" value={action.body} {language} {describedby} {invalid} onchange={(body) => set({ body })} />
  {/snippet}
</Field>

<Field id="{id}-content-type" label="Content-Type (optional)" hint={inPlace ? 'Leave blank to keep the server’s Content-Type.' : 'Leave blank to infer from the URL (e.g. .json → application/json).'}>
  {#snippet children()}
    <input
      id="{id}-content-type"
      type="text"
      spellcheck="false"
      autocomplete="off"
      placeholder="text/javascript"
      value={action.contentType ?? ''}
      oninput={(e) => {
        const contentType = e.currentTarget.value.trim();
        if (contentType === '') {
          const { contentType: _omit, ...rest } = action;
          onchange(rest);
          return;
        }
        set({ contentType });
      }}
    />
  {/snippet}
</Field>

{#if !inPlace}
  <p class="note" role="note">
    Network shows the original URL as 307 Internal Redirect, then a data: request with this body. Clear the Network filter and turn off Hide data URLs to see it. Redirect delivery works with DevTools open and does not need Allow debugger. It is blocked if the page’s CSP disallows <code>data:</code>, and Subresource Integrity will reject the response — switch to Replace in place for those pages.
  </p>
  <p>
    <button type="button" class="btn" data-testid="preview-data-url" onclick={previewDataUrl} disabled={action.body === ''}>
      Preview data: URL
    </button>
  </p>
{:else if isFirefox}
  <p class="note" role="note">
    Firefox rewrites the response in the browser. It does not use the debugger, so DevTools stays usable.
    {#if bodyRewriteAllowed}
      Response rewriting is allowed.
    {:else}
      Use Allow response rewriting at the top of this page. Nothing is rewritten until you do.
    {/if}
    After that, Detour sets <code>integrity</code> on a script or stylesheet whose address matches an override to a SHA-384 hash of your file, including when page JavaScript sets that attribute or copies it with <code>setAttributeNS</code>, or moves that attribute with <code>setAttributeNode</code> or <code>setAttributeNodeNS</code>, or adopts it with <code>setNamedItem</code> or <code>setNamedItemNS</code>, or writes <code>Attr.value</code> after it is already on the element, passes the tag to <code>innerHTML</code>, <code>outerHTML</code>, a shadow root's <code>innerHTML</code>, or <code>insertAdjacentHTML</code>, or passes the tag to <code>createContextualFragment</code>, or to <code>setHTMLUnsafe</code> even when that call does not run scripts, or to <code>Document.parseHTMLUnsafe</code> or <code>DOMParser</code> with type <code>text/html</code>, or passes the markup to <code>document.write</code> or <code>document.writeln</code>, or sets an iframe's <code>srcdoc</code>. A node moved from that document into the page keeps that hash. Scripting on the parsed document stays off. The browser still checks the hash. Other files keep the hash the page set.
  </p>
{:else}
  <p class="note warning" role="note">
    To check a downstream API after this override: load the page with DevTools closed, then open Network. Opening DevTools/Network on that tab disconnects Detour, so you see the server body for this file until the next load with DevTools closed. To inspect this file’s own response in Network with DevTools open, use Redirect delivery or Serve local (bridge) instead. Chrome attaches its debugger to open tabs while this rule is on. Chrome shows a “started debugging” banner; cancelling
    the banner leaves that tab alone until you change the rule.
    {#if bodyRewriteAllowed}
      Body override is allowed. Chrome may show a debugging banner while this rule is on.
    {:else}
      Use Allow debugger at the top of this page. Nothing attaches until you do.
    {/if}
  </p>
  <p class="note" role="note">
    After that, Detour sets <code>integrity</code> on a script or stylesheet whose address matches an override to a SHA-384 hash of your file, including when page JavaScript sets that attribute or copies it with <code>setAttributeNS</code>, or moves that attribute with <code>setAttributeNode</code> or <code>setAttributeNodeNS</code>, or adopts it with <code>setNamedItem</code> or <code>setNamedItemNS</code>, or writes <code>Attr.value</code> after it is already on the element, passes the tag to <code>innerHTML</code>, <code>outerHTML</code>, a shadow root's <code>innerHTML</code>, or <code>insertAdjacentHTML</code>, or passes the tag to <code>createContextualFragment</code>, or to <code>setHTMLUnsafe</code> even when that call does not run scripts, or to <code>Document.parseHTMLUnsafe</code> or <code>DOMParser</code> with type <code>text/html</code>, or passes the markup to <code>document.write</code> or <code>document.writeln</code>, or sets an iframe's <code>srcdoc</code>. A node moved from that document into the page keeps that hash. Scripting on the parsed document stays off. The browser still checks the hash. Other files keep the hash the page set.
  </p>
{/if}

<style>
  .note {
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .note.warning {
    color: var(--warning);
  }
</style>
