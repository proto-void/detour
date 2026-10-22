/** Vertical grow for textareas — expand with content up to a line cap. */

export const GROW_FIELD_MAX_LINES = 10;

export function syncGrowField(el: HTMLTextAreaElement | undefined, maxLines = GROW_FIELD_MAX_LINES): void {
  if (!el) return;
  el.classList.remove('collapsed');
  el.style.height = 'auto';
  const line = Number.parseFloat(getComputedStyle(el).lineHeight) || 16;
  const max = line * maxLines + 8;
  const next = Math.min(el.scrollHeight, max);
  el.style.height = `${next}px`;
  el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden';
}

/** One-line when blurred; grow while focused (KV values, bearer token, API Tester URL). */
export function syncGrowFieldCollapsed(
  el: HTMLTextAreaElement | undefined,
  focused: boolean,
  maxLines = GROW_FIELD_MAX_LINES,
): void {
  if (!el) return;
  if (!focused) {
    el.classList.add('collapsed');
    // Clear focus-grow inline sizes so `.collapsed` CSS can lock one row.
    el.style.height = '';
    el.style.overflowY = '';
    el.scrollTop = 0;
    return;
  }
  syncGrowField(el, maxLines);
}
