import { Router, type Request } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/db';
import { h, parse } from '../middleware/errors';
import { periodMs, type Period } from '../logic/time';
import { STATUS_SQL } from '../logic/rules';
import { loadOwnedLink } from './links';
import { runAlertsJobThrottled } from '../queue/alertsThrottle';

export const analyticsRouter = Router();

const querySchema = z.object({
  period: z.enum(['24h', '7d', '30d']).default('7d'),
  campaign: z.string().uuid().optional().or(z.literal('').transform(() => undefined)),
  linkId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(5),
});

// The same CASE as logic/source.ts channelOf().
const CHANNEL_SQL = Prisma.sql`CASE
  WHEN e.source = 'qr' THEN 'QR scan'
  WHEN e.source = 'bio' THEN 'Bio page'
  WHEN e.referrer IS NULL OR e.referrer = '' THEN 'Direct link'
  WHEN lower(e.referrer) LIKE '%whatsapp%' THEN 'WhatsApp'
  ELSE 'Other' END`;

interface Scope {
  period: Period;
  from: Date;
  prevFrom: Date;
  to: Date;
  where: Prisma.Sql; // a filter on links aliased "l"
}

/** Every analytics query is scoped to the active workspace (or one link in a workspace you belong to). */
async function scope(req: Request): Promise<Scope & { limit: number }> {
  const q = parse(querySchema, req.query);
  const to = new Date();
  const ms = periodMs(q.period);
  let where: Prisma.Sql;
  if (q.linkId) {
    const link = await loadOwnedLink(req, q.linkId); // 403 if not yours
    where = Prisma.sql`l.id = ${link.id}::uuid`;
  } else {
    where = Prisma.sql`l.workspace_id = ${req.user!.workspaceId}::uuid`;
    if (q.campaign) where = Prisma.sql`${where} AND l.campaign_id = ${q.campaign}::uuid`;
  }
  return { period: q.period, to, from: new Date(to.getTime() - ms), prevFrom: new Date(to.getTime() - 2 * ms), where, limit: q.limit };
}

const pct = (n: number, total: number) => (total ? Math.round((n / total) * 1000) / 10 : 0);

analyticsRouter.get(
  '/overview',
  h(async (req, res) => {
    const s = await scope(req);
    const [k] = await prisma.$queryRaw<{ human: number; prev: number; unique_v: number; bots: number; last_at: Date | null }[]>`
      SELECT
        COUNT(*) FILTER (WHERE e.counted AND e.clicked_at > ${s.from})::int AS human,
        COUNT(*) FILTER (WHERE e.counted AND e.clicked_at <= ${s.from} AND e.clicked_at > ${s.prevFrom})::int AS prev,
        COUNT(DISTINCT e.visitor_hash) FILTER (WHERE e.counted AND e.clicked_at > ${s.from})::int AS unique_v,
        COUNT(*) FILTER (WHERE e.click_type <> 'human' AND e.clicked_at > ${s.from})::int AS bots,
        MAX(e.clicked_at) AS last_at
      FROM click_events e JOIN links l ON l.id = e.link_id
      WHERE ${s.where} AND e.clicked_at > ${s.prevFrom}`;
    const statusRows = await prisma.$queryRaw<{ st: string; n: number }[]>`
      SELECT ${Prisma.raw(STATUS_SQL)} AS st, COUNT(*)::int AS n FROM links l WHERE ${s.where} GROUP BY 1`;
    const links = { total: 0, active: 0, expired: 0, limit_reached: 0, disabled: 0 };
    for (const r of statusRows) {
      links[r.st as keyof typeof links] = r.n;
      links.total += r.n;
    }
    const changePct = k.prev ? Math.round(((k.human - k.prev) / k.prev) * 100) : null;
    res.json({
      period: s.period,
      humanClicks: k.human,
      previousHumanClicks: k.prev,
      changePct,
      uniqueVisitors: k.unique_v,
      botsFiltered: k.bots,
      links,
      lastClickAt: k.last_at?.toISOString() ?? null,
      generatedAt: s.to.toISOString(),
    });
  }),
);

/** Buckets in IST: one per hour for 24h, one per day otherwise. Humans and bots apart. */
analyticsRouter.get(
  '/timeseries',
  h(async (req, res) => {
    const s = await scope(req);
    const hourly = s.period === '24h';
    const unit = hourly ? 'hour' : 'day';
    const steps = hourly ? 23 : s.period === '7d' ? 6 : 29;
    const rows = await prisma.$queryRaw<{ bucket: Date; human: number; bots: number }[]>`
      WITH buckets AS (
        SELECT generate_series(
          date_trunc(${unit}, now() AT TIME ZONE 'Asia/Kolkata') - (${steps}::int * ${'1 ' + unit}::interval),
          date_trunc(${unit}, now() AT TIME ZONE 'Asia/Kolkata'),
          ${'1 ' + unit}::interval) AS bucket
      ),
      clicks AS (
        SELECT date_trunc(${unit}, e.clicked_at AT TIME ZONE 'Asia/Kolkata') AS bucket,
               COUNT(*) FILTER (WHERE e.counted)::int AS human,
               COUNT(*) FILTER (WHERE e.click_type <> 'human')::int AS bots
        FROM click_events e JOIN links l ON l.id = e.link_id
        WHERE ${s.where} AND e.clicked_at > now() - (${steps + 1}::int * ${'1 ' + unit}::interval)
        GROUP BY 1
      )
      SELECT b.bucket, COALESCE(c.human, 0)::int AS human, COALESCE(c.bots, 0)::int AS bots
      FROM buckets b LEFT JOIN clicks c ON c.bucket = b.bucket ORDER BY b.bucket`;
    // bucket is an IST wall-clock time without zone; send it as "YYYY-MM-DDTHH:mm" (IST).
    res.json({
      period: s.period,
      unit,
      timezone: 'Asia/Kolkata',
      points: rows.map((r) => ({ bucket: r.bucket.toISOString().slice(0, 16), human: r.human, bots: r.bots })),
    });
  }),
);

analyticsRouter.get(
  '/top-links',
  h(async (req, res) => {
    const s = await scope(req);
    const rows = await prisma.$queryRaw<
      { id: string; code: string; campaign: string | null; clicks: number; status: string; click_limit: number | null; click_count: number }[]
    >`
      SELECT l.id::text, l.code, c.name AS campaign,
             COUNT(e.id) FILTER (WHERE e.counted AND e.clicked_at > ${s.from})::int AS clicks,
             ${Prisma.raw(STATUS_SQL)} AS status, l.click_limit, l.click_count
      FROM links l
      LEFT JOIN campaigns c ON c.id = l.campaign_id
      LEFT JOIN click_events e ON e.link_id = l.id AND e.clicked_at > ${s.from}
      WHERE ${s.where}
      GROUP BY l.id, c.name
      ORDER BY clicks DESC, l.click_count DESC
      LIMIT ${s.limit}`;
    res.json({
      items: rows.map((r) => ({
        id: r.id, code: r.code, campaign: r.campaign, humanClicks: r.clicks, status: r.status,
        clickLimit: r.click_limit, clickCount: r.click_count,
      })),
    });
  }),
);

analyticsRouter.get(
  '/sources',
  h(async (req, res) => {
    const s = await scope(req);
    const rows = await prisma.$queryRaw<{ name: string; n: number }[]>`
      SELECT ${CHANNEL_SQL} AS name, COUNT(*)::int AS n
      FROM click_events e JOIN links l ON l.id = e.link_id
      WHERE ${s.where} AND e.counted AND e.clicked_at > ${s.from}
      GROUP BY 1`;
    const total = rows.reduce((a, r) => a + r.n, 0);
    const order = ['Direct link', 'QR scan', 'WhatsApp', 'Bio page', 'Other'];
    res.json({
      total,
      items: order.map((name) => {
        const n = rows.find((r) => r.name === name)?.n ?? 0;
        return { name, count: n, pct: pct(n, total) };
      }),
    });
  }),
);

analyticsRouter.get(
  '/devices',
  h(async (req, res) => {
    const s = await scope(req);
    const rows = await prisma.$queryRaw<{ device: string; n: number }[]>`
      SELECT e.device, COUNT(*)::int AS n
      FROM click_events e JOIN links l ON l.id = e.link_id
      WHERE ${s.where} AND e.counted AND e.clicked_at > ${s.from}
      GROUP BY 1 ORDER BY 2 DESC`;
    const total = rows.reduce((a, r) => a + r.n, 0);
    const label: Record<string, string> = { android: 'Android', ios: 'iPhone', desktop: 'Desktop', tablet: 'Tablet' };
    res.json({ total, items: rows.map((r) => ({ device: r.device, name: label[r.device] ?? r.device, count: r.n, pct: pct(r.n, total) })) });
  }),
);

analyticsRouter.get(
  '/cities',
  h(async (req, res) => {
    const s = await scope(req);
    const rows = await prisma.$queryRaw<{ city: string; n: number }[]>`
      SELECT e.city, COUNT(*)::int AS n
      FROM click_events e JOIN links l ON l.id = e.link_id
      WHERE ${s.where} AND e.counted AND e.clicked_at > ${s.from} AND e.city IS NOT NULL
      GROUP BY 1 ORDER BY 2 DESC LIMIT ${s.limit}`;
    const [t] = await prisma.$queryRaw<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM click_events e JOIN links l ON l.id = e.link_id
      WHERE ${s.where} AND e.counted AND e.clicked_at > ${s.from}`;
    res.json({ total: t.n, items: rows.map((r) => ({ city: r.city, count: r.n, pct: pct(r.n, t.n) })) });
  }),
);

analyticsRouter.get(
  '/alerts',
  h(async (req, res) => {
    await runAlertsJobThrottled();
    const rows = await prisma.linkAlert.findMany({
      where: { link: { workspaceId: req.user!.workspaceId }, type: { in: ['expiring', 'near_limit', 'spike', 'bots', 'blocked'] }, dismissedAt: null },
      include: { link: { select: { id: true, code: true, clickLimit: true, clickCount: true, expiresAt: true } } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    const rank: Record<string, number> = { spike: 0, blocked: 1, near_limit: 2, expiring: 3, bots: 4 };
    rows.sort((a, b) => rank[a.type] - rank[b.type]);
    res.json({
      newCount: rows.filter((r) => !r.seenAt).length,
      items: rows.map((r) => ({
        id: r.id,
        type: r.type,
        message: r.message,
        createdAt: r.createdAt.toISOString(),
        seen: !!r.seenAt,
        link: { ...r.link, expiresAt: r.link.expiresAt?.toISOString() ?? null },
      })),
    });
  }),
);

analyticsRouter.post(
  '/alerts/seen',
  h(async (req, res) => {
    const r = await prisma.linkAlert.updateMany({ where: { link: { workspaceId: req.user!.workspaceId }, seenAt: null }, data: { seenAt: new Date() } });
    res.json({ updated: r.count });
  }),
);

/** CSV of the click rows behind the dashboard (no IPs: there are none to export). */
analyticsRouter.get(
  '/export.csv',
  h(async (req, res) => {
    const s = await scope(req);
    const rows = await prisma.$queryRaw<
      { clicked_at: Date; code: string; source: string; channel: string; device: string; os: string | null; browser: string | null; city: string | null; country: string | null; click_type: string; counted: boolean }[]
    >`
      SELECT e.clicked_at, l.code, e.source::text, ${CHANNEL_SQL} AS channel, e.device, e.os, e.browser, e.city, e.country,
             e.click_type::text, e.counted
      FROM click_events e JOIN links l ON l.id = e.link_id
      WHERE ${s.where} AND e.clicked_at > ${s.from}
      ORDER BY e.clicked_at DESC LIMIT 50000`;
    const esc = (v: unknown) => {
      const t = v == null ? '' : String(v);
      // Quote, and stop spreadsheet formula injection.
      return `"${(/^[=+\-@]/.test(t) ? "'" + t : t).replace(/"/g, '""')}"`;
    };
    const ist = (d: Date) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'medium' }).format(d);
    const lines = ['time_ist,link,source,channel,device,os,browser,city,country,type,counted'];
    for (const r of rows) {
      lines.push([ist(r.clicked_at), r.code, r.source, r.channel, r.device, r.os, r.browser, r.city, r.country, r.click_type, r.counted].map(esc).join(','));
    }
    res.attachment(`linkpulse-clicks-${s.period}.csv`).type('text/csv').send(lines.join('\n'));
  }),
);
