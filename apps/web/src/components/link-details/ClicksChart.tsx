import type { ApiError } from '../../lib/api';
import type { Timeseries } from '../../types';
import { bucketLabel, fmtNum } from '../../lib/format';
import { CardTitle, ErrorState, Skeleton } from '../ui';

const MAX_BAR = 170;

/** Simple bars like link-details.html (peak in lime, other days in dark lime), with a hidden table for screen readers. */
export function ClicksChart({ data, loading, error, onRetry }: { data: Timeseries | undefined; loading: boolean; error: ApiError | null; onRetry: () => void }) {
  const points = data?.points ?? [];
  const max = points.reduce((m, p) => Math.max(m, p.human), 0);
  const peak = max > 0 ? points.findIndex((p) => p.human === max) : -1;
  const label = (bucket: string) => bucketLabel(bucket, data?.unit ?? 'day');

  return (
    <section aria-labelledby="ld-chart" className="flex min-w-0 flex-[3_1_520px] flex-col gap-[18px] rounded-card border border-line bg-surface p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle id="ld-chart">Human clicks, last 7 days</CardTitle>
        {data && <span className="text-[13.5px] text-text-4">{peak >= 0 ? `Peak: ${label(points[peak].bucket)}` : 'No human clicks yet'}</span>}
      </div>
      {error && !data ? (
        <ErrorState message={error.message} onRetry={onRetry} />
      ) : loading && !data ? (
        <Skeleton className="h-[250px] w-full" />
      ) : (
        <>
          <div aria-hidden className="flex h-[220px] items-end gap-2 border-b border-line-strong px-1 sm:gap-3.5">
            {points.map((p, i) => (
              <div key={p.bucket} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                <span className="font-mono text-[12px] font-semibold text-text-2">{fmtNum(p.human)}</span>
                <span
                  className="block w-full max-w-[56px] rounded-[8px_8px_3px_3px]"
                  style={{ height: max > 0 ? Math.max(p.human > 0 ? 3 : 0, Math.round((p.human / max) * MAX_BAR)) : 0, background: i === peak ? '#D4FF00' : '#4A5A0C' }}
                />
              </div>
            ))}
          </div>
          <div aria-hidden className="flex gap-2 px-1 text-[12.5px] text-text-4 sm:gap-3.5">
            {points.map((p) => (
              <span key={p.bucket} className="flex-1 text-center">
                {label(p.bucket)}
              </span>
            ))}
          </div>
          <table className="sr-only">
            <caption>Human clicks per day, last 7 days (IST)</caption>
            <thead>
              <tr>
                <th scope="col">Day</th>
                <th scope="col">Human clicks</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p, i) => (
                <tr key={p.bucket}>
                  <td>
                    {label(p.bucket)}
                    {i === peak ? ' (peak)' : ''}
                  </td>
                  <td>{fmtNum(p.human)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
