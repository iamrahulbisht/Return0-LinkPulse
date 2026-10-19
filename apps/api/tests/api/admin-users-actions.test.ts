import http from 'http';
import request from 'supertest';
import { prisma } from '../../src/lib/db';
import { HUMAN_UA, PASSWORD, loginAs, makeUser, nextIp, startTestApp, stopTestApp } from '../helpers';

let srv: http.Server;
let admin: Awaited<ReturnType<typeof loginAs>>;
let adminId: string;
let otherAdminId: string;
const ids: Record<string, string> = {};

const login = (email: string, password = PASSWORD) =>
  request(srv).post('/api/auth/login').set('X-Forwarded-For', nextIp()).send({ email, password });
// reason: null sends no reason at all (undefined would fall back to the default).
const act = (id: string, action: string, reason: string | null = 'Reported for spam links') =>
  admin.post(`/api/admin/users/${id}/${action}`).send(reason === null ? {} : { reason });
const accountAudit = (id: string) => prisma.auditLog.findMany({ where: { subjectUserId: id }, orderBy: { createdAt: 'asc' } });

beforeAll(async () => {
  srv = await startTestApp();
  adminId = (await makeUser('root@test.dev', 'admin')).id;
  otherAdminId = (await makeUser('root2@test.dev', 'admin')).id;
  for (const name of ['sam', 'lee', 'kim', 'ana', 'raj']) ids[name] = (await makeUser(`${name}@test.dev`)).id;
  admin = await loginAs(srv, 'root@test.dev');
});
afterAll(stopTestApp);

describe('account actions: who can do what', () => {
  it('a normal user gets 403, and nobody signed out gets in', async () => {
    const sam = await loginAs(srv, 'sam@test.dev');
    for (const action of ['suspend', 'reactivate', 'unlock', 'sign-out']) {
      expect((await sam.post(`/api/admin/users/${ids.lee}/${action}`).send({ reason: 'Trying to abuse' })).status).toBe(403);
      expect((await request(srv).post(`/api/admin/users/${ids.lee}/${action}`).send({ reason: 'Trying to abuse' })).status).toBe(401);
    }
  });
  it('an admin cannot act on their own account or on another admin', async () => {
    const self = await act(adminId, 'suspend');
    expect(self.status).toBe(403);
    expect(self.body.error.code).toBe('SELF_TARGET');
    const other = await act(otherAdminId, 'sign-out');
    expect(other.status).toBe(403);
    expect(other.body.error.code).toBe('ADMIN_TARGET');
  });
  it('needs a reason of at least 5 characters', async () => {
    expect((await act(ids.lee, 'suspend', null)).status).toBe(400);
    expect((await act(ids.lee, 'suspend', '   ok ')).status).toBe(400);
    expect((await accountAudit(ids.lee)).length).toBe(0);
  });
});

describe('suspend and reactivate', () => {
  it('ends the session at once; sign-in shows the reason only with the right password; links keep working', async () => {
    const lee = await loginAs(srv, 'lee@test.dev');
    const link = await lee.post('/api/links').send({ destination: 'https://lee.example.com', alias: 'lee-poster' }).expect(201);
    await lee.get('/api/auth/me').expect(200);

    const r = await act(ids.lee, 'suspend', 'Phishing pages reported by students');
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('suspended');

    expect((await lee.get('/api/auth/me')).status).toBe(401); // the old session is dead on the next request
    const right = await login('lee@test.dev');
    expect(right.status).toBe(403);
    expect(right.body.error.code).toBe('ACCOUNT_SUSPENDED');
    expect(right.body.error.message).toContain('Phishing pages reported by students');
    const wrong = await login('lee@test.dev', 'not-the-password');
    expect(wrong.status).toBe(401);
    expect(JSON.stringify(wrong.body)).not.toContain('Phishing'); // no reason, no hint the account is suspended

    const visit = await request(srv).get('/lee-poster').set('User-Agent', HUMAN_UA).redirects(0);
    expect(visit.status).toBe(302);
    expect(link.body.link.code).toBe('lee-poster');
  });
  it('is written to the account history with the reason, and shows on the user page', async () => {
    const rows = await accountAudit(ids.lee);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actorId: adminId, action: 'account_suspended', reason: 'Phishing pages reported by students' });
    expect(rows[0].oldValue).toEqual({ status: 'active' });
    expect(rows[0].newValue).toEqual({ status: 'suspended' });
    const page = await admin.get(`/api/admin/users/${ids.lee}`);
    expect(page.body.user).toMatchObject({ status: 'suspended', suspendedReason: 'Phishing pages reported by students' });
    expect(page.body.history[0]).toMatchObject({ text: 'Account suspended', actor: 'Platform admin', reason: 'Phishing pages reported by students' });
  });
  it('suspending twice → 409, and only one audit row', async () => {
    const again = await act(ids.lee, 'suspend');
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_SUSPENDED');
    expect(await accountAudit(ids.lee)).toHaveLength(1);
  });
  it('reactivate lets them sign in again; reactivating an active account → 409', async () => {
    const r = await act(ids.lee, 'reactivate', 'Checked with the student, pages removed');
    expect(r.body.status).toBe('active');
    expect((await login('lee@test.dev')).status).toBe(200);
    expect((await act(ids.lee, 'reactivate')).body.error.code).toBe('NOT_SUSPENDED');
  });
  it('two admins suspending at the same moment: one change, one 409', async () => {
    const admin2 = await loginAs(srv, 'root2@test.dev');
    const [a, b] = await Promise.all([
      act(ids.kim, 'suspend', 'Spam from admin one'),
      admin2.post(`/api/admin/users/${ids.kim}/suspend`).send({ reason: 'Spam from admin two' }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(await accountAudit(ids.kim)).toHaveLength(1);
  });
});

describe('unlock', () => {
  it('clears the lock after 5 wrong passwords so they can sign in now', async () => {
    for (let i = 0; i < 5; i++) await login('ana@test.dev', 'wrong-password');
    expect((await login('ana@test.dev')).status).toBe(429);
    const list = await admin.get('/api/admin/users?status=locked');
    expect(list.body.items.map((u: { email: string }) => u.email)).toEqual(['ana@test.dev']);

    const r = await act(ids.ana, 'unlock', 'Student confirmed it was them');
    expect(r.body.status).toBe('active');
    expect((await login('ana@test.dev')).status).toBe(200);
    expect((await accountAudit(ids.ana))[0]).toMatchObject({ action: 'account_unlocked' });
  });
  it('unlocking an account that is not locked → 409', async () => {
    expect((await act(ids.raj, 'unlock')).body.error.code).toBe('NOT_LOCKED');
  });
});

describe('sign out everywhere', () => {
  it('ends every session, but they can sign in again', async () => {
    const phone = await loginAs(srv, 'raj@test.dev');
    const laptop = await loginAs(srv, 'raj@test.dev');
    const r = await act(ids.raj, 'sign-out', 'Lost phone, asked us to sign out');
    expect(r.status).toBe(200);
    expect((await phone.get('/api/auth/me')).status).toBe(401);
    expect((await laptop.get('/api/auth/me')).status).toBe(401);
    expect((await login('raj@test.dev')).status).toBe(200);
    const page = await admin.get(`/api/admin/users/${ids.raj}`);
    expect(page.body.history[0]).toMatchObject({ text: 'Signed out on every device', reason: 'Lost phone, asked us to sign out' });
  });
});
