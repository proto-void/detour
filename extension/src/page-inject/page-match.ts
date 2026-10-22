/**
 * URL tests shared by the planner and the in-page runtimes. Dependency-free: it is bundled into
 * content scripts and serialized into user-script guards.
 */

export interface UrlTest {
  /** JS regex source (globs are pre-compiled, anchored). */
  source: string;
  flags: string;
  /** Group site scoping; omitted = every site. */
  domains?: string[];
}

export const hostOnDomains = (host: string, domains: string[]): boolean =>
  domains.some((d) => host === d || host.endsWith(`.${d}`));

/**
 * The page's site for scoping: the top frame's host where the browser exposes it (Chromium's
 * `location.ancestorOrigins`), else the frame's own host.
 */
export function siteHost(loc: { hostname: string; ancestorOrigins?: { length: number; [i: number]: string } }): string {
  const ancestors = loc.ancestorOrigins;
  if (ancestors && ancestors.length > 0) {
    try {
      return new URL(ancestors[ancestors.length - 1]!).hostname;
    } catch {
      /* opaque origin ("null") */
    }
  }
  return loc.hostname;
}

export function testUrl(test: UrlTest, url: string, host: string): boolean {
  if (test.domains && !hostOnDomains(host, test.domains)) return false;
  try {
    return new RegExp(test.source, test.flags).test(url);
  } catch {
    return false;
  }
}
