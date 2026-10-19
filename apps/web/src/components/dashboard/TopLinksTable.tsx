import { Link as RouterLink } from 'react-router-dom';
import type { TopLink } from '../../types';
import { fmtNum } from '../../lib/format';
import { Bar, ShortLink, StatusBadge } from '../ui';

const TH = 'px-2 py-2.5 font-semibold';

export function TopLinksTable({ items }: { items: TopLink[] }) {
  if (!items.length) return <p className="m-0 py-6 text-[14.5px] text-text-3">No links match these filters yet.</p>;
  const max = Math.max(1, ...items.map((l) => l.humanClicks));
  return (
    <>
      {/* Phones: a compact list (the four-column table would squeeze the short link into several lines). */}
      <ul className="m-0 flex list-none flex-col p-0 sm:hidden" aria-label="Top links">
        {items.map((l) => (
          <li key={l.id} className="flex items-center gap-3 border-t border-line-soft py-3 first:border-t-0">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <RouterLink to={`/links/${l.id}`} className="flex min-h-[32px] items-center text-[14.5px] text-fg no-underline hover:underline">
                <ShortLink code={l.code} />
              </RouterLink>
              <span className="truncate text-[13px] text-text-3">{l.campaign ?? 'No campaign'}</span>
              <span className="self-start">
                <StatusBadge status={l.status} />
              </span>
            </div>
            <div className="flex flex-none flex-col items-end gap-1.5">
              <span className="font-mono font-semibold">{fmtNum(l.humanClicks)}</span>
              <span className="sr-only">human clicks</span>
              <Bar pct={(l.humanClicks / max) * 100} className="h-1.5 w-[72px]" />
            </div>
          </li>
        ))}
      </ul>
    <div className="relative hidden overflow-x-auto sm:block" role="region" aria-label="Top links table" tabIndex={0}>
      <table className="w-full min-w-[560px] border-collapse text-[14.5px]">
        <thead>
          <tr className="text-left text-[12.5px] uppercase tracking-[.06em] text-text-4">
            <th scope="col" className={TH}>Link</th>
            <th scope="col" className={TH}>Campaign</th>
            <th scope="col" className={`${TH} text-right`}>Human clicks</th>
            <th scope="col" className={TH}>Status</th>
          </tr>
        </thead>
        <tbody>
          {items.map((l) => (
            <tr key={l.id} className="border-t border-line-soft hover:bg-subtle">
              <td className="px-2 py-3.5">
                <RouterLink to={`/links/${l.id}`} className="inline-flex min-h-[44px] items-center text-fg no-underline hover:underline">
                  <ShortLink code={l.code} />
                </RouterLink>
              </td>
              <td className="px-2 py-3.5 text-text-3">{l.campaign ?? 'No campaign'}</td>
              <td className="px-2 py-3.5 text-right">
                <div className="flex items-center justify-end gap-2.5">
                  <Bar pct={(l.humanClicks / max) * 100} />
                  <span className="min-w-[44px] font-mono font-semibold">{fmtNum(l.humanClicks)}</span>
                </div>
              </td>
              <td className="px-2 py-3.5">
                <StatusBadge status={l.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
  );
}
