import http from 'http';
import request from 'supertest';
import { prisma } from '../../src/lib/db';
import { loginAs, makeUser, startTestApp, stopTestApp } from '../helpers';

let srv: http.Server;
let admin: Awaited<ReturnType<typeof loginAs>>;
let alice: Awaited<ReturnType<typeof loginAs>>;
let aliceId: string;
let bobId: string;
let aliceLinkInBobWs: string;

beforeAll(async () => {
  srv = await startTestApp();
  await makeUser('root@test.dev', 'admin');
  const a = await makeUser('alice@test.dev');
  const b = await makeUser('bob@school.dev');
  await makeUser('carol@school.dev');
  aliceId = a.id;
  bobId = b.id;
  admin = await loginAs(srv, 'root@test.dev');
  alice = await loginAs(srv, 'alice@test.dev');

  // Alice: one active and one expired link in her own workspace, and one in Bob's shared workspace.
  await alice.post('/api/links').send({ destination: 'https://alice.example.com/one', alias: 'alice-one' }).expect(201);
  const old = await alice.post('/api/links').send({ destination: 'https://alice.example.com/old', alias: 'alice-old' }).expect(201);
  await prisma.link.update({ where: { id: old.body.link.id }, data: { expiresAt: new Date(Date.now() - 60_000) } });
  await prisma.workspaceMember.create({ data: { workspaceId: b.workspaceId, userId: a.id, role: 'member' } });
  const shared = await prisma.link.create({
    data: { code: 'alice-shared', destination: 'https://shared.example.com', ownerId: a.id, workspaceId: b.workspaceId },
  });
  aliceLinkInBobWs = shared.id;
  await prisma.link.create({ data: { code: 'bob-own', destination: 'https://bob.example.com', ownerId: b.id, workspaceId: b.workspaceId } });

  // Bob is suspended, Carol is locked out after wrong passwords.
  await prisma.user.update({ where: { id: b.id }, data: { suspendedAt: new Date(), suspendedReason: 'Spam links' } });
  await prisma.user.update({ where: { email: 'carol@school.dev' }, data: { lockedUntil: new Date(Date.now() + 5 * 60_000) } });
});
afterAll(stopTestApp);

describe('admin user management: access', () => {
  it('needs a session, and a normal user gets 403 on every route', async () => {
    for (const path of ['/api/admin/users', `/api/admin/users/${aliceId}`, `/api/admin/users/${aliceId}/links`]) {
      expect((await request(srv).get(path)).status).toBe(401);
      expect((await alice.get(path)).status).toBe(403);
    }
  });
  it('unknown or malformed user id → 404', async () => {
    expect((await admin.get('/api/admin/users/00000000-0000-4000-8000-000000000000')).status).toBe(404);
    expect((await admin.get('/api/admin/users/not-a-uuid/links')).status).toBe(404);
  });
});

describe('admin user management: search', () => {
  it('finds users by part of the name or email, ignoring case', async () => {
    const byName = await admin.get('/api/admin/users?q=ALI');
    expect(byName.status).toBe(200);
    expect(byName.body.items.map((u: { email: string }) => u.email)).toEqual(['alice@test.dev']);
    const byDomain = await admin.get('/api/admin/users?q=school.dev');
    expect(byDomain.body.items.map((u: { email: string }) => u.email).sort()).toEqual(['bob@school.dev', 'carol@school.dev']);
  });
  it('shows status, link and workspace counts, and the last sign-in', async () => {
    const r = await admin.get('/api/admin/users?q=alice');
    expect(r.body.items[0]).toMatchObject({ name: 'alice', role: 'user', status: 'active', links: 3, workspaces: 2 });
    expect(r.body.items[0].lastLoginAt).not.toBeNull(); // set by loginAs
    expect(r.body.items[0]).not.toHaveProperty('passwordHash');
  });
  it('filters by account status, with counts for every filter', async () => {
    const all = await admin.get('/api/admin/users');
    expect(all.body.counts).toEqual({ all: 4, active: 2, suspended: 1, locked: 1 });
    const sus = await admin.get('/api/admin/users?status=suspended');
    expect(sus.body.items.map((u: { email: string; status: string }) => [u.email, u.status])).toEqual([['bob@school.dev', 'suspended']]);
    const locked = await admin.get('/api/admin/users?status=locked');
    expect(locked.body.items.map((u: { status: string }) => u.status)).toEqual(['locked']);
  });
  it('pages through results', async () => {
    const p1 = await admin.get('/api/admin/users?pageSize=3&page=1');
    const p2 = await admin.get('/api/admin/users?pageSize=3&page=2');
    expect(p1.body.total).toBe(4);
    expect(p1.body.items).toHaveLength(3);
    expect(p2.body.items).toHaveLength(1);
    const ids = [...p1.body.items, ...p2.body.items].map((u: { id: string }) => u.id);
    expect(new Set(ids).size).toBe(4);
  });
  it('treats % and _ as plain characters, not wildcards', async () => {
    expect((await admin.get('/api/admin/users?q=%25')).body.total).toBe(0);
    expect((await admin.get('/api/admin/users?q=_')).body.total).toBe(0);
    expect((await admin.get(`/api/admin/users/${aliceId}/links?q=%25`)).body.total).toBe(0);
    // A real underscore still matches only itself.
    await prisma.user.update({ where: { email: 'carol@school.dev' }, data: { name: 'carol_k' } });
    const r = await admin.get('/api/admin/users?q=carol_k');
    expect(r.body.items.map((u: { email: string }) => u.email)).toEqual(['carol@school.dev']);
  });
  it('rejects bad filters', async () => {
    expect((await admin.get('/api/admin/users?status=deleted')).status).toBe(400);
    expect((await admin.get('/api/admin/users?pageSize=500')).status).toBe(400);
  });
});

describe('admin user management: one user', () => {
  it('shows the account, every workspace they are in, and link counts by status', async () => {
    const r = await admin.get(`/api/admin/users/${aliceId}`);
    expect(r.status).toBe(200);
    expect(r.body.user).toMatchObject({ email: 'alice@test.dev', status: 'active', suspendedReason: null });
    expect(r.body.workspaces.map((w: { name: string; role: string; isOwner: boolean }) => [w.name, w.role, w.isOwner])).toEqual([
      ['alice ws', 'owner', true],
      ['bob ws', 'member', false],
    ]);
    expect(r.body.links).toEqual({ all: 3, active: 2, limit_reached: 0, expired: 1, disabled: 0 });
  });
  it('shows the suspension reason', async () => {
    const r = await admin.get(`/api/admin/users/${bobId}`);
    expect(r.body.user).toMatchObject({ status: 'suspended', suspendedReason: 'Spam links' });
  });
  it('account history lists audit rows about this user, newest first', async () => {
    const adminRow = await prisma.user.findUniqueOrThrow({ where: { email: 'root@test.dev' } });
    await prisma.auditLog.create({
      data: { actorId: adminRow.id, subjectUserId: bobId, action: 'account_suspended', target: 'bob@school.dev', reason: 'Spam links' },
    });
    const r = await admin.get(`/api/admin/users/${bobId}`);
    expect(r.body.history).toHaveLength(1);
    expect(r.body.history[0]).toMatchObject({ actor: 'Platform admin', reason: 'Spam links' });
    expect((await admin.get(`/api/admin/users/${aliceId}`)).body.history).toHaveLength(0);
  });
});

describe("admin user management: a user's links", () => {
  it('lists the links they created in every workspace, with the workspace name', async () => {
    const r = await admin.get(`/api/admin/users/${aliceId}/links`);
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(3);
    const byCode = Object.fromEntries(r.body.items.map((l: { code: string; workspace: { name: string } }) => [l.code, l.workspace.name]));
    expect(byCode).toEqual({ 'alice-one': 'alice ws', 'alice-old': 'alice ws', 'alice-shared': 'bob ws' });
    // Bob's own link in the same shared workspace is Bob's, not Alice's.
    expect(Object.keys(byCode)).not.toContain('bob-own');
  });
  it('filters by status and search text', async () => {
    const expired = await admin.get(`/api/admin/users/${aliceId}/links?status=expired`);
    expect(expired.body.items.map((l: { code: string; status: string }) => [l.code, l.status])).toEqual([['alice-old', 'expired']]);
    const q = await admin.get(`/api/admin/users/${aliceId}/links?q=shared.example`);
    expect(q.body.items.map((l: { code: string }) => l.code)).toEqual(['alice-shared']);
  });
  it('the admin can open one of them on the normal link page (existing admin access)', async () => {
    const r = await admin.get(`/api/links/${aliceLinkInBobWs}`);
    expect(r.status).toBe(200);
    expect(r.body.link.code).toBe('alice-shared');
  });
});
