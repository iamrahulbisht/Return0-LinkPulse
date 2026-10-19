import http from 'http';
import request from 'supertest';
import { prisma } from '../../src/lib/db';
import { sniffImage } from '../../src/routes/profile';
import { PASSWORD, loginAs, makeUser, startTestApp, stopTestApp } from '../helpers';

let srv: http.Server;

// Smallest valid PNG (1 × 1) and a JPEG header, for upload tests.
const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4d60000000049454e44ae426082',
  'hex',
);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)]);

beforeAll(async () => {
  srv = await startTestApp();
});
afterAll(stopTestApp);

describe('profile', () => {
  it('needs a session', async () => {
    expect((await request(srv).get('/api/me/profile')).status).toBe(401);
  });

  it('shows the user, workspace and their own numbers', async () => {
    await makeUser('pro@test.dev');
    const a = await loginAs(srv, 'pro@test.dev');
    await a.post('/api/links').send({ destination: 'https://example.com/p1' }).expect(201);
    const r = await a.get('/api/me/profile');
    expect(r.status).toBe(200);
    expect(r.body.user).toMatchObject({ email: 'pro@test.dev', role: 'user', avatarPath: null });
    expect(r.body.workspace.isOwner).toBe(true);
    expect(r.body.stats).toMatchObject({ links: 1, campaigns: 0, qrCodes: 0, humanClicks: 0 });
  });

  it('edits the name and (owner only) the workspace name', async () => {
    await makeUser('edit@test.dev');
    const a = await loginAs(srv, 'edit@test.dev');
    const r = await a.patch('/api/me/profile').send({ name: '  Rahul S.  ', workspaceName: 'Robotics Club' });
    expect(r.status).toBe(200);
    expect(r.body.user.name).toBe('Rahul S.');
    expect(r.body.workspace.name).toBe('Robotics Club');
    expect((await a.patch('/api/me/profile').send({ name: '' })).status).toBe(400);

    // A member who does not own the workspace cannot rename it.
    const owner = await prisma.user.findUniqueOrThrow({ where: { email: 'edit@test.dev' }, include: { members: true } });
    const member = await makeUser('member@test.dev');
    await prisma.workspaceMember.deleteMany({ where: { userId: member.id } });
    await prisma.workspaceMember.create({ data: { workspaceId: owner.members[0].workspaceId, userId: member.id, role: 'member' } });
    const m = await loginAs(srv, 'member@test.dev');
    expect((await m.patch('/api/me/profile').send({ workspaceName: 'Hacked' })).status).toBe(403);
  });
});

describe('email change', () => {
  it('needs the current password and a free email', async () => {
    await makeUser('mail@test.dev');
    await makeUser('taken@test.dev');
    const a = await loginAs(srv, 'mail@test.dev');
    const wrong = await a.post('/api/me/email').send({ email: 'new@test.dev', currentPassword: 'nope-nope' });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.code).toBe('WRONG_PASSWORD');
    const taken = await a.post('/api/me/email').send({ email: 'TAKEN@test.dev', currentPassword: PASSWORD });
    expect(taken.status).toBe(409);
    const ok = await a.post('/api/me/email').send({ email: 'New@Test.dev', currentPassword: PASSWORD });
    expect(ok.status).toBe(200);
    expect(ok.body.user.email).toBe('new@test.dev');
    // Signs in with the new email; the audit log says it changed but never stores the addresses.
    expect((await request(srv).post('/api/auth/login').send({ email: 'new@test.dev', password: PASSWORD })).status).toBe(200);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: 'account_email_changed' } });
    expect(JSON.stringify({ ...audit, id: String(audit.id) })).not.toContain('new@test.dev');
  });
});

describe('password change and sessions', () => {
  it('changes the password, keeps this session, signs out the others', async () => {
    await makeUser('pw@test.dev');
    const here = await loginAs(srv, 'pw@test.dev');
    const other = await loginAs(srv, 'pw@test.dev'); // a second device
    expect((await here.post('/api/me/password').send({ currentPassword: 'wrong-one', newPassword: 'brand-new-pass' })).status).toBe(400);
    expect((await here.post('/api/me/password').send({ currentPassword: PASSWORD, newPassword: 'short' })).status).toBe(400);
    const r = await here.post('/api/me/password').send({ currentPassword: PASSWORD, newPassword: 'brand-new-pass' });
    expect(r.status).toBe(200);
    expect((await here.get('/api/me/profile')).status).toBe(200); // fresh cookie
    expect((await other.get('/api/me/profile')).status).toBe(401); // old token rejected
    expect((await request(srv).post('/api/auth/login').send({ email: 'pw@test.dev', password: PASSWORD })).status).toBe(401);
    expect((await request(srv).post('/api/auth/login').send({ email: 'pw@test.dev', password: 'brand-new-pass' })).status).toBe(200);
  });

  it('"sign out other devices" keeps only the current session', async () => {
    await makeUser('dev@test.dev');
    const here = await loginAs(srv, 'dev@test.dev');
    const phone = await loginAs(srv, 'dev@test.dev');
    expect((await here.post('/api/me/sessions/revoke')).status).toBe(200);
    expect((await here.get('/api/auth/me')).status).toBe(200);
    expect((await phone.get('/api/auth/me')).status).toBe(401);
  });

  it('wrong current passwords are rate limited', async () => {
    await makeUser('brute@test.dev');
    const a = await loginAs(srv, 'brute@test.dev');
    const codes = [];
    for (let i = 0; i < 11; i++) codes.push((await a.post('/api/me/password').send({ currentPassword: `guess-${i}`, newPassword: 'whatever-123' })).status);
    expect(codes.slice(0, 10).every((c) => c === 400)).toBe(true);
    expect(codes[10]).toBe(429);
  });
});

describe('profile photo', () => {
  it('detects the image type from its bytes', () => {
    expect(sniffImage(PNG)).toBe('image/png');
    expect(sniffImage(JPEG)).toBe('image/jpeg');
    expect(sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
    expect(sniffImage(Buffer.from('GIF89a'))).toBeNull();
  });

  it('uploads, serves only to its owner, and removes', async () => {
    await makeUser('pic@test.dev');
    await makeUser('nosy@test.dev');
    const a = await loginAs(srv, 'pic@test.dev');
    const up = await a.put('/api/me/avatar').attach('file', PNG, 'me.png');
    expect(up.status).toBe(200);
    expect(up.body.user.avatarPath).toMatch(/^\/me\/avatar\?v=\d+$/);
    const me = await a.get('/api/auth/me');
    expect(me.body.user.avatarPath).toBe(up.body.user.avatarPath);
    const img = await a.get('/api/me/avatar');
    expect(img.status).toBe(200);
    expect(img.headers['content-type']).toBe('image/png');
    expect(img.headers['x-content-type-options']).toBe('nosniff');
    // Another user only ever gets their own (missing) photo.
    const b = await loginAs(srv, 'nosy@test.dev');
    expect((await b.get('/api/me/avatar')).status).toBe(404);
    const del = await a.delete('/api/me/avatar');
    expect(del.body.user.avatarPath).toBeNull();
    expect((await a.get('/api/me/avatar')).status).toBe(404);
  });

  it('rejects non-images (even if named .png) and files over 1 MB', async () => {
    await makeUser('bad@test.dev');
    const a = await loginAs(srv, 'bad@test.dev');
    const svg = await a.put('/api/me/avatar').attach('file', Buffer.from('<svg onload="alert(1)"/>'), { filename: 'x.png', contentType: 'image/png' });
    expect(svg.status).toBe(400);
    expect(svg.body.error.code).toBe('NOT_AN_IMAGE');
    const big = await a.put('/api/me/avatar').attach('file', Buffer.concat([PNG, Buffer.alloc(1024 * 1024)]), 'big.png');
    expect(big.status).toBe(413);
  });
});
