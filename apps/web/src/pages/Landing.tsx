import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Icon, type IconName } from '../components/Icon';
import { LogoMark } from '../components/Logo';
import { HeroDemo } from '../components/landing/HeroDemo';
import { Reveal } from '../components/landing/Reveal';

const GRID_BG =
  'bg-ink bg-[linear-gradient(rgba(255,255,255,.045)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.045)_1px,transparent_1px)] bg-[length:56px_56px]';
const H2 = 'm-0 font-display text-[34px] font-bold leading-[1.05] tracking-[-0.03em] sm:text-[44px] lg:text-[52px]';
const OVERLINE = 'text-[14px] font-bold uppercase tracking-[.12em]';
const PRIMARY = 'inline-flex items-center gap-2.5 rounded-[14px] bg-accent-400 font-bold text-black no-underline hover:text-black hover:brightness-[1.07]';
const GHOST = 'inline-flex items-center rounded-input font-semibold text-white no-underline hover:bg-white/[.08] hover:text-white';

function Arrow() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

/** A 24×24 line glyph for shapes Icon does not have (arrow, pulse, power). */
function Glyph({ d, className = '', size = 24 }: { d: string; className?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d={d} />
    </svg>
  );
}

const BASIC = [
  'Sends every visitor to the same page, forever',
  'Counts every hit, bots and refreshes included',
  'No owner, no campaign, no way to stop a bad link',
  'Logs clicks inside the redirect, so it gets slow',
];
const OURS = [
  'Links grouped by campaign and tags, each with one owner',
  'Expire on a date, or stop at an exact click limit',
  'Password gate for private links',
  'iPhone, Android and desktop visitors sent to their own page',
  'An admin disables an abusive link and it stops at once',
  'Click details saved in the background, never slowing the visit',
];

const PILLARS: { n: string; title: string; body: string; tags: string; icon: IconName | { d: string } }[] = [
  { n: '01', title: 'Create', body: 'A two-step wizard warns you about a taken alias or a bad URL before you publish.', tags: 'Wizard · QR · CSV import', icon: 'plus' },
  { n: '02', title: 'Redirect', body: 'Status, expiry, password, limit and device are checked in one fixed order, every time.', tags: 'Fixed rule order · 302', icon: { d: 'M5 12h14M13 6l6 6-6 6' } },
  { n: '03', title: 'Track', body: 'Time, source, device, browser and city for each visit. Preview bots are saved but never counted.', tags: 'Live dashboard · bots filtered', icon: { d: 'M3 12h4l3-8 4 16 3-8h4' } },
  { n: '04', title: 'Control', body: 'Roles checked on the server, a domain blocklist, a kill switch and a full audit log.', tags: 'Roles · takedown · audit', icon: 'shield' },
];

const STEPS = [
  { title: 'Link exists?', check: 'Code found in the cache, then the database.', out: 'If not: 404, no such link' },
  { title: 'Disabled or blocked?', check: 'Admin takedown or a blocked domain.', out: 'If yes: Link disabled page' },
  { title: 'Expired?', check: 'Now is past the expiry time (UTC).', out: 'If yes: Expired page, or the fallback URL' },
  { title: 'Password set?', check: 'Show the form and check the answer.', out: 'If wrong: try again, not counted' },
  { title: 'Bot?', check: 'Preview bots and crawlers by user agent.', out: 'If yes: redirect, but do not count' },
  { title: 'Under the limit?', check: 'One safe +1 in the database.', out: 'If full: Limit reached page' },
  { title: 'Device rule?', check: 'iPhone, Android or desktop target.', out: 'No match: the default destination' },
  { title: 'Log and redirect', check: 'Queue the click details, send 302.', out: 'The visitor never waits for logging' },
];

const NOTES: { icon: IconName | { d: string }; strong: string; rest: string }[] = [
  { icon: { d: 'M12 3v9M6.4 6.4a8 8 0 1 0 11.2 0' }, strong: 'Disable comes before expiry,', rest: 'so an admin takedown always wins.' },
  { icon: 'lock', strong: 'Password before counting,', rest: 'so wrong tries never use up the limit.' },
  { icon: 'bot', strong: 'Bots before the limit,', rest: 'so a WhatsApp preview never takes a real slot.' },
];

const ROLES = [
  { who: 'Visitor', title: 'Opens links. Nothing else.', body: 'No account needed. Enters a password when a link asks for one, and always gets a clear page if a link has stopped.', dark: false, tone: 'text-text-3' },
  { who: 'User', title: 'Runs their own links.', body: 'Creates links, campaigns, tags and QR codes, and sees analytics for their own links only.', dark: false, tone: 'text-accent-700' },
  { who: 'Admin', title: 'Keeps everyone safe.', body: 'Sees the whole platform, disables abusive links in one step and manages the domain blocklist.', dark: true, tone: 'text-accent-300' },
];

function PickIcon({ icon, className, size }: { icon: IconName | { d: string }; className?: string; size?: number }) {
  return typeof icon === 'string' ? <Icon name={icon} size={size} className={className} /> : <Glyph d={icon.d} size={size} className={className} />;
}

export function Landing() {
  const { me } = useAuth();
  const start = me ? '/links/new' : '/login';

  // Glide to #features / #rules / #roles on this page only (the app's own page changes stay instant).
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const root = document.documentElement;
    root.style.scrollBehavior = 'smooth';
    return () => {
      root.style.scrollBehavior = '';
    };
  }, []);

  return (
    <div className="overflow-hidden bg-ground font-sans text-fg">
      {/* The pulse line draws once; the global reduced-motion rule ends it at once, fully drawn. */}
      <style>{'@keyframes lpDraw{from{stroke-dashoffset:1600}to{stroke-dashoffset:0}}'}</style>

      {/* HERO */}
      <section className={`relative flex min-h-screen flex-col justify-between px-4 pb-20 text-white sm:px-6 ${GRID_BG}`}>
        {/* One row at every width: on phones the buttons get compact and, below 360px, the wordmark is
            visually hidden (still read by screen readers) so "Sign in" and "Get started" never wrap. */}
        <nav aria-label="Main" className="mx-auto flex w-full max-w-[1240px] items-center justify-between gap-3 py-5 sm:gap-6 sm:py-6">
          <Link to="/" className="flex min-w-0 items-center gap-2 text-white no-underline hover:text-white sm:gap-2.5">
            <LogoMark size={34} />
            <span className="font-display text-[19px] font-bold tracking-[-0.02em] max-[359px]:sr-only sm:text-[22px]">LinkPulse</span>
          </Link>
          <div className="hidden gap-8 text-[15px] md:flex">
            <a href="#features" className="flex min-h-[44px] items-center text-ondark-2 no-underline hover:text-white">Features</a>
            <a href="#rules" className="flex min-h-[44px] items-center text-ondark-2 no-underline hover:text-white">How it works</a>
            <a href="#roles" className="flex min-h-[44px] items-center text-ondark-2 no-underline hover:text-white">For teams</a>
          </div>
          <div className="flex flex-none items-center gap-1.5 sm:gap-3">
            {me ? (
              <Link to="/dashboard" className={`${PRIMARY} min-h-[44px] whitespace-nowrap rounded-input px-4 py-3 text-[14px] sm:px-5 sm:text-[15px]`}>
                Open dashboard
              </Link>
            ) : (
              <>
                <Link to="/login" className={`${GHOST} min-h-[44px] whitespace-nowrap px-3 py-3 text-[14px] sm:px-[18px] sm:text-[15px]`}>
                  Sign in
                </Link>
                <Link to="/login" className={`${PRIMARY} min-h-[44px] whitespace-nowrap rounded-input px-4 py-3 text-[14px] sm:px-5 sm:text-[15px]`}>
                  Get started<span className="hidden sm:inline">&nbsp;free</span>
                </Link>
              </>
            )}
          </div>
        </nav>

        <div className="mx-auto my-auto flex max-w-[900px] flex-col items-center text-center py-10">
          <Reveal className="flex flex-col items-center text-center gap-7">
            <h1 className="m-0 font-display text-[44px] font-[750] leading-none tracking-[-0.035em] [text-wrap:balance] sm:text-[60px] lg:text-[76px] text-center">
              Short links you stay <span className="text-accent-400">in control</span> of.
            </h1>

            <div className="flex flex-wrap justify-center gap-3.5">
              <Link to={start} className={`${PRIMARY} min-h-[56px] px-[26px] py-4 text-[17px]`}>
                Shorten your first link
                <Arrow />
              </Link>
              <a href="#rules" className={`${GHOST} min-h-[56px] rounded-[14px] border border-white/[.22] px-6 py-4 text-[17px]`}>
                See how a click travels
              </a>
            </div>
            <ul className="m-0 flex list-none flex-wrap justify-center gap-x-7 gap-y-3 p-0 pt-2 text-[14.5px] text-[#9C9CA8]">
              {['Every visit checked', 'Exact click limits', 'No raw IPs stored'].map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <Icon name="check" size={16} strokeWidth={2.4} className="text-accent-400" />
                  {t}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>

        <svg aria-hidden="true" viewBox="0 0 1440 120" preserveAspectRatio="none" className="absolute inset-x-0 bottom-4 h-[90px] w-full opacity-50">
          <path
            d="M0 70 H420 l18-36 26 74 22-56 14 18 H760 l14-24 20 50 16-26 H1440"
            fill="none"
            stroke="#D4FF00"
            strokeWidth="2"
            style={{ strokeDasharray: 1600, animation: 'lpDraw 3s ease-out both' }}
          />
        </svg>
      </section>

      {/* THE PROBLEM */}
      <section id="features" className="scroll-mt-4 px-4 pb-24 pt-[88px] sm:px-6 sm:pt-[120px]">
        <div className="mx-auto flex max-w-[1240px] flex-col gap-14">
          <Reveal className="flex max-w-[760px] flex-col gap-4">
            <span className={`${OVERLINE} text-accent-700`}>The problem</span>
            <h2 className={`${H2} [text-wrap:balance]`}>Turning a code into a URL is the easy part. Control and honest numbers are the hard part.</h2>
          </Reveal>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(440px,100%),1fr))] gap-6">
            <Reveal className="flex flex-col gap-[22px] rounded-[24px] bg-[#16161A] p-6 sm:p-9">
              <div className="flex flex-col gap-1.5">
                <span className="text-[14px] font-semibold text-text-3">A basic shortener</span>
                <h3 className="m-0 font-display text-[28px] font-bold text-text-2">maps code to URL, and that is all</h3>
              </div>
              <ul className="m-0 flex list-none flex-col gap-4 p-0 text-[16.5px] text-text-2">
                {BASIC.map((t) => (
                  <li key={t} className="flex items-start gap-3">
                    <Icon name="x" size={20} strokeWidth={2.4} className="mt-0.5 flex-none text-[#94A3B8]" />
                    <span>
                      <span className="sr-only">Missing: </span>
                      {t}
                    </span>
                  </li>
                ))}
              </ul>
            </Reveal>
            <Reveal
              delay={120}
              className="flex flex-col gap-[22px] rounded-[24px] border border-line bg-surface p-6 shadow-[0_1px_0_rgba(11,19,36,.04),0_24px_48px_-28px_rgba(11,19,36,.25)] sm:p-9"
            >
              <div className="flex flex-col gap-1.5">
                <span className="text-[14px] font-semibold text-accent-700">LinkPulse</span>
                <h3 className="m-0 font-display text-[28px] font-bold">links, analytics and safety in one flow</h3>
              </div>
              <ul className="m-0 flex list-none flex-col gap-4 p-0 text-[16.5px]">
                {OURS.map((t) => (
                  <li key={t} className="flex items-start gap-3">
                    <Icon name="check" size={20} strokeWidth={2.6} className="mt-0.5 flex-none text-accent-600" />
                    {t}
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </div>
      </section>

      {/* PILLARS */}
      <section className="px-4 pb-[120px] pt-6 sm:px-6">
        <div className="mx-auto flex max-w-[1240px] flex-col gap-12">
          <Reveal className="flex flex-wrap items-end justify-between gap-6">
            <h2 className={`${H2} max-w-[640px]`}>One link record. Its whole life in one place.</h2>
            <p className="m-0 max-w-[420px] text-[17px] leading-[1.6] text-text-3">
              Campaigns, rules, QR codes, clicks and reports all hang off the same link, so nothing gets lost when a link expires or is switched off.
            </p>
          </Reveal>
          <ol className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(min(270px,100%),1fr))] gap-5 p-0">
            {PILLARS.map((p, i) => (
              <Reveal as="li" key={p.n} delay={i * 90} className="flex flex-col gap-4 rounded-[22px] border border-line bg-surface p-7">
                <div className="flex items-center justify-between">
                  <span className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-accent-50 text-accent-700">
                    <PickIcon icon={p.icon} size={24} />
                  </span>
                  <span aria-hidden className="font-mono text-[13px] text-text-4">{p.n}</span>
                </div>
                <h3 className="m-0 font-display text-[24px] font-bold">{p.title}</h3>
                <p className="m-0 text-[15.5px] leading-[1.55] text-text-3">{p.body}</p>
                <span className="text-[13.5px] font-semibold text-accent-700">{p.tags}</span>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* RULE ORDER */}
      <section id="rules" className="scroll-mt-4 bg-ink px-4 py-20 text-white sm:px-6 sm:py-28">
        <div className="mx-auto flex max-w-[1240px] flex-col gap-[52px]">
          <Reveal className="flex max-w-[780px] flex-col gap-4">
            <span className={`${OVERLINE} text-accent-300`}>How a click travels</span>
            <h2 className={H2}>Every visit passes the same eight checks, in the same order.</h2>
            <p className="m-0 text-[18px] leading-[1.6] text-ondark-2">If a check fails, the visitor sees a clear page that says what happened, in plain words.</p>
          </Reveal>
          <ol className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(min(270px,100%),1fr))] gap-4 p-0">
            {STEPS.map((s, i) => (
              // Stagger within a row of four, so a long single-column list on phones never waits.
              <Reveal as="li" key={s.title} delay={(i % 4) * 80} className="flex flex-col gap-3 rounded-card border border-white/[.09] bg-ink-3 p-[22px]">
                <div className="flex items-center gap-3">
                  <span aria-hidden className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[10px] bg-accent-400 font-mono text-[15px] font-bold text-black">
                    {i + 1}
                  </span>
                  <h3 className="m-0 font-display text-[19px] font-bold">
                    <span className="sr-only">Step {i + 1}: </span>
                    {s.title}
                  </h3>
                </div>
                <span className="text-[14.5px] leading-normal text-ondark-2">{s.check}</span>
                <span className="border-t border-dashed border-white/[.14] pt-3 text-[13.5px] leading-[1.45] text-[#FFD9A8]">{s.out}</span>
              </Reveal>
            ))}
          </ol>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] gap-4">
            {NOTES.map((n, i) => (
              <Reveal key={n.strong} delay={i * 100} className="flex items-start gap-3.5 rounded-[16px] border border-[rgba(212,255,0,.16)] bg-[rgba(212,255,0,.16)] p-5">
                <PickIcon icon={n.icon} size={22} className="flex-none text-accent-300" />
                <span className="text-[15px] leading-[1.55] text-[#DCDCE3]">
                  <strong className="text-white">{n.strong}</strong> {n.rest}
                </span>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ROLES */}
      <section id="roles" className="scroll-mt-4 px-4 py-20 sm:px-6 sm:py-28">
        <div className="mx-auto flex max-w-[1240px] flex-col gap-12">
          <Reveal>
            <h2 className={`${H2} max-w-[720px]`}>The right access for each person.</h2>
          </Reveal>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(340px,100%),1fr))] gap-5">
            {ROLES.map((r, i) => (
              <Reveal key={r.who} delay={i * 110} className={`flex flex-col gap-3.5 rounded-[22px] p-8 ${r.dark ? 'bg-ink text-white' : 'border border-line bg-surface'}`}>
                <span className={`text-[13px] font-bold uppercase tracking-[.08em] ${r.tone}`}>{r.who}</span>
                <h3 className="m-0 font-display text-[26px] font-bold">{r.title}</h3>
                <p className={`m-0 text-[15.5px] leading-[1.6] ${r.dark ? 'text-ondark-2' : 'text-text-3'}`}>{r.body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 pb-20 sm:px-6 sm:pb-28">
        <Reveal className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-8 rounded-[28px] border border-[rgba(212,255,0,.16)] bg-ink px-6 py-12 sm:px-14 sm:py-16">
          <div className="flex max-w-[640px] flex-col gap-3">
            <h2 className="m-0 font-display text-[32px] font-[750] leading-[1.05] tracking-[-0.03em] text-white sm:text-[46px]">Your next campaign link is two steps away.</h2>
            <p className="m-0 text-[18px] text-ondark-2">Paste a URL, pick an alias, set the rules. The QR code is ready when you are.</p>
          </div>
          <Link to={start} className={`${PRIMARY} min-h-[56px] px-7 py-[18px] text-[17px]`}>
            {me ? 'Create a link' : 'Create a free link'}
            <Arrow />
          </Link>
        </Reveal>
      </section>

      
    </div>
  );
}
