export const RESERVED_ALIASES = new Set([
  'admin',
  'api',
  'login',
  'logout',
  'signup',
  'dashboard',
  'settings',
  'links',
  'b',
  'qr',
  'import',
  'static',
  'health',
  'assets',
  'stream',
  'campaigns',
]);

export type AliasIssueCode = 'ALIAS_FORMAT' | 'ALIAS_RESERVED' | 'ALIAS_TAKEN';

export interface AliasIssue {
  field: 'alias';
  code: AliasIssueCode;
  message: string;
}

export function normaliseAlias(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Checks format and reserved words. Whether it is taken needs the database (see routes/links). */
export function checkAliasFormat(alias: string): AliasIssue | null {
  if (!/^[a-z0-9-]{3,30}$/.test(alias)) {
    return { field: 'alias', code: 'ALIAS_FORMAT', message: 'Use 3 to 30 letters, numbers or dashes.' };
  }
  if (alias.startsWith('-') || alias.endsWith('-')) {
    return { field: 'alias', code: 'ALIAS_FORMAT', message: 'The alias cannot start or end with a dash.' };
  }
  if (RESERVED_ALIASES.has(alias)) {
    return { field: 'alias', code: 'ALIAS_RESERVED', message: `"${alias}" is kept for the app itself.` };
  }
  return null;
}

export function takenIssue(alias: string, shortHost: string): AliasIssue {
  return { field: 'alias', code: 'ALIAS_TAKEN', message: `Someone already uses ${shortHost}/${alias}.` };
}

/** Candidate aliases to offer when one is taken or reserved. The caller keeps only the free ones. */
export function aliasCandidates(alias: string, year = 2026): string[] {
  const base = alias.replace(/-+$/, '').slice(0, 24) || 'link';
  const yy = String(year).slice(2);
  const list = [`${base}${yy}`, `${base}-${year}`, `${base}-reg`, `${base}-${yy}`, `${base}-link`];
  return [...new Set(list)].filter((a) => checkAliasFormat(a) === null);
}
