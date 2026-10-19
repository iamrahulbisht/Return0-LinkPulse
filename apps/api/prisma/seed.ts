/**
 * Demo seed. Everything here is clearly SAMPLE data for the hackathon demo.
 * Repeatable mix: a seeded random generator makes ~2,000 click events every run
 * (relative to "now", so charts are never empty).
 *
 * Passwords come from env, never from the repo:
 *   SEED_PASSWORD       → admin@ / team@ / other@linkpulse.test
 *   SEED_LINK_PASSWORD  → the private demo link lp/innovista26 (defaults to SEED_PASSWORD)
 *
 * WARNING: wipes all tables first. In production it refuses unless SEED_ALLOW_RESET=true.
 */
import 'dotenv/config';
import { createHash } from 'crypto';
import bcrypt from 'bcryptjs';
import IORedis from 'ioredis';
import { PrismaClient, type ClickSource, type ClickType, type Device } from '@prisma/client';
import { endOfIstDay } from '../src/logic/time';
import { runAlertsJob } from '../src/queue/alerts';

const prisma = new PrismaClient();

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261020);
const pick = <T,>(items: [T, number][]): T => {
  const total = items.reduce((a, [, w]) => a + w, 0);
  let r = rand() * total;
  for (const [v, w] of items) if ((r -= w) <= 0) return v;
  return items[items.length - 1][0];
};

const HOUR = 3600_000;
const DAY = 24 * HOUR;
const now = new Date();
const daysAgo = (d: number) => new Date(now.getTime() - d * DAY);
const istDate = (key: string) => new Date(`${key}T00:00:00Z`);

// IST hour weights: quiet at night, busy in the evening.
const HOUR_W: [number, number][] = Array.from({ length: 24 }, (_, h) => [h, h < 6 ? 1 : h < 9 ? 3 : h < 17 ? 6 : h < 22 ? 9 : 3]);

function randomTimeBetween(from: Date, to: Date): Date {
  for (let i = 0; i < 20; i++) {
    const t = from.getTime() + rand() * (to.getTime() - from.getTime());
    const istHour = new Date(t + 5.5 * HOUR).getUTCHours();
    const w = HOUR_W[istHour][1] / 9;
    if (rand() < w) return new Date(t);
  }
  return new Date(from.getTime() + rand() * (to.getTime() - from.getTime()));
}

const DEVICES: [{ device: string; os: string; browser: string }, number][] = [
  [{ device: 'android', os: 'Android', browser: 'Chrome' }, 50],
  [{ device: 'android', os: 'Android', browser: 'Samsung Internet' }, 8],
  [{ device: 'ios', os: 'iOS', browser: 'Mobile Safari' }, 21],
  [{ device: 'ios', os: 'iOS', browser: 'Chrome' }, 3],
  [{ device: 'desktop', os: 'Windows', browser: 'Edge' }, 8],
  [{ device: 'desktop', os: 'Windows', browser: 'Chrome' }, 7],
  [{ device: 'desktop', os: 'macOS', browser: 'Safari' }, 3],
];
const CITIES: [string | null, number][] = [
  ['Dehradun', 34], ['Haldwani', 22], ['Delhi', 14], ['Lucknow', 8], ['Nainital', 6],
  ['Bhimtal', 4], ['Mumbai', 3], ['Bengaluru', 3], [null, 6],
];
const BOTS: [{ browser: string; type: ClickType }, number][] = [
  [{ browser: 'WhatsApp preview', type: 'preview_bot' }, 50],
  [{ browser: 'Telegram preview', type: 'preview_bot' }, 12],
  [{ browser: 'Slack preview', type: 'preview_bot' }, 8],
  [{ browser: 'Search crawler', type: 'preview_bot' }, 10],
  [{ browser: 'Link scanner', type: 'scanner' }, 12],
  [{ browser: 'No user agent', type: 'suspicious' }, 8],
];

async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.SEED_ALLOW_RESET !== 'true') {
    throw new Error('Refusing to wipe a production database. Set SEED_ALLOW_RESET=true if you really mean it.');
  }
  const userPassword = process.env.SEED_PASSWORD;
  if (!userPassword || userPassword.length < 8) throw new Error('Set SEED_PASSWORD (8+ characters) in apps/api/.env first.');
  const linkPassword = process.env.SEED_LINK_PASSWORD || userPassword;
  const salt = process.env.HASH_SALT ?? 'seed';

  console.log('Wiping tables…');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE
    click_events, link_alerts, audit_log, bio_page_links, bio_pages, qr_codes, redirect_rules, link_tags,
    tags, links, campaigns, folders, workspace_invites, workspace_members, workspaces, blocked_domains, users RESTART IDENTITY CASCADE`);

  const pw = await bcrypt.hash(userPassword, 10);
  const admin = await prisma.user.create({ data: { email: 'admin@linkpulse.test', name: 'Platform admin', role: 'admin', passwordHash: pw } });
  const team = await prisma.user.create({ data: { email: 'team@linkpulse.test', name: 'Piyush N.', role: 'user', passwordHash: pw } });
  const other = await prisma.user.create({ data: { email: 'other@linkpulse.test', name: 'Guest user', role: 'user', passwordHash: pw } });

  const mkWs = async (name: string, ownerId: string) => {
    const ws = await prisma.workspace.create({ data: { name, ownerId } });
    await prisma.workspaceMember.create({ data: { workspaceId: ws.id, userId: ownerId, role: 'owner' } });
    return ws;
  };
  const techClub = await mkWs('Tech Club', team.id);
  await mkWs('Platform admin', admin.id);
  const guestWs = await mkWs('guest workspace 1093', other.id);
  const [events, library] = await Promise.all([
    prisma.folder.create({ data: { workspaceId: techClub.id, name: 'Events' } }),
    prisma.folder.create({ data: { workspaceId: techClub.id, name: 'Library' } }),
  ]);

  const camp = async (name: string, s: string, e: string) =>
    prisma.campaign.create({ data: { name, startsAt: istDate(s), endsAt: istDate(e), ownerId: team.id, workspaceId: techClub.id } });
  const innovista = await camp('INNOVISTA 2026', '2026-10-01', '2026-10-30');
  const hackathon = await camp('Hackathon 2026', '2026-10-10', '2026-10-21');
  const libDrive = await camp('Library Drive', '2026-10-01', '2026-10-10');
  await camp('Freshers Welcome', '2026-11-01', '2026-11-07');

  await prisma.blockedDomain.createMany({
    data: [
      { domain: 'free-recharge-offer.example.net', reason: 'Scam offers', addedBy: admin.id, createdAt: daysAgo(2) },
      { domain: 'bit-scam.example', reason: 'Phishing', addedBy: admin.id, createdAt: daysAgo(6) },
    ],
  });

  const tagIds = new Map<string, string>();
  const tag = async (name: string) => {
    if (!tagIds.has(name)) tagIds.set(name, (await prisma.tag.create({ data: { ownerId: team.id, workspaceId: techClub.id, name } })).id);
    return tagIds.get(name)!;
  };

  interface Spec {
    code: string;
    destination: string;
    title?: string;
    campaignId?: string;
    folderId?: string;
    tags?: string[];
    expiresAt?: Date;
    clickLimit?: number;
    password?: boolean;
    disabled?: string;
    createdDaysAgo: number;
    rules?: { device: Device; destination: string }[];
    human: number; // counted human clicks to generate
    bots: number;
    custom?: boolean;
    ownerId?: string;
    workspaceId?: string;
  }
  const specs: Spec[] = [
    { code: 'innovista26', destination: 'https://docs.google.com/forms/d/e/innovista-2026/viewform', title: 'the INNOVISTA 2026 registration form', campaignId: innovista.id, folderId: events.id, tags: ['registration', 'whatsapp'], expiresAt: endOfIstDay('2026-10-30'), clickLimit: 500, password: true, createdDaysAgo: 12, human: 413, bots: 27 },
    { code: 'hack-rules', destination: 'https://hackathon.gehu.ac.in/rules', campaignId: hackathon.id, folderId: events.id, tags: ['rules'], expiresAt: endOfIstDay('2026-10-20'), createdDaysAgo: 9, human: 268, bots: 22 },
    { code: 'fest-pass', destination: 'https://tickets.example.com/innovista/pass', campaignId: innovista.id, folderId: events.id, tags: ['tickets'], clickLimit: 200, createdDaysAgo: 11, human: 200, bots: 31 },
    { code: 'lib-drive', destination: 'https://library.gehu.ac.in/book-drive', campaignId: libDrive.id, folderId: library.id, tags: ['poster'], expiresAt: endOfIstDay('2026-10-10'), createdDaysAgo: 17, human: 190, bots: 14 },
    { code: 'club-join', destination: 'https://chat.whatsapp.com/invite/techclub', tags: ['social'], createdDaysAgo: 28, human: 152, bots: 70 },
    { code: 'get-app', destination: 'https://techclub.example.com/app', campaignId: hackathon.id, tags: ['app'], createdDaysAgo: 8, human: 96, bots: 6,
      rules: [{ device: 'ios', destination: 'https://apps.apple.com/app/innovista' }, { device: 'android', destination: 'https://play.google.com/store/apps/innovista' }] },
    { code: 'schedule', destination: 'https://innovista.gehu.ac.in/schedule', campaignId: innovista.id, folderId: events.id, tags: ['poster', 'social'], expiresAt: endOfIstDay('2026-10-30'), createdDaysAgo: 10, human: 74, bots: 9 },
    { code: 'free-recharge', destination: 'https://free-recharge-offer.example.net', disabled: 'Spam or scam', createdDaysAgo: 5, human: 57, bots: 12 },
    { code: 'donate-books', destination: 'https://library.gehu.ac.in/donate', campaignId: libDrive.id, folderId: library.id, tags: ['poster'], expiresAt: endOfIstDay('2026-10-10'), createdDaysAgo: 17, human: 84, bots: 4 },
    { code: 'mentors', destination: 'https://hackathon.gehu.ac.in/mentors', campaignId: hackathon.id, folderId: events.id, createdDaysAgo: 7, human: 61, bots: 5 },
    { code: 'welcome', destination: 'https://techclub.example.com/freshers', title: 'the Freshers Welcome page', tags: ['social'], createdDaysAgo: 1, human: 0, bots: 0 },
    { code: 'k7Qm2xA', destination: 'https://techclub.example.com/notes/week-7', custom: false, createdDaysAgo: 3, human: 23, bots: 2 },
    // Other users (for the 403 test, the "taken alias" demo and the admin abuse monitor).
    { code: 'innovista', destination: 'https://innovista.example.org', ownerId: other.id, workspaceId: guestWs.id, createdDaysAgo: 20, human: 12, bots: 1 },
    { code: 'win-iphone', destination: 'https://win-prize-now.example/claim', ownerId: other.id, workspaceId: guestWs.id, createdDaysAgo: 2, human: 18, bots: 44 },
    { code: 'guest-notes', destination: 'https://guest.example.org/notes', ownerId: other.id, workspaceId: guestWs.id, createdDaysAgo: 4, human: 9, bots: 0 },
  ];

  const linkPwHash = await bcrypt.hash(linkPassword, 10);
  const links = new Map<string, { id: string; spec: Spec; qrIds: string[] }>();
  for (const s of specs) {
    const createdAt = daysAgo(s.createdDaysAgo);
    const link = await prisma.link.create({
      data: {
        code: s.code,
        customAlias: s.custom ?? true,
        destination: s.destination,
        title: s.title ?? null,
        ownerId: s.ownerId ?? team.id,
        workspaceId: s.workspaceId ?? techClub.id,
        folderId: s.folderId ?? null,
        campaignId: s.campaignId ?? null,
        expiresAt: s.expiresAt ?? null,
        clickLimit: s.clickLimit ?? null,
        passwordHash: s.password ? linkPwHash : null,
        status: s.disabled ? 'disabled' : 'active',
        disabledReason: s.disabled ?? null,
        createdAt,
        tags: s.tags ? { create: await Promise.all(s.tags.map(async (t) => ({ tagId: await tag(t) }))) } : undefined,
        rules: s.rules ? { create: s.rules.map((r, i) => ({ ...r, priority: i + 1 })) } : undefined,
      },
    });
    await prisma.auditLog.create({
      data: { actorId: s.ownerId ?? team.id, linkId: link.id, action: 'link_created', target: s.code, newValue: { via: 'wizard' }, createdAt },
    });
    links.set(s.code, { id: link.id, spec: s, qrIds: [] });
  }

  // History for the demo link.
  const inno = links.get('innovista26')!;
  await prisma.auditLog.createMany({
    data: [
      { actorId: team.id, linkId: inno.id, action: 'password_added', target: 'innovista26', createdAt: daysAgo(10) },
      { actorId: team.id, linkId: inno.id, action: 'limit_changed', target: 'innovista26', oldValue: { clickLimit: 300 }, newValue: { clickLimit: 500 }, createdAt: daysAgo(3) },
    ],
  });
  const fr = links.get('free-recharge')!;
  await prisma.auditLog.createMany({
    data: [
      { actorId: admin.id, action: 'domain_blocked', target: 'free-recharge-offer.example.net', reason: 'Scam offers', createdAt: daysAgo(2) },
      { actorId: admin.id, linkId: fr.id, action: 'disabled', target: 'free-recharge', oldValue: { status: 'active' }, newValue: { status: 'disabled' }, reason: 'Spam or scam', createdAt: daysAgo(2) },
      { actorId: null, linkId: fr.id, action: 'cache_cleared', target: 'free-recharge', createdAt: daysAgo(2) },
    ],
  });

  // QR codes per poster location.
  const qrSpecs: [string, string][] = [
    ['innovista26', 'Library poster'], ['innovista26', 'Main gate standee'], ['innovista26', 'Canteen table card'],
    ['hack-rules', 'Hackathon help desk'], ['lib-drive', 'Library bookmark'],
  ];
  for (const [code, label] of qrSpecs) {
    const l = links.get(code)!;
    const qr = await prisma.qrCode.create({ data: { linkId: l.id, locationLabel: label, createdAt: daysAgo(l.spec.createdDaysAgo) } });
    l.qrIds.push(qr.id);
  }

  // Click events.
  type Row = {
    linkId: string; qrId: string | null; clickedAt: Date; source: ClickSource; referrer: string | null; device: string;
    os: string | null; browser: string | null; country: string | null; city: string | null; visitorHash: string; clickType: ClickType; counted: boolean;
  };
  const rows: Row[] = [];
  const vh = (code: string, n: number, day: string) => createHash('sha256').update(`${code}:${n}:${day}:${salt}`).digest('hex');
  for (const { id, spec, qrIds } of links.values()) {
    const from = daysAgo(Math.min(spec.createdDaysAgo, 30));
    const end = spec.expiresAt && spec.expiresAt < now ? spec.expiresAt : spec.disabled ? daysAgo(2) : now;
    const visitors = Math.max(1, Math.round(spec.human * 0.75));
    // Weight QR heavily for poster links, so "Scans by poster" is not empty.
    const qrShare = qrIds.length ? 0.45 : 0;
    const make = (at: Date, human: boolean) => {
      const day = new Date(at.getTime() + 5.5 * HOUR).toISOString().slice(0, 10);
      if (!human) {
        const b = pick(BOTS);
        rows.push({ linkId: id, qrId: null, clickedAt: at, source: 'link', referrer: null, device: 'bot', os: null, browser: b.browser, country: null, city: null, visitorHash: vh(spec.code + 'bot', Math.floor(rand() * 40), day), clickType: b.type, counted: false });
        return;
      }
      const d = pick(DEVICES);
      let source: ClickSource = 'link';
      let referrer: string | null = null;
      let qrId: string | null = null;
      const r = rand();
      if (r < qrShare) {
        source = 'qr';
        qrId = qrIds[Math.floor(Math.pow(rand(), 1.6) * qrIds.length)];
      } else if (r < qrShare + 0.12) source = 'bio';
      else if (r < qrShare + 0.4) referrer = d.device === 'android' ? 'android-app://com.whatsapp/' : 'https://web.whatsapp.com/';
      else if (r < qrShare + 0.46) referrer = pick([['https://www.instagram.com/', 2], ['https://t.co/', 1], ['https://www.linkedin.com/', 1]]);
      const city = pick(CITIES);
      rows.push({ linkId: id, qrId, clickedAt: at, source, referrer, device: d.device, os: d.os, browser: d.browser, country: city ? 'IN' : null, city, visitorHash: vh(spec.code, Math.floor(rand() * visitors), day), clickType: 'human', counted: true });
    };
    for (let i = 0; i < spec.human; i++) make(randomTimeBetween(from, end), true);
    for (let i = 0; i < spec.bots; i++) make(randomTimeBetween(from, end), false);
  }
  // A traffic spike in the last hour on club-join (for the abuse monitor demo), and a bot surge in 24h.
  const cj = links.get('club-join')!;
  for (let i = 0; i < 46; i++) {
    const at = new Date(now.getTime() - rand() * 50 * 60_000);
    const d = pick(DEVICES);
    rows.push({ linkId: cj.id, qrId: null, clickedAt: at, source: 'link', referrer: 'android-app://com.whatsapp/', device: d.device, os: d.os, browser: d.browser, country: 'IN', city: pick(CITIES), visitorHash: vh('club-spike', i, 'x'), clickType: 'human', counted: true });
  }
  for (let i = 0; i < 56; i++) {
    const at = new Date(now.getTime() - rand() * 20 * HOUR);
    rows.push({ linkId: cj.id, qrId: null, clickedAt: at, source: 'link', referrer: null, device: 'bot', os: null, browser: 'WhatsApp preview', country: null, city: null, visitorHash: vh('club-bot', i % 9, 'x'), clickType: 'preview_bot', counted: false });
  }

  for (let i = 0; i < rows.length; i += 500) await prisma.clickEvent.createMany({ data: rows.slice(i, i + 500) });
  // click_count must equal the counted human clicks, so the limit is exact.
  await prisma.$executeRaw`
    UPDATE links l SET click_count = c.n FROM (
      SELECT link_id, COUNT(*)::int AS n FROM click_events WHERE counted GROUP BY link_id
    ) c WHERE c.link_id = l.id`;

  // Bio page.
  const bio = await prisma.bioPage.create({
    data: { ownerId: team.id, workspaceId: techClub.id, slug: 'techclub', title: 'GEHU Tech Club', description: 'Hackathons, workshops and INNOVISTA. Everything we run, in one place.', theme: 'dark' },
  });
  const bioLinks: [string, string][] = [
    ['innovista26', 'Register for INNOVISTA 2026'], ['hack-rules', 'Hackathon rules and judging'], ['schedule', 'Event schedule'],
    ['club-join', 'Join our WhatsApp community'], ['mentors', 'Meet the mentors'],
  ];
  await prisma.bioPageLink.createMany({ data: bioLinks.map(([code, label], i) => ({ pageId: bio.id, linkId: links.get(code)!.id, position: i + 1, label })) });

  // Alerts (expiring, near limit, spike, bots, blocklist) + a visitor report on win-iphone.
  await runAlertsJob(now);
  await prisma.linkAlert.create({
    data: { linkId: links.get('win-iphone')!.id, type: 'report', count: 4, message: 'Reported by 4 visitors as a scam. Most hits are bots.' },
  });

  // Every link got a new id, so cached snapshots in Redis (link:<code>) are now wrong: drop them.
  if (process.env.REDIS_URL) {
    const r = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: 1, connectTimeout: 3000 });
    try {
      let cursor = '0';
      let dropped = 0;
      do {
        const [next, keys] = await r.scan(cursor, 'MATCH', 'link:*', 'COUNT', 500);
        cursor = next;
        if (keys.length) dropped += await r.del(...keys);
      } while (cursor !== '0');
      console.log(`Cleared ${dropped} cached links from Redis.`);
    } catch (e) {
      console.warn('Could not clear the Redis link cache (it expires in 5 minutes anyway):', (e as Error).message);
    } finally {
      r.disconnect();
    }
  }

  const counts = await prisma.clickEvent.groupBy({ by: ['clickType'], _count: true });
  console.log(`Seeded ${specs.length} links, ${rows.length} click events:`, counts.map((c) => `${c.clickType}=${c._count}`).join(', '));
  console.log('Users: admin@linkpulse.test (admin), team@linkpulse.test, other@linkpulse.test — password = SEED_PASSWORD');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
