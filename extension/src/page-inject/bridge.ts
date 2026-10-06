import { CONFIG_EVENT, MATCH_EVENT, READY_EVENT } from './mock-runtime';
import { siteHost, testUrl } from './page-match';
import type { PageConfig, ScriptUrlEntry, StyleEntry } from './plan';

/** Bridge → background. The background looks rules up in `pageConfig`; messages never carry code. */
export type BridgeMessage =
  | { type: 'detour:insertCss'; ruleId: string }
  | { type: 'detour:failure'; ruleId: string; message: string }
  | { type: 'detour:matched'; source: 'page' | 'mock'; ruleId: string; url?: string };

type RunAt = StyleEntry['runAt'];

export interface BridgeEnv {
  document: Document;
  location: { href: string; hostname: string; ancestorOrigins?: { length: number; [i: number]: string } };
  isTop: boolean;
  loadConfig(): Promise<PageConfig | undefined>;
  onConfigChange(listener: (config: PageConfig | undefined) => void): void;
  send(message: BridgeMessage): Promise<unknown>;
}

function at(doc: Document, runAt: RunAt, fn: () => void) {
  if (runAt === 'document_start') return fn();
  if (runAt === 'document_end') {
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
    return;
  }
  if (doc.readyState === 'complete') fn();
  else doc.defaultView?.addEventListener('load', fn, { once: true });
}

/**
 * Isolated-world content script: forwards mock config to the MAIN-world runtime (DOM event with a
 * JSON string, which crosses worlds in Chrome and Firefox), asks the background to insert CSS, and
 * inserts script-URL tags. Reports failures; never works around page CSP.
 */
export function runBridge(env: BridgeEnv): void {
  const { document: doc, location } = env;
  let config: PageConfig | undefined;
  const pushMocks = () => doc.dispatchEvent(new CustomEvent(CONFIG_EVENT, { detail: JSON.stringify(config?.mocks ?? []) }));
  doc.addEventListener(READY_EVENT, pushMocks);
  doc.addEventListener(MATCH_EVENT, (event) => {
    try {
      const detail = JSON.parse(String((event as CustomEvent).detail)) as { ruleId?: unknown; url?: unknown };
      if (typeof detail.ruleId !== 'string' || typeof detail.url !== 'string') return;
      void env.send({ type: 'detour:matched', source: 'mock', ruleId: detail.ruleId, url: detail.url.slice(0, 2000) }).catch(() => {});
    } catch {
      /* a page can dispatch this event; ignore anything that isn't ours */
    }
  });

  const applies = (entry: StyleEntry | ScriptUrlEntry) => (entry.allFrames || env.isTop) && testUrl(entry.page, location.href, siteHost(location));
  const fail = (ruleId: string, message: string) => void env.send({ type: 'detour:failure', ruleId, message }).catch(() => {});

  const insertScript = (entry: ScriptUrlEntry) => {
    const script = doc.createElement('script');
    script.src = entry.url;
    // Executes in insertion order like a parser-inserted script, after it downloads.
    script.async = false;
    let blockedByCsp = false;
    const onViolation = (e: SecurityPolicyViolationEvent) => {
      if (e.blockedURI === entry.url || entry.url.startsWith(e.blockedURI)) blockedByCsp = true;
    };
    doc.addEventListener('securitypolicyviolation', onViolation);
    const done = () => doc.removeEventListener('securitypolicyviolation', onViolation);
    script.addEventListener('load', done, { once: true });
    script.addEventListener('error', () => {
      done();
      fail(entry.ruleId, blockedByCsp ? `The page's Content-Security-Policy blocked ${entry.url}` : `Couldn't load ${entry.url} (unreachable, or blocked by the page's Content-Security-Policy)`);
    }, { once: true });
    (doc.head ?? doc.documentElement).append(script);
  };

  void env.loadConfig().then((loaded) => {
    config = loaded;
    pushMocks();
    if (!config) return;
    for (const style of config.styles.filter(applies)) {
      at(doc, style.runAt, () => void env.send({ type: 'detour:insertCss', ruleId: style.ruleId }).catch(() => {}));
    }
    for (const script of config.scripts.filter(applies)) {
      at(doc, script.runAt, () => {
        insertScript(script);
        void env.send({ type: 'detour:matched', source: 'page', ruleId: script.ruleId }).catch(() => {});
      });
    }
  });
  // Live: mocks switch on/off without reload. CSS and scripts change on the next load.
  env.onConfigChange((next) => {
    config = next;
    pushMocks();
  });
}
