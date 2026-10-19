import { Router } from 'express';
import { z } from 'zod';
import { prisma, isUniqueViolation } from '../lib/db';
import { ApiError, forbidden, notFound } from '../lib/errors';
import { h, parse } from '../middleware/errors';
import { inWorkspace } from '../middleware/auth';
import { computeStatus } from '../logic/rules';
import { config } from '../lib/config';
import { RESERVED_ALIASES } from '../logic/alias';

export const bioRouter = Router();
export const publicBioRouter = Router();

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/, 'Use 3 to 40 letters, numbers or dashes.');
const linksSchema = z
  .array(z.object({ linkId: z.string().uuid(), label: z.string().trim().min(1, 'Give each button a label.').max(80) }))
  .max(20);
const createSchema = z.object({
  slug: slugSchema,
  title: z.string().trim().min(1, 'Add a title.').max(80),
  description: z.string().trim().max(240).nullable().optional(),
  theme: z.enum(['dark', 'light']).default('dark'),
  links: linksSchema.default([]),
});

type PageWithLinks = Awaited<ReturnType<typeof loadPage>>;

async function loadPage(where: { id?: string; slug?: string }) {
  return prisma.bioPage.findFirst({
    where,
    include: { links: { orderBy: { position: 'asc' }, include: { link: true } }, owner: { select: { name: true } } },
  });
}

function dto(p: NonNullable<PageWithLinks>) {
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    description: p.description,
    theme: p.theme,
    publicPath: `/b/${p.slug}`,
    links: p.links.map((b) => ({
      linkId: b.linkId,
      label: b.label,
      position: b.position,
      code: b.link.code,
      status: computeStatus(b.link),
      expiresAt: b.link.expiresAt?.toISOString() ?? null,
    })),
  };
}

/** Only links from the page's own workspace can be put on it. */
async function assertOwnLinks(workspaceId: string, links: { linkId: string }[]) {
  if (!links.length) return;
  const n = await prisma.link.count({ where: { id: { in: links.map((l) => l.linkId) }, workspaceId } });
  if (n !== new Set(links.map((l) => l.linkId)).size) {
    throw new ApiError(400, 'LINK_NOT_YOURS', 'You can only add links from this workspace.');
  }
}

bioRouter.get(
  '/',
  h(async (req, res) => {
    const pages = await prisma.bioPage.findMany({
      where: { workspaceId: req.user!.workspaceId },
      include: { links: { orderBy: { position: 'asc' }, include: { link: true } }, owner: { select: { name: true } } },
    });
    const clicks = await prisma.$queryRaw<{ page_link: string; n: number }[]>`
      SELECT b.page_id::text || ':' || b.link_id::text AS page_link, COUNT(e.id)::int AS n
      FROM bio_page_links b JOIN bio_pages p ON p.id = b.page_id
      JOIN click_events e ON e.link_id = b.link_id AND e.source = 'bio' AND e.counted
      WHERE p.workspace_id = ${req.user!.workspaceId}::uuid GROUP BY 1`;
    const byKey = new Map(clicks.map((c) => [c.page_link, c.n]));
    res.json({
      items: pages.map((p) => {
        const d = dto(p);
        const links = d.links.map((l) => ({ ...l, bioClicks: byKey.get(`${p.id}:${l.linkId}`) ?? 0 }));
        return { ...d, links, bioClicks: links.reduce((a, l) => a + l.bioClicks, 0) };
      }),
    });
  }),
);

bioRouter.post(
  '/',
  h(async (req, res) => {
    const body = parse(createSchema, req.body);
    if (RESERVED_ALIASES.has(body.slug)) throw new ApiError(400, 'SLUG_RESERVED', `"${body.slug}" is kept for the app itself.`);
    await assertOwnLinks(req.user!.workspaceId, body.links);
    try {
      const p = await prisma.bioPage.create({
        data: {
          ownerId: req.user!.id,
          workspaceId: req.user!.workspaceId,
          slug: body.slug,
          title: body.title,
          description: body.description ?? null,
          theme: body.theme,
          links: { create: body.links.map((l, i) => ({ linkId: l.linkId, label: l.label, position: i + 1 })) },
        },
      });
      res.status(201).json({ page: dto((await loadPage({ id: p.id }))!) });
    } catch (err) {
      if (isUniqueViolation(err, 'slug')) {
        throw new ApiError(409, 'SLUG_TAKEN', 'That page address is taken. Try another one.', [{ field: 'slug', code: 'SLUG_TAKEN', message: 'That page address is taken.' }]);
      }
      throw err;
    }
  }),
);

bioRouter.patch(
  '/:id',
  h(async (req, res) => {
    if (!z.string().uuid().safeParse(req.params.id).success) throw notFound('That page');
    const page = await prisma.bioPage.findUnique({ where: { id: req.params.id } });
    if (!page) throw notFound('That page');
    if (!inWorkspace(req.user!, page.workspaceId)) throw forbidden();
    const body = parse(createSchema.omit({ slug: true }).partial(), req.body);
    if (body.links) await assertOwnLinks(page.workspaceId, body.links);
    await prisma.$transaction(async (tx) => {
      await tx.bioPage.update({
        where: { id: page.id },
        data: { title: body.title, description: body.description, theme: body.theme },
      });
      if (body.links) {
        await tx.bioPageLink.deleteMany({ where: { pageId: page.id } });
        await tx.bioPageLink.createMany({ data: body.links.map((l, i) => ({ pageId: page.id, linkId: l.linkId, label: l.label, position: i + 1 })) });
      }
    });
    res.json({ page: dto((await loadPage({ id: page.id }))!) });
  }),
);

/** Public page data. Disabled links are hidden. Each button goes through the short link with ?src=bio. */
publicBioRouter.get(
  '/:slug',
  h(async (req, res) => {
    const slug = parse(slugSchema, req.params.slug);
    const p = await loadPage({ slug });
    if (!p) throw notFound('That page');
    const owner = p.owner.name;
    res.set('Cache-Control', 'public, max-age=30');
    res.json({
      slug: p.slug,
      title: p.title,
      description: p.description,
      theme: p.theme,
      initials: owner
        .split(/\s+/)
        .map((w) => w[0])
        .join('')
        .slice(0, 2)
        .toUpperCase(),
      links: p.links
        .filter((b) => computeStatus(b.link) !== 'disabled')
        .map((b) => ({
          label: b.label,
          href: `${config.shortBase}/${b.link.code}?src=bio`,
          status: computeStatus(b.link),
          expiresAt: b.link.expiresAt?.toISOString() ?? null,
        })),
    });
  }),
);
