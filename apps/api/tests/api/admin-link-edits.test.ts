import http from 'http';
import { prisma } from '../../src/lib/db';
import { loginAs, makeUser, startTestApp, stopTestApp } from '../helpers';

let srv: http.Server;
let admin: Awaited<ReturnType<typeof loginAs>>;
let alice: Awaited<ReturnType<typeof loginAs>>;
let bob: Awaited<ReturnType<typeof loginAs>>;
let aliceId: string;
let linkId: string;
let adminOwnLinkId: string;

const history = async (id: string) =>
  (await alice.get(`/api/links/${id}/history`)).body.items as { text: string; actor: string; reason: string | null }[];

beforeAll(async () => {
  srv = await startTestApp();
  await makeUser('root@test.dev', 'admin');
  aliceId = (await makeUser('alice@test.dev')).id;
  await makeUser('bob@test.dev');
  admin = await loginAs(srv, 'root@test.dev');
  alice = await loginAs(srv, 'alice@test.dev');
  bob = await loginAs(srv, 'bob@test.dev');
  linkId = (await alice.post('/api/links').send({ destination: 'https://alice.example.com/fest', alias: 'alice-fest' }).expect(201)).body.link.id;
  adminOwnLinkId = (await admin.post('/api/links').send({ destination: 'https://admin.example.com', alias: 'admin-own' }).expect(201)).body.link.id;
});
afterAll(stopTestApp);

describe('admin edits to someone else’s link need a reason', () => {
  it('the link page tells the admin it is an admin view (and nobody else)', async () => {
    expect((await admin.get(`/api/links/${linkId}`)).body.adminView).toBe(true);
    expect((await alice.get(`/api/links/${linkId}`)).body.adminView).toBe(false);
    expect((await admin.get(`/api/links/${adminOwnLinkId}`)).body.adminView).toBe(false);
  });

  it('Edit without a reason (or too short) → 400 on the reason field, and nothing changes', async () => {
    const none = await admin.patch(`/api/links/${linkId}`).send({ destination: 'https://safe.example.com' });
    expect(none.status).toBe(400);
    expect(none.body.error.code).toBe('REASON_REQUIRED');
    expect(none.body.error.fields[0].field).toBe('reason');
    expect((await admin.patch(`/api/links/${linkId}`).send({ destination: 'https://safe.example.com', reason: 'abc' })).status).toBe(400);
    const link = await prisma.link.findUniqueOrThrow({ where: { id: linkId } });
    expect(link.destination).toBe('https://alice.example.com/fest');
  });

  it('Edit with a reason works; the owner’s history shows "Platform admin" and the reason', async () => {
    const r = await admin
      .patch(`/api/links/${linkId}`)
      .send({ destination: 'https://safe.example.com', clickLimit: 50, reason: 'Old page was flagged as phishing' });
    expect(r.status).toBe(200);
    expect(r.body.link.destination).toBe('https://safe.example.com');
    const items = await history(linkId);
    const byAdmin = items.filter((i) => i.actor === 'Platform admin');
    expect(byAdmin.map((i) => i.text).sort()).toEqual(['Click limit set to 50', 'Destination changed']);
    expect(byAdmin.every((i) => i.reason === 'Old page was flagged as phishing')).toBe(true);
    const rows = await prisma.auditLog.findMany({ where: { linkId, action: 'destination_changed' } });
    expect(rows[0].subjectUserId).toBe(aliceId);
  });

  it('Link life (state switch) works the same way', async () => {
    expect((await admin.post(`/api/links/${linkId}/state`).send({ state: 'expired' })).body.error.code).toBe('REASON_REQUIRED');
    const r = await admin.post(`/api/links/${linkId}/state`).send({ state: 'expired', reason: 'Event is over, stopping it' });
    expect(r.status).toBe(200);
    expect(r.body.link.status).toBe('expired');
    expect((await history(linkId)).find((i) => i.text.startsWith('Expiry set'))).toMatchObject({ actor: 'Platform admin', reason: 'Event is over, stopping it' });
  });

  it('an admin can see a user’s QR codes but not make new ones on their link', async () => {
    expect((await admin.get(`/api/links/${linkId}/qr`)).status).toBe(200);
    const r = await admin.post(`/api/links/${linkId}/qr`).send({ location_label: 'Main gate' });
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('NOT_IN_WORKSPACE');
    expect((await alice.post(`/api/links/${linkId}/qr`).send({ location_label: 'Main gate' })).status).toBe(201);
  });

  it('owners, and admins in their own workspace, need no reason', async () => {
    expect((await alice.patch(`/api/links/${linkId}`).send({ title: 'Fest page' })).status).toBe(200);
    expect((await alice.post(`/api/links/${linkId}/state`).send({ state: 'active' })).status).toBe(200);
    expect((await admin.patch(`/api/links/${adminOwnLinkId}`).send({ title: 'Mine' })).status).toBe(200);
    const own = await prisma.auditLog.findMany({ where: { linkId, actorId: aliceId } });
    expect(own.length).toBeGreaterThan(0);
    expect(own.every((a) => a.subjectUserId === null)).toBe(true);
  });
});

describe('account notices', () => {
  it('the owner sees what an admin did to their links and account, with reasons and the link', async () => {
    await admin.post(`/api/admin/users/${aliceId}/sign-out`).send({ reason: 'Asked us to end old sessions' }).expect(200);
    alice = await loginAs(srv, 'alice@test.dev');
    const r = await alice.get('/api/me/notices');
    expect(r.status).toBe(200);
    const texts = r.body.items.map((i: { text: string }) => i.text);
    expect(texts).toEqual(expect.arrayContaining(['Signed out on every device', 'Destination changed', 'Click limit set to 50']));
    expect(r.body.items.every((i: { actor: string }) => i.actor === 'Platform admin')).toBe(true);
    const dest = r.body.items.find((i: { text: string }) => i.text === 'Destination changed');
    expect(dest).toMatchObject({ link: 'lp.example.com/alice-fest', reason: 'Old page was flagged as phishing' });
    // Her own edits ("Title changed", Link life back to active) are not notices.
    expect(texts).not.toContain('Title changed');
  });
  it('is only ever about the signed-in user', async () => {
    expect((await bob.get('/api/me/notices')).body.items).toEqual([]);
  });
  it('the admin’s page for the user shows the same changes, with the link', async () => {
    const page = await admin.get(`/api/admin/users/${aliceId}`);
    expect(page.body.history.find((i: { text: string }) => i.text === 'Destination changed')).toMatchObject({ link: 'lp.example.com/alice-fest' });
    expect(page.body.history.find((i: { text: string }) => i.text === 'Signed out on every device')).toMatchObject({ link: null });
  });
});
