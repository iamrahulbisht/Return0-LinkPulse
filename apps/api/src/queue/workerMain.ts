// Entry point for running the click worker as its own process (e.g. a Render background worker).
// If a separate worker is not available on the free tier, set RUN_WORKER=true on the API instead.
import '../lib/config';
import { startSubscriber } from '../sse/hub';
import { startWorker, stopWorker } from './worker';

startSubscriber();
startWorker();
console.log('[worker] click worker and alerts job running');

const shutdown = async () => {
  await stopWorker();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
