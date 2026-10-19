// "Review before publishing" for the wizard, worked out in the browser (same rules as create-link.html).
import type { Device } from '../../types';
import { deviceName, fmtDay, fmtNum, istDateKey } from '../../lib/format';

export type ReviewTone = 'fix' | 'check' | 'ok' | 'note' | 'muted';

export interface ReviewItem {
  kind: 'Fix' | 'Check' | 'OK' | 'Note';
  tone: ReviewTone;
  text: string;
}

export interface ReviewInput {
  expiresOn: string;
  clickLimit: string;
  pwOn: boolean;
  password: string;
  rules: { device: Device; destination: string }[];
}

/** The instant a link with this IST date stops working: 11:59 PM IST that day (what the API stores). */
export function expiryInstant(dateKey: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
  const d = new Date(`${dateKey}T23:59:00+05:30`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** null = no limit, 'bad' = not a whole number ≥ 1. */
export function parseLimit(raw: string): number | null | 'bad' {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isInteger(n) && n >= 1 ? n : 'bad';
}

export function buildReview(i: ReviewInput, now = new Date()): ReviewItem[] {
  const out: ReviewItem[] = [];

  const exp = expiryInstant(i.expiresOn);
  if (exp) {
    if (exp.getTime() <= now.getTime()) {
      out.push({ kind: 'Fix', tone: 'fix', text: 'The expiry date is in the past. Pick a later date.' });
    } else {
      // Count IST calendar days, so "today" is 0 and tomorrow is 1 whatever the time is now.
      const days = Math.round((Date.parse(i.expiresOn) - Date.parse(istDateKey(now))) / 86400_000);
      const soon = days <= 3;
      const when = days === 0 ? 'Expires today' : `Expires in ${days} day${days === 1 ? '' : 's'}`;
      out.push({ kind: soon ? 'Check' : 'OK', tone: soon ? 'check' : 'ok', text: `${when}, on ${fmtDay(exp)} at 11:59 PM IST.` });
    }
  }

  const lim = parseLimit(i.clickLimit);
  if (lim === 'bad') out.push({ kind: 'Fix', tone: 'fix', text: 'The click limit must be a whole number, 1 or more.' });
  else if (lim !== null) {
    out.push({ kind: 'OK', tone: 'ok', text: `Stops after ${fmtNum(lim)} human clicks. Visitor ${fmtNum(lim + 1)} sees “Limit reached”.` });
  }

  if (i.pwOn && i.password.length < 4) out.push({ kind: 'Fix', tone: 'fix', text: 'Use at least 4 characters for the password.' });
  else if (i.pwOn) out.push({ kind: 'Note', tone: 'note', text: 'Visitors will see a password form first. Wrong tries are never counted.' });
  else out.push({ kind: 'Note', tone: 'muted', text: 'No password: anyone with the link can open it.' });

  const seen = new Set<Device>();
  i.rules.forEach((r, idx) => {
    if (!r.destination.trim()) out.push({ kind: 'Fix', tone: 'fix', text: `Add a URL for device rule ${idx + 1}, or remove the rule.` });
    if (seen.has(r.device)) {
      out.push({ kind: 'Check', tone: 'check', text: `Rule ${idx + 1} is for ${deviceName(r.device)} again. Only the first ${deviceName(r.device)} rule is used.` });
    }
    seen.add(r.device);
  });

  return out;
}
