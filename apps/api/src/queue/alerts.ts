import { prisma } from '../lib/db';
import { computeAlerts, type ComputedAlertType } from '../logic/alerts';
import { findBlockedDomain, hostOf } from '../logic/url';
import { getBlockedDomains } from '../lib/blocklist';

const COMPUTED: ComputedAlertType[] = ['expiring', 'near_limit', 'spike', 'bots'];

interface StatRow {
  link_id: string;
  last_hour: number;
  last_7d: number;
  bots_24h: number;
}

/**
 * Recomputes alerts for every active link (every 5 minutes, and on demand).
 * Alerts that no longer apply are removed; dismissed ones stay dismissed while they still apply.
 */
export async function runAlertsJob(now: Date = new Date()): Promise<number> {
  const links = await prisma.link.findMany({
    where: { status: 'active' },
    select: { id: true, status: true, expiresAt: true, clickLimit: true, clickCount: true, destination: true },
  });
  if (links.length === 0) return 0;

  const stats = await prisma.$queryRaw<StatRow[]>`
    SELECT link_id::text AS link_id,
      COUNT(*) FILTER (WHERE counted AND clicked_at > ${now}::timestamptz - interval '1 hour')::int AS last_hour,
      COUNT(*) FILTER (WHERE counted AND clicked_at <= ${now}::timestamptz - interval '1 hour'
                       AND clicked_at > ${now}::timestamptz - interval '7 days 1 hour')::int AS last_7d,
      COUNT(*) FILTER (WHERE click_type <> 'human' AND clicked_at > ${now}::timestamptz - interval '24 hours')::int AS bots_24h
    FROM click_events
    WHERE clicked_at > ${now}::timestamptz - interval '7 days 1 hour'
    GROUP BY link_id`;
  const byLink = new Map(stats.map((s) => [s.link_id, s]));
  const blocked = await getBlockedDomains();

  let written = 0;
  for (const l of links) {
    const s = byLink.get(l.id);
    const found = computeAlerts(
      {
        status: l.status,
        expiresAt: l.expiresAt,
        clickLimit: l.clickLimit,
        clickCount: l.clickCount,
        lastHourHuman: s?.last_hour ?? 0,
        last7dHuman: s?.last_7d ?? 0,
        last24hBots: s?.bots_24h ?? 0,
      },
      now,
    );
    const types = new Set(found.map((f) => f.type));
    for (const f of found) {
      await prisma.linkAlert.upsert({
        where: { linkId_type: { linkId: l.id, type: f.type } },
        create: { linkId: l.id, type: f.type, message: f.message },
        update: { message: f.message },
      });
      written++;
    }
    const stale = COMPUTED.filter((t) => !types.has(t));
    if (stale.length) await prisma.linkAlert.deleteMany({ where: { linkId: l.id, type: { in: stale } } });

    // Blocklist matches are flagged for the admin.
    const host = hostOf(l.destination);
    const match = host ? findBlockedDomain(host, blocked) : null;
    if (match) {
      await prisma.linkAlert.upsert({
        where: { linkId_type: { linkId: l.id, type: 'blocked' } },
        create: { linkId: l.id, type: 'blocked', message: `Destination now matches a blocked domain (${match}).` },
        update: {},
      });
    } else {
      await prisma.linkAlert.deleteMany({ where: { linkId: l.id, type: 'blocked', dismissedAt: null } });
    }
  }
  return written;
}
