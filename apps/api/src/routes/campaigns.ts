import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db';
import { ApiError, forbidden, notFound } from '../lib/errors';
import { h, parse } from '../middleware/errors';
import { inWorkspace, type SessionUser } from '../middleware/auth';
import { istDateKey } from '../logic/time';

export const campaignsRouter = Router();
export const tagsRouter = Router();

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-30.');
const campaignSchema = z
  .object({
    name: z.string().trim().min(1, 'Give the campaign a name.').max(80),
    startsAt: dateKey.nullable().optional(),
    endsAt: dateKey.nullable().optional(),
  })
  .refine((c) => !c.startsAt || !c.endsAt || c.startsAt <= c.endsAt, { message: 'The end date must be on or after the start date.', path: ['endsAt'] });

type CampaignState = 'running' | 'ended' | 'scheduled' | 'no_dates';

/** Campaign dates are whole days in IST. */
export function campaignState(startsAt: Date | null, endsAt: Date | null, now = new Date()) {
  const today = istDateKey(now);
  const s = startsAt ? startsAt.toISOString().slice(0, 10) : null;
  const e = endsAt ? endsAt.toISOString().slice(0, 10) : null;
  let state: CampaignState = 'no_dates';
  let progress = 0;
  if (s && today < s) state = 'scheduled';
  else if (e && today > e) {
    state = 'ended';
    progress = 100;
  } else if (s || e) state = 'running';
  if (state === 'running' && s && e) {
    const total = Date.parse(e) - Date.parse(s) + 86400_000;
    progress = Math.max(0, Math.min(100, Math.round(((Date.parse(today) - Date.parse(s) + 86400_000) / total) * 100)));
  }
  return { state, progress };
}

interface StatRow {
  campaign_id: string;
  links: number;
  clicks: number;
  unique_v: number;
  bots: number;
}

async function campaignStats(workspaceId: string) {
  const rows = await prisma.$queryRaw<StatRow[]>`
    SELECT c.id::text AS campaign_id,
      (SELECT COUNT(*)::int FROM links l WHERE l.campaign_id = c.id) AS links,
      COUNT(e.id) FILTER (WHERE e.counted)::int AS clicks,
      COUNT(DISTINCT e.visitor_hash) FILTER (WHERE e.counted)::int AS unique_v,
      COUNT(e.id) FILTER (WHERE e.click_type <> 'human')::int AS bots
    FROM campaigns c
    LEFT JOIN links l ON l.campaign_id = c.id
    LEFT JOIN click_events e ON e.link_id = l.id
    WHERE c.workspace_id = ${workspaceId}::uuid
    GROUP BY c.id`;
  return new Map(rows.map((r) => [r.campaign_id, r]));
}

async function topLinks(campaignId: string) {
  return prisma.$queryRaw<{ id: string; code: string; clicks: number }[]>`
    SELECT l.id::text, l.code, COUNT(e.id) FILTER (WHERE e.counted)::int AS clicks
    FROM links l LEFT JOIN click_events e ON e.link_id = l.id
    WHERE l.campaign_id = ${campaignId}::uuid
    GROUP BY l.id ORDER BY clicks DESC, l.created_at ASC LIMIT 5`;
}

function dto(c: { id: string; name: string; startsAt: Date | null; endsAt: Date | null; createdAt: Date }, s?: StatRow) {
  const { state, progress } = campaignState(c.startsAt, c.endsAt);
  return {
    id: c.id,
    name: c.name,
    startsAt: c.startsAt ? c.startsAt.toISOString().slice(0, 10) : null,
    endsAt: c.endsAt ? c.endsAt.toISOString().slice(0, 10) : null,
    state,
    progress,
    links: s?.links ?? 0,
    humanClicks: s?.clicks ?? 0,
    uniqueVisitors: s?.unique_v ?? 0,
    botsFiltered: s?.bots ?? 0,
    createdAt: c.createdAt.toISOString(),
  };
}

const toDate = (d: string | null | undefined) => (d ? new Date(`${d}T00:00:00Z`) : d === null ? null : undefined);

campaignsRouter.get(
  '/',
  h(async (req, res) => {
    const list = await prisma.campaign.findMany({ where: { workspaceId: req.user!.workspaceId }, orderBy: [{ startsAt: 'desc' }, { createdAt: 'desc' }] });
    const stats = await campaignStats(req.user!.workspaceId);
    const items = await Promise.all(
      list.map(async (c) => ({ ...dto(c, stats.get(c.id)), top: await topLinks(c.id) })),
    );
    // Running first, then scheduled, then ended.
    const order: Record<CampaignState, number> = { running: 0, scheduled: 1, no_dates: 2, ended: 3 };
    items.sort((a, b) => order[a.state] - order[b.state]);
    res.json({ items });
  }),
);

campaignsRouter.post(
  '/',
  h(async (req, res) => {
    const body = parse(campaignSchema, req.body);
    const c = await prisma.campaign.create({
      data: {
        name: body.name,
        startsAt: toDate(body.startsAt) ?? null,
        endsAt: toDate(body.endsAt) ?? null,
        ownerId: req.user!.id,
        workspaceId: req.user!.workspaceId,
      },
    });
    res.status(201).json({ campaign: { ...dto(c), top: [] } });
  }),
);

/** The campaign must be in one of your workspaces (admins may read any). */
async function loadOwned(user: SessionUser, id: string, allowAdmin: boolean) {
  if (!z.string().uuid().safeParse(id).success) throw notFound('That campaign');
  const c = await prisma.campaign.findUnique({ where: { id } });
  if (!c) throw notFound('That campaign');
  if (!inWorkspace(user, c.workspaceId) && !(allowAdmin && user.role === 'admin')) throw forbidden();
  return c;
}

campaignsRouter.get(
  '/:id',
  h(async (req, res) => {
    const c = await loadOwned(req.user!, req.params.id, true);
    const stats = await campaignStats(c.workspaceId);
    res.json({ campaign: { ...dto(c, stats.get(c.id)), top: await topLinks(c.id) } });
  }),
);

campaignsRouter.patch(
  '/:id',
  h(async (req, res) => {
    const c = await loadOwned(req.user!, req.params.id, false);
    const body = parse(
      z.object({ name: z.string().trim().min(1).max(80).optional(), startsAt: dateKey.nullable().optional(), endsAt: dateKey.nullable().optional() }),
      req.body,
    );
    const startsAt = body.startsAt !== undefined ? toDate(body.startsAt) : c.startsAt;
    const endsAt = body.endsAt !== undefined ? toDate(body.endsAt) : c.endsAt;
    if (startsAt && endsAt && startsAt > endsAt) throw new ApiError(400, 'DATES', 'The end date must be on or after the start date.');
    const updated = await prisma.campaign.update({ where: { id: c.id }, data: { name: body.name, startsAt, endsAt } });
    const stats = await campaignStats(c.workspaceId);
    res.json({ campaign: { ...dto(updated, stats.get(c.id)), top: await topLinks(c.id) } });
  }),
);

tagsRouter.get(
  '/',
  h(async (req, res) => {
    const tags = await prisma.tag.findMany({
      where: { workspaceId: req.user!.workspaceId },
      orderBy: { name: 'asc' },
      include: { _count: { select: { links: true } } },
    });
    res.json({ items: tags.map((t) => ({ id: t.id, name: t.name, links: t._count.links })) });
  }),
);

tagsRouter.post(
  '/',
  h(async (req, res) => {
    const { name } = parse(z.object({ name: z.string().trim().min(1).max(30).regex(/^#?[a-zA-Z0-9-_]+$/, 'Use letters, numbers and dashes.') }), req.body);
    const clean = name.toLowerCase().replace(/^#/, '');
    const t = await prisma.tag.upsert({
      where: { workspaceId_name: { workspaceId: req.user!.workspaceId, name: clean } },
      create: { workspaceId: req.user!.workspaceId, ownerId: req.user!.id, name: clean },
      update: {},
    });
    res.status(201).json({ tag: { id: t.id, name: t.name } });
  }),
);
