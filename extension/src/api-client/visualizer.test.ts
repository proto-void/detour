import { describe, expect, it } from 'vitest';
import { renderVisualizerHtml } from './visualizer';

describe('visualizer', () => {
  it('interpolates mustache-like keys', () => {
    const html = renderVisualizerHtml({ template: '<h1>{{title}}</h1><p>{{meta.count}}</p>', data: { title: 'Hi', meta: { count: 3 } } });
    expect(html).toContain('<h1>Hi</h1>');
    expect(html).toContain('<p>3</p>');
  });
});
