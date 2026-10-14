/** Deep-clone JSON-serializable values (safe for Svelte $state proxies). */
export function clonePlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
