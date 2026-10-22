import { browser } from 'wxt/browser';

interface DevtoolsPanels {
  panels: { create(title: string, iconPath: string, pagePath: string): Promise<unknown> | void };
}

const devtools = (browser as unknown as { devtools?: DevtoolsPanels }).devtools;
if (devtools) void devtools.panels.create('Detour', '', 'devtools-panel.html');
