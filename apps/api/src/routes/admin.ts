import { Router } from 'express';
import { z } from 'zod';
import { prisma, isUniqueViolation } from '../lib/db';
import { ApiError, notFound } from '../lib/errors';
import { h, parse } from '../middleware/errors';
import { writeAudit } from '../lib/audit';
import { describeAudit } from '../lib/auditText';
import { invalidateLink } from '../lib/linkCache';
import { getBlockedDomains, normaliseDomain, resetBlocklistCache } from '../lib/blocklist';
import { findBlockedDomain, hostMatchesDomain, hostOf } from '../logic/url';
import { computeStatus } from '../logic/rules';
import { shortUrl } from '../lib/serialize';
import { config } from '../lib/config';
import { adminUsersRouter } from './adminUsers';

// Every route here runs after requireUser + requireAdmin (see app.ts). The UI hides the page
// for non-admins, but this server check is what actually protects it.
export const adminRouter = Router();

adminRouter.use('/users', adminUsersRouter);

const FLAG_TYPES = ['spike', 'report', 'blocked', 'bots'] as const;
const FLAG_LABEL: Record<string, string> = { spike: 'Traffic spike', report: 'Reported', blocked: 'Blocklist match', bots: 'Bot surge' };
const uuid = z.string().uuid();

adminRouter.get(
  '/overview',
  h(async (_req, res) => {
    const since = new Date(Date.now() - 86400_000);
    const [links, workspaces, blocked, needsReview, [today]] = await Promise.all([
      prisma.link.count(),
      prisma.workspace.count(),
      prisma.blockedDomain.count(),
      // One flagged card per link, so count links, not alert rows.
      prisma.linkAlert
        .findMany({ where: { type: { in: [...FLAG_TYPES] }, dismissedAt: null, link: { status: 'active' } }, distinct: ['linkId'], select: { linkId: true } })
        .then((rows) => rows.length),
      prisma.$queryRaw<{ human: number; bots: number }[]>`
        SELECT COUNT(*) FILTER (WHERE counted)::int AS human, COUNT(*) FILTER (WHERE click_type <> 'human')::int AS bots
        FROM click_events WHERE clicked_at > ${since}`,
    ]);
    res.json({ links, workspaces, humanClicks24h: today.human, botHits24h: today.bots, needsReview, blockedDomains: blocked });
  }),
);

adminRouter.get(
  '/flagged',
  h(async (_req, res) => {
    const rows = await prisma.linkAlert.findMany({
      where: { type: { in: [...FLAG_TYPES] }, dismissedAt: null },
      include: { link: { include: { owner: { select: { name: true } }, workspace: { select: { name: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    // One card per link: keep the most serious reason.
    const rank: Record<string, number> = { report: 0, spike: 1, blocked: 2, bots: 3 };
    const byLink = new Map<string, (typeof rows)[number]>();
    for (const r of rows) {
      const cur = byLink.get(r.linkId);
      if (!cur || rank[r.type] < rank[cur.type]) byLink.set(r.linkId, r);
    }
    res.json({
      items: [...byLink.values()].map((r) => ({
        id: r.id,
        type: r.type,
        label: FLAG_LABEL[r.type],
        reason: r.message,
        createdAt: r.createdAt.toISOString(),
        link: {
          id: r.link.id,
          code: r.link.code,
          shortUrl: shortUrl(r.link.code),
          destination: r.link.destination,
          status: computeStatus(r.link),
          disabledReason: r.link.disabledReason,
          owner: r.link.workspace?.name ?? r.link.owner.name,
        },
      })),
    });
  }),
);

const reasonSchema = z.object({ reason: z.string().trim().min(1, 'Pick a reason.').max(200) });
// Restore's reason is typed, not picked: same rule as the other free-text admin reasons (5–300, see adminUsers.ts).
const restoreSchema = z.object({
  reason: z.string().trim().min(5, 'Write a reason of at least 5 characters.').max(300, 'Keep the reason under 300 characters.'),
});

async function loadLink(id: string) {
  if (!uuid.safeParse(id).success) throw notFound('That link');
  const link = await prisma.link.findUnique({ where: { id } });
  if (!link) throw notFound('That link');
  return link;
}

/** Disable: status → disabled, cache deleted, audit row. The next visit sees "Link turned off" at once. */
adminRouter.post(
  '/links/:id/disable',
  h(async (req, res) => {
    const { reason } = parse(reasonSchema, req.body);
    const link = await loadLink(req.params.id);
    if (link.status === 'disabled') throw new ApiError(409, 'ALREADY_DISABLED', 'This link is already disabled.');
    await prisma.$transaction(async (tx) => {
      await tx.link.update({ where: { id: link.id }, data: { status: 'disabled', disabledReason: reason } });
      await writeAudit({ actorId: req.user!.id, linkId: link.id, action: 'disabled', target: link.code, oldValue: { status: 'active' }, newValue: { status: 'disabled' }, reason }, tx);
      await writeAudit({ actorId: null, linkId: link.id, action: 'cache_cleared', target: link.code }, tx);
    });
    await invalidateLink(link.code);
    res.json({ ok: true, status: 'disabled' });
  }),
);

/** Restore: status → active. Needs a reason like disable; the audit row names the owner so it reaches their notices. */
adminRouter.post(
  '/links/:id/restore',
  h(async (req, res) => {
    const { reason } = parse(restoreSchema, req.body);
    const link = await loadLink(req.params.id);
    if (link.status !== 'disabled') throw new ApiError(409, 'NOT_DISABLED', 'This link is not disabled.');
    await prisma.$transaction(async (tx) => {
      await tx.link.update({ where: { id: link.id }, data: { status: 'active', disabledReason: null } });
      await writeAudit(
        {
          actorId: req.user!.id,
          subjectUserId: link.ownerId,
          linkId: link.id,
          action: 'restored',
          target: link.code,
          oldValue: { status: 'disabled', reason: link.disabledReason },
          newValue: { status: 'active' },
          reason,
        },
        tx,
      );
      await writeAudit({ actorId: null, linkId: link.id, action: 'cache_cleared', target: link.code }, tx);
    });
    await invalidateLink(link.code);
    res.json({ ok: true, status: computeStatus({ ...link, status: 'active' }) });
  }),
);

adminRouter.post(
  '/flagged/:id/dismiss',
  h(async (req, res) => {
    if (!uuid.safeParse(req.params.id).success) throw notFound('That flag');
    const flag = await prisma.linkAlert.findUnique({ where: { id: req.params.id }, include: { link: { select: { code: true } } } });
    if (!flag) throw notFound('That flag');
    // Dismiss every open flag on that link, since the card stands for all of them.
    await prisma.linkAlert.updateMany({ where: { linkId: flag.linkId, type: { in: [...FLAG_TYPES] }, dismissedAt: null }, data: { dismissedAt: new Date() } });
    await writeAudit({ actorId: req.user!.id, linkId: flag.linkId, action: 'flag_dismissed', target: flag.link.code, reason: FLAG_LABEL[flag.type] });
    res.json({ ok: true });
  }),
);

adminRouter.get(
  '/blocklist',
  h(async (_req, res) => {
    const rows = await prisma.blockedDomain.findMany({ orderBy: { createdAt: 'desc' } });
    const links = await prisma.link.findMany({ select: { destination: true } });
    const hosts = links.map((l) => hostOf(l.destination)).filter((x): x is string => !!x);
    res.json({
      items: rows.map((d) => ({
        id: d.id,
        domain: d.domain,
        reason: d.reason,
        createdAt: d.createdAt.toISOString(),
        linksHit: hosts.filter((h2) => hostMatchesDomain(h2, d.domain)).length,
      })),
    });
  }),
);

/** Adding a domain blocks new links at once and flags existing links that use it. */
adminRouter.post(
  '/blocklist',
  h(async (req, res) => {
    const body = parse(z.object({ domain: z.string().min(3).max(253), reason: z.string().trim().min(1, 'Add a reason.').max(120).default('Spam or scam') }), req.body);
    const domain = normaliseDomain(body.domain);
    if (!/^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) {
      throw new ApiError(400, 'BAD_DOMAIN', 'Enter a domain like example.com.', [{ field: 'domain', code: 'BAD_DOMAIN', message: 'Enter a domain like example.com.' }]);
    }
    if ([new URL(config.SHORT_BASE_URL).hostname, config.webHost].some((own) => hostMatchesDomain(own, domain))) {
      throw new ApiError(400, 'OWN_DOMAIN', 'You cannot block LinkPulse itself.');
    }
    let row;
    try {
      row = await prisma.blockedDomain.create({ data: { domain, reason: body.reason, addedBy: req.user!.id } });
    } catch (err) {
      if (isUniqueViolation(err, 'domain')) throw new ApiError(409, 'ALREADY_BLOCKED', 'This domain is already on the blocklist.');
      throw err;
    }
    resetBlocklistCache();
    await writeAudit({ actorId: req.user!.id, action: 'domain_blocked', target: domain, reason: body.reason });

    const affected = (await prisma.link.findMany({ select: { id: true, code: true, destination: true } })).filter((l) => {
      const host = hostOf(l.destination);
      return host && findBlockedDomain(host, [domain]);
    });
    for (const l of affected) {
      await prisma.linkAlert.upsert({
        where: { linkId_type: { linkId: l.id, type: 'blocked' } },
        create: { linkId: l.id, type: 'blocked', message: `Destination now matches a blocked domain (${domain}).` },
        update: { message: `Destination now matches a blocked domain (${domain}).`, dismissedAt: null },
      });
      await invalidateLink(l.code);
    }
    res.status(201).json({ domain: { id: row.id, domain, reason: row.reason, createdAt: row.createdAt.toISOString(), linksHit: affected.length } });
  }),
);

adminRouter.delete(
  '/blocklist/:id',
  h(async (req, res) => {
    if (!uuid.safeParse(req.params.id).success) throw notFound('That domain');
    const row = await prisma.blockedDomain.findUnique({ where: { id: req.params.id } });
    if (!row) throw notFound('That domain');
    // Removing a blocklist row is allowed. Links themselves are never deleted.
    await prisma.blockedDomain.delete({ where: { id: row.id } });
    resetBlocklistCache();
    await getBlockedDomains();
    await writeAudit({ actorId: req.user!.id, action: 'domain_unblocked', target: row.domain, oldValue: { reason: row.reason } });
    res.json({ ok: true });
  }),
);

adminRouter.get(
  '/audit',
  h(async (req, res) => {
    const limit = parse(z.coerce.number().int().min(1).max(200).default(50), req.query.limit);
    const rows = await prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { actor: { select: { name: true, role: true } } },
    });
    res.json({
      items: rows.map((a) => {
        const isLink = !!a.linkId;
        return {
          id: a.id.toString(),
          action: a.action,
          text: describeAudit(a.action, a.oldValue as Record<string, unknown> | null, a.newValue as Record<string, unknown> | null),
          target: isLink ? `${config.shortHost}/${a.target}` : a.target,
          actor: a.actor ? (a.actor.role === 'admin' ? 'Platform admin' : a.actor.name) : 'System',
          reason: a.reason,
          at: a.createdAt.toISOString(),
        };
      }),
    });
  }),
);
