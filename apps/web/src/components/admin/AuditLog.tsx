import type { ApiError } from '../../lib/api';
import type { AuditItem } from '../../types';
import { fmtDateTime } from '../../lib/format';
import { CardTitle, ErrorState, Skeleton } from '../ui';

// Dot colour by action (admin.html): red = something was stopped, violet = undone, green = reviewed, grey = system.
// The words next to the dot carry the meaning; the colour only helps scanning.
const DOT: Record<string, string> = {
  disabled: 'bg-danger',
  domain_blocked: 'bg-danger',
  restored: 'bg-accent-600',
  domain_unblocked: 'bg-accent-600',
  flag_dismissed: 'bg-[#16A34A]',
  cache_cleared: 'bg-text-4',
};

interface Props {
  items: AuditItem[] | undefined;
  loading: boolean;
  error: ApiError | null;
  onRetry: () => void;
}

export function AuditLog({ items, loading, error, onRetry }: Props) {
  return (
    <section
      id="audit"
      tabIndex={-1}
      aria-labelledby="audit-title"
      className="flex min-w-0 flex-[2_1_340px] scroll-mt-6 flex-col gap-4 rounded-[20px] border border-line bg-surface p-6 outline-none"
    >
      <CardTitle id="audit-title" className="text-[22px]">
        Audit log
      </CardTitle>
      {error ? (
        <ErrorState message={error.message} onRetry={onRetry} />
      ) : loading && !items ? (
        <div className="flex flex-col gap-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : items && items.length > 0 ? (
        <ol className="m-0 flex list-none flex-col gap-4 p-0">
          {items.map((a) => (
            <li key={a.id} className="flex gap-3">
              <span aria-hidden className={`mt-1.5 h-2.5 w-2.5 flex-none rounded-full ${a.actor === 'System' ? 'bg-text-4' : DOT[a.action] ?? 'bg-text-4'}`} />
              <div className="flex min-w-0 flex-col gap-0.5 text-[14.5px]">
                <span className="break-words">
                  <strong>{a.text}</strong> <span className="break-all font-mono text-[13.5px]">{a.target}</span>
                </span>
                <span className="text-[12.5px] text-text-4">
                  {a.actor} · <time dateTime={a.at}>{fmtDateTime(a.at)}</time>
                </span>
                {a.reason && <span className="text-[13px] text-text-3">Reason: {a.reason}</span>}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="m-0 text-[14.5px] text-text-3">No admin actions yet. Every disable, restore and blocklist change will be listed here.</p>
      )}
    </section>
  );
}
