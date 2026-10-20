import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, SHORT_HOST } from '../lib/api';
import { fmtNum, plural } from '../lib/format';
import type { Link, LinkList, LinkStatus } from '../types';
import { useAsync } from '../hooks/useAsync';
import { useAuth } from '../hooks/useAuth';
import { useDebounce } from '../hooks/useDebounce';
import { useToast } from '../hooks/useToast';
import { Icon } from '../components/Icon';
import { Button, ButtonLink, EmptyState, ErrorState, PageHeader, Select, Skeleton } from '../components/ui';
import { LinkCard, LinkRow } from '../components/links/LinkRow';

type StatusTab = 'all' | LinkStatus;

const TABS: { id: StatusTab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'limit_reached', label: 'Limit reached' },
  { id: 'expired', label: 'Expired' },
  { id: 'disabled', label: 'Disabled' },
];
const PAGE_SIZE = 10;

const isTab = (v: string | null): v is StatusTab => TABS.some((t) => t.id === v);

export function Links() {
  const { me } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();

  // The URL is the source of truth for filters, so a filtered list can be shared or reloaded.
  const status: StatusTab = isTab(params.get('status')) ? (params.get('status') as StatusTab) : 'all';
  const campaign = params.get('campaign') ?? '';
  const tag = params.get('tag') ?? '';
  const urlQ = params.get('q') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);

  const update = (changes: Record<string, string | null>, keepPage = false) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(changes)) {
          if (v) next.set(k, v);
          else next.delete(k);
        }
        if (!keepPage) next.delete('page');
        return next;
      },
      { replace: true },
    );
  };

  // Search box: typed text → (300 ms) → ?q= in the URL → API.
  const [text, setText] = useState(urlQ);
  const debounced = useDebounce(text, 300);
  useEffect(() => {
    if (debounced.trim() !== urlQ) update({ q: debounced.trim() || null });
    // Only react to the debounced text; `update` and `urlQ` are read fresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);
  // Back/forward (or a link from the dashboard search) can change ?q= without typing.
  useEffect(() => {
    if (urlQ !== debounced.trim()) setText(urlQ);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlQ]);

  const list = useAsync(
    () =>
      api.links.list({
        status,
        campaign: campaign || undefined,
        tag: tag || undefined,
        q: urlQ || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
    [status, campaign, tag, urlQ, page],
  );
  const campaigns = useAsync(() => api.campaigns.list(), []);
  const tags = useAsync(() => api.tags.list(), []);

  const copy = async (link: Link) => {
    const label = `${SHORT_HOST}/${link.code}`;
    try {
      await navigator.clipboard.writeText(link.shortUrl);
      toast(`Copied ${label}`);
    } catch {
      toast('Could not copy. Open the link and copy it from there.', 'error');
    }
  };

  const filtered = !!(campaign || tag || urlQ);
  const clearFilters = () => {
    setText('');
    update({ campaign: null, tag: null, q: null, status: null });
  };

  return (
    <>
      <PageHeader
        title="Links"
        eyebrow={
          <nav aria-label="Breadcrumb" className="flex gap-2 text-[13.5px] text-text-4">
            <span>{me?.workspace.name ?? 'Workspace'}</span>
            <span aria-hidden>/</span>
            <span>All folders</span>
          </nav>
        }
        actions={
          <>
            <ButtonLink to="/import" icon="upload">
              Import CSV
            </ButtonLink>
            <ButtonLink to="/links/new" variant="primary" icon="plus">
              New link
            </ButtonLink>
          </>
        }
      />

      <StatusTabs
        value={status}
        counts={list.data?.counts}
        onChange={(s) => update({ status: s === 'all' ? null : s })}
      />

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex h-11 max-w-[440px] flex-[1_1_320px] items-center gap-2.5 rounded-input border-[1.5px] border-line-strong bg-field px-3.5 focus-within:shadow-[0_0_0_4px_rgba(212,255,0,.16)]">
          <Icon name="search" size={18} className="flex-none text-text-4" />
          <span className="sr-only">Search links</span>
          <input
            type="search"
            autoComplete="off"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Search by alias, destination or tag"
            className="h-full min-w-0 flex-1 bg-transparent text-[14.5px] text-fg outline-none"
          />
        </label>
        <Select
          label="Campaign"
          inline
          value={campaign}
          onChange={(e) => update({ campaign: e.target.value || null })}
        >
          <option value="">Any</option>
          {campaigns.data?.items.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          <option value="none">No campaign</option>
        </Select>
        <Select label="Tag" inline value={tag} onChange={(e) => update({ tag: e.target.value || null })}>
          <option value="">Any</option>
          {tags.data?.items.map((t) => (
            <option key={t.id} value={t.name}>
              {t.name}
            </option>
          ))}
        </Select>
        <span className="ml-auto text-[13.5px] text-text-4">Sorted by newest first</span>
      </div>

      <section
        id="links-panel"
        role="tabpanel"
        aria-label="Links"
        className="overflow-hidden rounded-card border border-line bg-surface"
        aria-busy={list.loading || undefined}
      >
        {list.error && !list.data ? (
          <div className="p-4">
            <ErrorState message={list.error.message} onRetry={() => void list.reload()} />
          </div>
        ) : (
          <LinksTable
            list={list.data}
            loading={list.loading}
            onCopy={copy}
            filtered={filtered || status !== 'all'}
            onClear={clearFilters}
          />
        )}
        {list.data && list.data.total > 0 && (
          <Pager list={list.data} onPage={(p) => update({ page: p > 1 ? String(p) : null }, true)} />
        )}
      </section>
      {list.error && list.data && (
        <ErrorState message={list.error.message} onRetry={() => void list.reload()} />
      )}
      <p className="m-0 text-[13.5px] text-text-4">
        Links are never deleted. Expired and disabled links keep their analytics and history.
      </p>
    </>
  );
}

function StatusTabs({
  value,
  counts,
  onChange,
}: {
  value: StatusTab;
  counts?: LinkList['counts'];
  onChange: (s: StatusTab) => void;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  // Arrow keys move between tabs (the usual tablist pattern); only the selected tab is in the Tab order.
  const onKey = (e: KeyboardEvent, i: number) => {
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!dir && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const next =
      e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : (i + dir + TABS.length) % TABS.length;
    refs.current[next]?.focus();
    onChange(TABS[next].id);
  };
  return (
    <div role="tablist" aria-label="Filter by status" className="flex flex-wrap gap-1.5 border-b border-line">
      {TABS.map((t, i) => {
        const on = t.id === value;
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            aria-selected={on}
            aria-controls="links-panel"
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => onKey(e, i)}
            className={`-mb-px flex min-h-[46px] items-center gap-2 border-b-[3px] px-3.5 text-[15px] font-semibold ${on ? 'border-accent-400 text-fg' : 'border-transparent text-text-3 hover:text-fg'}`}
          >
            {t.label}
            <span
              className={`rounded-full px-2 py-0.5 font-mono text-[12px] text-text-2 ${on ? 'bg-accent-50' : 'bg-line-soft'}`}
            >
              {counts ? fmtNum(counts[t.id]) : '–'}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const TH = 'px-2 py-3.5 font-semibold';

function LinksTable({
  list,
  loading,
  onCopy,
  filtered,
  onClear,
}: {
  list?: LinkList;
  loading: boolean;
  onCopy: (l: Link) => void;
  filtered: boolean;
  onClear: () => void;
}) {
  const now = Date.now();
  if (list && list.items.length === 0) {
    if (!filtered && list.counts.all === 0) {
      return (
        <EmptyState
          icon="links"
          title="No links yet"
          body="Make your first short link, or import a CSV of links."
          action={
            <ButtonLink to="/links/new" variant="dark" icon="plus">
              Create your first link
            </ButtonLink>
          }
        />
      );
    }
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-12 text-center text-text-3">
        <span className="font-display text-[20px] font-bold text-fg">No links here</span>
        <span className="text-[14.5px]">Try another status, or clear the filters.</span>
        <Button size="sm" className="mt-2" onClick={onClear}>
          Clear filters
        </Button>
      </div>
    );
  }
  const fade = `transition-opacity ${loading && list ? 'opacity-60' : ''}`;
  return (
    <>
      {/* Below 1280 px the six columns do not fit (tablets, phones, small laptops next to the sidebar): cards instead. */}
      <ul
        className={`m-0 grid list-none grid-cols-1 gap-3 p-3 sm:p-4 md:grid-cols-2 xl:hidden ${fade}`}
        aria-label="Links"
      >
        {list
          ? list.items.map((l) => <LinkCard key={l.id} link={l} now={now} onCopy={onCopy} />)
          : Array.from({ length: 4 }, (_, i) => (
              <li key={i}>
                <Skeleton className="h-[188px] w-full" />
              </li>
            ))}
      </ul>
      <div
        className="relative hidden overflow-x-auto xl:block"
        role="region"
        aria-label="Links table"
        tabIndex={0}
      >
        <table className={`w-full min-w-[900px] border-collapse text-[14.5px] ${fade}`}>
          <thead>
            <tr className="bg-subtle text-left text-[12.5px] uppercase tracking-[.06em] text-text-4">
              <th scope="col" className="py-3.5 pl-4 pr-2 font-semibold">
                Short link
              </th>
              <th scope="col" className={TH}>
                Campaign and tags
              </th>
              <th scope="col" className={TH}>
                Rules
              </th>
              <th scope="col" className={TH}>
                Human clicks
              </th>
              <th scope="col" className={TH}>
                Status
              </th>
              <th scope="col" className="py-3.5 pl-2 pr-4 text-right font-semibold">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {list
              ? list.items.map((l) => <LinkRow key={l.id} link={l} now={now} onCopy={onCopy} />)
              : Array.from({ length: 5 }, (_, i) => (
                  <tr key={i} className="border-t border-line-soft">
                    <td colSpan={6} className="px-4 py-4">
                      <Skeleton className="h-10 w-full" />
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Pager({ list, onPage }: { list: LinkList; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(list.total / list.pageSize));
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft px-4 py-3.5 text-[14px] text-text-3">
      <span aria-live="polite">
        Showing {fmtNum(list.items.length)} of {plural(list.total, 'link')}
        {pages > 1 && ` · Page ${list.page} of ${pages}`}
      </span>
      <nav aria-label="Pages" className="flex gap-2">
        <Button size="sm" disabled={list.page <= 1} onClick={() => onPage(list.page - 1)}>
          Previous
        </Button>
        <Button size="sm" disabled={list.page >= pages} onClick={() => onPage(list.page + 1)}>
          Next
        </Button>
      </nav>
    </div>
  );
}
