import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { css } from '@codemirror/lang-css';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { bracketMatching, HighlightStyle, indentOnInput, syntaxHighlighting } from '@codemirror/language';
import { Compartment, EditorState, type Extension } from '@codemirror/state';
import { drawSelection, EditorView, keymap, lineNumbers } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';

/** Loaded on demand (dynamic import) so CodeMirror stays out of the popup and the options first paint. */

export type CodeLanguage = 'javascript' | 'css' | 'json' | 'text';

const languages: Record<CodeLanguage, () => Extension> = {
  javascript: () => javascript(),
  css: () => css(),
  json: () => json(),
  text: () => [],
};

const highlightDark = HighlightStyle.define([
  { tag: [t.keyword, t.operatorKeyword, t.modifier], color: '#c792ea' },
  { tag: [t.string, t.special(t.string), t.regexp], color: '#c3e88d' },
  { tag: [t.number, t.bool, t.null, t.atom], color: '#f78c6c' },
  { tag: [t.comment], color: '#8b949e', fontStyle: 'italic' },
  { tag: [t.propertyName, t.attributeName], color: '#82aaff' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: '#ffcb6b' },
  { tag: [t.className, t.typeName, t.tagName], color: '#f07178' },
  { tag: [t.invalid], color: '#f2777a' },
]);

const highlightLight = HighlightStyle.define([
  { tag: [t.keyword, t.operatorKeyword, t.modifier], color: '#6f42c1' },
  { tag: [t.string, t.special(t.string), t.regexp], color: '#1a7f37' },
  { tag: [t.number, t.bool, t.null, t.atom], color: '#b35900' },
  { tag: [t.comment], color: '#59636e', fontStyle: 'italic' },
  { tag: [t.propertyName, t.attributeName], color: '#0550ae' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: '#9a6700' },
  { tag: [t.className, t.typeName, t.tagName], color: '#a40e26' },
  { tag: [t.invalid], color: '#b42318' },
]);

const editorChrome = (light: boolean) =>
  EditorView.theme(
    {
      '&': {
        backgroundColor: 'var(--bg)',
        color: 'var(--text)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        width: '100%',
        maxWidth: '100%',
        minWidth: '0',
      },
      '&.cm-focused': { outline: '2px solid var(--focus)', outlineOffset: '2px' },
      '.cm-scroller': {
        font: '0.8rem/1.5 ui-monospace, SFMono-Regular, Menlo, monospace',
        maxHeight: '24rem',
        minHeight: '6rem',
        overflowX: 'hidden',
      },
      '.cm-content': { caretColor: 'var(--text)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
      '.cm-gutters': { backgroundColor: 'var(--surface)', color: 'var(--text-muted)', border: 'none' },
      '.cm-cursor': { borderLeftColor: 'var(--text)' },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': { backgroundColor: 'var(--selection)' },
    },
    { dark: !light },
  );

const isLight = () => document.documentElement.dataset.theme === 'light';

export interface CodeEditorHandle {
  setValue(value: string): void;
  setLanguage(language: CodeLanguage): void;
  setAttributes(attributes: Record<string, string>): void;
  destroy(): void;
}

export function createEditor(
  parent: HTMLElement,
  options: { value: string; language: CodeLanguage; attributes: Record<string, string>; onchange: (value: string) => void },
): CodeEditorHandle {
  const language = new Compartment();
  const attributes = new Compartment();
  const appearance = new Compartment();
  const coloring = new Compartment();
  const light = isLight();
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: options.value,
      extensions: [
        lineNumbers(),
        history(),
        drawSelection(),
        indentOnInput(),
        bracketMatching(),
        coloring.of(syntaxHighlighting(light ? highlightLight : highlightDark)),
        // No indentWithTab: Tab must keep moving focus out of the editor (WCAG 2.1.2).
        keymap.of([...defaultKeymap, ...historyKeymap]),
        language.of(languages[options.language]()),
        attributes.of(EditorView.contentAttributes.of(options.attributes)),
        appearance.of(editorChrome(light)),
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) options.onchange(update.state.doc.toString());
        }),
      ],
    }),
  });
  const observer = new MutationObserver(() => {
    const next = isLight();
    view.dispatch({
      effects: [appearance.reconfigure(editorChrome(next)), coloring.reconfigure(syntaxHighlighting(next ? highlightLight : highlightDark))],
    });
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return {
    setValue(value) {
      if (view.state.doc.toString() !== value) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
    },
    setLanguage: (next) => view.dispatch({ effects: language.reconfigure(languages[next]()) }),
    setAttributes: (next) => view.dispatch({ effects: attributes.reconfigure(EditorView.contentAttributes.of(next)) }),
    destroy: () => {
      observer.disconnect();
      view.destroy();
    },
  };
}
