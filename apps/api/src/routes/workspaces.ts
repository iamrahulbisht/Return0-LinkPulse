import { Router, type Request } from 'express';
import type { Prisma } from '@prisma/client';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma, isUniqueViolation } from '../lib/db';
import { ApiError, forbidden, notFound } from '../lib/errors';
import { h, parse } from '../middleware/errors';
import type { SessionUser } from '../middleware/auth';

// Everything here runs after requireUser. Members can work in a workspace; only its owner (the creator)
// renames it and manages people. See docs/design/workspaces.md.
export const workspacesRouter = Router();
/** Invitations addressed to the signed-in user's email (the notifications). */
export const invitesRouter = Router();

export const MAX_OWNED_WORKSPACES = 20;
/** Members plus open invites. */
export const MAX_WORKSPACE_PEOPLE = 50;

const uuid = z.string().uuid();
const nameSchema = z.string().trim().min(1, 'Give the workspace a name.').max(80, 'Use 80 characters or fewer.');
const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address.').max(200);

// 20 invites per hour per user: enough for a team, too few to spam people.
const inviteLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: 20,
  keyGenerator: (req) => (req as Request).user!.id,
  skipFailedRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) =>
    res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many invites in the last hour. Try again later.' } }),
});

const ownerOnly = () => new ApiError(403, 'OWNER_ONLY', 'Only the workspace owner can do this.');

/** The workspace, if the user is a member (403 otherwise, like every other :id route). */
async function loadMemberWorkspace(user: SessionUser, id: string) {
  if (!uuid.safeParse(id).success) throw notFound('That workspace');
  const ws = await prisma.workspace.findUnique({ where: { id } });
  if (!ws) throw notFound('That workspace');
  if (!user.workspaceIds.includes(ws.id)) throw forbidden();
  return ws;
}

async function loadOwnedWorkspace(user: SessionUser, id: string) {
  const ws = await loadMemberWorkspace(user, id);
  if (ws.ownerId !== user.id) throw ownerOnly();
  return ws;
}

function workspaceDto(
  w: { id: string; name: string; ownerId: string; owner: { name: string }; _count: { members: number } },
  user: SessionUser,
  activeId: string,
) {
  return {
    id: w.id,
    name: w.name,
    role: w.ownerId === user.id ? ('owner' as const) : ('member' as const),
    ownerName: w.owner.name,
    members: w._count.members,
    isActive: w.id === activeId,
  };
}

const workspaceInclude = { owner: { select: { name: true } }, _count: { select: { members: true } } } as const;

/** If a user's active workspace is the one they just lost, clear it (they fall back to their first one). */
async function clearActive(userId: string, workspaceId: string, tx: Prisma.TransactionClient | typeof prisma = prisma) {
  await tx.user.updateMany({ where: { id: userId, activeWorkspaceId: workspaceId }, data: { activeWorkspaceId: null } });
}

workspacesRouter.get(
  '/',
  h(async (req, res) => {
    const u = req.user!;
    const rows = await prisma.workspaceMember.findMany({
      where: { userId: u.id },
      include: { workspace: { include: workspaceInclude } },
      orderBy: { joinedAt: 'asc' },
    });
    res.json({ items: rows.map((m) => workspaceDto(m.workspace, u, u.workspaceId)) });
  }),
);

workspacesRouter.post(
  '/',
  h(async (req, res) => {
    const u = req.user!;
    const { name } = parse(z.object({ name: nameSchema }), req.body);
    const owned = await prisma.workspace.count({ where: { ownerId: u.id } });
    if (owned >= MAX_OWNED_WORKSPACES) {
      throw new ApiError(400, 'WORKSPACE_LIMIT', `You can own up to ${MAX_OWNED_WORKSPACES} workspaces.`);
    }
    const ws = await prisma.$transaction(async (tx) => {
      const w = await tx.workspace.create({ data: { name, ownerId: u.id } });
      await tx.workspaceMember.create({ data: { workspaceId: w.id, userId: u.id, role: 'owner' } });
      // A new workspace is where you want to be next.
      await tx.user.update({ where: { id: u.id }, data: { activeWorkspaceId: w.id } });
      return tx.workspace.findUniqueOrThrow({ where: { id: w.id }, include: workspaceInclude });
    });
    res.status(201).json({ workspace: workspaceDto(ws, u, ws.id) });
  }),
);

workspacesRouter.post(
  '/:id/switch',
  h(async (req, res) => {
    const u = req.user!;
    const ws = await loadMemberWorkspace(u, req.params.id);
    await prisma.user.update({ where: { id: u.id }, data: { activeWorkspaceId: ws.id } });
    const full = await prisma.workspace.findUniqueOrThrow({ where: { id: ws.id }, include: workspaceInclude });
    res.json({ workspace: workspaceDto(full, u, ws.id) });
  }),
);

workspacesRouter.patch(
  '/:id',
  h(async (req, res) => {
    const u = req.user!;
    const ws = await loadOwnedWorkspace(u, req.params.id);
    const { name } = parse(z.object({ name: nameSchema }), req.body);
    const full = await prisma.workspace.update({ where: { id: ws.id }, data: { name }, include: workspaceInclude });
    res.json({ workspace: workspaceDto(full, u, u.workspaceId) });
  }),
);

/** Members (everyone in it can see who else is). Open invites only for the owner, who manages them. */
workspacesRouter.get(
  '/:id/members',
  h(async (req, res) => {
    const u = req.user!;
    const ws = await loadMemberWorkspace(u, req.params.id);
    const isOwner = ws.ownerId === u.id;
    const [members, invites] = await Promise.all([
      prisma.workspaceMember.findMany({
        where: { workspaceId: ws.id },
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { joinedAt: 'asc' },
      }),
      isOwner
        ? prisma.workspaceInvite.findMany({
            where: { workspaceId: ws.id, status: 'pending' },
            include: { inviter: { select: { name: true } } },
            orderBy: { createdAt: 'desc' },
          })
        : Promise.resolve([]),
    ]);
    res.json({
      workspace: { id: ws.id, name: ws.name, isOwner },
      members: members.map((m) => ({
        userId: m.user.id,
        name: m.user.name,
        email: m.user.email,
        // The creator is always the owner, whatever the row says.
        role: m.user.id === ws.ownerId ? 'owner' : 'member',
        joinedAt: m.joinedAt.toISOString(),
        isYou: m.user.id === u.id,
      })),
      invites: invites.map((i) => ({ id: i.id, email: i.email, invitedBy: i.inviter.name, createdAt: i.createdAt.toISOString() })),
    });
  }),
);

/**
 * Invite by email. The invite waits for whoever has (or later signs up with) that email, so the answer never
 * says whether an account exists. Inviting again after a decline, cancel or removal re-opens the same row.
 */
workspacesRouter.post(
  '/:id/invites',
  inviteLimiter,
  h(async (req, res) => {
    const u = req.user!;
    const ws = await loadOwnedWorkspace(u, req.params.id);
    const { email } = parse(z.object({ email: emailSchema }), req.body);
    const fieldError = (status: number, code: string, message: string) =>
      new ApiError(status, code, message, [{ field: 'email', code, message }]);
    if (email === u.email.toLowerCase()) throw fieldError(400, 'SELF_INVITE', 'You are already in this workspace.');
    const member = await prisma.workspaceMember.findFirst({ where: { workspaceId: ws.id, user: { email } } });
    if (member) throw fieldError(409, 'ALREADY_MEMBER', 'This person is already a member.');
    const [members, pending] = await Promise.all([
      prisma.workspaceMember.count({ where: { workspaceId: ws.id } }),
      prisma.workspaceInvite.count({ where: { workspaceId: ws.id, status: 'pending' } }),
    ]);
    if (members + pending >= MAX_WORKSPACE_PEOPLE) {
      throw fieldError(400, 'WORKSPACE_FULL', `A workspace can have up to ${MAX_WORKSPACE_PEOPLE} people, invites included.`);
    }
    const pendingMsg = 'This person already has an invite waiting.';
    const existing = await prisma.workspaceInvite.findUnique({ where: { workspaceId_email: { workspaceId: ws.id, email } } });
    let invite;
    if (existing) {
      // Only a closed invite can be re-opened; the WHERE makes two parallel re-invites safe.
      const r = await prisma.workspaceInvite.updateMany({
        where: { id: existing.id, status: { not: 'pending' } },
        data: { status: 'pending', invitedBy: u.id, createdAt: new Date(), respondedAt: null },
      });
      if (r.count === 0) throw fieldError(409, 'INVITE_PENDING', pendingMsg);
      invite = await prisma.workspaceInvite.findUniqueOrThrow({ where: { id: existing.id } });
    } else {
      try {
        invite = await prisma.workspaceInvite.create({ data: { workspaceId: ws.id, email, invitedBy: u.id } });
      } catch (err) {
        if (isUniqueViolation(err)) throw fieldError(409, 'INVITE_PENDING', pendingMsg);
        throw err;
      }
    }
    res.status(201).json({ invite: { id: invite.id, email: invite.email, invitedBy: u.name, createdAt: invite.createdAt.toISOString() } });
  }),
);

workspacesRouter.delete(
  '/:id/invites/:inviteId',
  h(async (req, res) => {
    const ws = await loadOwnedWorkspace(req.user!, req.params.id);
    if (!uuid.safeParse(req.params.inviteId).success) throw notFound('That invite');
    const r = await prisma.workspaceInvite.updateMany({
      where: { id: req.params.inviteId, workspaceId: ws.id, status: 'pending' },
      data: { status: 'cancelled', respondedAt: new Date() },
    });
    if (r.count === 0) throw notFound('That invite');
    res.json({ ok: true });
  }),
);

/** The owner removes a member. Links they made stay in the workspace (links are never deleted). */
workspacesRouter.delete(
  '/:id/members/:userId',
  h(async (req, res) => {
    const ws = await loadOwnedWorkspace(req.user!, req.params.id);
    const target = req.params.userId;
    if (!uuid.safeParse(target).success) throw notFound('That member');
    if (target === ws.ownerId) throw new ApiError(400, 'CANNOT_REMOVE_OWNER', 'The owner cannot be removed.');
    const removed = await prisma.$transaction(async (tx) => {
      const r = await tx.workspaceMember.deleteMany({ where: { workspaceId: ws.id, userId: target } });
      if (r.count) await clearActive(target, ws.id, tx);
      return r.count;
    });
    if (!removed) throw notFound('That member');
    res.json({ ok: true });
  }),
);

workspacesRouter.post(
  '/:id/leave',
  h(async (req, res) => {
    const u = req.user!;
    const ws = await loadMemberWorkspace(u, req.params.id);
    if (ws.ownerId === u.id) {
      throw new ApiError(400, 'OWNER_CANNOT_LEAVE', 'You created this workspace, so you cannot leave it.');
    }
    await prisma.$transaction(async (tx) => {
      await tx.workspaceMember.deleteMany({ where: { workspaceId: ws.id, userId: u.id } });
      await clearActive(u.id, ws.id, tx);
    });
    res.json({ ok: true });
  }),
);

invitesRouter.get(
  '/',
  h(async (req, res) => {
    const u = req.user!;
    const rows = await prisma.workspaceInvite.findMany({
      where: { email: u.email.toLowerCase(), status: 'pending' },
      include: { workspace: { include: workspaceInclude }, inviter: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({
      items: rows.map((i) => ({
        id: i.id,
        workspace: { id: i.workspace.id, name: i.workspace.name, ownerName: i.workspace.owner.name, members: i.workspace._count.members },
        invitedBy: i.inviter.name,
        createdAt: i.createdAt.toISOString(),
      })),
    });
  }),
);

/** Only the invited email can answer, and only once: the status check is inside the UPDATE. */
async function answerInvite(user: SessionUser, inviteId: string, accept: boolean) {
  if (!uuid.safeParse(inviteId).success) throw notFound('That invite');
  return prisma.$transaction(async (tx) => {
    const r = await tx.workspaceInvite.updateMany({
      where: { id: inviteId, email: user.email.toLowerCase(), status: 'pending' },
      data: { status: accept ? 'accepted' : 'declined', respondedAt: new Date() },
    });
    // Someone else's invite looks the same as a missing one.
    if (r.count === 0) throw notFound('That invite');
    const invite = await tx.workspaceInvite.findUniqueOrThrow({ where: { id: inviteId } });
    if (accept) {
      await tx.workspaceMember.upsert({
        where: { workspaceId_userId: { workspaceId: invite.workspaceId, userId: user.id } },
        create: { workspaceId: invite.workspaceId, userId: user.id, role: 'member' },
        update: {},
      });
      await tx.user.update({ where: { id: user.id }, data: { activeWorkspaceId: invite.workspaceId } });
    }
    return invite;
  });
}

invitesRouter.post(
  '/:id/accept',
  h(async (req, res) => {
    const invite = await answerInvite(req.user!, req.params.id, true);
    const ws = await prisma.workspace.findUniqueOrThrow({ where: { id: invite.workspaceId }, include: workspaceInclude });
    res.json({ workspace: workspaceDto(ws, req.user!, ws.id) });
  }),
);

invitesRouter.post(
  '/:id/decline',
  h(async (req, res) => {
    await answerInvite(req.user!, req.params.id, false);
    res.json({ ok: true });
  }),
);
