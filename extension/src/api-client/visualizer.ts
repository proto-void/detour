/** Visualizer payload from sandboxed scripts (`pm.visualizer.set`). */

export interface VisualizerPayload {
  template: string;
  data: unknown;
}

export function isVisualizerPayload(v: unknown): v is VisualizerPayload {
  return !!v && typeof v === 'object' && typeof (v as VisualizerPayload).template === 'string';
}

/**
 * Render a minimal Mustache-like `{{key}}` template into HTML for a sandboxed iframe.
 * Not a full templating engine — enough for simple charts/tables from script data.
 */
export function renderVisualizerHtml(payload: VisualizerPayload): string {
  const data = payload.data && typeof payload.data === 'object' ? (payload.data as Record<string, unknown>) : { value: payload.data };
  let html = payload.template;
  html = html.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, path: string) => {
    const parts = path.split('.');
    let cur: unknown = data;
    for (const p of parts) {
      if (cur && typeof cur === 'object' && p in (cur as object)) cur = (cur as Record<string, unknown>)[p];
      else return '';
    }
    return escapeHtml(cur == null ? '' : typeof cur === 'string' ? cur : JSON.stringify(cur));
  });
  return `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:system-ui;margin:1rem;color:#111}</style></head><body>${html}</body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
