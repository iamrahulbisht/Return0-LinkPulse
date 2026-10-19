import { config } from './lib/config';
import { createApp } from './app';
import { prisma } from './lib/db';
import { closeRedis, redis } from './lib/redis';
import { startSubscriber, stopSubscriber } from './sse/hub';
import { startWorker, stopWorker } from './queue/worker';
import { closeQueue } from './queue/clicks';

const app = createApp();
redis(); // connect early so the first redirect can use the cache
startSubscriber();
if (config.RUN_WORKER) startWorker();

const server = app.listen(config.PORT, () => {
  console.log(`[api] listening on :${config.PORT} · short links at ${config.shortBase} · worker ${config.RUN_WORKER ? 'on' : 'off'}`);
});

async function shutdown() {
  server.close();
  await stopWorker();
  await closeQueue();
  await stopSubscriber();
  await closeRedis();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
