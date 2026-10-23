<script lang="ts">
  import { onMount } from 'svelte';
  import type { CodeEditorHandle, CodeLanguage } from './codemirror';

  let {
    id,
    label,
    value,
    language,
    describedby,
    invalid = false,
    runGutter = false,
    onRunAt,
    onchange,
  }: {
    id: string;
    label: string;
    value: string;
    language: CodeLanguage;
    describedby?: string;
    invalid?: boolean;
    /** Databases: show Run on statement-start lines. */
    runGutter?: boolean;
    onRunAt?: (charOffset: number) => void;
    onchange: (value: string) => void;
  } = $props();

  let host: HTMLDivElement;
  let editor: CodeEditorHandle | undefined = $state.raw();

  const attributes = $derived({
    id,
    'aria-label': label,
    'aria-multiline': 'true',
    'aria-invalid': String(invalid),
    ...(describedby && { 'aria-describedby': describedby }),
    spellcheck: 'false',
  });

  export function getValue(): string {
    return editor?.getValue() ?? value;
  }

  export function getSelection(): string {
    return editor?.getSelection() ?? '';
  }

  export function getCursor(): number {
    return editor?.getCursor() ?? 0;
  }

  export function insertAtCursor(text: string) {
    if (editor) {
      editor.insertAtCursor(text);
      onchange(editor.getValue());
      return;
    }
    onchange(value + text);
  }

  onMount(() => {
    let destroyed = false;
    void import('./codemirror').then(({ createEditor }) => {
      if (destroyed) return;
      editor = createEditor(host, {
        value,
        language,
        attributes,
        onchange: (next) => onchange(next),
        runGutter,
        onRunAt,
      });
    });
    return () => {
      destroyed = true;
      editor?.destroy();
    };
  });

  // Draft replaced from outside (discard, external change): sync without echoing an onchange loop.
  $effect(() => editor?.setValue(value));
  $effect(() => editor?.setLanguage(language));
  $effect(() => editor?.setAttributes(attributes));
</script>

<!-- Plain textarea until the CodeMirror chunk loads, so the field is usable immediately. -->
{#if !editor}
  <textarea
    {id}
    class="fallback"
    spellcheck="false"
    rows="6"
    aria-invalid={invalid}
    aria-describedby={describedby}
    {value}
    oninput={(e) => onchange(e.currentTarget.value)}
  ></textarea>
{/if}
<div class="code" data-testid="code-editor" bind:this={host} hidden={!editor}></div>

<style>
  .fallback,
  .code {
    width: 100%;
    max-width: 100%;
    min-width: 0;
    overflow: auto;
  }

  .fallback {
    min-height: 6rem;
    font: 0.8rem/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
    resize: vertical;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    overflow-x: hidden;
  }

  .code[hidden] {
    display: none;
  }
</style>
