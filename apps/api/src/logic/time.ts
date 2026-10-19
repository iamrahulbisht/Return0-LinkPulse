// Times are stored in UTC and shown in IST (Asia/Kolkata, UTC+05:30, no daylight saving).
export const DISPLAY_TZ = 'Asia/Kolkata';
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** The IST calendar date (YYYY-MM-DD) of a UTC instant. */
export function istDateKey(d: Date): string {
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** "18 Oct, 7:42 PM" in IST. */
export function formatIst(d: Date, withTime = true): string {
  const opts: Intl.DateTimeFormatOptions = withTime
    ? { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: DISPLAY_TZ }
    : { day: 'numeric', month: 'short', timeZone: DISPLAY_TZ };
  return new Intl.DateTimeFormat('en-IN', opts).format(d).replace(/\b(am|pm)\b/, (m) => m.toUpperCase());
}

/**
 * Turns an IST date (YYYY-MM-DD) from a date picker into the UTC instant of 11:59 PM IST that day.
 * Used for "expires on 30 Oct" so a link works for the whole of that day in India.
 */
export function endOfIstDay(dateKey: string): Date {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 23, 59, 0) - IST_OFFSET_MS);
}

export type Period = '24h' | '7d' | '30d';

export function periodMs(p: Period): number {
  return p === '24h' ? 24 * 3600_000 : p === '7d' ? 7 * 86400_000 : 30 * 86400_000;
}
