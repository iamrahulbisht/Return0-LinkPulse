import type { ApiError } from '../../lib/api';
import type { ClickSource, LiveClick, Visit } from '../../types';
import { deviceName, fmtStamp } from '../../lib/format';
import { CardTitle, ClickTypeBadge, EmptyState, ErrorState, LiveChip, Skeleton } from '../ui';

/** Mirrors channelOf() in apps/api/src/logic/source.ts, because live clicks carry the referrer, not the channel. */
function channelOf(source: ClickSource, referrer: string | null): string {
  if (source === 'qr') return 'QR scan';
  if (source === 'bio') return 'Bio page';
  const r = (referrer ?? '').toLowerCase();
  if (!r) return 'Direct link';
  if (r.includes('whatsapp')) return 'WhatsApp';
  return 'Other';
}

export function visitFromLive(c: LiveClick): Visit {
  return {
    id: c.id,
    at: c.at,
    source: c.source,
    channel: channelOf(c.source, c.referrer),
    qrLabel: c.qrLabel,
    device: c.device,
    os: c.os,
    browser: c.browser,
    city: c.city,
    country: c.country,
    clickType: c.clickType,
    counted: c.counted,
  };
}

function sourceText(v: Visit): string {
  if (v.source === 'qr') return v.qrLabel ? `QR · ${v.qrLabel}` : 'QR scan';
  if (v.source === 'bio') return 'Bio page';
  return v.channel;
}

/** "Android · Chrome", "Windows · Edge"; bots show their label ("WhatsApp preview"). */
function deviceText(v: Visit): string {
  if (v.device === 'bot') return v.browser ?? 'Bot';
  const dev = v.device === 'desktop' ? (v.os ?? 'Desktop') : deviceName(v.device);
  return v.browser ? `${dev} · ${v.browser}` : dev;
}

export function RecentVisits({ visits, freshIds, loading, error, onRetry, live }: {
  visits: Visit[] | undefined;
  freshIds: Set<string>;
  loading: boolean;
  error: ApiError | null;
  onRetry: () => void;
  live: { text: string; tone: 'live' | 'poll' };
}) {
  return (
    <section aria-labelledby="ld-visits" className="flex min-w-0 flex-[3_1_520px] flex-col gap-3 rounded-card border border-line bg-surface px-6 pb-3 pt-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle id="ld-visits">Recent visits</CardTitle>
        <LiveChip text={live.text} tone={live.tone} />
      </div>
      {error && !visits ? (
        <ErrorState message={error.message} onRetry={onRetry} />
      ) : loading && !visits ? (
        <div className="flex flex-col gap-2 pb-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : !visits?.length ? (
        <EmptyState icon="eye" title="No visits yet" body="Share the link. Visits show up here within seconds." />
      ) : (
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[620px] border-collapse text-[14px]">
            <thead>
              <tr className="text-left text-[12.5px] uppercase tracking-[.06em] text-text-4">
                <th scope="col" className="px-2 py-2.5 font-semibold">Time (IST)</th>
                <th scope="col" className="px-2 py-2.5 font-semibold">Source</th>
                <th scope="col" className="px-2 py-2.5 font-semibold">Device and browser</th>
                <th scope="col" className="px-2 py-2.5 font-semibold">City</th>
                <th scope="col" className="px-2 py-2.5 font-semibold">Type</th>
              </tr>
            </thead>
            <tbody>
              {visits.map((v) => (
                <tr key={v.id} className={`border-t border-line-soft hover:bg-subtle ${freshIds.has(v.id) ? 'animate-rowin' : ''}`}>
                  <td className="whitespace-nowrap px-2 py-3 font-mono text-[13px]">{fmtStamp(v.at)}</td>
                  <td className="px-2 py-3">{sourceText(v)}</td>
                  <td className="px-2 py-3 text-text-2">{deviceText(v)}</td>
                  <td className="px-2 py-3 text-text-2">{v.city ?? '—'}</td>
                  <td className="px-2 py-3">
                    <ClickTypeBadge type={v.clickType} counted={v.counted} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
