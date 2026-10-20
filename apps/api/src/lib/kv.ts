import { redis, redisReady } from './redis';

/**
 * Small counters with an expiry (burst check, password tries, report de-duplication).
 * Uses Redis when it is up, otherwise an in-memory map (fine for one API instance).
 */
const memory = new Map<string, { value: number; expiresAt: number }>();

function memGet(key: string): number {
  const e = memory.get(key);
  if (!e) return 0;
  if (e.expiresAt < Date.now()) {
    memory.delete(key);
    return 0;
  }
  return e.value;
}

export async function incrWithTtl(key: string, ttlSeconds: number): Promise<number> {
  if (redisReady()) {
    try {
      const r = redis()!;
      const count = await r.incr(key);
      // First hit starts the window; later hits keep the same expiry.
      if (count === 1) await r.expire(key, ttlSeconds);
      return count;
    } catch {
      // fall through to memory
    }
  }
  const now = Date.now();
  const cur = memGet(key);
  const prev = memory.get(key);
  memory.set(key, { value: cur + 1, expiresAt: prev && prev.expiresAt > now ? prev.expiresAt : now + ttlSeconds * 1000 });
  return cur + 1;
}

export async function getCount(key: string): Promise<number> {
  if (redisReady()) {
    try {
      return Number((await redis()!.get(key)) ?? 0);
    } catch {
      // fall through
    }
  }
  return memGet(key);
}

export async function delKey(key: string): Promise<void> {
  memory.delete(key);
  if (redisReady()) await redis()!.del(key).catch(() => undefined);
}

/** Set only if missing. Returns true if this call set it. */
export async function setOnce(key: string, ttlSeconds: number): Promise<boolean> {
  if (redisReady()) {
    try {
      return (await redis()!.set(key, '1', 'EX', ttlSeconds, 'NX')) === 'OK';
    } catch {
      // fall through
    }
  }
  if (memGet(key) > 0) return false;
  memory.set(key, { value: 1, expiresAt: Date.now() + ttlSeconds * 1000 });
  return true;
}

/** Test helper. */
export function clearMemoryKv(): void {
  memory.clear();
}
