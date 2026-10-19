import { Link as RouterLink } from 'react-router-dom';
import type { Campaign } from '../../types';
import { fmtDate, fmtNum, plural } from '../../lib/format';
import { ButtonLink, ShortLink } from '../ui';
import { campaignDates, campaignStateLabel } from './campaignText';

function Tile({ label, value, bot }: { label: string; value: number; bot?: boolean }) {
  return (
    <div className={`flex flex-col gap-1 rounded-2xl p-[18px] ${bot ? 'bg-bot-bg' : 'bg-subtle'}`}>
      <span className="text-[13.5px] font-semibold text-text-3">{label}</span>
      <span className={`font-display text-[30px] font-bold ${bot ? 'text-fg' : ''}`}>{fmtNum(value)}</span>
    </div>
  );
}

function NoClicks({ c }: { c: Campaign }) {
  let body: string;
  if (c.state === 'scheduled' && c.startsAt) body = `This campaign starts on ${fmtDate(c.startsAt)}. Its ${plural(c.links, 'link')} will begin counting then.`;
  else if (c.links === 0) body = 'This campaign has no links yet. Add one and its human clicks will show up here.';
  else body = `Its ${plural(c.links, 'link')} have no human clicks yet.`;
  return (
    <div className="flex flex-col items-start gap-1.5 rounded-2xl border-2 border-dashed border-line-strong p-7">
      <span className="font-display text-[19px] font-bold">No clicks yet</span>
      <span className="text-[14.5px] text-text-3">{body}</span>
    </div>
  );
}

export function CampaignPanel({ c }: { c: Campaign }) {
  return (
    <section aria-labelledby="campaign-title" className="flex min-w-0 flex-col gap-6 rounded-[20px] border border-line bg-surface p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h2 id="campaign-title" className="m-0 font-display text-[28px] font-bold tracking-[-0.02em]">{c.name}</h2>
          <span className="text-[14.5px] text-text-3">
            {campaignDates(c)} · {campaignStateLabel(c.state)}
          </span>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <ButtonLink to={`/dashboard?campaign=${c.id}`} size="sm">
            Open in dashboard
          </ButtonLink>
          <ButtonLink to={`/links/new?campaign=${c.id}`} variant="dark" size="sm">
            Add link to campaign
          </ButtonLink>
        </div>
      </div>

      <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(min(180px,100%),1fr))]">
        <Tile label="Links" value={c.links} />
        <Tile label="Human clicks" value={c.humanClicks} />
        <Tile label="Unique visitors" value={c.uniqueVisitors} />
        <Tile label="Bots filtered (not counted)" value={c.botsFiltered} bot />
      </div>

      {c.humanClicks > 0 && c.top.length > 0 ? <TopLinks c={c} /> : <NoClicks c={c} />}
    </section>
  );
}

function TopLinks({ c }: { c: Campaign }) {
  const TH = 'px-2 py-2.5 font-semibold';
  return (
    <div className="flex flex-col gap-2.5">
      <h3 className="m-0 font-display text-[19px] font-bold">Top-performing links</h3>
      <div className="relative overflow-x-auto" role="region" aria-label="Top-performing links" tabIndex={0}>
        <table className="w-full min-w-[560px] border-collapse text-[14.5px]">
          <thead>
            <tr className="text-left text-[12.5px] uppercase tracking-[.06em] text-text-4">
              <th scope="col" className={TH}>Rank</th>
              <th scope="col" className={TH}>Link</th>
              <th scope="col" className={TH}>Share of clicks</th>
              <th scope="col" className={`${TH} text-right`}>Clicks</th>
            </tr>
          </thead>
          <tbody>
            {c.top.map((t, i) => {
              const pct = Math.round((t.clicks / c.humanClicks) * 100);
              return (
                <tr key={t.id} className="border-t border-line-soft hover:bg-subtle">
                  <td className="px-2 py-3.5 font-mono text-text-4">{i + 1}</td>
                  <td className="px-2 py-3.5">
                    <RouterLink to={`/links/${t.id}`} className="inline-flex min-h-[44px] items-center text-fg no-underline hover:underline">
                      <ShortLink code={t.code} />
                    </RouterLink>
                  </td>
                  <td className="px-2 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <span aria-hidden className="block h-2 max-w-[260px] flex-1 overflow-hidden rounded bg-line-soft">
                        <span className="block h-full bg-accent-600" style={{ width: `${pct}%` }} />
                      </span>
                      <span className="font-mono text-[13px] text-text-2">{pct}%</span>
                    </div>
                  </td>
                  <td className="px-2 py-3.5 text-right font-mono font-semibold">{fmtNum(t.clicks)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
