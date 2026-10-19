import http from 'http';
import request from 'supertest';
import { prisma } from '../../src/lib/db';
import { PASSWORD, loginAs, makeUser, nextIp, startTestApp, stopTestApp } from '../helpers';

let srv: http.Server;
let admin: Awaited<ReturnType<typeof loginAs>>;
const ids: Record<string, string> = {};

const login = (email: string, password = PASSWORD) =>
  request(srv).post('/api/auth/login').set('X-Forwarded-For', nextIp()).send({ email, password });
/** Signs in with an agent that keeps the cookie (so a forced-change session can be used afterwards). */
async function agentLogin(email: string, password: string) {
  const agent = request.agent(srv);
  const r = await agent.post('/api/auth/login').set('X-Forwarded-For', nextIp()).send({ email, password });
  return { agent, status: r.status, body: r.body };
}
const reset = (id: string, reason: string | null = 'Student forgot their password at the help desk') =>
  admin.post(`/api/admin/users/${id}/reset-password`).send(reason === null ? {} : { reason });

beforeAll(async () => {
  srv = await startTestApp();
  await makeUser('root@test.dev', 'admin');
  ids.admin2 = (await makeUser('root2@test.dev', 'admin')).id;
  for (const name of ['mia', 'leo', 'zoe', 'ivy']) ids[name] = (await makeUser(`${name}@test.dev`)).id;
  admin = await loginAs(srv, 'root@test.dev');
});
afterAll(stopTestApp);

describe('admin password reset', () => {
  let temp = '';

  it('returns a one-time temporary password, never cached, and ends every session', async () => {
    const mia = await loginAs(srv, 'mia@test.dev');
    const r = await reset(ids.mia);
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.body.status).toBe('password_reset');
    expect(r.body.temporaryPassword).toMatch(/^[A-HJ-NP-Za-km-z2-9]{14}$/);
    expect(new Date(r.body.expiresAt).getTime() - Date.now()).toBeGreaterThan(23 * 3600_000);
    temp = r.body.temporaryPassword;
    expect((await mia.get('/api/auth/me')).status).toBe(401);
    expect((await login('mia@test.dev')).status).toBe(401); // the old password is gone
  });

  it('the temporary password is never stored in plain text or in the audit log', async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: ids.mia } });
    expect(user.passwordHash).not.toContain(temp);
    const rows = await prisma.auditLog.findMany({ where: { subjectUserId: ids.mia } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: 'account_password_reset', reason: 'Student forgot their password at the help desk' });
    // Audit ids are BigInt, which JSON.stringify cannot handle on its own.
    expect(JSON.stringify(rows, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))).not.toContain(temp);
    const page = await admin.get(`/api/admin/users/${ids.mia}`);
    expect(page.body.user.status).toBe('password_reset');
    expect(page.body.history[0].text).toBe('Password reset by an admin');
  });

  it('signing in with it allows only "set a new password" until they do', async () => {
    const { agent, status } = await agentLogin('mia@test.dev', temp);
    expect(status).toBe(200);
    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.passwordReset).toMatchObject({ reason: 'Student forgot their password at the help desk' });
    for (const path of ['/api/links', '/api/me/profile', '/api/stream-token', '/api/workspaces']) {
      const r = await agent.get(path);
      expect(r.status).toBe(403);
      expect(r.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
    }
    expect((await agent.post('/api/links').send({ destination: 'https://x.example.com' })).status).toBe(403);

    // Keeping the temporary password is not allowed.
    const same = await agent.post('/api/me/password').send({ currentPassword: temp, newPassword: temp });
    expect(same.status).toBe(400);

    const ok = await agent.post('/api/me/password').send({ currentPassword: temp, newPassword: 'mia-own-password-1' });
    expect(ok.status).toBe(200);
    expect((await agent.get('/api/links')).status).toBe(200); // fresh cookie, back to normal
    expect((await agent.get('/api/auth/me')).body.passwordReset).toBeNull();
    expect((await login('mia@test.dev', temp)).status).toBe(401);
    expect((await login('mia@test.dev', 'mia-own-password-1')).status).toBe(200);
    expect((await admin.get(`/api/admin/users/${ids.mia}`)).body.user.status).toBe('active');
  });

  it('an expired temporary password is refused, but a wrong one gets the usual message', async () => {
    const r = await reset(ids.leo);
    await prisma.user.update({ where: { id: ids.leo }, data: { tempPasswordExpiresAt: new Date(Date.now() - 1000) } });
    const expired = await login('leo@test.dev', r.body.temporaryPassword);
    expect(expired.status).toBe(401);
    expect(expired.body.error.code).toBe('TEMP_PASSWORD_EXPIRED');
    const wrong = await login('leo@test.dev', 'not-it-at-all');
    expect(wrong.body.error.code).toBe('INVALID_LOGIN');
  });

  it('a session that signed in with it in time cannot use it after it expires', async () => {
    const r = await reset(ids.leo);
    const { agent, status } = await agentLogin('leo@test.dev', r.body.temporaryPassword);
    expect(status).toBe(200);
    await prisma.user.update({ where: { id: ids.leo }, data: { tempPasswordExpiresAt: new Date(Date.now() - 1000) } });
    const late = await agent.post('/api/me/password').send({ currentPassword: r.body.temporaryPassword, newPassword: 'leo-own-password-1' });
    expect(late.status).toBe(401);
    expect(late.body.error.code).toBe('TEMP_PASSWORD_EXPIRED');
  });

  it('also clears a lockout, so the user can sign in with it straight away', async () => {
    for (let i = 0; i < 5; i++) await login('zoe@test.dev', 'wrong-password');
    expect((await login('zoe@test.dev')).status).toBe(429);
    const r = await reset(ids.zoe);
    expect((await login('zoe@test.dev', r.body.temporaryPassword)).status).toBe(200);
  });

  it('refuses suspended accounts, other admins and a missing reason', async () => {
    await admin.post(`/api/admin/users/${ids.ivy}/suspend`).send({ reason: 'Spam links reported' }).expect(200);
    const sus = await reset(ids.ivy);
    expect(sus.status).toBe(409);
    expect(sus.body.error.code).toBe('ACCOUNT_SUSPENDED');
    expect((await reset(ids.admin2)).status).toBe(403);
    expect((await reset(ids.zoe, null)).status).toBe(400);
  });

  it('a normal user cannot reset anyone', async () => {
    const mia = request.agent(srv);
    await mia.post('/api/auth/login').set('X-Forwarded-For', nextIp()).send({ email: 'mia@test.dev', password: 'mia-own-password-1' }).expect(200);
    expect((await mia.post(`/api/admin/users/${ids.leo}/reset-password`).send({ reason: 'Trying to abuse' })).status).toBe(403);
  });
});
