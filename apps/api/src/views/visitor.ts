// Server-rendered visitor pages (password gate, 404, disabled, expired, limit reached).
// They are plain HTML with no JavaScript, so they load fast on any phone.
// Look: the dark "LinkPulse Frontend" theme — black page, #141416 card, lime (#D4FF00) actions.
// Wording is unchanged from the LinkPulse-UI visitor screens (tests check it).

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

// The lime pulse in a near-black tile (same mark as the web app).
const MARK = (size: number) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true"><rect x="0.5" y="0.5" width="31" height="31" rx="8" fill="#141416" stroke="#2A2A32"></rect><path d="M7 16h4l2.7-6.5 5.3 13 2.7-6.5H25" fill="none" stroke="#D4FF00" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;

const FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%230B0B0F'/%3E%3Cpath d='M8 16h5l2-5 3 10 2-5h4' fill='none' stroke='%23D4FF00' stroke-width='3.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E";

function shell(title: string, body: string, extraHead = ''): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><meta name="color-scheme" content="dark"><meta name="theme-color" content="#000000"><title>${esc(title)} · LinkPulse</title>
<link rel="icon" href="${FAVICON}">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&amp;family=Outfit:wght@600;700;800&amp;family=Space+Grotesk:wght@600;700&amp;family=JetBrains+Mono:wght@500;600&amp;display=swap">
${extraHead}
<style>
*{box-sizing:border-box}
:root{color-scheme:dark}
body{margin:0;min-height:100vh;background:#000000;display:flex;justify-content:center;align-items:flex-start;font-family:'Inter',-apple-system,'Segoe UI',system-ui,sans-serif;color:#FFFFFF;-webkit-font-smoothing:antialiased}
::selection{background:#D4FF00;color:#000}
a{color:#D4FF00}a:hover{color:#E6FF66}
.fd{font-family:'Space Grotesk','Outfit',sans-serif}
.fm{font-family:'JetBrains Mono',ui-monospace,Consolas,monospace}
:focus-visible{outline:3px solid #D4FF00;outline-offset:2px}
.lp-in{background:#1A1A1E;color:#FFFFFF;transition:border-color .2s,box-shadow .2s,background-color .2s}
.lp-in::placeholder{color:#82828F}
.lp-in:focus{outline:none;border-color:#D4FF00 !important;background:#1F1F24;box-shadow:0 0 0 3px rgba(212,255,0,.16)}
.card{width:100%;max-width:430px;min-height:100vh;background:#0A0A0C;display:flex;flex-direction:column;overflow:hidden}
@media (min-width:480px){body{padding:32px 16px}.card{min-height:844px;border-radius:28px;border:1px solid #232328;box-shadow:0 25px 60px rgba(0,0,0,.85)}}
/* Status pages (404/410/429) fit the screen: the card is one viewport tall and the art on top shrinks first.
   dvh follows the phone's address bar; the vh line before it is the fallback for older browsers. */
body:has(.card-fit){min-height:100vh;min-height:100dvh}
.card-fit{height:100vh;height:100dvh;min-height:0;overflow-y:auto}
@media (min-width:480px){.card-fit{height:calc(100vh - 64px);height:calc(100dvh - 64px);max-height:844px}}
.fit-hero{flex:1 1 300px;max-height:300px;min-height:180px}
/* Short screens (small laptops, landscape, small phones): tighter spacing so it still fits without scrolling.
   !important only beats this page's own inline styles. */
@media (max-height:700px){
  @media (min-width:480px){body:has(.card-fit){padding:12px 16px}.card-fit{height:calc(100vh - 24px);height:calc(100dvh - 24px)}}
  .fit-hero{min-height:136px}
  .fit-icon{width:72px !important;height:72px !important;border-radius:20px !important}
  .fit-icon svg{width:34px;height:34px}
  .fit-hero .fm{bottom:10px !important}
  .fit-body{padding:20px 22px !important;gap:10px !important}
  .fit-title{font-size:26px !important}
  .fit-actions{padding-top:10px !important}
}
@media (max-height:600px){.fit-brand{display:none !important}}
/* Portrait tablets: a wider card, centred on the screen, and the art grows, instead of a phone-sized card stuck at the top. */
@media (min-width:600px) and (orientation:portrait) and (min-height:900px){
  body:has(.card-fit){align-items:center;padding:64px 24px}
  .card-fit{max-width:560px;height:calc(100vh - 128px);height:calc(100dvh - 128px);max-height:1000px;border-radius:32px}
  .fit-hero{flex-basis:420px;max-height:420px}
}
.btn{display:flex;align-items:center;justify-content:center;height:52px;border-radius:12px;font-family:'Outfit','Space Grotesk',sans-serif;font-size:16px;font-weight:700;text-decoration:none;border:0;cursor:pointer;transition:background-color .2s,box-shadow .2s,transform .15s}
.btn-primary{background:#D4FF00;color:#000000;box-shadow:0 2px 14px rgba(212,255,0,.25)}
.btn-primary:hover{background:#C4EC00;color:#000000;box-shadow:0 4px 20px rgba(212,255,0,.35)}
.btn-primary:active{transform:scale(.99)}
.btn:disabled{background:#1E1E24;color:#8E8E98;box-shadow:none;cursor:not-allowed}
.linkbtn{font:inherit;background:none;border:0;padding:0 4px;color:#D4FF00;cursor:pointer;font-weight:600;font-size:15px;min-height:44px}
.linkbtn:hover{color:#E6FF66;text-decoration:underline}
.grid-bg{background-color:#0A0A0C;background-image:linear-gradient(rgba(255,255,255,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.04) 1px,transparent 1px);background-size:32px 32px}
@media (prefers-reduced-motion:reduce){*{transition:none !important}}
</style></head><body>${body}</body></html>`;
}

export interface StatusPageOpts {
  code: '404' | '410' | '429';
  tint: string;
  ink: string;
  icon: string;
  shortUrl: string;
  title: string;
  body: string;
  hint?: { href: string; label: string } | null;
  cta: { href: string; label: string };
  second?: { href: string; label: string } | null;
  reportAction?: string | null;
}

export function statusPage(o: StatusPageOpts): string {
  const hint = o.hint
    ? `<a href="${esc(o.hint.href)}" style="display:flex;align-items:center;gap:10px;padding:14px 16px;border-radius:12px;background:#141416;border:1px solid #2A2A32;color:#FFFFFF;text-decoration:none;font-size:15px;min-height:44px">Did you mean <span class="fm" style="font-weight:600;color:#D4FF00">${esc(o.hint.label)}</span>?</a>`
    : '';
  const second = o.reportAction
    ? `<form method="post" action="${esc(o.reportAction)}" style="display:flex;justify-content:center"><button class="linkbtn" type="submit">${esc(o.second?.label ?? 'Think this is a mistake? Tell us')}</button></form>`
    : o.second
      ? `<a href="${esc(o.second.href)}" style="display:flex;align-items:center;justify-content:center;min-height:44px;font-size:15px;font-weight:600">${esc(o.second.label)}</a>`
      : '';
  return shell(
    o.title,
    `<main class="card card-fit">
  <div class="grid-bg fit-hero" style="display:flex;align-items:center;justify-content:center;position:relative;border-bottom:1px solid #1F1F24;background-color:${o.tint}">
    <span class="fit-icon" style="width:112px;height:112px;border-radius:30px;background:#141416;border:1px solid #2A2A32;display:flex;align-items:center;justify-content:center;box-shadow:0 0 28px ${o.ink}33">
      <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="${o.ink}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${o.icon}"></path></svg>
    </span>
    <span class="fm" style="position:absolute;bottom:20px;font-size:14px;color:${o.ink};font-weight:600;max-width:90%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(o.shortUrl)}</span>
  </div>
  <div class="fit-body" style="padding:32px 26px;display:flex;flex-direction:column;gap:14px;flex:1">
    <span class="fm" style="align-self:flex-start;font-size:13px;font-weight:600;padding:4px 10px;border-radius:999px;background:${o.tint};color:${o.ink};border:1px solid ${o.ink}55">${o.code}</span>
    <h1 class="fd fit-title" style="margin:0;font-size:30px;line-height:1.08;letter-spacing:-0.02em;font-weight:700;color:#FFFFFF">${esc(o.title)}</h1>
    <p style="margin:0;font-size:16px;line-height:1.6;color:#A1A1AA">${esc(o.body)}</p>
    ${hint}
    <div class="fit-actions" style="margin-top:auto;display:flex;flex-direction:column;gap:10px;padding-top:24px">
      <a class="btn btn-primary" href="${esc(o.cta.href)}">${esc(o.cta.label)}</a>
      ${second}
    </div>
    <span class="fit-brand" style="display:flex;align-items:center;justify-content:center;gap:8px;font-size:13px;color:#8E8E98;font-family:'Space Grotesk',sans-serif;font-weight:700;letter-spacing:.02em;text-transform:uppercase">${MARK(16)}LinkPulse</span>
  </div>
</main>`,
  );
}

const ICONS = {
  notFound: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4M9 9l4 4M13 9l-4 4',
  disabled: 'M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6zM9 9l6 6M15 9l-6 6',
  expired: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  limit: 'M4 14a8 8 0 0 1 16 0M12 14l4-4M3 18h18',
  thanks: 'M5 12l5 5 9-10',
};

export interface PageCtx {
  shortUrl: string;
  homeUrl: string;
}

// tint = dark tinted background, ink = the state colour (same palette as the web app's status pills).
export const pages = {
  notFound: (c: PageCtx, hint: { href: string; label: string } | null) =>
    statusPage({
      code: '404', tint: '#1C2106', ink: '#D4FF00', icon: ICONS.notFound, shortUrl: c.shortUrl,
      title: 'We can’t find this link',
      body: 'There is no link at this address. It may have a typo, or the sender copied only part of it.',
      hint, cta: { href: c.homeUrl, label: 'Go to LinkPulse' },
      second: { href: c.homeUrl, label: 'Ask the sender for the full link' },
    }),
  disabled: (c: PageCtx, reportAction: string) =>
    statusPage({
      code: '410', tint: '#221717', ink: '#F87171', icon: ICONS.disabled, shortUrl: c.shortUrl,
      title: 'This link has been turned off',
      body: 'It was switched off because it broke our safety rules. You have not been sent anywhere, so you are safe.',
      cta: { href: c.homeUrl, label: 'Go to LinkPulse' },
      second: { href: '#', label: 'Think this is a mistake? Tell us' }, reportAction,
    }),
  expired: (c: PageCtx, endedAt: string) =>
    statusPage({
      code: '410', tint: '#291E0A', ink: '#FACC15', icon: ICONS.expired, shortUrl: c.shortUrl,
      title: 'This link has expired',
      body: `This link stopped working on ${endedAt} (IST). Ask the person who shared it for a new one.`,
      cta: { href: c.homeUrl, label: 'Go to LinkPulse' },
    }),
  limit: (c: PageCtx, limit: number) =>
    statusPage({
      code: '410', tint: '#2A1708', ink: '#FB923C', icon: ICONS.limit, shortUrl: c.shortUrl,
      title: 'All spots are taken',
      body: `This link was set to open ${limit.toLocaleString('en-IN')} time${limit === 1 ? '' : 's'}, and every place has been used. Nobody can go past this limit.`,
      cta: { href: c.homeUrl, label: 'Go to LinkPulse' },
      second: { href: c.homeUrl, label: 'Contact the organisers' },
    }),
  reported: (c: PageCtx) =>
    statusPage({
      code: '410', tint: '#142312', ink: '#4ADE80', icon: ICONS.thanks, shortUrl: c.shortUrl,
      title: 'Thank you for telling us',
      body: 'Our admins will look at this link. You do not need to do anything else.',
      cta: { href: c.homeUrl, label: 'Go to LinkPulse' },
    }),
};

export interface PasswordPageOpts {
  shortUrl: string;
  action: string;
  reportAction: string;
  title: string | null;
  message: string;
  error: boolean;
  locked: boolean;
  hidden: Record<string, string>;
}

export function passwordPage(o: PasswordPageOpts): string {
  const border = o.error || o.locked ? '#DC2626' : '#2A2A32';
  const msgStyle = o.error || o.locked ? 'color:#FF8A8A;font-weight:600' : 'color:#8E8E98;font-weight:400';
  const what = o.title ? `open ${esc(o.title)}` : 'open this link';
  const hidden = Object.entries(o.hidden)
    .map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`)
    .join('');
  return shell(
    'This link is private',
    `<main class="card">
  <div class="grid-bg" style="padding:64px 24px 72px;display:flex;flex-direction:column;align-items:center;gap:18px;color:#FFFFFF;border-bottom:1px solid #1F1F24">
    <span style="width:72px;height:72px;border-radius:20px;background:#D4FF00;display:flex;align-items:center;justify-content:center;box-shadow:0 0 30px rgba(212,255,0,.35)">
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#000000" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path></svg>
    </span>
    <span class="fm" style="font-size:14px;color:#E6FF66">${esc(o.shortUrl)}</span>
  </div>
  <form method="post" action="${esc(o.action)}" style="margin:-40px 16px 0;background:#141416;border:1px solid #232328;border-radius:20px;padding:28px 22px;display:flex;flex-direction:column;gap:18px;box-shadow:0 20px 40px -12px rgba(0,0,0,.8)">
    ${hidden}
    <div style="display:flex;flex-direction:column;gap:8px">
      <h1 class="fd" style="margin:0;font-size:28px;line-height:1.1;letter-spacing:-0.02em;font-weight:700;color:#FFFFFF">This link is private</h1>
      <p style="margin:0;font-size:15.5px;line-height:1.55;color:#A1A1AA">Enter the password you were given to ${what}.</p>
    </div>
    <div style="display:flex;flex-direction:column;gap:8px">
      <label for="vpw" style="font-size:14.5px;font-weight:600;color:#D4D4D8">Password</label>
      <input class="lp-in" id="vpw" name="password" type="password" autocomplete="off" required maxlength="200" ${o.locked ? 'disabled' : 'autofocus'} aria-invalid="${o.error || o.locked}" aria-describedby="vpwMsg" style="font:inherit;font-size:17px;height:52px;padding:0 16px;border-radius:12px;border:${o.error || o.locked ? 2 : 1}px solid ${border}">
      <span id="vpwMsg" aria-live="polite" style="font-size:14px;${msgStyle};min-height:20px">${esc(o.message)}</span>
    </div>
    <button class="btn btn-primary" type="submit" ${o.locked ? 'disabled' : ''}>${o.locked ? 'Locked for now' : 'Continue'}</button>
  </form>
  <div style="margin-top:auto;padding:24px;display:flex;flex-direction:column;align-items:center;gap:12px;font-size:14px;color:#A1A1AA;text-align:center">
    <span>Don't have the password? Ask the person who shared this link.</span>
    <form method="post" action="${esc(o.reportAction)}"><button class="linkbtn" type="submit">Report this link</button></form>
    <span style="display:flex;align-items:center;gap:8px;font-size:13px;color:#8E8E98">${MARK(16)}Secured by LinkPulse</span>
  </div>
</main>`,
  );
}

export function unlockedPage(shortUrl: string, next: string, title: string | null): string {
  // "Continue now" is a form button, not a link: Chrome preloads links on screen or under the
  // pointer, and that preload of /:code was counted as a second visit (+2 on first unlock).
  const target = new URL(next, 'http://x');
  const hidden = [...target.searchParams]
    .map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`)
    .join('');
  return shell(
    'Unlocked',
    `<main class="card">
  <div class="grid-bg" style="padding:64px 24px 72px;display:flex;flex-direction:column;align-items:center;gap:18px;border-bottom:1px solid #1F1F24">
    <span class="fm" style="font-size:14px;color:#E6FF66">${esc(shortUrl)}</span>
  </div>
  <div role="status" style="margin:-40px 16px 0;background:#141416;border:1px solid #232328;border-radius:20px;padding:28px 22px;display:flex;flex-direction:column;align-items:center;gap:14px;text-align:center;box-shadow:0 20px 40px -12px rgba(0,0,0,.8)">
    <span style="width:56px;height:56px;border-radius:50%;background:#D4FF00;display:flex;align-items:center;justify-content:center;box-shadow:0 0 24px rgba(212,255,0,.35)"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#000000" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10"></path></svg></span>
    <h1 class="fd" style="margin:0;font-size:26px;font-weight:700;color:#FFFFFF">Unlocked</h1>
    <p style="margin:0;font-size:16px;color:#A1A1AA">Taking you to ${title ? esc(title) : 'the page'}…</p>
    <form method="get" action="${esc(target.pathname)}">${hidden}<button class="linkbtn" type="submit" style="font-weight:700;font-size:16px">Continue now</button></form>
  </div>
</main>`,
    `<meta http-equiv="refresh" content="1;url=${esc(next)}">`,
  );
}
