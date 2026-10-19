import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CSS_VARS, GROUPS, LOGO_SVG, STATUS, TAILWIND, TYPE_SCALE } from '../components/brand/data';
import { CodePanel, Mark, SectionHead } from '../components/brand/parts';

const GRID_BG =
  'bg-ink bg-[linear-gradient(rgba(255,255,255,.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.04)_1px,transparent_1px)] bg-[length:56px_56px]';
const CARD = 'rounded-card border border-line bg-surface p-7';
const TH = 'px-2 py-3 font-semibold';

const NAV = [
  ['logo', 'Logo'],
  ['theme', 'Theme'],
  ['colours', 'Colours'],
  ['type', 'Type'],
  ['ui', 'Components'],
  ['dev', 'For developers'],
] as const;

export function BrandGuide() {
  const [copied, setCopied] = useState('');
  const timer = useRef<number>();
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(`Copied: ${label}`);
    } catch {
      setCopied('Could not copy. Select the text and copy it by hand.');
    }
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(''), 4000);
  };

  return (
    <div className="bg-ground font-sans text-fg">
      {/* HEADER + LOGO HERO */}
      <header className={`border-b border-line px-4 pb-20 pt-7 text-white sm:px-6 sm:pb-24 ${GRID_BG}`}>
        <div className="mx-auto flex max-w-[1200px] flex-col gap-14 sm:gap-[72px]">
          <div className="flex flex-wrap items-center justify-between gap-5">
            <Link to="/" className="text-[14px] font-bold uppercase tracking-wider text-accent-300 no-underline hover:text-white">
              Brand and theme guide · v2.0 (dark)
            </Link>
            <nav aria-label="Guide sections" className="flex flex-wrap gap-1.5">
              {NAV.map(([id, label]) => (
                <a
                  key={id}
                  href={`#${id}`}
                  className="flex min-h-[44px] items-center rounded-full border border-line-strong px-3.5 text-[14px] font-semibold text-white no-underline transition-colors hover:border-accent-400 hover:text-accent-400"
                >
                  {label}
                </a>
              ))}
            </nav>
          </div>
          <div className="flex flex-wrap items-center gap-6 sm:gap-9">
            <Mark size={136} glow label="LinkPulse mark" className="h-20 w-20 sm:h-[136px] sm:w-[136px]" />
            <div className="flex flex-col gap-3">
              <h1 className="m-0 font-zentry text-[52px] font-black uppercase leading-[.95] tracking-[-0.02em] sm:text-[96px]">LinkPulse</h1>
              <span className="text-[18px] text-ondark-2">Short links you stay in control of.</span>
            </div>
          </div>
        </div>
      </header>

      <main className="px-4 pb-[120px] sm:px-6">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-24 sm:gap-28">
          {/* LOGO */}
          <section id="logo" aria-labelledby="logo-title" className="flex scroll-mt-4 flex-col gap-9 pt-20 sm:pt-24">
            <SectionHead id="logo" overline="01 · Logo" title="One beat of lime in a dark tile.">
              The mark is a single pulse: one sharp beat, like a live click arriving. It sits in a near-black tile with a thin edge, so it reads on
              the black canvas and on photos. The pulse is the only colour in the mark.
            </SectionHead>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-4">
              {[
                { t: '1. The tile', d: 'A near-black square (#141416) with a #2A2A32 edge and 8 px corners. Calm and steady.', pulse: null as string | null, tile: 'edge' as const },
                { t: '2. The pulse', d: 'One beat in Pulse Lime: a human click passing through. Also reads as the 302 hop to the destination.', pulse: '#D4FF00', tile: 'none' as const },
                { t: '3. LinkPulse', d: 'Tile and pulse together, with a soft lime glow in the app (sidebar, sign-in card).', pulse: '#D4FF00', tile: 'edge' as const },
              ].map((p) => (
                <div key={p.t} className={`${CARD} flex flex-col gap-[18px]`}>
                  <div className="flex h-[150px] items-center justify-center rounded-[14px] border border-line bg-ink">
                    <Mark size={96} tile={p.tile} pulse={p.pulse} glow={p.t.startsWith('3')} />
                  </div>
                  <h3 className="m-0 font-display text-[20px] font-bold">{p.t}</h3>
                  <p className="m-0 text-[15px] leading-[1.55] text-text-3">{p.d}</p>
                </div>
              ))}
            </div>

            <h3 className="m-0 mt-6 font-display text-[26px] font-bold">Versions</h3>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(360px,100%),1fr))] gap-4">
              <figure className="m-0 flex flex-col gap-3">
                <div className="flex h-[200px] items-center justify-center gap-3.5 rounded-[20px] border border-line bg-ink px-4">
                  <Mark size={52} glow />
                  <span className="font-display text-[30px] font-bold uppercase tracking-tight text-white sm:text-[36px]">LinkPulse</span>
                </div>
                <figcaption className="text-[14.5px] text-text-2">
                  <strong className="text-fg">In the app.</strong> Sidebar and headers: Space Grotesk, bold, capitals.
                </figcaption>
              </figure>
              <figure className="m-0 flex flex-col gap-3">
                <div className="flex h-[200px] flex-col items-center justify-center gap-2 rounded-[20px] border border-line bg-ink-3 px-4">
                  <Mark size={46} />
                  <span className="font-zentry text-[30px] font-black uppercase tracking-[-0.02em] text-white sm:text-[34px]">LinkPulse</span>
                </div>
                <figcaption className="text-[14.5px] text-text-2">
                  <strong className="text-fg">Brand wordmark.</strong> Sign-in card, brand guide, slides: the Zentry display face.
                </figcaption>
              </figure>
              <figure className="m-0 flex flex-col gap-3">
                <div className="flex h-[200px] items-center justify-center gap-3.5 rounded-[20px] bg-accent-400 px-4">
                  <Mark size={56} tile="none" pulse="#000000" />
                  <span className="font-display text-[30px] font-bold uppercase tracking-tight text-black sm:text-[36px]">LinkPulse</span>
                </div>
                <figcaption className="text-[14.5px] text-text-2">
                  <strong className="text-fg">Without the tile.</strong> Print, stickers, T-shirts: black pulse on lime (or lime on black).
                </figcaption>
              </figure>
              <figure className="m-0 flex flex-col gap-3">
                <div className="flex h-[200px] items-end justify-center gap-6 rounded-[20px] border border-line bg-surface pb-10">
                  <Mark size={72} label="App icon, 72 pixels" />
                  <Mark size={40} stroke={2.9} label="App icon, 40 pixels" />
                  <Mark size={24} stroke={3.2} label="App icon, 24 pixels" />
                  <svg width="16" height="16" viewBox="0 0 32 32" role="img" aria-label="Favicon, 16 pixels">
                    <rect width="32" height="32" rx="8" fill="#0B0B0F" />
                    <path d="M8 16h5l2-5 3 10 2-5h4" fill="none" stroke="#D4FF00" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <figcaption className="text-[14.5px] text-text-2">
                  <strong className="text-fg">App icon and favicon.</strong> 72, 40, 24 px. At 16 px the pulse gets thicker so it stays sharp.
                </figcaption>
              </figure>
            </div>

            <h3 className="m-0 mt-6 font-display text-[26px] font-bold">Using the logo</h3>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(360px,100%),1fr))] gap-4">
              <div className={`${CARD} flex flex-col gap-[18px]`}>
                <div className="flex h-[200px] items-center justify-center rounded-[14px] bg-subtle">
                  <div className="relative flex items-center gap-3 rounded-md border-[1.5px] border-dashed border-accent-400 p-[22px]">
                    <Mark size={44} />
                    <span className="font-display text-[26px] font-bold uppercase tracking-tight sm:text-[30px]">LinkPulse</span>
                    <span className="absolute left-1 top-0.5 font-mono text-[11px] text-accent-400">½ mark</span>
                  </div>
                </div>
                <h4 className="m-0 font-display text-[19px] font-bold">Clear space and size</h4>
                <ul className="m-0 pl-[18px] text-[15px] leading-[1.7] text-text-2">
                  <li>Keep empty space of half the mark&apos;s width on every side.</li>
                  <li>Gap between mark and word = 0.3 × mark width.</li>
                  <li>Smallest size: mark 16 px, full logo 96 px wide.</li>
                  <li>Wordmark in capitals: Zentry for the brand, Space Grotesk Bold inside the app.</li>
                </ul>
              </div>
              <div className={`${CARD} flex flex-col gap-[18px]`}>
                <ul className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(110px,1fr))] gap-3 p-0">
                  <li className="flex h-[200px] flex-col items-center justify-center gap-3 rounded-[14px] bg-subtle">
                    <Mark size={48} style={{ transform: 'scaleX(1.6)' }} />
                    <span className="text-[13px] font-bold text-danger">× Don&apos;t stretch</span>
                  </li>
                  <li className="flex h-[200px] flex-col items-center justify-center gap-3 rounded-[14px] bg-subtle">
                    <Mark size={48} tile="plain" tileFill="#16A34A" pulse="#EC4899" />
                    <span className="text-[13px] font-bold text-danger">× Don&apos;t recolour</span>
                  </li>
                  <li className="flex h-[200px] flex-col items-center justify-center gap-3 rounded-[14px] bg-[#38BDF8] bg-[repeating-linear-gradient(45deg,rgba(255,255,255,.35)_0_6px,transparent_6px_14px)]">
                    <Mark size={48} tile="none" />
                    <span className="rounded-md bg-ink px-2 py-0.5 text-center text-[13px] font-bold text-fg">× No busy backgrounds</span>
                  </li>
                </ul>
                <h4 className="m-0 font-display text-[19px] font-bold">Please don&apos;t</h4>
                <p className="m-0 text-[15px] leading-[1.6] text-text-2">
                  Don&apos;t stretch, rotate or change the colours. On a photo or a busy pattern, always keep the dark tile.
                </p>
              </div>
            </div>
          </section>

          {/* THEME */}
          <section id="theme" aria-labelledby="theme-title" className="flex scroll-mt-4 flex-col gap-7">
            <SectionHead id="theme" overline="02 · Theme" title="Black canvas. Dark cards. Lime only for action.">
              The black page feels calm and serious, like a control room. Work sits on near-black cards with thin borders, so numbers stand out.
              Lime appears only where something can be done or something is live, so the eye finds it fast.
            </SectionHead>
            <div className="flex flex-col gap-2.5">
              <div
                role="img"
                aria-label="Colour balance: 60 percent black page, 30 percent dark cards, 10 percent lime"
                className="flex h-[72px] overflow-hidden rounded-card border border-line text-[13px] font-bold sm:text-[15px]"
              >
                <div className="flex flex-[60] items-center bg-ground px-3 text-white sm:px-5">
                  60% Black<span className="hidden md:inline">&nbsp;(#000000 + #0A0A0C)</span>
                </div>
                <div className="flex flex-[30] items-center border-l border-line bg-surface px-3 text-white sm:px-5">30% Cards</div>
                <div className="flex flex-[10] items-center justify-center bg-accent-400 text-black">10%</div>
              </div>
              <span className="text-[14px] text-text-3">
                Status colours (green, amber, orange, red, sky blue) are extra and only mean a state. Never use them for decoration.
              </span>
            </div>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(260px,100%),1fr))] gap-4">
              {[
                ['One lime action per area', 'Each screen or card has one lime button: the main next step. Other buttons are dark with a thin border.'],
                ['Never colour alone', 'Every status has a dot, an icon or a word next to its colour, so colour-blind users read it too.'],
                ['Sky blue means "bot, not counted"', 'Bot hits always carry the words "not counted", so they step aside next to real human clicks.'],
              ].map(([t, d]) => (
                <div key={t} className="flex flex-col gap-2 rounded-card border border-line bg-surface p-[22px]">
                  <h3 className="m-0 font-display text-[18px] font-bold">{t}</h3>
                  <p className="m-0 text-[14.5px] leading-[1.55] text-text-3">{d}</p>
                </div>
              ))}
            </div>
          </section>

          {/* COLOURS */}
          <section id="colours" aria-labelledby="colours-title" className="flex scroll-mt-4 flex-col gap-7">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <SectionHead id="colours" overline="03 · Colours" title="Every colour, and where it goes." />
              <span aria-live="polite" role="status" className="min-h-5 text-[14px] font-semibold text-ok">
                {copied}
              </span>
            </div>
            {GROUPS.map((g) => (
              <div key={g.name} className="flex flex-col gap-3.5">
                <div className="flex flex-wrap items-baseline gap-3">
                  <h3 className="m-0 font-display text-[24px] font-bold">{g.name}</h3>
                  <span className="text-[14.5px] text-text-3">{g.desc}</span>
                </div>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(min(270px,100%),1fr))] gap-3.5">
                  {g.items.map((c) => (
                    <article key={c.token} className="flex flex-col overflow-hidden rounded-card border border-line bg-surface">
                      <div className="flex h-[104px] items-end justify-between border-b border-line px-4 py-3.5" style={{ background: c.hex }}>
                        <span aria-hidden className="text-[13px] font-bold" style={{ color: c.on }}>
                          {c.sample}
                        </span>
                      </div>
                      <div className="flex flex-1 flex-col gap-2 p-4">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="m-0 text-[16px] font-bold">{c.name}</h4>
                          <button
                            type="button"
                            onClick={() => void copy(c.hex, `${c.name} ${c.hex}`)}
                            aria-label={`Copy ${c.name} ${c.hex}`}
                            className="min-h-[44px] cursor-pointer rounded-chip border border-line-strong bg-field px-2.5 font-mono text-[13px] font-semibold text-fg transition-colors hover:border-accent-400 hover:text-accent-400"
                          >
                            {c.hex}
                          </button>
                        </div>
                        <span className="font-mono text-[12.5px] text-accent-400">{c.token}</span>
                        <span className="text-[14px] leading-normal text-text-2">{c.use}</span>
                        <span className="mt-auto rounded-chip bg-subtle px-2 py-1.5 text-[12.5px] text-text-3">{c.note}</span>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ))}

            <div className="flex flex-col gap-3.5">
              <div className="flex flex-wrap items-baseline gap-3">
                <h3 className="m-0 font-display text-[24px] font-bold">Status</h3>
                <span className="text-[14.5px] text-text-3">Bright text on its dark tint, with a thin border. Always with a dot or a word.</span>
              </div>
              <div className="overflow-hidden rounded-card border border-line bg-surface">
                <div className="relative overflow-x-auto">
                  <table className="w-full min-w-[820px] border-collapse text-[14.5px]">
                    <caption className="sr-only">Status colours</caption>
                    <thead>
                      <tr className="bg-subtle text-left text-[12.5px] uppercase tracking-wider text-text-4">
                        <th scope="col" className="px-[18px] py-3 font-semibold">Badge</th>
                        <th scope="col" className={TH}>Text</th>
                        <th scope="col" className={TH}>Background</th>
                        <th scope="col" className={TH}>Means</th>
                        <th scope="col" className="py-3 pl-2 pr-[18px] font-semibold">Contrast</th>
                      </tr>
                    </thead>
                    <tbody>
                      {STATUS.map((s) => (
                        <tr key={s.label} className="border-t border-line-soft">
                          <td className="px-[18px] py-3.5">
                            <span
                              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-[5px] text-[13px] font-bold"
                              style={{ background: s.bg, color: s.fg, borderColor: `${s.fg}55` }}
                            >
                              <span aria-hidden className="h-[7px] w-[7px] rounded-full" style={{ background: s.fg }} />
                              {s.label}
                            </span>
                          </td>
                          <td className="px-2 py-3.5 font-mono text-[13.5px]">{s.fg}</td>
                          <td className="px-2 py-3.5 font-mono text-[13.5px]">{s.bg}</td>
                          <td className="px-2 py-3.5 text-text-2">{s.means}</td>
                          <td className="py-3.5 pl-2 pr-[18px] font-mono text-[13.5px] font-semibold text-ok">{s.cr}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </section>

          {/* TYPE */}
          <section id="type" aria-labelledby="type-title" className="flex scroll-mt-4 flex-col gap-7">
            <SectionHead id="type" overline="04 · Typography" title="Four fonts, four jobs.">
              Plus the Zentry display face, used only for the LINKPULSE wordmark.
            </SectionHead>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(260px,100%),1fr))] gap-4">
              <div className="flex flex-col gap-3.5 rounded-card border border-[#2E3608] bg-accent-50 p-7">
                <span className="text-[13px] font-bold text-accent-400">Headings</span>
                <span aria-hidden className="font-display text-[64px] font-bold leading-none tracking-tight">Aa</span>
                <h3 className="m-0 font-display text-[22px] font-bold">Space Grotesk</h3>
                <p className="m-0 text-[14.5px] leading-[1.55] text-text-2">Weights 600–700. Tight letter spacing. Page titles, card titles, big numbers.</p>
              </div>
              <div className={`${CARD} flex flex-col gap-3.5`}>
                <span className="text-[13px] font-bold text-accent-400">Body and UI</span>
                <span aria-hidden className="text-[64px] font-semibold leading-none">Aa</span>
                <h3 className="m-0 text-[22px] font-bold">Inter</h3>
                <p className="m-0 text-[14.5px] leading-[1.55] text-text-3">Weights 400, 500, 600, 700. Text, labels, tables. Never smaller than 12.5 px.</p>
              </div>
              <div className={`${CARD} flex flex-col gap-3.5`}>
                <span className="text-[13px] font-bold text-accent-400">Buttons</span>
                <span aria-hidden className="font-brand text-[64px] font-bold leading-none">Aa</span>
                <h3 className="m-0 font-brand text-[22px] font-bold">Outfit</h3>
                <p className="m-0 text-[14.5px] leading-[1.55] text-text-3">Weight 700. Lime and danger buttons, so actions look different from text.</p>
              </div>
              <div className={`${CARD} flex flex-col gap-3.5`}>
                <span className="text-[13px] font-bold text-accent-400">Links and codes</span>
                <span aria-hidden className="font-mono text-[52px] font-semibold leading-[1.1] text-accent-400">lp.in/</span>
                <h3 className="m-0 font-mono text-[20px] font-semibold">JetBrains Mono</h3>
                <p className="m-0 text-[14.5px] leading-[1.55] text-text-3">Weights 500–600. Short links, URLs, hex codes, times. Each letter is clear: 0 vs O, l vs 1.</p>
              </div>
            </div>
            <div className="overflow-hidden rounded-card border border-line bg-surface">
              <div className="relative overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse">
                  <caption className="sr-only">Type scale</caption>
                  <thead>
                    <tr className="bg-subtle text-left text-[12.5px] uppercase tracking-wider text-text-4">
                      <th scope="col" className="px-[18px] py-3 font-semibold">Style</th>
                      <th scope="col" className={TH}>Sample</th>
                      <th scope="col" className="py-3 pl-2 pr-[18px] font-semibold">Font · size / line height / weight</th>
                    </tr>
                  </thead>
                  <tbody>
                    {TYPE_SCALE.map((t) => (
                      <tr key={t.style} className="border-t border-line-soft">
                        <td className="px-[18px] py-4 text-[14px] text-text-3">{t.style}</td>
                        <td className={`px-2 py-4 ${t.cls}`}>{t.sample}</td>
                        <td className="py-4 pl-2 pr-[18px] font-mono text-[13px] text-text-2">{t.spec}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* COMPONENTS */}
          <section id="ui" aria-labelledby="ui-title" className="flex scroll-mt-4 flex-col gap-7">
            <SectionHead id="ui" overline="05 · Components" title="Shapes and sizes." />
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(360px,100%),1fr))] gap-4">
              <div className={`${CARD} flex flex-col gap-[18px]`}>
                <h3 className="m-0 font-display text-[19px] font-bold">Buttons</h3>
                {/* Samples only: they do nothing, so they are hidden from keyboard and screen readers and described in words. */}
                <span className="sr-only">Button samples: Primary, Secondary, Dark, Danger and Disabled.</span>
                <div aria-hidden className="flex flex-wrap items-center gap-2.5">
                  <button type="button" tabIndex={-1} className="h-[46px] cursor-default rounded-input border-0 bg-accent-400 px-5 font-brand text-[15px] font-bold text-black shadow-[0_2px_14px_rgba(212,255,0,0.25)]">Primary</button>
                  <button type="button" tabIndex={-1} className="h-[46px] cursor-default rounded-input border border-line-strong bg-field px-[18px] text-[15px] font-semibold text-fg">Secondary</button>
                  <button type="button" tabIndex={-1} className="h-[46px] cursor-default rounded-input border border-line-strong bg-[#1E1E24] px-[18px] text-[15px] font-semibold text-white">Dark</button>
                  <button type="button" tabIndex={-1} className="h-[46px] cursor-default rounded-input border-0 bg-danger-solid px-[18px] font-brand text-[15px] font-bold text-white">Danger</button>
                  <button type="button" disabled className="h-[46px] rounded-input border-0 bg-[#1E1E24] px-[18px] text-[15px] font-bold text-text-4">Disabled</button>
                </div>
                <p className="m-0 text-[14px] leading-[1.55] text-text-3">Heights 44, 46, 52, 56 px. Never under 44 px, so fingers and shaky hands hit them easily. Radius 12 px.</p>
              </div>
              <div className={`${CARD} flex flex-col gap-3.5`}>
                <h3 className="m-0 font-display text-[19px] font-bold">Inputs</h3>
                <label className="flex flex-col gap-1.5 text-[13.5px] font-semibold text-text-3">
                  Normal
                  <input type="text" readOnly defaultValue="https://forms.gle/innovista" className="h-[46px] rounded-input border border-line-strong bg-field px-3.5 text-[15px] font-normal text-fg" />
                </label>
                <label className="flex flex-col gap-1.5 text-[13.5px] font-semibold text-text-3">
                  Problem
                  <input type="text" readOnly defaultValue="javascript:alert(1)" aria-invalid="true" aria-describedby="bg-problem" className="h-[46px] rounded-input border-2 border-[#DC2626] bg-field px-3.5 text-[15px] font-normal text-fg" />
                  <span id="bg-problem" className="text-[13.5px] font-semibold text-danger">javascript: links are not allowed</span>
                </label>
                <label className="flex flex-col gap-1.5 text-[13.5px] font-semibold text-text-3">
                  Focused
                  <input type="text" readOnly defaultValue="innovista26" aria-describedby="bg-checked" className="h-[46px] rounded-input border border-accent-400 bg-[#1F1F24] px-3.5 text-[15px] font-normal text-fg shadow-[0_0_0_3px_rgba(212,255,0,.16)]" />
                  <span id="bg-checked" className="text-[13.5px] font-semibold text-ok">lp.in/innovista26 is free</span>
                </label>
              </div>
              <div className={`${CARD} flex flex-col gap-[18px]`}>
                <h3 className="m-0 font-display text-[19px] font-bold">Radius and spacing</h3>
                <ul className="m-0 flex list-none flex-wrap items-end gap-3 p-0">
                  {[
                    ['8 chip', 'rounded-chip'],
                    ['12 input', 'rounded-input'],
                    ['16 card', 'rounded-card'],
                    ['20 dialog', 'rounded-[20px]'],
                    ['pill', 'rounded-full'],
                  ].map(([l, r]) => (
                    <li key={l} className="flex flex-col items-center gap-1.5">
                      <span aria-hidden className={`h-14 w-14 border-[1.5px] border-accent-400 bg-accent-50 ${r}`} />
                      <span className="font-mono text-[12.5px] text-text-2">{l}</span>
                    </li>
                  ))}
                </ul>
                <p className="m-0 text-[14px] leading-[1.55] text-text-3">Spacing steps: 4, 8, 12, 16, 24, 32, 48, 72, 112 px. Cards use 20–28 px inside, 16 px between.</p>
              </div>
            </div>
          </section>

          {/* DEV */}
          <section id="dev" aria-labelledby="dev-title" className="flex scroll-mt-4 flex-col gap-7">
            <SectionHead id="dev" overline="06 · For developers" title="Copy these into the project.">
              Use the names, not raw hex codes, in components. Then a colour change is one line.
            </SectionHead>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(480px,100%),1fr))] gap-4">
              <CodePanel file="globals.css" code={CSS_VARS} buttonLabel="Copy CSS" onCopy={() => void copy(CSS_VARS, 'CSS variables')} />
              <CodePanel file="tailwind.config.ts" code={TAILWIND} buttonLabel="Copy config" onCopy={() => void copy(TAILWIND, 'Tailwind config')} />
            </div>
            <div className="flex flex-col gap-2.5 rounded-card border border-line bg-surface p-[22px]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="m-0 font-display text-[18px] font-bold">Logo as code (SVG, 32 × 32)</h3>
                <button
                  type="button"
                  onClick={() => void copy(LOGO_SVG, 'Logo SVG')}
                  className="min-h-[44px] cursor-pointer rounded-chip border border-line-strong bg-field px-3 text-[13px] font-semibold text-fg transition-colors hover:border-accent-400 hover:text-accent-400"
                >
                  Copy SVG
                </button>
              </div>
              <pre className="m-0 whitespace-pre-wrap break-all rounded-input bg-subtle p-4 font-mono text-[12.5px] leading-[1.6] text-text-2">{LOGO_SVG}</pre>
            </div>
            {/* Visual echo of the live message near these buttons; the live region above is what screen readers hear. */}
            <span aria-hidden className="min-h-5 text-[14px] font-semibold text-ok">
              {copied}
            </span>
          </section>
        </div>
      </main>
    </div>
  );
}
