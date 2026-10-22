import {
  isScriptRunResult,
  SCRIPT_TIMEOUT_MS,
  withScriptTimeout,
  type ScriptPhase,
  type ScriptRunRequest,
  type ScriptRunResult,
} from './scripts';

export interface RunScriptOptions {
  /** Absolute URL to the sandboxed page (extension getURL). */
  sandboxUrl: string;
  phase: ScriptPhase;
  code: string;
  context: ScriptRunRequest['context'];
  timeoutMs?: number;
  /** Injected for tests. */
  createIframe?: () => HTMLIFrameElement;
  document?: Document;
}

/**
 * Run user script code in a sandboxed iframe (null origin). No extension APIs in the frame.
 * Host must pass chrome.runtime.getURL('api-script-sandbox.html').
 */
export async function runSandboxedScript(options: RunScriptOptions): Promise<ScriptRunResult> {
  const code = options.code.trim();
  if (code === '') {
    return { type: 'detour-api-script-result', id: 'skip', ok: true, tests: [] };
  }

  const doc = options.document ?? globalThis.document;
  const id = crypto.randomUUID();
  const iframe = options.createIframe?.() ?? doc.createElement('iframe');
  iframe.setAttribute('sandbox', 'allow-scripts');
  iframe.style.display = 'none';
  iframe.src = options.sandboxUrl;

  const result = withScriptTimeout(
    new Promise<ScriptRunResult>((resolve, reject) => {
      const onMessage = (event: MessageEvent) => {
        if (event.source !== iframe.contentWindow) return;
        if (!isScriptRunResult(event.data) || event.data.id !== id) return;
        cleanup();
        resolve(event.data);
      };
      const onLoad = () => {
        const payload: ScriptRunRequest = {
          type: 'detour-api-script-run',
          id,
          phase: options.phase,
          code: options.code,
          context: options.context,
        };
        iframe.contentWindow?.postMessage(payload, '*');
      };
      const cleanup = () => {
        window.removeEventListener('message', onMessage);
        iframe.removeEventListener('load', onLoad);
        iframe.remove();
      };
      window.addEventListener('message', onMessage);
      iframe.addEventListener('load', onLoad);
      doc.body.appendChild(iframe);
      // If createIframe already attached a completed frame in tests:
      if (iframe.contentWindow && options.createIframe) {
        try {
          onLoad();
        } catch (err) {
          cleanup();
          reject(err);
        }
      }
    }),
    options.timeoutMs ?? SCRIPT_TIMEOUT_MS,
  );

  try {
    return await result;
  } catch (err) {
    iframe.remove();
    return {
      type: 'detour-api-script-result',
      id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      tests: [],
    };
  }
}

export function scopesToMaps(scopes: {
  environment?: { key: string; currentValue?: string; initialValue?: string }[];
  collection?: { key: string; value: string; enabled?: boolean }[];
  globals?: { key: string; value: string; enabled?: boolean }[];
}): Pick<ScriptRunRequest['context'], 'environment' | 'collectionVariables' | 'globals'> {
  const environment: Record<string, string> = {};
  for (const v of scopes.environment ?? []) {
    if (!v.key) continue;
    const cur = (v.currentValue ?? '').trim();
    environment[v.key] = cur !== '' ? (v.currentValue ?? '') : (v.initialValue ?? '');
  }
  const collectionVariables: Record<string, string> = {};
  for (const r of scopes.collection ?? []) {
    if (r.enabled === false || !r.key) continue;
    collectionVariables[r.key] = r.value;
  }
  const globals: Record<string, string> = {};
  for (const r of scopes.globals ?? []) {
    if (r.enabled === false || !r.key) continue;
    globals[r.key] = r.value;
  }
  return { environment, collectionVariables, globals };
}
