import { prisma } from './db';
import { redis, redisReady } from './redis';
import type { LinkSnapshot } from '../logic/rules';

const TTL_SECONDS = 300;
const key = (code: string) => `link:${code}`;

async function loadFromDb(code: string): Promise<LinkSnapshot | null> {
  const l = await prisma.link.findUnique({
    where: { code },
    include: { rules: { orderBy: { priority: 'asc' } } },
  });
  if (!l) return null;
  return {
    id: l.id,
    code: l.code,
    ownerId: l.ownerId,
    workspaceId: l.workspaceId,
    destination: l.destination,
    status: l.status,
    expiresAt: l.expiresAt ? l.expiresAt.toISOString() : null,
    fallbackUrl: l.fallbackUrl,
    clickLimit: l.clickLimit,
    passwordHash: l.passwordHash,
    title: l.title,
    rules: l.rules.map((r) => ({ device: r.device, destination: r.destination, priority: r.priority })),
  };
}

/** Redis first (5 minute TTL), then Postgres. click_count is never cached: the atomic UPDATE owns it. */
export async function getLinkSnapshot(code: string): Promise<LinkSnapshot | null> {
  if (redisReady()) {
    try {
      const hit = await redis()!.get(key(code));
      const cached = hit ? (JSON.parse(hit) as LinkSnapshot) : null;
      // Snapshots cached before workspaces were shared have no workspaceId: read them again.
      if (cached?.workspaceId) return cached;
    } catch {
      // Redis hiccup: read from Postgres below.
    }
  }
  const snap = await loadFromDb(code);
  if (snap && redisReady()) {
    await redis()!
      .set(key(code), JSON.stringify(snap), 'EX', TTL_SECONDS)
      .catch(() => undefined);
  }
  return snap;
}

/** Call after any edit, disable, restore or blocklist change, so the very next visit sees the new state. */
export async function invalidateLink(code: string): Promise<void> {
  if (!redis()) return;
  try {
    await redis()!.del(key(code));
  } catch {
    // If Redis is down there is nothing cached to go stale; the TTL also bounds staleness.
  }
}

export async function cachedSnapshotExists(code: string): Promise<boolean> {
  if (!redisReady()) return false;
  return (await redis()!.exists(key(code))) === 1;
}
