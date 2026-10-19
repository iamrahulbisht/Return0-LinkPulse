import { Router, type Request } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/db';
import { ApiError, forbidden, notFound } from '../lib/errors';
import { h, parse } from '../middleware/errors';
import { linkDto, linkInclude } from '../lib/serialize';
import { invalidateLink } from '../lib/linkCache';
import { writeAudit } from '../lib/audit';
import { describeAudit } from '../lib/auditText';
import { endOfIstDay } from '../logic/time';
import { channelOf } from '../logic/source';
import { checkAlias, checkUrl, createLink, tagIdsFor, validateCreate, type CreateLinkInput } from '../services/links';
import { hostOf } from '../logic/url';
import { clientIp } from '../lib/clientIp';
import { inWorkspace } from '../middleware/auth';

export const linksRouter = Router();

const uuid = z.string().uuid();
const deviceEnum = z.enum(['ios', 'android', 'desktop']);
const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-30.');

/** Expiry can be sent as an IST date ("expires at 11:59 PM IST that day") or an exact ISO time. */
const expiryFields = {
  expiresOn: dateKey.nullable().optional(),
  expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
};
function expiryFrom(b: { expiresOn?: string | null; expiresAt?: string | null }): Date | null | undefined {
  if (b.expiresOn !== undefined) return b.expiresOn === null ? null : endOfIstDay(b.expiresOn);
  if (b.expiresAt !== undefined) return b.expiresAt === null ? null : new Date(b.expiresAt);
  return undefined;
}

const createSchema = z.object({
  destination: z.string().max(2048),
  alias: z.string().max(60).optional().nullable(),
  title: z.string().max(120).optional().nullable(),
  campaignId: uuid.optional().nullable(),
  tags: z.array(z.string().max(30)).max(10).optional(),
  ...expiryFields,
  fallbackUrl: z.string().max(2048).optional().nullable(),
  clickLimit: z.number().int('The click limit must be a whole number.').min(1, 'The click limit must be 1 or more.').max(10_000_000).optional().nullable(),
  password: z.string().min(4, 'Use at least 4 characters for the password.').max(200).optional().nullable(),
  rules: z.array(z.object({ device: deviceEnum, destination: z.string().max(2048) })).max(3).optional(),
});

/** Why an admin changed someone else's link: required then (see adminEdit), shown in the owner's history. */
const reasonField = z.string().trim().min(5, 'Write a reason of at least 5 characters.').max(300, 'Keep the reason under 300 characters.');

const patchSchema = createSchema.omit({ alias: true }).partial().extend({ reason: reasonField.optional() });

const listSchema = z.object({
  status: z.enum(['all', 'active', 'expired', 'limit_reached', 'disabled']).default('all'),
  campaign: z.string().optional(),
  tag: z.string().max(30).optional(),
  q: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  all: z.enum(['true', 'false']).optional(),
});

// 10 new links per minute per user → 429.
const createLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  keyGenerator: (req) => (req as Request).user?.id ?? clientIp(req as Request),
  // Only links that were actually created count, so fixing a typo in the wizard never locks you out.
  skipFailedRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) =>
    res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many new links. Try again in a minute.' } }),
});

/** Link status as a query filter (same rules as computeStatus). Also used by the admin user page. */
export function statusWhere(status: string, now: Date): Prisma.LinkWhereInput {
  const notExpired: Prisma.LinkWhereInput = { OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] };
  switch (status) {
    case 'disabled':
      return { status: 'disabled' };
    case 'expired':
      return { status: 'active', expiresAt: { lt: now } };
    case 'limit_reached':
      return { status: 'active', AND: [notExpired, { clickLimit: { not: null } }, { clickCount: { gte: prisma.link.fields.clickLimit } }] };
    case 'active':
      return {
        status: 'active',
        AND: [notExpired, { OR: [{ clickLimit: null }, { clickCount: { lt: prisma.link.fields.clickLimit } }] }],
      };
    default:
      return {};
  }
}

/**
 * A platform admin changing a link in a workspace they are not in (docs/design/admin-management.md, milestone 4).
 * Then a reason is required, and every audit row names the link's owner as its subject, so the change shows in the
 * owner's link history and Account notices and on the admin's page for that user.
 */
function adminEdit(req: Request, link: { workspaceId: string; ownerId: string }, reason: string | undefined) {
  const acting = req.user!.role === 'admin' && !inWorkspace(req.user!, link.workspaceId);
  if (acting && !reason) {
    throw new ApiError(400, 'REASON_REQUIRED', 'Add a reason: the owner will see it in the link history.', [
      { field: 'reason', code: 'REASON_REQUIRED', message: 'Add a reason of at least 5 characters.' },
    ]);
  }
  return { reason: reason ?? null, subjectUserId: acting ? link.ownerId : null };
}

/** Access is checked on every :id route: the link must be in one of your workspaces (else 403). */
export async function loadOwnedLink(req: Request, id: string) {
  if (!uuid.safeParse(id).success) throw notFound('That link');
  const link = await prisma.link.findUnique({ where: { id }, include: linkInclude });
  if (!link) throw notFound('That link');
  if (!inWorkspace(req.user!, link.workspaceId) && req.user!.role !== 'admin') throw forbidden();
  return link;
}

linksRouter.get(
  '/',
  h(async (req, res) => {
    const q = parse(listSchema, req.query);
    const now = new Date();
    const scope: Prisma.LinkWhereInput = q.all === 'true' && req.user!.role === 'admin' ? {} : { workspaceId: req.user!.workspaceId };
    const filters: Prisma.LinkWhereInput[] = [scope];
    if (q.campaign === 'none') filters.push({ campaignId: null });
    else if (q.campaign && uuid.safeParse(q.campaign).success) filters.push({ campaignId: q.campaign });
    if (q.tag) filters.push({ tags: { some: { tag: { name: q.tag.toLowerCase() } } } });
    if (q.q?.trim()) {
      const s = q.q.trim();
      filters.push({
        OR: [
          { code: { contains: s, mode: 'insensitive' } },
          { destination: { contains: s, mode: 'insensitive' } },
          { title: { contains: s, mode: 'insensitive' } },
          { campaign: { name: { contains: s, mode: 'insensitive' } } },
          { tags: { some: { tag: { name: { contains: s.toLowerCase().replace(/^#/, '') } } } } },
        ],
      });
    }
    const base: Prisma.LinkWhereInput = { AND: filters };
    const where: Prisma.LinkWhereInput = { AND: [base, statusWhere(q.status, now)] };
    const [items, total, ...counts] = await Promise.all([
      prisma.link.findMany({
        where,
        include: linkInclude,
        orderBy: [{ clickCount: 'desc' }, { createdAt: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      prisma.link.count({ where }),
      ...(['all', 'active', 'limit_reached', 'expired', 'disabled'] as const).map((s) =>
        prisma.link.count({ where: { AND: [base, statusWhere(s, now)] } }),
      ),
    ]);
    res.json({
      items: items.map((l) => linkDto(l, now)),
      total,
      page: q.page,
      pageSize: q.pageSize,
      counts: { all: counts[0], active: counts[1], limit_reached: counts[2], expired: counts[3], disabled: counts[4] },
    });
  }),
);

/** Live checks for the wizard. Saves nothing. Same functions as create, so UI and API agree. */
linksRouter.post(
  '/validate',
  h(async (req, res) => {
    const body = parse(z.object({ destination: z.string().max(4096).optional(), alias: z.string().max(60).optional() }), req.body);
    const url = (body.destination ?? '').trim();
    const urlIssues = url ? await checkUrl(url) : [];
    const basic = urlIssues.find((i) => ['URL_REQUIRED', 'URL_INVALID', 'URL_SCHEME', 'URL_TOO_LONG'].includes(i.code));
    const loop = urlIssues.find((i) => i.code === 'URL_LOOP');
    const blocked = urlIssues.find((i) => i.code === 'URL_BLOCKED');
    const alias = await checkAlias(body.alias, req.user!.workspaceId);
    const host = url && !basic ? hostOf(url) : null;
    const urlReady = !!url && !basic;
    const checks = [
      {
        id: 'url',
        label: 'Valid web address',
        state: !url ? 'wait' : basic ? 'bad' : 'ok',
        note: !url ? 'Waiting for a URL' : basic ? basic.message : `Looks good: ${host}`,
      },
      {
        id: 'block',
        label: 'Domain is not blocked',
        state: !urlReady ? 'wait' : blocked ? 'bad' : 'ok',
        note: !urlReady ? 'Checked after the URL is valid' : blocked ? blocked.message : 'Not on the blocklist',
      },
      {
        id: 'loop',
        label: 'No redirect loop',
        state: !urlReady ? 'wait' : loop ? 'bad' : 'ok',
        note: !urlReady ? 'Checked after the URL is valid' : loop ? loop.message : 'Does not point back to LinkPulse',
      },
      {
        id: 'alias',
        label: 'Alias is free and allowed',
        state: alias.state === 'bad' ? 'bad' : 'ok',
        note: alias.issue ? alias.issue.message : alias.value ? `${alias.value} is free` : 'We will make a random 7-character code',
      },
    ] as const;
    res.json({
      ok: checks.every((c) => c.state === 'ok'),
      checks,
      destination: { host, issues: urlIssues },
      alias: { value: alias.value, state: alias.state, message: alias.issue?.message ?? null, code: alias.issue?.code ?? null, suggestions: alias.suggestions },
    });
  }),
);

linksRouter.post(
  '/',
  createLimiter,
  h(async (req, res) => {
    const body = parse(createSchema, req.body);
    const input: CreateLinkInput = {
      ...body,
      expiresAt: expiryFrom(body) ?? null,
      alias: body.alias?.trim() || null,
    };
    const actor = { id: req.user!.id, workspaceId: req.user!.workspaceId };
    await validateCreate(input, actor);
    const link = await createLink(input, actor, 'wizard');
    res.status(201).json({ link: linkDto(link) });
  }),
);

linksRouter.get(
  '/:id',
  h(async (req, res) => {
    const link = await loadOwnedLink(req, req.params.id);
    const [stats] = await prisma.$queryRaw<{ human: number; unique_v: number; bots: number; qr: number; qr_locations: number }[]>`
      SELECT COUNT(*) FILTER (WHERE counted)::int AS human,
             COUNT(DISTINCT visitor_hash) FILTER (WHERE counted)::int AS unique_v,
             COUNT(*) FILTER (WHERE click_type <> 'human')::int AS bots,
             COUNT(*) FILTER (WHERE counted AND source = 'qr')::int AS qr,
             COUNT(DISTINCT qr_id) FILTER (WHERE counted AND source = 'qr')::int AS qr_locations
      FROM click_events WHERE link_id = ${link.id}::uuid`;
    const qr = await prisma.$queryRaw<{ id: string; label: string; scans: number }[]>`
      SELECT q.id::text, q.location_label AS label, COUNT(c.id) FILTER (WHERE c.counted)::int AS scans
      FROM qr_codes q LEFT JOIN click_events c ON c.qr_id = q.id
      WHERE q.link_id = ${link.id}::uuid
      GROUP BY q.id ORDER BY scans DESC, q.created_at ASC`;
    res.json({
      link: linkDto(link),
      // The page asks for a reason on changes and shows an "admin view" banner (adminEdit enforces it).
      adminView: req.user!.role === 'admin' && !inWorkspace(req.user!, link.workspaceId),
      stats: {
        humanClicks: stats?.human ?? 0,
        uniqueVisitors: stats?.unique_v ?? 0,
        botsFiltered: stats?.bots ?? 0,
        qrScans: stats?.qr ?? 0,
        qrLocations: stats?.qr_locations ?? 0,
      },
      scansByQr: qr,
    });
  }),
);

linksRouter.patch(
  '/:id',
  h(async (req, res) => {
    const link = await loadOwnedLink(req, req.params.id);
    const body = parse(patchSchema, req.body);
    const why = adminEdit(req, link, body.reason);
    const actorId = req.user!.id;
    const data: Prisma.LinkUpdateInput = {};
    const audits: { action: string; oldValue?: unknown; newValue?: unknown }[] = [];
    const issues = [];
    const now = new Date();

    if (body.destination !== undefined && body.destination.trim() !== link.destination) {
      issues.push(...(await checkUrl(body.destination)));
      data.destination = body.destination.trim();
      audits.push({ action: 'destination_changed', oldValue: { destination: link.destination }, newValue: { destination: data.destination } });
    }
    if (body.title !== undefined && (body.title?.trim() || null) !== link.title) {
      data.title = body.title?.trim() || null;
      audits.push({ action: 'title_changed', oldValue: { title: link.title }, newValue: { title: data.title } });
    }
    const exp = expiryFrom(body);
    if (exp !== undefined && (exp?.getTime() ?? null) !== (link.expiresAt?.getTime() ?? null)) {
      if (exp && exp.getTime() <= now.getTime()) {
        issues.push({ field: 'expiresAt', code: 'EXPIRY_PAST', message: 'The expiry date is in the past. Pick a later date.' });
      }
      data.expiresAt = exp;
      audits.push({ action: 'expiry_changed', oldValue: { expiresAt: link.expiresAt }, newValue: { expiresAt: exp } });
    }
    if (body.fallbackUrl !== undefined && (body.fallbackUrl?.trim() || null) !== link.fallbackUrl) {
      if (body.fallbackUrl) issues.push(...(await checkUrl(body.fallbackUrl, 'fallbackUrl')));
      data.fallbackUrl = body.fallbackUrl?.trim() || null;
      audits.push({ action: 'fallback_changed', oldValue: { fallbackUrl: link.fallbackUrl }, newValue: { fallbackUrl: data.fallbackUrl } });
    }
    if (body.clickLimit !== undefined && body.clickLimit !== link.clickLimit) {
      data.clickLimit = body.clickLimit;
      audits.push({ action: 'limit_changed', oldValue: { clickLimit: link.clickLimit }, newValue: { clickLimit: body.clickLimit } });
    }
    if (body.password !== undefined) {
      if (body.password === null && link.passwordHash) {
        data.passwordHash = null;
        audits.push({ action: 'password_removed' });
      } else if (body.password) {
        data.passwordHash = await bcrypt.hash(body.password, 10);
        audits.push({ action: link.passwordHash ? 'password_changed' : 'password_added' });
      }
    }
    if (body.campaignId !== undefined && body.campaignId !== link.campaignId) {
      let name: string | null = null;
      if (body.campaignId) {
        const c = await prisma.campaign.findFirst({ where: { id: body.campaignId, workspaceId: link.workspaceId } });
        if (!c) issues.push({ field: 'campaignId', code: 'CAMPAIGN_NOT_FOUND', message: 'Pick one of your campaigns.' });
        name = c?.name ?? null;
      }
      data.campaign = body.campaignId ? { connect: { id: body.campaignId } } : { disconnect: true };
      audits.push({ action: 'campaign_changed', oldValue: { campaign: link.campaign?.name ?? null }, newValue: { campaign: name } });
    }
    if (body.rules) for (const [i, r] of body.rules.entries()) issues.push(...(await checkUrl(r.destination, `rules.${i}.destination`)));
    if (issues.length) throw new ApiError(400, issues[0].code, issues[0].message, issues);

    await prisma.$transaction(async (tx) => {
      if (body.tags) {
        const tagIds = await tagIdsFor(link.workspaceId, actorId, body.tags, tx);
        await tx.linkTag.deleteMany({ where: { linkId: link.id } });
        await tx.linkTag.createMany({ data: tagIds.map((tagId) => ({ linkId: link.id, tagId })) });
        audits.push({ action: 'tags_changed', oldValue: { tags: (link.tags ?? []).map((t) => t.tag.name) }, newValue: { tags: body.tags } });
      }
      if (body.rules) {
        await tx.redirectRule.deleteMany({ where: { linkId: link.id } });
        await tx.redirectRule.createMany({
          data: body.rules.map((r, i) => ({ linkId: link.id, device: r.device, destination: r.destination.trim(), priority: i + 1 })),
        });
        audits.push({ action: 'rules_changed', oldValue: { rules: link.rules?.length ?? 0 }, newValue: { rules: body.rules } });
      }
      if (Object.keys(data).length) await tx.link.update({ where: { id: link.id }, data });
      for (const a of audits) await writeAudit({ actorId, linkId: link.id, target: link.code, ...why, ...a }, tx);
    });
    // The very next visit must see the new rules.
    await invalidateLink(link.code);
    const fresh = await prisma.link.findUniqueOrThrow({ where: { id: link.id }, include: linkInclude });
    res.json({ link: linkDto(fresh) });
  }),
);

const stateSchema = z.object({ state: z.enum(['active', 'limit_reached', 'expired']), reason: reasonField.optional() });

/**
 * "Link life": the owner switches the link to a state. Status is computed from the fields
 * (see computeStatus), so this changes the fields that produce it:
 *   expired       → expiry = now
 *   limit_reached → click limit = human clicks so far (a past expiry is removed so the state shows)
 *   active        → removes the past expiry and/or the reached limit that stops it
 * Disabling is an admin takedown with a reason (admin routes), so it is not offered here.
 */
linksRouter.post(
  '/:id/state',
  h(async (req, res) => {
    const link = await loadOwnedLink(req, req.params.id);
    const { state, reason } = parse(stateSchema, req.body);
    const why = adminEdit(req, link, reason);
    if (link.status === 'disabled') {
      throw new ApiError(409, 'LINK_DISABLED', 'An admin turned this link off. Only an admin can turn it back on.');
    }
    const now = new Date();
    const pastExpiry = link.expiresAt !== null && link.expiresAt.getTime() < now.getTime();
    const limitHit = link.clickLimit !== null && link.clickCount >= link.clickLimit;
    const data: Prisma.LinkUpdateInput = {};
    if (state === 'expired' && !pastExpiry) {
      // A second in the past, so it reads as expired straight away (the check is "expiry < now").
      data.expiresAt = new Date(now.getTime() - 1000);
    }
    if (state === 'limit_reached') {
      if (pastExpiry) data.expiresAt = null;
      if (!limitHit) data.clickLimit = link.clickCount;
    }
    if (state === 'active') {
      if (pastExpiry) data.expiresAt = null;
      if (limitHit) data.clickLimit = null;
    }

    if (Object.keys(data).length) {
      await prisma.$transaction(async (tx) => {
        await tx.link.update({ where: { id: link.id }, data });
        const base = { actorId: req.user!.id, linkId: link.id, target: link.code, ...why };
        if (data.expiresAt !== undefined) {
          await writeAudit({ ...base, action: 'expiry_changed', oldValue: { expiresAt: link.expiresAt }, newValue: { expiresAt: data.expiresAt } }, tx);
        }
        if (data.clickLimit !== undefined) {
          await writeAudit({ ...base, action: 'limit_changed', oldValue: { clickLimit: link.clickLimit }, newValue: { clickLimit: data.clickLimit } }, tx);
        }
      });
      // The very next visit must see the new state.
      await invalidateLink(link.code);
    }
    const fresh = await prisma.link.findUniqueOrThrow({ where: { id: link.id }, include: linkInclude });
    res.json({ link: linkDto(fresh) });
  }),
);

linksRouter.get(
  '/:id/clicks',
  h(async (req, res) => {
    const link = await loadOwnedLink(req, req.params.id);
    const limit = parse(z.coerce.number().int().min(1).max(100).default(20), req.query.limit);
    const rows = await prisma.clickEvent.findMany({
      where: { linkId: link.id },
      orderBy: { clickedAt: 'desc' },
      take: limit,
      include: { qr: { select: { locationLabel: true } } },
    });
    res.json({
      items: rows.map((c) => ({
        id: c.id.toString(),
        at: c.clickedAt.toISOString(),
        source: c.source,
        channel: channelOf(c.source, c.referrer),
        qrLabel: c.qr?.locationLabel ?? null,
        device: c.device,
        os: c.os,
        browser: c.browser,
        city: c.city,
        country: c.country,
        clickType: c.clickType,
        counted: c.counted,
      })),
    });
  }),
);

linksRouter.get(
  '/:id/history',
  h(async (req, res) => {
    const link = await loadOwnedLink(req, req.params.id);
    const rows = await prisma.auditLog.findMany({
      where: { linkId: link.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { actor: { select: { name: true, role: true } } },
    });
    res.json({
      items: rows.map((a) => ({
        id: a.id.toString(),
        action: a.action,
        text: describeAudit(a.action, a.oldValue as Record<string, unknown> | null, a.newValue as Record<string, unknown> | null),
        actor: a.actor ? (a.actor.role === 'admin' && a.actorId !== link.ownerId ? 'Platform admin' : a.actor.name) : 'System',
        reason: a.reason,
        at: a.createdAt.toISOString(),
      })),
    });
  }),
);
