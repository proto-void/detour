import type { Workspace } from '../rule-model/schema';
import { describeResolution, resolveProbe, type TesterView } from './tester';

const BROWSER_PAGE = /^(chrome|chrome-untrusted|edge|about|devtools|moz-extension|chrome-extension|safari-web-extension|view-source):/i;

/** Which rule wins for a page load of the inspected URL. Same precedence as the rule tester. */
export function inspectPage(workspace: Workspace, pageUrl: string, options: { enabled: boolean; userScripts: boolean }): TesterView {
  const url = pageUrl.trim();
  if (url === '') return { headline: 'Open a web page to see which rule wins.', lines: [], notes: [] };
  if (BROWSER_PAGE.test(url)) return { headline: 'Detour does not change browser pages.', lines: [], notes: [] };

  const view = describeResolution(resolveProbe(workspace, { url, resourceType: 'main_frame', userScripts: options.userScripts }));
  if (options.enabled) return view;
  return { ...view, notes: ['Detour is off, so nothing is applied in the browser.', ...view.notes] };
}
