import type { ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import type { Link } from '../../types';
import { fmtDay, fmtNum, prettyUrl } from '../../lib/format';
import { Icon, type IconName } from '../Icon';
import { ShortLink, StatusBadge, shortHost } from '../ui';

function RuleChip({ icon, children }: { icon: IconName; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-bot-bg px-2 py-1 text-[12.5px] text-text-2">
      <Icon name={icon} size={13} strokeWidth={2.2} />
      {children}
    </span>
  );
}

function Rules({ link, now }: { link: Link; now: number }) {
  const ended =
    link.expiresAt !== null && (link.status === 'expired' || new Date(link.expiresAt).getTime() <= now);
  const chips: ReactNode[] = [];
  if (link.hasPassword)
    chips.push(
      <RuleChip key="pw" icon="lock">
        Password
      </RuleChip>,
    );
  if (link.expiresAt) {
    chips.push(
      <RuleChip key="exp" icon="clock">
        <span className="sr-only">{ended ? '' : 'Expires '}</span>
        {ended ? `Ended ${fmtDay(link.expiresAt)}` : fmtDay(link.expiresAt)}
      </RuleChip>,
    );
  }
  if (link.rules.length)
    chips.push(
      <RuleChip key="dev" icon="devices">
        Device rules
      </RuleChip>,
    );
  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.length ? chips : <span className="text-[12.5px] text-text-4">No rules</span>}
    </div>
  );
}

function Clicks({ link }: { link: Link }) {
  const limit = link.clickLimit;
  const pct = limit ? Math.min(100, Math.round((link.clickCount / limit) * 100)) : 0;
  // Violet normally, amber from 80 % of the limit, orange when it is reached (the text says the numbers too).
  const color = pct >= 100 ? '#FB923C' : pct >= 80 ? '#FACC15' : '#D4FF00';
  return (
    <div className="flex flex-col gap-1.5">
      <span>
        <span className="font-mono font-semibold">{fmtNum(link.clickCount)}</span>
        {limit ? <span className="text-[13px] text-text-4"> of {fmtNum(limit)}</span> : null}
      </span>
      {limit ? (
        <span aria-hidden className="block h-1.5 w-[120px] overflow-hidden rounded-[3px] bg-line-soft">
          <span className="block h-full rounded-[3px]" style={{ width: `${pct}%`, background: color }} />
        </span>
      ) : null}
    </div>
  );
}

export function LinkRow({ link, now, onCopy }: { link: Link; now: number; onCopy: (link: Link) => void }) {
  const label = `${shortHost()}/${link.code}`;
  return (
    <tr className="border-t border-line-soft hover:bg-subtle">
      <td className="max-w-[320px] py-4 pl-4 pr-2">
        <div className="flex min-w-0 flex-col gap-1">
          <RouterLink to={`/links/${link.id}`} className="text-[15px] text-fg no-underline hover:underline">
            <ShortLink code={link.code} />
          </RouterLink>
          <span className="truncate text-[13px] text-text-4" title={link.destination}>
            {link.rules.length ? 'Default: ' : ''}
            {prettyUrl(link.destination)}
          </span>
        </div>
      </td>
      <td className="px-2 py-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-[14px] text-fg">{link.campaign?.name ?? 'No campaign'}</span>
          {link.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {link.tags.map((t) => (
                <span key={t} className="rounded-md bg-accent-50 px-2 py-0.5 text-[12px] text-accent-700">
                  #{t}
                </span>
              ))}
            </div>
          )}
        </div>
      </td>
      <td className="px-2 py-4">
        <Rules link={link} now={now} />
      </td>
      <td className="min-w-[150px] px-2 py-4">
        <Clicks link={link} />
      </td>
      <td className="px-2 py-4">
        <StatusBadge status={link.status} />
      </td>
      <td className="py-4 pl-2 pr-4">
        <div className="flex justify-end gap-1">
          <button
            type="button"
            onClick={() => onCopy(link)}
            aria-label={`Copy ${label}`}
            title="Copy short link"
            className="flex h-11 w-11 items-center justify-center rounded-[10px] text-text-2 hover:bg-line-soft"
          >
            <Icon name="copy" size={18} />
          </button>
          <RouterLink
            to={`/links/${link.id}`}
            aria-label={`View details for ${label}`}
            title="View link"
            className="flex h-11 w-11 items-center justify-center rounded-[10px] text-text-2 hover:bg-line-soft"
          >
            <Icon name="chevronRight" size={18} />
          </RouterLink>
        </div>
      </td>
    </tr>
  );
}

/** The same link as a card: used below 1280 px, where the six-column table would need sideways scrolling. */
export function LinkCard({ link, now, onCopy }: { link: Link; now: number; onCopy: (link: Link) => void }) {
  const label = `${shortHost()}/${link.code}`;
  return (
    <li className="flex min-w-0 flex-col gap-3 rounded-input border border-line-soft bg-subtle p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <RouterLink
            to={`/links/${link.id}`}
            className="flex min-h-[32px] items-center text-[15px] text-fg no-underline hover:underline"
          >
            <ShortLink code={link.code} />
          </RouterLink>
          <span className="truncate text-[13px] text-text-4" title={link.destination}>
            {link.rules.length ? 'Default: ' : ''}
            {prettyUrl(link.destination)}
          </span>
        </div>
        <span className="flex-none">
          <StatusBadge status={link.status} />
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[14px] text-text-2">{link.campaign?.name ?? 'No campaign'}</span>
        {link.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {link.tags.map((t) => (
              <span key={t} className="rounded-md bg-accent-50 px-2 py-0.5 text-[12px] text-accent-700">
                #{t}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Rules link={link} now={now} />
        <div className="flex flex-col gap-0.5 text-[14px]">
          <span className="text-[12px] uppercase tracking-[.06em] text-text-4">Human clicks</span>
          <Clicks link={link} />
        </div>
      </div>
      <div className="flex gap-2 border-t border-line-soft pt-3">
        <button
          type="button"
          onClick={() => onCopy(link)}
          aria-label={`Copy ${label}`}
          className="flex h-11 flex-1 items-center justify-center gap-2 rounded-[10px] border border-line-strong text-[14px] font-semibold text-text-2 hover:bg-line-soft"
        >
          <Icon name="copy" size={17} />
          Copy
        </button>
        <RouterLink
          to={`/links/${link.id}`}
          aria-label={`View details for ${label}`}
          className="flex h-11 flex-1 items-center justify-center gap-2 rounded-[10px] border border-line-strong text-[14px] font-semibold text-text-2 no-underline hover:bg-line-soft hover:text-fg"
        >
          Details
          <Icon name="chevronRight" size={17} />
        </RouterLink>
      </div>
    </li>
  );
}
