import { fmtDay } from '../../lib/format';
import type { PublicBio } from '../../types';
import { Icon, type IconName } from '../Icon';

type BioLink = PublicBio['links'][number];

function Arrow({ className = '' }: { className?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`flex-none ${className}`}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

const LIFT = 'transition-[transform,box-shadow] duration-150 hover:-translate-y-px hover:shadow-[0_8px_20px_-10px_rgba(11,19,36,.35)] motion-reduce:transition-none motion-reduce:hover:translate-y-0';

/** One big button. `featured` = the violet "Closes 30 Oct" card from the design. */
export function BioButton({ link, featured }: { link: BioLink; featured: boolean }) {
  const closed = link.status === 'expired' || link.status === 'limit_reached';

  if (closed) {
    const word = link.status === 'expired' ? 'Closed' : 'Full';
    const icon: IconName = link.status === 'expired' ? 'clock' : 'ban';
    // Still a real link: the short link shows the right "expired" / "full" visitor page.
    return (
      <a
        href={link.href}
        className="flex min-h-[64px] items-center gap-3.5 rounded-[20px] border border-dashed border-[#2A2A33] bg-transparent px-[18px] py-3.5 text-ondark-4 no-underline hover:text-ondark-3"
      >
        <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[11px] bg-ink-3 text-ondark-4">
          <Icon name={icon} size={18} />
        </span>
        <span className="min-w-0 flex-1 break-words text-[16px] font-semibold line-through decoration-1">{link.label}</span>
        <span className="flex-none rounded-full border border-[#3A3A44] px-2.5 py-1 text-[13px] font-semibold text-ondark-3">{word}</span>
      </a>
    );
  }

  if (featured && link.expiresAt) {
    return (
      <a href={link.href} className={`flex min-h-[72px] items-center gap-3.5 rounded-[20px] border-2 border-accent-400 bg-[#1C1C22] px-[18px] py-4 text-white no-underline hover:text-white ${LIFT}`}>
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-input bg-accent-400 text-black">
          <Icon name="campaigns" size={20} strokeWidth={2.2} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="break-words text-[16.5px] font-bold">{link.label}</span>
          <span className="text-[13.5px] text-accent-300">Closes {fmtDay(link.expiresAt)}</span>
        </span>
        <Arrow />
      </a>
    );
  }

  return (
    <a href={link.href} className={`flex min-h-[64px] items-center gap-3.5 rounded-[20px] border border-[#2A2A33] bg-ink-3 px-[18px] py-3.5 text-white no-underline hover:text-white ${LIFT}`}>
      <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[11px] bg-ink-4 text-accent-300">
        <Icon name="links" size={18} />
      </span>
      <span className="min-w-0 flex-1 break-words text-[16px] font-semibold">{link.label}</span>
      <Arrow className="text-[#9C9CA8]" />
    </a>
  );
}
