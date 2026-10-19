import http from 'http';
import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { prisma } from '../../src/lib/db';
import { loginAs, makeUser, startTestApp, stopTestApp } from '../helpers';

let srv: http.Server;
let me: Awaited<ReturnType<typeof loginAs>>;
let other: Awaited<ReturnType<typeof loginAs>>;
let myId: string;

const CSV = fs.readFileSync(path.join(__dirname, '../../../../docs/sample-import.csv'));

beforeAll(async () => {
  srv = await startTestApp();
  const u = await makeUser('me@test.dev');
  myId = u.id;
  await makeUser('other@test.dev');
  me = await loginAs(srv, 'me@test.dev');
  other = await loginAs(srv, 'other@test.dev');
  await prisma.blockedDomain.create({ data: { domain: 'free-recharge-offer.example.net', reason: 'Scam offers' } });
  await other.post('/api/links').send({ destination: 'https://innovista.example.org', alias: 'innovista' }).expect(201);
  await me.post('/api/links').send({ destination: 'https://innovista.gehu.ac.in/schedule', alias: 'schedule' }).expect(201);
});
afterAll(stopTestApp);

describe('edge case 13: CSV with bad rows', () => {
  it('reports every row; valid rows still import into the campaign', async () => {
    const camp = await me.post('/api/campaigns').send({ name: 'INNOVISTA 2026', startsAt: '2026-10-01', endsAt: '2026-10-30' }).expect(201);
    const pre = await me.post('/api/import/preview').attach('file', CSV, 'innovista_links.csv');
    expect(pre.status).toBe(200);
    expect(pre.body.summary).toMatchObject({ total: 10, valid: 6, alias_taken: 2, invalid_url: 1, blocked_domain: 1 });
    const byAlias = Object.fromEntries(pre.body.rows.map((r: { alias: string }) => [r.alias, r]));
    expect(byAlias.schedule.fix).toMatch(/Already a link of yours/);
    expect(byAlias.innovista.fix).toMatch(/Someone already uses/);
    expect(byAlias.merch.fix).toMatch(/should start with https/);
    expect(byAlias['prize-claim'].result).toBe('blocked_domain');
    expect(await prisma.link.count({ where: { ownerId: myId } })).toBe(1); // preview saves nothing

    const valid = pre.body.rows.filter((r: { result: string }) => r.result === 'valid');
    const commit = await me.post('/api/import/commit').send({ campaignId: camp.body.campaign.id, rows: valid });
    expect(commit.status).toBe(200);
    expect(commit.body.imported).toBe(6);
    expect(await prisma.link.count({ where: { campaignId: camp.body.campaign.id } })).toBe(6);
    // Re-checked on commit: sending a bad row back does not sneak it in.
    const sneaky = await me.post('/api/import/commit').send({ rows: [{ row: 1, alias: 'evil', destination: 'javascript:alert(1)', tags: [] }] });
    expect(sneaky.body.imported).toBe(0);
  });
  it('a duplicate alias inside the file is reported on the second row', async () => {
    const csv = Buffer.from('alias,destination\ntwin,https://a.example.com\ntwin,https://b.example.com\n');
    const pre = await me.post('/api/import/preview').attach('file', csv, 'dup.csv');
    expect(pre.body.rows.map((r: { result: string }) => r.result)).toEqual(['valid', 'duplicate_in_file']);
  });
  it('rejects a file without a destination column', async () => {
    const pre = await me.post('/api/import/preview').attach('file', Buffer.from('a,b\n1,2\n'), 'x.csv');
    expect(pre.status).toBe(400);
  });
});

describe('bulk import by pasting links', () => {
  it('splits on spaces and new lines, checks each link, and imports only the valid ones', async () => {
    const text = 'https://paste-a.example.com\nhttps://paste-b.example.com   https://free-recharge-offer.example.net/win\n\nhtps://typo.example.com\n';
    const before = await prisma.link.count({ where: { ownerId: myId } });
    const pre = await me.post('/api/import/preview-text').send({ text });
    expect(pre.status).toBe(200);
    expect(pre.body.fileName).toBe('Pasted links');
    expect(pre.body.summary).toMatchObject({ total: 4, valid: 2, blocked_domain: 1, invalid_url: 1 });
    expect(pre.body.rows.map((r: { row: number; alias: string }) => [r.row, r.alias])).toEqual([[1, ''], [2, ''], [3, ''], [4, '']]);
    expect(await prisma.link.count({ where: { ownerId: myId } })).toBe(before); // preview saves nothing

    const valid = pre.body.rows.filter((r: { result: string }) => r.result === 'valid');
    const commit = await me.post('/api/import/commit').send({ rows: valid });
    expect(commit.status).toBe(200);
    expect(commit.body.imported).toBe(2);
    const made = await prisma.link.findMany({ where: { destination: { startsWith: 'https://paste-' } }, select: { customAlias: true } });
    expect(made).toHaveLength(2);
    expect(made.every((l) => !l.customAlias)).toBe(true);
  });
  it('rejects empty text and more than 500 links', async () => {
    expect((await me.post('/api/import/preview-text').send({ text: ' \n\n ' })).status).toBe(400);
    const many = Array.from({ length: 501 }, (_, i) => `https://m${i}.example.com`).join('\n');
    const r = await me.post('/api/import/preview-text').send({ text: many });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('TOO_MANY_ROWS');
  });
  it('needs a session', async () => {
    const r = await request(srv).post('/api/import/preview-text').send({ text: 'https://x.example.com' });
    expect(r.status).toBe(401);
  });
});

describe('analytics', () => {
  beforeAll(async () => {
    const link = await prisma.link.findUniqueOrThrow({ where: { code: 'schedule' } });
    // 18 Oct 23:00 IST (17:30 UTC) and 19 Oct 00:30 IST (19:00 UTC): different IST days.
    const t1 = new Date(Date.now() - 2 * 86400_000);
    t1.setUTCHours(17, 30, 0, 0);
    const t2 = new Date(t1.getTime() + 90 * 60_000);
    const base = { linkId: link.id, source: 'link' as const, device: 'android', visitorHash: 'v1' };
    await prisma.clickEvent.createMany({
      data: [
        { ...base, clickedAt: t1, clickType: 'human', counted: true, city: 'Dehradun' },
        { ...base, clickedAt: t2, clickType: 'human', counted: true, city: 'Dehradun', visitorHash: 'v2' },
        { ...base, clickedAt: t2, clickType: 'preview_bot', counted: false, device: 'bot' },
      ],
    });
  });
  it('edge case 15: day buckets are IST days', async () => {
    const r = await me.get('/api/analytics/timeseries?period=7d');
    expect(r.status).toBe(200);
    expect(r.body.points).toHaveLength(7);
    expect(r.body.timezone).toBe('Asia/Kolkata');
    const nonZero = r.body.points.filter((p: { human: number }) => p.human > 0);
    expect(nonZero).toHaveLength(2); // split at IST midnight, not UTC midnight
    expect(r.body.points.reduce((a: number, p: { bots: number }) => a + p.bots, 0)).toBe(1);
  });
  it('overview counts humans, uniques and bots apart; another user sees none of it', async () => {
    const mine = await me.get('/api/analytics/overview?period=7d');
    expect(mine.body).toMatchObject({ humanClicks: 2, uniqueVisitors: 2, botsFiltered: 1 });
    const theirs = await other.get('/api/analytics/overview?period=7d');
    expect(theirs.body.humanClicks).toBe(0);
    const cities = await me.get('/api/analytics/cities?period=7d');
    expect(cities.body.items[0]).toMatchObject({ city: 'Dehradun', count: 2 });
    const devices = await me.get('/api/analytics/devices?period=7d');
    expect(devices.body.items[0]).toMatchObject({ device: 'android', count: 2, pct: 100 });
  });
});

describe('upload limits', () => {
  it('a CSV over 1 MB gets a clear 413, not a 500', async () => {
    const big = Buffer.alloc(1024 * 1024 + 10, 'a');
    const r = await me.post('/api/import/preview').attach('file', big, 'big.csv');
    expect(r.status).toBe(413);
    expect(r.body.error.code).toBe('TOO_LARGE');
  });
});
