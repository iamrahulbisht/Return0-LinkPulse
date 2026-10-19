import { SHORT_HOST } from '../../lib/api';
import { Icon } from '../Icon';

/**
 * Picture of the wizard and a live click, built from real markup so it stays sharp and readable.
 * It is an example, not live data, so the "Copy" chip is not a real button.
 */
export function HeroDemo() {
  return (
    <figure className="relative m-0">
      <figcaption className="sr-only">Example: making a short link in two steps, and a live click arriving.</figcaption>
      <div className="flex flex-col gap-[18px] rounded-[24px] bg-surface p-5 text-fg shadow-[0_40px_80px_-24px_rgba(0,0,0,.55),0_0_0_1px_rgba(255,255,255,.06)] sm:p-7">
        <div className="flex items-center justify-between gap-3">
          <span className="font-display text-[20px] font-bold">New link</span>
          <span className="rounded-chip bg-bot-bg px-2.5 py-1.5 text-[13px] text-text-3">Step 1 of 2</span>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold text-text-2">Destination URL</span>
          <div className="truncate rounded-input border-[1.5px] border-line-strong px-4 py-3.5 font-mono text-[14px]">https://docs.google.com/forms/d/e/innovista-2026/viewform</div>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold text-text-2">Custom alias</span>
          <div className="flex min-w-0 items-center overflow-hidden rounded-input border-2 border-[#16A34A]">
            <span className="truncate py-3.5 pl-4 pr-1 font-mono text-[15px] text-text-4">{SHORT_HOST}/</span>
            <span className="flex-1 py-3.5 font-mono text-[15px] font-semibold">innovista26</span>
            <span className="flex items-center gap-1.5 pr-3.5 text-[13px] font-semibold text-ok">
              <Icon name="check" size={16} strokeWidth={2.6} />
              Available
            </span>
          </div>
        </div>
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
          {['Valid https URL', 'Not on blocklist', 'No redirect loop'].map((c) => (
            <li key={c} className="flex items-center gap-1.5 rounded-full bg-ok-bg px-2.5 py-1.5 text-[12.5px] font-semibold text-[#86EFAC]">
              <Icon name="check" size={13} strokeWidth={2.6} />
              {c}
            </li>
          ))}
        </ul>
        <div className="h-px bg-line" />
        <div className="flex items-center justify-between gap-3 rounded-[14px] bg-ink px-[18px] py-4 text-white">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="break-all font-mono text-[17px] font-semibold text-accent-300 sm:text-[20px]">{SHORT_HOST}/innovista26</span>
            <span className="text-[13px] text-ondark-3">302 to the registration form</span>
          </div>
          <span aria-hidden className="flex min-h-[44px] flex-none items-center rounded-[10px] bg-accent-400 px-4 text-[14px] font-bold text-black">
            Copy
          </span>
        </div>
        <div className="flex flex-wrap gap-2 text-[13px] text-text-2">
          <span className="rounded-chip bg-bot-bg px-2.5 py-1.5">Campaign: INNOVISTA 2026</span>
          <span className="rounded-chip bg-bot-bg px-2.5 py-1.5">Expires on a date you pick</span>
          <span className="rounded-chip bg-bot-bg px-2.5 py-1.5">Click limit</span>
        </div>
      </div>

      {/* Tucks under the card and overlaps only its empty bottom padding (28px), so it never hides the
          chips or slides off-screen in the one-column tablet layout. */}
      <div className="relative -mt-5 ml-4 flex w-full max-w-[300px] flex-col gap-2.5 rounded-card border border-white/[.12] bg-ink-2 px-[18px] py-4 shadow-[0_24px_48px_-12px_rgba(0,0,0,.6)] sm:ml-6">
        <div className="flex items-center gap-2.5 text-[13px] font-semibold text-accent-300">
          <span className="relative inline-block h-2 w-2">
            <span className="absolute inset-0 animate-ping rounded-full bg-[#22C55E] motion-reduce:animate-none" />
            <span className="absolute inset-0 rounded-full bg-[#22C55E]" />
          </span>
          New human click, just now
        </div>
        <div className="text-[15px] font-semibold text-white">Android · Chrome · Dehradun</div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-md bg-[rgba(212,255,0,.12)] px-2 py-1 text-[12.5px] text-accent-300">Source: QR, Library poster</span>
          <span className="rounded-md border border-bot-line bg-bot-bg px-2 py-1 text-[12.5px] text-bot">Bot filtered, not counted</span>
        </div>
      </div>
    </figure>
  );
}
