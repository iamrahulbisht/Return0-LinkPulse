import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma, isUniqueViolation } from '../lib/db';
import { ApiError } from '../lib/errors';
import { h, parse } from '../middleware/errors';
import { clientIp } from '../lib/clientIp';
import { avatarPath } from './profile';
import { clearSessionCookie, requireUser, setSessionCookie, signSession } from '../middleware/auth';

export const MAX_LOGIN_TRIES = 5;
export const LOGIN_LOCK_MINUTES = 5;

const signupSchema = z.object({
  name: z.string().trim().min(1, 'Add your name.').max(80),
  email: z.string().trim().toLowerCase().email('Enter a valid email address.').max(200),
  password: z.string().min(8, 'Use at least 8 characters.').max(200),
});
const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.').max(200),
  password: z.string().min(1, 'Enter your password.').max(200),
});

// Extra guard per IP on top of the per-account lockout.
const authLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  keyGenerator: (req) => clientIp(req),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) =>
    res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many tries from this network. Try again in a minute.' } }),
});

export const authRouter = Router();

authRouter.post(
  '/signup',
  authLimiter,
  h(async (req, res) => {
    const body = parse(signupSchema, req.body);
    const passwordHash = await bcrypt.hash(body.password, 10);
    try {
      const user = await prisma.$transaction(async (tx) => {
        // Signing up also signs you in, so it counts as the first sign-in.
        const u = await tx.user.create({ data: { name: body.name, email: body.email, passwordHash, lastLoginAt: new Date() } });
        const ws = await tx.workspace.create({ data: { name: `${body.name.split(' ')[0]}'s workspace`, ownerId: u.id } });
        await tx.workspaceMember.create({ data: { workspaceId: ws.id, userId: u.id, role: 'owner' } });
        return u;
      });
      setSessionCookie(res, signSession(user.id, user.tokenVersion));
      res.status(201).json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
    } catch (err) {
      if (isUniqueViolation(err, 'email')) {
        throw new ApiError(409, 'EMAIL_TAKEN', 'An account with this email already exists. Sign in instead.', [
          { field: 'email', code: 'EMAIL_TAKEN', message: 'An account with this email already exists.' },
        ]);
      }
      throw err;
    }
  }),
);

authRouter.post(
  '/login',
  authLimiter,
  h(async (req, res) => {
    const body = parse(loginSchema, req.body);
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    const now = new Date();
    if (user?.lockedUntil && user.lockedUntil > now) {
      const mins = Math.ceil((user.lockedUntil.getTime() - now.getTime()) / 60_000);
      throw new ApiError(429, 'LOCKED', `Too many wrong tries. Please wait ${mins} minute${mins === 1 ? '' : 's'} and try again.`);
    }
    const ok = user ? await bcrypt.compare(body.password, user.passwordHash) : false;
    if (!user || !ok) {
      if (user) {
        const tries = user.failedLogins + 1;
        if (tries >= MAX_LOGIN_TRIES) {
          await prisma.user.update({
            where: { id: user.id },
            data: { failedLogins: 0, lockedUntil: new Date(now.getTime() + LOGIN_LOCK_MINUTES * 60_000) },
          });
          throw new ApiError(429, 'LOCKED', `Too many wrong tries. Please wait ${LOGIN_LOCK_MINUTES} minutes and try again.`);
        }
        await prisma.user.update({ where: { id: user.id }, data: { failedLogins: tries } });
        const left = MAX_LOGIN_TRIES - tries;
        throw new ApiError(401, 'INVALID_LOGIN', `Email or password is wrong. ${left} ${left === 1 ? 'try' : 'tries'} left.`);
      }
      // Same message for unknown emails, so nobody can find out who has an account.
      throw new ApiError(401, 'INVALID_LOGIN', 'Email or password is wrong.');
    }
    // Only after the right password: otherwise anyone who knows an email could learn the account exists and why it is suspended.
    if (user.suspendedAt) {
      throw new ApiError(
        403,
        'ACCOUNT_SUSPENDED',
        `Your account is suspended${user.suspendedReason ? `: ${user.suspendedReason}` : ''}. Contact the platform admin.`,
      );
    }
    if (user.mustChangePassword && user.tempPasswordExpiresAt && user.tempPasswordExpiresAt <= now) {
      throw new ApiError(401, 'TEMP_PASSWORD_EXPIRED', 'Your temporary password has expired. Ask the platform admin for a new one.');
    }
    await prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: now } });
    setSessionCookie(res, signSession(user.id, user.tokenVersion));
    res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  }),
);

authRouter.post('/logout', (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

authRouter.get(
  '/me',
  requireUser,
  h(async (req, res) => {
    const u = req.user!;
    const [linkCount, invites, reset] = await Promise.all([
      prisma.link.count({ where: { workspaceId: u.workspaceId } }),
      // Pending invites to my email: the notification badge.
      prisma.workspaceInvite.count({ where: { email: u.email.toLowerCase(), status: 'pending' } }),
      // After an admin reset the app shows only "Set a new password", with the admin's reason.
      u.mustChangePassword
        ? prisma.auditLog.findFirst({
            where: { subjectUserId: u.id, action: 'account_password_reset' },
            orderBy: { createdAt: 'desc' },
            select: { reason: true, createdAt: true },
          })
        : null,
    ]);
    const openFlags =
      u.role === 'admin'
        ? // Same number as the admin 'Needs review' tile: flagged active links, not alert rows.
          (
            await prisma.linkAlert.findMany({
              where: { type: { in: ['spike', 'report', 'blocked', 'bots'] }, dismissedAt: null, link: { status: 'active' } },
              distinct: ['linkId'],
              select: { linkId: true },
            })
          ).length
        : 0;
    res.json({
      user: { id: u.id, name: u.name, email: u.email, role: u.role, avatarPath: avatarPath(u) },
      workspace: { id: u.workspaceId, name: u.workspaceName, role: u.workspaceOwner ? 'owner' : 'member' },
      counts: { links: linkCount, openFlags, invites },
      passwordReset: u.mustChangePassword ? { reason: reset?.reason ?? null, at: reset?.createdAt.toISOString() ?? null } : null,
    });
  }),
);
