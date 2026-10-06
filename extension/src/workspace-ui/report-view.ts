import type { ApplyReport } from '../engine-core/apply';
import type { RefusalReason } from '../engine-core/compile';
import type { Rule, Workspace } from '../rule-model/schema';

export interface RuleRow {
  ruleId: string;
  groupName: string;
  summary: string;
}

export interface RefusedRow extends RuleRow {
  reason: RefusalReason;
  reasonLabel: string;
  message: string;
}

export interface ReportView {
  /** `pending` = background hasn't written a report yet. */
  state: 'pending' | 'disabled' | 'error' | 'empty' | 'active';
  applied: RuleRow[];
  refused: RefusedRow[];
  errors: string[];
  appliedAt?: string;
}

export const REASON_LABELS: Record<RefusalReason, string> = {
  'non-ascii-pattern': 'Non-ASCII pattern',
  'invalid-redirect': 'Invalid redirect target',
  'redirect-loop': 'Redirect loop',
  'too-many-captures': 'Too many wildcards',
  'unsupported-regex': 'Regex not supported',
  'regex-limit': 'Regex limit reached',
  'rule-limit': 'Rule limit reached',
  'browser-rejected': 'Rejected by browser',
  'user-scripts-unavailable': 'User scripts off',
  'inject-failed': 'Injection failed',
  'body-permission-denied': 'Permission needed',
  'bridge-not-connected': 'Bridge not connected',
  'bridge-down': 'Bridge not running',
};

export function summarizeRule(rule: Rule): string {
  const { pattern } = rule.match;
  switch (rule.action.type) {
    case 'redirect':
      return `${pattern} → ${rule.action.to}`;
    case 'block':
      return `Block ${pattern}`;
    case 'modifyHeaders': {
      const changes = rule.action.request.length + rule.action.response.length;
      return `Headers on ${pattern} (${changes} change${changes === 1 ? '' : 's'})`;
    }
    case 'injectJs':
    case 'injectCss': {
      const what = rule.action.type === 'injectJs' ? 'JS' : 'CSS';
      const from = rule.action.source.kind === 'url' ? ` from ${rule.action.source.url}` : '';
      return `Inject ${what}${from} on ${pattern}`;
    }
    case 'mock':
      return `Mock ${rule.action.method === 'ANY' ? '' : `${rule.action.method} `}${pattern} → ${rule.action.status}`;
    case 'overrideBody':
      return `Replace body of ${pattern}`;
    case 'serveLocal':
      return `Serve ${rule.action.path} for ${pattern}`;
  }
}

/** Joins the id-only apply report with the workspace for display. Split rules appear once; page rules count as applied. */
export function describeReport(report: ApplyReport | undefined, workspace: Workspace | undefined): ReportView {
  if (!report) return { state: 'pending', applied: [], refused: [], errors: [] };

  const index = new Map<string, { rule: Rule; groupName: string }>();
  for (const group of workspace?.groups ?? []) for (const rule of group.rules) index.set(rule.id, { rule, groupName: group.name });
  const row = (ruleId: string): RuleRow => {
    const hit = index.get(ruleId);
    return hit ? { ruleId, groupName: hit.groupName, summary: summarizeRule(hit.rule) } : { ruleId, groupName: '', summary: `Rule ${ruleId} (no longer in workspace)` };
  };

  const applied = [...new Set([...report.applied, ...(report.injected ?? []), ...(report.bodies ?? [])].map((a) => a.ruleId))].map(row);
  const refused = report.refused.map((r) => ({ ...row(r.ruleId), reason: r.reason, reasonLabel: REASON_LABELS[r.reason], message: r.message }));
  const state = report.errors.length > 0 ? 'error' : report.disabled ? 'disabled' : applied.length + refused.length === 0 ? 'empty' : 'active';
  return { state, applied, refused, errors: report.errors, appliedAt: report.appliedAt };
}
