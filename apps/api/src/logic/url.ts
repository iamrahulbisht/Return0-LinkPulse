export type UrlIssueCode = 'URL_REQUIRED' | 'URL_INVALID' | 'URL_SCHEME' | 'URL_TOO_LONG' | 'URL_LOOP' | 'URL_BLOCKED';

export interface UrlIssue {
  field: string;
  code: UrlIssueCode;
  message: string;
}

export interface UrlCheckContext {
  /** Hosts that belong to LinkPulse itself (short domain, web app). A link there would loop. */
  ownHosts: string[];
  /** Domains on the admin blocklist. A host matches if it equals one or is a sub-domain of one. */
  blockedDomains: string[];
}

export const MAX_URL_LENGTH = 2048;

export function hostMatchesDomain(host: string, domain: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, '');
  const d = domain.toLowerCase().replace(/^\*?\./, '');
  return h === d || h.endsWith('.' + d);
}

export function findBlockedDomain(host: string, blockedDomains: string[]): string | null {
  return blockedDomains.find((d) => hostMatchesDomain(host, d)) ?? null;
}

export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Validates a destination URL. Returns every problem found, so the wizard can show each one.
 * The same function runs on create, so the API enforces what the UI shows.
 */
export function validateDestination(raw: string, ctx: UrlCheckContext, field = 'destination'): UrlIssue[] {
  const url = (raw ?? '').trim();
  if (!url) return [{ field, code: 'URL_REQUIRED', message: 'Add a destination URL.' }];
  if (url.length > MAX_URL_LENGTH) {
    return [{ field, code: 'URL_TOO_LONG', message: 'This URL is too long (more than 2,048 characters).' }];
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    if (/^\s*javascript:/i.test(url)) {
      return [{ field, code: 'URL_SCHEME', message: 'javascript: links are not allowed.' }];
    }
    return [{ field, code: 'URL_INVALID', message: 'Start with https:// and include a domain.' }];
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    const scheme = parsed.protocol.replace(':', '');
    return [{ field, code: 'URL_SCHEME', message: `${scheme}: links are not allowed. Use http:// or https://.` }];
  }
  const host = parsed.hostname.toLowerCase();
  if (!host.includes('.') || host.startsWith('.') || host.endsWith('.')) {
    return [{ field, code: 'URL_INVALID', message: 'Start with https:// and include a domain.' }];
  }
  if (parsed.username || parsed.password) {
    return [{ field, code: 'URL_INVALID', message: 'Links with a user name or password inside are not allowed.' }];
  }

  const issues: UrlIssue[] = [];
  if (ctx.ownHosts.some((own) => own && hostMatchesDomain(host, own))) {
    issues.push({ field, code: 'URL_LOOP', message: 'This points back to LinkPulse and would loop forever.' });
  }
  if (findBlockedDomain(host, ctx.blockedDomains)) {
    issues.push({ field, code: 'URL_BLOCKED', message: 'This domain is on the blocklist for spam.' });
  }
  return issues;
}
