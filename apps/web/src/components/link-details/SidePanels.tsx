import { useId } from 'react';
import type { ApiError } from '../../lib/api';
import type { HistoryItem, LinkDetail } from '../../types';
import { fmtDateTime, fmtNum } from '../../lib/format';
import { Bar, ButtonLink, CardTitle, EmptyState, ErrorState, Skeleton } from '../ui';

export function ScansByPoster({ items }: { items: LinkDetail['scansByQr'] }) {
  const total = items.reduce((s, q) => s + q.scans, 0);
  return (
    <section aria-labelledby="ld-posters" className="flex flex-col gap-3.5 rounded-card border border-line bg-surface p-6">
      <CardTitle id="ld-posters">Scans by poster</CardTitle>
      {items.length === 0 ? (
        <EmptyState
          icon="qr"
          title="No QR codes yet"
          body="Make one QR code for each place you print it, to see which poster works best."
          action={
            <ButtonLink to="/qr" size="sm">
              Go to QR codes
            </ButtonLink>
          }
        />
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {items.map((q) => (
            <li key={q.id} className="flex flex-col gap-1.5">
              <div className="flex justify-between gap-3 text-[14px]">
                <span className="min-w-0 break-words font-semibold">{q.label}</span>
                <span className="font-mono">
                  {fmtNum(q.scans)}
                  <span className="sr-only"> scans</span>
                </span>
              </div>
              <Bar pct={total ? (q.scans / total) * 100 : 0} className="h-2 w-full" />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const dotColor = (action: string) => (action === 'link_created' || action === 'restored' ? 'bg-[#16A34A]' : action === 'disabled' ? 'bg-danger' : 'bg-accent-600');

/** Audit rows as a timeline. Link page: "History". Admin user page: the account's history. */
export function HistoryList({
  items,
  loading,
  error,
  onRetry,
  title = 'History',
  empty = 'No changes yet.',
}: {
  items: HistoryItem[] | undefined;
  loading: boolean;
  error: ApiError | null;
  onRetry: () => void;
  title?: string;
  empty?: string;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3.5 rounded-card border border-line bg-surface p-6">
      <CardTitle id={id}>{title}</CardTitle>
      {error && !items ? (
        <ErrorState message={error.message} onRetry={onRetry} />
      ) : loading && !items ? (
        <Skeleton className="h-24 w-full" />
      ) : !items?.length ? (
        <span className="text-[14px] text-text-4">{empty}</span>
      ) : (
        <ol className="m-0 flex list-none flex-col gap-3.5 p-0 text-[14px]">
          {items.map((h) => (
            <li key={h.id} className="flex gap-3">
              <span aria-hidden className={`mt-[5px] h-2.5 w-2.5 flex-none rounded-full ${dotColor(h.action)}`} />
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="font-semibold">
                  {h.text}
                  {h.link && (
                    <span className="font-normal text-text-3">
                      {' on '}
                      <span className="break-all font-mono text-[13px]">{h.link}</span>
                    </span>
                  )}
                </span>
                {h.reason && <span className="text-text-2">Reason: {h.reason}</span>}
                <span className="text-[12.5px] text-text-4">
                  {h.actor} · {fmtDateTime(h.at)}
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
