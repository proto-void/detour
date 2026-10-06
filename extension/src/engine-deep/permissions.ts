import type { Workspace } from '../rule-model/schema';

/**
 * Optional permissions for body override.
 * Chrome: debugger (chrome.debugger docs).
 * Firefox MV3: webRequest + webRequestBlocking + webRequestFilterResponse
 * (MDN filterResponseData: the last one is required since Firefox 110).
 */
export function bodyPermissions(browser: 'chrome' | 'firefox'): string[] {
  return browser === 'firefox' ? ['webRequest', 'webRequestBlocking', 'webRequestFilterResponse'] : ['debugger'];
}

/** Set only from the Allow button. Absent or false means do not attach or filter. */
export const BODY_CONSENT_KEY = 'bodyEngineConsent';

export const BODY_PERMISSION_MESSAGE = {
  chrome:
    'Replacing a response body attaches Chrome’s debugger. Choose Allow debugger on the rules page. Nothing attaches until you do, and DevTools on that tab will disconnect.',
  firefox: 'Replacing a response body needs the webRequest permission. Choose Allow response rewriting on the rules page.',
} as const;

/** True when an enabled rule would attach the debugger or install the Firefox filter for inline text. */
export function workspaceHasBodyRules(workspace: Workspace): boolean {
  return workspace.groups.some((group) => group.enabled && group.rules.some((rule) => rule.enabled && rule.action.type === 'overrideBody'));
}

/** True when an enabled rule can serve a disk file in place after the same consent. */
export function workspaceHasServeLocal(workspace: Workspace): boolean {
  return workspace.groups.some((group) => group.enabled && group.rules.some((rule) => rule.enabled && rule.action.type === 'serveLocal'));
}
