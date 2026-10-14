import type { Collection, CollectionNode, ApiRequest } from './model';

/** Export a collection as Markdown API reference. */
export function exportDocsMarkdown(collection: Collection): string {
  const lines: string[] = [`# ${collection.name}`, ''];
  if (collection.description) {
    lines.push(collection.description, '');
  }
  walk(collection.children ?? [], (req, folderPath) => {
    const heading = folderPath.length ? `${folderPath.join(' / ')} — ${req.name}` : req.name;
    lines.push(`## ${heading}`, '');
    lines.push(`\`${req.method} ${req.url}\``, '');
    if (req.headers?.length) {
      lines.push('### Headers', '');
      for (const h of req.headers.filter((r) => r.enabled !== false && r.key)) {
        lines.push(`- \`${h.key}\`: ${h.value}`);
      }
      lines.push('');
    }
    if (req.body?.mode === 'raw' && req.body.text) {
      lines.push('### Body', '', '```' + (req.body.language === 'json' ? 'json' : ''), req.body.text, '```', '');
    }
  });
  return lines.join('\n');
}

/** Standalone HTML API reference (no external assets). */
export function exportDocsHtml(collection: Collection): string {
  const mdish: string[] = [];
  walk(collection.children ?? [], (req, folderPath) => {
    const title = folderPath.length ? `${folderPath.join(' / ')} — ${req.name}` : req.name;
    mdish.push(`<section><h2>${esc(title)}</h2><p><code>${esc(req.method)} ${esc(req.url)}</code></p>`);
    if (req.body?.mode === 'raw' && req.body.text) {
      mdish.push(`<pre>${esc(req.body.text)}</pre>`);
    }
    mdish.push('</section>');
  });
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(collection.name)}</title>
<style>body{font-family:ui-sans-serif,system-ui;max-width:52rem;margin:2rem auto;padding:0 1rem;line-height:1.45}code,pre{font-family:ui-monospace,Menlo,monospace}pre{background:#f4f4f5;padding:1rem;overflow:auto}section{margin:1.5rem 0;padding-bottom:1rem;border-bottom:1px solid #e4e4e7}</style>
</head><body><h1>${esc(collection.name)}</h1>${collection.description ? `<p>${esc(collection.description)}</p>` : ''}${mdish.join('')}</body></html>`;
}

function walk(nodes: CollectionNode[], visit: (req: ApiRequest, folderPath: string[]) => void, folderPath: string[] = []): void {
  for (const node of nodes) {
    if (node.kind === 'request') visit(node.request, folderPath);
    else walk(node.children, visit, [...folderPath, node.name]);
  }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
