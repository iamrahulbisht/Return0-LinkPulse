// One link: header, link life, KPIs, 7-day chart, rules, live recent visits, posters, history (LinkPulse-UI/link-details.html).
import { useCallback, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import type { Link, LinkStatus } from '../types';
import { api, ApiError } from '../lib/api';
import { fmtDay, prettyUrl } from '../lib/format';
import { useAsync } from '../hooks/useAsync';
import { useAuth } from '../hooks/useAuth';
import { useLiveClicks } from '../hooks/useLiveClicks';
import { useToast } from '../hooks/useToast';
import { Button, ButtonLink, ErrorState, ShortLink, Skeleton, StatusBadge } from '../components/ui';
import { Icon } from '../components/Icon';
import { useCopy } from '../components/create-link/useCopy';
import { LifeStrip } from '../components/link-details/LifeStrip';
import { LinkKpis } from '../components/link-details/LinkKpis';
import { ClicksChart } from '../components/link-details/ClicksChart';
import { RulesList } from '../components/link-details/RulesList';
import { RecentVisits, visitFromLive } from '../components/link-details/RecentVisits';
import { HistoryList, ScansByPoster } from '../components/link-details/SidePanels';
import { EditLinkDialog } from '../components/link-details/EditLinkDialog';
import { ChangeStateDialog } from '../components/link-details/ChangeStateDialog';
import { DisableDialog } from '../components/admin/DisableDialog';
import { RestoreDialog } from '../components/admin/RestoreDialog';

const VISIT_ROWS = 20;
const errText = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

const STATE_TOAST: Record<LinkStatus, string> = {
  active: 'The link is active again.',
  limit_reached: 'The link stopped at its click limit.',
  expired: 'The link has expired.',
  disabled: 'The link is turned off.',
};

function BackLink() {
  return (
    <RouterLink to="/links" className="flex min-h-[44px] items-center gap-2 self-start text-[14.5px] font-semibold no-underline">
      <Icon name="arrowLeft" size={16} strokeWidth={2.2} />
      All links
    </RouterLink>
  );
}

function DetailsSkeleton() {
  return (
    <div role="status" aria-label="Loading link" className="flex flex-col gap-[22px]">
      <Skeleton className="h-[260px] w-full rounded-[20px]" />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[110px] rounded-card" />
        ))}
      </div>
      <Skeleton className="h-[300px] w-full rounded-card" />
    </div>
  );
}

export function LinkDetails() {
  const { id = '' } = useParams<{ id: string }>();
  const toast = useToast();
  const { copy } = useCopy();
  const isAdmin = useAuth().me?.user.role === 'admin';

  const detail = useAsync(() => api.links.get(id), [id]);
  const clicks = useAsync(() => api.links.clicks(id, VISIT_ROWS), [id]);
  const history = useAsync(() => api.links.history(id), [id]);
  const series = useAsync(() => api.analytics.timeseries({ period: '7d', linkId: id }), [id]);

  // The "Link life" state the owner asked to switch to; the dialog confirms first (tied to this link id).
  const [stateAsk, setStateAsk] = useState<{ id: string; state: LinkStatus } | null>(null);
  const askState = stateAsk?.id === id ? stateAsk.state : null;
  const closeStateAsk = useCallback(() => setStateAsk(null), []);
  const [editOpen, setEditOpen] = useState(false);
  const [freshIds, setFreshIds] = useState<Set<string>>(() => new Set());
  const closeEdit = useCallback(() => setEditOpen(false), []);
  // Admin takedown / restore from "Link life" (same dialogs and API as the Admin page).
  const [adminAsk, setAdminAsk] = useState<'disable' | 'restore' | null>(null);
  const [adminBusy, setAdminBusy] = useState(false);
  const [adminError, setAdminError] = useState<{ reason: string | null; other: string | null }>({ reason: null, other: null });
  const closeAdminAsk = useCallback(() => {
    setAdminAsk(null);
    setAdminError({ reason: null, other: null });
  }, []);

  const live = useLiveClicks(
    (c) => {
      if (c.linkId !== id) return;
      clicks.setData((prev) => {
        const items = prev?.items ?? [];
        if (items.some((v) => v.id === c.id)) return prev;
        return { items: [visitFromLive(c), ...items].slice(0, VISIT_ROWS) };
      });
      setFreshIds((s) => new Set(s).add(c.id));
      // Counts change with every visit; reload quietly so nothing flashes.
      void detail.reload(true);
      void series.reload(true);
    },
    () => {
      void clicks.reload(true);
      void detail.reload(true);
      void series.reload(true);
    },
  );

  const { setData: setDetail, reload: reloadDetail } = detail;
  const reloadHistory = history.reload;
  const onSaved = useCallback(
    (link: Link) => {
      setDetail((prev) => (prev ? { ...prev, link } : prev));
      void reloadDetail(true);
      void reloadHistory(true);
      toast('Changes saved');
    },
    [setDetail, reloadDetail, reloadHistory, toast],
  );
  const onStateChanged = useCallback(
    (link: Link) => {
      setDetail((prev) => (prev ? { ...prev, link } : prev));
      setStateAsk(null);
      void reloadDetail(true);
      void reloadHistory(true);
      toast(STATE_TOAST[link.status]);
    },
    [setDetail, reloadDetail, reloadHistory, toast],
  );

  if (detail.error && !detail.data) {
    const e = detail.error;
    const message = e.status === 403 ? 'You do not have access to this link.' : e.status === 404 ? 'We can’t find this link.' : e.message;
    return (
      <>
        <BackLink />
        <ErrorState message={message} onRetry={e.status === 403 || e.status === 404 ? undefined : () => void detail.reload()} />
      </>
    );
  }
  if (!detail.data) {
    return (
      <>
        <BackLink />
        <DetailsSkeleton />
      </>
    );
  }

  const { link, stats, scansByQr, adminView = false } = detail.data;

  const pickState = (s: LinkStatus) => {
    if (isAdmin && s === 'disabled' && link.status !== 'disabled') return setAdminAsk('disable');
    if (isAdmin && s === 'active' && link.status === 'disabled') return setAdminAsk('restore');
    setStateAsk({ id, state: s });
  };

  const confirmAdmin = async (reason: string) => {
    const kind = adminAsk;
    if (!kind) return;
    setAdminBusy(true);
    setAdminError({ reason: null, other: null });
    try {
      if (kind === 'disable') await api.admin.disable(link.id, reason);
      else await api.admin.restore(link.id, reason);
      setDetail((prev) =>
        prev
          ? { ...prev, link: { ...prev.link, status: kind === 'disable' ? 'disabled' : 'active', disabledReason: kind === 'disable' ? reason : null } }
          : prev,
      );
      setAdminAsk(null);
      void reloadDetail(true);
      void reloadHistory(true);
      toast(kind === 'disable' ? 'Disabled. Redirects stopped. Click Active to restore it.' : 'Restored. It redirects again.');
    } catch (e) {
      const field = kind === 'restore' && e instanceof ApiError ? e.fieldMessage('reason') : undefined;
      setAdminError(
        field
          ? { reason: field, other: null }
          : { reason: null, other: errText(e, kind === 'disable' ? 'Could not disable the link. Please try again.' : 'Could not restore. Please try again.') },
      );
    } finally {
      setAdminBusy(false);
    }
  };

  const liveChip =
    live.mode === 'live'
      ? { text: 'Live', tone: 'live' as const }
      : { text: live.mode === 'polling' ? 'Updating every 10 s' : 'Connecting…', tone: 'poll' as const };

  return (
    <>
      <BackLink />

      <section aria-labelledby="ld-title" className="flex flex-col gap-[22px] rounded-[20px] border border-line bg-surface p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="flex min-w-0 flex-col gap-2.5">
            <div className="flex flex-wrap items-center gap-3">
              <h1 id="ld-title" className="m-0 min-w-0 text-[26px] tracking-[-0.01em] sm:text-[30px]">
                <ShortLink code={link.code} />
              </h1>
              <button
                type="button"
                aria-label="Copy short link"
                title="Copy short link"
                onClick={async () => {
                  if (await copy(link.shortUrl)) toast('Copied');
                  else toast('Could not copy. Select the link and copy it by hand.', 'error');
                }}
                className="flex h-11 w-11 items-center justify-center rounded-[10px] border-[1.5px] border-line bg-surface text-text-2 hover:bg-subtle"
              >
                <Icon name="copy" size={17} />
              </button>
              <StatusBadge status={link.status} />
            </div>
            <span className="flex min-w-0 items-center gap-2 text-[14.5px] text-text-3">
              <Icon name="chevronRight" size={15} className="flex-none" />
              <span className="sr-only">Goes to </span>
              <a href={link.destination} target="_blank" rel="noopener noreferrer" className="min-w-0 break-all font-mono text-[13.5px] text-text-3 no-underline hover:underline">
                {prettyUrl(link.destination)}
              </a>
            </span>
            <div className="flex flex-wrap gap-2 text-[13px]">
              {link.campaign && (
                <RouterLink to="/campaigns" className="rounded-chip bg-ink px-2.5 py-[5px] font-semibold text-white no-underline hover:text-white">
                  <span className="sr-only">Campaign: </span>
                  {link.campaign.name}
                </RouterLink>
              )}
              {link.tags.map((t) => (
                <span key={t} className="rounded-chip bg-accent-50 px-2.5 py-[5px] text-accent-700">
                  #{t}
                </span>
              ))}
              <span className="rounded-chip bg-bot-bg px-2.5 py-[5px] text-text-3">
                Created {fmtDay(link.createdAt)}
                {link.owner ? ` by ${link.owner.name}` : ''}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <Button icon="edit" size="sm" onClick={() => setEditOpen(true)}>
              Edit
            </Button>
            <ButtonLink to="/qr" icon="qr" size="sm">
              QR code
            </ButtonLink>
          </div>
        </div>

        {adminView && (
          <div role="note" className="flex items-start gap-2.5 rounded-[14px] border border-[rgba(245,158,11,.35)] bg-[rgba(245,158,11,.10)] p-4 text-[14.5px] text-[#FCD34D]">
            <Icon name="shield" className="mt-px flex-none" />
            <span>
              Admin view{link.owner ? `: this is ${link.owner.name}’s link` : ''}. Any change needs a reason, and the owner sees it in the link history.
            </span>
          </div>
        )}
        {link.status === 'disabled' && (
          <div className="flex items-start gap-2.5 rounded-[14px] border border-danger-line bg-danger-bg p-4 text-[14.5px] text-[#FCA5A5]">
            <Icon name="ban" className="mt-px flex-none text-danger" />
            <span>
              Turned off by an admin{link.disabledReason ? `: ${link.disabledReason}` : ''}. Clicks and history are kept.
            </span>
          </div>
        )}

        <LifeStrip link={link} isAdmin={isAdmin} onPick={pickState} />
      </section>

      <LinkKpis link={link} stats={stats} />

      <div className="flex flex-wrap items-stretch gap-4">
        <ClicksChart data={series.data} loading={series.loading} error={series.error} onRetry={() => void series.reload()} />
        <RulesList link={link} onEdit={() => setEditOpen(true)} />
      </div>

      <div className="flex flex-wrap items-stretch gap-4">
        <RecentVisits
          visits={clicks.data?.items}
          freshIds={freshIds}
          loading={clicks.loading}
          error={clicks.error}
          onRetry={() => void clicks.reload()}
          live={liveChip}
        />
        <div className="flex min-w-0 flex-[2_1_340px] flex-col gap-4">
          <ScansByPoster items={scansByQr} />
          <HistoryList items={history.data?.items} loading={history.loading} error={history.error} onRetry={() => void history.reload()} />
        </div>
      </div>

      {editOpen && <EditLinkDialog link={link} adminView={adminView} onClose={closeEdit} onSaved={onSaved} />}
      {askState && (
        <ChangeStateDialog key={askState} link={link} target={askState} adminView={adminView} onClose={closeStateAsk} onChanged={onStateChanged} />
      )}
      {isAdmin && (
        <>
          <DisableDialog
            code={adminAsk === 'disable' ? link.code : null}
            busy={adminBusy}
            error={adminError.other}
            onCancel={closeAdminAsk}
            onConfirm={(r) => void confirmAdmin(r)}
          />
          <RestoreDialog
            code={adminAsk === 'restore' ? link.code : null}
            disabledReason={link.disabledReason}
            busy={adminBusy}
            reasonError={adminError.reason}
            error={adminError.other}
            onCancel={closeAdminAsk}
            onConfirm={(r) => void confirmAdmin(r)}
          />
        </>
      )}
    </>
  );
}
