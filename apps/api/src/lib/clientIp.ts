import type { Request } from 'express';

/**
 * The visitor's IP for rate limiting /api calls.
 *
 * Short links are opened straight on the Render domain, so `req.ip` (with trust proxy = 1) is right there.
 * But /api calls come through the Vercel rewrite: Render then sees Vercel's IP, and every user would
 * share one rate-limit bucket. Vercel passes the real client IP in `x-vercel-forwarded-for`.
 *
 * Trade-off: someone calling the Render domain directly can fake that header to dodge the per-IP
 * limiter. That is acceptable because sign-in also has a per-account lockout (5 tries → 5 minutes),
 * and this IP is never stored or used for analytics.
 */
export function clientIp(req: Request): string {
  const v = req.get('x-vercel-forwarded-for');
  const first = v?.split(',')[0]?.trim();
  if (first && /^[0-9a-fA-F:.]{3,45}$/.test(first)) return first;
  return req.ip ?? 'unknown';
}
