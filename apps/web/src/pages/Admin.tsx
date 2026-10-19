import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { api, ApiError, SHORT_HOST } from '../lib/api';
import type { Flag } from '../types';
import { fmtNum, plural } from '../lib/format';
import { useAsync } from '../hooks/useAsync';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { CardTitle, EmptyState, ErrorState, PageHeader, Skeleton } from '../components/ui';
import { Icon } from '../components/Icon';
import { FlagCard, type FlagView } from '../components/admin/FlagCard';
import { DisableDialog } from '../components/admin/DisableDialog';
import { RestoreDialog } from '../components/admin/RestoreDialog';
import { Blocklist } from '../components/admin/Blocklist';
import { AuditLog } from '../components/admin/AuditLog';

function AdminKpi({ label, value, note, alert = false }: { label: string; value: ReactNode; note: ReactNode; alert?: boolean }) {
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 rounded-card border p-4 sm:p-5 ${alert ? 'border-danger-line bg-danger-bg' : 'border-line bg-surface'}`}>
      <span className={`text-[14px] font-semibold ${alert ? 'text-[#FCA5A5]' : 'text-text-3'}`}>{label}</span>
      <span className={`font-display text-[28px] font-bold leading-tight sm:text-[34px] ${alert ? 'text-[#FCA5A5]' : ''}`}>{value}</span>
      <span className={`text-[13px] ${alert ? 'text-[#FCA5A5]' : 'text-text-4'}`}>{note}</span>
    </div>
  );
}

const link = (code: string) => `${SHORT_HOST}/${code}`;
const errText = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);
const NO_ERROR = { reason: null, other: null };

export function Admin() {
  const { refresh } = useAuth();
  const toast = useToast();
  const { hash } = useLocation();

  const overview = useAsync(() => api.admin.overview(), []);
  const flagged = useAsync(() => api.admin.flagged().then((r) => r.items), []);
  const blocklist = useAsync(() => api.admin.blocklist().then((r) => r.items), []);
  const audit = useAsync(() => api.admin.audit(50).then((r) => r.items), []);

  // Flags marked "Looks fine" are gone on the server, but the card stays (green) until the page is reloaded,
  // so the admin sees what they just did.
  const [marked, setMarked] = useState<Record<string, Flag>>({});
  const [busy, setBusy] = useState<{ id: string; kind: 'dismiss' } | null>(null);
  const [asking, setAsking] = useState<Flag | null>(null);
  const [disableBusy, setDisableBusy] = useState(false);
  const [disableError, setDisableError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<Flag | null>(null);
  const [restoreBusy, setRestoreBusy] = useState(false);
  // A problem with the reason shows under the box; anything else shows as the dialog's alert.
  const [restoreError, setRestoreError] = useState<{ reason: string | null; other: string | null }>(NO_ERROR);

  const { reload: reloadOverview } = overview;
  const { reload: reloadFlagged } = flagged;
  const { reload: reloadBlocklist } = blocklist;
  const { reload: reloadAudit } = audit;
  const reloadAll = useCallback(async () => {
    await Promise.all([
      reloadFlagged(true),
      reloadOverview(true),
      reloadAudit(true),
      reloadBlocklist(true),
      refresh().catch(() => undefined), // sidebar "to review" badge
    ]);
  }, [reloadFlagged, reloadOverview, reloadAudit, reloadBlocklist, refresh]);

  const cards = useMemo(() => {
    const server = flagged.data ?? [];
    const ids = new Set(server.map((f) => f.id));
    const kept = Object.values(marked).filter((f) => !ids.has(f.id));
    return [...server, ...kept].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [flagged.data, marked]);

  const viewOf = (f: Flag): FlagView => (marked[f.id] ? 'ok' : f.link.status === 'disabled' ? 'disabled' : 'open');

  // Sidebar links go to /admin#blocklist and /admin#audit. Wait a tick so the layout's own scroll-to-top runs
  // first, and scroll again once the flagged list has loaded (it pushes the sections down).
  useEffect(() => {
    const id = hash.slice(1);
    if (!id) return;
    const t = window.setTimeout(() => {
      const el = document.getElementById(id);
      if (!el) return;
      el.scrollIntoView({ block: 'start' });
      el.focus({ preventScroll: true });
    }, 0);
    return () => window.clearTimeout(t);
  }, [hash, flagged.loading]);

  const dismiss = async (f: Flag) => {
    setBusy({ id: f.id, kind: 'dismiss' });
    try {
      await api.admin.dismiss(f.id);
      setMarked((m) => ({ ...m, [f.id]: f }));
      toast(`Marked ${link(f.link.code)} as fine. It leaves this list when you reload.`);
      await reloadAll();
    } catch (e) {
      toast(errText(e, 'Could not save. Please try again.'), 'error');
    } finally {
      setBusy(null);
    }
  };

  const confirmRestore = async (reason: string) => {
    if (!restoring) return;
    setRestoreBusy(true);
    setRestoreError(NO_ERROR);
    try {
      await api.admin.restore(restoring.link.id, reason);
      toast(`Restored ${link(restoring.link.code)}. It redirects again.`);
      setRestoring(null);
      await reloadAll();
    } catch (e) {
      const field = e instanceof ApiError ? e.fieldMessage('reason') : undefined;
      setRestoreError(field ? { reason: field, other: null } : { reason: null, other: errText(e, 'Could not restore. Please try again.') });
    } finally {
      setRestoreBusy(false);
    }
  };

  const cancelRestore = useCallback(() => {
    setRestoring(null);
    setRestoreError(NO_ERROR);
  }, []);

  const confirmDisable = async (reason: string) => {
    if (!asking) return;
    setDisableBusy(true);
    setDisableError(null);
    try {
      await api.admin.disable(asking.link.id, reason);
      toast(`Disabled ${link(asking.link.code)}. Redirects stopped. Use Restore to undo.`);
      setAsking(null);
      await reloadAll();
    } catch (e) {
      setDisableError(errText(e, 'Could not disable the link. Please try again.'));
    } finally {
      setDisableBusy(false);
    }
  };

  const cancelDisable = useCallback(() => {
    setAsking(null);
    setDisableError(null);
  }, []);

  const header = (
    <PageHeader
      title="Abuse monitor"
      subtitle="Platform-wide. Disabling a link stops it at once and keeps its data."
      actions={
        <span className="inline-flex items-center gap-2 rounded-full border border-warn-line bg-warn-bg px-3.5 py-2 text-[14px] font-semibold text-[#FDE68A]">
          <Icon name="shield" size={16} />
          You are in admin mode
        </span>
      }
    />
  );

  // The server guards every admin route; if it says no, show that and nothing else.
  if (overview.error?.status === 403 || overview.error?.status === 401) {
    return (
      <>
        {header}
        <ErrorState message={overview.error.message} />
      </>
    );
  }

  const o = overview.data;
  const kpi = (v: number | undefined) => (v === undefined ? <Skeleton className="h-9 w-24" /> : fmtNum(v));

  return (
    <>
      {header}

      {overview.error ? (
        <ErrorState message={overview.error.message} onRetry={() => void overview.reload()} />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(min(210px,100%),1fr))] sm:gap-4">
          <AdminKpi label="All links" value={kpi(o?.links)} note={o ? `Across ${plural(o.workspaces, 'workspace')}` : ' '} />
          <AdminKpi label="Human clicks, last 24 h" value={kpi(o?.humanClicks24h)} note={o ? `+ ${fmtNum(o.botHits24h)} bot hits not counted` : ' '} />
          <AdminKpi label="Needs review" value={kpi(o?.needsReview)} note="Open flags on active links" alert={!!o && o.needsReview > 0} />
          <AdminKpi label="Blocked domains" value={kpi(o?.blockedDomains)} note="Checked on every create" />
        </div>
      )}

      <section aria-labelledby="flagged-title" className="flex flex-col gap-4 rounded-[20px] border border-line bg-surface p-6">
        <CardTitle id="flagged-title" className="text-[22px]">
          Flagged links
        </CardTitle>
        {flagged.error ? (
          <ErrorState message={flagged.error.message} onRetry={() => void flagged.reload()} />
        ) : flagged.loading && !flagged.data ? (
          <div className="flex flex-col gap-3" role="status" aria-label="Loading flagged links">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[104px] w-full rounded-[16px]" />
            ))}
          </div>
        ) : cards.length === 0 ? (
          <EmptyState
            icon="shield"
            title="Nothing to review"
            body="Links with a traffic spike, a visitor report, a blocklist match or a bot surge will show up here."
          />
        ) : (
          <div className="flex flex-col gap-3">
            {cards.map((f) => (
              <FlagCard
                key={f.id}
                flag={f}
                view={viewOf(f)}
                busy={busy?.id === f.id ? busy.kind : null}
                onDismiss={() => void dismiss(f)}
                onAskDisable={() => {
                  setDisableError(null);
                  setAsking(f);
                }}
                onAskRestore={() => {
                  setRestoreError(NO_ERROR);
                  setRestoring(f);
                }}
              />
            ))}
          </div>
        )}
      </section>

      <DisableDialog code={asking?.link.code ?? null} busy={disableBusy} error={disableError} onCancel={cancelDisable} onConfirm={(r) => void confirmDisable(r)} />
      <RestoreDialog
        code={restoring?.link.code ?? null}
        disabledReason={restoring?.link.disabledReason ?? null}
        busy={restoreBusy}
        reasonError={restoreError.reason}
        error={restoreError.other}
        onCancel={cancelRestore}
        onConfirm={(r) => void confirmRestore(r)}
      />

      <div className="flex flex-wrap items-stretch gap-4">
        <Blocklist
          items={blocklist.data}
          loading={blocklist.loading}
          error={blocklist.error}
          onRetry={() => void blocklist.reload()}
          onChanged={reloadAll}
        />
        <AuditLog items={audit.data} loading={audit.loading} error={audit.error} onRetry={() => void audit.reload()} />
      </div>
    </>
  );
}
