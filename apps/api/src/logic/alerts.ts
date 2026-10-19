export type ComputedAlertType = 'expiring' | 'near_limit' | 'spike' | 'bots';

export interface AlertInput {
  status: 'active' | 'disabled';
  expiresAt: Date | null;
  clickLimit: number | null;
  clickCount: number;
  /** Human clicks in the last hour. */
  lastHourHuman: number;
  /** Human clicks in the 7 days before the last hour. */
  last7dHuman: number;
  /** Bot hits in the last 24 hours. */
  last24hBots: number;
}

export interface AlertResult {
  type: ComputedAlertType;
  message: string;
}

export const SPIKE_FACTOR = 5;
export const SPIKE_MIN_CLICKS = 20;
export const BOT_ALERT_MIN = 50;
export const NEAR_LIMIT_RATIO = 0.8;
export const EXPIRING_HOURS = 48;

/** All alerts that apply to one link right now. Pure, so thresholds are unit-tested. */
export function computeAlerts(a: AlertInput, now: Date = new Date()): AlertResult[] {
  if (a.status === 'disabled') return [];
  const out: AlertResult[] = [];
  const expired = a.expiresAt != null && a.expiresAt.getTime() < now.getTime();

  if (a.expiresAt && !expired) {
    const hours = (a.expiresAt.getTime() - now.getTime()) / 3600_000;
    if (hours < EXPIRING_HOURS) {
      const days = Math.max(1, Math.ceil(hours / 24));
      out.push({ type: 'expiring', message: `Expires in ${days === 1 ? 'less than a day' : days + ' days'}` });
    }
  }
  if (!expired && a.clickLimit != null && a.clickLimit > 0) {
    const ratio = a.clickCount / a.clickLimit;
    if (ratio >= NEAR_LIMIT_RATIO && ratio < 1) {
      out.push({
        type: 'near_limit',
        message: `${a.clickCount} of ${a.clickLimit} clicks used (${Math.round(ratio * 100)}%)`,
      });
    }
  }
  // Average hourly clicks over the last 7 days (168 hours).
  const avgHourly = a.last7dHuman / 168;
  if (a.lastHourHuman >= SPIKE_MIN_CLICKS && a.lastHourHuman >= SPIKE_FACTOR * Math.max(avgHourly, 0.0001)) {
    const times = avgHourly > 0 ? Math.round(a.lastHourHuman / avgHourly) : null;
    out.push({
      type: 'spike',
      message: times ? `${times}× its usual clicks in the last hour` : `${a.lastHourHuman} clicks in the last hour, with no usual traffic`,
    });
  }
  if (a.last24hBots > BOT_ALERT_MIN) {
    out.push({ type: 'bots', message: `${a.last24hBots} bot hits in 24 hours, none counted` });
  }
  return out;
}
