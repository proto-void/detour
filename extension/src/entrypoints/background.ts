import { browser } from 'wxt/browser';
import { syncRules } from '../engine-core/apply';
import { createCoalescer } from '../engine-core/coalesce';
import type { DnrApi } from '../engine-core/dnr';
import { ENABLED_KEY, WORKSPACE_KEY } from '../rule-model/storage';

export default defineBackground(() => {
  const dnr = browser.declarativeNetRequest as unknown as DnrApi;
  const area = browser.storage.local;

  const refresh = createCoalescer(async () => {
    const report = await syncRules(dnr, area);
    if (report.refused.length > 0 || report.errors.length > 0) {
      console.warn(`Detour: ${report.applied.length} rule(s) applied, ${report.refused.length} refused`, report);
    }
  });
  const refreshSafely = () => refresh().catch((e) => console.error('Detour: failed to apply rules', e));

  // Dynamic rules persist across restarts; re-applying on install/startup picks up compiler changes.
  browser.runtime.onInstalled.addListener(refreshSafely);
  browser.runtime.onStartup.addListener(refreshSafely);
  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && (WORKSPACE_KEY in changes || ENABLED_KEY in changes)) void refreshSafely();
  });
});
