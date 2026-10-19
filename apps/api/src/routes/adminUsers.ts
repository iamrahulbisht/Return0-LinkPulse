import { Router, type Request } from 'express';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/db';
import { ApiError, notFound } from '../lib/errors';
import { h, parse } from '../middleware/errors';
import { writeAudit } from '../lib/audit';
import { subjectHistoryItem } from '../lib/auditText';
import { config } from '../lib/config';
import { linkDto, linkInclude } from '../lib/serialize';
import { TEMP_PASSWORD_HOURS, accountStatus, generateTempPassword } from '../logic/account';
import { statusWhere } from './links';

// Admin user management (docs/design/admin-management.md): find a user, see their account and links (milestone 1),
// suspend / reactivate / unlock / sign out with a reason (milestone 2), and reset the password (milestone 3).
// Mounted inside adminRouter, so every route here already ran requireUser + requireAdmin (see app.ts).
export const adminUsersRouter = Router();

const uuid = z.string().uuid();
const ACCOUNT_STATUSES = ['all', 'active', 'suspended', 'locked'] as const;
const LINK_STATUSES = ['all', 'active', 'limit_reached', 'expired', 'disabled'] as const;

const listSchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(ACCOUNT_STATUSES).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

const linksSchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(LINK_STATUSES).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

/**
 * Search text for Prisma `contains`, which becomes ILIKE without escaping: a typed % or _ would match anything.
 * Backslash is Postgres' default LIKE escape, so escaping these three makes the search literal.
 */
const literal = (s: string) => s.replace(/[\\%_]/g, '\\$&');

/** Account status as a query filter. Same order as accountStatus(): suspended beats locked. */
function accountWhere(status: (typeof ACCOUNT_STATUSES)[number], now: Date): Prisma.UserWhereInput {
  switch (status) {
    case 'suspended':
      return { suspendedAt: { not: null } };
    case 'locked':
      return { suspendedAt: null, lockedUntil: { gt: now } };
    case 'active':
      return { suspendedAt: null, OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }] };
    default:
      return {};
  }
}

async function loadUserOr404(id: string) {
  if (!uuid.safeParse(id).success) throw notFound('That user');
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
      lastLoginAt: true,
      suspendedAt: true,
      suspendedReason: true,
      lockedUntil: true,
      mustChangePassword: true,
    },
  });
  if (!user) throw notFound('That user');
  return user;
}

/** Search by name or email, filter by account status. Newest accounts first. */
adminUsersRouter.get(
  '/',
  h(async (req, res) => {
    const q = parse(listSchema, req.query);
    const now = new Date();
    const text = q.q ? literal(q.q) : '';
    const search: Prisma.UserWhereInput = text
      ? { OR: [{ name: { contains: text, mode: 'insensitive' } }, { email: { contains: text, mode: 'insensitive' } }] }
      : {};
    const where: Prisma.UserWhereInput = { AND: [search, accountWhere(q.status, now)] };
    const [rows, total, ...counts] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
          lastLoginAt: true,
          suspendedAt: true,
          lockedUntil: true,
          mustChangePassword: true,
          _count: { select: { links: true, members: true } },
        },
      }),
      prisma.user.count({ where }),
      ...ACCOUNT_STATUSES.map((s) => prisma.user.count({ where: { AND: [search, accountWhere(s, now)] } })),
    ]);
    res.json({
      items: rows.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        status: accountStatus(u, now),
        createdAt: u.createdAt.toISOString(),
        lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
        links: u._count.links,
        workspaces: u._count.members,
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
      counts: Object.fromEntries(ACCOUNT_STATUSES.map((s, i) => [s, counts[i]])),
    });
  }),
);

/** One user: account, workspaces, link counts and the admin actions taken on the account. */
adminUsersRouter.get(
  '/:id',
  h(async (req, res) => {
    const u = await loadUserOr404(req.params.id);
    const now = new Date();
    const [memberships, linkCounts, history] = await Promise.all([
      prisma.workspaceMember.findMany({
        where: { userId: u.id },
        orderBy: { joinedAt: 'asc' },
        include: { workspace: { select: { id: true, name: true, ownerId: true, _count: { select: { members: true, links: true } } } } },
      }),
      Promise.all(LINK_STATUSES.map((s) => prisma.link.count({ where: { AND: [{ ownerId: u.id }, statusWhere(s, now)] } }))),
      prisma.auditLog.findMany({
        where: { subjectUserId: u.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { actor: { select: { name: true, role: true } } },
      }),
    ]);
    res.json({
      user: {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        status: accountStatus(u, now),
        suspendedReason: u.suspendedReason,
        lockedUntil: u.lockedUntil && u.lockedUntil > now ? u.lockedUntil.toISOString() : null,
        createdAt: u.createdAt.toISOString(),
        lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      },
      workspaces: memberships.map((m) => ({
        id: m.workspace.id,
        name: m.workspace.name,
        role: m.role,
        isOwner: m.workspace.ownerId === u.id,
        members: m.workspace._count.members,
        links: m.workspace._count.links,
        joinedAt: m.joinedAt.toISOString(),
      })),
      links: Object.fromEntries(LINK_STATUSES.map((s, i) => [s, linkCounts[i]])),
      history: history.map((a) => subjectHistoryItem(a, config.shortHost)),
    });
  }),
);

/** Links the user created (owner_id), across every workspace they are in. Opens on the normal link page. */
adminUsersRouter.get(
  '/:id/links',
  h(async (req, res) => {
    const u = await loadUserOr404(req.params.id);
    const q = parse(linksSchema, req.query);
    const now = new Date();
    const filters: Prisma.LinkWhereInput[] = [{ ownerId: u.id }];
    if (q.q) {
      const text = literal(q.q);
      filters.push({
        OR: [
          { code: { contains: text, mode: 'insensitive' } },
          { destination: { contains: text, mode: 'insensitive' } },
          { title: { contains: text, mode: 'insensitive' } },
        ],
      });
    }
    const where: Prisma.LinkWhereInput = { AND: [...filters, statusWhere(q.status, now)] };
    const [items, total] = await Promise.all([
      prisma.link.findMany({
        where,
        include: { ...linkInclude, workspace: { select: { id: true, name: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      prisma.link.count({ where }),
    ]);
    res.json({
      items: items.map((l) => ({ ...linkDto(l, now), workspace: l.workspace })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    });
  }),
);

// ---- Account actions (milestone 2). Every one needs a reason, is audited, and takes effect on the user's next request.

const reasonSchema = z.object({
  reason: z.string().trim().min(5, 'Write a reason of at least 5 characters.').max(300, 'Keep the reason under 300 characters.'),
});

type Target = Awaited<ReturnType<typeof loadUserOr404>>;

/**
 * Admins act on `user` accounts only. There is no role hierarchy, so two admins could otherwise lock each
 * other out, or the last admin could suspend themself (design decision 4). Admin accounts stay managed by seed/DB.
 */
async function loadTarget(adminId: string, id: string): Promise<Target> {
  const u = await loadUserOr404(id);
  if (u.id === adminId) throw new ApiError(403, 'SELF_TARGET', 'You can’t do this to your own account.');
  if (u.role === 'admin') throw new ApiError(403, 'ADMIN_TARGET', 'Admin accounts can’t be changed here.');
  return u;
}

/**
 * Runs one account action: a conditional update (so two admins clicking at once give one change and one 409)
 * and its audit row, in one transaction.
 */
async function accountAction(
  req: Request,
  opts: {
    action: string;
    /** Only update while this still holds (e.g. "not suspended yet"); otherwise `conflict` is thrown. */
    when: (now: Date) => Prisma.UserWhereInput;
    data: (reason: string, now: Date) => Prisma.UserUpdateManyMutationInput;
    conflict: ApiError;
  },
) {
  const { reason } = parse(reasonSchema, req.body);
  const u = await loadTarget(req.user!.id, req.params.id);
  const now = new Date();
  const before = accountStatus(u, now);
  const status = await prisma.$transaction(async (tx) => {
    const r = await tx.user.updateMany({ where: { AND: [{ id: u.id }, opts.when(now)] }, data: opts.data(reason, now) });
    if (r.count === 0) throw opts.conflict;
    const fresh = await tx.user.findUniqueOrThrow({ where: { id: u.id }, select: { suspendedAt: true, lockedUntil: true, mustChangePassword: true } });
    const after = accountStatus(fresh, now);
    await writeAudit(
      {
        actorId: req.user!.id,
        subjectUserId: u.id,
        action: opts.action,
        target: u.email,
        oldValue: { status: before },
        newValue: { status: after },
        reason,
      },
      tx,
    );
    return after;
  });
  return { ok: true as const, status };
}

/** Suspend: cannot sign in, and every session ends at once (token_version + 1). Their links keep working. */
adminUsersRouter.post(
  '/:id/suspend',
  h(async (req, res) => {
    res.json(
      await accountAction(req, {
        action: 'account_suspended',
        when: () => ({ suspendedAt: null }),
        data: (reason, now) => ({ suspendedAt: now, suspendedReason: reason, tokenVersion: { increment: 1 } }),
        conflict: new ApiError(409, 'ALREADY_SUSPENDED', 'This account is already suspended.'),
      }),
    );
  }),
);

adminUsersRouter.post(
  '/:id/reactivate',
  h(async (req, res) => {
    res.json(
      await accountAction(req, {
        action: 'account_reactivated',
        when: () => ({ suspendedAt: { not: null } }),
        data: () => ({ suspendedAt: null, suspendedReason: null }),
        conflict: new ApiError(409, 'NOT_SUSPENDED', 'This account is not suspended.'),
      }),
    );
  }),
);

/** Clears the lock after 5 wrong passwords, so the user can try again now instead of in 5 minutes. */
adminUsersRouter.post(
  '/:id/unlock',
  h(async (req, res) => {
    res.json(
      await accountAction(req, {
        action: 'account_unlocked',
        when: (now) => ({ lockedUntil: { gt: now } }),
        data: () => ({ failedLogins: 0, lockedUntil: null }),
        conflict: new ApiError(409, 'NOT_LOCKED', 'This account is not locked.'),
      }),
    );
  }),
);

/** Ends every session on every device (same mechanism as the user's own "sign out other devices"). */
adminUsersRouter.post(
  '/:id/sign-out',
  h(async (req, res) => {
    res.json(
      await accountAction(req, {
        action: 'account_signed_out',
        when: () => ({}),
        data: () => ({ tokenVersion: { increment: 1 } }),
        conflict: new ApiError(404, 'NOT_FOUND', 'That user was not found.'),
      }),
    );
  }),
);

/**
 * Reset password: a new temporary password, shown to the admin once in this response and never stored in plain
 * text or written to the audit log. Every session ends; at the next sign-in the user must choose their own
 * password before doing anything else (requireUser). It stops working after TEMP_PASSWORD_HOURS.
 * A suspended account is refused: the temporary password would be useless until it is reactivated anyway.
 */
adminUsersRouter.post(
  '/:id/reset-password',
  h(async (req, res) => {
    const { reason } = parse(reasonSchema, req.body);
    const u = await loadTarget(req.user!.id, req.params.id);
    if (u.suspendedAt) throw new ApiError(409, 'ACCOUNT_SUSPENDED', 'Reactivate the account before resetting its password.');
    const temporaryPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, 10);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + TEMP_PASSWORD_HOURS * 3600_000);
    await prisma.$transaction(async (tx) => {
      // Conditional, so a suspension that lands in between wins and this reset is refused.
      const r = await tx.user.updateMany({
        where: { id: u.id, suspendedAt: null },
        data: {
          passwordHash,
          mustChangePassword: true,
          tempPasswordExpiresAt: expiresAt,
          tokenVersion: { increment: 1 },
          failedLogins: 0,
          lockedUntil: null,
        },
      });
      if (r.count === 0) throw new ApiError(409, 'ACCOUNT_SUSPENDED', 'Reactivate the account before resetting its password.');
      await writeAudit(
        {
          actorId: req.user!.id,
          subjectUserId: u.id,
          action: 'account_password_reset',
          target: u.email,
          oldValue: { status: accountStatus(u, now) },
          newValue: { status: 'password_reset', expiresAt: expiresAt.toISOString() },
          reason,
        },
        tx,
      );
    });
    // The one place the temporary password exists in plain text: never cache this response.
    res.set('Cache-Control', 'no-store');
    res.json({ ok: true, status: 'password_reset', temporaryPassword, expiresAt: expiresAt.toISOString() });
  }),
);
