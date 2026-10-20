import type { ClickType } from './bots';
import { pickDestination, type DeviceRule, type RuleDevice } from './device';

/** What the redirect engine needs to know about a link. This is what we cache in Redis. */
export interface LinkSnapshot {
  id: string;
  code: string;
  ownerId: string;
  workspaceId: string;
  destination: string;
  status: 'active' | 'disabled';
  expiresAt: string | null; // ISO, UTC
  fallbackUrl: string | null;
  clickLimit: number | null;
  passwordHash: string | null;
  title: string | null;
  rules: DeviceRule[];
}

export interface VisitContext {
  now: Date;
  /** The destination host matches the blocklist right now (checked live, not from cache). */
  destinationBlocked: boolean;
  /** The visitor has a valid unlock cookie for this link. */
  unlocked: boolean;
  /** The visitor used up their 5 password tries in the last 5 minutes. */
  passwordLocked: boolean;
  clickType: ClickType;
  device: RuleDevice;
}

/**
 * The decision made before the click limit. The limit itself is decided by one atomic
 * UPDATE in the database (see redirect/engine.ts), so it is safe when many people click at once.
 */
export type Decision =
  | { step: 2; kind: 'disabled' }
  | { step: 3; kind: 'expired'; fallbackUrl: string | null }
  | { step: 4; kind: 'password_required' }
  | { step: 4; kind: 'password_locked' }
  | { step: 5; kind: 'bot_redirect'; destination: string; clickType: ClickType }
  | { step: 6; kind: 'count_then_redirect'; destination: string };

/**
 * Rule order (step 1, "link exists", happens before this is called):
 * 2 disabled / blocked → 3 expired → 4 password → 5 bot → 6 limit → 7 device rule → 8 log + 302.
 * - Disable before expiry, so an admin takedown always wins.
 * - Password before counting, so wrong tries never use up the limit.
 * - Bots before the limit, so a WhatsApp preview never takes a real slot.
 */
export function decide(link: LinkSnapshot, ctx: VisitContext): Decision {
  if (link.status === 'disabled' || ctx.destinationBlocked) return { step: 2, kind: 'disabled' };
  if (link.expiresAt && ctx.now.getTime() > new Date(link.expiresAt).getTime()) {
    return { step: 3, kind: 'expired', fallbackUrl: link.fallbackUrl };
  }
  if (link.passwordHash && !ctx.unlocked) {
    return ctx.passwordLocked ? { step: 4, kind: 'password_locked' } : { step: 4, kind: 'password_required' };
  }
  const destination = pickDestination(link.destination, link.rules, ctx.device);
  if (ctx.clickType !== 'human') return { step: 5, kind: 'bot_redirect', destination, clickType: ctx.clickType };
  return { step: 6, kind: 'count_then_redirect', destination };
}

export type ComputedStatus = 'active' | 'expired' | 'limit_reached' | 'disabled';

/** Link status shown in the UI is computed, not stored. */
export function computeStatus(
  link: { status: string; expiresAt: Date | string | null; clickLimit: number | null; clickCount: number },
  now: Date = new Date(),
): ComputedStatus {
  if (link.status === 'disabled') return 'disabled';
  if (link.expiresAt && new Date(link.expiresAt).getTime() < now.getTime()) return 'expired';
  if (link.clickLimit != null && link.clickCount >= link.clickLimit) return 'limit_reached';
  return 'active';
}

/** SQL version of computeStatus, for filtering and counting in the database. Keep in sync. */
export const STATUS_SQL = `CASE
  WHEN l.status = 'disabled' THEN 'disabled'
  WHEN l.expires_at IS NOT NULL AND l.expires_at < now() THEN 'expired'
  WHEN l.click_limit IS NOT NULL AND l.click_count >= l.click_limit THEN 'limit_reached'
  ELSE 'active' END`;
