import { describe, expect, it } from 'vitest';
import { createCollection, createRequestNode, addChild } from './collections';
import { exportDocsHtml, exportDocsMarkdown } from './docs-export';

describe('docs-export', () => {
  it('exports markdown and html', () => {
    let col = createCollection('API');
    col = { ...col, description: 'Demo docs' };
    const node = createRequestNode('Get item');
    node.request.method = 'GET';
    node.request.url = 'https://api.example.com/items/1';
    col = addChild(col, [], node);
    const md = exportDocsMarkdown(col);
    expect(md).toContain('# API');
    expect(md).toContain('GET https://api.example.com/items/1');
    const html = exportDocsHtml(col);
    expect(html).toContain('<h1>API</h1>');
    expect(html).toContain('Get item');
  });
});
