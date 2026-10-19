import { randomInt } from 'crypto';

/** Account status for admin user management. Derived from columns, like link status (see computeStatus). */
export type AccountStatus = 'active' | 'suspended' | 'locked' | 'password_reset';

export interface AccountSnapshot {
  suspendedAt: Date | null;
  lockedUntil: Date | null;
  mustChangePassword: boolean;
}

/** Suspended beats locked beats a pending password reset: the one that stops the user first wins. */
export function accountStatus(u: AccountSnapshot, now: Date = new Date()): AccountStatus {
  if (u.suspendedAt) return 'suspended';
  if (u.lockedUntil && u.lockedUntil.getTime() > now.getTime()) return 'locked';
  if (u.mustChangePassword) return 'password_reset';
  return 'active';
}

/** How long an admin-issued temporary password works before the admin has to reset again. */
export const TEMP_PASSWORD_HOURS = 24;
export const TEMP_PASSWORD_LENGTH = 14;
// No 0/O, 1/l/I: it is read off a screen and typed by hand. 57 symbols × 14 characters ≈ 82 bits.
const TEMP_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

/** A random temporary password from a cryptographic source (never Math.random). */
export function generateTempPassword(pick: (max: number) => number = (max) => randomInt(max)): string {
  let out = '';
  for (let i = 0; i < TEMP_PASSWORD_LENGTH; i++) out += TEMP_ALPHABET[pick(TEMP_ALPHABET.length)];
  return out;
}
