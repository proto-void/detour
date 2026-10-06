import { describe, expect, it, vi } from 'vitest';
import { runBridge, type BridgeEnv, type BridgeMessage } from './bridge';
import { CONFIG_EVENT, READY_EVENT } from './mock-runtime';
import type { PageConfig } from './plan';

const page = (source: string) => ({ source, flags: 'i' });
const config: PageConfig = {
  mocks: [{ groupId: 'g', ruleId: 'm', request: page('.*'), method: 'ANY', status: 200, headers: [], body: '', delayMs: 0 }],
  styles: [
    { groupId: 'g', ruleId: 'top', page: page('^https://app\\.test/'), runAt: 'document_start', allFrames: false, source: { kind: 'inline', code: '' } },
    { groupId: 'g', ruleId: 'frames', page: page('^https://app\\.test/'), runAt: 'document_start', allFrames: true, source: { kind: 'inline', code: '' } },
    { groupId: 'g', ruleId: 'other', page: page('^https://other\\.test/'), runAt: 'document_start', allFrames: true, source: { kind: 'inline', code: '' } },
    { groupId: 'g', ruleId: 'late', page: page('.*'), runAt: 'document_end', allFrames: true, source: { kind: 'inline', code: '' } },
  ],
  scripts: [],
};

function setup({ isTop = true, readyState = 'loading' }: { isTop?: boolean; readyState?: string } = {}) {
  const doc = Object.assign(new EventTarget(), { readyState, defaultView: new EventTarget() }) as unknown as Document;
  const sent: BridgeMessage[] = [];
  const pushed: unknown[] = [];
  doc.addEventListener(CONFIG_EVENT, (e) => pushed.push(JSON.parse((e as CustomEvent).detail)));
  let onChange!: (c: PageConfig | undefined) => void;
  const env: BridgeEnv = {
    document: doc,
    location: { href: 'https://app.test/page', hostname: 'app.test' },
    isTop,
    loadConfig: async () => config,
    onConfigChange: (l) => (onChange = l),
    send: vi.fn(async (m: BridgeMessage) => void sent.push(m)),
  };
  runBridge(env);
  return { doc, sent, pushed, change: (c: PageConfig | undefined) => onChange(c) };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('runBridge', () => {
  it('forwards mocks to the MAIN world on load, on ready and on change', async () => {
    const { doc, pushed, change } = setup();
    await flush();
    expect(pushed).toEqual([config.mocks]);
    doc.dispatchEvent(new CustomEvent(READY_EVENT));
    expect(pushed).toHaveLength(2);
    change(undefined);
    expect(pushed.at(-1)).toEqual([]);
  });

  it('asks for CSS of matching rules, top-only rules in the top frame only, at runAt', async () => {
    const top = setup();
    await flush();
    expect(top.sent.map((m) => m.ruleId)).toEqual(['top', 'frames']);
    top.doc.dispatchEvent(new Event('DOMContentLoaded'));
    expect(top.sent.map((m) => m.ruleId)).toEqual(['top', 'frames', 'late']);

    const frame = setup({ isTop: false, readyState: 'interactive' });
    await flush();
    expect(frame.sent.map((m) => m.ruleId)).toEqual(['frames', 'late']);
  });
});
