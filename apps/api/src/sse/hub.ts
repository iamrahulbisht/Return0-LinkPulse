import { EventEmitter } from 'events';
import type { Redis } from 'ioredis';
import { newRedisConnection, redis, redisReady } from '../lib/redis';

/** One click as the dashboard and "Recent visits" table show it. */
export interface LiveClick {
  id: string;
  linkId: string;
  code: string;
  at: string;
  source: 'link' | 'qr' | 'bio';
  qrLabel: string | null;
  referrer: string | null;
  device: string;
  os: string | null;
  browser: string | null;
  city: string | null;
  country: string | null;
  clickType: 'human' | 'preview_bot' | 'scanner' | 'suspicious';
  counted: boolean;
}

const local = new EventEmitter();
local.setMaxListeners(1000);
let subscriber: Redis | null = null;

// One channel per workspace, so every member sees live clicks on the shared links.
const channel = (workspaceId: string) => `clicks:ws:${workspaceId}`;

/**
 * Publishes through Redis pub/sub when available, so a worker in another process still reaches
 * the API process that holds the browser's stream. Without Redis, it is a local event.
 */
export async function publishClick(workspaceId: string, click: LiveClick): Promise<void> {
  if (redisReady() && subscriber) {
    try {
      await redis()!.publish(channel(workspaceId), JSON.stringify(click));
      return;
    } catch {
      // fall back to local
    }
  }
  local.emit(channel(workspaceId), click);
  local.emit('clicks:*', click);
}

export function startSubscriber(): void {
  if (subscriber) return;
  subscriber = newRedisConnection(true);
  if (!subscriber) return;
  subscriber.psubscribe('clicks:*').catch(() => undefined);
  subscriber.on('pmessage', (_pattern, ch, message) => {
    try {
      const click = JSON.parse(message) as LiveClick;
      local.emit(ch, click);
      local.emit('clicks:*', click);
    } catch {
      // ignore bad messages
    }
  });
}

export function subscribe(workspaceId: string | '*', fn: (c: LiveClick) => void): () => void {
  const ch = workspaceId === '*' ? 'clicks:*' : channel(workspaceId);
  local.on(ch, fn);
  return () => local.off(ch, fn);
}

export async function stopSubscriber(): Promise<void> {
  if (subscriber) {
    await subscriber.quit().catch(() => undefined);
    subscriber = null;
  }
}
