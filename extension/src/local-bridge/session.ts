import * as v from 'valibot';
import type { Workspace } from '../rule-model/schema';
import type { StorageAreaLike } from '../rule-model/storage';
import { DEFAULT_BRIDGE_PORT } from './paths';

export const BRIDGE_SESSION_KEY = 'bridgeSession';
export { DEFAULT_BRIDGE_PORT };

export const BridgeSessionSchema = v.object({
  port: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(65535)),
  token: v.pipe(v.string(), v.regex(/^[0-9a-f]{64}$/)),
  /** Folder basename from /health. Never a full path. */
  rootLabel: v.pipe(v.string(), v.minLength(1), v.maxLength(80)),
});

export type BridgeSession = v.InferOutput<typeof BridgeSessionSchema>;

export async function loadBridgeSession(area: StorageAreaLike): Promise<BridgeSession | null> {
  const stored = (await area.get(BRIDGE_SESSION_KEY))[BRIDGE_SESSION_KEY];
  if (stored == null) return null;
  const parsed = v.safeParse(BridgeSessionSchema, stored);
  return parsed.success ? parsed.output : null;
}

export async function saveBridgeSession(area: StorageAreaLike, session: BridgeSession): Promise<void> {
  const parsed = v.parse(BridgeSessionSchema, session);
  await area.set({ [BRIDGE_SESSION_KEY]: parsed });
}

export async function clearBridgeSession(area: StorageAreaLike): Promise<void> {
  await area.set({ [BRIDGE_SESSION_KEY]: null });
}

export function workspaceNeedsBridge(workspace: Workspace): boolean {
  return workspace.groups.some((group) => group.enabled && group.rules.some((rule) => rule.enabled && rule.action.type === 'serveLocal'));
}

function cleanLabel(value: unknown): string {
  if (typeof value !== 'string') return 'folder';
  const clean = value.replace(/[\r\n\0]/g, '').trim().slice(0, 80);
  return clean || 'folder';
}

/** Health check. The URL is always 127.0.0.1 — never a host the user typed. */
export async function probeBridge(
  session: Pick<BridgeSession, 'port' | 'token'>,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; rootLabel: string } | { ok: false }> {
  if (!Number.isInteger(session.port) || session.port < 1 || session.port > 65535) return { ok: false };
  if (!/^[0-9a-f]{64}$/.test(session.token)) return { ok: false };
  try {
    const res = await fetchImpl(`http://127.0.0.1:${session.port}/health`, {
      redirect: 'error',
      signal: AbortSignal.timeout(800),
      headers: { authorization: `Bearer ${session.token}` },
    });
    if (!res.ok) return { ok: false };
    const data: unknown = await res.json();
    if (typeof data !== 'object' || data === null || !('ok' in data) || (data as { ok: unknown }).ok !== true) return { ok: false };
    return { ok: true, rootLabel: cleanLabel('rootLabel' in data ? (data as { rootLabel: unknown }).rootLabel : undefined) };
  } catch {
    return { ok: false };
  }
}

export function parseConnectInput(portText: string, tokenText: string): { ok: true; port: number; token: string } | { ok: false; message: string } {
  const port = Number(portText.trim());
  if (!Number.isInteger(port) || port < 1 || port > 65535) return { ok: false, message: 'Port must be a whole number from 1 to 65535.' };
  const token = tokenText.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(token)) return { ok: false, message: 'Paste the 64-character token the bridge printed.' };
  return { ok: true, port, token };
}

export async function establishBridge(
  input: { port: string; token: string },
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; session: BridgeSession } | { ok: false; message: string }> {
  const parsed = parseConnectInput(input.port, input.token);
  if (!parsed.ok) return parsed;
  const probe = await probeBridge(parsed, fetchImpl);
  if (!probe.ok) {
    return { ok: false, message: `Nothing answered on 127.0.0.1:${parsed.port}. Start it with detour bridge <folder> and paste the new token.` };
  }
  return { ok: true, session: { port: parsed.port, token: parsed.token, rootLabel: probe.rootLabel } };
}
