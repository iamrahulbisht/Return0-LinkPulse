import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { ago, fmtNum } from '../lib/format';
import type { Period } from '../types';
import { useAsync } from '../hooks/useAsync';
import { useAuth } from '../hooks/useAuth';
import { useLiveClicks, useNow, type LiveState } from '../hooks/useLiveClicks';
import { Icon } from '../components/Icon';
import { MyAvatar } from '../components/Avatar';
import { ButtonLink, Card, CardTitle, DeltaBadge, EmptyState, KpiCard, LiveChip, Select, Skeleton, btnClass } from '../components/ui';
import { AsyncBlock } from '../components/dashboard/Async';
import { AlertRow } from '../components/dashboard/AlertsCard';
import { ChartLegend, ClicksChart } from '../components/dashboard/ClicksChart';
import { CityList, DevicesDonut, SourceBars } from '../components/dashboard/Breakdowns';
import { TopLinksTable } from '../components/dashboard/TopLinksTable';
import { CampaignCards } from '../components/dashboard/CampaignCards';

const PERIODS: { id: Period; label: string; word: string }[] = [
  { id: '24h', label: 'Today', word: 'day' },
  { id: '7d', label: '7 days', word: 'week' },
  { id: '30d', label: '30 days', word: '30 days' },
];

export function Dashboard() {
  const { me } = useAuth();
  const [params, setParams] = useSearchParams();
  const [period, setPeriod] = useState<Period>('7d');
  // Campaigns → "Open in dashboard" links here with ?campaign=<id>.
  const campaign = params.get('campaign') ?? '';
  const q = { period, campaign: campaign || undefined };

  const overview = useAsync(() => api.analytics.overview(q), [period, campaign]);
  const series = useAsync(() => api.analytics.timeseries(q), [period, campaign]);
  const top = useAsync(() => api.analytics.topLinks({ ...q, limit: 5 }), [period, campaign]);
  const sources = useAsync(() => api.analytics.sources(q), [period, campaign]);
  const devices = useAsync(() => api.analytics.devices(q), [period, campaign]);
  const cities = useAsync(() => api.analytics.cities({ ...q, limit: 5 }), [period, campaign]);
  const campaigns = useAsync(() => api.campaigns.list(), []);
  const alerts = useAsync(() => api.analytics.alerts(), []);

  // The reload functions from useAsync are stable, so a ref to "reload the live panels" is enough.
  const reloadLive = useRef(() => {});
  reloadLive.current = () => {
    void overview.reload(true);
    void series.reload(true);
    void top.reload(true);
    void sources.reload(true);
    void devices.reload(true);
  };

  // A burst of clicks should cause one refresh, not one per click: wait ~1 s after the first one.
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onLiveClick = useCallback(() => {
    if (pending.current) return;
    pending.current = setTimeout(() => {
      pending.current = null;
      reloadLive.current();
    }, 1000);
  }, []);
  useEffect(
    () => () => {
      if (pending.current) clearTimeout(pending.current);
    },
    [],
  );
  const live = useLiveClicks(onLiveClick, () => reloadLive.current());

  // Alerts are marked as seen once they have been shown; the "N new" chip keeps the count from this load.
  const markedSeen = useRef(false);
  useEffect(() => {
    if (!markedSeen.current && alerts.data && alerts.data.newCount > 0) {
      markedSeen.current = true;
      api.analytics.markAlertsSeen().catch(() => undefined);
    }
  }, [alerts.data]);

  const setCampaign = (id: string) => {
    const next = new URLSearchParams(params);
    if (id) next.set('campaign', id);
    else next.delete('campaign');
    setParams(next, { replace: true });
  };

  const noLinksAtAll = !campaign && overview.data?.links.total === 0;
  const word = PERIODS.find((p) => p.id === period)?.word ?? 'week';

  return (
    <>
      <Header newAlerts={alerts.data?.newCount ?? 0} userName={me?.user.name ?? ''} />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div role="group" aria-label="Period" className="flex gap-1 rounded-input border border-[#26262E] bg-[#16161A] p-1">
            {PERIODS.map((p) => {
              const on = p.id === period;
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setPeriod(p.id)}
                  className={`h-11 rounded-[9px] px-4 text-[14px] font-semibold ${on ? 'bg-accent-400 font-bold text-black shadow-sm' : 'bg-transparent text-text-3 hover:text-fg'}`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          <Select label="Campaign" inline value={campaign} onChange={(e) => setCampaign(e.target.value)}>
            <option value="">All campaigns</option>
            {campaigns.data?.items.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-wrap items-center gap-3.5">
          <LiveStatus live={live} />
          <a href={api.analytics.exportUrl({ period, campaign: campaign || undefined })} download className={btnClass('secondary', 'sm', 'no-underline')}>
            <Icon name="download" size={17} />
            Export CSV
          </a>
        </div>
      </div>

      {noLinksAtAll ? (
        <Card>
          <EmptyState
            icon="links"
            title="No links yet"
            body="Create a short link and its human clicks, visitors and bot hits will show up here, live."
            action={
              <ButtonLink to="/links/new" variant="primary" icon="plus">
                Create your first link
              </ButtonLink>
            }
          />
        </Card>
      ) : (
        <>
          <AsyncBlock state={overview} skeleton={<KpiSkeletons />}>
            {(o) => (
              <div className={KPI_GRID}>
                <KpiCard label="Human clicks" value={fmtNum(o.humanClicks)} badge={<DeltaBadge pct={o.changePct} />} note={`vs. the previous ${word}`} />
                <KpiCard label="Unique visitors" value={fmtNum(o.uniqueVisitors)} note="Counted once per device per day" />
                <KpiCard label="Bots filtered" tone="bot" icon="bot" value={fmtNum(o.botsFiltered)} note="Saved, never counted in limits or charts" />
                <KpiCard
                  label="Active links"
                  value={fmtNum(o.links.active)}
                  note={`${fmtNum(o.links.expired)} expired · ${fmtNum(o.links.limit_reached)} at limit · ${fmtNum(o.links.disabled)} disabled`}
                />
              </div>
            )}
          </AsyncBlock>

          <div className="flex flex-wrap items-stretch gap-4">
            <Card className="flex flex-[2_1_560px] flex-col gap-[18px]" aria-labelledby="chart-title">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle id="chart-title">Clicks over time</CardTitle>
                <ChartLegend />
              </div>
              <AsyncBlock state={series} skeleton={<Skeleton className="h-[260px] w-full" />}>
                {(s) => <ClicksChart data={s} />}
              </AsyncBlock>
            </Card>

            <Card id="alerts" tabIndex={-1} className="flex flex-[1_1_320px] flex-col gap-3.5 outline-none" aria-labelledby="alerts-title">
              <div className="flex items-center justify-between gap-3">
                <CardTitle id="alerts-title">Link alerts</CardTitle>
                {!!alerts.data?.newCount && (
                  <span className="rounded-full bg-[#FDE68A] px-2.5 py-[3px] text-[13px] font-bold text-black">{fmtNum(alerts.data.newCount)} new</span>
                )}
              </div>
              <AsyncBlock state={alerts} skeleton={<Skeleton className="h-40 w-full" />}>
                {(a) =>
                  a.items.length ? (
                    <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                      {a.items.map((item) => (
                        <AlertRow key={item.id} alert={item} isAdmin={me?.user.role === 'admin'} />
                      ))}
                    </ul>
                  ) : (
                    <p className="m-0 text-[14.5px] text-text-3">All clear. Nothing needs your attention right now.</p>
                  )
                }
              </AsyncBlock>
            </Card>
          </div>

          <div className="flex flex-wrap items-stretch gap-4">
            <Card className="flex flex-[2_1_560px] flex-col gap-3 pb-3 sm:pb-3" aria-labelledby="top-title">
              <div className="flex items-center justify-between gap-3">
                <CardTitle id="top-title">Top links</CardTitle>
                <RouterLink to="/links" className="inline-flex min-h-[44px] items-center text-[14px] font-semibold">
                  All links
                </RouterLink>
              </div>
              <AsyncBlock state={top} skeleton={<Skeleton className="h-56 w-full" />}>
                {(t) => <TopLinksTable items={t.items} />}
              </AsyncBlock>
            </Card>

            <Card className="flex flex-[1_1_320px] flex-col gap-[18px]" aria-labelledby="sources-title">
              <CardTitle id="sources-title">Where clicks come from</CardTitle>
              <AsyncBlock state={sources} skeleton={<Skeleton className="h-44 w-full" />}>
                {(s) => (s.total ? <SourceBars items={s.items} /> : <p className="m-0 text-[14.5px] text-text-3">No human clicks in this period yet.</p>)}
              </AsyncBlock>
              <div aria-hidden className="h-px bg-line-soft" />
              <h3 className="sr-only">Devices</h3>
              <AsyncBlock state={devices} skeleton={<Skeleton className="h-[120px] w-full" />}>
                {(d) => <DevicesDonut items={d.items} total={d.total} />}
              </AsyncBlock>
            </Card>
          </div>

          <div className="flex flex-wrap items-stretch gap-4">
            <section className="flex min-w-0 flex-[2_1_560px] flex-col gap-3" aria-labelledby="campaigns-title">
              <div className="flex items-center justify-between gap-3">
                <CardTitle id="campaigns-title">Campaigns</CardTitle>
                <RouterLink to="/campaigns" className="inline-flex min-h-[44px] items-center text-[14px] font-semibold">
                  All campaigns
                </RouterLink>
              </div>
              <AsyncBlock state={campaigns} skeleton={<Skeleton className="h-32 w-full" />}>
                {(c) => <CampaignCards items={c.items} />}
              </AsyncBlock>
            </section>

            <Card className="flex flex-[1_1_320px] flex-col gap-3.5" aria-labelledby="cities-title">
              <CardTitle id="cities-title">Top cities</CardTitle>
              <AsyncBlock state={cities} skeleton={<Skeleton className="h-32 w-full" />}>
                {(c) => <CityList items={c.items} />}
              </AsyncBlock>
            </Card>
          </div>
        </>
      )}
    </>
  );
}

// Two tiles per row on phones (one per row was a lot of scrolling for four numbers).
const KPI_GRID = 'grid grid-cols-2 gap-3 sm:gap-4 sm:[grid-template-columns:repeat(auto-fit,minmax(min(230px,100%),1fr))]';

function KpiSkeletons() {
  return (
    <div className={KPI_GRID}>
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-[150px] w-full rounded-card" />
      ))}
    </div>
  );
}

function LiveStatus({ live }: { live: LiveState }) {
  const now = useNow();
  if (live.mode === 'live') return <LiveChip text={`Live · updated ${ago(live.lastUpdate, now)}`} />;
  if (live.mode === 'polling') return <LiveChip tone="poll" text="Updating every 10 s" />;
  return <LiveChip tone="poll" text="Connecting…" />;
}

function Header({ newAlerts, userName }: { newAlerts: number; userName: string }) {
  const nav = useNavigate();
  const [text, setText] = useState('');
  const input = useRef<HTMLInputElement>(null);

  // Ctrl/Cmd + K jumps to the search box (the design shows the hint).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        input.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const q = text.trim();
    nav(q ? `/links?q=${encodeURIComponent(q)}` : '/links');
  };

  const goToAlerts = () => {
    const el = document.getElementById('alerts');
    el?.scrollIntoView({ block: 'start' });
    el?.focus({ preventScroll: true });
  };

  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="m-0 font-display text-[34px] font-bold tracking-[-0.025em]">Dashboard</h1>
        <span className="text-[15px] text-text-3">Human clicks only. Bots are shown apart. Times in IST.</span>
      </div>
      {/* One row on phones too: the search box takes what is left next to the bell and the avatar. */}
      <div className="flex w-full items-center gap-3 sm:w-auto">
        <form role="search" onSubmit={submit} className="min-w-0 flex-1 sm:flex-[1_1_260px]">
          <label className="flex h-11 min-w-0 items-center sm:min-w-[260px] gap-2.5 rounded-input border-[1.5px] border-line-strong bg-field px-3.5 focus-within:shadow-[0_0_0_4px_rgba(212,255,0,.16)]">
            <Icon name="search" size={18} className="flex-none text-text-4" />
            <span className="sr-only">Search links</span>
            <input
              ref={input}
              type="search"
              autoComplete="off"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Search links, campaigns, tags"
              className="h-full min-w-0 flex-1 bg-transparent text-[14.5px] text-fg outline-none"
            />
            <kbd aria-hidden className="hidden rounded-md border border-line px-1.5 py-0.5 font-mono text-[12px] text-text-4 sm:inline">
              Ctrl K
            </kbd>
          </label>
        </form>
        <button
          type="button"
          onClick={goToAlerts}
          aria-label={newAlerts ? `Link alerts, ${newAlerts} new` : 'Link alerts'}
          className="relative flex h-11 w-11 flex-none items-center justify-center rounded-input border-[1.5px] border-line bg-surface text-text-2"
        >
          <Icon name="bell" size={20} />
          {newAlerts > 0 && <span aria-hidden className="absolute right-2.5 top-[9px] h-[9px] w-[9px] rounded-full border-2 border-ink bg-accent-400" />}
        </button>
        {userName && (
          <RouterLink to="/profile" aria-label={`Your profile: ${userName}`} className="flex-none rounded-input no-underline">
            <MyAvatar size={44} className="rounded-input transition-colors hover:border-accent-400" />
          </RouterLink>
        )}
      </div>
    </header>
  );
}
