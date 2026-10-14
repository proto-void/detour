export type SafetyLevel = 'safe' | 'destructive' | 'needsConfirm';

export type SafetyVerdict = {
  level: SafetyLevel;
  reasons: string[];
  /** When true, production requires typing the object name. */
  requireTypedName: boolean;
  objectName?: string;
};

const DESTRUCTIVE =
  /\b(DROP|TRUNCATE|ALTER)\b/i;
const WRITE_WITHOUT_WHERE =
  /^\s*(DELETE|UPDATE)\b(?![\s\S]*\bWHERE\b)/im;

/** Classify CQL for production safety rails. */
export function classifyCql(statement: string): SafetyVerdict {
  const trimmed = statement.trim();
  if (!trimmed) return { level: 'safe', reasons: [], requireTypedName: false };

  const reasons: string[] = [];
  let level: SafetyLevel = 'safe';
  let requireTypedName = false;
  let objectName: string | undefined;

  if (DESTRUCTIVE.test(trimmed)) {
    level = 'destructive';
    reasons.push('Statement contains DROP, TRUNCATE, or ALTER.');
    requireTypedName = true;
    const m = trimmed.match(/\b(?:DROP|TRUNCATE|ALTER)\s+(?:TABLE|KEYSPACE|MATERIALIZED\s+VIEW|TYPE|INDEX)?\s*([a-zA-Z0-9_."]+)/i);
    if (m?.[1]) objectName = m[1].replace(/"/g, '');
  }

  if (WRITE_WITHOUT_WHERE.test(trimmed)) {
    level = level === 'destructive' ? 'destructive' : 'needsConfirm';
    reasons.push('DELETE or UPDATE without WHERE can affect every row.');
    requireTypedName = true;
  }

  // Cassandra partition wipe: DELETE FROM ks.table WHERE pk = … still needs confirm on production
  if (/^\s*DELETE\b/i.test(trimmed) && /\bWHERE\b/i.test(trimmed)) {
    if (level === 'safe') {
      level = 'needsConfirm';
      reasons.push('DELETE can remove a whole partition.');
    }
  }

  if (/^\s*TRUNCATE\b/i.test(trimmed)) {
    level = 'destructive';
    requireTypedName = true;
  }

  return { level, reasons, requireTypedName, objectName };
}

export function isReadOnlyBlocked(statement: string, readOnly: boolean): boolean {
  if (!readOnly) return false;
  const t = statement.trim();
  if (/^\s*(SELECT|DESCRIBE|DESC|LIST|USE|SHOW|EXPLAIN|PING|KEYS|GET|TYPE)\b/i.test(t)) return false;
  if (t.startsWith('{') && /"find"|"query"|"match_all"|"aggregate"/i.test(t) && !/"update"|"delete"|"insert"/i.test(t)) {
    return false;
  }
  if (/^\s*(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|BATCH|REPLACE|SET|HSET|LPUSH|SADD)\b/i.test(t)) {
    return true;
  }
  return !/^\s*SELECT\b/i.test(t);
}
