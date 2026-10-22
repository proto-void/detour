import type { Rule } from '../rule-model/schema';

const DEFAULT_MAX_CODE = 800;

export interface RuleDetailPreview {
  /** Short lines describing the action (shown above any code block). */
  lines: string[];
  /** Optional mono body/code preview (already truncated). */
  code?: string;
  note?: string;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}

function formatHeaderOps(
  side: 'Request' | 'Response',
  ops: { op: string; name: string; value?: string }[],
): string[] {
  return ops.map((op) => {
    if (op.op === 'remove') return `${side}: remove ${op.name}`;
    return `${side}: ${op.op} ${op.name}=${op.value ?? ''}`;
  });
}

/** Read-only expand-strip preview for a rule's action (and optional note). */
export function ruleDetailPreview(rule: Rule, opts?: { maxCodeChars?: number }): RuleDetailPreview {
  const max = opts?.maxCodeChars ?? DEFAULT_MAX_CODE;
  const note = rule.note?.trim() ? rule.note : undefined;
  const action = rule.action;

  switch (action.type) {
    case 'block':
      return { lines: ['Blocks matching requests'], note };
    case 'redirect':
      return { lines: [`Redirect to: ${action.to || '…'}`], note };
    case 'serveLocal':
      return { lines: [`Local path: ${action.path || '…'}`], note };
    case 'overrideBody': {
      const delivery = action.delivery ?? 'redirect';
      return {
        lines: [`Body override (${delivery === 'inPlace' ? 'in-place' : 'redirect'})`],
        code: truncate(action.body, max),
        note,
      };
    }
    case 'mock': {
      const method = action.method === 'ANY' || !action.method ? 'ANY' : action.method;
      const status = action.status ?? 200;
      const body = action.body ?? '';
      return {
        lines: [`Mock ${method} → ${status}`],
        code: body ? truncate(body, max) : undefined,
        note,
      };
    }
    case 'injectJs':
    case 'injectCss': {
      const kind = action.type === 'injectJs' ? 'JS' : 'CSS';
      if (action.source.kind === 'url') {
        return { lines: [`Inject ${kind} from URL`, action.source.url || '…'], note };
      }
      return {
        lines: [`Inject ${kind} (inline)`],
        code: truncate(action.source.code, max),
        note,
      };
    }
    case 'modifyHeaders': {
      const lines = [
        ...formatHeaderOps('Request', action.request),
        ...formatHeaderOps('Response', action.response),
      ];
      return {
        lines: lines.length > 0 ? lines : ['No header operations'],
        note,
      };
    }
  }
}

/**
 * Final list index for HTML5 reorder: drop before/after an anchor, adjusting
 * for removal of the dragged item.
 */
export function dropInsertIndex(
  fromIndex: number,
  anchorIndex: number,
  edge: 'before' | 'after',
): number {
  let toIndex = edge === 'before' ? anchorIndex : anchorIndex + 1;
  if (fromIndex < toIndex) toIndex -= 1;
  return toIndex;
}
