import { prisma } from './db';

/**
 * The blocklist is small and read on every redirect and every create, so we keep it in memory
 * and reload it at most every 30 seconds, or at once after an admin changes it.
 */
let cache: { domains: string[]; loadedAt: number } | null = null;
const MAX_AGE_MS = 30_000;

export async function getBlockedDomains(): Promise<string[]> {
  if (cache && Date.now() - cache.loadedAt < MAX_AGE_MS) return cache.domains;
  const rows = await prisma.blockedDomain.findMany({ select: { domain: true } });
  cache = { domains: rows.map((r) => r.domain), loadedAt: Date.now() };
  return cache.domains;
}

export function resetBlocklistCache(): void {
  cache = null;
}

export function normaliseDomain(raw: string): string {
  let d = raw.trim().toLowerCase();
  try {
    if (/^https?:\/\//.test(d)) d = new URL(d).hostname;
  } catch {
    // keep as typed; validation below rejects it
  }
  return d.replace(/^\*?\./, '').replace(/\/.*$/, '').replace(/\.$/, '');
}
