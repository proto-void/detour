/** One polite live region per page; render `live.message` inside an `aria-live` element. */
export const live = $state({ message: '' });

export function announce(message: string) {
  // Clearing first makes screen readers repeat identical messages.
  live.message = '';
  setTimeout(() => (live.message = message), 50);
}
