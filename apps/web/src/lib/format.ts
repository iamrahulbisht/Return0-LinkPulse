// Times are stored in UTC by the API and always shown in IST (Asia/Kolkata). Numbers use en-IN.
export const TZ = 'Asia/Kolkata';

const toDate = (d: string | Date) => (typeof d === 'string' ? new Date(d) : d);
const ampm = (s: string) => s.replace(/\b(am|pm)\b/gi, (m) => m.toUpperCase());

/** 1,204 · 12,34,567 */
export function fmtNum(n: number | null | undefined): string {
  return (n ?? 0).toLocaleString('en-IN');
}

/** "18 Oct" */
export function fmtDay(d: string | Date): string {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: TZ }).format(toDate(d));
}

/** "18 Oct 2026" */
export function fmtDate(d: string | Date): string {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ }).format(toDate(d));
}

/** "18 Oct, 7:42 PM" */
export function fmtDateTime(d: string | Date): string {
  return ampm(
    new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ }).format(toDate(d)),
  );
}

/** "18 Oct 19:42:08" (visit tables) */
export function fmtStamp(d: string | Date): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: TZ })
      .formatToParts(toDate(d))
      .map((x) => [x.type, x.value]),
  );
  return `${p.day} ${p.month} ${p.hour}:${p.minute}:${p.second}`;
}

/** "11:59 PM" */
export function fmtTime(d: string | Date): string {
  return ampm(new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ }).format(toDate(d)));
}

/** IST calendar date "YYYY-MM-DD" of an instant (for date inputs). */
export function istDateKey(d: string | Date = new Date()): string {
  return new Date(toDate(d).getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
}

/** Whole days from now until an instant (negative if past). */
export function daysUntil(d: string | Date, now = new Date()): number {
  return Math.ceil((toDate(d).getTime() - now.getTime()) / 86400_000);
}

/** Labels for an IST bucket "YYYY-MM-DDTHH:mm" from /analytics/timeseries. */
export function bucketLabel(bucket: string, unit: 'hour' | 'day'): string {
  const [date, time] = bucket.split('T');
  if (unit === 'hour') return time.slice(0, 5);
  const [, m, d] = date.split('-').map(Number);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d} ${months[m - 1]}`;
}

/** "3 s ago", "2 min ago" */
export function ago(fromMs: number, nowMs = Date.now()): string {
  const s = Math.max(0, Math.round((nowMs - fromMs) / 1000));
  if (s < 60) return `${s} s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  return `${Math.round(m / 60)} h ago`;
}

/** Host + path without the scheme, for compact display. */
export function prettyUrl(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export function plural(n: number, one: string, many = one + 's'): string {
  return `${fmtNum(n)} ${n === 1 ? one : many}`;
}

const DEVICE_NAMES: Record<string, string> = { android: 'Android', ios: 'iPhone', desktop: 'Desktop', tablet: 'Tablet', bot: 'Bot' };
export const deviceName = (d: string) => DEVICE_NAMES[d] ?? d;
