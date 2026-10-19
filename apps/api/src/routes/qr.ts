import { Router } from 'express';
import QRCode from 'qrcode';
import { z } from 'zod';
import { prisma } from '../lib/db';
import { config } from '../lib/config';
import { ApiError, forbidden, notFound } from '../lib/errors';
import { h, parse } from '../middleware/errors';
import { inWorkspace, type SessionUser } from '../middleware/auth';
import { qrContrast } from '../logic/contrast';
import { loadOwnedLink } from './links';

export const linkQrRouter = Router({ mergeParams: true });
export const qrRouter = Router();

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a colour like #0B0B0F.');

/** What the printed code opens. `src=qr&q=<id>` tags every scan with its poster location. */
export function qrTarget(code: string, qrId: string): string {
  return `${config.shortBase}/${code}?src=qr&q=${qrId}`;
}

interface QrRow {
  id: string;
  link_id: string;
  code: string;
  location_label: string;
  fg_color: string;
  created_at: Date;
  scans: number;
  status: string;
  expires_at: Date | null;
}

async function listQr(where: { workspaceId?: string; linkId?: string }) {
  const rows = await prisma.$queryRaw<QrRow[]>`
    SELECT q.id::text, q.link_id::text, l.code, q.location_label, q.fg_color, q.created_at,
           COUNT(c.id) FILTER (WHERE c.counted)::int AS scans, l.status::text AS status, l.expires_at
    FROM qr_codes q
    JOIN links l ON l.id = q.link_id
    LEFT JOIN click_events c ON c.qr_id = q.id
    WHERE (${where.workspaceId ?? null}::uuid IS NULL OR l.workspace_id = ${where.workspaceId ?? null}::uuid)
      AND (${where.linkId ?? null}::uuid IS NULL OR q.link_id = ${where.linkId ?? null}::uuid)
    GROUP BY q.id, l.id
    ORDER BY scans DESC, q.created_at ASC`;
  const now = Date.now();
  return rows.map((r) => ({
    id: r.id,
    linkId: r.link_id,
    code: r.code,
    locationLabel: r.location_label,
    fgColor: r.fg_color,
    scans: r.scans,
    target: qrTarget(r.code, r.id),
    createdAt: r.created_at.toISOString(),
    warning:
      r.status === 'disabled'
        ? 'Link disabled. Scans now show the "turned off" page.'
        : r.expires_at && r.expires_at.getTime() < now
          ? 'Link expired. Scans now show the expired page.'
          : null,
  }));
}

linkQrRouter.get(
  '/',
  h(async (req, res) => {
    const link = await loadOwnedLink(req, req.params.id);
    res.json({ items: await listQr({ linkId: link.id }) });
  }),
);

linkQrRouter.post(
  '/',
  h(async (req, res) => {
    const link = await loadOwnedLink(req, req.params.id);
    // An admin may look at someone else's QR codes, but making posters is the workspace's job
    // (admin changes to other people's links go through Edit / Link life with a reason).
    if (!inWorkspace(req.user!, link.workspaceId)) {
      throw new ApiError(403, 'NOT_IN_WORKSPACE', 'Only people in this link’s workspace can make QR codes for it.');
    }
    const body = parse(
      z.object({
        location_label: z.string().trim().min(1, 'Say where it will be printed.').max(60),
        fg_color: hex.default('#0B0B0F'),
      }),
      req.body,
    );
    const contrast = qrContrast(body.fg_color);
    const qr = await prisma.qrCode.create({
      data: { linkId: link.id, locationLabel: body.location_label, fgColor: body.fg_color.toUpperCase() },
    });
    res.status(201).json({
      qr: { id: qr.id, linkId: link.id, code: link.code, locationLabel: qr.locationLabel, fgColor: qr.fgColor, scans: 0, target: qrTarget(link.code, qr.id), createdAt: qr.createdAt.toISOString(), warning: null },
      contrast,
    });
  }),
);

/** All QR codes in the active workspace (QR codes page). */
qrRouter.get(
  '/',
  h(async (req, res) => {
    res.json({ items: await listQr({ workspaceId: req.user!.workspaceId }) });
  }),
);

qrRouter.get(
  '/contrast',
  h(async (req, res) => {
    const fg = parse(hex, req.query.fg);
    res.json(qrContrast(fg));
  }),
);

async function loadQr(qrId: string, user: SessionUser) {
  if (!z.string().uuid().safeParse(qrId).success) throw notFound('That QR code');
  const qr = await prisma.qrCode.findUnique({ where: { id: qrId }, include: { link: { select: { code: true, workspaceId: true } } } });
  if (!qr) throw notFound('That QR code');
  if (!inWorkspace(user, qr.link.workspaceId) && user.role !== 'admin') throw forbidden();
  return qr;
}

const fileName = (code: string, label: string, ext: string) =>
  `linkpulse-${code}-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.${ext}`;

qrRouter.get(
  '/:file',
  h(async (req, res) => {
    const m = /^([0-9a-f-]{36})\.(png|svg)$/i.exec(req.params.file);
    if (!m) throw new ApiError(404, 'NOT_FOUND', 'Use /api/qr/<id>.png or /api/qr/<id>.svg.');
    const [, qrId, ext] = m;
    const qr = await loadQr(qrId, req.user!);
    const text = qrTarget(qr.link.code, qr.id);
    const opts = { errorCorrectionLevel: 'M' as const, margin: 2, color: { dark: qr.fgColor, light: '#FFFFFF' } };
    const download = req.query.download === '1';
    if (download) res.attachment(fileName(qr.link.code, qr.locationLabel, ext));
    res.set('Cache-Control', 'private, max-age=300');
    if (ext.toLowerCase() === 'svg') {
      res.type('image/svg+xml').send(await QRCode.toString(text, { ...opts, type: 'svg' }));
    } else {
      res.type('image/png').send(await QRCode.toBuffer(text, { ...opts, width: 1024 }));
    }
  }),
);
