import { createHash } from 'crypto';
import { istDateKey } from './time';

/**
 * sha256(ip + user agent + IST date + salt). The raw IP is never stored.
 * Including the date means one person counts once per day, and hashes cannot be joined across days.
 */
export function visitorHash(ip: string, userAgent: string, at: Date, salt: string): string {
  return createHash('sha256')
    .update(`${ip}|${userAgent}|${istDateKey(at)}|${salt}`)
    .digest('hex');
}
