import http from 'http';
import request from 'supertest';
import { prisma } from '../../src/lib/db';
import { loginAs, makeUser, startTestApp, stopTestApp } from '../helpers';

let srv: http.Server;

beforeAll(async () => {
  srv = await startTestApp();
});
afterAll(stopTestApp);

type Agent = Awaited<ReturnType<typeof loginAs>>;

/** Owner creates a workspace and invites `email`; returns the workspace id and the invite id. */
async function inviteInto(owner: Agent, name: string, email: string) {
  const ws = await owner.post('/api/workspaces').send({ name }).expect(201);
  const inv = await owner.post(`/api/workspaces/${ws.body.workspace.id}/invites`).send({ email }).expect(201);
  return { wsId: ws.body.workspace.id as string, inviteId: inv.body.invite.id as string };
}

describe('workspaces', () => {
  it('needs a session', async () => {
    expect((await request(srv).get('/api/workspaces')).status).toBe(401);
    expect((await request(srv).get('/api/invites')).status).toBe(401);
  });

  it('creates several workspaces, switches between them and keeps links apart', async () => {
    await makeUser('multi@test.dev');
    const a = await loginAs(srv, 'multi@test.dev');
    await a.post('/api/links').send({ destination: 'https://example.com/home-ws' }).expect(201);

    const created = await a.post('/api/workspaces').send({ name: '  Robotics Club ' }).expect(201);
    expect(created.body.workspace).toMatchObject({ name: 'Robotics Club', role: 'owner', members: 1, isActive: true });
    // New workspace is active and empty.
    expect((await a.get('/api/links')).body.total).toBe(0);
    await a.post('/api/links').send({ destination: 'https://example.com/robotics' }).expect(201);
    const me = await a.get('/api/auth/me');
    expect(me.body.workspace).toMatchObject({ id: created.body.workspace.id, role: 'owner' });
    expect(me.body.counts.links).toBe(1);

    const list = await a.get('/api/workspaces');
    expect(list.body.items).toHaveLength(2);
    const home = list.body.items.find((w: { isActive: boolean }) => !w.isActive);
    await a.post(`/api/workspaces/${home.id}/switch`).expect(200);
    const links = await a.get('/api/links');
    expect(links.body.items.map((l: { destination: string }) => l.destination)).toEqual(['https://example.com/home-ws']);

    expect((await a.post('/api/workspaces').send({ name: '' })).status).toBe(400);
  });

  it('invite → notification → accept: the member works on shared links', async () => {
    await makeUser('own1@test.dev');
    await makeUser('mem1@test.dev');
    const owner = await loginAs(srv, 'own1@test.dev');
    const member = await loginAs(srv, 'mem1@test.dev');
    const { wsId, inviteId } = await inviteInto(owner, 'Fest team', 'MEM1@test.dev');
    const shared = await owner.post('/api/links').send({ destination: 'https://example.com/fest' }).expect(201);

    // Before accepting: a notification, but no access.
    expect((await member.get('/api/auth/me')).body.counts.invites).toBe(1);
    const invites = await member.get('/api/invites');
    expect(invites.body.items).toEqual([
      expect.objectContaining({ id: inviteId, invitedBy: 'own1', workspace: expect.objectContaining({ id: wsId, name: 'Fest team' }) }),
    ]);
    expect((await member.get(`/api/links/${shared.body.link.id}`)).status).toBe(403);
    expect((await member.post(`/api/workspaces/${wsId}/switch`)).status).toBe(403);

    const acc = await member.post(`/api/invites/${inviteId}/accept`).expect(200);
    expect(acc.body.workspace).toMatchObject({ id: wsId, role: 'member', members: 2, isActive: true });
    expect((await member.get('/api/auth/me')).body).toMatchObject({ workspace: { id: wsId, role: 'member' }, counts: { invites: 0 } });

    // Member sees and edits the shared link, and creates one in the workspace.
    expect((await member.get('/api/links')).body.total).toBe(1);
    await member.patch(`/api/links/${shared.body.link.id}`).send({ title: 'Fest page' }).expect(200);
    const made = await member.post('/api/links').send({ destination: 'https://example.com/by-member', tags: ['fest'] }).expect(201);
    expect((await owner.get('/api/links')).body.total).toBe(2);
    expect((await owner.get('/api/tags')).body.items.map((t: { name: string }) => t.name)).toContain('fest');
    // Campaigns are shared too.
    const camp = await owner.post('/api/campaigns').send({ name: 'Fest 2026' }).expect(201);
    await member.patch(`/api/links/${made.body.link.id}`).send({ campaignId: camp.body.campaign.id }).expect(200);
    expect((await member.get('/api/campaigns')).body.items).toHaveLength(1);

    // Answering twice does nothing.
    expect((await member.post(`/api/invites/${inviteId}/accept`)).status).toBe(404);
  });

  it('only the owner manages people and the name', async () => {
    await makeUser('own2@test.dev');
    await makeUser('mem2@test.dev');
    await makeUser('third2@test.dev');
    const owner = await loginAs(srv, 'own2@test.dev');
    const member = await loginAs(srv, 'mem2@test.dev');
    const { wsId, inviteId } = await inviteInto(owner, 'Owner rules', 'mem2@test.dev');
    await member.post(`/api/invites/${inviteId}/accept`).expect(200);

    expect((await member.post(`/api/workspaces/${wsId}/invites`).send({ email: 'third2@test.dev' })).status).toBe(403);
    expect((await member.patch(`/api/workspaces/${wsId}`).send({ name: 'Mine now' })).status).toBe(403);
    const ownerId = (await prisma.user.findUniqueOrThrow({ where: { email: 'own2@test.dev' } })).id;
    expect((await member.delete(`/api/workspaces/${wsId}/members/${ownerId}`)).status).toBe(403);

    // Members can see who is in it, but not the open invites.
    const third = await owner.post(`/api/workspaces/${wsId}/invites`).send({ email: 'third2@test.dev' }).expect(201);
    const asMember = await member.get(`/api/workspaces/${wsId}/members`).expect(200);
    expect(asMember.body.members.map((m: { role: string }) => m.role)).toEqual(['owner', 'member']);
    expect(asMember.body.invites).toEqual([]);
    const asOwner = await owner.get(`/api/workspaces/${wsId}/members`).expect(200);
    expect(asOwner.body.invites.map((i: { email: string }) => i.email)).toEqual(['third2@test.dev']);

    await owner.patch(`/api/workspaces/${wsId}`).send({ name: 'Renamed' }).expect(200);
    await owner.delete(`/api/workspaces/${wsId}/invites/${third.body.invite.id}`).expect(200);
    const t = await loginAs(srv, 'third2@test.dev');
    expect((await t.get('/api/invites')).body.items).toEqual([]);
  });

  it('rejects bad invites', async () => {
    await makeUser('own3@test.dev');
    await makeUser('mem3@test.dev');
    const owner = await loginAs(srv, 'own3@test.dev');
    const { wsId, inviteId } = await inviteInto(owner, 'Checks', 'mem3@test.dev');
    const send = (email: string) => owner.post(`/api/workspaces/${wsId}/invites`).send({ email });
    expect((await send('mem3@test.dev')).body.error.code).toBe('INVITE_PENDING');
    expect((await send('own3@test.dev')).body.error.code).toBe('SELF_INVITE');
    expect((await send('not-an-email')).status).toBe(400);
    // Someone who has no account yet can still be invited (it waits for their sign-up).
    expect((await send('later@test.dev')).status).toBe(201);
    const m = await loginAs(srv, 'mem3@test.dev');
    await m.post(`/api/invites/${inviteId}/accept`).expect(200);
    expect((await send('mem3@test.dev')).body.error.code).toBe('ALREADY_MEMBER');
  });

  it('decline, then a new invite re-opens it', async () => {
    await makeUser('own4@test.dev');
    await makeUser('mem4@test.dev');
    const owner = await loginAs(srv, 'own4@test.dev');
    const m = await loginAs(srv, 'mem4@test.dev');
    const { wsId, inviteId } = await inviteInto(owner, 'Second chance', 'mem4@test.dev');
    await m.post(`/api/invites/${inviteId}/decline`).expect(200);
    expect((await m.get('/api/workspaces')).body.items).toHaveLength(1);
    expect((await m.get('/api/invites')).body.items).toEqual([]);
    await owner.post(`/api/workspaces/${wsId}/invites`).send({ email: 'mem4@test.dev' }).expect(201);
    expect((await m.get('/api/invites')).body.items).toHaveLength(1);
  });

  it("nobody can answer someone else's invite", async () => {
    await makeUser('own5@test.dev');
    await makeUser('mem5@test.dev');
    await makeUser('thief5@test.dev');
    const owner = await loginAs(srv, 'own5@test.dev');
    const { wsId, inviteId } = await inviteInto(owner, 'Private', 'mem5@test.dev');
    const thief = await loginAs(srv, 'thief5@test.dev');
    expect((await thief.post(`/api/invites/${inviteId}/accept`)).status).toBe(404);
    expect((await thief.get(`/api/workspaces/${wsId}/members`)).status).toBe(403);
    expect((await thief.post(`/api/workspaces/${wsId}/invites`).send({ email: 'x@test.dev' })).status).toBe(403);
  });

  it('a removed member loses access and falls back to their own workspace', async () => {
    const own = await makeUser('own6@test.dev');
    const mem = await makeUser('mem6@test.dev');
    const owner = await loginAs(srv, 'own6@test.dev');
    const m = await loginAs(srv, 'mem6@test.dev');
    const { wsId, inviteId } = await inviteInto(owner, 'Temporary', 'mem6@test.dev');
    await m.post(`/api/invites/${inviteId}/accept`).expect(200);
    const link = await m.post('/api/links').send({ destination: 'https://example.com/left-behind' }).expect(201);

    expect((await owner.delete(`/api/workspaces/${wsId}/members/${own.id}`)).body.error.code).toBe('CANNOT_REMOVE_OWNER');
    await owner.delete(`/api/workspaces/${wsId}/members/${mem.id}`).expect(200);

    expect((await m.get('/api/auth/me')).body.workspace.id).toBe(mem.workspaceId);
    expect((await m.get(`/api/links/${link.body.link.id}`)).status).toBe(403);
    expect((await m.get(`/api/workspaces/${wsId}/members`)).status).toBe(403);
    // The link they made stays in the workspace.
    expect((await owner.get(`/api/links/${link.body.link.id}`)).status).toBe(200);
  });

  it('members can leave; the owner cannot', async () => {
    const mem = await makeUser('mem7@test.dev');
    await makeUser('own7@test.dev');
    const owner = await loginAs(srv, 'own7@test.dev');
    const m = await loginAs(srv, 'mem7@test.dev');
    const { wsId, inviteId } = await inviteInto(owner, 'Leavers', 'mem7@test.dev');
    await m.post(`/api/invites/${inviteId}/accept`).expect(200);
    expect((await owner.post(`/api/workspaces/${wsId}/leave`)).body.error.code).toBe('OWNER_CANNOT_LEAVE');
    await m.post(`/api/workspaces/${wsId}/leave`).expect(200);
    expect((await m.get('/api/auth/me')).body.workspace.id).toBe(mem.workspaceId);
    expect((await owner.get(`/api/workspaces/${wsId}/members`)).body.members).toHaveLength(1);
  });
});
