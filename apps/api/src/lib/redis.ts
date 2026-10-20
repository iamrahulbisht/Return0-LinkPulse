import IORedis, { type Redis } from 'ioredis';
import { config } from './config';

/**
 * Redis is optional. Without it (or while it is down) LinkPulse still works:
 * links are read from Postgres and clicks are written straight to Postgres. Slower, but no click is lost.
 */
let client: Redis | null = null;

function makeClient(opts: { forWorker?: boolean } = {}): Redis | null {
  if (!config.REDIS_URL) return null;
  const c = new IORedis(config.REDIS_URL, {
    // Fail fast instead of queueing commands while Redis is down.
    enableOfflineQueue: opts.forWorker ? true : false,
    maxRetriesPerRequest: opts.forWorker ? null : 1,
    connectTimeout: 3000,
    lazyConnect: false,
    retryStrategy: (times) => Math.min(times * 500, 5000),
  });
  let warned = false;
  c.on('error', (err) => {
    if (!warned) console.warn(`[redis] ${err.message} (falling back to Postgres while it is down)`);
    warned = true;
  });
  c.on('ready', () => {
    warned = false;
  });
  return c;
}

export function redis(): Redis | null {
  if (client === null && config.REDIS_URL) client = makeClient();
  return client;
}

/** Usable right now? Callers fall back to Postgres or memory when this is false. */
export function redisReady(): boolean {
  const c = redis();
  return !!c && c.status === 'ready';
}

/** A separate connection (BullMQ workers and pub/sub subscribers need their own). */
export function newRedisConnection(forWorker = true): Redis | null {
  return makeClient({ forWorker });
}

export async function closeRedis(): Promise<void> {
  if (client) {
    await client.quit().catch(() => undefined);
    client = null;
  }
}
