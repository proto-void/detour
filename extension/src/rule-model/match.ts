import type { Match } from './schema';

/**
 * Glob syntax: `*` (or any run of `*`) matches any characters, including none and `/`.
 * Globs match the whole URL. Regex patterns are unanchored, like DNR `regexFilter`.
 */

const WILDCARD_RUN = /\*+/g;

export function countWildcards(text: string): number {
  return text.match(WILDCARD_RUN)?.length ?? 0;
}

const escapeRegex = (literal: string) => literal.replace(/[.+?^${}()|[\]\\]/g, '\\$&');

/**
 * Anchored regex source for a glob. The first `captures` wildcards become lazy capture groups;
 * the rest are lazy non-capturing. The output is valid in both JS and RE2.
 */
export function globToRegexSource(pattern: string, captures = 0): string {
  let index = 0;
  const body = pattern
    .split(WILDCARD_RUN)
    .map(escapeRegex)
    .reduce((acc, literal) => acc + (index++ < captures ? '(.*?)' : '.*?') + literal);
  return `^${body}$`;
}

export function compileMatcher(match: Match, caseSensitive = false): RegExp {
  const flags = caseSensitive ? '' : 'i';
  return match.kind === 'glob'
    ? new RegExp(globToRegexSource(match.pattern, countWildcards(match.pattern)), flags)
    : new RegExp(match.pattern, flags);
}

export function matchesUrl(match: Match, url: string, caseSensitive = false): boolean {
  return compileMatcher(match, caseSensitive).test(url);
}
