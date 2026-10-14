import { describe, expect, it } from 'vitest';
import { resolveApplyDetourRules } from './resolve-apply-rules';

describe('resolveApplyDetourRules', () => {
  it('inherits global when per-request is inherit or missing', () => {
    expect(resolveApplyDetourRules(true, 'inherit')).toBe(true);
    expect(resolveApplyDetourRules(false, 'inherit')).toBe(false);
    expect(resolveApplyDetourRules(true, undefined)).toBe(true);
    expect(resolveApplyDetourRules(false, null)).toBe(false);
  });

  it('forces on even when global is off', () => {
    expect(resolveApplyDetourRules(false, 'on')).toBe(true);
  });

  it('forces off even when global is on', () => {
    expect(resolveApplyDetourRules(true, 'off')).toBe(false);
  });
});
