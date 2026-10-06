<script lang="ts">
  import type { Action } from '../../rule-model/schema';
  import CodeEditor from '../../ui/CodeEditor.svelte';
  import Field from '../../ui/Field.svelte';
  import { codeLanguage, type RuleValidation } from '../../workspace-ui/editor';

  type BodyAction = Extract<Action, { type: 'overrideBody' }>;

  let {
    action,
    ruleId,
    validation,
    showAll,
    onchange,
  }: {
    action: BodyAction;
    ruleId: string;
    validation: RuleValidation;
    showAll: boolean;
    onchange: (action: Action) => void;
  } = $props();

  const id = $derived(`rule-${ruleId}`);
  const language = $derived(codeLanguage(action));
  const isFirefox = import.meta.env.FIREFOX;
  const errorFor = (key: string, value: string) => {
    const message = validation.errors[key];
    return message && (showAll || value !== '') ? message : '';
  };

  const set = (patch: Partial<BodyAction>) => onchange({ ...action, ...patch });
</script>

<Field
  id="{id}-body"
  label="Replacement body"
  hint="The address of the file stays the same, so the page’s Content-Security-Policy still allows it. This is not a data: redirect. Files on disk use Serve local file. After you allow response rewriting, those keep the original URL too."
  error={errorFor('action.body', action.body)}
>
  {#snippet children({ describedby, invalid })}
    <CodeEditor id="{id}-body" label="Replacement body" value={action.body} {language} {describedby} {invalid} onchange={(body) => set({ body })} />
  {/snippet}
</Field>

<Field id="{id}-content-type" label="Content-Type (optional)" hint="Leave blank to keep the server’s Content-Type.">
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

<p class="note" role="note">
  {#if isFirefox}
    Firefox rewrites the response in the browser. It does not use the debugger, so DevTools stays usable. Use Allow response rewriting at the top of this page. Nothing is rewritten until you do.
  {:else}
    Chrome attaches its debugger to open tabs while this rule is on. Chrome shows a “started debugging” banner, and opening DevTools on that tab disconnects the override until the next load. Cancelling
    the banner leaves that tab alone until you change the rule. Use Allow debugger at the top of this page. Nothing attaches until you do.
  {/if}
  After that, Detour sets <code>integrity</code> on a script or stylesheet whose address matches an override to a SHA-384 hash of your file, including when page JavaScript sets that attribute. The browser still checks the hash. Other files keep the hash the page set.
</p>

<style>
  .note {
    font-size: 0.8rem;
    color: var(--text-muted);
  }
</style>
