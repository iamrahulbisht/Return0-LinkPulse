import { Queue } from 'bullmq';
import { prisma } from '../lib/db';
import { newRedisConnection, redisReady } from '../lib/redis';
import { parseAgent } from '../logic/device';
import { botLabel, type ClickType } from '../logic/bots';
import type { ClickSource } from '../logic/source';
import { publishClick } from '../sse/hub';

/**
 * A click as it leaves the redirect handler. It holds no raw IP: the handler already turned the
 * IP into a visitor hash and a city, so the IP never reaches Redis or Postgres.
 */
export interface ClickJob {
  linkId: string;
  /** Live clicks go to this workspace's stream. */
  workspaceId: string;
  code: string;
  qrId: string | null;
  source: ClickSource;
  visitorHash: string;
  ua: string;
  referrer: string | null;
  at: string; // ISO UTC
  clickType: ClickType;
  counted: boolean;
  country: string | null;
  city: string | null;
}

export const CLICK_QUEUE = 'clicks';
let queue: Queue | null = null;
let queueConn: ReturnType<typeof newRedisConnection> = null;

function getQueue(): Queue | null {
  if (queue) return queue;
  const connection = newRedisConnection(false);
  if (!connection) return null;
  queueConn = connection;
  queue = new Queue(CLICK_QUEUE, {
    connection,
    defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 500 }, removeOnComplete: true, removeOnFail: 500 },
  });
  queue.on('error', () => undefined); // logged once by the redis client
  return queue;
}

/** Turns a job into a click_events row and tells live dashboards. Used by the worker and the fallback. */
export async function recordClick(job: ClickJob): Promise<void> {
  const human = job.clickType === 'human';
  const agent = parseAgent(job.ua);
  const device = human ? agent.device : 'bot';
  const browser = human ? agent.browser : botLabel(job.ua);
  // A QR id from the URL is only trusted if it belongs to this link.
  let qrId = job.qrId;
  let qrLabel: string | null = null;
  if (qrId) {
    const qr = await prisma.qrCode.findFirst({ where: { id: qrId, linkId: job.linkId }, select: { locationLabel: true } });
    if (qr) qrLabel = qr.locationLabel;
    else qrId = null;
  }
  const row = await prisma.clickEvent.create({
    data: {
      linkId: job.linkId,
      qrId,
      clickedAt: new Date(job.at),
      source: job.source,
      referrer: job.referrer?.slice(0, 500) ?? null,
      device,
      os: human ? agent.os : null,
      browser,
      country: job.country,
      city: job.city,
      visitorHash: job.visitorHash,
      clickType: job.clickType,
      counted: job.counted,
    },
  });
  await publishClick(job.workspaceId, {
    id: row.id.toString(),
    linkId: job.linkId,
    code: job.code,
    at: job.at,
    source: job.source,
    qrLabel,
    referrer: row.referrer,
    device,
    os: row.os,
    browser,
    city: job.city,
    country: job.country,
    clickType: job.clickType,
    counted: job.counted,
  }).catch(() => undefined);
}

/**
 * The redirect never waits for this. With Redis: one fast LPUSH into BullMQ.
 * Without Redis (or if the push fails): write the row straight to Postgres in the background.
 */
export async function enqueueClick(job: ClickJob): Promise<'queued' | 'direct'> {
  const q = redisReady() ? getQueue() : null;
  if (q) {
    try {
      await q.add('click', job);
      return 'queued';
    } catch {
      // fall through to direct write
    }
  }
  void recordClick(job).catch((err) => console.error('[clicks] direct insert failed', err));
  return 'direct';
}

export async function closeQueue(): Promise<void> {
  if (queue) {
    await queue.close().catch(() => undefined);
    queue = null;
  }
  // BullMQ does not close a connection we passed in, so close it here.
  if (queueConn) {
    await queueConn.quit().catch(() => undefined);
    queueConn = null;
  }
}
