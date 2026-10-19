import { Worker } from 'bullmq';
import { newRedisConnection } from '../lib/redis';
import { CLICK_QUEUE, recordClick, type ClickJob } from './clicks';
import { runAlertsJob } from './alerts';

let worker: Worker | null = null;
let workerConn: ReturnType<typeof newRedisConnection> = null;
let alertsTimer: NodeJS.Timeout | null = null;

export const ALERTS_EVERY_MS = 5 * 60_000;

/** Starts the click worker (if Redis is configured) and the 5-minute alerts job. */
export function startWorker(): void {
  const connection = newRedisConnection(true);
  if (connection && !worker) {
    workerConn = connection;
    worker = new Worker<ClickJob>(CLICK_QUEUE, async (job) => recordClick(job.data), {
      connection,
      concurrency: 10,
      // Hosted Redis free tiers count every command. When the queue is empty, wait longer per poll
      // (a new job still wakes the blocking call at once) and check for stalled jobs less often.
      drainDelay: 30,
      stalledInterval: 120_000,
    });
    worker.on('failed', (job, err) => console.error(`[worker] click job ${job?.id} failed: ${err.message}`));
    worker.on('error', () => undefined);
  }
  if (!alertsTimer) {
    alertsTimer = setInterval(() => {
      runAlertsJob().catch((err) => console.error('[alerts] job failed', err));
    }, ALERTS_EVERY_MS);
    alertsTimer.unref();
    setTimeout(() => runAlertsJob().catch(() => undefined), 5_000).unref();
  }
}

export async function stopWorker(): Promise<void> {
  if (alertsTimer) clearInterval(alertsTimer);
  alertsTimer = null;
  if (worker) await worker.close().catch(() => undefined);
  worker = null;
  if (workerConn) await workerConn.quit().catch(() => undefined);
  workerConn = null;
}
