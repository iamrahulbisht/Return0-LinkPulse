import { Link as RouterLink } from 'react-router-dom';
import type { Campaign } from '../../types';
import { fmtNum, plural } from '../../lib/format';
import { campaignStateColor, campaignStateWithDate } from '../campaigns/campaignText';

/** The first three campaigns; the first card is dark, like the design. Each opens that campaign on /campaigns. */
export function CampaignCards({ items }: { items: Campaign[] }) {
  if (!items.length) {
    return (
      <p className="m-0 rounded-card border border-dashed border-line-strong bg-surface p-5 text-[14.5px] text-text-3">
        No campaigns yet. <RouterLink to="/campaigns" className="font-semibold">Create one</RouterLink> to group links for an event.
      </p>
    );
  }
  return (
    <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr))]">
      {items.slice(0, 3).map((c, i) => {
        const dark = i === 0;
        const st = campaignStateColor(c.state, dark);
        return (
          <RouterLink
            key={c.id}
            to={`/campaigns?campaign=${c.id}`}
            className={`flex flex-col gap-3 rounded-card p-5 no-underline ${dark ? 'bg-ink text-white hover:bg-ink-3' : 'border border-line bg-surface text-fg hover:border-line-strong'}`}
          >
            <span className="flex items-center gap-1.5 text-[12.5px] font-bold" style={{ color: st.text }}>
              <span aria-hidden className="h-[7px] w-[7px] rounded-full" style={{ background: st.dot }} />
              {campaignStateWithDate(c)}
            </span>
            <span className={`font-display text-[20px] font-bold ${dark ? 'text-white' : 'text-fg'}`}>{c.name}</span>
            <span className={`flex justify-between gap-2 text-[13.5px] ${dark ? 'text-ondark-2' : 'text-text-3'}`}>
              <span>{plural(c.links, 'link')}</span>
              <span className={`font-mono font-semibold ${dark ? 'text-accent-300' : 'text-fg'}`}>{fmtNum(c.humanClicks)} clicks</span>
            </span>
          </RouterLink>
        );
      })}
    </div>
  );
}
