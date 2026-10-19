import { runAlertsJob } from './alerts';

// "Also on demand": the dashboard can trigger a fresh run, but at most once a minute.
let lastRun = 0;
let running: Promise<unknown> | null = null;

export async function runAlertsJobThrottled(minGapMs = 60_000): Promise<void> {
  if (running) {
    await running;
    return;
  }
  if (Date.now() - lastRun < minGapMs) return;
  lastRun = Date.now();
  running = runAlertsJob().catch((err) => console.error('[alerts] on-demand run failed', err));
  try {
    await running;
  } finally {
    running = null;
  }
}

export function resetAlertsThrottle(): void {
  lastRun = 0;
}
