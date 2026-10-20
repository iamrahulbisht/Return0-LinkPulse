import type { Link, LinkStatus } from '../../types';
import { fmtDateTime, fmtNum, plural, prettyUrl } from '../../lib/format';

export const LIFE_ORDER: LinkStatus[] = ['active', 'limit_reached', 'expired', 'disabled'];

const LOOK: Record<LinkStatus, { label: string; fg: string; bg: string }> = {
  active: { label: 'Active', fg: '#4ADE80', bg: '#142312' },
  limit_reached: { label: 'Limit reached', fg: '#FB923C', bg: '#2A1708' },
  expired: { label: 'Expired', fg: '#FACC15', bg: '#291E0A' },
  disabled: { label: 'Disabled', fg: '#F87171', bg: '#221717' },
};

/** "When" line and the explanation for each state, using this link's real limit, expiry and fallback. */
export function lifeCopy(link: Link, state: LinkStatus): { when: string; explain: string } {
  const now = link.status === state;
  const limit = link.clickLimit;
  switch (state) {
    case 'active':
      return {
        when: now ? 'Now · redirects work' : 'Redirects work',
        explain: `Visitors are sent on after the checks. ${limit != null ? `Human clicks count toward the limit of ${fmtNum(limit)}.` : 'There is no click limit.'}`,
      };
    case 'limit_reached':
      return limit != null
        ? {
            when: `At ${plural(limit, 'human click')}`,
            explain: `Visitor ${fmtNum(limit + 1)} sees “All spots are taken”. Raise the limit in Edit, or click Active to remove it.`,
          }
        : { when: 'No limit set', explain: 'This link has no click limit, so it never stops for that. Add a limit in Edit if you need one.' };
    case 'expired': {
      const after = link.fallbackUrl
        ? `Visitors are sent to your fallback URL (${prettyUrl(link.fallbackUrl)}).`
        : 'Visitors see an “Expired” page, or your fallback URL if you set one.';
      return link.expiresAt
        ? { when: `After ${fmtDateTime(link.expiresAt)}`, explain: `${after} Extend the date in Edit, or click Active to remove it.` }
        : { when: 'No expiry date set', explain: `This link has no expiry date. If you set one, after that time: ${after.charAt(0).toLowerCase()}${after.slice(1)}` };
    }
    case 'disabled':
      return {
        when: now ? 'Turned off by an admin' : 'If an admin switches it off',
        explain: 'Redirects stop at once: the cache is cleared and the action is written to the audit log.',
      };
  }
}

export const lifeLook = (s: LinkStatus) => LOOK[s];

/**
 * "Link life": the real state is pressed; pressing another one asks to switch the link to it (ChangeStateDialog).
 * Disabled is an admin takedown, so other users only see it while the link is actually disabled.
 */
export function LifeStrip({ link, isAdmin, onPick }: { link: Link; isAdmin: boolean; onPick: (s: LinkStatus) => void }) {
  const states = LIFE_ORDER.filter((s) => s !== 'disabled' || isAdmin || link.status === 'disabled');
  return (
    <div className="flex flex-col gap-3 border-t border-line-soft pt-[18px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[13px] font-bold uppercase tracking-[.08em] text-text-3">Link life</span>
        <span className="text-[13.5px] text-text-4">Click a state to switch the link to it. Analytics are kept in every state.</span>
      </div>
      <div className="flex flex-wrap items-stretch gap-2.5">
        {states.map((s) => {
          const look = LOOK[s];
          const on = s === link.status;
          return (
            <button
              key={s}
              type="button"
              aria-pressed={on}
              onClick={() => {
                if (!on) onPick(s);
              }}
              className="flex min-h-[44px] flex-[1_1_190px] flex-col items-start gap-1 rounded-[14px] border-2 px-4 py-3 text-left"
              style={{ borderColor: on ? look.fg : '#232328', background: on ? look.bg : '#121214' }}
            >
              <span className="flex items-center gap-2 text-[14.5px] font-bold" style={{ color: look.fg }}>
                <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: look.fg }} />
                {look.label}
                {s === link.status && <span className="text-[12px] font-semibold text-text-3">(now)</span>}
              </span>
              <span className="text-[12.5px] text-text-3">{lifeCopy(link, s).when}</span>
            </button>
          );
        })}
      </div>
      <p aria-live="polite" className="m-0 flex items-start gap-2.5 rounded-input bg-subtle px-3.5 py-3 text-[14px] text-fg">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-px flex-none">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5M12 8h.01" />
        </svg>
        <span>
          {lifeCopy(link, link.status).explain}
        </span>
      </p>
    </div>
  );
}
