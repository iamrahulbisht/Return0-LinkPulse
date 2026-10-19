import { useMemo } from 'react';
import { api } from '../lib/api';
import { useAsync } from '../hooks/useAsync';
import { EmptyState, ErrorState, PageHeader, Skeleton } from '../components/ui';
import { QrCard } from '../components/qr/QrCard';
import { QrBuilder } from '../components/qr/QrBuilder';

export function QrCodes() {
  const codes = useAsync(() => api.qr.list(), []);
  const links = useAsync(() => api.links.list({ pageSize: 100 }), []);
  // A QR for a disabled link would only ever show the "turned off" page, so it is not offered.
  const usable = useMemo(() => (links.data?.items ?? []).filter((l) => l.status !== 'disabled'), [links.data]);

  return (
    <>
      <PageHeader title="QR codes" subtitle="One QR per poster location, so you can see which spot brings people in." />

      <div className="flex flex-wrap items-start gap-5">
        <div className="min-w-0 flex-[3_1_520px]">
          {codes.error ? (
            <ErrorState message={codes.error.message} onRetry={() => void codes.reload()} />
          ) : codes.loading && !codes.data ? (
            <div role="status" aria-label="Loading QR codes" className="grid grid-cols-[repeat(auto-fit,minmax(min(250px,100%),1fr))] gap-4">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-[300px] !rounded-[20px]" />
              ))}
            </div>
          ) : codes.data && codes.data.items.length === 0 ? (
            <div className="rounded-[20px] border border-line bg-surface">
              <EmptyState
                icon="qr"
                title="No QR codes yet"
                body="Make one for each place you put a poster: notice board, gate, canteen. Each code counts its own scans."
              />
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(250px,100%),1fr))] gap-4">
              {codes.data?.items.map((q) => <QrCard key={q.id} qr={q} />)}
            </div>
          )}
        </div>

        {links.error ? (
          <div className="min-w-0 flex-[2_1_340px]">
            <ErrorState message={links.error.message} onRetry={() => void links.reload()} />
          </div>
        ) : links.loading && !links.data ? (
          <div className="min-w-0 flex-[2_1_340px]">
            <Skeleton className="h-[560px] !rounded-[20px]" />
          </div>
        ) : (
          <QrBuilder links={usable} onCreated={() => void codes.reload(true)} />
        )}
      </div>
    </>
  );
}
