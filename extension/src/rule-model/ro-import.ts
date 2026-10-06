import * as v from 'valibot';
import { formatIssues, parseRule, type Group, type HeaderOp, type Rule, type Workspace } from './schema';

/**
 * Resource Override export formats (kylepaulsen/ResourceOverride):
 * - v1 (master, MV2): `{ v: 1, data: [{ id: "d1", matchUrl, on, rules }] }`
 * - v2 (mv3 branch):  `{ v: 2, ruleGroups: [...] }` as originally exported, `{ v: 2, data: [...] }` after
 *   upstream PR #73; groups carry `name`, older exporters wrote `matchUrl`.
 * Group name/matchUrl is the *tab* URL pattern that gated its rules.
 */

const RoRuleSchema = v.looseObject({
  type: v.string(),
  on: v.optional(v.boolean(), true),
  match: v.optional(v.string(), ''),
  replace: v.optional(v.string(), ''),
  requestRules: v.optional(v.string(), ''),
  responseRules: v.optional(v.string(), ''),
});

const RoGroupSchema = v.looseObject({
  name: v.optional(v.string()),
  matchUrl: v.optional(v.string()),
  on: v.optional(v.boolean(), true),
  rules: v.array(RoRuleSchema),
});

const RoExportSchema = v.pipe(
  v.looseObject({
    v: v.picklist([1, 2], 'Unsupported Resource Override export version (expected 1 or 2)'),
    data: v.optional(v.array(RoGroupSchema)),
    ruleGroups: v.optional(v.array(RoGroupSchema)),
  }),
  v.check((x) => x.data !== undefined || x.ruleGroups !== undefined, 'Expected a "data" or "ruleGroups" array'),
);

type RoRule = v.InferOutput<typeof RoRuleSchema>;

export type ImportNoticeCode =
  | 'file-override-unsupported'
  | 'file-inject-unsupported'
  | 'unknown-rule-type'
  | 'incomplete-rule'
  | 'empty-header-rule'
  | 'invalid-after-mapping'
  | 'page-scope-dropped'
  | 'wildcard-groups-simplified';

/** `group` / `rule` are 0-based positions in the source file. */
export interface ImportNotice {
  code: ImportNoticeCode;
  message: string;
  group: number;
  rule?: number;
}

export interface RoImport {
  source: 'resource-override-v1' | 'resource-override-v2';
  workspace: Workspace;
  skipped: ImportNotice[];
  warnings: ImportNotice[];
}

/** Parses RO's `set name: value;remove name` header strings (URI-encoded parts, names lowercased). */
export function parseRoHeaderRules(text: string): HeaderOp[] {
  const ops: HeaderOp[] = [];
  for (const entry of text.split(';')) {
    const parts = entry.split(': ');
    const head = parts[0] ?? '';
    if (head.startsWith('set') && parts.length === 2) {
      ops.push({ op: 'set', name: decodeURIComponent(head.substring(4)).trim().toLowerCase(), value: decodeURIComponent(parts[1]!) });
    } else if (head.startsWith('remove')) {
      ops.push({ op: 'remove', name: decodeURIComponent(head.substring(7)).trim().toLowerCase() });
    }
  }
  return ops;
}

const ANY_PAGE = new Set(['', '*']);
const hasStarGroups = (text: string) => /\*\*/.test(text);

export function importResourceOverride(input: unknown, newId: () => string): { ok: true; value: RoImport } | { ok: false; errors: string[] } {
  const parsed = v.safeParse(RoExportSchema, input);
  if (!parsed.success) return { ok: false, errors: formatIssues(parsed.issues) };

  const version = parsed.output.v;
  const groups = parsed.output.data ?? parsed.output.ruleGroups ?? [];
  const skipped: ImportNotice[] = [];
  const warnings: ImportNotice[] = [];

  const mapRule = (ro: RoRule, group: number, rule: number): Omit<Rule, 'id' | 'enabled'> | undefined => {
    const skip = (code: ImportNoticeCode, message: string) => void skipped.push({ code, message, group, rule });
    const match = ro.match.trim();
    switch (ro.type) {
      case 'normalOverride': {
        if (!match || !ro.replace) return skip('incomplete-rule', 'URL override has an empty match or replace field');
        // The mv3 branch treats /…/ as a raw regex with the replace string used as regexSubstitution.
        const isRegex = version === 2 && match.length > 2 && match.startsWith('/') && match.endsWith('/');
        if (!isRegex && (hasStarGroups(match) || hasStarGroups(ro.replace))) {
          warnings.push({
            code: 'wildcard-groups-simplified',
            message: `"${match}": "**" runs are treated as a single "*"; Resource Override paired star groups by length`,
            group,
            rule,
          });
        }
        return {
          match: isRegex ? { kind: 'regex', pattern: match.slice(1, -1) } : { kind: 'glob', pattern: match },
          action: { type: 'redirect', to: ro.replace },
        };
      }
      case 'headerRule': {
        if (!match) return skip('incomplete-rule', 'Header rule has an empty match field');
        let request: HeaderOp[], response: HeaderOp[];
        try {
          request = parseRoHeaderRules(ro.requestRules);
          response = parseRoHeaderRules(ro.responseRules);
        } catch {
          return skip('invalid-after-mapping', `"${match}": header rules are not valid URI-encoded text`);
        }
        if (request.length + response.length === 0) return skip('empty-header-rule', `"${match}": no header operations`);
        return { match: { kind: 'glob', pattern: match }, action: { type: 'modifyHeaders', request, response } };
      }
      case 'fileOverride':
        return skip('file-override-unsupported', `"${match}": file overrides need a body engine (local-bridge / engine-deep), not available yet`);
      case 'fileInject':
        return skip('file-inject-unsupported', 'File injects belong to page-inject, not available yet');
      default:
        return skip('unknown-rule-type', `Unknown rule type "${ro.type}"`);
    }
  };

  const workspace: Workspace = {
    groups: groups.map((roGroup, g): Group => {
      const pagePattern = (roGroup.name ?? roGroup.matchUrl ?? '').trim();
      if (!ANY_PAGE.has(pagePattern)) {
        warnings.push({
          code: 'page-scope-dropped',
          message: `Group "${pagePattern}" only ran on pages matching that URL in Resource Override; Detour applies its rules on every page`,
          group: g,
        });
      }
      const rules: Rule[] = [];
      roGroup.rules.forEach((roRule, r) => {
        const mapped = mapRule(roRule, g, r);
        if (!mapped) return;
        const checked = parseRule({ id: newId(), enabled: roRule.on, ...mapped });
        if (checked.ok) rules.push(checked.value);
        else skipped.push({ code: 'invalid-after-mapping', message: checked.errors.join('; '), group: g, rule: r });
      });
      return { id: newId(), name: pagePattern || `Imported group ${g + 1}`, enabled: roGroup.on, rules };
    }),
  };

  return { ok: true, value: { source: version === 1 ? 'resource-override-v1' : 'resource-override-v2', workspace, skipped, warnings } };
}
