import { Router, type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma, isUniqueViolation } from '../lib/db';
import { ApiError } from '../lib/errors';
import { writeAudit } from '../lib/audit';
import { subjectHistoryItem } from '../lib/auditText';
import { config } from '../lib/config';
import { h, parse } from '../middleware/errors';
import { loadSessionUser, setSessionCookie, signSession, type SessionUser } from '../middleware/auth';

// Everything here runs after requireUser and only ever touches the signed-in user (no :id routes).
export const profileRouter = Router();

export const AVATAR_MAX_BYTES = 1024 * 1024;

/** Image type from the file's first bytes. The name and the browser's Content-Type are not trusted. */
export function sniffImage(buf: Buffer): 'image/png' | 'image/jpeg' | 'image/webp' | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: AVATAR_MAX_BYTES, files: 1 } });

// Wrong "current password" tries on email/password changes: 10 per 15 minutes per user.
// Only failed requests count, so normal use never hits it.
const reauthLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => (req as Request).user?.id ?? 'anon',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) =>
    res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many wrong passwords. Please wait 15 minutes and try again.' } }),
});

const password = z.string().min(8, 'Use at least 8 characters.').max(200);

async function checkCurrentPassword(userId: string, current: string): Promise<void> {
  const u = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { passwordHash: true, mustChangePassword: true, tempPasswordExpiresAt: true },
  });
  // The 24 h limit on an admin's temporary password also applies to a session that signed in with it in time.
  if (u.mustChangePassword && u.tempPasswordExpiresAt && u.tempPasswordExpiresAt <= new Date()) {
    throw new ApiError(401, 'TEMP_PASSWORD_EXPIRED', 'Your temporary password has expired. Ask the platform admin for a new one.');
  }
  if (!(await bcrypt.compare(current, u.passwordHash))) {
    throw new ApiError(400, 'WRONG_PASSWORD', 'Your current password is not right.', [
      { field: 'currentPassword', code: 'WRONG_PASSWORD', message: 'Your current password is not right.' },
    ]);
  }
}

/** URL path (under /api) of the user's photo, with a version so browsers fetch the new one after a change. */
export function avatarPath(u: Pick<SessionUser, 'avatarUpdatedAt'>): string | null {
  return u.avatarUpdatedAt ? `/me/avatar?v=${u.avatarUpdatedAt.getTime()}` : null;
}

async function profileDto(u: SessionUser) {
  const [links, campaigns, qrCodes, [clicks]] = await Promise.all([
    prisma.link.count({ where: { ownerId: u.id } }),
    prisma.campaign.count({ where: { ownerId: u.id } }),
    prisma.qrCode.count({ where: { link: { ownerId: u.id } } }),
    prisma.$queryRaw<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM click_events e JOIN links l ON l.id = e.link_id
      WHERE l.owner_id = ${u.id}::uuid AND e.counted`,
  ]);
  return {
    user: { id: u.id, name: u.name, email: u.email, role: u.role, createdAt: u.createdAt.toISOString(), avatarPath: avatarPath(u) },
    workspace: { id: u.workspaceId, name: u.workspaceName, isOwner: u.workspaceOwner },
    stats: { links, campaigns, qrCodes, humanClicks: clicks?.n ?? 0 },
  };
}

/** Re-read the user after a change, so the response shows what is now stored. */
async function fresh(req: Request): Promise<SessionUser> {
  const u = await loadSessionUser(req.user!.id);
  if (!u) throw new ApiError(401, 'NOT_SIGNED_IN', 'Please sign in.');
  return u;
}

profileRouter.get(
  '/profile',
  h(async (req, res) => {
    res.json(await profileDto(req.user!));
  }),
);

profileRouter.patch(
  '/profile',
  h(async (req, res) => {
    const body = parse(
      z.object({
        name: z.string().trim().min(1, 'Add your name.').max(80).optional(),
        workspaceName: z.string().trim().min(1, 'Give the workspace a name.').max(80).optional(),
      }),
      req.body,
    );
    const u = req.user!;
    if (body.workspaceName !== undefined && !u.workspaceOwner) {
      throw new ApiError(403, 'FORBIDDEN', 'Only the workspace owner can rename it.');
    }
    await prisma.$transaction(async (tx) => {
      if (body.name !== undefined && body.name !== u.name) await tx.user.update({ where: { id: u.id }, data: { name: body.name } });
      if (body.workspaceName !== undefined && body.workspaceName !== u.workspaceName) {
        await tx.workspace.update({ where: { id: u.workspaceId }, data: { name: body.workspaceName } });
      }
    });
    res.json(await profileDto(await fresh(req)));
  }),
);

profileRouter.post(
  '/email',
  reauthLimiter,
  h(async (req, res) => {
    const body = parse(
      z.object({
        email: z.string().trim().toLowerCase().email('Enter a valid email address.').max(200),
        currentPassword: z.string().min(1, 'Enter your current password.').max(200),
      }),
      req.body,
    );
    const u = req.user!;
    await checkCurrentPassword(u.id, body.currentPassword);
    if (body.email === u.email) {
      throw new ApiError(400, 'SAME_EMAIL', 'This is already your email.', [{ field: 'email', code: 'SAME_EMAIL', message: 'This is already your email.' }]);
    }
    try {
      await prisma.user.update({ where: { id: u.id }, data: { email: body.email } });
    } catch (err) {
      if (isUniqueViolation(err, 'email')) {
        throw new ApiError(409, 'EMAIL_TAKEN', 'Another account already uses this email.', [
          { field: 'email', code: 'EMAIL_TAKEN', message: 'Another account already uses this email.' },
        ]);
      }
      throw err;
    }
    // Recorded without the addresses themselves.
    await writeAudit({ actorId: u.id, action: 'account_email_changed', target: u.name });
    res.json(await profileDto(await fresh(req)));
  }),
);

profileRouter.post(
  '/password',
  reauthLimiter,
  h(async (req, res) => {
    const body = parse(z.object({ currentPassword: z.string().min(1, 'Enter your current password.').max(200), newPassword: password }), req.body);
    const u = req.user!;
    await checkCurrentPassword(u.id, body.currentPassword);
    if (body.currentPassword === body.newPassword) {
      throw new ApiError(400, 'SAME_PASSWORD', 'Pick a password you have not used here.', [
        { field: 'newPassword', code: 'SAME_PASSWORD', message: 'Pick a password you have not used here.' },
      ]);
    }
    const passwordHash = await bcrypt.hash(body.newPassword, 10);
    // Bump the token version: every other session is signed out; this one gets a fresh cookie.
    const updated = await prisma.user.update({
      where: { id: u.id },
      // Also ends an admin password reset: the temporary password is replaced.
      data: { passwordHash, tokenVersion: { increment: 1 }, failedLogins: 0, lockedUntil: null, mustChangePassword: false, tempPasswordExpiresAt: null },
    });
    setSessionCookie(res, signSession(u.id, updated.tokenVersion));
    await writeAudit({ actorId: u.id, action: 'account_password_changed', target: u.name });
    res.json({ ok: true });
  }),
);

profileRouter.post(
  '/sessions/revoke',
  h(async (req, res) => {
    const u = req.user!;
    const updated = await prisma.user.update({ where: { id: u.id }, data: { tokenVersion: { increment: 1 } } });
    setSessionCookie(res, signSession(u.id, updated.tokenVersion));
    await writeAudit({ actorId: u.id, action: 'account_sessions_revoked', target: u.name });
    res.json({ ok: true });
  }),
);

profileRouter.put(
  '/avatar',
  upload.single('file'),
  h(async (req, res) => {
    if (!req.file) throw new ApiError(400, 'NO_FILE', 'Choose a photo to upload.');
    const mime = sniffImage(req.file.buffer);
    if (!mime) throw new ApiError(400, 'NOT_AN_IMAGE', 'Use a PNG, JPEG or WebP photo.');
    const data = Uint8Array.from(req.file.buffer);
    await prisma.userAvatar.upsert({
      where: { userId: req.user!.id },
      create: { userId: req.user!.id, mime, data },
      update: { mime, data },
    });
    res.json(await profileDto(await fresh(req)));
  }),
);

profileRouter.delete(
  '/avatar',
  h(async (req, res) => {
    await prisma.userAvatar.deleteMany({ where: { userId: req.user!.id } });
    res.json(await profileDto(await fresh(req)));
  }),
);

profileRouter.get(
  '/avatar',
  h(async (req: Request, res: Response) => {
    const a = await prisma.userAvatar.findUnique({ where: { userId: req.user!.id } });
    if (!a) throw new ApiError(404, 'NOT_FOUND', 'You have no profile photo.');
    res.set({
      'Content-Type': a.mime,
      'Cache-Control': 'private, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline',
    });
    res.send(Buffer.from(a.data));
  }),
);

/**
 * Account notices: what a platform admin did to my account or my links, with their reason
 * (docs/design/admin-management.md, F9). Only rows about me, and only ones someone else did.
 */
profileRouter.get(
  '/notices',
  h(async (req, res) => {
    const me = req.user!.id;
    const rows = await prisma.auditLog.findMany({
      where: { subjectUserId: me, NOT: { actorId: me } },
      orderBy: { createdAt: 'desc' },
      take: 30,
      include: { actor: { select: { name: true, role: true } } },
    });
    res.json({ items: rows.map((a) => subjectHistoryItem(a, config.shortHost)) });
  }),
);
