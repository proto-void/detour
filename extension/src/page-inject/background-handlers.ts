import type { StorageAreaLike } from '../rule-model/storage';
import type { BridgeMessage } from './bridge';
import { originOf, recordFailure } from './failures';
import { PAGE_CONFIG_KEY, type PageConfig } from './plan';

export interface Sender {
  tab?: { id?: number };
  frameId?: number;
  url?: string;
}

export interface HandlerDeps {
  local: StorageAreaLike;
  session: StorageAreaLike;
  insertCSS(details: { target: { tabId: number; frameIds: number[] }; css: string }): Promise<void>;
  fetchText(url: string): Promise<string>;
  now?: () => Date;
}

const isBridgeMessage = (m: unknown): m is BridgeMessage => {
  const msg = m as Partial<Record<string, unknown>> | null;
  if (typeof msg?.ruleId !== 'string') return false;
  return msg.type === 'detour:insertCss' || (msg.type === 'detour:failure' && typeof msg.message === 'string');
};

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Returns false for messages that aren't the bridge's, so other listeners can answer them. */
export async function handleBridgeMessage(message: unknown, sender: Sender, deps: HandlerDeps): Promise<boolean> {
  if (!isBridgeMessage(message)) return false;
  const config = (await deps.local.get(PAGE_CONFIG_KEY))[PAGE_CONFIG_KEY] as PageConfig | undefined;
  const entries = [...(config?.styles ?? []), ...(config?.scripts ?? [])];
  const entry = entries.find((e) => e.ruleId === message.ruleId);
  if (!entry) return true; // rule removed since the page loaded

  const fail = (text: string) =>
    recordFailure(deps.session, { at: (deps.now?.() ?? new Date()).toISOString(), groupId: entry.groupId, ruleId: entry.ruleId, page: originOf(sender.url), message: text });

  if (message.type === 'detour:failure') {
    await fail(message.message.slice(0, 500));
    return true;
  }
  if (!('source' in entry) || sender.tab?.id === undefined) return true;
  let css: string;
  try {
    css = entry.source.kind === 'inline' ? entry.source.code : await deps.fetchText(entry.source.url);
  } catch (e) {
    await fail(`Couldn't fetch ${entry.source.kind === 'url' ? entry.source.url : 'stylesheet'}: ${errorMessage(e)}`);
    return true;
  }
  try {
    await deps.insertCSS({ target: { tabId: sender.tab.id, frameIds: [sender.frameId ?? 0] }, css });
  } catch (e) {
    await fail(`Couldn't insert CSS: ${errorMessage(e)}`);
  }
  return true;
}

export async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}
