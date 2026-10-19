import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../lib/config';
import { prisma } from '../lib/db';
import { ApiError } from '../lib/errors';

export const SESSION_COOKIE = 'lp_session';
const SESSION_DAYS = 7;

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: 'user' | 'admin';
  /** The active workspace: lists, new links, analytics and the live stream use it. */
  workspaceId: string;
  workspaceName: string;
  /** Owner (creator) of the active workspace: may rename it and manage people. */
  workspaceOwner: boolean;
  /** Every workspace the user belongs to. `:id` routes allow a row whose workspace is in this list. */
  workspaceIds: string[];
  tokenVersion: number;
  /** An admin reset the password: only setting a new one is allowed until then (see requireUser). */
  mustChangePassword: boolean;
  createdAt: Date;
  /** null = no photo; otherwise when it last changed (cache-busting for the photo URL). */
  avatarUpdatedAt: Date | null;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: SessionUser;
  }
}

/** `tv` = the user's token version; bumping it in the database signs out every older session. */
export function signSession(userId: string, tokenVersion = 0): string {
  return jwt.sign({ sub: userId, tv: tokenVersion, typ: 'session' }, config.JWT_SECRET, { expiresIn: `${SESSION_DAYS}d` });
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    // The web app calls /api through a same-origin rewrite (Vercel) or proxy (Vite), so Lax works.
    sameSite: 'lax',
    secure: config.isProd,
    maxAge: SESSION_DAYS * 86400_000,
    path: '/',
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

/** A user always has at least one workspace; this creates their own one if they somehow have none. */
async function ensureOwnWorkspace(userId: string, name: string) {
  return prisma.$transaction(async (tx) => {
    const ws = await tx.workspace.create({ data: { name: `${name.split(' ')[0]}'s workspace`, ownerId: userId } });
    await tx.workspaceMember.create({ data: { workspaceId: ws.id, userId, role: 'owner' } });
    return ws;
  });
}

/**
 * The user with their memberships. The active workspace is `users.active_workspace_id` if they are still a
 * member of it (they may have left or been removed), otherwise their oldest membership.
 */
export async function loadSessionUser(userId: string): Promise<SessionUser | null> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      members: { include: { workspace: true }, orderBy: { joinedAt: 'asc' } },
      // Only the timestamp: the photo bytes are never loaded for normal requests.
      avatar: { select: { updatedAt: true } },
    },
  });
  // A suspended account has no valid session, wherever the session is loaded (docs/design/admin-management.md).
  if (!u || u.suspendedAt) return null;
  let workspaces = u.members.map((m) => m.workspace);
  if (!workspaces.length) workspaces = [await ensureOwnWorkspace(u.id, u.name)];
  const ws = workspaces.find((w) => w.id === u.activeWorkspaceId) ?? workspaces[0];
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    workspaceId: ws.id,
    workspaceName: ws.name,
    workspaceOwner: ws.ownerId === u.id,
    workspaceIds: workspaces.map((w) => w.id),
    tokenVersion: u.tokenVersion,
    mustChangePassword: u.mustChangePassword,
    createdAt: u.createdAt,
    avatarUpdatedAt: u.avatar?.updatedAt ?? null,
  };
}

/** True if the signed-in user is a member of this workspace. */
export const inWorkspace = (u: SessionUser, workspaceId: string) => u.workspaceIds.includes(workspaceId);

/**
 * Loads the user on every request from the database (not just from the token),
 * so a role change, a removed user or a removed membership takes effect at once.
 */
async function loadUser(req: Request): Promise<SessionUser | null> {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return null;
  let sub: string;
  let tv: number;
  try {
    const payload = jwt.verify(token, config.JWT_SECRET) as jwt.JwtPayload;
    if (payload.typ !== 'session' || typeof payload.sub !== 'string') return null;
    sub = payload.sub;
    tv = typeof payload.tv === 'number' ? payload.tv : 0;
  } catch {
    return null;
  }
  const u = await loadSessionUser(sub);
  // A session from before "sign out other devices" or a password change is no longer valid.
  if (!u || u.tokenVersion !== tv) return null;
  return u;
}

/** After an admin password reset, the only things a session may do until a new password is set. */
const ALLOWED_DURING_RESET = new Set(['GET /api/auth/me', 'POST /api/me/password']);

export function requireUser(req: Request, _res: Response, next: NextFunction): void {
  loadUser(req)
    .then((u) => {
      if (!u) return next(new ApiError(401, 'NOT_SIGNED_IN', 'Please sign in.'));
      if (u.mustChangePassword && !ALLOWED_DURING_RESET.has(`${req.method} ${req.originalUrl.split('?')[0]}`)) {
        return next(new ApiError(403, 'PASSWORD_CHANGE_REQUIRED', 'Set a new password to continue.'));
      }
      req.user = u;
      next();
    })
    .catch(next);
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) return next(new ApiError(401, 'NOT_SIGNED_IN', 'Please sign in.'));
  if (req.user.role !== 'admin') return next(new ApiError(403, 'FORBIDDEN', 'Only admins can do this.'));
  next();
}

// Short-lived token for the SSE stream, which runs on the API domain (no session cookie there).
// It carries the active workspace: the stream shows live clicks on that workspace's links.
export function signStreamToken(userId: string, role: string, workspaceId: string): string {
  return jwt.sign({ sub: userId, role, ws: workspaceId, typ: 'stream' }, config.JWT_SECRET, { expiresIn: 60 });
}

export function verifyStreamToken(token: string): { userId: string; role: string; workspaceId: string } | null {
  try {
    const p = jwt.verify(token, config.JWT_SECRET) as jwt.JwtPayload;
    if (p.typ !== 'stream' || typeof p.sub !== 'string' || typeof p.ws !== 'string') return null;
    return { userId: p.sub, role: String(p.role ?? 'user'), workspaceId: p.ws };
  } catch {
    return null;
  }
}
