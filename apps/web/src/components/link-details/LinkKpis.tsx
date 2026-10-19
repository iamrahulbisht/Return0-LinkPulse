import type { Link, LinkDetail } from '../../types';
import { fmtNum, plural } from '../../lib/format';

const CARD = 'flex min-w-0 flex-col justify-center gap-1 rounded-card border p-5';
const LABEL = 'text-[14px] font-semibold text-text-3';
const VALUE = 'font-display text-[32px] font-bold tracking-[-0.02em]';

function LimitRing({ used, limit }: { used: number; limit: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const pct = Math.min(1, used / limit);
  const color = pct >= 1 ? '#FB923C' : pct >= 0.8 ? '#FACC15' : '#D4FF00';
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" role="img" aria-label={`${fmtNum(used)} of ${fmtNum(limit)} clicks used`} className="flex-none">
      <circle cx="32" cy="32" r={r} fill="none" stroke="#1E1E24" strokeWidth="8" />
      {pct > 0 && (
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${pct * c} ${c}`}
          transform="rotate(-90 32 32)"
        />
      )}
    </svg>
  );
}

export function LinkKpis({ link, stats }: { link: Link; stats: LinkDetail['stats'] }) {
  const limit = link.clickLimit;
  // With a limit, show the counter the limit is checked against, so "413 / 500" and "87 left" always add up.
  const used = limit != null ? link.clickCount : stats.humanClicks;
  const left = limit != null ? Math.max(0, limit - link.clickCount) : null;
  const near = limit != null && left !== null && left <= limit * 0.2;

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-4">
      <div className="flex min-w-0 items-center gap-4 rounded-card border border-line bg-surface p-5">
        {limit != null && <LimitRing used={link.clickCount} limit={limit} />}
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className={LABEL}>Human clicks</span>
          <span className={VALUE}>
            {fmtNum(used)}
            {limit != null && <span className="text-[17px] font-semibold text-text-4"> / {fmtNum(limit)}</span>}
          </span>
          <span className={`text-[13px] ${near ? 'font-semibold text-warn' : 'text-text-4'}`}>
            {left === null ? 'No limit' : left === 0 ? 'Limit reached' : `${fmtNum(left)} left before the limit`}
          </span>
        </div>
      </div>
      <div className={`${CARD} border-line bg-surface`}>
        <span className={LABEL}>Unique visitors</span>
        <span className={VALUE}>{fmtNum(stats.uniqueVisitors)}</span>
        <span className="text-[13px] text-text-4">Hashed, no raw IPs</span>
      </div>
      <div className={`${CARD} border-line-strong bg-bot-bg`}>
        <span className={LABEL}>Bots filtered</span>
        <span className={`${VALUE} text-fg`}>{fmtNum(stats.botsFiltered)}</span>
        <span className="text-[13px] text-text-3">Not counted · WhatsApp, Slack, Telegram previews</span>
      </div>
      <div className={`${CARD} border-line bg-surface`}>
        <span className={LABEL}>QR scans</span>
        <span className={VALUE}>{fmtNum(stats.qrScans)}</span>
        <span className="text-[13px] text-text-4">From {plural(stats.qrLocations, 'poster location')}</span>
      </div>
    </div>
  );
}
