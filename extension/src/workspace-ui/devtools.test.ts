import { describe, expect, it } from 'vitest';
import type { Workspace } from '../rule-model/schema';
import { inspectPage } from './devtools';

const workspace: Workspace = {
  groups: [
    {
      id: 'g',
      name: 'Local',
      enabled: true,
      rules: [
        {
          id: 'r',
          enabled: true,
          match: { kind: 'glob', pattern: 'https://cdn.example.com/*' },
          action: { type: 'redirect', to: 'http://localhost:5173/*' },
          resourceTypes: ['main_frame'],
        },
      ],
    },
  ],
};

const on = { enabled: true, userScripts: true };

describe('DevTools page inspection', () => {
  it('uses the rule tester for a page load', () => {
    const view = inspectPage(workspace, 'https://cdn.example.com/app.js', on);
    expect(view.headline).toBe('This rule wins.');
    expect(view.lines[0]).toMatchObject({ groupName: 'Local', outcome: 'Redirects to http://localhost:5173/app.js.' });
  });

  it('says when nothing matches', () => {
    expect(inspectPage(workspace, 'https://other.example/x', on).headline).toBe('No rule matches.');
  });

  it('keeps the result and says when Detour is off', () => {
    const view = inspectPage(workspace, 'https://cdn.example.com/app.js', { enabled: false, userScripts: true });
    expect(view.headline).toBe('This rule wins.');
    expect(view.notes[0]).toMatch(/Detour is off/);
  });

  it('does not pretend to inspect browser pages', () => {
    expect(inspectPage(workspace, '', on).headline).toMatch(/Open a web page/);
    expect(inspectPage(workspace, 'chrome://extensions', on).headline).toMatch(/browser pages/);
    expect(inspectPage(workspace, 'about:blank', on).lines).toEqual([]);
  });
});
