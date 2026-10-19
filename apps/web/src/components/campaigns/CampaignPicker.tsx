import { useRef, type KeyboardEvent } from 'react';
import type { Campaign } from '../../types';
import { fmtNum, plural } from '../../lib/format';
import { campaignDates, campaignStateColor, campaignStateLabel } from './campaignText';

/** Radio-like campaign cards. Arrow keys move the choice; only the chosen card is in the Tab order. */
export function CampaignPicker({ items, selectedId, onSelect }: { items: Campaign[]; selectedId: string; onSelect: (id: string) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = (i + dir + items.length) % items.length;
    refs.current[next]?.focus();
    onSelect(items[next].id);
  };
  return (
    <div role="radiogroup" aria-label="Choose a campaign" className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(240px,100%),1fr))]">
      {items.map((c, i) => {
        const on = c.id === selectedId;
        const st = campaignStateColor(c.state, on);
        return (
          <button
            key={c.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onSelect(c.id)}
            onKeyDown={(e) => onKey(e, i)}
            className={`flex flex-col gap-3.5 rounded-card border-2 p-[22px] text-left transition-colors ${on ? 'border-accent-400 bg-[#16180C] text-white shadow-[0_0_18px_rgba(212,255,0,0.12)]' : 'border-line bg-surface text-fg hover:border-[#383844]'}`}
          >
            <span className="inline-flex items-center gap-2 text-[12.5px] font-bold" style={{ color: st.text }}>
              <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: st.dot }} />
              {campaignStateLabel(c.state)}
            </span>
            <span className="font-display text-[22px] font-bold tracking-[-0.01em]">{c.name}</span>
            <span className={`text-[13.5px] ${on ? 'text-ondark-2' : 'text-text-3'}`}>{campaignDates(c)}</span>
            <span aria-hidden className={`block h-1.5 overflow-hidden rounded-[3px] ${on ? 'bg-white/[.14]' : 'bg-line-soft'}`}>
              <span className="block h-full rounded-[3px] bg-accent-400" style={{ width: `${c.progress}%` }} />
            </span>
            <span className="flex justify-between gap-2 text-[14px]">
              <span className={on ? 'text-ondark-2' : 'text-text-3'}>{plural(c.links, 'link')}</span>
              <span className="font-mono font-semibold">{fmtNum(c.humanClicks)} clicks</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
