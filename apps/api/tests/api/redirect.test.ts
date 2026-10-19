import http from 'http';
import request from 'supertest';
import { prisma } from '../../src/lib/db';
import { redis } from '../../src/lib/redis';
import { cachedSnapshotExists } from '../../src/lib/linkCache';
import { createLink, validateCreate, type CreateLinkInput } from '../../src/services/links';
import { endOfIstDay } from '../../src/logic/time';
import { HUMAN_UA, IPHONE_UA, WHATSAPP_UA, loginAs, makeUser, nextIp, startTestApp, stopTestApp, waitFor } from '../helpers';

let srv: http.Server;
let owner: Awaited<ReturnType<typeof loginAs>>;
let admin: Awaited<ReturnType<typeof loginAs>>;

const visit = (path: string, ua = HUMAN_UA, ip = nextIp()) =>
  request(srv).get(path).set('User-Agent', ua).set('X-Forwarded-For', ip).redirects(0);

let ownerActor: { id: string; workspaceId: string };

/** Creates links through the same service as the API (skips the 10/min rate limit, tested in links.test). */
async function create(body: CreateLinkInput & { expiresOn?: string }) {
  const { expiresOn, ...rest } = body;
  const input = { ...rest, expiresAt: expiresOn ? endOfIstDay(expiresOn) : rest.expiresAt };
  await validateCreate(input, ownerActor);
  return createLink(input, ownerActor);
}

const clicks = (linkId: string) => prisma.clickEvent.findMany({ where: { linkId } });

beforeAll(async () => {
  srv = await startTestApp();
  const u = await makeUser('owner@test.dev');
  ownerActor = { id: u.id, workspaceId: u.workspaceId };
  await makeUser('admin@test.dev', 'admin');
  owner = await loginAs(srv, 'owner@test.dev');
  admin = await loginAs(srv, 'admin@test.dev');
});
afterAll(stopTestApp);

describe('the redirect', () => {
  it('is always 302 with no-store, and the click is logged in the background', async () => {
    const l = await create({ destination: 'https://example.com/a', alias: 'basic-302' });
    const r = await visit('/basic-302');
    expect(r.status).toBe(302);
    expect(r.headers.location).toBe('https://example.com/a');
    expect(r.headers['cache-control']).toBe('no-store');
    const rows = await waitFor(() => clicks(l.id), (x) => x.length === 1);
    expect(rows[0]).toMatchObject({ clickType: 'human', counted: true, source: 'link', device: 'android', browser: 'Chrome' });
    expect(rows[0].visitorHash).toMatch(/^[0-9a-f]{64}$/);
  });
  it('tags QR scans with their location and bio clicks with source=bio', async () => {
    const l = await create({ destination: 'https://example.com/qr', alias: 'qr-test' });
    const qr = await owner.post(`/api/links/${l.id}/qr`).send({ location_label: 'Library poster' }).expect(201);
    await visit(`/qr-test?src=qr&q=${qr.body.qr.id}`).expect(302);
    await visit('/qr-test?src=bio').expect(302);
    const rows = await waitFor(() => clicks(l.id), (x) => x.length === 2);
    expect(rows.map((r) => r.source).sort()).toEqual(['bio', 'qr']);
    expect(rows.find((r) => r.source === 'qr')!.qrId).toBe(qr.body.qr.id);
    const png = await owner.get(`/api/qr/${qr.body.qr.id}.png`);
    expect(png.status).toBe(200);
    expect(png.headers['content-type']).toBe('image/png');
    const svg = await owner.get(`/api/qr/${qr.body.qr.id}.svg`);
    expect(svg.headers['content-type']).toContain('image/svg+xml');
    expect(Buffer.from(svg.body).toString()).toContain('<svg');
  });
  it('device rules: iPhone goes to the App Store, others to the main URL', async () => {
    await create({ destination: 'https://example.com/app', alias: 'get-app', rules: [{ device: 'ios', destination: 'https://apps.apple.com/app/x' }] });
    expect((await visit('/get-app', IPHONE_UA)).headers.location).toBe('https://apps.apple.com/app/x');
    expect((await visit('/get-app', HUMAN_UA)).headers.location).toBe('https://example.com/app');
  });
  it('device rules can be changed, added and removed after the link is made; the next visit follows them', async () => {
    const l = await create({ destination: 'https://example.com/edit-rules', alias: 'edit-rules', rules: [{ device: 'ios', destination: 'https://apps.apple.com/app/old' }] });
    // Visit first so the old rules sit in the Redis cache; the edit must clear it.
    expect((await visit('/edit-rules', IPHONE_UA)).headers.location).toBe('https://apps.apple.com/app/old');

    const p = await owner.patch(`/api/links/${l.id}`).send({
      rules: [
        { device: 'ios', destination: 'https://apps.apple.com/app/new' },
        { device: 'desktop', destination: 'https://example.com/desktop' },
      ],
    });
    expect(p.status).toBe(200);
    expect(p.body.link.rules.map((r: { device: string; priority: number }) => [r.device, r.priority])).toEqual([['ios', 1], ['desktop', 2]]);
    expect((await visit('/edit-rules', IPHONE_UA)).headers.location).toBe('https://apps.apple.com/app/new');

    const bad = await owner.patch(`/api/links/${l.id}`).send({ rules: [{ device: 'ios', destination: 'javascript:alert(1)' }] });
    expect(bad.status).toBe(400);
    expect(bad.body.error.fields[0].field).toBe('rules.0.destination');

    await owner.patch(`/api/links/${l.id}`).send({ rules: [] }).expect(200);
    expect((await visit('/edit-rules', IPHONE_UA)).headers.location).toBe('https://example.com/edit-rules');
    const h = await owner.get(`/api/links/${l.id}/history`);
    expect(h.body.items.map((i: { text: string }) => i.text)).toEqual(expect.arrayContaining(['Device rules updated (2 rules)', 'Device rules updated (0 rules)']));
  });
  it('unknown code → 404 page with a "Did you mean" hint for close aliases', async () => {
    await create({ destination: 'https://example.com/i', alias: 'innovista26' });
    const r = await visit('/innovsta26');
    expect(r.status).toBe(404);
    expect(r.text).toContain('We can’t find this link');
    expect(r.text).toContain('lp.example.com/innovista26');
  });
});

describe('edge case 7: limit 100 and many clicks at once', () => {
  it('exactly 100 counted; click 101+ sees "All spots are taken"', async () => {
    const l = await create({ destination: 'https://example.com/limited', alias: 'limit-100', clickLimit: 100 });
    const results = await Promise.all(Array.from({ length: 150 }, () => visit('/limit-100')));
    const passed = results.filter((r) => r.status === 302).length;
    const full = results.filter((r) => r.status === 410);
    expect(passed).toBe(100);
    expect(full).toHaveLength(50);
    expect(full[0].text).toContain('All spots are taken');
    const row = await prisma.link.findUniqueOrThrow({ where: { id: l.id } });
    expect(row.clickCount).toBe(100);
    await waitFor(() => prisma.clickEvent.count({ where: { linkId: l.id, counted: true } }), (n) => n === 100);
  });
});

describe('edge case 8: wrong password', () => {
  it('no redirect, not counted, 5 tries then wait; right password unlocks for 30 min', async () => {
    const l = await create({ destination: 'https://example.com/secret', alias: 'private-x', password: 'judge-pass', clickLimit: 3 });
    const ip = nextIp();
    const gate = await visit('/private-x', HUMAN_UA, ip);
    expect(gate.status).toBe(401);
    expect(gate.text).toContain('This link is private');

    const tryPw = (password: string) =>
      request(srv).post('/private-x/unlock').set('User-Agent', HUMAN_UA).set('X-Forwarded-For', ip).type('form').send({ password }).redirects(0);
    const statuses = [];
    for (let i = 0; i < 5; i++) statuses.push((await tryPw('wrong')).status);
    expect(statuses).toEqual([401, 401, 401, 401, 429]);
    const locked = await tryPw('judge-pass');
    expect(locked.status).toBe(429); // even the right one waits now
    expect(locked.text).toContain('wait 5 minutes');
    expect((await prisma.link.findUniqueOrThrow({ where: { id: l.id } })).clickCount).toBe(0);
    expect(await prisma.clickEvent.count({ where: { linkId: l.id } })).toBe(0);

    // Another visitor with the right password.
    const agent = request.agent(srv);
    const ip2 = nextIp();
    const ok = await agent.post('/private-x/unlock').set('User-Agent', HUMAN_UA).set('X-Forwarded-For', ip2).type('form').send({ password: 'judge-pass', src: 'qr' });
    expect(ok.status).toBe(200);
    expect(ok.text).toContain('Unlocked');
    expect(String(ok.headers['set-cookie'])).toMatch(/lp_unlock_private-x=.*Path=\/private-x.*HttpOnly/i);
    const go = await agent.get('/private-x').set('User-Agent', HUMAN_UA).set('X-Forwarded-For', ip2).redirects(0);
    expect(go.status).toBe(302);
    expect(go.headers.location).toBe('https://example.com/secret');
    expect((await prisma.link.findUniqueOrThrow({ where: { id: l.id } })).clickCount).toBe(1);
  });
});

describe('edge case 9: preview bots', () => {
  it.each([WHATSAPP_UA, 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)', 'TelegramBot (like TwitterBot)'])(
    '%s redirects, is saved as a bot, never counted',
    async (ua) => {
      const alias = 'bot-' + Math.random().toString(36).slice(2, 8);
      const l = await create({ destination: 'https://example.com/b', alias, clickLimit: 1 });
      const r = await visit(`/${alias}`, ua);
      expect(r.status).toBe(302);
      const rows = await waitFor(() => clicks(l.id), (x) => x.length === 1);
      expect(rows[0].clickType).toBe('preview_bot');
      expect(rows[0].counted).toBe(false);
      // The bot did not use up the only slot: a human still gets in.
      expect((await visit(`/${alias}`)).status).toBe(302);
    },
  );
  it('a burst of more than 10 hits in 10 s from one visitor is suspicious, not counted', async () => {
    const l = await create({ destination: 'https://example.com/burst', alias: 'burst-x' });
    const ip = nextIp();
    for (let i = 0; i < 12; i++) await visit('/burst-x', HUMAN_UA, ip).expect(302);
    const rows = await waitFor(() => clicks(l.id), (x) => x.length === 12);
    expect(rows.filter((r) => r.counted)).toHaveLength(10);
    expect(rows.filter((r) => r.clickType === 'suspicious')).toHaveLength(2);
  });
  it('empty user agent is suspicious', async () => {
    const l = await create({ destination: 'https://example.com/e', alias: 'empty-ua' });
    await request(srv).get('/empty-ua').set('User-Agent', '').redirects(0).expect(302);
    const rows = await waitFor(() => clicks(l.id), (x) => x.length === 1);
    expect(rows[0]).toMatchObject({ clickType: 'suspicious', counted: false });
  });
});

describe('edge case 10: expired or disabled', () => {
  it('expired → 410 page, or 302 to the fallback; old analytics stay', async () => {
    const l = await create({ destination: 'https://example.com/x', alias: 'was-live', expiresOn: '2099-01-01' });
    await visit('/was-live').expect(302);
    await waitFor(() => clicks(l.id), (x) => x.length === 1);
    await prisma.link.update({ where: { id: l.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await redis()!.del('link:was-live');
    const r = await visit('/was-live');
    expect(r.status).toBe(410);
    expect(r.text).toContain('This link has expired');
    await prisma.link.update({ where: { id: l.id }, data: { fallbackUrl: 'https://example.com/results' } });
    await redis()!.del('link:was-live');
    const f = await visit('/was-live');
    expect(f.status).toBe(302);
    expect(f.headers.location).toBe('https://example.com/results');
    const d = await owner.get(`/api/links/${l.id}`);
    expect(d.body.link.status).toBe('expired');
    expect(d.body.stats.humanClicks).toBe(1);
  });
});

describe('link life: the owner switches the state', () => {
  it('expired → limit reached → active changes what the very next visit gets, and history says why', async () => {
    const l = await create({ destination: 'https://example.com/life', alias: 'life-switch' });
    await visit('/life-switch').expect(302); // 1 human click; also puts the link in the cache
    const set = (state: string) => owner.post(`/api/links/${l.id}/state`).send({ state });

    const exp = await set('expired');
    expect(exp.status).toBe(200);
    expect(exp.body.link.status).toBe('expired');
    expect((await visit('/life-switch')).text).toContain('This link has expired');

    const lim = await set('limit_reached');
    expect(lim.body.link).toMatchObject({ status: 'limit_reached', clickLimit: 1, expiresAt: null });
    const full = await visit('/life-switch');
    expect(full.status).toBe(410);
    expect(full.text).toContain('All spots are taken');

    const act = await set('active');
    expect(act.body.link).toMatchObject({ status: 'active', clickLimit: null, expiresAt: null });
    expect((await visit('/life-switch')).headers.location).toBe('https://example.com/life');

    const h = await owner.get(`/api/links/${l.id}/history`);
    expect(h.body.items.map((i: { text: string }) => i.text)).toEqual(
      expect.arrayContaining(['Expiry removed', 'Click limit set to 1', 'Click limit removed (was 1)']),
    );
  });
  it('limit reached with no clicks yet stops the first visitor', async () => {
    const l = await create({ destination: 'https://example.com/life0', alias: 'life-zero' });
    const r = await owner.post(`/api/links/${l.id}/state`).send({ state: 'limit_reached' });
    expect(r.body.link).toMatchObject({ status: 'limit_reached', clickLimit: 0 });
    expect((await visit('/life-zero')).status).toBe(410);
  });
  it('choosing the state it is already in changes nothing', async () => {
    const l = await create({ destination: 'https://example.com/life-same', alias: 'life-same' });
    await owner.post(`/api/links/${l.id}/state`).send({ state: 'active' }).expect(200);
    const h = await owner.get(`/api/links/${l.id}/history`);
    expect(h.body.items).toHaveLength(1); // only "created"
  });
  it('the owner cannot disable here, and cannot switch a link an admin turned off', async () => {
    const l = await create({ destination: 'https://example.com/life-off', alias: 'life-off' });
    expect((await owner.post(`/api/links/${l.id}/state`).send({ state: 'disabled' })).status).toBe(400);
    await admin.post(`/api/admin/links/${l.id}/disable`).send({ reason: 'Spam or scam' }).expect(200);
    const r = await owner.post(`/api/links/${l.id}/state`).send({ state: 'active' });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('LINK_DISABLED');
    expect((await visit('/life-off')).status).toBe(410);
  });
});

describe('edge case 14: cache has an old copy after disable', () => {
  it('disable deletes the cache key, so the very next visit is blocked; restore works the same way', async () => {
    const l = await create({ destination: 'https://example.com/hot', alias: 'hot-link' });
    await visit('/hot-link').expect(302);
    expect(await cachedSnapshotExists('hot-link')).toBe(true);

    const dis = await admin.post(`/api/admin/links/${l.id}/disable`).send({ reason: 'Spam or scam' });
    expect(dis.status).toBe(200);
    expect(await cachedSnapshotExists('hot-link')).toBe(false);
    const blocked = await visit('/hot-link');
    expect(blocked.status).toBe(410);
    expect(blocked.text).toContain('This link has been turned off');

    // Analytics are kept, and the action is in the audit log.
    expect((await owner.get(`/api/links/${l.id}`)).body.stats.humanClicks).toBe(1);
    const audit = await admin.get('/api/admin/audit');
    expect(audit.body.items[0]).toMatchObject({ text: 'Cleared cache for', actor: 'System' });
    expect(audit.body.items[1]).toMatchObject({ text: 'Disabled', reason: 'Spam or scam', actor: 'Platform admin' });

    // Restore needs a reason too, like disable.
    const restore = (body: object) => admin.post(`/api/admin/links/${l.id}/restore`).send(body);
    expect((await restore({})).status).toBe(400);
    expect((await restore({ reason: '   ' })).status).toBe(400);
    expect((await restore({ reason: 'ok' })).status).toBe(400); // under 5 characters
    expect((await restore({ reason: 'x'.repeat(301) })).status).toBe(400);
    expect((await visit('/hot-link')).status).toBe(410);

    expect((await restore({ reason: '  Owner removed the spam page  ' })).status).toBe(200);
    expect((await visit('/hot-link')).status).toBe(302);
    // Stored trimmed, and the row names the owner so it reaches their notices.
    const row = await prisma.auditLog.findFirst({ where: { linkId: l.id, action: 'restored' } });
    expect(row).toMatchObject({ reason: 'Owner removed the spam page', subjectUserId: ownerActor.id });
  });
  it('the owner cannot disable or restore (admin only)', async () => {
    const l = await create({ destination: 'https://example.com/own', alias: 'own-link' });
    expect((await owner.post(`/api/admin/links/${l.id}/disable`).send({ reason: 'x' })).status).toBe(403);
  });
  it('blocking a domain stops existing links at once and flags them', async () => {
    const l = await create({ destination: 'https://soon-bad.example/offer', alias: 'soon-bad' });
    await visit('/soon-bad').expect(302);
    const add = await admin.post('/api/admin/blocklist').send({ domain: 'soon-bad.example', reason: 'Scam offers' });
    expect(add.status).toBe(201);
    expect(add.body.domain.linksHit).toBe(1);
    expect((await visit('/soon-bad')).status).toBe(410);
    const flags = await admin.get('/api/admin/flagged');
    expect(flags.body.items.some((f: { link: { id: string }; type: string }) => f.link.id === l.id && f.type === 'blocked')).toBe(true);
    // New links to it are refused too.
    expect((await owner.post('/api/links').send({ destination: 'https://soon-bad.example/2' })).status).toBe(400);
  });
});

describe('live stream', () => {
  it('needs a valid short-lived token', async () => {
    expect((await request(srv).get('/stream?token=nope')).status).toBe(401);
    const t = await owner.get('/api/stream-token');
    expect(t.status).toBe(200);
    expect(t.body.url).toContain('/stream?token=');
  });
});
