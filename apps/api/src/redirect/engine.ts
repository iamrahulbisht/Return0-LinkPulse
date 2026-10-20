import express, { type Request, type Response, Router } from 'express';
import bcrypt from 'bcryptjs';
import { createHash } from 'crypto';
import { prisma } from '../lib/db';
import { config } from '../lib/config';
import { getLinkSnapshot } from '../lib/linkCache';
import { getBlockedDomains } from '../lib/blocklist';
import { delKey, getCount, incrWithTtl, setOnce } from '../lib/kv';
import { geoFromIp } from '../lib/geo';
import { looksLikeCode } from '../logic/codes';
import { classifyUserAgent, finalClickType, BURST_WINDOW_SECONDS } from '../logic/bots';
import { parseAgent } from '../logic/device';
import { visitorHash } from '../logic/hash';
import { decide, type LinkSnapshot } from '../logic/rules';
import { parseSource } from '../logic/source';
import { findBlockedDomain, hostOf } from '../logic/url';
import { formatIst } from '../logic/time';
import { enqueueClick } from '../queue/clicks';
import { pages, passwordPage, unlockedPage, type PageCtx } from '../views/visitor';

export const MAX_PASSWORD_TRIES = 5;
export const PASSWORD_LOCK_SECONDS = 300;
const UNLOCK_MINUTES = 30;

const unlockCookie = (code: string) => `lp_unlock_${code}`;
// Password tries and reports are keyed on a salted hash of the IP only (not the user agent),
// so changing the user agent does not give an attacker fresh tries.
const triesKey = (code: string, ipKey: string) => `pw:${code}:${ipKey}`;

function visitor(req: Request) {
  const ip = req.ip ?? '0.0.0.0';
  const ua = String(req.get('user-agent') ?? '').slice(0, 500);
  const now = new Date();
  const ipKey = createHash('sha256').update(`${ip}|${config.HASH_SALT}`).digest('hex').slice(0, 32);
  return { ip, ua, now, ipKey, vh: visitorHash(ip, ua, now, config.HASH_SALT) };
}

function ctxFor(code: string): PageCtx {
  return { shortUrl: `${config.shortHost}/${code}`, homeUrl: config.WEB_ORIGIN };
}

function send(res: Response, status: number, html: string): void {
  // Visitor pages and redirects are never cached, so rule changes apply on the very next visit.
  res.status(status).set('Cache-Control', 'no-store').type('html').send(html);
}

/** Keep only the tracking query params when passing a visitor through the password form. */
function trackingParams(query: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of ['src', 'q']) if (typeof query[k] === 'string') out[k] = String(query[k]).slice(0, 64);
  return out;
}

function withParams(path: string, params: Record<string, string>): string {
  const qs = new URLSearchParams(params).toString();
  return qs ? `${path}?${qs}` : path;
}

async function findLink(rawCode: string): Promise<LinkSnapshot | null> {
  if (!looksLikeCode(rawCode)) return null;
  const exact = await getLinkSnapshot(rawCode);
  if (exact) return exact;
  // Custom aliases are stored lowercase; accept "INNOVISTA26" typed from a poster.
  const lower = rawCode.toLowerCase();
  return lower !== rawCode ? getLinkSnapshot(lower) : null;
}

/** "Did you mean …?" — only for custom aliases (never random codes), only if one letter or two away. */
async function suggestAlias(code: string): Promise<string | null> {
  const c = code.toLowerCase();
  if (c.length < 3 || c.length > 30) return null;
  const rows = await prisma.$queryRaw<{ code: string }[]>`
    SELECT code FROM links
    WHERE custom_alias = true AND status = 'active' AND left(code, 2) = ${c.slice(0, 2)}
    LIMIT 200`;
  let best: { code: string; d: number } | null = null;
  for (const r of rows) {
    const d = levenshtein(c, r.code);
    if (d > 0 && d <= 2 && (!best || d < best.d)) best = { code: r.code, d };
  }
  return best?.code ?? null;
}

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

async function isDestinationBlocked(dest: string): Promise<boolean> {
  const host = hostOf(dest);
  return !!host && !!findBlockedDomain(host, await getBlockedDomains());
}

/** A browser preload (Chrome prefetch / prerender), not a person opening the link. */
function isSpeculative(req: Request): boolean {
  return /prefetch|prerender/i.test(`${req.get('sec-purpose') ?? ''} ${req.get('purpose') ?? ''}`);
}

function isUnlocked(req: Request, link: LinkSnapshot): boolean {
  const v = req.signedCookies?.[unlockCookie(link.code)];
  return typeof v === 'string' && v === link.id;
}

/** The atomic click limit. One statement, so two people can never both take the last slot. */
export async function takeSlot(linkId: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ click_count: number }[]>`
    UPDATE links SET click_count = click_count + 1
    WHERE id = ${linkId}::uuid AND status = 'active'
      AND (click_limit IS NULL OR click_count < click_limit)
    RETURNING click_count`;
  return rows.length === 1;
}

async function handleVisit(req: Request, res: Response): Promise<void> {
  const rawCode = req.params.code;
  // 1. Link exists?
  const link = await findLink(rawCode);
  if (!link) {
    const hint = await suggestAlias(rawCode).catch(() => null);
    send(
      res,
      404,
      pages.notFound(ctxFor(rawCode), hint ? { href: `${config.shortBase}/${hint}`, label: `${config.shortHost}/${hint}` } : null),
    );
    return;
  }
  const v = visitor(req);
  const { source, qrId } = parseSource(req.query as Record<string, unknown>);
  // Express answers HEAD with this GET handler. A HEAD is a link checker or unfurler, never a person
  // opening the link, so it still gets the redirect but is logged as a scanner and never counted.
  const uaType = req.method === 'HEAD' ? 'scanner' : classifyUserAgent(v.ua);
  // Burst check counts every hit from this visitor on this link in a 10-second window.
  const hits = uaType === 'human' ? await incrWithTtl(`burst:${link.id}:${v.vh}`, BURST_WINDOW_SECONDS) : 0;
  const clickType = finalClickType(uaType, hits);
  const agent = parseAgent(v.ua);
  const passwordLocked = link.passwordHash ? (await getCount(triesKey(link.code, v.ipKey))) >= MAX_PASSWORD_TRIES : false;

  const decision = decide(link, {
    now: v.now,
    destinationBlocked: await isDestinationBlocked(link.destination),
    unlocked: isUnlocked(req, link),
    passwordLocked,
    clickType,
    device: agent.ruleDevice,
  });

  const ctx = ctxFor(link.code);
  switch (decision.kind) {
    case 'disabled': // 2
      send(res, 410, pages.disabled(ctx, `/${link.code}/report`));
      return;
    case 'expired': // 3
      if (decision.fallbackUrl) {
        res.set('Cache-Control', 'no-store').redirect(302, decision.fallbackUrl);
        return;
      }
      send(res, 410, pages.expired(ctx, formatIst(new Date(link.expiresAt!))));
      return;
    case 'password_required': // 4
    case 'password_locked': {
      const locked = decision.kind === 'password_locked';
      // A chat-app preview of a private link sees the form. Log it as a bot (never counted)
      // so "1 bot filtered" still shows on the dashboard.
      if (clickType !== 'human') {
        await enqueueClick({
          linkId: link.id, workspaceId: link.workspaceId, code: link.code, qrId, source, visitorHash: v.vh, ua: v.ua,
          referrer: req.get('referer') ?? null, at: v.now.toISOString(), clickType, counted: false,
          country: null, city: null,
        });
      }
      send(
        res,
        locked ? 429 : 401,
        passwordPage({
          shortUrl: ctx.shortUrl,
          action: `/${link.code}/unlock`,
          reportAction: `/${link.code}/report`,
          title: link.title,
          message: locked ? 'Too many tries. Please wait 5 minutes and try again.' : '',
          error: false,
          locked,
          hidden: trackingParams(req.query as Record<string, unknown>),
        }),
      );
      return;
    }
    case 'bot_redirect': // 5: previews still work, but they are logged as bots and never counted
    case 'count_then_redirect': {
      let counted = false;
      if (decision.kind === 'count_then_redirect') {
        // Refuse a browser preload (Chrome prefetches links on screen, e.g. on bio pages or after unlock)
        // so only the real visit counts. A non-2xx makes the browser drop the preload and load it for real.
        if (isSpeculative(req)) {
          res.status(503).set('Cache-Control', 'no-store').end();
          return;
        }
        // 6. Under the limit?
        counted = await takeSlot(link.id);
        if (!counted) {
          send(res, 410, pages.limit(ctx, link.clickLimit ?? 0));
          return;
        }
      }
      // 7. device rule was applied in decide(). 8. Queue the click, then redirect at once.
      const geo = clickType === 'human' ? geoFromIp(v.ip) : { country: null, city: null };
      await enqueueClick({
        linkId: link.id,
        workspaceId: link.workspaceId,
        code: link.code,
        qrId,
        source,
        visitorHash: v.vh,
        ua: v.ua,
        referrer: req.get('referer') ?? null,
        at: v.now.toISOString(),
        clickType: decision.kind === 'bot_redirect' ? decision.clickType : 'human',
        counted,
        country: geo.country,
        city: geo.city,
      });
      // Always 302, never 301: browsers cache 301, so later visits would skip our rules and counts.
      res.set('Cache-Control', 'no-store').redirect(302, decision.destination);
      return;
    }
  }
}

async function handleUnlock(req: Request, res: Response): Promise<void> {
  const link = await findLink(req.params.code);
  if (!link) {
    send(res, 404, pages.notFound(ctxFor(req.params.code), null));
    return;
  }
  const hidden = trackingParams(req.body ?? {});
  const next = withParams(`/${link.code}`, hidden);
  if (!link.passwordHash) {
    res.redirect(303, next);
    return;
  }
  const v = visitor(req);
  const key = triesKey(link.code, v.ipKey);
  const ctx = ctxFor(link.code);
  const page = (message: string, error: boolean, locked: boolean) =>
    passwordPage({
      shortUrl: ctx.shortUrl, action: `/${link.code}/unlock`, reportAction: `/${link.code}/report`,
      title: link.title, message, error, locked, hidden,
    });

  if ((await getCount(key)) >= MAX_PASSWORD_TRIES) {
    send(res, 429, page('Too many tries. Please wait 5 minutes and try again.', false, true));
    return;
  }
  const password = typeof req.body?.password === 'string' ? req.body.password.slice(0, 200) : '';
  const ok = password.length > 0 && (await bcrypt.compare(password, link.passwordHash));
  if (!ok) {
    // Wrong tries are never counted as clicks and never use up the limit.
    const used = await incrWithTtl(key, PASSWORD_LOCK_SECONDS);
    const left = MAX_PASSWORD_TRIES - used;
    if (left <= 0) {
      send(res, 429, page('Too many tries. Please wait 5 minutes and try again.', true, true));
    } else {
      send(res, 401, page(`That password did not work. ${left} ${left === 1 ? 'try' : 'tries'} left.`, true, false));
    }
    return;
  }
  await delKey(key);
  res.cookie(unlockCookie(link.code), link.id, {
    signed: true,
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd,
    maxAge: UNLOCK_MINUTES * 60_000,
    path: `/${link.code}`,
  });
  send(res, 200, unlockedPage(ctx.shortUrl, next, link.title));
}

/** Visitors can flag a link. One report per visitor per link per day. */
async function handleReport(req: Request, res: Response): Promise<void> {
  const link = await findLink(req.params.code);
  if (!link) {
    send(res, 404, pages.notFound(ctxFor(req.params.code), null));
    return;
  }
  const v = visitor(req);
  if (await setOnce(`report:${link.id}:${v.ipKey}`, 86400)) {
    const existing = await prisma.linkAlert.findUnique({ where: { linkId_type: { linkId: link.id, type: 'report' } } });
    const count = (existing?.count ?? 0) + 1;
    await prisma.linkAlert.upsert({
      where: { linkId_type: { linkId: link.id, type: 'report' } },
      create: { linkId: link.id, type: 'report', message: 'Reported by 1 visitor.', count: 1 },
      update: { count, message: `Reported by ${count} visitors.`, dismissedAt: null },
    });
  }
  send(res, 200, pages.reported(ctxFor(link.code)));
}

export function redirectRouter(): Router {
  const r = Router();
  const form = express.urlencoded({ extended: false, limit: '4kb' });
  r.get('/:code', (req, res, next) => handleVisit(req, res).catch(next));
  r.post('/:code/unlock', form, (req, res, next) => handleUnlock(req, res).catch(next));
  r.post('/:code/report', form, (req, res, next) => handleReport(req, res).catch(next));
  return r;
}
