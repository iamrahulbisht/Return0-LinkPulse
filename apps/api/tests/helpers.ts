import http from 'http';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/db';
import { closeRedis, redis } from '../src/lib/redis';
import { startSubscriber, stopSubscriber } from '../src/sse/hub';
import { startWorker, stopWorker } from '../src/queue/worker';
import { closeQueue } from '../src/queue/clicks';
import { clearMemoryKv } from '../src/lib/kv';
import { resetBlocklistCache } from '../src/lib/blocklist';

export const PASSWORD = 'correct-horse-9';
export { HUMAN_UA, IPHONE_UA, WHATSAPP_UA } from './fixtures/agents';

let server: http.Server | null = null;

export async function startTestApp(): Promise<http.Server> {
  await resetDb();
  const r = redis();
  if (r) {
    for (let i = 0; i < 50 && r.status !== 'ready'; i++) await new Promise((res) => setTimeout(res, 50));
    await r.flushdb();
  }
  startSubscriber();
  startWorker();
  server = http.createServer(createApp());
  await new Promise<void>((res) => server!.listen(0, res));
  return server;
}

export async function stopTestApp(): Promise<void> {
  if (server) await new Promise((res) => server!.close(res));
  server = null;
  await stopWorker();
  await closeQueue();
  await stopSubscriber();
  await closeRedis();
  await prisma.$disconnect();
}

export async function resetDb(): Promise<void> {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE
    click_events, link_alerts, audit_log, bio_page_links, bio_pages, qr_codes, redirect_rules, link_tags,
    tags, links, campaigns, folders, workspace_invites, workspace_members, workspaces, blocked_domains, users RESTART IDENTITY CASCADE`);
  clearMemoryKv();
  resetBlocklistCache();
}

export async function makeUser(email: string, role: 'user' | 'admin' = 'user') {
  const user = await prisma.user.create({ data: { email, name: email.split('@')[0], role, passwordHash: await bcrypt.hash(PASSWORD, 4) } });
  const ws = await prisma.workspace.create({ data: { name: `${user.name} ws`, ownerId: user.id } });
  await prisma.workspaceMember.create({ data: { workspaceId: ws.id, userId: user.id } });
  return { ...user, workspaceId: ws.id };
}

/** A supertest agent that keeps the session cookie. */
export async function loginAs(srv: http.Server, email: string) {
  const agent = request.agent(srv);
  const res = await agent.post('/api/auth/login').send({ email, password: PASSWORD });
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return agent;
}

export async function waitFor<T>(fn: () => Promise<T>, ok: (v: T) => boolean, timeoutMs = 8000): Promise<T> {
  const start = Date.now();
  let v = await fn();
  while (!ok(v)) {
    if (Date.now() - start > timeoutMs) throw new Error(`waitFor timed out, last value: ${JSON.stringify(v)}`);
    await new Promise((r) => setTimeout(r, 100));
    v = await fn();
  }
  return v;
}

let ipCounter = 1;
/** A fresh fake visitor IP, so the burst check sees different people. */
export const nextIp = () => `10.${(ipCounter >> 16) & 255}.${(ipCounter >> 8) & 255}.${ipCounter++ & 255}`;
