import http from 'http';
import request from 'supertest';
import { prisma } from '../../src/lib/db';
import { loginAs, makeUser, startTestApp, stopTestApp } from '../helpers';

let srv: http.Server;
let a: Awaited<ReturnType<typeof loginAs>>;
let b: Awaited<ReturnType<typeof loginAs>>;

beforeAll(async () => {
  srv = await startTestApp();
  await makeUser('a@test.dev');
  await makeUser('b@test.dev');
  a = await loginAs(srv, 'a@test.dev');
  b = await loginAs(srv, 'b@test.dev');
  await prisma.blockedDomain.create({ data: { domain: 'bit-scam.example', reason: 'Phishing' } });
});
afterAll(stopTestApp);

describe('auth and roles', () => {
  it('needs a session for the API', async () => {
    const r = await request(srv).get('/api/links');
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe('NOT_SIGNED_IN');
  });
  it('session cookie is httpOnly', async () => {
    const r = await request(srv).post('/api/auth/login').send({ email: 'a@test.dev', password: 'correct-horse-9' });
    expect(String(r.headers['set-cookie'])).toMatch(/lp_session=.*HttpOnly/i);
  });
  it('locks the account after 5 wrong passwords', async () => {
    await makeUser('locked@test.dev');
    const tries = [];
    for (let i = 0; i < 5; i++) tries.push((await request(srv).post('/api/auth/login').send({ email: 'locked@test.dev', password: 'nope-nope' })).status);
    expect(tries).toEqual([401, 401, 401, 401, 429]);
    // Even the right password waits now.
    const r = await request(srv).post('/api/auth/login').send({ email: 'locked@test.dev', password: 'correct-horse-9' });
    expect(r.status).toBe(429);
    expect(r.body.error.message).toMatch(/wait 5 minutes/);
  });
  it('a normal user cannot reach admin routes (server-side check)', async () => {
    const r = await a.get('/api/admin/overview');
    expect(r.status).toBe(403);
  });
});

describe('edge case 1: alias already taken', () => {
  beforeAll(async () => {
    await a.post('/api/links').send({ destination: 'https://innovista.gehu.ac.in', alias: 'innovista' }).expect(201);
  });
  it('wizard live check shows the warning with free suggestions', async () => {
    const r = await b.post('/api/links/validate').send({ destination: 'https://forms.gle/x', alias: 'innovista' });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(false);
    const alias = r.body.checks.find((c: { id: string }) => c.id === 'alias');
    expect(alias.state).toBe('bad');
    expect(r.body.alias.suggestions).toEqual(['innovista26', 'innovista-2026', 'innovista-reg']);
  });
  it('API returns 409 ALIAS_TAKEN', async () => {
    const r = await b.post('/api/links').send({ destination: 'https://forms.gle/x', alias: 'INNOVISTA' });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('ALIAS_TAKEN');
    expect(r.body.error.fields[0].suggestions.length).toBeGreaterThan(0);
  });
});

describe('edge case 2: two users save the same alias at the same time', () => {
  it('exactly one succeeds, the other gets "just taken"', async () => {
    const body = { destination: 'https://example.com/race', alias: 'race-alias' };
    const [r1, r2] = await Promise.all([a.post('/api/links').send(body), b.post('/api/links').send(body)]);
    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([201, 409]);
    const loser = r1.status === 409 ? r1 : r2;
    expect(loser.body.error.code).toBe('ALIAS_TAKEN');
    expect(await prisma.link.count({ where: { code: 'race-alias' } })).toBe(1);
  });
});

describe('edge case 3: reserved alias', () => {
  it.each(['admin', 'api', 'login'])('blocks %s with a suggestion', async (alias) => {
    const v = await a.post('/api/links/validate').send({ destination: 'https://example.com', alias });
    expect(v.body.alias.code).toBe('ALIAS_RESERVED');
    expect(v.body.alias.suggestions.length).toBeGreaterThan(0);
    const r = await a.post('/api/links').send({ destination: 'https://example.com', alias });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('ALIAS_RESERVED');
  });
});

describe('edge case 4: unsafe or looping URLs', () => {
  it.each([
    ['javascript:alert(1)', 'URL_SCHEME'],
    ['htps://broken', 'URL_SCHEME'],
    ['not a url', 'URL_INVALID'],
    ['https://lp.example.com/abc', 'URL_LOOP'],
    ['https://app.linkpulse.example/dashboard', 'URL_LOOP'],
  ])('%s → %s', async (destination, code) => {
    const v = await a.post('/api/links/validate').send({ destination });
    expect(v.body.ok).toBe(false);
    const r = await a.post('/api/links').send({ destination });
    expect(r.status).toBe(400);
    expect(r.body.error.fields.map((f: { code: string }) => f.code)).toContain(code);
  });
});

describe('edge case 5: blocklisted destination', () => {
  it('is blocked at create, including sub-domains', async () => {
    const v = await a.post('/api/links/validate').send({ destination: 'https://login.bit-scam.example/x' });
    expect(v.body.checks.find((c: { id: string }) => c.id === 'block').state).toBe('bad');
    const r = await a.post('/api/links').send({ destination: 'https://login.bit-scam.example/x' });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('URL_BLOCKED');
  });
});

describe('edge case 6: expiry date in the past', () => {
  it('API returns 400 EXPIRY_PAST', async () => {
    const r = await a.post('/api/links').send({ destination: 'https://example.com/old', expiresOn: '2020-01-01' });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('EXPIRY_PAST');
  });
  it('an IST date means 11:59 PM IST that day, stored in UTC', async () => {
    const r = await a.post('/api/links').send({ destination: 'https://example.com/future', expiresOn: '2099-10-30' });
    expect(r.status).toBe(201);
    expect(r.body.link.expiresAt).toBe('2099-10-30T18:29:00.000Z');
  });
});

describe('links list order', () => {
  it('is newest first by creation time, not by clicks', async () => {
    await makeUser('order@test.dev');
    const o = await loginAs(srv, 'order@test.dev');
    const ids: string[] = [];
    for (const n of [1, 2, 3]) {
      ids.push((await o.post('/api/links').send({ destination: `https://order-${n}.example.com` }).expect(201)).body.link.id);
    }
    // The oldest link has the most clicks: before the fix it was listed first.
    await prisma.link.update({ where: { id: ids[0] }, data: { clickCount: 50 } });
    const list = await o.get('/api/links?pageSize=100').expect(200);
    expect(list.body.items.map((l: { id: string }) => l.id)).toEqual([ids[2], ids[1], ids[0]]);
  });
});

describe('edge case 11: User A changes the id in the URL to see User B', () => {
  it('returns 403 on every :id route', async () => {
    const created = await b.post('/api/links').send({ destination: 'https://b-only.example.com' }).expect(201);
    const id = created.body.link.id;
    for (const path of [`/api/links/${id}`, `/api/links/${id}/clicks`, `/api/links/${id}/history`, `/api/links/${id}/qr`]) {
      expect((await a.get(path)).status).toBe(403);
    }
    expect((await a.patch(`/api/links/${id}`).send({ clickLimit: 5 })).status).toBe(403);
    expect((await a.post(`/api/links/${id}/state`).send({ state: 'expired' })).status).toBe(403);
    expect((await a.get(`/api/analytics/timeseries?linkId=${id}`)).status).toBe(403);
    // A's list never shows B's link.
    const list = await a.get('/api/links?pageSize=100');
    expect(list.body.items.map((l: { id: string }) => l.id)).not.toContain(id);
  });
  it('there is no DELETE route for links', async () => {
    const created = await a.post('/api/links').send({ destination: 'https://keep.example.com' }).expect(201);
    expect((await a.delete(`/api/links/${created.body.link.id}`)).status).toBe(404);
    expect(await prisma.link.count({ where: { id: created.body.link.id } })).toBe(1);
  });
});

describe('editing a link', () => {
  it('raise limit and extend expiry are written to history (old → new)', async () => {
    const c = await a.post('/api/links').send({ destination: 'https://edit.example.com', clickLimit: 300 }).expect(201);
    const id = c.body.link.id;
    const p = await a.patch(`/api/links/${id}`).send({ clickLimit: 500, expiresOn: '2099-12-31' });
    expect(p.status).toBe(200);
    expect(p.body.link.clickLimit).toBe(500);
    const h = await a.get(`/api/links/${id}/history`);
    const texts = h.body.items.map((i: { text: string }) => i.text);
    expect(texts).toContain('Limit raised from 300 to 500');
    expect(texts.some((t: string) => t.startsWith('Expiry set to'))).toBe(true);
    expect(texts).toContain('Link created with the wizard');
  });
  it('lists links with status counts', async () => {
    const r = await a.get('/api/links?status=all');
    expect(r.status).toBe(200);
    expect(r.body.counts.all).toBeGreaterThan(0);
    expect(r.body.counts.all).toBe(r.body.counts.active + r.body.counts.expired + r.body.counts.limit_reached + r.body.counts.disabled);
  });
});

describe('edge case 12: 50 links in 10 seconds', () => {
  it('returns 429 after 10 per minute', async () => {
    await makeUser('spammer@test.dev');
    const s = await loginAs(srv, 'spammer@test.dev');
    const results = await Promise.all(
      Array.from({ length: 50 }, (_, i) => s.post('/api/links').send({ destination: `https://example.com/${i}` })),
    );
    const ok = results.filter((r) => r.status === 201).length;
    const limited = results.filter((r) => r.status === 429);
    expect(ok).toBe(10);
    expect(limited).toHaveLength(40);
    expect(limited[0].body.error.message).toBe('Too many new links. Try again in a minute.');
  });
});
